// Tier 3: escalate to a larger, more capable model via API when both local
// tiers were unsure. Uses Groq's OpenAI-compatible endpoint (free tier as of
// writing) running Llama 3.3 70B. Swap the base URL/model to use OpenRouter
// or another provider if you prefer — the OpenAI-style chat format is the same.

import fetch from "node-fetch";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildMessages(text) {
  return [
    {
      role: "system",
      content:
        "You are a precise sentiment classification engine for social media posts. " +
        'Respond with ONLY valid JSON: {"sentiment": "positive"|"neutral"|"negative", "confidence": 0.0-1.0}',
    },
    {
      role: "user",
      content: `Classify the sentiment of this post:\n\n"""${text}"""`,
    },
  ];
}

function parseModelJson(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      label: String(parsed.sentiment || "neutral").toLowerCase(),
      score: Number(parsed.confidence) || 0.9, // big models rarely self-report; default high
    };
  } catch {
    return {
      label: "neutral",
      score: 0,
    };
  }
}

/**
 * Final-arbitration classification using a larger hosted model.
 * @param {string} text
 * @returns {Promise<{label: string, score: number, reason: string}>}
 */
export async function classifyTier3(text) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to your .env file (see .env.example).",
    );
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: buildMessages(text),
      temperature: 0.1,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Groq request failed: ${response.status} ${response.statusText} - ${body}`,
    );
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return parseModelJson(raw);
}
