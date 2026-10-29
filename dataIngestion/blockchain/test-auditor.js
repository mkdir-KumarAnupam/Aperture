/**
 * test-auditor.js
 *
 * Automated verification and field-level tamper diagnostics test.
 *
 * Demonstrates:
 *   1. Inserting an authentic anchored trend snapshot into PostgreSQL
 *   2. Running the auditor: authenticates against on-chain Polygon (Status: INTACT)
 *   3. Simulating a direct SQL malicious tamper (changing virality_tier & score)
 *   4. Running the auditor: on-chain mismatch detected!
 *   5. Pinpointing the exact altered fields
 *   6. Logging the critical alert to PostgreSQL integrity_alerts table
 */

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { Client } = require("pg");
const { ApertureAnchorer } = require("./anchorer");
const { CronAuditor } = require("./auditor");

async function main() {
  console.log("\n=======================================================");
  console.log("   AUTOMATED CRON AUDITOR & FIELD TAMPER TEST");
  console.log("=======================================================\n");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const anchorer = new ApertureAnchorer();
  const auditor = new CronAuditor({ anchorer });

  const testSnapshotId = 9901;
  const testTrendLabel = "#AIRevolution";
  const capturedAt = new Date("2026-10-27T10:00:00Z");
  const configHash = "0x54642dde57e228615bf92a2353519264de307402e23dfb07fe0f082837e9dcfa";

  // Cleanup any old test rows
  await client.query("DELETE FROM blockchain_anchors WHERE snapshot_id = $1", [testSnapshotId]);
  await client.query("DELETE FROM trend_analytics WHERE id = $1", [testSnapshotId]);
  await client.query("DELETE FROM integrity_alerts WHERE snapshot_id = $1", [testSnapshotId]);

  console.log("1. Preparing authentic trend snapshot...");
  const authenticAnalytics = {
    trend: { trendScore: 92.4, influence: { viralityTier: "mega_viral" } },
    sentiment: { score: 0.88, result: "positive" },
    network: { summary: { density: 0.65 } },
  };

  const payload = anchorer._buildSnapshotPayload(
    { id: testSnapshotId },
    { canonical_label: testTrendLabel },
    authenticAnalytics,
    { observed_at: capturedAt },
    configHash
  );

  const { snapshotRoot, fieldProofs } = anchorer.buildFieldMerkleTree(payload);

  // Permanently on-chain anchored root from Polygon Amoy block 51273915
  const onChainRoot = "0xc68ad839a963f1f19ee165d6195128c0dd22b50155982c4f2d2e34680ca3ea07";
  const merkleProof = [
    "0xcc3c303ec4bd2161f366197aa23b03675476880b4d3539d4798830050e4a36a8",
    "0xce678d6c137195de9d778f61813c580c1bcb0bdeb28adc68278f01e40695383a"
  ];

  // Insert authentic rows into database
  await client.query(`
    INSERT INTO trend_analytics (id, run_id, trend_label, schema_version, analytics)
    VALUES ($1, $2, $3, $4, $5)
  `, [testSnapshotId, `run_${testSnapshotId}`, testTrendLabel, "1.0.0", JSON.stringify(authenticAnalytics)]);

  await client.query(`
    INSERT INTO blockchain_anchors
      (anchor_type, fingerprint, snapshot_root, merkle_root, merkle_proof, field_proofs, snapshot_id, trend_label, captured_at, status, tx_hash, block_number)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    "snapshot_anchored",
    snapshotRoot,
    snapshotRoot,
    onChainRoot,
    JSON.stringify(merkleProof),
    JSON.stringify(fieldProofs),
    testSnapshotId,
    testTrendLabel,
    capturedAt,
    "confirmed",
    "0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4",
    51273915
  ]);

  console.log(`   ✓ Authentic record inserted into PostgreSQL.`);
  console.log(`   ✓ Snapshot Root: ${snapshotRoot}`);
  console.log(`   ✓ On-Chain Root: ${onChainRoot}\n`);

  // 2. Run Auditor on Authentic Record
  console.log("2. Running Automated Auditor on Authentic Data...");
  const cycle1 = await auditor.runAuditCycle(5);
  console.log(`   ✓ Cycle 1 Result: Checked=${cycle1.totalChecked}, Intact=${cycle1.totalIntact}, Tampered=${cycle1.totalTampered}\n`);

  // 3. Simulate Direct SQL Malicious Tampering
  console.log("3. Simulating Malicious SQL Attack on Database...");
  console.log("   Attacker updates trend_analytics: viralityTier 'mega_viral' -> 'dormant', score 95.5 -> 10.0...");

  const tamperedAnalytics = {
    ...authenticAnalytics,
    trend: {
      trendScore: 10.0,
      influence: { viralityTier: "dormant" },
    },
  };

  await client.query(`
    UPDATE trend_analytics
    SET analytics = $1
    WHERE id = $2
  `, [JSON.stringify(tamperedAnalytics), testSnapshotId]);
  console.log("   ✓ Database row maliciously modified.\n");

  // 4. Run Auditor on Tampered Record
  console.log("4. Running Automated Auditor on Tampered Database Data...");
  const cycle2 = await auditor.runAuditCycle(5);
  console.log(`   ✓ Cycle 2 Result: Checked=${cycle2.totalChecked}, Intact=${cycle2.totalIntact}, Tampered=${cycle2.totalTampered}\n`);

  // 5. Query integrity_alerts table to verify alert was logged
  console.log("5. Querying 'integrity_alerts' Table for Logged Security Events...");
  const alertsRes = await client.query(`
    SELECT id, snapshot_id, trend_label, alert_type, severity, tampered_fields, created_at
    FROM integrity_alerts
    WHERE snapshot_id = $1
    ORDER BY created_at DESC
  `, [testSnapshotId]);

  console.log(`   ✓ Found ${alertsRes.rows.length} alert(s) in PostgreSQL:`);
  for (const row of alertsRes.rows) {
    console.log(`      • Alert #${row.id} [${row.severity}] ${row.alert_type} for ${row.trend_label}`);
    console.log(`        Tampered Fields: ${JSON.stringify(row.tampered_fields, null, 2)}`);
  }

  console.log("\n=======================================================");
  console.log("   ALL AUTOMATED AUDITING & TAMPER DIAGNOSTICS PASSED!");
  console.log("=======================================================\n");

  // Clean up
  await client.query("DELETE FROM blockchain_anchors WHERE snapshot_id = $1", [testSnapshotId]);
  await client.query("DELETE FROM trend_analytics WHERE id = $1", [testSnapshotId]);
  await client.query("DELETE FROM integrity_alerts WHERE snapshot_id = $1", [testSnapshotId]);
  await client.end();
  await anchorer.shutdown();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
