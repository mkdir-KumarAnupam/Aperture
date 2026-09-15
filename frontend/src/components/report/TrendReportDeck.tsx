"use client";

import { useEffect, useState } from "react";
import { ALL_TRENDS } from "@/data/trends";
import { TrendAnalytics } from "@/data/types";
import TrendOverview from "@/components/trend/TrendOverview";
import IndiaHeatmap from "@/components/map/IndiaHeatmap";
import SentimentInsights from "@/components/analytics/SentimentInsights";
import AudienceInsights, { GlobalTimeframe } from "@/components/analytics/AudienceInsights";

interface TrendReportDeckProps {
  trend: TrendAnalytics;
  onSelectTrend: (id: string) => void;
  onExit: () => void;
}

const TIMEFRAMES: GlobalTimeframe[] = ["6H", "1D", "7D", "30D"];

export default function TrendReportDeck({
  trend,
  onSelectTrend,
  onExit,
}: TrendReportDeckProps) {
  const [globalTimeframe, setGlobalTimeframe] = useState<GlobalTimeframe>("30D");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Prefetch GeoJSON
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/india-states-simplified.json").catch(() => {});
    }
  }, []);

  return (
    <div className="app-shell-100vh">
      {/* ── Fixed Application Header (64px) ──────────────────────────────── */}
      <header className="report-header-fixed">
        {/* Left: Product Name (Apperture — clean wordmark, no icon) */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onExit}
            className="text-xl font-extrabold tracking-tight text-[#0F172A] hover:opacity-80 transition-opacity cursor-pointer select-none"
            title="Return to Home Discovery"
          >
            Apperture
          </button>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* Quick exit to Home */}
          <button
            type="button"
            onClick={onExit}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Home</span>
          </button>
        </div>

        {/* Right: Trend Selector Dropdown + Global Timeframe Controls */}
        <div className="flex items-center gap-3">
          {/* Active Trend Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 text-xs font-bold text-[#0F172A] shadow-2xs transition-all cursor-pointer"
              aria-expanded={dropdownOpen}
            >
              <span className="truncate max-w-[140px] sm:max-w-[180px]">{trend.name}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 max-h-72 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Switch Active Trend
                  </div>
                  {ALL_TRENDS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectTrend(t.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        t.id === trend.id ? "text-[#2563EB] bg-blue-50/60 font-bold" : "text-slate-700"
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal tabular-nums ml-2">
                        {t.trendScore}/100
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Global Timeframe Controls: 6H | 1D | 7D | 30D */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
            {TIMEFRAMES.map((tf) => {
              const isActive = globalTimeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setGlobalTimeframe(tf)}
                  className={`header-timeframe-pill ${
                    isActive ? "active" : "inactive"
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Internal Scroll Container (Single continuous report) ─────────── */}
      <div className="internal-scroll-container">
        {/* Section 1: Trend Overview (70 / 30) */}
        <TrendOverview trend={trend} />

        {/* Section 2: Regional Intelligence (60 / 40) */}
        <IndiaHeatmap trend={trend} />

        {/* Section 3: Sentiment Analysis (70 / 30) */}
        <SentimentInsights trend={trend} />

        {/* Section 4: Demographics + Platform Trend Growth (40 / 60) */}
        <AudienceInsights trend={trend} timeframe={globalTimeframe} />
      </div>
    </div>
  );
}
