-- ============================================================================
-- Migration 004: Field-Level Merkle Proofs & Automated Integrity Alerts
--
-- Adds:
--   1. field_proofs & snapshot_root to blockchain_anchors for field-level tamper diagnostics
--   2. integrity_alerts table for the automated cron auditor to log security events
-- ============================================================================

ALTER TABLE blockchain_anchors
  ADD COLUMN IF NOT EXISTS snapshot_root VARCHAR(66),
  ADD COLUMN IF NOT EXISTS field_proofs JSONB;

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_snapshot_root
  ON blockchain_anchors (snapshot_root)
  WHERE snapshot_root IS NOT NULL;

CREATE TABLE IF NOT EXISTS integrity_alerts (
  id              SERIAL PRIMARY KEY,
  snapshot_id     INTEGER,
  trend_label     TEXT,
  alert_type      VARCHAR(50)   NOT NULL DEFAULT 'TAMPER_DETECTED',
  severity        VARCHAR(20)   NOT NULL DEFAULT 'CRITICAL',
  tampered_fields JSONB         NOT NULL,
  intact_fields   JSONB,
  on_chain_root   VARCHAR(66),
  computed_root   VARCHAR(66),
  details         JSONB,
  resolved        BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrity_alerts_snapshot_id
  ON integrity_alerts (snapshot_id)
  WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integrity_alerts_trend_label
  ON integrity_alerts (trend_label)
  WHERE trend_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integrity_alerts_created_at
  ON integrity_alerts (created_at);
