# ⚡ JEV Sentiment & Narrative Analysis Pipeline

**A next-generation social media sentiment, affect, and dynamic narrative classification engine for Aperture.**

Powered by **TypeSafe AI (JEV SystemOne `jev-1.13.0`)** and an intelligent **Google Gemini LLM Fallback** layer with dynamic narrative pool evolution.

---

## 📋 Architectural Overview

The JEV Sentiment pipeline replaces legacy multi-tier transformer classifiers with a calibrated, decision-first architecture:

```
                     APERTURE SOCIAL DATA INGESTION
                                    │
                                    ▼
                         [SentimentQueue (BullMQ)]
                                    │
                         (Canonical job.data payload)
                                    │
                        [sentimentWorker.js]
                                    │
                       1. Extract trend_label
                       2. Normalize & rank top 30 posts (by interactions)
                       3. Retrieve Narrative Pool (Redis 7-Day TTL / PostgreSQL)
                                    │
                                    ▼
                         [JEV SystemOne Model]
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
            Confidence >= 0.70             Confidence < 0.70
            & narrative matched            or 'none_of_these'
                     │                             │
                     │                             ▼
                     │                 [Gemini LLM Fallback]
                     │                 (Multi-Key Rotation)
                     │                             │
                     │                ┌────────────┴────────────┐
                     │                ▼                         ▼
                     │        Match Existing              Propose New
                     │               │                          │
                     │               │              1. Atomic PostgreSQL Append (||)
                     │               │              2. Redis 7-Day Refresh
                     │               │              3. Follow-up JEV Evaluation
                     │               │                          │
                     └───────────────┼──────────────────────────┘
                                     ▼
                      [Complete Sentiment Analytics Object]
                                     │
                                     ▼
                              [DatabaseQueue]
                                     │
                     [PostgreSQL: trend_sentiment_snapshots]
```

---

## ✨ Core Analytical Dimensions

1. **4-Way Sentiment Classification**: Discrete calibrated choice across `positive`, `negative`, `neutral`, and `mixed` (with 100% recall on positive and mixed discourses).
2. **8 Continuous Affect (Emotion) Vectors**: Real-valued intensity scores ($0.0 \to 1.0$) across:
   - `anger`, `fear`, `joy`, `sadness`, `anxiety`, `excitement`, `outrage`, and `hope`.
3. **Dynamic Narrative Alignment & Discovery**:
   - Matches discussions to existing pool narratives.
   - Evaluates continuous **Relevance** ($0.0 \to 1.0$) and discrete **Stance** (`support`, `oppose`, `neutral`, `discussing`).
   - Automatically escalates novel, divergent, or sarcastic topics to Gemini to propose brand-new narratives.
4. **Single-Row JSONB Narrative Pools with Redis Caching**:
   - Organized 1 row per `trend_label` in PostgreSQL table `trend_narratives`.
   - Cached in Redis (`narrative_pool:<trend_label>`) with a **7-day TTL** (604,800s).

---

## 📊 Benchmark Scorecard (100 Test Cases / 3,010 Posts)

Evaluated against [`data.json`](file:///D:/Aperture/dataIngestion/sentiment/JEV/data.json) covering 12 stress scenarios (consensus, high conflict, sarcasm, interaction weighting, novel events, boundary limits):

| Metric | Score | Details |
| :--- | :---: | :--- |
| **Sentiment Accuracy** | **94.00%** | Macro F1: 91.88% (100% recall on Positive & Mixed) |
| **Narrative Alignment Accuracy** | **96.00%** | 96 / 100 exact narrative / novelty matches |
| **Stance Classification Accuracy** | **85.53%** | 65 / 76 applicable cases correctly classified |
| **Affect / Emotion Hit Rate** | **99.67%** | Near-flawless detection across 8 affect dimensions |
| **Fallback Calibration** | **98.00%** | Accurately escalates novel/sarcastic topics to Gemini fallback |
| **All Core Matched (Triple-Match)** | **84.00%** | **84 / 100** simultaneous triple-matches across all 3 tasks |
| **Average Batch Latency** | **382.3 ms** | Median: 381 ms, p95: 494 ms |
| **Total Evaluation Time** | **9.63 s** | Evaluated via 4 parallel worker threads |

---

## 💰 Cost Model & Financial Efficiency

TypeSafe AI JEV SystemOne uses a decision-first paradigm rather than generative text streaming:
* **Output Tokens**: **$0.00 (100% Free)**
* **Input Tokens**: **$0.042 per 1,000,000 tokens** ($0.000000042 / token)

### Realized Benchmark Consumption
* **Total Input Tokens (100 Batches / 3,010 Posts)**: 458,957 tokens
* **Total Benchmark Cost**: **$0.019276 USD** (< 2 cents)
* **Cost Per Batch (30 posts)**: **$0.000193 USD** (~0.0193¢)
* **Cost Per Individual Post**: **$0.0000064 USD** (~0.00064¢)

### Cost at Scale
* **10,000 Batches (300,000 posts)**: **$1.93 USD**
* **100,000 Batches (3,000,000 posts)**: **$19.28 USD**
* **1,000,000 Batches (30,000,000 posts)**: **$192.76 USD**

---

## 📁 File Structure

```
dataIngestion/sentiment/
├── src/
│   ├── sentimentWorker.js        # Core BullMQ worker processor & JEV/LLM execution logic
│   └── taxonomy.js               # Structured schemas and definitions for sentiment, stance, and affect
├── tests/
│   ├── run-benchmark.js          # Automated benchmark runner for data.json
│   ├── test-pipeline-run.js      # Canonical pipeline test matching producer.js format
│   ├── test-dual-write.js        # Atomicity and Redis 7-day TTL verification
│   ├── test-e2e-worker.js        # Relational PostgreSQL persistence verification
│   ├── test-sentiment.js         # Isolated standalone BullMQ sentiment queue harness
│   ├── analyze-dataset.js        # Dataset breakdown and distributions utility
│   ├── diagnose-failures.js      # Granular failure diagnostics utility
│   └── data.json                 # 100 comprehensive synthetic stress-test cases (3,010 posts)
├── testresults/
│   ├── benchmark-results.json    # Full raw prediction outputs from benchmark run
│   ├── benchmark-summary.json    # Aggregated metrics, confusion matrices, and costing data
│   └── output.txt                # Job output logs from standalone worker tests
├── .env                          # Local configuration (ignored by git)
├── .env.example                  # Template for environment configuration
├── .gitignore                    # Ignores sensitive environment and dependency files
├── package.json                  # Module definition and test scripts
├── README.md                     # Pipeline documentation & benchmark scorecard
└── jevImplmentation.md           # Full engineering architecture specification
```

---

## 🚀 Running Tests & Benchmarks

```bash
# Navigate to dataIngestion directory
cd dataIngestion

# 1. Run the 100-case synthetic benchmark suite
node sentiment/tests/run-benchmark.js

# 2. Test canonical Aperture pipeline payload (simulating producer.js)
node sentiment/tests/test-pipeline-run.js

# 3. Test atomic PostgreSQL JSONB dual-write & Redis 7-day TTL
node sentiment/tests/test-dual-write.js

# 4. Test complete end-to-end database snapshot persistence
node sentiment/tests/test-e2e-worker.js
```
