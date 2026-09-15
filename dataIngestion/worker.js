/**
 * ============================================================================
 * BULLMQ WORKERS
 * ============================================================================
 *
 * Analytics workers for the Aperture ingestion pipeline.
 *
 * Queues:
 *
 *   SentimentQueue
 *   DemographicQueue
 *   TrendQueue
 *   NetworkQueue
 *   DatabaseQueue
 *
 * IMPORTANT:
 *
 * All analytics operate on the canonical v1.0.0 collection.
 * Analytics must never mutate the canonical raw events.
 *
 * ============================================================================
 */

const { Worker } = require("bullmq");

const {
  createBullMQConnection,
  localSharedRedis,
  pgClient,
} = require("./config");

const {
  analyzeTrend,
} = require("./trendAnalysis");

const {
  recordTrendStats,
  enrichWithGlobalRanking,
} = require("./trendGlobalStats");

const {
  analyzeNetwork,
} = require("./networkAnalysis");

// ============================================================================
// Configuration
// ============================================================================

const SUPPORTED_SCHEMA_VERSION = "1.0.0";

/*
 * Sentiment:
 *
 * Tier 1 runs a local ONNX model and is CPU/memory intensive.
 *
 * Keep this worker at concurrency=1 so multiple BullMQ jobs do not
 * simultaneously execute ONNX inference inside the same Node process.
 */
const SENTIMENT_CONCURRENCY = 1;

/*
 * Lightweight analytics workers can process several jobs concurrently.
 */
const ANALYTICS_CONCURRENCY = 5;

/*
 * Database aggregation should remain serialized.
 *
 * This also makes later persistence ordering easier to reason about.
 */
const DATABASE_CONCURRENCY = 1;

// ============================================================================
// Sentiment Pipeline
// ============================================================================

let analyzeBatch = null;

async function loadSentimentPipeline() {
  console.log("[Startup] Loading sentiment pipeline...");

  const sentimentPipeline =
    await import("./sentiment/src/pipeline.js");

  if (
    !sentimentPipeline ||
    typeof sentimentPipeline.analyzeBatch !== "function"
  ) {
    throw new Error(
      "Sentiment pipeline does not export analyzeBatch()."
    );
  }

  analyzeBatch =
    sentimentPipeline.analyzeBatch;

  console.log(
    "[Startup] Sentiment pipeline loaded successfully."
  );
}

// ============================================================================
// Logging
// ============================================================================

function log(worker, message) {
  console.log(`[${worker}] ${message}`);
}

function success(worker, message) {
  console.log(`[${worker}] ${message}`);
}

function error(worker, message) {
  console.error(`[${worker}] ${message}`);
}

// ============================================================================
// Canonical Data Helpers
// ============================================================================

/**
 * Resolve the canonical collection from a BullMQ job.
 *
 * Analytics children:
 *
 *   job.data = canonical
 *
 * Database parent:
 *
 *   job.data.canonical = canonical
 */
function getCanonicalData(job) {
  if (!job?.data || typeof job.data !== "object") {
    throw new Error(
      "Job data is missing or invalid."
    );
  }

  /*
   * Analytics child job.
   */
  if (
    job.data.schemaVersion &&
    job.data.collection &&
    Array.isArray(job.data.events)
  ) {
    return job.data;
  }

  /*
   * Database parent job.
   */
  if (
    job.data.canonical &&
    typeof job.data.canonical === "object"
  ) {
    return job.data.canonical;
  }

  throw new Error(
    "Canonical collection not found in job data."
  );
}

// ============================================================================
// Canonical Validation
// ============================================================================

function validateCanonicalData(data) {
  if (!data || typeof data !== "object") {
    throw new Error(
      "Canonical data is missing or invalid."
    );
  }

  if (
    data.schemaVersion !==
    SUPPORTED_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported schemaVersion '${data.schemaVersion}'. ` +
      `Expected '${SUPPORTED_SCHEMA_VERSION}'.`
    );
  }

  if (
    !data.collection ||
    typeof data.collection !== "object" ||
    !data.collection.collectionId
  ) {
    throw new Error(
      "Missing collection.collectionId."
    );
  }

  if (
    !data.trend ||
    typeof data.trend !== "object"
  ) {
    throw new Error(
      "Missing canonical trend object."
    );
  }

  if (!Array.isArray(data.events)) {
    throw new Error(
      "Canonical events must be an array."
    );
  }

  if (
    data.authorProfiles !== undefined &&
    !Array.isArray(data.authorProfiles)
  ) {
    throw new Error(
      "Canonical authorProfiles must be an array."
    );
  }

  if (
    data.communities !== undefined &&
    !Array.isArray(data.communities)
  ) {
    throw new Error(
      "Canonical communities must be an array."
    );
  }

  if (
    data.platforms !== undefined &&
    (
      typeof data.platforms !== "object" ||
      Array.isArray(data.platforms)
    )
  ) {
    throw new Error(
      "Canonical platforms must be an object."
    );
  }

  return true;
}

function validateEvents(events) {
  const eventIds = new Set();

  for (const event of events) {
    if (!event || typeof event !== "object") {
      throw new Error(
        "Canonical events contain an invalid event."
      );
    }

    if (!event.eventId) {
      throw new Error(
        "Canonical event is missing eventId."
      );
    }

    if (!event.platform) {
      throw new Error(
        `Event '${event.eventId}' is missing platform.`
      );
    }

    if (!event.platformPostId) {
      throw new Error(
        `Event '${event.eventId}' is missing platformPostId.`
      );
    }

    if (
      ![
        "x",
        "reddit",
        "telegram",
      ].includes(event.platform)
    ) {
      throw new Error(
        `Unsupported platform '${event.platform}' ` +
        `for event '${event.eventId}'.`
      );
    }

    if (eventIds.has(event.eventId)) {
      throw new Error(
        `Duplicate eventId '${event.eventId}'.`
      );
    }

    eventIds.add(event.eventId);
  }

  return true;
}

function validateCollection(data) {
  validateCanonicalData(data);
  validateEvents(data.events);

  if (
    data.quality &&
    typeof data.quality.recordsCollected === "number"
  ) {
    if (
      data.quality.recordsCollected !==
      data.events.length
    ) {
      throw new Error(
        `Collection accounting mismatch: ` +
        `quality.recordsCollected=${data.quality.recordsCollected}, ` +
        `events.length=${data.events.length}.`
      );
    }
  }

  return true;
}

// ============================================================================
// Canonical Convenience Helpers
// ============================================================================

function getTrendLabel(data) {
  return (
    data?.trend?.label ??
    data?.trend?.query ??
    "unknown"
  );
}

function getPlatformCounts(events) {
  return events.reduce(
    (counts, event) => {
      counts[event.platform] =
        (counts[event.platform] || 0) + 1;

      return counts;
    },
    {}
  );
}

// ============================================================================
// 1. SENTIMENT WORKER
// ============================================================================

function createSentimentWorker() {
  if (typeof analyzeBatch !== "function") {
    throw new Error(
      "Sentiment pipeline has not been loaded."
    );
  }

  /*
   * Sentiment gets concurrency=1 intentionally.
   *
   * Tier 1:
   *   local ONNX inference
   *
   * Tier 2:
   *   hosted LLM with its own global scheduler
   */
  return new Worker(
    "SentimentQueue",

    async (job) => {
      const startedAt = Date.now();

      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      const runId =
        data.collection.collectionId;

      log(
        "Sentiment",
        `START job=${job.id} | ` +
        `events=${data.events.length} | ` +
        `Trend=${trendLabel} | ` +
        `Run=${runId}`
      );

      // ----------------------------------------------------------------------
      // Extract analyzable text
      // ----------------------------------------------------------------------

      const textEntries = [];

      for (
        let index = 0;
        index < data.events.length;
        index++
      ) {
        const event =
          data.events[index];

        const text =
          event.content?.text;

        if (
          typeof text !== "string" ||
          !text.trim()
        ) {
          continue;
        }

        textEntries.push({
          eventIndex: index,

          eventId:
            event.eventId,

          publishedAt:
            event.time?.publishedAt ?? null,

          platform:
            event.platform,

          text:
            text.trim(),
        });
      }

      log(
        "Sentiment",
        `Found ${textEntries.length}/${data.events.length} ` +
        `events with analyzable text.`
      );

      // ----------------------------------------------------------------------
      // Nothing to analyze
      // ----------------------------------------------------------------------

      if (textEntries.length === 0) {
        const emptyResult = {
          category: "sentiment",

          eventCount:
            data.events.length,

          analyzedCount: 0,

          unanalyzedCount:
            data.events.length,

          platformCounts:
            getPlatformCounts(data.events),

          results: [],

          summary: {
            positive: 0,
            neutral: 0,
            negative: 0,
          },

          emotions: {},

          stance: {
            supportive: 0,
            against: 0,
            neutral: 0,
          },

          sarcasm: {
            detected: 0,
            notDetected: 0,
          },

          tierUsage: {
            tier1: 0,
            tier2: 0,
          },
        };

        success(
          "Sentiment",
          `DONE job=${job.id} | ` +
          `0/${data.events.length} analyzed | ` +
          `No analyzable text.`
        );

        return emptyResult;
      }

      // ----------------------------------------------------------------------
      // Two-tier sentiment pipeline
      // ----------------------------------------------------------------------

      log(
        "Sentiment",
        `Sending ${textEntries.length} texts to sentiment pipeline...`
      );

      const predictions =
        await analyzeBatch(
          textEntries.map(
            (entry) => entry.text
          )
        );

      if (
        !Array.isArray(predictions) ||
        predictions.length !== textEntries.length
      ) {
        throw new Error(
          `Sentiment pipeline returned ` +
          `${predictions?.length ?? 0} results ` +
          `for ${textEntries.length} events.`
        );
      }

      log(
        "Sentiment",
        `Sentiment pipeline returned ` +
        `${predictions.length} predictions.`
      );

      // ----------------------------------------------------------------------
      // Attach predictions to event identity
      // ----------------------------------------------------------------------

      const results = [];

      for (
        let i = 0;
        i < textEntries.length;
        i++
      ) {
        const entry =
          textEntries[i];

        const prediction =
          predictions[i];

        if (
          !prediction ||
          typeof prediction !== "object"
        ) {
          continue;
        }

        results.push({
          eventId:
            entry.eventId,

          platform:
            entry.platform,

          publishedAt:
            entry.publishedAt,

          polarity:
            prediction.polarity ?? {
              label: null,
              confidence: null,
            },

          emotions:
            Array.isArray(
              prediction.emotions
            )
              ? prediction.emotions
              : [],

          stance:
            prediction.stance ?? {
              label: null,
              confidence: null,
            },

          sarcasm:
            prediction.sarcasm ?? {
              detected: null,
              confidence: null,
            },

          tier:
            prediction.tier ?? null,

          reason:
            prediction.reason ?? null,
        });
      }

      // ----------------------------------------------------------------------
      // Aggregate sentiment results
      // ----------------------------------------------------------------------

      const summary = {
        positive: 0,
        neutral: 0,
        negative: 0,
      };

      const emotions = {};

      const stance = {
        supportive: 0,
        against: 0,
        neutral: 0,
      };

      const sarcasm = {
        detected: 0,
        notDetected: 0,
      };

      const tierUsage = {
        tier1: 0,
        tier2: 0,
      };

      for (const result of results) {
        const polarity =
          result.polarity?.label;

        if (
          Object.prototype.hasOwnProperty.call(
            summary,
            polarity
          )
        ) {
          summary[polarity]++;
        }

        if (
          Array.isArray(result.emotions)
        ) {
          for (
            const emotion of result.emotions
          ) {
            if (!emotion?.label) {
              continue;
            }

            emotions[emotion.label] =
              (emotions[emotion.label] || 0) + 1;
          }
        }

        const stanceLabel =
          result.stance?.label;

        if (
          Object.prototype.hasOwnProperty.call(
            stance,
            stanceLabel
          )
        ) {
          stance[stanceLabel]++;
        }

        if (
          result.sarcasm?.detected === true
        ) {
          sarcasm.detected++;
        } else if (
          result.sarcasm?.detected === false
        ) {
          sarcasm.notDetected++;
        }

        if (result.tier === 1) {
          tierUsage.tier1++;
        } else if (result.tier === 2) {
          tierUsage.tier2++;
        }
      }

      // ----------------------------------------------------------------------
      // Final result
      // ----------------------------------------------------------------------

      const finalResult = {
        category: "sentiment",

        eventCount:
          data.events.length,

        analyzedCount:
          results.length,

        unanalyzedCount:
          data.events.length -
          results.length,

        platformCounts:
          getPlatformCounts(data.events),

        summary,

        emotions,

        stance,

        sarcasm,

        tierUsage,

        results,
      };

      const duration =
        Date.now() - startedAt;

      success(
        "Sentiment",
        `DONE job=${job.id} | ` +
        `${results.length}/${data.events.length} analyzed | ` +
        `Tier1=${tierUsage.tier1} | ` +
        `Tier2=${tierUsage.tier2} | ` +
        `${duration}ms`
      );

      return finalResult;
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        SENTIMENT_CONCURRENCY,
    }
  );
}

// ============================================================================
// 2. DEMOGRAPHIC WORKER
// ============================================================================

function createDemographicWorker() {
  return new Worker(
    "DemographicQueue",

    async (job) => {
      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      const profiles =
        Array.isArray(data.authorProfiles)
          ? data.authorProfiles
          : [];

      log(
        "Demographic",
        `Processing ${data.events.length} events | ` +
        `Profiles=${profiles.length} | ` +
        `Trend=${trendLabel}`
      );

      /*
       * Demographic analysis is currently a placeholder.
       *
       * The important contract at this stage is:
       *
       *   canonical collection
       *          ↓
       *   demographic worker
       *          ↓
       *   valid category result
       *
       * Actual demographic inference can be implemented independently.
       */
      const result = {
        category: "demographic",

        topAge: null,

        topRegion: null,

        eventCount:
          data.events.length,

        profilesAvailable:
          profiles.length,
      };

      success(
        "Demographic",
        `Processed ${data.events.length} events.`
      );

      return result;
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    }
  );
}

// ============================================================================
// 3. TREND WORKER
// ============================================================================

function createTrendWorker() {
  return new Worker(
    "TrendQueue",

    async (job) => {
      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      log(
        "Trend",
        `Processing ${data.events.length} events | ` +
        `Trend=${trendLabel} | ` +
        `Run=${data.collection.collectionId}`
      );

      // ----------------------------------------------------------------------
      // Local trend analysis
      // ----------------------------------------------------------------------

      const result =
        analyzeTrend(data);

      if (
        !result ||
        typeof result !== "object"
      ) {
        throw new Error(
          "analyzeTrend() returned an invalid result."
        );
      }

      // ----------------------------------------------------------------------
      // Global trend statistics
      // ----------------------------------------------------------------------

      await recordTrendStats(
        localSharedRedis,
        result
      );

      const enriched =
        await enrichWithGlobalRanking(
          localSharedRedis,
          result
        );

      // ----------------------------------------------------------------------
      // Logging
      // ----------------------------------------------------------------------

      const ranking =
        enriched.globalRanking;

      if (ranking) {
        log(
          "Trend",
          `${enriched.name ?? trendLabel}: ` +
          `score=${enriched.trendScore ?? "n/a"} ` +
          `tier=${enriched.influence?.viralityTier ?? "n/a"} ` +
          `rank=#${ranking.leaderboardPosition ?? "n/a"}/` +
          `${ranking.totalTrackedTrends ?? "n/a"} ` +
          `(top ${ranking.percentile ?? "n/a"}%) ` +
          `${ranking.tierMovement ?? "stable"}`
        );
      } else {
        log(
          "Trend",
          `${enriched.name ?? trendLabel}: ` +
          `trend analysis completed without global ranking.`
        );
      }

      return {
        category: "trend",

        ...enriched,
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    }
  );
}

// ============================================================================
// 4. NETWORK WORKER
// ============================================================================

function createNetworkWorker() {
  return new Worker(
    "NetworkQueue",

    async (job) => {
      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      log(
        "Network",
        `Processing ${data.events.length} events | ` +
        `Trend=${trendLabel} | ` +
        `Run=${data.collection.collectionId}`
      );

      /*
       * IMPORTANT:
       *
       * Network analysis is intentionally not being redesigned here.
       *
       * We are only validating that the Network worker:
       *
       *   1. receives canonical data
       *   2. executes analyzeNetwork()
       *   3. returns a valid object
       *   4. reaches DatabaseQueue
       *
       * The current 0-node / 0-edge analytical result will be addressed
       * separately.
       */
      const result =
        analyzeNetwork(data);

      if (
        !result ||
        typeof result !== "object"
      ) {
        throw new Error(
          "analyzeNetwork() returned an invalid result."
        );
      }

      const nodeCount =
        Array.isArray(result.nodes)
          ? result.nodes.length
          : 0;

      const edgeCount =
        Array.isArray(result.edges)
          ? result.edges.length
          : 0;

      const topInfluencer =
        result.topInfluencers?.[0]?.label ??
        "none";

      log(
        "Network",
        `${trendLabel}: ` +
        `${nodeCount} nodes, ` +
        `${edgeCount} edges, ` +
        `top=${topInfluencer}`
      );

      return {
        category: "network",

        ...result,
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    }
  );
}

// ============================================================================
// 5. DATABASE WORKER
// ============================================================================

function createDatabaseWorker() {
  return new Worker(
    "DatabaseQueue",

    async (job) => {
      // ----------------------------------------------------------------------
      // Validate database parent job
      // ----------------------------------------------------------------------

      if (
        !job?.data ||
        typeof job.data !== "object"
      ) {
        throw new Error(
          "Database job data is missing or invalid."
        );
      }

      const {
        trend_label,
        runId,
        eventIds,
        schemaVersion,
      } = job.data;

      const canonical =
        job.data.canonical;

      if (
        !canonical ||
        typeof canonical !== "object"
      ) {
        throw new Error(
          "Database job is missing canonical collection."
        );
      }

      validateCollection(canonical);

      // ----------------------------------------------------------------------
      // Resolve canonical metadata
      // ----------------------------------------------------------------------

      const resolvedRunId =
        runId ??
        canonical.collection.collectionId;

      const resolvedTrendLabel =
        trend_label ??
        getTrendLabel(canonical);

      const resolvedSchemaVersion =
        schemaVersion ??
        canonical.schemaVersion;

      log(
        "Database",
        `Gathering results | ` +
        `Trend=${resolvedTrendLabel} | ` +
        `Run=${resolvedRunId}`
      );

      // ----------------------------------------------------------------------
      // Optional event ID validation
      // ----------------------------------------------------------------------

      if (
        eventIds !== undefined &&
        !Array.isArray(eventIds)
      ) {
        throw new Error(
          "Database job eventIds must be an array when provided."
        );
      }

      if (
        Array.isArray(eventIds) &&
        eventIds.length !== canonical.events.length
      ) {
        throw new Error(
          `Database event accounting mismatch: ` +
          `eventIds=${eventIds.length}, ` +
          `canonical.events=${canonical.events.length}.`
        );
      }

      // ----------------------------------------------------------------------
      // Collect child results
      // ----------------------------------------------------------------------

      const childResults =
        await job.getChildrenValues();

      const rawValues =
        Object.values(childResults);

      log(
        "Database",
        `Received ${rawValues.length} child result(s).`
      );

      // ----------------------------------------------------------------------
      // Validate child result count
      // ----------------------------------------------------------------------

      /*
       * The current FlowProducer creates exactly four analytics children:
       *
       *   sentiment
       *   demographic
       *   trend
       *   network
       *
       * DatabaseQueue should therefore receive four results.
       */
      const EXPECTED_ANALYTICS_CATEGORIES = [
        "sentiment",
        "demographic",
        "trend",
        "network",
      ];

      if (
        rawValues.length !==
        EXPECTED_ANALYTICS_CATEGORIES.length
      ) {
        throw new Error(
          `Database expected ` +
          `${EXPECTED_ANALYTICS_CATEGORIES.length} child results ` +
          `but received ${rawValues.length}.`
        );
      }

      // ----------------------------------------------------------------------
      // Build analytics object
      // ----------------------------------------------------------------------

      const analytics = {};

      for (const result of rawValues) {
        if (
          !result ||
          typeof result !== "object"
        ) {
          throw new Error(
            "Database received an invalid child result."
          );
        }

        if (!result.category) {
          throw new Error(
            "Database received a child result without category."
          );
        }

        const {
          category,
          ...resultData
        } = result;

        if (
          !EXPECTED_ANALYTICS_CATEGORIES.includes(
            category
          )
        ) {
          throw new Error(
            `Unexpected analytics category '${category}'.`
          );
        }

        if (analytics[category]) {
          throw new Error(
            `Duplicate analytics category '${category}'.`
          );
        }

        analytics[category] =
          resultData;
      }

      // ----------------------------------------------------------------------
      // Verify every expected category exists
      // ----------------------------------------------------------------------

      const missingCategories =
        EXPECTED_ANALYTICS_CATEGORIES.filter(
          (category) =>
            !Object.prototype.hasOwnProperty.call(
              analytics,
              category
            )
        );

      if (missingCategories.length > 0) {
        throw new Error(
          `Database is missing child analytics: ` +
          `${missingCategories.join(", ")}`
        );
      }

      const analyticsCategories =
        Object.keys(analytics);

      log(
        "Database",
        `Analytics categories: ` +
        `${analyticsCategories.join(", ")}`
      );

      // ----------------------------------------------------------------------
      // Child result validation diagnostics
      // ----------------------------------------------------------------------

      log(
        "Database",
        `Child result validation: ` +
        `sentiment=${Boolean(analytics.sentiment)}, ` +
        `demographic=${Boolean(analytics.demographic)}, ` +
        `trend=${Boolean(analytics.trend)}, ` +
        `network=${Boolean(analytics.network)}`
      );

      log(
        "Database",
        `Canonical validation: ` +
        `schema=${resolvedSchemaVersion} | ` +
        `events=${canonical.events.length} | ` +
        `run=${resolvedRunId}`
      );

      // ----------------------------------------------------------------------
      // Build final database record
      // ----------------------------------------------------------------------

      const databaseRecord = {
        run_id:
          resolvedRunId,

        trend_label:
          resolvedTrendLabel,

        schema_version:
          resolvedSchemaVersion,

        canonical_collection:
          canonical,

        analytics,
      };

      // ----------------------------------------------------------------------
      // Database persistence
      // ----------------------------------------------------------------------

      /*
       * PostgreSQL persistence is intentionally not enabled yet.
       *
       * DO NOT add an INSERT here until the actual PostgreSQL table schema
       * is confirmed.
       *
       * At this stage we prove that the Database worker successfully
       * constructs the complete persistence-ready record.
       */

      if (
        !databaseRecord.run_id ||
        !databaseRecord.trend_label ||
        !databaseRecord.schema_version ||
        !databaseRecord.canonical_collection ||
        !databaseRecord.analytics
      ) {
        throw new Error(
          "Database record construction failed."
        );
      }

      log(
        "Database",
        `Prepared record | ` +
        `Events=${canonical.events.length} | ` +
        `Analytics=${analyticsCategories.join(", ")}`
      );

      log(
        "Database",
        `Record validation: PASS`
      );

      success(
        "Database",
        `Collection ${resolvedRunId} processed successfully.`
      );

      // ----------------------------------------------------------------------
      // Return database worker result
      // ----------------------------------------------------------------------

      return {
        status: "success",

        runId:
          resolvedRunId,

        trend_label:
          resolvedTrendLabel,

        schemaVersion:
          resolvedSchemaVersion,

        eventCount:
          canonical.events.length,

        analyticsCategories,

        persistence:
          "prepared",
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        DATABASE_CONCURRENCY,
    }
  );
}

// ============================================================================
// Worker Registry
// ============================================================================

let workers = [];

// ============================================================================
// Worker Events
// ============================================================================

function registerWorkerEvents(worker) {
  worker.on(
    "completed",
    (job) => {
      success(
        worker.name,
        `Job ${job.id} completed.`
      );
    }
  );

  worker.on(
    "failed",
    (job, err) => {
      error(
        worker.name,
        `Job ${job?.id ?? "unknown"} failed: ${err.message}`
      );
    }
  );

  worker.on(
    "error",
    (err) => {
      error(
        worker.name,
        `Worker error: ${err.message}`
      );
    }
  );
}

// ============================================================================
// Startup
// ============================================================================

async function startWorkers() {
  try {
    // ------------------------------------------------------------------------
    // Load sentiment pipeline before accepting sentiment jobs
    // ------------------------------------------------------------------------

    await loadSentimentPipeline();

    // ------------------------------------------------------------------------
    // Create workers
    // ------------------------------------------------------------------------

    const sentimentWorker =
      createSentimentWorker();

    const demographicWorker =
      createDemographicWorker();

    const trendWorker =
      createTrendWorker();

    const networkWorker =
      createNetworkWorker();

    const databaseWorker =
      createDatabaseWorker();

    workers = [
      sentimentWorker,
      demographicWorker,
      trendWorker,
      networkWorker,
      databaseWorker,
    ];

    // ------------------------------------------------------------------------
    // Register BullMQ events
    // ------------------------------------------------------------------------

    for (const worker of workers) {
      registerWorkerEvents(worker);
    }

    // ------------------------------------------------------------------------
    // Startup information
    // ------------------------------------------------------------------------

    console.log(
      "\n========================================"
    );

    console.log(
      "BullMQ workers are online."
    );

    console.log(
      "========================================"
    );

    console.log(
      `Schema: ${SUPPORTED_SCHEMA_VERSION}`
    );

    console.log(
      "Queues:"
    );

    console.log(
      `  - SentimentQueue      concurrency=${SENTIMENT_CONCURRENCY}`
    );

    console.log(
      `  - DemographicQueue    concurrency=${ANALYTICS_CONCURRENCY}`
    );

    console.log(
      `  - TrendQueue          concurrency=${ANALYTICS_CONCURRENCY}`
    );

    console.log(
      `  - NetworkQueue        concurrency=${ANALYTICS_CONCURRENCY}`
    );

    console.log(
      `  - DatabaseQueue       concurrency=${DATABASE_CONCURRENCY}`
    );

    console.log(
      "Sentiment: loaded"
    );

    console.log(
      "Database: aggregation enabled"
    );

    console.log(
      "PostgreSQL persistence: not enabled"
    );

    console.log(
      "========================================\n"
    );

  } catch (err) {
    console.error(
      "\n========================================"
    );

    console.error(
      "FAILED TO START BULLMQ WORKERS"
    );

    console.error(
      "========================================"
    );

    console.error(err);

    process.exit(1);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `\nReceived ${signal}. ` +
    `Shutting down BullMQ workers...`
  );

  try {
    await Promise.all(
      workers.map(
        (worker) =>
          worker.close()
      )
    );

    success(
      "Shutdown",
      "All BullMQ workers closed."
    );
  } catch (err) {
    error(
      "Shutdown",
      `Failed to close workers cleanly: ${err.message}`
    );
  }

  try {
    if (
      pgClient &&
      typeof pgClient.end === "function"
    ) {
      await pgClient.end();

      success(
        "Shutdown",
        "PostgreSQL connection closed."
      );
    }
  } catch (err) {
    error(
      "Shutdown",
      `Failed to close PostgreSQL connection: ${err.message}`
    );
  }

  process.exit(0);
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

// ============================================================================
// Start
// ============================================================================

startWorkers();
