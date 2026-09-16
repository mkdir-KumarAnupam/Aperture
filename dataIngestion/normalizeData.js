/**
 * ============================================================================
 * normalizeData.js
 * ============================================================================
 *
 * Purpose:
 *   Convert one canonical Social Media Analytics event (schema v1.0.0)
 *   into a common analytics-friendly DERIVED representation.
 *
 *
 * ARCHITECTURE
 * ------------
 *
 *   X / Reddit / Telegram
 *            ↓
 *         Scraper
 *            ↓
 *      Canonical Event
 *            ↓
 *       Redis Stream
 *            ↓
 *         Producer
 *            ↓
 *     normalizeData()
 *            ↓
 *    Normalized Event
 *            ↓
 *       Analytics
 *
 *
 * SUPPORTED PLATFORMS
 * -------------------
 *
 *   - x
 *   - reddit
 *   - telegram
 *
 *
 * IMPORTANT ARCHITECTURAL RULE
 * ----------------------------
 *
 * The canonical event is the SOURCE OF TRUTH.
 *
 * normalizeData() creates a DERIVED representation for downstream analytics.
 *
 * It must NEVER:
 *
 *   - modify the canonical event
 *   - redefine the canonical event
 *   - fabricate missing metrics
 *   - convert unavailable metrics into zero
 *   - reinterpret one metric as another metric
 *
 *
 * DATA SAFETY RULES
 * -----------------
 *
 * - Missing values remain null.
 * - Missing numeric metrics are NOT converted to zero.
 * - No metrics are fabricated.
 * - Arrays remain arrays.
 * - Platform identity remains x/reddit/telegram.
 * - Relationships come from canonical relationships.
 * - Timestamps are normalized to ISO UTC.
 * - Source language is preserved when available.
 * - Detected language is only a fallback.
 * - Views and impressions are NOT treated as reach.
 * - Reddit score remains separate from interactions.
 * - Author followers are exposed as authorReach ONLY when the canonical
 *   platformData explicitly supplies authorFollowers.
 *
 * ============================================================================
 */


/**
 * ============================================================================
 * NORMALIZED EVENT
 * ============================================================================
 *
 * This is NOT the canonical schema.
 *
 * It is a smaller analytics-friendly representation derived from one
 * canonical event.
 *
 * @typedef {Object} NormalizedEvent
 *
 * @property {string|null} eventId
 * @property {string|null} platformPostId
 * @property {"x"|"reddit"|"telegram"|null} platform
 *
 * @property {string|null} conversationId
 * @property {string|null} parentId
 *
 * @property {string|null} authorId
 * @property {string|null} authorHandle
 * @property {number|null} authorReach
 *
 * @property {string|null} text
 * @property {string|null} title
 *
 * @property {string[]} hashtags
 * @property {Array<string|Object>} urls
 * @property {string[]} mentions
 *
 * @property {string|null} language
 *
 * @property {string|null} publishedAt
 * @property {string|null} observedAt
 *
 * @property {number|null} velocityWindow
 *
 * @property {number|null} interactions
 *
 * @property {number|null} views
 * @property {number|null} impressions
 * @property {number|null} reach
 *
 * @property {number|null} engagementRate
 *
 * @property {number|null} score
 * @property {number|null} approvalScore
 * @property {number|null} voteConfidence
 *
 * @property {string|null} sourceLayer
 */


/**
 * ============================================================================
 * PUBLIC NORMALIZER
 * ============================================================================
 */

/**
 * Normalize a single canonical v1.0.0 event.
 *
 * The returned object is DERIVED data.
 *
 * The input event is never modified.
 *
 * @param {Object} event
 * @returns {NormalizedEvent}
 */
function normalizeData(event) {
  if (
    typeof event !== "object" ||
    event === null ||
    Array.isArray(event)
  ) {
    throw new Error(
      "normalizeData: expected a canonical event object, got " +
      safeStringify(event)
    );
  }

  const platform =
    detectPlatform(event);

  switch (platform) {
    case "x":
      return normalizeX(event);

    case "reddit":
      return normalizeReddit(event);

    case "telegram":
      return normalizeTelegram(event);

    default:
      return normalizeUnknown(event);
  }
}


// ============================================================================
// PLATFORM DETECTION
// ============================================================================

/**
 * Detect the canonical platform.
 *
 * `twitter` remains an input compatibility alias.
 *
 * Normalized output always uses:
 *
 *   x
 *   reddit
 *   telegram
 *
 * @param {Object} event
 * @returns {"x"|"reddit"|"telegram"|null}
 */
function detectPlatform(event) {
  const platform =
    typeof event.platform === "string"
      ? event.platform.trim().toLowerCase()
      : null;

  if (
    platform === "x" ||
    platform === "twitter"
  ) {
    return "x";
  }

  if (platform === "reddit") {
    return "reddit";
  }

  if (platform === "telegram") {
    return "telegram";
  }

  return null;
}


// ============================================================================
// SHARED NORMALIZATION
// ============================================================================

/**
 * Normalize common identity fields.
 *
 * @param {Object} event
 * @returns {Object}
 */
function normalizeIdentity(event) {
  return {
    eventId:
      stringOrNull(
        event.eventId
      ),

    platformPostId:
      stringOrNull(
        event.platformPostId
      ),
  };
}


/**
 * Normalize common content fields.
 *
 * @param {Object} content
 * @returns {Object}
 */
function normalizeContent(content) {
  const safeContent =
    objectOrEmpty(content);

  return {
    text:
      stringOrNull(
        safeContent.text
      ),

    title:
      stringOrNull(
        safeContent.title
      ),

    hashtags:
      normalizeStringArray(
        safeContent.hashtags
      ),

    urls:
      normalizeUrls(
        safeContent.urls
      ),

    mentions:
      normalizeStringArray(
        safeContent.mentions
      ),

    /*
     * Preserve source language first.
     *
     * Detected language is only a fallback.
     */
    language:
      stringOrNull(
        safeContent.language
      ) ??
      stringOrNull(
        safeContent.detectedLang
      ),
  };
}


/**
 * Normalize common author fields.
 *
 * IMPORTANT:
 *
 * authorReach is NOT guessed.
 *
 * The value is supplied separately by each platform normalizer from an
 * explicitly available canonical metric.
 *
 * @param {Object} author
 * @param {Object} platformData
 * @returns {Object}
 */
function normalizeAuthor(
  author,
  platformData
) {
  const safeAuthor =
    objectOrEmpty(author);

  const safePlatformData =
    objectOrEmpty(
      platformData
    );

  /*
   * IMPORTANT:
   *
   * authorFollowers is a canonical platformData field.
   *
   * It is therefore safe to expose it as authorReach because it represents
   * the author's audience size.
   *
   * We do NOT infer it from:
   *
   *   likes
   *   views
   *   reposts
   *   engagement
   *   message count
   */
  const authorReach =
    firstNullableNumber(
      safePlatformData.authorFollowers,

      // Compatibility fields.
      safeAuthor.followers,
      safeAuthor.followersCount
    );

  return {
    authorId:
      stringOrNull(
        safeAuthor.authorId
      ) ??
      stringOrNull(
        safeAuthor.id
      ),

    authorHandle:
      stringOrNull(
        safeAuthor.authorHandle
      ) ??
      stringOrNull(
        safeAuthor.handle
      ) ??
      stringOrNull(
        safeAuthor.username
      ),

    authorReach,
  };
}


/**
 * Normalize common relationships.
 *
 * Only replyToId becomes parentId.
 *
 * Quote/repost/forward relationships remain semantically separate in the
 * canonical event and are not silently converted into parent-child
 * relationships.
 *
 * @param {Object} relationships
 * @returns {Object}
 */
function normalizeRelationships(
  relationships
) {
  const safeRelationships =
    objectOrEmpty(
      relationships
    );

  return {
    conversationId:
      stringOrNull(
        safeRelationships.conversationId
      ),

    parentId:
      stringOrNull(
        safeRelationships.replyToId
      ),
  };
}


/**
 * Normalize common time fields.
 *
 * @param {Object} time
 * @returns {Object}
 */
function normalizeTime(time) {
  const safeTime =
    objectOrEmpty(time);

  const publishedAt =
    toIsoOrNull(
      safeTime.publishedAt
    );

  const observedAt =
    toIsoOrNull(
      safeTime.observedAt
    );

  return {
    publishedAt,

    observedAt,

    velocityWindow:
      hoursBetween(
        publishedAt,
        observedAt
      ),
  };
}


/**
 * Build fields shared by all supported platforms.
 *
 * @param {Object} event
 * @param {"x"|"reddit"|"telegram"|null} platform
 * @returns {Object}
 */
function baseNormalizedEvent(
  event,
  platform
) {
  const identity =
    normalizeIdentity(
      event
    );

  const content =
    normalizeContent(
      event.content
    );

  const platformData =
    objectOrEmpty(
      event.platformData
    );

  const author =
    normalizeAuthor(
      event.author,
      platformData
    );

  const relationships =
    normalizeRelationships(
      event.relationships
    );

  const time =
    normalizeTime(
      event.time
    );

  const source =
    objectOrEmpty(
      event.source
    );

  return {
    ...identity,

    platform,

    ...relationships,

    ...author,

    ...content,

    ...time,

    sourceLayer:
      stringOrNull(
        source.sourceLayer
      ),
  };
}


// ============================================================================
// X
// ============================================================================

/**
 * Normalize an X event.
 *
 * X engagement comes from canonical:
 *
 *   event.engagement
 *
 * X author follower count is used only when the canonical event explicitly
 * supplies:
 *
 *   platformData.authorFollowers
 *
 * If the current X scraper does not provide that field, authorReach remains
 * null.
 */
function normalizeX(event) {
  const engagement =
    objectOrEmpty(
      event.engagement
    );

  const result =
    baseNormalizedEvent(
      event,
      "x"
    );

  // --------------------------------------------------------------------------
  // Engagement
  // --------------------------------------------------------------------------

  const likes =
    numOrNull(
      engagement.likes
    );

  const replies =
    numOrNull(
      engagement.replies
    );

  const reposts =
    numOrNull(
      engagement.reposts
    );

  const quotes =
    numOrNull(
      engagement.quotes
    );

  const bookmarks =
    numOrNull(
      engagement.bookmarks
    );

  /*
   * Interactions are a DERIVED aggregate.
   *
   * Only metrics explicitly available in the canonical event are included.
   *
   * Missing values remain missing in the canonical event.
   *
   * The aggregate itself becomes null only when no interaction metric exists.
   */
  const interactions =
    sumAvailable([
      likes,
      replies,
      reposts,
      quotes,
      bookmarks,
    ]);

  // --------------------------------------------------------------------------
  // Views / impressions
  // --------------------------------------------------------------------------

  const views =
    numOrNull(
      engagement.views
    );

  const impressions =
    numOrNull(
      engagement.impressions
    );

  /*
   * Views and impressions are NOT reach.
   */
  const reach = null;

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    ...result,

    interactions,

    views,

    impressions,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    /*
     * X does not currently provide a canonical voting metric in this
     * normalized structure.
     */
    score: null,

    approvalScore: null,

    voteConfidence: null,
  };
}


// ============================================================================
// REDDIT
// ============================================================================

/**
 * Normalize a Reddit event.
 *
 * Reddit score is preserved separately from interactions.
 *
 * This is important:
 *
 *   score != likes
 *   score != interactions
 *   score != reach
 *
 * Reddit score is a platform voting score.
 */
function normalizeReddit(event) {
  const content =
    objectOrEmpty(
      event.content
    );

  const engagement =
    objectOrEmpty(
      event.engagement
    );

  const platformData =
    objectOrEmpty(
      event.platformData
    );

  const result =
    baseNormalizedEvent(
      event,
      "reddit"
    );

  // --------------------------------------------------------------------------
  // Reddit score
  // --------------------------------------------------------------------------

  /*
   * Verified canonical location:
   *
   *   platformData.score
   */
  const score =
    numOrNull(
      platformData.score
    );

  // --------------------------------------------------------------------------
  // Replies
  // --------------------------------------------------------------------------

  const replies =
    numOrNull(
      engagement.replies
    );

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------

  /*
   * Reddit score is NOT added here.
   *
   * It is preserved independently as `score`.
   *
   * Replies are the confirmed interaction metric currently available in
   * canonical engagement.
   */
  const interactions =
    replies;

  // --------------------------------------------------------------------------
  // Approval
  // --------------------------------------------------------------------------

  /*
   * upvoteRatio is a source-provided Reddit metric.
   *
   * It is therefore safe to expose as approvalScore.
   */
  const approvalScore =
    numOrNull(
      platformData.upvoteRatio
    );

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  /*
   * No verified Reddit event-level reach field exists here.
   *
   * Do NOT use:
   *
   *   score
   *   views
   *   subreddit members
   *
   * as reach.
   */
  const reach = null;

  // --------------------------------------------------------------------------
  // Hashtags
  // --------------------------------------------------------------------------

  const canonicalHashtags =
    normalizeStringArray(
      content.hashtags
    );

  const text =
    [
      content.title,
      content.text,
    ]
      .filter(Boolean)
      .join(" ");

  const hashtags =
    canonicalHashtags.length > 0
      ? canonicalHashtags
      : extractHashtags(text);

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    ...result,

    hashtags,

    interactions,

    views: null,

    impressions: null,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    score,

    approvalScore,

    /*
     * upvoteRatio is approval, not confidence.
     */
    voteConfidence: null,
  };
}


// ============================================================================
// TELEGRAM
// ============================================================================

/**
 * Normalize a Telegram event.
 */
function normalizeTelegram(event) {
  const engagement =
    objectOrEmpty(
      event.engagement
    );

  const platformData =
    objectOrEmpty(
      event.platformData
    );

  const result =
    baseNormalizedEvent(
      event,
      "telegram"
    );

  // --------------------------------------------------------------------------
  // Reactions
  // --------------------------------------------------------------------------

  /*
   * Verified Telegram platformData:
   *
   *   reactionsTotal
   *
   * This is an explicit aggregate reaction metric.
   */
  const reactionsTotal =
    numOrNull(
      platformData.reactionsTotal
    );

  // --------------------------------------------------------------------------
  // Replies
  // --------------------------------------------------------------------------

  const replies =
    numOrNull(
      engagement.replies
    );

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------

  /*
   * Reactions + replies.
   *
   * Forwards are intentionally not counted as interactions because they are
   * a distribution signal.
   */
  const interactions =
    sumAvailable([
      reactionsTotal,
      replies,
    ]);

  // --------------------------------------------------------------------------
  // Views
  // --------------------------------------------------------------------------

  const views =
    numOrNull(
      engagement.views
    );

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  const reach = null;

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    ...result,

    interactions,

    views,

    impressions: null,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    score: null,

    approvalScore: null,

    voteConfidence: null,
  };
}


// ============================================================================
// UNKNOWN PLATFORM
// ============================================================================

function normalizeUnknown(event) {
  const result =
    baseNormalizedEvent(
      event,
      null
    );

  return {
    ...result,

    interactions: null,

    views: null,

    impressions: null,

    reach: null,

    engagementRate: null,

    score: null,

    approvalScore: null,

    voteConfidence: null,
  };
}


// ============================================================================
// METRIC HELPERS
// ============================================================================

/**
 * Calculate engagement rate only when actual reach is available.
 *
 * IMPORTANT:
 *
 * Views and impressions are deliberately NOT accepted as reach.
 *
 * @param {number|null} interactions
 * @param {number|null} reach
 * @returns {number|null}
 */
function calculateEngagementRate(
  interactions,
  reach
) {
  if (
    interactions === null ||
    reach === null ||
    !Number.isFinite(interactions) ||
    !Number.isFinite(reach) ||
    reach <= 0
  ) {
    return null;
  }

  return interactions / reach;
}


/**
 * Sum available finite values.
 *
 * [1, 2, 3]      -> 6
 * [1, null, 3]   -> 4
 * [null, null]   -> null
 *
 * This is a derived aggregate and does not alter the canonical metrics.
 *
 * @param {Array<number|null>} values
 * @returns {number|null}
 */
function sumAvailable(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  const available =
    values.filter(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value)
    );

  if (
    available.length === 0
  ) {
    return null;
  }

  return available.reduce(
    (sum, value) =>
      sum + value,
    0
  );
}


/**
 * Convert to finite number.
 *
 * Missing/invalid values become null.
 *
 * @param {*} value
 * @returns {number|null}
 */
function numOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


/**
 * Convert to non-empty string.
 *
 * @param {*} value
 * @returns {string|null}
 */
function stringOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed.length > 0
    ? trimmed
    : null;
}


/**
 * Safely access an object.
 *
 * @param {*} value
 * @returns {Object}
 */
function objectOrEmpty(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}


/**
 * Return the first valid numeric value.
 *
 * @param {...*} values
 * @returns {number|null}
 */
function firstNullableNumber(
  ...values
) {
  for (const value of values) {
    const number =
      numOrNull(value);

    if (
      number !== null
    ) {
      return number;
    }
  }

  return null;
}


// ============================================================================
// ARRAY NORMALIZATION
// ============================================================================

/**
 * Normalize string arrays.
 *
 * @param {*} value
 * @returns {string[]}
 */
function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        typeof item === "string"
    )
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);
}


/**
 * Normalize canonical URLs.
 *
 * Strings remain strings.
 *
 * URL objects remain objects.
 *
 * @param {*} value
 * @returns {Array<string|Object>}
 */
function normalizeUrls(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (url) =>
      typeof url === "string" ||
      (
        url &&
        typeof url === "object" &&
        !Array.isArray(url)
      )
  );
}


// ============================================================================
// TIMESTAMP NORMALIZATION
// ============================================================================

/**
 * Convert supported timestamp forms to ISO UTC.
 *
 * Supports:
 *
 *   - Date
 *   - ISO string
 *   - epoch seconds
 *   - epoch milliseconds
 *   - numeric epoch string
 *   - Redis Stream ID
 *
 * Invalid values become null.
 *
 * @param {*} value
 * @returns {string|null}
 */
function toIsoOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  let date = null;

  // --------------------------------------------------------------------------
  // Date
  // --------------------------------------------------------------------------

  if (value instanceof Date) {
    date = value;
  }

  // --------------------------------------------------------------------------
  // Numeric epoch
  // --------------------------------------------------------------------------

  else if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    date =
      epochToDate(value);
  }

  // --------------------------------------------------------------------------
  // String
  // --------------------------------------------------------------------------

  else if (
    typeof value === "string"
  ) {
    const trimmed =
      value.trim();

    if (!trimmed) {
      return null;
    }

    // ------------------------------------------------------------------------
    // Redis Stream ID
    //
    // Example:
    //
    //   1757890000000-0
    // ------------------------------------------------------------------------

    const streamIdMatch =
      trimmed.match(
        /^(\d+)-\d+$/
      );

    if (streamIdMatch) {
      const milliseconds =
        Number(
          streamIdMatch[1]
        );

      if (
        !Number.isFinite(
          milliseconds
        )
      ) {
        return null;
      }

      date =
        new Date(
          milliseconds
        );
    }

    // ------------------------------------------------------------------------
    // Numeric epoch string
    // ------------------------------------------------------------------------

    else if (
      /^\d+(\.\d+)?$/.test(
        trimmed
      )
    ) {
      const numeric =
        Number(
          trimmed
        );

      if (
        !Number.isFinite(
          numeric
        )
      ) {
        return null;
      }

      date =
        epochToDate(
          numeric
        );
    }

    // ------------------------------------------------------------------------
    // ISO / Date-compatible string
    // ------------------------------------------------------------------------

    else {
      const parsed =
        new Date(
          trimmed
        );

      if (
        !Number.isNaN(
          parsed.getTime()
        )
      ) {
        date = parsed;
      }
    }
  }

  if (!date) {
    return null;
  }

  const timestamp =
    date.getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return null;
  }

  return date.toISOString();
}


/**
 * Convert epoch value into Date.
 *
 * Values below 1e11 are treated as seconds.
 * Larger values are treated as milliseconds.
 *
 * @param {number} value
 * @returns {Date}
 */
function epochToDate(value) {
  const milliseconds =
    Math.abs(value) < 1e11
      ? value * 1000
      : value;

  return new Date(
    milliseconds
  );
}


// ============================================================================
// TIME / VELOCITY
// ============================================================================

/**
 * Calculate elapsed hours:
 *
 *   publishedAt → observedAt
 *
 * Returns null when unavailable or invalid.
 *
 * @param {string|null} publishedAt
 * @param {string|null} observedAt
 * @returns {number|null}
 */
function hoursBetween(
  publishedAt,
  observedAt
) {
  if (
    !publishedAt ||
    !observedAt
  ) {
    return null;
  }

  const published =
    new Date(
      publishedAt
    ).getTime();

  const observed =
    new Date(
      observedAt
    ).getTime();

  if (
    Number.isNaN(published) ||
    Number.isNaN(observed)
  ) {
    return null;
  }

  const milliseconds =
    observed - published;

  if (
    milliseconds < 0
  ) {
    return null;
  }

  return (
    milliseconds /
    3_600_000
  );
}


// ============================================================================
// HASHTAGS
// ============================================================================

/**
 * Extract hashtags from text only when canonical hashtags are unavailable.
 *
 * @param {string} text
 * @returns {string[]}
 */
function extractHashtags(text) {
  if (
    typeof text !== "string" ||
    !text
  ) {
    return [];
  }

  const matches =
    text.match(
      /#[\p{L}\p{N}_]+/gu
    );

  if (!matches) {
    return [];
  }

  return [
    ...new Set(
      matches.map(
        (hashtag) =>
          hashtag.toLowerCase()
      )
    ),
  ];
}


// ============================================================================
// SAFE SERIALIZATION
// ============================================================================

function safeStringify(value) {
  try {
    return JSON.stringify(
      value
    );
  } catch {
    return String(value);
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  normalizeData,
  detectPlatform,
};
