/**
 * trendGlobalStats.js
 *
 * Maintains a global trend registry in Redis using sorted sets, enabling:
 *   • Cross-trend percentile ranking ("this trend is faster than 92% of trends today")
 *   • Global leaderboard (top N trends right now)
 *   • Historical score tracking per trend label
 *
 * Uses the local Redis instance (same one BullMQ runs on) — no extra infra.
 *
 * ── Redis Keys ──
 *   trend:scores                   — Sorted Set: trendScore by trend label
 *   trend:velocity:24h             — Sorted Set: 24h velocity by trend label
 *   trend:velocity:7d              — Sorted Set: 7d velocity by trend label
 *   trend:velocity:30d             — Sorted Set: 30d velocity by trend label
 *   trend:meta:<trendId>           — Hash: last update, tier, platform mix
 *   trend:history:<trendId>        — List: recent trendScore snapshots (capped)
 *   trend:leaderboard:updated_at   — String: timestamp of last leaderboard refresh
 */

const HISTORY_MAX_LENGTH = 100;   // Keep last 100 score snapshots per trend
const LEADERBOARD_SIZE   = 50;    // Top 50 trends in the leaderboard

// Redis key prefixes
const KEY = {
    scores:      "trend:scores",
    velocity24h: "trend:velocity:24h",
    velocity7d:  "trend:velocity:7d",
    velocity30d: "trend:velocity:30d",
    meta:        (id) => `trend:meta:${id}`,
    history:     (id) => `trend:history:${id}`,
    updatedAt:   "trend:leaderboard:updated_at",
};

// ---------------------------------------------------------------------------
// Record — called after every trend analysis
// ---------------------------------------------------------------------------

/**
 * Stores the trend's metrics in Redis sorted sets and updates metadata.
 * Uses a pipeline for atomicity and performance (single round-trip).
 *
 * @param {import('ioredis').Redis} redis
 * @param {object} trendResult — the output of analyzeTrend()
 */
async function recordTrendStats(redis, trendResult) {
    const { id, name, trendScore, fastestPlatform, influence, _windows } = trendResult;

    const now = Date.now();
    const pipe = redis.pipeline();

    // 1. Global score sorted set
    pipe.zadd(KEY.scores, trendScore, id);

    // 2. Per-window velocity sorted sets
    if (_windows) {
        if (_windows["24h"]) pipe.zadd(KEY.velocity24h, _windows["24h"].velocity, id);
        if (_windows["7d"])  pipe.zadd(KEY.velocity7d,  _windows["7d"].velocity,  id);
        if (_windows["30d"]) pipe.zadd(KEY.velocity30d, _windows["30d"].velocity, id);
    }

    // 3. Trend metadata hash
    pipe.hset(KEY.meta(id),
        "name",          name,
        "trendScore",    String(trendScore),
        "viralityTier",  influence?.viralityTier ?? "dormant",
        "viralityScore", String(influence?.viralityScore ?? 0),
        "fastestPlatform", fastestPlatform ?? "unknown",
        "lastUpdated",   String(now),
        "postCount",     String(trendResult.postCount ?? 0),
        "totalMentions", trendResult.totalMentions ?? "0",
        "approximateReach", trendResult.approximateReach ?? "0",
        "growthPercent",  trendResult.growthPercent ?? "+0%",
    );

    // 4. Score history (capped list — push left, trim right)
    const snapshot = JSON.stringify({
        score: trendScore,
        tier: influence?.viralityTier ?? "dormant",
        timestamp: now,
    });
    pipe.lpush(KEY.history(id), snapshot);
    pipe.ltrim(KEY.history(id), 0, HISTORY_MAX_LENGTH - 1);

    // 5. Leaderboard timestamp
    pipe.set(KEY.updatedAt, String(now));

    await pipe.exec();
}

// ---------------------------------------------------------------------------
// Query — enrich a trend result with global ranking
// ---------------------------------------------------------------------------

/**
 * Queries Redis to compute the trend's percentile rank among all tracked trends.
 * Adds `globalRanking` fields to the result.
 *
 * @param {import('ioredis').Redis} redis
 * @param {object} trendResult — the output of analyzeTrend()
 * @returns {object} trendResult enriched with globalRanking
 */
async function enrichWithGlobalRanking(redis, trendResult) {
    const { id, trendScore } = trendResult;

    // Use pipeline to fetch rank + total in one round-trip
    const pipe = redis.pipeline();
    pipe.zrank(KEY.scores, id);           // 0-based rank (ascending)
    pipe.zcard(KEY.scores);               // total trend count
    pipe.zrevrank(KEY.scores, id);        // 0-based rank (descending — for leaderboard position)
    pipe.lrange(KEY.history(id), 0, 19);  // last 20 score snapshots

    const results = await pipe.exec();

    const rank       = results[0][1];  // ascending rank (null if not found)
    const totalCount = results[1][1];  // total trends tracked
    const revRank    = results[2][1];  // descending rank
    const rawHistory = results[3][1];  // history array

    // Percentile: what fraction of trends score BELOW this one
    let percentile = null;
    if (rank !== null && totalCount > 0) {
        percentile = Math.round((rank / totalCount) * 100);
    }

    // Leaderboard position (1-based)
    const leaderboardPosition = revRank !== null ? revRank + 1 : null;

    // Parse score history
    const scoreHistory = (rawHistory || []).map(entry => {
        try { return JSON.parse(entry); }
        catch { return null; }
    }).filter(Boolean);

    // Score delta (current vs previous)
    let scoreDelta = null;
    if (scoreHistory.length >= 2) {
        scoreDelta = trendScore - scoreHistory[1].score; // [0] is current, [1] is previous
    }

    // Tier movement
    let tierMovement = "stable";
    if (scoreHistory.length >= 2) {
        const prevTier = scoreHistory[1].tier;
        const currTier = trendResult.influence?.viralityTier ?? "dormant";
        if (prevTier !== currTier) {
            const tierOrder = ["dormant", "emerging", "trending", "viral", "mega_viral"];
            const prevIdx = tierOrder.indexOf(prevTier);
            const currIdx = tierOrder.indexOf(currTier);
            tierMovement = currIdx > prevIdx ? "rising" : "falling";
        }
    }

    trendResult.globalRanking = {
        percentile,                      // 0–100, "better than X% of trends"
        leaderboardPosition,             // 1-based rank (1 = top trend)
        totalTrackedTrends: totalCount,  // how many trends are being tracked
        scoreDelta,                      // change since last analysis
        tierMovement,                    // "rising" | "falling" | "stable"
        scoreHistory: scoreHistory.slice(0, 10), // last 10 snapshots for sparkline
    };

    return trendResult;
}

// ---------------------------------------------------------------------------
// Leaderboard — fetch top N trends globally
// ---------------------------------------------------------------------------

/**
 * Returns the top N trending topics across all tracked trend labels.
 *
 * @param {import('ioredis').Redis} redis
 * @param {number} [count=10] — how many to return
 * @returns {Promise<Array<{ id: string, name: string, trendScore: number, viralityTier: string, ... }>>}
 */
async function getGlobalLeaderboard(redis, count = LEADERBOARD_SIZE) {
    // Top N by trendScore (descending)
    const topIds = await redis.zrevrange(KEY.scores, 0, count - 1, "WITHSCORES");

    if (!topIds || topIds.length === 0) return [];

    // Parse [id, score, id, score, ...] pairs
    const entries = [];
    for (let i = 0; i < topIds.length; i += 2) {
        entries.push({ id: topIds[i], trendScore: Number(topIds[i + 1]) });
    }

    // Batch-fetch metadata for all entries
    const pipe = redis.pipeline();
    for (const entry of entries) {
        pipe.hgetall(KEY.meta(entry.id));
    }
    const metaResults = await pipe.exec();

    return entries.map((entry, idx) => {
        const meta = metaResults[idx][1] || {};
        return {
            rank: idx + 1,
            id: entry.id,
            name: meta.name || entry.id,
            trendScore: entry.trendScore,
            viralityTier: meta.viralityTier || "dormant",
            viralityScore: Number(meta.viralityScore) || 0,
            fastestPlatform: meta.fastestPlatform || "unknown",
            postCount: Number(meta.postCount) || 0,
            totalMentions: meta.totalMentions || "0",
            approximateReach: meta.approximateReach || "0",
            growthPercent: meta.growthPercent || "+0%",
            lastUpdated: Number(meta.lastUpdated) || null,
        };
    });
}

// ---------------------------------------------------------------------------
// Cleanup — remove stale trends older than a threshold
// ---------------------------------------------------------------------------

/**
 * Removes trends that haven't been updated in `maxAgeMs` milliseconds.
 * Call periodically (e.g., daily cron) to keep the registry clean.
 *
 * @param {import('ioredis').Redis} redis
 * @param {number} [maxAgeMs=7 * 24 * 3600000] — default 7 days
 * @returns {Promise<number>} number of trends removed
 */
async function pruneStaleEntries(redis, maxAgeMs = 7 * 24 * 3_600_000) {
    const cutoff = Date.now() - maxAgeMs;

    // Get all trend IDs
    const allIds = await redis.zrange(KEY.scores, 0, -1);
    if (allIds.length === 0) return 0;

    // Check each trend's lastUpdated
    const pipe = redis.pipeline();
    for (const id of allIds) {
        pipe.hget(KEY.meta(id), "lastUpdated");
    }
    const results = await pipe.exec();

    const staleIds = [];
    for (let i = 0; i < allIds.length; i++) {
        const lastUpdated = Number(results[i][1]);
        if (!lastUpdated || lastUpdated < cutoff) {
            staleIds.push(allIds[i]);
        }
    }

    if (staleIds.length === 0) return 0;

    // Remove stale entries from all sorted sets + delete their keys
    const cleanupPipe = redis.pipeline();
    for (const id of staleIds) {
        cleanupPipe.zrem(KEY.scores, id);
        cleanupPipe.zrem(KEY.velocity24h, id);
        cleanupPipe.zrem(KEY.velocity7d, id);
        cleanupPipe.zrem(KEY.velocity30d, id);
        cleanupPipe.del(KEY.meta(id));
        cleanupPipe.del(KEY.history(id));
    }
    await cleanupPipe.exec();

    return staleIds.length;
}

module.exports = {
    recordTrendStats,
    enrichWithGlobalRanking,
    getGlobalLeaderboard,
    pruneStaleEntries,
};
