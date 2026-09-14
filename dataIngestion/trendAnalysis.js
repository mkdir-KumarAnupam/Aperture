/**
 * trendAnalysis.js
 *
 * Computes trend analytics for a batch of normalized posts belonging to
 * a single trend_label, and returns them in the TrendAnalytics shape
 * expected by the frontend.
 *
 * Consumes the NormalizedPost shape produced by normalizeData.js.
 * All computations are pure — no external API calls, no side effects.
 *
 * ── Features ──
 *   • Temporal decay weighting   — recent posts contribute more than old ones
 *   • Author influence multiplier — high-reach authors amplify trend signals
 *   • Virality tiers              — 5-tier classification instead of binary
 *   • Three time windows          — 24h, 7d, 30d analysed independently
 *
 * ── Output Fields ──
 *   id, name, trendScore, platformActivity, totalMentions,
 *   approximateReach, growthPercent, peakGrowth, peakDate,
 *   fastestPlatform, lifecycle, influence, posts
 */

// ---------------------------------------------------------------------------
// Configurable constants
// ---------------------------------------------------------------------------

const DECAY_HALF_LIFE = {
    "24h": 4,
    "7d":  24,
    "30d": 72,
};

const WINDOW_HOURS = {
    "24h": 24,
    "7d":  7 * 24,
    "30d": 30 * 24,
};

const BUCKET_SIZE = {
    "24h": 1,
    "7d":  6,
    "30d": 24,
};

const VIRALITY_TIERS = [
    { max: 0.20, tier: "dormant"    },
    { max: 0.40, tier: "emerging"   },
    { max: 0.60, tier: "trending"   },
    { max: 0.80, tier: "viral"      },
    { max: 1.01, tier: "mega_viral" },
];

const VIRALITY_WEIGHTS = {
    velocityNorm:     0.35,
    burstScore:       0.20,
    accelerationNorm: 0.15,
    engagementNorm:   0.15,
    influenceNorm:    0.15,
};

const MIN_POSTS_FOR_TREND = 2;
const TOP_INFLUENCER_COUNT = 5;

// ---------------------------------------------------------------------------
// Main entry point — called by the TrendQueue worker
// ---------------------------------------------------------------------------

/**
 * @param {{ trend_label: string, posts: import('./normalizeData').NormalizedPost[] }} jobData
 * @returns {TrendAnalyticsResult}
 */
function analyzeTrend(jobData) {
    const { trend_label, posts } = jobData;
    const now = Date.now();

    // Guard: not enough data
    if (!posts || posts.length < MIN_POSTS_FOR_TREND) {
        return buildEmptyResult(trend_label, posts || []);
    }

    // ── Enrich posts with computed fields ─────────────────────────
    const enriched = posts.map(post => {
        const ts = post.publishedAt ?? post.observedAt;
        const epochMs = ts ? new Date(ts).getTime() : null;
        const ageHours = epochMs && !isNaN(epochMs) ? (now - epochMs) / 3_600_000 : null;

        return {
            ...post,
            _epochMs: epochMs && !isNaN(epochMs) ? epochMs : null,
            _ageHours: ageHours,
            _influenceMultiplier: computeInfluenceMultiplier(post),
        };
    });

    // ── Per-window analysis ───────────────────────────────────────
    const windowResults = {};
    for (const [windowKey, windowHours] of Object.entries(WINDOW_HOURS)) {
        const windowPosts = enriched.filter(
            p => p._ageHours !== null && p._ageHours >= 0 && p._ageHours <= windowHours
        );
        windowResults[windowKey] = analyzeWindow(windowPosts, windowKey, now);
    }

    // ── Overall (all posts, 30d decay params) ─────────────────────
    const validPosts = enriched.filter(p => p._epochMs !== null);
    const overall = analyzeWindow(validPosts.length >= MIN_POSTS_FOR_TREND ? validPosts : enriched, "30d", now);

    // ==================================================================
    // Shape the output into TrendAnalytics fields
    // ==================================================================

    // ── id ────────────────────────────────────────────────────────
    const id = slugify(trend_label);

    // ── trendScore (0–100) ────────────────────────────────────────
    const trendScore = Math.round(overall.viralityScore * 100);

    // ── platformActivity ──────────────────────────────────────────
    const platformActivity = computePlatformActivity(posts);

    // ── totalMentions (human-readable) ────────────────────────────
    const totalMentions = humanizeNumber(posts.length);

    // ── approximateReach (human-readable) ─────────────────────────
    let rawReach = 0;
    for (const post of posts) {
        rawReach += post.reach ?? post.authorReach ?? 0;
    }
    const approximateReach = humanizeNumber(rawReach);

    // ── growthPercent ─────────────────────────────────────────────
    const growthPercent = computeGrowthPercent(enriched, now);

    // ── peakGrowth & peakDate ─────────────────────────────────────
    const { peakGrowth, peakDate } = computePeakMetrics(enriched, now);

    // ── fastestPlatform ───────────────────────────────────────────
    const fastestPlatform = computeFastestPlatform(posts);

    // ── lifecycle (time-series per window) ─────────────────────────
    const lifecycle = {
        "24h": buildLifecycleSeries(enriched, "24h", now),
        "7d":  buildLifecycleSeries(enriched, "7d",  now),
        "30d": buildLifecycleSeries(enriched, "30d", now),
    };

    // ── influence ─────────────────────────────────────────────────
    const influence = {
        avgInfluence: overall.avgInfluence,
        topInfluencers: overall.topInfluencers,
        viralityTier: overall.viralityTier,
        viralityScore: overall.viralityScore,
    };

    // ── posts (passthrough, trimmed to essential fields) ──────────
    const outputPosts = posts.map(p => ({
        postId:        p.postId,
        platform:      p.platform,
        authorHandle:  p.authorHandle,
        text:          p.text,
        title:         p.title,
        publishedAt:   p.publishedAt,
        interactions:  p.interactions,
        reach:         p.reach,
        engagementRate: p.engagementRate,
        approvalScore: p.approvalScore,
        hashtags:      p.hashtags,
    }));

    return {
        category: "trend",
        id,
        name: trend_label,
        trendScore,
        platformActivity,
        totalMentions,
        approximateReach,
        growthPercent,
        peakGrowth,
        peakDate,
        fastestPlatform,
        lifecycle,
        influence,
        posts: outputPosts,

        // Raw window metrics (useful for debugging / advanced consumers)
        _windows: windowResults,
        _overall: overall,
    };
}

// ===========================================================================
// Field computation helpers
// ===========================================================================

/**
 * Groups posts by platform and aggregates per-platform stats.
 * @returns {{ [platform: string]: { posts: number, interactions: number, avgEngagement: number|null } }}
 */
function computePlatformActivity(posts) {
    const platforms = {};

    for (const post of posts) {
        const plat = post.platform ?? "unknown";
        if (!platforms[plat]) {
            platforms[plat] = { posts: 0, interactions: 0, engSum: 0, engCount: 0 };
        }
        platforms[plat].posts++;
        platforms[plat].interactions += post.interactions ?? 0;
        if (post.engagementRate !== null && post.engagementRate !== undefined) {
            platforms[plat].engSum += post.engagementRate;
            platforms[plat].engCount++;
        }
    }

    const result = {};
    for (const [plat, data] of Object.entries(platforms)) {
        result[plat] = {
            posts: data.posts,
            interactions: data.interactions,
            avgEngagement: data.engCount > 0
                ? round(data.engSum / data.engCount, 4)
                : null,
        };
    }
    return result;
}

/**
 * Computes overall growth percentage by comparing the first half
 * of the observation period to the second half.
 */
function computeGrowthPercent(enrichedPosts, now) {
    const withTime = enrichedPosts
        .filter(p => p._epochMs !== null)
        .sort((a, b) => a._epochMs - b._epochMs);

    if (withTime.length < 2) return "+0%";

    const midpoint = Math.floor(withTime.length / 2);
    const firstHalf = withTime.slice(0, midpoint);
    const secondHalf = withTime.slice(midpoint);

    const firstInteractions = firstHalf.reduce((s, p) => s + (p.interactions ?? 0), 0);
    const secondInteractions = secondHalf.reduce((s, p) => s + (p.interactions ?? 0), 0);

    if (firstInteractions === 0) {
        return secondInteractions > 0 ? "+∞%" : "+0%";
    }

    const pct = ((secondInteractions - firstInteractions) / firstInteractions) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${Math.round(pct)}%`;
}

/**
 * Finds the peak activity bucket and computes peak growth vs average.
 * Returns { peakGrowth: "+126%", peakDate: "Sep 14" }
 */
function computePeakMetrics(enrichedPosts, now) {
    const withTime = enrichedPosts
        .filter(p => p._epochMs !== null)
        .sort((a, b) => a._epochMs - b._epochMs);

    if (withTime.length < 2) {
        const fallbackDate = withTime.length === 1
            ? formatShortDate(new Date(withTime[0]._epochMs))
            : formatShortDate(new Date(now));
        return { peakGrowth: "+0%", peakDate: fallbackDate };
    }

    // Use 6-hour buckets for peak detection
    const bucketSizeMs = 6 * 3_600_000;
    const t0 = withTime[0]._epochMs;
    const buckets = {};

    for (const post of withTime) {
        const bucketKey = Math.floor((post._epochMs - t0) / bucketSizeMs);
        if (!buckets[bucketKey]) {
            buckets[bucketKey] = { interactions: 0, epochMs: t0 + bucketKey * bucketSizeMs };
        }
        buckets[bucketKey].interactions += post.interactions ?? 0;
    }

    const bucketArr = Object.values(buckets);
    if (bucketArr.length === 0) {
        return { peakGrowth: "+0%", peakDate: formatShortDate(new Date(now)) };
    }

    const avgInteractions = bucketArr.reduce((s, b) => s + b.interactions, 0) / bucketArr.length;
    const peak = bucketArr.reduce((best, b) => b.interactions > best.interactions ? b : best, bucketArr[0]);

    let peakGrowthPct = 0;
    if (avgInteractions > 0) {
        peakGrowthPct = ((peak.interactions - avgInteractions) / avgInteractions) * 100;
    }

    const sign = peakGrowthPct >= 0 ? "+" : "";
    return {
        peakGrowth: `${sign}${Math.round(peakGrowthPct)}%`,
        peakDate: formatShortDate(new Date(peak.epochMs)),
    };
}

/**
 * Determines which platform has the highest velocity (interactions/hour).
 * @returns {string} platform name
 */
function computeFastestPlatform(posts) {
    const platformVelocities = {};

    for (const post of posts) {
        const plat = post.platform ?? "unknown";
        if (!platformVelocities[plat]) {
            platformVelocities[plat] = { totalRate: 0, count: 0 };
        }

        const window = post.velocityWindow;
        if (window !== null && window > 0) {
            platformVelocities[plat].totalRate += (post.interactions ?? 0) / window;
            platformVelocities[plat].count++;
        }
    }

    let fastest = "unknown";
    let maxVelocity = -1;

    for (const [plat, data] of Object.entries(platformVelocities)) {
        if (data.count > 0) {
            const avgVelocity = data.totalRate / data.count;
            if (avgVelocity > maxVelocity) {
                maxVelocity = avgVelocity;
                fastest = plat;
            }
        }
    }

    return fastest;
}

/**
 * Builds a time-series array for the lifecycle chart.
 * Each data point: { date: "Sep 14 03:00", interactions: 350, posts: 12 }
 *
 * @param {Array} enrichedPosts
 * @param {string} windowKey - "24h" | "7d" | "30d"
 * @param {number} now - epoch ms
 * @returns {Array<{ date: string, interactions: number, posts: number }>}
 */
function buildLifecycleSeries(enrichedPosts, windowKey, now) {
    const windowHours = WINDOW_HOURS[windowKey];
    const bucketSizeHours = BUCKET_SIZE[windowKey];
    const cutoff = now - windowHours * 3_600_000;

    const windowPosts = enrichedPosts.filter(
        p => p._epochMs !== null && p._epochMs >= cutoff && p._epochMs <= now
    );

    if (windowPosts.length === 0) return [];

    windowPosts.sort((a, b) => a._epochMs - b._epochMs);

    // Build buckets anchored to the window start
    const bucketSizeMs = bucketSizeHours * 3_600_000;
    const totalBuckets = Math.ceil(windowHours / bucketSizeHours);
    const buckets = new Array(totalBuckets).fill(null).map((_, i) => ({
        epochMs: cutoff + i * bucketSizeMs,
        interactions: 0,
        posts: 0,
    }));

    for (const post of windowPosts) {
        const bucketIdx = Math.min(
            Math.floor((post._epochMs - cutoff) / bucketSizeMs),
            totalBuckets - 1
        );
        buckets[bucketIdx].interactions += post.interactions ?? 0;
        buckets[bucketIdx].posts++;
    }

    // Format output — only include buckets that have data or are between
    // the first and last data-bearing buckets (for chart continuity)
    const firstNonEmpty = buckets.findIndex(b => b.posts > 0);
    const lastNonEmpty = buckets.length - 1 - [...buckets].reverse().findIndex(b => b.posts > 0);

    if (firstNonEmpty === -1) return [];

    const dateFormatKey = windowKey === "24h" ? "hourly" : windowKey === "7d" ? "daily_short" : "daily";

    return buckets.slice(firstNonEmpty, lastNonEmpty + 1).map(b => ({
        date: formatLifecycleDate(new Date(b.epochMs), dateFormatKey),
        interactions: b.interactions,
        posts: b.posts,
    }));
}

// ===========================================================================
// Per-window analysis engine (internal — powers viralityScore, acceleration)
// ===========================================================================

function analyzeWindow(windowPosts, windowKey, now) {
    if (windowPosts.length < MIN_POSTS_FOR_TREND) {
        return emptyWindowResult(windowPosts.length);
    }

    const halfLife = DECAY_HALF_LIFE[windowKey];
    const bucketSize = BUCKET_SIZE[windowKey];
    const lambda = Math.LN2 / halfLife;

    let weightedInteractionSum = 0;
    let totalDecayWeight = 0;
    let totalRawInteractions = 0;
    let engagementSum = 0;
    let engagementCount = 0;
    let influenceSum = 0;

    const perPostVelocities = [];
    const timeStamps = [];

    for (const post of windowPosts) {
        const interactions = post.interactions ?? 0;
        const decayWeight = post._ageHours !== null
            ? Math.exp(-lambda * Math.max(0, post._ageHours))
            : 0.5;
        const influence = post._influenceMultiplier;
        const combinedWeight = decayWeight * influence;

        weightedInteractionSum += interactions * combinedWeight;
        totalDecayWeight += combinedWeight;
        totalRawInteractions += interactions;
        influenceSum += influence;

        if (post.engagementRate !== null && post.engagementRate !== undefined) {
            engagementSum += post.engagementRate;
            engagementCount++;
        }

        const window = post.velocityWindow;
        if (window !== null && window > 0) {
            perPostVelocities.push((interactions * combinedWeight) / window);
        }

        if (post._epochMs !== null) {
            timeStamps.push({
                epochMs: post._epochMs,
                weightedInteractions: interactions * combinedWeight,
            });
        }
    }

    const avgEngagementRate = engagementCount > 0
        ? round(engagementSum / engagementCount, 4)
        : null;
    const avgInfluence = round(influenceSum / windowPosts.length, 4);
    const meanVelocity = totalDecayWeight > 0
        ? weightedInteractionSum / totalDecayWeight
        : 0;

    // Time buckets
    let peakBucketHour = null;
    let burstScore = 0;
    let acceleration = 0;

    if (timeStamps.length >= 2) {
        timeStamps.sort((a, b) => a.epochMs - b.epochMs);
        const t0 = timeStamps[0].epochMs;

        const buckets = {};
        for (const { epochMs, weightedInteractions } of timeStamps) {
            const hourOffset = (epochMs - t0) / 3_600_000;
            const bucketKey = Math.floor(hourOffset / bucketSize);
            buckets[bucketKey] = (buckets[bucketKey] || 0) + weightedInteractions;
        }

        const bucketEntries = Object.entries(buckets).map(([k, v]) => [Number(k), v]);
        const sortedByValue = [...bucketEntries].sort((a, b) => b[1] - a[1]);
        const [peakKey, peakVal] = sortedByValue[0];
        peakBucketHour = peakKey * bucketSize;

        const totalWeighted = bucketEntries.reduce((s, [, v]) => s + v, 0);
        burstScore = totalWeighted > 0 ? round(peakVal / totalWeighted, 4) : 0;

        const sortedByTime = bucketEntries.sort((a, b) => a[0] - b[0]);
        if (sortedByTime.length >= 2) {
            acceleration = round(linearRegressionSlope(sortedByTime), 4);
        }
    }

    // Z-score velocity
    let velocity = 0;
    if (perPostVelocities.length >= 2) {
        const mean = perPostVelocities.reduce((a, b) => a + b, 0) / perPostVelocities.length;
        const variance = perPostVelocities.reduce((a, v) => a + (v - mean) ** 2, 0) / perPostVelocities.length;
        const stdDev = Math.sqrt(variance);
        velocity = stdDev > 0
            ? round((meanVelocity - mean) / stdDev, 4)
            : round(meanVelocity, 4);
    } else {
        velocity = round(meanVelocity, 4);
    }

    // Composite virality score (0–1)
    const velocityNorm     = clamp01(velocity / 4);
    const accelerationNorm = clamp01((acceleration + 50) / 100);
    const engagementNorm   = avgEngagementRate !== null ? clamp01(avgEngagementRate / 0.10) : 0;
    const influenceNorm    = clamp01((avgInfluence - 1) / 3);

    const viralityScore = round(
        VIRALITY_WEIGHTS.velocityNorm     * velocityNorm +
        VIRALITY_WEIGHTS.burstScore       * burstScore +
        VIRALITY_WEIGHTS.accelerationNorm * accelerationNorm +
        VIRALITY_WEIGHTS.engagementNorm   * engagementNorm +
        VIRALITY_WEIGHTS.influenceNorm    * influenceNorm,
        4
    );

    const viralityTier = classifyViralityTier(viralityScore);

    // Top influencers
    const topInfluencers = [...windowPosts]
        .filter(p => p.authorHandle)
        .sort((a, b) => b._influenceMultiplier - a._influenceMultiplier)
        .slice(0, TOP_INFLUENCER_COUNT)
        .map(p => ({
            authorHandle: p.authorHandle,
            platform: p.platform,
            influence: round(p._influenceMultiplier, 2),
            interactions: p.interactions ?? 0,
            reach: p.authorReach ?? p.reach ?? null,
        }));

    return {
        velocity,
        acceleration,
        peakBucketHour,
        totalInteractions: totalRawInteractions,
        postCount: windowPosts.length,
        avgEngagementRate,
        burstScore,
        viralityScore,
        viralityTier,
        avgInfluence,
        topInfluencers,
    };
}

// ===========================================================================
// Author influence multiplier
// ===========================================================================

/**
 * base = 1 + log10(1 + authorReach)       → [1.0 .. ~7 for 10M followers]
 * confidenceBoost = 1 + 0.1 * voteConfidence
 * multiplier = base * confidenceBoost
 */
function computeInfluenceMultiplier(post) {
    const reach = post.authorReach;
    const base = reach !== null && reach !== undefined && reach > 0
        ? 1 + Math.log10(1 + reach)
        : 1.0;

    const vc = post.voteConfidence;
    const confidenceBoost = vc !== null && vc !== undefined
        ? 1 + 0.1 * vc
        : 1.0;

    return base * confidenceBoost;
}

// ===========================================================================
// Formatting helpers
// ===========================================================================

function classifyViralityTier(score) {
    for (const { max, tier } of VIRALITY_TIERS) {
        if (score <= max) return tier;
    }
    return "mega_viral";
}

function linearRegressionSlope(points) {
    const n = points.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const [x, y] of points) {
        sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
    }
    const denom = n * sumXX - sumX * sumX;
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/**
 * Converts a large number into a human-readable string.
 * 1234 → "1.2K", 1500000 → "1.5M", 2500000000 → "2.5B"
 */
function humanizeNumber(n) {
    if (n === null || n === undefined) return "0";
    if (n >= 1_000_000_000) return `${round(n / 1_000_000_000, 1)}B`;
    if (n >= 1_000_000)     return `${round(n / 1_000_000, 1)}M`;
    if (n >= 1_000)         return `${round(n / 1_000, 1)}K`;
    return String(n);
}

/** "Sep 14" */
function formatShortDate(date) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** Lifecycle chart date formats */
function formatLifecycleDate(date, format) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const pad = n => String(n).padStart(2, "0");

    switch (format) {
        case "hourly":
            return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${pad(date.getUTCHours())}:00`;
        case "daily_short":
            return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${pad(date.getUTCHours())}:00`;
        case "daily":
        default:
            return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
    }
}

/** Creates a URL-safe slug from a trend label */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

function round(n, decimals) {
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function emptyWindowResult(postCount = 0) {
    return {
        velocity: 0, acceleration: 0, peakBucketHour: null,
        totalInteractions: 0, postCount, avgEngagementRate: null,
        burstScore: 0, viralityScore: 0, viralityTier: "dormant",
        avgInfluence: 1, topInfluencers: [],
    };
}

function buildEmptyResult(trendLabel, posts) {
    const empty = emptyWindowResult();
    return {
        category: "trend",
        id: slugify(trendLabel),
        name: trendLabel,
        trendScore: 0,
        platformActivity: {},
        totalMentions: humanizeNumber(posts.length),
        approximateReach: "0",
        growthPercent: "+0%",
        peakGrowth: "+0%",
        peakDate: formatShortDate(new Date()),
        fastestPlatform: "unknown",
        lifecycle: { "24h": [], "7d": [], "30d": [] },
        influence: {
            avgInfluence: 1,
            topInfluencers: [],
            viralityTier: "dormant",
            viralityScore: 0,
        },
        posts: [],
        _windows: { "24h": empty, "7d": { ...empty }, "30d": { ...empty } },
        _overall: { ...empty },
    };
}

module.exports = { analyzeTrend };
