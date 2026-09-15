"use client";

import { TrendAnalytics } from "@/data/types";

interface TrendOverviewProps {
  trend: TrendAnalytics;
}

export default function TrendOverview({ trend }: TrendOverviewProps) {
  return (
    <section id="section-overview" className="w-full">
      <div className="report-card p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-8 items-center">
          {/* ── 70% Left: Editorial Trend Summary ─────────────────────────── */}
          <div className="flex flex-col justify-center">
            {/* Header: Label + Active Trend Pill */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="text-sm font-bold text-[#0F172A]">Trend Overview</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]">
                {trend.name}
              </span>
            </div>

            {/* Huge Trend Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0F172A] tracking-tight leading-tight mb-3">
              {trend.name}
            </h1>

            {/* Full-width Natural Description */}
            <p className="text-sm sm:text-[15px] text-slate-600 leading-relaxed max-w-none">
              {trend.description}
            </p>
          </div>

          {/* ── 30% Right: Exactly Three Compact Metrics ──────────────────── */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
            {/* Metric 1: Total Mentions */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 whitespace-nowrap">
                Total Mentions
              </span>
              <div className="text-xl sm:text-2xl xl:text-3xl font-black text-[#0F172A] my-1.5 tabular-nums">
                {trend.totalMentions}
              </div>
              <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-emerald-600">
                <span>↑</span>
                <span>+22%</span>
              </div>
            </div>

            {/* Metric 2: Total Reach */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 whitespace-nowrap">
                Total Reach
              </span>
              <div className="text-xl sm:text-2xl xl:text-3xl font-black text-[#0F172A] my-1.5 tabular-nums">
                {trend.approximateReach}
              </div>
              <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-emerald-600">
                <span>↑</span>
                <span>+18%</span>
              </div>
            </div>

            {/* Metric 3: Trend Growth % */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
              <span className="text-[11px] sm:text-xs font-medium text-slate-500 whitespace-nowrap">
                Trend Growth
              </span>
              <div className="text-xl sm:text-2xl xl:text-3xl font-black text-emerald-600 my-1.5 tabular-nums">
                {trend.growthPercent}
              </div>
              <div className="text-[10px] sm:text-[11px] font-medium text-slate-400 truncate">
                vs previous period
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
