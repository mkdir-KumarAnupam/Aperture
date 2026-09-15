// ============================================================================
// SENTIMENT — TIER 2
// ============================================================================
//
// Hosted LLM used for uncertain Tier 1 classifications.
//
// Flow:
//
//   Tier 1 uncertain posts
//          ↓
//   chunk into batches
//          ↓
//   ONE Groq request per batch
//          ↓
//   one result per post
//
// Provides:
//   - Polarity
//   - Emotions
//   - Stance
//   - Sarcasm
//
// Design:
//   - Batched inference
//   - Strict JSON
//   - Compact output
//   - Serialized API requests
//   - Global cooldown after 429
//   - Retry-After support
//   - Exponential backoff + jitter
//   - Request timeout
//   - Defensive validation
//   - No canonical-data mutation
//   - 401/403 are NON-RETRYABLE
//
// ============================================================================

import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Environment
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * Expected structure:
 *
 * dataingestion/
 * ├── .env
 * └── sentiment/
 *     └── src/
 *         └── tier2.js
 *
 * __dirname:
 *   dataingestion/sentiment/src
 *
 * ../..:
 *   dataingestion
 */

const DATA_INGESTION_ROOT = path.resolve(
  __dirname,
  "..",
  ".."
);

const ROOT_ENV_PATH = path.join(
  DATA_INGESTION_ROOT,
  ".env"
);

/*
 * Make dataingestion/.env authoritative.
 *
 * This prevents a stale GROQ_API_KEY or configuration
 * injected into process.env from silently overriding
 * the project's .env file.
 */
const dotenvResult = dotenv.config({
  path: ROOT_ENV_PATH,
  override: true,
});

if (dotenvResult.error) {
  console.warn(
    `[Tier 2] Could not load environment file: ${ROOT_ENV_PATH}`
  );

  console.warn(
    `[Tier 2] ${dotenvResult.error.message}`
  );
}

// ============================================================================
// Configuration
// ============================================================================

const GROQ_API_KEY =
  typeof process.env.GROQ_API_KEY === "string"
    ? process.env.GROQ_API_KEY.trim()
    : "";

const GROQ_MODEL =
  typeof process.env.GROQ_MODEL === "string" &&
    process.env.GROQ_MODEL.trim()
    ? process.env.GROQ_MODEL.trim()
    : "qwen/qwen3.8-27b";

const GROQ_URL =
  typeof process.env.GROQ_URL === "string" &&
    process.env.GROQ_URL.trim()
    ? process.env.GROQ_URL.trim()
    : "https://api.groq.com/openai/v1/chat/completions";

// ============================================================================
// Input limits
// ============================================================================

const MAX_INPUT_CHARACTERS =
  Math.max(
    100,
    Number(
      process.env.TIER2_MAX_INPUT_CHARACTERS
    ) || 1800
  );

// ============================================================================
// Batch size
// ============================================================================
//
// IMPORTANT:
//
// This is the ONLY batch-size setting used by this module.
//
// Default:
//   5 posts
//
// Example:
//
//   TIER2_BATCH_SIZE=5
//
// 12 uncertain posts:
//
//   Batch 1 → 5
//   Batch 2 → 5
//   Batch 3 → 2
//
// Exactly 3 Groq requests.
//
// ============================================================================

const TIER2_BATCH_SIZE =
  Math.max(
    1,
    Number(
      process.env.TIER2_BATCH_SIZE
    ) || 5
  );

// ============================================================================
// Output token limit
// ============================================================================
//
// Prefer:
//
//   TIER2_MAX_OUTPUT_TOKENS
//
// Backwards-compatible fallback:
//
//   MAX_OUTPUT_TOKENS
//
// Default:
//   600
//
// ============================================================================

const MAX_OUTPUT_TOKENS =
  Math.max(
    100,
    Number(
      process.env.TIER2_MAX_OUTPUT_TOKENS ??
      process.env.MAX_OUTPUT_TOKENS
    ) || 600
  );

// ============================================================================
// Request rate limiting
// ============================================================================

const MIN_REQUEST_INTERVAL_MS =
  Math.max(
    0,
    Number(
      process.env.TIER2_MIN_REQUEST_INTERVAL_MS
    ) || 3000
  );

// Global cooldown after HTTP 429.

let globalCooldownUntil = 0;

// Time at which the previous request started.

let lastRequestTime = 0;

// ============================================================================
// Global request scheduler
// ============================================================================
//
// All Groq requests go through this chain.
//
// This guarantees:
//
//   request 1
//      ↓
//   request 2
//      ↓
//   request 3
//
// rather than:
//
//   request 1 ─┐
//   request 2 ─┼── simultaneous
//   request 3 ─┘
//
// ============================================================================

let requestChain = Promise.resolve();

function enqueueRequest(task) {
  const next =
    requestChain.then(
      async () => {

        // --------------------------------------------------------------
        // Global 429 cooldown
        // --------------------------------------------------------------

        await waitForGlobalCooldown();

        // --------------------------------------------------------------
        // Minimum interval between requests
        // --------------------------------------------------------------

        const now = Date.now();

        const elapsed =
          now - lastRequestTime;

        if (
          lastRequestTime > 0 &&
          elapsed < MIN_REQUEST_INTERVAL_MS
        ) {
          const wait =
            MIN_REQUEST_INTERVAL_MS -
            elapsed;

          console.log(
            `[Tier 2] Scheduler waiting ${wait}ms...`
          );

          await sleep(wait);
        }

        // Cooldown could have been activated while waiting.

        await waitForGlobalCooldown();

        try {
          return await task();
        } finally {
          lastRequestTime = Date.now();
        }
      }
    );

  /*
   * Do not allow a failed request to poison the
   * global scheduler for all future requests.
   */
  requestChain =
    next.catch(
      () => undefined
    );

  return next;
}

// ============================================================================
// Sleep
// ============================================================================

function sleep(ms) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}

// ============================================================================
// Global cooldown
// ============================================================================

async function waitForGlobalCooldown() {
  const now = Date.now();

  if (
    globalCooldownUntil <= now
  ) {
    return;
  }

  const wait =
    globalCooldownUntil - now;

  console.warn(
    `[Tier 2] Global Groq cooldown: waiting ${wait}ms...`
  );

  await sleep(wait);
}

// ============================================================================
// Retry configuration
// ============================================================================

const MAX_RETRIES =
  Math.max(
    0,
    Number(
      process.env.TIER2_MAX_RETRIES
    ) || 4
  );

const INITIAL_BACKOFF_MS =
  Math.max(
    100,
    Number(
      process.env.TIER2_INITIAL_BACKOFF_MS
    ) || 5000
  );

const MAX_BACKOFF_MS =
  Math.max(
    INITIAL_BACKOFF_MS,
    Number(
      process.env.TIER2_MAX_BACKOFF_MS
    ) || 60000
  );

// ============================================================================
// Timeout
// ============================================================================

const REQUEST_TIMEOUT_MS =
  Math.max(
    1000,
    Number(
      process.env.TIER2_REQUEST_TIMEOUT_MS
    ) || 60000
  );

// ============================================================================
// Allowed labels
// ============================================================================

const VALID_POLARITIES =
  new Set([
    "positive",
    "neutral",
    "negative",
  ]);

const VALID_STANCES =
  new Set([
    "supportive",
    "against",
    "neutral",
  ]);

const VALID_EMOTIONS =
  new Set([
    "joy",
    "sadness",
    "anger",
    "fear",
    "anxiety",
    "excitement",
    "surprise",
    "disgust",
    "frustration",
    "hope",
    "love",
    "disappointment",
    "confusion",
  ]);

// ============================================================================
// Text preparation
// ============================================================================

function prepareText(text) {
  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "Tier 2 requires non-empty text."
    );
  }

  const normalized =
    text.trim();

  if (
    normalized.length <=
    MAX_INPUT_CHARACTERS
  ) {
    return normalized;
  }

  console.warn(
    `[Tier 2] Input exceeds ${MAX_INPUT_CHARACTERS} characters. ` +
    `Applying defensive truncation. ` +
    `Original length: ${normalized.length}`
  );

  return normalized.slice(
    0,
    MAX_INPUT_CHARACTERS
  );
}

// ============================================================================
// Normalize batch posts
// ============================================================================

function normalizeBatchPosts(posts) {
  if (
    !Array.isArray(posts) ||
    posts.length === 0
  ) {
    throw new Error(
      "Tier 2 requires a non-empty array of posts."
    );
  }

  return posts.map(
    (post, index) => {

      const id =
        String(
          post?.id ??
          post?.eventId ??
          post?.event_id ??
          index
        ).trim();

      if (!id) {
        throw new Error(
          `Tier 2 post at index ${index} has no valid ID.`
        );
      }

      const text =
        post?.text ??
        post?.content?.text ??
        "";

      return {
        id,
        text:
          prepareText(text),
      };
    }
  );
}

// ============================================================================
// Duplicate ID validation
// ============================================================================

function validateUniqueIds(posts) {
  const ids =
    new Set();

  for (
    const post of posts
  ) {
    if (
      ids.has(post.id)
    ) {
      throw new Error(
        `Tier 2 received duplicate post ID: ${post.id}`
      );
    }

    ids.add(post.id);
  }
}

// ============================================================================
// Prompt
// ============================================================================

function buildMessages(posts) {
  const postBlock =
    posts
      .map(
        (post) =>
          `POST_ID: ${post.id}\n` +
          `TEXT: ${post.text}`
      )
      .join(
        "\n\n"
      );

  return [
    {
      role: "system",

      content:
        "Analyze every social-media post provided by the user.\n\n" +

        "Return ONLY one valid JSON object.\n" +
        "No markdown.\n" +
        "No commentary.\n\n" +

        "Return exactly this structure:\n\n" +

        "{\n" +
        '  "results": [\n' +
        "    {\n" +
        '      "id": "POST_ID",\n' +
        '      "polarity": {"label":"positive|neutral|negative","confidence":0.0},\n' +
        '      "emotions": [{"label":"joy|sadness|anger|fear|anxiety|excitement|surprise|disgust|frustration|hope|love|disappointment|confusion","confidence":0.0}],\n' +
        '      "stance": {"label":"supportive|against|neutral","confidence":0.0},\n' +
        '      "sarcasm": {"detected":false,"confidence":0.0},\n' +
        '      "reason":"short reason"\n' +
        "    }\n" +
        "  ]\n" +
        "}\n\n" +

        "Rules:\n" +
        "- Return exactly one result for every POST_ID.\n" +
        "- Preserve every POST_ID exactly.\n" +
        "- confidence must be between 0 and 1.\n" +
        "- Use only the allowed labels.\n" +
        "- emotions may be empty.\n" +
        "- sarcasm is not an emotion.\n" +
        "- reason must be 10 words or fewer.\n" +
        "- Do not merge posts.\n" +
        "- Do not omit posts.\n" +
        "- Do not add extra posts.\n" +
        "- Output exactly one JSON object.",
    },

    {
      role: "user",
      content: postBlock,
    },
  ];
}

// ============================================================================
// Confidence
// ============================================================================

function clampConfidence(value) {
  const confidence =
    Number(value);

  if (
    !Number.isFinite(
      confidence
    )
  ) {
    return null;
  }

  return Math.min(
    1,
    Math.max(
      0,
      confidence
    )
  );
}

// ============================================================================
// JSON extraction
// ============================================================================

function extractJsonObject(raw) {
  if (
    typeof raw !== "string"
  ) {
    return null;
  }

  let cleaned =
    raw.trim();

  if (!cleaned) {
    return null;
  }

  // Remove markdown fences if the model ignores the instruction.

  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();

  // First attempt: entire response.

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    // Continue.
  }

  // Second attempt: extract outer JSON object.

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace === -1 ||
    lastBrace === -1 ||
    lastBrace <= firstBrace
  ) {
    return null;
  }

  try {
    return JSON.parse(
      cleaned.slice(
        firstBrace,
        lastBrace + 1
      )
    );
  } catch {
    return null;
  }
}

// ============================================================================
// Individual result validation
// ============================================================================

function parseIndividualResult(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  // ========================================================================
  // Polarity
  // ========================================================================

  const polarityLabel =
    String(
      result?.polarity?.label ??
      ""
    )
      .toLowerCase()
      .trim();

  const polarityConfidence =
    clampConfidence(
      result?.polarity?.confidence
    );

  if (
    !VALID_POLARITIES.has(
      polarityLabel
    ) ||
    polarityConfidence === null
  ) {
    return null;
  }

  // ========================================================================
  // Emotions
  // ========================================================================

  const emotions =
    Array.isArray(
      result?.emotions
    )
      ? result.emotions
        .map(
          (emotion) => {

            const label =
              String(
                emotion?.label ??
                ""
              )
                .toLowerCase()
                .trim();

            const confidence =
              clampConfidence(
                emotion?.confidence
              );

            if (
              !VALID_EMOTIONS.has(
                label
              ) ||
              confidence === null
            ) {
              return null;
            }

            return {
              label,
              confidence,
            };
          }
        )
        .filter(Boolean)
      : [];

  // ========================================================================
  // Stance
  // ========================================================================

  const stanceLabel =
    String(
      result?.stance?.label ??
      ""
    )
      .toLowerCase()
      .trim();

  const stanceConfidence =
    clampConfidence(
      result?.stance?.confidence
    );

  if (
    !VALID_STANCES.has(
      stanceLabel
    ) ||
    stanceConfidence === null
  ) {
    return null;
  }

  // ========================================================================
  // Sarcasm
  // ========================================================================

  const sarcasmDetected =
    result?.sarcasm?.detected;

  const sarcasmConfidence =
    clampConfidence(
      result?.sarcasm?.confidence
    );

  if (
    typeof sarcasmDetected !==
    "boolean" ||
    sarcasmConfidence === null
  ) {
    return null;
  }

  // ========================================================================
  // Reason
  // ========================================================================

  let reason = null;

  if (
    typeof result?.reason ===
    "string"
  ) {
    reason =
      result.reason
        .trim()
        .slice(0, 300) ||
      null;
  }

  return {
    polarity: {
      label:
        polarityLabel,

      confidence:
        polarityConfidence,
    },

    emotions,

    stance: {
      label:
        stanceLabel,

      confidence:
        stanceConfidence,
    },

    sarcasm: {
      detected:
        sarcasmDetected,

      confidence:
        sarcasmConfidence,
    },

    reason,
  };
}

// ============================================================================
// Parse complete batch response
// ============================================================================

function parseBatchResponse(
  raw,
  expectedPosts
) {
  const parsed =
    extractJsonObject(
      raw
    );

  if (
    !parsed ||
    !Array.isArray(
      parsed.results
    )
  ) {
    return null;
  }

  const byId =
    new Map();

  for (
    const result of
    parsed.results
  ) {

    const id =
      String(
        result?.id ??
        ""
      ).trim();

    if (!id) {
      continue;
    }

    const normalized =
      parseIndividualResult(
        result
      );

    if (!normalized) {
      continue;
    }

    /*
     * Reject duplicate IDs from the model.
     *
     * Without this, the second result could silently overwrite
     * the first one in the Map.
     */
    if (
      byId.has(id)
    ) {
      console.warn(
        `[Tier 2] Duplicate result ID returned by model: ${id}`
      );

      return null;
    }

    byId.set(
      id,
      normalized
    );
  }

  // ========================================================================
  // Every requested post must have a valid result.
  // ========================================================================

  const output = [];

  for (
    const post of
    expectedPosts
  ) {

    const result =
      byId.get(
        post.id
      );

    if (!result) {
      console.warn(
        `[Tier 2] Missing result for POST_ID: ${post.id}`
      );

      return null;
    }

    output.push({
      id:
        post.id,

      ...result,
    });
  }

  // ========================================================================
  // Reject unexpected IDs.
  // ========================================================================

  if (
    byId.size !==
    expectedPosts.length
  ) {
    console.warn(
      `[Tier 2] Model returned unexpected number of results. ` +
      `Expected ${expectedPosts.length}, received ${byId.size}.`
    );

    return null;
  }

  return output;
}

// ============================================================================
// Retry-After
// ============================================================================

function getRetryAfterMs(response) {
  const value =
    response.headers.get(
      "retry-after"
    );

  if (!value) {
    return null;
  }

  const seconds =
    Number(value);

  if (
    Number.isFinite(seconds) &&
    seconds >= 0
  ) {
    return seconds * 1000;
  }

  const date =
    Date.parse(value);

  if (
    !Number.isNaN(date)
  ) {
    return Math.max(
      0,
      date - Date.now()
    );
  }

  return null;
}

// ============================================================================
// Fetch with timeout
// ============================================================================

async function fetchWithTimeout(
  url,
  options,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Read response body safely
// ============================================================================

async function readResponseBody(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

// ============================================================================
// Calculate exponential backoff
// ============================================================================

function calculateBackoff(attempt) {
  const backoff =
    Math.min(
      MAX_BACKOFF_MS,
      INITIAL_BACKOFF_MS *
      Math.pow(
        2,
        attempt
      )
    );

  const jitter =
    Math.floor(
      Math.random() *
      1000
    );

  return backoff + jitter;
}

// ============================================================================
// Hosted model — ONE batch = ONE HTTP request
// ============================================================================
//
// IMPORTANT:
//
// This function NEVER chunks.
//
// Chunking happens ONLY inside classifyTier2Batch().
//
// This prevents:
//
//   pipeline batch
//        ↓
//   classifyTier2Batch()
//        ↓
//   callHostedModelBatch()
//
// from accidentally creating a second layer of batching.
//
// ============================================================================

async function callHostedModelBatch(posts) {

  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  for (
    let attempt = 0;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    let response;

    // ========================================================================
    // HTTP REQUEST
    // ========================================================================

    try {

      response =
        await fetchWithTimeout(
          GROQ_URL,

          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${GROQ_API_KEY}`,
            },

            body:
              JSON.stringify({
                model:
                  GROQ_MODEL,

                messages:
                  buildMessages(
                    posts
                  ),

                temperature:
                  0,

                max_tokens:
                  MAX_OUTPUT_TOKENS,

                response_format: {
                  type:
                    "json_object",
                },

                stream:
                  false,
              }),
          },

          REQUEST_TIMEOUT_MS
        );

    } catch (error) {

      // ======================================================================
      // TIMEOUT
      // ======================================================================

      if (
        error?.name ===
        "AbortError"
      ) {

        if (
          attempt >=
          MAX_RETRIES
        ) {
          throw new Error(
            `Tier 2 batch request timed out after ` +
            `${REQUEST_TIMEOUT_MS}ms.`
          );
        }

        const wait =
          calculateBackoff(
            attempt
          );

        console.warn(
          `[Tier 2] Batch timeout. ` +
          `Retry ${attempt + 1}/${MAX_RETRIES} ` +
          `in ${wait}ms.`
        );

        await sleep(
          wait
        );

        continue;
      }

      // ======================================================================
      // NETWORK ERROR
      // ======================================================================

      if (
        attempt >=
        MAX_RETRIES
      ) {
        throw new Error(
          `Tier 2 network error after retries: ` +
          `${error?.message ?? error}`
        );
      }

      const wait =
        calculateBackoff(
          attempt
        );

      console.warn(
        `[Tier 2] Network error. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES} ` +
        `in ${wait}ms.`
      );

      await sleep(
        wait
      );
    }

    /*
     * A network error that did not throw above means we should
     * have a response. If not, continue defensively.
     */
    if (!response) {
      continue;
    }

    // ========================================================================
    // SUCCESS
    // ========================================================================

    if (
      response.ok
    ) {

      let data;

      try {

        data =
          await response.json();

      } catch {

        throw new Error(
          "Tier 2 returned invalid HTTP JSON."
        );
      }

      const choice =
        data?.choices?.[0];

      const raw =
        choice?.message
          ?.content ?? "";

      // ======================================================================
      // Truncated output
      // ======================================================================

      if (
        choice?.finish_reason ===
        "length"
      ) {

        console.warn(
          "[Tier 2] Batch output truncated by max_tokens."
        );

        throw new Error(
          "Tier 2 batch returned truncated JSON."
        );
      }

      const results =
        parseBatchResponse(
          raw,
          posts
        );

      if (!results) {

        console.error(
          "[Tier 2] Invalid or incomplete batch JSON."
        );

        throw new Error(
          "Tier 2 returned incomplete or invalid batch JSON."
        );
      }

      return results;
    }

    // ========================================================================
    // AUTHENTICATION
    // ========================================================================
    //
    // 401 / 403 are permanent configuration/authentication failures.
    //
    // NEVER retry.
    //
    // ========================================================================

    if (
      response.status === 401 ||
      response.status === 403
    ) {

      const body =
        await readResponseBody(
          response
        );

      throw new Error(
        `Tier 2 authentication failed ` +
        `(${response.status}). ${body}`
      );
    }

    // ========================================================================
    // 429 RATE LIMIT
    // ========================================================================

    if (
      response.status === 429
    ) {

      const body =
        await readResponseBody(
          response
        );

      const retryAfter =
        getRetryAfterMs(
          response
        );

      const exponentialBackoff =
        Math.min(
          MAX_BACKOFF_MS,
          INITIAL_BACKOFF_MS *
          Math.pow(
            2,
            attempt
          )
        );

      const jitter =
        Math.floor(
          Math.random() *
          1000
        );

      const wait =
        Math.max(
          retryAfter ?? 0,
          exponentialBackoff
        ) + jitter;

      globalCooldownUntil =
        Math.max(
          globalCooldownUntil,
          Date.now() + wait
        );

      if (
        attempt >=
        MAX_RETRIES
      ) {

        throw new Error(
          `Tier 2 rate limit persisted after ` +
          `${MAX_RETRIES} retries. ${body}`
        );
      }

      console.warn(
        `[Tier 2] Groq 429 for batch of ` +
        `${posts.length} posts. ` +
        `Global cooldown ${wait}ms. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES}.`
      );

      await sleep(
        wait
      );

      continue;
    }

    // ========================================================================
    // 5XX SERVER ERRORS
    // ========================================================================

    if (
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {

      const body =
        await readResponseBody(
          response
        );

      if (
        attempt >=
        MAX_RETRIES
      ) {

        throw new Error(
          `Tier 2 server error persisted after retries: ` +
          `${response.status} ${body}`
        );
      }

      const wait =
        calculateBackoff(
          attempt
        );

      console.warn(
        `[Tier 2] Groq server error ` +
        `${response.status}. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES} ` +
        `in ${wait}ms.`
      );

      await sleep(
        wait
      );

      continue;
    }

    // ========================================================================
    // 413 PAYLOAD TOO LARGE
    // ========================================================================

    if (
      response.status === 413
    ) {

      const body =
        await readResponseBody(
          response
        );

      throw new Error(
        `Tier 2 batch request too large (413). ${body}`
      );
    }

    // ========================================================================
    // 400 BAD REQUEST
    // ========================================================================

    if (
      response.status === 400
    ) {

      const body =
        await readResponseBody(
          response
        );

      throw new Error(
        `Tier 2 rejected batch request (400). ${body}`
      );
    }

    // ========================================================================
    // OTHER HTTP ERRORS
    // ========================================================================

    const body =
      await readResponseBody(
        response
      );

    throw new Error(
      `Tier 2 request failed: ` +
      `${response.status} ` +
      `${response.statusText} - ${body}`
    );
  }

  throw new Error(
    "Tier 2 unexpectedly exited retry loop."
  );
}

// ============================================================================
// Split posts into batches
// ============================================================================

function chunkPosts(
  posts,
  batchSize
) {
  const batches = [];

  for (
    let i = 0;
    i < posts.length;
    i += batchSize
  ) {

    batches.push(
      posts.slice(
        i,
        i + batchSize
      )
    );
  }

  return batches;
}

// ============================================================================
// Public API — SINGLE
// ============================================================================
//
// Compatibility wrapper.
//
// This function does NOT perform its own HTTP request.
//
// It delegates to the exact same batch implementation.
//
// ============================================================================

export async function classifyTier2(text) {

  const results =
    await classifyTier2Batch([
      {
        id:
          "single",
        text,
      },
    ]);

  return results[0];
}

// ============================================================================
// Public API — BATCH
// ============================================================================
//
// This is the ONLY place where batching occurs.
//
// Example:
//
//   classifyTier2Batch(8 posts)
//
// with TIER2_BATCH_SIZE=5:
//
//   5 posts → callHostedModelBatch()
//   3 posts → callHostedModelBatch()
//
// Total:
//   2 HTTP requests
//
// ============================================================================

export async function classifyTier2Batch(posts) {

  // --------------------------------------------------------------------------
  // Normalize
  // --------------------------------------------------------------------------

  const normalized =
    normalizeBatchPosts(
      posts
    );

  // --------------------------------------------------------------------------
  // Validate IDs
  // --------------------------------------------------------------------------

  validateUniqueIds(
    normalized
  );

  // --------------------------------------------------------------------------
  // Create batches
  // --------------------------------------------------------------------------

  const batches =
    chunkPosts(
      normalized,
      TIER2_BATCH_SIZE
    );

  console.log(
    `[Tier 2] Processing ${normalized.length} posts in ` +
    `${batches.length} LLM batch(es) of up to ` +
    `${TIER2_BATCH_SIZE}.`
  );

  const allResults = [];

  // --------------------------------------------------------------------------
  // Sequential batch execution
  // --------------------------------------------------------------------------

  for (
    let i = 0;
    i < batches.length;
    i++
  ) {

    const batch =
      batches[i];

    console.log(
      `[Tier 2] Batch ${i + 1}/${batches.length}: ` +
      `${batch.length} posts → 1 Groq request`
    );

    try {

      const results =
        await enqueueRequest(
          () =>
            callHostedModelBatch(
              batch
            )
        );

      if (
        !Array.isArray(
          results
        ) ||
        results.length !==
        batch.length
      ) {
        throw new Error(
          `Tier 2 returned ${results?.length ?? 0} results ` +
          `for ${batch.length} posts.`
        );
      }

      allResults.push(
        ...results
      );

      console.log(
        `[Tier 2] Batch ${i + 1}/${batches.length} completed.`
      );

    } catch (error) {

      /*
       * IMPORTANT:
       *
       * Do NOT automatically call classifyTier2()
       * here.
       *
       * That would turn one batch into multiple
       * single-post requests and defeat batching.
       */

      console.error(
        `[Tier 2] Batch ${i + 1}/${batches.length} failed:`,
        error?.message ?? error
      );

      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Final sanity check
  // --------------------------------------------------------------------------

  if (
    allResults.length !==
    normalized.length
  ) {
    throw new Error(
      `Tier 2 result count mismatch. ` +
      `Expected ${normalized.length}, ` +
      `received ${allResults.length}.`
    );
  }

  return allResults;
}

// ============================================================================
// Diagnostics
// ============================================================================

console.log(
  "[Tier 2] Configuration loaded:"
);

console.log(
  `  Source file: ${__filename}`
);

console.log(
  `  Env file: ${ROOT_ENV_PATH}`
);

console.log(
  `  API key configured: ${Boolean(GROQ_API_KEY)}`
);

if (
  GROQ_API_KEY
) {
  console.log(
    `  API key prefix: ${GROQ_API_KEY.slice(0, 8)}...`
  );

  console.log(
    `  API key length: ${GROQ_API_KEY.length}`
  );
}

console.log(
  `  Model: ${GROQ_MODEL}`
);

console.log(
  `  URL: ${GROQ_URL}`
);

console.log(
  `  Max input/post: ${MAX_INPUT_CHARACTERS} characters`
);

console.log(
  `  Batch size: ${TIER2_BATCH_SIZE} posts`
);

console.log(
  `  Max output: ${MAX_OUTPUT_TOKENS} tokens`
);

console.log(
  `  Request interval: ${MIN_REQUEST_INTERVAL_MS}ms`
);

console.log(
  `  Max retries: ${MAX_RETRIES}`
);

console.log(
  `  Initial backoff: ${INITIAL_BACKOFF_MS}ms`
);

console.log(
  `  Max backoff: ${MAX_BACKOFF_MS}ms`
);

console.log(
  `  Request timeout: ${REQUEST_TIMEOUT_MS}ms`
);

console.log(
  "  Batched requests: enabled"
);

console.log(
  "  Single-request compatibility wrapper: enabled"
);

console.log(
  "  Global request scheduler: enabled"
);

console.log(
  "  Global 429 cooldown: enabled"
);

console.log(
  "  401/403 retry: disabled"
);

console.log(
  "  Strict JSON validation: enabled"
);

console.log(
  "  Duplicate ID validation: enabled"
);
