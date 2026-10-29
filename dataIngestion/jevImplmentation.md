# JEV Sentiment & Narrative Analysis Pipeline

## 1. Overview & Objective

The **JEV Sentiment & Narrative Pipeline** is a next-generation social media analytics engine designed for the **Aperture** data ingestion platform. 

It replaces the legacy two-tier local transformer classifier (`pipeline.js`) with a high-speed, calibrated decision architecture powered by:
1. **TypeSafe AI (JEV SystemOne)**: A structured evaluation engine that evaluates batch state against typed questions, extracting overall sentiment, affect/emotion intensities, narrative alignment, and user stance with mathematical confidence scores.
2. **Google Gemini LLM Fallback**: An intelligent escalation layer that automatically detects novel conversational topics and proposes new narratives when existing ones do not fit.
3. **Single-Row JSONB Narrative Pool**: A segregated PostgreSQL store with a 7-day Redis cache that dynamically evolves each trend's narrative universe.
4. **Direct JSONB Snapshot Persistence**: Storage of rich multidimensional sentiment profiles into `trend_sentiment_snapshots` for downstream analytics.

---

## 2. End-to-End Pipeline Flow

```
                     APERTURE SOCIAL DATA INGESTION
                     
               [Social Media Scrapers (X, Reddit, Telegram)]
                                    │
                                    ▼
                         [Upstash Redis Stream]
                                    │
                                    ▼
                      [producer.js (FlowProducer)]
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    [DemographicQueue]        [TrendQueue]           [NetworkQueue]
            │                       │                       │
            └───────────────────────┬───────────────────────┘
                                    │
                                    ▼
                            [SentimentQueue]
                                    │
                       (Canonical job.data payload)
                                    │
                        [sentimentWorker.js]
                                    │
                       1. Extract trend_label
                       2. Normalize events -> posts (by interactions)
                       3. Retrieve Narrative Pool (Redis 7-day / PG)
                                    │
                                    ▼
                         [JEV SystemOne Call]
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
                     │               │              1. Atomic PG Append
                     │               │              2. Redis 7-Day Refresh
                     │               │              3. Follow-up JEV Call
                     │               │                          │
                     └───────────────┼──────────────────────────┘
                                     ▼
                      [Complete Sentiment Analytics Object]
                                     │
                                     ▼
                              [DatabaseQueue]
                                     │
                     persistSentimentSnapshot(snapshotId)
                                     │
                                     ▼
                  [PostgreSQL: trend_sentiment_snapshots]
                        (stored directly in JSONB)
```

---

## 3. Canonical `job.data` Ingestion Contract

### 3.1 Zero Producer Overhead
The pipeline enforces strict separation of concerns. [producer.js](file:///D:/Aperture/dataIngestion/producer.js) is **not modified**; it delivers the canonical collection payload identically to all four child workers (`SentimentQueue`, `DemographicQueue`, `TrendQueue`, `NetworkQueue`).

### 3.2 In-Worker Field Extraction & Normalization
Inside [sentimentWorker.js](file:///D:/Aperture/dataIngestion/sentiment/JEV/sentimentWorker.js), the worker dynamically extracts the fields it needs:
* **Trend Label**:
  ```javascript
  const trend_label = canonical.trend?.label ?? canonical.trend?.query ?? "unknown";
  ```
* **Post Selection & Interaction Weighting**:
  Filters canonical events for non-empty text, calculates interaction weights (`likes + reposts + replies + quotes`), and sorts the top posts:
  ```javascript
  const posts = canonical.events
    .filter(event => typeof event.content?.text === 'string' && event.content.text.trim().length > 0)
    .map(event => ({
      postId: event.eventId,
      platform: event.platform || 'unknown',
      text: event.content.text.trim(),
      interactions:
        Number(event.metrics?.likes || 0) +
        Number(event.metrics?.reposts || 0) +
        Number(event.metrics?.replies || 0) +
        Number(event.metrics?.quotes || 0)
    }));
  ```
* **Batch State Construction**:
  `buildBatchState(trendLabel, posts)` sorts by interactions descending, caps at `BATCH_POST_LIMIT` (30 posts), and truncates to `BATCH_CHAR_LIMIT` (112,000 characters).

---

## 4. JEV SystemOne Model Execution

TypeSafe AI's JEV model (`jev-1.13.0`) evaluates batch context against strongly-typed questions using calibrated probabilistic outputs.

### 4.1 Question Structs
1. **Sentiment**: Discrete `choice` across `positive`, `negative`, `neutral`, `mixed`.
2. **Narrative Selection**: Discrete `choice` across all active pool narratives + `"none_of_these"`.
3. **Affect (Emotions)**: Continuous `noul` (0.0 to 1.0 probability) across 8 dimensions:
   - `anger`, `fear`, `joy`, `sadness`, `anxiety`, `excitement`, `outrage`, `hope`.
4. **Narrative Relevance & Stance**: Per-narrative evaluation:
   - `relevance_<id>`: Continuous `noul` scale.
   - `stance_<id>`: Discrete `choice` (`support`, `oppose`, `neutral`, `discussing`).

### 4.2 Why Output Tokens Cost $0
Unlike traditional autoregressive LLMs, JEV is a decision-first system. It calculates probabilities and structured criteria rather than generating open-ended conversational text. Output tokens are priced at **$0.00 (free)**, with input tokens priced at **$0.042 per million**.

---

## 5. Narrative Pool Architecture (Single-Row JSONB per Trend)

To keep the narrative universe segregated and fast to query, narrative pools are organized **one row per trend** in PostgreSQL with Redis caching.

### 5.1 Database Schema (`trend_narratives`)
```sql
CREATE TABLE IF NOT EXISTS trend_narratives (
    trend_label     TEXT PRIMARY KEY,
    narratives      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 Single-Row Record Format
Each row stores that trend's entire historical narrative universe:
```json
{
  "trend_label": "#JioIPOlisting",
  "narratives": [
    {
      "id": "2d036851-170a-4865-81af-576f23178265",
      "narrative_text": "Jio Platforms made a strong stock market debut, listing at a significant premium over its issue price.",
      "created_at": "2026-10-28T13:54:46.597Z",
      "updated_at": "2026-10-28T13:54:46.597Z"
    },
    {
      "id": "7a89bc31-29cf-4b12-98ab-81af576f4412",
      "narrative_text": "Investors express concern over high debt and aggressive valuation multiples.",
      "created_at": "2026-10-28T14:10:00.000Z",
      "updated_at": "2026-10-28T14:10:00.000Z"
    }
  ],
  "created_at": "2026-10-28 13:54:46+00",
  "updated_at": "2026-10-28 14:10:00+00"
}
```

### 5.3 7-Day Redis Cache & Dual-Write
* **Cache Key**: `narrative_pool:${trend_label}`
* **TTL**: **7 Days** (`604,800 seconds`).
* **Cache Miss**: Single row query `SELECT narratives FROM trend_narratives WHERE trend_label = $1`, stored in Redis with 7-day TTL.
* **Dual-Write Append**:
  When Gemini proposes a new narrative, it is atomically appended to PostgreSQL using `||` and immediately synced to Redis:
  ```sql
  INSERT INTO trend_narratives (trend_label, narratives, updated_at)
  VALUES ($1, jsonb_build_array($2::jsonb), NOW())
  ON CONFLICT (trend_label)
  DO UPDATE SET
    narratives = trend_narratives.narratives || jsonb_build_array($2::jsonb),
    updated_at = NOW();
  ```

---

## 6. Gemini LLM Fallback & Key Rotation

When JEV confidence on existing narratives is below the acceptance threshold (`NARRATIVE_ACCEPTANCE_THRESHOLD = 0.7`) or when JEV picks `"none_of_these"`, the LLM fallback takes over.

### 6.1 Multi-Key Rotation with Cooldowns
* `LLM_API_KEYS`: A comma-separated list of Gemini API keys.
* When a key encounters an HTTP 429 rate limit, it is placed into Redis cooling:
  ```javascript
  await cacheRedis.set(`cooling_key:${activeKey}`, '1', 'EX', retryAfterSeconds);
  ```
* Requests dynamically pick the next available active key, preventing pipeline blockage.

### 6.2 Schema Validation
Responses are strictly forced to JSON (`responseMimeType: "application/json"`) and validated with Zod:
```javascript
const LLMFallbackSchema = z.object({
  decision: z.enum(['existing', 'new']),
  narrativeId: z.string().optional(),
  newNarrative: z.string().optional()
}).refine(data => 
  (data.decision === 'existing' && !!data.narrativeId) || 
  (data.decision === 'new' && !!data.newNarrative)
);
```

---

## 7. PostgreSQL Snapshot Persistence Contract

The sentiment worker emits this clean analytics object:
```json
{
  "category": "sentiment",
  "trend_label": "#TurnAroundStock",
  "result": "positive",
  "score": 0.85,
  "distribution": {
    "positive": 0.89,
    "negative": 0.00,
    "neutral": 0.07,
    "mixed": 0.04
  },
  "affect": {
    "anger": 0.04,
    "fear": 0.22,
    "joy": 0.46,
    "sadness": 0.05,
    "anxiety": 0.30,
    "excitement": 0.74,
    "outrage": 0.05,
    "hope": 0.76
  },
  "narrative": {
    "id": "1da070ca-db6e-4847-a7d0-a13a1aa945a8",
    "text": "Investors are closely tracking financial metrics and post-acquisition turnaround potential.",
    "confidence": 0.99,
    "source": "llm",
    "relevance": 0.94,
    "stance": {
      "label": "support",
      "probability": 0.99
    }
  },
  "proposedNarrative": "Investors are closely tracking financial metrics...",
  "meta": {
    "status": "ok",
    "model": "jev-1.13.0",
    "relevanceIsEstimate": true,
    "reprocessed": false
  }
}
```

In [worker.js](file:///D:/Aperture/dataIngestion/worker.js), `persistSentimentSnapshot()` saves this entire object directly into PostgreSQL `trend_sentiment_snapshots.data`:
```sql
INSERT INTO trend_sentiment_snapshots (snapshot_id, data)
VALUES ($1, $2)
ON CONFLICT (snapshot_id)
DO UPDATE SET data = EXCLUDED.data;
```

---

## 8. Configuration Reference (`.env`)

| Variable | Description | Default / Recommended |
| :--- | :--- | :--- |
| `LOCAL_REDIS_URL` | Local Redis URL for BullMQ queues and narrative caching | `redis://127.0.0.1:6379` |
| `UPSTASH_REDIS_URL` | Redis Stream URL for scraper ingestion | `rediss://...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `TYPESAFE_API_KEY` | API Key for TypeSafe AI JEV model | Required |
| `LLM_API_KEYS` | Comma-separated Gemini API keys for fallback rotation | Required |
| `GEMINI_MODEL` | Gemini model name for fallback | `gemini-3.5-flash` |
| `NARRATIVE_ACCEPTANCE_THRESHOLD` | Confidence threshold above which JEV choice is accepted without LLM | `0.70` |
| `NARRATIVE_CAP` | Maximum narratives allowed in one trend pool | `50` |
| `BATCH_POST_LIMIT` | Max posts analyzed per trend batch | `30` |
| `BATCH_CHAR_LIMIT` | Character limit for batch JSON state | `112000` |
| `JEV_TIMEOUT_MS` | Timeout for JEV API calls | `30000` (30s) |
| `WORKER_CONCURRENCY` | Concurrent jobs per Sentiment worker instance | `2` |

---

## 9. Operating, Testing & Verifying

### 9.1 Start Infrastructure
```powershell
# 1. Start BullMQ Redis in Docker
docker compose -f dataIngestion/docker-compose.yml up -d

# 2. Run Database Migrations
node dataIngestion/db/migrate.js
```

### 9.2 Run Automated Verification Tests
```powershell
# 1. Test Dual-Write & 7-Day TTL (Redis + PostgreSQL JSONB single row)
$env:NODE_PATH="D:\Aperture\dataIngestion\node_modules"; node --env-file=dataIngestion/.env dataIngestion/sentiment/JEV/test-dual-write.js

# 2. Test Canonical Pipeline Execution (JEV + Gemini Fallback + Scoring)
$env:NODE_PATH="D:\Aperture\dataIngestion\node_modules"; node --env-file=dataIngestion/.env dataIngestion/sentiment/JEV/test-pipeline-run.js

# 3. Test Full E2E Worker to Snapshot Persistence
$env:NODE_PATH="D:\Aperture\dataIngestion\node_modules"; node --env-file=dataIngestion/.env dataIngestion/sentiment/JEV/test-e2e-worker.js
```

### 9.3 Launch Ingestion Pipeline
```powershell
# Terminal 1: Producer (Reads Redis stream and dispatches BullMQ flows)
$env:NODE_PATH="D:\Aperture\dataIngestion\node_modules"; node --env-file=dataIngestion/.env dataIngestion/producer.js

# Terminal 2: Worker (Processes Sentiment, Demographic, Trend, Network, and Database queues)
$env:NODE_PATH="D:\Aperture\dataIngestion\node_modules"; node --env-file=dataIngestion/.env dataIngestion/worker.js
```

---

## 10. Cost Breakdown & Economics

* **TypeSafe AI (JEV)**: **$0.042 / 1M input tokens** | **$0.00 output**
* **Google Gemini (Flash)**: **$0.75 / 1M input tokens** | **$3.75 / 1M output**

### Cost per 1 Batch (30 Posts):
* **Best Case (Existing Narrative Match, 1 JEV call)**: **$0.00032** *(0.032 cents)*
* **Average Production Case (~80% cache hit, ~20% fallback)**: **$0.00205** *(0.20 cents)*
* **Absolute Worst Case (100% LLM fallback with JSON retry + 2nd JEV call)**: **$0.00893** *(0.89 cents)*

### Scale Projection:
* **10,000 Batches (300,000 posts)**: **~$20.50**
* **50,000 Batches (1,500,000 posts)**: **~$102.50**
* **100,000 Batches (3,000,000 posts)**: **~$205.00**
