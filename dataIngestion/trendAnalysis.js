/**
 * trendAnalysis.js
 *
 * Computes trend analytics for a batch of normalized posts/events.
 *
 * Pure computation:
 *   - no API calls
 *   - no database calls
 *   - no mutation of canonical data
 *
 * Supports the canonical Aperture schema v1.0.0:
 *
 * {
 *   schemaVersion: "1.0.0",
 *   run_id: "...",
 *   trend: {
 *     label: "..."
 *   },
 *   events: [...]
 * }
 *
 * Also supports legacy/adapter input shapes.
 */

// ============================================================================
// Configuration
// ============================================================================

const DECAY_HALF_LIFE = {
  "24h": 4,
  "7d": 24,
  "30d": 72,
};

const WINDOW_HOURS = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
};

const BUCKET_SIZE = {
  "24h": 1,
  "7d": 6,
  "30d": 24,
};

const VIRALITY_TIERS = [
  { max: 0.20, tier: "dormant" },
  { max: 0.40, tier: "emerging" },
  { max: 0.60, tier: "trending" },
  { max: 0.80, tier: "viral" },
  { max: 1.00, tier: "mega_viral" },
];

const VIRALITY_WEIGHTS = {
  velocityNorm: 0.35,
  burstScore: 0.20,
  accelerationNorm: 0.15,
  engagementNorm: 0.15,
  influenceNorm: 0.15,
};

const MIN_POSTS_FOR_TREND = 2;
const TOP_INFLUENCER_COUNT = 5;

// ============================================================================
// Main Entry Point
// ============================================================================

function analyzeTrend(jobData) {
  const {
    trendLabel,
    posts,
  } = normalizeTrendInput(jobData);

  const now = Date.now();

  // --------------------------------------------------------------------------
  // Not enough posts
  // --------------------------------------------------------------------------

  if (
    posts.length <
    MIN_POSTS_FOR_TREND
  ) {
    return buildEmptyResult(
      trendLabel,
      posts,
      now
    );
  }

  // --------------------------------------------------------------------------
  // Enrich posts
  // --------------------------------------------------------------------------

  const enriched =
    posts.map(
      (post) => {
        const epochMs =
          getPostTimestamp(post);

        const ageHours =
          epochMs !== null
            ? Math.max(
              0,
              (now - epochMs) /
              3_600_000
            )
            : null;

        return {
          ...post,

          _epochMs:
            epochMs,

          _ageHours:
            ageHours,

          _influenceMultiplier:
            computeInfluenceMultiplier(
              post
            ),
        };
      }
    );

  // --------------------------------------------------------------------------
  // Window analysis
  // --------------------------------------------------------------------------

  const windowResults = {};

  for (
    const [
      windowKey,
      windowHours,
    ] of Object.entries(
      WINDOW_HOURS
    )
  ) {
    const windowPosts =
      enriched.filter(
        (post) =>
          post._ageHours !== null &&
          post._ageHours >= 0 &&
          post._ageHours <= windowHours
      );

    windowResults[
      windowKey
    ] = analyzeWindow(
      windowPosts,
      windowKey,
      now
    );
  }

  // --------------------------------------------------------------------------
  // Overall analysis
  // --------------------------------------------------------------------------

  const overallPosts =
    enriched.filter(
      (post) =>
        post._ageHours !== null &&
        post._ageHours >= 0 &&
        post._ageHours <=
        WINDOW_HOURS["30d"]
    );

  const overall =
    analyzeWindow(
      overallPosts,
      "30d",
      now
    );

  // --------------------------------------------------------------------------
  // Basic metrics
  // --------------------------------------------------------------------------

  const id =
    slugify(trendLabel);

  const trendScore =
    Math.round(
      clamp01(
        overall.viralityScore
      ) * 100
    );

  const platformActivity =
    computePlatformActivity(
      posts
    );

  const totalMentions =
    humanizeNumber(
      posts.length
    );

  const rawReach =
    posts.reduce(
      (sum, post) =>
        sum +
        safeNumber(
          post.reach ??
          post.authorReach,
          0
        ),
      0
    );

  const approximateReach =
    humanizeNumber(
      rawReach
    );

  const growthPercent =
    computeGrowthPercent(
      enriched
    );

  const {
    peakGrowth,
    peakDate,
  } = computePeakMetrics(
    enriched,
    now
  );

  const fastestPlatform =
    computeFastestPlatform(
      posts
    );

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  const lifecycle = {
    "24h":
      buildLifecycleSeries(
        enriched,
        "24h",
        now
      ),

    "7d":
      buildLifecycleSeries(
        enriched,
        "7d",
        now
      ),

    "30d":
      buildLifecycleSeries(
        enriched,
        "30d",
        now
      ),
  };

  // --------------------------------------------------------------------------
  // Influence
  // --------------------------------------------------------------------------

  const influence = {
    avgInfluence:
      overall.avgInfluence,

    topInfluencers:
      overall.topInfluencers,

    viralityTier:
      overall.viralityTier,

    viralityScore:
      overall.viralityScore,
  };

  // --------------------------------------------------------------------------
  // Output posts
  // --------------------------------------------------------------------------

  const outputPosts =
    posts.map(
      (post) => ({
        postId:
          post.postId ??
          post.id ??
          null,

        platform:
          post.platform ??
          "unknown",

        authorHandle:
          post.authorHandle ??
          post.author?.handle ??
          post.author?.username ??
          null,

        text:
          post.text ??
          post.content?.text ??
          null,

        title:
          post.title ??
          null,

        publishedAt:
          post.publishedAt ??
          post.time?.publishedAt ??
          null,

        interactions:
          safeNumber(
            post.interactions,
            0
          ),

        reach:
          safeNullableNumber(
            post.reach
          ),

        engagementRate:
          safeNullableNumber(
            post.engagementRate
          ),

        approvalScore:
          safeNullableNumber(
            post.approvalScore
          ),

        hashtags:
          Array.isArray(
            post.hashtags
          )
            ? post.hashtags
            : [],
      })
    );

  return {
    category:
      "trend",

    id,

    name:
      trendLabel,

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

    posts:
      outputPosts,

    _windows:
      windowResults,

    _overall:
      overall,
  };
}

// ============================================================================
// INPUT NORMALIZATION
// ============================================================================

/**
 * Normalizes all supported input shapes.
 *
 * Most important canonical case:
 *
 * {
 *   trend: {
 *     label: "#GodMorningTuesday"
 *   },
 *   events: [...]
 * }
 *
 * Previously `jobData.trend` was passed to firstNonEmptyString(),
 * but in the canonical schema `trend` is an object.
 */
function normalizeTrendInput(
  jobData
) {
  if (
    !jobData ||
    typeof jobData !==
    "object"
  ) {
    throw new TypeError(
      "Trend analysis requires an object payload."
    );
  }

  // --------------------------------------------------------------------------
  // Candidate containers
  // --------------------------------------------------------------------------

  const canonical =
    isObject(
      jobData.canonical
    )
      ? jobData.canonical
      : null;

  const collection =
    isObject(
      jobData.collection
    )
      ? jobData.collection
      : null;

  const trendObject =
    isObject(
      jobData.trend
    )
      ? jobData.trend
      : null;

  const canonicalTrend =
    isObject(
      canonical?.trend
    )
      ? canonical.trend
      : null;

  const collectionTrend =
    isObject(
      collection?.trend
    )
      ? collection.trend
      : null;

  // --------------------------------------------------------------------------
  // Resolve trend label
  // --------------------------------------------------------------------------

  const rawLabel =
    firstNonEmptyString(
      // Top-level legacy forms
      jobData.trend_label,
      jobData.trendLabel,

      // Canonical form:
      // trend: { label: "..." }
      trendObject?.label,
      trendObject?.name,
      trendObject?.trendLabel,
      trendObject?.trend_label,

      jobData.name,
      jobData.label,

      // Collection forms
      collection?.trend_label,
      collection?.trendLabel,
      collectionTrend?.label,
      collectionTrend?.name,
      collectionTrend?.trendLabel,
      collectionTrend?.trend_label,
      collection?.name,
      collection?.label,

      // Canonical nested forms
      canonical?.trend_label,
      canonical?.trendLabel,
      canonicalTrend?.label,
      canonicalTrend?.name,
      canonicalTrend?.trendLabel,
      canonicalTrend?.trend_label,
      canonical?.name,
      canonical?.label
    );

  const trendLabel =
    typeof rawLabel ===
      "string"
      ? rawLabel.trim()
      : "";

  if (!trendLabel) {
    throw new Error(
      "Trend analysis requires a non-empty trend label. " +
      "Expected one of: trend.label, trend_label, trendLabel, " +
      "collection.trend.label, collection.trend_label, " +
      "canonical.trend.label, or canonical.trend_label."
    );
  }

  // --------------------------------------------------------------------------
  // Resolve posts/events
  // --------------------------------------------------------------------------

  let rawPosts =
    firstArray(
      // Direct canonical/legacy forms
      jobData.events,
      jobData.posts,

      // Canonical nested forms
      canonical?.events,
      canonical?.posts,

      // Collection forms
      collection?.events,
      collection?.posts
    );

  if (
    !Array.isArray(
      rawPosts
    )
  ) {
    rawPosts = [];
  }

  // --------------------------------------------------------------------------
  // Normalize posts
  // --------------------------------------------------------------------------

  const posts =
    rawPosts
      .filter(
        (post) =>
          post &&
          typeof post ===
          "object"
      )
      .map(
        normalizePost
      );

  return {
    trendLabel,
    posts,
  };
}

// ============================================================================
// Generic Input Helpers
// ============================================================================

function isObject(
  value
) {
  return (
    value !== null &&
    typeof value ===
    "object" &&
    !Array.isArray(value)
  );
}

function firstNonEmptyString(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      typeof value ===
      "string" &&
      value.trim().length >
      0
    ) {
      return value.trim();
    }
  }

  return null;
}

function firstArray(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      Array.isArray(value)
    ) {
      return value;
    }
  }

  return null;
}

// ============================================================================
// POST NORMALIZATION
// ============================================================================

/**
 * Normalizes both legacy posts and canonical v1.0.0 events.
 *
 * Canonical event:
 *
 * {
 *   eventId,
 *   platform,
 *   content: {
 *     text
 *   },
 *   author: {
 *     id,
 *     username,
 *     profile: {}
 *   },
 *   time: {
 *     publishedAt
 *   },
 *   metrics: {
 *     likes,
 *     comments,
 *     shares,
 *     views
 *   },
 *   entities: {
 *     hashtags,
 *     mentions,
 *     urls
 *   }
 * }
 */
function normalizePost(
  post
) {
  const metrics =
    isObject(
      post.metrics
    )
      ? post.metrics
      : {};

  const author =
    isObject(
      post.author
    )
      ? post.author
      : {};

  const content =
    isObject(
      post.content
    )
      ? post.content
      : {};

  const time =
    isObject(
      post.time
    )
      ? post.time
      : {};

  const entities =
    isObject(
      post.entities
    )
      ? post.entities
      : {};

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------
  //
  // Canonical metrics do not necessarily contain a precomputed
  // `interactions` field.
  //
  // Therefore calculate it from:
  //
  // likes + comments + shares
  //
  // when necessary.
  //

  const explicitInteractions =
    firstFiniteNumber(
      post.interactions,
      post.engagement,
      metrics.interactions,
      metrics.engagement
    );

  const calculatedInteractions =
    safeNumber(
      metrics.likes,
      0
    ) +
    safeNumber(
      metrics.comments,
      0
    ) +
    safeNumber(
      metrics.shares,
      0
    );

  const interactions =
    explicitInteractions !==
      null
      ? explicitInteractions
      : calculatedInteractions;

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  const reach =
    firstNullableNumber(
      post.reach,
      metrics.reach,
      metrics.views
    );

  // --------------------------------------------------------------------------
  // Author reach
  // --------------------------------------------------------------------------

  const authorReach =
    firstNullableNumber(
      post.authorReach,
      author.reach,
      author.followers,
      author.followersCount,
      author.profile?.reach,
      author.profile?.followers,
      author.profile?.followersCount
    );

  // --------------------------------------------------------------------------
  // Hashtags
  // --------------------------------------------------------------------------

  const hashtags =
    firstArray(
      post.hashtags,
      entities.hashtags
    ) ?? [];

  return {
    ...post,

    postId:
      post.postId ??
      post.id ??
      post.eventId ??
      null,

    eventId:
      post.eventId ??
      post.id ??
      null,

    platform:
      normalizePlatform(
        post.platform ??
        post.source ??
        post.network
      ),

    text:
      post.text ??
      content.text ??
      (
        typeof post.content ===
          "string"
          ? post.content
          : null
      ),

    authorHandle:
      post.authorHandle ??
      author.handle ??
      author.username ??
      post.user?.handle ??
      post.user?.username ??
      post.username ??
      null,

    authorId:
      post.authorId ??
      author.id ??
      null,

    publishedAt:
      post.publishedAt ??
      time.publishedAt ??
      post.createdAt ??
      post.timestamp ??
      post.created_at ??
      null,

    observedAt:
      post.observedAt ??
      time.observedAt ??
      post.observed_at ??
      null,

    interactions,

    reach,

    authorReach,

    engagementRate:
      firstNullableNumber(
        post.engagementRate,
        metrics.engagementRate
      ),

    approvalScore:
      safeNullableNumber(
        post.approvalScore
      ),

    voteConfidence:
      safeNullableNumber(
        post.voteConfidence
      ),

    velocityWindow:
      safeNullableNumber(
        post.velocityWindow
      ),

    hashtags,
  };
}

// ============================================================================
// TIMESTAMP
// ============================================================================

function getPostTimestamp(
  post
) {
  const value =
    post.publishedAt ??
    post.observedAt;

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const timestamp =
    new Date(value).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return null;
  }

  return timestamp;
}

// ============================================================================
// PLATFORM ACTIVITY
// ============================================================================

function computePlatformActivity(
  posts
) {
  const platforms = {};

  for (
    const post of
    posts
  ) {
    const platform =
      normalizePlatform(
        post.platform
      );

    if (
      !platforms[platform]
    ) {
      platforms[platform] = {
        posts: 0,
        interactions: 0,
        engagementSum: 0,
        engagementCount: 0,
      };
    }

    platforms[platform].posts++;

    platforms[platform]
      .interactions +=
      safeNumber(
        post.interactions,
        0
      );

    const engagement =
      safeNullableNumber(
        post.engagementRate
      );

    if (
      engagement !== null
    ) {
      platforms[platform]
        .engagementSum +=
        engagement;

      platforms[platform]
        .engagementCount++;
    }
  }

  const result = {};

  for (
    const [
      platform,
      data,
    ] of Object.entries(
      platforms
    )
  ) {
    result[platform] = {
      posts:
        data.posts,

      interactions:
        data.interactions,

      avgEngagement:
        data.engagementCount > 0
          ? round(
            data.engagementSum /
            data.engagementCount,
            4
          )
          : null,
    };
  }

  return result;
}

// ============================================================================
// GROWTH
// ============================================================================

function computeGrowthPercent(
  enrichedPosts
) {
  const withTime =
    enrichedPosts
      .filter(
        (post) =>
          post._epochMs !==
          null
      )
      .sort(
        (a, b) =>
          a._epochMs -
          b._epochMs
      );

  if (
    withTime.length < 2
  ) {
    return "+0%";
  }

  const midpoint =
    Math.floor(
      withTime.length / 2
    );

  const firstHalf =
    withTime.slice(
      0,
      midpoint
    );

  const secondHalf =
    withTime.slice(
      midpoint
    );

  const firstInteractions =
    firstHalf.reduce(
      (sum, post) =>
        sum +
        safeNumber(
          post.interactions,
          0
        ),
      0
    );

  const secondInteractions =
    secondHalf.reduce(
      (sum, post) =>
        sum +
        safeNumber(
          post.interactions,
          0
        ),
      0
    );

  if (
    firstInteractions ===
    0
  ) {
    return secondInteractions >
      0
      ? "+∞%"
      : "+0%";
  }

  const pct =
    (
      (
        secondInteractions -
        firstInteractions
      ) /
      firstInteractions
    ) *
    100;

  const sign =
    pct >= 0
      ? "+"
      : "";

  return `${sign}${Math.round(
    pct
  )}%`;
}

// ============================================================================
// PEAK METRICS
// ============================================================================

function computePeakMetrics(
  enrichedPosts,
  now
) {
  const withTime =
    enrichedPosts
      .filter(
        (post) =>
          post._epochMs !==
          null
      )
      .sort(
        (a, b) =>
          a._epochMs -
          b._epochMs
      );

  if (
    withTime.length < 2
  ) {
    const fallbackDate =
      withTime.length === 1
        ? formatShortDate(
          new Date(
            withTime[0]._epochMs
          )
        )
        : formatShortDate(
          new Date(now)
        );

    return {
      peakGrowth: "+0%",
      peakDate:
        fallbackDate,
    };
  }

  const bucketSizeMs =
    6 *
    3_600_000;

  const t0 =
    withTime[0]._epochMs;

  const buckets = {};

  for (
    const post of
    withTime
  ) {
    const bucketKey =
      Math.floor(
        (
          post._epochMs -
          t0
        ) /
        bucketSizeMs
      );

    if (
      !buckets[bucketKey]
    ) {
      buckets[bucketKey] = {
        interactions: 0,
        epochMs:
          t0 +
          bucketKey *
          bucketSizeMs,
      };
    }

    buckets[bucketKey]
      .interactions +=
      safeNumber(
        post.interactions,
        0
      );
  }

  const bucketArr =
    Object.values(
      buckets
    );

  if (
    bucketArr.length === 0
  ) {
    return {
      peakGrowth: "+0%",
      peakDate:
        formatShortDate(
          new Date(now)
        ),
    };
  }

  const avgInteractions =
    bucketArr.reduce(
      (sum, bucket) =>
        sum +
        bucket.interactions,
      0
    ) /
    bucketArr.length;

  const peak =
    bucketArr.reduce(
      (best, bucket) =>
        bucket.interactions >
          best.interactions
          ? bucket
          : best,
      bucketArr[0]
    );

  let peakGrowthPct = 0;

  if (
    avgInteractions > 0
  ) {
    peakGrowthPct =
      (
        (
          peak.interactions -
          avgInteractions
        ) /
        avgInteractions
      ) *
      100;
  }

  const sign =
    peakGrowthPct >= 0
      ? "+"
      : "";

  return {
    peakGrowth:
      `${sign}${Math.round(
        peakGrowthPct
      )}%`,

    peakDate:
      formatShortDate(
        new Date(
          peak.epochMs
        )
      ),
  };
}

// ============================================================================
// FASTEST PLATFORM
// ============================================================================

function computeFastestPlatform(
  posts
) {
  const platformVelocities =
    {};

  for (
    const post of
    posts
  ) {
    const platform =
      normalizePlatform(
        post.platform
      );

    const velocityWindow =
      safeNullableNumber(
        post.velocityWindow
      );

    if (
      velocityWindow ===
      null ||
      velocityWindow <= 0
    ) {
      continue;
    }

    if (
      !platformVelocities[
      platform
      ]
    ) {
      platformVelocities[
        platform
      ] = {
        totalRate: 0,
        count: 0,
      };
    }

    const interactions =
      safeNumber(
        post.interactions,
        0
      );

    platformVelocities[
      platform
    ].totalRate +=
      interactions /
      velocityWindow;

    platformVelocities[
      platform
    ].count++;
  }

  let fastest =
    "unknown";

  let maxVelocity = -1;

  for (
    const [
      platform,
      data,
    ] of Object.entries(
      platformVelocities
    )
  ) {
    if (
      data.count <= 0
    ) {
      continue;
    }

    const avgVelocity =
      data.totalRate /
      data.count;

    if (
      Number.isFinite(
        avgVelocity
      ) &&
      avgVelocity >
      maxVelocity
    ) {
      maxVelocity =
        avgVelocity;

      fastest =
        platform;
    }
  }

  return fastest;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

function buildLifecycleSeries(
  enrichedPosts,
  windowKey,
  now
) {
  const windowHours =
    WINDOW_HOURS[
    windowKey
    ];

  const bucketSizeHours =
    BUCKET_SIZE[
    windowKey
    ];

  const cutoff =
    now -
    windowHours *
    3_600_000;

  const windowPosts =
    enrichedPosts
      .filter(
        (post) =>
          post._epochMs !==
          null &&
          post._epochMs >=
          cutoff &&
          post._epochMs <=
          now
      )
      .sort(
        (a, b) =>
          a._epochMs -
          b._epochMs
      );

  if (
    windowPosts.length ===
    0
  ) {
    return [];
  }

  const bucketSizeMs =
    bucketSizeHours *
    3_600_000;

  const totalBuckets =
    Math.ceil(
      windowHours /
      bucketSizeHours
    );

  const buckets =
    Array.from(
      {
        length:
          totalBuckets,
      },
      (_, index) => ({
        epochMs:
          cutoff +
          index *
          bucketSizeMs,

        interactions:
          0,

        posts:
          0,
      })
    );

  for (
    const post of
    windowPosts
  ) {
    const rawIndex =
      Math.floor(
        (
          post._epochMs -
          cutoff
        ) /
        bucketSizeMs
      );

    const bucketIndex =
      Math.max(
        0,
        Math.min(
          rawIndex,
          totalBuckets - 1
        )
      );

    buckets[
      bucketIndex
    ].interactions +=
      safeNumber(
        post.interactions,
        0
      );

    buckets[
      bucketIndex
    ].posts++;
  }

  const firstNonEmpty =
    buckets.findIndex(
      (bucket) =>
        bucket.posts > 0
    );

  if (
    firstNonEmpty === -1
  ) {
    return [];
  }

  let lastNonEmpty =
    -1;

  for (
    let i =
      buckets.length - 1;
    i >= 0;
    i--
  ) {
    if (
      buckets[i].posts >
      0
    ) {
      lastNonEmpty = i;
      break;
    }
  }

  const dateFormatKey =
    windowKey === "24h"
      ? "hourly"
      : windowKey === "7d"
        ? "daily_short"
        : "daily";

  return buckets
    .slice(
      firstNonEmpty,
      lastNonEmpty + 1
    )
    .map(
      (bucket) => ({
        date:
          formatLifecycleDate(
            new Date(
              bucket.epochMs
            ),
            dateFormatKey
          ),

        interactions:
          bucket.interactions,

        posts:
          bucket.posts,
      })
    );
}

// ============================================================================
// WINDOW ANALYSIS
// ============================================================================

function analyzeWindow(
  windowPosts,
  windowKey,
  now
) {
  if (
    windowPosts.length <
    MIN_POSTS_FOR_TREND
  ) {
    return emptyWindowResult(
      windowPosts.length
    );
  }

  const halfLife =
    DECAY_HALF_LIFE[
    windowKey
    ];

  const bucketSize =
    BUCKET_SIZE[
    windowKey
    ];

  const lambda =
    Math.LN2 /
    halfLife;

  let weightedInteractionSum =
    0;

  let totalDecayWeight =
    0;

  let totalRawInteractions =
    0;

  let engagementSum =
    0;

  let engagementCount =
    0;

  let influenceSum =
    0;

  const perPostVelocities =
    [];

  const timeStamps =
    [];

  for (
    const post of
    windowPosts
  ) {
    const interactions =
      safeNumber(
        post.interactions,
        0
      );

    const decayWeight =
      post._ageHours !==
        null
        ? Math.exp(
          -lambda *
          Math.max(
            0,
            post._ageHours
          )
        )
        : 0;

    const influence =
      safeNumber(
        post._influenceMultiplier,
        1
      );

    const combinedWeight =
      decayWeight *
      influence;

    weightedInteractionSum +=
      interactions *
      combinedWeight;

    totalDecayWeight +=
      combinedWeight;

    totalRawInteractions +=
      interactions;

    influenceSum +=
      influence;

    const engagement =
      safeNullableNumber(
        post.engagementRate
      );

    if (
      engagement !== null
    ) {
      engagementSum +=
        engagement;

      engagementCount++;
    }

    const velocityWindow =
      safeNullableNumber(
        post.velocityWindow
      );

    if (
      velocityWindow !==
      null &&
      velocityWindow > 0
    ) {
      perPostVelocities.push(
        (
          interactions *
          combinedWeight
        ) /
        velocityWindow
      );
    }

    if (
      post._epochMs !==
      null
    ) {
      timeStamps.push({
        epochMs:
          post._epochMs,

        weightedInteractions:
          interactions *
          combinedWeight,
      });
    }
  }

  const avgEngagementRate =
    engagementCount > 0
      ? round(
        engagementSum /
        engagementCount,
        4
      )
      : null;

  const avgInfluence =
    windowPosts.length > 0
      ? round(
        influenceSum /
        windowPosts.length,
        4
      )
      : 1;

  const meanVelocity =
    totalDecayWeight > 0
      ? weightedInteractionSum /
      totalDecayWeight
      : 0;

  // --------------------------------------------------------------------------
  // Time buckets
  // --------------------------------------------------------------------------

  let peakBucketHour =
    null;

  let burstScore =
    0;

  let acceleration =
    0;

  if (
    timeStamps.length >= 2
  ) {
    timeStamps.sort(
      (a, b) =>
        a.epochMs -
        b.epochMs
    );

    const t0 =
      timeStamps[0].epochMs;

    const buckets = {};

    for (
      const {
        epochMs,
        weightedInteractions,
      } of timeStamps
    ) {
      const hourOffset =
        (
          epochMs -
          t0
        ) /
        3_600_000;

      const bucketKey =
        Math.floor(
          hourOffset /
          bucketSize
        );

      buckets[
        bucketKey
      ] =
        (
          buckets[
          bucketKey
          ] || 0
        ) +
        weightedInteractions;
    }

    const bucketEntries =
      Object.entries(
        buckets
      ).map(
        ([key, value]) => [
          Number(key),
          value,
        ]
      );

    const sortedByValue =
      [...bucketEntries]
        .sort(
          (a, b) =>
            b[1] -
            a[1]
        );

    const [
      peakKey,
      peakValue,
    ] =
      sortedByValue[0];

    peakBucketHour =
      peakKey *
      bucketSize;

    const totalWeighted =
      bucketEntries.reduce(
        (sum, [, value]) =>
          sum + value,
        0
      );

    burstScore =
      totalWeighted > 0
        ? round(
          peakValue /
          totalWeighted,
          4
        )
        : 0;

    const sortedByTime =
      [...bucketEntries]
        .sort(
          (a, b) =>
            a[0] -
            b[0]
        );

    if (
      sortedByTime.length >=
      2
    ) {
      acceleration =
        round(
          linearRegressionSlope(
            sortedByTime
          ),
          4
        );
    }
  }

  // --------------------------------------------------------------------------
  // Velocity normalization
  // --------------------------------------------------------------------------

  let velocity = 0;

  if (
    perPostVelocities.length >=
    2
  ) {
    const mean =
      perPostVelocities.reduce(
        (a, b) =>
          a + b,
        0
      ) /
      perPostVelocities.length;

    const variance =
      perPostVelocities.reduce(
        (sum, value) =>
          sum +
          (
            value -
            mean
          ) ** 2,
        0
      ) /
      perPostVelocities.length;

    const stdDev =
      Math.sqrt(
        variance
      );

    velocity =
      stdDev > 0
        ? round(
          (
            meanVelocity -
            mean
          ) /
          stdDev,
          4
        )
        : round(
          meanVelocity,
          4
        );
  } else {
    velocity =
      round(
        meanVelocity,
        4
      );
  }

  // --------------------------------------------------------------------------
  // Composite virality score
  // --------------------------------------------------------------------------

  const velocityNorm =
    clamp01(
      velocity / 4
    );

  const accelerationNorm =
    clamp01(
      (
        acceleration +
        50
      ) /
      100
    );

  const engagementNorm =
    avgEngagementRate !==
      null
      ? clamp01(
        avgEngagementRate /
        0.10
      )
      : 0;

  const influenceNorm =
    clamp01(
      (
        avgInfluence -
        1
      ) /
      3
    );

  const viralityScore =
    round(
      VIRALITY_WEIGHTS
        .velocityNorm *
      velocityNorm +

      VIRALITY_WEIGHTS
        .burstScore *
      burstScore +

      VIRALITY_WEIGHTS
        .accelerationNorm *
      accelerationNorm +

      VIRALITY_WEIGHTS
        .engagementNorm *
      engagementNorm +

      VIRALITY_WEIGHTS
        .influenceNorm *
      influenceNorm,

      4
    );

  const viralityTier =
    classifyViralityTier(
      viralityScore
    );

  // --------------------------------------------------------------------------
  // Top influencers
  // --------------------------------------------------------------------------

  const topInfluencers =
    [...windowPosts]
      .filter(
        (post) =>
          typeof post.authorHandle ===
          "string" &&
          post.authorHandle.trim()
      )
      .sort(
        (a, b) =>
          b._influenceMultiplier -
          a._influenceMultiplier
      )
      .slice(
        0,
        TOP_INFLUENCER_COUNT
      )
      .map(
        (post) => ({
          authorHandle:
            post.authorHandle,

          platform:
            post.platform,

          influence:
            round(
              post._influenceMultiplier,
              2
            ),

          interactions:
            safeNumber(
              post.interactions,
              0
            ),

          reach:
            post.authorReach ??
            post.reach ??
            null,
        })
      );

  return {
    velocity,

    acceleration,

    peakBucketHour,

    totalInteractions:
      totalRawInteractions,

    postCount:
      windowPosts.length,

    avgEngagementRate,

    burstScore,

    viralityScore,

    viralityTier,

    avgInfluence,

    topInfluencers,
  };
}

// ============================================================================
// AUTHOR INFLUENCE
// ============================================================================

function computeInfluenceMultiplier(
  post
) {
  const reach =
    safeNullableNumber(
      post.authorReach
    );

  const base =
    reach !== null &&
      reach > 0
      ? 1 +
      Math.log10(
        1 + reach
      )
      : 1;

  const voteConfidence =
    safeNullableNumber(
      post.voteConfidence
    );

  const confidenceBoost =
    voteConfidence !== null
      ? 1 +
      0.1 *
      clamp01(
        voteConfidence
      )
      : 1;

  return (
    base *
    confidenceBoost
  );
}

// ============================================================================
// FORMATTING
// ============================================================================

function classifyViralityTier(
  score
) {
  const normalized =
    clamp01(
      safeNumber(
        score,
        0
      )
    );

  for (
    const {
      max,
      tier,
    } of VIRALITY_TIERS
  ) {
    if (
      normalized <= max
    ) {
      return tier;
    }
  }

  return "mega_viral";
}

function humanizeNumber(
  n
) {
  const value =
    safeNumber(
      n,
      0
    );

  if (
    value >=
    1_000_000_000
  ) {
    return `${round(
      value /
      1_000_000_000,
      1
    )}B`;
  }

  if (
    value >=
    1_000_000
  ) {
    return `${round(
      value /
      1_000_000,
      1
    )}M`;
  }

  if (
    value >=
    1_000
  ) {
    return `${round(
      value /
      1_000,
      1
    )}K`;
  }

  return String(
    Math.round(value)
  );
}

function formatShortDate(
  date
) {
  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown";
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${months[
    date.getUTCMonth()
  ]} ${date.getUTCDate()}`;
}

function formatLifecycleDate(
  date,
  format
) {
  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown";
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const pad =
    (n) =>
      String(n).padStart(
        2,
        "0"
      );

  switch (
  format
  ) {
    case "hourly":
      return `${months[
        date.getUTCMonth()
      ]} ${date.getUTCDate()} ${pad(
        date.getUTCHours()
      )}:00`;

    case "daily_short":
      return `${months[
        date.getUTCMonth()
      ]} ${date.getUTCDate()} ${pad(
        date.getUTCHours()
      )}:00`;

    case "daily":
    default:
      return `${months[
        date.getUTCMonth()
      ]} ${date.getUTCDate()}`;
  }
}

// ============================================================================
// SLUG
// ============================================================================

function slugify(
  text
) {
  const value =
    typeof text ===
      "string"
      ? text.trim()
      : "";

  if (!value) {
    return "unknown-trend";
  }

  const slug =
    value
      .toLowerCase()
      .replace(
        /[^a-z0-9\s-]/g,
        ""
      )
      .replace(
        /\s+/g,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      )
      .slice(
        0,
        80
      );

  return (
    slug ||
    "unknown-trend"
  );
}

// ============================================================================
// NUMERIC HELPERS
// ============================================================================

function safeNumber(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : fallback;
}

function safeNullableNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function firstNullableNumber(
  ...values
) {
  for (
    const value of
    values
  ) {
    const number =
      safeNullableNumber(
        value
      );

    if (
      number !== null
    ) {
      return number;
    }
  }

  return null;
}

function firstFiniteNumber(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const number =
      Number(value);

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return null;
}

function normalizePlatform(
  platform
) {
  if (
    typeof platform !==
    "string"
  ) {
    return "unknown";
  }

  const normalized =
    platform
      .trim()
      .toLowerCase();

  return (
    normalized ||
    "unknown"
  );
}

function round(
  number,
  decimals = 2
) {
  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      number *
      factor
    ) /
    factor
  );
}

function clamp01(
  value
) {
  return Math.max(
    0,
    Math.min(
      1,
      safeNumber(
        value,
        0
      )
    )
  );
}

// ============================================================================
// REGRESSION
// ============================================================================

function linearRegressionSlope(
  points
) {
  const n =
    points.length;

  if (
    n < 2
  ) {
    return 0;
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (
    const [x, y]
    of points
  ) {
    sumX += x;
    sumY += y;
    sumXY +=
      x * y;
    sumXX +=
      x * x;
  }

  const denominator =
    n * sumXX -
    sumX * sumX;

  if (
    denominator === 0
  ) {
    return 0;
  }

  return (
    n * sumXY -
    sumX * sumY
  ) /
    denominator;
}

// ============================================================================
// EMPTY RESULTS
// ============================================================================

function emptyWindowResult(
  postCount = 0
) {
  return {
    velocity: 0,

    acceleration: 0,

    peakBucketHour:
      null,

    totalInteractions:
      0,

    postCount,

    avgEngagementRate:
      null,

    burstScore:
      0,

    viralityScore:
      0,

    viralityTier:
      "dormant",

    avgInfluence:
      1,

    topInfluencers:
      [],
  };
}

function buildEmptyResult(
  trendLabel,
  posts,
  now
) {
  return {
    category:
      "trend",

    id:
      slugify(
        trendLabel
      ),

    name:
      trendLabel,

    trendScore:
      0,

    platformActivity:
      computePlatformActivity(
        posts
      ),

    totalMentions:
      humanizeNumber(
        posts.length
      ),

    approximateReach:
      humanizeNumber(
        posts.reduce(
          (sum, post) =>
            sum +
            safeNumber(
              post.reach ??
              post.authorReach,
              0
            ),
          0
        )
      ),

    growthPercent:
      "+0%",

    peakGrowth:
      "+0%",

    peakDate:
      formatShortDate(
        new Date(now)
      ),

    fastestPlatform:
      "unknown",

    lifecycle: {
      "24h": [],
      "7d": [],
      "30d": [],
    },

    influence: {
      avgInfluence:
        1,

      topInfluencers:
        [],

      viralityTier:
        "dormant",

      viralityScore:
        0,
    },

    posts:
      posts.map(
        (post) => ({
          postId:
            post.postId ??
            null,

          platform:
            post.platform ??
            "unknown",

          authorHandle:
            post.authorHandle ??
            null,

          text:
            post.text ??
            null,

          title:
            post.title ??
            null,

          publishedAt:
            post.publishedAt ??
            null,

          interactions:
            safeNumber(
              post.interactions,
              0
            ),

          reach:
            safeNullableNumber(
              post.reach
            ),

          engagementRate:
            safeNullableNumber(
              post.engagementRate
            ),

          approvalScore:
            safeNullableNumber(
              post.approvalScore
            ),

          hashtags:
            Array.isArray(
              post.hashtags
            )
              ? post.hashtags
              : [],
        })
      ),

    _windows: {
      "24h":
        emptyWindowResult(
          posts.length
        ),

      "7d":
        emptyWindowResult(
          posts.length
        ),

      "30d":
        emptyWindowResult(
          posts.length
        ),
    },

    _overall:
      emptyWindowResult(
        posts.length
      ),
  };
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  analyzeTrend,
};
