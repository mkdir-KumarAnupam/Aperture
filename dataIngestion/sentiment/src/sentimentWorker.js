/**
 * ============================================================================
 * JEV SENTIMENT & NARRATIVE WORKER (Aperture Analytics Pipeline)
 * ============================================================================
 *
 * Purpose:
 * --------
 * This module is the core sentiment analysis engine for the Aperture ingestion
 * pipeline. It receives social media discussion batches from BullMQ (`SentimentQueue`),
 * extracts dominant sentiment and multidimensional affect intensities, and aligns
 * the discussion with an evolving pool of narratives using TypeSafe AI's JEV SystemOne.
 *
 * Architectural Flow:
 * -------------------
 *   1. Canonical job.data arrives from BullMQ (`SentimentQueue`).
 *   2. The worker normalizes events into a concise, interaction-weighted batch state.
 *   3. The narrative pool for the trend is fetched from Redis (with fallback to PostgreSQL).
 *   4. Phase 1: JEV SystemOne evaluates the batch against typed questions:
 *        - Overall Sentiment (positive, negative, neutral, mixed)
 *        - 8 Affect Dimensions (anger, fear, joy, sadness, anxiety, excitement, outrage, hope)
 *        - Dominant Narrative Selection (from active pool + "none_of_these")
 *        - Per-narrative Relevance (continuous 0.0 - 1.0) and Stance (support, oppose, neutral, discussing)
 *   5. Phase 2: Confidence Threshold Check (default: 0.70):
 *        - If confidence >= 0.70 and != "none_of_these": High-confidence match accepted directly.
 *   6. Phase 3: Fallback Escalation to Gemini LLM (Multi-Key Rotation):
 *        - Triggered on low confidence or when discussion doesn't match known narratives.
 *        - Gemini evaluates whether the discussion matches an existing narrative or proposes a new one.
 *   7. Phase 4: Decision Handling & Dual-Write Persistence:
 *        - Condition A: LLM recognizes an existing narrative -> Links it directly.
 *        - Condition B: LLM proposes a new narrative:
 *            a. Atomically appends the new narrative to PostgreSQL table `trend_narratives` (JSONB array).
 *            b. Updates Redis cache `narrative_pool:${trend_label}` with a 7-day TTL (604,800s).
 *            c. Performs a follow-up JEV evaluation to score relevance & stance for the new narrative.
 *            d. Sets the narrative ID to the real PostgreSQL-generated UUID.
 *   8. Emits a clean sentiment analytics object stored directly in PostgreSQL JSONB by `DatabaseQueue`.
 *
 * ============================================================================
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { randomUUID } from 'node:crypto';
import { Worker, Queue } from 'bullmq';
import { TypeSafeClient, choice, noul } from '@typesafe-ai/sdk';
import { z } from 'zod';
import Redis from 'ioredis';
import pg from 'pg';
import { TAXONOMY } from './taxonomy.js';

const { Pool } = pg;

// ============================================================================
// CONFIGURATION & ENVIRONMENT VARIABLES
// ============================================================================

/** Redis connection URL for BullMQ queues, narrative caching, and LLM cooldown keys */
const LOCAL_REDIS_URL = process.env.LOCAL_REDIS_URL || 'redis://127.0.0.1:6379';

/** PostgreSQL connection string for narrative storage and snapshot persistence */
const DATABASE_URL = process.env.DATABASE_URL;

/** Maximum execution timeout for JEV API calls in milliseconds (default: 30s) */
const JEV_TIMEOUT_MS = parseInt(process.env.JEV_TIMEOUT_MS || '30000', 10);

/** Maximum retry attempts for transient API and network failures */
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '4', 10);

/** Exponential backoff retry delays in milliseconds for network requests */
const RETRY_DELAYS_MS = (process.env.RETRY_DELAYS_MS || '1000,2000,4000').split(',').map(Number);

/** Maximum random jitter applied to retry backoff to avoid thundering herds */
const MAX_JITTER_MS = parseInt(process.env.MAX_JITTER_MS || '500', 10);

/** Milliseconds to wait before re-checking for an available Gemini API key */
const LLM_KEY_WAIT_MS = parseInt(process.env.LLM_KEY_WAIT_MS || '5000', 10);

/** Default cooldown duration in seconds when a Gemini key hits an HTTP 429 rate limit */
const LLM_DEFAULT_COOLING_S = parseInt(process.env.LLM_DEFAULT_COOLING_S || '60', 10);

/** Confidence threshold (0.0 to 1.0) above which JEV's narrative choice is accepted without LLM fallback */
const NARRATIVE_ACCEPTANCE_THRESHOLD = parseFloat(process.env.NARRATIVE_ACCEPTANCE_THRESHOLD || '0.7');

/** Maximum number of active narratives maintained in one trend's narrative pool */
const NARRATIVE_CAP = parseInt(process.env.NARRATIVE_CAP || '50', 10);

/** Time-to-live for cached narrative pools in Redis (604,800 seconds = 7 days) */
const REDIS_NARRATIVE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** BullMQ worker job concurrency (number of parallel jobs processed per worker instance) */
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

/** Gemini model endpoint utilized for fallback narrative classification */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

/** Maximum number of posts included in the JEV batch evaluation context */
const BATCH_POST_LIMIT = parseInt(process.env.BATCH_POST_LIMIT || '30', 10);

/** Maximum character length permitted for the stringified batch state payload */
const BATCH_CHAR_LIMIT = parseInt(process.env.BATCH_CHAR_LIMIT || '112000', 10);

// ============================================================================
// INFRASTRUCTURE CONNECTIONS (Lazy Singletons)
// ============================================================================

/**
 * Lazy singleton for Redis connection.
 * Initialized only when accessed, preventing connection leaks during unit tests or imports.
 * @returns {Redis} Active ioredis client
 */
let defaultRedis = null;
function getDefaultRedis() {
  if (!defaultRedis) {
    defaultRedis = new Redis(LOCAL_REDIS_URL, { maxRetriesPerRequest: null });
  }
  return defaultRedis;
}

/**
 * Lazy singleton for PostgreSQL connection pool.
 * Limits idle client allocations and manages standalone worker persistence.
 * @returns {pg.Pool} Active PostgreSQL client pool
 */
let defaultPool = null;
function getDefaultPool() {
  if (!defaultPool) {
    defaultPool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
    });
  }
  return defaultPool;
}

/**
 * Lazy singleton for TypeSafe AI JEV client.
 * Configured with strict timeouts and zero internal retries (retries handled by withRetry).
 * @returns {TypeSafeClient} Initialized TypeSafeClient SDK instance
 */
let defaultJevClient = null;
function getJevClient() {
  if (!defaultJevClient) {
    defaultJevClient = new TypeSafeClient({ 
      timeout: JEV_TIMEOUT_MS, 
      maxRetries: 0 
    });
  }
  return defaultJevClient;
}

// ============================================================================
// SCHEMAS & VALIDATION
// ============================================================================

/**
 * Zod schema enforcing strict output structure from Gemini LLM Fallback.
 * Ensures the model returns either:
 *   - {"decision": "existing", "narrativeId": "<valid_id>"}
 *   - {"decision": "new", "newNarrative": "<summary_string>"}
 */
const LLMFallbackSchema = z.object({
  decision: z.enum(['existing', 'new']),
  narrativeId: z.string().optional(),
  newNarrative: z.string().optional()
}).refine(data => 
  (data.decision === 'existing' && !!data.narrativeId) || 
  (data.decision === 'new' && !!data.newNarrative),
  { message: "Invalid fallback decision payload: missing narrativeId or newNarrative" }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Constructs a bounded, interaction-weighted batch state JSON string.
 *
 * Algorithm:
 *  1. Sorts posts by total interaction count descending (high-signal posts first).
 *  2. Slices to BATCH_POST_LIMIT (default: 30 posts).
 *  3. Serializes to JSON and truncates to BATCH_CHAR_LIMIT (default: 112k chars).
 *
 * @param {string} trendLabel - Human-readable trend query or hashtag
 * @param {Array<{ text: string, interactions: number }>} posts - Filtered post entries
 * @returns {string} Truncated JSON string representing current batch state
 */
export function buildBatchState(trendLabel, posts) {
  const sorted = [...posts].sort((a, b) => (b.interactions || 0) - (a.interactions || 0));
  const stateObj = { trend: trendLabel, posts: sorted.slice(0, BATCH_POST_LIMIT) }; 
  return JSON.stringify(stateObj).slice(0, BATCH_CHAR_LIMIT); 
}

/**
 * Executes an asynchronous function with exponential backoff and random jitter.
 *
 * Error Handling:
 *  - Immediately re-throws HTTP 429 errors (so caller can trigger key rotation).
 *  - Retries transient errors (HTTP >= 500, ECONNRESET, network aborts).
 *  - Throws "retries_exhausted" after reaching MAX_RETRIES.
 *
 * @param {Function} fn - Async operation to execute
 * @returns {Promise<any>} Result of the resolved function
 */
async function withRetry(fn) {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      return await fn();
    } catch (error) {
      // Allow HTTP 429 to bubble up immediately to key rotation handler
      if (error.status === 429) throw error; 
      
      const isTransient = (error.status >= 500) || error.code === 'ECONNRESET';
      if (!isTransient || attempt === MAX_RETRIES - 1) throw error; 
      
      const jitter = Math.random() * MAX_JITTER_MS;
      const delay = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      
      await new Promise(res => setTimeout(res, delay + jitter));
      attempt++;
    }
  }
  throw new Error("retries_exhausted");
}

/**
 * Calls the Google Gemini API to analyze the batch against existing narratives.
 *
 * Execution Details:
 *  - Injects existing narrative list as ground-truth context.
 *  - Configures temperature: 0.1 for high determinism.
 *  - Disables safety filters (`BLOCK_NONE`) to allow raw, uncensored social media analysis.
 *  - Forces strict JSON response MIME type (`application/json`).
 *
 * @param {string} activeKey - Active Google AI Studio API key
 * @param {Array<{ id: string, narrative_text: string }>} pool - Active narrative pool
 * @param {string} state - Bounded batch state JSON string
 * @returns {Promise<string>} Raw JSON response string from Gemini
 */
async function mockLLMCall(activeKey, pool, state) {
  // 1. Format existing narrative pool for prompt context
  const poolContext = pool.length > 0 
    ? pool.map(p => `ID: ${p.id} | Narrative: ${p.narrative_text}`).join('\n')
    : "No existing narratives available.";

  // 2. Strict system instruction defining output contract
  const systemPrompt = `You are a sentiment and narrative classification engine analyzing social media posts.
Your job is to read a batch of posts and compare them against a pool of existing narratives.
- If the dominant discussion strongly aligns with an existing narrative, return its ID.
- If the discussion is about something else entirely, propose a new, concise narrative (max 1 sentence).
You MUST respond in strict JSON format.
If matching existing: {"decision": "existing", "narrativeId": "<the_id>"}
If proposing new: {"decision": "new", "newNarrative": "<your_1_sentence_summary>"}`;

  const userPrompt = `EXISTING NARRATIVES:\n${poolContext}\n\nPOSTS BATCH:\n${state}`;

  // 3. Dispatch POST request to Gemini API endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${activeKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: userPrompt }]
      }],
      // Explicitly disable safety filters for raw social media discourse
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ],
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.1 
      }
    })
  });

  // 4. Capture HTTP errors (e.g. 429 rate limit or 503 capacity)
  if (!response.ok) {
    const errorData = await response.text();
    console.error(`🚨 GEMINI API HTTP ${response.status} ERROR:`, errorData);
    const error = new Error(`Gemini Error: ${response.status} - ${errorData}`);
    error.status = response.status;
    error.headers = Object.fromEntries(response.headers.entries());
    throw error;
  }

  // 5. Extract candidate text output
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * Manages Gemini API calls across a rotation of multiple API keys.
 *
 * Cooldown Mechanism:
 *  - Checks Redis for `cooling_key:${key}` before making requests.
 *  - If an active key encounters an HTTP 429, it sets a cooling key in Redis with TTL.
 *  - Dynamically cycles to the next uncooled key in the pool.
 *
 * @param {Array} pool - Narrative pool
 * @param {string} state - Batch state string
 * @param {Redis} cacheRedis - Redis client for tracking key cooldown state
 * @returns {Promise<string>} Valid JSON string from Gemini
 */
export async function executeLLMWithRotation(pool, state, cacheRedis) {
  const keys = (process.env.LLM_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    let activeKey = null;
    
    // Locate the first key that is not currently in cooldown
    for (const key of keys) {
      const isCooling = await cacheRedis.get(`cooling_key:${key}`);
      if (!isCooling) {
        activeKey = key;
        break;
      }
    }

    // If all keys are cooling, pause briefly before retrying
    if (!activeKey) {
      await new Promise(res => setTimeout(res, LLM_KEY_WAIT_MS));
      continue; 
    }

    try {
      return await withRetry(() => mockLLMCall(activeKey, pool, state)); 
    } catch (error) {
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after'] ? parseInt(error.headers['retry-after'], 10) : LLM_DEFAULT_COOLING_S;
        // Mark key as cooling in Redis
        await cacheRedis.set(`cooling_key:${activeKey}`, '1', 'EX', retryAfter); 
        continue; 
      }
      attempt++;
    }
  }
  throw new Error("llm_failed");
}

/**
 * Retrieves the narrative pool for a given trend from Redis (7-day TTL),
 * falling back to PostgreSQL single-row JSONB table `trend_narratives` on a cache miss.
 *
 * Storage Architecture:
 *  - Stored as exactly 1 row per trend_label in PostgreSQL.
 *  - Column `narratives` contains a JSONB array: `[{ id, narrative_text, created_at, updated_at }]`.
 *
 * @param {string} trend_label - Human-readable trend query or hashtag
 * @param {Redis} cacheRedis - Redis client for local caching
 * @param {pg.Pool|pg.Client} db - PostgreSQL client or pool
 * @returns {Promise<{ pool: Array<{ id: string, narrative_text: string }>, pool_is_full: boolean }>}
 */
export async function getNarrativePool(trend_label, cacheRedis, db) {
  const cacheKey = `narrative_pool:${trend_label}`;
  let pool = null;

  // 1. Attempt reading from Redis cache
  try {
    const cachedPool = await cacheRedis.get(cacheKey);
    if (cachedPool) {
      pool = JSON.parse(cachedPool);
    }
  } catch (err) {
    console.warn(`[SentimentWorker] Redis read failed for ${cacheKey}:`, err.message);
  }

  // 2. Fallback to PostgreSQL on cache miss
  if (!pool || !Array.isArray(pool)) {
    const query = `
      SELECT narratives 
      FROM trend_narratives 
      WHERE trend_label = $1
    `;
    const { rows } = await db.query(query, [trend_label]);
    pool = rows[0]?.narratives || [];

    // Cache pool in Redis with 7-day TTL
    try {
      await cacheRedis.set(cacheKey, JSON.stringify(pool), 'EX', REDIS_NARRATIVE_TTL_SECONDS);
    } catch (err) {
      console.warn(`[SentimentWorker] Redis cache set failed for ${cacheKey}:`, err.message);
    }
  }

  const pool_is_full = pool.length >= NARRATIVE_CAP;
  return { pool, pool_is_full };
}

/**
 * Persists a newly proposed narrative into PostgreSQL `trend_narratives`
 * (appending to the narratives JSONB array) and updates Redis with a 7-day TTL.
 *
 * Atomic JSONB Append:
 *  Uses PostgreSQL's native `||` JSONB concatenation operator so concurrent
 *  workers can safely append new narratives without race conditions.
 *
 * @param {string} trend_label - Human-readable trend query or hashtag
 * @param {string} narrativeText - The new narrative text proposed by Gemini
 * @param {Redis} cacheRedis - Redis client
 * @param {pg.Pool|pg.Client} db - PostgreSQL client or pool
 * @returns {Promise<{ id: string, narrative_text: string, created_at: string, updated_at: string }>}
 */
export async function persistNewNarrative(trend_label, narrativeText, cacheRedis, db) {
  const newNarrative = {
    id: randomUUID(),
    narrative_text: narrativeText,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Atomic insert or append into single-row JSONB array
  const insertQuery = `
    INSERT INTO trend_narratives (trend_label, narratives, updated_at)
    VALUES ($1, jsonb_build_array($2::jsonb), NOW())
    ON CONFLICT (trend_label)
    DO UPDATE SET
      narratives = trend_narratives.narratives || jsonb_build_array($2::jsonb),
      updated_at = NOW()
  `;
  await db.query(insertQuery, [trend_label, JSON.stringify(newNarrative)]);

  // Synchronize the updated pool into Redis with a fresh 7-day TTL
  const cacheKey = `narrative_pool:${trend_label}`;
  try {
    const cached = await cacheRedis.get(cacheKey);
    let pool = cached ? JSON.parse(cached) : [];
    if (!pool.some(p => p.id === newNarrative.id || p.narrative_text === newNarrative.narrative_text)) {
      pool.push(newNarrative);
    }
    await cacheRedis.set(cacheKey, JSON.stringify(pool), 'EX', REDIS_NARRATIVE_TTL_SECONDS);
  } catch (err) {
    console.warn(`[SentimentWorker] Redis update failed for ${cacheKey}:`, err.message);
  }

  return newNarrative;
}

// ============================================================================
// CORE SENTIMENT PROCESSING LOGIC
// ============================================================================

/**
 * Core processor for sentiment jobs. Accepts canonical Aperture job data
 * (or standalone synthetic test payloads) and performs JEV SystemOne classification
 * with Gemini fallback and dual-write narrative persistence.
 *
 * @param {object} job - BullMQ Job instance or object containing .data
 * @param {object} options - Optional dependency overrides ({ cacheRedis, db, jevClient })
 * @returns {Promise<object>} Clean sentiment analytics object for DatabaseQueue
 */
export async function processSentimentJob(job, options = {}) {
  const cacheRedis = options.cacheRedis || getDefaultRedis();
  const db = options.db || getDefaultPool();
  const jevClient = options.jevClient || getJevClient();

  const jobData = job?.data || {};

  // --------------------------------------------------------------------------
  // 1. Resolve Canonical Collection vs Standalone Test Payload
  // --------------------------------------------------------------------------
  let trend_label = "unknown";
  let posts = [];
  let pool = null;
  let pool_is_full = false;

  if (jobData.schemaVersion && Array.isArray(jobData.events)) {
    // Production Canonical Data Format from producer.js
    trend_label = jobData.trend?.label ?? jobData.trend?.query ?? "unknown";

    posts = jobData.events
      .filter(event => typeof event.content?.text === 'string' && event.content.text.trim().length > 0)
      .map(event => {
        // Aggregate interaction weight across platforms
        const interactions =
          Number(event.metrics?.likes || 0) +
          Number(event.metrics?.reposts || 0) +
          Number(event.metrics?.replies || 0) +
          Number(event.metrics?.quotes || 0);

        return {
          postId: event.eventId,
          platform: event.platform || 'unknown',
          text: event.content.text.trim(),
          interactions,
        };
      });
  } else if (jobData.canonical && Array.isArray(jobData.canonical.events)) {
    // Parent-wrapped canonical data
    const c = jobData.canonical;
    trend_label = c.trend?.label ?? c.trend?.query ?? "unknown";

    posts = c.events
      .filter(event => typeof event.content?.text === 'string' && event.content.text.trim().length > 0)
      .map(event => {
        const interactions =
          Number(event.metrics?.likes || 0) +
          Number(event.metrics?.reposts || 0) +
          Number(event.metrics?.replies || 0) +
          Number(event.metrics?.quotes || 0);

        return {
          postId: event.eventId,
          platform: event.platform || 'unknown',
          text: event.content.text.trim(),
          interactions,
        };
      });
  } else if (jobData.posts && Array.isArray(jobData.posts)) {
    // Standalone synthetic test payload format (backward compatibility)
    trend_label = jobData.trend_label || "unknown";
    posts = jobData.posts;
    if (Array.isArray(jobData.pool)) {
      pool = jobData.pool;
      pool_is_full = Boolean(jobData.pool_is_full);
    }
  } else {
    throw new Error(`[SentimentWorker] Unrecognized job data payload in job ${job?.id}`);
  }

  // --------------------------------------------------------------------------
  // 2. Retrieve Narrative Pool (Redis -> PostgreSQL)
  // --------------------------------------------------------------------------
  if (!pool) {
    const fetched = await getNarrativePool(trend_label, cacheRedis, db);
    pool = fetched.pool;
    pool_is_full = fetched.pool_is_full;
  }

  // --------------------------------------------------------------------------
  // 3. Handle Empty Event Batches Gracefully
  // --------------------------------------------------------------------------
  if (posts.length === 0) {
    return {
      category: "sentiment",
      trend_label,
      result: "neutral",
      score: 0,
      distribution: null,
      affect: null,
      narrative: null,
      proposedNarrative: null,
      meta: { status: 'empty_batch', model: 'jev-1.13.0', relevanceIsEstimate: true, reprocessed: false }
    };
  }

  // --------------------------------------------------------------------------
  // 4. Map Narrative Options & Build Interaction-Sorted Batch State
  // --------------------------------------------------------------------------
  const narrativeOptions = { "none_of_these": "None of the provided narratives fit" };
  pool.forEach(p => { narrativeOptions[p.narrative_text] = p.narrative_text; });

  const state = buildBatchState(trend_label, posts);

  // Initialize standardized result template
  let resultTemplate = {
    category: "sentiment",
    trend_label,
    result: null,
    score: null,
    distribution: null,
    affect: null,
    narrative: null,
    proposedNarrative: null,
    meta: { status: 'ok', model: 'jev-1.13.0', relevanceIsEstimate: true, reprocessed: false }
  };

  try {
    // ------------------------------------------------------------------------
    // PHASE 1: Construct Question Structs & Call JEV SystemOne
    // ------------------------------------------------------------------------
    const questions = {
      narrative: choice("Which narrative statement or topic is the dominant discussion focusing on or reacting to?", narrativeOptions),
      sentiment: choice("Overall tone:", TAXONOMY.sentiment)
    };

    // Construct individual stance and relevance questions for every pool narrative
    pool.forEach(p => {
      questions[`relevance_${p.id}`] = noul(`Does the discussion meaningfully participate in this narrative: "${p.narrative_text}"?`);
      questions[`stance_${p.id}`] = choice(`Toward this narrative "${p.narrative_text}":`, TAXONOMY.stance);
    });

    // Construct individual continuous tone questions for all 8 affect emotions
    TAXONOMY.affect.forEach(a => {
      questions[`affect_${a}`] = noul(`Is there a tone of ${a}?`);
    }); 

    // Fire initial JEV SystemOne API request
    const jevResponse = await withRetry(() => jevClient.systemOne({ state, questions }));
    
    // Extract discrete sentiment tone, confidence score, and calibrated probabilities
    resultTemplate.result = jevResponse.answers.sentiment?.choice || null;
    resultTemplate.score = jevResponse.answers.sentiment?.confidence || null;
    resultTemplate.distribution = jevResponse.answers.sentiment?.probabilities || null;
    
    // Extract continuous 0.0 - 1.0 affect emotion scores
    resultTemplate.affect = TAXONOMY.affect.reduce((acc, a) => ({
      ...acc, [a]: jevResponse.answers[`affect_${a}`]?.noul || 0
    }), {});

    const topText = jevResponse.answers.narrative?.choice;
    const topProb = jevResponse.answers.narrative?.confidence ?? 0;

    // ------------------------------------------------------------------------
    // PHASE 2: Evaluate Acceptance Threshold (Default >= 0.70)
    // ------------------------------------------------------------------------
    if (topProb >= NARRATIVE_ACCEPTANCE_THRESHOLD && topText !== "none_of_these") {
      const selected = pool.find(p => p.narrative_text === topText);
      
      if (selected) {
        resultTemplate.narrative = {
          id: selected.id,
          text: topText,
          confidence: topProb,
          source: 'jev',
          relevance: jevResponse.answers[`relevance_${selected.id}`]?.noul ?? null, 
          stance: { 
            label: jevResponse.answers[`stance_${selected.id}`]?.choice ?? null, 
            probability: jevResponse.answers[`stance_${selected.id}`]?.confidence ?? null 
          }
        };
        // High confidence match accepted: skip LLM fallback entirely!
        return resultTemplate;
      }
    }

    // ------------------------------------------------------------------------
    // PHASE 3: Fallback to Gemini LLM (Rotated Keys)
    // ------------------------------------------------------------------------
    let llmOutput, llmDecision;
    try {
      llmOutput = await executeLLMWithRotation(pool, state, cacheRedis);
    } catch (e) {
      console.error("🚨 LLM ERROR:", e.message || e);
      resultTemplate.meta.status = 'llm_failed';
      return resultTemplate;
    }

    // Validate LLM output against Zod schema with 1 auto-retry on malformed JSON
    for (let i = 0; i < 2; i++) {
      try {
        const rawJson = JSON.parse(llmOutput);
        llmDecision = LLMFallbackSchema.parse(rawJson);
        break; 
      } catch (e) {
        if (i === 1) {
          resultTemplate.meta.status = 'invalid_output';
          return resultTemplate;
        }
        llmOutput = await executeLLMWithRotation(pool, state, cacheRedis); 
      }
    }

    // ------------------------------------------------------------------------
    // PHASE 4: Handle LLM Decision & Dual-Write Persistence
    // ------------------------------------------------------------------------
    
    // Condition A: LLM recognizes an existing narrative that JEV had low confidence on
    if (llmDecision.decision === 'existing') {
      const existing = pool.find(p => String(p.id) === String(llmDecision.narrativeId));
      
      if (!existing) {
        resultTemplate.meta.status = 'invalid_output';
        return resultTemplate; 
      }
      
      resultTemplate.narrative = {
        id: existing.id,
        text: existing.narrative_text,
        confidence: 0.99,
        source: 'llm',
        relevance: jevResponse.answers[`relevance_${existing.id}`]?.noul ?? null, 
        stance: {
          label: jevResponse.answers[`stance_${existing.id}`]?.choice ?? null, 
          probability: jevResponse.answers[`stance_${existing.id}`]?.confidence ?? null 
        }
      };
      return resultTemplate;
    }

    // Condition B: LLM proposes a brand-new narrative statement
    if (llmDecision.decision === 'new') {
      if (pool_is_full) {
        resultTemplate.meta.status = 'pool_full'; 
        return resultTemplate; 
      }

      // Dual-write: insert into PostgreSQL `trend_narratives` & refresh Redis (7-day TTL)
      const newNarrative = await persistNewNarrative(
        trend_label, 
        llmDecision.newNarrative, 
        cacheRedis, 
        db
      );

      // Construct follow-up questions to score relevance & stance for the new narrative
      const newQuestions = {
        relevance_new: noul(`Does the discussion meaningfully participate in this narrative: "${llmDecision.newNarrative}"?`),
        stance_new: choice(`Toward this narrative "${llmDecision.newNarrative}":`, TAXONOMY.stance)
      };

      // Second JEV Call evaluating the newly proposed narrative
      const followUp = await withRetry(() => jevClient.systemOne({ state, questions: newQuestions }));
      
      resultTemplate.proposedNarrative = llmDecision.newNarrative; 
      
      resultTemplate.narrative = {
        id: newNarrative.id, // Real PostgreSQL UUID!
        text: newNarrative.narrative_text,
        confidence: 0.99,
        source: 'llm',
        relevance: followUp.answers.relevance_new?.noul ?? null,
        stance: {
          label: followUp.answers.stance_new?.choice ?? null,
          probability: followUp.answers.stance_new?.confidence ?? null
        }
      };
      return resultTemplate;
    }

  } catch (error) {
    // ------------------------------------------------------------------------
    // FATAL ERROR HANDLING
    // ------------------------------------------------------------------------
    console.error("🚨 JEV API ERROR:", error.response?.data || error.message || error);
    resultTemplate = {
      category: "sentiment",
      trend_label,
      result: null, 
      score: null, 
      distribution: null, 
      affect: null,
      narrative: null, 
      proposedNarrative: null,
      meta: { status: 'jev_failed', model: 'jev-1.13.0', relevanceIsEstimate: true, reprocessed: false }
    };
    return resultTemplate;
  }
}

// ============================================================================
// WORKER FACTORY & LAZY EXPORT
// ============================================================================

/**
 * Creates and returns an active BullMQ Worker listening on `SentimentQueue`.
 * Used for standalone execution or integration into external runners.
 *
 * @param {object} options - Worker options ({ connection, concurrency, cacheRedis, db, jevClient })
 * @returns {Worker} Initialized BullMQ Worker instance
 */
export function createSentimentWorker(options = {}) {
  const connection = options.connection || new Redis(LOCAL_REDIS_URL, { maxRetriesPerRequest: null });
  const concurrency = options.concurrency || WORKER_CONCURRENCY;

  return new Worker('SentimentQueue', async (job) => {
    return await processSentimentJob(job, options);
  }, { 
    connection, 
    concurrency 
  });
}

/**
 * Lazy proxy export for `sentimentWorker`.
 * Allows direct imports like `import { sentimentWorker } from './sentimentWorker.js'`
 * without prematurely creating background connections or hanging test runners.
 */
let standaloneWorker = null;
export const sentimentWorker = new Proxy({}, {
  get(target, prop) {
    if (!standaloneWorker) {
      standaloneWorker = createSentimentWorker();
    }
    return standaloneWorker[prop];
  }
});
