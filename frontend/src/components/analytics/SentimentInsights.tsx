"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendAnalytics } from "@/data/types";
import { FadeInSection } from "@/components/ui/SectionHeader";

const SENTIMENT_COLORS = {
  positive: "#16A34A", // Vibrant emerald green matching mockup
  neutral: "#F59E0B",  // Warm golden amber matching mockup
  negative: "#EF4444", // Modern bright red matching mockup
};

const TOTAL_POSTS_MAP: Record<string, string> = {
  "cricket-world-cup": "12,5K",
  "ai-photo-editor": "8,4K",
  "electric-scooter": "15,2K",
  "upi-international": "10,8K",
  "budget-smartphones": "9,6K",
  "space-missions": "7,1K",
};

export default function SentimentInsights({ trend }: { trend: TrendAnalytics }) {
  const { timeline, breakdown } = trend.sentiment;

  const startDate = timeline[0]?.date ?? "Aug 10";
  const endDate = timeline[timeline.length - 1]?.date ?? "Sep 5";
  const dateRangeText = `${startDate}, 2024  –  ${endDate}, 2024`;

  const totalPosts = TOTAL_POSTS_MAP[trend.id] ?? "12,5K";

  const donutData = useMemo(() => [
    { name: "Positive", value: breakdown.positive, color: SENTIMENT_COLORS.positive },
    { name: "Neutral", value: breakdown.neutral, color: SENTIMENT_COLORS.neutral },
    { name: "Negative", value: breakdown.negative, color: SENTIMENT_COLORS.negative },
  ], [breakdown]);



  return (
    <FadeInSection id="section-sentiment" className="section-wide analytics-content">
      {/* ── Top Header Section (Minimized gap between heading and text) ─────────────── */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
            style={{
              color: "var(--navy)",
              borderColor: "var(--soft-blue)",
              background: "var(--secondary)",
            }}
          >
            {trend.name}
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-gray-400">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            SENTIMENT INSIGHTS
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight" style={{ color: "var(--navy)" }}>
          Sentiment Insights
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-tight">
          NLP-derived sentiment signals across the conversation.
        </p>
      </div>

      {/* ── 2-Card Balanced Layout (Expanded line graph, compact right panel) ───── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[2.3fr_1fr] gap-4 lg:gap-5 items-stretch"
        style={{ minHeight: "clamp(540px, 72vh, 640px)" }}
      >
        {/* ── Left Card: Sentiment Over Time ─────────────────────────────── */}
        <div className="card flex flex-col justify-between p-5 sm:p-6 h-full shadow-xs">
          {/* Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#EBF5FF] flex items-center justify-center text-[#2563EB] shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold leading-tight" style={{ color: "var(--navy)" }}>
                  Sentiment Over Time
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Estimated % share of posts by sentiment category over time
                </p>
              </div>
            </div>

            {/* Date range picker badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 shadow-xs select-none">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{dateRangeText}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 ml-0.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Line Chart Area (Properly padded margins to ensure no tick clipping) */}
          <div className="flex-1 w-full min-h-[310px] flex items-center justify-center my-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={true} horizontal={true} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 500 }}
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={46}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                  formatter={(val) => [`${val}%`]}
                />
                <Line
                  type="monotone"
                  dataKey="positive"
                  name="Positive"
                  stroke={SENTIMENT_COLORS.positive}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                />
                <Line
                  type="monotone"
                  dataKey="neutral"
                  name="Neutral"
                  stroke={SENTIMENT_COLORS.neutral}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  name="Negative"
                  stroke={SENTIMENT_COLORS.negative}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#FFFFFF" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Centered Legend at Bottom */}
          <div className="flex items-center justify-center gap-6 pt-2 pb-0.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.positive }} />
              <span className="text-xs font-semibold text-slate-700">Positive</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.neutral }} />
              <span className="text-xs font-semibold text-slate-700">Neutral</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.negative }} />
              <span className="text-xs font-semibold text-slate-700">Negative</span>
            </div>
          </div>
        </div>

        {/* ── Right Card: Sentiment Breakdown ────────────────────────────── */}
        <div className="card flex flex-col justify-between p-5 sm:p-6 h-full shadow-xs">
          {/* Card Header (Minimized gap between heading and subtitle) */}
          <div className="shrink-0 mb-1">
            <h2 className="text-base sm:text-lg font-bold leading-tight" style={{ color: "var(--navy)" }}>
              Sentiment Breakdown
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-tight">
              Share of posts by sentiment category
            </p>
          </div>

          {/* Donut Chart with Centered Total Posts Metric (Enlarged by an additional 5%) */}
          <div className="flex-1 w-full flex items-center justify-center my-auto py-0.5 relative">
            <div className="w-[295px] h-[295px] sm:w-[315px] sm:h-[315px] relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={86}
                    outerRadius={142}
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={1}
                    dataKey="value"
                    nameKey="name"
                    labelLine={false}
                    label={false}
                    isAnimationActive={true}
                    animationDuration={800}
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "white",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(val) => [`${val}%`]}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Centered Metric in Donut Hole */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-xs font-medium text-slate-400 leading-tight">
                  Total Posts
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-0.5 leading-none" style={{ color: "var(--navy)" }}>
                  {totalPosts}
                </span>
              </div>
            </div>
          </div>

          {/* Category Breakdown List (Shifted 7% inwards from both sides to reduce gap in between) */}
          <div className="w-full space-y-3 pt-2 shrink-0 px-[7%]">
            <div className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.positive }} />
                <span className="text-slate-700 font-medium">Positive</span>
              </div>
              <span className="font-bold text-sm sm:text-base" style={{ color: "var(--navy)" }}>
                {breakdown.positive}%
              </span>
            </div>

            <div className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.neutral }} />
                <span className="text-slate-700 font-medium">Neutral</span>
              </div>
              <span className="font-bold text-sm sm:text-base" style={{ color: "var(--navy)" }}>
                {breakdown.neutral}%
              </span>
            </div>

            <div className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.negative }} />
                <span className="text-slate-700 font-medium">Negative</span>
              </div>
              <span className="font-bold text-sm sm:text-base" style={{ color: "var(--navy)" }}>
                {breakdown.negative}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </FadeInSection>
  );
}
