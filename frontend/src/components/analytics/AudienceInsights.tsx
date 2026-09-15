"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { GlobalTimeframe, TrendAnalytics } from "@/data/types";
import { getTimeframeDemographics } from "@/data/timeframeAdapters";
import { PlatformIcon } from "@/components/ui/SectionHeader";

const LANG_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#94A3B8"];

export type { GlobalTimeframe };

interface AudienceInsightsProps {
  trend: TrendAnalytics;
  timeframe: GlobalTimeframe;
}

export default function AudienceInsights({ trend, timeframe }: AudienceInsightsProps) {
  // ── 1. Demographics responding to timeframe ────────────────────────────────
  const { ageData, langData, coreAge } = useMemo(
    () => getTimeframeDemographics(timeframe),
    [timeframe]
  );

  // ── 3. Platform Growth Sparklines responding to Header Timeframe ───────────
  const platformData = useMemo(() => {
    const baseX = trend.platformActivity.x;
    const baseR = trend.platformActivity.reddit;
    const baseT = trend.platformActivity.telegram;

    if (timeframe === "6H") {
      return [
        { x: Math.max(10, Math.round(baseX * 0.78)), reddit: Math.max(10, Math.round(baseR * 0.82)), telegram: Math.max(10, Math.round(baseT * 0.74)) },
        { x: Math.max(12, Math.round(baseX * 0.84)), reddit: Math.max(11, Math.round(baseR * 0.86)), telegram: Math.max(12, Math.round(baseT * 0.79)) },
        { x: Math.max(15, Math.round(baseX * 0.89)), reddit: Math.max(14, Math.round(baseR * 0.91)), telegram: Math.max(14, Math.round(baseT * 0.85)) },
        { x: Math.max(18, Math.round(baseX * 0.94)), reddit: Math.max(16, Math.round(baseR * 0.94)), telegram: Math.max(16, Math.round(baseT * 0.91)) },
        { x: Math.max(20, Math.round(baseX * 0.97)), reddit: Math.max(18, Math.round(baseR * 0.98)), telegram: Math.max(18, Math.round(baseT * 0.96)) },
        { x: baseX,                                 reddit: baseR,                                 telegram: baseT },
      ];
    }

    if (timeframe === "1D") {
      return [
        { x: Math.max(10, Math.round(baseX * 0.65)), reddit: Math.max(10, Math.round(baseR * 0.72)), telegram: Math.max(10, Math.round(baseT * 0.68)) },
        { x: Math.max(12, Math.round(baseX * 0.70)), reddit: Math.max(11, Math.round(baseR * 0.75)), telegram: Math.max(12, Math.round(baseT * 0.72)) },
        { x: Math.max(15, Math.round(baseX * 0.82)), reddit: Math.max(13, Math.round(baseR * 0.82)), telegram: Math.max(13, Math.round(baseT * 0.80)) },
        { x: Math.max(18, Math.round(baseX * 0.88)), reddit: Math.max(15, Math.round(baseR * 0.89)), telegram: Math.max(15, Math.round(baseT * 0.87)) },
        { x: Math.max(20, Math.round(baseX * 0.95)), reddit: Math.max(18, Math.round(baseR * 0.95)), telegram: Math.max(17, Math.round(baseT * 0.94)) },
        { x: baseX,                                 reddit: baseR,                                 telegram: baseT },
      ];
    }

    if (timeframe === "7D") {
      return trend.lifecycle["7D"].map((d) => ({
        x: d.x,
        reddit: d.reddit,
        telegram: d.telegram,
      }));
    }

    // Default 30D
    return trend.lifecycle["30D"].map((d) => ({
      x: d.x,
      reddit: d.reddit,
      telegram: d.telegram,
    }));
  }, [timeframe, trend]);

  return (
    <section
      id="section-demographics"
      className="w-full px-6 sm:px-10 lg:px-12 py-8 flex flex-col justify-center"
      style={{ minHeight: "40vh" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-12 items-stretch">
        {/* ── 50% Left: Demographics (Age + Language Side-by-Side) ────────── */}
        <div className="flex flex-col justify-between h-full">
          <div className="mb-3">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
              Demographics
            </h2>
          </div>

          {/* 2 Visualizations Side by Side inside Demographics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-auto items-center">
            {/* 1. Age Distribution */}
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700 mb-2">
                Age Distribution
              </span>
              <div className="w-full h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageData} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="range"
                      tick={{ fontSize: 9, fill: "#64748B", fontWeight: 500 }}
                      axisLine={{ stroke: "#E2E8F0" }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "6px", fontSize: "11px" }}
                      formatter={(v) => [`${v}%`, "Share"]}
                    />
                    <Bar
                      dataKey="share"
                      fill="#3B82F6"
                      radius={[4, 4, 0, 0]}
                      label={{ position: "top", fontSize: 10, fill: "#0F172A", fontWeight: 700, formatter: (val) => `${val}%` }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Language Distribution */}
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700 mb-2">
                Language Distribution
              </span>
              <div className="flex items-center gap-3">
                {/* Donut */}
                <div className="w-[105px] h-[105px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={langData}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={48}
                        paddingAngle={2}
                        dataKey="share"
                        nameKey="language"
                      >
                        {langData.map((_, i) => (
                          <Cell key={i} fill={LANG_COLORS[i % LANG_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex-1 space-y-1 text-[11px]">
                  {langData.map((item, idx) => (
                    <div key={item.language} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-600 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: LANG_COLORS[idx % LANG_COLORS.length] }}
                        />
                        <span className="truncate">{item.language}</span>
                      </span>
                      <span className="font-bold text-[#0F172A] tabular-nums">
                        {item.share}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 50% Right: Platform Trend Growth ───────────────────────────── */}
        <div className="flex flex-col justify-between h-full">
          <div className="mb-3">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
              Platform Trend Growth
            </h2>
          </div>

          {/* 3 Platform Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-auto">
            {/* 1. X (Twitter) */}
            <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-900">
                    <PlatformIcon platform="x" size={14} />
                  </span>
                  <span className="text-xs font-bold text-slate-800">X (Twitter)</span>
                </div>
                <span className="text-xs font-black text-[#0F172A]">
                  {trend.platformActivity.x}<span className="text-[10px] text-slate-400 font-normal">/100</span>
                </span>
              </div>

              <div className="w-full h-[85px] my-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={platformData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradX2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0F172A" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0F172A" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="x" stroke="#0F172A" strokeWidth={2} fill="url(#gradX2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                <span>Velocity</span>
                <span className="font-bold text-emerald-600">Active High</span>
              </div>
            </div>

            {/* 2. Reddit */}
            <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#EA580C]">
                    <PlatformIcon platform="reddit" size={14} />
                  </span>
                  <span className="text-xs font-bold text-slate-800">Reddit</span>
                </div>
                <span className="text-xs font-black text-[#0F172A]">
                  {trend.platformActivity.reddit}<span className="text-[10px] text-slate-400 font-normal">/100</span>
                </span>
              </div>

              <div className="w-full h-[85px] my-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={platformData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradReddit2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EA580C" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="reddit" stroke="#EA580C" strokeWidth={2} fill="url(#gradReddit2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                <span>Discussion</span>
                <span className="font-bold text-amber-600">Deep Threads</span>
              </div>
            </div>

            {/* 3. Telegram */}
            <div className="p-3.5 rounded-xl border border-slate-200/90 bg-white flex flex-col justify-between shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#0284C7]">
                    <PlatformIcon platform="telegram" size={14} />
                  </span>
                  <span className="text-xs font-bold text-slate-800">Telegram</span>
                </div>
                <span className="text-xs font-black text-[#0F172A]">
                  {trend.platformActivity.telegram}<span className="text-[10px] text-slate-400 font-normal">/100</span>
                </span>
              </div>

              <div className="w-full h-[85px] my-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={platformData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradTelegram2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0284C7" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="telegram" stroke="#0284C7" strokeWidth={2} fill="url(#gradTelegram2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                <span>Broadcast</span>
                <span className="font-bold text-blue-600">Channel Reach</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
