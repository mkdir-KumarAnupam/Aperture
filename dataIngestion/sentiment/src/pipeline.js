// ============================================================================
// SENTIMENT ANALYSIS PIPELINE
// ============================================================================
//
// Two-tier sentiment classification:
//
//   Tier 1 → Fast local transformer
//       │
//       ├── High confidence → DONE
//       │
//       └── Low confidence
//                │
//                ▼
//          Tier 2 → Hosted LLM
//
// Tier 1:
//   - Fast
//   - Local
//   - Polarity
//
// Tier 2:
//   - Hosted LLM
//   - Polarity
//   - Emotions
//   - Stance
//   - Sarcasm
//   - Reason
//
// IMPORTANT:
//
// This module produces DERIVED analytics.
// It must NOT mutate canonical events.
//
// BATCHING:
//
//   Tier 1 batching is handled here through classifyTier1Batch().
//
//   Tier 2 batching is handled ONLY inside tier2.js through
//   classifyTier2Batch().
//
//   This module MUST NOT chunk the Tier 2 queue.
//
// ============================================================================

import {
  classifyTier1,
  classifyTier1Batch,
} from "./tier1.js";

import {
  classifyTier2,
  classifyTier2Batch,
} from "./tier2.js";

// ============================================================================
// Configuration
// ============================================================================

const TIER1_THRESHOLD =
  Number(process.env.TIER1_THRESHOLD) || 0.75;

// ============================================================================
// Empty Result
// ============================================================================

function emptySentimentResult(reason = null) {
  return {
    polarity: {
      label: null,
      confidence: null,
    },

    emotions: [],

    stance: {
      label: null,
      confidence: null,
    },

    sarcasm: {
      detected: null,
      confidence: null,
    },

    tier: null,

    reason,
  };
}

// ============================================================================
// Normalize Tier 1
// ============================================================================

function normalizeTier1Result(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid Tier 1 sentiment result."
    );
  }

  const label =
    typeof result.label === "string"
      ? result.label
        .toLowerCase()
        .trim()
      : null;

  const confidence =
    typeof result.score === "number"
      ? Math.min(
        1,
        Math.max(0, result.score)
      )
      : null;

  if (
    !label ||
    confidence === null
  ) {
    throw new Error(
      "Tier 1 returned an invalid label or confidence."
    );
  }

  return {
    polarity: {
      label,
      confidence,
    },

    emotions: [],

    stance: {
      label: null,
      confidence: null,
    },

    sarcasm: {
      detected: null,
      confidence: null,
    },

    tier: 1,

    reason: null,
  };
}

// ============================================================================
// Normalize Tier 2
// ============================================================================

function normalizeTier2Result(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid Tier 2 sentiment result."
    );
  }

  // --------------------------------------------------------------------------
  // Polarity
  // --------------------------------------------------------------------------

  const polarityLabel =
    typeof result?.polarity?.label ===
      "string"
      ? result.polarity.label
        .toLowerCase()
        .trim()
      : null;

  const polarityConfidence =
    typeof result?.polarity?.confidence ===
      "number"
      ? Math.min(
        1,
        Math.max(
          0,
          result.polarity.confidence
        )
      )
      : null;

  if (
    !polarityLabel ||
    polarityConfidence === null
  ) {
    throw new Error(
      "Tier 2 returned an invalid polarity."
    );
  }

  // --------------------------------------------------------------------------
  // Emotions
  // --------------------------------------------------------------------------

  const emotions =
    Array.isArray(result.emotions)
      ? result.emotions
        .filter(
          (emotion) =>
            emotion &&
            typeof emotion.label ===
            "string" &&
            typeof emotion.confidence ===
            "number"
        )
        .map((emotion) => ({
          label:
            emotion.label
              .toLowerCase()
              .trim(),

          confidence:
            Math.min(
              1,
              Math.max(
                0,
                emotion.confidence
              )
            ),
        }))
      : [];

  // --------------------------------------------------------------------------
  // Stance
  // --------------------------------------------------------------------------

  const stanceLabel =
    typeof result?.stance?.label ===
      "string"
      ? result.stance.label
        .toLowerCase()
        .trim()
      : null;

  const stanceConfidence =
    typeof result?.stance?.confidence ===
      "number"
      ? Math.min(
        1,
        Math.max(
          0,
          result.stance.confidence
        )
      )
      : null;

  // --------------------------------------------------------------------------
  // Sarcasm
  // --------------------------------------------------------------------------

  const sarcasmDetected =
    typeof result?.sarcasm?.detected ===
      "boolean"
      ? result.sarcasm.detected
      : null;

  const sarcasmConfidence =
    typeof result?.sarcasm?.confidence ===
      "number"
      ? Math.min(
        1,
        Math.max(
          0,
          result.sarcasm.confidence
        )
      )
      : null;

  // --------------------------------------------------------------------------
  // Reason
  // --------------------------------------------------------------------------

  const reason =
    typeof result.reason === "string"
      ? result.reason
        .trim()
        .slice(0, 300) || null
      : null;

  // --------------------------------------------------------------------------
  // Final
  // --------------------------------------------------------------------------

  return {
    polarity: {
      label: polarityLabel,
      confidence: polarityConfidence,
    },

    emotions,

    stance: {
      label: stanceLabel,
      confidence: stanceConfidence,
    },

    sarcasm: {
      detected: sarcasmDetected,
      confidence: sarcasmConfidence,
    },

    tier: 2,

    reason,
  };
}

// ============================================================================
// Tier 2 Batch Result Extraction
// ============================================================================
//
// Supports:
//
//   classifyTier2Batch() → [ ... ]
//
// and:
//
//   classifyTier2Batch() → { results: [ ... ] }
//
// ============================================================================

function extractTier2Results(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (
    response &&
    typeof response === "object" &&
    Array.isArray(response.results)
  ) {
    return response.results;
  }

  throw new Error(
    "Tier 2 batch returned an invalid response shape."
  );
}

// ============================================================================
// Tier 2 Result Identity
// ============================================================================
//
// Each Tier 2 request receives:
//
//   {
//     id: "0",
//     text: "..."
//   }
//
// We use the ID to map the LLM response back to the original text.
//
// ============================================================================

function getTier2ResultId(result) {
  if (
    result &&
    typeof result === "object"
  ) {
    if (
      result.id !== undefined &&
      result.id !== null
    ) {
      return String(result.id);
    }

    if (
      result.eventId !== undefined &&
      result.eventId !== null
    ) {
      return String(result.eventId);
    }

    if (
      result.index !== undefined &&
      result.index !== null
    ) {
      return String(result.index);
    }
  }

  return null;
}

// ============================================================================
// Single Text Analysis
// ============================================================================
//
// This function remains useful for callers that only need one text.
//
// For bulk processing, analyzeBatch() should be used because it enables
// efficient Tier 2 batching.
// ============================================================================

export async function analyzeSentiment(text) {
  // --------------------------------------------------------------------------
  // Validate
  // --------------------------------------------------------------------------

  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    return emptySentimentResult(
      "No text available."
    );
  }

  const cleanText =
    text.trim();

  // --------------------------------------------------------------------------
  // Tier 1
  // --------------------------------------------------------------------------

  let tier1;

  try {
    tier1 =
      await classifyTier1(
        cleanText
      );
  } catch (error) {
    console.error(
      "[Sentiment] Tier 1 failed:",
      error?.message ?? error
    );

    /*
     * For the single-text API, Tier 2 fallback is reasonable.
     *
     * Bulk analyzeBatch() deliberately does NOT do this because doing so
     * for a whole failed Tier 1 batch could overwhelm the LLM provider.
     */

    try {
      const tier2 =
        await classifyTier2(
          cleanText
        );

      return normalizeTier2Result(
        tier2
      );
    } catch (tier2Error) {
      return emptySentimentResult(
        `Tier 1 and Tier 2 failed: ${tier2Error?.message ??
        "unknown error"
        }`
      );
    }
  }

  // --------------------------------------------------------------------------
  // High-confidence Tier 1
  // --------------------------------------------------------------------------

  if (
    tier1 &&
    typeof tier1.score === "number" &&
    Number.isFinite(tier1.score) &&
    tier1.score >= TIER1_THRESHOLD
  ) {
    try {
      return normalizeTier1Result(
        tier1
      );
    } catch (error) {
      console.error(
        "[Sentiment] Invalid Tier 1 result:",
        error?.message ?? error
      );
    }
  }

  // --------------------------------------------------------------------------
  // Low-confidence → Tier 2
  // --------------------------------------------------------------------------

  console.log(
    `[Sentiment] Tier 1 confidence ` +
    `${typeof tier1?.score ===
      "number"
      ? tier1.score.toFixed(2)
      : "n/a"
    } < ${TIER1_THRESHOLD}. ` +
    `Escalating to Tier 2.`
  );

  try {
    const tier2 =
      await classifyTier2(
        cleanText
      );

    return normalizeTier2Result(
      tier2
    );
  } catch (error) {
    console.error(
      "[Sentiment] Tier 2 failed:",
      error?.message ?? error
    );

    /*
     * Preserve the Tier 1 result rather than throwing it away.
     */

    try {
      return {
        ...normalizeTier1Result(
          tier1
        ),

        reason:
          `Tier 2 unavailable: ${error?.message ??
          "unknown error"
          }`,
      };
    } catch {
      return emptySentimentResult(
        `Tier 2 failed: ${error?.message ??
        "unknown error"
        }`
      );
    }
  }
}

// ============================================================================
// Batch Analysis
// ============================================================================
//
// IMPORTANT:
//
// This is the main production path.
//
// Tier 1:
//
//   30 posts
//       │
//       ▼
//   classifyTier1Batch()
//       │
//       ├── confident → DONE
//       │
//       └── uncertain
//              │
//              ▼
//        tier2Queue
//
// Tier 2:
//
//   ALL uncertain posts are passed to classifyTier2Batch() ONCE.
//
//   classifyTier2Batch() in tier2.js owns the batching.
//
// Example:
//
//   17 uncertain posts
//          │
//          ▼
//   classifyTier2Batch(17)
//          │
//          ▼
//   tier2.js:
//      5 + 5 + 5 + 2
//          │
//          ▼
//   4 Groq requests
//
// pipeline.js does NOT perform this chunking.
//
// ============================================================================

export async function analyzeBatch(
  texts
) {
  if (!Array.isArray(texts)) {
    throw new TypeError(
      "analyzeBatch() expects an array of texts."
    );
  }

  if (texts.length === 0) {
    return [];
  }

  const total =
    texts.length;

  const results =
    new Array(total);

  // ==========================================================================
  // Phase 0 — Validate Input
  // ==========================================================================

  const validIndexes = [];
  const validTexts = [];

  for (
    let i = 0;
    i < total;
    i++
  ) {
    const text =
      texts[i];

    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      results[i] =
        emptySentimentResult(
          "No text available."
        );

      console.log(
        `[${i + 1}/${total}] ` +
        `no text → skipped`
      );

      continue;
    }

    validIndexes.push(i);

    validTexts.push(
      text.trim()
    );
  }

  if (
    validTexts.length === 0
  ) {
    console.log(
      "[Sentiment] No valid texts to analyze."
    );

    return results;
  }

  // ==========================================================================
  // Phase 1 — Tier 1
  // ==========================================================================

  console.log(
    `\n[Tier 1] Batch-classifying ` +
    `${validTexts.length} valid posts...`
  );

  let tier1Results;

  try {
    tier1Results =
      await classifyTier1Batch(
        validTexts
      );
  } catch (error) {
    /*
     * IMPORTANT:
     *
     * A Tier 1 infrastructure failure is NOT equivalent to low confidence.
     *
     * DO NOT:
     *
     *   Tier 1 failed
     *       ↓
     *   send every post to Groq
     *
     * That can cause a massive rate-limit event.
     */

    console.error(
      "[Tier 1] Batch classification failed:",
      error?.message ?? error
    );

    console.warn(
      `[Sentiment] Tier 1 unavailable for ` +
      `${validTexts.length} posts. ` +
      `Tier 2 fallback disabled for this batch.`
    );

    for (
      let i = 0;
      i < validIndexes.length;
      i++
    ) {
      const originalIndex =
        validIndexes[i];

      results[originalIndex] =
        emptySentimentResult(
          `Tier 1 batch failed: ${error?.message ??
          "unknown error"
          }`
        );
    }

    return results;
  }

  // ==========================================================================
  // Validate Tier 1 Response
  // ==========================================================================

  if (
    !Array.isArray(tier1Results) ||
    tier1Results.length !==
    validTexts.length
  ) {
    console.error(
      "[Tier 1] Invalid batch response."
    );

    for (
      let i = 0;
      i < validIndexes.length;
      i++
    ) {
      const originalIndex =
        validIndexes[i];

      results[originalIndex] =
        emptySentimentResult(
          "Tier 1 returned an invalid batch response."
        );
    }

    return results;
  }

  // ==========================================================================
  // Phase 2 — Classify Tier 1 Results
  // ==========================================================================

  const escalationQueue = [];

  let tier1Resolved = 0;

  for (
    let i = 0;
    i < validTexts.length;
    i++
  ) {
    const originalIndex =
      validIndexes[i];

    const tier1 =
      tier1Results[i];

    // ------------------------------------------------------------------------
    // High-confidence Tier 1
    // ------------------------------------------------------------------------

    if (
      tier1 &&
      typeof tier1.score ===
      "number" &&
      Number.isFinite(
        tier1.score
      ) &&
      tier1.score >=
      TIER1_THRESHOLD
    ) {
      try {
        results[originalIndex] =
          normalizeTier1Result(
            tier1
          );

        tier1Resolved++;

        console.log(
          `[${originalIndex + 1}/${total}] ` +
          `tier=1 ` +
          `label=${tier1.label} ` +
          `confidence=${tier1.score.toFixed(
            2
          )}`
        );

        continue;
      } catch (error) {
        console.warn(
          `[${originalIndex + 1}/${total}] ` +
          `Invalid Tier 1 result → tier=2`
        );
      }
    }

    // ------------------------------------------------------------------------
    // Low confidence → queue for Tier 2
    // ------------------------------------------------------------------------

    escalationQueue.push(i);

    console.log(
      `[${originalIndex + 1}/${total}] ` +
      `tier=1 ` +
      `confidence=${typeof tier1?.score ===
        "number"
        ? tier1.score.toFixed(2)
        : "n/a"
      } → tier=2`
    );
  }

  // ==========================================================================
  // No Tier 2 Work
  // ==========================================================================

  if (
    escalationQueue.length ===
    0
  ) {
    console.log(
      `\n[Sentiment] Complete: ` +
      `total=${total}, ` +
      `tier1=${tier1Resolved}, ` +
      `tier2=0, ` +
      `failed=0`
    );

    return results;
  }

  // ==========================================================================
  // Phase 3 — Build Tier 2 Queue
  // ==========================================================================
  //
  // IMPORTANT:
  //
  // We collect ALL uncertain posts first.
  //
  // There is NO chunking here.
  //
  // tier2.js owns TIER2_BATCH_SIZE and chunkPosts().
  //
  // ==========================================================================

  console.log(
    `\n[Tier 1] Resolved ` +
    `${tier1Resolved}/${validTexts.length}. ` +
    `Escalating ` +
    `${escalationQueue.length} ` +
    `posts to Tier 2...`
  );

  const tier2Queue =
    escalationQueue.map(
      (localIndex) => ({
        id:
          String(localIndex),

        text:
          validTexts[
          localIndex
          ],
      })
    );

  // ==========================================================================
  // Phase 4 — Tier 2
  // ==========================================================================
  //
  // SINGLE CALL.
  //
  // classifyTier2Batch() internally performs:
  //
  //   17 posts
  //      ↓
  //   5 + 5 + 5 + 2
  //      ↓
  //   4 Groq requests
  //
  // ==========================================================================

  let tier2Resolved = 0;
  let tier2Failed = 0;

  try {
    console.log(
      `[Tier 2] Sending ${tier2Queue.length} uncertain posts ` +
      `to classifyTier2Batch().`
    );

    const response =
      await classifyTier2Batch(
        tier2Queue
      );

    // ------------------------------------------------------------------------
    // Extract response
    // ------------------------------------------------------------------------

    const tier2Results =
      extractTier2Results(
        response
      );

    // ------------------------------------------------------------------------
    // Validate count
    // ------------------------------------------------------------------------

    if (
      tier2Results.length !==
      tier2Queue.length
    ) {
      throw new Error(
        `Tier 2 returned ` +
        `${tier2Results.length} results ` +
        `for ${tier2Queue.length} posts.`
      );
    }

    // ------------------------------------------------------------------------
    // Build result lookup
    // ------------------------------------------------------------------------

    const resultsById =
      new Map();

    let hasIds = true;

    for (
      const tier2Result of
      tier2Results
    ) {
      const id =
        getTier2ResultId(
          tier2Result
        );

      if (id === null) {
        hasIds = false;
        break;
      }

      if (
        resultsById.has(id)
      ) {
        throw new Error(
          `Tier 2 returned duplicate result ID: ${id}`
        );
      }

      resultsById.set(
        id,
        tier2Result
      );
    }

    // ------------------------------------------------------------------------
    // Attach results
    // ------------------------------------------------------------------------

    for (
      let position = 0;
      position < tier2Queue.length;
      position++
    ) {
      const item =
        tier2Queue[position];

      const localIndex =
        Number(item.id);

      const originalIndex =
        validIndexes[
        localIndex
        ];

      // ----------------------------------------------------------------------
      // Prefer ID mapping.
      //
      // If the implementation does not return IDs, fall back to positional
      // matching.
      // ----------------------------------------------------------------------

      const rawResult =
        hasIds
          ? resultsById.get(
            String(item.id)
          )
          : tier2Results[
          position
          ];

      // ----------------------------------------------------------------------
      // Missing result
      // ----------------------------------------------------------------------

      if (
        !rawResult
      ) {
        tier2Failed++;

        console.error(
          `[${originalIndex + 1}/${total}] ` +
          `Tier 2 did not return a result.`
        );

        /*
         * Preserve Tier 1.
         */

        try {
          results[originalIndex] =
            normalizeTier1Result(
              tier1Results[
              localIndex
              ]
            );

          results[
            originalIndex
          ].reason =
            "Tier 2 returned no result for this post.";
        } catch {
          results[originalIndex] =
            emptySentimentResult(
              "Tier 2 returned no result."
            );
        }

        continue;
      }

      // ----------------------------------------------------------------------
      // Normalize Tier 2
      // ----------------------------------------------------------------------

      try {
        results[originalIndex] =
          normalizeTier2Result(
            rawResult
          );

        tier2Resolved++;

        console.log(
          `[${originalIndex + 1}/${total}] ` +
          `tier=2 ` +
          `polarity=${rawResult?.polarity
            ?.label ??
          "unknown"
          } ` +
          `confidence=${typeof rawResult
            ?.polarity
            ?.confidence ===
            "number"
            ? rawResult.polarity.confidence.toFixed(
              2
            )
            : "n/a"
          }`
        );

      } catch (error) {

        // --------------------------------------------------------------------
        // Invalid Tier 2 response
        // --------------------------------------------------------------------

        tier2Failed++;

        console.error(
          `[${originalIndex + 1}/${total}] ` +
          `Invalid Tier 2 result: ` +
          `${error?.message ?? error}`
        );

        /*
         * Preserve Tier 1 rather than losing the result.
         */

        try {
          results[originalIndex] =
            normalizeTier1Result(
              tier1Results[
              localIndex
              ]
            );

          results[
            originalIndex
          ].reason =
            `Tier 2 returned invalid data: ${error?.message ??
            "unknown error"
            }`;

        } catch {
          results[originalIndex] =
            emptySentimentResult(
              `Tier 2 returned invalid data: ${error?.message ??
              "unknown error"
              }`
            );
        }
      }
    }

  } catch (error) {

    // ==========================================================================
    // Entire Tier 2 operation failed
    // ==========================================================================
    //
    // This can happen if ANY internal Tier 2 batch fails.
    //
    // IMPORTANT:
    //
    // DO NOT fall back to classifyTier2() for each post.
    //
    // That would turn:
    //
    //   5-post batch failure
    //
    // into:
    //
    //   5 individual Groq requests
    //
    // and could make your 429 problem substantially worse.
    //
    // ==========================================================================

    tier2Failed +=
      tier2Queue.length;

    console.error(
      "[Tier 2] Batch processing failed:",
      error?.message ?? error
    );

    // --------------------------------------------------------------------------
    // Preserve Tier 1 results
    // --------------------------------------------------------------------------

    for (
      const item of
      tier2Queue
    ) {
      const localIndex =
        Number(item.id);

      const originalIndex =
        validIndexes[
        localIndex
        ];

      try {
        results[originalIndex] =
          normalizeTier1Result(
            tier1Results[
            localIndex
            ]
          );

        results[
          originalIndex
        ].reason =
          `Tier 2 unavailable: ${error?.message ??
          "unknown error"
          }`;

        console.log(
          `[${originalIndex + 1}/${total}] ` +
          `Tier 2 unavailable → ` +
          `preserving Tier 1`
        );

      } catch {
        results[originalIndex] =
          emptySentimentResult(
            `Tier 2 failed: ${error?.message ??
            "unknown error"
            }`
          );
      }
    }
  }

  // ==========================================================================
  // Phase 5 — Final Summary
  // ==========================================================================

  console.log(
    `\n[Sentiment] Complete: ` +
    `total=${total}, ` +
    `tier1=${tier1Resolved}, ` +
    `tier2=${tier2Resolved}, ` +
    `tier2Failed=${tier2Failed}`
  );

  return results;
}
