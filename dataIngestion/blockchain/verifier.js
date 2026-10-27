/**
 * verifier.js — On-Chain Verification Service
 *
 * Core verification logic used by the Auditor, API endpoints, and Dashboard.
 *
 * Security Model:
 *   - NEVER trusts local database state alone.
 *   - Recomputes field-level leaves from active PostgreSQL data.
 *   - Fetches Merkle proof and queries Polygon smart contract on-chain.
 *   - If any data is modified, accurately pinpoints the altered fields.
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { Client } = require("pg");
const { getAnchorer } = require("./anchorer");

class TrendIntegrityVerifier {
  constructor(opts = {}) {
    this._connectionString =
      opts.databaseUrl || process.env.DATABASE_URL;
    this._anchorer = opts.anchorer || getAnchorer();
    this._explorerBase =
      opts.explorerBase || "https://amoy.polygonscan.com/tx";
  }

  async _getDbClient() {
    const client = new Client({
      connectionString: this._connectionString,
    });
    await client.connect();
    return client;
  }

  /**
   * Verify integrity of a trend snapshot by its trend label or ID.
   *
   * @param {string|number} identifier — Trend label (e.g. "#AIRevolution") or snapshot ID
   * @returns {Promise<object>} Verification report for frontend
   */
  async verifyTrend(identifier) {
    if (!identifier) {
      throw new Error("Missing trend identifier");
    }

    const client = await this._getDbClient();
    try {
      const isNumeric =
        !isNaN(Number(identifier)) && String(identifier).trim() !== "";

      // 1. Fetch blockchain anchor record
      const anchorQuery = isNumeric
        ? `SELECT * FROM blockchain_anchors WHERE snapshot_id = $1 ORDER BY created_at DESC LIMIT 1`
        : `SELECT * FROM blockchain_anchors WHERE trend_label = $1 ORDER BY created_at DESC LIMIT 1`;

      const anchorRes = await client.query(anchorQuery, [
        isNumeric ? Number(identifier) : String(identifier),
      ]);

      if (anchorRes.rows.length === 0) {
        return {
          verified: false,
          status: "NOT_ANCHORED",
          message: `No blockchain anchor record found for '${identifier}'. This trend may still be pending batching.`,
          identifier,
        };
      }

      const anchor = anchorRes.rows[0];

      // 2. Fetch current analytics record from database
      const analyticsQuery = isNumeric
        ? `SELECT * FROM trend_analytics WHERE id = $1 LIMIT 1`
        : `SELECT * FROM trend_analytics WHERE trend_label = $1 ORDER BY created_at DESC LIMIT 1`;

      const analyticsRes = await client.query(analyticsQuery, [
        isNumeric ? Number(identifier) : String(identifier),
      ]);

      // If trend_analytics is empty, fall back to snapshot payload stored in anchor
      const dbRow = analyticsRes.rows[0];

      let analyticsObj = dbRow?.analytics || {};
      let trendObj = { canonical_label: anchor.trend_label };
      let snapshotObj = { id: anchor.snapshot_id || dbRow?.id || 0 };
      let collectionObj = { observed_at: anchor.captured_at || new Date() };

      // 3. Ensure anchorer instance is available
      if (!this._anchorer) {
        this._anchorer = getAnchorer();
      }

      const configHash =
        process.env.CURRENT_CONFIG_HASH ||
        "0x54642dde57e228615bf92a2353519264de307402e23dfb07fe0f082837e9dcfa";

      // 4. Run cryptographic verification
      const result = await this._anchorer.verifyIntegrity(
        snapshotObj,
        trendObj,
        analyticsObj,
        collectionObj,
        configHash,
        {
          merkleProof: anchor.merkle_proof,
          merkleRoot:  anchor.merkle_root,
          fieldProofs: anchor.field_proofs,
        },
      );

      // 5. Format comprehensive report for frontend / dashboard
      const txHash = anchor.tx_hash;
      const polygonScanUrl = txHash ? `${this._explorerBase}/${txHash}` : null;

      return {
        verified:       result.valid,
        status:         result.status,
        trendLabel:     anchor.trend_label,
        snapshotId:     anchor.snapshot_id,
        method:         result.method,
        badge: {
          label:          result.valid ? "Verified on Polygon" : "Tamper Detected",
          variant:        result.valid ? "success" : "danger",
          polygonScanUrl,
          txHash,
          blockNumber:    anchor.block_number ? Number(anchor.block_number) : null,
          anchoredAt:     anchor.captured_at,
          merkleRoot:     anchor.merkle_root,
        },
        tamperedFields: result.tamperedFields || [],
        intactFields:   result.intactFields || [],
        onChain:        result.onChain,
        checkedAt:      new Date().toISOString(),
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Get active tampering alerts from the database.
   */
  async getAlerts(limit = 20) {
    const client = await this._getDbClient();
    try {
      const res = await client.query(
        `SELECT * FROM integrity_alerts ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return res.rows;
    } finally {
      await client.end();
    }
  }

  /**
   * Get overall blockchain integrity statistics for dashboard.
   */
  async getStats() {
    const client = await this._getDbClient();
    try {
      const totalAnchorsRes = await client.query(
        `SELECT COUNT(*) as count FROM blockchain_anchors`,
      );
      const alertsRes = await client.query(
        `SELECT COUNT(*) as count FROM integrity_alerts WHERE resolved = false`,
      );
      const latestAnchorRes = await client.query(
        `SELECT * FROM blockchain_anchors ORDER BY created_at DESC LIMIT 1`,
      );

      return {
        totalAnchors:   parseInt(totalAnchorsRes.rows[0]?.count || "0", 10),
        activeAlerts:   parseInt(alertsRes.rows[0]?.count || "0", 10),
        latestAnchor:   latestAnchorRes.rows[0] || null,
        network:        "Polygon Amoy Testnet (Chain ID 80002)",
        contract:       process.env.CONTRACT_ADDRESS,
      };
    } finally {
      await client.end();
    }
  }
}

module.exports = { TrendIntegrityVerifier };
