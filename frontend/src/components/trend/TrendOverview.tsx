"use client";

import { GlobalTimeframe, TrendAnalytics } from "@/data/types";
import { getTimeframeOverview } from "@/data/timeframeAdapters";

interface TrendOverviewProps {
  trend: TrendAnalytics;
  timeframe?: GlobalTimeframe;
}

const REPORT_PERIODS: Record<GlobalTimeframe, string> = {
  "6H": "Sep 5, 2024 · 12:00 – 18:00",
  "1D": "Sep 4 – Sep 5, 2024",
  "7D": "Aug 30 – Sep 5, 2024",
  "30D": "Aug 6, 2024 – Sep 5, 2024",
};

export default function TrendOverview({ trend, timeframe = "30D" }: TrendOverviewProps) {
  const overview = getTimeframeOverview(trend, timeframe);
  const reportPeriod = REPORT_PERIODS[timeframe] ?? REPORT_PERIODS["30D"];

  return (
    <section
      id="section-overview"
      className="w-full border-b border-slate-200/80 px-6 sm:px-10 lg:px-12 py-8 flex flex-col justify-center"
      style={{ minHeight: "40vh" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[6fr_4fr] gap-8 xl:gap-12 items-center">
        {/* ── Left: Editorial Trend Summary ─────────────────────────── */}
        <div className="flex flex-col justify-center">
          <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-1">
            TREND REPORT
          </span>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F172A] tracking-tight leading-tight mb-3">
            {trend.name}
          </h1>

          <p className="text-sm sm:text-[14px] text-slate-600 leading-relaxed max-w-2xl">
            {trend.description}
          </p>
        </div>

        {/* ── Right: Report Period & Three Metrics ──────────────────── */}
        <div className="flex flex-col justify-between h-full py-1">
          {/* Top: Report Period (Right aligned) */}
          <div className="text-right mb-4">
            <span className="text-[11px] font-semibold text-slate-400 block">
              Report Period
            </span>
            <span className="text-xs font-bold text-slate-700">
              {reportPeriod}
            </span>
          </div>

          {/* Bottom: 3 Metrics Horizontally */}
          <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-2">
            {/* Metric 1: Total Mentions */}
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-[#0F172A] tracking-tight leading-none mb-1 tabular-nums">
                {overview.totalMentions}
              </span>
              <span className="text-xs font-semibold text-slate-500 mb-1">
                Total Mentions
              </span>
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                <span>↑</span>
                <span>{overview.mentionsChange} vs previous period</span>
              </div>
            </div>

            {/* Metric 2: Total Reach */}
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-[#0F172A] tracking-tight leading-none mb-1 tabular-nums">
                {overview.approximateReach}
              </span>
              <span className="text-xs font-semibold text-slate-500 mb-1">
                Total Reach
              </span>
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                <span>↑</span>
                <span>{overview.reachChange} vs previous period</span>
              </div>
            </div>

            {/* Metric 3: Trend Growth % */}
            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl xl:text-4xl font-black text-[#0F172A] tracking-tight leading-none mb-1 tabular-nums">
                {overview.growthPercent}
              </span>
              <span className="text-xs font-semibold text-slate-500 mb-1">
                Trend Growth
              </span>
              <span className="text-xs font-medium text-slate-400">
                {overview.periodLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
