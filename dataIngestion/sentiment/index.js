import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { analyzeBatch } from "./src/pipeline.js";

// Replace this with your actual scraped X / Reddit / Telegram posts,
// e.g. loaded from a JSON/CSV file or a database.
const samplePosts = [
  "this new update completely ruined the app, worst decision ever",
  "just had lunch, nothing special",
  "absolutely loving the new feature, works flawlessly!!",
  "not sure how I feel about this tbh, could go either way",
  "lol classic, they did it again 🙄 sure, 'great job' guys...",
  "I can't believe the new movie is finally out! The trailers looked amazing.",
  "The train was delayed by 15 minutes, which was a bit annoying but not the end of the world.",
  "This is the best customer service I've ever experienced!",
  "The restaurant was okay, the food was decent but the service was slow.",
  "What a waste of time and money, I definitely don't recommend this.",
  "Just received my package, everything is perfect and arrived earlier than expected.",
  "The weather is quite dull today, just grey skies and a bit chilly.",
  "I'm so excited for the concert tonight! Been waiting for this for months.",
  "The lecture was informative but a bit dry, I almost fell asleep.",
  "This product exceeded all my expectations, highly recommend!",
  "The instructions were unclear and I had a hard time assembling it.",
  "I'm feeling really positive about the upcoming changes at work.",
  "It's just another regular day, nothing out of the ordinary.",
  "The performance was absolutely stunning, I'm speechless.",
  "I have mixed feelings about the new policy, it has some pros and cons."
];

async function main() {
  console.log(`Analyzing ${samplePosts.length} posts...\n`);
  const results = await analyzeBatch(samplePosts);

  await writeFile("results.json", JSON.stringify(results, null, 2));
  console.log("\nSaved results to results.json");

  const tierCounts = results.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + 1;
    return acc;
  }, {});
  console.log("Tier usage:", tierCounts);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
