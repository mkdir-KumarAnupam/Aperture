-- ============================================================================
-- APERTURE ANALYTICS DATABASE
-- Migration: 001_initial_analytics_schema
--
-- Greenfield PostgreSQL schema.
--
-- Architecture:
--
--   Trend
--      │
--      ├── Collections
--      │      └── Events
--      │             └── Authors
--      │
--      ├── Trend Events
--      │
--      ├── Trend Snapshots
--      │      ├── Sentiment
--      │      ├── Demographics
--      │      ├── Regional
--      │      ├── Language
--      │      ├── Platform
--      │      └── Network
--      │
--      ├── Network Relationships
--      │
--      └── Trend History
--
--   Snapshots
--       ↓
--   Rollups
--       ↓
--   Dashboard
--
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- 1. TRENDS
-- ============================================================================
--
-- Persistent identity of a trend.
--
-- A trend is NOT tied to one platform.
--
-- Example:
--
--   trend_key = "ganesh_chaturthi"
--
-- can receive evidence from:
--
--   X
--   Reddit
--   Telegram
--
-- ============================================================================

CREATE TABLE trends (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_key           TEXT NOT NULL UNIQUE,
    canonical_label     TEXT NOT NULL,

    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (
                            status IN (
                                'active',
                                'cooling',
                                'dormant',
                                'archived'
                            )
                        ),

    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ,

    peak_score          NUMERIC(12, 4),
    peak_volume         BIGINT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trends_status
    ON trends(status);

CREATE INDEX idx_trends_last_seen
    ON trends(last_seen_at);

CREATE INDEX idx_trends_label
    ON trends(canonical_label);


-- ============================================================================
-- 2. COLLECTIONS
-- ============================================================================
--
-- One ingestion/polling cycle.
--
-- Example:
--
--   Collection #1 → 10:00
--   Collection #2 → 10:05
--   Collection #3 → 10:10
--
-- external_collection_id comes from the ingestion pipeline.
--
-- collection_sequence gives us deterministic ordering for a trend.
--
-- ============================================================================

CREATE TABLE collections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id                UUID NOT NULL
                            REFERENCES trends(id)
                            ON DELETE CASCADE,

    external_collection_id  TEXT NOT NULL UNIQUE,

    collection_sequence     BIGINT NOT NULL,

    started_at              TIMESTAMPTZ NOT NULL,
    completed_at            TIMESTAMPTZ,
    observed_at             TIMESTAMPTZ NOT NULL,

    collector_version       TEXT,

    status                  TEXT NOT NULL DEFAULT 'running'
                            CHECK (
                                status IN (
                                    'running',
                                    'completed',
                                    'partial',
                                    'failed'
                                )
                            ),

    event_count             BIGINT NOT NULL DEFAULT 0,
    primary_event_count     BIGINT NOT NULL DEFAULT 0,
    relationship_count      BIGINT NOT NULL DEFAULT 0,

    quality                 JSONB,
    platform_status         JSONB,
    diagnostics             JSONB,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT collections_sequence_unique
        UNIQUE (trend_id, collection_sequence)
);

CREATE INDEX idx_collections_trend_time
    ON collections(trend_id, observed_at DESC);

CREATE INDEX idx_collections_status
    ON collections(status);

CREATE INDEX idx_collections_external_id
    ON collections(external_collection_id);


-- ============================================================================
-- 3. AUTHORS
-- ============================================================================
--
-- Persistent identity of an author on a platform.
--
-- The same person/user on different platforms is intentionally treated as
-- different platform identities unless/until identity resolution is added.
--
-- ============================================================================

CREATE TABLE authors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    platform            TEXT NOT NULL,
    external_author_id  TEXT NOT NULL,

    handle              TEXT,
    display_name        TEXT,
    bio                 TEXT,
    location            TEXT,
    region              TEXT,

    follower_count      BIGINT,
    verified            BOOLEAN,

    account_created_at  TIMESTAMPTZ,

    profile_image_url   TEXT,
    profile_url         TEXT,

    -- Platform-specific metadata.
    platform_data       JSONB,

    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT authors_platform_identity_unique
        UNIQUE (platform, external_author_id)
);

CREATE INDEX idx_authors_platform
    ON authors(platform);

CREATE INDEX idx_authors_handle
    ON authors(handle);

CREATE INDEX idx_authors_region
    ON authors(region);


-- ============================================================================
-- 4. EVENTS
-- ============================================================================
--
-- Immutable collected evidence.
--
-- One social-media post/event exists once in this table even if it is observed
-- in multiple polling cycles.
--
-- ============================================================================

CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id            TEXT NOT NULL UNIQUE,

    platform            TEXT NOT NULL,
    platform_post_id    TEXT NOT NULL,

    collection_id       UUID NOT NULL
                        REFERENCES collections(id)
                        ON DELETE CASCADE,

    author_id           UUID
                        REFERENCES authors(id)
                        ON DELETE SET NULL,

    published_at        TIMESTAMPTZ,
    observed_at         TIMESTAMPTZ NOT NULL,
    edited_at           TIMESTAMPTZ,

    -- ------------------------------------------------------------------------
    -- Content
    -- ------------------------------------------------------------------------

    content_text        TEXT,
    title               TEXT,

    language            TEXT,
    detected_language   TEXT,
    language_confidence NUMERIC(6, 5),

    content_fingerprint TEXT,

    hashtags            JSONB,
    mentions            JSONB,
    urls                JSONB,
    attachments         JSONB,

    -- ------------------------------------------------------------------------
    -- Engagement
    -- ------------------------------------------------------------------------

    likes               BIGINT NOT NULL DEFAULT 0,
    replies             BIGINT NOT NULL DEFAULT 0,
    reposts             BIGINT NOT NULL DEFAULT 0,
    quotes              BIGINT NOT NULL DEFAULT 0,
    bookmarks           BIGINT,
    views               BIGINT,
    impressions         BIGINT,

    -- ------------------------------------------------------------------------
    -- Relationships reported by the platform
    -- ------------------------------------------------------------------------

    reply_to_id         TEXT,
    reply_to_author_id  TEXT,

    quote_of_id         TEXT,
    forward_of_id       TEXT,

    conversation_id     TEXT,

    -- ------------------------------------------------------------------------
    -- Platform data
    -- ------------------------------------------------------------------------

    possibly_sensitive  BOOLEAN,
    is_edited           BOOLEAN,

    author_followers    BIGINT,
    author_verified     BOOLEAN,

    -- ------------------------------------------------------------------------
    -- Original evidence
    -- ------------------------------------------------------------------------
    --
    -- Complete canonical event / platform payload.
    -- This prevents information loss when the normalized schema doesn't yet
    -- represent some platform-specific field.
    --
    -- ------------------------------------------------------------------------

    canonical           JSONB NOT NULL,

    source              JSONB,
    retrieval           JSONB,
    raw_source          JSONB,
    platform_data       JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT events_platform_post_unique
        UNIQUE (platform, platform_post_id)
);

CREATE INDEX idx_events_collection
    ON events(collection_id);

CREATE INDEX idx_events_author
    ON events(author_id);

CREATE INDEX idx_events_platform_time
    ON events(platform, published_at DESC);

CREATE INDEX idx_events_observed_at
    ON events(observed_at DESC);

CREATE INDEX idx_events_fingerprint
    ON events(content_fingerprint);

CREATE INDEX idx_events_reply_target
    ON events(reply_to_author_id);

CREATE INDEX idx_events_quote_target
    ON events(quote_of_id);

CREATE INDEX idx_events_forward_target
    ON events(forward_of_id);


-- ============================================================================
-- 5. TREND ↔ EVENT
-- ============================================================================
--
-- Associates immutable events with trends.
--
-- This is what allows the same event to participate in multiple trend
-- contexts without duplicating the event itself.
--
-- ============================================================================

CREATE TABLE trend_events (
    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    event_id            UUID NOT NULL
                        REFERENCES events(id)
                        ON DELETE CASCADE,

    collection_id       UUID NOT NULL
                        REFERENCES collections(id)
                        ON DELETE CASCADE,

    first_seen_at       TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (trend_id, event_id)
);

CREATE INDEX idx_trend_events_collection
    ON trend_events(collection_id);

CREATE INDEX idx_trend_events_trend_time
    ON trend_events(trend_id, first_seen_at DESC);

CREATE INDEX idx_trend_events_event
    ON trend_events(event_id);


-- ============================================================================
-- 6. TREND SNAPSHOTS
-- ============================================================================
--
-- Analytical state of a trend at a specific point in time.
--
-- This is the raw analytical time-series layer.
--
-- Do NOT store:
--
--   growth_rate
--   velocity
--   acceleration
--
-- here. Those are derived metrics.
--
-- ============================================================================

CREATE TABLE trend_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    collection_id       UUID NOT NULL
                        REFERENCES collections(id)
                        ON DELETE SET NULL,

    captured_at         TIMESTAMPTZ NOT NULL,

    rank                INTEGER,
    score               NUMERIC(12, 4),
    tier                TEXT,

    post_count          BIGINT NOT NULL DEFAULT 0,
    unique_authors      BIGINT NOT NULL DEFAULT 0,

    likes               BIGINT NOT NULL DEFAULT 0,
    replies             BIGINT NOT NULL DEFAULT 0,
    reposts             BIGINT NOT NULL DEFAULT 0,
    quotes              BIGINT NOT NULL DEFAULT 0,

    reach               BIGINT NOT NULL DEFAULT 0,

    latest_event_at     TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT trend_snapshot_collection_unique
        UNIQUE (trend_id, collection_id),

    CONSTRAINT trend_snapshot_time_unique
        UNIQUE (trend_id, captured_at)
);

CREATE INDEX idx_snapshots_trend_time
    ON trend_snapshots(trend_id, captured_at DESC);

CREATE INDEX idx_snapshots_collection
    ON trend_snapshots(collection_id);


-- ============================================================================
-- 7. SENTIMENT SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_sentiment_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    positive_count          BIGINT NOT NULL DEFAULT 0,
    neutral_count           BIGINT NOT NULL DEFAULT 0,
    negative_count          BIGINT NOT NULL DEFAULT 0,

    positive_percentage     NUMERIC(7, 4),
    neutral_percentage      NUMERIC(7, 4),
    negative_percentage     NUMERIC(7, 4),

    polarity_index          NUMERIC(8, 5),

    data                    JSONB
);


-- ============================================================================
-- 8. DEMOGRAPHIC SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_demographic_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    age_distribution        JSONB,
    professional_interests  JSONB,

    data                    JSONB
);


-- ============================================================================
-- 9. REGIONAL SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_regional_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    country                 TEXT,
    top_region              TEXT,

    regions                 JSONB,

    data                    JSONB
);


-- ============================================================================
-- 10. LANGUAGE SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_language_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    dominant_language       TEXT,

    languages               JSONB,

    data                    JSONB
);


-- ============================================================================
-- 11. PLATFORM SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_platform_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    dominant_platform       TEXT,

    platforms               JSONB,

    data                    JSONB
);


-- ============================================================================
-- 12. NETWORK SNAPSHOTS
-- ============================================================================

CREATE TABLE trend_network_snapshots (
    snapshot_id             UUID PRIMARY KEY
                            REFERENCES trend_snapshots(id)
                            ON DELETE CASCADE,

    nodes                   BIGINT NOT NULL DEFAULT 0,
    edges                   BIGINT NOT NULL DEFAULT 0,
    communities             INTEGER NOT NULL DEFAULT 0,

    density                 NUMERIC(14, 10),

    top_influencer_author_id UUID
                            REFERENCES authors(id)
                            ON DELETE SET NULL,

    top_influencer_score    NUMERIC(8, 4),

    relationship_counts     JSONB,
    propagation             JSONB,

    data                    JSONB
);

CREATE INDEX idx_network_snapshot_top_influencer
    ON trend_network_snapshots(top_influencer_author_id);


-- ============================================================================
-- 13. NETWORK RELATIONSHIPS
-- ============================================================================
--
-- Immutable relationship evidence.
--
-- Supported types:
--
--   follow
--   like
--   mention
--   reply
--   quote
--   repost
--
-- IMPORTANT:
--
-- We do NOT fabricate relationships from aggregate metrics.
--
-- For example:
--
--   author_followers = 10,000
--
-- does NOT produce 10,000 follower edges.
--
-- An edge exists only when an actual relationship record identifies source
-- and target.
--
-- ============================================================================

CREATE TABLE network_relationships (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    collection_id       UUID NOT NULL
                        REFERENCES collections(id)
                        ON DELETE CASCADE,

    event_id            UUID
                        REFERENCES events(id)
                        ON DELETE SET NULL,

    source_author_id    UUID
                        REFERENCES authors(id)
                        ON DELETE SET NULL,

    target_author_id    UUID
                        REFERENCES authors(id)
                        ON DELETE SET NULL,

    -- Preserve IDs even when the corresponding author hasn't been observed.
    source_external_id  TEXT,
    target_external_id  TEXT,

    platform            TEXT NOT NULL,

    relationship_type   TEXT NOT NULL
                        CHECK (
                            relationship_type IN (
                                'follow',
                                'like',
                                'mention',
                                'reply',
                                'quote',
                                'repost'
                            )
                        ),

    occurred_at         TIMESTAMPTZ,

    metadata            JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_network_relationships_collection
    ON network_relationships(collection_id);

CREATE INDEX idx_network_relationships_source
    ON network_relationships(source_author_id);

CREATE INDEX idx_network_relationships_target
    ON network_relationships(target_author_id);

CREATE INDEX idx_network_relationships_type
    ON network_relationships(relationship_type);

CREATE INDEX idx_network_relationships_time
    ON network_relationships(occurred_at DESC);

CREATE INDEX idx_network_relationships_platform
    ON network_relationships(platform);


-- ============================================================================
-- 14. TREND HISTORY
-- ============================================================================
--
-- Append-only lifecycle history.
--
-- Example:
--
--   active → cooling
--   cooling → dormant
--   dormant → active
--
-- ============================================================================

CREATE TABLE trend_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    from_status         TEXT,

    to_status           TEXT NOT NULL,

    changed_at          TIMESTAMPTZ NOT NULL,

    snapshot_id         UUID
                        REFERENCES trend_snapshots(id)
                        ON DELETE SET NULL,

    reason              JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trend_history_trend_time
    ON trend_history(trend_id, changed_at DESC);


-- ============================================================================
-- 15. TREND METRIC ROLLUPS
-- ============================================================================

CREATE TABLE trend_metric_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL
                        CHECK (
                            granularity IN (
                                '6h',
                                '1d',
                                '7d',
                                '30d'
                            )
                        ),

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    mentions            BIGINT NOT NULL DEFAULT 0,
    unique_authors      BIGINT NOT NULL DEFAULT 0,

    likes               BIGINT NOT NULL DEFAULT 0,
    replies             BIGINT NOT NULL DEFAULT 0,
    reposts             BIGINT NOT NULL DEFAULT 0,
    quotes              BIGINT NOT NULL DEFAULT 0,

    reach               BIGINT NOT NULL DEFAULT 0,

    average_score       NUMERIC(12, 4),
    peak_score          NUMERIC(12, 4),

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (trend_id, granularity, bucket_start)
);

CREATE INDEX idx_metric_rollups_lookup
    ON trend_metric_rollups(trend_id, granularity, bucket_start DESC);


-- ============================================================================
-- 16. SENTIMENT ROLLUPS
-- ============================================================================

CREATE TABLE trend_sentiment_rollups (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id                UUID NOT NULL
                            REFERENCES trends(id)
                            ON DELETE CASCADE,

    granularity             TEXT NOT NULL,

    bucket_start            TIMESTAMPTZ NOT NULL,
    bucket_end              TIMESTAMPTZ NOT NULL,

    positive_count          BIGINT NOT NULL DEFAULT 0,
    neutral_count           BIGINT NOT NULL DEFAULT 0,
    negative_count          BIGINT NOT NULL DEFAULT 0,

    positive_percentage     NUMERIC(7, 4),
    neutral_percentage      NUMERIC(7, 4),
    negative_percentage     NUMERIC(7, 4),

    polarity_index          NUMERIC(8, 5),

    data                    JSONB,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (trend_id, granularity, bucket_start)
);

CREATE INDEX idx_sentiment_rollups_lookup
    ON trend_sentiment_rollups(trend_id, granularity, bucket_start DESC);


-- ============================================================================
-- 17. REGIONAL ROLLUPS
-- ============================================================================

CREATE TABLE trend_regional_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL,

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    country             TEXT,
    region              TEXT NOT NULL,

    event_count         BIGINT NOT NULL DEFAULT 0,
    author_count        BIGINT NOT NULL DEFAULT 0,

    percentage          NUMERIC(7, 4),

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        granularity,
        bucket_start,
        country,
        region
    )
);

CREATE INDEX idx_regional_rollups_lookup
    ON trend_regional_rollups(trend_id, granularity, bucket_start DESC);

CREATE INDEX idx_regional_rollups_region
    ON trend_regional_rollups(region);


-- ============================================================================
-- 18. AGE ROLLUPS
-- ============================================================================

CREATE TABLE trend_age_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL,

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    age_bracket         TEXT NOT NULL,

    count               BIGINT NOT NULL DEFAULT 0,
    percentage          NUMERIC(7, 4),

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        granularity,
        bucket_start,
        age_bracket
    )
);

CREATE INDEX idx_age_rollups_lookup
    ON trend_age_rollups(trend_id, granularity, bucket_start DESC);


-- ============================================================================
-- 19. LANGUAGE ROLLUPS
-- ============================================================================

CREATE TABLE trend_language_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL,

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    language            TEXT NOT NULL,

    count               BIGINT NOT NULL DEFAULT 0,
    percentage          NUMERIC(7, 4),

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        granularity,
        bucket_start,
        language
    )
);

CREATE INDEX idx_language_rollups_lookup
    ON trend_language_rollups(trend_id, granularity, bucket_start DESC);


-- ============================================================================
-- 20. PLATFORM ROLLUPS
-- ============================================================================

CREATE TABLE trend_platform_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL,

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    platform            TEXT NOT NULL,

    mentions            BIGINT NOT NULL DEFAULT 0,
    reach               BIGINT NOT NULL DEFAULT 0,
    engagement          BIGINT NOT NULL DEFAULT 0,

    percentage          NUMERIC(7, 4),

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        granularity,
        bucket_start,
        platform
    )
);

CREATE INDEX idx_platform_rollups_lookup
    ON trend_platform_rollups(trend_id, granularity, bucket_start DESC);

CREATE INDEX idx_platform_rollups_platform
    ON trend_platform_rollups(platform);


-- ============================================================================
-- 21. NETWORK NODE ROLLUPS
-- ============================================================================
--
-- Deliberately NOT generated on every polling cycle.
--
-- These are analytical network snapshots at rollup granularity.
--
-- ============================================================================

CREATE TABLE trend_network_node_rollups (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id                UUID NOT NULL
                            REFERENCES trends(id)
                            ON DELETE CASCADE,

    author_id               UUID NOT NULL
                            REFERENCES authors(id)
                            ON DELETE CASCADE,

    granularity             TEXT NOT NULL,

    bucket_start            TIMESTAMPTZ NOT NULL,
    bucket_end              TIMESTAMPTZ NOT NULL,

    influence_score         NUMERIC(8, 4),

    rank                    INTEGER,
    tier                    TEXT,

    degree                  BIGINT,
    in_degree               BIGINT,
    out_degree              BIGINT,

    weighted_degree         NUMERIC(14, 4),
    weighted_in_degree      NUMERIC(14, 4),
    weighted_out_degree     NUMERIC(14, 4),

    betweenness             NUMERIC(14, 8),
    page_rank               NUMERIC(14, 10),

    community_id            TEXT,

    mentions_received      BIGINT NOT NULL DEFAULT 0,
    replies_received       BIGINT NOT NULL DEFAULT 0,
    quotes_received        BIGINT NOT NULL DEFAULT 0,
    reposts_received       BIGINT NOT NULL DEFAULT 0,
    likes_received         BIGINT NOT NULL DEFAULT 0,
    follows_received       BIGINT NOT NULL DEFAULT 0,

    data                    JSONB,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        author_id,
        granularity,
        bucket_start
    )
);

CREATE INDEX idx_network_node_rollups_lookup
    ON trend_network_node_rollups(
        trend_id,
        granularity,
        bucket_start DESC
    );

CREATE INDEX idx_network_node_rollups_author
    ON trend_network_node_rollups(author_id);

CREATE INDEX idx_network_node_rollups_influence
    ON trend_network_node_rollups(
        trend_id,
        influence_score DESC
    );


-- ============================================================================
-- 22. NETWORK EDGE ROLLUPS
-- ============================================================================

CREATE TABLE trend_network_edge_rollups (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    trend_id            UUID NOT NULL
                        REFERENCES trends(id)
                        ON DELETE CASCADE,

    source_author_id    UUID NOT NULL
                        REFERENCES authors(id)
                        ON DELETE CASCADE,

    target_author_id    UUID NOT NULL
                        REFERENCES authors(id)
                        ON DELETE CASCADE,

    granularity         TEXT NOT NULL,

    bucket_start        TIMESTAMPTZ NOT NULL,
    bucket_end          TIMESTAMPTZ NOT NULL,

    weight              BIGINT NOT NULL DEFAULT 0,

    follows             BIGINT NOT NULL DEFAULT 0,
    likes               BIGINT NOT NULL DEFAULT 0,
    mentions            BIGINT NOT NULL DEFAULT 0,
    replies             BIGINT NOT NULL DEFAULT 0,
    quotes              BIGINT NOT NULL DEFAULT 0,
    reposts             BIGINT NOT NULL DEFAULT 0,

    data                JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        trend_id,
        source_author_id,
        target_author_id,
        granularity,
        bucket_start
    )
);

CREATE INDEX idx_network_edge_rollups_lookup
    ON trend_network_edge_rollups(
        trend_id,
        granularity,
        bucket_start DESC
    );

CREATE INDEX idx_network_edge_rollups_pair
    ON trend_network_edge_rollups(
        source_author_id,
        target_author_id
    );


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
