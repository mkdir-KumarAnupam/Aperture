"""
Telegram client / raw collection layer.

Production rules:
- Real Telegram data only.
- No mock/fake fallback data.
- Missing source fields remain None/null.
- Never invent media URLs, engagement metrics, author identities, or timestamps.
- Returns platform-level failure information instead of silently fabricating data.
"""

import asyncio
import datetime as dt_module
from urllib.parse import urlparse

from telethon import TelegramClient
from telethon.errors.rpcerrorlist import FloodWaitError
from telethon.tl.functions.channels import SearchPostsRequest
from telethon.tl.types import (
    InputPeerChannel,
    InputPeerEmpty,
    Message,
    MessageMediaDocument,
    MessageMediaPhoto,
    Channel,
)

from app.config import (
    logger,
    TELEGRAM_API_ID,
    TELEGRAM_API_HASH,
)

from app.processing.text import (
    detect_language,
    extract_hashtags,
    extract_mentions,
    extract_urls,
    fingerprint_text,
)

from app.processing.schema import (
    make_canonical_event,
    parse_iso,
)


SESSION_FILE = "data/telegram_session"

SCHEMA_VERSION = "1.0.0"
COLLECTOR_VERSION = "2.1.0"

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

_tg_client = None
_tg_client_lock = asyncio.Lock()


# ============================================================================
# Time
# ============================================================================

def _utc_now() -> str:
    return (
        dt_module.datetime.now(
            dt_module.timezone.utc
        )
        .isoformat()
        .replace("+00:00", "Z")
    )


# ============================================================================
# Generic helpers
# ============================================================================

def _optional_int(value):
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_limit(
    value,
    default=_DEFAULT_LIMIT,
    maximum=_MAX_LIMIT,
):
    if value is None:
        return default

    try:
        value = int(value)
    except (TypeError, ValueError):
        return default

    return max(1, min(value, maximum))


# ============================================================================
# Telegram identity
# ============================================================================

def _telegram_message_id(
    peer_kind,
    peer_id,
    message_id,
):
    """
    Telegram message IDs are peer-scoped.

    Example:
        telegram:channel:123456:789
    """

    if peer_kind is None:
        return None

    if peer_id is None:
        return None

    if message_id is None:
        return None

    return (
        f"telegram:{peer_kind}:{peer_id}:{message_id}"
    )


# ============================================================================
# Peer resolution
# ============================================================================

def _get_peer_info(msg, chats_dict):
    """
    Resolve the message peer.

    Returns:

        {
            "kind": "channel" | "chat" | "user",
            "id": int,
            "channelId": int | None,
            "username": str | None,
            "title": str | None
        }

    Returns None when the peer cannot be resolved.
    """

    peer = getattr(
        msg,
        "peer_id",
        None,
    )

    if peer is None:
        return None

    channel_id = getattr(
        peer,
        "channel_id",
        None,
    )

    chat_id = getattr(
        peer,
        "chat_id",
        None,
    )

    user_id = getattr(
        peer,
        "user_id",
        None,
    )

    # ------------------------------------------------------------------------
    # Channel
    # ------------------------------------------------------------------------

    if channel_id is not None:

        chat = chats_dict.get(
            channel_id
        )

        return {
            "kind": "channel",
            "id": channel_id,
            "channelId": channel_id,
            "username": (
                getattr(
                    chat,
                    "username",
                    None,
                )
                if chat is not None
                else None
            ),
            "title": (
                getattr(
                    chat,
                    "title",
                    None,
                )
                if chat is not None
                else None
            ),
        }

    # ------------------------------------------------------------------------
    # Basic group/chat
    # ------------------------------------------------------------------------

    if chat_id is not None:

        return {
            "kind": "chat",
            "id": chat_id,
            "channelId": None,
            "username": None,
            "title": None,
        }

    # ------------------------------------------------------------------------
    # User peer
    # ------------------------------------------------------------------------

    if user_id is not None:

        return {
            "kind": "user",
            "id": user_id,
            "channelId": None,
            "username": None,
            "title": None,
        }

    return None


# ============================================================================
# URL helpers
# ============================================================================

def _url_dedupe_key(url):
    """
    Build a normalized comparison key without modifying the stored URL.

    Scheme remains significant.

    www.example.com and example.com are considered equivalent.
    """

    if not url:
        return None

    try:
        value = str(url).strip()

        if not value:
            return None

        parse_value = value

        if "://" not in parse_value:
            parse_value = f"https://{parse_value}"

        parsed = urlparse(
            parse_value
        )

        scheme = (
            parsed.scheme.lower()
            if parsed.scheme
            else "https"
        )

        hostname = (
            parsed.hostname.lower()
            if parsed.hostname
            else None
        )

        if not hostname:
            return value.casefold()

        if hostname.startswith("www."):
            hostname = hostname[4:]

        port = None

        try:
            port = parsed.port
        except ValueError:
            port = None

        if (
            (scheme == "https" and port == 443)
            or
            (scheme == "http" and port == 80)
        ):
            port = None

        netloc = hostname

        if port is not None:
            netloc = f"{hostname}:{port}"

        return (
            scheme,
            netloc,
            parsed.path or "/",
            parsed.params,
            parsed.query,
            parsed.fragment,
        )

    except Exception:
        return str(url).strip().casefold()


def _url_object(
    raw,
    resolved=None,
    resolution_status=None,
):
    """
    Construct the canonical URL representation.

    Telegram URLs are not resolved by this collector.
    """

    if not raw:
        return None

    raw = str(raw).strip()

    if not raw:
        return None

    domain = None

    try:

        parse_value = raw

        if "://" not in parse_value:
            parse_value = f"https://{parse_value}"

        parsed = urlparse(
            parse_value
        )

        domain = (
            parsed.hostname
            or None
        )

    except Exception:
        domain = None

    if resolution_status is None:

        resolution_status = (
            "platform_expanded"
            if resolved
            else "unresolved"
        )

    return {
        "raw": raw,
        "resolved": (
            str(resolved)
            if resolved
            else None
        ),
        "domain": domain,
        "resolutionStatus": resolution_status,
    }


def _extract_message_urls(msg, text):
    """
    Extract URLs from:

    1. Telegram URL entities
    2. Telegram text-url entities
    3. Shared text extractor

    Duplicates are removed using normalized URL identity.
    """

    urls = []

    entities = (
        getattr(
            msg,
            "entities",
            None,
        )
        or []
    )

    # ------------------------------------------------------------------------
    # Telegram entity URLs
    # ------------------------------------------------------------------------

    for entity in entities:

        entity_url = getattr(
            entity,
            "url",
            None,
        )

        if not entity_url:
            continue

        item = _url_object(
            entity_url,
            resolved=None,
            resolution_status="unresolved",
        )

        if item is not None:
            urls.append(item)

    # ------------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------------

    try:

        extracted = extract_urls(
            text or ""
        )

    except Exception as exc:

        logger.debug(
            "telegram_url_extraction_failed",
            extra={
                "errorType": type(exc).__name__,
            },
        )

        extracted = []

    if isinstance(
        extracted,
        list,
    ):

        for item in extracted:

            if not isinstance(
                item,
                dict,
            ):
                continue

            raw = item.get(
                "raw"
            )

            if not raw:
                continue

            resolved = (
                item.get(
                    "resolved"
                )
                or None
            )

            resolution_status = (
                item.get(
                    "resolutionStatus"
                )
                or (
                    "platform_expanded"
                    if resolved
                    else "unresolved"
                )
            )

            url_item = _url_object(
                raw,
                resolved=resolved,
                resolution_status=resolution_status,
            )

            if url_item is not None:
                urls.append(url_item)

    # ------------------------------------------------------------------------
    # Deduplicate
    # ------------------------------------------------------------------------

    result = []
    seen = set()

    for item in urls:

        raw = item.get(
            "raw"
        )

        if not raw:
            continue

        key = _url_dedupe_key(
            raw
        )

        if key in seen:
            continue

        seen.add(key)
        result.append(item)

    return result


# ============================================================================
# Media extraction
# ============================================================================

def _extract_telegram_attachments(msg):
    """
    Extract genuine Telegram media metadata.

    Telegram media objects do not inherently expose a public HTTP URL.

    Therefore:

        url = None

    is intentional.
    """

    media = getattr(
        msg,
        "media",
        None,
    )

    if media is None:
        return []

    attachments = []

    # ------------------------------------------------------------------------
    # Photo
    # ------------------------------------------------------------------------

    if isinstance(
        media,
        MessageMediaPhoto,
    ):

        photo = getattr(
            media,
            "photo",
            None,
        )

        if photo is None:
            return []

        media_id = getattr(
            photo,
            "id",
            None,
        )

        if media_id is None:
            return []

        attachments.append({
            "type": "photo",
            "url": None,
            "mediaId": str(media_id),
            "order": 1,
            "altText": None,
            "width": None,
            "height": None,
            "durationMillis": None,
        })

        return attachments

    # ------------------------------------------------------------------------
    # Document
    # ------------------------------------------------------------------------

    if isinstance(
        media,
        MessageMediaDocument,
    ):

        document = getattr(
            media,
            "document",
            None,
        )

        if document is None:
            return []

        media_id = getattr(
            document,
            "id",
            None,
        )

        if media_id is None:
            return []

        attributes = (
            getattr(
                document,
                "attributes",
                None,
            )
            or []
        )

        media_type = "document"

        width = None
        height = None
        duration_millis = None

        for attr in attributes:

            class_name = (
                attr.__class__.__name__
            )

            # ------------------------------------------------------------
            # Video
            # ------------------------------------------------------------

            if class_name == "DocumentAttributeVideo":

                media_type = "video"

                width = getattr(
                    attr,
                    "w",
                    None,
                )

                height = getattr(
                    attr,
                    "h",
                    None,
                )

                duration = getattr(
                    attr,
                    "duration",
                    None,
                )

                if duration is not None:

                    try:

                        duration_millis = int(
                            float(duration)
                            * 1000
                        )

                    except (
                        TypeError,
                        ValueError,
                    ):

                        duration_millis = None

                break

            # ------------------------------------------------------------
            # Animation
            # ------------------------------------------------------------

            if class_name == "DocumentAttributeAnimated":

                media_type = "animation"

            # ------------------------------------------------------------
            # Audio
            # ------------------------------------------------------------

            elif class_name == "DocumentAttributeAudio":

                media_type = "audio"

        attachments.append({
            "type": media_type,
            "url": None,
            "mediaId": str(media_id),
            "order": 1,
            "altText": None,
            "width": width,
            "height": height,
            "durationMillis": duration_millis,
        })

    return attachments


# ============================================================================
# Relationships
# ============================================================================

def _extract_reply_id(
    msg,
    peer_kind,
    peer_id,
):
    """
    Resolve Telegram reply relationship.

    Reply IDs are peer-scoped.
    """

    reply_to = getattr(
        msg,
        "reply_to",
        None,
    )

    if reply_to is None:
        return None

    reply_message_id = getattr(
        reply_to,
        "reply_to_msg_id",
        None,
    )

    if reply_message_id is None:
        return None

    return _telegram_message_id(
        peer_kind,
        peer_id,
        reply_message_id,
    )


def _extract_forward_id(msg):
    """
    Resolve a forwarded channel post when Telegram exposes:

        source channel ID
        source message ID
    """

    fwd = getattr(
        msg,
        "fwd_from",
        None,
    )

    if fwd is None:
        return None

    from_id = getattr(
        fwd,
        "from_id",
        None,
    )

    channel_id = getattr(
        from_id,
        "channel_id",
        None,
    )

    channel_post = getattr(
        fwd,
        "channel_post",
        None,
    )

    if (
        channel_id is not None
        and channel_post is not None
    ):

        return _telegram_message_id(
            "channel",
            channel_id,
            channel_post,
        )

    return None


def _extract_forward_peer(msg):
    """
    Preserve forwarding source information when a complete message
    relationship cannot be constructed.
    """

    fwd = getattr(
        msg,
        "fwd_from",
        None,
    )

    if fwd is None:
        return None

    from_id = getattr(
        fwd,
        "from_id",
        None,
    )

    if from_id is None:
        return None

    channel_id = getattr(
        from_id,
        "channel_id",
        None,
    )

    chat_id = getattr(
        from_id,
        "chat_id",
        None,
    )

    user_id = getattr(
        from_id,
        "user_id",
        None,
    )

    if channel_id is not None:

        return {
            "kind": "channel",
            "id": str(channel_id),
        }

    if chat_id is not None:

        return {
            "kind": "chat",
            "id": str(chat_id),
        }

    if user_id is not None:

        return {
            "kind": "user",
            "id": str(user_id),
        }

    return None


# ============================================================================
# Reactions
# ============================================================================

def _extract_reactions(msg):
    """
    Return:

        (total, breakdown)

    or:

        (None, None)

    when Telegram does not expose reaction information.
    """

    reactions = getattr(
        msg,
        "reactions",
        None,
    )

    if reactions is None:
        return None, None

    results = getattr(
        reactions,
        "results",
        None,
    )

    if not results:
        return None, None

    breakdown = []

    for reaction in results:

        count = _optional_int(
            getattr(
                reaction,
                "count",
                None,
            )
        )

        if count is None:
            continue

        reaction_type = getattr(
            reaction,
            "reaction",
            None,
        )

        reaction_name = None

        if reaction_type is not None:

            try:
                reaction_name = str(
                    reaction_type
                )
            except Exception:
                reaction_name = None

        breakdown.append({
            "type": reaction_name,
            "count": count,
        })

    if not breakdown:
        return None, None

    total = sum(
        item["count"]
        for item in breakdown
    )

    return total, breakdown


# ============================================================================
# Language
# ============================================================================

def _is_language_detection_reliable(text):
    """
    Short / hashtag-only content is not reliable input for langdetect.

    Avoid emitting misleading language labels such as:
        #modi #businessskills #dummy -> "et"
        #GanpatiBappaMorya -> "fr"

    This is intentionally conservative because this layer should preserve
    uncertainty rather than manufacture confidence.
    """

    if not isinstance(text, str):
        return False

    stripped = text.strip()

    if not stripped:
        return False

    # Remove hashtags, mentions and URLs from the text used for the
    # reliability decision.
    words = stripped.split()

    lexical_words = []

    for word in words:

        token = word.strip(
            ".,!?;:()[]{}<>\"'`*_-/\\"
        )

        if not token:
            continue

        if token.startswith("#"):
            continue

        if token.startswith("@"):
            continue

        if (
            token.startswith("http://")
            or token.startswith("https://")
            or token.startswith("www.")
        ):
            continue

        lexical_words.append(token)

    # Require enough lexical material to make langdetect meaningful.
    if len(lexical_words) < 3:
        return False

    lexical_text = " ".join(
        lexical_words
    )

    # Extremely short lexical text remains unreliable.
    if len(lexical_text) < 15:
        return False

    return True


def _detect_language_safe(text):
    """
    Language detection must never cause collection failure.

    Detection is skipped for short / hashtag-heavy content because the
    probability returned by langdetect can be misleadingly high.
    """

    if not text:
        return {
            "lang": None,
            "confidence": None,
        }

    if not _is_language_detection_reliable(text):
        return {
            "lang": None,
            "confidence": None,
        }

    try:

        detected = detect_language(
            text
        )

    except Exception as exc:

        logger.debug(
            "telegram_language_detection_failed",
            extra={
                "errorType": type(exc).__name__,
            },
        )

        return {
            "lang": None,
            "confidence": None,
        }

    if not isinstance(
        detected,
        dict,
    ):
        return {
            "lang": None,
            "confidence": None,
        }

    detected_lang = detected.get(
        "lang"
    )

    confidence = detected.get(
        "confidence"
    )

    if detected_lang in {
        None,
        "",
        "unknown",
    }:
        detected_lang = None

    if confidence is not None:

        try:
            confidence = float(
                confidence
            )
        except (
            TypeError,
            ValueError,
        ):
            confidence = None

    return {
        "lang": detected_lang,
        "confidence": confidence,
    }


# ============================================================================
# Telegram client
# ============================================================================

async def get_telegram_client() -> TelegramClient:
    """
    Return one process-local Telethon client.

    The lock prevents concurrent requests from creating multiple clients
    against the same SQLite session file.
    """

    global _tg_client

    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        raise ValueError(
            "TELEGRAM_API_ID or TELEGRAM_API_HASH not configured."
        )

    # ------------------------------------------------------------------------
    # Reuse existing connected client
    # ------------------------------------------------------------------------

    if _tg_client is not None:

        try:

            if _tg_client.is_connected():
                return _tg_client

        except Exception:
            pass

    # ------------------------------------------------------------------------
    # Serialize initialization
    # ------------------------------------------------------------------------

    async with _tg_client_lock:

        if _tg_client is not None:

            try:

                if _tg_client.is_connected():
                    return _tg_client

            except Exception:
                pass

        client = TelegramClient(
            SESSION_FILE,
            int(TELEGRAM_API_ID),
            TELEGRAM_API_HASH,
        )

        try:

            await client.connect()

            if not await client.is_user_authorized():

                await client.disconnect()

                raise ValueError(
                    "Telegram client is not authorized. "
                    "Please run auth_telegram.py to login."
                )

            _tg_client = client

            logger.info(
                "telegram_client_initialized"
            )

            return _tg_client

        except Exception:

            try:
                await client.disconnect()
            except Exception:
                pass

            raise


# ============================================================================
# Telegram search
# ============================================================================

async def fetch_telegram_search(
    keyword: str,
    limit: int = _DEFAULT_LIMIT,
) -> dict:

    limit = _safe_limit(
        limit,
        default=_DEFAULT_LIMIT,
        maximum=_MAX_LIMIT,
    )

    keyword = (
        str(keyword).strip()
        if keyword is not None
        else ""
    )

    if not keyword:

        return {
            "status": "success_empty",
            "events": [],
            "pagination": {
                "requestedLimit": limit,
                "primaryResultsReturned": 0,
                "relationshipRecordsCollected": 0,
                "recordsCollected": 0,
                "pagesFetched": 0,
                "hasMore": False,
                "stoppedBecause": "empty_query",
            },
        }

    # ------------------------------------------------------------------------
    # Explicit search mode
    # ------------------------------------------------------------------------

    is_hashtag = keyword.startswith("#")

    hashtag_value = (
        keyword[1:].strip()
        if is_hashtag
        else None
    )

    query_value = (
        None
        if is_hashtag
        else keyword
    )

    # A bare "#" is not a valid hashtag search.
    if is_hashtag and not hashtag_value:

        return {
            "status": "success_empty",
            "events": [],
            "pagination": {
                "requestedLimit": limit,
                "primaryResultsReturned": 0,
                "relationshipRecordsCollected": 0,
                "recordsCollected": 0,
                "pagesFetched": 0,
                "hasMore": False,
                "stoppedBecause": "empty_hashtag",
            },
        }

    # ------------------------------------------------------------------------
    # Configuration / authorization
    # ------------------------------------------------------------------------

    try:

        client = await get_telegram_client()

    except ValueError as exc:

        logger.error(
            "telegram_configuration_error",
            extra={
                "errorType": type(exc).__name__,
                "error": str(exc),
            },
        )

        return {
            "status": "unavailable",

            "error": {
                "type": "configuration",
                "message": str(exc),
                "retryAfter": None,
            },

            "events": [],

            "pagination": {
                "requestedLimit": limit,
                "primaryResultsReturned": 0,
                "relationshipRecordsCollected": 0,
                "recordsCollected": 0,
                "pagesFetched": 0,
                "hasMore": None,
                "stoppedBecause": "configuration_error",
            },
        }

    # ------------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------------

    try:

        events = []
        seen_event_ids = set()

        pages_fetched = 0

        offset_rate = 0
        offset_peer = InputPeerEmpty()
        offset_id = 0

        while len(events) < limit:

            remaining = (
                limit - len(events)
            )

            batch_size = min(
                100,
                remaining,
            )

            # ------------------------------------------------------------
            # Explicit Telegram search mode
            # ------------------------------------------------------------

            search_request = SearchPostsRequest(
                hashtag=hashtag_value,
                query=query_value,
                offset_rate=offset_rate,
                offset_peer=offset_peer,
                offset_id=offset_id,
                limit=batch_size,
            )

            result = await client(
                search_request
            )

            pages_fetched += 1

            messages = (
                getattr(
                    result,
                    "messages",
                    None,
                )
                or []
            )

            if not messages:

                stopped_because = (
                    "no_more_results"
                )

                break

            chats = (
                getattr(
                    result,
                    "chats",
                    None,
                )
                or []
            )

            chats_dict = {
                chat.id: chat
                for chat in chats
                if isinstance(
                    chat,
                    Channel,
                )
            }

            for msg in messages:

                if not isinstance(
                    msg,
                    Message,
                ):
                    continue

                # ------------------------------------------------------------
                # Peer
                # ------------------------------------------------------------

                peer_info = _get_peer_info(
                    msg,
                    chats_dict,
                )

                if peer_info is None:

                    logger.debug(
                        "telegram_message_peer_unavailable",
                        extra={
                            "messageId": getattr(
                                msg,
                                "id",
                                None,
                            ),
                        },
                    )

                    continue

                peer_kind = peer_info[
                    "kind"
                ]

                peer_id = peer_info[
                    "id"
                ]

                event_id = _telegram_message_id(
                    peer_kind,
                    peer_id,
                    getattr(
                        msg,
                        "id",
                        None,
                    ),
                )

                if event_id is None:
                    continue

                # ------------------------------------------------------------
                # Deduplication
                # ------------------------------------------------------------

                if event_id in seen_event_ids:
                    continue

                seen_event_ids.add(
                    event_id
                )

                # ------------------------------------------------------------
                # Text
                # ------------------------------------------------------------

                raw_text = getattr(
                    msg,
                    "message",
                    None,
                )

                text = (
                    str(raw_text)
                    if raw_text is not None
                    else None
                )

                text_for_processing = (
                    text or ""
                )

                # ------------------------------------------------------------
                # Language
                # ------------------------------------------------------------

                detected = (
                    _detect_language_safe(
                        text_for_processing
                    )
                )

                # ------------------------------------------------------------
                # URLs
                # ------------------------------------------------------------

                urls = _extract_message_urls(
                    msg,
                    text_for_processing,
                )

                # ------------------------------------------------------------
                # Hashtags / mentions
                # ------------------------------------------------------------

                try:

                    hashtags = extract_hashtags(
                        text_for_processing
                    )

                except Exception as exc:

                    logger.debug(
                        "telegram_hashtag_extraction_failed",
                        extra={
                            "errorType": type(exc).__name__,
                        },
                    )

                    hashtags = []

                try:

                    mentions = extract_mentions(
                        text_for_processing
                    )

                except Exception as exc:

                    logger.debug(
                        "telegram_mention_extraction_failed",
                        extra={
                            "errorType": type(exc).__name__,
                        },
                    )

                    mentions = []

                # ------------------------------------------------------------
                # Engagement
                # ------------------------------------------------------------

                views = _optional_int(
                    getattr(
                        msg,
                        "views",
                        None,
                    )
                )

                forwards = _optional_int(
                    getattr(
                        msg,
                        "forwards",
                        None,
                    )
                )

                replies_count = None

                replies = getattr(
                    msg,
                    "replies",
                    None,
                )

                if replies is not None:

                    replies_count = _optional_int(
                        getattr(
                            replies,
                            "replies",
                            None,
                        )
                    )

                (
                    reactions_total,
                    reaction_breakdown,
                ) = _extract_reactions(
                    msg
                )

                # ------------------------------------------------------------
                # Media
                # ------------------------------------------------------------

                attachments = (
                    _extract_telegram_attachments(
                        msg
                    )
                )

                # ------------------------------------------------------------
                # Relationships
                # ------------------------------------------------------------

                reply_to_id = (
                    _extract_reply_id(
                        msg,
                        peer_kind,
                        peer_id,
                    )
                )

                forward_of_id = (
                    _extract_forward_id(
                        msg
                    )
                )

                forward_from_peer = (
                    _extract_forward_peer(
                        msg
                    )
                )

                # ------------------------------------------------------------
                # Retrieval relevance
                # ------------------------------------------------------------

                if is_hashtag:

                    requested_hashtag = (
                        hashtag_value.casefold()
                    )

                    matching_hashtags = [
                        tag
                        for tag in hashtags
                        if tag.casefold()
                        == requested_hashtag
                    ]

                    if matching_hashtags:

                        relevance_label = (
                            "lexical"
                        )

                        matched_terms = [
                            f"#{matching_hashtags[0]}"
                        ]

                    else:

                        # Telegram returned this message for the hashtag
                        # search, but the local extractor did not identify
                        # the hashtag. Preserve the event without claiming
                        # an exact lexical match.
                        relevance_label = (
                            "platform_search"
                        )

                        matched_terms = [
                            f"#{hashtag_value}"
                        ]

                else:

                    keyword_lower = (
                        keyword.casefold()
                    )

                    text_lower = (
                        text_for_processing.casefold()
                    )

                    if (
                        keyword_lower
                        and keyword_lower
                        in text_lower
                    ):

                        relevance_label = (
                            "lexical"
                        )

                        matched_terms = [
                            keyword
                        ]

                    else:

                        keyword_terms = [
                            term
                            for term
                            in keyword_lower.split()
                            if term
                        ]

                        partial_match = any(
                            term in text_lower
                            for term in keyword_terms
                        )

                        if partial_match:

                            relevance_label = (
                                "partial_lexical"
                            )

                            matched_terms = [
                                keyword
                            ]

                        else:

                            relevance_label = (
                                "unknown"
                            )

                            matched_terms = []

                # ------------------------------------------------------------
                # Published timestamp
                # ------------------------------------------------------------

                published_at = None

                message_date = getattr(
                    msg,
                    "date",
                    None,
                )

                if message_date is not None:

                    try:

                        published_at = parse_iso(
                            message_date.isoformat()
                        )

                    except Exception:

                        published_at = None

                # ------------------------------------------------------------
                # Edited timestamp
                # ------------------------------------------------------------

                edited_at = None

                edit_date = getattr(
                    msg,
                    "edit_date",
                    None,
                )

                if edit_date is not None:

                    try:

                        edited_at = parse_iso(
                            edit_date.isoformat()
                        )

                    except Exception:

                        edited_at = None

                # ------------------------------------------------------------
                # Author
                # ------------------------------------------------------------

                post_author = getattr(
                    msg,
                    "post_author",
                    None,
                )

                # Telegram channel posts can expose post_author as a
                # display name without exposing an actual user identity.
                #
                # Never infer an individual identity from that value.

                author_id = None
                author_handle = None

                author_name = (
                    str(post_author)
                    if post_author
                    else None
                )

                # ------------------------------------------------------------
                # Content fingerprint
                # ------------------------------------------------------------

                try:

                    content_fingerprint = (
                        fingerprint_text(
                            text_for_processing
                        )
                    )

                except Exception:

                    content_fingerprint = None

                if content_fingerprint == "":
                    content_fingerprint = None

                # ------------------------------------------------------------
                # Canonical event
                # ------------------------------------------------------------

                event = make_canonical_event(

                    event_id=event_id,

                    platform="telegram",

                    platform_post_id=event_id,

                    source_layer=(
                        "telegram_channels_search_posts"
                    ),

                    retrieval_query=keyword,

                    discovered_trend=keyword,

                    observed_at=_utc_now(),

                    text=text,

                    title=None,

                    language=None,

                    detected_lang=(
                        detected.get(
                            "lang"
                        )
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
                        content_fingerprint
                    ),

                    author_id=author_id,

                    author_handle=author_handle,

                    author_name=author_name,

                    author_bio=None,

                    author_location=None,

                    published_at=published_at,

                    edited_at=edited_at,

                    likes=None,

                    replies=replies_count,

                    reposts=None,

                    quotes=None,

                    bookmarks=None,

                    views=views,

                    impressions=None,

                    reply_to_id=reply_to_id,

                    reply_to_author_id=None,

                    quote_of_id=None,

                    forward_of_id=forward_of_id,

                    conversation_id=None,

                    platform_data={

                        "peerKind": peer_kind,

                        "peerId": str(
                            peer_id
                        ),

                        "channelId": (
                            str(
                                peer_info[
                                    "channelId"
                                ]
                            )
                            if peer_info[
                                "channelId"
                            ] is not None
                            else None
                        ),

                        "channelUsername": (
                            peer_info[
                                "username"
                            ]
                        ),

                        "channelTitle": (
                            peer_info[
                                "title"
                            ]
                        ),

                        "forwards": forwards,

                        "reactionsTotal": (
                            reactions_total
                        ),

                        "reactions": (
                            reaction_breakdown
                        ),

                        "forwardFromPeer": (
                            forward_from_peer
                        ),
                    },

                    match_type=relevance_label,

                    matched_terms=matched_terms,
                )

                events.append(
                    event
                )

                if len(events) >= limit:

                    stopped_because = (
                        "limit_reached"
                    )

                    break

            # ----------------------------------------------------------------
            # Requested limit reached
            # ----------------------------------------------------------------

            if len(events) >= limit:
                break

            # ----------------------------------------------------------------
            # Telegram returned fewer results than requested
            # ----------------------------------------------------------------

            if len(messages) < batch_size:

                stopped_because = (
                    "no_more_results"
                )

                break

            # ----------------------------------------------------------------
            # Advance cursor
            # ----------------------------------------------------------------

            last_msg = messages[-1]

            next_offset_id = getattr(
                last_msg,
                "id",
                None,
            )

            if next_offset_id is None:

                stopped_because = (
                    "pagination_cursor_unavailable"
                )

                break

            if next_offset_id == offset_id:

                stopped_because = (
                    "pagination_cursor_stalled"
                )

                break

            offset_id = next_offset_id

            # ----------------------------------------------------------------
            # Rate offset
            # ----------------------------------------------------------------

            next_rate = getattr(
                result,
                "next_rate",
                None,
            )

            if next_rate is not None:

                try:

                    offset_rate = int(
                        next_rate
                    )

                except (
                    TypeError,
                    ValueError,
                ):

                    pass

            # ----------------------------------------------------------------
            # Peer cursor
            # ----------------------------------------------------------------

            last_peer = getattr(
                last_msg,
                "peer_id",
                None,
            )

            last_channel_id = getattr(
                last_peer,
                "channel_id",
                None,
            )

            if (
                last_channel_id is not None
                and last_channel_id in chats_dict
            ):

                chat = chats_dict[
                    last_channel_id
                ]

                access_hash = getattr(
                    chat,
                    "access_hash",
                    None,
                )

                if access_hash is not None:

                    offset_peer = (
                        InputPeerChannel(
                            chat.id,
                            access_hash,
                        )
                    )

                else:

                    offset_peer = (
                        InputPeerEmpty()
                    )

            else:

                offset_peer = (
                    InputPeerEmpty()
                )

        # --------------------------------------------------------------------
        # Final platform result
        # --------------------------------------------------------------------

        records_collected = len(
            events
        )

        status = (
            "success"
            if records_collected > 0
            else "success_empty"
        )

        return {
            "status": status,

            "events": events,

            "pagination": {

                "requestedLimit": limit,

                "primaryResultsReturned": (
                    records_collected
                ),

                "relationshipRecordsCollected": 0,

                "recordsCollected": (
                    records_collected
                ),

                "pagesFetched": pages_fetched,

                # SearchPostsRequest does not give this collector a
                # sufficiently reliable boolean continuation signal.
                "hasMore": None,

                "stoppedBecause": (
                    stopped_because
                ),
            },
        }

    # ------------------------------------------------------------------------
    # Rate limit
    # ------------------------------------------------------------------------

    except FloodWaitError as exc:

        logger.error(
            "telegram_search_rate_limited",
            extra={
                "retryAfter": exc.seconds,
            },
        )

        return {
            "status": "rate_limited",

            "error": {
                "type": "rate_limited",
                "message": (
                    "Telegram search request rate limited"
                ),
                "retryAfter": exc.seconds,
            },

            "events": [],

            "pagination": {

                "requestedLimit": limit,

                "primaryResultsReturned": 0,

                "relationshipRecordsCollected": 0,

                "recordsCollected": 0,

                "pagesFetched": pages_fetched
                if "pages_fetched" in locals()
                else 0,

                "hasMore": None,

                "stoppedBecause": (
                    "rate_limited"
                ),
            },
        }

    # ------------------------------------------------------------------------
    # Generic failure
    # ------------------------------------------------------------------------

    except Exception as exc:

        logger.error(
            "telegram_search_failed",
            extra={
                "errorType": type(exc).__name__,
                "error": str(exc),
            },
        )

        return {
            "status": "error",

            "error": {
                "type": type(exc).__name__,
                "message": (
                    "Telegram search request failed"
                ),
                "retryAfter": None,
            },

            "events": [],

            "pagination": {

                "requestedLimit": limit,

                "primaryResultsReturned": 0,

                "relationshipRecordsCollected": 0,

                "recordsCollected": 0,

                "pagesFetched": (
                    pages_fetched
                    if "pages_fetched" in locals()
                    else 0
                ),

                "hasMore": None,

                "stoppedBecause": (
                    "collection_error"
                ),
            },
        }
