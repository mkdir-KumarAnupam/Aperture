import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.processing.text import extract_urls
from app.processing.validator import validate_collection


def event(event_id="t3_example", author_id="t2_author"):
    return {
        "eventId": event_id, "platform": "reddit", "platformPostId": event_id,
        "author": {"authorId": author_id},
        "content": {"urls": [], "text": "x", "hashtags": [], "mentions": [], "contentFingerprint": "fp"},
        "time": {"publishedAt": "2026-01-01T00:00:00Z", "observedAt": "2026-01-01T00:01:00Z", "editedAt": None},
        "engagement": {key: None for key in ("likes", "replies", "reposts", "quotes", "bookmarks", "views", "impressions")},
        "relationships": {}, "source": {}, "platformData": {}, "retrieval": {}
    }


def payload(record):
    return {"schemaVersion": "1.0.0", "platforms": {name: {"status": "success_empty", "pagination": {}} for name in ("x", "reddit", "telegram")} | {"reddit": {"status": "success_with_results", "pagination": {"primaryResultsReturned": 1, "recordsCollected": 1}}}, "events": [record], "authorProfiles": [], "quality": {"warnings": [], "errors": [], "recordsCollected": 0}}


def test_markdown_url_target_is_not_concatenated():
    assert extract_urls("[example](https://example.com)") == [{"raw": "https://example.com", "resolved": None, "domain": None, "resolutionStatus": "unresolved"}]


def test_epoch_and_bad_reddit_author_are_reported_without_dropping_record():
    record = event(author_id="bukzr9b4")
    record["time"]["editedAt"] = "1970-01-01T00:00:00Z"
    checked = validate_collection(payload(record))
    assert checked["quality"]["recordsCollected"] == 1
    assert len(checked["events"]) == 1
    assert any("epoch fallback" in error for error in checked["quality"]["errors"])
    assert any("t2_" in error for error in checked["quality"]["errors"])


def test_telegram_bare_relationship_is_reported():
    record = event("telegram:100:9", None)
    record["platform"] = "telegram"
    record["relationships"] = {"replyToId": "9"}
    checked = validate_collection(payload(record))
    assert any("chat scope" in error for error in checked["quality"]["errors"])
