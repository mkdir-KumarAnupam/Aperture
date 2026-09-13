# Social Media Analytics ETL Pipeline

A high-performance, fault-tolerant ETL (Extract, Transform, Load) pipeline built with **Node.js**, **BullMQ**, **Upstash Redis**, and **PostgreSQL**.

The pipeline ingests raw social media data (Twitter/X, Reddit) from a Redis Stream, normalizes diverse data structures into a unified canonical schema, dispatches workloads across four specialized processing queues in parallel, and loads structured records into PostgreSQL.

---

## Architecture & Data Flow

```text
               +----------------------------------+
               |  Scraper / Upstash Redis Stream  |
               |        (key: scrape:events)      |
               +-----------------+----------------+
                                 |
                                 | XRANGE (Batch limit: 50) & XDEL
                                 v
               +-----------------+----------------+
               |      producer.js (Orchestrator)  |
               |   - Polls stream interval        |
               |   - Normalizes data via map      |
               |   - Dispatches via addBulk       |
               +-----------------+----------------+
                                 |
         +-----------------------+-----------------------+
         |                       |                       |
         v                       v                       v
+-----------------+     +-----------------+     +-----------------+     +-----------------+
| SentimentQueue  |     |DemographicQueue |     |   TrendQueue    |     |  NetworkQueue   |
+--------+--------+     +--------+--------+     +--------+--------+     +--------+--------+
         |                       |                       |                       |
         v                       v                       v                       v
+-----------------+     +-----------------+     +-----------------+     +-----------------+
| Sentiment Worker|     |Demographic Worker     |  Trend Worker   |     | Network Worker  |
+--------+--------+     +--------+--------+     +--------+--------+     +--------+--------+
         |                       |                       |                       |
         +-----------------------+-----------------------+-----------------------+
                                 |
                                 | Parameterized SQL Inserts
                                 v
               +-----------------+----------------+
               |       PostgreSQL Database        |
               | (sentiments, demographics, etc.) |
               +----------------------------------+
```

---

## Tech Stack

* **Runtime:** Node.js (v18+)
* **Message Broker / Stream:** Upstash Redis (Serverless), `ioredis`
* **Queue Engine:** BullMQ
* **Database:** PostgreSQL (with `JSONB` support)

---

## Project Structure

```text
├── config.js        # Redis connection factory, PostgreSQL client, keepAlive & TLS setup
├── queues.js        # BullMQ queue instances sharing an optimized Redis client
├── normalize.js     # Canonical schema transformation logic (Twitter/X & Reddit)
├── producer.js      # Orchestrator: polls Redis Stream, normalizes, and enqueues jobs
└── workers.js       # Background workers consuming queues and persisting to PostgreSQL
```

---

## Database Setup

Run the following SQL migration on your PostgreSQL instance to create the target tables:

```sql
CREATE TABLE IF NOT EXISTS sentiments (
    id SERIAL PRIMARY KEY,
    platform TEXT,
    post_id TEXT,
    normalized_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demographics (
    id SERIAL PRIMARY KEY,
    platform TEXT,
    post_id TEXT,
    normalized_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trends (
    id SERIAL PRIMARY KEY,
    platform TEXT,
    post_id TEXT,
    normalized_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS networks (
    id SERIAL PRIMARY KEY,
    platform TEXT,
    post_id TEXT,
    normalized_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## Core Components

### 1. `config.js`
Handles connection lifecycle management. Exports `createRedisConnection` (a factory returning dedicated clients for blocking workers) and `sharedRedis` (for lightweight queue/stream operations).

### 2. `queues.js`
Initializes the four BullMQ queues using the shared Redis client.

### 3. `normalize.js`
Standardizes platform variations into a single canonical contract. Missing fields are parsed as `null` rather than fabricated values to ensure statistical accuracy downstream.

### 4. `producer.js`
Polls the Redis stream, normalizes records, and bulk-enqueues them using `Queue.addBulk()` to minimize round-trip commands.

## Installation & Execution

### 1. Install Dependencies

```bash
npm install bullmq ioredis pg
```

### 2. Configure Environment

Provide your connection strings in `config.js` or via environment variables:

```bash
export UPSTASH_REDIS_URL="rediss://default:your-password@your-endpoint.upstash.io:port"
export DATABASE_URL="postgres://user:password@localhost:5432/your_database"
```

### 3. Run Pipeline Processes

Run the worker consumers and producer orchestrator in separate terminal sessions:

**Terminal 1 (Workers):**

```bash
node workers.js
```

**Terminal 2 (Producer):**

```bash
node producer.js
```

---

## System Design Considerations

1. **Connection Factory Isolation**
   BullMQ workers use blocking Redis commands (`BRPOPLPUSH` / `BLMOVE`). If multiple workers share a single Redis connection, blocking calls induce race conditions and cause connection resets (`ECONNRESET`). Each worker receives its own dedicated socket via `createRedisConnection()`.

2. **Serverless Cost & Rate-Limit Optimization**
   * Avoids active polling (`pingInterval`) which burns through serverless Redis request quotas.
   * Relies on free OS-level TCP keep-alive packets (`keepAlive: 10000`).
   * Replaces per-job queue additions with `Queue.addBulk()`, drastically reducing round-trip commands.

3. **Data Integrity & Schema Guarantees**
   Downstream analytics formulas (such as Z-score calculations and velocity windows) depend on strictly valid distributions. Missing fields default to `null` rather than dummy zero values, to avoid skewing downstream analytical models.