require('dotenv').config();
require('dotenv').config({ path: require('path').resolve(__dirname, 'sentiment/.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = process.env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-70b-versatile"; 

/**
 * Generates a concise description for a given trend label using the Groq API.
 * 
 * @param {string} trendLabel - The name of the trend.
 * @param {string} [trendContext] - Optional text context (e.g., sample posts) to improve description accuracy.
 * @returns {Promise<string|null>} - The generated description, or null if it fails.
 */
async function generateTrendDescription(trendLabel, trendContext = null) {
  if (!GROQ_API_KEY) {
    console.warn("GROQ_API_KEY is not configured. Skipping trend description generation.");
    return null;
  }

  const messages = [
    {
      role: "system",
      content: "You are an AI assistant that briefly describes internet trends. Provide a concise 1-2 sentence description explaining what the given trend or topic is about. Do not add conversational fluff like 'This trend is about...' or 'Here is a description...'. Just provide the factual description."
    },
    {
      role: "user",
      content: trendContext 
        ? `Please describe this trend/topic: "${trendLabel}".\n\nHere are some recent posts about this trend for context:\n${trendContext}`
        : `Please describe this trend/topic: "${trendLabel}"`
    }
  ];

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: messages,
        temperature: 0.3,
        max_tokens: 150
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Groq API Error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("Failed to generate trend description from Groq API:", error);
    return null;
  }
}

module.exports = {
  generateTrendDescription
};
