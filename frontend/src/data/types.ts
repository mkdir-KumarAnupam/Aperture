// ─────────────────────────────────────────────────────────────────────────────
// SIH Trend Intelligence — Centralized Type Definitions
// Prototype · Simulated analytics · Not live data
// ─────────────────────────────────────────────────────────────────────────────

export type Platform = "x" | "reddit" | "telegram";
export type SentimentLabel = "positive" | "neutral" | "negative";

// ── Platform activity (normalized 0–100 scores) ──────────────────────────────
export interface PlatformActivity {
  x: number;         // normalized 0–100
  reddit: number;    // normalized 0–100
  telegram: number;  // normalized 0–100
}

// ── Lifecycle / Momentum chart ────────────────────────────────────────────────
export interface LifecycleDataPoint {
  date: string;      // "MMM D" e.g. "Aug 1"
  x: number;
  reddit: number;
  telegram: number;
  combined: number;
}

export type Timeframe = "7D" | "30D" | "90D" | "1Y";
export type GlobalTimeframe = "6H" | "1D" | "7D" | "30D";

// ── Demographics ──────────────────────────────────────────────────────────────
export interface AgeGenderBucket {
  ageRange: string;  // e.g. "18–24"
  male: number;      // percentage share
  female: number;
  other: number;
}

export interface LanguageShare {
  language: string;
  share: number;     // must sum to 100 across all entries
}

export interface RegionShare {
  state: string;
  share: number;     // relative score 0–100
  mentions: string;  // human-readable e.g. "482K"
}

export interface Demographics {
  ageGender: AgeGenderBucket[];
  languages: LanguageShare[];
  regions: RegionShare[];
}

// ── Sentiment ─────────────────────────────────────────────────────────────────
export interface SentimentDataPoint {
  date: string;
  positive: number;  // % of posts
  neutral: number;
  negative: number;
}

export interface SentimentBreakdown {
  positive: number;  // overall %, must sum to 100
  neutral: number;
  negative: number;
}

export interface SentimentThemes {
  positive: string[];
  negative: string[];
}

export interface Sentiment {
  timeline: SentimentDataPoint[];
  breakdown: SentimentBreakdown;
  themes: SentimentThemes;
}

// ── Influence Network ─────────────────────────────────────────────────────────
export interface InfluenceNode {
  id: string;
  label: string;       // @handle or community name
  platform: Platform;
  community: string;   // color group
  influence: number;   // 0–100 (controls node size)
  type: "account" | "community";
}

export interface InfluenceEdge {
  source: string;      // node id
  target: string;      // node id
  strength: number;    // 0–1
}

export interface Influence {
  nodes: InfluenceNode[];
  edges: InfluenceEdge[];
  topInfluencers: {
    id: string;
    label: string;
    platform: Platform;
    influence: number;
    tier: "high" | "medium" | "low";
  }[];
}

// ── Regional (India state-level) ──────────────────────────────────────────────
export interface StateData {
  score: number;       // 0–100 trend relevance
  mentions: string;    // human-readable
  growth: string;      // e.g. "+34%"
  sentiment: SentimentLabel;
}

export type RegionalData = Record<string, StateData>;

// ── Post / Quote Slideshow ────────────────────────────────────────────────────
export interface SimulatedPost {
  id: string;
  platform: Platform;
  handle: string;
  content: string;
  likes: string;
  reposts?: string;
  timestamp: string;
}

// ── Hot Trend Card ────────────────────────────────────────────────────────────
export interface HotTrendSummary {
  id: string;
  rank: number;
  name: string;
  category: string;
  growth: string;     // e.g. "+126%"
  mentions: string;   // e.g. "2.4M"
  trendScore: number;
}

// ── Main analytics object ─────────────────────────────────────────────────────
export interface TrendAnalytics {
  id: string;
  name: string;
  description: string;
  category: string;
  trendScore: number;           // 0–100 overall normalized score
  platformActivity: PlatformActivity;
  totalMentions: string;        // human-readable
  approximateReach: string;     // human-readable
  growthPercent: string;        // e.g. "+82%"
  peakGrowth: string;           // e.g. "+126%"
  peakDate: string;             // e.g. "Aug 28"
  fastestPlatform: Platform;

  lifecycle: Record<Timeframe, LifecycleDataPoint[]>;
  demographics: Demographics;
  sentiment: Sentiment;
  influence: Influence;
  regional: RegionalData;
  posts: SimulatedPost[];
}
