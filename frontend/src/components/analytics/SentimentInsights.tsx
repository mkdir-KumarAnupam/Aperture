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
} from "recharts";
import { GlobalTimeframe, TrendAnalytics } from "@/data/types";
import { getTimeframeSentiment } from "@/data/timeframeAdapters";

const SENTIMENT_COLORS = {
  positive: "#10B981", // Green
  neutral: "#F59E0B",  // Golden amber
  negative: "#EF4444", // Bright red
};

// Compact 15-dot waffle grid (5 cols x 3 rows) matching reference illustration
function CompactWaffle({
  percentage,
  color,
}: {
  percentage: number;
  color: string;
}) {
  const total = 15;
  const filled = Math.max(1, Math.min(total, Math.round((percentage / 100) * total)));

  return (
    <div className="grid grid-cols-5 gap-1 p-1 bg-slate-50 rounded-md border border-slate-100 shrink-0">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i < filled;
        return (
          <div
            key={i}
            className="w-2 h-2 rounded-[1.5px] transition-colors"
            style={{
              background: isActive ? color : "#E2E8F0",
              opacity: isActive ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

export default function SentimentInsights({
  trend,
  timeframe = "30D",
}: {
  trend: TrendAnalytics;
  timeframe?: GlobalTimeframe;
}) {
  const { timeline, breakdown, polarityScore } = useMemo(
    () => getTimeframeSentiment(trend, timeframe),
    [trend, timeframe]
  );

  return (
    <section
      id="section-sentiment"
      className="w-full border-b border-slate-200/80 px-6 sm:px-10 lg:px-12 py-6 flex flex-col justify-center"
      style={{ minHeight: "40vh" }}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
            Sentiment Analysis
          </h2>
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-100 tracking-wider">
            NLP-DERIVED
          </span>
        </div>

        <div className="flex items-center gap-2 text-right">
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">Polarity Index</span>
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-[#0F172A]">
            <span className="text-sm font-black">{polarityScore}</span>
            <span className="text-slate-400 font-medium"> / 5.0</span>
          </div>
        </div>
      </div>

      {/* ── Inner 70 / 30 Layout ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-8 xl:gap-12 items-center">
        {/* ── Left 65%: Sentiment Over Time Line Graph ──────────────────── */}
        <div className="flex flex-col justify-between">
          <div className="mb-2">
            <h3 className="text-sm font-bold text-[#0F172A]">Sentiment Over Time</h3>
          </div>

            <div className="w-full h-[220px] sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    axisLine={{ stroke: "#E2E8F0" }}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
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
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="neutral"
                    name="Neutral"
                    stroke={SENTIMENT_COLORS.neutral}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="negative"
                    name="Negative"
                    stroke={SENTIMENT_COLORS.negative}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Legend at bottom */}
            <div className="flex items-center justify-center gap-6 pt-3 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.positive }} />
                <span className="text-slate-700">Positive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.neutral }} />
                <span className="text-slate-700">Neutral</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SENTIMENT_COLORS.negative }} />
                <span className="text-slate-700">Negative</span>
              </div>
            </div>
          </div>

          {/* ── Right 30%: Overall Sentiment (Waffles + Progress Bars) ─────── */}
          <div className="flex flex-col justify-center gap-4 pl-0 lg:pl-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0">
            <div className="mb-1">
              <h3 className="text-base font-bold text-[#0F172A]">Overall Sentiment</h3>
            </div>

            {/* Row 1: Positive */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <CompactWaffle percentage={breakdown.positive} color={SENTIMENT_COLORS.positive} />
                  <span className="text-slate-700">Positive</span>
                </div>
                <span className="font-bold text-[#0F172A] tabular-nums text-sm">
                  {breakdown.positive}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${breakdown.positive}%`,
                    background: SENTIMENT_COLORS.positive,
                  }}
                />
              </div>
            </div>

            {/* Row 2: Neutral */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <CompactWaffle percentage={breakdown.neutral} color={SENTIMENT_COLORS.neutral} />
                  <span className="text-slate-700">Neutral</span>
                </div>
                <span className="font-bold text-[#0F172A] tabular-nums text-sm">
                  {breakdown.neutral}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${breakdown.neutral}%`,
                    background: SENTIMENT_COLORS.neutral,
                  }}
                />
              </div>
            </div>

            {/* Row 3: Negative */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <CompactWaffle percentage={breakdown.negative} color={SENTIMENT_COLORS.negative} />
                  <span className="text-slate-700">Negative</span>
                </div>
                <span className="font-bold text-[#0F172A] tabular-nums text-sm">
                  {breakdown.negative}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${breakdown.negative}%`,
                    background: SENTIMENT_COLORS.negative,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
    </section>
  );
}
