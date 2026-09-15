// ============================================================================
// SENTIMENT — TIER 1
// ============================================================================
//
// Fast, local sentiment classifier.
//
// Model:
//   Xenova/twitter-roberta-base-sentiment-latest
//
// Architecture:
//
//   raw text
//      ↓
//   character safety limit
//      ↓
//   explicit tokenizer
//      ↓
//   truncation = true
//   max_length = 256
//   padding = max_length
//      ↓
//   ONNX model
//      ↓
//   sentiment + confidence
//
// IMPORTANT:
//
// We intentionally DO NOT use the Transformers.js `pipeline()` abstraction
// here.
//
// The previous implementation passed max_length through pipeline(), but the
// actual ONNX tensors were still:
//
//   [8, 608]
//   [7, 669]
//   [8, 1118]
//
// Therefore we explicitly tokenize the inputs ourselves and verify the
// resulting tensor shape BEFORE calling the model.
//
// ============================================================================

import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
} from "@xenova/transformers";

// ============================================================================
// Configuration
// ============================================================================

const MODEL_NAME =
  process.env.TIER1_MODEL ||
  "Xenova/twitter-roberta-base-sentiment-latest";

const DEFAULT_BATCH_SIZE = 8;

// RoBERTa sentiment model supports a maximum sequence length of 512,
// but 256 is more than sufficient for our social-media use case.
const MAX_LENGTH = 256;

// Character-level defensive limit.
//
// This is NOT the actual token limit.
// It only prevents pathological scraped content from reaching the tokenizer.
const MAX_INPUT_CHARACTERS = 1200;

// ============================================================================
// Model state
// ============================================================================

let tokenizer = null;
let model = null;
let loadingPromise = null;

// ============================================================================
// Load tokenizer + model
// ============================================================================

async function loadModel() {
  if (tokenizer && model) {
    return;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    console.log(
      `[Tier 1] Loading tokenizer: ${MODEL_NAME}`
    );

    tokenizer =
      await AutoTokenizer.from_pretrained(
        MODEL_NAME
      );

    console.log(
      `[Tier 1] Loading local sentiment model: ${MODEL_NAME}`
    );

    model =
      await AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME
      );

    console.log(
      "[Tier 1] Tokenizer and model loaded successfully."
    );
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

// ============================================================================
// Validation
// ============================================================================

function validateText(text) {
  return (
    typeof text === "string" &&
    text.trim().length > 0
  );
}

// ============================================================================
// Prepare text
// ============================================================================

function prepareText(text) {
  if (!validateText(text)) {
    throw new Error(
      "Tier 1 requires non-empty text."
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
    `[Tier 1] Input exceeds ` +
    `${MAX_INPUT_CHARACTERS} characters. ` +
    `Applying defensive character truncation. ` +
    `Original length: ${normalized.length}`
  );

  return normalized.slice(
    0,
    MAX_INPUT_CHARACTERS
  );
}

// ============================================================================
// Softmax
// ============================================================================

function softmax(values) {
  const max =
    Math.max(...values);

  const exponentials =
    values.map((value) =>
      Math.exp(value - max)
    );

  const sum =
    exponentials.reduce(
      (total, value) =>
        total + value,
      0
    );

  return exponentials.map(
    (value) =>
      value / sum
  );
}

// ============================================================================
// Extract logits
// ============================================================================

function getLogits(output) {
  if (
    output &&
    output.logits
  ) {
    return output.logits;
  }

  if (
    Array.isArray(output) &&
    output[0]?.logits
  ) {
    return output[0].logits;
  }

  throw new Error(
    "Tier 1 model output does not contain logits."
  );
}

// ============================================================================
// Convert model output → sentiment
// ============================================================================

function normalizeModelOutput(output) {
  const logits =
    getLogits(output);

  if (
    !logits.dims ||
    logits.dims.length !== 2
  ) {
    throw new Error(
      `Unexpected logits dimensions: ` +
      `${JSON.stringify(logits.dims)}`
    );
  }

  const batchSize =
    logits.dims[0];

  const numberOfLabels =
    logits.dims[1];

  if (numberOfLabels !== 3) {
    throw new Error(
      `Expected 3 sentiment labels, ` +
      `received ${numberOfLabels}.`
    );
  }

  const values =
    Array.from(logits.data);

  const labels = [
    "negative",
    "neutral",
    "positive",
  ];

  const results = [];

  for (
    let i = 0;
    i < batchSize;
    i++
  ) {
    const start =
      i * numberOfLabels;

    const row =
      values.slice(
        start,
        start + numberOfLabels
      );

    const probabilities =
      softmax(row);

    let bestIndex = 0;

    for (
      let j = 1;
      j < probabilities.length;
      j++
    ) {
      if (
        probabilities[j] >
        probabilities[bestIndex]
      ) {
        bestIndex = j;
      }
    }

    results.push({
      label:
        labels[bestIndex],
      score:
        probabilities[bestIndex],
    });
  }

  return results;
}

// ============================================================================
// Explicit tokenization
// ============================================================================
//
// THIS IS THE IMPORTANT FIX.
//
// We do not rely on pipeline() to apply max_length.
//
// The tokenizer itself receives:
//
//   truncation: true
//   max_length: 256
//   padding: "max_length"
//
// Then we inspect the actual tensor dimensions.
//
// ============================================================================

async function tokenizeTexts(texts) {
  const encoded =
    await tokenizer(
      texts,
      {
        truncation: true,
        max_length: MAX_LENGTH,
        padding: "max_length",
        return_tensors: "np",
      }
    );

  if (
    !encoded ||
    !encoded.input_ids
  ) {
    throw new Error(
      "Tier 1 tokenizer did not return input_ids."
    );
  }

  const inputDims =
    encoded.input_ids.dims;

  const attentionDims =
    encoded.attention_mask?.dims;

  console.log(
    `[Tier 1] Actual input_ids shape: ` +
    `${JSON.stringify(inputDims)}`
  );

  console.log(
    `[Tier 1] Actual attention_mask shape: ` +
    `${JSON.stringify(attentionDims)}`
  );

  // --------------------------------------------------------------------------
  // HARD SAFETY CHECK
  // --------------------------------------------------------------------------

  if (
    !Array.isArray(inputDims) ||
    inputDims.length !== 2
  ) {
    throw new Error(
      `Invalid input_ids dimensions: ` +
      `${JSON.stringify(inputDims)}`
    );
  }

  const actualBatchSize =
    inputDims[0];

  const actualSequenceLength =
    inputDims[1];

  if (
    actualBatchSize !==
    texts.length
  ) {
    throw new Error(
      `Tokenizer batch mismatch. ` +
      `Expected ${texts.length}, ` +
      `received ${actualBatchSize}.`
    );
  }

  if (
    actualSequenceLength >
    MAX_LENGTH
  ) {
    throw new Error(
      `CRITICAL: tokenizer produced ` +
      `${actualSequenceLength} tokens ` +
      `with max_length=${MAX_LENGTH}.`
    );
  }

  if (
    actualSequenceLength !==
    MAX_LENGTH
  ) {
    console.warn(
      `[Tier 1] Tokenizer sequence length is ` +
      `${actualSequenceLength}; expected ${MAX_LENGTH}.`
    );
  }

  return encoded;
}

// ============================================================================
// Run one batch
// ============================================================================

async function classifyPreparedBatch(
  texts
) {
  const encoded =
    await tokenizeTexts(texts);

  console.log(
    `[Tier 1] Running ONNX inference for ` +
    `${texts.length} texts.`
  );

  const output =
    await model(encoded);

  return normalizeModelOutput(
    output
  );
}

// ============================================================================
// Single classification
// ============================================================================

export async function classifyTier1(
  text
) {
  const safeText =
    prepareText(text);

  await loadModel();

  console.log(
    `[Tier 1] Running single classification. ` +
    `Input length: ${safeText.length} chars.`
  );

  const results =
    await classifyPreparedBatch([
      safeText,
    ]);

  if (
    !Array.isArray(results) ||
    results.length !== 1
  ) {
    throw new Error(
      "Tier 1 single classification returned an invalid result."
    );
  }

  return results[0];
}

// ============================================================================
// Batch classification
// ============================================================================

export async function classifyTier1Batch(
  texts
) {
  if (!Array.isArray(texts)) {
    throw new TypeError(
      "classifyTier1Batch() expects an array of texts."
    );
  }

  if (texts.length === 0) {
    return [];
  }

  // --------------------------------------------------------------------------
  // Prepare every input first.
  // --------------------------------------------------------------------------

  const preparedTexts =
    texts.map(
      (text, index) => {
        if (!validateText(text)) {
          throw new Error(
            `Tier 1 received empty or invalid ` +
            `text at index ${index}.`
          );
        }

        return prepareText(text);
      }
    );

  // --------------------------------------------------------------------------
  // Load model once.
  // --------------------------------------------------------------------------

  await loadModel();

  // --------------------------------------------------------------------------
  // Batch configuration.
  // --------------------------------------------------------------------------

  const configuredBatchSize =
    Number(
      process.env.TIER1_BATCH_SIZE
    );

  const batchSize =
    Number.isInteger(
      configuredBatchSize
    ) &&
      configuredBatchSize > 0
      ? configuredBatchSize
      : DEFAULT_BATCH_SIZE;

  console.log(
    `[Tier 1] Classifying ` +
    `${preparedTexts.length} texts ` +
    `in batches of ${batchSize}.`
  );

  console.log(
    `[Tier 1] Maximum sequence length: ` +
    `${MAX_LENGTH} tokens.`
  );

  console.log(
    `[Tier 1] Maximum defensive input length: ` +
    `${MAX_INPUT_CHARACTERS} characters.`
  );

  // --------------------------------------------------------------------------
  // Process chunks.
  // --------------------------------------------------------------------------

  const results = [];

  for (
    let i = 0;
    i < preparedTexts.length;
    i += batchSize
  ) {
    const chunk =
      preparedTexts.slice(
        i,
        i + batchSize
      );

    const batchNumber =
      Math.floor(
        i / batchSize
      ) + 1;

    console.log(
      `[Tier 1] Processing batch ` +
      `${batchNumber} ` +
      `(${chunk.length} texts)...`
    );

    try {
      const chunkResults =
        await classifyPreparedBatch(
          chunk
        );

      if (
        !Array.isArray(
          chunkResults
        )
      ) {
        throw new Error(
          "Tier 1 returned a non-array result."
        );
      }

      if (
        chunkResults.length !==
        chunk.length
      ) {
        throw new Error(
          `Tier 1 returned ` +
          `${chunkResults.length} results ` +
          `for ${chunk.length} texts.`
        );
      }

      results.push(
        ...chunkResults
      );

      console.log(
        `[Tier 1] Processed ` +
        `${results.length}/` +
        `${preparedTexts.length}`
      );
    } catch (error) {
      console.error(
        `[Tier 1] Batch ${batchNumber} failed:`,
        error.message
      );

      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Final validation.
  // --------------------------------------------------------------------------

  if (
    results.length !==
    preparedTexts.length
  ) {
    throw new Error(
      `Tier 1 produced ` +
      `${results.length} results ` +
      `for ${preparedTexts.length} inputs.`
    );
  }

  return results;
}

// ============================================================================
// Startup diagnostics
// ============================================================================

console.log(
  "[Tier 1] Configuration loaded:"
);

console.log(
  `  Model: ${MODEL_NAME}`
);

console.log(
  `  Max tokens: ${MAX_LENGTH}`
);

console.log(
  `  Max characters: ${MAX_INPUT_CHARACTERS}`
);

console.log(
  `  Batch size: ` +
  `${Number(
    process.env.TIER1_BATCH_SIZE
  ) || DEFAULT_BATCH_SIZE
  }`
);

console.log(
  "  Explicit tokenizer: enabled"
);

console.log(
  "  Token truncation: enabled"
);

console.log(
  "  Padding: max_length"
);
