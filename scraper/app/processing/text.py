"""
Shared text-processing utilities for Aperture.

Responsibilities:
- Language detection.
- Text normalization for fingerprints.
- Content fingerprinting.
- Hashtag extraction.
- Mention extraction.
- URL extraction.
- Generic keyword matching.
- Optional local raw-data debugging dumps.

This module contains platform-independent extraction logic.

It does NOT:
- infer demographics.
- classify trends.
- resolve URLs over the network.
- modify canonical source text.
"""

import hashlib
import html
import json
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from langdetect import LangDetectException, detect_langs

from app.config import logger


# ============================================================================
# LANGUAGE DETECTION
# ============================================================================

def detect_language(text: str) -> dict:
    """
    Detect the most likely language while preserving detector confidence.

    Returns:
        {
            "lang": "en",
            "confidence": 0.86
        }

    If detection fails:
        {
            "lang": "unknown",
            "confidence": 0.0
        }

    This function does not modify the supplied text.
    """

    if not isinstance(
        text,
        str,
    ) or not text.strip():

        return {
            "lang": "unknown",
            "confidence": 0.0,
        }

    try:

        languages = detect_langs(
            text
        )

        if languages:

            result = languages[0]

            return {
                "lang": result.lang,
                "confidence": round(
                    float(result.prob),
                    2,
                ),
            }

    except LangDetectException:
        pass

    except Exception as exc:

        logger.debug(
            "language_detection_failed",
            extra={
                "error": str(exc),
            },
        )

    return {
        "lang": "unknown",
        "confidence": 0.0,
    }


# ============================================================================
# TEXT NORMALIZATION / FINGERPRINTING
# ============================================================================

def normalize_text_for_fingerprint(
    text: str,
) -> str:
    """
    Normalize text only for fingerprint generation.

    The canonical event's original text must remain untouched.

    Normalization:
    - Decode HTML entities.
    - Collapse repeated whitespace.
    - Strip surrounding whitespace.
    """

    if not isinstance(
        text,
        str,
    ):
        return ""

    # Decode entities such as:
    # &amp; -> &
    # &lt;  -> <
    # &gt;  -> >
    # &#39; -> '
    text = html.unescape(
        text
    )

    # Normalize whitespace.
    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def fingerprint_text(
    text: str,
):
    """
    Generate a deterministic SHA-256 content fingerprint.

    Returns:
        SHA-256 hex string when content exists.
        None when content is unavailable/empty.

    Important:
    This is content identity, not event identity.

    eventId/platformPostId identify the source event.
    contentFingerprint identifies normalized content.
    """

    normalized = normalize_text_for_fingerprint(
        text
    )

    if not normalized:
        return None

    return hashlib.sha256(
        normalized.encode(
            "utf-8"
        )
    ).hexdigest()


# ============================================================================
# HASHTAGS
# ============================================================================

_HASHTAG_RE = re.compile(
    r"(?<![\w#])"
    r"#("
    r"[^\W\d_]"
    r"[\w-]*"
    r")",
    re.UNICODE,
)


def extract_hashtags(
    text: str,
) -> list[str]:
    """
    Extract hashtags from text.

    Returns:
        Hashtags WITHOUT the leading '#'.

    Example:
        "#GaneshChaturthi #India"
        ->
        ["GaneshChaturthi", "India"]

    Ordering:
        Deterministic, preserving first occurrence.

    Deduplication:
        Case-insensitive.
    """

    if not isinstance(
        text,
        str,
    ) or not text:

        return []

    text = html.unescape(
        text
    )

    seen = set()
    result = []

    for match in _HASHTAG_RE.finditer(
        text
    ):

        hashtag = match.group(
            1
        ).strip()

        if not hashtag:
            continue

        key = hashtag.casefold()

        if key in seen:
            continue

        seen.add(
            key
        )

        result.append(
            hashtag
        )

    return result


# ============================================================================
# MENTIONS
# ============================================================================

_MENTION_RE = re.compile(
    r"(?<![\w@])"
    r"@([A-Za-z0-9_]+)"
)


def extract_mentions(
    text: str,
) -> list[str]:
    """
    Extract conventional @mentions.

    Returns:
        Mentions WITHOUT the leading '@'.

    Example:
        "@elonmusk @reddit"
        ->
        ["elonmusk", "reddit"]

    Ordering:
        Deterministic, preserving first occurrence.

    Deduplication:
        Case-insensitive.
    """

    if not isinstance(
        text,
        str,
    ) or not text:

        return []

    text = html.unescape(
        text
    )

    seen = set()
    result = []

    for match in _MENTION_RE.finditer(
        text
    ):

        mention = match.group(
            1
        ).strip()

        if not mention:
            continue

        key = mention.casefold()

        if key in seen:
            continue

        seen.add(
            key
        )

        result.append(
            mention
        )

    return result


# ============================================================================
# URL EXTRACTION
# ============================================================================

_MARKDOWN_URL_RE = re.compile(
    r"\]\("
    r"(https?://[^\s)]+|www\.[^\s)]+)"
    r"\)",
    re.IGNORECASE,
)

_PLAIN_URL_RE = re.compile(
    r"(?<![\]\(])"
    r"(?:https?://|www\.)"
    r"[^\s<>\[\]()\"]+",
    re.IGNORECASE,
)

_TRAILING_URL_PUNCTUATION = re.compile(
    r"[\)\]\.,;:!?'\"]+$"
)


def _clean_url(
    url: str,
) -> str:
    """
    Remove punctuation accidentally captured after a URL.

    Does not resolve or otherwise transform the URL.
    """

    if not isinstance(
        url,
        str,
    ):
        return ""

    url = url.strip()

    url = _TRAILING_URL_PUNCTUATION.sub(
        "",
        url,
    )

    return url


def extract_urls(
    text: str,
) -> list[dict]:
    """
    Extract URLs from text.

    Important:
    - No network requests.
    - No URL resolution.
    - `raw` preserves the source URL.
    - `resolved` remains None.
    - `domain` is derived locally when possible.
    - `resolutionStatus` is "unresolved".

    Example:
        "Visit https://example.com"

    Returns:
        [
            {
                "raw": "https://example.com",
                "resolved": None,
                "domain": "example.com",
                "resolutionStatus": "unresolved"
            }
        ]
    """

    if not isinstance(
        text,
        str,
    ) or not text:

        return []

    text = html.unescape(
        text
    )

    candidates = []

    # Markdown URLs.
    candidates.extend(
        _MARKDOWN_URL_RE.findall(
            text
        )
    )

    # Plain URLs.
    candidates.extend(
        _PLAIN_URL_RE.findall(
            text
        )
    )

    result = []
    seen = set()

    for candidate in candidates:

        raw_url = _clean_url(
            candidate
        )

        if not raw_url:
            continue

        # Used only for parsing.
        parse_url = raw_url

        if raw_url.lower().startswith(
            "www."
        ):
            parse_url = (
                "http://"
                + raw_url
            )

        try:

            parsed = urlparse(
                parse_url
            )

        except Exception:

            continue

        if parsed.scheme not in {
            "http",
            "https",
        }:
            continue

        if not parsed.netloc:
            continue

        domain = (
            parsed.netloc
            .lower()
            or None
        )

        # Strip username/password from domain representation.
        if "@" in domain:
            domain = domain.rsplit(
                "@",
                1,
            )[-1]

        # Preserve first occurrence.
        key = raw_url.casefold()

        if key in seen:
            continue

        seen.add(
            key
        )

        result.append(
            {
                "raw": raw_url,
                "resolved": None,
                "domain": domain,
                "resolutionStatus": "unresolved",
            }
        )

    return result


# ============================================================================
# KEYWORD MATCHING
# ============================================================================

def has_keyword(
    text: str,
    keyword: str,
) -> bool:
    """
    Word-boundary-aware keyword matching.

    This is a generic helper.

    It must NOT be used for:
    - demographic inference.
    - trend classification.
    - inferred user attributes.

    Those operations belong outside the raw collection layer.
    """

    if not isinstance(
        text,
        str,
    ):
        return False

    if not isinstance(
        keyword,
        str,
    ):
        return False

    if not text or not keyword:
        return False

    return bool(
        re.search(
            rf"\b{re.escape(keyword)}\b",
            text,
            flags=re.IGNORECASE,
        )
    )


# ============================================================================
# RAW DEBUGGING DUMP
# ============================================================================

def dump_raw_data(
    prefix: str,
    data,
) -> None:
    """
    Write an optional local debugging snapshot.

    This file is NOT part of the canonical collection payload.

    Intended for local development/debugging only.
    """

    try:

        safe_prefix = re.sub(
            r"[^A-Za-z0-9_.-]+",
            "_",
            str(prefix),
        ).strip(
            "._"
        )

        if not safe_prefix:
            safe_prefix = "raw"

        directory = os.path.join(
            "data",
            "raw",
        )

        os.makedirs(
            directory,
            exist_ok=True,
        )

        timestamp = datetime.now(
            timezone.utc
        ).strftime(
            "%Y%m%dT%H%M%SZ"
        )

        filename = os.path.join(
            directory,
            f"{safe_prefix}_{timestamp}.json",
        )

        with open(
            filename,
            "w",
            encoding="utf-8",
        ) as file:

            json.dump(
                data,
                file,
                ensure_ascii=False,
                indent=2,
                default=str,
            )

    except Exception as exc:

        logger.warning(
            "dump_raw_data_failed",
            extra={
                "prefix": prefix,
                "error": str(exc),
            },
        )
