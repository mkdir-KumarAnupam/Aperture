// Tier 1: fast local classifier (no GPU needed, runs in pure JS via transformers.js)
// Model: cardiffnlp/twitter-roberta-base-sentiment-latest (ported for transformers.js as Xenova/*)
// This model was fine-tuned specifically on tweets, so it handles slang, hashtags,
// and emojis well — a good fit for X/Reddit/Telegram scraped text.

import { pipeline } from "@xenova/transformers";

let classifierPromise = null;

// Lazy-load the model once and reuse it across calls (loading is the slow part).
function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = pipeline(
      "sentiment-analysis",
      "Xenova/twitter-roberta-base-sentiment-latest"
    );
  }
  return classifierPromise;
}

/**
 * Classify a single piece of text.
 * @param {string} text
 * @returns {Promise<{label: "positive"|"neutral"|"negative", score: number}>}
 */
export async function classifyTier1(text) {
  const classifier = await getClassifier();
  const [result] = await classifier(text);
  // result looks like: { label: "positive", score: 0.9432 }
  return {
    label: result.label.toLowerCase(),
    score: result.score,
  };
}

/**
 * Classify a batch of texts in chunks to balance speed and memory.
 * Transformers.js handles small batches well on CPU, but very large
 * batches can spike memory — so we chunk at TIER1_BATCH_SIZE (default 8).
 * @param {string[]} texts
 */
export async function classifyTier1Batch(texts) {
  const classifier = await getClassifier();
  const batchSize = Number(process.env.TIER1_BATCH_SIZE) || 8;
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const chunkResults = await classifier(chunk);
    results.push(
      ...chunkResults.map((r) => ({ label: r.label.toLowerCase(), score: r.score }))
    );
  }

  return results;
}
