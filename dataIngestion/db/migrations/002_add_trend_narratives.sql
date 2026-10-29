-- ============================================================================
-- 002_add_trend_narratives.sql
-- Single row per trend storing the narrative pool in a JSONB array
-- ============================================================================

CREATE TABLE IF NOT EXISTS trend_narratives (
    trend_label     TEXT PRIMARY KEY,
    narratives      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
