const Redis = require("ioredis");
require("dotenv").config();
// const { Client } = require('pg');

// ==========================================
// 1. UPSTASH REDIS CONNECTION
// ==========================================
// We use ioredis because BullMQ requires it.
// CRITICAL: 'maxRetriesPerRequest' MUST be set to null.
// If you leave this out, BullMQ workers will crash because they
// need to keep a continuous, unbroken connection open to listen for jobs.

const createRedisConnection = () => {
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    keepAlive: 10000,
    tls: {
      rejectUnauthorized: false,
    },
  });

  // CRITICAL FIX: Catch the error event so it doesn't crash the console
  client.on("error", (err) => {
    // We mute ECONNRESET because BullMQ auto-reconnects anyway.
    // We only log if it's a real, different error.
    if (err.code !== "ECONNRESET") {
      console.error("Redis Background Error:", err.message);
    }
  });

  return client;
};

// ==========================================
// 2. POSTGRESQL CONNECTION
// ==========================================
// Set up the client with your database credentials.
// const pgClient = new Client("postgres://user:password@localhost:5432/your_database");

// Connect once when the app starts.
// pgClient.connect()
// .then(() => console.log("✅ Connected to PostgreSQL"))
// .catch(err => console.error("❌ PostgreSQL Connection Error:", err));

// Export these so the rest of your app can share the exact same connections.
// module.exports = { redis, pgClient };

const redis = createRedisConnection();

redis.on("error", (err) => {
  console.error("Shared Redis Connection Error:", err.message);
});

module.exports = {
  createRedisConnection,
  redis,
};
