# Social Media Analytics Framework: Handoff Documentation

This document provides a detailed technical specification of the data extraction pipeline, structural schema, and storage paths. The objective of this framework is to operate a robust, deep-scraping pipeline designed for advanced NLP and network analysis.

---

## 1. Core Architecture

The system operates continuously via a background daemon (`daemon.py`) that runs 24/7. 
1. **Trend Discovery**: Every minute, it fetches the top 10 trends from X (Twitter) and the hottest posts across 5 major Indian subreddits (r/india, r/mumbai, r/delhi, r/bollywood, r/unitedstatesofindia).
2. **Deep Scraping**: It picks a trend, queries both X and Reddit for the top posts related to that trend, and actively mines the resulting data.
3. **Data Ingestion**: The raw payloads are dumped to disk, and the parsed fields are inserted or updated via an Upsert operation into a unified SQLite database using Prisma ORM.

---

## 2. The Data: What We Collect

We track two primary entities: **Posts** (content) and **Authors** (creators). We have explicitly split the schema to accommodate the wildly different nuances of X (Twitter) and Reddit.

### A. Posts & Content

Every post in the database contains universal metadata. Beyond that, we capture platform-specific metrics.

#### Universal Post Fields (All Platforms)

| Field | Type | Description |
| :--- | :--- | :--- |
| **`id`** | `String` | Unique internal UUID. |
| **`platform`** | `String` | Either `"x"` or `"reddit"`. |
| **`postId`** | `String` | The native ID of the post on the platform. |
| **`authorId`** | `String` | The ID of the author/creator. |
| **`text`** | `String` | The main body of the post. |
| **`timestamp`** | `DateTime` | When the post was published. |
| **`detectedLang`** | `String?` | Auto-detected language via `langdetect` (e.g., `en`, `hi`). |
| **`hashtags`** | `String` | JSON array of all hashtags extracted from the text. |
| **`trendLabel`** | `String?` | The specific trend/topic this post was scraped under. |
| **`sourceLayer`** | `String` | `trend_seed`, `keyword_search`, or `author_lookup`. |

#### X (Twitter) Specific Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| **`conversationId`** | `String?` | Crucial for tracking entire threads of tweets. |
| **`engagement`** | `JSON String` | Structured `{ likes, retweets, replies }`. |
| **`replyCount`** | `Int?` | Total direct replies. |
| **`quoteCount`** | `Int?` | Total quote retweets. |
| **`bookmarkCount`** | `Int?` | Total times bookmarked. |
| **`impressionCount`** | `Int?` | Total views/impressions. |
| **`possiblySensitive`** | `Boolean?` | Flag indicating if X flagged the media/content. |
| **`attachments`** | `String?` | JSON array containing URLs to attached media. |
| **`replyToId` / `quoteTweetId`** | `String?` | The ID of the parent tweet, if applicable. |

#### Reddit Specific Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| **`subreddit`** | `String?` | The community it was posted in (e.g., `india`). |
| **`title`** | `String?` | The actual title of the Reddit submission. |
| **`engagement`** | `JSON String` | Structured `{ upvotes, comments }`. |
| **`upvoteRatio`** | `Float?` | Percentage of upvotes vs downvotes (e.g., `0.95`). |
| **`numComments`** | `Int?` | Total comments in the thread. |
| **`linkFlairText`** | `String?` | The tag/flair applied (e.g., "News", "Politics"). |
| **`depth`** | `Int?` | Recursively scraped comment depth (0 = root post). |
| **`parentId`** | `String?` | Target of the direct reply for comment tree graphing. |
| **`isSubmitter`** | `Boolean?` | Indicates if the commenter is the Original Poster (OP). |

> [!TIP]
> **A Note on Reddit Views**: Reddit does not expose public "view" counts through its standard API unless you own the post. We rely on the `upvoteRatio` and `score` (upvotes) to determine post reach.

### B. Authors & Creators

When a post is ingested, we add its author to a background queue. The system then queries the platforms for detailed user profiles.

#### Universal Author Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| **`id`** | `String` | Unique internal UUID. |
| **`platform`** | `String` | Either `"x"` or `"reddit"`. |
| **`authorId`** | `String` | Native platform ID. |
| **`handle`** | `String?` | Human-readable handle (`@handle` or `u/username`). |
| **`bio`** | `String?` | Extracted direct biography string. |
| **`location`** | `String?` | Raw string of their stated location. |
| **`region`** | `String?` | Algorithmically parsed state/country from the location. |
| **`followerCount`** | `Int?` | Total audience size (used primarily for X). |
| **`verified`** | `Boolean?` | Verification status (e.g., X Premium checkmark). |

#### X (Twitter) Specific Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| **`name`** | `String?` | The user's display name. |
| **`pinnedTweetId`** | `String?` | The ID of the tweet pinned to their profile. |
| **`profileImageUrl`** | `String?` | Link to their avatar. |

#### Reddit Specific Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| **`linkKarma`** | `Int?` | Reputation earned from posting submissions. |
| **`commentKarma`** | `Int?` | Reputation earned from commenting. |
| **`isGold`** | `Boolean?` | Indicates if the user holds a premium account. |
| **`isMod`** | `Boolean?` | Indicates if the user is a subreddit moderator. |

### C. Network & Metadata Collections

Beyond flat tables, the database generates calculated topological edges and metadata.

| Table | Description | Fields |
| :--- | :--- | :--- |
| **`Trend`** | Active snapshots of platform trends. | `label`, `volume`, `platform`, `fetchedAt`, `tweetCount` |
| **`Edge`** | Social interaction nodes (User A -> User B). | `sourceAuthor`, `targetAuthor`, `edgeType`, `weight` |
| **`HashtagPair`** | Co-occurrence mapping for topic bridges. | `tagA`, `tagB`, `count` |

---

## 3. Raw Data Store (Reproducibility)

> [!IMPORTANT]
> **Data Loss Prevention**
> We know that Data Scientists often change their minds about what features they want to extract.

To ensure total reproducibility, **we never throw away the raw data**.
Before any normalization or parsing occurs, the Python Scraper API silently dumps the unaltered, raw JSON payloads returned directly by X and Reddit to the disk.

**Location**: `scraper/data/raw/`
**Naming Convention**: `{platform}_{endpoint}_{timestamp}.json` (e.g., `reddit_comments_20260910_212204.json`)

If downstream NLP algorithms or data engineers decide they want to extract a brand new obscure parameter from the payload, there is no need to re-scrape the platform and burn valuable API quota. A script can simply replay these raw JSON dumps back through the ingestion pipeline!

---

## 4. File Structure & Logic Routing

*   **Database Schema**: `web/prisma/schema.prisma` (Source of truth for SQL tables).
*   **Ingestion Logic**: `web/src/app/api/ingest/route.ts` (API JSON to Database column mapping).
*   **Scraper Endpoints**: `scraper/main.py` (X and Reddit extraction logic).
*   **Background Loop**: `scraper/daemon.py` (Chronological daemon engine).
