const pg = require("pg");
const dotenv = require("dotenv");
const path = require("node:path");

const { Pool } = pg;

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
  override: true,
});

if (!process.env.DATABASE_URL) {
  throw new Error("[Database] DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  max: Number(process.env.DB_POOL_MAX ?? 10),

  idleTimeoutMillis: Number(
    process.env.DB_IDLE_TIMEOUT_MS ?? 30_000
  ),

  connectionTimeoutMillis: Number(
    process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000
  ),
});

pool.on("error", (error) => {
  console.error(
    "[Database] Unexpected PostgreSQL pool error:",
    error
  );
});

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  closeDatabase,
};
