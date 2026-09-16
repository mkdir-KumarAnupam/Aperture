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
 * Expected normalized post shape:
 *
 * {
 *   postId,
 *   eventId,
 *   platform,
 *   text,
 *   authorHandle,
 *   authorId,
 *   publishedAt,
 *   observedAt,
 *   interactions,
 *   reach,
 *   authorFollowers,
 *   engagementRate,
 *   approvalScore,
 *   voteConfidence,
 *   velocityWindow,
 *   hashtags
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

// Velocity calibration.
// Log scaling prevents a few huge posts from dominating the score.
const VELOCITY_REFERENCE = 10;

// Acceleration calibration.
// This is deliberately symmetric around zero.
const ACCELERATION_REFERENCE = 10;

// Engagement rate at which this component reaches 1.
const ENGAGEMENT_REFERENCE = 0.10;

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

  // IMPORTANT:
  // Reach is NOT follower count.
  //
  // Only use actual post reach when explicitly supplied.
  const rawReach =
    posts.reduce(
      (sum, post) =>
        sum +
        safeNumber(
          post.reach,
          0
        ),
      0
    );

  const approximateReach =
    rawReach > 0
      ? humanizeNumber(
        rawReach
      )
      : "Unknown";

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
          post.eventId ??
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
      jobData.trend_label,
      jobData.trendLabel,

      trendObject?.label,
      trendObject?.name,
      trendObject?.trendLabel,
      trendObject?.trend_label,

      jobData.name,
      jobData.label,

      collection?.trend_label,
      collection?.trendLabel,
      collectionTrend?.label,
      collectionTrend?.name,
      collectionTrend?.trendLabel,
      collectionTrend?.trend_label,
      collection?.name,
      collection?.label,

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
      jobData.events,
      jobData.posts,

      canonical?.events,
      canonical?.posts,

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
 * Converts canonical and legacy event shapes into the internal
 * representation expected by trend analysis.
 *
 * Canonical Aperture event:
 *
 * {
 *   eventId,
 *   platform,
 *   content: {
 *     text,
 *     hashtags
 *   },
 *   author: {
 *     authorId,
 *     authorHandle,
 *     ...
 *   },
 *   time: {
 *     publishedAt,
 *     observedAt
 *   },
 *   engagement: {
 *     likes,
 *     replies,
 *     reposts,
 *     quotes,
 *     bookmarks,
 *     views,
 *     impressions
 *   },
 *   platformData: {
 *     authorFollowers,
 *     score,
 *     ...
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

  const engagement =
    isObject(
      post.engagement
    )
      ? post.engagement
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

  const platformData =
    isObject(
      post.platformData
    )
      ? post.platformData
      : {};

  const entities =
    isObject(
      post.entities
    )
      ? post.entities
      : {};

  // --------------------------------------------------------------------------
  // Platform
  // --------------------------------------------------------------------------

  const platform =
    normalizePlatform(
      post.platform ??
      post.source ??
      post.network
    );

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------
  //
  // PRIMARY SOURCE:
  //   normalizeData.js already computes `interactions`.
  //
  // Canonical fallback:
  //
  //   X:
  //     likes + replies + reposts + quotes + bookmarks
  //
  //   Reddit:
  //     replies
  //
  //   Telegram:
  //     reactionsTotal + replies
  //
  // Do NOT use Reddit `score` as likes.
  //

  let interactions =
    firstFiniteNumber(
      post.interactions,
      metrics.interactions,
      metrics.engagement
    );

  if (
    interactions === null
  ) {
    if (
      platform === "reddit"
    ) {
      interactions =
        sumAvailable(
          engagement.replies,
          metrics.comments
        );
    } else if (
      platform === "telegram"
    ) {
      interactions =
        sumAvailable(
          platformData.reactionsTotal,
          engagement.replies,
          metrics.comments
        );
    } else {
      interactions =
        sumAvailable(
          engagement.likes,
          engagement.replies,
          engagement.reposts,
          engagement.quotes,
          engagement.bookmarks,

          metrics.likes,
          metrics.comments,
          metrics.shares
        );
    }
  }

  // If absolutely no interaction metric exists,
  // preserve the missing state as null.
  //
  // The computation layer will treat it as zero.
  if (
    interactions === null
  ) {
    interactions = null;
  }

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------
  //
  // IMPORTANT:
  //
  // Views are NOT automatically reach.
  // Followers are NOT reach.
  //
  // Only use explicit reach.
  //

  const reach =
    firstNullableNumber(
      post.reach,
      metrics.reach
    );

  // --------------------------------------------------------------------------
  // Author followers
  // --------------------------------------------------------------------------
  //
  // This is audience size, NOT post reach.
  //

  const authorFollowers =
    firstNullableNumber(
      post.authorFollowers,

      platformData.authorFollowers,

      author.followers,
      author.followersCount,

      author.profile?.followers,
      author.profile?.followersCount
    );

  // --------------------------------------------------------------------------
  // Engagement rate
  // --------------------------------------------------------------------------
  //
  // Never fabricate engagement rate when actual reach is unavailable.
  //

  let engagementRate =
    firstNullableNumber(
      post.engagementRate,
      metrics.engagementRate
    );

  if (
    engagementRate === null &&
    reach !== null &&
    reach > 0 &&
    interactions !== null
  ) {
    engagementRate =
      interactions /
      reach;
  }

  // --------------------------------------------------------------------------
  // Approval score
  // --------------------------------------------------------------------------

  const approvalScore =
    firstNullableNumber(
      post.approvalScore,

      platform === "reddit"
        ? platformData.upvoteRatio
        : null,

      metrics.approvalScore
    );

  // --------------------------------------------------------------------------
  // Vote confidence
  // --------------------------------------------------------------------------

  const voteConfidence =
    firstNullableNumber(
      post.voteConfidence,
      metrics.voteConfidence
    );

  // --------------------------------------------------------------------------
  // Velocity window
  // --------------------------------------------------------------------------

  const velocityWindow =
    firstNullableNumber(
      post.velocityWindow,
      metrics.velocityWindow
    );

  // --------------------------------------------------------------------------
  // Hashtags
  // --------------------------------------------------------------------------

  const hashtags =
    firstArray(
      post.hashtags,
      content.hashtags,
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

    platform,

    text:
      post.text ??
      content.text ??
      (
        typeof post.content ===
          "string"
          ? post.content
          : null
      ),

    title:
      post.title ??
      content.title ??
      null,

    authorHandle:
      post.authorHandle ??
      author.authorHandle ??
      author.handle ??
      author.username ??
      post.user?.handle ??
      post.user?.username ??
      post.username ??
      null,

    authorId:
      post.authorId ??
      author.authorId ??
      author.id ??
      null,

    authorFollowers,

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

    engagementRate,

    approvalScore,

    voteConfidence,

    velocityWindow,

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

    const interactions =
      safeNullableNumber(
        post.interactions
      );

    if (
      interactions === null
    ) {
      continue;
    }

    let velocityWindow =
      safeNullableNumber(
        post.velocityWindow
      );

    // If normalizeData did not provide a velocity window,
    // derive it from publication/observation timestamps.
    if (
      velocityWindow ===
      null ||
      velocityWindow <= 0
    ) {
      const published =
        getTimestampMs(
          post.publishedAt
        );

      const observed =
        getTimestampMs(
          post.observedAt
        );

      if (
        published !== null &&
        observed !== null &&
        observed > published
      ) {
        velocityWindow =
          (
            observed -
            published
          ) /
          3_600_000;
      }
    }

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

  const timeSeries =
    [];

  // --------------------------------------------------------------------------
  // Aggregate post metrics
  // --------------------------------------------------------------------------

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

    if (
      post._epochMs !==
      null
    ) {
      timeSeries.push({
        epochMs:
          post._epochMs,

        weightedInteractions:
          interactions *
          combinedWeight,

        interactions,
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

  // --------------------------------------------------------------------------
  // Average weighted interactions per post
  // --------------------------------------------------------------------------

  const weightedInteractionsPerPost =
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

  let velocityPerHour =
    0;

  if (
    timeSeries.length >= 2
  ) {
    timeSeries.sort(
      (a, b) =>
        a.epochMs -
        b.epochMs
    );

    const t0 =
      timeSeries[0].epochMs;

    const buckets = {};

    for (
      const point of
      timeSeries
    ) {
      const hourOffset =
        (
          point.epochMs -
          t0
        ) /
        3_600_000;

      const bucketKey =
        Math.floor(
          hourOffset /
          bucketSize
        );

      if (
        !buckets[bucketKey]
      ) {
        buckets[bucketKey] = {
          interactions: 0,
          epochMs:
            t0 +
            bucketKey *
            3_600_000 *
            bucketSize,
        };
      }

      buckets[
        bucketKey
      ].interactions +=
        point.weightedInteractions;
    }

    const bucketEntries =
      Object.entries(
        buckets
      )
        .map(
          ([key, value]) => [
            Number(key),
            value,
          ]
        )
        .sort(
          (a, b) =>
            a[0] -
            b[0]
        );

    if (
      bucketEntries.length > 0
    ) {
      const [
        peakKey,
        peakBucket,
      ] =
        [...bucketEntries]
          .sort(
            (a, b) =>
              b[1].interactions -
              a[1].interactions
          )[0];

      peakBucketHour =
        peakKey *
        bucketSize;

      const totalWeighted =
        bucketEntries.reduce(
          (sum, [, bucket]) =>
            sum +
            bucket.interactions,
          0
        );

      burstScore =
        totalWeighted > 0
          ? round(
            peakBucket.interactions /
            totalWeighted,
            4
          )
          : 0;

      // ----------------------------------------------------------------------
      // Velocity
      // ----------------------------------------------------------------------
      //
      // Instead of comparing:
      //
      //   interactions/post
      //
      // against:
      //
      //   interactions/hour
      //
      // we calculate a consistent rate:
      //
      //   interactions per hour
      //
      // across the observed time span.
      //

      const firstTime =
        bucketEntries[0][1]
          .epochMs;

      const lastTime =
        bucketEntries[
          bucketEntries.length - 1
        ][1].epochMs;

      const elapsedHours =
        Math.max(
          (
            lastTime -
            firstTime
          ) /
          3_600_000,
          bucketSize
        );

      const totalBucketInteractions =
        bucketEntries.reduce(
          (sum, [, bucket]) =>
            sum +
            bucket.interactions,
          0
        );

      velocityPerHour =
        totalBucketInteractions /
        elapsedHours;

      // ----------------------------------------------------------------------
      // Acceleration
      // ----------------------------------------------------------------------
      //
      // Regression slope of interactions per bucket.
      //
      // Positive = activity increasing.
      // Negative = activity decreasing.
      //

      const regressionPoints =
        bucketEntries.map(
          ([
            key,
            bucket,
          ]) => [
              key *
              bucketSize,
              bucket.interactions,
            ]
        );

      acceleration =
        round(
          linearRegressionSlope(
            regressionPoints
          ),
          4
        );
    }
  }

  // --------------------------------------------------------------------------
  // Velocity fallback
  // --------------------------------------------------------------------------
  //
  // For cases where timestamps are insufficient to build multiple buckets,
  // use a normalized per-hour rate based on the observed span.
  //

  if (
    velocityPerHour === 0 &&
    timeSeries.length >= 2
  ) {
    const first =
      timeSeries[0]._epochMs ??
      timeSeries[0].epochMs;

    const last =
      timeSeries[
        timeSeries.length - 1
      ]._epochMs ??
      timeSeries[
        timeSeries.length - 1
      ].epochMs;

    const elapsedHours =
      Math.max(
        (
          last -
          first
        ) /
        3_600_000,
        1
      );

    velocityPerHour =
      weightedInteractionSum /
      Math.max(
        elapsedHours,
        1
      );
  }

  // --------------------------------------------------------------------------
  // Velocity normalization
  // --------------------------------------------------------------------------

  const velocityNorm =
    normalizeVelocity(
      velocityPerHour
    );

  // --------------------------------------------------------------------------
  // Acceleration normalization
  // --------------------------------------------------------------------------
  //
  // IMPORTANT FIX:
  //
  // Old code:
  //
  //   (acceleration + 50) / 100
  //
  // made acceleration=0 become 0.5.
  //
  // That meant every trend automatically received:
  //
  //   0.15 * 0.5 = 0.075
  //
  // which became 7.5 points -> rounded to 8.
  //
  // New normalization:
  //
  //   zero acceleration = 0
  //   positive acceleration increases score
  //   negative acceleration contributes 0
  //

  const accelerationNorm =
    normalizeAcceleration(
      acceleration
    );

  // --------------------------------------------------------------------------
  // Engagement normalization
  // --------------------------------------------------------------------------

  const engagementNorm =
    avgEngagementRate !==
      null
      ? clamp01(
        avgEngagementRate /
        ENGAGEMENT_REFERENCE
      )
      : 0;

  // --------------------------------------------------------------------------
  // Influence normalization
  // --------------------------------------------------------------------------

  const influenceNorm =
    normalizeInfluence(
      avgInfluence
    );

  // --------------------------------------------------------------------------
  // Composite virality score
  // --------------------------------------------------------------------------

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

          // Actual reach only.
          // Do not expose followers as reach.
          reach:
            post.reach ??
            null,

          authorFollowers:
            post.authorFollowers ??
            null,
        })
      );

  return {
    velocity:
      round(
        velocityPerHour,
        4
      ),

    acceleration,

    peakBucketHour,

    totalInteractions:
      totalRawInteractions,

    postCount:
      windowPosts.length,

    avgInteractionsPerPost:
      round(
        weightedInteractionsPerPost,
        4
      ),

    avgEngagementRate,

    burstScore,

    viralityScore,

    viralityTier,

    avgInfluence,

    topInfluencers,

    // ------------------------------------------------------------------------
    // Diagnostics
    // ------------------------------------------------------------------------

    scoreComponents: {
      velocityNorm:
        round(
          velocityNorm,
          4
        ),

      burstScore:
        round(
          burstScore,
          4
        ),

      accelerationNorm:
        round(
          accelerationNorm,
          4
        ),

      engagementNorm:
        round(
          engagementNorm,
          4
        ),

      influenceNorm:
        round(
          influenceNorm,
          4
        ),

      weightedVelocityContribution:
        round(
          VIRALITY_WEIGHTS
            .velocityNorm *
          velocityNorm,
          4
        ),

      weightedBurstContribution:
        round(
          VIRALITY_WEIGHTS
            .burstScore *
          burstScore,
          4
        ),

      weightedAccelerationContribution:
        round(
          VIRALITY_WEIGHTS
            .accelerationNorm *
          accelerationNorm,
          4
        ),

      weightedEngagementContribution:
        round(
          VIRALITY_WEIGHTS
            .engagementNorm *
          engagementNorm,
          4
        ),

      weightedInfluenceContribution:
        round(
          VIRALITY_WEIGHTS
            .influenceNorm *
          influenceNorm,
          4
        ),
    },
  };
}

// ============================================================================
// AUTHOR INFLUENCE
// ============================================================================

function computeInfluenceMultiplier(
  post
) {
  const followers =
    safeNullableNumber(
      post.authorFollowers
    );

  const base =
    followers !== null &&
      followers > 0
      ? 1 +
      Math.log10(
        1 + followers
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
// VELOCITY NORMALIZATION
// ============================================================================

function normalizeVelocity(
  velocityPerHour
) {
  const velocity =
    safeNumber(
      velocityPerHour,
      0
    );

  if (
    velocity <= 0
  ) {
    return 0;
  }

  // Log saturation:
  //
  // velocity=0      -> 0
  // velocity=10     -> ~0.26
  // velocity=100    -> ~0.50
  // velocity=1000   -> ~0.75
  //
  // This prevents very large viral posts from completely dominating.
  return clamp01(
    Math.log10(
      1 + velocity
    ) /
    Math.log10(
      1 +
      VELOCITY_REFERENCE
    )
  );
}

// ============================================================================
// ACCELERATION NORMALIZATION
// ============================================================================

function normalizeAcceleration(
  acceleration
) {
  const value =
    safeNumber(
      acceleration,
      0
    );

  if (
    value <= 0
  ) {
    return 0;
  }

  return clamp01(
    value /
    ACCELERATION_REFERENCE
  );
}

// ============================================================================
// INFLUENCE NORMALIZATION
// ============================================================================

function normalizeInfluence(
  influence
) {
  const value =
    safeNumber(
      influence,
      1
    );

  if (
    value <= 1
  ) {
    return 0;
  }

  return clamp01(
    (
      value -
      1
    ) /
    3
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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

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

function sumAvailable(
  ...values
) {
  let sum = 0;
  let found = false;

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
      sum += number;
      found = true;
    }
  }

  return found
    ? sum
    : null;
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

  if (
    normalized ===
    "twitter"
  ) {
    return "x";
  }

  return (
    normalized ||
    "unknown"
  );
}

function getTimestampMs(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const timestamp =
    new Date(value).getTime();

  return Number.isFinite(
    timestamp
  )
    ? timestamp
    : null;
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

    avgInteractionsPerPost:
      0,

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

    scoreComponents: {
      velocityNorm: 0,
      burstScore: 0,
      accelerationNorm: 0,
      engagementNorm: 0,
      influenceNorm: 0,
      weightedVelocityContribution: 0,
      weightedBurstContribution: 0,
      weightedAccelerationContribution: 0,
      weightedEngagementContribution: 0,
      weightedInfluenceContribution: 0,
    },
  };
}

function buildEmptyResult(
  trendLabel,
  posts,
  now
) {
  const rawReach =
    posts.reduce(
      (sum, post) =>
        sum +
        safeNumber(
          post.reach,
          0
        ),
      0
    );

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
      rawReach > 0
        ? humanizeNumber(
          rawReach
        )
        : "Unknown",

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
