"use client";

import { useEffect, useState } from "react";
import { getTrendById } from "@/data/trends";
import { TrendAnalytics } from "@/data/types";

import Hero from "@/components/hero/Hero";
import TrendReportDeck from "@/components/report/TrendReportDeck";

export default function HomePage() {
  const [activeTrendId, setActiveTrendId] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendAnalytics | null>(null);
  const [reportKey, setReportKey] = useState(0);

  useEffect(() => {
    if (!trend) return;

    const frame = requestAnimationFrame(() => {
      document.getElementById("trend-report")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [trend, reportKey]);

  const handleSelectTrend = (id: string) => {
    const newTrend = getTrendById(id);
    if (!newTrend) return;

    setActiveTrendId(id);
    setTrend(newTrend);
    setReportKey((prev) => prev + 1);

    requestAnimationFrame(() => {
      document.getElementById("trend-report")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleExitReport = () => {
    document.getElementById("section-hero")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* 1. Hero / Landing */}
      <Hero activeTrendId={activeTrendId} onSelectTrend={handleSelectTrend} />

      {/* 2. Interactive Presentation Report Deck (only visible after trend selection) */}
      {trend && (
        <TrendReportDeck
          key={`${trend.id}-${reportKey}`}
          trend={trend}
          onExit={handleExitReport}
        />
      )}
    </main>
  );
}
