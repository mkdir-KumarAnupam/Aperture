const {
  analyzeNetwork,
} = require("./networkAnalysis");

const canonical = {
  schemaVersion: "1.0.0",

  run_id: "chunk4-test",

  trend: {
    label: "Chunk 4 Test",
  },

  collection: {
    collectionId: "test-collection",
  },

  events: [
    // ================================================================
    // Alice original post
    // ================================================================

    {
      eventId: "event-1",
      platform: "x",
      platformPostId: "post-alice",

      author: {
        authorId: "100",
        authorHandle: "alice",
        authorName: "Alice",
      },

      content: {
        text: "Alice original post",
        hashtags: [],
        mentions: [],
      },

      time: {
        publishedAt: "2026-09-15T00:00:00Z",
      },

      engagement: {
        likes: 10,
        replies: 0,
        reposts: 0,
        quotes: 0,
        views: 100,
      },

      relationships: {},
    },

    // ================================================================
    // Bob original post
    // ================================================================

    {
      eventId: "event-2",
      platform: "x",
      platformPostId: "post-bob",

      author: {
        authorId: "200",
        authorHandle: "bob",
        authorName: "Bob",
      },

      content: {
        text: "Bob original post",
        hashtags: [],
        mentions: [],
      },

      time: {
        publishedAt: "2026-09-15T00:01:00Z",
      },

      engagement: {
        likes: 5,
        replies: 0,
        reposts: 0,
        quotes: 0,
        views: 50,
      },

      relationships: {},
    },

    // ================================================================
    // Charlie quotes Alice
    // ================================================================

    {
      eventId: "event-3",
      platform: "x",
      platformPostId: "post-charlie",

      author: {
        authorId: "300",
        authorHandle: "charlie",
        authorName: "Charlie",
      },

      content: {
        text: "Charlie quotes Alice",
        hashtags: [],
        mentions: [],
      },

      time: {
        publishedAt: "2026-09-15T00:02:00Z",
      },

      engagement: {
        likes: 2,
        replies: 0,
        reposts: 0,
        quotes: 1,
        views: 30,
      },

      relationships: {
        quoteOfId: "post-alice",
      },
    },

    // ================================================================
    // Dave reposts Bob
    // ================================================================

    {
      eventId: "event-4",
      platform: "x",
      platformPostId: "post-dave",

      author: {
        authorId: "400",
        authorHandle: "dave",
        authorName: "Dave",
      },

      content: {
        text: "Dave reposts Bob",
        hashtags: [],
        mentions: [],
      },

      time: {
        publishedAt: "2026-09-15T00:03:00Z",
      },

      engagement: {
        likes: 1,
        replies: 0,
        reposts: 1,
        quotes: 0,
        views: 20,
      },

      relationships: {
        forwardOfId: "post-bob",
      },
    },
  ],
};

const result =
  analyzeNetwork(canonical);

console.log(
  "\n=============================="
);

console.log(
  "NODES"
);

console.log(
  JSON.stringify(
    result.nodes,
    null,
    2
  )
);

console.log(
  "\n=============================="
);

console.log(
  "EDGES"
);

console.log(
  JSON.stringify(
    result.edges,
    null,
    2
  )
);

console.log(
  "\n=============================="
);

console.log(
  "SUMMARY"
);

console.log(
  JSON.stringify(
    result.summary,
    null,
    2
  )
);
