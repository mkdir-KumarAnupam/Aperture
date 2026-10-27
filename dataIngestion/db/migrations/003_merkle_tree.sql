-- ============================================================================
-- Migration 003: Merkle Tree Batch Anchoring
--
-- Adds Merkle root, proof (sibling hashes), and leaf index to
-- blockchain_anchors for O(1) on-chain batch verification.
-- ============================================================================

ALTER TABLE blockchain_anchors
  ADD COLUMN IF NOT EXISTS merkle_root VARCHAR(66),
  ADD COLUMN IF NOT EXISTS merkle_proof JSONB,
  ADD COLUMN IF NOT EXISTS leaf_index INTEGER;

-- Index for fast lookup by Merkle root
CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_merkle_root
  ON blockchain_anchors (merkle_root)
  WHERE merkle_root IS NOT NULL;
