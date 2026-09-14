// ─────────────────────────────────────────────────────────────────────────────
// SIH Trend Intelligence — Centralized Mock Data
// Prototype · Simulated analytics · Not live data
//
// All charts and visualizations derive from this single source of truth.
// Components must NEVER independently generate their own values.
// ─────────────────────────────────────────────────────────────────────────────

import { TrendAnalytics, HotTrendSummary } from "./types";

// ─── Helper: generate lifecycle series ───────────────────────────────────────

function makeLifecycleSeries(
  days: number,
  startDate: Date,
  profile: "slow_then_spike" | "sustained_high" | "gradual" | "volatile",
  base: { x: number; reddit: number; telegram: number }
) {
  const points = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    const progress = i / Math.max(days - 1, 1);

    let xMult = 1;
    let rMult = 1;
    let tMult = 1;

    if (profile === "slow_then_spike") {
      const spike = progress > 0.65 && progress < 0.85;
      const decay = progress >= 0.85;
      xMult = spike ? 1.9 + Math.sin(progress * 12) * 0.3 : decay ? 1.5 - (progress - 0.85) * 2 : 0.6 + progress * 0.8;
      rMult = spike ? 1.6 : decay ? 1.3 : 0.5 + progress * 0.7;
      tMult = spike ? 2.1 : decay ? 1.6 : 0.4 + progress;
    } else if (profile === "sustained_high") {
      xMult = 0.8 + progress * 0.4 + Math.sin(progress * 20) * 0.08;
      rMult = 0.7 + progress * 0.5 + Math.sin(progress * 15) * 0.06;
      tMult = 0.9 + progress * 0.3 + Math.cos(progress * 18) * 0.07;
    } else if (profile === "gradual") {
      xMult = 0.3 + progress * 1.4;
      rMult = 0.25 + progress * 1.5;
      tMult = 0.35 + progress * 1.2;
    } else {
      xMult = 0.5 + Math.sin(progress * 25) * 0.4 + progress * 0.5;
      rMult = 0.4 + Math.cos(progress * 20) * 0.35 + progress * 0.6;
      tMult = 0.6 + Math.sin(progress * 22 + 1) * 0.3 + progress * 0.4;
    }

    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
    const x = clamp(base.x * xMult);
    const reddit = clamp(base.reddit * rMult);
    const telegram = clamp(base.telegram * tMult);
    const combined = Math.round((x + reddit + telegram) / 3);

    points.push({ date: label, x, reddit, telegram, combined });
  }
  return points;
}

function buildLifecycle(
  profile: "slow_then_spike" | "sustained_high" | "gradual" | "volatile",
  base: { x: number; reddit: number; telegram: number }
) {
  const now = new Date("2026-09-05");
  const d7 = new Date(now); d7.setDate(d7.getDate() - 6);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 29);
  const d90 = new Date(now); d90.setDate(d90.getDate() - 89);
  const d365 = new Date(now); d365.setDate(d365.getDate() - 364);

  return {
    "7D": makeLifecycleSeries(7, d7, profile, base),
    "30D": makeLifecycleSeries(30, d30, profile, base),
    "90D": makeLifecycleSeries(90, d90, profile, base),
    "1Y": makeLifecycleSeries(52, d365, profile, { x: Math.round(base.x * 0.7), reddit: Math.round(base.reddit * 0.7), telegram: Math.round(base.telegram * 0.7) }),
  };
}

// ─── TREND 1: AI Photo Editing ───────────────────────────────────────────────

const aiPhotoEditing: TrendAnalytics = {
  id: "ai-photo-editing",
  name: "AI Photo Editing",
  description:
    "A surge in AI-powered photo editing tools — from background removal to generative fill and style transfer — is capturing the imagination of Indian creators, photographers, and casual users. Driven by viral Reels showcasing dramatic before/after results, the trend is strongest among 18–34-year-old urban users across Maharashtra and Karnataka.",
  category: "Technology / Creator Economy",
  trendScore: 82,
  platformActivity: { x: 86, reddit: 74, telegram: 71 },
  totalMentions: "2.4M",
  approximateReach: "18.2M",
  growthPercent: "+82%",
  peakGrowth: "+126%",
  peakDate: "Aug 28",
  fastestPlatform: "x",

  lifecycle: buildLifecycle("slow_then_spike", { x: 86, reddit: 74, telegram: 71 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 22, female: 19, other: 2 },
      { ageRange: "25–34", male: 18, female: 14, other: 1 },
      { ageRange: "35–44", male: 10, female: 8, other: 1 },
      { ageRange: "45–54", male: 3, female: 2, other: 0 },
      { ageRange: "55+", male: 0, female: 0, other: 0 },
    ],
    languages: [
      { language: "English", share: 38 },
      { language: "Hindi", share: 29 },
      { language: "Marathi", share: 12 },
      { language: "Kannada", share: 10 },
      { language: "Tamil", share: 6 },
      { language: "Other", share: 5 },
    ],
    regions: [
      { state: "Maharashtra", share: 82, mentions: "482K" },
      { state: "Karnataka", share: 74, mentions: "391K" },
      { state: "Delhi", share: 69, mentions: "318K" },
      { state: "Tamil Nadu", share: 61, mentions: "247K" },
      { state: "West Bengal", share: 49, mentions: "182K" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 1", positive: 52, neutral: 38, negative: 10 },
      { date: "Aug 8", positive: 55, neutral: 35, negative: 10 },
      { date: "Aug 15", positive: 59, neutral: 32, negative: 9 },
      { date: "Aug 22", positive: 63, neutral: 27, negative: 10 },
      { date: "Aug 28", positive: 66, neutral: 22, negative: 12 },
      { date: "Sep 1", positive: 62, neutral: 24, negative: 14 },
      { date: "Sep 5", positive: 60, neutral: 26, negative: 14 },
    ],
    breakdown: { positive: 62, neutral: 24, negative: 14 },
    themes: {
      positive: ["Innovation", "Creative freedom", "Ease of use", "Viral results"],
      negative: ["Originality concerns", "Privacy worries", "Watermarks"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "@TechWithAdi", platform: "x", community: "Tech Creators", influence: 92, type: "account" },
      { id: "n2", label: "@PixelMagicIN", platform: "x", community: "Tech Creators", influence: 78, type: "account" },
      { id: "n3", label: "@PhotogIndia", platform: "x", community: "Photography", influence: 71, type: "account" },
      { id: "n4", label: "r/IndiaAI", platform: "reddit", community: "AI Community", influence: 85, type: "community" },
      { id: "n5", label: "r/photography_india", platform: "reddit", community: "Photography", influence: 64, type: "community" },
      { id: "n6", label: "@AIToolsHub", platform: "telegram", community: "AI Community", influence: 77, type: "account" },
      { id: "n7", label: "@CreatorSpaceIN", platform: "telegram", community: "Tech Creators", influence: 68, type: "account" },
      { id: "n8", label: "@DesignerDev", platform: "x", community: "Tech Creators", influence: 58, type: "account" },
      { id: "n9", label: "@IndiePhotoClub", platform: "x", community: "Photography", influence: 45, type: "account" },
      { id: "n10", label: "@StartupVibes", platform: "x", community: "AI Community", influence: 52, type: "account" },
      { id: "n11", label: "r/india", platform: "reddit", community: "General", influence: 61, type: "community" },
      { id: "n12", label: "@MumbaiCreatives", platform: "telegram", community: "Photography", influence: 43, type: "account" },
    ],
    edges: [
      { source: "n1", target: "n2", strength: 0.9 },
      { source: "n1", target: "n4", strength: 0.7 },
      { source: "n1", target: "n8", strength: 0.8 },
      { source: "n2", target: "n3", strength: 0.6 },
      { source: "n4", target: "n5", strength: 0.5 },
      { source: "n4", target: "n6", strength: 0.7 },
      { source: "n4", target: "n10", strength: 0.6 },
      { source: "n6", target: "n7", strength: 0.8 },
      { source: "n3", target: "n9", strength: 0.5 },
      { source: "n3", target: "n12", strength: 0.4 },
      { source: "n11", target: "n5", strength: 0.4 },
      { source: "n7", target: "n12", strength: 0.6 },
      { source: "n8", target: "n10", strength: 0.5 },
    ],
    topInfluencers: [
      { id: "n1", label: "@TechWithAdi", platform: "x", influence: 92, tier: "high" },
      { id: "n4", label: "r/IndiaAI", platform: "reddit", influence: 85, tier: "high" },
      { id: "n2", label: "@PixelMagicIN", platform: "x", influence: 78, tier: "high" },
      { id: "n6", label: "@AIToolsHub", platform: "telegram", influence: 77, tier: "medium" },
      { id: "n3", label: "@PhotogIndia", platform: "x", influence: 71, tier: "medium" },
    ],
  },

  regional: {
    "Maharashtra": { score: 82, mentions: "482K", growth: "+34%", sentiment: "positive" },
    "Karnataka": { score: 74, mentions: "391K", growth: "+29%", sentiment: "positive" },
    "Delhi": { score: 69, mentions: "318K", growth: "+26%", sentiment: "positive" },
    "Tamil Nadu": { score: 61, mentions: "247K", growth: "+21%", sentiment: "positive" },
    "West Bengal": { score: 49, mentions: "182K", growth: "+16%", sentiment: "positive" },
    "Telangana": { score: 53, mentions: "196K", growth: "+18%", sentiment: "positive" },
    "Uttar Pradesh": { score: 38, mentions: "142K", growth: "+12%", sentiment: "neutral" },
    "Gujarat": { score: 44, mentions: "158K", growth: "+14%", sentiment: "positive" },
    "Rajasthan": { score: 28, mentions: "98K", growth: "+9%", sentiment: "neutral" },
    "Punjab": { score: 32, mentions: "112K", growth: "+10%", sentiment: "positive" },
    "Kerala": { score: 57, mentions: "218K", growth: "+22%", sentiment: "positive" },
    "Madhya Pradesh": { score: 21, mentions: "74K", growth: "+7%", sentiment: "neutral" },
    "Bihar": { score: 14, mentions: "52K", growth: "+5%", sentiment: "neutral" },
    "Andhra Pradesh": { score: 41, mentions: "148K", growth: "+13%", sentiment: "positive" },
    "Haryana": { score: 35, mentions: "124K", growth: "+11%", sentiment: "neutral" },
    "Jharkhand": { score: 12, mentions: "44K", growth: "+4%", sentiment: "neutral" },
    "Assam": { score: 19, mentions: "68K", growth: "+6%", sentiment: "neutral" },
    "Odisha": { score: 22, mentions: "78K", growth: "+8%", sentiment: "neutral" },
    "Himachal Pradesh": { score: 16, mentions: "58K", growth: "+5%", sentiment: "neutral" },
    "Chhattisgarh": { score: 10, mentions: "36K", growth: "+3%", sentiment: "neutral" },
    "Uttarakhand": { score: 20, mentions: "72K", growth: "+7%", sentiment: "neutral" },
    "Goa": { score: 36, mentions: "128K", growth: "+12%", sentiment: "positive" },
    "Tripura": { score: 8, mentions: "28K", growth: "+3%", sentiment: "neutral" },
    "Meghalaya": { score: 9, mentions: "32K", growth: "+3%", sentiment: "neutral" },
    "Manipur": { score: 7, mentions: "24K", growth: "+2%", sentiment: "neutral" },
    "Nagaland": { score: 6, mentions: "20K", growth: "+2%", sentiment: "neutral" },
    "Arunachal Pradesh": { score: 5, mentions: "18K", growth: "+2%", sentiment: "neutral" },
    "Mizoram": { score: 5, mentions: "17K", growth: "+2%", sentiment: "neutral" },
    "Sikkim": { score: 4, mentions: "14K", growth: "+1%", sentiment: "neutral" },
    "Jammu and Kashmir": { score: 18, mentions: "64K", growth: "+6%", sentiment: "neutral" },
  },

  posts: [
    { id: "p1", platform: "x", handle: "@TechWithAdi", content: "Tried Adobe Firefly's new generative fill on my Mumbai street photos and I genuinely cannot tell what's real anymore 🤯 The AI Photo Editing era is here and it's incredible. #AIPhotoEditing", likes: "4.2K", reposts: "1.8K", timestamp: "2h ago" },
    { id: "p2", platform: "reddit", handle: "u/photographyenthusiast", content: "[r/IndiaAI] Just tested 5 different AI photo editors — here's my honest review. Canva AI wins for simplicity, Lightroom AI for professionals. The free tier limitations are real though.", likes: "892", timestamp: "5h ago" },
    { id: "p3", platform: "telegram", handle: "@AIToolsHub", content: "🔥 AI Photo Editing Tools Mega-List 2026 — 30+ apps reviewed, Indian pricing included. Pinned for the community. Results vary, but these are genuinely impressive for everyday use.", likes: "3.1K", timestamp: "1d ago" },
    { id: "p4", platform: "x", handle: "@PixelMagicIN", content: "The democratization of professional photography is happening right now. My grandmother can now edit her saree photos on WhatsApp using AI. Wild times. #AIPhotoEditing #India", likes: "2.7K", reposts: "962", timestamp: "3h ago" },
  ],
};

// ─── TREND 2: Generative AI ───────────────────────────────────────────────────

const generativeAI: TrendAnalytics = {
  id: "generative-ai",
  name: "Generative AI",
  description:
    "Generative AI — covering large language models, image generators, and code assistants — is the defining tech narrative across India's urban tech community. Discussion spans practical applications in software development and content creation to policy debates, UPSC coaching assistants, and regional language model initiatives. X and Reddit drive the conversation, with strong engagement in Bengaluru, Hyderabad, and Delhi's tech clusters.",
  category: "Technology / AI/ML",
  trendScore: 88,
  platformActivity: { x: 91, reddit: 86, telegram: 74 },
  totalMentions: "5.1M",
  approximateReach: "38.7M",
  growthPercent: "+94%",
  peakGrowth: "+148%",
  peakDate: "Aug 14",
  fastestPlatform: "x",

  lifecycle: buildLifecycle("sustained_high", { x: 91, reddit: 86, telegram: 74 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 11, female: 7.5, other: 1 },
      { ageRange: "25–34", male: 13.5, female: 9, other: 1 },
      { ageRange: "35–44", male: 7.5, female: 4.5, other: 0.5 },
      { ageRange: "45–54", male: 3.8, female: 2, other: 0.4 },
      { ageRange: "55+", male: 2, female: 1, other: 0.2 },
    ],
    languages: [
      { language: "English", share: 52 },
      { language: "Hindi", share: 22 },
      { language: "Kannada", share: 9 },
      { language: "Telugu", share: 8 },
      { language: "Bengali", share: 5 },
      { language: "Other", share: 4 },
    ],
    regions: [
      { state: "Karnataka", share: 88, mentions: "891K" },
      { state: "Telangana", share: 81, mentions: "718K" },
      { state: "Delhi", share: 77, mentions: "634K" },
      { state: "Maharashtra", share: 74, mentions: "582K" },
      { state: "Tamil Nadu", share: 68, mentions: "497K" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 1", positive: 61, neutral: 30, negative: 9 },
      { date: "Aug 8", positive: 64, neutral: 27, negative: 9 },
      { date: "Aug 14", positive: 68, neutral: 22, negative: 10 },
      { date: "Aug 22", positive: 65, neutral: 24, negative: 11 },
      { date: "Aug 28", positive: 63, neutral: 25, negative: 12 },
      { date: "Sep 1", positive: 61, neutral: 27, negative: 12 },
      { date: "Sep 5", positive: 60, neutral: 28, negative: 12 },
    ],
    breakdown: { positive: 63, neutral: 26, negative: 11 },
    themes: {
      positive: ["Productivity", "Innovation", "Job opportunities", "Education access"],
      negative: ["Job displacement fears", "Misinformation", "Copyright issues"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "@AIResearcherIN", platform: "x", community: "AI Researchers", influence: 94, type: "account" },
      { id: "n2", label: "@TechPolicyIN", platform: "x", community: "Policy", influence: 82, type: "account" },
      { id: "n3", label: "r/artificialintelligence", platform: "reddit", community: "AI Researchers", influence: 89, type: "community" },
      { id: "n4", label: "@BengaluruAI", platform: "telegram", community: "Tech Hubs", influence: 76, type: "account" },
      { id: "n5", label: "@StartupIndia_", platform: "x", community: "Startups", influence: 72, type: "account" },
      { id: "n6", label: "r/india", platform: "reddit", community: "General", influence: 68, type: "community" },
      { id: "n7", label: "@OpenSourceHero", platform: "x", community: "AI Researchers", influence: 65, type: "account" },
      { id: "n8", label: "@HydTechCircle", platform: "telegram", community: "Tech Hubs", influence: 61, type: "account" },
      { id: "n9", label: "@PolicyDebates", platform: "x", community: "Policy", influence: 58, type: "account" },
      { id: "n10", label: "r/learnprogramming", platform: "reddit", community: "Developers", influence: 54, type: "community" },
      { id: "n11", label: "@DevCommunityIN", platform: "x", community: "Developers", influence: 62, type: "account" },
      { id: "n12", label: "@MoEFAI", platform: "x", community: "Policy", influence: 49, type: "account" },
      { id: "n13", label: "@IndianAIStartup", platform: "telegram", community: "Startups", influence: 45, type: "account" },
    ],
    edges: [
      { source: "n1", target: "n3", strength: 0.9 },
      { source: "n1", target: "n7", strength: 0.8 },
      { source: "n1", target: "n2", strength: 0.7 },
      { source: "n2", target: "n9", strength: 0.8 },
      { source: "n2", target: "n12", strength: 0.7 },
      { source: "n3", target: "n6", strength: 0.5 },
      { source: "n3", target: "n10", strength: 0.6 },
      { source: "n4", target: "n8", strength: 0.7 },
      { source: "n4", target: "n13", strength: 0.6 },
      { source: "n5", target: "n13", strength: 0.5 },
      { source: "n7", target: "n11", strength: 0.6 },
      { source: "n11", target: "n10", strength: 0.5 },
    ],
    topInfluencers: [
      { id: "n1", label: "@AIResearcherIN", platform: "x", influence: 94, tier: "high" },
      { id: "n3", label: "r/artificialintelligence", platform: "reddit", influence: 89, tier: "high" },
      { id: "n2", label: "@TechPolicyIN", platform: "x", influence: 82, tier: "high" },
      { id: "n4", label: "@BengaluruAI", platform: "telegram", influence: 76, tier: "medium" },
      { id: "n5", label: "@StartupIndia_", platform: "x", influence: 72, tier: "medium" },
    ],
  },

  regional: {
    "Karnataka": { score: 88, mentions: "891K", growth: "+41%", sentiment: "positive" },
    "Telangana": { score: 81, mentions: "718K", growth: "+37%", sentiment: "positive" },
    "Delhi": { score: 77, mentions: "634K", growth: "+34%", sentiment: "positive" },
    "Maharashtra": { score: 74, mentions: "582K", growth: "+31%", sentiment: "positive" },
    "Tamil Nadu": { score: 68, mentions: "497K", growth: "+28%", sentiment: "positive" },
    "West Bengal": { score: 58, mentions: "392K", growth: "+22%", sentiment: "positive" },
    "Gujarat": { score: 52, mentions: "347K", growth: "+19%", sentiment: "positive" },
    "Kerala": { score: 61, mentions: "418K", growth: "+25%", sentiment: "positive" },
    "Andhra Pradesh": { score: 49, mentions: "312K", growth: "+17%", sentiment: "positive" },
    "Uttar Pradesh": { score: 34, mentions: "214K", growth: "+12%", sentiment: "neutral" },
    "Rajasthan": { score: 28, mentions: "178K", growth: "+9%", sentiment: "neutral" },
    "Punjab": { score: 36, mentions: "228K", growth: "+13%", sentiment: "positive" },
    "Haryana": { score: 41, mentions: "258K", growth: "+15%", sentiment: "positive" },
    "Madhya Pradesh": { score: 22, mentions: "139K", growth: "+7%", sentiment: "neutral" },
    "Bihar": { score: 17, mentions: "107K", growth: "+5%", sentiment: "neutral" },
    "Odisha": { score: 24, mentions: "152K", growth: "+8%", sentiment: "neutral" },
    "Jharkhand": { score: 15, mentions: "95K", growth: "+5%", sentiment: "neutral" },
    "Assam": { score: 21, mentions: "132K", growth: "+7%", sentiment: "neutral" },
    "Himachal Pradesh": { score: 18, mentions: "114K", growth: "+6%", sentiment: "neutral" },
    "Uttarakhand": { score: 23, mentions: "145K", growth: "+7%", sentiment: "neutral" },
    "Goa": { score: 38, mentions: "240K", growth: "+14%", sentiment: "positive" },
    "Chhattisgarh": { score: 12, mentions: "76K", growth: "+4%", sentiment: "neutral" },
    "Jammu and Kashmir": { score: 19, mentions: "120K", growth: "+6%", sentiment: "neutral" },
    "Tripura": { score: 9, mentions: "57K", growth: "+3%", sentiment: "neutral" },
    "Meghalaya": { score: 11, mentions: "69K", growth: "+4%", sentiment: "neutral" },
    "Manipur": { score: 8, mentions: "50K", growth: "+3%", sentiment: "neutral" },
    "Nagaland": { score: 7, mentions: "44K", growth: "+2%", sentiment: "neutral" },
    "Arunachal Pradesh": { score: 6, mentions: "38K", growth: "+2%", sentiment: "neutral" },
    "Mizoram": { score: 6, mentions: "38K", growth: "+2%", sentiment: "neutral" },
    "Sikkim": { score: 5, mentions: "32K", growth: "+2%", sentiment: "neutral" },
  },

  posts: [
    { id: "p1", platform: "x", handle: "@AIResearcherIN", content: "India's moment in AI is NOW. We have the talent, the data diversity, and the urgency. What we need is coordinated policy that enables rather than restricts. Thread on what that looks like 🧵 #GenerativeAI #India", likes: "8.4K", reposts: "3.2K", timestamp: "4h ago" },
    { id: "p2", platform: "reddit", handle: "u/devops_bangalore", content: "[r/artificialintelligence] 6 months of using LLMs for actual software work — my honest productivity report. TL;DR: it's transformative for boilerplate, dangerous if you stop reading the output. Sharing my prompts.", likes: "2.1K", timestamp: "8h ago" },
    { id: "p3", platform: "telegram", handle: "@BengaluruAI", content: "📢 Reminder: AI India Summit tickets close tonight. Over 40 Indian AI startups presenting. This is the best domestic event on the calendar this year. Not an ad.", likes: "1.8K", timestamp: "2h ago" },
    { id: "p4", platform: "x", handle: "@TechPolicyIN", content: "The draft AI governance framework is thoughtful but has a gap: no mention of regional language model obligations. 22 scheduled languages need explicit inclusion. Writing to the ministry. #GenerativeAI #AIPolicy", likes: "5.6K", reposts: "2.1K", timestamp: "6h ago" },
  ],
};

// ─── TREND 3: UPI ────────────────────────────────────────────────────────────

const upi: TrendAnalytics = {
  id: "upi",
  name: "UPI",
  description:
    "India's Unified Payments Interface continues to be a reference point in policy, fintech, and everyday usage conversations. Current discourse spans merchant acceptance issues, UPI Lite for rural adoption, international expansion (Singapore, UAE, France), and UPI credit-line features. Telegram is the strongest channel due to banking advisory groups and government update channels.",
  category: "Finance / Policy",
  trendScore: 76,
  platformActivity: { x: 72, reddit: 68, telegram: 84 },
  totalMentions: "3.8M",
  approximateReach: "29.4M",
  growthPercent: "+54%",
  peakGrowth: "+88%",
  peakDate: "Aug 19",
  fastestPlatform: "telegram",

  lifecycle: buildLifecycle("gradual", { x: 72, reddit: 68, telegram: 84 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 12, female: 9, other: 1 },
      { ageRange: "25–34", male: 21, female: 15, other: 1 },
      { ageRange: "35–44", male: 16, female: 11, other: 1 },
      { ageRange: "45–54", male: 7, female: 4, other: 0 },
      { ageRange: "55+", male: 2, female: 0, other: 0 },
    ],
    languages: [
      { language: "Hindi", share: 36 },
      { language: "English", share: 28 },
      { language: "Telugu", share: 10 },
      { language: "Marathi", share: 9 },
      { language: "Bengali", share: 9 },
      { language: "Other", share: 8 },
    ],
    regions: [
      { state: "Delhi", share: 79, mentions: "512K" },
      { state: "Maharashtra", share: 76, mentions: "489K" },
      { state: "Uttar Pradesh", share: 71, mentions: "428K" },
      { state: "Gujarat", share: 68, mentions: "392K" },
      { state: "Telangana", share: 64, mentions: "348K" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 1", positive: 48, neutral: 42, negative: 10 },
      { date: "Aug 8", positive: 50, neutral: 40, negative: 10 },
      { date: "Aug 15", positive: 52, neutral: 39, negative: 9 },
      { date: "Aug 19", positive: 54, neutral: 38, negative: 8 },
      { date: "Aug 28", positive: 55, neutral: 37, negative: 8 },
      { date: "Sep 1", positive: 53, neutral: 38, negative: 9 },
      { date: "Sep 5", positive: 52, neutral: 39, negative: 9 },
    ],
    breakdown: { positive: 53, neutral: 38, negative: 9 },
    themes: {
      positive: ["Convenience", "Financial inclusion", "International expansion", "Speed"],
      negative: ["Fraud concerns", "Merchant downtime", "Rural connectivity"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "@FintechIndia_", platform: "x", community: "Fintech", influence: 88, type: "account" },
      { id: "n2", label: "@NPCI_BHIM", platform: "telegram", community: "Official", influence: 95, type: "account" },
      { id: "n3", label: "@RBIUpdates", platform: "telegram", community: "Official", influence: 91, type: "account" },
      { id: "n4", label: "r/IndiaFinance", platform: "reddit", community: "Fintech", influence: 72, type: "community" },
      { id: "n5", label: "@PolicyWatchIN", platform: "x", community: "Policy", influence: 67, type: "account" },
      { id: "n6", label: "@MerchantCircle", platform: "telegram", community: "Business", influence: 62, type: "account" },
      { id: "n7", label: "@PaytmAlerts", platform: "telegram", community: "Fintech", influence: 74, type: "account" },
      { id: "n8", label: "r/personalfinanceindia", platform: "reddit", community: "Fintech", influence: 66, type: "community" },
      { id: "n9", label: "@GovtSchemes", platform: "telegram", community: "Official", influence: 58, type: "account" },
      { id: "n10", label: "@SmallBizIN", platform: "x", community: "Business", influence: 52, type: "account" },
      { id: "n11", label: "@DigitalIN", platform: "x", community: "Policy", influence: 48, type: "account" },
    ],
    edges: [
      { source: "n2", target: "n3", strength: 0.9 },
      { source: "n2", target: "n7", strength: 0.7 },
      { source: "n3", target: "n9", strength: 0.8 },
      { source: "n1", target: "n4", strength: 0.7 },
      { source: "n1", target: "n5", strength: 0.6 },
      { source: "n4", target: "n8", strength: 0.6 },
      { source: "n5", target: "n11", strength: 0.5 },
      { source: "n6", target: "n10", strength: 0.6 },
      { source: "n7", target: "n6", strength: 0.7 },
    ],
    topInfluencers: [
      { id: "n2", label: "@NPCI_BHIM", platform: "telegram", influence: 95, tier: "high" },
      { id: "n3", label: "@RBIUpdates", platform: "telegram", influence: 91, tier: "high" },
      { id: "n1", label: "@FintechIndia_", platform: "x", influence: 88, tier: "high" },
      { id: "n7", label: "@PaytmAlerts", platform: "telegram", influence: 74, tier: "medium" },
      { id: "n4", label: "r/IndiaFinance", platform: "reddit", influence: 72, tier: "medium" },
    ],
  },

  regional: {
    "Delhi": { score: 79, mentions: "512K", growth: "+22%", sentiment: "positive" },
    "Maharashtra": { score: 76, mentions: "489K", growth: "+21%", sentiment: "positive" },
    "Uttar Pradesh": { score: 71, mentions: "428K", growth: "+19%", sentiment: "neutral" },
    "Gujarat": { score: 68, mentions: "392K", growth: "+18%", sentiment: "positive" },
    "Telangana": { score: 64, mentions: "348K", growth: "+16%", sentiment: "positive" },
    "Karnataka": { score: 61, mentions: "322K", growth: "+15%", sentiment: "positive" },
    "Tamil Nadu": { score: 58, mentions: "296K", growth: "+14%", sentiment: "positive" },
    "Rajasthan": { score: 54, mentions: "262K", growth: "+13%", sentiment: "neutral" },
    "West Bengal": { score: 57, mentions: "288K", growth: "+14%", sentiment: "positive" },
    "Bihar": { score: 48, mentions: "228K", growth: "+11%", sentiment: "neutral" },
    "Madhya Pradesh": { score: 44, mentions: "208K", growth: "+10%", sentiment: "neutral" },
    "Andhra Pradesh": { score: 52, mentions: "248K", growth: "+12%", sentiment: "positive" },
    "Punjab": { score: 51, mentions: "244K", growth: "+12%", sentiment: "neutral" },
    "Haryana": { score: 55, mentions: "264K", growth: "+13%", sentiment: "neutral" },
    "Jharkhand": { score: 38, mentions: "182K", growth: "+9%", sentiment: "neutral" },
    "Odisha": { score: 36, mentions: "172K", growth: "+8%", sentiment: "neutral" },
    "Kerala": { score: 59, mentions: "308K", growth: "+15%", sentiment: "positive" },
    "Assam": { score: 32, mentions: "152K", growth: "+7%", sentiment: "neutral" },
    "Chhattisgarh": { score: 30, mentions: "142K", growth: "+7%", sentiment: "neutral" },
    "Himachal Pradesh": { score: 28, mentions: "132K", growth: "+6%", sentiment: "neutral" },
    "Uttarakhand": { score: 33, mentions: "156K", growth: "+7%", sentiment: "neutral" },
    "Goa": { score: 46, mentions: "218K", growth: "+11%", sentiment: "positive" },
    "Jammu and Kashmir": { score: 26, mentions: "122K", growth: "+6%", sentiment: "neutral" },
    "Tripura": { score: 21, mentions: "98K", growth: "+5%", sentiment: "neutral" },
    "Meghalaya": { score: 19, mentions: "90K", growth: "+4%", sentiment: "neutral" },
    "Manipur": { score: 16, mentions: "76K", growth: "+4%", sentiment: "neutral" },
    "Nagaland": { score: 13, mentions: "62K", growth: "+3%", sentiment: "neutral" },
    "Arunachal Pradesh": { score: 11, mentions: "52K", growth: "+3%", sentiment: "neutral" },
    "Mizoram": { score: 10, mentions: "48K", growth: "+2%", sentiment: "neutral" },
    "Sikkim": { score: 8, mentions: "38K", growth: "+2%", sentiment: "neutral" },
  },

  posts: [
    { id: "p1", platform: "telegram", handle: "@NPCI_BHIM", content: "🇮🇳 UPI completes 10B+ transactions in August 2026. A new record. Thank you to every Indian who chose digital payments. The journey from demonetization to 10 billion monthly transactions is truly remarkable.", likes: "18.2K", timestamp: "1d ago" },
    { id: "p2", platform: "x", handle: "@FintechIndia_", content: "UPI credit on credit cards is a bigger deal than most people realize. It's essentially making credit accessible at a QR code. The implications for rural lending are enormous. Thread 🧵", likes: "6.1K", reposts: "2.4K", timestamp: "3h ago" },
    { id: "p3", platform: "reddit", handle: "u/bangalore_dev_guy", content: "[r/IndiaFinance] Merchant declined UPI three times today — keeps saying 'bank server busy'. Anyone else having this? PhonePe shows successful but merchant's Paytm POS says failed.", likes: "782", timestamp: "6h ago" },
    { id: "p4", platform: "telegram", handle: "@RBIUpdates", content: "RBI circular: New UPI transaction limits for credit-linked accounts effective October 1. Read the full circular for category-wise breakdown. Link in bio.", likes: "9.4K", timestamp: "12h ago" },
  ],
};

// ─── TREND 4: Cricket World Cup ───────────────────────────────────────────────

const cricketWorldCup: TrendAnalytics = {
  id: "cricket-world-cup",
  name: "Cricket World Cup",
  description:
    "ICC Cricket World Cup 2026 qualifiers and Super-8 rounds are dominating Indian social media with a volume that dwarfs every other trend. Telegram groups with hundreds of thousands of members live-update every ball. Sentiment is highly match-dependent — euphoric post-victories, sharp negative spikes after losses. Regional engagement is near-universal, with a pronounced spike in UP, Bihar, and MP during India vs Pakistan.",
  category: "Sports / Entertainment",
  trendScore: 95,
  platformActivity: { x: 89, reddit: 72, telegram: 98 },
  totalMentions: "18.4M",
  approximateReach: "94.2M",
  growthPercent: "+218%",
  peakGrowth: "+440%",
  peakDate: "Aug 17",
  fastestPlatform: "telegram",

  lifecycle: buildLifecycle("volatile", { x: 89, reddit: 72, telegram: 98 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 21, female: 8, other: 1 },
      { ageRange: "25–34", male: 22, female: 10, other: 1 },
      { ageRange: "35–44", male: 15, female: 7, other: 0 },
      { ageRange: "45–54", male: 9, female: 4, other: 0 },
      { ageRange: "55+", male: 2, female: 0, other: 0 },
    ],
    languages: [
      { language: "Hindi", share: 48 },
      { language: "English", share: 22 },
      { language: "Bengali", share: 10 },
      { language: "Marathi", share: 8 },
      { language: "Tamil", share: 7 },
      { language: "Other", share: 5 },
    ],
    regions: [
      { state: "Uttar Pradesh", share: 91, mentions: "2.8M" },
      { state: "Maharashtra", share: 87, mentions: "2.4M" },
      { state: "West Bengal", share: 85, mentions: "2.2M" },
      { state: "Bihar", share: 82, mentions: "2.0M" },
      { state: "Delhi", share: 80, mentions: "1.8M" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 10", positive: 71, neutral: 22, negative: 7 },
      { date: "Aug 14", positive: 78, neutral: 16, negative: 6 },
      { date: "Aug 17", positive: 88, neutral: 8, negative: 4 },
      { date: "Aug 20", positive: 42, neutral: 28, negative: 30 },
      { date: "Aug 24", positive: 69, neutral: 22, negative: 9 },
      { date: "Aug 28", positive: 74, neutral: 18, negative: 8 },
      { date: "Sep 5", positive: 71, neutral: 20, negative: 9 },
    ],
    breakdown: { positive: 68, neutral: 21, negative: 11 },
    themes: {
      positive: ["Team India", "Boundaries & sixes", "Virat moments", "National pride"],
      negative: ["Dropped catches", "Poor umpiring calls", "Broadcaster issues"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "@CricketNextIN", platform: "x", community: "Sports Media", influence: 96, type: "account" },
      { id: "n2", label: "@BCCI", platform: "x", community: "Official", influence: 99, type: "account" },
      { id: "n3", label: "CricketLive India", platform: "telegram", community: "Fan Groups", influence: 97, type: "community" },
      { id: "n4", label: "@CricBuzz", platform: "x", community: "Sports Media", influence: 93, type: "account" },
      { id: "n5", label: "IndiaFanClub_TG", platform: "telegram", community: "Fan Groups", influence: 88, type: "community" },
      { id: "n6", label: "r/Cricket", platform: "reddit", community: "Global Fans", influence: 82, type: "community" },
      { id: "n7", label: "r/IndianCricket", platform: "reddit", community: "Fan Groups", influence: 79, type: "community" },
      { id: "n8", label: "@SportsTakIN", platform: "x", community: "Sports Media", influence: 76, type: "account" },
      { id: "n9", label: "@FantasyCricIN", platform: "telegram", community: "Fantasy", influence: 71, type: "account" },
      { id: "n10", label: "@StatsGuru", platform: "x", community: "Stats", influence: 65, type: "account" },
      { id: "n11", label: "Dream11 Channel", platform: "telegram", community: "Fantasy", influence: 68, type: "community" },
      { id: "n12", label: "@PitchReportIN", platform: "x", community: "Stats", influence: 58, type: "account" },
    ],
    edges: [
      { source: "n2", target: "n1", strength: 0.9 },
      { source: "n2", target: "n4", strength: 0.8 },
      { source: "n1", target: "n8", strength: 0.7 },
      { source: "n3", target: "n5", strength: 0.9 },
      { source: "n3", target: "n9", strength: 0.7 },
      { source: "n5", target: "n11", strength: 0.8 },
      { source: "n6", target: "n7", strength: 0.8 },
      { source: "n4", target: "n10", strength: 0.6 },
      { source: "n10", target: "n12", strength: 0.7 },
      { source: "n8", target: "n12", strength: 0.5 },
    ],
    topInfluencers: [
      { id: "n2", label: "@BCCI", platform: "x", influence: 99, tier: "high" },
      { id: "n3", label: "CricketLive India", platform: "telegram", influence: 97, tier: "high" },
      { id: "n1", label: "@CricketNextIN", platform: "x", influence: 96, tier: "high" },
      { id: "n4", label: "@CricBuzz", platform: "x", influence: 93, tier: "high" },
      { id: "n5", label: "IndiaFanClub_TG", platform: "telegram", influence: 88, tier: "high" },
    ],
  },

  regional: {
    "Uttar Pradesh": { score: 91, mentions: "2.8M", growth: "+218%", sentiment: "positive" },
    "Maharashtra": { score: 87, mentions: "2.4M", growth: "+198%", sentiment: "positive" },
    "West Bengal": { score: 85, mentions: "2.2M", growth: "+188%", sentiment: "positive" },
    "Bihar": { score: 82, mentions: "2.0M", growth: "+176%", sentiment: "positive" },
    "Delhi": { score: 80, mentions: "1.8M", growth: "+164%", sentiment: "positive" },
    "Madhya Pradesh": { score: 78, mentions: "1.7M", growth: "+158%", sentiment: "positive" },
    "Rajasthan": { score: 76, mentions: "1.6M", growth: "+148%", sentiment: "positive" },
    "Tamil Nadu": { score: 74, mentions: "1.5M", growth: "+138%", sentiment: "positive" },
    "Karnataka": { score: 72, mentions: "1.4M", growth: "+128%", sentiment: "positive" },
    "Gujarat": { score: 71, mentions: "1.4M", growth: "+124%", sentiment: "positive" },
    "Punjab": { score: 68, mentions: "1.3M", growth: "+116%", sentiment: "positive" },
    "Haryana": { score: 66, mentions: "1.2M", growth: "+112%", sentiment: "positive" },
    "Jharkhand": { score: 64, mentions: "1.1M", growth: "+108%", sentiment: "positive" },
    "Telangana": { score: 69, mentions: "1.3M", growth: "+120%", sentiment: "positive" },
    "Andhra Pradesh": { score: 62, mentions: "1.1M", growth: "+104%", sentiment: "positive" },
    "Kerala": { score: 60, mentions: "1.0M", growth: "+98%", sentiment: "positive" },
    "Odisha": { score: 58, mentions: "948K", growth: "+92%", sentiment: "positive" },
    "Assam": { score: 55, mentions: "892K", growth: "+86%", sentiment: "positive" },
    "Chhattisgarh": { score: 52, mentions: "842K", growth: "+82%", sentiment: "positive" },
    "Uttarakhand": { score: 54, mentions: "874K", growth: "+84%", sentiment: "positive" },
    "Himachal Pradesh": { score: 48, mentions: "778K", growth: "+74%", sentiment: "positive" },
    "Goa": { score: 56, mentions: "906K", growth: "+88%", sentiment: "positive" },
    "Jammu and Kashmir": { score: 46, mentions: "746K", growth: "+72%", sentiment: "positive" },
    "Tripura": { score: 38, mentions: "616K", growth: "+62%", sentiment: "positive" },
    "Meghalaya": { score: 35, mentions: "568K", growth: "+56%", sentiment: "positive" },
    "Manipur": { score: 32, mentions: "518K", growth: "+52%", sentiment: "positive" },
    "Nagaland": { score: 28, mentions: "454K", growth: "+46%", sentiment: "positive" },
    "Arunachal Pradesh": { score: 25, mentions: "406K", growth: "+42%", sentiment: "positive" },
    "Mizoram": { score: 24, mentions: "390K", growth: "+40%", sentiment: "positive" },
    "Sikkim": { score: 20, mentions: "324K", growth: "+34%", sentiment: "positive" },
  },

  posts: [
    { id: "p1", platform: "telegram", handle: "CricketLive India", content: "🏏 INDIA WIN!!! INDIA WIN!!! Rohit 94*(62) 🔥🔥🔥 Bumrah 4-18 💪 We are through to the Super 8!!! What an absolute unit of a performance!!! 🇮🇳🇮🇳🇮🇳", likes: "284K", timestamp: "1d ago" },
    { id: "p2", platform: "x", handle: "@CricBuzz", content: "BREAKING: India beat Australia by 7 wickets in the Super 8. Jasprit Bumrah takes 4 wickets in 4 overs conceding just 18 runs. This is vintage Bumrah. #CWC2026 #IndvsAus", likes: "142K", reposts: "62K", timestamp: "1d ago" },
    { id: "p3", platform: "reddit", handle: "u/cricket_analytics_nerd", content: "[r/Cricket] Bumrah's economy rate in ICC knockouts since 2019: 4.2. For context, the average fast bowler in similar conditions: 7.8. The stats are genuinely insane. Analysis in comments.", likes: "8.4K", timestamp: "2d ago" },
    { id: "p4", platform: "x", handle: "@SportsTakIN", content: "After tonight's win, India's NRR is now +1.48 — highest in the tournament. Shami's return has transformed this team's bowling completely. Semi-final confirmed. #TeamIndia #CWC2026", likes: "78K", reposts: "31K", timestamp: "22h ago" },
  ],
};

// ─── TREND 5: Short-form Video ────────────────────────────────────────────────

const shortFormVideo: TrendAnalytics = {
  id: "short-form-video",
  name: "Short-form Video",
  description:
    "The short-form video ecosystem — Reels, YouTube Shorts, and emerging formats — is reshaping how India consumes entertainment and information. Discussion focuses on creator monetization, algorithm changes, regional content explosion (Bhojpuri, Haryanvi, Tamil), brand deals, and the rising creator middle class. X carries commentary; Telegram carries creator tips and strategies.",
  category: "Entertainment / Creator Economy",
  trendScore: 79,
  platformActivity: { x: 81, reddit: 62, telegram: 78 },
  totalMentions: "4.2M",
  approximateReach: "31.8M",
  growthPercent: "+68%",
  peakGrowth: "+112%",
  peakDate: "Sep 2",
  fastestPlatform: "x",

  lifecycle: buildLifecycle("sustained_high", { x: 81, reddit: 62, telegram: 78 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 20, female: 22, other: 2 },
      { ageRange: "25–34", male: 16, female: 18, other: 1 },
      { ageRange: "35–44", male: 9, female: 8, other: 1 },
      { ageRange: "45–54", male: 2, female: 1, other: 0 },
      { ageRange: "55+", male: 0, female: 0, other: 0 },
    ],
    languages: [
      { language: "Hindi", share: 42 },
      { language: "English", share: 18 },
      { language: "Tamil", share: 12 },
      { language: "Telugu", share: 11 },
      { language: "Bengali", share: 9 },
      { language: "Other", share: 8 },
    ],
    regions: [
      { state: "Uttar Pradesh", share: 84, mentions: "712K" },
      { state: "Maharashtra", share: 80, mentions: "642K" },
      { state: "Bihar", share: 72, mentions: "548K" },
      { state: "Delhi", share: 76, mentions: "588K" },
      { state: "Tamil Nadu", share: 71, mentions: "524K" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 1", positive: 58, neutral: 32, negative: 10 },
      { date: "Aug 8", positive: 61, neutral: 30, negative: 9 },
      { date: "Aug 15", positive: 64, neutral: 28, negative: 8 },
      { date: "Aug 22", positive: 62, neutral: 29, negative: 9 },
      { date: "Sep 2", positive: 66, neutral: 26, negative: 8 },
      { date: "Sep 4", positive: 65, neutral: 27, negative: 8 },
      { date: "Sep 5", positive: 64, neutral: 28, negative: 8 },
    ],
    breakdown: { positive: 64, neutral: 28, negative: 8 },
    themes: {
      positive: ["Creator earnings", "Regional diversity", "Entertainment value", "Algorithm discovery"],
      negative: ["Mental health concerns", "Algorithm opacity", "Copyright strikes"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "@CarryMinati_", platform: "x", community: "Mega Creators", influence: 94, type: "account" },
      { id: "n2", label: "@CreatorEconIN", platform: "x", community: "Industry", influence: 82, type: "account" },
      { id: "n3", label: "Creator Tips TG", platform: "telegram", community: "Creator Tools", influence: 88, type: "community" },
      { id: "n4", label: "r/IndiaYoutube", platform: "reddit", community: "Creators", influence: 74, type: "community" },
      { id: "n5", label: "@ReelsTrendIN", platform: "x", community: "Trends", influence: 71, type: "account" },
      { id: "n6", label: "@BhojpuriViral", platform: "telegram", community: "Regional", influence: 79, type: "account" },
      { id: "n7", label: "@TamilContentHub", platform: "telegram", community: "Regional", influence: 76, type: "account" },
      { id: "n8", label: "r/IndianYouTubers", platform: "reddit", community: "Creators", influence: 65, type: "community" },
      { id: "n9", label: "@MonetizeMeIN", platform: "x", community: "Creator Tools", influence: 60, type: "account" },
      { id: "n10", label: "@HaryanviViral", platform: "telegram", community: "Regional", influence: 68, type: "account" },
      { id: "n11", label: "@ViralShorts_", platform: "x", community: "Trends", influence: 56, type: "account" },
    ],
    edges: [
      { source: "n1", target: "n2", strength: 0.7 },
      { source: "n1", target: "n5", strength: 0.8 },
      { source: "n2", target: "n9", strength: 0.6 },
      { source: "n3", target: "n6", strength: 0.7 },
      { source: "n3", target: "n7", strength: 0.7 },
      { source: "n3", target: "n10", strength: 0.6 },
      { source: "n4", target: "n8", strength: 0.7 },
      { source: "n5", target: "n11", strength: 0.6 },
      { source: "n6", target: "n10", strength: 0.5 },
    ],
    topInfluencers: [
      { id: "n1", label: "@CarryMinati_", platform: "x", influence: 94, tier: "high" },
      { id: "n3", label: "Creator Tips TG", platform: "telegram", influence: 88, tier: "high" },
      { id: "n2", label: "@CreatorEconIN", platform: "x", influence: 82, tier: "high" },
      { id: "n6", label: "@BhojpuriViral", platform: "telegram", influence: 79, tier: "medium" },
      { id: "n7", label: "@TamilContentHub", platform: "telegram", influence: 76, tier: "medium" },
    ],
  },

  regional: {
    "Uttar Pradesh": { score: 84, mentions: "712K", growth: "+68%", sentiment: "positive" },
    "Maharashtra": { score: 80, mentions: "642K", growth: "+62%", sentiment: "positive" },
    "Delhi": { score: 76, mentions: "588K", growth: "+58%", sentiment: "positive" },
    "Bihar": { score: 72, mentions: "548K", growth: "+54%", sentiment: "positive" },
    "Tamil Nadu": { score: 71, mentions: "524K", growth: "+52%", sentiment: "positive" },
    "West Bengal": { score: 68, mentions: "498K", growth: "+48%", sentiment: "positive" },
    "Karnataka": { score: 65, mentions: "472K", growth: "+46%", sentiment: "positive" },
    "Telangana": { score: 63, mentions: "448K", growth: "+44%", sentiment: "positive" },
    "Gujarat": { score: 61, mentions: "424K", growth: "+42%", sentiment: "positive" },
    "Rajasthan": { score: 58, mentions: "398K", growth: "+38%", sentiment: "positive" },
    "Madhya Pradesh": { score: 56, mentions: "378K", growth: "+36%", sentiment: "positive" },
    "Punjab": { score: 62, mentions: "438K", growth: "+44%", sentiment: "positive" },
    "Haryana": { score: 64, mentions: "458K", growth: "+46%", sentiment: "positive" },
    "Andhra Pradesh": { score: 59, mentions: "412K", growth: "+40%", sentiment: "positive" },
    "Jharkhand": { score: 48, mentions: "328K", growth: "+28%", sentiment: "neutral" },
    "Odisha": { score: 45, mentions: "308K", growth: "+26%", sentiment: "neutral" },
    "Kerala": { score: 60, mentions: "418K", growth: "+40%", sentiment: "positive" },
    "Assam": { score: 42, mentions: "288K", growth: "+24%", sentiment: "neutral" },
    "Chhattisgarh": { score: 38, mentions: "258K", growth: "+22%", sentiment: "neutral" },
    "Uttarakhand": { score: 44, mentions: "298K", growth: "+24%", sentiment: "neutral" },
    "Himachal Pradesh": { score: 36, mentions: "248K", growth: "+20%", sentiment: "neutral" },
    "Goa": { score: 52, mentions: "358K", growth: "+34%", sentiment: "positive" },
    "Jammu and Kashmir": { score: 33, mentions: "228K", growth: "+18%", sentiment: "neutral" },
    "Tripura": { score: 28, mentions: "192K", growth: "+14%", sentiment: "neutral" },
    "Meghalaya": { score: 26, mentions: "178K", growth: "+12%", sentiment: "neutral" },
    "Manipur": { score: 24, mentions: "164K", growth: "+12%", sentiment: "neutral" },
    "Nagaland": { score: 21, mentions: "144K", growth: "+10%", sentiment: "neutral" },
    "Arunachal Pradesh": { score: 18, mentions: "124K", growth: "+8%", sentiment: "neutral" },
    "Mizoram": { score: 17, mentions: "116K", growth: "+8%", sentiment: "neutral" },
    "Sikkim": { score: 14, mentions: "96K", growth: "+6%", sentiment: "neutral" },
  },

  posts: [
    { id: "p1", platform: "x", handle: "@CarryMinati_", content: "YouTube Shorts finally adding proper chapter support. This is the one thing Reels had over Shorts for storytelling. About time. The Indian creator ecosystem keeps growing regardless 🎬 #ShortFormVideo", likes: "92K", reposts: "24K", timestamp: "5h ago" },
    { id: "p2", platform: "telegram", handle: "Creator Tips TG", content: "📊 This week's Reels algorithm breakdown: Hook in first 1.2s > Captions ON > Audio trending within 72h > Post between 7-9pm IST. Save and apply. Your numbers will move. Tested by 180 creators in our network.", likes: "14.2K", timestamp: "1d ago" },
    { id: "p3", platform: "reddit", handle: "u/regional_content_watcher", content: "[r/IndiaYoutube] Bhojpuri Shorts are consistently getting 5M+ views. Haryanvi content the same. Tamil sketches dominating South recommendations. The regional content wave is real and no one in the English media is covering it properly.", likes: "3.2K", timestamp: "2d ago" },
    { id: "p4", platform: "x", handle: "@CreatorEconIN", content: "Indian creator economy crossed ₹24,000 crore in 2026. Mid-tier creators (100K–2M followers) now earn more per follower than mega creators. The distribution is finally flattening. Report link in bio.", likes: "8.8K", reposts: "3.4K", timestamp: "3h ago" },
  ],
};

// ─── TREND 6: EV Adoption ─────────────────────────────────────────────────────

const evAdoption: TrendAnalytics = {
  id: "ev-adoption",
  name: "EV Adoption",
  description:
    "India's electric vehicle conversation spans policy incentives (FAME III), real-world range anxiety on highways, charging infrastructure gaps, and new launches from Tata, Ola Electric, and BYD. Reddit carries detailed community reviews; X debates policy; Telegram serves as the primary channel for EV owner communities sharing real-world data. Mixed sentiment reflects genuine excitement tempered by infrastructure reality.",
  category: "Automotive / Policy",
  trendScore: 71,
  platformActivity: { x: 74, reddit: 79, telegram: 68 },
  totalMentions: "1.9M",
  approximateReach: "14.6M",
  growthPercent: "+47%",
  peakGrowth: "+79%",
  peakDate: "Aug 22",
  fastestPlatform: "reddit",

  lifecycle: buildLifecycle("gradual", { x: 74, reddit: 79, telegram: 68 }),

  demographics: {
    ageGender: [
      { ageRange: "18–24", male: 11, female: 4, other: 1 },
      { ageRange: "25–34", male: 22, female: 10, other: 1 },
      { ageRange: "35–44", male: 21, female: 12, other: 1 },
      { ageRange: "45–54", male: 12, female: 4, other: 0 },
      { ageRange: "55+", male: 1, female: 0, other: 0 },
    ],
    languages: [
      { language: "English", share: 44 },
      { language: "Hindi", share: 31 },
      { language: "Marathi", share: 8 },
      { language: "Kannada", share: 7 },
      { language: "Telugu", share: 6 },
      { language: "Other", share: 4 },
    ],
    regions: [
      { state: "Maharashtra", share: 78, mentions: "298K" },
      { state: "Delhi", share: 74, mentions: "276K" },
      { state: "Karnataka", share: 71, mentions: "258K" },
      { state: "Gujarat", share: 68, mentions: "238K" },
      { state: "Tamil Nadu", share: 62, mentions: "212K" },
    ],
  },

  sentiment: {
    timeline: [
      { date: "Aug 1", positive: 44, neutral: 38, negative: 18 },
      { date: "Aug 8", positive: 46, neutral: 37, negative: 17 },
      { date: "Aug 15", positive: 48, neutral: 36, negative: 16 },
      { date: "Aug 22", positive: 51, neutral: 33, negative: 16 },
      { date: "Aug 28", positive: 49, neutral: 34, negative: 17 },
      { date: "Sep 1", positive: 47, neutral: 36, negative: 17 },
      { date: "Sep 5", positive: 46, neutral: 36, negative: 18 },
    ],
    breakdown: { positive: 47, neutral: 36, negative: 17 },
    themes: {
      positive: ["Cost savings", "Environment", "Smooth drive", "Government incentives"],
      negative: ["Charging infrastructure", "Range anxiety", "High upfront cost", "Service issues"],
    },
  },

  influence: {
    nodes: [
      { id: "n1", label: "r/electricvehicles_india", platform: "reddit", community: "EV Community", influence: 91, type: "community" },
      { id: "n2", label: "@EVIndia_", platform: "x", community: "Industry", influence: 84, type: "account" },
      { id: "n3", label: "Tata Nexon EV Owners", platform: "telegram", community: "EV Community", influence: 88, type: "community" },
      { id: "n4", label: "@OlaElectricOf", platform: "x", community: "Brands", influence: 79, type: "account" },
      { id: "n5", label: "r/india", platform: "reddit", community: "General", influence: 65, type: "community" },
      { id: "n6", label: "@GreenMobility_", platform: "x", community: "Industry", influence: 72, type: "account" },
      { id: "n7", label: "Ola S1 Community", platform: "telegram", community: "EV Community", influence: 82, type: "community" },
      { id: "n8", label: "@ChargePointIN", platform: "telegram", community: "Infrastructure", influence: 68, type: "account" },
      { id: "n9", label: "r/personalfinanceindia", platform: "reddit", community: "Finance", influence: 58, type: "community" },
      { id: "n10", label: "@FAMEScheme", platform: "x", community: "Policy", influence: 61, type: "account" },
      { id: "n11", label: "@AutoJournalistIN", platform: "x", community: "Media", influence: 55, type: "account" },
    ],
    edges: [
      { source: "n1", target: "n3", strength: 0.7 },
      { source: "n1", target: "n5", strength: 0.5 },
      { source: "n1", target: "n9", strength: 0.5 },
      { source: "n2", target: "n6", strength: 0.7 },
      { source: "n2", target: "n10", strength: 0.6 },
      { source: "n3", target: "n7", strength: 0.8 },
      { source: "n4", target: "n7", strength: 0.7 },
      { source: "n4", target: "n11", strength: 0.5 },
      { source: "n6", target: "n11", strength: 0.6 },
      { source: "n8", target: "n3", strength: 0.6 },
      { source: "n8", target: "n7", strength: 0.6 },
    ],
    topInfluencers: [
      { id: "n1", label: "r/electricvehicles_india", platform: "reddit", influence: 91, tier: "high" },
      { id: "n3", label: "Tata Nexon EV Owners", platform: "telegram", influence: 88, tier: "high" },
      { id: "n2", label: "@EVIndia_", platform: "x", influence: 84, tier: "high" },
      { id: "n7", label: "Ola S1 Community", platform: "telegram", influence: 82, tier: "high" },
      { id: "n4", label: "@OlaElectricOf", platform: "x", influence: 79, tier: "medium" },
    ],
  },

  regional: {
    "Maharashtra": { score: 78, mentions: "298K", growth: "+47%", sentiment: "positive" },
    "Delhi": { score: 74, mentions: "276K", growth: "+43%", sentiment: "positive" },
    "Karnataka": { score: 71, mentions: "258K", growth: "+41%", sentiment: "positive" },
    "Gujarat": { score: 68, mentions: "238K", growth: "+38%", sentiment: "positive" },
    "Tamil Nadu": { score: 62, mentions: "212K", growth: "+34%", sentiment: "positive" },
    "Telangana": { score: 58, mentions: "196K", growth: "+31%", sentiment: "positive" },
    "Kerala": { score: 54, mentions: "178K", growth: "+28%", sentiment: "positive" },
    "West Bengal": { score: 46, mentions: "152K", growth: "+22%", sentiment: "neutral" },
    "Andhra Pradesh": { score: 44, mentions: "144K", growth: "+21%", sentiment: "neutral" },
    "Uttar Pradesh": { score: 38, mentions: "124K", growth: "+17%", sentiment: "neutral" },
    "Haryana": { score: 49, mentions: "162K", growth: "+24%", sentiment: "positive" },
    "Punjab": { score: 42, mentions: "138K", growth: "+20%", sentiment: "neutral" },
    "Rajasthan": { score: 34, mentions: "112K", growth: "+15%", sentiment: "neutral" },
    "Madhya Pradesh": { score: 28, mentions: "92K", growth: "+12%", sentiment: "neutral" },
    "Goa": { score: 52, mentions: "172K", growth: "+28%", sentiment: "positive" },
    "Bihar": { score: 18, mentions: "59K", growth: "+7%", sentiment: "negative" },
    "Jharkhand": { score: 16, mentions: "52K", growth: "+6%", sentiment: "negative" },
    "Odisha": { score: 22, mentions: "72K", growth: "+9%", sentiment: "neutral" },
    "Uttarakhand": { score: 31, mentions: "102K", growth: "+14%", sentiment: "neutral" },
    "Himachal Pradesh": { score: 26, mentions: "86K", growth: "+11%", sentiment: "neutral" },
    "Chhattisgarh": { score: 14, mentions: "46K", growth: "+6%", sentiment: "negative" },
    "Assam": { score: 19, mentions: "62K", growth: "+8%", sentiment: "neutral" },
    "Jammu and Kashmir": { score: 21, mentions: "69K", growth: "+8%", sentiment: "neutral" },
    "Tripura": { score: 10, mentions: "33K", growth: "+4%", sentiment: "neutral" },
    "Meghalaya": { score: 11, mentions: "36K", growth: "+4%", sentiment: "neutral" },
    "Manipur": { score: 9, mentions: "30K", growth: "+3%", sentiment: "neutral" },
    "Nagaland": { score: 8, mentions: "26K", growth: "+3%", sentiment: "neutral" },
    "Arunachal Pradesh": { score: 7, mentions: "23K", growth: "+3%", sentiment: "neutral" },
    "Mizoram": { score: 6, mentions: "20K", growth: "+2%", sentiment: "neutral" },
    "Sikkim": { score: 5, mentions: "16K", growth: "+2%", sentiment: "neutral" },
  },

  posts: [
    { id: "p1", platform: "reddit", handle: "u/tata_nexon_owner_mumbai", content: "[r/electricvehicles_india] 1 year, 28,000 km Nexon EV Max review — honest take. AC range, highway performance, charging anxiety, service experience. Long post but worth it if you're considering. TL;DR: worth it for city, highway needs planning.", likes: "4.8K", timestamp: "2d ago" },
    { id: "p2", platform: "telegram", handle: "Tata Nexon EV Owners", content: "⚡ Community poll results: 72% of members say range anxiety has DECREASED after 6 months of ownership. Learning your car's actual range vs manufacturer claim is key. Share your real-world numbers 👇", likes: "6.2K", timestamp: "1d ago" },
    { id: "p3", platform: "x", handle: "@EVIndia_", content: "FAME III subsidy structure is genuinely better than FAME II. ₹10,000/kWh for 2Ws, ₹20,000/kWh for 3Ws, demand-based for 4Ws. The EV tipping point for India is 2027-28 if charging infra keeps pace. #EVIndia", likes: "3.4K", reposts: "1.2K", timestamp: "4h ago" },
    { id: "p4", platform: "x", handle: "@OlaElectricOf", content: "Ola Gen 3: 160km certified range. Hyper Mode. Fast charge 20-80% in 22 minutes. Pre-orders open midnight tonight. India is building world-class EVs at India prices. 🔋⚡", likes: "28K", reposts: "8.4K", timestamp: "6h ago" },
  ],
};

// ─── All Trends Registry ──────────────────────────────────────────────────────

export const ALL_TRENDS: TrendAnalytics[] = [
  aiPhotoEditing,
  generativeAI,
  upi,
  cricketWorldCup,
  shortFormVideo,
  evAdoption,
];

export const HOT_TRENDS: HotTrendSummary[] = [
  { id: "cricket-world-cup", rank: 1, name: "Cricket World Cup", category: "Sports / Entertainment", growth: "+218%", mentions: "18.4M", trendScore: 95 },
  { id: "generative-ai", rank: 2, name: "Generative AI", category: "Technology / AI/ML", growth: "+94%", mentions: "5.1M", trendScore: 88 },
  { id: "ai-photo-editing", rank: 3, name: "AI Photo Editing", category: "Technology / Creator Economy", growth: "+82%", mentions: "2.4M", trendScore: 82 },
  { id: "short-form-video", rank: 4, name: "Short-form Video", category: "Entertainment / Creator Economy", growth: "+68%", mentions: "4.2M", trendScore: 79 },
  { id: "upi", rank: 5, name: "UPI", category: "Finance / Policy", growth: "+54%", mentions: "3.8M", trendScore: 76 },
  { id: "ev-adoption", rank: 6, name: "EV Adoption", category: "Automotive / Policy", growth: "+47%", mentions: "1.9M", trendScore: 71 },
];

export function getTrendById(id: string): TrendAnalytics | undefined {
  return ALL_TRENDS.find((t) => t.id === id);
}

export const TRENDING_RIBBON_ITEMS = [
  "🔥 AI PHOTO EDITING",
  "⚡ CRICKET WORLD CUP",
  "🤖 GENERATIVE AI",
  "💳 UPI",
  "🎬 SHORT-FORM VIDEO",
  "🚗 EV ADOPTION",
  "🏏 TEAM INDIA",
  "🇮🇳 DIGITAL INDIA",
  "🔥 AI PHOTO EDITING",
  "⚡ CRICKET WORLD CUP",
  "🤖 GENERATIVE AI",
  "💳 UPI",
  "🎬 SHORT-FORM VIDEO",
  "🚗 EV ADOPTION",
];
