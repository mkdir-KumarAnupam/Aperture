const { Queue } = require('bullmq');
const { localSharedRedis } = require('./config');

const defaultOpts = { connection: localSharedRedis };

module.exports = { 
    SentimentQueue: new Queue('SentimentQueue', defaultOpts), 
    DemographicQueue: new Queue('DemographicQueue', defaultOpts), 
    TrendQueue: new Queue('TrendQueue', defaultOpts), 
    NetworkQueue: new Queue('NetworkQueue', defaultOpts), 
    DatabaseQueue: new Queue('DatabaseQueue', defaultOpts) // Parent Gatherer
};