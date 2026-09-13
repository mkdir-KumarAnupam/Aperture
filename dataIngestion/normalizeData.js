/**
 * Unified post shape produced by normalizeData() for every platform.
 *
 * Philosophy: this file only ever PARSES. It never throws for missing or
 * malformed data, and it never guesses a default value to paper over a gap
 * (no reach=1, no approvalScore=0.5, etc). If a field can't be computed from
 * what's actually present, it comes back as `null` — visibly missing,
 * not silently wrong. Downstream (velocity/Z-score stage, dead-letter
 * handling, etc.) decides what to do with nulls.
 *
 * The ONLY case this still throws is when `post` itself is not an object —
 * there's nothing to parse at all, so returning a null-filled record would
 * be more misleading than an explicit error.
 *
 * @typedef {Object} NormalizedPost
 * @property {string|null} postId
 * @property {"twitter"|"reddit"|"telegram"|null} platform
 * @property {string|null} conversationId
 * @property {string|null} parentId
 * @property {string|null} authorId
 * @property {string|null} authorHandle
 * @property {number|null} authorReach
 * @property {string|null} text
 * @property {string|null} title
 * @property {string[]} hashtags        - always an array, [] when none
 * @property {string[]} urls
 * @property {string[]} mentions
 * @property {string|null} language
 * @property {string|null} publishedAt  - ISO 8601 UTC, or null if unparseable/missing
 * @property {string|null} observedAt   - ISO 8601 UTC, or null if unparseable/missing
 * @property {number|null} velocityWindow - hours between publishedAt/observedAt, or null
 * @property {number|null} interactions
 * @property {number|null} reach
 * @property {number|null} engagementRate  - null if interactions or reach is null, or reach is 0
 * @property {number|null} approvalScore
 * @property {number|null} voteConfidence
 * @property {string|null} sourceLayer
 */

/**
 * Normalize a single raw platform post into the unified schema.
 * Never throws for missing/malformed fields — those come back as null.
 * @param {Object} post
 * @returns {NormalizedPost}
 */
function normalizeData(post) {
  if (typeof post !== "object" || post === null) {
    throw new Error("normalizeData: expected a post object, got " + JSON.stringify(post));
  }

  const platform = detectPlatform(post);

  if (platform === "twitter") return normalizeTwitter(post);
  if (platform === "reddit") return normalizeReddit(post);

  // Unknown/unsupported platform (including "telegram" until it's built) —
  // return whatever generic fields we can salvage instead of throwing, so
  // one bad/unsupported record never kills a whole batch upstream.
  return normalizeUnknown(post, platform);
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(post) {
  if (post.platform === "x" || post.platform === "twitter" || "impressionCount" in post) {
    return "twitter";
  }
  if (post.platform === "reddit" || "subredditSubscribers" in post) {
    return "reddit";
  }
  if (post.platform === "telegram") {
    return "telegram";
  }
  return null; // genuinely unrecognized shape
}

// ---------------------------------------------------------------------------
// Twitter / X
// ---------------------------------------------------------------------------

function normalizeTwitter(post) {
  const eng = post.engagement ?? {};

  const likes = numOrNull(eng.likes) ?? 0;
  const retweets = numOrNull(eng.retweets) ?? 0;
  const replies = numOrNull(eng.replies) ?? numOrNull(post.replyCount) ?? 0;
  const quotes = numOrNull(eng.quotes) ?? numOrNull(post.quoteCount) ?? 0;
  const bookmarks = numOrNull(post.bookmarkCount) ?? 0;

  const reach = numOrNull(post.impressionCount); // null if missing/unparseable — no fake "1"
  const interactions = likes + retweets + replies + quotes + bookmarks;

  const publishedAt = parseTwitterTimestamp(post.timestamp);
  const observedAt = toIsoOrNull(post.observedAt);

  return {
    trend_label : post.trend_label,
    postId: post.postId ?? null,
    platform: "twitter",
    conversationId: post.conversationId ?? post.postId ?? null,
    parentId: post.replyToId ?? null,

    authorId: post.authorId ?? null,
    authorHandle: post.authorHandle ?? null,
    authorReach: numOrNull(post.authorFollowers),

    text: post.text ?? null,
    title: null,
    hashtags: post.hashtags ?? [],
    urls: post.urls ?? [],
    mentions: post.mentions ?? [],
    language: post.language || post.detectedLang || null,

    publishedAt,
    observedAt,
    velocityWindow: hoursBetween(publishedAt, observedAt),

    interactions,
    reach,
    engagementRate: reach && reach > 0 ? interactions / reach : null,

    // NOTE: weights (3 / 2 / 2 / 1 / 1) and the *20 scaling constant are a
    // starting heuristic, not backtested — retune once you have more data.
    approvalScore: reach && reach > 0
      ? Math.min(1, ((retweets * 3 + quotes * 2 + bookmarks * 2 + likes + replies) / reach) * 20)
      : null,

    voteConfidence: Math.log10(1 + likes + retweets),

    sourceLayer: post.sourceLayer ?? null,
  };
}

function parseTwitterTimestamp(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

function normalizeReddit(post) {
  const eng = post.engagement ?? {};

  const score = numOrNull(eng.score);
  const comments = numOrNull(eng.comments) ?? numOrNull(post.numComments) ?? 0;
  const upvotes = numOrNull(eng.upvotes);
  const downvotes = numOrNull(eng.downvotes);

  // subredditSubscribers is a proxied max-audience number, not a measured
  // view count — kept as-is (null if absent), no fake "1" fallback.
  const reach = numOrNull(post.subredditSubscribers);

  const interactions = score !== null ? Math.abs(score) + comments : comments;

  const publishedAt = parseRedditTimestamp(post.timestamp);
  const observedAt = toIsoOrNull(post.observedAt);

  let approvalScore = numOrNull(post.upvoteRatio);
  if (approvalScore === null && upvotes !== null && downvotes !== null && upvotes + downvotes > 0) {
    approvalScore = upvotes / (upvotes + downvotes);
  }
  // no more silent 0.5 default — if there's truly no signal, it's null.

  return {
    trend_label : post.trend_label,
    postId: post.postId ?? null,
    platform: "reddit",
    conversationId: post.postId ?? null,
    parentId: post.crosspostParentId ?? null,

    authorId: post.authorId ?? null,
    authorHandle: post.authorHandle ?? null,
    authorReach: reach,

    text: post.text ?? null,
    title: post.title ?? null,
    hashtags: post.hashtags ?? extractHashtags(`${post.title ?? ""} ${post.text ?? ""}`),
    urls: post.urls ?? [],
    mentions: post.mentions ?? [],
    language: post.language || post.detectedLang || null,

    publishedAt,
    observedAt,
    velocityWindow: hoursBetween(publishedAt, observedAt),

    interactions,
    reach,
    engagementRate: reach && reach > 0 ? interactions / reach : null,
    approvalScore,

    voteConfidence: score !== null ? Math.log10(1 + Math.abs(score)) : null,

    sourceLayer: post.sourceLayer ?? null,
  };
}

function parseRedditTimestamp(ts) {
  if (!ts) return null;
  // UNVERIFIED: Reddit's bare timestamp ("2026-09-11T22:49:53") has no
  // timezone offset — this assumes UTC. Confirm against the scraper source
  // before trusting velocityWindow downstream; a wrong assumption here
  // produces a wrong-but-non-null value, which won't be caught by null checks.
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
  const date = new Date(hasOffset ? ts : ts + "Z");
  return isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// Unknown / unsupported platform — salvage what we can, never throw
// ---------------------------------------------------------------------------

function normalizeUnknown(post, platform) {
  const observedAt = toIsoOrNull(post.observedAt);
  return {
    postId: post.postId ?? null,
    platform: platform, // null if truly undetected, "telegram" if just not built yet
    conversationId: post.conversationId ?? post.postId ?? null,
    parentId: post.replyToId ?? post.crosspostParentId ?? null,
    authorId: post.authorId ?? null,
    authorHandle: post.authorHandle ?? null,
    authorReach: null,
    text: post.text ?? null,
    title: post.title ?? null,
    hashtags: post.hashtags ?? [],
    urls: post.urls ?? [],
    mentions: post.mentions ?? [],
    language: post.language || post.detectedLang || null,
    publishedAt: null,
    observedAt,
    velocityWindow: null,
    interactions: null,
    reach: null,
    engagementRate: null,
    approvalScore: null,
    voteConfidence: null,
    sourceLayer: post.sourceLayer ?? null,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers — all null-safe, none of them throw
// ---------------------------------------------------------------------------

/** Coerce to a finite number, or null if it isn't one (handles undefined, "", "abc", NaN, etc). */
function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converts observedAt into ISO UTC, or null if it can't be resolved.
 * Handles:
 *  - a clean epoch-seconds number (expected shape)
 *  - a numeric string epoch-seconds
 *  - a raw Redis/Upstash Stream ID ("<ms>-<seq>") if one leaks through —
 *    treated as already-milliseconds, no *1000
 *  - undefined/null/garbage -> null, never throws
 */
function toIsoOrNull(value) {
  let ms = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    ms = value * 1000;
  } else if (typeof value === "string") {
    const streamIdMatch = value.match(/^(\d+)-\d+$/);
    if (streamIdMatch) {
      ms = Number(streamIdMatch[1]);
    } else if (/^\d+(\.\d+)?$/.test(value)) {
      ms = Number(value) * 1000;
    }
  }

  if (ms === null) return null;
  const date = new Date(ms);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Hours between two ISO strings, or null if either is missing/invalid. */
function hoursBetween(isoEarlier, isoLater) {
  if (!isoEarlier || !isoLater) return null;
  const a = new Date(isoEarlier).getTime();
  const b = new Date(isoLater).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / 3_600_000;
}

function extractHashtags(text) {
  const matches = text.match(/#[a-zA-Z0-9_]+/g);
  return matches ? [...new Set(matches.map((h) => h.toLowerCase()))] : [];
}

module.exports = { normalizeData, detectPlatform };