require("dotenv").config();

const Redis = require("ioredis");
const { Client } = require("pg");

// ============================================================================
// ENV VALIDATION
// ============================================================================

const REQUIRED_ENV = [
  "UPSTASH_REDIS_URL",
  "LOCAL_REDIS_URL",
  "DATABASE_URL",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}


// ============================================================================
// REDIS CONFIG
// ============================================================================

const redisBaseOptions = {
  maxRetriesPerRequest: 3,

  retryStrategy(times) {
    const delay = Math.min(
      1000 * Math.pow(2, times - 1),
      10_000
    );

    console.warn(
      `Redis reconnect attempt ${times} in ${delay}ms`
    );

    return delay;
  },

  reconnectOnError(err) {
    /*
     * Redis READONLY errors can occur during failover.
     * Reconnect rather than leaving the connection stuck.
     */
    if (
      err?.message?.includes("READONLY")
    ) {
      return true;
    }

    return false;
  },

  enableReadyCheck: true,

  connectTimeout: 10_000,

  lazyConnect: false,
};


// ============================================================================
// UPSTASH REDIS
// ============================================================================
//
// Purpose:
//   Scraper / daemon → Redis Stream
//
// This connection is NOT used by BullMQ.
//
// ============================================================================

const upstashRedis = new Redis(
  process.env.UPSTASH_REDIS_URL,
  {
    ...redisBaseOptions,

    /*
     * Upstash requires TLS.
     */
    tls: {
      rejectUnauthorized: false,
    },

    /*
     * This connection is used for Redis Streams rather than BullMQ.
     */
    maxRetriesPerRequest: 3,
  }
);

upstashRedis.on("connect", () => {
  console.log("🔌 Upstash Redis connecting...");
});

upstashRedis.on("ready", () => {
  console.log("✅ Upstash Redis ready");
});

upstashRedis.on("close", () => {
  console.warn("⚠️ Upstash Redis connection closed");
});

upstashRedis.on("reconnecting", (delay) => {
  console.warn(
    `🔄 Upstash Redis reconnecting in ${delay}ms`
  );
});

upstashRedis.on("error", (err) => {
  /*
   * ECONNRESET can happen during normal reconnect cycles.
   */
  if (err?.code !== "ECONNRESET") {
    console.error(
      "❌ Upstash Redis error:",
      err.message
    );
  }
});


// ============================================================================
// LOCAL REDIS / BULLMQ
// ============================================================================
//
// Purpose:
//   BullMQ queues + workers
//
// IMPORTANT:
//   BullMQ requires maxRetriesPerRequest: null.
//
// ============================================================================

const createBullMQConnection = () => {
  const redis = new Redis(
    process.env.LOCAL_REDIS_URL,
    {
      ...redisBaseOptions,

      /*
       * REQUIRED by BullMQ.
       */
      maxRetriesPerRequest: null,

      /*
       * BullMQ connections should not give up after a short
       * connection failure.
       */
      enableReadyCheck: true,

      connectTimeout: 10_000,
    }
  );

  redis.on("connect", () => {
    console.log("🔌 Local Redis connecting...");
  });

  redis.on("ready", () => {
    console.log("✅ Local Redis ready");
  });

  redis.on("close", () => {
    console.warn("⚠️ Local Redis connection closed");
  });

  redis.on("reconnecting", (delay) => {
    console.warn(
      `🔄 Local Redis reconnecting in ${delay}ms`
    );
  });

  redis.on("error", (err) => {
    if (err?.code !== "ECONNRESET") {
      console.error(
        "❌ Local Redis error:",
        err.message
      );
    }
  });

  return redis;
};


/*
 * Shared connection for Queue instances.
 *
 * This is okay for normal BullMQ Queue usage.
 *
 * Workers should continue using createBullMQConnection()
 * so each worker has its own Redis connection.
 */
const localSharedRedis =
  createBullMQConnection();


// ============================================================================
// POSTGRESQL
// ============================================================================

const pgClient = new Client({
  connectionString:
    process.env.DATABASE_URL,

  /*
   * Keep the connection from hanging indefinitely.
   */
  connectionTimeoutMillis: 10_000,

  /*
   * TCP keepalive helps detect dead connections.
   */
  keepAlive: true,

  keepAliveInitialDelayMillis: 10_000,
});

pgClient.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

let postgresReady = false;


/**
 * Connect PostgreSQL.
 *
 * Unlike the old implementation, this function is explicit and can be
 * retried by the application.
 */
async function connectPostgres() {
  if (postgresReady) {
    return;
  }

  try {
    await pgClient.connect();

    postgresReady = true;

    console.log(
      "✅ Connected to PostgreSQL"
    );
  } catch (err) {
    postgresReady = false;

    console.error(
      "❌ PostgreSQL connection failed:",
      err.message
    );

    throw err;
  }
}


/**
 * Simple PostgreSQL health check.
 */
async function checkPostgres() {
  if (!postgresReady) {
    return false;
  }

  try {
    await pgClient.query("SELECT 1");

    return true;
  } catch (err) {
    postgresReady = false;

    console.error(
      "❌ PostgreSQL health check failed:",
      err.message
    );

    return false;
  }
}


// ============================================================================
// REDIS HEALTH CHECKS
// ============================================================================

async function checkUpstashRedis() {
  try {
    await upstashRedis.ping();

    return true;
  } catch (err) {
    console.error(
      "❌ Upstash Redis health check failed:",
      err.message
    );

    return false;
  }
}


async function checkLocalRedis() {
  try {
    await localSharedRedis.ping();

    return true;
  } catch (err) {
    console.error(
      "❌ Local Redis health check failed:",
      err.message
    );

    return false;
  }
}


// ============================================================================
// SHUTDOWN
// ============================================================================

let shuttingDown = false;


/**
 * Gracefully close all connections.
 *
 * Important because:
 *
 *   - Redis connections otherwise remain alive
 *   - PostgreSQL can leave the process hanging
 *   - Docker/systemd may not terminate cleanly
 */
async function closeConnections() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    "\n🛑 Closing infrastructure connections..."
  );

  const results = await Promise.allSettled([
    upstashRedis.quit(),
    localSharedRedis.quit(),
    pgClient.end(),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(
        "❌ Connection shutdown error:",
        result.reason?.message ||
        result.reason
      );
    }
  }

  postgresReady = false;

  console.log(
    "✅ Infrastructure connections closed"
  );
}


// ============================================================================
// PROCESS SIGNALS
// ============================================================================

process.once(
  "SIGINT",
  async () => {
    await closeConnections();
    process.exit(0);
  }
);

process.once(
  "SIGTERM",
  async () => {
    await closeConnections();
    process.exit(0);
  }
);


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Redis
  upstashRedis,
  createBullMQConnection,
  localSharedRedis,

  // PostgreSQL
  pgClient,
  connectPostgres,
  checkPostgres,

  // Health checks
  checkUpstashRedis,
  checkLocalRedis,

  // Shutdown
  closeConnections,
};
