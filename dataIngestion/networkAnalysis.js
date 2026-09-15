/**
 * networkAnalysis.js
 *
 * Builds an influence network graph from normalized posts for a single trend.
 * Extracts nodes (authors + communities) and edges (mentions, replies,
 * hashtag co-occurrence) purely from the NormalizedPost shape.
 *
 * ── Output shape ──
 *   { category: "network", nodes: InfluenceNode[], edges: InfluenceEdge[], topInfluencers: [] }
 *
 * ── Edge sources (ordered by signal strength) ──
 *   1. Direct @mentions         → strength 0.8–1.0
 *   2. Reply / conversation     → strength 0.5–0.7
 *   3. Hashtag co-occurrence    → strength 0.1–0.3
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MENTION_BASE_STRENGTH   = 0.85;
const REPLY_BASE_STRENGTH     = 0.60;
const HASHTAG_BASE_STRENGTH   = 0.15;

const MAX_HASHTAG_EDGES       = 200;   // cap to avoid O(n²) explosion on large batches
const TOP_INFLUENCER_COUNT    = 10;
const MIN_POSTS_FOR_NETWORK   = 1;

// Community color palette (assigned round-robin to detected communities)
const COMMUNITY_COLORS = [
    "blue", "green", "purple", "orange", "red",
    "cyan", "magenta", "teal", "amber", "indigo",
];

// ---------------------------------------------------------------------------
// Main entry point — called by the NetworkQueue worker
// ---------------------------------------------------------------------------

/**
 * Analyse the influence network for posts under a single trend_label.
 *
 * @param {{ trend_label: string, posts: import('./normalizeData').NormalizedPost[] }} jobData
 * @returns {{ category: string, nodes: InfluenceNode[], edges: InfluenceEdge[], topInfluencers: object[] }}
 */
function analyzeNetwork(jobData) {
    const { trend_label, posts } = jobData;

    if (!posts || posts.length < MIN_POSTS_FOR_NETWORK) {
        return { category: "network", nodes: [], edges: [], topInfluencers: [] };
    }

    // ==================================================================
    // 1. Build Author Index
    // ==================================================================
    const authorIndex = buildAuthorIndex(posts);

    // ==================================================================
    // 2. Build Post → Author lookup (for reply edge resolution)
    // ==================================================================
    const postToAuthor = new Map();
    for (const post of posts) {
        if (post.postId && post.authorId) {
            postToAuthor.set(post.postId, post.authorId);
        }
    }

    // ==================================================================
    // 3. Extract Edges
    // ==================================================================
    const edgeMap = new Map(); // "sourceId->targetId" → { source, target, strengths[] }

    // 3a. Mention edges
    extractMentionEdges(posts, authorIndex, edgeMap);

    // 3b. Reply / conversation edges
    extractReplyEdges(posts, authorIndex, postToAuthor, edgeMap);

    // 3c. Hashtag co-occurrence edges
    extractHashtagEdges(authorIndex, edgeMap);

    // ==================================================================
    // 4. Detect Communities (hashtag-based clustering)
    // ==================================================================
    assignCommunities(authorIndex);

    // ==================================================================
    // 5. Compute Influence Scores (0–100)
    // ==================================================================
    computeInfluenceScores(authorIndex);

    // ==================================================================
    // 6. Build output arrays
    // ==================================================================

    // Nodes
    const nodes = [];
    for (const [authorId, author] of authorIndex) {
        nodes.push({
            id: authorId,
            label: author.handle || authorId,
            platform: author.platform,
            community: author.community,
            influence: author.influenceScore,
            type: "account",
        });
    }

    // Add community summary nodes
    const communityStats = new Map();
    for (const author of authorIndex.values()) {
        const comm = author.community;
        if (!communityStats.has(comm)) {
            communityStats.set(comm, { memberCount: 0, totalInfluence: 0 });
        }
        const stats = communityStats.get(comm);
        stats.memberCount++;
        stats.totalInfluence += author.influenceScore;
    }

    for (const [commName, stats] of communityStats) {
        if (stats.memberCount >= 2) { // Only create community nodes for groups of 2+
            nodes.push({
                id: `community:${commName}`,
                label: commName,
                platform: "cross-platform",
                community: commName,
                influence: Math.min(100, Math.round(stats.totalInfluence / stats.memberCount)),
                type: "community",
            });
        }
    }

    // Edges — merge multi-source edges and compute final strength
    const edges = [];
    for (const edge of edgeMap.values()) {
        // Combined strength = weighted max (strongest signal dominates, others add a boost)
        const sorted = edge.strengths.sort((a, b) => b - a);
        let combined = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            combined += sorted[i] * 0.2; // diminishing boost from secondary signals
        }
        combined = Math.min(1, round(combined, 4));

        edges.push({
            source: edge.source,
            target: edge.target,
            strength: combined,
        });
    }

    // Sort edges by strength (strongest first)
    edges.sort((a, b) => b.strength - a.strength);

    // Top Influencers
    const topInfluencers = [...authorIndex.values()]
        .sort((a, b) => b.influenceScore - a.influenceScore)
        .slice(0, TOP_INFLUENCER_COUNT)
        .map(author => ({
            id: author.id,
            label: author.handle || author.id,
            platform: author.platform,
            influence: author.influenceScore,
            tier: author.influenceScore >= 70 ? "high"
                : author.influenceScore >= 40 ? "medium"
                : "low",
        }));

    return {
        category: "network",
        nodes,
        edges,
        topInfluencers,
    };
}

// ===========================================================================
// 1. Author Index Builder
// ===========================================================================

/**
 * Builds a Map of unique authors with aggregated metrics.
 * Key: authorId, Value: { id, handle, platform, posts[], hashtags: Set, metrics }
 */
function buildAuthorIndex(posts) {
    const authors = new Map();

    for (const post of posts) {
        const id = post.authorId || post.authorHandle || post.postId;
        if (!id) continue;

        if (!authors.has(id)) {
            authors.set(id, {
                id,
                handle: post.authorHandle,
                platform: post.platform || "unknown",
                reach: 0,
                totalInteractions: 0,
                totalEngagement: 0,
                engagementCount: 0,
                totalVoteConfidence: 0,
                voteCount: 0,
                totalApproval: 0,
                approvalCount: 0,
                postCount: 0,
                hashtags: new Set(),
                mentionedBy: new Set(),    // who mentioned this author
                repliedTo: new Set(),      // who this author replied to
                mentionTargets: [],        // handles this author mentioned
                community: "uncategorized",
                influenceScore: 0,
            });
        }

        const author = authors.get(id);
        author.postCount++;
        author.reach = Math.max(author.reach, post.authorReach ?? post.reach ?? 0);
        author.totalInteractions += post.interactions ?? 0;

        if (post.engagementRate !== null && post.engagementRate !== undefined) {
            author.totalEngagement += post.engagementRate;
            author.engagementCount++;
        }
        if (post.voteConfidence !== null && post.voteConfidence !== undefined) {
            author.totalVoteConfidence += post.voteConfidence;
            author.voteCount++;
        }
        if (post.approvalScore !== null && post.approvalScore !== undefined) {
            author.totalApproval += post.approvalScore;
            author.approvalCount++;
        }

        // Collect hashtags for community detection
        if (post.hashtags) {
            for (const tag of post.hashtags) {
                author.hashtags.add(tag.toLowerCase());
            }
        }

        // Store mention targets for edge extraction
        if (post.mentions && post.mentions.length > 0) {
            author.mentionTargets.push(...post.mentions);
        }
    }

    return authors;
}

// ===========================================================================
// 2. Edge Extractors
// ===========================================================================

/**
 * Creates edges from @mentions.
 * If a mentioned handle matches an author in the index → direct edge.
 * If not → create an "external" author entry with inferred influence.
 */
function extractMentionEdges(posts, authorIndex, edgeMap) {
    // Build handle → authorId lookup
    const handleToId = new Map();
    for (const [authorId, author] of authorIndex) {
        if (author.handle) {
            // Store both with and without @ prefix
            handleToId.set(author.handle.toLowerCase(), authorId);
            handleToId.set(author.handle.toLowerCase().replace(/^@/, ""), authorId);
        }
    }

    for (const post of posts) {
        const sourceId = post.authorId || post.authorHandle || post.postId;
        if (!sourceId || !post.mentions || post.mentions.length === 0) continue;

        for (const mention of post.mentions) {
            const mentionClean = mention.toLowerCase().replace(/^@/, "");
            let targetId = handleToId.get(mentionClean) || handleToId.get(`@${mentionClean}`);

            // If mentioned author not in batch, create an external node
            if (!targetId) {
                targetId = `external:${mentionClean}`;
                if (!authorIndex.has(targetId)) {
                    authorIndex.set(targetId, {
                        id: targetId,
                        handle: `@${mentionClean}`,
                        platform: post.platform || "unknown",
                        reach: 0,
                        totalInteractions: 0,
                        totalEngagement: 0,
                        engagementCount: 0,
                        totalVoteConfidence: 0,
                        voteCount: 0,
                        totalApproval: 0,
                        approvalCount: 0,
                        postCount: 0,
                        hashtags: new Set(),
                        mentionedBy: new Set(),
                        repliedTo: new Set(),
                        mentionTargets: [],
                        community: "external",
                        influenceScore: 0,
                        isExternal: true,
                    });
                }
            }

            if (sourceId === targetId) continue; // skip self-mentions

            // Record the mention relationship
            const target = authorIndex.get(targetId);
            if (target) target.mentionedBy.add(sourceId);

            addEdge(edgeMap, sourceId, targetId, MENTION_BASE_STRENGTH);
        }
    }
}

/**
 * Creates edges from reply chains (parentId → postId resolution).
 * Author A replied to Author B's post → edge A→B.
 */
function extractReplyEdges(posts, authorIndex, postToAuthor, edgeMap) {
    for (const post of posts) {
        if (!post.parentId) continue;

        const sourceId = post.authorId || post.authorHandle || post.postId;
        const targetAuthorId = postToAuthor.get(post.parentId);

        if (!sourceId || !targetAuthorId || sourceId === targetAuthorId) continue;

        // Verify both exist in index
        if (!authorIndex.has(sourceId) || !authorIndex.has(targetAuthorId)) continue;

        const source = authorIndex.get(sourceId);
        source.repliedTo.add(targetAuthorId);

        addEdge(edgeMap, sourceId, targetAuthorId, REPLY_BASE_STRENGTH);
    }

    // Also connect authors in the same conversationId (weaker signal)
    const conversationGroups = new Map();
    for (const post of posts) {
        if (!post.conversationId) continue;
        const authorId = post.authorId || post.authorHandle;
        if (!authorId) continue;

        if (!conversationGroups.has(post.conversationId)) {
            conversationGroups.set(post.conversationId, new Set());
        }
        conversationGroups.get(post.conversationId).add(authorId);
    }

    for (const [, members] of conversationGroups) {
        if (members.size < 2 || members.size > 20) continue; // skip trivial or huge threads

        const memberArr = [...members];
        for (let i = 0; i < memberArr.length; i++) {
            for (let j = i + 1; j < memberArr.length; j++) {
                if (authorIndex.has(memberArr[i]) && authorIndex.has(memberArr[j])) {
                    addEdge(edgeMap, memberArr[i], memberArr[j], REPLY_BASE_STRENGTH * 0.5);
                }
            }
        }
    }
}

/**
 * Creates edges from hashtag co-occurrence.
 * Authors sharing ≥1 hashtag get connected, strength based on Jaccard similarity.
 */
function extractHashtagEdges(authorIndex, edgeMap) {
    // Build inverted index: hashtag → Set of authorIds
    const tagToAuthors = new Map();
    for (const [authorId, author] of authorIndex) {
        if (author.isExternal) continue; // skip external nodes for hashtag edges
        for (const tag of author.hashtags) {
            if (!tagToAuthors.has(tag)) tagToAuthors.set(tag, new Set());
            tagToAuthors.get(tag).add(authorId);
        }
    }

    // Generate edges between authors sharing hashtags
    const seenPairs = new Set();
    let edgeCount = 0;

    for (const [, authors] of tagToAuthors) {
        if (authors.size < 2 || authors.size > 50) continue; // skip unique or very common tags

        const authorArr = [...authors];
        for (let i = 0; i < authorArr.length && edgeCount < MAX_HASHTAG_EDGES; i++) {
            for (let j = i + 1; j < authorArr.length && edgeCount < MAX_HASHTAG_EDGES; j++) {
                const pairKey = [authorArr[i], authorArr[j]].sort().join("|");
                if (seenPairs.has(pairKey)) continue;
                seenPairs.add(pairKey);

                // Jaccard similarity of hashtag sets
                const setA = authorIndex.get(authorArr[i]).hashtags;
                const setB = authorIndex.get(authorArr[j]).hashtags;
                const jaccard = jaccardSimilarity(setA, setB);

                const strength = HASHTAG_BASE_STRENGTH + (jaccard * 0.15); // 0.15 → 0.30
                addEdge(edgeMap, authorArr[i], authorArr[j], strength);
                edgeCount++;
            }
        }
    }
}

// ===========================================================================
// 3. Community Detection (hashtag-based)
// ===========================================================================

/**
 * Assigns each author to a community based on their dominant hashtag cluster.
 * Simple approach: most-used hashtag across the batch = community label.
 * Authors with no hashtags → assigned by platform.
 */
function assignCommunities(authorIndex) {
    // Count global hashtag frequency to find dominant topics
    const tagFrequency = new Map();
    for (const author of authorIndex.values()) {
        if (author.isExternal) continue;
        for (const tag of author.hashtags) {
            tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
        }
    }

    // Sort tags by frequency (most common first) and assign colors
    const sortedTags = [...tagFrequency.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

    const tagToCommunity = new Map();
    for (let i = 0; i < sortedTags.length; i++) {
        tagToCommunity.set(sortedTags[i], COMMUNITY_COLORS[i % COMMUNITY_COLORS.length]);
    }

    // Assign each author to the community of their most-frequent hashtag
    for (const author of authorIndex.values()) {
        if (author.isExternal) {
            author.community = "external";
            continue;
        }

        if (author.hashtags.size === 0) {
            author.community = author.platform || "uncategorized";
            continue;
        }

        // Pick the hashtag with highest global frequency
        let bestTag = null;
        let bestFreq = -1;
        for (const tag of author.hashtags) {
            const freq = tagFrequency.get(tag) || 0;
            if (freq > bestFreq) {
                bestFreq = freq;
                bestTag = tag;
            }
        }

        author.community = tagToCommunity.get(bestTag) || "uncategorized";
        // Store the actual community label (hashtag name) for readability
        author.communityLabel = bestTag;
    }
}

// ===========================================================================
// 4. Influence Score Computation (0–100)
// ===========================================================================

/**
 * Computes a normalized 0–100 influence score per author.
 *
 * Components:
 *   - Reach (log-scaled)         → 35% weight
 *   - Total interactions          → 25% weight
 *   - Engagement rate             → 15% weight
 *   - Network centrality          → 15% weight (mentions received + reply connections)
 *   - Content credibility         → 10% weight (voteConfidence + approvalScore)
 */
function computeInfluenceScores(authorIndex) {
    const authors = [...authorIndex.values()];

    // Find max values for normalization
    const maxReach = Math.max(1, ...authors.map(a => a.reach));
    const maxInteractions = Math.max(1, ...authors.map(a => a.totalInteractions));
    const maxCentrality = Math.max(1, ...authors.map(a => a.mentionedBy.size + a.repliedTo.size));

    for (const author of authors) {
        // a. Reach component (log-scaled to prevent dominance)
        const reachNorm = author.reach > 0
            ? Math.log10(1 + author.reach) / Math.log10(1 + maxReach)
            : 0;

        // b. Interactions component (log-scaled)
        const interactionsNorm = author.totalInteractions > 0
            ? Math.log10(1 + author.totalInteractions) / Math.log10(1 + maxInteractions)
            : 0;

        // c. Engagement rate component
        const avgEngagement = author.engagementCount > 0
            ? author.totalEngagement / author.engagementCount
            : 0;
        const engagementNorm = Math.min(1, avgEngagement / 0.10); // 10% = max

        // d. Network centrality (mentions received + connections)
        const centrality = author.mentionedBy.size + author.repliedTo.size;
        const centralityNorm = centrality / maxCentrality;

        // e. Content credibility
        const avgVoteConf = author.voteCount > 0
            ? author.totalVoteConfidence / author.voteCount
            : 0;
        const avgApproval = author.approvalCount > 0
            ? author.totalApproval / author.approvalCount
            : 0;
        const credibilityNorm = Math.min(1, (avgVoteConf / 5 + avgApproval) / 2);

        // Weighted composite
        const rawScore =
            0.35 * reachNorm +
            0.25 * interactionsNorm +
            0.15 * engagementNorm +
            0.15 * centralityNorm +
            0.10 * credibilityNorm;

        // External nodes get a penalty (they're inferred, not observed)
        const penalty = author.isExternal ? 0.3 : 1.0;

        author.influenceScore = Math.round(rawScore * 100 * penalty);
    }
}

// ===========================================================================
// Helpers
// ===========================================================================

function addEdge(edgeMap, source, target, strength) {
    // Normalize direction: always store with the lexicographically smaller ID first
    // to avoid duplicate A→B and B→A edges
    const [s, t] = source < target ? [source, target] : [target, source];
    const key = `${s}->${t}`;

    if (!edgeMap.has(key)) {
        edgeMap.set(key, { source: s, target: t, strengths: [] });
    }
    edgeMap.get(key).strengths.push(strength);
}

function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function round(n, decimals) {
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
}

module.exports = { analyzeNetwork };
