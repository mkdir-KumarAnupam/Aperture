# Data quality validation

`app.processing.validator.validate_collection(payload)` is non-destructive: it adds diagnostics to `quality.errors` and `quality.warnings` and never drops records.

It checks event/platform IDs, duplicate event IDs, canonical Reddit `t1_/t3_/t2_` identifiers, Telegram peer-scoped IDs, event-time timezone/epoch values, integer-or-null engagement values, URL resolution semantics, allowed statuses, success-status/record consistency, basic pagination arithmetic, and author-profile/event ID consistency. Collection and profile timestamp completeness remain schema-enforced checks.

Valid: `editedAt: null`, `followerCount: null`, and `{raw:"https://t.co/x",resolved:null,domain:null,resolutionStatus:"unresolved"}`.

Invalid: an epoch `editedAt`, Reddit author ID without `t2_`, `telegram:123` without a channel/message pair, string engagement counts, a URL marked resolved with no changed target, or `primaryResultsReturned` greater than `recordsCollected`.

The validator cannot prove a source did not fabricate a value, resolve a deleted/private relationship, or guarantee that public profile information remains available after collection. It reports contract inconsistencies; it does not infer or filter social meaning.
