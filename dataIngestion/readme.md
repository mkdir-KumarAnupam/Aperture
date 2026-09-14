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
          │    ├── SentimentQueue     --> [ Sentiment Worker ]
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

Each specialized worker extracts relevant dimensions from `job.data.posts`, completes its computation, and returns an isolated diagnostic object. A temporary category identifier is attached to guide parent aggregation:

**Sentiment Worker (SentimentQueue)**

```json
{
  "category": "sentiment",
  "result": "positive",
  "score": 0.91,
  "distribution": { "positive": 0.74, "neutral": 0.20, "negative": 0.06 }
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

Upon execution, it calls `job.getChildrenValues()` to pull results from all completed child tasks. It strips the operational category tag and compiles the children into a structured dictionary:

```json
{
  "sentiment": {
    "result": "positive",
    "score": 0.91,
    "distribution": { "positive": 0.74, "neutral": 0.20, "negative": 0.06 }
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

**Final Persisted Database Record**

```text
id            │ 1042
trend_label   │ #AIRevolution
combined_data │ {"trend": {...}, "network": {...}, "sentiment": {...}, "demographic": {...}}
created_at    │ 2026-09-14 17:42:10.128492+00
```

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL database (e.g., NeonDB)
- Upstash Redis database (with Stream support)

### 2. Environment Variables

Create a `.env` file in the root directory:

```
# Upstash Redis (Cloud Stream Ingestion)
UPSTASH_REDIS_URL="rediss://default:your-upstash-key@your-region.upstash.io:6379"

# Local Docker Redis (BullMQ Processing Core)
LOCAL_REDIS_URL="redis://127.0.0.1:6379"

# PostgreSQL / NeonDB Connection String
DATABASE_URL="postgresql://user:password@your-endpoint.neon.tech/neondb?sslmode=require"
```

### 3. Start Local Queue Broker

Spin up the local Redis instance configured with Append-Only File (AOF) persistence:

```bash
docker compose up -d
```

### 4. Initialize Database Schema

Execute the schema migration against PostgreSQL:

```bash
node migrate.js
```

### 5. Start Pipeline Processes

Run the consumers and producer in dedicated terminal sessions:

```bash
# Terminal 1: Run analytical workers & aggregator
node workers.js

# Terminal 2: Run ingestion orchestrator
node producer.js
```

---

## Querying JSONB Analytics

Because PostgreSQL natively indexes binary JSON, analytical fields can be queried directly without full document scans:

```sql
-- Find viral trends with strong positive sentiment
SELECT 
    trend_label,
    (combined_data->'trend'->>'velocity')::numeric AS velocity,
    (combined_data->'sentiment'->>'score')::numeric AS sentiment_score
FROM trend_analytics
WHERE (combined_data->'trend'->>'isViral')::boolean = true
  AND (combined_data->'sentiment'->>'score')::numeric > 0.85
ORDER BY velocity DESC;
```