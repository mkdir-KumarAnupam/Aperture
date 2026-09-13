const { Worker } = require('bullmq');
// const { redis, pgClient } = require('./config');
const { createRedisConnection } = require("./config");

// Helper function to simulate a heavy processing task (like calling an AI model)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log("👷 Workers are online and listening...");

// ==========================================
// WORKER 1: SENTIMENT ANALYSIS
// ==========================================
const sentimentWorker = new Worker('SentimentQueue', async (job) => {
    const data = job.data;
    console.log(`[Sentiment] Processing ${data.targetTrendLabel}...`);
    
    // Simulate 2 seconds of heavy processing
    // -> Ashutosh code will go here of sentiment analysis
    await delay(1000); 

    // Insert the data into PostgreSQL
    // We use $1 and $2 to strictly prevent SQL injection attacks
    // const query = `INSERT INTO sentiments (trend_label, raw_data) VALUES ($1, $2)`;
    // await pgClient.query(query, [data.targetTrendLabel, JSON.stringify(data)]);

    console.log("Sentiment worker completed his work ...");
    console.log(data);
    
    // Returning an object tells BullMQ the job was successfully completed
    return { status: 'success' };
}, { connection: createRedisConnection() });

// ==========================================
// WORKER 2: DEMOGRAPHIC ANALYSIS
// ==========================================
const demographicWorker = new Worker('DemographicQueue', async (job) => {
    const data = job.data;
    console.log(`[Demographic] Processing ${data.targetTrendLabel}...`);
    
    await delay(1000); 
    //-> Ashutosh code of the demographic worker analysis will go here.
    
    // const query = `INSERT INTO demographics (trend_label, raw_data) VALUES ($1, $2)`;
    // await pgClient.query(query, [data.targetTrendLabel, JSON.stringify(data)]);
    console.log("Demographic worker completed his work ...");
    console.log(data);
    
    return { status: 'success' };
}, { connection: createRedisConnection() });