/**
 * auditor.js — Automated Cron Integrity Auditor
 *
 * Background audit daemon that:
 *   1. Scans PostgreSQL trend records on a recurring cron schedule.
 *   2. Recomputes field-level leaves and Merkle roots from current database rows.
 *   3. Queries Polygon smart contract ON-CHAIN to verify authentic root.
 *      (Never trusts local DB alone — an attacker editing PostgreSQL will be caught).
 *   4. On mismatch:
 *      - Emits a CRITICAL security alert.
 *      - Identifies the exact tampered fields (e.g. virality_tier altered).
 *      - Logs an alert record into PostgreSQL `integrity_alerts` table.
 *
 * Usage:
 *   node blockchain/auditor.js --once       # Run single audit pass
 *   node blockchain/auditor.js --daemon     # Run continuous background auditor (every 60s)
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { Client } = require("pg");
const { getAnchorer } = require("./anchorer");

const DEFAULT_AUDIT_INTERVAL_SEC = parseInt(
  process.env.AUDIT_INTERVAL_SEC || "60",
  10,
);

class CronAuditor {
  constructor(opts = {}) {
    this._databaseUrl = opts.databaseUrl || process.env.DATABASE_URL;
    this._intervalMs =
      (opts.intervalSec || DEFAULT_AUDIT_INTERVAL_SEC) * 1000;
    this._anchorer = opts.anchorer || getAnchorer();
    this._timer = null;
    this._isRunning = false;
  }

  async _getDbClient() {
    const client = new Client({ connectionString: this._databaseUrl });
    await client.connect();
    return client;
  }

  /**
   * Run a single comprehensive audit cycle across anchored trends.
   */
  async runAuditCycle(limit = 10) {
    console.log(
      `\n[Auditor] 🔍 Starting automated on-chain audit cycle (scanning up to ${limit} records)...`,
    );

    const client = await this._getDbClient();
    let totalChecked = 0;
    let totalIntact = 0;
    let totalTampered = 0;

    try {
      // Fetch recent records from blockchain_anchors
      const anchorsRes = await client.query(
        `
        SELECT id, snapshot_id, trend_label, merkle_root, merkle_proof, snapshot_root, field_proofs, tx_hash, block_number, captured_at
        FROM blockchain_anchors
        WHERE merkle_root IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $1;
      `,
        [limit],
      );

      if (anchorsRes.rows.length === 0) {
        console.log("[Auditor] ℹ️ No anchored records found in database to audit.");
        return { totalChecked: 0, totalIntact: 0, totalTampered: 0 };
      }

      for (const anchor of anchorsRes.rows) {
        totalChecked++;

        // Fetch corresponding active database record
        const analyticsRes = await client.query(
          `SELECT * FROM trend_analytics WHERE trend_label = $1 OR id = $2 LIMIT 1`,
          [anchor.trend_label, anchor.snapshot_id],
        );

        const dbRow = analyticsRes.rows[0];
        const analyticsObj = dbRow?.analytics || {};
        const snapshotObj = { id: anchor.snapshot_id || dbRow?.id || 0 };
        const trendObj = { canonical_label: anchor.trend_label };
        const collectionObj = { observed_at: anchor.captured_at || new Date() };
        const configHash =
          process.env.CURRENT_CONFIG_HASH ||
          "0x54642dde57e228615bf92a2353519264de307402e23dfb07fe0f082837e9dcfa";

        // Cryptographically recompute and verify directly against Polygon
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

        if (result.valid) {
          totalIntact++;
          console.log(
            `   ✅ [INTACT] Trend '${anchor.trend_label}' (Snapshot #${anchor.snapshot_id}) verified on Polygon (Root: ${anchor.merkle_root.slice(0, 14)}…)`,
          );
        } else {
          totalTampered++;

          // 🚨 CRITICAL SECURITY ALERT: On-chain root divergence
          console.error(
            `\n   🚨🚨🚨 [SECURITY ALERT] TAMPERING DETECTED! 🚨🚨🚨`,
          );
          console.error(`   Trend Label : ${anchor.trend_label}`);
          console.error(`   Snapshot ID : ${anchor.snapshot_id}`);
          console.error(`   On-Chain    : ${anchor.merkle_root}`);
          console.error(`   Computed    : ${result.batchRoot || "N/A"}`);

          if (result.tamperedFields?.length > 0) {
            console.error(`   Altered Fields (${result.tamperedFields.length}):`);
            for (const f of result.tamperedFields) {
              console.error(
                `      ❌ ${f.field}: Expected '${f.expectedValue}' → Found '${f.actualValue}'`,
              );
            }
          }

          // Persist alert to PostgreSQL integrity_alerts table
          await client.query(
            `
            INSERT INTO integrity_alerts
              (snapshot_id, trend_label, alert_type, severity, tampered_fields, intact_fields, on_chain_root, computed_root, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
            [
              anchor.snapshot_id,
              anchor.trend_label,
              "TAMPER_DETECTED",
              "CRITICAL",
              JSON.stringify(result.tamperedFields || []),
              JSON.stringify(result.intactFields || []),
              anchor.merkle_root,
              result.batchRoot || null,
              JSON.stringify({
                method: result.method,
                detectedAt: new Date().toISOString(),
                txHash: anchor.tx_hash,
              }),
            ],
          );
          console.error(`   ✓ Alert logged into 'integrity_alerts' table for dashboard review.\n`);
        }
      }

      console.log(
        `[Auditor] 🏁 Cycle complete: Checked=${totalChecked} | Intact=${totalIntact} | Tampered=${totalTampered}\n`,
      );

      return { totalChecked, totalIntact, totalTampered };
    } finally {
      await client.end();
    }
  }

  /**
   * Start recurring background cron daemon.
   */
  startDaemon() {
    if (this._isRunning) return;
    this._isRunning = true;

    console.log(
      `[Auditor] 🚀 Background integrity cron daemon started. Interval: ${this._intervalMs / 1000}s`,
    );

    // Initial run
    this.runAuditCycle().catch((err) => {
      console.error(`[Auditor] Audit cycle failed: ${err.message}`);
    });

    // Schedule recurring
    this._timer = setInterval(() => {
      this.runAuditCycle().catch((err) => {
        console.error(`[Auditor] Audit cycle failed: ${err.message}`);
      });
    }, this._intervalMs);

    if (this._timer.unref) {
      this._timer.unref();
    }
  }

  stopDaemon() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._isRunning = false;
    console.log("[Auditor] 🛑 Background integrity auditor stopped.");
  }
}

// =============================================================================
// CLI Execution
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const auditor = new CronAuditor();

  if (args.includes("--once")) {
    auditor
      .runAuditCycle()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    // Default to daemon mode
    auditor.startDaemon();

    process.on("SIGINT", () => {
      auditor.stopDaemon();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      auditor.stopDaemon();
      process.exit(0);
    });
  }
}

module.exports = { CronAuditor };
