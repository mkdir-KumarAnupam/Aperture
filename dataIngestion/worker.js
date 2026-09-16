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
 * All analytics operate on canonical v1.0.0 data.
 *
 * Database persistence:
 *
 *   Trend
 *      ↓
 *   Collection
 *      ↓
 *   Authors
 *      ↓
 *   Events
 *      ↓
 *   Trend Events
 *      ↓
 *   Trend Snapshot
 *      ↓
 *   Dedicated Analytics Snapshots
 *
 * ============================================================================
 */

const { Worker } = require("bullmq");

const {
  createBullMQConnection,
  localSharedRedis,
  pgClient,
  connectPostgres,
  checkPostgres,
} = require("./config");

const { analyzeTrend } = require("./trendAnalysis");

const {
  googleTrendRegions,
  googleTrendTimeLine,
} = require("./demographicAnaylysis.js");

const {
  recordTrendStats,
  enrichWithGlobalRanking,
} = require("./trendGlobalStats");

const { analyzeNetwork } = require("./networkAnalysis");

const {
  generateForecast,
} = require("./forecasting/index");

const {
  generateTrendDescription,
} = require("./groqClient");

// ============================================================================
// Configuration
// ============================================================================

const SUPPORTED_SCHEMA_VERSION = "1.0.0";

const SUPPORTED_PLATFORMS = [
  "x",
  "reddit",
  "telegram",
];

const SENTIMENT_CONCURRENCY = 1;

const ANALYTICS_CONCURRENCY = 5;

const DATABASE_CONCURRENCY = 1;

// ============================================================================
// Shutdown State
// ============================================================================

let shuttingDown = false;

// Prevent multiple simultaneous PostgreSQL reconnect attempts.
let postgresConnectionPromise = null;

// ============================================================================
// Sentiment Pipeline
// ============================================================================

let analyzeBatch = null;

async function loadSentimentPipeline() {
  console.log("[Startup] Loading sentiment pipeline...");

  const sentimentPipeline = await import(
    "./sentiment/src/pipeline.js"
  );

  if (
    !sentimentPipeline ||
    typeof sentimentPipeline.analyzeBatch !== "function"
  ) {
    throw new Error(
      "Sentiment pipeline does not export analyzeBatch().",
    );
  }

  analyzeBatch =
    sentimentPipeline.analyzeBatch;

  console.log(
    "[Startup] Sentiment pipeline loaded successfully.",
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

function getCanonicalData(job) {
  if (
    !job?.data ||
    typeof job.data !== "object"
  ) {
    throw new Error(
      "Job data is missing or invalid.",
    );
  }

  /*
   * Analytics child job:
   *
   *   job.data = canonical
   */
  if (
    job.data.schemaVersion &&
    job.data.collection &&
    Array.isArray(job.data.events)
  ) {
    return job.data;
  }

  /*
   * Database parent job:
   *
   *   job.data.canonical = canonical
   */
  if (
    job.data.canonical &&
    typeof job.data.canonical === "object"
  ) {
    return job.data.canonical;
  }

  throw new Error(
    "Canonical collection not found in job data.",
  );
}

// ============================================================================
// Canonical Validation
// ============================================================================

function validateCanonicalData(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "Canonical data is missing or invalid.",
    );
  }

  if (
    data.schemaVersion !==
    SUPPORTED_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported schemaVersion '${data.schemaVersion}'. ` +
      `Expected '${SUPPORTED_SCHEMA_VERSION}'.`,
    );
  }

  if (
    !data.collection ||
    typeof data.collection !== "object" ||
    !data.collection.collectionId
  ) {
    throw new Error(
      "Missing collection.collectionId.",
    );
  }

  if (
    !data.trend ||
    typeof data.trend !== "object"
  ) {
    throw new Error(
      "Missing canonical trend object.",
    );
  }

  if (!Array.isArray(data.events)) {
    throw new Error(
      "Canonical events must be an array.",
    );
  }

  if (
    data.authorProfiles !== undefined &&
    !Array.isArray(data.authorProfiles)
  ) {
    throw new Error(
      "Canonical authorProfiles must be an array.",
    );
  }

  if (
    data.communities !== undefined &&
    !Array.isArray(data.communities)
  ) {
    throw new Error(
      "Canonical communities must be an array.",
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
      "Canonical platforms must be an object.",
    );
  }

  return true;
}

function validateEvents(events) {
  const eventIds = new Set();

  for (const event of events) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      throw new Error(
        "Canonical events contain an invalid event.",
      );
    }

    if (!event.eventId) {
      throw new Error(
        "Canonical event is missing eventId.",
      );
    }

    if (!event.platform) {
      throw new Error(
        `Event '${event.eventId}' is missing platform.`,
      );
    }

    if (!event.platformPostId) {
      throw new Error(
        `Event '${event.eventId}' is missing platformPostId.`,
      );
    }

    if (
      !SUPPORTED_PLATFORMS.includes(
        event.platform,
      )
    ) {
      throw new Error(
        `Unsupported platform '${event.platform}' ` +
        `for event '${event.eventId}'.`,
      );
    }

    if (eventIds.has(event.eventId)) {
      throw new Error(
        `Duplicate eventId '${event.eventId}'.`,
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
        `events.length=${data.events.length}.`,
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
    {},
  );
}

// ============================================================================
// SAFE NUMERIC HELPERS
// ============================================================================

/**
 * Convert a value to a non-negative integer.
 *
 * Used for PostgreSQL BIGINT engagement fields that are NOT NULL.
 *
 * null / undefined / invalid / negative -> fallback
 */
function toSafeInteger(
  value,
  fallback = 0,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "bigint") {
    return value >= 0n
      ? value.toString()
      : String(fallback);
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return fallback;
  }

  return Math.trunc(number);
}

/**
 * Convert a value to a finite number.
 */
function toSafeNumber(
  value,
  fallback = 0,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/**
 * Convert undefined values inside an object to null recursively.
 *
 * Also handles Date and BigInt values safely for JSON/JSONB columns.
 */
function cleanForJson(value) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(cleanForJson);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const result = {};

    for (
      const [key, child]
      of Object.entries(value)
    ) {
      result[key] =
        cleanForJson(child);
    }

    return result;
  }

  return value;
}

function json(value) {
  return JSON.stringify(
    cleanForJson(
      value ?? null,
    ),
  );
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Execute a PostgreSQL query with a driver-level timeout.
 *
 * node-postgres supports query_timeout on the query config.
 */
async function queryWithTimeout(
  text,
  values = [],
  timeoutMs = 10_000,
) {
  if (shuttingDown) {
    throw new Error(
      "PostgreSQL query aborted because shutdown is in progress.",
    );
  }

  return pgClient.query({
    text,
    values,
    query_timeout: timeoutMs,
  });
}

/**
 * Ensure only one reconnect/check operation can happen at a time.
 */
async function ensurePostgresConnection() {
  if (shuttingDown) {
    throw new Error(
      "PostgreSQL connection check aborted because shutdown is in progress.",
    );
  }

  if (postgresConnectionPromise) {
    return postgresConnectionPromise;
  }

  const connectionAttempt =
    (async () => {
      let healthy = false;

      try {
        healthy =
          await checkPostgres();
      } catch (err) {
        if (shuttingDown) {
          throw new Error(
            "PostgreSQL connection check aborted because shutdown is in progress.",
          );
        }

        log(
          "Database",
          `PostgreSQL health check failed: ${err.message}`,
        );

        healthy = false;
      }

      if (shuttingDown) {
        throw new Error(
          "PostgreSQL reconnect aborted because shutdown is in progress.",
        );
      }

      if (healthy) {
        return;
      }

      log(
        "Database",
        "PostgreSQL connection stale — reconnecting...",
      );

      if (shuttingDown) {
        throw new Error(
          "PostgreSQL reconnect aborted because shutdown is in progress.",
        );
      }

      await connectPostgres();

      if (shuttingDown) {
        throw new Error(
          "PostgreSQL connection established during shutdown.",
        );
      }
    })();

  postgresConnectionPromise =
    connectionAttempt;

  try {
    await connectionAttempt;
  } finally {
    if (
      postgresConnectionPromise ===
      connectionAttempt
    ) {
      postgresConnectionPromise =
        null;
    }
  }
}

// ============================================================================
// TREND HELPERS
// ============================================================================

function buildTrendKey(data) {
  const raw =
    data?.trend?.key ??
    data?.trend?.trendKey ??
    data?.trend?.trendId ??
    data?.trend?.id ??
    getTrendLabel(data);

  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

// ============================================================================
// COLLECTION HELPERS
// ============================================================================

function resolveCollectionTimestamp(data) {
  return (
    data?.collection?.startedAt ??
    data?.collection?.started_at ??
    data?.collection?.createdAt ??
    data?.collection?.created_at ??
    data?.collection?.collectedAt ??
    data?.collection?.collected_at ??
    new Date().toISOString()
  );
}

function resolveCollectionCompletedAt(
  data,
) {
  return (
    data?.collection?.completedAt ??
    data?.collection?.completed_at ??
    data?.collection?.finishedAt ??
    data?.collection?.finished_at ??
    null
  );
}

function resolveCollectorVersion(data) {
  return (
    data?.collection?.collectorVersion ??
    data?.collection?.collector_version ??
    null
  );
}

function resolveCollectionObservedAt(
  data,
) {
  return (
    data?.collection?.observedAt ??
    data?.collection?.observed_at ??
    resolveCollectionTimestamp(data)
  );
}

function calculatePrimaryEventCount(
  data,
) {
  return data.events.length;
}

function calculateRelationshipCount(
  data,
) {
  let count = 0;

  const platforms =
    data?.platforms ?? {};

  for (
    const platformData
    of Object.values(platforms)
  ) {
    count += Number(
      platformData?.pagination
        ?.relationshipRecordsCollected ??
      0,
    );
  }

  return Number.isFinite(count)
    ? count
    : 0;
}

function resolvePlatformStatus(data) {
  if (
    data?.platforms &&
    typeof data.platforms === "object"
  ) {
    return data.platforms;
  }

  return {};
}

function resolveCollectionQuality(
  data,
) {
  return data?.quality ?? {};
}

function resolveCollectionDiagnostics(
  data,
) {
  const diagnostics = {};

  if (
    data?.diagnostics !== undefined
  ) {
    diagnostics.collection =
      data.diagnostics;
  }

  if (
    data?.platforms &&
    typeof data.platforms === "object"
  ) {
    diagnostics.platforms = {};

    for (
      const [
        platform,
        platformData,
      ] of Object.entries(
        data.platforms,
      )
    ) {
      if (
        platformData?.diagnostics !==
        undefined
      ) {
        diagnostics.platforms[
          platform
        ] =
          platformData.diagnostics;
      }
    }
  }

  return diagnostics;
}

// ============================================================================
// EVENT HELPERS
// ============================================================================

function extractEventAuthorId(event) {
  return (
    event?.author?.authorId ??
    event?.author?.id ??
    event?.author?.userId ??
    null
  );
}

function extractEventText(event) {
  return (
    event?.content?.text ??
    null
  );
}

function extractContentFingerprint(
  event,
) {
  return (
    event?.content
      ?.contentFingerprint ??
    event?.contentFingerprint ??
    null
  );
}

function extractPublishedAt(event) {
  return (
    event?.time?.publishedAt ??
    null
  );
}

function extractObservedAt(event) {
  return (
    event?.time?.observedAt ??
    new Date().toISOString()
  );
}

function extractEditedAt(event) {
  return (
    event?.time?.editedAt ??
    null
  );
}

function extractTitle(event) {
  return (
    event?.content?.title ??
    null
  );
}

function extractLanguage(event) {
  return (
    event?.content?.language ??
    null
  );
}

function extractDetectedLanguage(event) {
  return (
    event?.content?.detectedLang ??
    event?.content?.detectedLanguage ??
    null
  );
}

function extractLanguageConfidence(
  event,
) {
  return (
    event?.content
      ?.languageDetectionConfidence ??
    event?.content
      ?.languageDetectConfidence ??
    null
  );
}

function extractHashtags(event) {
  return Array.isArray(
    event?.content?.hashtags,
  )
    ? event.content.hashtags
    : [];
}

function extractMentions(event) {
  return Array.isArray(
    event?.content?.mentions,
  )
    ? event.content.mentions
    : [];
}

function extractUrls(event) {
  return Array.isArray(
    event?.content?.urls,
  )
    ? event.content.urls
    : [];
}

function extractAttachments(event) {
  return Array.isArray(
    event?.content?.attachments,
  )
    ? event.content.attachments
    : [];
}

// ============================================================================
// SNAPSHOT METRICS
// ============================================================================

function calculateSnapshotMetrics(
  events,
) {
  let likes = 0;
  let replies = 0;
  let reposts = 0;
  let quotes = 0;
  let reach = 0;

  const authors = new Set();

  let latestEventAt = null;

  for (const event of events) {
    const authorId =
      extractEventAuthorId(event);

    if (authorId) {
      authors.add(
        `${event.platform}:${authorId}`,
      );
    }

    const engagement =
      event?.engagement ?? {};

    const platformData =
      event?.platformData ?? {};

    /*
     * Reddit may provide score instead of likes.
     */
    const rawLikes =
      engagement.likes ??
      (
        event.platform === "reddit"
          ? platformData.score
          : null
      ) ??
      event?.metrics?.likes ??
      0;

    likes += toSafeNumber(
      rawLikes,
      0,
    );

    replies += toSafeNumber(
      engagement.replies ??
      event?.metrics?.comments ??
      0,
      0,
    );

    reposts += toSafeNumber(
      engagement.reposts ??
      event?.metrics?.shares ??
      0,
      0,
    );

    quotes += toSafeNumber(
      engagement.quotes ??
      0,
      0,
    );

    reach += toSafeNumber(
      engagement.views ??
      event?.metrics?.views ??
      0,
      0,
    );

    const publishedAt =
      extractPublishedAt(event);

    if (publishedAt) {
      if (
        !latestEventAt ||
        new Date(publishedAt) >
        new Date(latestEventAt)
      ) {
        latestEventAt =
          publishedAt;
      }
    }
  }

  return {
    postCount:
      events.length,

    uniqueAuthors:
      authors.size,

    likes:
      toSafeNumber(likes),

    replies:
      toSafeNumber(replies),

    reposts:
      toSafeNumber(reposts),

    quotes:
      toSafeNumber(quotes),

    reach:
      toSafeNumber(reach),

    latestEventAt,
  };
}

// ============================================================================
// TREND PERSISTENCE
// ============================================================================

async function upsertTrend(data) {
  const trendKey =
    buildTrendKey(data);

  const label =
    getTrendLabel(data);

  const observedAt =
    resolveCollectionObservedAt(data);

  const query = `
    INSERT INTO trends (
      trend_key,
      canonical_label,
      first_seen_at,
      last_seen_at,
      status,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $3,
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (trend_key)
    DO UPDATE SET
      canonical_label =
        EXCLUDED.canonical_label,

      last_seen_at =
        GREATEST(
          COALESCE(
            trends.last_seen_at,
            EXCLUDED.last_seen_at
          ),
          EXCLUDED.last_seen_at
        ),

      status =
        'active',

      updated_at =
        CURRENT_TIMESTAMP

    RETURNING
      id,
      trend_key,
      canonical_label,
      first_seen_at,
      last_seen_at,
      status
  `;

  const result =
    await queryWithTimeout(
      query,
      [
        trendKey,
        label,
        observedAt,
      ],
    );

  if (!result.rows[0]) {
    throw new Error(
      `Failed to create or resolve trend '${label}'.`,
    );
  }

  return result.rows[0];
}

// ============================================================================
// COLLECTION PERSISTENCE
// ============================================================================

async function getNextCollectionSequence(
  trendId,
) {
  await queryWithTimeout(
    `
      SELECT pg_advisory_xact_lock(
        hashtext($1::text)
      )
    `,
    [String(trendId)],
  );

  const result =
    await queryWithTimeout(
      `
        SELECT
          COALESCE(
            MAX(collection_sequence),
            0
          ) + 1 AS next_sequence
        FROM collections
        WHERE trend_id = $1
      `,
      [trendId],
    );

  return Number(
    result.rows[0]?.next_sequence ?? 1,
  );
}

async function createCollection(
  data,
  trend,
  runId,
) {
  if (!runId) {
    throw new Error(
      "Cannot create collection without runId.",
    );
  }

  const existingQuery = `
    SELECT
      id,
      trend_id,
      external_collection_id,
      collection_sequence,
      started_at,
      completed_at,
      observed_at,
      collector_version,
      status,
      event_count,
      primary_event_count,
      relationship_count,
      quality,
      platform_status,
      diagnostics,
      created_at
    FROM collections
    WHERE external_collection_id = $1
    LIMIT 1
  `;

  const existingResult =
    await queryWithTimeout(
      existingQuery,
      [runId],
    );

  if (existingResult.rows[0]) {
    const existing =
      existingResult.rows[0];

    if (
      String(existing.trend_id) !==
      String(trend.id)
    ) {
      throw new Error(
        `Collection '${runId}' already belongs to ` +
        `trend '${existing.trend_id}', ` +
        `but current trend is '${trend.id}'.`,
      );
    }

    log(
      "Database",
      `Collection already exists | ` +
      `id=${existing.id} | ` +
      `external=${existing.external_collection_id} | ` +
      `sequence=#${existing.collection_sequence} | ` +
      `status=${existing.status}`,
    );

    return existing;
  }

  const sequence =
    await getNextCollectionSequence(
      trend.id,
    );

  const startedAt =
    resolveCollectionTimestamp(data);

  const completedAt =
    resolveCollectionCompletedAt(data);

  const observedAt =
    resolveCollectionObservedAt(data);

  const collectorVersion =
    resolveCollectorVersion(data);

  const eventCount =
    data.events.length;

  const primaryEventCount =
    calculatePrimaryEventCount(data);

  const relationshipCount =
    calculateRelationshipCount(data);

  const quality =
    resolveCollectionQuality(data);

  const platformStatus =
    resolvePlatformStatus(data);

  const diagnostics =
    resolveCollectionDiagnostics(data);

  const insertQuery = `
    INSERT INTO collections (
      trend_id,
      external_collection_id,
      collection_sequence,
      started_at,
      completed_at,
      observed_at,
      collector_version,
      status,
      event_count,
      primary_event_count,
      relationship_count,
      quality,
      platform_status,
      diagnostics,
      created_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      'running',
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      external_collection_id
    )
    DO NOTHING
    RETURNING
      id,
      trend_id,
      external_collection_id,
      collection_sequence,
      started_at,
      completed_at,
      observed_at,
      collector_version,
      status,
      event_count,
      primary_event_count,
      relationship_count,
      quality,
      platform_status,
      diagnostics,
      created_at
  `;

  const result =
    await queryWithTimeout(
      insertQuery,
      [
        trend.id,
        runId,
        sequence,
        startedAt,
        completedAt,
        observedAt,
        collectorVersion,
        eventCount,
        primaryEventCount,
        relationshipCount,
        json(quality),
        json(platformStatus),
        json(diagnostics),
      ],
    );

  if (result.rows[0]) {
    return result.rows[0];
  }

  const concurrentResult =
    await queryWithTimeout(
      existingQuery,
      [runId],
    );

  if (!concurrentResult.rows[0]) {
    throw new Error(
      `Failed to resolve collection '${runId}' after insert conflict.`,
    );
  }

  const concurrent =
    concurrentResult.rows[0];

  if (
    String(concurrent.trend_id) !==
    String(trend.id)
  ) {
    throw new Error(
      `Collection '${runId}' belongs to a different trend.`,
    );
  }

  return concurrent;
}

// ============================================================================
// AUTHOR PERSISTENCE
// ============================================================================

async function upsertAuthor(event) {
  const authorId =
    extractEventAuthorId(event);

  if (!authorId) {
    return null;
  }

  const platform =
    event.platform;

  const handle =
    event?.author?.authorHandle ??
    event?.author?.username ??
    null;

  const displayName =
    event?.author?.authorName ??
    event?.author?.name ??
    null;

  const bio =
    event?.author?.authorBio ??
    event?.author?.bio ??
    null;

  const location =
    event?.author?.authorLocation ??
    event?.author?.location ??
    null;

  const region =
    event?.author?.region ??
    event?.author?.profile?.region ??
    null;

  const followerCount =
    event?.platformData
      ?.authorFollowers ??
    event?.author?.profile
      ?.followers ??
    event?.author?.followers ??
    null;

  const verified =
    event?.platformData
      ?.authorVerified ??
    event?.author?.profile
      ?.verified ??
    event?.author?.verified ??
    null;

  const platformData =
    event?.platformData ??
    null;

  const profileImageUrl =
    event?.author?.profileImageUrl ??
    event?.author?.profile
      ?.imageUrl ??
    event?.author?.profile
      ?.profileImageUrl ??
    null;

  const profileUrl =
    event?.author?.profileUrl ??
    event?.author?.profile?.url ??
    null;

  const accountCreatedAt =
    event?.author?.accountCreatedAt ??
    event?.author?.profile
      ?.createdAt ??
    null;

  const query = `
    INSERT INTO authors (
      platform,
      external_author_id,
      handle,
      display_name,
      bio,
      location,
      region,
      follower_count,
      verified,
      account_created_at,
      profile_image_url,
      profile_url,
      platform_data,
      first_seen_at,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      platform,
      external_author_id
    )
    DO UPDATE SET
      handle =
        COALESCE(
          EXCLUDED.handle,
          authors.handle
        ),

      display_name =
        COALESCE(
          EXCLUDED.display_name,
          authors.display_name
        ),

      bio =
        COALESCE(
          EXCLUDED.bio,
          authors.bio
        ),

      location =
        COALESCE(
          EXCLUDED.location,
          authors.location
        ),

      region =
        COALESCE(
          EXCLUDED.region,
          authors.region
        ),

      follower_count =
        COALESCE(
          EXCLUDED.follower_count,
          authors.follower_count
        ),

      verified =
        COALESCE(
          EXCLUDED.verified,
          authors.verified
        ),

      account_created_at =
        COALESCE(
          EXCLUDED.account_created_at,
          authors.account_created_at
        ),

      profile_image_url =
        COALESCE(
          EXCLUDED.profile_image_url,
          authors.profile_image_url
        ),

      profile_url =
        COALESCE(
          EXCLUDED.profile_url,
          authors.profile_url
        ),

      platform_data =
        COALESCE(
          EXCLUDED.platform_data,
          authors.platform_data
        ),

      last_seen_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP

    RETURNING id
  `;

  const result =
    await queryWithTimeout(
      query,
      [
        platform,
        String(authorId),
        handle,
        displayName,
        bio,
        location,
        region,
        followerCount,
        verified,
        accountCreatedAt,
        profileImageUrl,
        profileUrl,
        json(platformData),
      ],
    );

  return result.rows[0]?.id ?? null;
}

// ============================================================================
// EVENT PERSISTENCE
// ============================================================================

async function upsertEvent(
  event,
  collectionId,
) {
  if (
    !event ||
    typeof event !== "object"
  ) {
    throw new Error(
      "Cannot persist invalid event.",
    );
  }

  if (!event.eventId) {
    throw new Error(
      "Cannot persist event without eventId.",
    );
  }

  if (!event.platform) {
    throw new Error(
      `Event '${event.eventId}' is missing platform.`,
    );
  }

  if (!event.platformPostId) {
    throw new Error(
      `Event '${event.eventId}' is missing platformPostId.`,
    );
  }

  const authorDbId =
    await upsertAuthor(event);

  const engagement =
    event?.engagement ?? {};

  const relationships =
    event?.relationships ?? {};

  const platformData =
    event?.platformData ?? {};

  const source =
    event?.source ?? {};

  const retrieval =
    event?.retrieval ?? {};

  const rawSource =
    event?.rawSource ?? null;

  // --------------------------------------------------------------------------
  // Required engagement fields
  // --------------------------------------------------------------------------

  /*
   * Reddit commonly has:
   *
   *   engagement.likes = null
   *   platformData.score = <actual Reddit score>
   *
   * Therefore use score as the likes-equivalent fallback.
   */
  const rawLikes =
    engagement.likes ??
    (
      event.platform === "reddit"
        ? platformData.score
        : null
    ) ??
    event?.metrics?.likes ??
    0;

  const likes =
    toSafeInteger(
      rawLikes,
      0,
    );

  const replies =
    toSafeInteger(
      engagement.replies ??
      event?.metrics?.comments ??
      0,
      0,
    );

  const reposts =
    toSafeInteger(
      engagement.reposts ??
      event?.metrics?.shares ??
      0,
      0,
    );

  const quotes =
    toSafeInteger(
      engagement.quotes ??
      0,
      0,
    );

  const views =
    toSafeInteger(
      engagement.views ??
      event?.metrics?.views ??
      0,
      0,
    );

  // --------------------------------------------------------------------------
  // Nullable engagement fields
  // --------------------------------------------------------------------------

  const bookmarks =
    engagement.bookmarks ===
      null ||
      engagement.bookmarks ===
      undefined ||
      engagement.bookmarks ===
      ""
      ? null
      : toSafeInteger(
        engagement.bookmarks,
        null,
      );

  const impressions =
    engagement.impressions ===
      null ||
      engagement.impressions ===
      undefined ||
      engagement.impressions ===
      ""
      ? null
      : toSafeInteger(
        engagement.impressions,
        null,
      );

  // --------------------------------------------------------------------------
  // Final defensive validation
  // --------------------------------------------------------------------------

  const requiredMetrics = {
    likes,
    replies,
    reposts,
    quotes,
    views,
  };

  for (
    const [
      metric,
      value,
    ] of Object.entries(
      requiredMetrics,
    )
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      throw new Error(
        `Required engagement metric '${metric}' ` +
        `resolved to NULL for event '${event.eventId}'.`,
      );
    }

    const numeric =
      Number(value);

    if (
      !Number.isFinite(numeric) ||
      numeric < 0
    ) {
      throw new Error(
        `Required engagement metric '${metric}' ` +
        `is invalid for event '${event.eventId}': ${String(value)}`,
      );
    }
  }

  log(
    "Database",
    `Event engagement normalized | ` +
    `event=${event.eventId} | ` +
    `platform=${event.platform} | ` +
    `likes=${likes} | ` +
    `replies=${replies} | ` +
    `reposts=${reposts} | ` +
    `quotes=${quotes} | ` +
    `views=${views}`,
  );

  // --------------------------------------------------------------------------
  // PostgreSQL INSERT
  // --------------------------------------------------------------------------

  const query = `
    INSERT INTO events (
      event_id,
      platform,
      platform_post_id,
      collection_id,
      author_id,
      published_at,
      observed_at,
      edited_at,
      content_text,
      title,
      language,
      detected_language,
      language_confidence,
      content_fingerprint,
      hashtags,
      mentions,
      urls,
      attachments,
      likes,
      replies,
      reposts,
      quotes,
      bookmarks,
      views,
      impressions,
      reply_to_id,
      reply_to_author_id,
      quote_of_id,
      forward_of_id,
      conversation_id,
      possibly_sensitive,
      is_edited,
      author_followers,
      author_verified,
      canonical,
      source,
      retrieval,
      raw_source,
      platform_data,
      created_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17,
      $18,

      COALESCE($19, 0),
      COALESCE($20, 0),
      COALESCE($21, 0),
      COALESCE($22, 0),

      $23,

      COALESCE($24, 0),

      $25,
      $26,
      $27,
      $28,
      $29,
      $30,
      $31,
      $32,
      $33,
      $34,
      $35,
      $36,
      $37,
      $38,
      $39,

      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      platform,
      platform_post_id
    )
    DO UPDATE SET

      author_id =
        COALESCE(
          EXCLUDED.author_id,
          events.author_id
        ),

      observed_at =
        COALESCE(
          EXCLUDED.observed_at,
          events.observed_at
        ),

      edited_at =
        COALESCE(
          EXCLUDED.edited_at,
          events.edited_at
        ),

      content_text =
        COALESCE(
          EXCLUDED.content_text,
          events.content_text
        ),

      title =
        COALESCE(
          EXCLUDED.title,
          events.title
        ),

      language =
        COALESCE(
          EXCLUDED.language,
          events.language
        ),

      detected_language =
        COALESCE(
          EXCLUDED.detected_language,
          events.detected_language
        ),

      language_confidence =
        COALESCE(
          EXCLUDED.language_confidence,
          events.language_confidence
        ),

      content_fingerprint =
        COALESCE(
          EXCLUDED.content_fingerprint,
          events.content_fingerprint
        ),

      hashtags =
        COALESCE(
          EXCLUDED.hashtags,
          events.hashtags
        ),

      mentions =
        COALESCE(
          EXCLUDED.mentions,
          events.mentions
        ),

      urls =
        COALESCE(
          EXCLUDED.urls,
          events.urls
        ),

      attachments =
        COALESCE(
          EXCLUDED.attachments,
          events.attachments
        ),

      likes =
        EXCLUDED.likes,

      replies =
        EXCLUDED.replies,

      reposts =
        EXCLUDED.reposts,

      quotes =
        EXCLUDED.quotes,

      bookmarks =
        COALESCE(
          EXCLUDED.bookmarks,
          events.bookmarks
        ),

      views =
        EXCLUDED.views,

      impressions =
        COALESCE(
          EXCLUDED.impressions,
          events.impressions
        ),

      reply_to_id =
        COALESCE(
          EXCLUDED.reply_to_id,
          events.reply_to_id
        ),

      reply_to_author_id =
        COALESCE(
          EXCLUDED.reply_to_author_id,
          events.reply_to_author_id
        ),

      quote_of_id =
        COALESCE(
          EXCLUDED.quote_of_id,
          events.quote_of_id
        ),

      forward_of_id =
        COALESCE(
          EXCLUDED.forward_of_id,
          events.forward_of_id
        ),

      conversation_id =
        COALESCE(
          EXCLUDED.conversation_id,
          events.conversation_id
        ),

      possibly_sensitive =
        COALESCE(
          EXCLUDED.possibly_sensitive,
          events.possibly_sensitive
        ),

      is_edited =
        COALESCE(
          EXCLUDED.is_edited,
          events.is_edited
        ),

      author_followers =
        COALESCE(
          EXCLUDED.author_followers,
          events.author_followers
        ),

      author_verified =
        COALESCE(
          EXCLUDED.author_verified,
          events.author_verified
        ),

      canonical =
        COALESCE(
          EXCLUDED.canonical,
          events.canonical
        ),

      source =
        COALESCE(
          EXCLUDED.source,
          events.source
        ),

      retrieval =
        COALESCE(
          EXCLUDED.retrieval,
          events.retrieval
        ),

      raw_source =
        COALESCE(
          EXCLUDED.raw_source,
          events.raw_source
        ),

      platform_data =
        COALESCE(
          EXCLUDED.platform_data,
          events.platform_data
        )

    RETURNING id
  `;

  const values = [
    event.eventId,
    event.platform,
    event.platformPostId,
    collectionId,
    authorDbId,
    extractPublishedAt(event),
    extractObservedAt(event),
    extractEditedAt(event),
    extractEventText(event),
    extractTitle(event),
    extractLanguage(event),
    extractDetectedLanguage(event),
    extractLanguageConfidence(event),
    extractContentFingerprint(event),
    json(extractHashtags(event)),
    json(extractMentions(event)),
    json(extractUrls(event)),
    json(extractAttachments(event)),
    likes,
    replies,
    reposts,
    quotes,
    bookmarks,
    views,
    impressions,
    relationships.replyToId ??
    null,
    relationships.replyToAuthorId ??
    null,
    relationships.quoteOfId ??
    null,
    relationships.forwardOfId ??
    relationships.crosspostOfId ??
    null,
    relationships.conversationId ??
    null,
    platformData.possiblySensitive ??
    null,
    platformData.isEdited ??
    null,
    platformData.authorFollowers ??
    null,
    platformData.authorVerified ??
    null,
    json(event),
    json(source),
    json(retrieval),
    json(rawSource),
    json(platformData),
  ];

  const result =
    await queryWithTimeout(
      query,
      values,
    );

  if (!result.rows[0]) {
    throw new Error(
      `Failed to persist event '${event.eventId}'.`,
    );
  }

  return result.rows[0].id;
}

async function persistEvents(
  data,
  collectionId,
) {
  const persistedEvents = [];

  for (const event of data.events) {
    const eventDbId =
      await upsertEvent(
        event,
        collectionId,
      );

    persistedEvents.push({
      eventId:
        event.eventId,

      databaseId:
        eventDbId,

      platform:
        event.platform,

      platformPostId:
        event.platformPostId,
    });
  }

  return persistedEvents;
}

// ============================================================================
// TREND EVENT LINKS
// ============================================================================

async function persistTrendEvent(
  trendId,
  eventDbId,
  collectionId,
) {
  const query = `
    INSERT INTO trend_events (
      trend_id,
      event_id,
      collection_id,
      first_seen_at
    )
    VALUES (
      $1,
      $2,
      $3,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      trend_id,
      event_id
    )
    DO NOTHING
  `;

  await queryWithTimeout(
    query,
    [
      trendId,
      eventDbId,
      collectionId,
    ],
  );
}

async function persistTrendEvents(
  trendId,
  collectionId,
  persistedEvents,
) {
  for (
    const event
    of persistedEvents
  ) {
    await persistTrendEvent(
      trendId,
      event.databaseId,
      collectionId,
    );
  }
}

// ============================================================================
// TREND SNAPSHOT
// ============================================================================

async function createTrendSnapshot(
  data,
  trend,
  collection,
  analytics,
) {
  const metrics =
    calculateSnapshotMetrics(
      data.events,
    );

  const trendAnalytics =
    analytics.trend ?? {};

  const rank =
    trendAnalytics
      ?.globalRanking
      ?.leaderboardPosition ??
    trendAnalytics
      ?.globalRanking
      ?.rank ??
    null;

  const score =
    trendAnalytics?.trendScore ??
    trendAnalytics?.score ??
    null;

  const tier =
    trendAnalytics
      ?.influence
      ?.viralityTier ??
    trendAnalytics?.tier ??
    null;

  const capturedAt =
    collection.observed_at ??
    collection.started_at ??
    collection.created_at ??
    resolveCollectionTimestamp(data);

  const query = `
    INSERT INTO trend_snapshots (
      trend_id,
      collection_id,
      captured_at,
      rank,
      score,
      tier,
      post_count,
      unique_authors,
      likes,
      replies,
      reposts,
      quotes,
      reach,
      latest_event_at,
      created_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (
      trend_id,
      captured_at
    )
    DO UPDATE SET
      collection_id =
        EXCLUDED.collection_id,

      rank =
        EXCLUDED.rank,

      score =
        EXCLUDED.score,

      tier =
        EXCLUDED.tier,

      post_count =
        EXCLUDED.post_count,

      unique_authors =
        EXCLUDED.unique_authors,

      likes =
        EXCLUDED.likes,

      replies =
        EXCLUDED.replies,

      reposts =
        EXCLUDED.reposts,

      quotes =
        EXCLUDED.quotes,

      reach =
        EXCLUDED.reach,

      latest_event_at =
        EXCLUDED.latest_event_at

    RETURNING id
  `;

  const result =
    await queryWithTimeout(
      query,
      [
        trend.id,
        collection.id,
        capturedAt,
        rank,
        score,
        tier,
        metrics.postCount,
        metrics.uniqueAuthors,
        metrics.likes,
        metrics.replies,
        metrics.reposts,
        metrics.quotes,
        metrics.reach,
        metrics.latestEventAt,
      ],
    );

  if (!result.rows[0]) {
    throw new Error(
      `Failed to create trend snapshot for trend '${trend.id}'.`,
    );
  }

  return {
    id:
      result.rows[0].id,

    metrics,
  };
}

// ============================================================================
// ANALYTICS ARCHIVE
// ============================================================================

/**
 * The current database schema does NOT contain:
 *
 *   trend_analytics_snapshots
 *
 * Analytics are persisted into their dedicated snapshot tables.
 */
async function persistAnalyticsSnapshot(
  snapshotId,
  analytics,
) {
  return;
}

// ============================================================================
// SENTIMENT SNAPSHOT
// ============================================================================

async function persistSentimentSnapshot(
  snapshotId,
  sentiment,
) {
  if (!sentiment) {
    return;
  }

  const positive =
    Number(
      sentiment?.summary?.positive ??
      0,
    );

  const neutral =
    Number(
      sentiment?.summary?.neutral ??
      0,
    );

  const negative =
    Number(
      sentiment?.summary?.negative ??
      0,
    );

  const safePositive =
    Number.isFinite(positive)
      ? positive
      : 0;

  const safeNeutral =
    Number.isFinite(neutral)
      ? neutral
      : 0;

  const safeNegative =
    Number.isFinite(negative)
      ? negative
      : 0;

  const total =
    safePositive +
    safeNeutral +
    safeNegative;

  const positivePercentage =
    total > 0
      ? (safePositive / total) *
      100
      : 0;

  const neutralPercentage =
    total > 0
      ? (safeNeutral / total) *
      100
      : 0;

  const negativePercentage =
    total > 0
      ? (safeNegative / total) *
      100
      : 0;

  const polarityIndex =
    total > 0
      ? (safePositive -
        safeNegative) /
      total
      : 0;

  const query = `
    INSERT INTO trend_sentiment_snapshots (
      snapshot_id,
      positive_count,
      neutral_count,
      negative_count,
      positive_percentage,
      neutral_percentage,
      negative_percentage,
      polarity_index
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8
    )
    ON CONFLICT (
      snapshot_id
    )
    DO UPDATE SET
      positive_count =
        EXCLUDED.positive_count,

      neutral_count =
        EXCLUDED.neutral_count,

      negative_count =
        EXCLUDED.negative_count,

      positive_percentage =
        EXCLUDED.positive_percentage,

      neutral_percentage =
        EXCLUDED.neutral_percentage,

      negative_percentage =
        EXCLUDED.negative_percentage,

      polarity_index =
        EXCLUDED.polarity_index
  `;

  await queryWithTimeout(
    query,
    [
      snapshotId,
      safePositive,
      safeNeutral,
      safeNegative,
      positivePercentage,
      neutralPercentage,
      negativePercentage,
      polarityIndex,
    ],
  );
}

// ============================================================================
// DEMOGRAPHIC SNAPSHOT
// ============================================================================

function buildFallbackAuthorProfiles(
  events,
) {
  const profiles = [];
  const seen = new Set();

  for (const event of events) {
    const authorId =
      extractEventAuthorId(event);

    if (!authorId) {
      continue;
    }

    const key =
      `${event.platform}:${authorId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    profiles.push({
      platform:
        event.platform,

      authorId:
        String(authorId),

      handle:
        event?.author?.authorHandle ??
        event?.author?.username ??
        null,

      displayName:
        event?.author?.authorName ??
        event?.author?.name ??
        null,

      bio:
        event?.author?.authorBio ??
        event?.author?.bio ??
        null,

      location:
        event?.author?.authorLocation ??
        event?.author?.location ??
        null,

      followerCount:
        event?.platformData
          ?.authorFollowers ??
        event?.author?.profile
          ?.followers ??
        event?.author?.followers ??
        null,

      verified:
        event?.platformData
          ?.authorVerified ??
        event?.author?.profile
          ?.verified ??
        event?.author?.verified ??
        null,
    });
  }

  return profiles;
}

async function persistDemographicSnapshot(
  snapshotId,
  demographic,
) {
  if (!demographic) {
    return;
  }

  const ageDistribution =
    demographic?.ageDistribution ??
    demographic?.age_distribution ??
    null;

  const genderDistribution =
    demographic?.genderDistribution ??
    demographic?.gender_distribution ??
    null;

  const professionalInterests =
    demographic?.professionalInterests ??
    demographic?.professional_interests ??
    null;

  const query = `
    INSERT INTO trend_demographic_snapshots (
      snapshot_id,
      age_distribution,
      gender_distribution,
      professional_interests,
      data
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5
    )
    ON CONFLICT (
      snapshot_id
    )
    DO UPDATE SET
      age_distribution =
        EXCLUDED.age_distribution,

      gender_distribution =
        EXCLUDED.gender_distribution,

      professional_interests =
        EXCLUDED.professional_interests,

      data =
        EXCLUDED.data
  `;

  await queryWithTimeout(
    query,
    [
      snapshotId,
      json(ageDistribution),
      json(genderDistribution),
      json(professionalInterests),
      json(demographic),
    ],
  );
}

// ============================================================================
// NETWORK SNAPSHOT
// ============================================================================

function resolveNetworkTopInfluencerScore(
  network,
) {
  const topInfluencer =
    network?.topInfluencers?.[0];

  if (!topInfluencer) {
    return null;
  }

  const candidates = [
    topInfluencer?.influence?.score,
    topInfluencer?.influenceScore,
    topInfluencer?.score,
    topInfluencer?.influence,
  ];

  for (const candidate of candidates) {
    if (
      candidate === null ||
      candidate === undefined ||
      candidate === ""
    ) {
      continue;
    }

    const numeric =
      Number(candidate);

    if (
      Number.isFinite(numeric)
    ) {
      return numeric;
    }
  }

  return null;
}

function resolveNetworkTopInfluencerId(
  network,
) {
  const topInfluencer =
    network?.topInfluencers?.[0];

  if (!topInfluencer) {
    return null;
  }

  return (
    topInfluencer.authorId ??
    topInfluencer.id ??
    null
  );
}

function inferPlatformFromExternalId(
  externalId,
) {
  if (
    typeof externalId !==
    "string"
  ) {
    return null;
  }

  const separatorIndex =
    externalId.indexOf(":");

  if (separatorIndex <= 0) {
    return null;
  }

  const prefix =
    externalId
      .slice(0, separatorIndex)
      .trim()
      .toLowerCase();

  if (
    SUPPORTED_PLATFORMS.includes(
      prefix,
    )
  ) {
    return prefix;
  }

  return null;
}

function resolveNetworkEdgePlatform(
  edge,
  network,
  events = [],
) {
  const explicitPlatform =
    edge?.platform ??
    edge?.sourcePlatform ??
    edge?.targetPlatform ??
    network?.platform ??
    null;

  if (explicitPlatform) {
    const normalized =
      String(explicitPlatform)
        .trim()
        .toLowerCase();

    if (
      SUPPORTED_PLATFORMS.includes(
        normalized,
      )
    ) {
      return normalized;
    }
  }

  const candidates = [
    edge?.source,
    edge?.target,
  ];

  for (
    const candidate
    of candidates
  ) {
    const inferred =
      inferPlatformFromExternalId(
        candidate,
      );

    if (inferred) {
      return inferred;
    }
  }

  const platforms =
    new Set(
      events
        .map(
          (event) =>
            event?.platform,
        )
        .filter(Boolean),
    );

  if (platforms.size === 1) {
    return [
      ...platforms,
    ][0];
  }

  return null;
}

async function resolveAuthorDbId(
  platform,
  externalAuthorId,
) {
  if (
    !platform ||
    !externalAuthorId
  ) {
    return null;
  }

  if (
    !SUPPORTED_PLATFORMS.includes(
      platform,
    )
  ) {
    return null;
  }

  const result =
    await queryWithTimeout(
      `
        SELECT id
        FROM authors
        WHERE
          platform = $1
          AND external_author_id = $2
        LIMIT 1
      `,
      [
        platform,
        String(externalAuthorId),
      ],
    );

  return (
    result.rows[0]?.id ??
    null
  );
}

async function persistNetworkSnapshot(
  snapshotId,
  network,
) {
  if (!network) {
    return;
  }

  const summary =
    network.summary ?? {};

  const topInfluencerScore =
    resolveNetworkTopInfluencerScore(
      network,
    );

  const topInfluencerId =
    resolveNetworkTopInfluencerId(
      network,
    );

  const topInfluencerPlatform =
    inferPlatformFromExternalId(
      topInfluencerId,
    );

  let topInfluencerAuthorDbId =
    null;

  if (
    topInfluencerId &&
    topInfluencerPlatform
  ) {
    topInfluencerAuthorDbId =
      await resolveAuthorDbId(
        topInfluencerPlatform,
        topInfluencerId,
      );
  }

  const nodeCount =
    Number(
      summary.nodes ??
      network.nodes?.length ??
      0,
    );

  const edgeCount =
    Number(
      summary.edges ??
      network.edges?.length ??
      0,
    );

  const communityCount =
    Number(
      summary.communities ??
      (
        Array.isArray(
          network.communities,
        )
          ? network.communities
            .length
          : 0
      ),
    );

  const density =
    Number(
      summary.density ??
      network.density ??
      0,
    );

  const query = `
    INSERT INTO trend_network_snapshots (
      snapshot_id,
      nodes,
      edges,
      communities,
      density,
      top_influencer_author_id,
      top_influencer_score
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7
    )
    ON CONFLICT (
      snapshot_id
    )
    DO UPDATE SET
      nodes =
        EXCLUDED.nodes,

      edges =
        EXCLUDED.edges,

      communities =
        EXCLUDED.communities,

      density =
        EXCLUDED.density,

      top_influencer_author_id =
        EXCLUDED.top_influencer_author_id,

      top_influencer_score =
        EXCLUDED.top_influencer_score
  `;

  await queryWithTimeout(
    query,
    [
      snapshotId,

      Number.isFinite(nodeCount)
        ? nodeCount
        : 0,

      Number.isFinite(edgeCount)
        ? edgeCount
        : 0,

      Number.isFinite(
        communityCount,
      )
        ? communityCount
        : 0,

      Number.isFinite(density)
        ? density
        : 0,

      topInfluencerAuthorDbId,

      topInfluencerScore ??
      null,
    ],
  );
}

// ============================================================================
// NETWORK RELATIONSHIPS
// ============================================================================

async function persistNetworkRelationships(
  collectionId,
  network,
  events = [],
) {
  if (!network) {
    return;
  }

  const edges =
    Array.isArray(network.edges)
      ? network.edges
      : [];

  await queryWithTimeout(
    `
      DELETE FROM network_relationships
      WHERE collection_id = $1
    `,
    [collectionId],
  );

  for (const edge of edges) {
    const interactions =
      edge?.interactions ?? {};

    const relationshipTypes = [
      [
        "follow",
        interactions.follows,
      ],
      [
        "like",
        interactions.likes,
      ],
      [
        "mention",
        interactions.mentions,
      ],
      [
        "reply",
        interactions.replies,
      ],
      [
        "quote",
        interactions.quotes,
      ],
      [
        "repost",
        interactions.reposts,
      ],
    ];

    const platform =
      resolveNetworkEdgePlatform(
        edge,
        network,
        events,
      );

    if (!platform) {
      log(
        "Database",
        `Skipping network edge because platform could not be resolved | ` +
        `source=${edge?.source ?? "unknown"} | ` +
        `target=${edge?.target ?? "unknown"}`,
      );

      continue;
    }

    if (
      !SUPPORTED_PLATFORMS.includes(
        platform,
      )
    ) {
      log(
        "Database",
        `Skipping network edge because platform '${platform}' ` +
        `is unsupported | ` +
        `source=${edge?.source ?? "unknown"} | ` +
        `target=${edge?.target ?? "unknown"}`,
      );

      continue;
    }

    const sourceAuthorDbId =
      await resolveAuthorDbId(
        platform,
        edge?.source,
      );

    const targetAuthorDbId =
      await resolveAuthorDbId(
        platform,
        edge?.target,
      );

    for (
      const [
        relationshipType,
        count,
      ] of relationshipTypes
    ) {
      const numericCount =
        Number(count ?? 0);

      if (
        !Number.isFinite(
          numericCount,
        ) ||
        numericCount <= 0
      ) {
        continue;
      }

      const query = `
        INSERT INTO network_relationships (
          collection_id,
          event_id,
          source_author_id,
          target_author_id,
          source_external_id,
          target_external_id,
          platform,
          relationship_type,
          occurred_at,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          CURRENT_TIMESTAMP
        )
      `;

      await queryWithTimeout(
        query,
        [
          collectionId,

          null,

          sourceAuthorDbId,
          targetAuthorDbId,

          edge?.source ??
          null,

          edge?.target ??
          null,

          platform,

          relationshipType,

          edge?.lastInteraction ??
          new Date().toISOString(),

          json({
            count:
              numericCount,

            firstInteraction:
              edge?.firstInteraction ??
              null,

            lastInteraction:
              edge?.lastInteraction ??
              null,

            eventIds:
              Array.isArray(
                edge?.eventIds,
              )
                ? edge.eventIds
                : [],
          }),
        ],
      );
    }
  }
}

// ============================================================================
// COLLECTION STATUS
// ============================================================================

async function markCollectionCompleted(
  collectionId,
  eventCount,
) {
  const query = `
    UPDATE collections
    SET
      status = 'completed',

      completed_at =
        COALESCE(
          completed_at,
          CURRENT_TIMESTAMP
        ),

      event_count = $2

    WHERE id = $1
  `;

  const result =
    await queryWithTimeout(
      query,
      [
        collectionId,
        eventCount,
      ],
    );

  if (result.rowCount !== 1) {
    throw new Error(
      `Failed to mark collection '${collectionId}' as completed.`,
    );
  }
}

// ============================================================================
// DATABASE TRANSACTION
// ============================================================================

async function withTransaction(
  callback,
) {
  await ensurePostgresConnection();

  if (shuttingDown) {
    throw new Error(
      "Transaction aborted because shutdown is in progress.",
    );
  }

  await queryWithTimeout(
    "BEGIN",
  );

  try {
    if (shuttingDown) {
      throw new Error(
        "Transaction aborted because shutdown started after BEGIN.",
      );
    }

    const result =
      await callback();

    if (shuttingDown) {
      throw new Error(
        "Transaction aborted because shutdown started before COMMIT.",
      );
    }

    await queryWithTimeout(
      "COMMIT",
    );

    return result;
  } catch (err) {
    try {
      await queryWithTimeout(
        "ROLLBACK",
      );
    } catch (rollbackError) {
      error(
        "Database",
        `Rollback failed: ${rollbackError.message}`,
      );
    }

    throw err;
  }
}

// ============================================================================
// 1. SENTIMENT WORKER
// ============================================================================

function createSentimentWorker() {
  if (
    typeof analyzeBatch !==
    "function"
  ) {
    throw new Error(
      "Sentiment pipeline has not been loaded.",
    );
  }

  return new Worker(
    "SentimentQueue",

    async (job) => {
      const startedAt =
        Date.now();

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
        `Run=${runId}`,
      );

      const textEntries = [];

      for (
        let index = 0;
        index <
        data.events.length;
        index++
      ) {
        const event =
          data.events[index];

        const text =
          event.content?.text;

        if (
          typeof text !==
          "string" ||
          !text.trim()
        ) {
          continue;
        }

        textEntries.push({
          eventIndex:
            index,

          eventId:
            event.eventId,

          publishedAt:
            event.time?.publishedAt ??
            null,

          platform:
            event.platform,

          text:
            text.trim(),
        });
      }

      log(
        "Sentiment",
        `Found ${textEntries.length}/${data.events.length} ` +
        `events with analyzable text.`,
      );

      if (
        textEntries.length ===
        0
      ) {
        const emptyResult = {
          category:
            "sentiment",

          eventCount:
            data.events.length,

          analyzedCount:
            0,

          unanalyzedCount:
            data.events.length,

          platformCounts:
            getPlatformCounts(
              data.events,
            ),

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
          `No analyzable text.`,
        );

        return emptyResult;
      }

      log(
        "Sentiment",
        `Sending ${textEntries.length} texts to sentiment pipeline...`,
      );

      const predictions =
        await analyzeBatch(
          textEntries.map(
            (entry) =>
              entry.text,
          ),
        );

      if (
        !Array.isArray(
          predictions,
        ) ||
        predictions.length !==
        textEntries.length
      ) {
        throw new Error(
          `Sentiment pipeline returned ` +
          `${predictions?.length ?? 0} results ` +
          `for ${textEntries.length} events.`,
        );
      }

      log(
        "Sentiment",
        `Sentiment pipeline returned ` +
        `${predictions.length} predictions.`,
      );

      const results = [];

      for (
        let i = 0;
        i <
        textEntries.length;
        i++
      ) {
        const entry =
          textEntries[i];

        const prediction =
          predictions[i];

        if (
          !prediction ||
          typeof prediction !==
          "object"
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
              prediction.emotions,
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
            prediction.tier ??
            null,

          /*
           * Optional explanation returned
           * by newer Tier 2 implementations.
           *
           * Does not break the existing
           * sentiment contract when absent.
           */
          reason:
            prediction.reason ??
            null,
        });
      }

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

      for (
        const result
        of results
      ) {
        const polarity =
          result.polarity?.label;

        if (
          Object.prototype.hasOwnProperty.call(
            summary,
            polarity,
          )
        ) {
          summary[
            polarity
          ]++;
        }

        if (
          Array.isArray(
            result.emotions,
          )
        ) {
          for (
            const emotion
            of result.emotions
          ) {
            if (
              !emotion?.label
            ) {
              continue;
            }

            emotions[
              emotion.label
            ] =
              (
                emotions[
                emotion.label
                ] || 0
              ) + 1;
          }
        }

        const stanceLabel =
          result.stance?.label;

        if (
          Object.prototype.hasOwnProperty.call(
            stance,
            stanceLabel,
          )
        ) {
          stance[
            stanceLabel
          ]++;
        }

        if (
          result.sarcasm
            ?.detected === true
        ) {
          sarcasm.detected++;
        } else if (
          result.sarcasm
            ?.detected === false
        ) {
          sarcasm.notDetected++;
        }

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

      let overallSentiment =
        "unknown";

      const totalAnalyzed =
        results.length;

      if (
        totalAnalyzed > 0
      ) {
        const {
          positive,
          negative,
          neutral,
        } = summary;

        const difference =
          Math.abs(
            positive -
            negative,
          );

        const isPolarized =
          positive > 0 &&
          negative > 0 &&
          difference /
          totalAnalyzed <
          0.15 &&
          positive +
          negative >
          neutral;

        if (
          isPolarized
        ) {
          overallSentiment =
            "mixed";
        } else {
          overallSentiment =
            Object.keys(
              summary,
            ).reduce(
              (a, b) =>
                summary[a] >
                  summary[b]
                  ? a
                  : b,
            );
        }
      }

      const finalResult = {
        category:
          "sentiment",

        trendLabel,

        overallSentiment,

        eventCount:
          data.events.length,

        analyzedCount:
          results.length,

        unanalyzedCount:
          data.events.length -
          results.length,

        platformCounts:
          getPlatformCounts(
            data.events,
          ),

        summary,

        emotions,

        stance,

        sarcasm,

        tierUsage,

        results,
      };

      const duration =
        Date.now() -
        startedAt;

      success(
        "Sentiment",
        `DONE job=${job.id} | ` +
        `${results.length}/${data.events.length} analyzed | ` +
        `Tier1=${tierUsage.tier1} | ` +
        `Tier2=${tierUsage.tier2} | ` +
        `${duration}ms`,
      );

      return finalResult;
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        SENTIMENT_CONCURRENCY,
    },
  );
}

// ============================================================================
// 2. DEMOGRAPHIC WORKER
// ============================================================================

async function runGoogleTrendDemographics(
  trendLabel,
) {
  /*
   * Google Trends currently provides:
   *
   *   - timeline data
   *   - regional interest
   *
   * These are supplementary analytics.
   *
   * They are NOT treated as inferred
   * age/gender demographics.
   */

  const country = "India";

  const endTime =
    new Date();

  const startTime =
    new Date(endTime);

  startTime.setDate(
    startTime.getDate() - 30,
  );

  let timelines = null;
  let regionals = null;

  try {
    timelines =
      await googleTrendTimeLine(
        trendLabel,
        country,
        {
          startTime,
          endTime,
        },
      );
  } catch (err) {
    error(
      "Demographic",
      `Google Trends timeline failed for '${trendLabel}': ${err.message}`,
    );
  }

  try {
    regionals =
      await googleTrendRegions(
        trendLabel,
        country,
        {
          startTime,
          endTime,
        },
      );
  } catch (err) {
    error(
      "Demographic",
      `Google Trends regional analysis failed for '${trendLabel}': ${err.message}`,
    );
  }

  return {
    timelines,
    regionals,
    country,
    startTime:
      startTime.toISOString(),
    endTime:
      endTime.toISOString(),
  };
}

function createDemographicWorker() {
  return new Worker(
    "DemographicQueue",

    async (job) => {
      const data =
        getCanonicalData(job);

      validateCollection(data);

      const trendLabel =
        getTrendLabel(data);

      const explicitProfiles =
        Array.isArray(
          data.authorProfiles,
        )
          ? data.authorProfiles
          : [];

      const profiles =
        explicitProfiles.length > 0
          ? explicitProfiles
          : buildFallbackAuthorProfiles(
            data.events,
          );

      /*
       * Google Trends enhancement
       */
      const googleTrends =
        await runGoogleTrendDemographics(
          trendLabel,
        );

      const timelineCount =
        Array.isArray(
          googleTrends
            ?.timelines
            ?.timeline,
        )
          ? googleTrends
            .timelines
            .timeline
            .length
          : 0;

      const regionalCount =
        Array.isArray(
          googleTrends
            ?.regionals
            ?.regions,
        )
          ? googleTrends
            .regionals
            .regions
            .length
          : 0;

      log(
        "Demographic",
        `Processing ${data.events.length} events | ` +
        `Profiles=${profiles.length} | ` +
        `TimeLines=${timelineCount} | ` +
        `Regionals=${regionalCount} | ` +
        `Trend=${trendLabel}`,
      );

      /*
       * Demographic inference remains separate
       * from Google Trends.
       *
       * We do NOT infer age/gender from Google
       * Trends because regional interest is not
       * demographic ground truth.
       */
      const result = {
        category:
          "demographic",

        topAge:
          null,

        topRegion:
          null,

        eventCount:
          data.events.length,

        profilesAvailable:
          profiles.length,

        googleTrends,

        /*
         * These remain null until a dedicated
         * demographic inference model produces
         * defensible distributions.
         */
        ageDistribution:
          null,

        genderDistribution:
          null,

        professionalInterests:
          null,
      };

      success(
        "Demographic",
        `Processed ${data.events.length} events | ` +
        `Profiles=${profiles.length} | ` +
        `Timeline=${timelineCount} | ` +
        `Regional=${regionalCount}.`,
      );

      return result;
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    },
  );
}

// ============================================================================
// 3. TREND WORKER
// ============================================================================

async function generateCachedTrendDescription(
  trendLabel,
  events,
) {
  if (
    !trendLabel ||
    trendLabel === "unknown"
  ) {
    return null;
  }

  const cacheKey =
    `trend:desc:${trendLabel}`;

  try {
    const cached =
      await localSharedRedis.get(
        cacheKey,
      );

    if (cached) {
      log(
        "Trend",
        `Description cache hit for '${trendLabel}'.`,
      );

      return cached;
    }
  } catch (err) {
    error(
      "Trend",
      `Description cache read failed: ${err.message}`,
    );
  }

  /*
   * IMPORTANT:
   *
   * Canonical text is:
   *
   *   event.content.text
   *
   * NOT:
   *
   *   event.text
   */
  const contextEvents =
    (events || [])
      .filter(
        (event) =>
          typeof event?.content
            ?.text === "string" &&
          event.content.text
            .trim()
            .length > 10,
      )
      .slice(0, 10)
      .map(
        (event) =>
          `- ${event.content.text
            .trim()}`,
      )
      .join("\n");

  const trendContext =
    contextEvents.length > 0
      ? contextEvents
      : null;

  try {
    log(
      "Trend",
      `Fetching description from Groq for trend: ${trendLabel}`,
    );

    const description =
      await generateTrendDescription(
        trendLabel,
        trendContext,
      );

    if (description) {
      try {
        /*
         * Cache for 24 hours.
         *
         * This avoids repeatedly spending
         * Groq requests for the same trend.
         */
        await localSharedRedis.setex(
          cacheKey,
          60 * 60 * 24,
          description,
        );

        log(
          "Trend",
          `Description cached for 24h | trend=${trendLabel}`,
        );
      } catch (err) {
        error(
          "Trend",
          `Description cache write failed: ${err.message}`,
        );
      }

      return description;
    }

    return null;
  } catch (err) {
    /*
     * Description generation is supplementary.
     *
     * Do not fail the entire trend analytics
     * job just because Groq description
     * generation failed.
     */
    error(
      "Trend",
      `Trend description generation failed: ${err.message}`,
    );

    return null;
  }
}

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
        `Run=${data.collection.collectionId}`,
      );

      // ----------------------------------------------------------------------
      // Local trend analysis
      // ----------------------------------------------------------------------

      const result =
        analyzeTrend(data);

      if (
        !result ||
        typeof result !==
        "object"
      ) {
        throw new Error(
          "analyzeTrend() returned an invalid result.",
        );
      }

      // ----------------------------------------------------------------------
      // Trend Description
      // ----------------------------------------------------------------------

      const description =
        await generateCachedTrendDescription(
          trendLabel,
          data.events,
        );

      result.description =
        description ||
        "No description available.";

      // ----------------------------------------------------------------------
      // Global trend statistics
      // ----------------------------------------------------------------------

      await recordTrendStats(
        localSharedRedis,
        result,
      );

      const enriched =
        await enrichWithGlobalRanking(
          localSharedRedis,
          result,
        );

      // ----------------------------------------------------------------------
      // Forecasting
      // ----------------------------------------------------------------------

      const history =
        enriched.globalRanking
          ?.scoreHistory ??
        [];

      const forecastData =
        generateForecast(
          enriched,
          history,
        );

      await localSharedRedis.set(
        `trend:forecast:${enriched.id}`,
        JSON.stringify(
          forecastData,
        ),
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
          `${ranking.tierMovement ?? "stable"}`,
        );
      } else {
        log(
          "Trend",
          `${enriched.name ?? trendLabel}: ` +
          `trend analysis completed without global ranking.`,
        );
      }

      return {
        category:
          "trend",

        description:
          description ||
          "No description available.",

        ...enriched,
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    },
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
        `Run=${data.collection.collectionId}`,
      );

      const result =
        analyzeNetwork(data);

      if (
        !result ||
        typeof result !==
        "object"
      ) {
        throw new Error(
          "analyzeNetwork() returned an invalid result.",
        );
      }

      const nodeCount =
        Array.isArray(
          result.nodes,
        )
          ? result.nodes.length
          : 0;

      const edgeCount =
        Array.isArray(
          result.edges,
        )
          ? result.edges.length
          : 0;

      const topInfluencer =
        result.topInfluencers?.[0];

      const topInfluencerLabel =
        topInfluencer?.label ??
        topInfluencer?.username ??
        topInfluencer?.authorId ??
        topInfluencer?.id ??
        "none";

      const topInfluencerScore =
        resolveNetworkTopInfluencerScore(
          result,
        );

      log(
        "Network",
        `${trendLabel}: ` +
        `${nodeCount} nodes, ` +
        `${edgeCount} edges, ` +
        `top=${topInfluencerLabel} ` +
        `score=${topInfluencerScore ?? "n/a"}`,
      );

      return {
        category:
          "network",

        ...result,
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        ANALYTICS_CONCURRENCY,
    },
  );
}

// ============================================================================
// 5. DATABASE WORKER
// ============================================================================

function createDatabaseWorker() {
  return new Worker(
    "DatabaseQueue",

    async (job) => {
      if (
        !job?.data ||
        typeof job.data !==
        "object"
      ) {
        throw new Error(
          "Database job data is missing or invalid.",
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
        typeof canonical !==
        "object"
      ) {
        throw new Error(
          "Database job is missing canonical collection.",
        );
      }

      validateCollection(
        canonical,
      );

      const resolvedRunId =
        runId ??
        canonical.collection
          .collectionId;

      const resolvedTrendLabel =
        trend_label ??
        getTrendLabel(
          canonical,
        );

      const resolvedSchemaVersion =
        schemaVersion ??
        canonical.schemaVersion;

      log(
        "Database",
        `Gathering results | ` +
        `Trend=${resolvedTrendLabel} | ` +
        `Run=${resolvedRunId}`,
      );

      if (
        eventIds !== undefined &&
        !Array.isArray(eventIds)
      ) {
        throw new Error(
          "Database job eventIds must be an array when provided.",
        );
      }

      if (
        Array.isArray(eventIds) &&
        eventIds.length !==
        canonical.events.length
      ) {
        throw new Error(
          `Database event accounting mismatch: ` +
          `eventIds=${eventIds.length}, ` +
          `canonical.events=${canonical.events.length}.`,
        );
      }

      const childResults =
        await job.getChildrenValues();

      const rawValues =
        Object.values(
          childResults,
        );

      log(
        "Database",
        `Received ${rawValues.length} child result(s).`,
      );

      const EXPECTED_ANALYTICS_CATEGORIES =
        [
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
          `but received ${rawValues.length}.`,
        );
      }

      const analytics = {};

      for (
        const result
        of rawValues
      ) {
        if (
          !result ||
          typeof result !==
          "object"
        ) {
          throw new Error(
            "Database received an invalid child result.",
          );
        }

        if (!result.category) {
          throw new Error(
            "Database received a child result without category.",
          );
        }

        const {
          category,
          ...resultData
        } = result;

        if (
          !EXPECTED_ANALYTICS_CATEGORIES.includes(
            category,
          )
        ) {
          throw new Error(
            `Unexpected analytics category '${category}'.`,
          );
        }

        if (
          analytics[category]
        ) {
          throw new Error(
            `Duplicate analytics category '${category}'.`,
          );
        }

        analytics[category] =
          resultData;
      }

      const missingCategories =
        EXPECTED_ANALYTICS_CATEGORIES.filter(
          (category) =>
            !Object.prototype.hasOwnProperty.call(
              analytics,
              category,
            ),
        );

      if (
        missingCategories.length >
        0
      ) {
        throw new Error(
          `Database is missing child analytics: ` +
          `${missingCategories.join(", ")}`,
        );
      }

      const analyticsCategories =
        Object.keys(
          analytics,
        );

      log(
        "Database",
        `Analytics categories: ` +
        `${analyticsCategories.join(", ")}`,
      );

      log(
        "Database",
        `Child result validation: ` +
        `sentiment=${Boolean(
          analytics.sentiment,
        )}, ` +
        `demographic=${Boolean(
          analytics.demographic,
        )}, ` +
        `trend=${Boolean(
          analytics.trend,
        )}, ` +
        `network=${Boolean(
          analytics.network,
        )}`,
      );

      log(
        "Database",
        `Canonical validation: ` +
        `schema=${resolvedSchemaVersion} | ` +
        `events=${canonical.events.length} | ` +
        `run=${resolvedRunId}`,
      );

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

      if (
        !databaseRecord.run_id ||
        !databaseRecord.trend_label ||
        !databaseRecord.schema_version ||
        !databaseRecord.canonical_collection ||
        !databaseRecord.analytics
      ) {
        throw new Error(
          "Database record construction failed.",
        );
      }

      const persistenceResult =
        await withTransaction(
          async () => {
            // ---------------------------------------------------------------
            // 1. Trend
            // ---------------------------------------------------------------

            const trend =
              await upsertTrend(
                canonical,
              );

            log(
              "Database",
              `Trend resolved | ` +
              `id=${trend.id} | ` +
              `label=${trend.canonical_label}`,
            );

            // ---------------------------------------------------------------
            // 2. Collection
            // ---------------------------------------------------------------

            const collection =
              await createCollection(
                canonical,
                trend,
                resolvedRunId,
              );

            log(
              "Database",
              `Collection persisted | ` +
              `sequence=#${collection.collection_sequence} | ` +
              `id=${collection.id} | ` +
              `external=${collection.external_collection_id} | ` +
              `status=${collection.status} | ` +
              `events=${collection.event_count}`,
            );

            // ---------------------------------------------------------------
            // 3. Events
            // ---------------------------------------------------------------

            const persistedEvents =
              await persistEvents(
                canonical,
                collection.id,
              );

            log(
              "Database",
              `Events persisted | ` +
              `${persistedEvents.length}/${canonical.events.length}`,
            );

            // ---------------------------------------------------------------
            // 4. Trend-event links
            // ---------------------------------------------------------------

            await persistTrendEvents(
              trend.id,
              collection.id,
              persistedEvents,
            );

            log(
              "Database",
              `Trend-event links persisted | ` +
              `count=${persistedEvents.length}`,
            );

            // ---------------------------------------------------------------
            // 5. Trend snapshot
            // ---------------------------------------------------------------

            const snapshot =
              await createTrendSnapshot(
                canonical,
                trend,
                collection,
                analytics,
              );

            log(
              "Database",
              `Snapshot persisted | ` +
              `id=${snapshot.id}`,
            );

            // ---------------------------------------------------------------
            // 6. Dedicated analytics persistence
            // ---------------------------------------------------------------

            await persistAnalyticsSnapshot(
              snapshot.id,
              analytics,
            );

            // ---------------------------------------------------------------
            // 7. Sentiment
            // ---------------------------------------------------------------

            await persistSentimentSnapshot(
              snapshot.id,
              analytics.sentiment,
            );

            // ---------------------------------------------------------------
            // 8. Demographic
            // ---------------------------------------------------------------

            await persistDemographicSnapshot(
              snapshot.id,
              analytics.demographic,
            );

            // ---------------------------------------------------------------
            // 9. Network
            // ---------------------------------------------------------------

            await persistNetworkSnapshot(
              snapshot.id,
              analytics.network,
            );

            // ---------------------------------------------------------------
            // 10. Network relationships
            // ---------------------------------------------------------------

            await persistNetworkRelationships(
              collection.id,
              analytics.network,
              canonical.events,
            );

            // ---------------------------------------------------------------
            // 11. Complete collection
            // ---------------------------------------------------------------

            await markCollectionCompleted(
              collection.id,
              canonical.events.length,
            );

            return {
              trend,
              collection,
              snapshot,
              persistedEvents,
            };
          },
        );

      log(
        "Database",
        `Prepared persistent state | ` +
        `Trend=${persistenceResult.trend.id} | ` +
        `Collection=#${persistenceResult.collection.collection_sequence} | ` +
        `Snapshot=${persistenceResult.snapshot.id} | ` +
        `Events=${persistenceResult.persistedEvents.length}`,
      );

      log(
        "Database",
        `Analytics persisted: ` +
        `${analyticsCategories.join(", ")}`,
      );

      log(
        "Database",
        "Record validation: PASS",
      );

      success(
        "Database",
        `Collection ${resolvedRunId} committed successfully.`,
      );

      return {
        status:
          "success",

        runId:
          resolvedRunId,

        trendId:
          persistenceResult.trend.id,

        trendLabel:
          resolvedTrendLabel,

        collectionId:
          persistenceResult
            .collection.id,

        collectionSequence:
          persistenceResult
            .collection
            .collection_sequence,

        snapshotId:
          persistenceResult
            .snapshot.id,

        schemaVersion:
          resolvedSchemaVersion,

        eventCount:
          canonical.events.length,

        analyticsCategories,

        persistence:
          "committed",
      };
    },

    {
      connection:
        createBullMQConnection(),

      concurrency:
        DATABASE_CONCURRENCY,
    },
  );
}

// ============================================================================
// Worker Registry
// ============================================================================

let workers = [];

// ============================================================================
// Worker Events
// ============================================================================

function registerWorkerEvents(
  worker,
) {
  worker.on(
    "completed",
    (job) => {
      success(
        worker.name,
        `Job ${job.id} completed.`,
      );
    },
  );

  worker.on(
    "failed",
    (job, err) => {
      error(
        worker.name,
        `Job ${job?.id ?? "unknown"} failed: ${err.message}`,
      );
    },
  );

  worker.on(
    "error",
    (err) => {
      error(
        worker.name,
        `Worker error: ${err.message}`,
      );
    },
  );
}

// ============================================================================
// Startup
// ============================================================================

async function startWorkers() {
  try {
    await loadSentimentPipeline();

    if (shuttingDown) {
      return;
    }

    let connected = await checkPostgres();

    if(!connected){
      await connectPostgres();
    }

    if (shuttingDown) {
      return;
    }

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

    for (
      const worker
      of workers
    ) {
      registerWorkerEvents(
        worker,
      );
    }

    console.log(
      "\n========================================",
    );

    console.log(
      "BullMQ workers are online.",
    );

    console.log(
      "========================================",
    );

    console.log(
      `Schema: ${SUPPORTED_SCHEMA_VERSION}`,
    );

    console.log(
      "Queues:",
    );

    console.log(
      `  - SentimentQueue      concurrency=${SENTIMENT_CONCURRENCY}`,
    );

    console.log(
      `  - DemographicQueue    concurrency=${ANALYTICS_CONCURRENCY}`,
    );

    console.log(
      `  - TrendQueue          concurrency=${ANALYTICS_CONCURRENCY}`,
    );

    console.log(
      `  - NetworkQueue        concurrency=${ANALYTICS_CONCURRENCY}`,
    );

    console.log(
      `  - DatabaseQueue       concurrency=${DATABASE_CONCURRENCY}`,
    );

    console.log(
      "Sentiment: loaded",
    );

    console.log(
      "Google Trends: enabled",
    );

    console.log(
      "Trend descriptions: Groq + Redis cache",
    );

    console.log(
      "Database: aggregation enabled",
    );

    console.log(
      "PostgreSQL persistence: enabled",
    );

    console.log(
      "Persistence model: trend → collection → authors → events → snapshot",
    );

    console.log(
      "Analytics persistence: dedicated snapshot tables",
    );

    console.log(
      "========================================\n",
    );
  } catch (err) {
    if (shuttingDown) {
      return;
    }

    console.error(
      "\n========================================",
    );

    console.error(
      "FAILED TO START BULLMQ WORKERS",
    );

    console.error(
      "========================================",
    );

    console.error(err);

    process.exit(1);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(
  signal,
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `\nReceived ${signal}. ` +
    `Shutting down BullMQ workers...`,
  );

  // --------------------------------------------------------------------------
  // BullMQ workers
  // --------------------------------------------------------------------------

  try {
    await Promise.all(
      workers.map(
        (worker) =>
          worker.close(),
      ),
    );

    success(
      "Shutdown",
      "All BullMQ workers closed.",
    );
  } catch (err) {
    error(
      "Shutdown",
      `Failed to close workers cleanly: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // Redis
  // --------------------------------------------------------------------------

  try {
    if (
      localSharedRedis &&
      typeof localSharedRedis.quit ===
      "function"
    ) {
      await localSharedRedis.quit();

      success(
        "Shutdown",
        "Shared Redis connection closed.",
      );
    }
  } catch (err) {
    error(
      "Shutdown",
      `Failed to close shared Redis connection: ${err.message}`,
    );
  }

  // --------------------------------------------------------------------------
  // PostgreSQL
  // --------------------------------------------------------------------------

  try {
    if (
      pgClient &&
      typeof pgClient.end ===
      "function"
    ) {
      await pgClient.end();

      success(
        "Shutdown",
        "PostgreSQL connection closed.",
      );
    }
  } catch (err) {
    error(
      "Shutdown",
      `Failed to close PostgreSQL connection: ${err.message}`,
    );
  }

  process.exit(0);
}

process.on(
  "SIGINT",
  () =>
    shutdown("SIGINT"),
);

process.on(
  "SIGTERM",
  () =>
    shutdown("SIGTERM"),
);

// ============================================================================
// Start
// ============================================================================

startWorkers();