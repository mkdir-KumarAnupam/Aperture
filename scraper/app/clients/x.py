"""
X (Twitter) Twikit client.

Production rules:
- Real X data only.
- No mock/fake fallback data.
- Source-unavailable conditions raise HTTP 503.
- Missing source fields remain None/null.
- Canonical normalization is performed through app.processing.schema.
"""

from datetime import datetime, timezone
from urllib.parse import urlparse
import re

from fastapi import HTTPException
from twikit import Client

from app.config import X_AUTH_TOKEN, X_CT0, logger


SCHEMA_VERSION = "1.0.0"
COLLECTOR_VERSION = "2.1.0"

_x_client: Client | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Generic helpers
# ─────────────────────────────────────────────────────────────────────────────

def _optional_int(value):
    """
    Preserve source-reported zero.

    None means the source did not provide the metric.
    """
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_bool(value):
    """
    Only accept a genuine boolean.
    """
    return value if isinstance(value, bool) else None


def _tweet_payload(tweet) -> dict:
    """
    Return Twikit's raw payload internally for normalization.

    The payload is NOT included in canonical output.
    """
    payload = getattr(tweet, "_data", None)

    return payload if isinstance(payload, dict) else {}


def _legacy_payload(tweet) -> dict:
    """
    Return the legacy portion of an X tweet payload when available.
    """
    payload = _tweet_payload(tweet)
    legacy = payload.get("legacy")

    return legacy if isinstance(legacy, dict) else {}


def _get_tweet_text(tweet) -> str:
    """
    Safely obtain tweet text.
    """
    text = (
        getattr(tweet, "full_text", None)
        or getattr(tweet, "text", None)
        or ""
    )

    return str(text)


def _x_id(value):
    """
    Normalize an X platform ID to canonical x:<id> form.

    None remains None.
    """
    if value is None:
        return None

    value = str(value)

    if not value:
        return None

    if value.startswith("x:"):
        return value

    return f"x:{value}"


def _utc_now() -> str:
    """
    Current UTC timestamp in canonical ISO-8601 form.
    """
    return (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


# ─────────────────────────────────────────────────────────────────────────────
# Timestamp extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_published_at(tweet):
    """
    Extract original X publication timestamp.

    Sources checked in order:
      1. Twikit tweet.created_at
      2. raw payload created_at
      3. raw legacy.created_at
      4. ISO-8601 fallback

    No timestamp is fabricated if X does not provide one.
    """
    from app.processing.schema import parse_twitter_date

    payload = _tweet_payload(tweet)
    legacy = _legacy_payload(tweet)

    candidates = [
        getattr(tweet, "created_at", None),
        payload.get("created_at"),
        legacy.get("created_at"),
    ]

    for value in candidates:

        if value is None:
            continue

        if isinstance(value, datetime):

            if value.tzinfo is None:
                value = value.replace(
                    tzinfo=timezone.utc
                )

            return (
                value.astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )

        if isinstance(value, (int, float)):

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
                ValueError,
                OSError,
                OverflowError,
            ):
                continue

        if not isinstance(value, str):
            continue

        value = value.strip()

        if not value:
            continue

        try:
            parsed = parse_twitter_date(value)

            if parsed:
                return parsed

        except Exception:
            pass

        try:

            normalized = value.replace(
                "Z",
                "+00:00",
            )

            parsed = datetime.fromisoformat(
                normalized
            )

            if parsed.tzinfo is None:
                parsed = parsed.replace(
                    tzinfo=timezone.utc
                )

            return (
                parsed.astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )

        except ValueError:
            pass

    return None


# ─────────────────────────────────────────────────────────────────────────────
# URL extraction
# ─────────────────────────────────────────────────────────────────────────────

_URL_RE = re.compile(
    r"https?://[^\s<>\"]+",
    re.IGNORECASE,
)


def _extract_x_urls(tweet, text: str) -> list[dict]:
    """
    Extract URLs from:

      - generic text extraction
      - URLs visibly present in tweet text
      - X entities
      - X legacy entities

    X expanded URL metadata is used when supplied.

    No network URL resolution is performed by this collector.
    """

    from app.processing.text import extract_urls

    try:
        extracted = extract_urls(text)

    except Exception:
        extracted = []

    if not isinstance(extracted, list):
        extracted = []

    extracted = [
        item
        for item in extracted
        if isinstance(item, dict)
    ]

    existing_raw = {
        item.get("raw")
        for item in extracted
        if item.get("raw")
    }

    # Regex fallback.
    for match in _URL_RE.findall(text):

        raw = match.rstrip(
            ".,!?;:)]}"
        )

        if not raw:
            continue

        if raw in existing_raw:
            continue

        extracted.append({
            "raw": raw,
            "resolved": None,
            "domain": (
                urlparse(raw)
                .netloc
                .replace("www.", "")
                or None
            ),
            "resolutionStatus": "unresolved",
        })

        existing_raw.add(raw)

    # X entity metadata.
    payload = _tweet_payload(tweet)
    legacy = _legacy_payload(tweet)

    entity_containers = [
        payload.get("entities"),
        payload.get("extended_entities"),
        legacy.get("entities"),
        legacy.get("extended_entities"),
    ]

    entity_urls = []

    for container in entity_containers:

        if not isinstance(container, dict):
            continue

        urls = container.get("urls")

        if isinstance(urls, list):

            entity_urls.extend(
                item
                for item in urls
                if isinstance(item, dict)
            )

    by_raw = {
        item.get("url"): item
        for item in entity_urls
        if item.get("url")
    }

    for url_obj in extracted:

        raw = url_obj.get("raw")

        if not raw:
            continue

        entity = by_raw.get(raw)

        if entity:

            expanded = (
                entity.get("expanded_url")
                or entity.get("unwound_url")
                or entity.get("display_url")
            )

            if expanded:

                url_obj["resolved"] = expanded

                url_obj["domain"] = (
                    urlparse(expanded)
                    .netloc
                    .replace("www.", "")
                    or None
                )

                url_obj["resolutionStatus"] = (
                    "platform_expanded"
                )

            else:

                url_obj.setdefault(
                    "resolutionStatus",
                    "unresolved",
                )

        else:

            url_obj.setdefault(
                "resolutionStatus",
                (
                    "resolved"
                    if url_obj.get("resolved")
                    else "unresolved"
                ),
            )

    return extracted


# ─────────────────────────────────────────────────────────────────────────────
# Media / attachment extraction
# ─────────────────────────────────────────────────────────────────────────────

def _payload_media(tweet) -> list[dict]:
    """
    Extract raw X media objects from known payload locations.

    Duplicate media entries are removed using media ID or URL.
    """
    payload = _tweet_payload(tweet)
    legacy = _legacy_payload(tweet)

    containers = [
        payload.get("extended_entities"),
        payload.get("entities"),
        legacy.get("extended_entities"),
        legacy.get("entities"),
    ]

    media_items = []
    seen = set()

    for container in containers:

        if not isinstance(container, dict):
            continue

        media = container.get("media")

        if not isinstance(media, list):
            continue

        for item in media:

            if not isinstance(item, dict):
                continue

            media_id = (
                item.get("id_str")
                or item.get("id")
            )

            media_url = (
                item.get("media_url_https")
                or item.get("media_url")
            )

            dedupe_key = (
                f"id:{media_id}"
                if media_id is not None
                else f"url:{media_url}"
            )

            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)
            media_items.append(item)

    return media_items


def _extract_x_attachments(tweet) -> list[dict]:
    """
    Extract genuine X media.

    Returns [] when the tweet has no actual media.
    """

    attachments = []

    # Twikit media objects.
    twikit_media = getattr(
        tweet,
        "media",
        None,
    ) or []

    seen_media = set()

    for index, media in enumerate(
        twikit_media,
        start=1,
    ):

        media_url = (
            getattr(
                media,
                "media_url_https",
                None,
            )
            or getattr(
                media,
                "media_url",
                None,
            )
        )

        media_id = (
            getattr(
                media,
                "id_str",
                None,
            )
            or getattr(
                media,
                "id",
                None,
            )
        )

        dedupe_key = (
            f"id:{media_id}"
            if media_id is not None
            else f"url:{media_url}"
        )

        if dedupe_key in seen_media:
            continue

        seen_media.add(dedupe_key)

        media_type = (
            getattr(
                media,
                "type",
                None,
            )
            or "unknown"
        )

        item = {
            "type": media_type,
            "url": media_url,
            "mediaId": (
                str(media_id)
                if media_id is not None
                else None
            ),
            "order": index,
            "altText": getattr(
                media,
                "ext_alt_text",
                None,
            ),
            "width": None,
            "height": None,
            "durationMillis": None,
        }

        original_info = getattr(
            media,
            "original_info",
            None,
        )

        if original_info:

            item["width"] = getattr(
                original_info,
                "width",
                None,
            )

            item["height"] = getattr(
                original_info,
                "height",
                None,
            )

        video_info = getattr(
            media,
            "video_info",
            None,
        )

        if video_info:

            item["durationMillis"] = getattr(
                video_info,
                "duration_millis",
                None,
            )

        if any([
            item["url"],
            item["mediaId"],
            item["width"],
            item["height"],
            item["durationMillis"],
        ]):

            attachments.append(item)

    if attachments:
        return attachments

    # Raw X payload fallback.
    for index, media in enumerate(
        _payload_media(tweet),
        start=1,
    ):

        media_id = (
            media.get("id_str")
            or media.get("id")
        )

        media_url = (
            media.get("media_url_https")
            or media.get("media_url")
        )

        media_type = (
            media.get("type")
            or "unknown"
        )

        item = {
            "type": media_type,
            "url": media_url,
            "mediaId": (
                str(media_id)
                if media_id is not None
                else None
            ),
            "order": index,
            "altText": media.get(
                "ext_alt_text"
            ),
            "width": None,
            "height": None,
            "durationMillis": None,
        }

        original_info = media.get(
            "original_info"
        )

        if isinstance(
            original_info,
            dict,
        ):

            item["width"] = (
                original_info.get("width")
            )

            item["height"] = (
                original_info.get("height")
            )

        video_info = media.get(
            "video_info"
        )

        if isinstance(
            video_info,
            dict,
        ):

            item["durationMillis"] = (
                video_info.get(
                    "duration_millis"
                )
            )

        attachments.append(item)

    return attachments


# ─────────────────────────────────────────────────────────────────────────────
# Relationship extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_relationships(tweet) -> dict:
    """
    Extract reply, quote, retweet/forward and conversation relationships.
    """

    payload = _tweet_payload(tweet)
    legacy = _legacy_payload(tweet)

    reply_to_id = (
        legacy.get(
            "in_reply_to_status_id_str"
        )
        or payload.get(
            "in_reply_to_status_id_str"
        )
    )

    reply_to_author_id = (
        legacy.get(
            "in_reply_to_user_id_str"
        )
        or payload.get(
            "in_reply_to_user_id_str"
        )
    )

    conversation_id = (
        legacy.get(
            "conversation_id_str"
        )
        or payload.get(
            "conversation_id_str"
        )
        or getattr(
            tweet,
            "conversation_id",
            None,
        )
    )

    if isinstance(
        conversation_id,
        list,
    ):

        conversation_id = (
            conversation_id[0]
            if conversation_id
            else None
        )

    forward_from_id = None

    retweeted_tweet = getattr(
        tweet,
        "retweeted_tweet",
        None,
    )

    if retweeted_tweet:

        retweeted_id = getattr(
            retweeted_tweet,
            "id",
            None,
        )

        if retweeted_id is not None:
            forward_from_id = str(
                retweeted_id
            )

    quote_tweet_id = None

    for attr in (
        "quote",
        "quoted_tweet",
    ):

        quoted = getattr(
            tweet,
            attr,
            None,
        )

        if not quoted:
            continue

        quoted_id = getattr(
            quoted,
            "id",
            None,
        )

        if quoted_id is not None:

            quote_tweet_id = str(
                quoted_id
            )

            break

    return {
        "replyToId": (
            str(reply_to_id)
            if reply_to_id
            else None
        ),

        "replyToAuthorId": (
            str(reply_to_author_id)
            if reply_to_author_id
            else None
        ),

        "quoteOfId": (
            str(quote_tweet_id)
            if quote_tweet_id
            else None
        ),

        "forwardOfId": (
            str(forward_from_id)
            if forward_from_id
            else None
        ),

        "conversationId": (
            str(conversation_id)
            if conversation_id
            else None
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tweet normalization
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_tweet(
    tweet,
    keyword: str,
    source_layer: str,
):
    """
    Convert a Twikit Tweet object into one canonical event.
    """

    from app.processing.text import (
        extract_hashtags,
        extract_mentions,
        detect_language,
        fingerprint_text,
    )

    from app.processing.schema import (
        make_canonical_event,
    )

    tweet_id = getattr(
        tweet,
        "id",
        None,
    )

    if tweet_id is None:
        raise ValueError(
            "X tweet has no platform ID"
        )

    text = _get_tweet_text(tweet)

    hashtags = extract_hashtags(text)
    mentions = extract_mentions(text)

    urls = _extract_x_urls(
        tweet,
        text,
    )

    language = getattr(
        tweet,
        "lang",
        None,
    )

    detected = detect_language(text)

    relationships = _extract_relationships(
        tweet
    )

    reply_to_id = relationships[
        "replyToId"
    ]

    reply_to_author_id = relationships[
        "replyToAuthorId"
    ]

    quote_tweet_id = relationships[
        "quoteOfId"
    ]

    forward_from_id = relationships[
        "forwardOfId"
    ]

    conversation_id = relationships[
        "conversationId"
    ]

    # Relevance classification.
    text_lower = text.lower()
    keyword_lower = keyword.lower()

    if keyword_lower in text_lower:

        relevance_label = "lexical"

    elif any(
        term in text_lower
        for term in keyword_lower.split()
    ):

        relevance_label = "partial_lexical"

    else:

        relevance_label = "unknown"

    # Media.
    attachments = _extract_x_attachments(
        tweet
    )

    # Timestamp.
    published_at = _extract_published_at(
        tweet
    )

    # Edit state.
    payload = _tweet_payload(tweet)

    edit_info = payload.get(
        "edit_control",
        {},
    )

    if not isinstance(
        edit_info,
        dict,
    ):
        edit_info = {}

    edit_ids = edit_info.get(
        "edit_tweet_ids",
        [],
    )

    if not isinstance(
        edit_ids,
        list,
    ):
        edit_ids = []

    is_edited = (
        len(edit_ids) > 1
        or edit_info.get(
            "is_edited"
        ) is True
    )

    # Author.
    user = getattr(
        tweet,
        "user",
        None,
    )

    author_id_raw = getattr(
        user,
        "id",
        None,
    )

    author_id = (
        _x_id(author_id_raw)
        if author_id_raw is not None
        else None
    )

    return make_canonical_event(
        event_id=_x_id(tweet_id),

        platform="x",

        platform_post_id=str(
            tweet_id
        ),

        source_layer=source_layer,

        retrieval_query=keyword,

        discovered_trend=keyword,

        observed_at=_utc_now(),

        text=text,

        title=None,

        language=language,

        detected_lang=detected.get(
            "lang"
        ),

        language_detection_confidence=(
            detected.get(
                "confidence"
            )
        ),

        hashtags=hashtags,

        mentions=mentions,

        urls=urls,

        attachments=attachments,

        content_fingerprint=(
            fingerprint_text(text)
        ),

        author_id=author_id,

        author_handle=getattr(
            user,
            "screen_name",
            None,
        ),

        author_name=getattr(
            user,
            "name",
            None,
        ),

        author_bio=getattr(
            user,
            "description",
            None,
        ),

        author_location=getattr(
            user,
            "location",
            None,
        ),

        published_at=published_at,

        edited_at=None,

        likes=_optional_int(
            getattr(
                tweet,
                "favorite_count",
                None,
            )
        ),

        replies=_optional_int(
            getattr(
                tweet,
                "reply_count",
                None,
            )
        ),

        reposts=_optional_int(
            getattr(
                tweet,
                "retweet_count",
                None,
            )
        ),

        quotes=_optional_int(
            getattr(
                tweet,
                "quote_count",
                None,
            )
        ),

        bookmarks=_optional_int(
            getattr(
                tweet,
                "bookmark_count",
                None,
            )
        ),

        views=_optional_int(
            getattr(
                tweet,
                "view_count",
                None,
            )
        ),

        impressions=_optional_int(
            getattr(
                tweet,
                "impression_count",
                None,
            )
        ),

        reply_to_id=_x_id(
            reply_to_id
        ),

        reply_to_author_id=_x_id(
            reply_to_author_id
        ),

        quote_of_id=_x_id(
            quote_tweet_id
        ),

        forward_of_id=_x_id(
            forward_from_id
        ),

        conversation_id=_x_id(
            conversation_id
        ),

        platform_data={
            "possiblySensitive": (
                _optional_bool(
                    getattr(
                        tweet,
                        "possibly_sensitive",
                        None,
                    )
                )
            ),

            "isEdited": is_edited,

            "authorFollowers": (
                _optional_int(
                    getattr(
                        user,
                        "followers_count",
                        None,
                    )
                )
            ),

            "authorVerified": (
                _optional_bool(
                    getattr(
                        user,
                        "verified",
                        None,
                    )
                )
            ),
        },

        match_type=relevance_label,

        matched_terms=(
            [keyword]
            if relevance_label != "unknown"
            else []
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Client
# ─────────────────────────────────────────────────────────────────────────────

def get_x_client() -> Client:
    global _x_client

    if _x_client is None:

        _x_client = Client("en-IN")

        if X_AUTH_TOKEN and X_CT0:

            _x_client.set_cookies({
                "auth_token": X_AUTH_TOKEN,
                "ct0": X_CT0,
            })

            logger.info(
                "x_client_initialized"
            )

        else:

            logger.warning(
                "x_client_missing_credentials"
            )

    return _x_client


# ─────────────────────────────────────────────────────────────────────────────
# Trends
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_x_trends() -> dict:
    """
    Fetch real X trends.

    Returns a platform-level result using `trends`.
    """

    client = get_x_client()

    try:

        trends = await client.get_trends(
            "trending",
            count=20,
        )

        if not isinstance(
            trends,
            list,
        ):
            raise ValueError(
                "X trends client returned "
                f"unexpected type: {type(trends).__name__}"
            )

        formatted = []

        for index, trend in enumerate(
            trends,
            start=1,
        ):

            volume = getattr(
                trend,
                "tweet_volume",
                None,
            )

            if volume is None:

                volume = getattr(
                    trend,
                    "tweet_count",
                    None,
                )

            volume = _optional_int(
                volume
            )

            label = getattr(
                trend,
                "name",
                None,
            )

            formatted.append({
                "platform": "x",

                "label": (
                    str(label)
                    if label is not None
                    else None
                ),

                "volume": volume,

                "rank": index,

                "observedAt": _utc_now(),
            })

        return {
            "status": "success",
            "trends": formatted,
        }

    except HTTPException:
        raise

    except Exception as e:

        logger.error(
            "x_trends_failed",
            extra={
                "error": str(e),
            },
        )

        raise HTTPException(
            status_code=503,
            detail=(
                f"X trends unavailable: {e}"
            ),
        )


# ─────────────────────────────────────────────────────────────────────────────
# Tweets
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_x_tweets(
    keyword: str,
    limit: int = 30,
) -> dict:
    """
    Fetch and normalize real X tweets.

    Returns:

        {
            "status": "success",
            "events": [...],
            "pagination": {...}
        }

    The response intentionally contains no legacy `data`
    or `referenced_posts` fields.
    """

    client = get_x_client()

    try:

        if not keyword or not keyword.strip():

            raise ValueError(
                "X tweet search keyword cannot be empty"
            )

        limit = int(limit)

        if limit < 1:

            raise ValueError(
                "X tweet search limit must be >= 1"
            )

        tweets = await client.search_tweet(
            keyword,
            product="Latest",
            count=limit,
        )

        if tweets is None:

            raise ValueError(
                "X tweet client returned None"
            )

        # Twikit normally returns a list-like object.
        try:

            tweets = list(tweets)

        except TypeError as exc:

            raise ValueError(
                "X tweet client returned "
                "a non-iterable response"
            ) from exc

        formatted = []

        referenced_tweets_to_fetch = set()

        # ────────────────────────────────────────────────────────────────
        # Primary tweets
        # ────────────────────────────────────────────────────────────────

        for tweet in tweets:

            event = _normalize_tweet(
                tweet,
                keyword,
                "keyword_search",
            )

            formatted.append(event)

            relationships = _extract_relationships(
                tweet
            )

            if relationships["replyToId"]:

                referenced_tweets_to_fetch.add(
                    relationships["replyToId"]
                )

            if relationships["quoteOfId"]:

                referenced_tweets_to_fetch.add(
                    relationships["quoteOfId"]
                )

            if relationships["forwardOfId"]:

                referenced_tweets_to_fetch.add(
                    relationships["forwardOfId"]
                )

        # ────────────────────────────────────────────────────────────────
        # Relationship resolution
        # ────────────────────────────────────────────────────────────────

        referenced_events = []

        for tweet_id in list(
            referenced_tweets_to_fetch
        )[:5]:

            try:

                lookup_id = str(
                    tweet_id
                )

                if lookup_id.startswith("x:"):

                    lookup_id = lookup_id[2:]

                ref_t = await client.get_tweet_by_id(
                    lookup_id
                )

                if not ref_t:
                    continue

                referenced_events.append(
                    _normalize_tweet(
                        ref_t,
                        keyword,
                        "relationship_resolution",
                    )
                )

            except Exception as e:

                # Relationship failure must not invalidate
                # an already-collected primary tweet.
                logger.debug(
                    "x_relationship_resolution_failed",
                    extra={
                        "tweet_id": tweet_id,
                        "error": str(e),
                    },
                )

        # ────────────────────────────────────────────────────────────────
        # Combine events
        # ────────────────────────────────────────────────────────────────

        events = []

        seen_event_ids = set()

        for event in (
            formatted + referenced_events
        ):

            event_id = event.get(
                "eventId"
            )

            if event_id:

                if event_id in seen_event_ids:
                    continue

                seen_event_ids.add(
                    event_id
                )

            events.append(event)

        # Count actual relationship events that survived deduplication.
        primary_ids = {
            event.get("eventId")
            for event in formatted
            if event.get("eventId")
        }

        relationship_count = sum(
            1
            for event in events
            if (
                event.get("eventId")
                not in primary_ids
            )
        )

        # ────────────────────────────────────────────────────────────────
        # Platform-level response
        # ────────────────────────────────────────────────────────────────

        return {
            "status": "success",

            "events": events,

            "pagination": {
                "requestedLimit": limit,

                "primaryResultsReturned": (
                    len(formatted)
                ),

                "relationshipRecordsCollected": (
                    relationship_count
                ),

                "recordsCollected": len(events),

                "pagesFetched": 1,

                "hasMore": (
                    len(formatted) >= limit
                ),

                "stoppedBecause": (
                    "limit_reached"
                    if len(formatted) >= limit
                    else "no_more_results"
                ),
            },
        }

    except HTTPException:
        raise

    except Exception as e:

        logger.error(
            "x_tweets_failed",
            extra={
                "keyword": keyword,
                "limit": limit,
                "error": str(e),
            },
        )

        raise HTTPException(
            status_code=503,
            detail=f"X API unavailable: {e}",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Author
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_x_author(
    handle: str,
) -> dict:
    """
    Fetch a real X user profile.

    No mock fallback.
    """

    from app.processing.schema import (
        parse_twitter_date,
    )

    client = get_x_client()

    try:

        user = await client.get_user_by_screen_name(
            handle
        )

        bio = getattr(
            user,
            "description",
            None,
        )

        bio = (
            str(bio).strip()
            if bio
            else None
        )

        location = getattr(
            user,
            "location",
            None,
        )

        location = (
            str(location).strip()
            if location
            else None
        )

        pinned = None

        pinned_ids = getattr(
            user,
            "pinned_tweet_ids",
            None,
        )

        if pinned_ids:

            pinned = str(
                pinned_ids[0]
            )

        follower_count = _optional_int(
            getattr(
                user,
                "followers_count",
                None,
            )
        )

        verified = _optional_bool(
            getattr(
                user,
                "verified",
                None,
            )
        )

        created_at = getattr(
            user,
            "created_at",
            None,
        )

        account_created = (
            parse_twitter_date(
                created_at
            )
            if created_at
            else None
        )

        return {
            "status": "success",

            "data": {
                "platform": "x",

                "authorId": str(
                    user.id
                ),

                "handle": (
                    user.screen_name
                ),

                "name": getattr(
                    user,
                    "name",
                    None,
                ),

                "bio": bio,

                "location": location,

                "followerCount": (
                    follower_count
                ),

                "verified": verified,

                "accountAge": (
                    account_created
                ),

                "observedAt": _utc_now(),

                "profileImageUrl": getattr(
                    user,
                    "profile_image_url",
                    None,
                ),

                "platformData": {
                    "pinnedTweetId": pinned,

                    "url": (
                        str(
                            getattr(
                                user,
                                "url",
                            )
                        ).strip()
                        if getattr(
                            user,
                            "url",
                            None,
                        )
                        else None
                    ),

                    "followingCount": (
                        _optional_int(
                            getattr(
                                user,
                                "following_count",
                                None,
                            )
                        )
                    ),

                    "tweetCount": (
                        _optional_int(
                            getattr(
                                user,
                                "statuses_count",
                                None,
                            )
                        )
                    ),
                },
            },
        }

    except HTTPException:
        raise

    except Exception as e:

        logger.error(
            "x_author_failed",
            extra={
                "handle": handle,
                "error": str(e),
            },
        )

        raise HTTPException(
            status_code=503,
            detail=(
                f"X author lookup unavailable: {e}"
            ),
        )
