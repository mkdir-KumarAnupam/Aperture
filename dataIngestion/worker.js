/**
 * ============================================================================
 * BULLMQ WORKERS
 * ============================================================================
 *
 * These workers consume jobs created by the Data Ingestion Producer.
 *
 * Flow:
 *
 *                         merge-and-save
 *                              │
 *              ┌───────────────┼────────────────┐
 *              │               │                │
 *              ▼               ▼                ▼
 *         Sentiment       Demographic         Trend
 *              │               │                │
 *              └───────────────┼────────────────┘
 *                              │
 *                              ▼
 *                         DatabaseQueue
 *
 *         Network is an independent analytics child and also contributes
 *         its result to DatabaseQueue.
 *
 *
 * IMPORTANT:
 *
 * The canonical v1.0.0 collection produced by the scraper/daemon remains
 * the source of truth throughout this pipeline.
 *
 * Analytics workers derive results from the canonical collection.
 * They must NOT mutate or replace the canonical raw events.
 *
 * Canonical collection:
 *
 * {
 *   schemaVersion,
 *   collection,
 *   trend,
 *   platforms,
 *   events,
 *   authorProfiles,
 *   communities,
 *   quality
 * }
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

const WORKER_OPTIONS = {
  connection: createBullMQConnection(),

  /*
   * Each worker can process up to 5 jobs concurrently.
   *
   * This is queue-level worker concurrency. It does not mean the same
   * collection is processed five times.
   */
  concurrency: 5,
};

// ============================================================================
// Sentiment Pipeline Loader
// ============================================================================
//
// sentiment/src/pipeline.js is an ES module while this worker uses CommonJS.
//
// We therefore load the sentiment pipeline using dynamic import.
//
// IMPORTANT:
// The workers are created only AFTER this function succeeds.
// This guarantees analyzeBatch exists before SentimentQueue can process jobs.
// ============================================================================

let analyzeBatch = null;

async function loadSentimentPipeline() {
  console.log(
    "[Startup] Loading sentiment pipeline..."
  );

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
 * Returns the canonical collection from a job.
 *
 * Analytics child jobs may receive the canonical collection directly:
 *
 *     job.data = canonical
 *
 * The Database parent job contains:
 *
 *     job.data.canonical = canonical
 *
 * Supporting both keeps the worker layer tolerant during the transition
 * between Producer/Consumer implementations.
 */
function getCanonicalData(job) {
  if (!job?.data || typeof job.data !== "object") {
    throw new Error(
      "Job data is missing or invalid."
    );
  }

  if (
    job.data.schemaVersion &&
    job.data.collection &&
    Array.isArray(job.data.events)
  ) {
    return job.data;
  }

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

/**
 * Validate the minimum canonical v1.0.0 contract.
 */
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

/**
 * Validate individual canonical events.
 */
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
      !["x", "reddit", "telegram"].includes(
        event.platform
      )
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

/**
 * Validate the complete canonical collection.
 */
function validateCollection(data) {
  validateCanonicalData(data);
  validateEvents(data.events);

  if (
    data.quality &&
    typeof data.quality.recordsCollected ===
    "number"
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

/**
 * Return a human-readable trend label.
 */
function getTrendLabel(data) {
  return (
    data?.trend?.label ??
    data?.trend?.query ??
    "unknown"
  );
}

/**
 * Return platform event counts for logging.
 */
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

  return new Worker(
    "SentimentQueue",

    async (job) => {
      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      log(
        "Sentiment",
        `Processing ${data.events.length} events | ` +
        `Trend=${trendLabel} | ` +
        `Run=${data.collection.collectionId}`
      );

      // ----------------------------------------------------------------------
      // Extract text from canonical events
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
          eventId: event.eventId,
          publishedAt:
            event.time?.publishedAt ?? null,
          platform: event.platform,
          text,
        });
      }

      log(
        "Sentiment",
        `Found ${textEntries.length}/${data.events.length} ` +
        `events with analyzable text.`
      );

      // ----------------------------------------------------------------------
      // No analyzable text
      // ----------------------------------------------------------------------

      if (textEntries.length === 0) {
        return {
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
      }

      // ----------------------------------------------------------------------
      // Two-tier sentiment pipeline
      // ----------------------------------------------------------------------

      const predictions =
        await analyzeBatch(
          textEntries.map(
            (entry) => entry.text
          )
        );

      if (
        !Array.isArray(predictions) ||
        predictions.length !==
        textEntries.length
      ) {
        throw new Error(
          `Sentiment pipeline returned ` +
          `${predictions?.length ?? 0} results ` +
          `for ${textEntries.length} events.`
        );
      }

      // ----------------------------------------------------------------------
      // Attach predictions to canonical event identity
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
      // Aggregate analytics
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
        // Polarity

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

        // Emotions

        if (
          Array.isArray(
            result.emotions
          )
        ) {
          for (
            const emotion of result.emotions
          ) {
            if (
              !emotion?.label
            ) {
              continue;
            }

            emotions[emotion.label] =
              (emotions[emotion.label] || 0) +
              1;
          }
        }

        // Stance

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

        // Sarcasm

        if (
          result.sarcasm?.detected ===
          true
        ) {
          sarcasm.detected++;
        } else if (
          result.sarcasm?.detected ===
          false
        ) {
          sarcasm.notDetected++;
        }

        // Tier usage

        if (
          result.tier === 1
        ) {
          tierUsage.tier1++;
        } else if (
          result.tier === 2
        ) {
          tierUsage.tier2++;
        }
      }

      // ----------------------------------------------------------------------
      // Platform summary
      // ----------------------------------------------------------------------

      const platformCounts =
        getPlatformCounts(
          data.events
        );

      // ----------------------------------------------------------------------
      // Final derived sentiment result
      // ----------------------------------------------------------------------

      const result = {
        category: "sentiment",

        eventCount:
          data.events.length,

        analyzedCount:
          results.length,

        unanalyzedCount:
          data.events.length -
          results.length,

        platformCounts,

        summary,

        emotions,

        stance,

        sarcasm,

        tierUsage,

        results,
      };

      success(
        "Sentiment",
        `Processed ${results.length}/${data.events.length} events | ` +
        `Tier1=${tierUsage.tier1} | ` +
        `Tier2=${tierUsage.tier2}`
      );

      return result;
    },

    WORKER_OPTIONS
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
       * ----------------------------------------------------------------------
       * DEMOGRAPHIC IMPLEMENTATION
       * ----------------------------------------------------------------------
       *
       * Demographic analysis belongs here rather than in the scraper.
       *
       * The canonical raw layer should preserve:
       *
       *     authorProfiles[]
       *
       * without inventing demographic attributes.
       *
       * The demographic pipeline can later derive aggregate/anonymized
       * demographic information from the available evidence.
       */

      const result = {
        category: "demographic",

        // Placeholder until the demographic implementation is connected.
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

    WORKER_OPTIONS
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
      // Global trend registry
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

    WORKER_OPTIONS
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

      // ----------------------------------------------------------------------
      // Network analysis
      // ----------------------------------------------------------------------

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

    WORKER_OPTIONS
  );
}

// ============================================================================
// 5. DATABASE / PARENT WORKER
// ============================================================================

function createDatabaseWorker() {
  return new Worker(
    "DatabaseQueue",

    async (job) => {
      if (
        !job?.data ||
        typeof job.data !== "object"
      ) {
        throw new Error(
          "Database job data is missing or invalid."
        );
      }

      // ----------------------------------------------------------------------
      // Parent Job Metadata
      // ----------------------------------------------------------------------

      const {
        trend_label,
        runId,
        eventIds,
        schemaVersion,
      } = job.data;

      /*
       * The Consumer should pass:
       *
       *     canonical: data
       *
       * to the parent job.
       */

      const canonical =
        job.data.canonical;

      if (!canonical) {
        throw new Error(
          "Database job is missing canonical collection."
        );
      }

      validateCollection(
        canonical
      );

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
      // Retrieve Child Results
      // ----------------------------------------------------------------------

      const childResults =
        await job.getChildrenValues();

      const rawValues =
        Object.values(
          childResults
        );

      log(
        "Database",
        `Received ${rawValues.length} child result(s).`
      );

      // ----------------------------------------------------------------------
      // Structure Analytics
      // ----------------------------------------------------------------------

      const analytics = {};

      for (
        const result of rawValues
      ) {
        if (
          !result ||
          typeof result !== "object"
        ) {
          continue;
        }

        if (!result.category) {
          continue;
        }

        const {
          category,
          ...resultData
        } = result;

        if (
          analytics[category]
        ) {
          throw new Error(
            `Duplicate analytics category '${category}'.`
          );
        }

        analytics[category] =
          resultData;
      }

      // ----------------------------------------------------------------------
      // Optional child-result visibility
      // ----------------------------------------------------------------------

      const analyticsCategories =
        Object.keys(analytics);

      log(
        "Database",
        `Analytics categories: ` +
        `${analyticsCategories.join(", ") || "none"}`
      );

      // ----------------------------------------------------------------------
      // Database Record
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

      /*
       * ----------------------------------------------------------------------
       * PostgreSQL Persistence
       * ----------------------------------------------------------------------
       *
       * Currently disabled.
       *
       * Enable this INSERT when the PostgreSQL table is ready.
       *
       * Recommended table:
       *
       *     run_id TEXT PRIMARY KEY
       *     trend_label TEXT NOT NULL
       *     schema_version TEXT NOT NULL
       *     canonical_collection JSONB NOT NULL
       *     analytics JSONB NOT NULL
       *     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       */

      /*
      const query = `
        INSERT INTO trend_analytics (
          run_id,
          trend_label,
          schema_version,
          canonical_collection,
          analytics
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (run_id)
        DO UPDATE SET
          trend_label = EXCLUDED.trend_label,
          schema_version = EXCLUDED.schema_version,
          canonical_collection = EXCLUDED.canonical_collection,
          analytics = EXCLUDED.analytics
      `;

      await pgClient.query(query, [
        databaseRecord.run_id,
        databaseRecord.trend_label,
        databaseRecord.schema_version,
        JSON.stringify(
          databaseRecord.canonical_collection
        ),
        JSON.stringify(
          databaseRecord.analytics
        ),
      ]);
      */

      log(
        "Database",
        `Prepared record | ` +
        `Events=${canonical.events.length} | ` +
        `Analytics=${analyticsCategories.join(", ") || "none"}`
      );

      success(
        "Database",
        `Collection ${resolvedRunId} processed successfully.`
      );

      return {
        status: "success",

        runId:
          resolvedRunId,

        trend_label:
          resolvedTrendLabel,

        eventCount:
          canonical.events.length,

        analyticsCategories,
      };
    },

    WORKER_OPTIONS
  );
}

// ============================================================================
// Worker Registry
// ============================================================================

let workers = [];

// ============================================================================
// Worker Event Handling
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
// Worker Startup
// ============================================================================

async function startWorkers() {
  try {
    // ------------------------------------------------------------------------
    // Load sentiment pipeline BEFORE creating workers
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
    // Register events
    // ------------------------------------------------------------------------

    for (const worker of workers) {
      registerWorkerEvents(worker);
    }

    // ------------------------------------------------------------------------
    // Startup logging
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
      "  - SentimentQueue"
    );

    console.log(
      "  - DemographicQueue"
    );

    console.log(
      "  - TrendQueue"
    );

    console.log(
      "  - NetworkQueue"
    );

    console.log(
      "  - DatabaseQueue"
    );

    console.log(
      "Concurrency: 5 per worker"
    );

    console.log(
      "Sentiment: loaded"
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

  /*
   * pgClient is imported for the PostgreSQL persistence layer.
   *
   * Only close it here if this process owns the connection.
   */

  try {
    if (
      pgClient &&
      typeof pgClient.end ===
      "function"
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
