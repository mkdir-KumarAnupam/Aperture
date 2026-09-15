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
 *              ┌───────────────┼───────────────┐
 *              │               │               │
 *              ▼               ▼               ▼
 *         Sentiment       Demographic        Trend
 *              │               │               │
 *              └───────────────┼───────────────┘
 *                              │
 *                              ▼
 *                           Network
 *                              │
 *                              ▼
 *                        DatabaseQueue
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
 * New Producer/Consumer flow should pass:
 *
 *     job.data = canonical
 *
 * However, the parent Database job may contain:
 *
 *     job.data.canonical = canonical
 *
 * Supporting both here makes the worker layer tolerant during the transition
 * between Producer/Consumer implementations.
 */
function getCanonicalData(job) {
  if (!job?.data || typeof job.data !== "object") {
    throw new Error("Job data is missing or invalid.");
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

  if (data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
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
  return events.reduce((counts, event) => {
    counts[event.platform] =
      (counts[event.platform] || 0) + 1;

    return counts;
  }, {});
}

// ============================================================================
// 1. SENTIMENT WORKER
// ============================================================================

const sentimentWorker = new Worker(
  "SentimentQueue",

  async (job) => {
    const data = getCanonicalData(job);

    validateCollection(data);

    const trendLabel = getTrendLabel(data);

    log(
      "Sentiment",
      `Processing ${data.events.length} events | ` +
      `Trend=${trendLabel} | ` +
      `Run=${data.collection.collectionId}`
    );

    /*
     * ------------------------------------------------------------------------
     * SENTIMENT IMPLEMENTATION
     * ------------------------------------------------------------------------
     *
     * Ashutosh's sentiment implementation should go here.
     *
     * The important input is:
     *
     *     data.events
     *
     * Each event is a canonical event.
     *
     * Example:
     *
     *     for (const event of data.events) {
     *         const text = event.content?.text;
     *         ...
     *     }
     *
     * The worker should return an analytics object and should NOT mutate:
     *
     *     data.events
     */

    const result = {
      category: "sentiment",

      // Placeholder until the actual sentiment implementation is connected.
      result: null,
      score: null,

      eventCount: data.events.length,
    };

    success(
      "Sentiment",
      `Processed ${data.events.length} events.`
    );

    return result;
  },

  WORKER_OPTIONS
);

// ============================================================================
// 2. DEMOGRAPHIC WORKER
// ============================================================================

const demographicWorker = new Worker(
  "DemographicQueue",

  async (job) => {
    const data = getCanonicalData(job);

    validateCollection(data);

    const trendLabel = getTrendLabel(data);

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
     * ------------------------------------------------------------------------
     * DEMOGRAPHIC IMPLEMENTATION
     * ------------------------------------------------------------------------
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

      eventCount: data.events.length,
      profilesAvailable: profiles.length,
    };

    success(
      "Demographic",
      `Processed ${data.events.length} events.`
    );

    return result;
  },

  WORKER_OPTIONS
);

// ============================================================================
// 3. TREND WORKER
// ============================================================================

const trendWorker = new Worker(
  "TrendQueue",

  async (job) => {
    const data = getCanonicalData(job);

    validateCollection(data);

    const trendLabel = getTrendLabel(data);

    log(
      "Trend",
      `Processing ${data.events.length} events | ` +
      `Trend=${trendLabel} | ` +
      `Run=${data.collection.collectionId}`
    );

    /*
     * ------------------------------------------------------------------------
     * LOCAL TREND ANALYSIS
     * ------------------------------------------------------------------------
     *
     * analyzeTrend() receives the canonical collection.
     *
     * It can derive:
     *
     * - platform activity
     * - mentions
     * - interactions
     * - engagement
     * - growth
     * - lifecycle
     * - influence
     * - top influencers
     *
     * without modifying the canonical events.
     */

    const result = analyzeTrend(data);

    if (!result || typeof result !== "object") {
      throw new Error(
        "analyzeTrend() returned an invalid result."
      );
    }

    /*
     * ------------------------------------------------------------------------
     * GLOBAL TREND REGISTRY
     * ------------------------------------------------------------------------
     *
     * recordTrendStats() stores the current trend state in the shared Redis
     * registry.
     *
     * enrichWithGlobalRanking() then compares this trend against the other
     * tracked trends.
     */

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

    /*
     * The enriched result is returned to the parent DatabaseQueue.
     *
     * This is derived analytics data.
     * The canonical collection itself is NOT replaced.
     */

    return enriched;
  },

  WORKER_OPTIONS
);

// ============================================================================
// 4. NETWORK WORKER
// ============================================================================

const networkWorker = new Worker(
  "NetworkQueue",

  async (job) => {
    const data = getCanonicalData(job);

    validateCollection(data);

    const trendLabel = getTrendLabel(data);

    log(
      "Network",
      `Processing ${data.events.length} events | ` +
      `Trend=${trendLabel} | ` +
      `Run=${data.collection.collectionId}`
    );

    /*
     * ------------------------------------------------------------------------
     * NETWORK ANALYSIS
     * ------------------------------------------------------------------------
     *
     * analyzeNetwork() receives the canonical collection.
     *
     * It can derive:
     *
     * - nodes
     * - edges
     * - communities
     * - influencer rankings
     *
     * from canonical event relationships and author information.
     */

    const result = analyzeNetwork(data);

    if (!result || typeof result !== "object") {
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

    return result;
  },

  WORKER_OPTIONS
);

// ============================================================================
// 5. DATABASE / PARENT WORKER
// ============================================================================

const databaseWorker = new Worker(
  "DatabaseQueue",

  async (job) => {
    if (!job?.data || typeof job.data !== "object") {
      throw new Error(
        "Database job data is missing or invalid."
      );
    }

    /*
     * ------------------------------------------------------------------------
     * Parent Job Metadata
     * ------------------------------------------------------------------------
     */

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
     *
     * This keeps the Database worker self-contained and allows it to retain
     * the original canonical events.
     */

    const canonical =
      job.data.canonical;

    if (!canonical) {
      throw new Error(
        "Database job is missing canonical collection."
      );
    }

    validateCollection(canonical);

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

    /*
     * ------------------------------------------------------------------------
     * Retrieve Child Results
     * ------------------------------------------------------------------------
     */

    const childResults =
      await job.getChildrenValues();

    const rawValues =
      Object.values(childResults);

    /*
     * ------------------------------------------------------------------------
     * Structure Analytics
     * ------------------------------------------------------------------------
     *
     * Child workers return:
     *
     * {
     *     category: "trend",
     *     ...
     * }
     *
     * The category is used as the key in the final analytics object.
     */

    const analytics = {};

    for (const result of rawValues) {
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

      analytics[category] = resultData;
    }

    /*
     * ------------------------------------------------------------------------
     * Database Record
     * ------------------------------------------------------------------------
     *
     * The canonical events are preserved separately from derived analytics.
     */

    const databaseRecord = {
      run_id: resolvedRunId,

      trend_label: resolvedTrendLabel,

      schema_version: resolvedSchemaVersion,

      canonical_events: canonical.events,

      analytics,
    };
    console.table(databaseRecord);

    /*
     * ------------------------------------------------------------------------
     * PostgreSQL Persistence
     * ------------------------------------------------------------------------
     *
     * The actual INSERT can be enabled once the PostgreSQL table is ready.
     *
     * Recommended shape:
     *
     *     run_id
     *     trend_label
     *     schema_version
     *     canonical_events JSONB
     *     analytics JSONB
     *
     * Do NOT flatten the canonical events back into the previous legacy
     * database structure.
     */

    /*
     * Example:
     *
     * const query = `
     *   INSERT INTO trend_analytics (
     *       run_id,
     *       trend_label,
     *       schema_version,
     *       canonical_events,
     *       analytics
     *   )
     *   VALUES ($1, $2, $3, $4, $5)
     * `;
     *
     * await pgClient.query(query, [
     *   databaseRecord.run_id,
     *   databaseRecord.trend_label,
     *   databaseRecord.schema_version,
     *   JSON.stringify(databaseRecord.canonical_events),
     *   JSON.stringify(databaseRecord.analytics),
     * ]);
     */

    log(
      "Database",
      `Prepared record | ` +
      `Events=${canonical.events.length} | ` +
      `Analytics=${Object.keys(analytics).join(", ") || "none"}`
    );

    success(
      "Database",
      `Collection ${resolvedRunId} processed successfully.`
    );

    return {
      status: "success",

      runId: resolvedRunId,

      trend_label: resolvedTrendLabel,

      eventCount:
        canonical.events.length,

      analyticsCategories:
        Object.keys(analytics),
    };
  },

  WORKER_OPTIONS
);

// ============================================================================
// Worker Registry
// ============================================================================

const workers = [
  sentimentWorker,
  demographicWorker,
  trendWorker,
  networkWorker,
  databaseWorker,
];

// ============================================================================
// Worker Event Handling
// ============================================================================

for (const worker of workers) {
  worker.on("completed", (job) => {
    success(
      worker.name,
      `Job ${job.id} completed.`
    );
  });

  worker.on("failed", (job, err) => {
    error(
      worker.name,
      `Job ${job?.id ?? "unknown"} failed: ${err.message}`
    );
  });

  worker.on("error", (err) => {
    error(
      worker.name,
      `Worker error: ${err.message}`
    );
  });
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
    `\nReceived ${signal}. Shutting down BullMQ workers...`
  );

  try {
    await Promise.all(
      workers.map((worker) =>
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
   * pgClient is imported for the eventual PostgreSQL persistence layer.
   *
   * Only close it here if it is an actual pg.Client instance that this
   * process owns.
   */

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
// Startup
// ============================================================================

console.log(
  "\nBullMQ workers are online."
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
