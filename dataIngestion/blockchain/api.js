/**
 * api.js — Blockchain Integrity REST API Service
 *
 * Exposes lightweight REST endpoints for the frontend dashboard:
 *   - GET  /api/integrity/verify?trendId=...     Verify trend against Polygon
 *   - GET  /api/integrity/verify?trendLabel=...  Verify trend by label
 *   - GET  /api/integrity/alerts                 Get detected tampering alerts
 *   - GET  /api/integrity/stats                  Summary of blockchain anchors & alerts
 *   - POST /api/integrity/audit                  Trigger on-demand audit cycle
 *
 * Runs on port 5050 (or process.env.INTEGRITY_API_PORT).
 * Zero extra dependencies (uses built-in http module).
 */

"use strict";

const http = require("http");
const url  = require("url");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { TrendIntegrityVerifier } = require("./verifier");
const { CronAuditor }            = require("./auditor");

const PORT = parseInt(process.env.INTEGRITY_API_PORT || "5050", 10);
const verifier = new TrendIntegrityVerifier();
const auditor  = new CronAuditor();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;
  const query     = parsedUrl.query;

  try {
    // ── GET /api/integrity/verify ───────────────────────────────────────────
    if (pathname === "/api/integrity/verify" && req.method === "GET") {
      const identifier = query.trendId || query.id || query.trendLabel || query.snapshotId;

      if (!identifier) {
        return sendJson(res, 400, {
          error: "Missing required query parameter: trendId, snapshotId, or trendLabel",
          example: "/api/integrity/verify?trendId=1042 or /api/integrity/verify?trendLabel=%23AIRevolution",
        });
      }

      const report = await verifier.verifyTrend(identifier);
      return sendJson(res, 200, report);
    }

    // ── GET /api/integrity/alerts ───────────────────────────────────────────
    if (pathname === "/api/integrity/alerts" && req.method === "GET") {
      const limit  = parseInt(query.limit || "20", 10);
      const alerts = await verifier.getAlerts(limit);
      return sendJson(res, 200, { alerts, count: alerts.length });
    }

    // ── GET /api/integrity/stats ────────────────────────────────────────────
    if (pathname === "/api/integrity/stats" && req.method === "GET") {
      const stats = await verifier.getStats();
      return sendJson(res, 200, stats);
    }

    // ── POST /api/integrity/audit ───────────────────────────────────────────
    if (pathname === "/api/integrity/audit" && req.method === "POST") {
      const result = await auditor.runAuditCycle(10);
      return sendJson(res, 200, { message: "Audit cycle complete", result });
    }

    // ── Health / Default ────────────────────────────────────────────────────
    if (pathname === "/" || pathname === "/health") {
      return sendJson(res, 200, {
        status:  "online",
        service: "Aperture Blockchain Integrity API",
        network: "Polygon Amoy Testnet (Chain ID 80002)",
        contract: process.env.CONTRACT_ADDRESS,
      });
    }

    sendJson(res, 404, { error: "Endpoint not found" });
  } catch (err) {
    console.error(`[API Error] ${err.message}`);
    sendJson(res, 500, { error: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n=======================================================`);
    console.log(`  APERTURE INTEGRITY API LISTENING ON PORT ${PORT}`);
    console.log(`=======================================================`);
    console.log(`  Verify URL : http://localhost:${PORT}/api/integrity/verify?trendId=1042`);
    console.log(`  Alerts URL : http://localhost:${PORT}/api/integrity/alerts`);
    console.log(`  Stats URL  : http://localhost:${PORT}/api/integrity/stats\n`);
  });
}

module.exports = { server };
