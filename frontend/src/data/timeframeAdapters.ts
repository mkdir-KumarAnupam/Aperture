// ─────────────────────────────────────────────────────────────────────────────
// SIH Trend Intelligence — Timeframe Data Adapters
// Dynamically adjusts analytics across 6H, 1D, 7D, and 30D global windows.
// ─────────────────────────────────────────────────────────────────────────────

import { GlobalTimeframe, RegionalData, TrendAnalytics } from "./types";

export interface TimeframeOverviewData {
  totalMentions: string;
  approximateReach: string;
  growthPercent: string;
  mentionsChange: string;
  reachChange: string;
  periodLabel: string;
  timeframeLabel: string;
}

export interface TimeframeSentimentData {
  timeline: {
    date: string;
    positive: number;
    neutral: number;
    negative: number;
  }[];
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  polarityScore: string;
}

/**
 * Parses numeric strings such as "2.4M", "850K", "+82%", "482K".
 */
export function parseNumberWithSuffix(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/[+,]/g, "").trim().toUpperCase();
  if (clean.endsWith("M")) {
    return parseFloat(clean.slice(0, -1)) * 1_000_000;
  }
  if (clean.endsWith("K")) {
    return parseFloat(clean.slice(0, -1)) * 1_000;
  }
  if (clean.endsWith("%")) {
    return parseFloat(clean.slice(0, -1));
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formats raw numbers back to compact human-readable representations ("1.4M", "82K", etc.)
 */
export function formatNumberWithSuffix(num: number): string {
  if (num >= 1_000_000) {
    const val = num / 1_000_000;
    return `${val.toFixed(1)}M`;
  }
  if (num >= 1_000) {
    const val = num / 1_000;
    return val < 10 ? `${val.toFixed(1)}K` : `${Math.round(val)}K`;
  }
  return `${Math.round(num)}`;
}

/**
 * Computes timeframe-scaled headline metrics for the Trend Overview card.
 */
export function getTimeframeOverview(
  trend: TrendAnalytics,
  timeframe: GlobalTimeframe
): TimeframeOverviewData {
  const baseMentions = parseNumberWithSuffix(trend.totalMentions);
  const baseReach = parseNumberWithSuffix(trend.approximateReach);
  const baseGrowth = parseNumberWithSuffix(trend.growthPercent);

  switch (timeframe) {
    case "6H": {
      const mentions = Math.round(baseMentions * 0.024);
      const reach = Math.round(baseReach * 0.028);
      const growth = Math.round(baseGrowth * 0.14);
      return {
        totalMentions: formatNumberWithSuffix(mentions),
        approximateReach: formatNumberWithSuffix(reach),
        growthPercent: `+${Math.max(4, growth)}%`,
        mentionsChange: "+8%",
        reachChange: "+6%",
        periodLabel: "vs previous 6 hours",
        timeframeLabel: "Last 6 Hours",
      };
    }
    case "1D": {
      const mentions = Math.round(baseMentions * 0.082);
      const reach = Math.round(baseReach * 0.092);
      const growth = Math.round(baseGrowth * 0.32);
      return {
        totalMentions: formatNumberWithSuffix(mentions),
        approximateReach: formatNumberWithSuffix(reach),
        growthPercent: `+${Math.max(12, growth)}%`,
        mentionsChange: "+15%",
        reachChange: "+11%",
        periodLabel: "vs previous 24 hours",
        timeframeLabel: "Last 24 Hours",
      };
    }
    case "7D": {
      const mentions = Math.round(baseMentions * 0.32);
      const reach = Math.round(baseReach * 0.35);
      const growth = Math.round(baseGrowth * 0.68);
      return {
        totalMentions: formatNumberWithSuffix(mentions),
        approximateReach: formatNumberWithSuffix(reach),
        growthPercent: `+${Math.max(28, growth)}%`,
        mentionsChange: "+19%",
        reachChange: "+14%",
        periodLabel: "vs previous 7 days",
        timeframeLabel: "Last 7 Days",
      };
    }
    case "30D":
    default: {
      return {
        totalMentions: trend.totalMentions,
        approximateReach: trend.approximateReach,
        growthPercent: trend.growthPercent,
        mentionsChange: "+22%",
        reachChange: "+18%",
        periodLabel: "vs previous period",
        timeframeLabel: "Last 30 Days",
      };
    }
  }
}

/**
 * Derives timeframe-sensitive sentiment timeline, breakdown, and polarity index.
 */
export function getTimeframeSentiment(
  trend: TrendAnalytics,
  timeframe: GlobalTimeframe
): TimeframeSentimentData {
  const baseBreakdown = trend.sentiment.breakdown;
  const basePos = baseBreakdown.positive;
  const baseNeg = baseBreakdown.negative;

  if (timeframe === "6H") {
    // 6 hourly points
    const slots = ["5h ago", "4h ago", "3h ago", "2h ago", "1h ago", "Just now"];
    const timeline = slots.map((date, idx) => {
      const wave = Math.sin(idx * 1.3) * 4;
      const pos = Math.min(95, Math.max(10, Math.round(basePos + wave + 3)));
      const neg = Math.min(60, Math.max(5, Math.round(baseNeg - wave * 0.4)));
      const neu = Math.max(5, 100 - pos - neg);
      return { date, positive: pos, neutral: neu, negative: neg };
    });
    const latest = timeline[timeline.length - 1];
    const breakdown = { positive: latest.positive, neutral: latest.neutral, negative: latest.negative };
    const raw = (breakdown.positive * 5 + breakdown.neutral * 3 + breakdown.negative * 1) / 100;
    return {
      timeline,
      breakdown,
      polarityScore: raw.toFixed(1),
    };
  }

  if (timeframe === "1D") {
    // 6 4-hour slots across 24h
    const slots = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
    const timeline = slots.map((date, idx) => {
      const wave = Math.sin(idx * 0.9) * 3;
      const pos = Math.min(95, Math.max(10, Math.round(basePos + wave + 2)));
      const neg = Math.min(60, Math.max(5, Math.round(baseNeg - wave * 0.3)));
      const neu = Math.max(5, 100 - pos - neg);
      return { date, positive: pos, neutral: neu, negative: neg };
    });
    const avgPos = Math.round(timeline.reduce((acc, cur) => acc + cur.positive, 0) / timeline.length);
    const avgNeg = Math.round(timeline.reduce((acc, cur) => acc + cur.negative, 0) / timeline.length);
    const breakdown = { positive: avgPos, neutral: 100 - avgPos - avgNeg, negative: avgNeg };
    const raw = (breakdown.positive * 5 + breakdown.neutral * 3 + breakdown.negative * 1) / 100;
    return {
      timeline,
      breakdown,
      polarityScore: raw.toFixed(1),
    };
  }

  if (timeframe === "7D") {
    // 7 daily slots
    const slots = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
    const timeline = slots.map((date, idx) => {
      const wave = Math.sin(idx * 0.8) * 4;
      const pos = Math.min(95, Math.max(10, Math.round(basePos + wave)));
      const neg = Math.min(60, Math.max(5, Math.round(baseNeg - wave * 0.5)));
      const neu = Math.max(5, 100 - pos - neg);
      return { date, positive: pos, neutral: neu, negative: neg };
    });
    const avgPos = Math.round(timeline.reduce((acc, cur) => acc + cur.positive, 0) / timeline.length);
    const avgNeg = Math.round(timeline.reduce((acc, cur) => acc + cur.negative, 0) / timeline.length);
    const breakdown = { positive: avgPos, neutral: 100 - avgPos - avgNeg, negative: avgNeg };
    const raw = (breakdown.positive * 5 + breakdown.neutral * 3 + breakdown.negative * 1) / 100;
    return {
      timeline,
      breakdown,
      polarityScore: raw.toFixed(1),
    };
  }

  // 30D default
  const timeline = trend.sentiment.timeline;
  const breakdown = trend.sentiment.breakdown;
  const raw = (breakdown.positive * 5 + breakdown.neutral * 3 + breakdown.negative * 1) / 100;
  return {
    timeline,
    breakdown,
    polarityScore: raw.toFixed(1),
  };
}

/**
 * Scales state-level mentions and growth percentages for the selected timeframe.
 */
export function getTimeframeRegional(
  regional: RegionalData,
  timeframe: GlobalTimeframe
): RegionalData {
  if (timeframe === "30D") return regional;

  const multiplier =
    timeframe === "6H" ? 0.024 : timeframe === "1D" ? 0.082 : 0.32;
  const growthMultiplier =
    timeframe === "6H" ? 0.2 : timeframe === "1D" ? 0.45 : 0.75;

  const result: RegionalData = {};
  for (const [state, data] of Object.entries(regional)) {
    const rawMentions = parseNumberWithSuffix(data.mentions);
    const scaledMentions = Math.max(1, Math.round(rawMentions * multiplier));
    const rawGrowth = parseNumberWithSuffix(data.growth);
    const scaledGrowth = Math.max(2, Math.round(rawGrowth * growthMultiplier));

    result[state] = {
      ...data,
      mentions: formatNumberWithSuffix(scaledMentions),
      growth: `+${scaledGrowth}%`,
    };
  }
  return result;
}

/**
 * Shifts demographic distribution subtly according to real-time vs long-tail trends.
 */
export function getTimeframeDemographics(timeframe: GlobalTimeframe) {
  if (timeframe === "6H") {
    return {
      ageData: [
        { range: "13–17", share: 15 },
        { range: "18–24", share: 34 },
        { range: "25–34", share: 33 },
        { range: "35–44", share: 13 },
        { range: "45+", share: 5 },
      ],
      coreAge: "Core: 18–24 Peak",
      langData: [
        { language: "Hindi", share: 44 },
        { language: "English", share: 31 },
        { language: "Bengali", share: 7 },
        { language: "Tamil", share: 6 },
        { language: "Telugu", share: 5 },
        { language: "Others", share: 7 },
      ],
    };
  }

  if (timeframe === "1D") {
    return {
      ageData: [
        { range: "13–17", share: 14 },
        { range: "18–24", share: 31 },
        { range: "25–34", share: 33 },
        { range: "35–44", share: 16 },
        { range: "45+", share: 6 },
      ],
      coreAge: "Core: 18–34",
      langData: [
        { language: "Hindi", share: 43 },
        { language: "English", share: 29 },
        { language: "Bengali", share: 8 },
        { language: "Tamil", share: 6 },
        { language: "Telugu", share: 6 },
        { language: "Others", share: 8 },
      ],
    };
  }

  if (timeframe === "7D") {
    return {
      ageData: [
        { range: "13–17", share: 13 },
        { range: "18–24", share: 29 },
        { range: "25–34", share: 32 },
        { range: "35–44", share: 19 },
        { range: "45+", share: 7 },
      ],
      coreAge: "Core: 18–34",
      langData: [
        { language: "Hindi", share: 42 },
        { language: "English", share: 28 },
        { language: "Bengali", share: 8 },
        { language: "Tamil", share: 6 },
        { language: "Telugu", share: 6 },
        { language: "Others", share: 10 },
      ],
    };
  }

  // 30D default
  return {
    ageData: [
      { range: "13–17", share: 12 },
      { range: "18–24", share: 28 },
      { range: "25–34", share: 32 },
      { range: "35–44", share: 20 },
      { range: "45+", share: 8 },
    ],
    coreAge: "Core: 18–34",
    langData: [
      { language: "Hindi", share: 42 },
      { language: "English", share: 28 },
      { language: "Bengali", share: 8 },
      { language: "Tamil", share: 6 },
      { language: "Telugu", share: 6 },
      { language: "Others", share: 10 },
    ],
  };
}
