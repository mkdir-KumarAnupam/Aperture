const { Worker } = require("bullmq");
const { createBullMQConnection, localSharedRedis, pgClient } = require("./config");
const { analyzeTrend } = require("./trendAnalysis");
const { recordTrendStats, enrichWithGlobalRanking } = require("./trendGlobalStats");

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
    // 1. Compute local trend metrics
    const result = analyzeTrend(job.data);

    // 2. Record in global Redis registry & enrich with cross-trend ranking
    await recordTrendStats(localSharedRedis, result);
    const enriched = await enrichWithGlobalRanking(localSharedRedis, result);

    const rank = enriched.globalRanking;
    console.log(`📈 [Trend] ${enriched.name}: score=${enriched.trendScore} tier=${enriched.influence.viralityTier} rank=#${rank.leaderboardPosition}/${rank.totalTrackedTrends} (top ${100 - rank.percentile}%) ${rank.tierMovement}`);

    return enriched;
// the above enriched return the data like given below
//     {
//   category: "trend",
//   id: "india-election-results",
//   name: "India Election Results",
//   trendScore: 72,
//   platformActivity: {
//     twitter: { posts: 45, interactions: 12800, avgEngagement: 0.032 },
//     reddit:  { posts: 12, interactions: 3400,  avgEngagement: 0.008 }
//   },
//   totalMentions: "57",
//   approximateReach: "2.5M",
//   growthPercent: "+82%",
//   peakGrowth: "+126%",
//   peakDate: "Sep 14",
//   fastestPlatform: "twitter",
//   lifecycle: {
//     "24h": [{ date: "Sep 14 03:00", interactions: 350, posts: 12 }, ...],
//     "7d":  [{ date: "Sep 10 12:00", interactions: 800, posts: 28 }, ...],
//     "30d": [{ date: "Aug 20",       interactions: 1200, posts: 45 }, ...]
//   },
//   influence: {
//     avgInfluence: 2.8,
//     viralityTier: "viral",
//     viralityScore: 0.72,
//     topInfluencers: [
//       { authorHandle: "@example", platform: "twitter", influence: 5.2, interactions: 3400, reach: 150000 }
//     ]
//   },
//   posts: [{ postId, platform, authorHandle, text, publishedAt, interactions, ... }],


//   globalRanking: {
//     percentile: 92,                // "better than 92% of all trends"
//     leaderboardPosition: 3,        // #3 out of all tracked trends
//     totalTrackedTrends: 47,        // total trends in Redis registry
//     scoreDelta: 12,                // score change since last analysis (+12)
//     tierMovement: "rising",        // "rising" | "falling" | "stable"
//     scoreHistory: [                // last 10 snapshots (for sparkline)
//       { score: 72, tier: "viral",    timestamp: 1726333574000 },
//       { score: 60, tier: "trending", timestamp: 1726329974000 },
//       ...
//     ]
//   },

//   _windows: { ... },
//   _overall: { ... }
// }

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