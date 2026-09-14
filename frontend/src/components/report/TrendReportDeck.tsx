"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { TrendAnalytics } from "@/data/types";
import TrendOverview from "@/components/trend/TrendOverview";
import TrendMomentum from "@/components/analytics/TrendMomentum";
import AudienceInsights from "@/components/analytics/AudienceInsights";
import SentimentInsights from "@/components/analytics/SentimentInsights";
import InfluenceNetwork from "@/components/analytics/InfluenceNetwork";
import IndiaHeatmap from "@/components/map/IndiaHeatmap";

export const REPORT_SLIDES = [
  { id: "overview", label: "Overview", subtitle: "Core Metrics & Summary" },
  { id: "momentum", label: "Momentum", subtitle: "Platform Lifecycle Trajectory" },
  { id: "audience", label: "Audience", subtitle: "Demographics & Language" },
  { id: "sentiment", label: "Sentiment", subtitle: "Perception & Themes" },
  { id: "influence", label: "Influence", subtitle: "Key Voices & Network" },
  { id: "regional", label: "Regional", subtitle: "State Distribution Map" },
] as const;

interface TrendReportDeckProps {
  trend: TrendAnalytics;
  onExit: () => void;
}

const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 32 : direction < 0 ? -32 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -32 : 32,
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  }),
};

export default function TrendReportDeck({ trend, onExit }: TrendReportDeckProps) {
  const [[activeSlide, direction], setActiveSlide] = useState<[number, number]>([0, 0]);

  const stageRef = useRef<HTMLElement>(null);

  // Always reset scroll to top on slide change
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [activeSlide]);

  // Always reset to Slide 1 (index 0) when trend changes
  useEffect(() => {
    setActiveSlide([0, 0]);
  }, [trend.id]);

  // Prefetch optimized GeoJSON asset in the background so Slide 06 (Regional) loads in 0ms
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/india-states-simplified.json").catch(() => {});
    }
  }, []);

  const goToSlide = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= REPORT_SLIDES.length) return;
    setActiveSlide(([current]) => {
      if (newIndex === current) return [current, 0];
      const dir = newIndex > current ? 1 : -1;
      return [newIndex, dir];
    });
  }, []);

  const goToNext = useCallback(() => {
    setActiveSlide(([current]) => {
      if (current >= REPORT_SLIDES.length - 1) return [current, 0];
      return [current + 1, 1];
    });
  }, []);

  const goToPrev = useCallback(() => {
    setActiveSlide(([current]) => {
      if (current <= 0) return [current, 0];
      return [current - 1, -1];
    });
  }, []);

  // Keyboard navigation: ArrowLeft and ArrowRight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrev]);

  const renderSlideContent = () => {
    switch (activeSlide) {
      case 0:
        return <TrendOverview trend={trend} />;
      case 1:
        return <TrendMomentum trend={trend} />;
      case 2:
        return <AudienceInsights trend={trend} />;
      case 3:
        return <SentimentInsights trend={trend} />;
      case 4:
        return <InfluenceNetwork trend={trend} />;
      case 5:
        return <IndiaHeatmap trend={trend} />;
      default:
        return <TrendOverview trend={trend} />;
    }
  };

  const isFirstSlide = activeSlide === 0;
  const isLastSlide = activeSlide === REPORT_SLIDES.length - 1;

  return (
    <div
      id="trend-report"
      className="w-full flex flex-col justify-between"
      style={{
        background: "var(--bg)",
        minHeight: "100vh",
        height: "100vh",
        maxHeight: "100vh",
        overflow: "hidden",
      }}
    >
      {/* ── Top Deck Navigation Bar ─────────────────────────────────────────── */}
      <header
        className="shrink-0 w-full border-b backdrop-blur-md transition-colors z-40"
        style={{
          background: "rgba(247, 246, 242, 0.96)",
          borderColor: "#E2E8F0",
        }}
      >
        <div className="section-wide py-2">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Brand + Active Trend Pill */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-2 group text-left cursor-pointer transition-opacity hover:opacity-80"
                title="Return to Trend Discovery"
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: "var(--navy)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.5" />
                    <circle cx="6" cy="6" r="1.5" fill="white" />
                  </svg>
                </div>
                <span className="text-xs font-bold tracking-wide hidden lg:block" style={{ color: "var(--navy)" }}>
                  TrendScope
                </span>
              </button>

              <div className="w-px h-4 bg-gray-200 hidden sm:block" />

              {/* Active Trend Badge */}
              <div
                className="flex items-center gap-2 px-2.5 py-1 rounded-full border"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--soft-blue)",
                }}
              >
                <span className="text-xs font-bold truncate max-w-[120px] sm:max-w-[200px]" style={{ color: "var(--navy)" }}>
                  {trend.name}
                </span>
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: "var(--secondary)", color: "var(--accent-blue)" }}
                >
                  {trend.trendScore}
                </span>
              </div>
            </div>

            {/* Center: Slide Tabs with Minimal Left / Right Arrows */}
            <nav
              aria-label="Report slides navigation"
              className="flex items-center gap-1 overflow-x-auto py-0.5"
            >
              {/* Previous Slide Arrow Button */}
              <button
                type="button"
                id="deck-prev-btn"
                onClick={goToPrev}
                disabled={isFirstSlide}
                className="p-1 rounded-full transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-gray-200/70 shrink-0"
                style={{ color: "var(--navy)" }}
                aria-label="Previous slide"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Slide Tabs */}
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-full border shrink-0"
                style={{ borderColor: "#E2E8F0", background: "rgba(238, 242, 245, 0.6)" }}
              >
                {REPORT_SLIDES.map((slide, idx) => {
                  const isActive = activeSlide === idx;
                  return (
                    <button
                      key={slide.id}
                      id={`deck-tab-${slide.id}`}
                      type="button"
                      onClick={() => goToSlide(idx)}
                      className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200"
                      style={{
                        background: isActive ? "var(--navy)" : "transparent",
                        color: isActive ? "#FFFFFF" : "var(--slate)",
                        boxShadow: isActive ? "0 1px 3px rgba(36, 55, 70, 0.2)" : "none",
                      }}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {slide.label}
                    </button>
                  );
                })}
              </div>

              {/* Next Slide Arrow Button */}
              <button
                type="button"
                id="deck-next-btn"
                onClick={goToNext}
                disabled={isLastSlide}
                className="p-1 rounded-full transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-gray-200/70 shrink-0"
                style={{ color: "var(--navy)" }}
                aria-label="Next slide"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4L10 8L6 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </nav>

            {/* Right: Slide Counter & Exit Button */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Keyboard navigation hint */}
              <span className="hidden xl:inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border text-gray-400 border-gray-200 bg-white/60">
                <kbd className="font-mono">←</kbd>
                <kbd className="font-mono">→</kbd>
              </span>

              {/* Slide Counter */}
              <div
                id="deck-slide-counter"
                className="px-2 py-0.5 rounded text-[11px] font-mono font-bold tracking-wider border"
                style={{
                  background: "var(--surface)",
                  borderColor: "#E2E8F0",
                  color: "var(--navy)",
                }}
              >
                <span>0{activeSlide + 1}</span>
                <span className="text-gray-300 mx-0.5">/</span>
                <span className="text-gray-400">0{REPORT_SLIDES.length}</span>
              </div>

              {/* Return to Hero / Change Trend button */}
              <button
                type="button"
                id="deck-change-trend-btn"
                onClick={onExit}
                className="px-2 py-1 rounded-lg text-xs font-semibold border transition-all hover:bg-white flex items-center gap-1"
                style={{
                  color: "var(--slate)",
                  borderColor: "#E2E8F0",
                  background: "var(--secondary)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Change Trend</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Slide Viewport (Animated Deck Stage) ───────────────────────── */}
      <main ref={stageRef} className="deck-stage flex-1 flex flex-col justify-start sm:justify-center py-1 sm:py-2 overflow-y-auto overflow-x-hidden relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="w-full flex-1 flex flex-col justify-center"
          >
            {renderSlideContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom Deck Controls & Progress Indicator ───────────────────────── */}
      <footer
        className="shrink-0 w-full border-t py-2 px-4 sm:px-8 transition-colors z-30"
        style={{
          background: "rgba(247, 246, 242, 0.96)",
          borderColor: "#E2E8F0",
        }}
      >
        <div className="section-wide">
          <div className="flex items-center justify-between gap-4">
            {/* Previous slide trigger */}
            <div className="w-1/3 text-left">
              {!isFirstSlide ? (
                <button
                  type="button"
                  onClick={goToPrev}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all hover:bg-white group"
                  style={{ color: "var(--navy)", borderColor: "#E2E8F0" }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover:-translate-x-0.5">
                    <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="hidden sm:inline text-gray-400 font-normal">Previous:</span>
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">
                    {REPORT_SLIDES[activeSlide - 1]?.label}
                  </span>
                </button>
              ) : (
                <span className="text-xs text-gray-400 italic pl-1 hidden sm:inline">
                  Slide 01 · Overview
                </span>
              )}
            </div>

            {/* Discrete progress dots */}
            <div className="flex items-center justify-center gap-1.5">
              {REPORT_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToSlide(idx)}
                  className="h-1.5 rounded-full transition-all duration-300 cursor-pointer"
                  style={{
                    width: activeSlide === idx ? 24 : 6,
                    background: activeSlide === idx ? "var(--accent-blue)" : "var(--soft-blue)",
                  }}
                  aria-label={`Go to slide ${idx + 1}: ${s.label}`}
                />
              ))}
            </div>

            {/* Next slide trigger */}
            <div className="w-1/3 text-right">
              {!isLastSlide ? (
                <button
                  type="button"
                  onClick={goToNext}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all hover:bg-white group ml-auto"
                  style={{ color: "var(--navy)", borderColor: "#E2E8F0" }}
                >
                  <span className="hidden sm:inline text-gray-400 font-normal">Next:</span>
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">
                    {REPORT_SLIDES[activeSlide + 1]?.label}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-hover:translate-x-0.5">
                    <path d="M6 4L10 8L6 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onExit}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all hover:bg-white ml-auto"
                  style={{ color: "var(--accent-blue)", borderColor: "var(--soft-blue)" }}
                >
                  <span>Complete · Return to Trends</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
