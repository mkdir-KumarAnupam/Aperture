const { Queue } = require("bullmq");
const { localSharedRedis } = require("./config");

const queueOptions = {
  connection: localSharedRedis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
};

const SentimentQueue = new Queue(
  "SentimentQueue",
  queueOptions
);

const DemographicQueue = new Queue(
  "DemographicQueue",
  queueOptions
);

const TrendQueue = new Queue(
  "TrendQueue",
  queueOptions
);

const NetworkQueue = new Queue(
  "NetworkQueue",
  queueOptions
);

const DatabaseQueue = new Queue(
  "DatabaseQueue",
  queueOptions
);

module.exports = {
  SentimentQueue,
  DemographicQueue,
  TrendQueue,
  NetworkQueue,
  DatabaseQueue,
};
