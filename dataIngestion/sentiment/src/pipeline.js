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
// Tier 1 handles high-confidence polarity classification locally.
// Only uncertain posts are sent to Tier 2.
//
// Tier 2 provides multidimensional analysis:
//
//   - polarity
//   - emotions
//   - stance
//   - sarcasm
//   - reason
//
// IMPORTANT:
//
// This module operates on text extracted from canonical events.
// It produces DERIVED sentiment analytics.
//
// It must NOT mutate the canonical event or replace the raw collection.
// ============================================================================

import {
  classifyTier1,
  classifyTier1Batch,
} from "./tier1.js";

import {
  classifyTier2,
} from "./tier2.js";

// ============================================================================
// Configuration
// ============================================================================

const TIER1_THRESHOLD =
  Number(process.env.TIER1_THRESHOLD) || 0.75;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a Tier 1 polarity result into the common multidimensional
 * sentiment result contract.
 *
 * Tier 1 only understands polarity, so dimensions that require deeper
 * semantic analysis remain null/empty rather than being fabricated.
 */
function normalizeTier1Result(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid Tier 1 sentiment result."
    );
  }

  return {
    polarity: {
      label:
        result.label ?? null,

      confidence:
        typeof result.score === "number"
          ? result.score
          : null,
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

/**
 * Validate and normalize a Tier 2 result.
 *
 * Tier 2 is expected to already return the multidimensional contract.
 */
function normalizeTier2Result(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid Tier 2 sentiment result."
    );
  }

  return {
    polarity:
      result.polarity ?? {
        label: null,
        confidence: null,
      },

    emotions:
      Array.isArray(result.emotions)
        ? result.emotions
        : [],

    stance:
      result.stance ?? {
        label: null,
        confidence: null,
      },

    sarcasm:
      result.sarcasm ?? {
        detected: null,
        confidence: null,
      },

    tier: 2,

    reason:
      result.reason ?? null,
  };
}

// ============================================================================
// Single Text Analysis
// ============================================================================

/**
 * Run the two-tier sentiment pipeline on one piece of text.
 *
 * Tier 1:
 *   Fast local transformer.
 *
 * Tier 2:
 *   Hosted LLM used only when Tier 1 confidence is insufficient.
 *
 * @param {string} text
 *
 * @returns {Promise<{
 *   polarity: {
 *     label: "positive"|"neutral"|"negative"|null,
 *     confidence: number|null
 *   },
 *   emotions: Array<{
 *     label: string,
 *     confidence: number
 *   }>,
 *   stance: {
 *     label: "supportive"|"against"|"neutral"|null,
 *     confidence: number|null
 *   },
 *   sarcasm: {
 *     detected: boolean|null,
 *     confidence: number|null
 *   },
 *   tier: 1|2|null,
 *   reason: string|null
 * }>}
 */
export async function analyzeSentiment(text) {
  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
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

      reason:
        "No text available.",
    };
  }

  // ==========================================================================
  // Tier 1 — Local Transformer
  // ==========================================================================

  const tier1 =
    await classifyTier1(text);

  if (
    tier1 &&
    typeof tier1.score === "number" &&
    tier1.score >= TIER1_THRESHOLD
  ) {
    return normalizeTier1Result(
      tier1
    );
  }

  // ==========================================================================
  // Tier 2 — Hosted LLM
  // ==========================================================================

  const tier2 =
    await classifyTier2(text);

  return normalizeTier2Result(
    tier2
  );
}

// ============================================================================
// Batch Analysis
// ============================================================================

/**
 * Optimised two-tier batch pipeline.
 *
 * Phase 1:
 *   Run every post through the local Tier 1 transformer in one batch.
 *
 * Phase 2:
 *   Only uncertain posts are escalated to the hosted Tier 2 model.
 *
 * Tier 1:
 *   - polarity
 *
 * Tier 2:
 *   - polarity
 *   - emotions
 *   - stance
 *   - sarcasm
 *   - reasoning
 *
 * @param {string[]} texts
 *
 * @returns {Promise<Array<{
 *   polarity: {
 *     label: "positive"|"neutral"|"negative"|null,
 *     confidence: number|null
 *   },
 *   emotions: Array<{
 *     label: string,
 *     confidence: number
 *   }>,
 *   stance: {
 *     label: "supportive"|"against"|"neutral"|null,
 *     confidence: number|null
 *   },
 *   sarcasm: {
 *     detected: boolean|null,
 *     confidence: number|null
 *   },
 *   tier: 1|2|null,
 *   reason: string|null
 * }>>}
 */
export async function analyzeBatch(texts) {
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
  // Phase 1 — Tier 1 Batch Classification
  // ==========================================================================

  console.log(
    `\n[Tier 1] Batch-classifying ${total} posts...`
  );

  const tier1Results =
    await classifyTier1Batch(texts);

  if (
    !Array.isArray(tier1Results) ||
    tier1Results.length !== total
  ) {
    throw new Error(
      `Tier 1 returned ` +
      `${tier1Results?.length ?? 0} results ` +
      `for ${total} texts.`
    );
  }

  const escalationQueue = [];

  let tier1Resolved = 0;

  // ==========================================================================
  // Process Tier 1 Results
  // ==========================================================================

  for (
    let i = 0;
    i < total;
    i++
  ) {
    const tier1 =
      tier1Results[i];

    if (
      tier1 &&
      typeof tier1.score === "number" &&
      tier1.score >= TIER1_THRESHOLD
    ) {
      results[i] =
        normalizeTier1Result(
          tier1
        );

      tier1Resolved++;

      console.log(
        `[${i + 1}/${total}] ` +
        `tier=1 ` +
        `label=${tier1.label} ` +
        `confidence=${tier1.score.toFixed(2)}`
      );
    } else {
      escalationQueue.push(i);

      console.log(
        `[${i + 1}/${total}] ` +
        `tier=1 ` +
        `confidence=${typeof tier1?.score === "number"
          ? tier1.score.toFixed(2)
          : "n/a"
        } ` +
        `→ tier=2`
      );
    }
  }

  // ==========================================================================
  // Phase 2 — Tier 2 Escalation
  // ==========================================================================

  console.log(
    `\n[Tier 1] Resolved ` +
    `${tier1Resolved}/${total}. ` +
    `Escalating ` +
    `${escalationQueue.length} ` +
    `posts to Tier 2...\n`
  );

  for (
    const index of escalationQueue
  ) {
    const text =
      texts[index];

    // ------------------------------------------------------------------------
    // No usable text
    // ------------------------------------------------------------------------

    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      results[index] = {
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

        reason:
          "No text available.",
      };

      continue;
    }

    // ------------------------------------------------------------------------
    // Tier 2 — Hosted LLM
    // ------------------------------------------------------------------------

    const tier2 =
      await classifyTier2(text);

    if (!tier2) {
      throw new Error(
        `Tier 2 returned no result ` +
        `for text at index ${index}.`
      );
    }

    results[index] =
      normalizeTier2Result(
        tier2
      );

    console.log(
      `[${index + 1}/${total}] ` +
      `tier=2 ` +
      `polarity=${tier2.polarity?.label ??
      "unknown"
      } ` +
      `confidence=${typeof tier2.polarity?.confidence ===
        "number"
        ? tier2.polarity.confidence.toFixed(2)
        : "n/a"
      }`
    );
  }

  // ==========================================================================
  // Summary
  // ==========================================================================

  const tier2Resolved =
    results.filter(
      (result) =>
        result?.tier === 2
    ).length;

  console.log(
    `\n[Sentiment] Complete: ` +
    `total=${total}, ` +
    `tier1=${tier1Resolved}, ` +
    `tier2=${tier2Resolved}`
  );

  return results;
}
