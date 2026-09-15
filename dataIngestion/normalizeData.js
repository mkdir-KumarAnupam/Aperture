/**
 * ============================================================================
 * normalizeData.js
 * ============================================================================
 *
 * Purpose:
 *   Convert one canonical Social Media Analytics event (schema v1.0.0)
 *   into a common analytics-friendly representation.
 *
 * INPUT
 * -----
 *
 * Canonical event produced by:
 *
 *   X / Reddit / Telegram
 *          ↓
 *      Scraper
 *          ↓
 *       Daemon
 *          ↓
 *     Redis Stream
 *          ↓
 *      normalizeData()
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
 * The canonical event is the source of truth.
 *
 * normalizeData() creates a DERIVED representation for downstream
 * analytics. It must never modify or redefine the canonical event.
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
 *
 *
 * VERIFIED PLATFORM DATA
 * -----------------------
 *
 * X:
 *   Current scraper does NOT provide event-level platformData.
 *   Its verified platformData belongs to authorProfiles:
 *
 *     pinnedTweetId
 *     url
 *     followingCount
 *     tweetCount
 *
 *   Therefore these are NOT used by normalizeX() for events.
 *
 *
 * Reddit POST:
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
 * Reddit COMMENT:
 *
 *   subreddit
 *   subredditId
 *   score
 *   permalink
 *   depth
 *   stickied
 *   edited
 *   distinguished
 *
 *
 * Telegram EVENT:
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
 * ============================================================================
 */

/**
 * Unified analytics-friendly representation.
 *
 * @typedef {Object} NormalizedPost
 *
 * @property {string|null} postId
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
 * @property {number|null} reach
 * @property {number|null} engagementRate
 *
 * @property {number|null} approvalScore
 * @property {number|null} voteConfidence
 *
 * @property {string|null} sourceLayer
 */


/**
 * Normalize a single canonical v1.0.0 event.
 *
 * @param {Object} post
 * @returns {NormalizedPost}
 */
function normalizeData(post) {
  /*
   * A completely invalid argument is different from a valid event
   * containing malformed individual fields.
   *
   * The latter should be handled safely by the platform normalizers.
   */
  if (
    typeof post !== "object" ||
    post === null ||
    Array.isArray(post)
  ) {
    throw new Error(
      "normalizeData: expected an event object, got " +
      safeStringify(post)
    );
  }

  const platform = detectPlatform(post);

  switch (platform) {
    case "x":
      return normalizeX(post);

    case "reddit":
      return normalizeReddit(post);

    case "telegram":
      return normalizeTelegram(post);

    default:
      return normalizeUnknown(post);
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
 * @param {Object} post
 * @returns {"x"|"reddit"|"telegram"|null}
 */
function detectPlatform(post) {
  if (
    post.platform === "x" ||
    post.platform === "twitter"
  ) {
    return "x";
  }

  if (post.platform === "reddit") {
    return "reddit";
  }

  if (post.platform === "telegram") {
    return "telegram";
  }

  return null;
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
 * The platformData we inspected in x.py belongs to the author lookup:
 *
 *   pinnedTweetId
 *   url
 *   followingCount
 *   tweetCount
 *
 * Those fields therefore do NOT belong in the event normalizer.
 *
 * X event analytics are derived from the canonical common fields:
 *
 *   content
 *   author
 *   time
 *   engagement
 *   relationships
 *   source
 */
function normalizeX(post) {
  const content =
    objectOrEmpty(post.content);

  const author =
    objectOrEmpty(post.author);

  const time =
    objectOrEmpty(post.time);

  const engagement =
    objectOrEmpty(post.engagement);

  const relationships =
    objectOrEmpty(post.relationships);

  const source =
    objectOrEmpty(post.source);

  // --------------------------------------------------------------------------
  // Engagement
  // --------------------------------------------------------------------------

  const likes =
    numOrNull(engagement.likes);

  const replies =
    numOrNull(engagement.replies);

  const reposts =
    numOrNull(engagement.reposts);

  const quotes =
    numOrNull(engagement.quotes);

  const bookmarks =
    numOrNull(engagement.bookmarks);

  /*
   * Only sum metrics that the source actually provided.
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
   * rather than treating replies as zero in the source data.
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
  // Reach
  // --------------------------------------------------------------------------

  /*
   * X canonical events may provide either impressions or views.
   *
   * We preserve the distinction in the source.
   *
   * For the unified `reach` field:
   *
   *   impressions → preferred
   *   views       → fallback
   *
   * No metric is fabricated.
   */
  const impressions =
    numOrNull(engagement.impressions);

  const views =
    numOrNull(engagement.views);

  const reach =
    impressions !== null
      ? impressions
      : views;

  // --------------------------------------------------------------------------
  // Time
  // --------------------------------------------------------------------------

  const publishedAt =
    toIsoOrNull(time.publishedAt);

  const observedAt =
    toIsoOrNull(time.observedAt);

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    postId: stringOrNull(
      post.platformPostId ??
      post.eventId
    ),

    platform: "x",

    conversationId:
      stringOrNull(
        relationships.conversationId
      ),

    parentId:
      stringOrNull(
        relationships.replyToId
      ),

    authorId:
      stringOrNull(
        author.authorId
      ),

    authorHandle:
      stringOrNull(
        author.authorHandle
      ),

    /*
     * Follower count is not present in the canonical X event.
     *
     * Do NOT take:
     *
     *   likes
     *   views
     *   reposts
     *
     * and pretend one of them is author reach.
     */
    authorReach: null,

    text:
      stringOrNull(
        content.text
      ),

    title:
      stringOrNull(
        content.title
      ),

    hashtags:
      normalizeStringArray(
        content.hashtags
      ),

    urls:
      normalizeUrls(
        content.urls
      ),

    mentions:
      normalizeStringArray(
        content.mentions
      ),

    /*
     * Preserve source language first.
     *
     * If unavailable, use detector output.
     *
     * We do not overwrite content.language with detectedLang.
     */
    language:
      stringOrNull(
        content.language
      ) ??
      stringOrNull(
        content.detectedLang
      ),

    publishedAt,

    observedAt,

    velocityWindow:
      hoursBetween(
        publishedAt,
        observedAt
      ),

    interactions,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    /*
     * Approval score is intentionally left null here.
     *
     * Likes/reposts/quotes/bookmarks are engagement signals,
     * not explicit approval/voting signals.
     *
     * A future model can derive sentiment/approval independently.
     */
    approvalScore: null,

    /*
     * Same reasoning:
     *
     * X does not expose an explicit vote-confidence metric.
     */
    voteConfidence: null,

    sourceLayer:
      stringOrNull(
        source.sourceLayer
      ),
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
function normalizeReddit(post) {
  const content =
    objectOrEmpty(post.content);

  const author =
    objectOrEmpty(post.author);

  const time =
    objectOrEmpty(post.time);

  const engagement =
    objectOrEmpty(post.engagement);

  const relationships =
    objectOrEmpty(post.relationships);

  const source =
    objectOrEmpty(post.source);

  const platformData =
    objectOrEmpty(post.platformData);

  // --------------------------------------------------------------------------
  // Reddit score
  // --------------------------------------------------------------------------

  /*
   * Verified scraper location:
   *
   *   platformData.score
   *
   * There is no confirmed canonical `engagement.score`.
   *
   * Therefore we use the actual verified field directly.
   */
  const score =
    numOrNull(
      platformData.score
    );

  // --------------------------------------------------------------------------
  // Comments / replies
  // --------------------------------------------------------------------------

  /*
   * The canonical engagement structure already provides:
   *
   *   engagement.replies
   *
   * Do not assume `numComments`, because that field was NOT present in the
   * verified platformData implementation.
   */
  const replies =
    numOrNull(
      engagement.replies
    );

  /*
   * Reddit score + replies are useful aggregate interaction signals.
   *
   * Score can be negative, so absolute score is used only for the derived
   * interaction magnitude.
   */
  const interactions =
    sumAvailable([
      score !== null
        ? Math.abs(score)
        : null,

      replies,
    ]);

  // --------------------------------------------------------------------------
  // Approval
  // --------------------------------------------------------------------------

  /*
   * Reddit explicitly provides upvoteRatio for posts.
   *
   * This is a much more defensible approval signal than inventing one from
   * generic engagement metrics.
   */
  let approvalScore =
    numOrNull(
      platformData.upvoteRatio
    );

  /*
   * Do not attempt to calculate:
   *
   *   upvotes / (upvotes + downvotes)
   *
   * because the current verified scraper does not provide separate
   * upvote/downvote fields in platformData.
   */

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  /*
   * No verified Reddit event-level reach metric exists in the scraper
   * structure we inspected.
   *
   * subreddit subscribers were NOT present in the verified platformData.
   *
   * Therefore:
   *
   *   reach = null
   */
  const reach = null;

  // --------------------------------------------------------------------------
  // Time
  // --------------------------------------------------------------------------

  const publishedAt =
    toIsoOrNull(
      time.publishedAt
    );

  const observedAt =
    toIsoOrNull(
      time.observedAt
    );

  // --------------------------------------------------------------------------
  // Hashtags
  // --------------------------------------------------------------------------

  const canonicalHashtags =
    normalizeStringArray(
      content.hashtags
    );

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
  // Parent relationship
  // --------------------------------------------------------------------------

  /*
   * Prefer the canonical reply relationship.
   *
   * Crossposts are NOT replies.
   *
   * Therefore crosspostOfId is deliberately not converted into parentId.
   */
  const parentId =
    stringOrNull(
      relationships.replyToId
    );

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    postId:
      stringOrNull(
        post.platformPostId ??
        post.eventId
      ),

    platform: "reddit",

    conversationId:
      stringOrNull(
        relationships.conversationId
      ),

    parentId,

    authorId:
      stringOrNull(
        author.authorId
      ),

    authorHandle:
      stringOrNull(
        author.authorHandle
      ),

    /*
     * The verified Reddit event does not contain author reach.
     */
    authorReach: null,

    text:
      stringOrNull(
        content.text
      ),

    title:
      stringOrNull(
        content.title
      ),

    hashtags,

    urls:
      normalizeUrls(
        content.urls
      ),

    mentions:
      normalizeStringArray(
        content.mentions
      ),

    language:
      stringOrNull(
        content.language
      ) ??
      stringOrNull(
        content.detectedLang
      ),

    publishedAt,

    observedAt,

    velocityWindow:
      hoursBetween(
        publishedAt,
        observedAt
      ),

    interactions,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    approvalScore,

    /*
     * A score is not itself a probability/confidence measure.
     *
     * Therefore this remains null rather than converting Reddit score
     * into a fabricated confidence metric.
     */
    voteConfidence: null,

    sourceLayer:
      stringOrNull(
        source.sourceLayer
      ),
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
 * Verified canonical engagement:
 *
 *   likes = null
 *   replies = replies_count
 *   reposts = null
 *   quotes = null
 *   bookmarks = null
 *   views = views
 *   impressions = null
 */
function normalizeTelegram(post) {
  const content =
    objectOrEmpty(post.content);

  const author =
    objectOrEmpty(post.author);

  const time =
    objectOrEmpty(post.time);

  const engagement =
    objectOrEmpty(post.engagement);

  const relationships =
    objectOrEmpty(post.relationships);

  const source =
    objectOrEmpty(post.source);

  const platformData =
    objectOrEmpty(post.platformData);

  // --------------------------------------------------------------------------
  // Reactions
  // --------------------------------------------------------------------------

  /*
   * IMPORTANT:
   *
   * The verified Telegram scraper stores aggregate reactions in:
   *
   *   platformData.reactionsTotal
   *
   * It does NOT put them into engagement.likes.
   *
   * Therefore use reactionsTotal as the Telegram-specific reaction signal.
   */
  const reactionsTotal =
    numOrNull(
      platformData.reactionsTotal
    );

  // --------------------------------------------------------------------------
  // Replies
  // --------------------------------------------------------------------------

  /*
   * Telegram's canonical engagement builder explicitly supplies replies.
   */
  const replies =
    numOrNull(
      engagement.replies
    );

  // --------------------------------------------------------------------------
  // Interactions
  // --------------------------------------------------------------------------

  /*
   * Reaction total + replies are the confirmed interaction signals.
   *
   * Forwards are deliberately NOT included because they are not necessarily
   * an interaction with the original message.
   */
  const interactions =
    sumAvailable([
      reactionsTotal,
      replies,
    ]);

  // --------------------------------------------------------------------------
  // Reach
  // --------------------------------------------------------------------------

  /*
   * The Telegram scraper explicitly supplies views through the canonical
   * engagement field.
   */
  const views =
    numOrNull(
      engagement.views
    );

  const reach = views;

  // --------------------------------------------------------------------------
  // Time
  // --------------------------------------------------------------------------

  const publishedAt =
    toIsoOrNull(
      time.publishedAt
    );

  const observedAt =
    toIsoOrNull(
      time.observedAt
    );

  // --------------------------------------------------------------------------
  // Output
  // --------------------------------------------------------------------------

  return {
    postId:
      stringOrNull(
        post.platformPostId ??
        post.eventId
      ),

    platform: "telegram",

    conversationId:
      stringOrNull(
        relationships.conversationId
      ),

    /*
     * Prefer an actual reply relationship.
     *
     * Forward relationships are not automatically treated as parent-child
     * relationships in the normalized representation.
     */
    parentId:
      stringOrNull(
        relationships.replyToId
      ),

    authorId:
      stringOrNull(
        author.authorId
      ),

    authorHandle:
      stringOrNull(
        author.authorHandle
      ),

    /*
     * Channel metadata is not automatically author reach.
     */
    authorReach: null,

    text:
      stringOrNull(
        content.text
      ),

    title:
      stringOrNull(
        content.title
      ),

    hashtags:
      normalizeStringArray(
        content.hashtags
      ),

    urls:
      normalizeUrls(
        content.urls
      ),

    mentions:
      normalizeStringArray(
        content.mentions
      ),

    language:
      stringOrNull(
        content.language
      ) ??
      stringOrNull(
        content.detectedLang
      ),

    publishedAt,

    observedAt,

    velocityWindow:
      hoursBetween(
        publishedAt,
        observedAt
      ),

    interactions,

    reach,

    engagementRate:
      calculateEngagementRate(
        interactions,
        reach
      ),

    /*
     * Telegram's current canonical structure does not expose a normalized
     * approval/voting metric.
     */
    approvalScore: null,

    voteConfidence: null,

    sourceLayer:
      stringOrNull(
        source.sourceLayer
      ),
  };
}


// ============================================================================
// UNKNOWN PLATFORM
// ============================================================================

/**
 * Safe fallback for unsupported platforms.
 *
 * The canonical event is still partially normalized rather than causing
 * the entire processing pipeline to fail.
 */
function normalizeUnknown(post) {
  const content =
    objectOrEmpty(post.content);

  const author =
    objectOrEmpty(post.author);

  const time =
    objectOrEmpty(post.time);

  const relationships =
    objectOrEmpty(post.relationships);

  const source =
    objectOrEmpty(post.source);

  return {
    postId:
      stringOrNull(
        post.platformPostId ??
        post.eventId
      ),

    platform: null,

    conversationId:
      stringOrNull(
        relationships.conversationId
      ),

    parentId:
      stringOrNull(
        relationships.replyToId
      ),

    authorId:
      stringOrNull(
        author.authorId
      ),

    authorHandle:
      stringOrNull(
        author.authorHandle
      ),

    authorReach: null,

    text:
      stringOrNull(
        content.text
      ),

    title:
      stringOrNull(
        content.title
      ),

    hashtags:
      normalizeStringArray(
        content.hashtags
      ),

    urls:
      normalizeUrls(
        content.urls
      ),

    mentions:
      normalizeStringArray(
        content.mentions
      ),

    language:
      stringOrNull(
        content.language
      ) ??
      stringOrNull(
        content.detectedLang
      ),

    publishedAt:
      toIsoOrNull(
        time.publishedAt
      ),

    observedAt:
      toIsoOrNull(
        time.observedAt
      ),

    velocityWindow: null,

    interactions: null,

    reach: null,

    engagementRate: null,

    approvalScore: null,

    voteConfidence: null,

    sourceLayer:
      stringOrNull(
        source.sourceLayer
      ),
  };
}


// ============================================================================
// SHARED METRIC HELPERS
// ============================================================================

/**
 * Calculate engagement rate safely.
 *
 * Returns null when either interaction count or reach is unavailable.
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
 * Sum only available numeric metrics.
 *
 * Examples:
 *
 *   [1, 2, 3]       → 6
 *   [1, null, 3]    → 4
 *   [null, null]    → null
 */
function sumAvailable(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  const available =
    values.filter(
      (value) =>
        value !== null
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
 * null does NOT become 0.
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
 * Convert a value into a string.
 *
 * Empty strings become null.
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
 * Your scraper can preserve URLs as objects containing information such as:
 *
 *   raw
 *   resolved
 *   domain
 *   resolutionStatus
 *
 * Therefore URL objects MUST remain objects.
 *
 * We do not JSON.stringify() the array.
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
        Number(trimmed);

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
        new Date(trimmed);

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
 * Calculate elapsed hours between two timestamps.
 *
 * publishedAt → observedAt
 *
 * Returns null when either timestamp is unavailable.
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

  return (
    observed - published
  ) / 3_600_000;
}


// ============================================================================
// HASHTAG EXTRACTION
// ============================================================================

/**
 * Extract hashtags from text only when the canonical event did not
 * already provide them.
 *
 * This is a fallback convenience for downstream analytics.
 *
 * The canonical event itself remains untouched.
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
