import "dotenv/config";
import { classifyTier2 } from "./tier2.js";

const testPosts = [
  {
    name: "Sarcasm",
    text: "Oh great, another update that breaks everything. Exactly what we needed.",
  },

  {
    name: "Anxiety",
    text: "I'm honestly worried about this decision. I have no idea what's going to happen.",
  },

  {
    name: "Excitement",
    text: "NO WAY! We actually won! This is absolutely incredible!",
  },

  {
    name: "Supportive",
    text: "I completely support this decision. It's exactly the change we needed.",
  },

  {
    name: "Against",
    text: "I strongly disagree with this decision. This is going to make things much worse.",
  },

  {
    name: "Mixed",
    text: "I like the idea, but the implementation is frustrating and needs serious improvement.",
  },
];

console.log("\n========================================");
console.log("TIER 2 DIRECT TEST");
console.log("========================================\n");

try {
  for (const [index, test] of testPosts.entries()) {
    console.log(`\n--- TEST ${index + 1}: ${test.name} ---`);
    console.log(`Text: ${test.text}`);

    const result =
      await classifyTier2(test.text);

    console.log(
      JSON.stringify(result, null, 2)
    );
  }

  console.log("\n========================================");
  console.log("TIER 2 TEST COMPLETED");
  console.log("========================================\n");
} catch (error) {
  console.error("\nTIER 2 TEST FAILED");
  console.error(error);
  process.exit(1);
}
