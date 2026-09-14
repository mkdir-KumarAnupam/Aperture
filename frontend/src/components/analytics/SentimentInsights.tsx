"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendAnalytics } from "@/data/types";
import { SectionHeader, FadeInSection } from "@/components/ui/SectionHeader";

const SENTIMENT_COLORS = {
  positive: "#5A9E7C",
  neutral: "#C4943A",
  negative: "#C4614A",
};

export default function SentimentInsights({ trend }: { trend: TrendAnalytics }) {
  const { timeline, breakdown, themes } = trend.sentiment;

  return (
    <FadeInSection id="section-sentiment" className="section-wide analytics-content">
      <SectionHeader trendName={trend.name} sectionName="Sentiment Insights" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch" style={{ minHeight: "clamp(560px, 76vh, 660px)" }}>
        {/* Timeline chart — spans 2 cols */}
        <div className="lg:col-span-2 card flex flex-col justify-between h-full">
          <div>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--navy)" }}>
                  Sentiment Insights
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>
                  Estimated % share of posts by sentiment category over time
                </p>
              </div>
              <span className="prototype-badge">NLP Classifier</span>
            </div>
          </div>

          <div className="chart-wrapper flex-1 flex items-center justify-center my-2" style={{ minHeight: 360, maxHeight: 440 }}>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={timeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F5" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#52616B" }}
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#52616B" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={34}
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(val) => [`${val}%`]}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} iconSize={8} />
                <Line type="monotone" dataKey="positive" name="Positive" stroke={SENTIMENT_COLORS.positive} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="neutral" name="Neutral" stroke={SENTIMENT_COLORS.neutral} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="negative" name="Negative" stroke={SENTIMENT_COLORS.negative} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs pt-3 border-t text-gray-400" style={{ borderColor: "#EEF2F5" }}>
            Multi-class sentiment scoring normalized across X, Reddit, and Telegram posts
          </p>
        </div>

        {/* Breakdown + Themes — spans 1 col */}
        <div className="flex flex-col justify-between gap-4 h-full">
          {/* Breakdown */}
          <div className="card flex-1 flex flex-col justify-between">
            <h3 className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>
              Sentiment Breakdown
            </h3>
            <div className="space-y-2.5 my-auto">
              {(["positive", "neutral", "negative"] as const).map((s) => (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-semibold capitalize"
                      style={{ color: SENTIMENT_COLORS[s] }}
                    >
                      {s}
                    </span>
                    <span className="text-sm font-black" style={{ color: "var(--navy)" }}>
                      {breakdown[s]}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${breakdown[s]}%`,
                        background: SENTIMENT_COLORS[s],
                        transition: "width 0.8s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 pt-2 border-t" style={{ borderColor: "#EEF2F5" }}>
              Aggregate volume share
            </p>
          </div>

          {/* Themes */}
          <div className="card flex-1 flex flex-col justify-between">
            <h3 className="text-sm font-bold mb-2" style={{ color: "var(--navy)" }}>
              Key Themes
            </h3>
            <div className="space-y-2 my-auto">
              <div>
                <p className="text-[11px] font-bold mb-1" style={{ color: SENTIMENT_COLORS.positive }}>
                  ↑ Positive Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {themes.positive.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "#5A9E7C18", color: "#3D7A5A", border: "1px solid #5A9E7C30" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold mb-1" style={{ color: SENTIMENT_COLORS.negative }}>
                  ↓ Critical Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {themes.negative.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "#C4614A18", color: "#9E3D2B", border: "1px solid #C4614A30" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 pt-2 border-t" style={{ borderColor: "#EEF2F5" }}>
              Extracted via semantic clustering
            </p>
          </div>
        </div>
      </div>
    </FadeInSection>
  );
}
