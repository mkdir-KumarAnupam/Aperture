import fs from 'fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.resolve(__dirname, 'data.json'), 'utf8');
const data = JSON.parse(raw);

console.log('=== DATASET SUMMARY ===');
console.log(`Total Test Cases: ${data.length}`);

const categories = {};
const sentiments = {};
const stances = {};
const fallbacks = { true: 0, false: 0 };
const narrativeTypes = { matching_id: 0, none_of_these: 0, other: 0 };
let totalPosts = 0;
let totalChars = 0;

data.forEach((tc, idx) => {
  // Category
  categories[tc.category] = (categories[tc.category] || 0) + 1;
  
  // Ground truth
  const gt = tc.ground_truth;
  if (!gt) {
    console.error(`Missing ground_truth at index ${idx} (${tc.test_id})`);
    return;
  }
  
  sentiments[gt.expected_sentiment] = (sentiments[gt.expected_sentiment] || 0) + 1;
  stances[gt.expected_stance] = (stances[gt.expected_stance] || 0) + 1;
  fallbacks[Boolean(gt.expected_fallback_triggered)]++;
  
  if (gt.expected_narrative_id === 'none_of_these') {
    narrativeTypes.none_of_these++;
  } else if (gt.expected_narrative_id) {
    narrativeTypes.matching_id++;
  } else {
    narrativeTypes.other++;
  }

  // Posts
  totalPosts += tc.posts?.length || 0;
  tc.posts?.forEach(p => {
    totalChars += p.text?.length || 0;
  });
});

console.log('\n--- Category Breakdown ---');
console.table(categories);

console.log('\n--- Ground Truth Sentiment Distribution ---');
console.table(sentiments);

console.log('\n--- Ground Truth Stance Distribution ---');
console.table(stances);

console.log('\n--- Fallback Expectation Distribution ---');
console.table(fallbacks);

console.log('\n--- Narrative Expectations ---');
console.table(narrativeTypes);

console.log('\n--- Post & Text Volume ---');
console.log(`Total Posts: ${totalPosts}`);
console.log(`Avg Posts per Case: ${(totalPosts / data.length).toFixed(1)}`);
console.log(`Avg Chars per Case: ${(totalChars / data.length).toFixed(0)}`);
