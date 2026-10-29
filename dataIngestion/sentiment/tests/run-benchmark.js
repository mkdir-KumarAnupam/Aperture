import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs';
import { TypeSafeClient, choice, noul } from '@typesafe-ai/sdk';
import { TAXONOMY } from '../src/taxonomy.js';
import { buildBatchState } from '../src/sentimentWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const client = new TypeSafeClient({ timeout: 30000, maxRetries: 2 });
const rawData = fs.readFileSync(path.resolve(__dirname, 'data.json'), 'utf8');
const testCases = JSON.parse(rawData);

console.log(`Loaded ${testCases.length} test cases from data.json.`);

// Pricing constants
const COST_PER_MILLION_INPUT_TOKENS = 0.042; // $0.042 / 1M tokens
const COST_PER_INPUT_TOKEN = COST_PER_MILLION_INPUT_TOKENS / 1000000;

async function evaluateCase(tc, index) {
  const narrativeOptions = { "none_of_these": "None of the provided narratives fit" };
  const pool = tc.pool || [];
  pool.forEach(p => { 
    narrativeOptions[p.narrative_text] = p.narrative_text; 
  });

  const state = buildBatchState(tc.trend_label, tc.posts);
  
  const questions = {
    narrative: choice("Which narrative statement or topic is the dominant discussion focusing on or reacting to?", narrativeOptions),
    sentiment: choice("Overall tone:", TAXONOMY.sentiment)
  };

  pool.forEach(p => {
    questions[`relevance_${p.id}`] = noul(`Does the discussion meaningfully participate in this narrative: "${p.narrative_text}"?`);
    questions[`stance_${p.id}`] = choice(`Toward this narrative "${p.narrative_text}":`, TAXONOMY.stance);
  });

  TAXONOMY.affect.forEach(a => {
    questions[`affect_${a}`] = noul(`Is there a tone of ${a}?`);
  });

  const startTime = Date.now();
  let jevResponse;
  let retries = 0;
  while (retries < 3) {
    try {
      jevResponse = await client.systemOne({ state, questions });
      break;
    } catch (err) {
      retries++;
      if (retries >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * retries));
    }
  }
  const latencyMs = Date.now() - startTime;

  const inputTokens = jevResponse.usage?.input_tokens || 0;
  const outputTokens = jevResponse.usage?.output_tokens || 0;
  const costUSD = inputTokens * COST_PER_INPUT_TOKEN;

  const predictedSentiment = jevResponse.answers.sentiment?.choice || null;
  const sentimentConfidence = jevResponse.answers.sentiment?.confidence || 0;
  const sentimentProbs = jevResponse.answers.sentiment?.probabilities || {};

  const predictedNarrativeChoice = jevResponse.answers.narrative?.choice || null;
  const narrativeConfidence = jevResponse.answers.narrative?.confidence || 0;
  const narrativeProbs = jevResponse.answers.narrative?.probabilities || {};

  // Resolve predicted narrative ID
  let predictedNarrativeId = null;
  if (predictedNarrativeChoice === 'none_of_these') {
    predictedNarrativeId = 'none_of_these';
  } else {
    const matched = pool.find(p => p.narrative_text === predictedNarrativeChoice);
    predictedNarrativeId = matched ? matched.id : 'unknown';
  }

  // Stance evaluation
  let predictedStance = null;
  let stanceConfidence = 0;
  if (predictedNarrativeId && predictedNarrativeId !== 'none_of_these' && predictedNarrativeId !== 'unknown') {
    predictedStance = jevResponse.answers[`stance_${predictedNarrativeId}`]?.choice || null;
    stanceConfidence = jevResponse.answers[`stance_${predictedNarrativeId}`]?.confidence || 0;
  }

  // Affects evaluation
  const affects = {};
  TAXONOMY.affect.forEach(a => {
    affects[a] = jevResponse.answers[`affect_${a}`]?.noul || 0;
  });

  // Fallback trigger determination (threshold is 0.70 in Aperture pipeline)
  const actualFallbackTriggered = (
    narrativeConfidence < 0.70 || 
    predictedNarrativeChoice === 'none_of_these' || 
    pool.length === 0
  );

  // Ground truth comparisons
  const gt = tc.ground_truth;
  const sentimentMatch = (predictedSentiment === gt.expected_sentiment);
  
  // Normalized narrative expectation: handles literal "null", null, and "none_of_these"
  const isNoneExpected = (
    gt.expected_narrative_id === 'none_of_these' || 
    gt.expected_narrative_id === 'null' || 
    gt.expected_narrative_id === null ||
    pool.length === 0
  );

  let narrativeMatch = false;
  if (isNoneExpected) {
    narrativeMatch = (predictedNarrativeId === 'none_of_these');
  } else {
    narrativeMatch = (predictedNarrativeId === gt.expected_narrative_id);
  }

  // Stance evaluation: applies when a narrative was matched or evaluated
  let stanceApplicable = Boolean(predictedStance);
  let stanceMatch = false;
  if (stanceApplicable) {
    stanceMatch = (predictedStance === gt.expected_stance);
  } else if (isNoneExpected) {
    // When no narrative fits, stance against a narrative is N/A
    stanceMatch = true;
    stanceApplicable = false;
  }

  const fallbackMatch = (actualFallbackTriggered === Boolean(gt.expected_fallback_triggered));

  // Affect check: are expected primary affects scoring high (>= 0.35)?
  const expectedPrimary = gt.expected_primary_affects || [];
  let primaryAffectHits = 0;
  expectedPrimary.forEach(a => {
    if ((affects[a] || 0) >= 0.35) primaryAffectHits++;
  });
  const affectAlignmentScore = expectedPrimary.length > 0 ? (primaryAffectHits / expectedPrimary.length) : 1;

  return {
    test_id: tc.test_id,
    category: tc.category,
    index,
    latencyMs,
    inputTokens,
    outputTokens,
    costUSD,
    predictions: {
      sentiment: predictedSentiment,
      sentimentConfidence,
      sentimentProbs,
      narrativeChoice: predictedNarrativeChoice,
      narrativeId: predictedNarrativeId,
      narrativeConfidence,
      narrativeProbs,
      stance: predictedStance,
      stanceConfidence,
      affects,
      fallbackTriggered: actualFallbackTriggered
    },
    ground_truth: gt,
    evaluation: {
      sentimentMatch,
      narrativeMatch,
      stanceMatch,
      stanceApplicable,
      fallbackMatch,
      affectAlignmentScore,
      allCoreMatched: sentimentMatch && narrativeMatch && (stanceApplicable ? stanceMatch : true)
    }
  };
}

async function runBenchmark() {
  const CONCURRENCY = 4;
  const results = new Array(testCases.length);
  let completed = 0;
  let activeIndex = 0;

  console.log(`Starting benchmark with concurrency: ${CONCURRENCY}...`);
  const benchmarkStartTime = Date.now();

  async function worker() {
    while (activeIndex < testCases.length) {
      const idx = activeIndex++;
      const tc = testCases[idx];
      try {
        const res = await evaluateCase(tc, idx);
        results[idx] = res;
        completed++;
        if (completed % 20 === 0 || completed === testCases.length) {
          const pct = ((completed / testCases.length) * 100).toFixed(0);
          console.log(`Progress: ${completed}/${testCases.length} (${pct}%) completed...`);
        }
      } catch (err) {
        console.error(`Error on test case ${idx} (${tc.test_id}):`, err.message || err);
        results[idx] = {
          test_id: tc.test_id,
          category: tc.category,
          index: idx,
          error: err.message,
          evaluation: { sentimentMatch: false, narrativeMatch: false, stanceMatch: false, fallbackMatch: false, affectAlignmentScore: 0 }
        };
        completed++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTimeMs = Date.now() - benchmarkStartTime;
  console.log(`\nAll 100 test cases evaluated in ${(totalTimeMs / 1000).toFixed(2)}s.`);

  // Write full raw results
  fs.writeFileSync(path.resolve(__dirname, '../testresults/benchmark-results.json'), JSON.stringify(results, null, 2));

  // Generate Summary Metrics
  const validResults = results.filter(r => !r.error);
  const total = validResults.length;

  const sentimentCorrect = validResults.filter(r => r.evaluation.sentimentMatch).length;
  const narrativeCorrect = validResults.filter(r => r.evaluation.narrativeMatch).length;
  
  const applicableStanceCases = validResults.filter(r => r.evaluation.stanceApplicable);
  const stanceCorrect = applicableStanceCases.filter(r => r.evaluation.stanceMatch).length;
  
  const fallbackCorrect = validResults.filter(r => r.evaluation.fallbackMatch).length;
  const allCoreCorrect = validResults.filter(r => r.evaluation.allCoreMatched).length;

  const avgAffectScore = validResults.reduce((acc, r) => acc + r.evaluation.affectAlignmentScore, 0) / total;

  const totalInputTokens = validResults.reduce((acc, r) => acc + r.inputTokens, 0);
  const totalOutputTokens = validResults.reduce((acc, r) => acc + r.outputTokens, 0);
  const totalCostUSD = validResults.reduce((acc, r) => acc + r.costUSD, 0);

  const avgLatency = validResults.reduce((acc, r) => acc + r.latencyMs, 0) / total;
  const latencies = validResults.map(r => r.latencyMs).sort((a,b) => a - b);
  const p50Latency = latencies[Math.floor(latencies.length * 0.5)];
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

  // Per category accuracy
  const categoryStats = {};
  validResults.forEach(r => {
    if (!categoryStats[r.category]) {
      categoryStats[r.category] = { 
        total: 0, 
        sentimentOk: 0, 
        narrativeOk: 0, 
        stanceOk: 0, 
        stanceApplicable: 0, 
        cost: 0, 
        tokens: 0 
      };
    }
    const c = categoryStats[r.category];
    c.total++;
    if (r.evaluation.sentimentMatch) c.sentimentOk++;
    if (r.evaluation.narrativeMatch) c.narrativeOk++;
    if (r.evaluation.stanceApplicable) {
      c.stanceApplicable++;
      if (r.evaluation.stanceMatch) c.stanceOk++;
    }
    c.cost += r.costUSD;
    c.tokens += r.inputTokens;
  });

  // Sentiment Confusion Matrix
  const sentimentClasses = ['positive', 'negative', 'neutral', 'mixed'];
  const confusion = {};
  sentimentClasses.forEach(e => {
    confusion[e] = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  });
  validResults.forEach(r => {
    const exp = r.ground_truth.expected_sentiment;
    const pred = r.predictions.sentiment;
    if (confusion[exp] && confusion[exp][pred] !== undefined) {
      confusion[exp][pred]++;
    }
  });

  const summary = {
    totalTestCases: total,
    totalTimeSeconds: (totalTimeMs / 1000).toFixed(2),
    accuracy: {
      sentimentAccuracyPct: ((sentimentCorrect / total) * 100).toFixed(2) + '%',
      narrativeAccuracyPct: ((narrativeCorrect / total) * 100).toFixed(2) + '%',
      stanceAccuracyPct: ((stanceCorrect / applicableStanceCases.length) * 100).toFixed(2) + '%',
      stanceTotalApplicable: `${stanceCorrect}/${applicableStanceCases.length}`,
      fallbackCalibrationPct: ((fallbackCorrect / total) * 100).toFixed(2) + '%',
      affectAlignmentPct: (avgAffectScore * 100).toFixed(2) + '%',
      allCoreMatchedPct: ((allCoreCorrect / total) * 100).toFixed(2) + '%'
    },
    costs: {
      totalInputTokens,
      totalOutputTokens,
      avgInputTokensPerBatch: (totalInputTokens / total).toFixed(1),
      totalCostUSD: totalCostUSD.toFixed(6),
      costPerBatchUSD: (totalCostUSD / total).toFixed(6),
      projectedCost1kBatches: ((totalCostUSD / total) * 1000).toFixed(4),
      projectedCost10kBatches: ((totalCostUSD / total) * 10000).toFixed(4),
      projectedCost100kBatches: ((totalCostUSD / total) * 100000).toFixed(4),
      projectedCost1M_Batches: ((totalCostUSD / total) * 1000000).toFixed(2)
    },
    latency: {
      avgLatencyMs: avgLatency.toFixed(1),
      p50LatencyMs: p50Latency,
      p95LatencyMs: p95Latency,
      minLatencyMs: latencies[0],
      maxLatencyMs: latencies[latencies.length - 1]
    },
    categoryBreakdown: categoryStats,
    confusionMatrix: confusion
  };

  fs.writeFileSync(path.resolve(__dirname, '../testresults/benchmark-summary.json'), JSON.stringify(summary, null, 2));
  console.log('Saved benchmark-summary.json.');
  console.log('\n=== REFINED BENCHMARK SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

runBenchmark().catch(console.error);
