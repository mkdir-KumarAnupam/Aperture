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
//   normalize + validate
//          ↓
//   chunk into batches
//          ↓
//   ONE Groq request per batch
//          ↓
//   validate response
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
//   - At most 2 emotions per post
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
 * dataIngestion/
 * ├── .env
 * └── sentiment/
 *     └── src/
 *         └── tier2.js
 *
 * __dirname:
 *   dataIngestion/sentiment/src
 *
 * ../..:
 *   dataIngestion
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
 * Make dataIngestion/.env authoritative.
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
// Environment number helper
// ============================================================================

function getEnvNumber(
  name,
  fallback
) {
  const raw =
    process.env[name];

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ""
  ) {
    return fallback;
  }

  const value =
    Number(raw);

  if (
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return value;
}

// ============================================================================
// Input limits
// ============================================================================

const MAX_INPUT_CHARACTERS =
  Math.max(
    100,
    getEnvNumber(
      "TIER2_MAX_INPUT_CHARACTERS",
      1800
    )
  );

// ============================================================================
// Batch size
// ============================================================================
//
// Default:
//
//   3 posts
//
// Example:
//
//   TIER2_BATCH_SIZE=3
//
// 8 uncertain posts:
//
//   Batch 1 → 3
//   Batch 2 → 3
//   Batch 3 → 2
//
// Exactly 3 Groq requests.
//
// ============================================================================

const TIER2_BATCH_SIZE =
  Math.max(
    1,
    Math.floor(
      getEnvNumber(
        "TIER2_BATCH_SIZE",
        3
      )
    )
  );

// ============================================================================
// Output token limit
// ============================================================================
//
// PRIMARY:
//
//   TIER2_MAX_OUTPUT_TOKENS
//
// LEGACY FALLBACK:
//
//   MAX_OUTPUT_TOKENS
//
// DEFAULT:
//
//   300
//
// ============================================================================

const MAX_OUTPUT_TOKENS =
  Math.max(
    100,
    Math.floor(
      getEnvNumber(
        "TIER2_MAX_OUTPUT_TOKENS",
        getEnvNumber(
          "MAX_OUTPUT_TOKENS",
          300
        )
      )
    )
  );

// ============================================================================
// Request rate limiting
// ============================================================================
//
// Default:
//
//   10 seconds between requests.
//
// This is intentionally conservative because
// your current bottleneck has been Groq OTPM.
//
// ============================================================================

const MIN_REQUEST_INTERVAL_MS =
  Math.max(
    1000,
    getEnvNumber(
      "TIER2_MIN_REQUEST_INTERVAL_MS",
      10000
    )
  );

// ============================================================================
// Retry configuration
// ============================================================================

const MAX_RETRIES =
  Math.max(
    0,
    Math.floor(
      getEnvNumber(
        "TIER2_MAX_RETRIES",
        4
      )
    )
  );

const INITIAL_BACKOFF_MS =
  Math.max(
    100,
    getEnvNumber(
      "TIER2_INITIAL_BACKOFF_MS",
      6000
    )
  );

const MAX_BACKOFF_MS =
  Math.max(
    INITIAL_BACKOFF_MS,
    getEnvNumber(
      "TIER2_MAX_BACKOFF_MS",
      60000
    )
  );

// ============================================================================
// Request timeout
// ============================================================================

const REQUEST_TIMEOUT_MS =
  Math.max(
    1000,
    getEnvNumber(
      "TIER2_REQUEST_TIMEOUT_MS",
      30000
    )
  );

// ============================================================================
// Global cooldown
// ============================================================================

let globalCooldownUntil = 0;

// ============================================================================
// Last request finish time
// ============================================================================
//
// We measure the interval from when the previous request finishes.
//
// This deliberately produces a conservative effective request rate.
//
// ============================================================================

let lastRequestTime = 0;

// ============================================================================
// Request scheduler
// ============================================================================
//
// Every Groq request passes through this chain.
//
// This guarantees:
//
//   request 1
//      ↓
//   request 2
//      ↓
//   request 3
//
// instead of:
//
//   request 1 ─┐
//   request 2 ─┼── simultaneous
//   request 3 ─┘
//
// ============================================================================

let requestChain =
  Promise.resolve();

function enqueueRequest(task) {
  const next =
    requestChain.then(
      async () => {

        // --------------------------------------------------------------
        // Global cooldown
        // --------------------------------------------------------------

        await waitForGlobalCooldown();

        // --------------------------------------------------------------
        // Minimum request interval
        // --------------------------------------------------------------

        const now =
          Date.now();

        const elapsed =
          now - lastRequestTime;

        if (
          lastRequestTime > 0 &&
          elapsed <
          MIN_REQUEST_INTERVAL_MS
        ) {
          const wait =
            MIN_REQUEST_INTERVAL_MS -
            elapsed;

          console.log(
            `[Tier 2] Scheduler waiting ${wait}ms...`
          );

          await sleep(
            wait
          );
        }

        // Cooldown could have changed while
        // waiting for the minimum interval.

        await waitForGlobalCooldown();

        try {
          return await task();
        } finally {
          lastRequestTime =
            Date.now();
        }
      }
    );

  /*
   * Prevent a failed request from poisoning
   * the scheduler chain.
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
  const now =
    Date.now();

  if (
    globalCooldownUntil <=
    now
  ) {
    return;
  }

  const wait =
    globalCooldownUntil -
    now;

  console.warn(
    `[Tier 2] Global Groq cooldown: waiting ${wait}ms...`
  );

  await sleep(
    wait
  );
}

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
//
// IMPORTANT:
//
// Truncation is applied to EACH INDIVIDUAL POST.
//
// It does NOT truncate the combined batch.
//
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

    ids.add(
      post.id
    );
  }
}

// ============================================================================
// Prompt
// ============================================================================
//
// IMPORTANT:
//
// The output schema here MUST remain compatible with
// the existing pipeline parser.
//
// Do NOT flatten polarity / stance / sarcasm.
//
// ============================================================================

function buildMessages(posts) {
  const postBlock =
    posts
      .map(
        (post) =>
          `ID:${post.id}\nTEXT:${post.text}`
      )
      .join(
        "\n\n"
      );

  return [
    {
      role: "system",

      content:
        "Classify each social-media post independently.\n" +
        "Return ONLY valid JSON. No markdown or explanation.\n\n" +

        "Output:\n" +

        '{"results":[{"id":"POST_ID","polarity":{"label":"positive|neutral|negative","confidence":0.0},"emotions":[{"label":"joy|sadness|anger|fear|anxiety|excitement|surprise|disgust|frustration|hope|love|disappointment|confusion","confidence":0.0}],"stance":{"label":"supportive|against|neutral","confidence":0.0},"sarcasm":{"detected":false,"confidence":0.0}}]}\n\n' +

        "Rules:\n" +
        "- Exactly one result per input post.\n" +
        "- Preserve every ID exactly.\n" +
        "- Use only the allowed labels.\n" +
        "- Confidence values must be between 0 and 1.\n" +
        "- Return at most 2 emotions per post.\n" +
        "- Return only the strongest emotions.\n" +
        "- Return [] when no clear emotion is present.\n" +
        "- Analyze every post independently.\n" +
        "- Do not merge posts.\n" +
        "- Do not omit posts.\n" +
        "- Do not add posts.\n" +
        "- Do not add extra fields.\n" +
        "- Return exactly one JSON object.",
    },

    {
      role: "user",
      content:
        postBlock,
    },
  ];
}

// ============================================================================
// Confidence helper
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
// Extract JSON object
// ============================================================================
//
// Handles:
//
//   raw JSON
//
// and defensively:
//
//   ```json
//   {...}
//   ```
//
// The model is still instructed not to use markdown.
//
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

  // First attempt:
  // parse the entire response.

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    // Continue to defensive extraction.
  }

  // Second attempt:
  // extract the outer JSON object.

  const firstBrace =
    cleaned.indexOf(
      "{"
    );

  const lastBrace =
    cleaned.lastIndexOf(
      "}"
    );

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

function parseIndividualResult(
  result
) {
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

  if (
    !Array.isArray(
      result?.emotions
    )
  ) {
    return null;
  }

  /*
   * The prompt limits emotions to 2.
   *
   * The parser also enforces this so a model
   * violating the prompt cannot silently inflate
   * output downstream.
   */

  if (
    result.emotions.length > 2
  ) {
    return null;
  }

  const emotions =
    result.emotions
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
      .filter(
        Boolean
      );

  /*
   * If the model returned malformed emotion objects,
   * do not silently discard them.
   *
   * The original array length tells us whether anything
   * was invalid.
   */

  if (
    emotions.length !==
    result.emotions.length
  ) {
    return null;
  }

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
  // Preserve exact expected schema
  // ========================================================================

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

  const expectedIds =
    new Set(
      expectedPosts.map(
        (post) => post.id
      )
    );

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
      return null;
    }

    /*
     * Reject IDs that were not requested.
     */

    if (
      !expectedIds.has(
        id
      )
    ) {
      console.warn(
        `[Tier 2] Unexpected result ID returned by model: ${id}`
      );

      return null;
    }

    const normalized =
      parseIndividualResult(
        result
      );

    if (!normalized) {
      console.warn(
        `[Tier 2] Invalid result for POST_ID: ${id}`
      );

      return null;
    }

    /*
     * Reject duplicate IDs.
     *
     * Never silently overwrite an existing result.
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
  // Exact result count
  // ========================================================================

  if (
    byId.size !==
    expectedPosts.length
  ) {
    console.warn(
      `[Tier 2] Model returned ${byId.size} valid results ` +
      `for ${expectedPosts.length} expected posts.`
    );

    return null;
  }

  // ========================================================================
  // Reconstruct output in original input order
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

  return output;
}

// ============================================================================
// Retry-After parser
// ============================================================================

function getRetryAfterMs(
  response
) {
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
    return (
      seconds *
      1000
    );
  }

  const date =
    Date.parse(
      value
    );

  if (
    !Number.isNaN(date)
  ) {
    return Math.max(
      0,
      date -
      Date.now()
    );
  }

  return null;
}

// ============================================================================
// Backoff
// ============================================================================

function calculateBackoff(
  attempt
) {
  const exponential =
    INITIAL_BACKOFF_MS *
    Math.pow(
      2,
      attempt
    );

  const capped =
    Math.min(
      MAX_BACKOFF_MS,
      exponential
    );

  const jitter =
    Math.floor(
      Math.random() *
      1000
    );

  return (
    capped +
    jitter
  );
}

// ============================================================================
// Global cooldown setter
// ============================================================================

function activateGlobalCooldown(
  delayMs
) {
  const cooldownUntil =
    Date.now() +
    Math.max(
      0,
      delayMs
    );

  globalCooldownUntil =
    Math.max(
      globalCooldownUntil,
      cooldownUntil
    );
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
    clearTimeout(
      timeout
    );
  }
}

// ============================================================================
// Safely read response body
// ============================================================================

async function readResponseBody(
  response
) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

// ============================================================================
// Rate-limit diagnostics
// ============================================================================

function logRateLimitDiagnostics(
  response,
  body
) {
  console.warn(
    "[Tier 2] Groq rate-limit headers:",
    {
      retryAfter:
        response.headers.get(
          "retry-after"
        ),

      limitRequests:
        response.headers.get(
          "x-ratelimit-limit-requests"
        ),

      remainingRequests:
        response.headers.get(
          "x-ratelimit-remaining-requests"
        ),

      resetRequests:
        response.headers.get(
          "x-ratelimit-reset-requests"
        ),

      limitTokens:
        response.headers.get(
          "x-ratelimit-limit-tokens"
        ),

      remainingTokens:
        response.headers.get(
          "x-ratelimit-remaining-tokens"
        ),

      resetTokens:
        response.headers.get(
          "x-ratelimit-reset-tokens"
        ),
    }
  );

  /*
   * The response body is important for diagnosing
   * OTPM / TPM / RPM-specific failures.
   */

  console.warn(
    "[Tier 2] Groq 429 response body:",
    body
  );
}

// ============================================================================
// Hosted model — ONE batch = ONE request
// ============================================================================
//
// IMPORTANT:
//
// This function NEVER chunks.
//
// Chunking happens ONLY inside classifyTier2Batch().
//
// ============================================================================

async function callHostedModelBatch(
  posts
) {

  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const messages =
    buildMessages(
      posts
    );

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

                messages,

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

        activateGlobalCooldown(
          wait
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

      activateGlobalCooldown(
        wait
      );

      await sleep(
        wait
      );

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

      if (!choice) {
        throw new Error(
          "Tier 2 response contained no model choice."
        );
      }

      const raw =
        choice?.message?.content ??
        "";

      // ======================================================================
      // Empty response
      // ======================================================================

      if (
        !raw.trim()
      ) {
        throw new Error(
          "Tier 2 returned an empty model response."
        );
      }

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

      // ======================================================================
      // Parse + validate
      // ======================================================================

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
    // 401 / 403
    // ========================================================================
    //
    // Permanent authentication/configuration errors.
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

      logRateLimitDiagnostics(
        response,
        body
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

      /*
       * Respect Retry-After when supplied.
       *
       * Otherwise use exponential backoff.
       */

      const wait =
        Math.max(
          retryAfter ?? 0,
          exponentialBackoff
        ) +
        jitter;

      activateGlobalCooldown(
        wait
      );

      if (
        attempt >=
        MAX_RETRIES
      ) {

        throw new Error(
          `Tier 2 rate limit persisted after ` +
          `${MAX_RETRIES} retries. ` +
          `Groq response: ${body}`
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
      response.status >= 500 &&
      response.status <= 599
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

      activateGlobalCooldown(
        wait
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
// Chunk posts
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
// Compatibility helper.
//
// The existing pipeline can continue using:
//
//   classifyTier2(text)
//
// It internally uses the exact same batch implementation.
//
// ============================================================================

export async function classifyTier2(
  text
) {
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
//   8 uncertain posts
//
// with:
//
//   TIER2_BATCH_SIZE=3
//
// becomes:
//
//   3 + 3 + 2
//
// Therefore:
//
//   3 Groq requests
//
// ============================================================================

export async function classifyTier2Batch(
  posts
) {

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
  // Sequential execution
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
          `Tier 2 returned ` +
          `${results?.length ?? 0} results ` +
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

      console.error(
        `[Tier 2] Batch ${i + 1}/${batches.length} failed: ` +
        `${error?.message ?? error}`
      );

      /*
       * Intentionally fail the entire Tier 2 call.
       *
       * We do NOT silently convert the failed batch
       * into multiple single-post calls.
       *
       * This preserves the batching contract.
       */

      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Final count check
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

  // --------------------------------------------------------------------------
  // Final ID validation
  // --------------------------------------------------------------------------

  const expectedIds =
    normalized.map(
      (post) => post.id
    );

  const actualIds =
    allResults.map(
      (result) => result.id
    );

  for (
    let i = 0;
    i < expectedIds.length;
    i++
  ) {
    if (
      expectedIds[i] !==
      actualIds[i]
    ) {
      throw new Error(
        `Tier 2 result ordering mismatch at index ${i}. ` +
        `Expected ${expectedIds[i]}, ` +
        `received ${actualIds[i]}.`
      );
    }
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
  `  API key configured: ${Boolean(
    GROQ_API_KEY
  )}`
);

if (
  GROQ_API_KEY
) {
  console.log(
    `  API key prefix: ${GROQ_API_KEY.slice(
      0,
      8
    )}...`
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
  "  Retry-After support: enabled"
);

console.log(
  "  Exponential backoff + jitter: enabled"
);

console.log(
  "  Rate-limit diagnostics: enabled"
);

console.log(
  "  429 response-body diagnostics: enabled"
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

console.log(
  "  Maximum emotions/post: 2"
);

console.log(
  "  Canonical-data mutation: disabled"
);
