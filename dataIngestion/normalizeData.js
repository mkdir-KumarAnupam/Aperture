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
 *   - convert unavailable values into zero
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
  /*
   * A completely invalid argument is different from a valid event containing
   * malformed individual fields.
   *
   * The latter should be handled safely by the platform normalizers.
   */
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
 * `twitter` is retained as an input compatibility alias, but all normalized
 * output uses the canonical platform identifier `x`.
 *
 * @param {Object} event
 * @returns {"x"|"reddit"|"telegram"|null}
 */
function detectPlatform(event) {
  if (
    event.platform === "x" ||
    event.platform === "twitter"
  ) {
    return "x";
  }

  if (event.platform === "reddit") {
    return "reddit";
  }

  if (event.platform === "telegram") {
    return "telegram";
  }

  return null;
}


// ============================================================================
// SHARED NORMALIZATION
// ============================================================================

/**
 * Normalize common event identity fields.
 *
 * We retain BOTH:
 *
 *   eventId
 *   platformPostId
 *
 * because they have different meanings.
 *
 * eventId:
 *   Collector-level identity.
 *
 * platformPostId:
 *   Native platform identity.
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
     * Detected language is only a fallback when source language is missing.
     *
     * This does NOT modify the canonical event.
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
 * @param {Object} author
 * @returns {Object}
 */
function normalizeAuthor(author) {
  const safeAuthor =
    objectOrEmpty(author);

  return {
    authorId:
      stringOrNull(
        safeAuthor.authorId
      ),

    authorHandle:
      stringOrNull(
        safeAuthor.authorHandle
      ),

    /*
     * Author reach is intentionally NOT inferred.
     *
     * Do not use:
     *
     *   likes
     *   views
     *   reposts
     *   channel subscribers
     *   engagement
     *
     * as a substitute for author reach.
     */
    authorReach: null,
  };
}


/**
 * Normalize common relationships.
 *
 * Only the canonical reply relationship is represented as parentId.
 *
 * Crossposts and forwards are NOT silently converted into parent-child
 * relationships.
 *
 * @param {Object} relationships
 * @returns {Object}
 */
function normalizeRelationships(relationships) {
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
 * Build the fields shared by all supported platforms.
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

  const author =
    normalizeAuthor(
      event.author
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
// X / TWITTER
// ============================================================================

/**
 * Normalize an X event.
 *
 * IMPORTANT:
 *
 * The verified X scraper currently does not attach event-level platformData.
 *
 * The verified X platformData belongs to authorProfiles:
 *
 *   pinnedTweetId
 *   url
 *   followingCount
 *   tweetCount
 *
 * Those fields therefore do NOT belong in the X event normalizer.
 *
 *
 * X event analytics are derived from:
 *
 *   content
 *   author
 *   time
 *   engagement
 *   relationships
 *   source
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
   * Sum only engagement metrics actually supplied by the source.
   *
   * Example:
   *
   *   likes=10
   *   replies=null
   *   reposts=2
   *
   * becomes:
   *
   *   interactions=12
   *
   * Missing replies are NOT interpreted as zero in the source.
   *
   * The derived interaction total is still calculated from the available
   * explicit engagement signals.
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
   * IMPORTANT:
   *
   * Views and impressions are not automatically equivalent to reach.
   *
   * Therefore:
   *
   *   reach = null
   *
   * unless the canonical source explicitly provides a reach metric.
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
     * X does not expose an explicit voting/approval metric in the canonical
     * event structure.
     *
     * Likes/reposts/quotes/bookmarks are engagement signals, not explicit
     * approval labels.
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
 * Verified Reddit POST platformData:
 *
 *   subreddit
 *   subredditId
 *   subredditNamePrefixed
 *   score
 *   upvoteRatio
 *   domain
 *   isSelf
 *   isVideo
 *   over18
 *   stickied
 *   locked
 *   spoiler
 *   distinguished
 *   permalink
 *   postHint
 *
 *
 * Verified Reddit COMMENT platformData:
 *
 *   subreddit
 *   subredditId
 *   score
 *   permalink
 *   depth
 *   stickied
 *   edited
 *   distinguished
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
   * Verified scraper location:
   *
   *   platformData.score
   *
   * There is no confirmed canonical:
   *
   *   engagement.score
   *
   * Therefore use the verified platform-specific field.
   */
  const score =
    numOrNull(
      platformData.score
    );

  // --------------------------------------------------------------------------
  // Replies
  // --------------------------------------------------------------------------

  /*
   * The canonical engagement structure provides replies.
   *
   * Do not assume:
   *
   *   numComments
   *
   * because that field is not part of the verified canonical structure.
   */
  const replies =
    numOrNull(
      engagement.replies
    );

  /*
   * IMPORTANT:
   *
   * Reddit score is a voting score.
   *
   * It is NOT an interaction count.
   *
   * Therefore it is preserved as `score` and is not added to interactions.
   */
  const interactions =
    replies;

  // --------------------------------------------------------------------------
  // Approval
  // --------------------------------------------------------------------------

  /*
   * Reddit explicitly provides upvoteRatio for posts.
   *
   * This is a defensible approval signal because it is a source-provided
   * platform metric.
   *
   * We do not manufacture this value for comments/events where unavailable.
   */
  const approvalScore =
    numOrNull(
      platformData.upvoteRatio
    );

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  /*
   * No verified Reddit event-level reach metric exists in the current
   * canonical structure.
   *
   * Therefore:
   *
   *   reach = null
   */
  const reach = null;

  // --------------------------------------------------------------------------
  // Hashtags
  // --------------------------------------------------------------------------

  const canonicalHashtags =
    normalizeStringArray(
      content.hashtags
    );

  /*
   * Prefer canonical hashtags.
   *
   * Text extraction is only a derived fallback.
   */
  const hashtags =
    canonicalHashtags.length > 0
      ? canonicalHashtags
      : extractHashtags(
        [
          content.title,
          content.text,
        ]
          .filter(Boolean)
          .join(" ")
      );

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
     * Reddit score/upvote ratio is not a confidence probability.
     *
     * Therefore this remains null.
     */
    voteConfidence: null,
  };
}


// ============================================================================
// TELEGRAM
// ============================================================================

/**
 * Normalize a Telegram event.
 *
 * Verified Telegram event platformData:
 *
 *   peerKind
 *   peerId
 *   channelId
 *   channelUsername
 *   channelTitle
 *   forwards
 *   reactionsTotal
 *   reactions
 *   forwardFromPeer
 *
 *
 * Verified canonical engagement:
 *
 *   likes
 *   replies
 *   reposts
 *   quotes
 *   bookmarks
 *   views
 *   impressions
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
   * The verified Telegram scraper stores aggregate reactions in:
   *
   *   platformData.reactionsTotal
   *
   * It does not place them into engagement.likes.
   *
   * Therefore use reactionsTotal directly.
   */
  const reactionsTotal =
    numOrNull(
      platformData.reactionsTotal
    );

  // --------------------------------------------------------------------------
  // Replies
  // --------------------------------------------------------------------------

  /*
   * Telegram canonical engagement provides replies.
   */
  const replies =
    numOrNull(
      engagement.replies
    );

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------

  /*
   * Confirmed interaction signals:
   *
   *   reactions
   *   replies
   *
   * Forwards are deliberately excluded.
   *
   * A forward is a distribution signal rather than necessarily an
   * interaction with the original message.
   */
  const interactions =
    sumAvailable([
      reactionsTotal,
      replies,
    ]);

  // --------------------------------------------------------------------------
  // Views
  // --------------------------------------------------------------------------

  /*
   * Telegram views are explicitly supplied through canonical engagement.
   */
  const views =
    numOrNull(
      engagement.views
    );

  /*
   * Views are not automatically reach.
   */
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

    /*
     * Telegram's current canonical structure does not expose an explicit
     * approval/voting metric.
     */
    approvalScore: null,

    voteConfidence: null,
  };
}


// ============================================================================
// UNKNOWN PLATFORM
// ============================================================================

/**
 * Safe fallback for an unsupported platform.
 *
 * A single unknown platform does not necessarily need to destroy the entire
 * processing pipeline.
 *
 * The normalized platform is null because the platform is outside the
 * supported normalized identifiers.
 */
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
// SHARED METRIC HELPERS
// ============================================================================

/**
 * Calculate engagement rate safely.
 *
 * Engagement rate is only calculated when an actual reach metric exists.
 *
 * We deliberately do NOT use:
 *
 *   views
 *   impressions
 *
 * as reach.
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
    reach <= 0
  ) {
    return null;
  }

  return interactions / reach;
}


/**
 * Sum only available finite numeric metrics.
 *
 * Examples:
 *
 *   [1, 2, 3]      → 6
 *   [1, null, 3]   → 4
 *   [null, null]   → null
 *
 * IMPORTANT:
 *
 * This is a DERIVED aggregate.
 *
 * It does not modify the source metrics.
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

  if (available.length === 0) {
    return null;
  }

  return available.reduce(
    (sum, value) =>
      sum + value,
    0
  );
}


/**
 * Convert a value into a finite number.
 *
 * Invalid/missing values become null.
 *
 * IMPORTANT:
 *
 * null does NOT become zero.
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
 * Convert a value into a non-empty string.
 *
 * Empty strings become null.
 *
 * @param {*} value
 * @returns {string|null}
 */
function stringOrNull(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
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


// ============================================================================
// ARRAY NORMALIZATION
// ============================================================================

/**
 * Normalize a string array.
 *
 * Always returns an array.
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
 * Canonical URLs may be strings or objects such as:
 *
 *   {
 *     raw,
 *     resolved,
 *     domain,
 *     resolutionStatus
 *   }
 *
 * URL objects MUST remain objects.
 *
 * We do NOT JSON.stringify() the array.
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
 * Convert a timestamp into ISO 8601 UTC.
 *
 * Supported:
 *
 *   - Date objects
 *   - ISO strings
 *   - epoch seconds
 *   - epoch milliseconds
 *   - numeric epoch strings
 *   - Redis Stream IDs
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
  // Date object
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
      epochToDate(
        value
      );
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
 * Convert an epoch number into a Date.
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
// VELOCITY / TIME WINDOW
// ============================================================================

/**
 * Calculate elapsed hours between:
 *
 *   publishedAt → observedAt
 *
 * Returns null when:
 *
 *   - either timestamp is unavailable
 *   - either timestamp is invalid
 *   - observedAt occurs before publishedAt
 *
 * A negative interval is treated as invalid rather than being interpreted as
 * a negative velocity window.
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

  if (milliseconds < 0) {
    return null;
  }

  return (
    milliseconds / 3_600_000
  );
}


// ============================================================================
// HASHTAG EXTRACTION
// ============================================================================

/**
 * Extract hashtags from text only when the canonical event did not already
 * provide them.
 *
 * This is a DERIVED convenience operation.
 *
 * The canonical event itself remains untouched.
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
// SAFE DEBUG SERIALIZATION
// ============================================================================

/**
 * Safe JSON serialization for validation errors.
 *
 * @param {*} value
 * @returns {string}
 */
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
