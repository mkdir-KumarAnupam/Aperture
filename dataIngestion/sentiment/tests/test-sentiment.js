/**
 * ============================================================================
 * TEST: STANDALONE BULLMQ SENTIMENT QUEUE HARNESS & SYNTHETIC BENCHMARK
 * ============================================================================
 *
 * File: test-sentiment.js
 * Directory: dataIngestion/sentiment/JEV/
 *
 * Purpose:
 * --------
 * This script provides a self-contained test environment for evaluating the
 * JEV sentiment worker in isolation using BullMQ queues and synthetic social
 * media post datasets.
 *
 * Test Scenarios Evaluated:
 * -------------------------
 * 1. Scenario 1 (Existing Narrative Alignment):
 *    - Supplies an existing narrative pool for "AI Replacing Junior Developers".
 *    - Injects synthetic posts exhibiting high anger, anxiety, and joy.
 *    - Validates that JEV SystemOne correctly scores discrete sentiment,
 *      evaluates continuous 8-dimension affect intensity, and selects the
 *      matching narrative from the pool without invoking the LLM fallback.
 *
 * 2. Scenario 2 (Gemini LLM Fallback & Narrative Discovery):
 *    - Supplies an empty narrative pool (`pool: []`) for "Mars Colony Funding".
 *    - Forces the confidence threshold check to fail, triggering the Gemini
 *      multi-key fallback to propose a brand-new concise narrative.
 *    - Triggers the dual-write flow to persist the new narrative to PostgreSQL
 *      and Redis, followed by the secondary JEV evaluation.
 *
 * Output:
 * -------
 * Writes full structured JSON outputs returned by each completed job to
 * `dataIngestion/sentiment/JEV/output.txt`.
 *
 * ============================================================================
 */

import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Queue, QueueEvents } from 'bullmq';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import worker factory
import { createSentimentWorker } from '../src/sentimentWorker.js'; 

// Explicitly initialize worker so it begins consuming from SentimentQueue immediately
const worker = createSentimentWorker();
worker.on('error', (err) => console.error('[Worker Error]:', err)); 

// ============================================================================
// SYNTHETIC DATA GENERATOR
// ============================================================================

/**
 * Generates an array of synthetic social media posts mixing realistic
 * sentiment statements with conversational social variations and randomized
 * interaction engagement metrics.
 *
 * @param {string[]} templates - Seed sentences reflecting sentiment/stance
 * @returns {Array<{ postId: string, platform: string, text: string, interactions: number }>}
 */
function generatePosts(templates) {
  // Conversational sentence appendages to simulate natural human chatter
  const variations = [
    "", 
    " TBH.", 
    " So true.", 
    " Smh.", 
    " Anyone else agree?", 
    " Just my two cents.",
    " Unpopular opinion but...",
    " This is what everyone is missing."
  ];
  
  const posts = [];
  
  // Generate exactly 30 posts to hit the batch limit (BATCH_POST_LIMIT)
  for (let i = 1; i <= 30; i++) {
    const baseText = templates[Math.floor(Math.random() * templates.length)];
    const extra = variations[Math.floor(Math.random() * variations.length)];
    
    posts.push({
      postId: `post_${Date.now()}_${i}`,
      platform: i % 2 === 0 ? 'twitter' : 'reddit',
      text: (baseText + extra).trim(),
      // Random interaction count to verify sorting by influence/engagement
      interactions: Math.floor(Math.random() * 5000) 
    });
  }
  
  return posts;
}

// ============================================================================
// BENCHMARK TEST PAYLOADS
// ============================================================================

const testPayloads = [
  /**
   * PAYLOAD 1: High-Confidence Narrative Match & Multi-Affect Extraction
   * Tests JEV's ability to match an existing narrative statement from the pool
   * and extract nuanced multi-dimensional emotion vectors.
   */
  {
    trend_label: "AI Replacing Junior Developers",
    pool_is_full: false,
    pool: [
      { id: "narrative-1", narrative_text: "AI will completely replace junior developer roles within 5 years." },
      { id: "narrative-2", narrative_text: "AI is just a productivity tool that makes developers faster, not obsolete." },
      { id: "narrative-3", narrative_text: "The AI hype is a bubble; it is just advanced autocomplete." }
    ],
    posts: generatePosts([
      "I just got laid off and they told me an AI agent is taking over my workload. I am so angry and terrified right now.",
      "Honestly, using AI has made my job 10x easier. I'm excited for the future of coding!",
      "People are overreacting. I tried to make the LLM build a full app and it completely hallucinated the DB schema. We are fine.",
      "The market is absolutely brutal for juniors right now. Nobody wants to hire someone to write boilerplate anymore.",
      "If you just learn how to review AI code instead of writing it from scratch, you will be highly paid.",
      "I'm feeling so anxious about my CS degree. Should I even finish it or switch to plumbing?",
      "Just shipped a feature in 2 days that normally takes 2 weeks. The joy of AI coding is real!"
    ])
  },

  /**
   * PAYLOAD 2: LLM Fallback Narrative Discovery
   * Tests the Gemini fallback mechanism when no prior narratives exist (`pool: []`).
   * The worker must consult the LLM, propose a new narrative, dual-write it,
   * and complete follow-up stance and relevance scoring.
   */
  {
    trend_label: "Mars Colony Funding",
    pool_is_full: false,
    pool: [], // Empty pool forces the LLM to kick in and propose something new
    posts: generatePosts([
      "I can't believe we are spending billions on Mars when Earth is literally burning.",
      "Space exploration is the only way humanity survives. We need to fund this!",
      "Honestly, the Mars colony is just a billionaire's ego trip. Complete waste of money.",
      "I'm so excited about the new rocket launch! This is history in the making.",
      "Why are we taxing the working class to send rich people to a dead planet?"
    ])
  }
];

// ============================================================================
// QUEUE & INFRASTRUCTURE SETUP
// ============================================================================

const LOCAL_REDIS_URL = process.env.LOCAL_REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new URL(LOCAL_REDIS_URL);

/** BullMQ Queue for dispatching sentiment jobs */
const sentimentQueue = new Queue('SentimentQueue', { connection });

/** BullMQ QueueEvents listener for tracking job completions and failures */
const queueEvents = new QueueEvents('SentimentQueue', { connection });

// Initialize output file (clears previous run content)
const outputFilePath = fileURLToPath(new URL('../testresults/output.txt', import.meta.url));
fs.writeFileSync(outputFilePath, '--- Sentiment Worker Test Results ---\n\n', 'utf-8');

let completedJobs = 0;

// ============================================================================
// EVENT LISTENERS & LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Handle successful completion of a sentiment job.
 * Appends output to output.txt and triggers graceful shutdown when all jobs finish.
 */
queueEvents.on('completed', async ({ jobId, returnvalue }) => {
  console.log(`✅ Job ${jobId} completed successfully!`);
  
  // Format and append the worker's returned JSON analytics object
  fs.appendFileSync(
    outputFilePath, 
    `Job ${jobId} Result:\n` + JSON.stringify(returnvalue, null, 2) + '\n\n', 
    'utf-8'
  );
  
  completedJobs++;
  
  // Shutdown all queue listeners and worker instances when complete
  if (completedJobs === testPayloads.length) {
    console.log('📝 All test results written to output.txt. Shutting down...');
    await sentimentQueue.close();
    await queueEvents.close();
    await worker.close(); 
    process.exit(0);
  }
});

/**
 * Handle job failure. Logs the error and exits immediately to avoid hanging runners.
 */
queueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
  process.exit(1);
});

// ============================================================================
// BENCHMARK RUNNER DISPATCH
// ============================================================================

async function runTest() {
  console.log(`🚀 Starting sentiment worker test...`);
  console.log(`📦 Dispatching ${testPayloads.length} trends (30 posts each) to SentimentQueue...\n`);
  
  for (let i = 0; i < testPayloads.length; i++) {
    await sentimentQueue.add(`test-batch-${i}`, testPayloads[i]);
  }
}

// Execute the test harness
runTest().catch(console.error);
