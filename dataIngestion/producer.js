/**
 * ============================================================================
 * DATA INGESTION PRODUCER
 * ============================================================================
 *
 * Responsibility:
 *
 *   Redis Stream (`scrape:events`)
 *          ↓
 *   Read canonical v1.0.0 collection
 *          ↓
 *   Validate ingestion boundary
 *          ↓
 *   Create BullMQ Flow
 *          ↓
 *   ACK Redis message only after BullMQ accepts it
 *
 * Upstream contract:
 *
 *   The scraper daemon publishes:
 *
 *     XADD scrape:events * data "<complete canonical JSON>"
 *
 *   Therefore the Redis Stream has ONE field:
 *
 *     data → JSON.stringify(canonicalCollection)
 *
 * The `data` field is NOT a legacy wrapper.
 *
 * Canonical collection:
 *
 * {
 *   schemaVersion: "1.0.0",
 *   collection: {},
 *   trend: {},
 *   platforms: {},
 *   events: [],
 *   authorProfiles: [],
 *   communities: [],
 *   quality: {}
 * }
 *
 * Supported platforms:
 *   - x
 *   - reddit
 *   - telegram
 *
 * ============================================================================
 */

const { FlowProducer } = require("bullmq");

const {
  upstashRedis,
  localSharedRedis,
} = require("./config");

// ============================================================================
// Configuration
// ============================================================================

const flowProducer = new FlowProducer({
  connection: localSharedRedis,
});

const CONFIG = Object.freeze({
  streamKey: "scrape:events",

  consumerGroup: "data_ingestion_group",

  consumerName: "worker_1",

  schemaVersion: "1.0.0",

  // Poll Redis every 60 seconds.
  pollIntervalMs: 60_000,

  // Maximum number of messages fetched per read.
  batchLimit: 5,

  supportedPlatforms: [
    "x",
    "reddit",
    "telegram",
  ],
});

// ============================================================================
// Logging Helpers
// ============================================================================

function logInfo(message) {
  console.log(`[Producer] ${message}`);
}

function logSuccess(message) {
  console.log(`[Producer] ${message}`);
}

function logWarning(message) {
  console.warn(`[Producer] ${message}`);
}

function logError(message) {
  console.error(`[Producer] ${message}`);
}

// ============================================================================
// Redis Consumer Group Initialization
// ============================================================================

/**
 * Create the Redis Stream consumer group if it does not already exist.
 *
 * We start the group at `0`, not `$`.
 *
 * `0` ensures that messages already present in the stream when the group
 * is created are eligible for consumption.
 *
 * Once the group exists, new messages are consumed using `>`.
 */
async function initConsumerGroup() {
  try {
    await upstashRedis.xgroup(
      "CREATE",
      CONFIG.streamKey,
      CONFIG.consumerGroup,
      "0",
      "MKSTREAM"
    );

    logSuccess(
      `Consumer group '${CONFIG.consumerGroup}' initialized.`
    );
  } catch (error) {
    /*
     * BUSYGROUP means the group already exists.
     *
     * This is expected during normal restarts.
     */
    if (
      String(error.message).includes("BUSYGROUP")
    ) {
      logInfo(
        `Consumer group '${CONFIG.consumerGroup}' already exists.`
      );

      return;
    }

    throw error;
  }
}

// ============================================================================
// Redis Stream Field Parsing
// ============================================================================

/**
 * Redis/ioredis returns stream fields as:
 *
 * [
 *   "data",
 *   "{...}"
 * ]
 *
 * Convert the alternating array into:
 *
 * {
 *   data: "{...}"
 * }
 */
function fieldsToObject(fieldsAndValues) {
  const fields = {};

  if (!Array.isArray(fieldsAndValues)) {
    return fields;
  }

  for (
    let index = 0;
    index < fieldsAndValues.length;
    index += 2
  ) {
    const key = fieldsAndValues[index];
    const value = fieldsAndValues[index + 1];

    if (key !== undefined) {
      fields[key] = value;
    }
  }

  return fields;
}

// ============================================================================
// Canonical Payload Parsing
// ============================================================================

/**
 * Parse the complete canonical JSON stored in the Redis `data` field.
 *
 * Redis representation:
 *
 *   data = "<complete canonical JSON>"
 *
 * NOT:
 *
 *   schemaVersion = ...
 *   collection = ...
 *   events = ...
 *
 * Those fields exist INSIDE `data`.
 */
function parseCanonicalPayload(
  entryId,
  fieldsAndValues
) {
  const fields =
    fieldsToObject(fieldsAndValues);

  const rawData = fields.data;

  if (!rawData) {
    throw new Error(
      `Redis entry ${entryId} is missing the required 'data' field.`
    );
  }

  let canonical;

  try {
    canonical = JSON.parse(rawData);
  } catch (error) {
    throw new Error(
      `Redis entry ${entryId} contains invalid JSON: ${error.message}`
    );
  }

  if (
    !canonical ||
    typeof canonical !== "object" ||
    Array.isArray(canonical)
  ) {
    throw new Error(
      `Redis entry ${entryId} does not contain a canonical object.`
    );
  }

  return canonical;
}

// ============================================================================
// Canonical Collection Validation
// ============================================================================

/**
 * Validate the canonical collection at the ingestion boundary.
 *
 * The scraper/daemon already validates the canonical schema upstream.
 * This second validation prevents malformed Redis messages from entering
 * BullMQ.
 */
function validateCanonicalCollection(
  canonical,
  entryId
) {
  // --------------------------------------------------------------------------
  // Schema
  // --------------------------------------------------------------------------

  if (
    canonical.schemaVersion !==
    CONFIG.schemaVersion
  ) {
    throw new Error(
      `Unsupported schemaVersion '${canonical.schemaVersion}'. ` +
      `Expected '${CONFIG.schemaVersion}'.`
    );
  }

  // --------------------------------------------------------------------------
  // Collection
  // --------------------------------------------------------------------------

  if (
    !canonical.collection ||
    typeof canonical.collection !== "object" ||
    Array.isArray(canonical.collection)
  ) {
    throw new Error(
      `Redis entry ${entryId} has no valid collection object.`
    );
  }

  if (!canonical.collection.collectionId) {
    throw new Error(
      `Redis entry ${entryId} is missing collection.collectionId.`
    );
  }

  // --------------------------------------------------------------------------
  // Trend
  // --------------------------------------------------------------------------

  if (
    !canonical.trend ||
    typeof canonical.trend !== "object" ||
    Array.isArray(canonical.trend)
  ) {
    throw new Error(
      `Redis entry ${entryId} has no valid trend object.`
    );
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  if (!Array.isArray(canonical.events)) {
    throw new Error(
      `Redis entry ${entryId} has invalid events; expected an array.`
    );
  }

  // --------------------------------------------------------------------------
  // Event Identity
  // --------------------------------------------------------------------------

  const eventIds = new Set();

  for (const event of canonical.events) {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event)
    ) {
      throw new Error(
        `Redis entry ${entryId} contains an invalid event object.`
      );
    }

    if (!event.eventId) {
      throw new Error(
        `Redis entry ${entryId} contains an event without eventId.`
      );
    }

    if (!event.platform) {
      throw new Error(
        `Event '${event.eventId}' is missing platform.`
      );
    }

    if (
      !CONFIG.supportedPlatforms.includes(
        event.platform
      )
    ) {
      throw new Error(
        `Event '${event.eventId}' has unsupported platform '${event.platform}'.`
      );
    }

    if (!event.platformPostId) {
      throw new Error(
        `Event '${event.eventId}' is missing platformPostId.`
      );
    }

    if (eventIds.has(event.eventId)) {
      throw new Error(
        `Duplicate eventId '${event.eventId}' found in collection.`
      );
    }

    eventIds.add(event.eventId);
  }

  // --------------------------------------------------------------------------
  // Quality Accounting
  // --------------------------------------------------------------------------

  if (
    canonical.quality &&
    canonical.quality.recordsCollected !== undefined
  ) {
    if (
      canonical.quality.recordsCollected !==
      canonical.events.length
    ) {
      throw new Error(
        `quality.recordsCollected=${canonical.quality.recordsCollected} ` +
        `does not match events.length=${canonical.events.length}.`
      );
    }
  }

  return true;
}

// ============================================================================
// Prepare One Stream Entry
// ============================================================================

/**
 * Parse and validate one Redis Stream entry.
 *
 * No ACK happens here.
 *
 * This function only prepares the data that will be sent to BullMQ.
 */
function prepareMessage(
  entryId,
  fieldsAndValues
) {
  const canonical =
    parseCanonicalPayload(
      entryId,
      fieldsAndValues
    );

  validateCanonicalCollection(
    canonical,
    entryId
  );

  const collection =
    canonical.collection;

  const trend =
    canonical.trend;

  const trendLabel =
    trend.label ??
    trend.query ??
    null;

  const eventIds =
    canonical.events.map(
      (event) => event.eventId
    );

  /*
   * Preserve the complete canonical collection.
   *
   * Nothing is flattened into the old legacy structure.
   */
  const canonicalData = {
    schemaVersion:
      canonical.schemaVersion,

    collection:
      canonical.collection,

    trend:
      canonical.trend,

    platforms:
      canonical.platforms ?? {},

    events:
      canonical.events,

    authorProfiles:
      canonical.authorProfiles ?? [],

    communities:
      canonical.communities ?? [],

    quality:
      canonical.quality ?? {},
  };

  return {
    // Redis Stream entry ID.
    streamEntryId: entryId,

    // Canonical collection identifier.
    runId:
      collection.collectionId,

    // Human-readable trend label.
    trend_label:
      trendLabel,

    // Event IDs for parent-job metadata.
    eventIds,

    // Number of canonical events.
    eventCount:
      canonical.events.length,

    // Schema version.
    schemaVersion:
      canonical.schemaVersion,

    // Complete canonical collection.
    data:
      canonicalData,
  };
}

// ============================================================================
// Redis Stream Reads
// ============================================================================

/**
 * Read new messages that have not previously been delivered to a consumer
 * in this group.
 */
async function fetchNewMessages(
  limit
) {
  const response =
    await upstashRedis.xreadgroup(
      "GROUP",
      CONFIG.consumerGroup,
      CONFIG.consumerName,
      "COUNT",
      limit,
      "STREAMS",
      CONFIG.streamKey,
      ">"
    );

  if (
    !response ||
    response.length === 0
  ) {
    return [];
  }

  return response[0]?.[1] ?? [];
}

// ============================================================================
// Prepare a Batch
// ============================================================================

/**
 * Convert raw Redis entries into validated ingestion records.
 *
 * Failed entries are NOT ACKed.
 *
 * They remain pending for recovery/investigation.
 */
function prepareMessages(
  messages
) {
  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    return {
      prepared: [],
      failed: [],
    };
  }

  const prepared = [];
  const failed = [];

  for (const entry of messages) {
    const [
      entryId,
      fieldsAndValues,
    ] = entry;

    try {
      const preparedMessage =
        prepareMessage(
          entryId,
          fieldsAndValues
        );

      prepared.push(
        preparedMessage
      );

      logSuccess(
        `[PARSED] ${entryId} | ` +
        `Run=${preparedMessage.runId} | ` +
        `Trend=${preparedMessage.trend_label ?? "unknown"} | ` +
        `Events=${preparedMessage.eventCount}`
      );
    } catch (error) {
      /*
       * Do not ACK malformed messages.
       *
       * A future DLQ/quarantine mechanism can handle permanent poison
       * messages.
       */
      logError(
        `[PARSE FAILED] ${entryId} | ${error.message}`
      );

      failed.push({
        entryId,
        error,
      });
    }
  }

  return {
    prepared,
    failed,
  };
}

// ============================================================================
// BullMQ Flow Construction
// ============================================================================

/**
 * Build one BullMQ Flow for one canonical collection.
 *
 * Flow:
 *
 *                    merge-and-save
 *                          │
 *          ┌───────────────┼───────────────┐
 *          │               │               │
 *          ▼               ▼               ▼
 *      sentiment      demographic        trend
 *                                          │
 *                                          ▼
 *                                       network
 *
 * The DatabaseQueue parent becomes available after all child jobs finish.
 */
function buildFlowTree(record) {
  const {
    runId,
    trend_label,
    eventIds,
    schemaVersion,
    data,
  } = record;

  return {
    // ------------------------------------------------------------------------
    // Parent
    // ------------------------------------------------------------------------

    name: "merge-and-save",

    queueName: "DatabaseQueue",

    data: {
      schemaVersion,

      trend_label,

      runId,

      eventIds,

      /*
       * IMPORTANT:
       *
       * Pass the complete canonical collection to the parent.
       *
       * The Database worker can therefore preserve canonical_events while
       * combining the derived analytics from the child workers.
       */
      canonical: data,
    },

    opts: {
      removeOnComplete: true,
      removeOnFail: false,
    },

    // ------------------------------------------------------------------------
    // Children
    // ------------------------------------------------------------------------

    children: [
      {
        name: "sentiment",

        queueName: "SentimentQueue",

        /*
         * Complete canonical collection.
         */
        data,

        opts: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },

      {
        name: "demographic",

        queueName: "DemographicQueue",

        /*
         * Complete canonical collection.
         */
        data,

        opts: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },

      {
        name: "trend",

        queueName: "TrendQueue",

        /*
         * Complete canonical collection.
         */
        data,

        opts: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },

      {
        name: "network",

        queueName: "NetworkQueue",

        /*
         * Complete canonical collection.
         */
        data,

        opts: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    ],
  };
}

// ============================================================================
// Redis ACK
// ============================================================================

/**
 * ACK messages ONLY after BullMQ has successfully accepted the flows.
 *
 * Critical reliability boundary:
 *
 *   Redis
 *      ↓
 *   Parse
 *      ↓
 *   Validate
 *      ↓
 *   BullMQ addBulk()
 *      ↓
 *   SUCCESS
 *      ↓
 *   XACK
 *
 * If BullMQ fails:
 *
 *   Redis message remains pending.
 */
async function acknowledgeMessages(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    return;
  }

  try {
    const ackedCount = await upstashRedis.xack(
      CONFIG.streamKey,
      CONFIG.consumerGroup,
      ...entryIds
    );

    logSuccess(
      `[ACK] Acknowledged ${ackedCount}/${entryIds.length} entries.`
    );
  } catch (error) {
    logWarning(
      `[ACK FAILED] ${error.message}`
    );
  }
}

async function deleteMessages(entryIds) {
  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    return;
  }

  try {
    const deletedCount = await upstashRedis.xdel(
      CONFIG.streamKey,
      ...entryIds
    );

    logSuccess(
      `[XDEL] Removed ${deletedCount}/${entryIds.length} entries from stream.`
    );
  } catch (error) {
    logWarning(
      `[XDEL FAILED] ${error.message}`
    );
  }
}

async function reclaimStalePending(minIdleMs = 5 * 60_000) {
  try {
    const [nextCursor, claimedEntries] = await upstashRedis.xautoclaim(
      CONFIG.streamKey,
      CONFIG.consumerGroup,
      CONFIG.consumerName,
      minIdleMs,
      "0",
      "COUNT",
      10
    );

    if (claimedEntries.length > 0) {
      logWarning(
        `[RECLAIMED] ${claimedEntries.length} stale pending entrie(s) reassigned to this consumer.`
      );
    }

    return claimedEntries;
  } catch (error) {
    logWarning(`[RECLAIM FAILED] ${error.message}`);
    return [];
  }
}

// ============================================================================
// Fetch + Prepare
// ============================================================================

async function fetchBulkStreamData(
  batchLimit = CONFIG.batchLimit
) {
  const allPrepared = [];

  // --------------------------------------------------------------------------
  // New messages
  // --------------------------------------------------------------------------

  const newMessages =
    await fetchNewMessages(
      batchLimit
    );

  if (newMessages.length > 0) {
    logInfo(
      `Received ${newMessages.length} new message(s).`
    );
  }

  const newResult = prepareMessages(newMessages);

  allPrepared.push(...newResult.prepared);

  if (newResult.failed.length > 0) {
    logWarning(
      `${newResult.failed.length} message(s) failed validation and remain pending in the stream.`
    );
  }

  return allPrepared;
}

// ============================================================================
// Orchestration
// ============================================================================

/**
 * Execute one ingestion cycle.
 */
async function orchestrateData() {
  try {
    console.log(
      "\n------------------------------------------------------------"
    );

    logInfo(
      "Polling Redis Stream for canonical collections..."
    );

    await reclaimStalePending();

    const records = await fetchBulkStreamData(CONFIG.batchLimit);
    console.table(
      records.map((r) => ({
        runId: r.runId,
        trend: r.trend_label,
        events: r.eventCount,
      }))
    );

    if (records.length === 0) {
      logInfo(
        "No messages available."
      );

      return;
    }

    // ------------------------------------------------------------------------
    // Build BullMQ flows
    // ------------------------------------------------------------------------

    const flowTrees =
      records.map(
        buildFlowTree
      );

    logInfo(
      `Dispatching ${flowTrees.length} collection flow(s) to BullMQ...`
    );

    // ------------------------------------------------------------------------
    // CRITICAL BOUNDARY
    // ------------------------------------------------------------------------
    //
    // Do NOT ACK Redis messages before this succeeds.
    //
    // If addBulk() throws:
    //
    //     Redis messages remain pending.
    //
    // If addBulk() succeeds:
    //
    //     Redis messages can safely be acknowledged.
    // ------------------------------------------------------------------------

    await flowProducer.addBulk(
      flowTrees
    );

    logSuccess(
      `BullMQ accepted ${flowTrees.length} flow(s).`
    );

    // ------------------------------------------------------------------------
    // ACK Redis messages
    // ------------------------------------------------------------------------

    const entryIds =
      records.map(
        (record) =>
          record.streamEntryId
      );

    await acknowledgeMessages(
      entryIds
    );
    // await deleteMessages(
    //   entryIds
    // );

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------

    const totalEvents =
      records.reduce(
        (total, record) =>
          total + record.eventCount,
        0
      );

    logInfo(
      `Ingestion complete | ` +
      `Collections=${records.length} | ` +
      `Events=${totalEvents} | ` +
      `BullMQ Flows=${flowTrees.length}`
    );

    console.log(
      "------------------------------------------------------------"
    );
  } catch (error) {
    /*
     * IMPORTANT:
     *
     * There is deliberately NO XACK here.
     *
     * If BullMQ failed, Redis messages remain pending and can be retried.
     */
    logError(
      `Orchestration failed: ${error.message}`
    );
  }
}

// ============================================================================
// Startup
// ============================================================================

let pollingInterval = null;

async function start() {
  try {
    logInfo(
      "Data Ingestion Producer starting..."
    );

    // ------------------------------------------------------------------------
    // Verify Redis connectivity
    // ------------------------------------------------------------------------

    await upstashRedis.ping();

    logSuccess(
      "Upstash Redis connection verified."
    );

    // ------------------------------------------------------------------------
    // Initialize consumer group
    // ------------------------------------------------------------------------

    await initConsumerGroup();

    // ------------------------------------------------------------------------
    // Initial ingestion cycle
    // ------------------------------------------------------------------------

    await orchestrateData();

    // ------------------------------------------------------------------------
    // Continuous polling
    // ------------------------------------------------------------------------

    pollingInterval =
      setInterval(
        orchestrateData,
        CONFIG.pollIntervalMs
      );

    logSuccess(
      `Producer running. Poll interval=${CONFIG.pollIntervalMs / 1000}s`
    );
  } catch (error) {
    logError(
      `Failed to start data ingestion: ${error.message}`
    );

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
    `\nReceived ${signal}. Shutting down Producer...`
  );

  if (pollingInterval) {
    clearInterval(
      pollingInterval
    );

    pollingInterval = null;
  }

  try {
    await flowProducer.close();

    logSuccess(
      "BullMQ FlowProducer closed."
    );
  } catch (error) {
    logError(
      `Failed to close FlowProducer: ${error.message}`
    );
  }

  /*
   * Do not close upstashRedis here unless this process owns the Redis
   * connection and the config exposes a supported close/disconnect method.
   */

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
// Start Producer
// ============================================================================

start();
