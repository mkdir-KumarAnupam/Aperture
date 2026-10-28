"use client";

import { useState, useMemo, useEffect, useId, useRef } from "react";
import { Narrative, Platform, NarrativeSentiment } from "@/lib/types";
import { fmt } from "@/lib/data";
import { PlatformIcon } from "./PlatformIcon";

interface NarrativeLandscapeProps {
  narratives?: Narrative[];
  topicName?: string;
  topicId?: string;
  onSelectNarrative?: (narrative: Narrative) => void;
}

type SortOption = "most-active" | "least-active" | "highest-growth" | "most-recent";

/**
 * Generates smooth SVG cubic Bezier curve commands for sparkline
 */
function generateSmoothCurve(data: number[], width = 100, height = 26, padding = 2) {
  if (!data || data.length < 2) return { line: "", area: "" };

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return { x, y };
  });

  let line = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cp1x = curr.x + (next.x - curr.x) / 2;
    const cp1y = curr.y;
    const cp2x = curr.x + (next.x - curr.x) / 2;
    const cp2y = next.y;
    line += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
  }

  const area = `${line} L ${width.toFixed(1)},${height} L 0,${height} Z`;
  return { line, area };
}

/**
 * Compact blue activity sparkline with subtle gradient fill
 */
function ActivitySparkline({
  series,
  width = 100,
  height = 26,
}: {
  series?: number[];
  width?: number;
  height?: number;
}) {
  const gradientId = useId();

  if (!series || series.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs text-gray-300 font-mono tracking-widest select-none"
        style={{ width, height }}
        title="Activity time-series data unavailable"
      >
        —
      </div>
    );
  }

  const { line, area } = generateSmoothCurve(series, width, height, 3);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-label="Narrative activity sparkline over time"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
          <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#1a73e8"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Restrained sentiment pill badge matching design requirements
 */
function SentimentBadge({ sentiment }: { sentiment?: NarrativeSentiment }) {
  if (!sentiment) {
    return (
      <span className="text-xs text-gray-300 font-medium select-none" title="Sentiment unavailable">
        —
      </span>
    );
  }

  switch (sentiment) {
    case "Positive":
      return (
        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#E6F7ED] text-[#027A48]">
          Positive
        </span>
      );
    case "Negative":
      return (
        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#FEE4E2] text-[#D92D20]">
          Negative
        </span>
      );
    case "Uncertain":
      return (
        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#F2F4F7] text-[#344054]">
          Uncertain
        </span>
      );
    case "Neutral":
    default:
      return (
        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-[#F2F4F7] text-[#475569]">
          Neutral
        </span>
      );
  }
}

export function NarrativeLandscape({
  narratives = [],
  topicName = "this trend",
  onSelectNarrative,
}: NarrativeLandscapeProps) {
  // State for search, filter and sort
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("most-active");

  // Selected narrative for detail drawer
  const [selectedNarrative, setSelectedNarrative] = useState<Narrative | null>(null);

  // Filter menu dropdown popover state
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    }
    if (isFilterMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterMenuOpen]);

  // Close drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNarrative(null);
        setIsFilterMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter and sort the narratives
  const filteredAndSortedNarratives = useMemo(() => {
    if (!narratives || !Array.isArray(narratives)) return [];

    let result = [...narratives];

    // 1. Text search (matches title and description)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.description?.toLowerCase().includes(q)
      );
    }

    // 2. Platform filter
    if (platformFilter !== "all") {
      result = result.filter((n) => {
        if (!n.platforms || n.platforms.length === 0) return true;
        return n.platforms.some(
          (p) =>
            p.platform.toLowerCase() === platformFilter.toLowerCase() &&
            p.count > 0
        );
      });
    }

    // 3. Sentiment filter
    if (sentimentFilter !== "all") {
      result = result.filter(
        (n) => n.sentiment?.toLowerCase() === sentimentFilter.toLowerCase()
      );
    }

    // 4. Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "least-active":
          return (a.assignedPostsCount ?? 0) - (b.assignedPostsCount ?? 0);
        case "highest-growth":
          return (b.growth ?? 0) - (a.growth ?? 0);
        case "most-recent": {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return timeB - timeA;
        }
        case "most-active":
        default:
          return (b.assignedPostsCount ?? 0) - (a.assignedPostsCount ?? 0);
      }
    });

    return result;
  }, [narratives, searchQuery, platformFilter, sentimentFilter, sortBy]);

  const handleRowClick = (narrative: Narrative) => {
    setSelectedNarrative(narrative);
    if (onSelectNarrative) {
      onSelectNarrative(narrative);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setPlatformFilter("all");
    setSentimentFilter("all");
    setSortBy("most-active");
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    platformFilter !== "all" ||
    sentimentFilter !== "all" ||
    sortBy !== "most-active"
  );

  return (
    <div className="w-full">
      {/* Outer Card Container */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-6 lg:p-7 transition-all duration-300 w-full overflow-hidden">
        {/* Header Bar matching Reference: Title (Left) | Search Input (Center) | Filter Button (Right) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Left: Heading */}
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Narrative Landscape
            </h2>
            <div className="relative group inline-flex items-center">
              <button
                type="button"
                aria-label="Information about Narrative Landscape"
                className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
              <div className="hidden group-hover:block absolute left-0 top-7 w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-xl z-30 pointer-events-none">
                <p className="font-semibold mb-1 text-gray-200">
                  Individual Interpretations
                </p>
                <p className="text-gray-300 leading-relaxed">
                  Identified narrative storylines and claims detected across collected posts, ranked by activity volume.
                </p>
              </div>
            </div>
          </div>

          {/* Center: Search Input */}
          <div className="relative flex-1 max-w-full sm:max-w-xs md:max-w-sm sm:mx-3">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              id="narrative-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search narratives"
              className="w-full pl-8 sm:pl-9 pr-7 py-1.5 sm:py-2 bg-gray-50/80 hover:bg-white focus:bg-white border border-gray-200/90 rounded-xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              aria-label="Search narratives"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="Clear search"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Right: Filter Menu Button & Popover */}
          <div className="relative shrink-0 self-end sm:self-auto" ref={filterMenuRef}>
            <button
              id="narrative-filter-menu-btn"
              type="button"
              onClick={() => setIsFilterMenuOpen((prev) => !prev)}
              className={`relative p-2 sm:p-2.5 rounded-xl border transition-all duration-200 flex items-center justify-center cursor-pointer ${
                isFilterMenuOpen || hasActiveFilters
                  ? "bg-blue-50 text-blue-600 border-blue-200 shadow-xs ring-2 ring-blue-100"
                  : "bg-white text-gray-600 border-gray-200/90 hover:bg-gray-50 hover:text-gray-900 shadow-2xs"
              }`}
              aria-label="Filter narratives"
              aria-expanded={isFilterMenuOpen}
              title="Filter options"
            >
              <svg
                className="w-4 h-4 sm:w-4.5 sm:h-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
              )}
            </button>

            {/* Filter Dropdown Popover */}
            {isFilterMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200/90 p-4 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 mb-3">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Filter Options
                    </span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                    >
                      Reset all
                    </button>
                  )}
                </div>

                <div className="space-y-3.5">
                  {/* Platform Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Platform
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["all", "X", "Reddit", "Telegram"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPlatformFilter(p)}
                          className={`text-xs py-1.5 px-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            platformFilter === p
                              ? "bg-blue-50 text-blue-700 border-blue-200 font-bold shadow-2xs"
                              : "bg-gray-50/70 text-gray-600 border-gray-200/70 hover:bg-gray-100 hover:text-gray-900 font-medium"
                          }`}
                        >
                          {p === "all" ? "All Platforms" : p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sentiment Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Sentiment
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["all", "Positive", "Negative", "Uncertain"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSentimentFilter(s)}
                          className={`text-xs py-1.5 px-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                            sentimentFilter === s
                              ? "bg-blue-50 text-blue-700 border-blue-200 font-bold shadow-2xs"
                              : "bg-gray-50/70 text-gray-600 border-gray-200/70 hover:bg-gray-100 hover:text-gray-900 font-medium"
                          }`}
                        >
                          {s === "all" ? "All Sentiment" : s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort Filter */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Sort By
                    </label>
                    <div className="relative">
                      <select
                        id="narrative-sort-filter"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="w-full appearance-none bg-gray-50/80 border border-gray-200 rounded-lg px-2.5 py-1.5 pr-7 text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                        aria-label="Sort narratives"
                      >
                        <option value="most-active">Most Active</option>
                        <option value="least-active">Least Active</option>
                        <option value="highest-growth">Highest Growth</option>
                        <option value="most-recent">Most Recent</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-400">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Filters Pill Bar (when filters applied) */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap text-xs">
            <span className="text-gray-400 font-medium text-[11px]">Filtered:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                &ldquo;{searchQuery}&rdquo;
                <button type="button" onClick={() => setSearchQuery("")} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {platformFilter !== "all" && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                {platformFilter}
                <button type="button" onClick={() => setPlatformFilter("all")} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {sentimentFilter !== "all" && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                {sentimentFilter}
                <button type="button" onClick={() => setSentimentFilter("all")} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            {sortBy !== "most-active" && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                {sortBy.replace("-", " ")}
                <button type="button" onClick={() => setSortBy("most-active")} className="hover:text-blue-900 cursor-pointer">×</button>
              </span>
            )}
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-gray-400 hover:text-gray-600 underline ml-auto text-[11px] cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        {/* Unified Ranked List Container - NO HORIZONTAL SCROLLBAR */}
        <div className="rounded-xl overflow-hidden border border-gray-100 bg-white w-full">
          {filteredAndSortedNarratives.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                No narratives match your criteria
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
                Try clearing search or adjusting the platform and sentiment filters.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100/90 w-full">
              {filteredAndSortedNarratives.map((narrative, index) => {
                const rankNumber = index + 1;
                const formattedPosts =
                  narrative.assignedPostsCount !== undefined
                    ? `${fmt(narrative.assignedPostsCount)} posts`
                    : "—";

                return (
                  <div
                    key={narrative.id || `nar-${index}`}
                    id={`narrative-row-${narrative.id || index}`}
                    data-narrative-id={narrative.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(narrative)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(narrative);
                      }
                    }}
                    className="group flex items-center gap-2 sm:gap-3 py-2.5 px-2.5 sm:px-3.5 hover:bg-slate-50/80 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset w-full"
                    aria-label={`Narrative rank ${rankNumber}: ${narrative.title}. ${formattedPosts}. Sentiment: ${narrative.sentiment || "unspecified"}. Click to view details.`}
                  >
                    {/* 1. Rank Number */}
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#EEF4FF] text-[#1a73e8] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100/60 shadow-2xs">
                      {rankNumber}
                    </div>

                    {/* 2. Compact Narrative Title */}
                    <div className="flex-1 min-w-0 pr-1">
                      <span
                        className="text-xs sm:text-[13.5px] font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate block leading-snug"
                        title={narrative.title}
                      >
                        {narrative.title}
                      </span>
                    </div>

                    {/* 3. Assigned-Post Count */}
                    <div className="text-right font-medium text-gray-500 text-xs sm:text-[13px] tabular-nums shrink-0 whitespace-nowrap">
                      {formattedPosts}
                    </div>

                    {/* 4. Activity Sparkline */}
                    <div className="w-16 sm:w-20 md:w-24 flex items-center justify-center shrink-0">
                      <ActivitySparkline series={narrative.activitySeries} width={80} height={20} />
                    </div>

                    {/* 5. Sentiment Badge */}
                    <div className="shrink-0">
                      <SentimentBadge sentiment={narrative.sentiment} />
                    </div>

                    {/* 6. Chevron Action */}
                    <div className="w-4 flex items-center justify-end text-gray-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Narrative Detail / Assigned-Post Slide-over Modal */}
      {selectedNarrative && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="narrative-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setSelectedNarrative(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4 bg-gray-50/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    Narrative Detail
                  </span>
                  <SentimentBadge sentiment={selectedNarrative.sentiment} />
                  {selectedNarrative.growth !== undefined && (
                    <span className="text-xs font-bold text-blue-600 bg-blue-50/60 px-2 py-0.5 rounded-md">
                      +{selectedNarrative.growth}% growth
                    </span>
                  )}
                </div>
                <h3
                  id="narrative-modal-title"
                  className="text-lg sm:text-xl font-bold text-gray-900 leading-snug"
                >
                  {selectedNarrative.title}
                </h3>
                {selectedNarrative.description && (
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    {selectedNarrative.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNarrative(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-full transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal Body / Assigned Posts & Metrics */}
            <div className="p-6 overflow-y-auto scroll space-y-5">
              {/* Metrics Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/70 p-4 rounded-xl border border-gray-100">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Assigned Posts
                  </p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {selectedNarrative.assignedPostsCount
                      ? fmt(selectedNarrative.assignedPostsCount)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Trend Context
                  </p>
                  <p className="text-sm font-semibold text-gray-700 mt-1 truncate">
                    {topicName}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Activity
                  </p>
                  <div className="mt-1">
                    <ActivitySparkline series={selectedNarrative.activitySeries} width={100} height={26} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Platform Spread
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {selectedNarrative.platforms?.map((p) => (
                      <span
                        key={p.platform}
                        className="text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-1.5 py-0.5 rounded"
                      >
                        {p.platform}: {fmt(p.count)}
                      </span>
                    )) || <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
              </div>

              {/* Assigned Evidence Posts */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    Representative Assigned Posts
                  </h4>
                  <span className="text-[11px] text-gray-400 font-medium">
                    Simulated assignments · Live classifier integration pending
                  </span>
                </div>

                {selectedNarrative.posts && selectedNarrative.posts.length > 0 ? (
                  <div className="space-y-3">
                    {selectedNarrative.posts.map((post) => (
                      <div
                        key={post.id}
                        className="p-4 rounded-xl border border-gray-100 bg-white hover:border-blue-100 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <PlatformIcon
                              platform={post.platform}
                              size="sm"
                              shape="circle"
                            />
                            <span className="text-xs font-bold text-gray-900">
                              {post.author}
                            </span>
                            <span className="text-[11px] text-gray-400 font-medium">
                              · {post.timestamp}
                            </span>
                          </div>
                          {post.likes && (
                            <span className="text-xs font-medium text-gray-500">
                              ❤️ {post.likes}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed font-medium">
                          &ldquo;{post.text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-sm text-gray-500">
                      No individual post samples assigned to this narrative yet.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNarrative(null)}
                className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default NarrativeLandscape;
