"use client";

import { HOT_TRENDS } from "@/data/trends";

interface HotTrendsProps {
  activeTrendId: string | null;
  onSelect: (id: string) => void;
}

const RANK_COLORS = ["#C4614A", "#5A9E7C", "#4A7FA5", "#C4943A", "#243746", "#2B6CB0", "#7B68A4"];

export default function HotTrends({ activeTrendId, onSelect }: HotTrendsProps) {
  return (
    <div className="hot-trends w-full max-w-6xl mx-auto text-left">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold tracking-wider uppercase" style={{ color: "var(--slate)" }}>
          🔥 Hot Trends
        </h2>
        <span className="text-xs" style={{ color: "var(--slate)" }}>Select to explore</span>
      </div>

      {/* Wireframe-style ranked list */}
      <div
        className="rounded-xl overflow-hidden border"
        style={{ borderColor: "#E2E8F0", background: "var(--surface)" }}
      >
        {HOT_TRENDS.map((trend, index) => {
          const isActive = activeTrendId === trend.id;
          const rankColor = RANK_COLORS[index % RANK_COLORS.length];

          return (
            <button
              key={trend.id}
              id={`hot-trend-${trend.id}`}
              className="hot-trend-row w-full h-16 grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 px-5 py-2 text-left transition-all duration-150 group"
              style={{
                borderBottom: index < HOT_TRENDS.length - 1 ? "1px solid #E2E8F0" : "none",
                background: isActive
                  ? "linear-gradient(90deg, rgba(74, 127, 165, 0.06) 0%, transparent 100%)"
                  : "transparent",
                borderLeft: isActive ? "3px solid var(--accent-blue)" : "3px solid transparent",
              }}
              onClick={() => onSelect(trend.id)}
              aria-pressed={isActive}
              aria-label={`Select trend: ${trend.name}`}
            >
              {/* Rank number */}
              <span
                className="text-sm font-black w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: trend.rank <= 3 ? "var(--navy)" : "var(--secondary)",
                  color: trend.rank <= 3 ? "white" : "var(--slate)",
                  fontSize: "0.75rem",
                }}
              >
                {trend.rank}
              </span>

              {/* Trend name — primary content, takes most space */}
              <div className="min-w-0">
                <p
                  className="text-sm font-bold truncate group-hover:text-(--accent-blue) transition-colors"
                  style={{ color: isActive ? "var(--accent-blue)" : "var(--navy)" }}
                >
                  {trend.name}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--slate)" }}>
                  {trend.category} <span aria-hidden="true">·</span> {trend.growth} growth
                </p>
              </div>

              {/* Category tag */}
              {/* Mentions */}
              <span className="text-xs self-center hidden sm:block" style={{ color: "var(--slate)" }}>
                <span className="font-semibold" style={{ color: "var(--navy)" }}>{trend.mentions}</span>
                {" "}mentions
              </span>

              {/* Score bar + number */}
              <div className="flex items-center gap-1.5 self-center">
                <div
                  className="h-1.5 rounded-full hidden sm:block"
                  style={{
                    width: "40px",
                    background: "var(--soft-blue)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${trend.trendScore}%`,
                      background: rankColor,
                    }}
                  />
                </div>
                <span className="text-xs font-black w-6 text-right" style={{ color: rankColor }}>
                  {trend.trendScore}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
