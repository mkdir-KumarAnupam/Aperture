import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../testresults/benchmark-results.json'), 'utf8'));
const failed = results.filter(r => !r.evaluation.allCoreMatched);

console.log(`Total Failed Triple-Match Cases: ${failed.length} / 100\n`);

const failureCounts = {
  sentiment_failed: 0,
  narrative_failed: 0,
  stance_failed: 0
};

const categorizedFailures = {};

failed.forEach((r, i) => {
  const s = r.evaluation.sentimentMatch;
  const n = r.evaluation.narrativeMatch;
  const st = r.evaluation.stanceApplicable ? r.evaluation.stanceMatch : true;

  if (!s) failureCounts.sentiment_failed++;
  if (!n) failureCounts.narrative_failed++;
  if (!st) failureCounts.stance_failed++;

  if (!categorizedFailures[r.category]) categorizedFailures[r.category] = [];
  categorizedFailures[r.category].push({
    test_id: r.test_id,
    failed_dimensions: [!s && 'Sentiment', !n && 'Narrative', !st && 'Stance'].filter(Boolean),
    sentiment: { pred: r.predictions.sentiment, exp: r.ground_truth.expected_sentiment },
    narrative: { pred_id: r.predictions.narrativeId, exp_id: r.ground_truth.expected_narrative_id, choice: r.predictions.narrativeChoice?.slice(0, 40) },
    stance: { pred: r.predictions.stance, exp: r.ground_truth.expected_stance }
  });

  const failedDims = [!s && 'Sentiment', !n && 'Narrative', !st && 'Stance'].filter(Boolean);
  console.log(`${i+1}. [${r.test_id}] (Category: ${r.category})`);
  console.log(`   Failed Dims: ${failedDims.join(' + ')}`);
  if (!s) console.log(`   * Sentiment: Pred "${r.predictions.sentiment}" vs Exp "${r.ground_truth.expected_sentiment}" (conf: ${r.predictions.sentimentConfidence})`);
  if (!n) console.log(`   * Narrative: Pred "${r.predictions.narrativeId}" vs Exp "${r.ground_truth.expected_narrative_id}" (choice: "${r.predictions.narrativeChoice?.slice(0, 50)}")`);
  if (!st) console.log(`   * Stance: Pred "${r.predictions.stance}" vs Exp "${r.ground_truth.expected_stance}" (conf: ${r.predictions.stanceConfidence})`);
});

console.log('\n--- Overall Breakdown of the 21 Failures ---');
console.log(failureCounts);
console.log('\n--- Failures per Category ---');
for (const cat in categorizedFailures) {
  console.log(`- ${cat}: ${categorizedFailures[cat].length} failures`);
}
