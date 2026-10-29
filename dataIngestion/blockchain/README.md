# Aperture — Blockchain Data Integrity & Verification Layer

> **The Problem:** Social media analytics pipelines compute critical virality, sentiment, and network centrality scores used for decision-making and narrative intelligence. In standard architectures, this data resides in relational databases (PostgreSQL). If an attacker or compromised internal process modifies a trend's virality metrics from `dormant` to `mega_viral`, conventional systems have no cryptographic mechanism to prove that the data was altered after observation.
>
> **The Solution:** A two-tier hierarchical cryptographic notary anchored to the **Polygon PoS Blockchain (Amoy Testnet)**:
> 1. **Per-Snapshot Field-Level Merkle Tree:** Every analytical metric is hashed as an individual leaf in a per-snapshot Merkle tree, enabling mathematical proof of **which exact fields were altered** (e.g., *"virality tier altered: expected 'mega_viral' → found 'dormant'"*).
> 2. **Batch Merkle Tree ($O(1)$ On-Chain Anchoring):** Snapshot roots across a batch interval are aggregated into a batch Merkle tree. Only the single 32-byte Merkle root is broadcast to the Polygon smart contract (`ApertureRegistry.sol`), achieving $O(1)$ gas costs while preserving cryptographic membership proofs for every snapshot.
> 3. **Automated Continuous Auditor (`auditor.js`):** An independent daemon recomputes hashes directly from active PostgreSQL rows, validates them against the Polygon contract (never trusting local tables alone), and generates alerts upon detecting root divergence.
>
> 🔒 **Privacy Guarantee:** *Zero user PII (usernames, raw text, media) is transmitted to the blockchain. Only mathematical 32-byte Keccak-256 hashes and Merkle roots are anchored.*

---

## 🏛️ Cryptographic Architecture

```mermaid
graph TD
    subgraph Tier 1: Per-Snapshot Field-Level Merkle Tree
        F1["virality_tier"] --> L1["Leaf 1"]
        F2["virality_score"] --> L2["Leaf 2"]
        F3["sentiment_score"] --> L3["Leaf 3"]
        F4["centrality_score"] --> L4["Leaf 4"]
        F5["trend_label"] --> L5["Leaf 5"]
        L1 & L2 & L3 & L4 & L5 --> SR["Snapshot Root (Fingerprint)"]
    end

    subgraph Tier 2: Batch-Level Merkle Tree
        SR --> B1["Leaf 0 (Snapshot A)"]
        S2["Snapshot B Root"] --> B2["Leaf 1 (Snapshot B)"]
        S3["Snapshot C Root"] --> B3["Leaf 2 (Snapshot C)"]
        B1 & B2 & B3 --> MR["Batch Merkle Root (32 bytes)"]
    end

    subgraph Polygon Blockchain (Amoy)
        MR -->|1 Tx per Batch| SC["ApertureRegistry.sol"]
    end
```

### Core Mathematical Invariants

1. **Logarithmic Verification Complexity ($O(\log_2 N)$):**
   To verify any single snapshot out of a batch of 1,000, the verifier requires only 1 database row and 10 sibling hashes (~320 bytes). The remaining 999 snapshots are never fetched or hashed.
2. **Granular Tamper Diagnostics:**
   When database tampering occurs, comparing the pre-computed field leaves against the recomputed current values pinpoints the modified attributes while proving unaffected metrics remained intact.
3. **Zero-Trust Independent Auditor:**
   An attacker with SQL write privileges could tamper with both `trend_analytics` and `blockchain_anchors`. Therefore, the auditor recalculates the hash from `trend_analytics` and queries the Polygon smart contract directly (`verifyMerkleRoot(computedRoot)`).

---

## ⚙️ Backend Services & CLI Quickstart

### 1. Environment Configuration
Verify the required variables in `dataIngestion/.env`:
```env
CONTRACT_ADDRESS="0x42d0BBab87A8E60fBa06c9461C8fc1Bd65A83285"
POLYGON_RPC_URL="https://rpc-amoy.polygon.technology,https://polygon-amoy.drpc.org"
ANCHOR_WALLET_KEY="your-private-key-here"
BLOCKCHAIN_ENABLED="true"
INTEGRITY_API_PORT="5050"
DATABASE_URL="postgresql://user:password@localhost:5432/aperture"
```

### 2. Database Migrations
Apply PostgreSQL schema updates (`blockchain_anchors`, `integrity_alerts`):
```bash
node db/migrate.js
```

### 3. Automated Continuous Auditor Daemon (`auditor.js`)
Continuously audits PostgreSQL rows against the Polygon blockchain contract:
```bash
# Run a single audit scan (useful for health checks & CI/CD)
node blockchain/auditor.js --once

# Run as a continuous background daemon (audits every 60 seconds)
node blockchain/auditor.js --daemon --interval=60000 --limit=50
```

### 4. Integrity REST Microservice (`api.js`)
Launches the standalone integrity verification server on port 5050:
```bash
node blockchain/api.js
```

### 5. Test Suites
```bash
# Test field-level Merkle tree generation & tamper diagnostics
node blockchain/test-integrity.js

# Test automated cron auditor with simulated database SQL tampering
node blockchain/test-auditor.js
```

---

## 📡 REST API Reference

The verification API is available via the standalone microservice (`http://localhost:5050`) and through the Next.js API route (`/api/integrity/verify`).

### 1. Verify Trend Integrity
`GET /api/integrity/verify?trendId=:id` or `GET /api/integrity/verify?trendLabel=:label`

#### Response: Authentic Record (`INTACT`)
```json
{
  "verified": true,
  "status": "INTACT",
  "trendLabel": "#AIRevolution",
  "snapshotId": 9901,
  "method": "field_merkle_tree",
  "badge": {
    "label": "Verified on Polygon",
    "variant": "success",
    "polygonScanUrl": "https://amoy.polygonscan.com/tx/0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4",
    "txHash": "0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4",
    "blockNumber": 51273915,
    "anchoredAt": "2026-10-27T10:00:00.000Z",
    "merkleRoot": "0xc68ad839a963f1f19ee165d6195128c0dd22b50155982c4f2d2e34680ca3ea07"
  },
  "tamperedFields": [],
  "intactFields": [
    { "field": "virality_tier", "value": "mega_viral" },
    { "field": "virality_score", "value": 92.4 },
    { "field": "sentiment_score", "value": 0.88 },
    { "field": "centrality_score", "value": 0.65 }
  ],
  "onChain": {
    "found": true,
    "anchoredAt": "2026-10-27T10:20:20.000Z"
  },
  "checkedAt": "2026-10-27T17:50:00.000Z"
}
```

#### Response: Tampered Record (`TAMPER_DETECTED`)
```json
{
  "verified": false,
  "status": "TAMPER_DETECTED",
  "trendLabel": "#AIRevolution",
  "snapshotId": 9901,
  "badge": {
    "label": "Tamper Detected",
    "variant": "danger",
    "polygonScanUrl": "https://amoy.polygonscan.com/tx/0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4",
    "merkleRoot": "0xc68ad839a963f1f19ee165d6195128c0dd22b50155982c4f2d2e34680ca3ea07"
  },
  "tamperedFields": [
    {
      "field": "virality_tier",
      "expectedValue": "mega_viral",
      "actualValue": "dormant"
    },
    {
      "field": "virality_score",
      "expectedValue": 92.4,
      "actualValue": 10
    }
  ],
  "intactFields": [
    { "field": "sentiment_score", "value": 0.88 },
    { "field": "centrality_score", "value": 0.65 }
  ],
  "checkedAt": "2026-10-27T17:50:00.000Z"
}
```

### 2. Security Alerts
`GET /api/integrity/alerts?limit=20`  
Returns recent tampering incidents detected and logged by the continuous auditor.

### 3. Integrity Metrics
`GET /api/integrity/stats`  
Returns operational statistics (total snapshots anchored, batches flushed, active alerts, and contract status).

---

## 🖥️ Frontend Integration

Frontend implementations are integrated directly into the web application:
- **Badge Component:** `web/src/app/components/VerifiedBadge.tsx` displays the on-chain verification badge and Polygonscan link.
- **Public Audit Page:** `web/src/app/verify/page.tsx` provides a public interface allowing users and auditors to verify trend IDs or labels against the Polygon smart contract.
- **API Proxy Route:** `web/src/app/api/integrity/verify/route.ts` provides server-side proxying and fallback resolution.

---

## 🔍 Smart Contract Deployment Details

- **Contract Name:** `ApertureRegistry.sol`
- **Network:** Polygon PoS Amoy Testnet (Chain ID: `80002`)
- **Contract Address:** [`0x42d0BBab87A8E60fBa06c9461C8fc1Bd65A83285`](https://amoy.polygonscan.com/address/0x42d0BBab87A8E60fBa06c9461C8fc1Bd65A83285)
- **Verified Anchored Transaction:** [`0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4`](https://amoy.polygonscan.com/tx/0x9431d28f18f1b26b4a0391967f8f190bba54f9c0d575beea79f039cdc93309b4) (Block: `51273915`)
- **Core Methods:**
  - `anchorMerkleRoot(bytes32 merkleRoot, uint256 leafCount)`
  - `verifyMerkleRoot(bytes32 merkleRoot)`
  - `verifyProof(bytes32[] calldata proof, bytes32 merkleRoot, bytes32 leaf)`
  - `processProof(bytes32[] memory proof, bytes32 leaf)`
