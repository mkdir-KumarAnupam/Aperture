"""
Aperture Reddit collector.

Responsibilities:
- Communicate with Reddit.
- Apply bounded concurrency.
- Retry transient failures.
- Preserve upstream failure types.
- Normalize Reddit posts/comments into canonical events.
- Normalize Reddit author profiles.
- Never fabricate unavailable values.

Canonical schema:
    schemaVersion = 1.0.0
"""

import asyncio
import html
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import quote, urlparse

import httpx

from app.config import REDDIT_SESSION, logger
from app.processing.text import (
    extract_hashtags,
    extract_mentions,
    extract_urls,
    fingerprint_text,
)


# ============================================================================
# CONFIG
# ============================================================================

SCHEMA_VERSION = "1.0.0"
COLLECTOR_VERSION = "2.1.0"

_SEMAPHORE = asyncio.Semaphore(4)

_MAX_ATTEMPTS = 3
_INITIAL_BACKOFF = 2.0
_MAX_BACKOFF = 15.0

_DEFAULT_LIMIT = 25
_MAX_LIMIT = 100

_USER_AGENT = (
    "ApertureSocialAnalytics/2.1 "
    "(social-media research collector)"
)

REDDIT_BASE_URL = "https://www.reddit.com"


# ============================================================================
# TIME
# ============================================================================

def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def reddit_timestamp(value):
    """
    Convert a Reddit Unix timestamp into UTC ISO-8601.

    Returns None when the source value is unavailable or invalid.
    """

    if value is None:
        return None

    try:
        return (
            datetime.fromtimestamp(
                float(value),
                tz=timezone.utc,
            )
            .isoformat()
            .replace("+00:00", "Z")
        )

    except (
        TypeError,
        ValueError,
        OverflowError,
        OSError,
    ):
        return None


# ============================================================================
# REDDIT TEXT CLEANING
# ============================================================================

def clean_reddit_text(value):
    """
    Decode Reddit HTML entities and remove zero-width placeholders.

    This is Reddit-specific source cleanup.

    None means unavailable/not present.
    Empty strings are not fabricated.
    """

    if value is None:
        return None

    if not isinstance(
        value,
        str,
    ):
        return None

    text = value

    # Reddit content can occasionally contain repeatedly encoded
    # HTML entities, so decode a small bounded number of times.
    for _ in range(3):

        decoded = html.unescape(
            text
        )

        if decoded == text:
            break

        text = decoded

    # Remove zero-width spaces that can appear as placeholders.
    text = text.replace(
        "\u200b",
        "",
    )

    if not text:
        return None

    return text


# ============================================================================
# REDDIT IDS
# ============================================================================

def reddit_author_id(value):
    """
    Normalize a Reddit author fullname to t2_* form.
    """

    if value is None:
        return None

    value = str(
        value
    ).strip()

    if not value:
        return None

    if value.startswith(
        "t2_"
    ):
        return value

    return f"t2_{value}"


def reddit_post_id(value):
    """
    Normalize a Reddit post ID to t3_* form.
    """

    if value is None:
        return None

    value = str(
        value
    ).strip()

    if not value:
        return None

    if value.startswith(
        "t3_"
    ):
        return value

    return f"t3_{value}"


def reddit_comment_id(value):
    """
    Normalize a Reddit comment ID to t1_* form.
    """

    if value is None:
        return None

    value = str(
        value
    ).strip()

    if not value:
        return None

    if value.startswith(
        "t1_"
    ):
        return value

    return f"t1_{value}"


# ============================================================================
# HTTP
# ============================================================================

def _make_headers():
    return {
        "User-Agent": _USER_AGENT,
        "Accept": "application/json",
    }


def _make_cookies():
    if not REDDIT_SESSION:
        return {}

    return {
        "reddit_session": REDDIT_SESSION,
    }


@asynccontextmanager
async def get_reddit_client():
    """
    Create a bounded async HTTP client for Reddit.
    """

    timeout = httpx.Timeout(
        connect=10.0,
        read=20.0,
        write=10.0,
        pool=10.0,
    )

    limits = httpx.Limits(
        max_connections=8,
        max_keepalive_connections=4,
    )

    async with httpx.AsyncClient(
        headers=_make_headers(),
        cookies=_make_cookies(),
        timeout=timeout,
        limits=limits,
        follow_redirects=True,
    ) as client:

        yield client


# ============================================================================
# LIMIT
# ============================================================================

def _safe_limit(
    value,
    default=_DEFAULT_LIMIT,
):
    """
    Clamp requested collection size to a safe range.
    """

    if value is None:
        return default

    try:
        value = int(value)

    except (
        TypeError,
        ValueError,
    ):
        return default

    return max(
        1,
        min(
            value,
            _MAX_LIMIT,
        ),
    )


# ============================================================================
# ERRORS
# ============================================================================

class RedditRateLimitError(Exception):

    def __init__(
        self,
        retry_after=None,
        message="Reddit rate limit exceeded",
    ):
        super().__init__(
            message
        )

        self.retry_after = retry_after


class RedditAuthError(Exception):
    pass


class RedditPermissionError(Exception):
    pass


class RedditNotFoundError(Exception):
    pass


class RedditUpstreamError(Exception):
    pass


# ============================================================================
# RETRY
# ============================================================================

def _retry_after_seconds(
    response: httpx.Response,
):
    """
    Read Reddit Retry-After header when available.
    """

    value = response.headers.get(
        "Retry-After"
    )

    if value is None:
        return None

    try:
        return max(
            0,
            int(value),
        )

    except (
        TypeError,
        ValueError,
    ):
        return None


def _classify_response(
    response: httpx.Response,
):
    """
    Convert Reddit HTTP responses into typed collector errors.
    """

    status = response.status_code

    if 200 <= status < 300:
        return

    if status == 401:
        raise RedditAuthError(
            "Reddit authentication/session expired"
        )

    if status == 403:
        raise RedditPermissionError(
            "Reddit denied access"
        )

    if status == 404:
        raise RedditNotFoundError(
            "Reddit resource was not found"
        )

    if status == 429:
        raise RedditRateLimitError(
            retry_after=_retry_after_seconds(
                response
            )
        )

    if 500 <= status <= 599:
        raise RedditUpstreamError(
            f"Reddit upstream returned HTTP {status}"
        )

    raise httpx.HTTPStatusError(
        f"Reddit returned HTTP {status}",
        request=response.request,
        response=response,
    )


async def _sleep_before_retry(
    attempt,
    retry_after=None,
):
    """
    Exponential backoff with small jitter.
    """

    if retry_after is not None:

        delay = min(
            float(retry_after),
            _MAX_BACKOFF,
        )

    else:

        delay = min(
            _INITIAL_BACKOFF
            * (
                2 ** (
                    attempt - 1
                )
            ),
            _MAX_BACKOFF,
        )

        delay += random.uniform(
            0.0,
            0.5,
        )

    await asyncio.sleep(
        delay
    )


async def _get(
    client: httpx.AsyncClient,
    url: str,
):
    """
    Perform a Reddit GET request with bounded concurrency and retry handling.
    """

    for attempt in range(
        1,
        _MAX_ATTEMPTS + 1,
    ):

        try:

            async with _SEMAPHORE:

                response = await client.get(
                    url
                )

            try:

                _classify_response(
                    response
                )

            except RedditRateLimitError as exc:

                if attempt >= _MAX_ATTEMPTS:
                    raise

                logger.warning(
                    "reddit_rate_limited",
                    extra={
                        "attempt": attempt,
                        "retryAfter": exc.retry_after,
                    },
                )

                await _sleep_before_retry(
                    attempt,
                    exc.retry_after,
                )

                continue

            except RedditUpstreamError as exc:

                if attempt >= _MAX_ATTEMPTS:
                    raise

                logger.warning(
                    "reddit_upstream_retry",
                    extra={
                        "attempt": attempt,
                        "status": response.status_code,
                        "error": str(exc),
                    },
                )

                await _sleep_before_retry(
                    attempt
                )

                continue

            return response

        except (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadTimeout,
            httpx.WriteTimeout,
            httpx.PoolTimeout,
            httpx.NetworkError,
        ) as exc:

            if attempt >= _MAX_ATTEMPTS:

                logger.error(
                    "reddit_network_error",
                    extra={
                        "attempt": attempt,
                        "errorType": type(
                            exc
                        ).__name__,
                    },
                )

                raise RedditUpstreamError(
                    f"Reddit network request failed: {exc}"
                ) from exc

            logger.warning(
                "reddit_network_retry",
                extra={
                    "attempt": attempt,
                    "errorType": type(
                        exc
                    ).__name__,
                },
            )

            await _sleep_before_retry(
                attempt
            )

    raise RedditUpstreamError(
        "Reddit request failed after retries"
    )


def _parse_json(
    response: httpx.Response,
):
    """
    Parse and minimally validate Reddit JSON.
    """

    try:

        data = response.json()

    except ValueError as exc:

        raise RedditUpstreamError(
            "Reddit returned invalid JSON"
        ) from exc

    if not isinstance(
        data,
        (
            dict,
            list,
        ),
    ):
        raise RedditUpstreamError(
            "Reddit returned an unexpected JSON structure"
        )

    return data


# ============================================================================
# SUBREDDIT
# ============================================================================

async def fetch_subreddit(
    client: httpx.AsyncClient,
    sub: str,
    limit: int = _DEFAULT_LIMIT,
):
    """
    Fetch hot posts from a subreddit.

    This function returns the upstream Reddit response.
    Main.py is responsible for canonical wrapping if this endpoint is exposed.
    """

    if not isinstance(
        sub,
        str,
    ) or not sub.strip():

        raise ValueError(
            "subreddit must be a non-empty string"
        )

    subreddit = sub.strip()

    if subreddit.startswith(
        "r/"
    ):
        subreddit = subreddit[2:]

    if not subreddit:
        raise ValueError(
            "subreddit must be a non-empty string"
        )

    limit = _safe_limit(
        limit
    )

    encoded_subreddit = quote(
        subreddit,
        safe="",
    )

    url = (
        f"{REDDIT_BASE_URL}/r/"
        f"{encoded_subreddit}/hot.json"
        f"?limit={limit}"
        "&raw_json=1"
    )

    response = await _get(
        client,
        url
    )

    return _parse_json(
        response
    )


# ============================================================================
# REDDIT URL
# ============================================================================

async def fetch_reddit_url(
    client: httpx.AsyncClient,
    url: str,
):
    """
    Fetch a Reddit URL.

    Kept as a low-level client helper.
    """

    if not isinstance(
        url,
        str,
    ) or not url.strip():

        raise ValueError(
            "url must be a non-empty string"
        )

    response = await _get(
        client,
        url.strip()
    )

    return _parse_json(
        response
    )


# ============================================================================
# AUTHOR HELPERS
# ============================================================================

def _reddit_author(
    data: dict,
):
    """
    Extract the author information available directly on a post/comment.

    Do not infer profile information here.
    """

    if not isinstance(
        data,
        dict,
    ):
        return {
            "authorId": None,
            "authorHandle": None,
            "authorName": None,
            "authorBio": None,
            "authorLocation": None,
        }

    author_name = data.get(
        "author"
    )

    if not isinstance(
        author_name,
        str,
    ) or not author_name.strip():

        author_name = None

    return {
        "authorId": reddit_author_id(
            data.get(
                "author_fullname"
            )
        ),

        "authorHandle": author_name,

        "authorName": author_name,

        "authorBio": None,

        "authorLocation": None,
    }


def _reddit_urls(
    data,
    text,
):
    """
    Extract text URLs and the Reddit post destination URL.

    Text extraction itself is delegated to app.processing.text.
    """

    urls = extract_urls(
        text
    )

    if not isinstance(
        data,
        dict,
    ):
        return urls

    post_url = data.get(
        "url_overridden_by_dest"
    )

    if not post_url:
        post_url = data.get(
            "url"
        )

    if not isinstance(
        post_url,
        str,
    ):
        return urls

    post_url = html.unescape(
        post_url
    ).strip()

    if not post_url.startswith(
        (
            "http://",
            "https://",
        )
    ):
        return urls

    existing = {
        item.get(
            "raw"
        )
        for item in urls
        if isinstance(
            item,
            dict,
        )
    }

    if post_url in existing:
        return urls

    try:

        domain = (
            urlparse(
                post_url
            )
            .netloc
            .lower()
            or None
        )

    except Exception:

        domain = None

    urls.append(
        {
            "raw": post_url,
            "resolved": None,
            "domain": domain,
            "resolutionStatus": "unresolved",
        }
    )

    return urls


# ============================================================================
# ATTACHMENTS
# ============================================================================

def _attachment(
    attachment_type,
    url,
    **extra,
):
    """
    Construct one canonical attachment object.
    """

    if not url:
        return None

    item = {
        "type": attachment_type,
        "url": html.unescape(
            str(url)
        ),
    }

    for key, value in extra.items():

        if value is not None:
            item[key] = value

    return item


def _extract_reddit_attachments(
    data,
):
    """
    Extract media available in Reddit listing data.

    Supports:
    - direct images
    - Reddit-hosted video
    - galleries
    - preview images
    """

    if not isinstance(
        data,
        dict,
    ):
        return []

    result = []
    seen = set()

    def add(item):

        if not item:
            return

        key = (
            item.get("type"),
            item.get("url"),
        )

        if key in seen:
            return

        seen.add(
            key
        )

        result.append(
            item
        )

    # ------------------------------------------------------------------------
    # Direct image
    # ------------------------------------------------------------------------

    post_url = data.get(
        "url_overridden_by_dest"
    )

    if not post_url:
        post_url = data.get(
            "url"
        )

    post_hint = data.get(
        "post_hint"
    )

    if isinstance(
        post_url,
        str,
    ):

        post_url = html.unescape(
            post_url
        )

        lower_url = (
            post_url
            .lower()
            .split("?")[0]
        )

        is_image = (
            post_hint == "image"
            or lower_url.endswith(
                (
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".gif",
                    ".webp",
                )
            )
            or "i.redd.it" in lower_url
        )

        if is_image:

            add(
                _attachment(
                    "image",
                    post_url,
                )
            )

    # ------------------------------------------------------------------------
    # Reddit video
    # ------------------------------------------------------------------------

    if data.get(
        "is_video"
    ) is True:

        media = data.get(
            "media"
        )

        if isinstance(
            media,
            dict,
        ):

            reddit_video = media.get(
                "reddit_video"
            )

            if isinstance(
                reddit_video,
                dict,
            ):

                add(
                    _attachment(
                        "video",
                        reddit_video.get(
                            "fallback_url"
                        ),
                        duration=reddit_video.get(
                            "duration"
                        ),
                        width=reddit_video.get(
                            "width"
                        ),
                        height=reddit_video.get(
                            "height"
                        ),
                    )
                )

    # ------------------------------------------------------------------------
    # Gallery
    # ------------------------------------------------------------------------

    gallery_data = data.get(
        "gallery_data"
    )

    media_metadata = data.get(
        "media_metadata"
    )

    if (
        isinstance(
            gallery_data,
            dict,
        )
        and isinstance(
            media_metadata,
            dict,
        )
    ):

        items = gallery_data.get(
            "items"
        )

        if isinstance(
            items,
            list,
        ):

            for item in items:

                if not isinstance(
                    item,
                    dict,
                ):
                    continue

                media_id = item.get(
                    "media_id"
                )

                if not media_id:
                    continue

                metadata = media_metadata.get(
                    media_id
                )

                if not isinstance(
                    metadata,
                    dict,
                ):
                    continue

                source = metadata.get(
                    "s"
                )

                if not isinstance(
                    source,
                    dict,
                ):
                    continue

                image_url = source.get(
                    "u"
                )

                if not image_url:
                    continue

                image_url = html.unescape(
                    image_url
                )

                add(
                    _attachment(
                        "image",
                        image_url,
                        mediaId=media_id,
                    )
                )

    # ------------------------------------------------------------------------
    # Preview image
    # ------------------------------------------------------------------------

    preview = data.get(
        "preview"
    )

    if isinstance(
        preview,
        dict,
    ):

        images = preview.get(
            "images"
        )

        if isinstance(
            images,
            list,
        ):

            for image in images:

                if not isinstance(
                    image,
                    dict,
                ):
                    continue

                source = image.get(
                    "source"
                )

                if not isinstance(
                    source,
                    dict,
                ):
                    continue

                image_url = source.get(
                    "url"
                )

                if not image_url:
                    continue

                image_url = html.unescape(
                    image_url
                )

                add(
                    _attachment(
                        "image",
                        image_url,
                    )
                )

    return result


# ============================================================================
# POST NORMALIZATION
# ============================================================================

def normalize_reddit_post(
    data: dict,
    keyword=None,
):
    """
    Normalize a Reddit post into the canonical event schema.
    """

    if not isinstance(
        data,
        dict,
    ):
        return None

    reddit_id = data.get(
        "id"
    )

    if not reddit_id:
        return None

    event_id = reddit_post_id(
        reddit_id
    )

    if not event_id:
        return None

    # ------------------------------------------------------------------------
    # Title
    # ------------------------------------------------------------------------

    title = clean_reddit_text(
        data.get(
            "title"
        )
    )

    if title:
        title = title.strip()

    # ------------------------------------------------------------------------
    # Body
    # ------------------------------------------------------------------------

    selftext = clean_reddit_text(
        data.get(
            "selftext"
        )
    )

    if selftext in (
        "[removed]",
        "[deleted]",
    ):
        selftext = None

    if selftext:
        selftext = selftext.strip()

    # No body is represented as null.
    text = selftext

    # ------------------------------------------------------------------------
    # Fingerprint / extraction source
    # ------------------------------------------------------------------------

    fingerprint_source = "\n\n".join(
        value
        for value in (
            title,
            text,
        )
        if value
    )

    # ------------------------------------------------------------------------
    # Author
    # ------------------------------------------------------------------------

    author = _reddit_author(
        data
    )

    # ------------------------------------------------------------------------
    # Time
    # ------------------------------------------------------------------------

    observed_at = utc_now()

    published_at = reddit_timestamp(
        data.get(
            "created_utc"
        )
    )

    # ------------------------------------------------------------------------
    # Edited
    # ------------------------------------------------------------------------

    edited_value = data.get(
        "edited"
    )

    edited_at = None

    if (
        edited_value is not None
        and edited_value is not False
    ):

        edited_at = reddit_timestamp(
            edited_value
        )

    # ------------------------------------------------------------------------
    # URLs / attachments
    # ------------------------------------------------------------------------

    urls = _reddit_urls(
        data,
        fingerprint_source,
    )

    attachments = _extract_reddit_attachments(
        data
    )

    # ------------------------------------------------------------------------
    # Event
    # ------------------------------------------------------------------------

    return {
        "eventId": event_id,

        "platform": "reddit",

        "platformPostId": event_id,

        "source": {
            "sourceLayer": "reddit_search",

            "retrievalQuery": keyword,

            "discoveredTrend": keyword,

            "observedAt": observed_at,

            "collectedAt": observed_at,

            "collectorVersion": COLLECTOR_VERSION,
        },

        "content": {
            "text": text,

            "title": title,

            "language": None,

            "detectedLang": None,

            "languageDetectionConfidence": None,

            "hashtags": extract_hashtags(
                fingerprint_source
            ),

            "mentions": extract_mentions(
                fingerprint_source
            ),

            "urls": urls,

            "attachments": attachments,

            "contentFingerprint": fingerprint_text(
                fingerprint_source
            ),
        },

        "author": author,

        "time": {
            "publishedAt": published_at,

            "observedAt": observed_at,

            "editedAt": edited_at,
        },

        "engagement": {
            "likes": None,

            "replies": (
                data.get(
                    "num_comments"
                )
                if isinstance(
                    data.get(
                        "num_comments"
                    ),
                    int,
                )
                else None
            ),

            "reposts": None,

            "quotes": None,

            "bookmarks": None,

            "views": None,

            "impressions": None,
        },

        "relationships": {
            "replyToId": None,

            "replyToAuthorId": None,

            "quoteOfId": None,

            "forwardOfId": None,

            "crosspostOfId": None,

            "conversationId": None,
        },

        "platformData": {
            "subreddit": data.get(
                "subreddit"
            ),

            "subredditId": data.get(
                "subreddit_id"
            ),

            "subredditNamePrefixed": data.get(
                "subreddit_name_prefixed"
            ),

            "score": data.get(
                "score"
            ),

            "upvoteRatio": data.get(
                "upvote_ratio"
            ),

            "domain": data.get(
                "domain"
            ),

            "isSelf": data.get(
                "is_self"
            ),

            "isVideo": data.get(
                "is_video"
            ),

            "over18": data.get(
                "over_18"
            ),

            "stickied": data.get(
                "stickied"
            ),

            "locked": data.get(
                "locked"
            ),

            "spoiler": data.get(
                "spoiler"
            ),

            "distinguished": data.get(
                "distinguished"
            ),

            "permalink": data.get(
                "permalink"
            ),

            "postHint": data.get(
                "post_hint"
            ),
        },

        "retrieval": {
            "matchType": "search",

            "matchedTerms": (
                [keyword]
                if keyword
                else []
            ),
        },
    }


# ============================================================================
# COMMENT NORMALIZATION
# ============================================================================

def normalize_reddit_comment(
    data: dict,
):
    """
    Normalize a Reddit comment into the canonical event schema.
    """

    if not isinstance(
        data,
        dict,
    ):
        return None

    reddit_id = data.get(
        "id"
    )

    if not reddit_id:
        return None

    event_id = reddit_comment_id(
        reddit_id
    )

    if not event_id:
        return None

    # ------------------------------------------------------------------------
    # Body
    # ------------------------------------------------------------------------

    body = clean_reddit_text(
        data.get(
            "body"
        )
    )

    if body in (
        "[removed]",
        "[deleted]",
    ):
        body = None

    if body:
        body = body.strip()

    # ------------------------------------------------------------------------
    # Author
    # ------------------------------------------------------------------------

    author = _reddit_author(
        data
    )

    # ------------------------------------------------------------------------
    # Time
    # ------------------------------------------------------------------------

    observed_at = utc_now()

    published_at = reddit_timestamp(
        data.get(
            "created_utc"
        )
    )

    # ------------------------------------------------------------------------
    # Edited
    # ------------------------------------------------------------------------

    edited_value = data.get(
        "edited"
    )

    edited_at = None

    if (
        edited_value is not None
        and edited_value is not False
    ):

        edited_at = reddit_timestamp(
            edited_value
        )

    # ------------------------------------------------------------------------
    # Parent
    # ------------------------------------------------------------------------

    parent_id = data.get(
        "parent_id"
    )

    if not isinstance(
        parent_id,
        str,
    ):
        parent_id = None

    if parent_id:
        parent_id = parent_id.strip()

    if parent_id:

        if parent_id.startswith(
            "t1_"
        ):

            parent_id = reddit_comment_id(
                parent_id
            )

        elif parent_id.startswith(
            "t3_"
        ):

            parent_id = reddit_post_id(
                parent_id
            )

    # ------------------------------------------------------------------------
    # Event
    # ------------------------------------------------------------------------

    return {
        "eventId": event_id,

        "platform": "reddit",

        "platformPostId": event_id,

        "source": {
            "sourceLayer": "reddit_comments",

            "retrievalQuery": None,

            "discoveredTrend": None,

            "observedAt": observed_at,

            "collectedAt": observed_at,

            "collectorVersion": COLLECTOR_VERSION,
        },

        "content": {
            "text": body,

            "title": None,

            "language": None,

            "detectedLang": None,

            "languageDetectionConfidence": None,

            "hashtags": extract_hashtags(
                body
            ),

            "mentions": extract_mentions(
                body
            ),

            "urls": extract_urls(
                body
            ),

            "attachments": [],

            "contentFingerprint": fingerprint_text(
                body
            ),
        },

        "author": author,

        "time": {
            "publishedAt": published_at,

            "observedAt": observed_at,

            "editedAt": edited_at,
        },

        "engagement": {
            "likes": None,

            "replies": None,

            "reposts": None,

            "quotes": None,

            "bookmarks": None,

            "views": None,

            "impressions": None,
        },

        "relationships": {
            "replyToId": parent_id,

            "replyToAuthorId": None,

            "quoteOfId": None,

            "forwardOfId": None,

            "crosspostOfId": None,

            "conversationId": None,
        },

        "platformData": {
            "subreddit": data.get(
                "subreddit"
            ),

            "subredditId": data.get(
                "subreddit_id"
            ),

            "score": data.get(
                "score"
            ),

            "permalink": data.get(
                "permalink"
            ),

            "depth": data.get(
                "depth"
            ),

            "stickied": data.get(
                "stickied"
            ),

            "edited": (
                True
                if edited_at is not None
                else (
                    False
                    if edited_value is False
                    else None
                )
            ),

            "distinguished": data.get(
                "distinguished"
            ),
        },

        "retrieval": {
            "matchType": "comment",

            "matchedTerms": [],
        },
    }


# ============================================================================
# SEARCH
# ============================================================================

def _extract_search_children(
    response: dict,
):
    """
    Extract Reddit search listing children.
    """

    if not isinstance(
        response,
        dict,
    ):
        return []

    data = response.get(
        "data"
    )

    if not isinstance(
        data,
        dict,
    ):
        return []

    children = data.get(
        "children"
    )

    if not isinstance(
        children,
        list,
    ):
        return []

    return children


async def fetch_reddit_search(
    client: httpx.AsyncClient,
    keyword: str,
    limit: int = _DEFAULT_LIMIT,
):
    """
    Search Reddit and return normalized canonical events.
    """

    if not isinstance(
        keyword,
        str,
    ) or not keyword.strip():

        raise ValueError(
            "keyword must be a non-empty string"
        )

    keyword = keyword.strip()

    limit = _safe_limit(
        limit
    )

    encoded_keyword = quote(
        keyword,
        safe="",
    )

    url = (
        f"{REDDIT_BASE_URL}/search.json"
        f"?q={encoded_keyword}"
        f"&limit={limit}"
        "&sort=relevance"
        "&raw_json=1"
    )

    response = await _get(
        client,
        url
    )

    raw = _parse_json(
        response
    )

    if not isinstance(
        raw,
        dict,
    ):
        raise RedditUpstreamError(
            "Reddit search returned an unexpected structure"
        )

    children = _extract_search_children(
        raw
    )

    events = []

    for child in children:

        if not isinstance(
            child,
            dict,
        ):
            continue

        if child.get(
            "kind"
        ) != "t3":
            continue

        data = child.get(
            "data"
        )

        if not isinstance(
            data,
            dict,
        ):
            continue

        event = normalize_reddit_post(
            data,
            keyword=keyword,
        )

        if event is None:
            continue

        events.append(
            event
        )

        if len(events) >= limit:
            break

    raw_data = raw.get(
        "data"
    )

    after = None

    if isinstance(
        raw_data,
        dict,
    ):
        after = raw_data.get(
            "after"
        )

    records_collected = len(
        events
    )

    return {
        "status": (
            "success"
            if events
            else "success_empty"
        ),

        "events": events,

        "authorProfiles": [],

        "pagination": {
            "requestedLimit": limit,

            "primaryResultsReturned": records_collected,

            "relationshipRecordsCollected": 0,

            "recordsCollected": records_collected,

            "pagesFetched": 1,

            "hasMore": (
                bool(after)
                if isinstance(
                    raw_data,
                    dict,
                )
                else None
            ),

            "stoppedBecause": (
                "limit_reached"
                if records_collected >= limit
                else (
                    "no_more_results"
                    if not after
                    else "source_returned_page"
                )
            ),
        },
    }


# ============================================================================
# COMMENTS
# ============================================================================

def _extract_comment_nodes(
    listing,
):
    """
    Extract direct comment children from a Reddit listing.
    """

    if not isinstance(
        listing,
        dict,
    ):
        return []

    data = listing.get(
        "data"
    )

    if not isinstance(
        data,
        dict,
    ):
        return []

    children = data.get(
        "children"
    )

    if not isinstance(
        children,
        list,
    ):
        return []

    return children


def _walk_comment_children(
    children,
    output,
):
    """
    Recursively walk Reddit comment trees.

    Events are emitted in source traversal order.
    """

    if not isinstance(
        children,
        list,
    ):
        return

    for child in children:

        if not isinstance(
            child,
            dict,
        ):
            continue

        if child.get(
            "kind"
        ) != "t1":
            continue

        data = child.get(
            "data"
        )

        if not isinstance(
            data,
            dict,
        ):
            continue

        event = normalize_reddit_comment(
            data
        )

        if event is not None:

            output.append(
                event
            )

        replies = data.get(
            "replies"
        )

        if isinstance(
            replies,
            dict,
        ):

            nested = _extract_comment_nodes(
                replies
            )

            _walk_comment_children(
                nested,
                output
            )


async def fetch_reddit_comments(
    client: httpx.AsyncClient,
    post_id: str,
    limit: int = _DEFAULT_LIMIT,
):
    """
    Fetch Reddit comments and normalize them into canonical events.

    `limit` is the maximum number of emitted comment events.
    """

    if not isinstance(
        post_id,
        str,
    ) or not post_id.strip():

        raise ValueError(
            "post_id must be a non-empty string"
        )

    post_id = post_id.strip()

    if post_id.startswith(
        "t3_"
    ):

        clean_post_id = post_id[3:]

    else:

        clean_post_id = post_id

    if not clean_post_id:

        raise ValueError(
            "Invalid Reddit post ID"
        )

    limit = _safe_limit(
        limit
    )

    encoded_post_id = quote(
        clean_post_id,
        safe="",
    )

    url = (
        f"{REDDIT_BASE_URL}/comments/"
        f"{encoded_post_id}.json"
        f"?limit={limit}"
        "&sort=top"
        "&raw_json=1"
    )

    response = await _get(
        client,
        url
    )

    raw = _parse_json(
        response
    )

    if not isinstance(
        raw,
        list,
    ):
        raise RedditUpstreamError(
            "Reddit comments returned an unexpected structure"
        )

    if len(raw) < 2:

        raise RedditUpstreamError(
            "Reddit comments response is missing comments listing"
        )

    events = []

    comments_listing = raw[1]

    children = _extract_comment_nodes(
        comments_listing
    )

    _walk_comment_children(
        children,
        events
    )

    # Enforce collector limit after recursive traversal.
    events = events[:limit]

    records_collected = len(
        events
    )

    return {
        "status": (
            "success"
            if events
            else "success_empty"
        ),

        "events": events,

        "authorProfiles": [],

        "pagination": {
            "requestedLimit": limit,

            "primaryResultsReturned": records_collected,

            "relationshipRecordsCollected": records_collected,

            "recordsCollected": records_collected,

            "pagesFetched": 1,

            # Reddit's nested comment listing does not expose a reliable
            # pagination cursor for this collector implementation.
            "hasMore": None,

            "stoppedBecause": (
                "limit_reached"
                if records_collected >= limit
                else "no_more_results"
            ),
        },
    }


# ============================================================================
# AUTHOR PROFILE
# ============================================================================

def normalize_reddit_author(
    data: dict,
):
    """
    Normalize a Reddit /user/<name>/about response.
    """

    if not isinstance(
        data,
        dict,
    ):
        return None

    profile_data = data.get(
        "data"
    )

    if not isinstance(
        profile_data,
        dict,
    ):
        return None

    name = profile_data.get(
        "name"
    )

    if not isinstance(
        name,
        str,
    ) or not name.strip():

        return None

    author_id = reddit_author_id(
        profile_data.get(
            "id"
        )
    )

    subreddit_data = profile_data.get(
        "subreddit"
    )

    author_bio = None

    if isinstance(
        subreddit_data,
        dict,
    ):

        description = clean_reddit_text(
            subreddit_data.get(
                "public_description"
            )
        )

        if description:
            author_bio = description.strip()

    return {
        "authorId": author_id,

        "platform": "reddit",

        "authorHandle": name,

        "authorName": name,

        "authorBio": author_bio,

        "authorLocation": None,

        "createdAt": reddit_timestamp(
            profile_data.get(
                "created_utc"
            )
        ),

        "platformData": {
            "linkKarma": profile_data.get(
                "link_karma"
            ),

            "commentKarma": profile_data.get(
                "comment_karma"
            ),

            "totalKarma": profile_data.get(
                "total_karma"
            ),

            "verified": profile_data.get(
                "verified"
            ),

            "isGold": profile_data.get(
                "is_gold"
            ),

            "isMod": profile_data.get(
                "is_mod"
            ),

            "hasVerifiedEmail": profile_data.get(
                "has_verified_email"
            ),
        },
    }


async def fetch_reddit_author(
    client: httpx.AsyncClient,
    handle: str,
):
    """
    Fetch and normalize a Reddit author profile.
    """

    if not isinstance(
        handle,
        str,
    ) or not handle.strip():

        raise ValueError(
            "handle must be a non-empty string"
        )

    handle = handle.strip()

    if handle.startswith(
        "/u/"
    ):

        handle = handle[3:]

    elif handle.startswith(
        "u/"
    ):

        handle = handle[2:]

    if not handle:

        raise ValueError(
            "handle must be a non-empty string"
        )

    encoded_handle = quote(
        handle,
        safe="",
    )

    url = (
        f"{REDDIT_BASE_URL}/user/"
        f"{encoded_handle}/about.json"
        "?raw_json=1"
    )

    response = await _get(
        client,
        url
    )

    raw = _parse_json(
        response
    )

    if not isinstance(
        raw,
        dict,
    ):
        raise RedditUpstreamError(
            "Reddit author returned an unexpected structure"
        )

    profile = normalize_reddit_author(
        raw
    )

    profiles = (
        [profile]
        if profile is not None
        else []
    )

    return {
        "status": (
            "success"
            if profiles
            else "success_empty"
        ),

        "authorProfiles": profiles,

        "events": [],

        "pagination": {
            "requestedLimit": 1,

            "primaryResultsReturned": len(
                profiles
            ),

            "relationshipRecordsCollected": 0,

            "recordsCollected": 0,

            "pagesFetched": 1,

            "hasMore": False,

            "stoppedBecause": "no_more_results",
        },
    }
