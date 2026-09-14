require("dotenv").config();
const Redis = require("ioredis");
const { Client } = require("pg");

// 1. UPSTASH (Cloud) - Strictly for stream ingestion
const upstashRedis = new Redis(process.env.UPSTASH_REDIS_URL, {
  tls: { rejectUnauthorized: false },
});

upstashRedis.on("error", (err) => {
  if (err.code !== "ECONNRESET")
    console.error("Upstash Background Error:", err.message);
});

// 2. BULLMQ (Local) - For job processing
const createBullMQConnection = () => {
  return new Redis(process.env.LOCAL_REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
  });
};
const localSharedRedis = createBullMQConnection();

// 3. POSTGRESQL
const pgClient = new Client(process.env.DATABASE_URL);
pgClient
  .connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ PostgreSQL Error:", err));

module.exports = {
  upstashRedis,
  createBullMQConnection,
  localSharedRedis,
  pgClient,
};
