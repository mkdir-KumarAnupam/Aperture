const { redis } = require("./config");
const {
  SentimentQueue,
  DemographicQueue,
  TrendQueue,
  NetworkQueue,
} = require("./queues");
const { normalizeData } = require("./normalizeData");
require("dotenv").config();

const INTERVAL_MS = 60000; // Run every 60 seconds

/**
 * Fetches a batch of data from the Redis Stream and deletes the processed items.
 * @param {number} batchLimit - Maximum number of stream entries to fetch at once.
 */
async function fetchBulkStreamData(batchLimit = 10) {
  // 1. EXTRACT: Fetch up to 'batchLimit' entries from the oldest (-) to newest (+)
  const streamEntries = await redis.xrange(
    "scrape:events",
    "-",
    "+",
    "COUNT",
    batchLimit,
  );

  // If the stream is empty, just return an empty array
  if (streamEntries.length === 0) return [];

  const parsedDataArray = [];
  const idsToDelete = [];

  // 2. TRANSFORM: Loop through the raw stream format to extract our JSON
  for (const entry of streamEntries) {
    const entryId = entry[0]; // The unique timestamp ID of the stream entry
    const fieldsAndValues = entry[1]; // Array of keys/values, e.g., ['data', '{...}']

    // Find where the actual JSON string is hiding in the array
    const dataIndex = fieldsAndValues.indexOf("data");

    if (dataIndex !== -1) {
      const rawJsonString = fieldsAndValues[dataIndex + 1];

      try {
        // Safely attempt to parse the JSON string into a JS object
        const data = JSON.parse(rawJsonString);
        let targetTrendLabel = data?.targetTrendLabel || "";

        const tweets = data.tweets?.map(normalizeData) || [];
        const redditPosts = data.reddit_posts?.map(normalizeData) || [];
        parsedDataArray.push({
          trend_label: targetTrendLabel,
          posts: [...tweets, ...redditPosts],
        });

        // Keep track of this ID so we can delete it from the stream later
        idsToDelete.push(entryId);
      } catch (error) {
        console.error(`Failed to parse Stream ID ${entryId}`, error.message);
        // We STILL add broken IDs to the delete list so they don't block the queue forever
        idsToDelete.push(entryId);
      }
    }
  }
  // 3. CLEANUP: Delete the entries we just handled so we don't process them again next minute
  // if (idsToDelete.length > 0) {
  //     await redis.xdel('scrape:events', ...idsToDelete);
  // }

  return parsedDataArray;
}

/**
 * The main loop that connects the extraction to the queues.
 */
async function orchestrateData() {
  try {
    console.log("\n⏳ Checking Upstash Stream for new data...");

    // Grab up to 10 records from the stream
    const bulkData = await fetchBulkStreamData(1);

    if (bulkData.length === 0) {
      return console.log("   No new data. Waiting for next interval...");
    }

    console.log(
      `📦 Fetched ${bulkData.length} records. Dispatching to workers...`,
    );

    // 1. Create a SINGLE array mapping the raw data into BullMQ job objects
    const bulkJobs = bulkData.map((actualData) => ({
      name: "process-data", // Generic name used for all queues
      data: { ...actualData },
    }));

    // 3. Dispatch to Redis using addBulk (Only 4 network calls total!)
    await Promise.all([
      SentimentQueue.addBulk(bulkJobs),
      DemographicQueue.addBulk(bulkJobs),
      TrendQueue.addBulk(bulkJobs),
      NetworkQueue.addBulk(bulkJobs),
    ]);

    console.log(
      `✅ Successfully enqueued ${bulkData.length} records across all queues.`,
    );
  } catch (error) {
    console.error("❌ Orchestration failed:", error);
  }
}

// ==========================================
// START THE PRODUCER LOOP
// ==========================================
console.log(`🚀 Producer online. Polling every ${INTERVAL_MS / 1000} seconds.`);
orchestrateData(); // Run the first batch immediately
setInterval(orchestrateData, INTERVAL_MS); // Schedule it to run continuously
