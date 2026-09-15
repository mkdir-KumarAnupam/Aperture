const {
  analyzeNetwork,
} = require("./networkAnalysis");

const canonical = {
  schemaVersion: "1.0.0",

  run_id: "network-test-001",

  trend: {
    label: "Network Test",
  },

  collection: {
    collectionId: "test-collection",
  },

  events: [
    // ---------------------------------------------------------------
    // Alice publishes a post
    // ---------------------------------------------------------------
    {
      eventId: "post-1",

      platform: "x",

      platformPostId: "100",

      content: {
        text: "Testing the network",

        hashtags: [],

        mentions: [],
      },

      author: {
        authorId: "100",
        authorHandle: "alice",
        authorName: "Alice",
      },

      time: {
        publishedAt:
          "2026-09-15T00:00:00Z",
      },

      engagement: {
        likes: 100,
        replies: 10,
        reposts: 20,
        quotes: 5,
        views: 5000,
      },

      relationships: {},

      platformData: {
        authorFollowers: 10000,
        authorVerified: true,
      },
    },

    // ---------------------------------------------------------------
    // Bob publishes
    // ---------------------------------------------------------------
    {
      eventId: "post-2",

      platform: "x",

      platformPostId: "200",

      content: {
        text: "Bob's post",

        hashtags: [],

        mentions: [],
      },

      author: {
        authorId: "200",
        authorHandle: "bob",
        authorName: "Bob",
      },

      time: {
        publishedAt:
          "2026-09-15T00:01:00Z",
      },

      engagement: {
        likes: 20,
        replies: 2,
        reposts: 3,
        quotes: 0,
        views: 1000,
      },

      relationships: {},

      platformData: {
        authorFollowers: 5000,
        authorVerified: false,
      },
    },

    // ---------------------------------------------------------------
    // Charlie publishes
    // ---------------------------------------------------------------
    {
      eventId: "post-3",

      platform: "x",

      platformPostId: "300",

      content: {
        text: "Charlie here",

        hashtags: [],

        mentions: [],
      },

      author: {
        authorId: "300",
        authorHandle: "charlie",
        authorName: "Charlie",
      },

      time: {
        publishedAt:
          "2026-09-15T00:02:00Z",
      },

      engagement: {
        likes: 5,
        replies: 0,
        reposts: 0,
        quotes: 0,
        views: 200,
      },

      relationships: {},

      platformData: {
        authorFollowers: 1000,
        authorVerified: false,
      },
    },
  ],

  // =================================================================
  // EXPLICIT SOCIAL RELATIONSHIPS
  // =================================================================

  networkRelationships: [
    // ---------------------------------------------------------------
    // Bob follows Alice
    // ---------------------------------------------------------------
    {
      relationshipId:
        "follow-bob-alice",

      platform: "x",

      sourceUserId: "200",

      targetUserId: "100",

      type: "follow",

      observedAt:
        "2026-09-15T00:03:00Z",
    },

    // ---------------------------------------------------------------
    // Charlie follows Alice
    // ---------------------------------------------------------------
    {
      relationshipId:
        "follow-charlie-alice",

      platform: "x",

      sourceUserId: "300",

      targetUserId: "100",

      type: "follow",

      observedAt:
        "2026-09-15T00:04:00Z",
    },

    // ---------------------------------------------------------------
    // Bob likes Alice's post
    // ---------------------------------------------------------------
    {
      relationshipId:
        "like-bob-alice",

      platform: "x",

      sourceUserId: "200",

      targetUserId: "100",

      type: "like",

      postId: "100",

      observedAt:
        "2026-09-15T00:05:00Z",
    },

    // ---------------------------------------------------------------
    // Charlie likes Alice's post
    // ---------------------------------------------------------------
    {
      relationshipId:
        "like-charlie-alice",

      platform: "x",

      sourceUserId: "300",

      targetUserId: "100",

      type: "like",

      postId: "100",

      observedAt:
        "2026-09-15T00:06:00Z",
    },

    // ---------------------------------------------------------------
    // Charlie likes Bob's post
    // ---------------------------------------------------------------
    {
      relationshipId:
        "like-charlie-bob",

      platform: "x",

      sourceUserId: "300",

      targetUserId: "200",

      type: "like",

      postId: "200",

      observedAt:
        "2026-09-15T00:07:00Z",
    },
  ],
};


// =====================================================================
// RUN
// =====================================================================

const result =
  analyzeNetwork(canonical);


// =====================================================================
// SUMMARY
// =====================================================================

console.log("\n=== SUMMARY ===");

console.dir(
  result.summary,
  {
    depth: null,
  }
);


// =====================================================================
// NODES
// =====================================================================

console.log("\n=== NODES ===");

for (
  const node of result.nodes
) {
  console.log(
    `\n${node.username}`
  );

  console.dir(
    {
      id: node.id,

      followers:
        node.profile.followers,

      metrics: {
        likesReceived:
          node.metrics.likesReceived,

        likesReceivedNetwork:
          node.metrics.likesReceivedNetwork,

        likesGiven:
          node.metrics.likesGiven,

        followsReceived:
          node.metrics.followsReceived,

        followsGiven:
          node.metrics.followsGiven,

        posts:
          node.metrics.posts,

        totalInteractions:
          node.metrics.totalInteractions,
      },

      centrality:
        node.centrality,

      influence:
        node.influence,

      influenceRank:
        node.influenceRank,

      influenceTier:
        node.influenceTier,
    },
    {
      depth: null,
    }
  );
}


// =====================================================================
// EDGES
// =====================================================================

console.log("\n=== EDGES ===");

console.dir(
  result.edges,
  {
    depth: null,
  }
);


// =====================================================================
// TOP INFLUENCERS
// =====================================================================

console.log(
  "\n=== TOP INFLUENCERS ==="
);

console.dir(
  result.topInfluencers,
  {
    depth: null,
  }
);
