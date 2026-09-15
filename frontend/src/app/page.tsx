"use client";

import { useState } from "react";
import { getTrendById } from "@/data/trends";
import { TrendAnalytics } from "@/data/types";
import Hero from "@/components/hero/Hero";
import TrendReportDeck from "@/components/report/TrendReportDeck";

export default function HomePage() {
  const [activeTrendId, setActiveTrendId] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendAnalytics | null>(null);

  const handleSelectTrend = (id: string) => {
    const newTrend = getTrendById(id);
    if (!newTrend) return;
    setActiveTrendId(id);
    setTrend(newTrend);
  };

  const handleExitReport = () => {
    setActiveTrendId(null);
    setTrend(null);
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      {/* 1. Home / Trend Discovery (shown only when no trend is active) */}
      {!trend ? (
        <Hero activeTrendId={activeTrendId} onSelectTrend={handleSelectTrend} />
      ) : (
        /* 2. Selected-Trend Report inside fixed 100vh Application Shell */
        <TrendReportDeck
          trend={trend}
          onSelectTrend={handleSelectTrend}
          onExit={handleExitReport}
        />
      )}
    </main>
  );
}
