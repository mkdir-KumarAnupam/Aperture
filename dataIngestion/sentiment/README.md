<div align="center">

# ⚡ Sentiment Analysis Pipeline

**A cost-optimised, tiered sentiment classification system for social media posts**

Built for [Smart India Hackathon (SIH) 2026](https://sih.gov.in/)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-Queue%20Worker-red?logo=redis&logoColor=white)](https://bullmq.io/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-black?logo=ollama)](https://ollama.com/)
[![Groq](https://img.shields.io/badge/Groq-Cloud%20API-orange)](https://console.groq.com/)

</div>

---

## 📋 Overview

This pipeline classifies the sentiment of scraped social media posts (X/Twitter, Reddit, Telegram) using a **three-tier escalation strategy**. It starts with a fast, free local classifier and only escalates to more expensive models when confidence is low — keeping costs near zero for the majority of posts.

```
                    ┌─────────────────────────────────────┐
                    │         Incoming Posts (batch)       │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  ⚡ TIER 1 — RoBERTa Classifier     │
                    │  Local · Batch · Instant · Free     │
                    │  Model: twitter-roberta-base        │
                    └──────────────┬──────────────────────┘
                                   │
                         confidence ≥ 0.75?
                        ╱                   ╲
                      YES                    NO
                       │                      │
                  ✅ RESOLVED       ┌─────────▼─────────────────┐
                                    │  🧠 TIER 2 — Local LLM    │
                                    │  Ollama · Sequential · Free│
                                    │  Model: qwen2.5:7b         │
                                    └─────────┬─────────────────┘
                                              │
                                    confidence ≥ 0.65?
                                   ╱                   ╲
                                 YES                    NO
                                  │                      │
                             ✅ RESOLVED       ┌─────────▼─────────────────┐
                                               │  🌐 TIER 3 — Cloud API    │
                                               │  Groq · Sequential · Free │
                                               │  Model: qwen3.8-27b       │
                                               └───────────────────────────┘
                                                          │
                                                     ✅ RESOLVED
                                                   (final authority)
```

## ✨ Key Features

| Feature                      | Description                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Batch-First Architecture** | Tier 1 processes all posts in a single batch pass; only uncertain posts escalate                                  |
| **Chunked Batching**         | Large batches are split into configurable chunks (default: 8) to balance speed and memory                         |
| **Dual-Run Agreement**       | Tier 2 runs each post twice — disagreement between runs is treated as low confidence, catching LLM overconfidence |
| **Cost Near Zero**           | ~70% of posts resolve at Tier 1 (free, local). Tier 2 is also free (Ollama). Only ~15% reach the cloud API        |
| **Configurable Thresholds**  | Fine-tune escalation sensitivity via environment variables                                                        |
| **Social Media Optimised**   | Tier 1 model is fine-tuned on tweets — handles slang, hashtags, and emojis well                                   |
| **Worker-Ready**             | Designed as a library — consumed by a BullMQ worker via Redis queue for production workloads                      |

## 🏗️ Architecture

```
sentiment-pipeline/
├── src/
│   ├── pipeline.js       # Orchestrator — batch Tier 1, escalate uncertain posts
│   ├── tier1.js          # Local transformer classifier (transformers.js)
│   ├── tier2.js          # Local LLM via Ollama with dual-run agreement check
│   └── tier3.js          # Cloud API escalation via Groq (OpenAI-compatible)
├── .env                  # Configuration (API keys, thresholds, models)
├── .env.example          # Template for environment variables
└── package.json
```

The pipeline is consumed as a **library** by an external BullMQ worker (`worker.js`) that pulls jobs from a Redis queue. It does not have its own entry point — it exports `analyzeBatch()` and `analyzeSentiment()` for external callers.

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **Redis** server running (required by BullMQ)
- **Ollama** installed and running ([download](https://ollama.com/))
- **Groq API key** (free tier) from [console.groq.com/keys](https://console.groq.com/keys)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Ollama (Tier 2)

```bash
# Install Ollama from https://ollama.com, then pull the model:
ollama pull qwen2.5:7b-instruct

# Ensure Ollama is running (it may already run as a background service):
ollama serve
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and paste your Groq API key:

```env
GROQ_API_KEY=gsk_your_key_here
```

### 4. Integration

The pipeline is invoked by an external **BullMQ worker** that listens on a Redis queue. Here's how the worker consumes it:

```js
import { Worker } from "bullmq";
import { analyzeBatch } from "./sentiment-pipeline/src/pipeline.js";

const sentimentWorker = new Worker(
  "SentimentQueue",
  async (job) => {
    const data = job.data;
    console.log(`[Sentiment] Processing ${data.targetTrendLabel}...`);

    const results = await analyzeBatch(data.posts);

    console.log("Sentiment worker completed.");
    return { status: "success", results };
  },
  { connection: createRedisConnection() },
);
```

To enqueue a job from another service:

```js
import { Queue } from "bullmq";

const queue = new Queue("SentimentQueue", { connection: redisConnection });
await queue.add("classify", {
  targetTrendLabel: "#SIH2026",
  posts: ["loving the hackathon!", "this is so stressful..."],
});
```

### Sample Output

```
⚡ Phase 1: Batch-classifying 20 posts with Tier 1...
  [1/20] ✅ tier=1 label=negative confidence=0.95
  [2/20] ⏳ tier=1 confidence=0.60 → escalating
  ...

📊 Tier 1 resolved 13/20 posts. Escalating 7 to Tier 2/3...

  [2/20] ✅ tier=3 label=neutral confidence=0.95
  [4/20] ✅ tier=2 label=neutral confidence=0.70
  ...

Tier usage: { '1': 13, '2': 4, '3': 3 }
```

## ⚙️ Configuration

All configuration is done via environment variables in `.env`:

| Variable           | Default                  | Description                              |
| ------------------ | ------------------------ | ---------------------------------------- |
| `GROQ_API_KEY`     | —                        | **Required.** Your Groq API key          |
| `GROQ_MODEL`       | `qwen/qwen3.8-27b`       | Model to use for Tier 3 cloud escalation |
| `OLLAMA_HOST`      | `http://localhost:11434` | Ollama server URL                        |
| `OLLAMA_MODEL`     | `qwen2.5:7b-instruct`    | Model to use for Tier 2 local LLM        |
| `TIER1_THRESHOLD`  | `0.75`                   | Minimum confidence to trust Tier 1 (0–1) |
| `TIER2_THRESHOLD`  | `0.65`                   | Minimum confidence to trust Tier 2 (0–1) |
| `TIER1_BATCH_SIZE` | `8`                      | Number of posts per Tier 1 batch chunk   |

### Tuning Guide

- **Too many posts escalating?** → Lower `TIER1_THRESHOLD` (e.g., `0.70`)
- **Too many wrong answers from Tier 1?** → Raise `TIER1_THRESHOLD` (e.g., `0.80`)
- **Running out of memory?** → Lower `TIER1_BATCH_SIZE` (e.g., `4`)
- **Want faster Tier 1?** → Raise `TIER1_BATCH_SIZE` (e.g., `16`) if you have >8GB RAM

> 💡 **Rule of thumb:** If more than ~15% of posts reach Tier 3, consider lowering your Tier 1 threshold or fine-tuning the classifier on your specific dataset.

## 🔬 How Confidence Works

| Tier       | Method                                      | Reliability                                                                            |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Tier 1** | Softmax probability from RoBERTa classifier | High — calibrated probability from a trained model                                     |
| **Tier 2** | Self-reported confidence × agreement check  | Medium — two independent LLM runs must agree; disagreement penalises confidence by 60% |
| **Tier 3** | Self-reported confidence from cloud model   | Accepted as-is — final authority, no further escalation                                |

## 🔄 Swapping Providers

### Different Local LLM (Tier 2)

Change `OLLAMA_MODEL` in `.env` to any model you've pulled:

```env
OLLAMA_MODEL=llama3.1:8b-instruct
# or
OLLAMA_MODEL=phi4-mini
```

### Different Cloud API (Tier 3)

`src/tier3.js` uses an OpenAI-compatible chat endpoint. To switch providers (OpenRouter, Together AI, etc.), update the URL and auth header — the request/response format is identical:

```js
const GROQ_URL = "https://openrouter.ai/api/v1/chat/completions";
```

## 📊 Output Format

Each classified post in `results.json` has this shape:

```json
{
  "text": "absolutely loving the new feature, works flawlessly!!",
  "label": "positive",
  "confidence": 0.99,
  "tier": 1,
  "reason": "Strong positive language with enthusiasm"
}
```

| Field        | Type      | Description                                |
| ------------ | --------- | ------------------------------------------ |
| `text`       | `string`  | The original post text                     |
| `label`      | `string`  | `"positive"`, `"neutral"`, or `"negative"` |
| `confidence` | `number`  | Confidence score (0–1)                     |
| `tier`       | `number`  | Which tier resolved this post (1, 2, or 3) |
| `reason`     | `string?` | Explanation (only from Tier 2 and Tier 3)  |

## 🛣️ Roadmap

- [ ] Fine-grained emotion classification (happy, sad, angry, fearful, surprised)
- [ ] Aspect-based sentiment analysis
- [ ] Multi-label emotion support
- [ ] CSV/JSON file input for bulk processing
- [ ] Dashboard for visualising sentiment trends
- [ ] WebSocket streaming for real-time classification

## 📄 License

This project is part of the **Smart India Hackathon (SIH) 2026** initiative.

---

<div align="center">

**Built with ❤️ for SIH 2026**

</div>
