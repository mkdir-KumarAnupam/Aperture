// ============================================================================
// SENTIMENT — TIER 1
// ============================================================================
//
// Fast, local sentiment classifier.
//
// Model:
//   Xenova/twitter-roberta-base-sentiment-latest
//
// Purpose:
//   - Run locally with Transformers.js
//   - No hosted API calls
//   - Batch classification for efficient processing
//   - Provide confidence scores to the two-tier orchestrator
//
// Pipeline:
//
//   canonical.events
//          │
//          ▼
//   event.content.text
//          │
//          ▼
//   Tier 1 — Local Transformer
//          │
//          ├── confidence >= threshold → resolved
//          │
//          └── low confidence → Tier 2
//
// IMPORTANT:
//
// This module does NOT modify canonical events.
// It only receives text and returns derived sentiment predictions.
// ============================================================================

import { pipeline } from "@xenova/transformers";

// ============================================================================
// Configuration
// ============================================================================

const MODEL_NAME =
  "Xenova/twitter-roberta-base-sentiment-latest";

const DEFAULT_BATCH_SIZE = 8;

// ============================================================================
// Lazy Model Loading
// ============================================================================
//
// Model loading is expensive, so keep a single shared Promise.
//
// Multiple calls to classifyTier1() / classifyTier1Batch() will reuse the
// same model instance instead of loading the transformer repeatedly.
// ============================================================================

let classifierPromise = null;

function getClassifier() {
  if (!classifierPromise) {
    console.log(
      `[Tier 1] Loading local sentiment model: ${MODEL_NAME}`
    );

    classifierPromise = pipeline(
      "sentiment-analysis",
      MODEL_NAME
    );
  }

  return classifierPromise;
}

// ============================================================================
// Helpers
// ============================================================================

function validateText(text) {
  return (
    typeof text === "string" &&
    text.trim().length > 0
  );
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error(
      "Tier 1 returned an invalid classification result."
    );
  }

  if (
    typeof result.label !== "string" ||
    typeof result.score !== "number"
  ) {
    throw new Error(
      "Tier 1 returned an invalid label or confidence score."
    );
  }

  return {
    label: result.label.toLowerCase(),
    score: result.score,
  };
}

// ============================================================================
// Single Classification
// ============================================================================

/**
 * Classify a single piece of text locally.
 *
 * @param {string} text
 *
 * @returns {Promise<{
 *   label: "positive"|"neutral"|"negative",
 *   score: number
 * }>}
 */
export async function classifyTier1(text) {
  if (!validateText(text)) {
    throw new Error(
      "Tier 1 requires non-empty text."
    );
  }

  const classifier = await getClassifier();

  const [result] =
    await classifier(text);

  return normalizeResult(result);
}

// ============================================================================
// Batch Classification
// ============================================================================

/**
 * Classify multiple texts using the local transformer.
 *
 * The input is processed in chunks to avoid excessive CPU/memory usage.
 *
 * @param {string[]} texts
 *
 * @returns {Promise<Array<{
 *   label: "positive"|"neutral"|"negative"|null,
 *   score: number|null
 * }>>}
 */
export async function classifyTier1Batch(texts) {
  if (!Array.isArray(texts)) {
    throw new TypeError(
      "classifyTier1Batch() expects an array of texts."
    );
  }

  if (texts.length === 0) {
    return [];
  }

  const classifier =
    await getClassifier();

  const batchSize =
    Number(process.env.TIER1_BATCH_SIZE) ||
    DEFAULT_BATCH_SIZE;

  if (
    !Number.isInteger(batchSize) ||
    batchSize <= 0
  ) {
    throw new Error(
      "TIER1_BATCH_SIZE must be a positive integer."
    );
  }

  const results = [];

  console.log(
    `[Tier 1] Classifying ${texts.length} texts ` +
    `in batches of ${batchSize}.`
  );

  for (
    let i = 0;
    i < texts.length;
    i += batchSize
  ) {
    const chunk =
      texts.slice(i, i + batchSize);

    /*
     * Empty/invalid text should not normally reach this function because
     * the sentiment worker filters event.content.text before calling it.
     *
     * We still handle it here so this module remains safe when used
     * independently.
     */
    const validTexts = chunk.map(
      validateText
    );

    if (
      validTexts.some(
        (valid) => !valid
      )
    ) {
      throw new Error(
        `Tier 1 received empty or invalid text ` +
        `in batch starting at index ${i}.`
      );
    }

    const chunkResults =
      await classifier(chunk);

    if (
      !Array.isArray(chunkResults) ||
      chunkResults.length !== chunk.length
    ) {
      throw new Error(
        `Tier 1 returned ${chunkResults?.length ?? 0} ` +
        `results for ${chunk.length} texts.`
      );
    }

    results.push(
      ...chunkResults.map(
        normalizeResult
      )
    );

    console.log(
      `[Tier 1] Processed ` +
      `${Math.min(i + batchSize, texts.length)}/` +
      `${texts.length}`
    );
  }

  return results;
}
