/**
 * networkAnalysis.js
 *
 * Network, Social Graph & Influence Analysis
 *
 * CHUNK 4.5:
 *   Build a unified directed graph containing:
 *
 *   SOCIAL GRAPH
 *     1. Follows
 *
 *   INTERACTION GRAPH
 *     2. Mentions
 *     3. Replies
 *     4. Quotes
 *     5. Shares / reposts
 *     6. Likes
 *
 * Centrality signals:
 *   1. In-degree
 *   2. Out-degree
 *   3. Weighted in-degree
 *   4. Weighted out-degree
 *   5. Degree centrality
 *   6. Betweenness centrality
 *   7. PageRank
 *
 * Influence signals:
 *   1. Content impact
 *   2. Network authority
 *   3. Reach
 *   4. Received interactions
 *   5. Interaction activity
 *
 * IMPORTANT:
 *
 * We NEVER infer follower/following relationships from:
 *   - mentions
 *   - likes count
 *   - replies
 *   - reposts
 *   - follower counts
 *
 * Explicit social relationships must be supplied through:
 *
 *   canonical.networkRelationships
 *
 * Aggregate event.engagement.likes is still used as content impact,
 * but does NOT create fake liker nodes or edges.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPPORTED_SCHEMA_VERSION = "1.0.0";

const TOP_INFLUENCER_COUNT = 10;

// ---------------------------------------------------------------------------
// PageRank configuration
// ---------------------------------------------------------------------------

const PAGERANK_DAMPING = 0.85;

const PAGERANK_MAX_ITERATIONS = 100;

const PAGERANK_TOLERANCE = 0.000001;

// ---------------------------------------------------------------------------
// Influence weights
// ---------------------------------------------------------------------------

const INFLUENCE_WEIGHTS = {
  contentImpact: 0.30,
  networkAuthority: 0.25,
  reach: 0.15,
  receivedInfluence: 0.20,
  interactionActivity: 0.10,
};

// ---------------------------------------------------------------------------
// Relationship types
// ---------------------------------------------------------------------------

const RELATIONSHIP_TYPES = {
  FOLLOW: "follow",
  MENTION: "mention",
  REPLY: "reply",
  QUOTE: "quote",
  REPOST: "repost",
  LIKE: "like",
};

// ---------------------------------------------------------------------------
// Interaction / relationship weights
// ---------------------------------------------------------------------------

const RELATIONSHIP_WEIGHTS = {
  follow: 1,
  like: 1,
  mention: 1,
  reply: 2,
  quote: 3,
  repost: 3,
};

// ---------------------------------------------------------------------------
// Self-interaction handling
// ---------------------------------------------------------------------------

const IGNORE_SELF_INTERACTIONS = true;


// ===========================================================================
// MAIN ENTRY POINT
// ===========================================================================

/**
 * Analyze the network for a canonical collection.
 *
 * @param {object} canonical
 *
 * @returns {{
 *   category: string,
 *   summary: object,
 *   nodes: object[],
 *   edges: object[],
 *   topInfluencers: object[]
 * }}
 */
function analyzeNetwork(canonical) {
  validateCanonicalInput(canonical);

  const events = canonical.events;

  if (events.length === 0) {
    return emptyNetworkResult();
  }

  // ======================================================================
  // 1. Build author/node index
  // ======================================================================

  const nodeMap =
    buildNodeIndex(events);

  // ======================================================================
  // 2. Build post → author index
  // ======================================================================

  const postAuthorIndex =
    buildPostAuthorIndex(events);

  // ======================================================================
  // 3. Build directed graph
  // ======================================================================

  const edgeMap =
    new Map();

  // ----------------------------------------------------------------------
  // Signal 1: Explicit social relationships
  // ----------------------------------------------------------------------

  const relationshipStats =
    extractNetworkRelationships(
      canonical.networkRelationships,
      nodeMap,
      edgeMap
    );

  // ----------------------------------------------------------------------
  // Signal 2: Direct mentions
  // ----------------------------------------------------------------------

  extractMentionEdges(
    events,
    nodeMap,
    edgeMap
  );

  // ----------------------------------------------------------------------
  // Signal 3: Replies
  // ----------------------------------------------------------------------

  extractReplyEdges(
    events,
    nodeMap,
    edgeMap
  );

  // ----------------------------------------------------------------------
  // Signal 4: Quotes
  // ----------------------------------------------------------------------

  const unresolvedQuotes =
    extractQuoteEdges(
      events,
      nodeMap,
      edgeMap,
      postAuthorIndex
    );

  // ----------------------------------------------------------------------
  // Signal 5: Shares / reposts
  // ----------------------------------------------------------------------

  const unresolvedShares =
    extractShareEdges(
      events,
      nodeMap,
      edgeMap,
      postAuthorIndex
    );

  // ======================================================================
  // 4. Keep internal graph objects
  // ======================================================================

  const rawNodes = [
    ...nodeMap.values(),
  ];

  const rawEdges = [
    ...edgeMap.values(),
  ];

  // ======================================================================
  // 5. Calculate centrality
  // ======================================================================

  const centrality =
    calculateCentrality(
      rawNodes,
      rawEdges
    );

  applyCentralityToNodes(
    rawNodes,
    centrality
  );

  // ======================================================================
  // 6. Calculate final influence
  // ======================================================================

  const influence =
    calculateInfluence(
      rawNodes
    );

  applyInfluenceToNodes(
    rawNodes,
    influence
  );

  // ======================================================================
  // 7. Finalize output
  // ======================================================================

  const nodes =
    rawNodes.map(
      finalizeNode
    );

  const edges =
    rawEdges.map(
      finalizeEdge
    );

  // ======================================================================
  // 8. Graph statistics
  // ======================================================================

  const summary =
    buildGraphSummary(
      nodes,
      edges
    );

  // ======================================================================
  // 9. Influencer ranking
  // ======================================================================

  const topInfluencers =
    buildInfluencerRanking(
      nodes
    );

  // ======================================================================
  // 10. Logging
  // ======================================================================

  const trendLabel =
    canonical?.trend?.label ??
    canonical?.trend?.name ??
    "unknown";

  console.log(
    `[Network] ${trendLabel}: ` +
    `${nodes.length} nodes, ` +
    `${edges.length} edges`
  );

  if (edges.length > 0) {
    const strongestEdge =
      edges.reduce(
        (strongest, current) =>
          current.weight >
            strongest.weight
            ? current
            : strongest
      );

    console.log(
      `[Network] Strongest interaction: ` +
      `${strongestEdge.source} → ${strongestEdge.target} ` +
      `(weight=${strongestEdge.weight})`
    );
  }

  if (
    relationshipStats.followEdges > 0 ||
    relationshipStats.likeEdges > 0
  ) {
    console.log(
      `[Network] Social relationships: ` +
      `follows=${relationshipStats.followEdges}, ` +
      `likes=${relationshipStats.likeEdges}`
    );
  }

  if (
    relationshipStats.unresolvedRelationships > 0
  ) {
    console.log(
      `[Network] Unresolved network relationships: ` +
      `${relationshipStats.unresolvedRelationships}`
    );
  }

  if (
    unresolvedQuotes > 0 ||
    unresolvedShares > 0
  ) {
    console.log(
      `[Network] Unresolved interactions: ` +
      `quotes=${unresolvedQuotes}, ` +
      `shares=${unresolvedShares}`
    );
  }

  if (
    topInfluencers.length > 0
  ) {
    const top =
      topInfluencers[0];

    // `influence` is the canonical value.
    // `score` and `influenceScore` are compatibility aliases.
    console.log(
      `[Network] Top influencer: ` +
      `${top.label} ` +
      `(score=${top.influence})`
    );
  }

  return {
    category: "network",

    summary: {
      ...summary,

      unresolvedQuotes,

      unresolvedShares,

      relationshipCoverage: {
        follows: {
          available:
            relationshipStats.followEdges > 0,

          edges:
            relationshipStats.followEdges,
        },

        likes: {
          available:
            relationshipStats.likeEdges > 0,

          edges:
            relationshipStats.likeEdges,

          aggregateOnly:
            relationshipStats.likeEdges === 0,
        },

        mentions: {
          edges:
            summary.relationshipCounts.mentions,
        },

        replies: {
          edges:
            summary.relationshipCounts.replies,
        },

        quotes: {
          edges:
            summary.relationshipCounts.quotes,
        },

        reposts: {
          edges:
            summary.relationshipCounts.reposts,
        },
      },
    },

    nodes,

    edges,

    topInfluencers,
  };
}


// ===========================================================================
// VALIDATION
// ===========================================================================

function validateCanonicalInput(
  canonical
) {
  if (
    !canonical ||
    typeof canonical !== "object"
  ) {
    throw new Error(
      "Network analysis requires canonical data."
    );
  }

  if (
    canonical.schemaVersion !==
    SUPPORTED_SCHEMA_VERSION
  ) {
    throw new Error(
      `Network analysis requires schema version ` +
      `${SUPPORTED_SCHEMA_VERSION}; ` +
      `received ${canonical.schemaVersion}`
    );
  }

  if (
    !Array.isArray(
      canonical.events
    )
  ) {
    throw new Error(
      "Network analysis requires canonical.events to be an array."
    );
  }

  if (
    canonical.networkRelationships !== undefined &&
    !Array.isArray(
      canonical.networkRelationships
    )
  ) {
    throw new Error(
      "canonical.networkRelationships must be an array when provided."
    );
  }
}


// ===========================================================================
// EMPTY RESULT
// ===========================================================================

function emptyNetworkResult() {
  return {
    category: "network",

    summary: {
      nodes: 0,
      observedAuthors: 0,
      externalNodes: 0,

      edges: 0,

      totalInteractions: 0,

      density: 0,

      unresolvedQuotes: 0,
      unresolvedShares: 0,

      relationshipCounts: {
        follows: 0,
        likes: 0,
        mentions: 0,
        replies: 0,
        quotes: 0,
        reposts: 0,
      },

      relationshipCoverage: {
        follows: {
          available: false,
          edges: 0,
        },

        likes: {
          available: false,
          edges: 0,
          aggregateOnly: true,
        },

        mentions: {
          edges: 0,
        },

        replies: {
          edges: 0,
        },

        quotes: {
          edges: 0,
        },

        reposts: {
          edges: 0,
        },
      },
    },

    nodes: [],

    edges: [],

    topInfluencers: [],
  };
}


// ===========================================================================
// 1. NODE CONSTRUCTION
// ===========================================================================

function buildNodeIndex(
  events
) {
  const nodeMap =
    new Map();

  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const author =
      extractAuthor(event);

    if (!author) {
      continue;
    }

    const nodeId =
      buildNodeId(
        event.platform,
        author.id
      );

    if (
      !nodeMap.has(nodeId)
    ) {
      nodeMap.set(
        nodeId,
        createNode(
          nodeId,
          author,
          event.platform
        )
      );
    }

    const node =
      nodeMap.get(nodeId);

    node.metrics.posts += 1;

    const engagement =
      event.engagement ?? {};

    const likes =
      toNonNegativeNumber(
        engagement.likes
      );

    const replies =
      toNonNegativeNumber(
        engagement.replies
      );

    const reposts =
      toNonNegativeNumber(
        engagement.reposts
      );

    const quotes =
      toNonNegativeNumber(
        engagement.quotes
      );

    const views =
      toNonNegativeNumber(
        engagement.views
      );

    node.metrics.likesReceived +=
      likes;

    node.metrics.commentsReceived +=
      replies;

    node.metrics.sharesReceived +=
      reposts;

    node.metrics.quotesReceived +=
      quotes;

    node.metrics.views +=
      views;

    node.metrics.totalInteractions +=
      likes +
      replies +
      reposts +
      quotes;

    const followers =
      toNonNegativeNumber(
        event.platformData
          ?.authorFollowers
      );

    if (
      followers >
      node.profile.followers
    ) {
      node.profile.followers =
        followers;
    }

    if (
      followers >
      node.metrics.maxReach
    ) {
      node.metrics.maxReach =
        followers;
    }

    if (
      views >
      node.metrics.maxReach
    ) {
      node.metrics.maxReach =
        views;
    }

    if (
      Array.isArray(
        event.content?.hashtags
      )
    ) {
      for (
        const hashtag of
        event.content.hashtags
      ) {
        const normalized =
          normalizeHashtag(
            hashtag
          );

        if (normalized) {
          node.hashtags.add(
            normalized
          );
        }
      }
    }

    if (
      !node.platform &&
      event.platform
    ) {
      node.platform =
        normalizePlatform(
          event.platform
        );
    }

    if (
      event.platformData
        ?.authorVerified === true
    ) {
      node.profile.verified =
        true;
    }
  }

  return nodeMap;
}


// ===========================================================================
// CREATE NODE
// ===========================================================================

function createNode(
  id,
  author,
  platform
) {
  return {
    id,

    username:
      author.username,

    displayName:
      author.displayName,

    platform:
      normalizePlatform(
        platform
      ) ?? "unknown",

    type: "account",

    isExternal: false,

    profile: {
      followers: 0,
      verified: false,
    },

    metrics: {
      posts: 0,

      likesReceived: 0,
      commentsReceived: 0,
      sharesReceived: 0,
      quotesReceived: 0,

      views: 0,

      totalInteractions: 0,

      maxReach: 0,

      mentionsGiven: 0,
      mentionsReceived: 0,

      repliesGiven: 0,
      repliesReceived: 0,

      quotesGiven: 0,
      quotesReceived: 0,

      sharesGiven: 0,
      sharesReceived: 0,

      likesGiven: 0,
      likesReceivedNetwork: 0,

      followsGiven: 0,
      followsReceived: 0,
    },

    hashtags:
      new Set(),

    centrality: {
      inDegree: 0,
      outDegree: 0,
      degree: 0,

      weightedInDegree: 0,
      weightedOutDegree: 0,

      degreeCentrality: 0,
      betweennessCentrality: 0,

      pagerank: 0,
    },

    influenceScore: 0,

    influenceRank: null,

    influenceTier: "low",

    influenceComponents: {
      contentImpact: 0,
      networkAuthority: 0,
      reach: 0,
      receivedInfluence: 0,
      interactionActivity: 0,
    },

    influenceSignals: {
      contentImpact: 0,
      networkAuthority: 0,
      reach: 0,
      receivedInfluence: 0,
      interactionActivity: 0,
    },
  };
}


// ===========================================================================
// AUTHOR EXTRACTION
// ===========================================================================

function extractAuthor(
  event
) {
  const author =
    event?.author;

  if (
    !author ||
    typeof author !== "object"
  ) {
    return null;
  }

  const id =
    normalizeIdentifier(
      author.authorId
    );

  const username =
    normalizeIdentifier(
      author.authorHandle
    );

  const displayName =
    normalizeIdentifier(
      author.authorName
    );

  if (
    !id &&
    !username
  ) {
    return null;
  }

  return {
    id:
      id ??
      username,

    username:
      username ??
      id,

    displayName:
      displayName ??
      username ??
      id,
  };
}


// ===========================================================================
// 2. POST → AUTHOR INDEX
// ===========================================================================

function buildPostAuthorIndex(
  events
) {
  const index =
    new Map();

  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const platform =
      normalizePlatform(
        event.platform
      );

    const postId =
      normalizeIdentifier(
        event.platformPostId
      );

    const author =
      extractAuthor(event);

    if (
      !platform ||
      !postId ||
      !author
    ) {
      continue;
    }

    const postKey =
      buildPostKey(
        platform,
        postId
      );

    const authorNodeId =
      buildNodeId(
        platform,
        author.id
      );

    if (
      !index.has(postKey)
    ) {
      index.set(
        postKey,
        authorNodeId
      );
    }
  }

  return index;
}


// ===========================================================================
// POST KEY
// ===========================================================================

function buildPostKey(
  platform,
  postId
) {
  const normalizedPlatform =
    normalizePlatform(
      platform
    ) ?? "unknown";

  let normalizedPostId =
    normalizeIdentifier(
      postId
    );

  if (!normalizedPostId) {
    return null;
  }

  const prefix =
    `${normalizedPlatform}:`;

  while (
    normalizedPostId
      .toLowerCase()
      .startsWith(
        prefix.toLowerCase()
      )
  ) {
    normalizedPostId =
      normalizedPostId.slice(
        prefix.length
      );
  }

  if (!normalizedPostId) {
    return null;
  }

  return (
    `${normalizedPlatform}:${normalizedPostId}`
  );
}


// ===========================================================================
// 3. EXPLICIT NETWORK RELATIONSHIPS
// ===========================================================================

function extractNetworkRelationships(
  relationships,
  nodeMap,
  edgeMap
) {
  const stats = {
    followEdges: 0,
    likeEdges: 0,
    unresolvedRelationships: 0,
  };

  if (
    !Array.isArray(
      relationships
    )
  ) {
    return stats;
  }

  for (
    const relationship
    of relationships
  ) {
    if (
      !relationship ||
      typeof relationship !== "object"
    ) {
      continue;
    }

    const type =
      normalizeRelationshipType(
        relationship.type
      );

    if (
      type !==
      RELATIONSHIP_TYPES.FOLLOW &&
      type !==
      RELATIONSHIP_TYPES.LIKE
    ) {
      continue;
    }

    const platform =
      normalizePlatform(
        relationship.platform
      );

    const sourceUserId =
      normalizeIdentifier(
        relationship.sourceUserId ??
        relationship.source?.userId ??
        relationship.source?.id
      );

    const targetUserId =
      normalizeIdentifier(
        relationship.targetUserId ??
        relationship.target?.userId ??
        relationship.target?.id
      );

    if (
      !platform ||
      !sourceUserId ||
      !targetUserId
    ) {
      stats.unresolvedRelationships += 1;
      continue;
    }

    const sourceId =
      buildNodeId(
        platform,
        sourceUserId
      );

    const targetId =
      buildNodeId(
        platform,
        targetUserId
      );

    if (
      IGNORE_SELF_INTERACTIONS &&
      sourceId === targetId
    ) {
      continue;
    }

    if (
      !nodeMap.has(sourceId)
    ) {
      nodeMap.set(
        sourceId,
        createExternalNodeFromId(
          sourceId,
          sourceUserId,
          platform
        )
      );
    }

    if (
      !nodeMap.has(targetId)
    ) {
      nodeMap.set(
        targetId,
        createExternalNodeFromId(
          targetId,
          targetUserId,
          platform
        )
      );
    }

    const sourceNode =
      nodeMap.get(sourceId);

    const targetNode =
      nodeMap.get(targetId);

    if (
      type ===
      RELATIONSHIP_TYPES.FOLLOW
    ) {
      sourceNode.metrics
        .followsGiven += 1;

      targetNode.metrics
        .followsReceived += 1;
    }

    if (
      type ===
      RELATIONSHIP_TYPES.LIKE
    ) {
      sourceNode.metrics
        .likesGiven += 1;

      targetNode.metrics
        .likesReceivedNetwork += 1;
    }

    addInteractionEdge({
      edgeMap,

      sourceId,

      targetId,

      event: null,

      timestamp:
        relationship.observedAt ??
        relationship.createdAt ??
        null,

      eventId:
        relationship.relationshipId ??
        null,

      interactionType:
        type ===
          RELATIONSHIP_TYPES.FOLLOW
          ? "follows"
          : "likes",

      weight:
        RELATIONSHIP_WEIGHTS[
        type
        ],
    });

    if (
      type ===
      RELATIONSHIP_TYPES.FOLLOW
    ) {
      stats.followEdges += 1;
    }

    if (
      type ===
      RELATIONSHIP_TYPES.LIKE
    ) {
      stats.likeEdges += 1;
    }
  }

  return stats;
}


// ===========================================================================
// RELATIONSHIP TYPE NORMALIZATION
// ===========================================================================

function normalizeRelationshipType(
  value
) {
  const normalized =
    normalizeIdentifier(
      value
    );

  if (!normalized) {
    return null;
  }

  const valueLower =
    normalized.toLowerCase();

  switch (valueLower) {
    case "follow":
    case "follows":
      return "follow";

    case "like":
    case "likes":
      return "like";

    case "mention":
    case "mentions":
      return "mention";

    case "reply":
    case "replies":
      return "reply";

    case "quote":
    case "quotes":
      return "quote";

    case "repost":
    case "reposts":
    case "share":
    case "shares":
      return "repost";

    default:
      return null;
  }
}


// ===========================================================================
// 3A. MENTION EDGES
// ===========================================================================

function extractMentionEdges(
  events,
  nodeMap,
  edgeMap
) {
  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const author =
      extractAuthor(event);

    if (!author) {
      continue;
    }

    const sourceId =
      buildNodeId(
        event.platform,
        author.id
      );

    if (
      !nodeMap.has(sourceId)
    ) {
      continue;
    }

    const mentions =
      extractMentions(event);

    for (
      const mention of mentions
    ) {
      const targetId =
        resolveMentionTarget(
          mention,
          event.platform,
          nodeMap
        );

      if (!targetId) {
        continue;
      }

      if (
        IGNORE_SELF_INTERACTIONS &&
        sourceId === targetId
      ) {
        continue;
      }

      const sourceNode =
        nodeMap.get(sourceId);

      const targetNode =
        nodeMap.get(targetId);

      if (sourceNode) {
        sourceNode.metrics
          .mentionsGiven += 1;
      }

      if (targetNode) {
        targetNode.metrics
          .mentionsReceived += 1;
      }

      addInteractionEdge({
        edgeMap,
        sourceId,
        targetId,
        event,
        interactionType: "mentions",
        weight:
          RELATIONSHIP_WEIGHTS
            .mention,
      });
    }
  }
}


// ===========================================================================
// 3B. REPLY EDGES
// ===========================================================================

function extractReplyEdges(
  events,
  nodeMap,
  edgeMap
) {
  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const author =
      extractAuthor(event);

    if (!author) {
      continue;
    }

    const sourceId =
      buildNodeId(
        event.platform,
        author.id
      );

    if (
      !nodeMap.has(sourceId)
    ) {
      continue;
    }

    const targetAuthorId =
      normalizeIdentifier(
        event.relationships
          ?.replyToAuthorId
      );

    if (!targetAuthorId) {
      continue;
    }

    const targetId =
      buildNodeId(
        event.platform,
        targetAuthorId
      );

    if (
      IGNORE_SELF_INTERACTIONS &&
      sourceId === targetId
    ) {
      continue;
    }

    if (
      !nodeMap.has(targetId)
    ) {
      nodeMap.set(
        targetId,
        createExternalNodeFromId(
          targetId,
          targetAuthorId,
          event.platform
        )
      );
    }

    const sourceNode =
      nodeMap.get(sourceId);

    const targetNode =
      nodeMap.get(targetId);

    if (sourceNode) {
      sourceNode.metrics
        .repliesGiven += 1;
    }

    if (targetNode) {
      targetNode.metrics
        .repliesReceived += 1;
    }

    addInteractionEdge({
      edgeMap,
      sourceId,
      targetId,
      event,
      interactionType: "replies",
      weight:
        RELATIONSHIP_WEIGHTS
          .reply,
    });
  }
}


// ===========================================================================
// 3C. QUOTE EDGES
// ===========================================================================

function extractQuoteEdges(
  events,
  nodeMap,
  edgeMap,
  postAuthorIndex
) {
  let unresolved = 0;

  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const author =
      extractAuthor(event);

    if (!author) {
      continue;
    }

    const sourceId =
      buildNodeId(
        event.platform,
        author.id
      );

    if (
      !nodeMap.has(sourceId)
    ) {
      continue;
    }

    const quoteOfId =
      normalizeIdentifier(
        event.relationships
          ?.quoteOfId
      );

    if (!quoteOfId) {
      continue;
    }

    const targetId =
      resolvePostAuthor(
        event.platform,
        quoteOfId,
        postAuthorIndex
      );

    if (!targetId) {
      unresolved += 1;
      continue;
    }

    if (
      IGNORE_SELF_INTERACTIONS &&
      sourceId === targetId
    ) {
      continue;
    }

    const sourceNode =
      nodeMap.get(sourceId);

    const targetNode =
      nodeMap.get(targetId);

    if (sourceNode) {
      sourceNode.metrics
        .quotesGiven += 1;
    }

    if (targetNode) {
      targetNode.metrics
        .quotesReceived += 1;
    }

    addInteractionEdge({
      edgeMap,
      sourceId,
      targetId,
      event,
      interactionType: "quotes",
      weight:
        RELATIONSHIP_WEIGHTS
          .quote,
    });
  }

  return unresolved;
}


// ===========================================================================
// 3D. SHARE / REPOST EDGES
// ===========================================================================

function extractShareEdges(
  events,
  nodeMap,
  edgeMap,
  postAuthorIndex
) {
  let unresolved = 0;

  for (
    const event of events
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      continue;
    }

    const author =
      extractAuthor(event);

    if (!author) {
      continue;
    }

    const sourceId =
      buildNodeId(
        event.platform,
        author.id
      );

    if (
      !nodeMap.has(sourceId)
    ) {
      continue;
    }

    const forwardOfId =
      normalizeIdentifier(
        event.relationships
          ?.forwardOfId
      );

    if (!forwardOfId) {
      continue;
    }

    const targetId =
      resolvePostAuthor(
        event.platform,
        forwardOfId,
        postAuthorIndex
      );

    if (!targetId) {
      unresolved += 1;
      continue;
    }

    if (
      IGNORE_SELF_INTERACTIONS &&
      sourceId === targetId
    ) {
      continue;
    }

    const sourceNode =
      nodeMap.get(sourceId);

    const targetNode =
      nodeMap.get(targetId);

    if (sourceNode) {
      sourceNode.metrics
        .sharesGiven += 1;
    }

    if (targetNode) {
      targetNode.metrics
        .sharesReceived += 1;
    }

    addInteractionEdge({
      edgeMap,
      sourceId,
      targetId,
      event,
      interactionType: "shares",
      weight:
        RELATIONSHIP_WEIGHTS
          .repost,
    });
  }

  return unresolved;
}


// ===========================================================================
// POST TARGET RESOLUTION
// ===========================================================================

function resolvePostAuthor(
  platform,
  postId,
  postAuthorIndex
) {
  const postKey =
    buildPostKey(
      platform,
      postId
    );

  if (!postKey) {
    return null;
  }

  return (
    postAuthorIndex.get(
      postKey
    ) ?? null
  );
}


// ===========================================================================
// MENTION EXTRACTION
// ===========================================================================

function extractMentions(
  event
) {
  const mentions =
    event?.content?.mentions;

  if (
    !Array.isArray(mentions)
  ) {
    return [];
  }

  const result = [];

  for (
    const mention of mentions
  ) {
    if (
      typeof mention === "string"
    ) {
      const value =
        normalizeIdentifier(
          mention
        );

      if (!value) {
        continue;
      }

      result.push({
        id: null,
        username: value,
      });

      continue;
    }

    if (
      !mention ||
      typeof mention !== "object"
    ) {
      continue;
    }

    const id =
      normalizeIdentifier(
        mention.id ??
        mention.authorId
      );

    const username =
      normalizeIdentifier(
        mention.username ??
        mention.authorHandle
      );

    if (
      !id &&
      !username
    ) {
      continue;
    }

    result.push({
      id,
      username,
    });
  }

  return result;
}


// ===========================================================================
// MENTION TARGET RESOLUTION
// ===========================================================================

function resolveMentionTarget(
  mention,
  platform,
  nodeMap
) {
  if (mention.id) {
    const idKey =
      buildNodeId(
        platform,
        mention.id
      );

    if (
      nodeMap.has(idKey)
    ) {
      return idKey;
    }
  }

  if (
    mention.username
  ) {
    const username =
      normalizeUsername(
        mention.username
      );

    const normalizedPlatform =
      normalizePlatform(
        platform
      );

    for (
      const [nodeId, node]
      of nodeMap
    ) {
      if (
        normalizePlatform(
          node.platform
        ) === normalizedPlatform &&
        normalizeUsername(
          node.username
        ) === username
      ) {
        return nodeId;
      }
    }
  }

  const externalIdentifier =
    mention.id ??
    normalizeUsername(
      mention.username
    );

  if (
    !externalIdentifier
  ) {
    return null;
  }

  const externalId =
    buildExternalNodeId(
      platform,
      externalIdentifier
    );

  if (
    !nodeMap.has(externalId)
  ) {
    nodeMap.set(
      externalId,
      createExternalNode(
        externalId,
        mention,
        platform
      )
    );
  }

  return externalId;
}


// ===========================================================================
// EXTERNAL NODE
// ===========================================================================

function createExternalNode(
  id,
  mention,
  platform
) {
  return createBaseExternalNode(
    id,
    mention.username ??
    mention.id,
    platform
  );
}


// ===========================================================================
// CREATE EXTERNAL NODE FROM ID
// ===========================================================================

function createExternalNodeFromId(
  id,
  authorId,
  platform
) {
  return createBaseExternalNode(
    id,
    authorId,
    platform
  );
}


// ===========================================================================
// BASE EXTERNAL NODE
// ===========================================================================

function createBaseExternalNode(
  id,
  username,
  platform
) {
  return {
    id,

    username,

    displayName:
      username,

    platform:
      normalizePlatform(
        platform
      ) ?? "unknown",

    type: "account",

    isExternal: true,

    profile: {
      followers: 0,
      verified: false,
    },

    metrics: {
      posts: 0,

      likesReceived: 0,
      commentsReceived: 0,
      sharesReceived: 0,
      quotesReceived: 0,

      views: 0,

      totalInteractions: 0,

      maxReach: 0,

      mentionsGiven: 0,
      mentionsReceived: 0,

      repliesGiven: 0,
      repliesReceived: 0,

      quotesGiven: 0,
      quotesReceived: 0,

      sharesGiven: 0,
      sharesReceived: 0,

      likesGiven: 0,
      likesReceivedNetwork: 0,

      followsGiven: 0,
      followsReceived: 0,
    },

    hashtags:
      new Set(),

    centrality: {
      inDegree: 0,
      outDegree: 0,
      degree: 0,

      weightedInDegree: 0,
      weightedOutDegree: 0,

      degreeCentrality: 0,
      betweennessCentrality: 0,

      pagerank: 0,
    },

    influenceScore: 0,

    influenceRank: null,

    influenceTier: "low",

    influenceComponents: {
      contentImpact: 0,
      networkAuthority: 0,
      reach: 0,
      receivedInfluence: 0,
      interactionActivity: 0,
    },

    influenceSignals: {
      contentImpact: 0,
      networkAuthority: 0,
      reach: 0,
      receivedInfluence: 0,
      interactionActivity: 0,
    },
  };
}


// ===========================================================================
// EDGE CREATION
// ===========================================================================

function addInteractionEdge({
  edgeMap,
  sourceId,
  targetId,
  event = null,
  timestamp = null,
  eventId = null,
  interactionType,
  weight,
}) {
  const edgeKey =
    `${sourceId}->${targetId}`;

  if (
    !edgeMap.has(edgeKey)
  ) {
    edgeMap.set(
      edgeKey,
      createEdge(
        sourceId,
        targetId,
        event,
        timestamp
      )
    );
  }

  const edge =
    edgeMap.get(edgeKey);

  if (
    edge.interactions[
    interactionType
    ] !== undefined
  ) {
    edge.interactions[
      interactionType
    ] += 1;
  }

  edge.weight +=
    toNonNegativeNumber(
      weight
    );

  updateEdgeTimeRange(
    edge,
    timestamp ??
    event?.time?.publishedAt
  );

  if (
    event?.eventId &&
    !edge.eventIds.includes(
      event.eventId
    )
  ) {
    edge.eventIds.push(
      event.eventId
    );
  }

  if (
    eventId &&
    !edge.eventIds.includes(
      eventId
    )
  ) {
    edge.eventIds.push(
      eventId
    );
  }
}


// ===========================================================================
// EDGE OBJECT
// ===========================================================================

function createEdge(
  source,
  target,
  event = null,
  timestamp = null
) {
  const initialTimestamp =
    timestamp ??
    event?.time?.publishedAt ??
    null;

  return {
    source,

    target,

    interactions: {
      follows: 0,
      likes: 0,
      mentions: 0,
      replies: 0,
      shares: 0,
      quotes: 0,
    },

    weight: 0,

    firstInteraction:
      initialTimestamp,

    lastInteraction:
      initialTimestamp,

    eventIds: [],
  };
}


// ===========================================================================
// EDGE TIME RANGE
// ===========================================================================

function updateEdgeTimeRange(
  edge,
  timestamp
) {
  if (!timestamp) {
    return;
  }

  const time =
    new Date(timestamp);

  if (
    Number.isNaN(
      time.getTime()
    )
  ) {
    return;
  }

  if (
    !edge.firstInteraction
  ) {
    edge.firstInteraction =
      timestamp;
  } else {
    const first =
      new Date(
        edge.firstInteraction
      );

    if (
      Number.isNaN(
        first.getTime()
      ) ||
      time < first
    ) {
      edge.firstInteraction =
        timestamp;
    }
  }

  if (
    !edge.lastInteraction
  ) {
    edge.lastInteraction =
      timestamp;
  } else {
    const last =
      new Date(
        edge.lastInteraction
      );

    if (
      Number.isNaN(
        last.getTime()
      ) ||
      time > last
    ) {
      edge.lastInteraction =
        timestamp;
    }
  }
}


// ===========================================================================
// CENTRALITY
// ===========================================================================

function calculateCentrality(
  nodes,
  edges
) {
  const nodeIds =
    nodes.map(
      node =>
        node.id
    );

  const nodeCount =
    nodeIds.length;

  const metrics =
    new Map();

  for (
    const nodeId of nodeIds
  ) {
    metrics.set(
      nodeId,
      {
        inDegree: 0,
        outDegree: 0,
        degree: 0,

        weightedInDegree: 0,
        weightedOutDegree: 0,

        degreeCentrality: 0,
        betweennessCentrality: 0,

        pagerank: 0,
      }
    );
  }

  // ======================================================================
  // Degree metrics
  // ======================================================================

  for (
    const edge of edges
  ) {
    const source =
      metrics.get(
        edge.source
      );

    const target =
      metrics.get(
        edge.target
      );

    if (
      !source ||
      !target
    ) {
      continue;
    }

    source.outDegree += 1;

    target.inDegree += 1;

    source.weightedOutDegree +=
      toNonNegativeNumber(
        edge.weight
      );

    target.weightedInDegree +=
      toNonNegativeNumber(
        edge.weight
      );
  }

  for (
    const metric of metrics.values()
  ) {
    metric.degree =
      metric.inDegree +
      metric.outDegree;

    metric.degreeCentrality =
      nodeCount > 1
        ? (
          metric.degree /
          (
            2 *
            (nodeCount - 1)
          )
        )
        : 0;
  }

  // ======================================================================
  // Betweenness
  // ======================================================================

  const betweenness =
    calculateBetweennessCentrality(
      nodeIds,
      edges
    );

  for (
    const [nodeId, value]
    of betweenness
  ) {
    const metric =
      metrics.get(nodeId);

    if (metric) {
      metric.betweennessCentrality =
        value;
    }
  }

  // ======================================================================
  // PageRank
  // ======================================================================

  const pagerank =
    calculatePageRank(
      nodeIds,
      edges
    );

  for (
    const [nodeId, value]
    of pagerank
  ) {
    const metric =
      metrics.get(nodeId);

    if (metric) {
      metric.pagerank =
        value;
    }
  }

  return metrics;
}


// ===========================================================================
// CENTRALITY APPLICATION
// ===========================================================================

function applyCentralityToNodes(
  nodes,
  centrality
) {
  for (
    const node of nodes
  ) {
    const metric =
      centrality.get(
        node.id
      );

    if (!metric) {
      continue;
    }

    node.centrality = {
      inDegree:
        metric.inDegree,

      outDegree:
        metric.outDegree,

      degree:
        metric.degree,

      weightedInDegree:
        round(
          metric.weightedInDegree,
          4
        ),

      weightedOutDegree:
        round(
          metric.weightedOutDegree,
          4
        ),

      degreeCentrality:
        round(
          metric.degreeCentrality,
          6
        ),

      betweennessCentrality:
        round(
          metric.betweennessCentrality,
          6
        ),

      pagerank:
        round(
          metric.pagerank,
          8
        ),
    };
  }
}


// ===========================================================================
// BETWEENNESS CENTRALITY
// ===========================================================================

function calculateBetweennessCentrality(
  nodeIds,
  edges
) {
  const betweenness =
    new Map();

  for (
    const nodeId of nodeIds
  ) {
    betweenness.set(
      nodeId,
      0
    );
  }

  const adjacency =
    new Map();

  for (
    const nodeId of nodeIds
  ) {
    adjacency.set(
      nodeId,
      []
    );
  }

  for (
    const edge of edges
  ) {
    if (
      !adjacency.has(
        edge.source
      ) ||
      !adjacency.has(
        edge.target
      )
    ) {
      continue;
    }

    adjacency
      .get(edge.source)
      .push(edge.target);
  }

  // -----------------------------------------------------------------------
  // Brandes algorithm
  // -----------------------------------------------------------------------

  for (
    const source of nodeIds
  ) {
    const stack = [];

    const predecessors =
      new Map();

    const distance =
      new Map();

    const sigma =
      new Map();

    const dependency =
      new Map();

    for (
      const nodeId of nodeIds
    ) {
      predecessors.set(
        nodeId,
        []
      );

      distance.set(
        nodeId,
        -1
      );

      sigma.set(
        nodeId,
        0
      );

      dependency.set(
        nodeId,
        0
      );
    }

    sigma.set(
      source,
      1
    );

    distance.set(
      source,
      0
    );

    const queue = [
      source
    ];

    let queueIndex = 0;

    while (
      queueIndex <
      queue.length
    ) {
      const current =
        queue[
        queueIndex++
        ];

      stack.push(
        current
      );

      const neighbors =
        adjacency.get(
          current
        ) ?? [];

      for (
        const neighbor of neighbors
      ) {
        if (
          distance.get(
            neighbor
          ) === -1
        ) {
          distance.set(
            neighbor,
            distance.get(
              current
            ) + 1
          );

          queue.push(
            neighbor
          );
        }

        if (
          distance.get(
            neighbor
          ) ===
          distance.get(
            current
          ) + 1
        ) {
          sigma.set(
            neighbor,
            sigma.get(
              neighbor
            ) +
            sigma.get(
              current
            )
          );

          predecessors
            .get(neighbor)
            .push(current);
        }
      }
    }

    while (
      stack.length > 0
    ) {
      const current =
        stack.pop();

      const currentPredecessors =
        predecessors.get(
          current
        ) ?? [];

      for (
        const predecessor
        of currentPredecessors
      ) {
        const sigmaCurrent =
          sigma.get(
            current
          );

        if (
          sigmaCurrent === 0
        ) {
          continue;
        }

        const contribution =
          (
            sigma.get(
              predecessor
            ) /
            sigmaCurrent
          ) *
          (
            1 +
            dependency.get(
              current
            )
          );

        dependency.set(
          predecessor,
          dependency.get(
            predecessor
          ) +
          contribution
        );
      }

      if (
        current !== source
      ) {
        betweenness.set(
          current,
          betweenness.get(
            current
          ) +
          dependency.get(
            current
          )
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Directed graph normalization
  // -----------------------------------------------------------------------

  const nodeCount =
    nodeIds.length;

  const normalization =
    nodeCount > 2
      ? (
        (nodeCount - 1) *
        (nodeCount - 2)
      )
      : 0;

  if (
    normalization > 0
  ) {
    for (
      const nodeId of nodeIds
    ) {
      betweenness.set(
        nodeId,
        betweenness.get(
          nodeId
        ) /
        normalization
      );
    }
  } else {
    for (
      const nodeId of nodeIds
    ) {
      betweenness.set(
        nodeId,
        0
      );
    }
  }

  return betweenness;
}


// ===========================================================================
// PAGERANK
// ===========================================================================

function calculatePageRank(
  nodeIds,
  edges
) {
  const nodeCount =
    nodeIds.length;

  const result =
    new Map();

  if (
    nodeCount === 0
  ) {
    return result;
  }

  const initialRank =
    1 /
    nodeCount;

  let rank =
    new Map();

  for (
    const nodeId of nodeIds
  ) {
    rank.set(
      nodeId,
      initialRank
    );
  }

  const outgoing =
    new Map();

  for (
    const nodeId of nodeIds
  ) {
    outgoing.set(
      nodeId,
      []
    );
  }

  for (
    const edge of edges
  ) {
    if (
      !outgoing.has(
        edge.source
      ) ||
      !rank.has(
        edge.target
      )
    ) {
      continue;
    }

    outgoing
      .get(edge.source)
      .push(edge.target);
  }

  for (
    let iteration = 0;
    iteration <
    PAGERANK_MAX_ITERATIONS;
    iteration++
  ) {
    const nextRank =
      new Map();

    const base =
      (
        1 -
        PAGERANK_DAMPING
      ) /
      nodeCount;

    for (
      const nodeId of nodeIds
    ) {
      nextRank.set(
        nodeId,
        base
      );
    }

    for (
      const source of nodeIds
    ) {
      const targets =
        outgoing.get(
          source
        ) ?? [];

      const sourceRank =
        rank.get(
          source
        ) ?? 0;

      if (
        targets.length === 0
      ) {
        const share =
          (
            PAGERANK_DAMPING *
            sourceRank
          ) /
          nodeCount;

        for (
          const target of nodeIds
        ) {
          nextRank.set(
            target,
            nextRank.get(
              target
            ) +
            share
          );
        }

        continue;
      }

      const share =
        (
          PAGERANK_DAMPING *
          sourceRank
        ) /
        targets.length;

      for (
        const target of targets
      ) {
        nextRank.set(
          target,
          nextRank.get(
            target
          ) +
          share
        );
      }
    }

    let difference = 0;

    for (
      const nodeId of nodeIds
    ) {
      difference +=
        Math.abs(
          (
            nextRank.get(
              nodeId
            ) ?? 0
          ) -
          (
            rank.get(
              nodeId
            ) ?? 0
          )
        );
    }

    rank =
      nextRank;

    if (
      difference <
      PAGERANK_TOLERANCE
    ) {
      break;
    }
  }

  for (
    const nodeId of nodeIds
  ) {
    result.set(
      nodeId,
      rank.get(
        nodeId
      ) ?? 0
    );
  }

  return result;
}


// ===========================================================================
// INFLUENCE CALCULATION
// ===========================================================================

function calculateInfluence(
  nodes
) {
  const observedNodes =
    nodes.filter(
      node =>
        !node.isExternal
    );

  const maxima = {
    contentImpact: 0,
    networkAuthority: 0,
    reach: 0,
    receivedInfluence: 0,
    interactionActivity: 0,
  };

  const rawSignals =
    new Map();

  // -----------------------------------------------------------------------
  // First pass
  // -----------------------------------------------------------------------

  for (
    const node of observedNodes
  ) {
    const contentImpact =
      calculateContentImpact(
        node
      );

    const networkAuthority =
      toNonNegativeNumber(
        node.centrality?.pagerank
      );

    const reach =
      Math.max(
        toNonNegativeNumber(
          node.profile?.followers
        ),
        toNonNegativeNumber(
          node.metrics?.maxReach
        )
      );

    const receivedInfluence =
      toNonNegativeNumber(
        node.metrics?.mentionsReceived
      ) +
      toNonNegativeNumber(
        node.metrics?.repliesReceived
      ) +
      toNonNegativeNumber(
        node.metrics?.quotesReceived
      ) +
      toNonNegativeNumber(
        node.metrics?.sharesReceived
      ) +
      toNonNegativeNumber(
        node.metrics?.likesReceivedNetwork
      ) +
      toNonNegativeNumber(
        node.metrics?.followsReceived
      );

    const interactionActivity =
      toNonNegativeNumber(
        node.metrics?.totalInteractions
      ) +
      toNonNegativeNumber(
        node.metrics?.mentionsGiven
      ) +
      toNonNegativeNumber(
        node.metrics?.repliesGiven
      ) +
      toNonNegativeNumber(
        node.metrics?.quotesGiven
      ) +
      toNonNegativeNumber(
        node.metrics?.sharesGiven
      ) +
      toNonNegativeNumber(
        node.metrics?.likesGiven
      ) +
      toNonNegativeNumber(
        node.metrics?.followsGiven
      );

    const signals = {
      contentImpact,
      networkAuthority,
      reach,
      receivedInfluence,
      interactionActivity,
    };

    rawSignals.set(
      node.id,
      signals
    );

    for (
      const key of Object.keys(
        maxima
      )
    ) {
      if (
        signals[key] >
        maxima[key]
      ) {
        maxima[key] =
          signals[key];
      }
    }
  }

  // -----------------------------------------------------------------------
  // Second pass
  // -----------------------------------------------------------------------

  const result =
    new Map();

  for (
    const node of observedNodes
  ) {
    const signals =
      rawSignals.get(
        node.id
      );

    if (!signals) {
      continue;
    }

    const normalized = {
      contentImpact:
        normalizeAgainstMaximum(
          signals.contentImpact,
          maxima.contentImpact
        ),

      networkAuthority:
        normalizeAgainstMaximum(
          signals.networkAuthority,
          maxima.networkAuthority
        ),

      reach:
        normalizeAgainstMaximum(
          signals.reach,
          maxima.reach
        ),

      receivedInfluence:
        normalizeAgainstMaximum(
          signals.receivedInfluence,
          maxima.receivedInfluence
        ),

      interactionActivity:
        normalizeAgainstMaximum(
          signals.interactionActivity,
          maxima.interactionActivity
        ),
    };

    const score =
      (
        normalized.contentImpact *
        INFLUENCE_WEIGHTS
          .contentImpact
      ) +
      (
        normalized.networkAuthority *
        INFLUENCE_WEIGHTS
          .networkAuthority
      ) +
      (
        normalized.reach *
        INFLUENCE_WEIGHTS
          .reach
      ) +
      (
        normalized.receivedInfluence *
        INFLUENCE_WEIGHTS
          .receivedInfluence
      ) +
      (
        normalized.interactionActivity *
        INFLUENCE_WEIGHTS
          .interactionActivity
      );

    const finalScore =
      round(
        score * 100,
        2
      );

    result.set(
      node.id,
      {
        score:
          finalScore,

        components: {
          contentImpact:
            round(
              normalized.contentImpact *
              100,
              2
            ),

          networkAuthority:
            round(
              normalized.networkAuthority *
              100,
              2
            ),

          reach:
            round(
              normalized.reach *
              100,
              2
            ),

          receivedInfluence:
            round(
              normalized.receivedInfluence *
              100,
              2
            ),

          interactionActivity:
            round(
              normalized.interactionActivity *
              100,
              2
            ),
        },

        rawSignals: {
          contentImpact:
            round(
              signals.contentImpact,
              4
            ),

          networkAuthority:
            round(
              signals.networkAuthority,
              8
            ),

          reach:
            round(
              signals.reach,
              4
            ),

          receivedInfluence:
            round(
              signals.receivedInfluence,
              4
            ),

          interactionActivity:
            round(
              signals.interactionActivity,
              4
            ),
        },
      }
    );
  }

  return result;
}


// ===========================================================================
// CONTENT IMPACT
// ===========================================================================

function calculateContentImpact(
  node
) {
  return (
    toNonNegativeNumber(
      node.metrics?.likesReceived
    ) +
    toNonNegativeNumber(
      node.metrics?.commentsReceived
    ) +
    toNonNegativeNumber(
      node.metrics?.sharesReceived
    )
  );
}


// ===========================================================================
// NORMALIZATION
// ===========================================================================

function normalizeAgainstMaximum(
  value,
  maximum
) {
  if (
    maximum <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      value / maximum
    )
  );
}


// ===========================================================================
// INFLUENCE APPLICATION
// ===========================================================================

function applyInfluenceToNodes(
  nodes,
  influence
) {
  const rankedNodes =
    nodes
      .filter(
        node =>
          !node.isExternal
      )
      .map(
        node => ({
          node,
          influence:
            influence.get(
              node.id
            ),
        })
      )
      .filter(
        item =>
          item.influence
      )
      .sort(
        (a, b) => {
          const scoreA =
            toNonNegativeNumber(
              a.influence?.score
            );

          const scoreB =
            toNonNegativeNumber(
              b.influence?.score
            );

          return (
            scoreB -
            scoreA
          );
        }
      );

  rankedNodes.forEach(
    (item, index) => {
      const score =
        toNonNegativeNumber(
          item.influence.score
        );

      item.node.influenceScore =
        score;

      item.node.influenceRank =
        index + 1;

      item.node.influenceTier =
        getInfluenceTier(
          score
        );

      item.node.influenceComponents =
        item.influence.components;

      item.node.influenceSignals =
        item.influence.rawSignals;
    }
  );

  for (
    const node of nodes
  ) {
    if (
      node.isExternal
    ) {
      node.influenceScore = 0;

      node.influenceRank = null;

      node.influenceTier =
        "external";

      node.influenceComponents = {
        contentImpact: 0,
        networkAuthority: 0,
        reach: 0,
        receivedInfluence: 0,
        interactionActivity: 0,
      };

      node.influenceSignals = {
        contentImpact: 0,
        networkAuthority: 0,
        reach: 0,
        receivedInfluence: 0,
        interactionActivity: 0,
      };
    }
  }
}


// ===========================================================================
// INFLUENCE TIER
// ===========================================================================

function getInfluenceTier(
  score
) {
  if (
    score >= 70
  ) {
    return "high";
  }

  if (
    score >= 40
  ) {
    return "medium";
  }

  return "low";
}


// ===========================================================================
// GRAPH SUMMARY
// ===========================================================================

function buildGraphSummary(
  nodes,
  edges
) {
  const realNodes =
    nodes.filter(
      node =>
        !node.isExternal
    );

  const totalInteractions =
    edges.reduce(
      (sum, edge) =>
        sum +
        toNonNegativeNumber(
          edge.weight
        ),
      0
    );

  const relationshipCounts = {
    follows: 0,
    likes: 0,
    mentions: 0,
    replies: 0,
    quotes: 0,
    reposts: 0,
  };

  for (
    const edge of edges
  ) {
    relationshipCounts.follows +=
      toNonNegativeNumber(
        edge.interactions
          .follows
      );

    relationshipCounts.likes +=
      toNonNegativeNumber(
        edge.interactions
          .likes
      );

    relationshipCounts.mentions +=
      toNonNegativeNumber(
        edge.interactions
          .mentions
      );

    relationshipCounts.replies +=
      toNonNegativeNumber(
        edge.interactions
          .replies
      );

    relationshipCounts.quotes +=
      toNonNegativeNumber(
        edge.interactions
          .quotes
      );

    relationshipCounts.reposts +=
      toNonNegativeNumber(
        edge.interactions
          .shares
      );
  }

  const nodeCount =
    nodes.length;

  const possibleEdges =
    nodeCount > 1
      ? nodeCount *
      (nodeCount - 1)
      : 0;

  const density =
    possibleEdges > 0
      ? edges.length /
      possibleEdges
      : 0;

  return {
    nodes:
      nodeCount,

    observedAuthors:
      realNodes.length,

    externalNodes:
      nodes.length -
      realNodes.length,

    edges:
      edges.length,

    totalInteractions,

    density:
      round(
        density,
        6
      ),

    relationshipCounts,
  };
}


// ===========================================================================
// INFLUENCER RANKING
// ===========================================================================

function buildInfluencerRanking(
  nodes
) {
  return [
    ...nodes
  ]
    .filter(
      node =>
        !node.isExternal
    )
    .sort(
      (a, b) => {
        const influenceA =
          toNonNegativeNumber(
            a.influenceScore
          );

        const influenceB =
          toNonNegativeNumber(
            b.influenceScore
          );

        if (
          influenceB !==
          influenceA
        ) {
          return (
            influenceB -
            influenceA
          );
        }

        const pageRankA =
          toNonNegativeNumber(
            a.centrality?.pagerank
          );

        const pageRankB =
          toNonNegativeNumber(
            b.centrality?.pagerank
          );

        if (
          pageRankB !==
          pageRankA
        ) {
          return (
            pageRankB -
            pageRankA
          );
        }

        return (
          a.id.localeCompare(
            b.id
          )
        );
      }
    )
    .slice(
      0,
      TOP_INFLUENCER_COUNT
    )
    .map(
      node => {
        const finalInfluence =
          toNonNegativeNumber(
            node.influenceScore
          );

        return {
          id:
            node.id,

          label:
            node.username ??
            node.id,

          username:
            node.username,

          displayName:
            node.displayName,

          platform:
            node.platform,

          // ---------------------------------------------------------------
          // CANONICAL INFLUENCE FIELD
          // ---------------------------------------------------------------

          influence:
            finalInfluence,

          // ---------------------------------------------------------------
          // COMPATIBILITY ALIASES
          //
          // These prevent downstream consumers that expect either
          // `score` or `influenceScore` from receiving undefined/n/a.
          // ---------------------------------------------------------------

          score:
            finalInfluence,

          influenceScore:
            finalInfluence,

          influenceRank:
            node.influenceRank,

          influenceTier:
            node.influenceTier,

          centrality: {
            inDegree:
              node.centrality
                ?.inDegree ??
              0,

            outDegree:
              node.centrality
                ?.outDegree ??
              0,

            degree:
              node.centrality
                ?.degree ??
              0,

            degreeCentrality:
              node.centrality
                ?.degreeCentrality ??
              0,

            betweennessCentrality:
              node.centrality
                ?.betweennessCentrality ??
              0,

            pagerank:
              node.centrality
                ?.pagerank ??
              0,
          },

          influenceComponents:
            node.influenceComponents ?? {
              contentImpact: 0,
              networkAuthority: 0,
              reach: 0,
              receivedInfluence: 0,
              interactionActivity: 0,
            },

          influenceSignals:
            node.influenceSignals ?? {
              contentImpact: 0,
              networkAuthority: 0,
              reach: 0,
              receivedInfluence: 0,
              interactionActivity: 0,
            },

          networkSignals: {
            followsReceived:
              node.metrics
                .followsReceived,

            followsGiven:
              node.metrics
                .followsGiven,

            likesReceived:
              node.metrics
                .likesReceivedNetwork,

            likesGiven:
              node.metrics
                .likesGiven,

            mentionsReceived:
              node.metrics
                .mentionsReceived,

            repliesReceived:
              node.metrics
                .repliesReceived,

            quotesReceived:
              node.metrics
                .quotesReceived,

            sharesReceived:
              node.metrics
                .sharesReceived,

            mentionsGiven:
              node.metrics
                .mentionsGiven,

            repliesGiven:
              node.metrics
                .repliesGiven,

            quotesGiven:
              node.metrics
                .quotesGiven,

            sharesGiven:
              node.metrics
                .sharesGiven,

            totalInteractions:
              node.metrics
                .totalInteractions,

            posts:
              node.metrics
                .posts,

            followers:
              node.profile
                ?.followers ??
              0,

            reach:
              Math.max(
                toNonNegativeNumber(
                  node.profile
                    ?.followers
                ),
                toNonNegativeNumber(
                  node.metrics
                    ?.maxReach
                )
              ),
          },
        };
      }
    );
}


// ===========================================================================
// FINALIZE NODE
// ===========================================================================

function finalizeNode(
  node
) {
  const finalInfluence =
    toNonNegativeNumber(
      node.influenceScore
    );

  return {
    id:
      node.id,

    label:
      node.username ??
      node.id,

    username:
      node.username,

    displayName:
      node.displayName,

    platform:
      node.platform,

    type:
      "account",

    isExternal:
      node.isExternal,

    profile: {
      ...node.profile,
    },

    metrics: {
      ...node.metrics,
    },

    hashtags: [
      ...node.hashtags,
    ],

    centrality: {
      inDegree:
        node.centrality
          ?.inDegree ??
        0,

      outDegree:
        node.centrality
          ?.outDegree ??
        0,

      degree:
        node.centrality
          ?.degree ??
        0,

      weightedInDegree:
        node.centrality
          ?.weightedInDegree ??
        0,

      weightedOutDegree:
        node.centrality
          ?.weightedOutDegree ??
        0,

      degreeCentrality:
        node.centrality
          ?.degreeCentrality ??
        0,

      betweennessCentrality:
        node.centrality
          ?.betweennessCentrality ??
        0,

      pagerank:
        node.centrality
          ?.pagerank ??
        0,
    },

    // Canonical final influence score.
    influence:
      finalInfluence,

    // Compatibility aliases.
    score:
      finalInfluence,

    influenceScore:
      finalInfluence,

    influenceRank:
      node.influenceRank ??
      null,

    influenceTier:
      node.influenceTier ??
      "low",

    influenceComponents:
      node.influenceComponents ??
      {
        contentImpact: 0,
        networkAuthority: 0,
        reach: 0,
        receivedInfluence: 0,
        interactionActivity: 0,
      },

    influenceSignals:
      node.influenceSignals ??
      {
        contentImpact: 0,
        networkAuthority: 0,
        reach: 0,
        receivedInfluence: 0,
        interactionActivity: 0,
      },
  };
}


// ===========================================================================
// FINALIZE EDGE
// ===========================================================================

function finalizeEdge(
  edge
) {
  return {
    source:
      edge.source,

    target:
      edge.target,

    interactions: {
      ...edge.interactions,
    },

    weight:
      round(
        toNonNegativeNumber(
          edge.weight
        ),
        4
      ),

    firstInteraction:
      edge.firstInteraction,

    lastInteraction:
      edge.lastInteraction,

    eventIds: [
      ...new Set(
        edge.eventIds.filter(
          Boolean
        )
      ),
    ],
  };
}


// ===========================================================================
// IDENTITY HELPERS
// ===========================================================================

function normalizePlatform(
  platform
) {
  const normalized =
    normalizeIdentifier(
      platform
    );

  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase();
}


function buildNodeId(
  platform,
  id
) {
  const normalizedPlatform =
    normalizePlatform(
      platform
    ) ??
    "unknown";

  let normalizedId =
    normalizeIdentifier(
      id
    );

  if (!normalizedId) {
    return (
      `${normalizedPlatform}:unknown`
    );
  }

  const prefix =
    `${normalizedPlatform}:`;

  while (
    normalizedId
      .toLowerCase()
      .startsWith(
        prefix.toLowerCase()
      )
  ) {
    normalizedId =
      normalizedId.slice(
        prefix.length
      );
  }

  if (!normalizedId) {
    return (
      `${normalizedPlatform}:unknown`
    );
  }

  return (
    `${normalizedPlatform}:${normalizedId}`
  );
}


function buildExternalNodeId(
  platform,
  id
) {
  const normalizedPlatform =
    normalizePlatform(
      platform
    ) ??
    "unknown";

  let normalizedId =
    normalizeIdentifier(
      id
    );

  if (!normalizedId) {
    normalizedId =
      "unknown";
  }

  const prefix =
    `${normalizedPlatform}:`;

  while (
    normalizedId
      .toLowerCase()
      .startsWith(
        prefix.toLowerCase()
      )
  ) {
    normalizedId =
      normalizedId.slice(
        prefix.length
      );
  }

  if (!normalizedId) {
    normalizedId =
      "unknown";
  }

  return (
    `external:${normalizedPlatform}:${normalizedId}`
  );
}


// ===========================================================================
// NORMALIZATION HELPERS
// ===========================================================================

function normalizeIdentifier(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized.length > 0
    ? normalized
    : null;
}


function normalizeUsername(
  value
) {
  const normalized =
    normalizeIdentifier(
      value
    );

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/^@/, "")
    .toLowerCase();
}


function normalizeHashtag(
  value
) {
  const normalized =
    normalizeIdentifier(
      value
    );

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/^#/, "")
    .toLowerCase();
}


// ===========================================================================
// NUMBER HELPERS
// ===========================================================================

function toNonNegativeNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return 0;
  }

  return number;
}


// ===========================================================================
// MATH
// ===========================================================================

function round(
  number,
  decimals = 4
) {
  const safeNumber =
    Number.isFinite(
      Number(number)
    )
      ? Number(number)
      : 0;

  const factor =
    10 ** decimals;

  return (
    Math.round(
      safeNumber * factor
    ) / factor
  );
}


// ===========================================================================
// COMMONJS EXPORT
// ===========================================================================

module.exports = {
  analyzeNetwork,
};
