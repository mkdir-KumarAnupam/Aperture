import json
import logging
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone

import redis
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ============================================================
# CONFIG
# ============================================================

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

SCRAPER_API_URL = os.getenv(
    "SCRAPER_API_URL",
    "http://localhost:8000",
).rstrip("/")

UPSTASH_REDIS_URL = os.getenv(
    "UPSTASH_REDIS_URL",
)

TOP_TREND_LIMIT = int(
    os.getenv("TOP_TREND_LIMIT", 10)
)

TREND_REFRESH_INTERVAL = int(
    os.getenv("TREND_REFRESH_INTERVAL", 60)
)

POSTS_PER_TREND = int(
    os.getenv("POSTS_PER_TREND", 30)
)

REDDIT_POSTS_PER_TREND = int(
    os.getenv("REDDIT_POSTS_PER_TREND", 20)
)

TELEGRAM_MESSAGES_PER_TREND = int(
    os.getenv("TELEGRAM_MESSAGES_PER_TREND", 20)
)

AUTHOR_LOOKUP_LIMIT = int(
    os.getenv("AUTHOR_LOOKUP_LIMIT", 5)
)

STREAM_KEY = "scrape:events"

SCHEMA_VERSION = "1.0.0"
COLLECTOR_VERSION = "2.1.0"

SUPPORTED_PLATFORMS = {
    "x",
    "reddit",
    "telegram",
}

_shutdown_requested = False


# ============================================================
# PID LOCK
# ============================================================

_PID_FILE = os.path.join(
    os.path.dirname(__file__),
    "daemon.pid",
)


def _acquire_pid_lock():
    if os.path.exists(_PID_FILE):
        try:
            with open(
                _PID_FILE,
                "r",
                encoding="utf-8",
            ) as file:
                existing_pid = int(
                    file.read().strip()
                )

            try:
                os.kill(existing_pid, 0)

                logging.error(
                    f"Daemon already running "
                    f"(PID {existing_pid})"
                )

                sys.exit(1)

            except ProcessLookupError:
                logging.warning(
                    "Stale PID file found. "
                    "Overwriting."
                )

            except PermissionError:
                logging.error(
                    f"Unable to verify PID "
                    f"{existing_pid}."
                )

                sys.exit(1)

        except (ValueError, OSError):
            logging.warning(
                "Invalid/stale PID file found. "
                "Overwriting."
            )

    with open(
        _PID_FILE,
        "w",
        encoding="utf-8",
    ) as file:
        file.write(str(os.getpid()))

    logging.info(
        f"PID lock acquired: {_PID_FILE} "
        f"(PID {os.getpid()})"
    )


def _release_pid_lock():
    try:
        os.remove(_PID_FILE)
    except FileNotFoundError:
        pass
    except OSError as exc:
        logging.warning(
            f"Could not remove PID file: {exc}"
        )


# ============================================================
# SIGNALS
# ============================================================

def _handle_shutdown(signum, frame):
    global _shutdown_requested

    _shutdown_requested = True

    logging.info(
        f"Shutdown signal received: {signum}"
    )


signal.signal(
    signal.SIGINT,
    _handle_shutdown,
)

signal.signal(
    signal.SIGTERM,
    _handle_shutdown,
)


# ============================================================
# REDIS
# ============================================================

redis_client = None

if UPSTASH_REDIS_URL:
    redis_client = redis.from_url(
        UPSTASH_REDIS_URL,
        decode_responses=True,
    )


def verify_redis():
    if redis_client is None:
        raise RuntimeError(
            "UPSTASH_REDIS_URL is not configured"
        )

    redis_client.ping()

    logging.info(
        "Redis connection verified"
    )


# ============================================================
# TIME
# ============================================================

def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


# ============================================================
# QUERY NORMALIZATION
# ============================================================

def normalize_hashtag(
    value: str,
) -> str:
    """
    Convert a trend label into a hashtag query.

    Examples:
        GaneshChaturthi  -> #GaneshChaturthi
        #GaneshChaturthi -> #GaneshChaturthi

    Existing hashtags are preserved.
    """
    value = value.strip()

    if not value:
        return value

    if value.startswith("#"):
        return value

    return f"#{value}"


def reddit_query(
    value: str,
) -> str:
    """
    Reddit receives the plain trend keyword rather
    than a forced hashtag.
    """
    value = value.strip()

    if value.startswith("#"):
        return value[1:]

    return value


# ============================================================
# HTTP
# ============================================================

http = requests.Session()

http.headers.update({
    "Accept": "application/json",
})

retry_strategy = Retry(
    total=2,
    connect=2,
    read=2,
    status=2,
    backoff_factor=1,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
    respect_retry_after_header=True,
)

http.mount(
    "http://",
    HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=20,
        pool_maxsize=20,
    ),
)

http.mount(
    "https://",
    HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=20,
        pool_maxsize=20,
    ),
)


# ============================================================
# API
# ============================================================

def get_json(
    path: str,
    params: dict,
    timeout: int = 60,
):
    url = (
        SCRAPER_API_URL
        + path
    )

    response = http.get(
        url,
        params=params,
        timeout=timeout,
    )

    response.raise_for_status()

    body = response.json()

    if not isinstance(body, dict):
        raise ValueError(
            f"Expected JSON object from {path}"
        )

    return response.status_code, body


# ============================================================
# CANONICAL ACCESSORS
# ============================================================

def require_schema(
    body: dict,
    source: str,
):
    if body.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(
            f"{source} returned unsupported "
            f"schemaVersion={body.get('schemaVersion')!r}; "
            f"expected {SCHEMA_VERSION!r}"
        )


def platform_block(
    body: dict,
    platform: str,
) -> dict:
    platforms = body.get("platforms")

    if not isinstance(platforms, dict):
        raise ValueError(
            "Canonical `platforms` must be an object"
        )

    block = platforms.get(platform)

    if not isinstance(block, dict):
        raise ValueError(
            f"Missing canonical platforms.{platform}"
        )

    return block


def canonical_events(
    body: dict,
) -> list:
    events = body.get("events")

    if not isinstance(events, list):
        raise ValueError(
            "Canonical `events` must be an array"
        )

    return events


def canonical_author_profiles(
    body: dict,
) -> list:
    profiles = body.get(
        "authorProfiles",
        [],
    )

    if not isinstance(profiles, list):
        raise ValueError(
            "Canonical `authorProfiles` "
            "must be an array"
        )

    return profiles


# ============================================================
# EVENT VALIDATION
# ============================================================

def validate_event_identity(
    event: dict,
):
    if not isinstance(event, dict):
        raise ValueError(
            "Event is not an object"
        )

    for field in (
        "eventId",
        "platform",
        "platformPostId",
    ):
        value = event.get(field)

        if not isinstance(value, str) or not value:
            raise ValueError(
                f"Event missing required "
                f"identity field: {field}"
            )

    platform = event["platform"]

    if platform not in SUPPORTED_PLATFORMS:
        raise ValueError(
            f"Unsupported event platform: "
            f"{platform!r}"
        )

    event_id = event["eventId"]

    if platform == "x":
        if not event_id.startswith("x:"):
            raise ValueError(
                f"Invalid X eventId: {event_id}"
            )

    elif platform == "reddit":
        if not event_id.startswith(("t3_", "t1_")):
            raise ValueError(
                f"Invalid Reddit eventId: {event_id}"
            )

    elif platform == "telegram":
        parts = event_id.split(":")

        if (
            len(parts) != 4
            or parts[0] != "telegram"
        ):
            raise ValueError(
                f"Invalid Telegram eventId: "
                f"{event_id}"
            )


def validate_events(
    events: list,
):
    seen_ids = set()

    for event in events:
        validate_event_identity(event)

        event_id = event["eventId"]

        if event_id in seen_ids:
            raise ValueError(
                f"Duplicate eventId in "
                f"collection: {event_id}"
            )

        seen_ids.add(event_id)


# ============================================================
# PROFILE VALIDATION
# ============================================================

def validate_profiles(
    profiles: list,
):
    seen_ids = set()

    for profile in profiles:
        if not isinstance(profile, dict):
            raise ValueError(
                "Author profile is not an object"
            )

        author_id = profile.get("authorId")

        if author_id is not None:
            if not isinstance(author_id, str):
                raise ValueError(
                    "authorId must be a string or null"
                )

            if author_id in seen_ids:
                continue

            seen_ids.add(author_id)


# ============================================================
# PLATFORM BLOCK VALIDATION
# ============================================================

def validate_platform_block(
    platform: str,
    block: dict,
    event_count: int,
):
    if not isinstance(block, dict):
        raise ValueError(
            f"{platform} platform block "
            "must be an object"
        )

    status = block.get("status")

    if status not in (
        "success",
        "success_with_results",
        "success_empty",
        "error",
        "rate_limited",
    ):
        raise ValueError(
            f"{platform} returned invalid "
            f"status={status!r}"
        )

    pagination = block.get("pagination")

    if not isinstance(pagination, dict):
        raise ValueError(
            f"{platform}.pagination "
            "must be an object"
        )

    records_collected = pagination.get(
        "recordsCollected"
    )

    if records_collected != event_count:
        raise ValueError(
            f"{platform}.pagination.recordsCollected "
            f"={records_collected} but received "
            f"{event_count} events"
        )


# ============================================================
# PLATFORM FAILURE BLOCK
# ============================================================

def _failure_block(
    platform: str,
    params: dict,
    status: str,
    code: str,
    message: str,
    retryable,
):
    requested_limit = params.get("limit")

    if requested_limit is None:
        requested_limit = params.get("count")

    return {
        "status": status,

        "pagination": {
            "requestedLimit": requested_limit,
            "primaryResultsReturned": 0,
            "relationshipRecordsCollected": 0,
            "recordsCollected": 0,
            "pagesFetched": 0,
            "hasMore": None,
            "stoppedBecause": (
                "rate_limited"
                if status == "rate_limited"
                else "platform_error"
            ),
        },

        "diagnostics": {
            "code": code,
            "message": message,
            "retryable": retryable,
        },
    }


# ============================================================
# PLATFORM COLLECTION
# ============================================================

def collect_platform_events(
    platform: str,
    path: str,
    params: dict,
):
    try:
        _, body = get_json(
            path,
            params,
            timeout=60,
        )

        require_schema(
            body,
            platform,
        )

        events = canonical_events(body)

        profiles = canonical_author_profiles(body)

        block = platform_block(
            body,
            platform,
        )

        validate_events(events)

        validate_profiles(profiles)

        validate_platform_block(
            platform,
            block,
            len(events),
        )

        return (
            events,
            profiles,
            block,
            body,
        )

    except requests.HTTPError as exc:
        status_code = (
            exc.response.status_code
            if exc.response is not None
            else None
        )

        if status_code == 429:
            status = "rate_limited"
            code = "RATE_LIMITED"
            retryable = True

        elif (
            status_code is not None
            and status_code >= 500
        ):
            status = "error"
            code = "HTTP_ERROR"
            retryable = True

        else:
            status = "error"
            code = "HTTP_ERROR"
            retryable = False

        message = (
            f"{platform} scraper API "
            f"returned HTTP {status_code}"
        )

        logging.error(
            f"{platform} collection failed: "
            f"HTTP {status_code}"
        )

        return (
            [],
            [],
            _failure_block(
                platform=platform,
                params=params,
                status=status,
                code=code,
                message=message,
                retryable=retryable,
            ),
            None,
        )

    except requests.RequestException as exc:
        logging.error(
            f"{platform} collection failed: "
            f"{type(exc).__name__}: {exc}"
        )

        return (
            [],
            [],
            _failure_block(
                platform=platform,
                params=params,
                status="error",
                code=type(exc).__name__.upper(),
                message=(
                    f"{platform} scraper API "
                    "request failed"
                ),
                retryable=True,
            ),
            None,
        )

    except Exception as exc:
        logging.error(
            f"{platform} collection failed: "
            f"{type(exc).__name__}: {exc}"
        )

        return (
            [],
            [],
            _failure_block(
                platform=platform,
                params=params,
                status="error",
                code=type(exc).__name__.upper(),
                message=(
                    f"{platform} collection "
                    "processing failed"
                ),
                retryable=None,
            ),
            None,
        )


# ============================================================
# AUTHOR PROFILE ENRICHMENT
# ============================================================

def collect_author_profiles(
    events: list,
):
    if AUTHOR_LOOKUP_LIMIT <= 0:
        return []

    profiles = []

    x_handles = []
    reddit_handles = []

    for event in events:
        if not isinstance(event, dict):
            continue

        platform = event.get("platform")
        author = event.get("author")

        if not isinstance(author, dict):
            continue

        handle = author.get("authorHandle")

        if not handle:
            continue

        if platform == "x":
            if handle not in x_handles:
                x_handles.append(handle)

        elif platform == "reddit":
            if handle not in reddit_handles:
                reddit_handles.append(handle)

    x_handles = x_handles[
        :AUTHOR_LOOKUP_LIMIT
    ]

    reddit_handles = reddit_handles[
        :AUTHOR_LOOKUP_LIMIT
    ]

    # --------------------------------------------------------
    # X
    # --------------------------------------------------------

    for handle in x_handles:
        try:
            _, body = get_json(
                "/scrape/x/author",
                {"handle": handle},
                timeout=15,
            )

            require_schema(
                body,
                f"X author {handle}",
            )

            author_profiles = canonical_author_profiles(
                body
            )

            validate_profiles(author_profiles)

            profiles.extend(author_profiles)

        except Exception as exc:
            logging.warning(
                f"X author lookup failed "
                f"for {handle}: "
                f"{type(exc).__name__}: {exc}"
            )

    # --------------------------------------------------------
    # Reddit
    # --------------------------------------------------------

    for handle in reddit_handles:
        try:
            _, body = get_json(
                "/scrape/reddit/author",
                {"handle": handle},
                timeout=15,
            )

            require_schema(
                body,
                f"Reddit author {handle}",
            )

            author_profiles = canonical_author_profiles(
                body
            )

            validate_profiles(author_profiles)

            profiles.extend(author_profiles)

        except Exception as exc:
            logging.warning(
                f"Reddit author lookup failed "
                f"for {handle}: "
                f"{type(exc).__name__}: {exc}"
            )

    return profiles


# ============================================================
# PROFILE MERGE
# ============================================================

def merge_profiles(
    *profile_lists,
):
    result = []
    seen = set()

    for profile_list in profile_lists:
        if not isinstance(profile_list, list):
            continue

        for profile in profile_list:
            if not isinstance(profile, dict):
                continue

            profile_id = profile.get(
                "authorId"
            )

            if not profile_id:
                result.append(profile)
                continue

            if profile_id in seen:
                continue

            seen.add(profile_id)
            result.append(profile)

    return result


# ============================================================
# QUALITY
# ============================================================

def build_quality_errors(
    platform_blocks: dict,
):
    errors = []

    for platform, block in platform_blocks.items():
        if not isinstance(block, dict):
            continue

        status = block.get("status")

        if status not in (
            "error",
            "rate_limited",
        ):
            continue

        diagnostics = block.get(
            "diagnostics"
        )

        if isinstance(diagnostics, dict):
            errors.append({
                "platform": platform,
                "code": diagnostics.get(
                    "code",
                    "PLATFORM_ERROR",
                ),
                "message": diagnostics.get(
                    "message",
                    f"{platform} collection failed",
                ),
                "retryable": diagnostics.get(
                    "retryable"
                ),
            })

        else:
            errors.append({
                "platform": platform,
                "code": "PLATFORM_ERROR",
                "message": (
                    f"{platform} collection failed"
                ),
                "retryable": None,
            })

    return errors


# ============================================================
# TREND COLLECTION
# ============================================================

def fetch_trends():
    try:
        _, body = get_json(
            "/scrape/x/trends",
            {},
            timeout=30,
        )

        require_schema(
            body,
            "X trends",
        )

        block = platform_block(
            body,
            "x",
        )

        trends = block.get("trends")

        if not isinstance(trends, list):
            raise ValueError(
                "platforms.x.trends "
                "must be an array"
            )

        return trends

    except Exception as exc:
        logging.error(
            f"Failed to fetch X trends: "
            f"{type(exc).__name__}: {exc}"
        )

        return []


# ============================================================
# COLLECTION BUILDER
# ============================================================

def build_collection(
    *,
    collection_id: str,
    started_at: str,
    completed_at: str,
    trend_obj: dict,
    events: list,
    author_profiles: list,
    platform_blocks: dict,
):
    target_label = trend_obj.get("label")

    trend_rank = trend_obj.get("rank")

    provider_volume = trend_obj.get("volume")

    discovered_at = (
        trend_obj.get("observedAt")
        or started_at
    )

    return {
        "schemaVersion": SCHEMA_VERSION,

        "collection": {
            "collectionId": collection_id,
            "platformsRequested": [
                "x",
                "reddit",
                "telegram",
            ],
            "startedAt": started_at,
            "completedAt": completed_at,
        },

        "trend": {
            "trendId": (
                f"trend:{target_label}"
                if target_label
                else None
            ),
            "label": target_label,
            "query": target_label,
            "rank": trend_rank,
            "volume": provider_volume,
            "volumeSource": (
                "x"
                if provider_volume is not None
                else None
            ),
            "discoveredAt": discovered_at,
        },

        "platforms": platform_blocks,

        "events": events,

        "authorProfiles": author_profiles,

        "communities": [],

        "quality": {
            "recordsCollected": len(events),
            "warnings": [],
            "errors": build_quality_errors(
                platform_blocks
            ),
        },
    }


# ============================================================
# COMPLETE PAYLOAD VALIDATION
# ============================================================

def validate_payload(
    payload: dict,
):
    from app.processing.validator import (
        validate_collection,
    )

    if not isinstance(payload, dict):
        raise ValueError(
            "Collection payload must be an object"
        )

    validated = validate_collection(
        payload
    )

    if not isinstance(validated, dict):
        raise ValueError(
            "Validator did not return "
            "a JSON object"
        )

    if validated.get(
        "schemaVersion"
    ) != SCHEMA_VERSION:
        raise ValueError(
            "Validator changed/removed "
            "schemaVersion"
        )

    # --------------------------------------------------------
    # Required top-level structure
    # --------------------------------------------------------

    required = (
        "schemaVersion",
        "collection",
        "trend",
        "platforms",
        "events",
        "authorProfiles",
        "communities",
        "quality",
    )

    for field in required:
        if field not in validated:
            raise ValueError(
                f"Missing canonical field: {field}"
            )

    if "payload" in validated:
        raise ValueError(
            "Canonical payload must not contain "
            "a top-level `payload` wrapper"
        )

    # --------------------------------------------------------
    # Events
    # --------------------------------------------------------

    events = validated.get("events")

    if not isinstance(events, list):
        raise ValueError(
            "Canonical events must be an array"
        )

    validate_events(events)

    # --------------------------------------------------------
    # Profiles
    # --------------------------------------------------------

    profiles = validated.get(
        "authorProfiles"
    )

    if not isinstance(profiles, list):
        raise ValueError(
            "Canonical authorProfiles "
            "must be an array"
        )

    validate_profiles(profiles)

    # --------------------------------------------------------
    # Communities
    # --------------------------------------------------------

    communities = validated.get(
        "communities"
    )

    if not isinstance(communities, list):
        raise ValueError(
            "Canonical communities "
            "must be an array"
        )

    # --------------------------------------------------------
    # Platforms
    # --------------------------------------------------------

    platforms = validated.get(
        "platforms"
    )

    if not isinstance(platforms, dict):
        raise ValueError(
            "Canonical platforms "
            "must be an object"
        )

    for platform in SUPPORTED_PLATFORMS:
        if platform not in platforms:
            raise ValueError(
                f"Missing platform block: {platform}"
            )

        validate_platform_block(
            platform,
            platforms[platform],
            sum(
                1
                for event in events
                if event.get("platform") == platform
            ),
        )

    # --------------------------------------------------------
    # Quality
    # --------------------------------------------------------

    quality = validated.get("quality")

    if not isinstance(quality, dict):
        raise ValueError(
            "Canonical quality "
            "must be an object"
        )

    if quality.get(
        "recordsCollected"
    ) != len(events):
        raise ValueError(
            "quality.recordsCollected "
            "does not equal events count"
        )

    return validated


# ============================================================
# REDIS PUBLISH
# ============================================================

def publish_collection(
    payload: dict,
):
    if redis_client is None:
        raise RuntimeError(
            "Redis client is not configured"
        )

    payload = validate_payload(payload)

    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    redis_id = redis_client.xadd(
        STREAM_KEY,
        {
            "data": serialized,
        },
    )

    return redis_id


# ============================================================
# ONE TREND
# ============================================================

def collect_one_trend(
    trend_obj: dict,
):
    if not isinstance(
        trend_obj,
        dict,
    ):
        raise ValueError(
            "Trend must be an object"
        )

    target_label = trend_obj.get("label")

    if not isinstance(
        target_label,
        str,
    ) or not target_label.strip():
        raise ValueError(
            "Trend has no valid label"
        )

    target_label = target_label.strip()

    # --------------------------------------------------------
    # Platform-specific query forms
    # --------------------------------------------------------

    x_query = normalize_hashtag(
        target_label
    )

    telegram_query = normalize_hashtag(
        target_label
    )

    reddit_search_query = reddit_query(
        target_label
    )

    logging.info(
        f"Trend queries: "
        f"X={x_query!r}, "
        f"Reddit={reddit_search_query!r}, "
        f"Telegram={telegram_query!r}"
    )

    collection_id = str(uuid.uuid4())

    started_at = utc_now()

    logging.info(
        f"Starting collection "
        f"{collection_id} "
        f"for trend={target_label}"
    )

    # --------------------------------------------------------
    # X
    # --------------------------------------------------------

    (
        x_events,
        x_profiles,
        x_block,
        _,
    ) = collect_platform_events(
        platform="x",
        path="/scrape/x/tweets",
        params={
            "keyword": x_query,
            "limit": POSTS_PER_TREND,
        },
    )

    logging.info(
        f"{target_label}: "
        f"X events={len(x_events)}"
    )

    # --------------------------------------------------------
    # REDDIT
    # --------------------------------------------------------

    (
        reddit_events,
        reddit_profiles,
        reddit_block,
        _,
    ) = collect_platform_events(
        platform="reddit",
        path="/scrape/reddit/search",
        params={
            "keyword": reddit_search_query,
            "limit": REDDIT_POSTS_PER_TREND,
        },
    )

    logging.info(
        f"{target_label}: "
        f"Reddit events={len(reddit_events)}"
    )

    # --------------------------------------------------------
    # TELEGRAM
    # --------------------------------------------------------

    (
        telegram_events,
        telegram_profiles,
        telegram_block,
        _,
    ) = collect_platform_events(
        platform="telegram",
        path="/scrape/telegram/search",
        params={
            "keyword": telegram_query,
            "limit": TELEGRAM_MESSAGES_PER_TREND,
        },
    )

    logging.info(
        f"{target_label}: "
        f"Telegram events={len(telegram_events)}"
    )

    # --------------------------------------------------------
    # COMBINE
    # --------------------------------------------------------

    events = (
        x_events
        + reddit_events
        + telegram_events
    )

    expected_event_count = (
        len(x_events)
        + len(reddit_events)
        + len(telegram_events)
    )

    if len(events) != expected_event_count:
        raise RuntimeError(
            "Event conservation failed "
            "before collection build"
        )

    validate_events(events)

    # --------------------------------------------------------
    # PROFILES
    # --------------------------------------------------------

    author_profiles = merge_profiles(
        x_profiles,
        reddit_profiles,
        telegram_profiles,
    )

    if AUTHOR_LOOKUP_LIMIT > 0:
        try:
            enriched_profiles = (
                collect_author_profiles(events)
            )

            author_profiles = merge_profiles(
                author_profiles,
                enriched_profiles,
            )

        except Exception as exc:
            logging.warning(
                f"Author enrichment failed "
                f"for {target_label}: "
                f"{type(exc).__name__}: {exc}"
            )

    validate_profiles(author_profiles)

    # --------------------------------------------------------
    # PLATFORM BLOCKS
    # --------------------------------------------------------

    platform_blocks = {
        "x": x_block,
        "reddit": reddit_block,
        "telegram": telegram_block,
    }

    # --------------------------------------------------------
    # BUILD
    # --------------------------------------------------------

    completed_at = utc_now()

    payload = build_collection(
        collection_id=collection_id,
        started_at=started_at,
        completed_at=completed_at,
        trend_obj=trend_obj,
        events=events,
        author_profiles=author_profiles,
        platform_blocks=platform_blocks,
    )

    # --------------------------------------------------------
    # VALIDATE
    # --------------------------------------------------------

    payload = validate_payload(payload)

    # --------------------------------------------------------
    # FINAL CONSERVATION
    # --------------------------------------------------------

    if len(payload["events"]) != expected_event_count:
        raise RuntimeError(
            "Event conservation failed "
            "after validation"
        )

    # --------------------------------------------------------
    # PUBLISH
    # --------------------------------------------------------

    redis_id = publish_collection(
        payload
    )

    logging.info(
        f"Published collection "
        f"{collection_id}: "
        f"redisId={redis_id}, "
        f"trend={target_label}, "
        f"events={len(payload['events'])}"
    )

    return redis_id


# ============================================================
# DAEMON
# ============================================================

def run_daemon():
    if redis_client is None:
        logging.error(
            "No UPSTASH_REDIS_URL found. Exiting."
        )
        return

    verify_redis()

    logging.info(
        "Starting Continuous Scraper Daemon"
    )

    logging.info(
        f"Scraper API: {SCRAPER_API_URL}"
    )

    logging.info(
        f"Redis Stream: {STREAM_KEY}"
    )

    logging.info(
        f"Schema Version: {SCHEMA_VERSION}"
    )

    logging.info(
        f"Collector Version: {COLLECTOR_VERSION}"
    )

    logging.info(
        f"Top trends: {TOP_TREND_LIMIT}"
    )

    logging.info(
        f"X posts/trend: {POSTS_PER_TREND}"
    )

    logging.info(
        f"Reddit posts/trend: "
        f"{REDDIT_POSTS_PER_TREND}"
    )

    logging.info(
        f"Telegram messages/trend: "
        f"{TELEGRAM_MESSAGES_PER_TREND}"
    )

    while not _shutdown_requested:

        cycle_started = time.monotonic()

        try:
            # =================================================
            # FETCH TRENDS
            # =================================================

            logging.info(
                f"Fetching top "
                f"{TOP_TREND_LIMIT} X trends..."
            )

            trends = fetch_trends()

            if not trends:
                logging.warning(
                    "No canonical X trends returned. "
                    f"Retrying in "
                    f"{TREND_REFRESH_INTERVAL}s."
                )

                for _ in range(
                    TREND_REFRESH_INTERVAL
                ):
                    if _shutdown_requested:
                        break
                    time.sleep(1)

                continue

            # =================================================
            # DEDUPLICATE TRENDS
            # =================================================

            unique_trends = []
            seen = set()

            for trend in trends:
                if not isinstance(
                    trend,
                    dict,
                ):
                    continue

                label = trend.get("label")

                if not isinstance(
                    label,
                    str,
                ) or not label.strip():
                    continue

                label = label.strip()

                key = label.casefold()

                if key in seen:
                    continue

                seen.add(key)

                normalized_trend = dict(trend)
                normalized_trend["label"] = label

                unique_trends.append(
                    normalized_trend
                )

                if len(unique_trends) >= TOP_TREND_LIMIT:
                    break

            logging.info(
                f"Selected "
                f"{len(unique_trends)} "
                f"unique trends"
            )

            if not unique_trends:
                logging.warning(
                    "No usable trends after "
                    "deduplication."
                )

                elapsed = (
                    time.monotonic()
                    - cycle_started
                )

                sleep_for = max(
                    0,
                    TREND_REFRESH_INTERVAL
                    - elapsed,
                )

                for _ in range(
                    int(sleep_for)
                ):
                    if _shutdown_requested:
                        break
                    time.sleep(1)

                continue

            # =================================================
            # COLLECT ALL TRENDS
            # =================================================

            for index, trend_obj in enumerate(
                unique_trends,
                start=1,
            ):
                if _shutdown_requested:
                    break

                label = trend_obj["label"]

                logging.info(
                    f"Processing trend "
                    f"[{index}/"
                    f"{len(unique_trends)}] "
                    f"{label}"
                )

                try:
                    collect_one_trend(
                        trend_obj
                    )

                except Exception as exc:
                    logging.exception(
                        f"Trend collection failed "
                        f"for {label}: {exc}"
                    )

            # =================================================
            # REFRESH INTERVAL
            # =================================================

            if _shutdown_requested:
                break

            elapsed = (
                time.monotonic()
                - cycle_started
            )

            sleep_for = max(
                0,
                TREND_REFRESH_INTERVAL
                - elapsed,
            )

            logging.info(
                f"Collection cycle complete. "
                f"Elapsed={elapsed:.1f}s. "
                f"Next trend refresh in "
                f"{sleep_for:.1f}s."
            )

            for _ in range(
                int(sleep_for)
            ):
                if _shutdown_requested:
                    break
                time.sleep(1)

        except KeyboardInterrupt:
            break

        except Exception as exc:
            logging.exception(
                f"Daemon cycle failed: {exc}"
            )

            for _ in range(
                TREND_REFRESH_INTERVAL
            ):
                if _shutdown_requested:
                    break
                time.sleep(1)

    logging.info(
        "Continuous Scraper Daemon stopped."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    _acquire_pid_lock()

    try:
        run_daemon()

    finally:
        _release_pid_lock()
