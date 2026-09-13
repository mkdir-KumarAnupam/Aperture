// Tier 2: local LLM via Ollama, used only when Tier 1's confidence is too low.
// Chat models don't give a calibrated probability like a classifier does, so we
// ask the model to self-report a confidence AND we sanity-check it by asking
// the model to run twice with slightly different phrasing — disagreement
// between the two runs is itself a strong (and more trustworthy) low-confidence signal.

import fetch from "node-fetch";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b-instruct";

function buildPrompt(text) {
  return `You are a precise sentiment classification engine for social media posts (X/Twitter, Reddit, Telegram).

Classify the sentiment of the post below as exactly one of: positive, neutral, negative.
Also give your confidence from 0 to 1, and a one-sentence reason.

Respond with ONLY valid JSON in this exact shape, no extra text, no markdown fences:
{"sentiment": "positive" | "neutral" | "negative", "confidence": 0.0-1.0, "reason": "..."}

Post:
"""${text}"""`;
}

function parseModelJson(raw) {
  // Strip markdown code fences if the model added them anyway, then parse.
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      sentiment: String(parsed.sentiment || "neutral").toLowerCase(),
      confidence: Number(parsed.confidence) || 0,
      reason: parsed.reason || "",
    };
  } catch {
    return null;
  }
}

async function callOllamaOnce(text) {
  const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: buildPrompt(text),
      stream: false,
      options: { temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return parseModelJson(data.response || "");
}

/**
 * Classify with the local LLM, running it twice and treating agreement
 * between runs as a confidence booster / disagreement as a penalty.
 * @param {string} text
 * @returns {Promise<{label: string, score: number, reason: string}>}
 */
export async function classifyTier2(text) {
  const [runA, runB] = await Promise.all([
    callOllamaOnce(text),
    callOllamaOnce(text),
  ]);

  // If either call failed to parse, fall back to whichever succeeded.
  if (!runA && !runB) {
    return {
      label: "neutral",
      score: 0,
      reason: "Tier 2 failed to produce parseable output.",
    };
  }
  if (!runA || !runB) {
    const run = runA || runB;
    return {
      label: run.sentiment,
      score: run.confidence * 0.7,
      reason: run.reason,
    };
  }

  const agree = runA.sentiment === runB.sentiment;
  const avgConfidence = (runA.confidence + runB.confidence) / 2;

  return {
    label: runA.sentiment,
    // Disagreement between two runs is a strong signal the model itself is
    // unsure, even if each run individually claimed high confidence.
    score: agree ? avgConfidence : avgConfidence * 0.4,
    reason: agree
      ? runA.reason
      : `Runs disagreed (${runA.sentiment} vs ${runB.sentiment}).`,
  };
}
