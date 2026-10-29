/**
 * ============================================================================
 * TEST: SINGLE-ROW JSONB DUAL-WRITE PERSISTENCE & REDIS TTL VERIFICATION
 * ============================================================================
 *
 * File: test-dual-write.js
 * Directory: dataIngestion/sentiment/JEV/
 *
 * Purpose:
 * --------
 * This verification test validates the integrity, atomicity, and synchronization
 * of the Dual-Write persistence mechanism across PostgreSQL and Redis for trend
 * narratives.
 *
 * Background & Requirements:
 * --------------------------
 * 1. Single-Object Pool: Rather than storing each narrative as a separate row
 *    in the database, all narratives belonging to a given `trend_label` are
 *    consolidated into a single row inside the `trend_narratives` table:
 *      - `trend_label` (TEXT PRIMARY KEY): Unique identifier for the trend.
 *      - `narratives` (JSONB): Array of narrative objects:
 *          [{ "id": UUID, "narrative_text": String, "created_at": ISO8601, "updated_at": ISO8601 }]
 * 2. Atomic Appends: Uses PostgreSQL's native JSONB concatenation (`||`) operator
 *    to append new narratives on conflict, avoiding race conditions under concurrency.
 * 3. 7-Day Redis TTL: The Redis cache key `narrative_pool:${trend_label}` must
 *    be kept in sync with the database and have an active TTL of 7 days (604,800 seconds).
 *
 * Test Flow:
 * ----------
 * 1. Verify that a new, unindexed trend returns an empty pool (`[]`).
 * 2. Persist the first narrative; verify row insertion in PostgreSQL and key creation in Redis.
 * 3. Persist a second narrative under the same trend; verify atomic array append into the same row.
 * 4. Verify that PostgreSQL has exactly 1 row for the trend with 2 items in `narratives`.
 * 5. Verify that Redis TTL matches the 7-day requirement (~604,800s).
 * 6. Clean up temporary test data from both PostgreSQL and Redis.
 *
 * ============================================================================
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Redis from 'ioredis';
import pg from 'pg';
import { getNarrativePool, persistNewNarrative } from '../src/sentimentWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;

// ============================================================================
// INFRASTRUCTURE INITIALIZATION
// ============================================================================

/**
 * Determine the Redis connection target. Prefers Upstash if provided,
 * otherwise defaults to local Redis (Docker container or local daemon).
 */
const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.LOCAL_REDIS_URL || 'redis://127.0.0.1:6379';
const isUpstash = redisUrl.includes('upstash.io');

/**
 * Initialize Redis client with TLS enabled for cloud Upstash endpoints
 * and standard TCP connection for local Docker Redis instances.
 */
const redis = new Redis(redisUrl, isUpstash ? { tls: { rejectUnauthorized: false } } : {});

/**
 * Initialize PostgreSQL connection pool pointing to the active Neon database.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function run() {
  // Generate a distinct timestamped trend label to prevent collisions with existing records
  const testLabel = `test_trend_jsonb_${Date.now()}`;
  console.log(`[Test] Testing single-object JSONB pool for trend_label: "${testLabel}"`);

  // --------------------------------------------------------------------------
  // Step 1: Initial pool fetch (should result in cache miss and empty array)
  // --------------------------------------------------------------------------
  console.log(`[Step 1] Querying initial pool for new trend...`);
  const initial = await getNarrativePool(testLabel, redis, pool);
  console.log(`[Test] Initial pool length: ${initial.pool.length} (expected 0)`);
  if (initial.pool.length !== 0) {
    throw new Error(`Expected initial pool to be empty, got ${initial.pool.length}`);
  }

  // --------------------------------------------------------------------------
  // Step 2: Persist Narrative 1 (Initial row creation in PostgreSQL)
  // --------------------------------------------------------------------------
  console.log(`[Step 2] Persisting narrative 1...`);
  const narrativeText1 = "AI coding agents significantly accelerate prototyping and software delivery.";
  const created1 = await persistNewNarrative(testLabel, narrativeText1, redis, pool);
  console.log(`[Test] Persisted narrative 1 ID: ${created1.id}`);
  if (!created1.id || created1.narrative_text !== narrativeText1) {
    throw new Error(`Narrative 1 creation failed: ${JSON.stringify(created1)}`);
  }

  // --------------------------------------------------------------------------
  // Step 3: Persist Narrative 2 (Verify atomic JSONB append to existing row)
  // --------------------------------------------------------------------------
  console.log(`[Step 3] Persisting narrative 2 to test array append into the same row...`);
  const narrativeText2 = "Developers are shifting focus to architecture review and verification.";
  const created2 = await persistNewNarrative(testLabel, narrativeText2, redis, pool);
  console.log(`[Test] Persisted narrative 2 ID: ${created2.id}`);
  if (!created2.id || created2.narrative_text !== narrativeText2) {
    throw new Error(`Narrative 2 creation failed: ${JSON.stringify(created2)}`);
  }

  // --------------------------------------------------------------------------
  // Step 4: Verify PostgreSQL row integrity
  // --------------------------------------------------------------------------
  console.log(`[Step 4] Verifying PostgreSQL table "trend_narratives"...`);
  const { rows } = await pool.query(
    'SELECT trend_label, narratives FROM trend_narratives WHERE trend_label = $1',
    [testLabel]
  );
  
  console.log(`[Test] PostgreSQL row found: ${rows.length} row (expected exactly 1 row)`);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly 1 row in trend_narratives, found: ${rows.length}`);
  }

  const storedNarratives = rows[0]?.narratives;
  console.log(`[Test] Narratives in single row:`, JSON.stringify(storedNarratives, null, 2));

  if (!Array.isArray(storedNarratives) || storedNarratives.length !== 2) {
    throw new Error(`Expected narratives array of length 2, got: ${JSON.stringify(storedNarratives)}`);
  }

  // --------------------------------------------------------------------------
  // Step 5: Verify Redis Cache & 7-Day TTL (604,800 seconds)
  // --------------------------------------------------------------------------
  console.log(`[Step 5] Verifying Redis cache & TTL...`);
  const cacheKey = `narrative_pool:${testLabel}`;
  const ttl = await redis.ttl(cacheKey);
  console.log(`[Test] Redis key "${cacheKey}" TTL: ${ttl}s (expected ~604800s / 7 days)`);

  // TTL should be positive and within reasonable bounds of 7 days (604,800s)
  if (ttl < 600000 || ttl > 604800) {
    throw new Error(`Redis TTL unexpected: ${ttl}s (expected close to 604800s)`);
  }

  // --------------------------------------------------------------------------
  // Step 6: Cleanup temporary test artifacts
  // --------------------------------------------------------------------------
  console.log(`[Step 6] Cleaning up test records from database and cache...`);
  await pool.query('DELETE FROM trend_narratives WHERE trend_label = $1', [testLabel]);
  await redis.del(cacheKey);
  console.log(`[Test] Cleaned up test record.`);

  // Gracefully close connection pools
  await redis.quit();
  await pool.end();

  console.log(`\n✅ [Test Passed] Single-row JSONB pool test passed successfully!`);
  process.exit(0);
}

// Global error handler
run().catch(err => {
  console.error('\n❌ [Test Failed]:', err);
  process.exit(1);
});
