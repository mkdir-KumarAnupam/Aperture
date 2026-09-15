"""
Aperture Social Scraper API.

The only FastAPI entry point.

Responsibilities:
    - HTTP routes
    - request validation
    - HTTP-level error mapping
    - canonical collection envelopes

Platform scraping and normalization live in:
    app/clients/x.py
    app/clients/reddit.py
    app/clients/telegram.py

This module does not perform demographic inference,
trend classification, caching, or raw-data transformation.
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query

from app.config import logger

from app.clients.x import (
    fetch_x_trends,
    fetch_x_tweets,
    fetch_x_author,
)

from app.clients.reddit import (
    get_reddit_client,
    fetch_reddit_search,
    fetch_reddit_comments,
    fetch_reddit_author,
    fetch_subreddit,
    normalize_reddit_post,
    RedditRateLimitError,
    RedditAuthError,
    RedditPermissionError,
    RedditNotFoundError,
    RedditUpstreamError,
)

from app.clients.telegram import (
    fetch_telegram_search,
)


# ============================================================================
# Configuration
# ============================================================================

SCHEMA_VERSION = "1.0.0"
COLLECTOR_VERSION = "2.1.0"

app = FastAPI(
    title="Aperture Social Scraper API",
    version=COLLECTOR_VERSION,
)


# ============================================================================
# Time
# ============================================================================

def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


# ============================================================================
# Canonical collection envelope
# ============================================================================

def canonical_collection(
    collection=None,
    trend=None,
    platforms=None,
    events=None,
    author_profiles=None,
    communities=None,
    warnings=None,
    errors=None,
):
    events = (
        events
        if isinstance(events, list)
        else []
    )

    author_profiles = (
        author_profiles
        if isinstance(author_profiles, list)
        else []
    )

    communities = (
        communities
        if isinstance(communities, list)
        else []
    )

    warnings = (
        warnings
        if isinstance(warnings, list)
        else []
    )

    errors = (
        errors
        if isinstance(errors, list)
        else []
    )

    return {
        "schemaVersion": SCHEMA_VERSION,

        "collection": (
            collection
            if isinstance(collection, dict)
            else {}
        ),

        "trend": (
            trend
            if isinstance(trend, dict)
            else {}
        ),

        "platforms": (
            platforms
            if isinstance(platforms, dict)
            else {}
        ),

        "events": events,

        "authorProfiles": author_profiles,

        "communities": communities,

        "quality": {
            "recordsCollected": len(events),
            "warnings": warnings,
            "errors": errors,
        },
    }


# ============================================================================
# Canonical validation
# ============================================================================

def ensure_canonical_result(
    result,
    collection,
    trend=None,
    platform=None,
    requested_limit=None,
):
    """
    Accept an already-canonical client result.

    This is used only by clients that return a complete
    canonical collection envelope.

    Platform-level clients such as Telegram search,
    X trends, and X tweet search are wrapped explicitly
    by their routes.
    """

    if not isinstance(result, dict):

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                platform: {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": requested_limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "invalid_client_response"
                        ),
                    },
                }
            },
            errors=[{
                "platform": platform,
                "operation": "collection",
                "errorType": "InvalidClientResponse",
                "message": (
                    "Platform client returned "
                    "a non-object response."
                ),
            }],
        )

    if result.get("schemaVersion") != SCHEMA_VERSION:

        raise ValueError(
            f"{platform or 'platform'} client returned "
            f"a non-canonical response"
        )

    events = result.get(
        "events",
        [],
    )

    if not isinstance(
        events,
        list,
    ):
        raise ValueError(
            f"{platform or 'platform'} client returned "
            "`events` that is not an array"
        )

    author_profiles = result.get(
        "authorProfiles",
        [],
    )

    if not isinstance(
        author_profiles,
        list,
    ):
        raise ValueError(
            f"{platform or 'platform'} client returned "
            "`authorProfiles` that is not an array"
        )

    communities = result.get(
        "communities",
        [],
    )

    if not isinstance(
        communities,
        list,
    ):
        raise ValueError(
            f"{platform or 'platform'} client returned "
            "`communities` that is not an array"
        )

    platform_block = result.get(
        "platforms",
        {},
    )

    if not isinstance(
        platform_block,
        dict,
    ):
        raise ValueError(
            f"{platform or 'platform'} client returned "
            "`platforms` that is not an object"
        )

    quality = result.get(
        "quality",
        {},
    )

    if not isinstance(
        quality,
        dict,
    ):
        raise ValueError(
            f"{platform or 'platform'} client returned "
            "`quality` that is not an object"
        )

    warnings = quality.get(
        "warnings",
        [],
    )

    if not isinstance(
        warnings,
        list,
    ):
        warnings = []

    errors = quality.get(
        "errors",
        [],
    )

    if not isinstance(
        errors,
        list,
    ):
        errors = []

    return canonical_collection(
        collection=result.get(
            "collection",
            collection,
        ),
        trend=result.get(
            "trend",
            trend or {},
        ),
        platforms=platform_block,
        events=events,
        author_profiles=author_profiles,
        communities=communities,
        warnings=warnings,
        errors=errors,
    )


# ============================================================================
# Platform-level result helpers
# ============================================================================

def wrap_platform_result(
    *,
    result,
    collection,
    trend,
    platform,
    operation,
    requested_limit=None,
):
    """
    Convert a platform-level client result into the
    canonical collection envelope.

    Expected client shape:

        {
            "status": "...",
            "events": [...],
            "pagination": {...},
            "authorProfiles": [...]
        }

    The FastAPI layer owns the final canonical envelope.
    """

    if not isinstance(result, dict):

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                platform: {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": requested_limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "invalid_client_response"
                        ),
                    },
                }
            },
            errors=[{
                "platform": platform,
                "operation": operation,
                "errorType": "InvalidClientResponse",
                "message": (
                    f"{platform} client returned "
                    "a non-object response"
                ),
            }],
        )

    events = result.get(
        "events",
        [],
    )

    if not isinstance(
        events,
        list,
    ):

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                platform: {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": requested_limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "invalid_client_response"
                        ),
                    },
                }
            },
            errors=[{
                "platform": platform,
                "operation": operation,
                "errorType": "InvalidClientResponse",
                "message": (
                    f"{platform} client returned "
                    "`events` that is not an array"
                ),
            }],
        )

    author_profiles = result.get(
        "authorProfiles",
        [],
    )

    if not isinstance(
        author_profiles,
        list,
    ):
        author_profiles = []

    pagination = result.get(
        "pagination",
        {},
    )

    if not isinstance(
        pagination,
        dict,
    ):
        pagination = {}

    status = result.get(
        "status",
        "success_empty",
    )

    if not isinstance(
        status,
        str,
    ):
        status = "error"

    errors = []

    platform_error = result.get(
        "error"
    )

    if platform_error is not None:

        if isinstance(
            platform_error,
            dict,
        ):

            errors.append({
                "platform": platform,
                "operation": operation,
                "errorType": (
                    platform_error.get("type")
                    or platform_error.get("errorType")
                    or "PlatformError"
                ),
                "message": (
                    platform_error.get("message")
                    or f"{platform} operation failed"
                ),
                "retryAfter": (
                    platform_error.get("retryAfter")
                ),
            })

        else:

            errors.append({
                "platform": platform,
                "operation": operation,
                "errorType": "PlatformError",
                "message": str(
                    platform_error
                ),
            })

    return canonical_collection(
        collection=collection,
        trend=trend,
        platforms={
            platform: {
                "status": status,
                "pagination": pagination,
            }
        },
        events=events,
        author_profiles=author_profiles,
        errors=errors,
    )


# ============================================================================
# Reddit HTTP error mapping
# ============================================================================

def reddit_http_exception(
    exc,
    operation: str,
):
    if isinstance(
        exc,
        RedditRateLimitError,
    ):
        return HTTPException(
            status_code=429,
            detail={
                "type": "REDDIT_RATE_LIMITED",
                "operation": operation,
                "message": str(exc),
                "retryAfter": exc.retry_after,
            },
        )

    if isinstance(
        exc,
        RedditAuthError,
    ):
        return HTTPException(
            status_code=401,
            detail={
                "type": "REDDIT_AUTH_ERROR",
                "operation": operation,
                "message": str(exc),
            },
        )

    if isinstance(
        exc,
        RedditPermissionError,
    ):
        return HTTPException(
            status_code=403,
            detail={
                "type": "REDDIT_PERMISSION_ERROR",
                "operation": operation,
                "message": str(exc),
            },
        )

    if isinstance(
        exc,
        RedditNotFoundError,
    ):
        return HTTPException(
            status_code=404,
            detail={
                "type": "REDDIT_NOT_FOUND",
                "operation": operation,
                "message": str(exc),
            },
        )

    if isinstance(
        exc,
        RedditUpstreamError,
    ):
        return HTTPException(
            status_code=502,
            detail={
                "type": "REDDIT_UPSTREAM_ERROR",
                "operation": operation,
                "message": str(exc),
            },
        )

    return HTTPException(
        status_code=502,
        detail={
            "type": "REDDIT_ERROR",
            "operation": operation,
            "message": str(exc),
        },
    )


# ============================================================================
# Health
# ============================================================================

@app.get("/health")
async def health():

    return {
        "status": "ok",
        "schemaVersion": SCHEMA_VERSION,
        "collectorVersion": COLLECTOR_VERSION,
    }


# ============================================================================
# X / Trends
# ============================================================================

@app.get("/scrape/x/trends")
async def get_x_trends():

    started_at = utc_now()

    collection = {
        "collectionId": "x:trends",
        "platformsRequested": ["x"],
        "startedAt": started_at,
        "completedAt": None,
    }

    try:

        result = await fetch_x_trends()

    except Exception as exc:

        logger.exception(
            "x_trends_failed"
        )

        collection["completedAt"] = utc_now()

        return canonical_collection(
            collection=collection,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": None,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": "platform_error",
                    },
                }
            },
            errors=[{
                "platform": "x",
                "operation": "trends",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    if not isinstance(
        result,
        dict,
    ):

        return canonical_collection(
            collection=collection,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": None,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "invalid_client_response"
                        ),
                    },
                }
            },
            errors=[{
                "platform": "x",
                "operation": "trends",
                "errorType": "InvalidClientResponse",
                "message": (
                    "X trends client returned "
                    "a non-object response"
                ),
            }],
        )

    trends = result.get(
        "trends"
    )

    if not isinstance(
        trends,
        list,
    ):

        return canonical_collection(
            collection=collection,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": None,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "invalid_client_response"
                        ),
                    },
                }
            },
            errors=[{
                "platform": "x",
                "operation": "trends",
                "errorType": "InvalidClientResponse",
                "message": (
                    "X trends client returned "
                    "`trends` that is not an array"
                ),
            }],
        )

    pagination = result.get(
        "pagination",
        {},
    )

    if not isinstance(
        pagination,
        dict,
    ):
        pagination = {}

    status = result.get(
        "status",
        "success_empty",
    )

    if not isinstance(
        status,
        str,
    ):
        status = "error"

    errors = []

    platform_error = result.get(
        "error"
    )

    if platform_error is not None:

        if isinstance(
            platform_error,
            dict,
        ):

            errors.append({
                "platform": "x",
                "operation": "trends",
                "errorType": (
                    platform_error.get("type")
                    or platform_error.get("errorType")
                    or "PlatformError"
                ),
                "message": (
                    platform_error.get("message")
                    or "X trends search failed"
                ),
                "retryAfter": (
                    platform_error.get("retryAfter")
                ),
            })

        else:

            errors.append({
                "platform": "x",
                "operation": "trends",
                "errorType": "PlatformError",
                "message": str(
                    platform_error
                ),
            })

    return canonical_collection(
        collection=collection,
        trend={},
        platforms={
            "x": {
                "status": status,
                "trends": trends,
                "pagination": pagination,
            }
        },
        events=[],
        errors=errors,
    )


# ============================================================================
# X / Tweets
# ============================================================================

@app.get("/scrape/x/tweets")
async def get_x_tweets(

    keyword: str = Query(
        ...,
        min_length=1,
        max_length=200,
    ),

    limit: int = Query(
        30,
        ge=1,
        le=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": f"x:{keyword}",
        "platformsRequested": ["x"],
        "startedAt": started_at,
        "completedAt": None,
    }

    trend = {
        "trendId": f"trend:{keyword}",
        "label": keyword,
        "query": keyword,
        "rank": None,
        "volume": None,
        "volumeSource": None,
        "discoveredAt": None,
    }

    try:

        result = await fetch_x_tweets(
            keyword,
            limit,
        )

    except Exception as exc:

        logger.exception(
            "x_tweets_failed"
        )

        collection["completedAt"] = utc_now()

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": "platform_error",
                    },
                }
            },
            errors=[{
                "platform": "x",
                "operation": "tweets",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    # X tweet search is a platform-level client result:
    #
    # {
    #     "status": "success",
    #     "events": [...],
    #     "pagination": {...}
    # }
    #
    # Therefore it must be wrapped here rather than passed
    # through ensure_canonical_result().

    return wrap_platform_result(
        result=result,
        collection=collection,
        trend=trend,
        platform="x",
        operation="tweets",
        requested_limit=limit,
    )


# ============================================================================
# X / Author
# ============================================================================

@app.get("/scrape/x/author")
async def get_x_author(

    handle: str = Query(
        ...,
        min_length=1,
        max_length=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": f"x:author:{handle}",
        "platformsRequested": ["x"],
        "startedAt": started_at,
        "completedAt": None,
    }

    try:

        result = await fetch_x_author(
            handle
        )

    except Exception as exc:

        logger.exception(
            "x_author_failed"
        )

        collection["completedAt"] = utc_now()

        return canonical_collection(
            collection=collection,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {},
                }
            },
            errors=[{
                "platform": "x",
                "operation": "author",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    try:

        return ensure_canonical_result(
            result,
            collection=collection,
            platform="x",
        )

    except ValueError as exc:

        logger.error(
            "x_author_noncanonical_response",
            extra={
                "errorType": type(exc).__name__,
                "error": str(exc),
            },
        )

        return canonical_collection(
            collection=collection,
            platforms={
                "x": {
                    "status": "error",
                    "pagination": {},
                }
            },
            errors=[{
                "platform": "x",
                "operation": "author",
                "errorType": "InvalidClientResponse",
                "message": str(exc),
            }],
        )


# ============================================================================
# Reddit / Search
# ============================================================================

@app.get("/scrape/reddit/search")
async def get_reddit_search(

    keyword: str = Query(
        ...,
        min_length=1,
        max_length=200,
    ),

    limit: int = Query(
        15,
        ge=1,
        le=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": (
            f"reddit:search:{keyword}"
        ),
        "platformsRequested": ["reddit"],
        "startedAt": started_at,
        "completedAt": None,
    }

    trend = {
        "trendId": f"trend:{keyword}",
        "label": keyword,
        "query": keyword,
        "rank": None,
        "volume": None,
        "volumeSource": None,
        "discoveredAt": None,
    }

    try:

        async with get_reddit_client() as client:

            result = await fetch_reddit_search(
                client,
                keyword,
                limit,
            )

    except Exception as exc:

        logger.exception(
            "reddit_search_failed"
        )

        collection["completedAt"] = utc_now()

        error = reddit_http_exception(
            exc,
            "search",
        )

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                "reddit": {
                    "status": (
                        "rate_limited"
                        if error.status_code == 429
                        else "error"
                    ),
                    "pagination": {
                        "requestedLimit": limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "rate_limited"
                            if error.status_code == 429
                            else "platform_error"
                        ),
                    },
                    "diagnostics": {
                        "code": (
                            error.detail.get(
                                "type",
                                "REDDIT_ERROR",
                            )
                            if isinstance(
                                error.detail,
                                dict,
                            )
                            else "REDDIT_ERROR"
                        ),
                        "message": str(exc),
                        "retryable": (
                            error.status_code == 429
                            or error.status_code >= 500
                        ),
                    },
                }
            },
            errors=[{
                "platform": "reddit",
                "operation": "search",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    events = result.get(
        "events",
        [],
    )

    author_profiles = result.get(
        "authorProfiles",
        [],
    )

    pagination = result.get(
        "pagination",
        {},
    )

    status = result.get(
        "status",
        "success_empty",
    )

    return canonical_collection(
        collection=collection,
        trend=trend,
        platforms={
            "reddit": {
                "status": status,
                "pagination": (
                    pagination
                    if isinstance(
                        pagination,
                        dict,
                    )
                    else {}
                ),
            }
        },
        events=events,
        author_profiles=author_profiles,
    )


# ============================================================================
# Reddit / Comments
# ============================================================================

@app.get("/scrape/reddit/comments")
async def get_reddit_comments(

    post_id: str = Query(
        ...,
        min_length=1,
        max_length=30,
    ),

    limit: int = Query(
        100,
        ge=1,
        le=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": (
            f"reddit:comments:{post_id}"
        ),
        "platformsRequested": ["reddit"],
        "startedAt": started_at,
        "completedAt": None,
    }

    try:

        async with get_reddit_client() as client:

            result = await fetch_reddit_comments(
                client,
                post_id,
                limit,
            )

    except Exception as exc:

        logger.exception(
            "reddit_comments_failed"
        )

        collection["completedAt"] = utc_now()

        error = reddit_http_exception(
            exc,
            "comments",
        )

        return canonical_collection(
            collection=collection,
            platforms={
                "reddit": {
                    "status": (
                        "rate_limited"
                        if error.status_code == 429
                        else "error"
                    ),
                    "pagination": {
                        "requestedLimit": limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "rate_limited"
                            if error.status_code == 429
                            else "platform_error"
                        ),
                    },
                    "diagnostics": {
                        "code": (
                            error.detail.get(
                                "type",
                                "REDDIT_ERROR",
                            )
                            if isinstance(
                                error.detail,
                                dict,
                            )
                            else "REDDIT_ERROR"
                        ),
                        "message": str(exc),
                        "retryable": (
                            error.status_code == 429
                            or error.status_code >= 500
                        ),
                    },
                }
            },
            errors=[{
                "platform": "reddit",
                "operation": "comments",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    events = result.get(
        "events",
        [],
    )

    author_profiles = result.get(
        "authorProfiles",
        [],
    )

    pagination = result.get(
        "pagination",
        {},
    )

    status = result.get(
        "status",
        "success_empty",
    )

    return canonical_collection(
        collection=collection,
        platforms={
            "reddit": {
                "status": status,
                "pagination": (
                    pagination
                    if isinstance(
                        pagination,
                        dict,
                    )
                    else {}
                ),
            }
        },
        events=events,
        author_profiles=author_profiles,
    )


# ============================================================================
# Reddit / Author
# ============================================================================

@app.get("/scrape/reddit/author")
async def get_reddit_author(

    handle: str = Query(
        ...,
        min_length=1,
        max_length=50,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": (
            f"reddit:author:{handle}"
        ),
        "platformsRequested": ["reddit"],
        "startedAt": started_at,
        "completedAt": None,
    }

    try:

        async with get_reddit_client() as client:

            result = await fetch_reddit_author(
                client,
                handle,
            )

    except Exception as exc:

        logger.exception(
            "reddit_author_failed"
        )

        collection["completedAt"] = utc_now()

        error = reddit_http_exception(
            exc,
            "author",
        )

        return canonical_collection(
            collection=collection,
            platforms={
                "reddit": {
                    "status": (
                        "rate_limited"
                        if error.status_code == 429
                        else "error"
                    ),
                    "pagination": {},
                    "diagnostics": {
                        "code": (
                            error.detail.get(
                                "type",
                                "REDDIT_ERROR",
                            )
                            if isinstance(
                                error.detail,
                                dict,
                            )
                            else "REDDIT_ERROR"
                        ),
                        "message": str(exc),
                        "retryable": (
                            error.status_code == 429
                            or error.status_code >= 500
                        ),
                    },
                }
            },
            events=[],
            errors=[{
                "platform": "reddit",
                "operation": "author",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    events = result.get(
        "events",
        [],
    )

    author_profiles = result.get(
        "authorProfiles",
        [],
    )

    pagination = result.get(
        "pagination",
        {},
    )

    status = result.get(
        "status",
        "success_empty",
    )

    return canonical_collection(
        collection=collection,
        platforms={
            "reddit": {
                "status": status,
                "pagination": (
                    pagination
                    if isinstance(
                        pagination,
                        dict,
                    )
                    else {}
                ),
            }
        },
        events=events,
        author_profiles=author_profiles,
    )


# ============================================================================
# Reddit / Subreddit
# ============================================================================

@app.get("/scrape/reddit/subreddit")
async def get_reddit_subreddit(

    subreddit: str = Query(
        ...,
        min_length=1,
        max_length=100,
    ),

    limit: int = Query(
        25,
        ge=1,
        le=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": (
            f"reddit:subreddit:{subreddit}"
        ),
        "platformsRequested": ["reddit"],
        "startedAt": started_at,
        "completedAt": None,
    }

    try:

        async with get_reddit_client() as client:

            raw = await fetch_subreddit(
                client,
                subreddit,
                limit,
            )

    except Exception as exc:

        logger.exception(
            "reddit_subreddit_failed"
        )

        error = reddit_http_exception(
            exc,
            "subreddit",
        )

        return canonical_collection(
            collection={
                **collection,
                "completedAt": utc_now(),
            },
            platforms={
                "reddit": {
                    "status": (
                        "rate_limited"
                        if error.status_code == 429
                        else "error"
                    ),
                    "pagination": {
                        "requestedLimit": limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "rate_limited"
                            if error.status_code == 429
                            else "platform_error"
                        ),
                    },
                }
            },
            errors=[{
                "platform": "reddit",
                "operation": "subreddit",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    raw_data = (
        raw.get("data")
        if isinstance(
            raw,
            dict,
        )
        else None
    )

    children = (
        raw_data.get("children")
        if isinstance(
            raw_data,
            dict,
        )
        else []
    )

    if not isinstance(
        children,
        list,
    ):
        children = []

    events = []

    for child in children:

        if not isinstance(
            child,
            dict,
        ):
            continue

        if child.get("kind") != "t3":
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
            keyword=f"r/{subreddit}",
        )

        if event is not None:

            events.append(
                event
            )

        if len(events) >= limit:
            break

    after = (
        raw_data.get("after")
        if isinstance(
            raw_data,
            dict,
        )
        else None
    )

    collection["completedAt"] = utc_now()

    return canonical_collection(
        collection=collection,
        platforms={
            "reddit": {
                "status": (
                    "success_with_results"
                    if events
                    else "success_empty"
                ),
                "pagination": {
                    "requestedLimit": limit,
                    "primaryResultsReturned": len(
                        events
                    ),
                    "relationshipRecordsCollected": 0,
                    "recordsCollected": len(
                        events
                    ),
                    "pagesFetched": 1,
                    "hasMore": bool(after),
                    "stoppedBecause": (
                        "limit_reached"
                        if len(events) >= limit
                        else "no_more_results"
                    ),
                },
            }
        },
        events=events,
    )


# ============================================================================
# Telegram / Search
# ============================================================================

@app.get("/scrape/telegram/search")
async def get_telegram_search(

    keyword: str = Query(
        ...,
        min_length=1,
        max_length=200,
    ),

    limit: int = Query(
        30,
        ge=1,
        le=100,
    ),
):

    started_at = utc_now()

    collection = {
        "collectionId": (
            f"telegram:search:{keyword}"
        ),
        "platformsRequested": [
            "telegram"
        ],
        "startedAt": started_at,
        "completedAt": None,
    }

    trend = {
        "trendId": f"trend:{keyword}",
        "label": keyword,
        "query": keyword,
        "rank": None,
        "volume": None,
        "volumeSource": None,
        "discoveredAt": None,
    }

    try:

        result = await fetch_telegram_search(
            keyword,
            limit,
        )

    except Exception as exc:

        logger.exception(
            "telegram_search_failed"
        )

        collection["completedAt"] = utc_now()

        return canonical_collection(
            collection=collection,
            trend=trend,
            platforms={
                "telegram": {
                    "status": "error",
                    "pagination": {
                        "requestedLimit": limit,
                        "primaryResultsReturned": 0,
                        "relationshipRecordsCollected": 0,
                        "recordsCollected": 0,
                        "pagesFetched": 0,
                        "hasMore": None,
                        "stoppedBecause": (
                            "platform_error"
                        ),
                    },
                }
            },
            events=[],
            errors=[{
                "platform": "telegram",
                "operation": "search",
                "errorType": type(exc).__name__,
                "message": str(exc),
            }],
        )

    collection["completedAt"] = utc_now()

    return wrap_platform_result(
        result=result,
        collection=collection,
        trend=trend,
        platform="telegram",
        operation="search",
        requested_limit=limit,
    )
