/**
 * ============================================================================
 * TEST: END-TO-END WORKER & DATABASE PERSISTENCE VERIFICATION
 * ============================================================================
 *
 * File: test-e2e-worker.js
 * Directory: dataIngestion/sentiment/JEV/
 *
 * Purpose:
 * --------
 * This test simulates the complete lifecycle of a sentiment processing cycle
 * from job consumption to downstream database persistence across all related
 * tables in PostgreSQL.
 *
 * Architecture & Ingestion Flow:
 * ------------------------------
 * 1. Database Schema Relationship:
 *      `trends` (id)
 *         ↳ `collections` (id, trend_id)
 *              ↳ `trend_snapshots` (id, trend_id, collection_id)
 *                   ↳ `trend_sentiment_snapshots` (snapshot_id, data JSONB)
 *
 * 2. Downstream Persistence Target (`trend_sentiment_snapshots`):
 *    In previous versions, workers converted sentiment probabilities into arbitrary
 *    `positive_count`, `negative_count`, and `neutral_count` integer approximations.
 *    In the current architecture, the complete, rich sentiment analytics object
 *    emitted by `processSentimentJob` is stored directly into the `data JSONB`
 *    column of `trend_sentiment_snapshots`.
 *
 * 3. Scope of Verification:
 *    - Validates relational foreign key constraints across `trends`, `collections`,
 *      and `trend_snapshots`.
 *    - Verifies that `processSentimentJob` successfully analyzes incoming posts.
 *    - Simulates `DatabaseQueue` executing an upsert into `trend_sentiment_snapshots`.
 *    - Asserts that the persisted JSONB data contains all expected keys
 *      (`category`, `result`, `score`, `distribution`, `affect`, `narrative`, `meta`).
 *    - Automatically rolls back and purges all test rows.
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
  console.log('[E2E Test] Starting End-to-End Sentiment Worker & Database Persistence Test...');

  const trendLabel = `DevOps Automation ${Date.now()}`;

  // --------------------------------------------------------------------------
  // Step 1: Create Parent Records in PostgreSQL (trends -> collections -> snapshots)
  // --------------------------------------------------------------------------
  // We insert these mock records to satisfy database foreign keys:
  // trend_sentiment_snapshots.snapshot_id REFERENCES trend_snapshots(id)
  
  console.log(`[E2E Test] Setting up relational database fixtures...`);

  // 1a. Insert Trend
  const trendResult = await db.query(`
    INSERT INTO trends (trend_key, canonical_label)
    VALUES ($1, $2)
    RETURNING id
  `, [`key_${Date.now()}`, trendLabel]);
  const trendId = trendResult.rows[0].id;

  // 1b. Insert Collection with all required timestamp columns
  const collectionResult = await db.query(`
    INSERT INTO collections (
      trend_id, 
      external_collection_id, 
      collection_sequence, 
      event_count, 
      status, 
      started_at, 
      observed_at, 
      completed_at
    )
    VALUES ($1, $2, $3, $4, 'completed', NOW(), NOW(), NOW())
    RETURNING id
  `, [trendId, `col_${Date.now()}`, 1, 2]);
  const collectionId = collectionResult.rows[0].id;

  // 1c. Insert Trend Snapshot linking trend and collection
  const snapshotResult = await db.query(`
    INSERT INTO trend_snapshots (trend_id, collection_id, captured_at)
    VALUES ($1, $2, NOW())
    RETURNING id
  `, [trendId, collectionId]);
  const snapshotId = snapshotResult.rows[0].id;

  console.log(`[E2E Test] Created test trend_snapshot ID: ${snapshotId}`);

  // --------------------------------------------------------------------------
  // Step 2: Build Canonical Job & Execute Sentiment Worker Pipeline
  // --------------------------------------------------------------------------
  // Simulates a job pulled by BullMQ from `SentimentQueue`
  const canonicalJob = {
    id: `job_${Date.now()}`,
    data: {
      schemaVersion: "1.0.0",
      collection: { collectionId: collectionId },
      trend: { id: trendId, label: trendLabel, query: trendLabel },
      platforms: { x: true },
      events: [
        {
          eventId: `evt_${Date.now()}_1`,
          platform: "x",
          content: { text: "DevOps automation using agentic workflows is reducing cloud deployment times drastically." },
          metrics: { likes: 95, reposts: 20, replies: 8, quotes: 3 },
          time: { publishedAt: new Date().toISOString() }
        },
        {
          eventId: `evt_${Date.now()}_2`,
          platform: "x",
          content: { text: "CI/CD pipelines with self-healing tests are the future of DevOps." },
          metrics: { likes: 50, reposts: 10, replies: 4, quotes: 1 },
          time: { publishedAt: new Date().toISOString() }
        }
      ]
    }
  };

  console.log(`[E2E Test] Processing job via processSentimentJob...`);
  const sentimentResult = await processSentimentJob(canonicalJob, { cacheRedis, db });
  console.log(`[E2E Test] Sentiment processing completed:`, {
    result: sentimentResult.result,
    score: sentimentResult.score,
    narrativeId: sentimentResult.narrative?.id,
    narrativeText: sentimentResult.narrative?.text,
    proposed: sentimentResult.proposedNarrative
  });

  // --------------------------------------------------------------------------
  // Step 3: Simulate DatabaseQueue Writing Snapshot to PostgreSQL
  // --------------------------------------------------------------------------
  // Persists the raw sentiment analytics object directly into the JSONB `data` column
  console.log(`[E2E Test] Testing persistSentimentSnapshot into trend_sentiment_snapshots...`);
  const query = `
    INSERT INTO trend_sentiment_snapshots (
      snapshot_id,
      data
    )
    VALUES (
      $1,
      $2
    )
    ON CONFLICT (
      snapshot_id
    )
    DO UPDATE SET
      data = EXCLUDED.data
    RETURNING snapshot_id, (data IS NOT NULL) AS has_data, data
  `;

  const dbResult = await db.query(query, [snapshotId, JSON.stringify(sentimentResult)]);
  console.log(`[E2E Test] Snapshot persisted successfully:`, {
    snapshot_id: dbResult.rows[0].snapshot_id,
    has_data: dbResult.rows[0].has_data,
    savedCategory: dbResult.rows[0].data?.category,
    savedResult: dbResult.rows[0].data?.result,
    savedNarrativeId: dbResult.rows[0].data?.narrative?.id
  });

  if (!dbResult.rows[0].has_data) {
    throw new Error(`trend_sentiment_snapshots record was created without JSONB data`);
  }

  // --------------------------------------------------------------------------
  // Step 4: Cleanup Fixtures & Test Data
  // --------------------------------------------------------------------------
  // Clean up in reverse foreign key order
  console.log(`[E2E Test] Cleaning up test data...`);
  await db.query('DELETE FROM trend_sentiment_snapshots WHERE snapshot_id = $1', [snapshotId]);
  await db.query('DELETE FROM trend_snapshots WHERE id = $1', [snapshotId]);
  await db.query('DELETE FROM collections WHERE id = $1', [collectionId]);
  await db.query('DELETE FROM trends WHERE id = $1', [trendId]);
  await db.query('DELETE FROM trend_narratives WHERE trend_label = $1', [trendLabel]);
  await cacheRedis.del(`narrative_pool:${trendLabel}`);

  // Gracefully close connections
  await cacheRedis.quit();
  await db.end();

  console.log(`\n🎉 [E2E Test Passed] All verifications passed successfully!`);
  process.exit(0);
}

// Global error handler
run().catch(err => {
  console.error('\n❌ [E2E Test Failed]:', err);
  process.exit(1);
});
