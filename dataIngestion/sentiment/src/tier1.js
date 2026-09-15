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
//   - Safely handle long social-media posts
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
//
// IMPORTANT:
//
// RoBERTa has a finite maximum sequence length. Social-media content,
// scraped text, quoted posts, Telegram messages, Reddit content, etc.
// can occasionally contain thousands of tokens.
//
// Therefore every inference explicitly uses:
//   truncation: true
//   max_length: 256
//
// This prevents ONNX errors such as:
//
//   invalid expand shape
//   Name:'/roberta/Expand'
//
// ============================================================================

import { pipeline } from "@xenova/transformers";

// ============================================================================
// Configuration
// ============================================================================

const MODEL_NAME =
  "Xenova/twitter-roberta-base-sentiment-latest";

// Number of texts sent to the model at once.
const DEFAULT_BATCH_SIZE = 8;

// Maximum number of tokens processed per text.
//
// 256 is intentionally used instead of 512 because this is social-media
// sentiment analysis. Extremely long content is usually unnecessary for
// polarity classification and creates unnecessary CPU/memory pressure.
//
// If you later want to change this, keep it within the model's supported
// sequence length.
const MAX_LENGTH = 256;

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

// ============================================================================
// Normalize classifier output
// ============================================================================

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
// Classifier Options
// ============================================================================
//
// Keep these options in one place so both single and batch inference behave
// consistently.
//
// `truncation: true` is critical.
//
// Without it, a scraped post can produce thousands of tokens and cause
// ONNX Runtime to fail inside the RoBERTa model.
//
// `max_length: 256` ensures every input stays within a safe size.
// ============================================================================

const CLASSIFIER_OPTIONS = {
  truncation: true,
  max_length: MAX_LENGTH,
};

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

  const [result] = await classifier(
    text,
    CLASSIFIER_OPTIONS
  );

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
 * Each text is also explicitly truncated to MAX_LENGTH tokens.
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

  // Validate the complete input before loading/running the model.
  for (let i = 0; i < texts.length; i++) {
    if (!validateText(texts[i])) {
      throw new Error(
        `Tier 1 received empty or invalid text at index ${i}.`
      );
    }
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

  console.log(
    `[Tier 1] Maximum sequence length: ${MAX_LENGTH} tokens.`
  );

  for (
    let i = 0;
    i < texts.length;
    i += batchSize
  ) {
    const chunk =
      texts.slice(i, i + batchSize);

    // ------------------------------------------------------------------------
    // Run inference
    // ------------------------------------------------------------------------
    //
    // IMPORTANT:
    //
    // Pass truncation/max_length explicitly.
    //
    // Previously:
    //
    //   classifier(chunk)
    //
    // could create inputs such as:
    //
    //   [8, 1118]
    //   [7, 4306]
    //
    // which exceeds the RoBERTa model's supported sequence length.
    //
    // ------------------------------------------------------------------------

    const chunkResults =
      await classifier(
        chunk,
        CLASSIFIER_OPTIONS
      );

    // ------------------------------------------------------------------------
    // Validate model response
    // ------------------------------------------------------------------------

    if (
      !Array.isArray(chunkResults) ||
      chunkResults.length !== chunk.length
    ) {
      throw new Error(
        `Tier 1 returned ` +
        `${chunkResults?.length ?? 0} results ` +
        `for ${chunk.length} texts.`
      );
    }

    // ------------------------------------------------------------------------
    // Normalize results
    // ------------------------------------------------------------------------

    results.push(
      ...chunkResults.map(
        normalizeResult
      )
    );

    // ------------------------------------------------------------------------
    // Progress
    // ------------------------------------------------------------------------

    console.log(
      `[Tier 1] Processed ` +
      `${Math.min(i + batchSize, texts.length)}/` +
      `${texts.length}`
    );
  }

  return results;
}
