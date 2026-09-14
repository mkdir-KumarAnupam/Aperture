const { Worker } = require("bullmq");
const { createBullMQConnection, pgClient } = require("./config");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const workerOpts = { 
    connection: createBullMQConnection(),
    concurrency: 5 // Allows each worker to process 5 jobs at exactly the same time
};

console.log("👷 Local Workers are online and listening...");

// ==========================================
// 1. CHILD WORKERS (The "Scatter")
// ==========================================
const sentimentWorker = new Worker("SentimentQueue", async (job) => {
    await delay(1000); 
    // -> Ashutosh code will go here and he will return the data here

    const data = job.data;
    console.log(job.data);

    return { category: "sentiment", result: "positive", score: 0.95 }; 
}, workerOpts);

const demographicWorker = new Worker("DemographicQueue", async (job) => {
    await delay(1000); 
    // -> Ashutosh code will go here and he will return the data here

    return { category: "demographic", topAge: "18-24", topRegion: "India" };
}, workerOpts);

const trendWorker = new Worker("TrendQueue", async (job) => {
    await delay(1000); 
    // -> Ashutosh code will go here and he will return the data here

    return { category: "trend", velocity: 4.5, isViral: true };
}, workerOpts);

const networkWorker = new Worker("NetworkQueue", async (job) => {
    await delay(1000);
    // -> Ashutosh code will go here and he will return the data here

    return { category: "network", keyInfluencers: 3 };
}, workerOpts);

// ==========================================
// 2. PARENT WORKER (The "Gather")
// ==========================================
const databaseWorker = new Worker("DatabaseQueue", async (job) => {
    const trendLabel = job.data.trend_label;
    console.log(`\n💾 [Database] Gathering results for ${trendLabel}...`);

    // A. Fetch returned objects from the 4 child workers
    const childResults = await job.getChildrenValues();
    const rawValues = Object.values(childResults);

    // B. Rebuild dict & remove 'category' key cleanly
    const structuredAnalytics = {};
    for (const data of rawValues) {
        const { category, ...cleanData } = data;
        structuredAnalytics[category] = cleanData;
    }

    console.table(structuredAnalytics);

    // C. Save to PostgreSQL
    // Final DB shape: trend_label (Text) | combined_data (JSONB)
    // const query = `INSERT INTO trend_analytics (trend_label, combined_data) VALUES ($1, $2)`;
    // await pgClient.query(query, [trendLabel, JSON.stringify(structuredAnalytics)]);

    console.log(`✅ [Database] Successfully saved all analytics for ${trendLabel}!\n`);
    console.log()
    return { status: "success" };

}, workerOpts);


// ==========================================
// 3. ERROR LOGGING
// ==========================================
const workers = [sentimentWorker, demographicWorker, trendWorker, networkWorker, databaseWorker];

workers.forEach((worker) => {
    worker.on("failed", (job, err) => {
        console.error(`❌ [${worker.name}] Failed job ${job?.id}:`, err.message);
    });
});