"""Non-destructive validation for the raw collection contract."""

import datetime as dt
from urllib.parse import urlparse


SCHEMA_VERSION = "1.0.0"

VALID_PLATFORMS = {"x", "reddit", "telegram"}

VALID_STATUSES = {
    "success",
    "rate_limited",
    "unavailable",
    "error",
}

VALID_URL_RESOLUTION_STATUSES = {
    "platform_expanded",
    "collector_resolved",
    "unresolved",
    "failed",
}

INTEGER_METRICS = {
    "likes",
    "replies",
    "reposts",
    "quotes",
    "bookmarks",
    "views",
    "impressions",
}

REQUIRED_EVENT_SECTIONS = {
    "source",
    "content",
    "author",
    "time",
    "engagement",
    "relationships",
    "platformData",
    "retrieval",
}


def _is_aware_iso(value: object) -> bool:
    if not isinstance(value, str):
        return False

    try:
        parsed = dt.datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
        return parsed.tzinfo is not None
    except (TypeError, ValueError):
        return False


def _is_int_or_none(value: object) -> bool:
    return value is None or (
        isinstance(value, int) and not isinstance(value, bool)
    )


def _validate_scoped_telegram_id(
    value: object,
    field_name: str,
    errors: list[str],
) -> None:
    if value is None:
        return

    if not isinstance(value, str):
        errors.append(
            f"Telegram {field_name} must be a string or null, "
            f"got {value!r}"
        )
        return

    parts = value.split(":")

    if len(parts) != 4 or parts[0] != "telegram":
        errors.append(
            f"Telegram {field_name} must use "
            f"telegram:<peer_kind>:<peer_scope>:<message_id>, "
            f"got {value!r}"
        )


def validate_event(event: dict) -> list[str]:
    """Validate one canonical event without mutating it."""

    errors: list[str] = []

    if not isinstance(event, dict):
        return [
            f"Event must be an object, "
            f"got {type(event).__name__}"
        ]

    event_id = event.get("eventId")
    platform = event.get("platform")
    platform_post_id = event.get("platformPostId")

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    if not isinstance(event_id, str) or not event_id:
        errors.append("Missing eventId")

    if platform not in VALID_PLATFORMS:
        errors.append(f"Invalid platform: {platform!r}")

    if not isinstance(platform_post_id, str) or not platform_post_id:
        errors.append("Missing platformPostId")

    # ------------------------------------------------------------------
    # Platform-specific event IDs
    # ------------------------------------------------------------------

    if isinstance(event_id, str) and event_id:
        if platform == "x":
            if not event_id.startswith("x:"):
                errors.append(
                    f"X eventId must retain x: prefix, "
                    f"got {event_id!r}"
                )

        elif platform == "reddit":
            if not event_id.startswith(("t3_", "t1_")):
                errors.append(
                    "Reddit eventId must retain "
                    f"t3_/t1_ prefix, got {event_id!r}"
                )

        elif platform == "telegram":
            _validate_scoped_telegram_id(
                event_id,
                "eventId",
                errors,
            )

    # ------------------------------------------------------------------
    # Platform post ID sanity
    # ------------------------------------------------------------------

    if isinstance(platform_post_id, str) and platform_post_id:
        if platform == "x":
            if platform_post_id.startswith(
                ("t3_", "t1_", "telegram:")
            ):
                errors.append(
                    f"Invalid X platformPostId: "
                    f"{platform_post_id!r}"
                )

        elif platform == "reddit":
            if platform_post_id.startswith("telegram:"):
                errors.append(
                    "Invalid Reddit platformPostId: "
                    f"{platform_post_id!r}"
                )

        elif platform == "telegram":
            _validate_scoped_telegram_id(
                platform_post_id,
                "platformPostId",
                errors,
            )

    # ------------------------------------------------------------------
    # Required event sections
    # ------------------------------------------------------------------

    for section in REQUIRED_EVENT_SECTIONS:
        if not isinstance(event.get(section), dict):
            errors.append(
                f"Missing or malformed {section} object"
            )

    # ------------------------------------------------------------------
    # Author
    # ------------------------------------------------------------------

    author = event.get("author")

    if isinstance(author, dict):
        author_id = author.get("authorId")

        if platform == "reddit":
            if author_id is not None:
                if (
                    not isinstance(author_id, str)
                    or not author_id.startswith("t2_")
                ):
                    errors.append(
                        "Reddit authorId must retain "
                        f"t2_ prefix, got {author_id!r}"
                    )

    # ------------------------------------------------------------------
    # Time
    # ------------------------------------------------------------------

    time = event.get("time")

    if isinstance(time, dict):
        for field in (
            "publishedAt",
            "observedAt",
            "editedAt",
        ):
            value = time.get(field)

            if value is not None and not _is_aware_iso(value):
                errors.append(
                    f"Timestamp {field} must be "
                    f"timezone-aware ISO-8601, got {value!r}"
                )

            if (
                isinstance(value, str)
                and value.startswith("1970-01-01")
            ):
                errors.append(
                    f"Timestamp {field} is an epoch fallback, "
                    "not a source time"
                )

    # ------------------------------------------------------------------
    # Engagement
    # ------------------------------------------------------------------

    engagement = event.get("engagement")

    if isinstance(engagement, dict):
        for field in INTEGER_METRICS:
            value = engagement.get(field)

            if not _is_int_or_none(value):
                errors.append(
                    f"Engagement {field} must be integer or null, "
                    f"got {value!r}"
                )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------

    relationships = event.get("relationships")

    if isinstance(relationships, dict):
        if platform == "telegram":
            for field in (
                "replyToId",
                "quoteOfId",
                "forwardOfId",
                "conversationId",
            ):
                _validate_scoped_telegram_id(
                    relationships.get(field),
                    field,
                    errors,
                )

    # ------------------------------------------------------------------
    # Content / URLs
    # ------------------------------------------------------------------

    content = event.get("content")

    if isinstance(content, dict):
        urls = content.get("urls", [])

        if not isinstance(urls, list):
            errors.append("content.urls must be an array")

        else:
            for url in urls:
                if not isinstance(url, dict):
                    errors.append(
                        f"Malformed URL object: {url!r}"
                    )
                    continue

                raw = url.get("raw")

                if (
                    not isinstance(raw, str)
                    or not raw
                    or not urlparse(raw).scheme
                ):
                    errors.append(
                        f"Malformed URL: {url!r}"
                    )
                    continue

                status = url.get("resolutionStatus")

                if status not in VALID_URL_RESOLUTION_STATUSES:
                    errors.append(
                        "Invalid URL resolutionStatus: "
                        f"{status!r}"
                    )

                resolved = url.get("resolved")

                if status in {
                    "platform_expanded",
                    "collector_resolved",
                }:
                    if (
                        not isinstance(resolved, str)
                        or not resolved
                    ):
                        errors.append(
                            "URL marked resolved without "
                            f"a resolved target: {url!r}"
                        )

                    elif resolved == raw:
                        errors.append(
                            "URL marked resolved without a "
                            f"real redirect: {url!r}"
                        )

                elif status in {
                    "unresolved",
                    "failed",
                }:
                    if resolved is not None:
                        errors.append(
                            "Unresolved/failed URL has a "
                            f"resolved target: {url!r}"
                        )

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    retrieval = event.get("retrieval")

    if isinstance(retrieval, dict):
        matched_terms = retrieval.get("matchedTerms")

        if (
            matched_terms is not None
            and not isinstance(matched_terms, list)
        ):
            errors.append(
                "retrieval.matchedTerms must be "
                "an array or null"
            )

    return errors


def validate_collection(payload: dict) -> dict:
    """
    Non-destructive collection validation.

    The payload is returned with diagnostics appended to quality.
    Collected records are never filtered, deleted, or rewritten.
    """

    # ------------------------------------------------------------------
    # Root validation
    # ------------------------------------------------------------------

    if not isinstance(payload, dict):
        raise TypeError(
            f"Collection payload must be an object, "
            f"got {type(payload).__name__}"
        )

    warnings: list[str] = []
    errors: list[str] = []
    seen_ids: set[str] = set()
    event_author_ids: set[str] = set()

    # ------------------------------------------------------------------
    # Schema version
    # ------------------------------------------------------------------

    if payload.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(
            f"Schema version must be {SCHEMA_VERSION}"
        )

    # ------------------------------------------------------------------
    # Collection object
    # ------------------------------------------------------------------

    collection = payload.get("collection")

    if not isinstance(collection, dict):
        errors.append(
            "Missing or malformed collection object"
        )

    # ------------------------------------------------------------------
    # Platforms
    # ------------------------------------------------------------------

    platforms = payload.get("platforms", {})

    if not isinstance(platforms, dict):
        errors.append("platforms must be an object")
        platforms = {}

    platform_counts = {
        "x": 0,
        "reddit": 0,
        "telegram": 0,
    }

    for platform, platform_data in platforms.items():

        if platform not in VALID_PLATFORMS:
            errors.append(
                f"Unsupported platform: {platform!r}"
            )

        if not isinstance(platform_data, dict):
            errors.append(
                f"Malformed platform structure for {platform}"
            )
            continue

        status = platform_data.get("status")

        if status not in VALID_STATUSES:
            errors.append(
                f"Invalid status {status!r} for {platform}"
            )

        # --------------------------------------------------------------
        # Pagination
        # --------------------------------------------------------------

        page = platform_data.get("pagination", {})

        if not isinstance(page, dict):
            errors.append(
                f"Malformed pagination object for {platform}"
            )
            continue

        primary = page.get("primaryResultsReturned")
        total = page.get("recordsCollected")
        relationship_records = page.get(
            "relationshipRecordsCollected"
        )

        for name, value in (
            ("primaryResultsReturned", primary),
            ("recordsCollected", total),
            (
                "relationshipRecordsCollected",
                relationship_records,
            ),
        ):
            if value is not None and not _is_int_or_none(value):
                errors.append(
                    f"{platform} pagination {name} "
                    f"must be integer or null, got {value!r}"
                )

        # --------------------------------------------------------------
        # Logical pagination consistency
        # --------------------------------------------------------------

        if (
            isinstance(primary, int)
            and not isinstance(primary, bool)
            and isinstance(total, int)
            and not isinstance(total, bool)
        ):
            if primary > total:
                errors.append(
                    f"Contradictory pagination for {platform}: "
                    "primaryResultsReturned > recordsCollected"
                )

        if (
            isinstance(primary, int)
            and not isinstance(primary, bool)
            and isinstance(total, int)
            and not isinstance(total, bool)
            and isinstance(relationship_records, int)
            and not isinstance(relationship_records, bool)
        ):
            if primary + relationship_records != total:
                errors.append(
                    f"Contradictory pagination for {platform}: "
                    "primaryResultsReturned + "
                    "relationshipRecordsCollected != "
                    "recordsCollected"
                )

    # ------------------------------------------------------------------
    # Events
    # ------------------------------------------------------------------

    events = payload.get("events", [])

    if not isinstance(events, list):
        errors.append("events must be an array")
        events = []

    records_collected = 0

    for record in events:

        if not isinstance(record, dict):
            errors.append(
                "Event must be an object, "
                f"got {type(record).__name__}"
            )
            continue

        records_collected += 1

        platform = record.get("platform")

        if platform in platform_counts:
            platform_counts[platform] += 1

        event_id = record.get("eventId")

        if not event_id:
            errors.append("Missing eventId in records")

        elif event_id in seen_ids:
            errors.append(
                f"Duplicate eventId detected: {event_id}"
            )

        else:
            seen_ids.add(event_id)

        author = record.get("author", {})

        if isinstance(author, dict):
            author_id = author.get("authorId")

            if author_id:
                event_author_ids.add(author_id)

        event_errors = validate_event(record)

        for item in event_errors:
            errors.append(
                f"{event_id} ({platform}): {item}"
            )

    # ------------------------------------------------------------------
    # Author profiles
    # ------------------------------------------------------------------

    author_profiles = payload.get(
        "authorProfiles",
        [],
    )

    if not isinstance(author_profiles, list):
        errors.append(
            "authorProfiles must be an array"
        )
        author_profiles = []

    for profile in author_profiles:

        if not isinstance(profile, dict):
            errors.append(
                "authorProfiles entries must be objects"
            )
            continue

        profile_id = profile.get("authorId")
        profile_platform = profile.get("platform")

        if profile_id not in event_author_ids:
            warnings.append(
                f"Author profile {profile_id!r} "
                "was not observed in this collection"
            )

        if profile_platform not in VALID_PLATFORMS:
            errors.append(
                "Invalid author profile platform: "
                f"{profile_platform!r}"
            )

        if (
            profile_platform == "reddit"
            and profile_id
            and (
                not isinstance(profile_id, str)
                or not profile_id.startswith("t2_")
            )
        ):
            errors.append(
                "Reddit author profile ID is not canonical: "
                f"{profile_id!r}"
            )

    # ------------------------------------------------------------------
    # Quality
    # ------------------------------------------------------------------

    quality = payload.get("quality")

    if quality is None:
        quality = {}
        payload["quality"] = quality

    elif not isinstance(quality, dict):
        errors.append("quality must be an object")
        quality = {}
        payload["quality"] = quality

    existing_warnings = quality.get("warnings")

    if existing_warnings is None:
        existing_warnings = []
        quality["warnings"] = existing_warnings

    elif not isinstance(existing_warnings, list):
        errors.append(
            "quality.warnings must be an array"
        )
        existing_warnings = []
        quality["warnings"] = existing_warnings

    existing_errors = quality.get("errors")

    if existing_errors is None:
        existing_errors = []
        quality["errors"] = existing_errors

    elif not isinstance(existing_errors, list):
        errors.append(
            "quality.errors must be an array"
        )
        existing_errors = []
        quality["errors"] = existing_errors

    # ------------------------------------------------------------------
    # Final collection count
    # ------------------------------------------------------------------

    quality["recordsCollected"] = records_collected

    # ------------------------------------------------------------------
    # Append only new diagnostics
    # ------------------------------------------------------------------

    for warning in warnings:
        if warning not in quality["warnings"]:
            quality["warnings"].append(warning)

    for error in errors:
        if error not in quality["errors"]:
            quality["errors"].append(error)

    # ------------------------------------------------------------------
    # Defensive consistency check
    # ------------------------------------------------------------------

    consistency_error = (
        "quality.recordsCollected must equal len(events)"
    )

    if quality["recordsCollected"] != len(events):
        if consistency_error not in quality["errors"]:
            quality["errors"].append(consistency_error)

    return payload
