const { Queue } = require('bullmq');
const { redis } = require('./config');

// ==========================================
// QUEUE INITIALIZATION
// ==========================================
// We create 4 separate queues for our 4 distinct processing tasks.
// We pass in the shared 'redis' connection from config.js.
const SentimentQueue = new Queue('SentimentQueue', { connection: redis });
const DemographicQueue = new Queue('DemographicQueue', { connection: redis });
const TrendQueue = new Queue('TrendQueue', { connection: redis });
const NetworkQueue = new Queue('NetworkQueue', { connection: redis });

module.exports = { 
    SentimentQueue, 
    DemographicQueue, 
    TrendQueue, 
    NetworkQueue 
};