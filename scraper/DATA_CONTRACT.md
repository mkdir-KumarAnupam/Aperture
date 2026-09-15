# Raw Data Contract

## 1. Purpose
This is the raw social-media event contract for the data engineering team, covering X (Twitter) and Reddit.
It is a lossless, append-oriented, timestamped, and provenance-aware schema.

## 2. Design Principles
- **Immutable observations**: Events are immutable; no semantic filtering is applied.
- **Null Semantics**: `null` means unavailable.
- **Zero Semantics**: `0` means explicitly zero. Do not use empty strings for unavailable values.
- **Timestamp Semantics**: All timestamps are ISO 8601 UTC.
- **ID Semantics**: Globally unique identifiers prefixed by platform (e.g., `x:{id}`, `reddit:t3_{id}`).
- **URL Semantics**: URLs default to `resolutionStatus: "unresolved"` unless explicitly resolved.

## 3. Canonical Schema
See `SCHEMA.json` for the full representation.
Events are flattened into a single top-level `events` array.

## 4. Collection Envelope
```json
{
  "schemaVersion": "1.0",
  "collection": {},
  "trend": {},
  "platforms": {},
  "events": [],
  "authors": [],
  "communities": [],
  "collectionStats": {}
}
```

## API Serialization Format
The serialized response returned by the raw collection endpoint (`/collect`) MUST itself be the collection object.
It begins directly with `{`.
There is NO prepended `payload` text.
There is NO top-level `payload` wrapper property.
