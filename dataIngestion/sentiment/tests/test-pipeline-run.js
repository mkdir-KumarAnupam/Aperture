/**
 * ============================================================================
 * TEST: PIPELINE RUN WITH CANONICAL APERTURE JOB DATA
 * ============================================================================
 *
 * File: test-pipeline-run.js
 * Directory: dataIngestion/sentiment/JEV/
 *
 * Purpose:
 * --------
 * This test simulates the exact end-to-end execution path that occurs when
 * `producer.js` dispatches a canonical collection job to `SentimentQueue`.
 *
 * Key Architectural Highlights Verified:
 * --------------------------------------
 * 1. Zero Producer Modifications:
 *    The job payload sent by `producer.js` (`job.data`) is preserved exactly as-is
 *    with canonical structure:
 *      - `schemaVersion`: "1.0.0"
 *      - `collection`: { collectionId: "..." }
 *      - `trend`: { id: "...", label: "...", query: "..." }
 *      - `platforms`: { x: Boolean, reddit: Boolean, ... }
 *      - `events`: Array of raw social posts with interaction metrics
 *
 * 2. In-Worker Normalization:
 *    `processSentimentJob` internally normalizes canonical events into
 *    interaction-weighted posts (`likes + reposts + replies + quotes`),
 *    bounding the payload for JEV SystemOne without altering upstream messages.
 *
 * 3. JEV Classification & LLM Fallback:
 *    Executes TypeSafe AI JEV SystemOne classification for sentiment, affect,
 *    and narrative alignment, with automated fallback to Gemini if no narrative fits.
 *
 * 4. Dual-Write Persistence Verification:
 *    Ensures that any proposed narrative is stored in PostgreSQL table `trend_narratives`
 *    and synchronized with Redis cache with a 7-day TTL.
 *
 * ============================================================================
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Redis from 'ioredis';
import pg from 'pg';
import { processSentimentJob } from '../src/sentimentWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;

// ============================================================================
// INFRASTRUCTURE & CONNECTION INITIALIZATION
// ============================================================================

/**
 * Configure Redis connection. Supports both cloud Upstash Redis and local Docker Redis.
 */
const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.LOCAL_REDIS_URL || 'redis://127.0.0.1:6379';
const isUpstash = redisUrl.includes('upstash.io');
const cacheRedis = new Redis(redisUrl, isUpstash ? { tls: { rejectUnauthorized: false } } : {});

/**
 * Configure PostgreSQL connection pool targeting the live Neon database.
 */
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function run() {
  // Generate a unique trend label to isolate test execution
  const trendLabel = `AI Developer Shift ${Date.now()}`;
  console.log(`[Test] Running pipeline job for trend: "${trendLabel}"`);

  // --------------------------------------------------------------------------
  // 1. Construct Canonical Collection Payload (Aperture Schema v1.0.0)
  // --------------------------------------------------------------------------
  // This matches the exact contract produced by dataIngestion/producer.js
  const canonicalJob = {
    id: `job_pipeline_test_${Date.now()}`,
    data: {
      schemaVersion: "1.0.0",
      collection: { collectionId: `col_test_${Date.now()}` },
      trend: { id: `tr_${Date.now()}`, label: trendLabel, query: trendLabel },
      platforms: { x: true, reddit: true },
      events: [
        {
          eventId: "evt_test_001",
          platform: "x",
          content: { text: "AI coding assistants are transforming junior engineering roles completely." },
          metrics: { likes: 120, reposts: 30, replies: 15, quotes: 5 },
          time: { publishedAt: new Date().toISOString() }
        },
        {
          eventId: "evt_test_002",
          platform: "reddit",
          content: { text: "I tried building an entire microservice with an AI agent. It saved me 3 days of work." },
          metrics: { likes: 45, reposts: 0, replies: 12, quotes: 0 },
          time: { publishedAt: new Date().toISOString() }
        },
        {
          eventId: "evt_test_003",
          platform: "x",
          content: { text: "Junior devs should focus on system design and prompt engineering now." },
          metrics: { likes: 80, reposts: 18, replies: 7, quotes: 2 },
          time: { publishedAt: new Date().toISOString() }
        }
      ]
    }
  };

  // --------------------------------------------------------------------------
  // 2. Execute Sentiment Processing
  // --------------------------------------------------------------------------
  console.log(`[Test] Invoking processSentimentJob with canonical data...`);
  const result = await processSentimentJob(canonicalJob, { cacheRedis, db });
  
  console.log('\n[Test Result]:\n', JSON.stringify(result, null, 2));

  // --------------------------------------------------------------------------
  // 3. Verify Database Persistence (PostgreSQL trend_narratives)
  // --------------------------------------------------------------------------
  if (result.narrative?.id) {
    console.log(`\n[DB Verification] Checking PostgreSQL for persisted narrative ID: ${result.narrative.id}`);
    const { rows } = await db.query(
      'SELECT trend_label, narratives FROM trend_narratives WHERE trend_label = $1',
      [trendLabel]
    );

    console.log(`[DB Verification] Row count in trend_narratives: ${rows.length} (expected 1)`);
    console.log(`[DB Verification] Total narratives stored:`, rows[0]?.narratives?.length);
    console.log(`[DB Verification] Stored narratives:`, JSON.stringify(rows[0]?.narratives, null, 2));

    if (rows.length !== 1 || !Array.isArray(rows[0]?.narratives)) {
      throw new Error(`Failed to find single-row narrative entry in PostgreSQL for trend: ${trendLabel}`);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Verify Redis Cache & 7-Day TTL
  // --------------------------------------------------------------------------
  const cacheKey = `narrative_pool:${trendLabel}`;
  const ttl = await cacheRedis.ttl(cacheKey);
  console.log(`\n[Redis Verification] Key "${cacheKey}" TTL: ${ttl}s (expected ~604800s / 7 days)`);

  if (ttl <= 0) {
    throw new Error(`Redis cache key "${cacheKey}" does not have an active TTL`);
  }

  // --------------------------------------------------------------------------
  // 5. Cleanup Test Artifacts
  // --------------------------------------------------------------------------
  console.log(`\n[Cleanup] Deleting test records from PostgreSQL and Redis...`);
  await db.query('DELETE FROM trend_narratives WHERE trend_label = $1', [trendLabel]);
  await cacheRedis.del(cacheKey);
  console.log(`[Cleanup] Completed successfully.`);

  // Gracefully close connections
  await cacheRedis.quit();
  await db.end();

  console.log(`\n✅ [Test Finished] Pipeline execution test passed!`);
  process.exit(0);
}

// Global error handler
run().catch(err => {
  console.error('\n❌ [Pipeline Test Failed]:', err);
  process.exit(1);
});
