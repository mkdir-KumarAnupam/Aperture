"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendAnalytics, Timeframe } from "@/data/types";
import { SectionHeader, FadeInSection, PlatformIcon } from "@/components/ui/SectionHeader";

const TIMEFRAMES: Timeframe[] = ["7D", "30D", "90D", "1Y"];

const LINE_COLORS = {
  x: "#243746",
  reddit: "#B87333",
  telegram: "#2B6CB0",
};

const LINE_LABELS = {
  x: "X",
  reddit: "Reddit",
  telegram: "Telegram",
};

interface LifecycleChartProps {
  trend: TrendAnalytics;
}

export default function LifecycleChart({ trend }: LifecycleChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("30D");
  const data = trend.lifecycle[timeframe];

  // Show every nth label to avoid crowding
  const labelStep = data.length > 30 ? Math.ceil(data.length / 10) : 1;

  return (
    <FadeInSection id="section-momentum" className="section-wide analytics-content">
      <SectionHeader trendName={trend.name} sectionName="Trend Momentum" />

      <div className="card flex flex-col justify-between" style={{ minHeight: "clamp(560px, 76vh, 660px)" }}>
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color: "var(--navy)" }}>
              Trend Momentum
            </h2>
            <p className="text-xs" style={{ color: "var(--slate)" }}>
              Normalized platform activity scores (0–100) · Not raw engagement counts
            </p>
          </div>

          {/* Timeframe selector */}
          <div
            className="flex items-center rounded-lg overflow-hidden border"
            style={{ borderColor: "#E2E8F0" }}
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: timeframe === tf ? "var(--navy)" : "var(--surface)",
                  color: timeframe === tf ? "white" : "var(--slate)",
                }}
                id={`timeframe-${tf.toLowerCase()}`}
                aria-pressed={timeframe === tf}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="chart-wrapper flex-1 flex items-center justify-center my-2" style={{ minHeight: 360, maxHeight: 440 }}>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F5" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#52616B" }}
                tickFormatter={(v, i) => (i % labelStep === 0 ? v : "")}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#52616B" }}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--navy)",
                }}
                labelStyle={{ fontWeight: 700, marginBottom: 4 }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconType="circle"
                iconSize={8}
              />
              {(["x", "reddit", "telegram"] as const).map((p) => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  name={LINE_LABELS[p]}
                  stroke={LINE_COLORS[p]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Insight chips */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t" style={{ borderColor: "#EEF2F5" }}>
          <div className="card-sm">
            <p className="section-label mb-1">Peak Growth</p>
            <p className="text-xl font-black" style={{ color: "var(--accent-green)" }}>
              {trend.peakGrowth}
            </p>
          </div>
          <div className="card-sm">
            <p className="section-label mb-1">Peak Activity</p>
            <p className="text-xl font-black" style={{ color: "var(--navy)" }}>
              {trend.peakDate}
            </p>
          </div>
          <div className="card-sm">
            <p className="section-label mb-1">Fastest Platform</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                style={{
                  color:
                    trend.fastestPlatform === "x"
                      ? "var(--navy)"
                      : trend.fastestPlatform === "reddit"
                      ? "#8B4513"
                      : "var(--accent-blue)",
                }}
              >
                <PlatformIcon platform={trend.fastestPlatform} size={16} />
              </span>
              <span className="text-base font-black" style={{ color: "var(--navy)" }}>
                {LINE_LABELS[trend.fastestPlatform]}
              </span>
            </div>
          </div>
        </div>
      </div>
    </FadeInSection>
  );
}
