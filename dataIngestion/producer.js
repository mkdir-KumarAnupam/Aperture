const { FlowProducer } = require("bullmq");
const { upstashRedis, localSharedRedis } = require('./config');
const { normalizeData } = require("./normalizeData"); // Assuming your previous script

const flowProducer = new FlowProducer({ connection: localSharedRedis });

const INTERVAL_MS = 60000;
const BATCH_LIMIT = 1;

async function fetchBulkStreamData(batchLimit = BATCH_LIMIT) {
  const streamEntries = await upstashRedis.xrange('scrape:events', '-', '+', 'COUNT', batchLimit);
  if (streamEntries.length === 0) return [];

  const parsedDataArray = [];
  const idsToDelete = [];

  for (const entry of streamEntries) {
      const [entryId, fieldsAndValues] = entry;
      const dataIndex = fieldsAndValues.indexOf('data');
      
      if (dataIndex !== -1) {
          try {
              const data = JSON.parse(fieldsAndValues[dataIndex + 1]);
              let targetTrendLabel = data?.trend || "Unknown Trend";

              const tweets = data.x_payload?.map(normalizeData) || [];
              const redditPosts = data.reddit_payload?.map(normalizeData) || [];
              const telegramPosts = data.telegram_payload?.map(normalizeData) || [];
              
              parsedDataArray.push({ 
                  trend_label: targetTrendLabel, 
                  posts: [...tweets, ...redditPosts] 
              });

              idsToDelete.push(entryId);
          } catch (error) {
              console.error(`Failed to parse Stream ID ${entryId}:`, error.message);
              idsToDelete.push(entryId); 
          }
      }
  }
  // 3. CLEANUP: Delete the entries we just handled so we don't process them again next minute
  // if (idsToDelete.length > 0) {
  //     await redis.xdel('scrape:events', ...idsToDelete);
  // }

  // Safely delete from Upstash to prevent duplicate processing
  // if (idsToDelete.length > 0) {
  //     await upstashRedis.xdel('scrape:events', ...idsToDelete);
  // }

  return parsedDataArray;
}


async function orchestrateData() {
    try {
        console.log("\n⏳ Polling Upstash for stream data...");
        const bulkData = await fetchBulkStreamData(BATCH_LIMIT);
        
        if (bulkData.length === 0) return console.log("   No new data. Waiting...");

        console.log(`📦 Fetched ${bulkData.length} records. Dispatching Flow Trees locally...`);

        // Build Scatter-Gather trees
        const flowTrees = bulkData.map(actualData => ({
            name: "merge-and-save",
            queueName: "DatabaseQueue",
            data: { trend_label: actualData.trend_label },
            opts: { removeOnComplete: true, removeOnFail: false }, // Keep fails for debugging
            children: [
                { name: "sentiment", queueName: "SentimentQueue", data: actualData, opts: { removeOnComplete: true } },
                { name: "demographic", queueName: "DemographicQueue", data: actualData, opts: { removeOnComplete: true } },
                { name: "trend", queueName: "TrendQueue", data: actualData, opts: { removeOnComplete: true } },
                { name: "network", queueName: "NetworkQueue", data: actualData, opts: { removeOnComplete: true } }
            ]
        }));

        await flowProducer.addBulk(flowTrees);
        console.log(`✅ Enqueued ${bulkData.length} trend flows to local BullMQ.`);

    } catch (error) {
        console.error("❌ Orchestration failed:", error);
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
  try{  await Promise.all([
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

console.log(`🚀 Hybrid Producer online. Polling Upstash every ${INTERVAL_MS / 1000}s.`);
orchestrateData(); 
setInterval(orchestrateData, INTERVAL_MS);
