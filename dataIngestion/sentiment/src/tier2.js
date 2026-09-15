// ============================================================================
// SENTIMENT — TIER 2
// ============================================================================
//
// Hosted LLM used for uncertain Tier 1 classifications.
//
// Tier 2 expands sentiment analysis into multiple dimensions:
//
//   1. Polarity
//      positive | neutral | negative
//
//   2. Emotions
//      joy, sadness, anger, fear, anxiety, excitement, etc.
//
//   3. Stance
//      supportive | against | neutral
//
//   4. Sarcasm
//      detected | not detected
//
// Tier 2 is only invoked when Tier 1 does not have sufficient confidence.
//
// IMPORTANT:
//
// This module produces DERIVED analytics.
// It must never mutate the canonical collection or canonical events.
// ============================================================================

import fetch from "node-fetch";
import "dotenv/config.js";

// ============================================================================
// Configuration
// ============================================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "qwen/qwen3.8-27b";

const GROQ_URL =
  process.env.GROQ_URL ||
  "https://api.groq.com/openai/v1/chat/completions";

// ============================================================================
// Allowed Labels
// ============================================================================

const VALID_POLARITIES = new Set([
  "positive",
  "neutral",
  "negative",
]);

const VALID_STANCES = new Set([
  "supportive",
  "against",
  "neutral",
]);

// NOTE:
// Sarcasm is intentionally NOT included here.
// Sarcasm has its own dedicated dimension below.
const VALID_EMOTIONS = new Set([
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
// Prompt
// ============================================================================

function buildMessages(text) {
  return [
    {
      role: "system",

      content:
        "You are a precise multi-dimensional emotion and sentiment " +
        "analysis engine for social media posts from X/Twitter, Reddit, " +
        "and Telegram.\n\n" +

        "Analyze the post across four independent dimensions.\n\n" +

        "1. POLARITY:\n" +
        "Classify exactly one as positive, neutral, or negative.\n\n" +

        "2. EMOTIONS:\n" +
        "Identify zero or more emotions genuinely expressed by the author. " +
        "Choose only from: joy, sadness, anger, fear, anxiety, " +
        "excitement, surprise, disgust, frustration, hope, love, " +
        "disappointment, confusion.\n" +
        "Multiple emotions are allowed.\n" +
        "Sarcasm is NOT an emotion and must not appear in this list.\n\n" +

        "3. STANCE:\n" +
        "Determine whether the author is supportive, against, or neutral " +
        "toward the subject being discussed.\n\n" +

        "4. SARCASM:\n" +
        "Determine whether the post is sarcastic. Do not assume sarcasm " +
        "merely because the text is informal, humorous, exaggerated, or " +
        "contains slang. Mark sarcasm as detected only when there is " +
        "reasonable evidence that the literal wording differs from the " +
        "intended meaning in a sarcastic way.\n\n" +

        "For every classification provide a confidence score from 0 to 1. " +
        "Confidence represents certainty in the classification, not " +
        "intensity of the emotion.\n\n" +

        "For emotions, include only emotions that are meaningfully " +
        "expressed or strongly implied by the text. Do not add emotions " +
        "simply because they are possible interpretations.\n\n" +

        "If no clear emotion is expressed, return an empty emotions array.\n\n" +

        "Return ONLY valid JSON. No markdown. No explanation outside JSON.\n\n" +

        "Use exactly this structure:\n" +

        "{" +
        '"polarity":{"label":"positive|neutral|negative","confidence":0.0},' +
        '"emotions":[{"label":"emotion","confidence":0.0}],' +
        '"stance":{"label":"supportive|against|neutral","confidence":0.0},' +
        '"sarcasm":{"detected":true,"confidence":0.0},' +
        '"reason":"short explanation"' +
        "}",
    },

    {
      role: "user",

      content:
        `Analyze this social media post:\n\n"""${text}"""`,
    },
  ];
}

// ============================================================================
// Response Parsing
// ============================================================================

function clampConfidence(value) {
  const confidence =
    Number(value);

  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(
    1,
    Math.max(0, confidence)
  );
}

function parseModelJson(raw) {
  if (
    typeof raw !== "string" ||
    !raw.trim()
  ) {
    return null;
  }

  const cleaned =
    raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

  try {
    const parsed =
      JSON.parse(cleaned);

    // ========================================================================
    // Polarity
    // ========================================================================

    const polarityLabel =
      String(
        parsed?.polarity?.label ?? ""
      )
        .toLowerCase()
        .trim();

    const polarityConfidence =
      clampConfidence(
        parsed?.polarity?.confidence
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

    const emotions =
      Array.isArray(
        parsed?.emotions
      )
        ? parsed.emotions
          .map((emotion) => {
            const label =
              String(
                emotion?.label ?? ""
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
          })
          .filter(Boolean)
        : [];

    // ========================================================================
    // Stance
    // ========================================================================

    const stanceLabel =
      String(
        parsed?.stance?.label ?? ""
      )
        .toLowerCase()
        .trim();

    const stanceConfidence =
      clampConfidence(
        parsed?.stance?.confidence
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
      typeof parsed?.sarcasm?.detected ===
        "boolean"
        ? parsed.sarcasm.detected
        : null;

    const sarcasmConfidence =
      clampConfidence(
        parsed?.sarcasm?.confidence
      );

    if (
      sarcasmDetected === null ||
      sarcasmConfidence === null
    ) {
      return null;
    }

    // ========================================================================
    // Final Result
    // ========================================================================

    return {
      polarity: {
        label: polarityLabel,
        confidence:
          polarityConfidence,
      },

      emotions,

      stance: {
        label: stanceLabel,
        confidence:
          stanceConfidence,
      },

      sarcasm: {
        detected:
          sarcasmDetected,

        confidence:
          sarcasmConfidence,
      },

      reason:
        typeof parsed?.reason ===
          "string"
          ? parsed.reason.trim() || null
          : null,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Hosted Model Call
// ============================================================================

async function callHostedModel(text) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. " +
      "Add it to your .env file."
    );
  }

  const response =
    await fetch(
      GROQ_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`,
        },

        body: JSON.stringify({
          model:
            GROQ_MODEL,

          messages:
            buildMessages(text),

          temperature:
            0.1,

          max_tokens:
            300,

          stream:
            false,
        }),
      }
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Tier 2 sentiment request failed: ` +
      `${response.status} ` +
      `${response.statusText} - ${body}`
    );
  }

  const data =
    await response.json();

  const raw =
    data?.choices?.[0]?.message?.content ||
    "";

  const result =
    parseModelJson(raw);

  if (!result) {
    throw new Error(
      "Tier 2 returned an invalid " +
      "multi-dimensional sentiment response."
    );
  }

  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run multi-dimensional sentiment analysis using Tier 2.
 *
 * @param {string} text
 *
 * @returns {Promise<{
 *   polarity: {
 *     label: string,
 *     confidence: number
 *   },
 *
 *   emotions: Array<{
 *     label: string,
 *     confidence: number
 *   }>,
 *
 *   stance: {
 *     label: string,
 *     confidence: number
 *   },
 *
 *   sarcasm: {
 *     detected: boolean,
 *     confidence: number
 *   },
 *
 *   reason: string|null
 * }>}
 */
export async function classifyTier2(text) {
  if (
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(
      "Tier 2 requires non-empty text."
    );
  }

  return await callHostedModel(
    text.trim()
  );
}
