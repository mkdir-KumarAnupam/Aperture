# Tiered Sentiment Analysis Pipeline

Analyzes sentiment of scraped X / Reddit / Telegram posts using a cheap local
classifier first, escalating to a local LLM and then a hosted API only when
confidence is too low. This keeps cost near zero for the majority of posts.

```
Post ──► Tier 1: RoBERTa classifier (CPU, instant, free)
           │ confidence < 0.75?
           ▼
         Tier 2: Local LLM via Ollama (CPU, few sec, free)
           │ confidence < 0.65?
           ▼
         Tier 3: Groq API — Llama 3.3 70B (fast, free tier)
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Ollama (Tier 2)
Install Ollama from https://ollama.com, then pull a model:
```bash
ollama pull qwen2.5:7b-instruct
```
Make sure Ollama is running (`ollama serve`, or it may already run as a
background service after install).

### 3. Get a free Groq API key (Tier 3)
Sign up at https://console.groq.com/keys — the free tier is generous and
plenty for occasional escalation traffic.

### 4. Configure environment
```bash
cp .env.example .env
# then edit .env and paste your GROQ_API_KEY
```

### 5. Run
```bash
node index.js
```
This runs the sample posts in `index.js` through the pipeline and writes
`results.json`. Replace `samplePosts` with your actual scraped data (loaded
from a file or database) when you're ready.

## How confidence is determined per tier

- **Tier 1** (`Xenova/twitter-roberta-base-sentiment-latest`): a real
  classifier, so its softmax score is a genuine calibrated probability.
- **Tier 2** (Ollama chat model): chat models don't have a native confidence
  score, so we ask the model to self-report one AND run it twice. If the two
  runs disagree, we treat that as low confidence even if each run individually
  claimed to be sure — this catches LLM overconfidence.
- **Tier 3** (Groq / Llama 3.3 70B): treated as final arbitration; its output
  is trusted directly since there's nowhere further to escalate.

## Tuning

Adjust these in `.env`:
- `TIER1_THRESHOLD` (default 0.75) — raise it if too many wrong answers are
  slipping through Tier 1; lower it if too many posts are escalating
  unnecessarily.
- `TIER2_THRESHOLD` (default 0.65) — same idea for Tier 2 → Tier 3 escalation.

Log your `tier` field over a batch run — if more than ~10-15% of posts are
reaching Tier 3, it's worth revisiting your Tier 1 threshold or fine-tuning
the Tier 1 classifier on some labeled Reddit/Telegram examples, since it was
trained mainly on Twitter data.

## Swapping providers

- **Different local LLM**: change `OLLAMA_MODEL` in `.env` to any model you've
  pulled (e.g. `llama3.1:8b-instruct`, `phi4-mini`).
- **Different escalation API**: `src/tier3.js` uses Groq's OpenAI-compatible
  endpoint. To use OpenRouter or another provider, just change `GROQ_URL` and
  the auth header — the request/response shape is the same for any
  OpenAI-compatible chat API.
