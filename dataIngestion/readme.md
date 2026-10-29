# Real-Time Social Media Analytics Pipeline

A distributed, fault-tolerant ETL pipeline engineered to ingest raw, multi-platform social media streams, normalize polymorphic payloads, execute parallel analytical workloads via a Scatter-Gather pattern, and persist aggregated intelligence into PostgreSQL.

---

## Architecture Overview

The system implements a **Hybrid Edge-to-Core** architecture designed to minimize serverless cloud costs while maintaining enterprise-grade resilience:

```text
[ Scrapers / Producers ]
          │
          ▼
┌─────────────────────────────────┐
│   Edge: Upstash Redis Stream    │  <-- Ephemeral cloud buffer (scrape:events)
└─────────────────────────────────┘
          │
          │ XRANGE / XDEL (Batch extraction every 60s)
          ▼
┌─────────────────────────────────┐
│       Ingestion Producer        │  <-- Parses & defensive normalization
└─────────────────────────────────┘
          │
          │ FlowProducer.addBulk() (Single local round-trip)
          ▼
┌─────────────────────────────────┐
│    Core: Local Docker Redis     │  <-- High-frequency BullMQ orchestration
└─────────────────────────────────┘
          │
          ├─── Scatter (Parallel Fan-Out)
          │    ├── SentimentQueue     --> [ Sentiment Worker (TypeSafe AI JEV) ]
          │    ├── DemographicQueue   --> [ Demographic Worker ]
          │    ├── TrendQueue         --> [ Trend Worker ]
          │    └── NetworkQueue       --> [ Network Worker ]
          │
          └─── Gather (Fan-In)
               └── DatabaseQueue      --> [ Aggregator Worker ]
                                                    │
                                                    ▼
                                     ┌─────────────────────────────┐
                                     │     PostgreSQL (NeonDB)     │
                                     │      (trend_analytics)      │
                                     └─────────────────────────────┘
```

### Why This Hybrid Architecture?

- **Edge Ingestion (Upstash Redis):** Functions strictly as a public ingress point for scrapers. Data is read in bulk and deleted immediately, keeping memory footprint and command counts within free-tier limits.
- **Core Orchestration (Local Docker Redis):** High-frequency queue state operations (polling, locking, heartbeats, and job trees) execute entirely on a dedicated local Redis instance with Append-Only File (AOF) persistence, incurring zero cloud request fees.
- **Scatter-Gather (BullMQ Flows):** Dispatches analytical jobs across specialized worker pools in parallel. The parent task wakes only when all child tasks have resolved, preventing partial writes and database race conditions.
- **Decision-First Sentiment Analytics (JEV SystemOne):** Evaluates batches using TypeSafe AI's JEV SystemOne with Google Gemini LLM fallback, delivering calibrated 4-way sentiment, 8 continuous affect dimensions, and dynamic narrative discovery at $0.042/1M input tokens ($0.00 output tokens).

---

## Data Structures & Contracts

### 1. Ingestion Payload (Upstash Stream)

Raw JSON retrieved from the `scrape:events` stream:

```json
{
  "targetTrendLabel": "#AIRevolution",
  "tweets": [
    {
      "postId": "1839201928374",
      "platform": "twitter",
      "text": "The pace of open source AI models is unbelievable! #AIRevolution",
      "impressionCount": 42000,
      "engagement": { "likes": 1200, "retweets": 340, "replies": 85 }
    }
  ],
  "reddit_posts": [
    {
      "postId": "t3_1f8ab9",
      "platform": "reddit",
      "title": "Discussion on the latest benchmarks",
      "text": "Are proprietary models losing their edge? #AIRevolution",
      "subredditSubscribers": 150000,
      "engagement": { "score": 950, "comments": 210, "upvotes": 1020, "downvotes": 70 }
    }
  ]
}
```

### 2. Child Worker Input (`job.data`)

The producer normalizes posts into a standardized contract and bundles them under the trend label. All four child workers (Sentiment, Demographic, Trend, Network) receive this identical payload:

```json
{
  "trend_label": "#AIRevolution",
  "posts": [
    {
      "postId": "1839201928374",
      "platform": "twitter",
      "authorHandle": null,
      "authorReach": null,
      "text": "The pace of open source AI models is unbelievable! #AIRevolution",
      "title": null,
      "hashtags": ["#airevolution"],
      "publishedAt": "2026-09-14T10:15:30.000Z",
      "interactions": 1625,
      "reach": 42000,
      "engagementRate": 0.03869,
      "approvalScore": 0.92,
      "voteConfidence": 3.18
    },
    {
      "postId": "t3_1f8ab9",
      "platform": "reddit",
      "authorHandle": null,
      "authorReach": 150000,
      "text": "Are proprietary models losing their edge? #AIRevolution",
      "title": "Discussion on the latest benchmarks",
      "hashtags": ["#airevolution"],
      "publishedAt": "2026-09-14T11:00:00.000Z",
      "interactions": 1160,
      "reach": 150000,
      "engagementRate": 0.00773,
      "approvalScore": 0.935,
      "voteConfidence": 2.97
    }
  ]
}
```

### 3. Child Worker Outputs (Return Payloads)

Each specialized worker extracts relevant dimensions from `job.data.posts`, completes its computation, and returns an isolated diagnostic object:

**Sentiment Worker (SentimentQueue - TypeSafe AI JEV SystemOne)**

```json
{
  "category": "sentiment",
  "trend_label": "#AIRevolution",
  "result": "positive",
  "score": 0.91,
  "distribution": { "positive": 0.74, "neutral": 0.20, "negative": 0.06, "mixed": 0.00 },
  "affect": {
    "joy": 0.82,
    "excitement": 0.75,
    "hope": 0.68,
    "anger": 0.02,
    "fear": 0.04,
    "sadness": 0.03,
    "anxiety": 0.06,
    "outrage": 0.01
  },
  "narrative": {
    "id": "2d036851-170a-4865-81af-576f23178265",
    "text": "The rapid pace of open-source AI models is transforming developer productivity.",
    "confidence": 0.98,
    "source": "jev",
    "relevance": 0.92,
    "stance": { "label": "support", "probability": 0.95 }
  },
  "proposedNarrative": null,
  "meta": { "status": "ok", "model": "jev-1.13.0" }
}
```

**Demographic Worker (DemographicQueue)**

```json
{
  "category": "demographic",
  "dominantAgeGroup": "25-34",
  "primaryRegion": "North America",
  "languageDistribution": { "en": 0.88, "es": 0.07, "other": 0.05 }
}
```

**Trend Dynamics Worker (TrendQueue)**

```json
{
  "category": "trend",
  "velocity": 5.4,
  "acceleration": 1.2,
  "isViral": true
}
```

**Network Graph Worker (NetworkQueue)**

```json
{
  "category": "network",
  "centralityScore": 0.78,
  "keyInfluencersCount": 12,
  "clusterDensity": 0.42
}
```

### 4. Aggregator Worker Schema (DatabaseQueue)

The parent worker holds minimal state in `job.data`:

```json
{
  "trend_label": "#AIRevolution"
}
```

Upon execution, it calls `job.getChildrenValues()` to pull results from all completed child tasks. It compiles the children into a structured dictionary for direct JSONB persistence:

```json
{
  "sentiment": {
    "result": "positive",
    "score": 0.91,
    "distribution": { "positive": 0.74, "neutral": 0.20, "negative": 0.06, "mixed": 0.00 },
    "affect": { "joy": 0.82, "excitement": 0.75, "hope": 0.68, "anger": 0.02, "fear": 0.04, "sadness": 0.03, "anxiety": 0.06, "outrage": 0.01 },
    "narrative": {
      "id": "2d036851-170a-4865-81af-576f23178265",
      "text": "The rapid pace of open-source AI models is transforming developer productivity.",
      "confidence": 0.98,
      "source": "jev",
      "relevance": 0.92,
      "stance": { "label": "support", "probability": 0.95 }
    }
  },
  "demographic": {
    "dominantAgeGroup": "25-34",
    "primaryRegion": "North America",
    "languageDistribution": { "en": 0.88, "es": 0.07, "other": 0.05 }
  },
  "trend": {
    "velocity": 5.4,
    "acceleration": 1.2,
    "isViral": true
  },
  "network": {
    "centralityScore": 0.78,
    "keyInfluencersCount": 12,
    "clusterDensity": 0.42
  }
}
```

### 5. PostgreSQL Schema & Storage

**Table Definition (`trend_analytics`)**

```sql
CREATE TABLE IF NOT EXISTS trend_analytics (
    id SERIAL PRIMARY KEY,
    trend_label TEXT NOT NULL,
    combined_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trend_label ON trend_analytics (trend_label);
```

**Single-Row Narrative Pools (`trend_narratives`)**

```sql
CREATE TABLE IF NOT EXISTS trend_narratives (
    trend_label TEXT PRIMARY KEY,
    narratives JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL database (e.g., NeonDB)
- Upstash Redis database (with Stream support)
- TypeSafe AI API Key (`TYPESAFE_API_KEY`)
- Google Gemini API Key (`LLM_API_KEYS`) for fallback

### 2. Environment Variables

Configure `.env` using `.env.example`:

```bash
cp sentiment/.env.example sentiment/.env
```

### 3. Start Local Queue Broker

Spin up the local Redis instance configured with Append-Only File (AOF) persistence:

```bash
docker compose up -d
```

### 4. Initialize Database Schema

Execute schema migrations against PostgreSQL:

```bash
node db/migrate.js
```

### 5. Start Pipeline Processes

```bash
# Terminal 1: Run analytical workers & aggregator
node worker.js

# Terminal 2: Run ingestion producer
node producer.js
```

For detailed benchmarks and accuracy metrics on the sentiment worker, see [`sentiment/README.md`](sentiment/README.md).
