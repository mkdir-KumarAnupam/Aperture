// Orchestrates the three tiers: try the cheap/fast one first, only escalate
// when confidence is below threshold. This is what keeps API costs near zero.
//
// Strategy: Tier 1 runs as a BATCH (fast, local transformer) so all posts
// are classified in one pass. Only the uncertain posts are then escalated
// to Tier 2 and Tier 3 sequentially — this minimises overall latency.

import { classifyTier1, classifyTier1Batch } from "./tier1.js";
import { classifyTier2 } from "./tier2.js";
import { classifyTier3 } from "./tier3.js";

const TIER1_THRESHOLD = Number(process.env.TIER1_THRESHOLD) || 0.75;
const TIER2_THRESHOLD = Number(process.env.TIER2_THRESHOLD) || 0.65;

/**
 * Run the full tiered pipeline on one piece of text.
 * @param {string} text - the scraped post content
 * @returns {Promise<{
 *   text: string,
 *   label: "positive"|"neutral"|"negative",
 *   confidence: number,
 *   tier: 1|2|3,
 *   reason?: string
 * }>}
 */
export async function analyzeSentiment(text) {
  // --- Tier 1: fast local classifier ---
  const tier1 = await classifyTier1(text);
  if (tier1.score >= TIER1_THRESHOLD) {
    return { text, label: tier1.label, confidence: tier1.score, tier: 1 };
  }

  // --- Tier 2: local LLM via Ollama ---
  const tier2 = await classifyTier2(text);
  if (tier2.score >= TIER2_THRESHOLD) {
    return {
      text,
      label: tier2.label,
      confidence: tier2.score,
      tier: 2,
      reason: tier2.reason,
    };
  }

  // --- Tier 3: escalate to a larger hosted model ---
  const tier3 = await classifyTier3(text);
  return {
    text,
    label: tier3.label,
    confidence: tier3.score,
    tier: 3,
    reason: tier3.reason,
  };
}

/**
 * Optimised batch pipeline:
 *   1. Run ALL posts through Tier 1 in a single batch (fast, local).
 *   2. Posts with high confidence are resolved immediately.
 *   3. Only low-confidence posts are escalated to Tier 2 / Tier 3 sequentially.
 *
 * This is much faster than the naive one-by-one approach because Tier 1
 * resolves the majority of posts and batching amortises model-load overhead.
 *
 * @param {string[]} texts
 */
export async function analyzeBatch(texts) {
  const total = texts.length;
  const results = new Array(total);

  // ── Phase 1: Batch classify ALL posts with Tier 1 ──────────────
  console.log(`\n⚡ Phase 1: Batch-classifying ${total} posts with Tier 1...`);
  const tier1Results = await classifyTier1Batch(texts);

  const escalationQueue = []; // indices that need Tier 2/3

  for (let i = 0; i < total; i++) {
    if (tier1Results[i].score >= TIER1_THRESHOLD) {
      // ✅ Confident — resolved at Tier 1
      results[i] = {
        text: texts[i],
        label: tier1Results[i].label,
        confidence: tier1Results[i].score,
        tier: 1,
      };
      console.log(
        `  [${i + 1}/${total}] ✅ tier=1 label=${results[i].label} confidence=${results[i].confidence.toFixed(2)}`,
      );
    } else {
      // ❌ Low confidence — needs escalation
      escalationQueue.push(i);
      console.log(
        `  [${i + 1}/${total}] ⏳ tier=1 confidence=${tier1Results[i].score.toFixed(2)} → escalating`,
      );
    }
  }

  console.log(
    `\n📊 Tier 1 resolved ${total - escalationQueue.length}/${total} posts. Escalating ${escalationQueue.length} to Tier 2/3...\n`,
  );

  // ── Phase 2: Escalate uncertain posts through Tier 2 → Tier 3 ──
  for (const idx of escalationQueue) {
    const text = texts[idx];

    // Try Tier 2 first
    const tier2 = await classifyTier2(text);
    if (tier2.score >= TIER2_THRESHOLD) {
      results[idx] = {
        text,
        label: tier2.label,
        confidence: tier2.score,
        tier: 2,
        reason: tier2.reason,
      };
      console.log(
        `  [${idx + 1}/${total}] ✅ tier=2 label=${results[idx].label} confidence=${results[idx].confidence.toFixed(2)}`,
      );
      continue;
    }

    // Tier 2 also unsure — final escalation to Tier 3
    const tier3 = await classifyTier3(text);
    results[idx] = {
      text,
      label: tier3.label,
      confidence: tier3.score,
      tier: 3,
      reason: tier3.reason,
    };
    console.log(
      `  [${idx + 1}/${total}] ✅ tier=3 label=${results[idx].label} confidence=${results[idx].confidence.toFixed(2)}`,
    );
  }

  return results;
}
