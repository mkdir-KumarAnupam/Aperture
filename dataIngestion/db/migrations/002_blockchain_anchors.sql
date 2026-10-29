-- ============================================================================
-- Migration 002: Blockchain Anchors — Local audit log
--
-- Purpose:
--   Every time the Aperture pipeline writes to the blockchain (snapshot anchor,
--   config registration, CIB report), a corresponding row is written here.
--   This allows:
--     1. Offline verification — check what was anchored without querying the chain
--     2. Reconciliation — detect missed anchors after outages
--     3. Dashboard queries — show blockchain activity in the frontend
--     4. Debugging — trace any anchor back to its source data
--
-- This table is WRITE-ONLY from the pipeline's perspective.
-- Reads are for verification and reporting only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS blockchain_anchors (
  id              SERIAL PRIMARY KEY,

  -- Type of anchor: 'snapshot', 'config', 'cib'
  anchor_type     VARCHAR(20)   NOT NULL,

  -- The fingerprint/hash that was anchored (0x + 64 hex chars = 66 chars)
  fingerprint     VARCHAR(66)   NOT NULL,

  -- On-chain transaction details (null if duplicate/already-anchored)
  tx_hash         VARCHAR(66),
  block_number    BIGINT,

  -- Contextual references
  snapshot_id     INTEGER,
  trend_label     TEXT,
  platform        VARCHAR(20),
  captured_at     TIMESTAMPTZ,

  -- Batch info (1 = individual anchor, >1 = part of a batch tx)
  batch_size      INTEGER       NOT NULL DEFAULT 1,

  -- Status: 'confirmed', 'failed', 'duplicate'
  status          VARCHAR(20)   NOT NULL DEFAULT 'confirmed',

  -- When this audit record was created
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- Fast lookup by fingerprint (verification)
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_fingerprint
  ON blockchain_anchors (fingerprint);

-- Filter by anchor type (dashboard)
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_type
  ON blockchain_anchors (anchor_type);

-- Join with trend_snapshots (reconciliation)
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_snapshot_id
  ON blockchain_anchors (snapshot_id)
  WHERE snapshot_id IS NOT NULL;

-- Filter by trend (research)
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_trend_label
  ON blockchain_anchors (trend_label)
  WHERE trend_label IS NOT NULL;

-- Time-based queries (monitoring)
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_created_at
  ON blockchain_anchors (created_at);
