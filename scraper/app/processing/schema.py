import datetime
from email.utils import parsedate_to_datetime

SCHEMA_VERSION = "1.0.0"


def normalize_string(s):
    if s is None:
        return None

    s = str(s).strip()

    return s if s else None


def parse_twitter_date(date_str: str) -> str:
    try:
        return datetime.datetime.strptime(
            date_str,
            "%a %b %d %H:%M:%S %z %Y",
        ).isoformat()

    except Exception:

        try:
            return parsedate_to_datetime(
                date_str
            ).isoformat()

        except Exception:
            return date_str


def parse_reddit_date(
    utc_timestamp: float | int | None,
) -> str | None:

    if (
        utc_timestamp is None
        or utc_timestamp is False
        or utc_timestamp == 0
    ):
        return None

    try:
        return datetime.datetime.fromtimestamp(
            utc_timestamp,
            tz=datetime.timezone.utc,
        ).isoformat()

    except Exception:
        return None


def parse_iso(
    date_str: str | None,
) -> str | None:

    if not date_str:
        return None

    try:
        parsed = datetime.datetime.fromisoformat(
            date_str.replace("Z", "+00:00")
        )

    except ValueError:
        return None

    if parsed.tzinfo is None:
        return None

    return (
        parsed
        .astimezone(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def make_canonical_event(
    event_id: str,
    platform: str,
    platform_post_id: str,

    source_layer: str,
    retrieval_query: str,
    discovered_trend: str,
    observed_at: str,

    text: str,
    title: str | None,
    language: str | None,
    detected_lang: str | None,
    language_detection_confidence: float | None,
    hashtags: list,
    mentions: list,
    urls: list,
    attachments: list | None,
    content_fingerprint: str,

    author_id: str | None,
    author_handle: str | None,
    author_name: str | None,
    author_bio: str | None,
    author_location: str | None,

    published_at: str | None,
    edited_at: str | None,

    likes: int | None,
    replies: int | None,
    reposts: int | None,
    quotes: int | None,
    bookmarks: int | None,
    views: int | None,
    impressions: int | None,

    reply_to_id: str | None,
    reply_to_author_id: str | None,
    quote_of_id: str | None,
    forward_of_id: str | None,
    conversation_id: str | None,

    platform_data: dict,

    match_type: str,
    matched_terms: list,
    crosspost_of_id: str | None = None,
) -> dict:

    return {
        "eventId": event_id,
        "platform": platform,
        "platformPostId": platform_post_id,

        "source": {
            "sourceLayer": source_layer,
            "retrievalQuery": retrieval_query,
            "discoveredTrend": discovered_trend,
            "observedAt": observed_at,
            "collectedAt": (
                datetime.datetime.now(
                    datetime.timezone.utc
                )
                .strftime("%Y-%m-%dT%H:%M:%SZ")
            ),
            "collectorVersion": "2.1.0",
        },

        "content": {
            "text": text,
            "title": normalize_string(title),
            "language": normalize_string(language),
            "detectedLang": normalize_string(
                detected_lang
            ),
            "languageDetectionConfidence": (
                language_detection_confidence
            ),
            "hashtags": hashtags,
            "mentions": mentions,
            "urls": urls,
            "attachments": (
                attachments
                if attachments is not None
                else []
            ),
            "contentFingerprint": (
                content_fingerprint
            ),
        },

        "author": {
            "authorId": author_id,
            "authorHandle": normalize_string(
                author_handle
            ),
            "authorName": normalize_string(
                author_name
            ),
            "authorBio": normalize_string(
                author_bio
            ),
            "authorLocation": normalize_string(
                author_location
            ),
        },

        "time": {
            "publishedAt": published_at,
            "observedAt": observed_at,
            "editedAt": edited_at,
        },

        "engagement": {
            "likes": likes,
            "replies": replies,
            "reposts": reposts,
            "quotes": quotes,
            "bookmarks": bookmarks,
            "views": views,
            "impressions": impressions,
        },

        "relationships": {
            "replyToId": reply_to_id,
            "replyToAuthorId": reply_to_author_id,
            "quoteOfId": quote_of_id,
            "forwardOfId": forward_of_id,
            "conversationId": conversation_id,
            "crosspostOfId": crosspost_of_id,
        },

        "platformData": platform_data,

        "retrieval": {
            "matchType": match_type,
            "matchedTerms": matched_terms,
        },
    }
