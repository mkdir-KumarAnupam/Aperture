// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ApertureRegistry
 * @notice Public registry for Aperture's analytical integrity proofs.
 *
 * Three registries in one contract:
 *   1. Snapshot Integrity  — fingerprints of computed trend analytics
 *   2. Config Versioning   — hashes of pipeline algorithm parameters
 *   3. CIB Behavioural     — fingerprints of detected bot cluster patterns
 *
 * Deployment target: Polygon PoS (mainnet) / Polygon Amoy (testnet)
 * Gas per anchor():         ~45,000  ≈ $0.001 on Polygon mainnet
 * Gas per registerConfig(): ~30,000  ≈ $0.001
 * Gas per reportCIB():      ~55,000  ≈ $0.001
 */
contract ApertureRegistry {

    // =========================================================================
    // ACCESS CONTROL
    // Only authorised wallets (Aperture pipeline wallets) can write.
    // Anyone can read — the registry is fully public and permissionless.
    // =========================================================================

    address public owner;
    mapping(address => bool) public authorizedSubmitters;

    event SubmitterAdded(address indexed submitter);
    event SubmitterRemoved(address indexed submitter);

    modifier onlyOwner() {
        require(msg.sender == owner, "ApertureRegistry: not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || authorizedSubmitters[msg.sender],
            "ApertureRegistry: not authorized"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedSubmitters[msg.sender] = true;
    }

    function addSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = true;
        emit SubmitterAdded(submitter);
    }

    function removeSubmitter(address submitter) external onlyOwner {
        authorizedSubmitters[submitter] = false;
        emit SubmitterRemoved(submitter);
    }

    // =========================================================================
    // REGISTRY 1: SNAPSHOT INTEGRITY
    //
    // fingerprint = SHA256({
    //   snapshot_id, trend_label, captured_at,
    //   virality_score, virality_tier,
    //   sentiment_score, sentiment_result,
    //   centrality_score, config_hash
    // })
    //
    // Computed off-chain in anchorer.js — only the 32-byte hash is stored.
    // =========================================================================

    struct SnapshotAnchor {
        uint256 anchoredAt;   // block.timestamp when published (Unix seconds)
        uint256 capturedAt;   // Unix timestamp of the analysis capture
        address submitter;    // wallet that published this anchor
        string  trendLabel;   // public trend label e.g. "#AIRevolution"
    }

    /// fingerprint → anchor metadata
    mapping(bytes32 => SnapshotAnchor) private _snapshots;

    /// trend label → ordered list of fingerprints (history)
    mapping(string => bytes32[]) private _trendFingerprints;

    event SnapshotAnchored(
        bytes32 indexed fingerprint,
        string          trendLabel,
        uint256         capturedAt,
        address indexed submitter
    );

    /**
     * @notice Anchor a snapshot fingerprint on-chain.
     * @param fingerprint   SHA-256 hash of the analytical output payload.
     * @param trendLabel    The trend label (public information).
     * @param capturedAt    Unix timestamp of the analysis capture.
     */
    function anchor(
        bytes32        fingerprint,
        string calldata trendLabel,
        uint256         capturedAt
    ) external onlyAuthorized {
        require(
            _snapshots[fingerprint].anchoredAt == 0,
            "ApertureRegistry: fingerprint already anchored"
        );

        _snapshots[fingerprint] = SnapshotAnchor({
            anchoredAt: block.timestamp,
            capturedAt: capturedAt,
            submitter:  msg.sender,
            trendLabel: trendLabel
        });

        _trendFingerprints[trendLabel].push(fingerprint);

        emit SnapshotAnchored(fingerprint, trendLabel, capturedAt, msg.sender);
    }


    // =========================================================================
    // REGISTRY 1B: MERKLE TREE BATCH ANCHORING & PROOFS
    //
    // Replaces individual transaction batching:
    // Every N minutes, the pipeline aggregates snapshot hashes as leaves,
    // computes the Merkle root, and writes ONLY that single root to Polygon.
    //
    // On-chain cost: O(1) storage write regardless of batch size.
    // Any single snapshot remains provable using its Merkle proof.
    // =========================================================================

    struct MerkleRootAnchor {
        uint256 anchoredAt;   // block.timestamp when published
        uint256 leafCount;    // number of snapshots in this batch
        address submitter;    // pipeline wallet that published the root
    }

    /// merkleRoot → MerkleRootAnchor
    mapping(bytes32 => MerkleRootAnchor) private _merkleRoots;

    /// ordered history of all anchored Merkle roots
    bytes32[] public merkleRootHistory;

    event MerkleRootAnchored(
        bytes32 indexed merkleRoot,
        uint256         leafCount,
        address indexed submitter
    );

    /**
     * @notice Anchor a Merkle root representing a batch of snapshot fingerprints.
     * @param merkleRoot The 32-byte Merkle tree root hash.
     * @param leafCount  Total snapshot leaves encapsulated by this tree.
     */
    function anchorMerkleRoot(
        bytes32 merkleRoot,
        uint256 leafCount
    ) external onlyAuthorized {
        require(
            _merkleRoots[merkleRoot].anchoredAt == 0,
            "ApertureRegistry: Merkle root already anchored"
        );

        _merkleRoots[merkleRoot] = MerkleRootAnchor({
            anchoredAt: block.timestamp,
            leafCount:  leafCount,
            submitter:  msg.sender
        });

        merkleRootHistory.push(merkleRoot);

        emit MerkleRootAnchored(merkleRoot, leafCount, msg.sender);
    }

    /**
     * @notice Check if a Merkle root exists on-chain.
     * @return found      True if this root is in the registry.
     * @return anchoredAt Block timestamp of anchoring.
     * @return leafCount  Number of snapshots in the batch.
     */
    function verifyMerkleRoot(bytes32 merkleRoot)
        external view
        returns (bool found, uint256 anchoredAt, uint256 leafCount)
    {
        MerkleRootAnchor memory m = _merkleRoots[merkleRoot];
        return (m.anchoredAt != 0, m.anchoredAt, m.leafCount);
    }

    /**
     * @notice Verify a snapshot fingerprint against an anchored Merkle root on-chain.
     * @param proof      Array of sibling hashes forming the Merkle proof path.
     * @param merkleRoot The anchored root to verify against.
     * @param leaf       The snapshot fingerprint (leaf).
     * @return valid     True if the proof matches the anchored root.
     * @return anchoredAt Block timestamp of root anchoring.
     */
    function verifyProof(
        bytes32[] calldata proof,
        bytes32 merkleRoot,
        bytes32 leaf
    ) external view returns (bool valid, uint256 anchoredAt) {
        MerkleRootAnchor memory m = _merkleRoots[merkleRoot];
        if (m.anchoredAt == 0) {
            return (false, 0);
        }

        bool proofValid = processProof(proof, leaf) == merkleRoot;
        return (proofValid, m.anchoredAt);
    }

    /**
     * @notice Computes the Merkle root from a leaf and a proof path.
     *         Compatible with OpenZeppelin and merkletreejs (sortPairs: true, keccak256).
     */
    function processProof(
        bytes32[] memory proof,
        bytes32 leaf
    ) public pure returns (bytes32) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = _commutativeKeccak256(computedHash, proof[i]);
        }
        return computedHash;
    }

    function _commutativeKeccak256(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b ? _efficientKeccak256(a, b) : _efficientKeccak256(b, a);
    }

    function _efficientKeccak256(bytes32 a, bytes32 b) private pure returns (bytes32 value) {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Total number of Merkle roots anchored.
     */
    function merkleRootHistoryLength() external view returns (uint256) {
        return merkleRootHistory.length;
    }


    /**
     * @notice Verify a snapshot fingerprint.
     * @return found       True if this fingerprint exists on-chain.
     * @return anchoredAt  Block timestamp of when it was anchored.
     * @return capturedAt  Unix timestamp of the original analysis.
     */
    function verify(bytes32 fingerprint)
        external view
        returns (bool found, uint256 anchoredAt, uint256 capturedAt)
    {
        SnapshotAnchor memory a = _snapshots[fingerprint];
        return (a.anchoredAt != 0, a.anchoredAt, a.capturedAt);
    }

    /**
     * @notice Get all fingerprints ever anchored for a given trend label.
     *         Useful for researchers tracing a trend's full analytical history.
     */
    function getTrendHistory(string calldata trendLabel)
        external view
        returns (bytes32[] memory)
    {
        return _trendFingerprints[trendLabel];
    }

    // =========================================================================
    // REGISTRY 2: PIPELINE CONFIG VERSIONING
    //
    // configHash = SHA256({
    //   VIRALITY_WEIGHTS, VIRALITY_TIERS,
    //   PAGERANK_DAMPING, SENTIMENT_MODEL,
    //   schema_version, started_at
    // })
    //
    // Registered once per worker deployment, before any job processing begins.
    // Every snapshot fingerprint embeds this configHash, creating a
    // verifiable chain from output → exact algorithm version.
    // =========================================================================

    struct ConfigVersion {
        uint256 registeredAt;
        address submitter;
    }

    /// configHash → registration metadata
    mapping(bytes32 => ConfigVersion) private _configs;

    /// ordered history of all registered configs
    bytes32[] public configHistory;

    event ConfigRegistered(
        bytes32 indexed configHash,
        uint256         registeredAt,
        address indexed submitter
    );

    /**
     * @notice Register a pipeline config hash at worker startup.
     *         Idempotent — registering the same hash twice is a no-op.
     * @param configHash SHA-256 of the full config object.
     */
    function registerConfig(bytes32 configHash) external onlyAuthorized {
        if (_configs[configHash].registeredAt == 0) {
            _configs[configHash] = ConfigVersion({
                registeredAt: block.timestamp,
                submitter:    msg.sender
            });
            configHistory.push(configHash);
            emit ConfigRegistered(configHash, block.timestamp, msg.sender);
        }
        // Idempotent: registering the same config hash twice is a no-op.
        // No revert — safe to call on every worker restart.
    }

    /**
     * @notice Check if a config hash was ever legitimately registered.
     * @return known        True if this config was registered on-chain.
     * @return registeredAt Block timestamp of when it was registered.
     */
    function isKnownConfig(bytes32 configHash)
        external view
        returns (bool known, uint256 registeredAt)
    {
        ConfigVersion memory c = _configs[configHash];
        return (c.registeredAt != 0, c.registeredAt);
    }

    /**
     * @notice Total number of distinct config versions ever registered.
     */
    function configHistoryLength() external view returns (uint256) {
        return configHistory.length;
    }

    // =========================================================================
    // REGISTRY 3: CIB BEHAVIOURAL FINGERPRINT REGISTRY
    //
    // behaviorHash = SHA256({
    //   median_inter_post_delay_ms,
    //   inter_post_delay_stddev,
    //   cluster_size,
    //   cluster_density,
    //   avg_betweenness,
    //   top_hashtag_overlap_ratio,
    //   platform
    // })
    //
    // NO user identifiers are included — only statistical behavioral patterns.
    // This fingerprint matches if the same bot network re-appears with
    // different accounts but identical behavioral signatures.
    // =========================================================================

    struct CIBReport {
        uint256 reportedAt;     // block.timestamp of first detection
        uint32  matchCount;     // how many times this pattern was seen again
        string  trendLabel;     // trend during which it was first detected
        string  platform;       // "x", "reddit", or "telegram"
        address submitter;      // who reported it
    }

    /// behaviorHash → report metadata
    mapping(bytes32 => CIBReport) private _cibReports;

    /// global ordered list of all unique behavior hashes
    bytes32[] public cibRegistry;

    event CIBReported(
        bytes32 indexed behaviorHash,
        string          trendLabel,
        string          platform,
        address indexed submitter
    );

    event CIBMatched(
        bytes32 indexed behaviorHash,
        string          newTrendLabel,
        string          originalTrendLabel,
        uint256         originalReportedAt,
        uint32          matchCount
    );

    /**
     * @notice Report a detected CIB behavioral pattern.
     *         If this pattern was seen before, increments matchCount instead.
     * @param behaviorHash  SHA-256 of the behavior pattern object.
     * @param trendLabel    Trend under which the cluster was detected.
     * @param platform      "x" | "reddit" | "telegram"
     */
    function reportCIB(
        bytes32         behaviorHash,
        string calldata trendLabel,
        string calldata platform
    ) external onlyAuthorized {
        if (_cibReports[behaviorHash].reportedAt == 0) {
            // First time seeing this behavioral pattern
            _cibReports[behaviorHash] = CIBReport({
                reportedAt: block.timestamp,
                matchCount: 0,
                trendLabel: trendLabel,
                platform:   platform,
                submitter:  msg.sender
            });
            cibRegistry.push(behaviorHash);
            emit CIBReported(behaviorHash, trendLabel, platform, msg.sender);
        } else {
            // Pattern seen again — cross-campaign match
            _cibReports[behaviorHash].matchCount += 1;
            emit CIBMatched(
                behaviorHash,
                trendLabel,
                _cibReports[behaviorHash].trendLabel,
                _cibReports[behaviorHash].reportedAt,
                _cibReports[behaviorHash].matchCount
            );
        }
    }

    /**
     * @notice Check if a behavioral pattern has been seen before.
     * @return found          True if this pattern is in the registry.
     * @return reportedAt     Block timestamp of first detection.
     * @return originalTrend  Trend label of the first detection.
     * @return matchCount     How many times it was re-matched since.
     */
    function matchCIB(bytes32 behaviorHash)
        external view
        returns (
            bool    found,
            uint256 reportedAt,
            string  memory originalTrend,
            uint32  matchCount
        )
    {
        CIBReport memory r = _cibReports[behaviorHash];
        return (
            r.reportedAt != 0,
            r.reportedAt,
            r.trendLabel,
            r.matchCount
        );
    }

    /**
     * @notice Total number of unique CIB behavioral patterns registered.
     */
    function cibRegistrySize() external view returns (uint256) {
        return cibRegistry.length;
    }
}
