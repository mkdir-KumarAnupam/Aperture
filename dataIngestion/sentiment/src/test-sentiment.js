import "dotenv/config";
import { analyzeBatch } from "./pipeline.js";

const testPosts = [
  // Clearly positive
  "This update is absolutely amazing! The new features are incredible.",

  // Clearly negative
  "This is the worst update I've seen. Completely ruined the experience.",

  // Sarcasm
  "Oh great, another update that breaks everything. Exactly what we needed.",

  // Anxiety + uncertainty
  "I'm honestly worried about this decision. I have no idea what's going to happen.",

  // Mixed / stance
  "I actually like the idea, but the implementation is frustrating and needs work.",
];

console.log("\n========================================");
console.log("SENTIMENT PIPELINE TEST");
console.log("========================================\n");

try {
  const results =
    await analyzeBatch(testPosts);

  results.forEach((result, index) => {
    console.log(`\n--- TEST ${index + 1} ---`);
    console.log(`Text: ${testPosts[index]}`);
    console.log(JSON.stringify(result, null, 2));
  });

  console.log("\n========================================");
  console.log("TEST COMPLETED");
  console.log("========================================\n");
} catch (error) {
  console.error("\nSENTIMENT TEST FAILED");
  console.error(error);
  process.exit(1);
}
