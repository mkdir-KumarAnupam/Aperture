"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import { TrendAnalytics } from "@/data/types";
import { SectionHeader, FadeInSection, sentimentColor } from "@/components/ui/SectionHeader";

// Local public asset — Optimized simplified GeoJSON (287 KB vs 13.6 MB)
// Provides 35 states with intact NAME_1 properties, sub-millisecond rendering
const GEO_URL = "/india-states-simplified.json";

// In-memory module cache so slide re-visits take 0ms
let cachedGeoData: string | Record<string, unknown> | null = null;

interface GeoFeature {
  rsmKey?: string;
  properties?: {
    st_nm?: string;
    ST_NM?: string;
    NAME_1?: string;
    name?: string;
    [key: string]: unknown;
  };
}

// State name normalizer — supports official Survey of India names and aliases
const STATE_NAME_ALIASES: Record<string, string> = {
  Orissa: "Odisha",
  Uttaranchal: "Uttarakhand",
  "Andaman and Nicobar Islands": "Andaman and Nicobar",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

// Complete official list of 36 Indian States and Union Territories (Survey of India standard)
const ALL_INDIA_STATES_AND_UTS = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

function getStateName(geo: GeoFeature): string {
  const mapName =
    geo.properties?.st_nm ??
    geo.properties?.ST_NM ??
    geo.properties?.NAME_1 ??
    geo.properties?.name ??
    "";
  return STATE_NAME_ALIASES[mapName] ?? mapName;
}

function getRegionalItem(
  regional: TrendAnalytics["regional"],
  stateName: string
) {
  if (regional[stateName]) return regional[stateName];
  const alias = STATE_NAME_ALIASES[stateName];
  if (alias && regional[alias]) return regional[alias];
  for (const [key, val] of Object.entries(STATE_NAME_ALIASES)) {
    if (val === stateName && regional[key]) return regional[key];
  }
  return null;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#243746";
  if (score >= 65) return "#2E5470";
  if (score >= 50) return "#4A7FA5";
  if (score >= 35) return "#7AABC8";
  if (score >= 20) return "#A8CCE0";
  if (score >= 10) return "#C8DFE8";
  return "#E8F2F8";
}

interface TooltipData {
  state: string;
  score: number;
  mentions: string;
  growth: string;
  sentiment: "positive" | "neutral" | "negative";
}

interface IndiaHeatmapProps {
  trend: TrendAnalytics;
}

export default function IndiaHeatmap({ trend }: IndiaHeatmapProps) {
  const [geoData, setGeoData] = useState<string | Record<string, unknown>>(
    cachedGeoData || GEO_URL
  );

  useEffect(() => {
    if (!cachedGeoData && typeof window !== "undefined") {
      fetch(GEO_URL)
        .then((res) => res.json())
        .then((data) => {
          cachedGeoData = data;
          setGeoData(data);
        })
        .catch(() => {
          setGeoData(GEO_URL);
        });
    }
  }, []);

  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const hoveredStateRef = useRef<string | null>(null);
  const regionalLookup = useMemo(() => trend.regional, [trend.regional]);

  // Right sidebar: search, pagination, and selection
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  // Reset pagination and query on trend switch
  useEffect(() => {
    setSearchQuery("");
    setCurrentPage(1);
    setSelectedState(null);
  }, [trend.id]);

  // Comprehensive 36 States & UTs with scores derived from trend.regional
  const allStatesList = useMemo(() => {
    return ALL_INDIA_STATES_AND_UTS.map((stateName) => {
      const data = getRegionalItem(trend.regional, stateName);
      return {
        name: stateName,
        score: data?.score ?? 0,
        mentions: data?.mentions ?? "No observations",
        growth: data?.growth ?? "N/A",
        sentiment: data?.sentiment ?? "neutral",
      };
    })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));
  }, [trend.regional]);

  const filteredStates = useMemo(() => {
    if (!searchQuery.trim()) return allStatesList;
    const q = searchQuery.toLowerCase().trim();
    return allStatesList.filter((s) => s.name.toLowerCase().includes(q));
  }, [allStatesList, searchQuery]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredStates.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedStates = filteredStates.slice(startIndex, startIndex + PAGE_SIZE);

  // Active highlighted state is null by default; only set when user manually selects a state
  const activeStateName = selectedState;

  const positionTooltip = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y };
    tooltipRef.current?.style.setProperty(
      "transform",
      `translate3d(${x + 12}px, ${y - 10}px, 0)`
    );
  }, []);

  useEffect(() => {
    if (tooltip) positionTooltip(pointerRef.current.x, pointerRef.current.y);
  }, [tooltip, positionTooltip]);

  const handleMouseMove = useCallback(
    (geo: GeoFeature, e: React.MouseEvent<Element>) => {
      const stateName = getStateName(geo);
      const data = getRegionalItem(regionalLookup, stateName);
      positionTooltip(e.clientX, e.clientY);
      if (hoveredStateRef.current !== stateName) {
        hoveredStateRef.current = stateName;
        if (data) {
          setTooltip({
            state: stateName,
            score: data.score,
            mentions: data.mentions,
            growth: data.growth,
            sentiment: data.sentiment,
          });
        } else {
          setTooltip({
            state: stateName,
            score: 0,
            mentions: "No observations",
            growth: "N/A",
            sentiment: "neutral",
          });
        }
      }
    },
    [regionalLookup, positionTooltip]
  );

  const handleMouseLeave = useCallback(() => {
    hoveredStateRef.current = null;
    setTooltip(null);
  }, []);

  return (
    <FadeInSection id="section-regional" className="section-wide analytics-content">
      <SectionHeader trendName={trend.name} sectionName="Regional Intelligence" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch" style={{ minHeight: "clamp(560px, 76vh, 660px)" }}>
        {/* Map — spans 2 cols */}
        <div className="lg:col-span-2 card flex flex-col justify-between h-full">
          <div>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--navy)" }}>
                  Regional Intelligence
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>
                  State-level trend relevance across India · Hover state for details
                </p>
              </div>
              <span className="prototype-badge">Official Boundary · Survey of India</span>
            </div>
          </div>

          {/* Choropleth map */}
          <div
            className="flex-1 my-2 flex items-center justify-center rounded-lg overflow-hidden border"
            style={{
              background: "var(--bg)",
              borderColor: "#E2E8F0",
              minHeight: 440,
              height: "100%",
            }}
          >
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                scale: 880,
                center: [82.5, 22],
              }}
              width={760}
              height={580}
              style={{ width: "100%", height: "100%", maxHeight: 520 }}
            >
              <Geographies geography={geoData}>
                {({ geographies }: { geographies: GeoFeature[] }) =>
                  geographies.map((geo) => {
                    const stateName = getStateName(geo);
                    const data = getRegionalItem(regionalLookup, stateName);
                    const score = data?.score ?? 0;
                    const fillColor = getScoreColor(score);
                    const isSelected = activeStateName === stateName;

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() =>
                          setSelectedState((prev) => (prev === stateName ? null : stateName))
                        }
                        onMouseMove={(e) => handleMouseMove(geo, e)}
                        onMouseLeave={handleMouseLeave}
                        style={{
                          default: {
                            fill: fillColor,
                            stroke: isSelected ? "#2563EB" : "#FFFFFF",
                            strokeWidth: isSelected ? 1.5 : 0.6,
                            outline: "none",
                          },
                          hover: {
                            fill: "#C4943A",
                            stroke: "#FFFFFF",
                            strokeWidth: 1.2,
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: {
                            fill: "#C4943A",
                            outline: "none",
                          },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[11px] font-medium" style={{ color: "var(--slate)" }}>Low</span>
            <div
              className="flex-1 h-2 rounded-full"
              style={{
                background: "linear-gradient(90deg, #E8F2F8, #C8DFE8, #A8CCE0, #7AABC8, #4A7FA5, #2E5470, #243746)",
              }}
            />
            <span className="text-[11px] font-medium" style={{ color: "var(--slate)" }}>High</span>
            <span className="text-[11px] text-gray-400 font-semibold ml-2">Relevance Score</span>
          </div>

          <div className="flex items-center justify-between text-xs pt-2.5 border-t text-gray-400 mt-1 flex-wrap gap-2" style={{ borderColor: "#EEF2F5" }}>
            <span>Normalized regional concentration calculated across geographic user signals</span>
            <span className="text-[11px] font-medium text-slate-400 italic">Map source: Survey of India</span>
          </div>
        </div>

        {/* State rankings panel — spans 1 col */}
        <div className="lg:col-span-1 card flex flex-col justify-between h-full">
          {/* Top content: Header, Table Columns & Rows */}
          <div className="flex flex-col flex-1 min-h-0">
            {/* Header: Title and Search Input */}
            <div className="flex items-center justify-between gap-2 mb-3 px-1">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
                States &amp; UTs
              </h2>
              <div className="relative w-48 sm:w-52">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search state or UT..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Table Header: #, State / UT, Relevance Score */}
            <div className="grid grid-cols-[28px_minmax(0,1fr)_130px_32px] sm:grid-cols-[30px_minmax(0,1fr)_150px_34px] items-center gap-2.5 px-3 py-1.5 text-[11px] font-semibold text-slate-400 mb-1">
              <span className="text-center">#</span>
              <span>State / UT</span>
              <span className="col-span-2 text-right pr-0.5">Relevance Score</span>
            </div>

            {/* State List (10 rows evenly distributed) */}
            <div className="flex flex-col justify-between flex-1 py-0.5">
              {paginatedStates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <p className="text-xs">No states or UTs found</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="text-xs text-blue-600 hover:underline mt-1.5 font-medium"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                paginatedStates.map((state) => {
                  const isSelected = activeStateName === state.name;
                  return (
                    <div
                      key={state.name}
                      onClick={() =>
                        setSelectedState((prev) => (prev === state.name ? null : state.name))
                      }
                      className={`grid grid-cols-[28px_minmax(0,1fr)_130px_32px] sm:grid-cols-[30px_minmax(0,1fr)_150px_34px] items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
                        isSelected
                          ? "bg-[#EFF6FF] shadow-xs"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* Rank */}
                      <div className="flex items-center justify-center">
                        {isSelected ? (
                          <span className="w-6 h-6 rounded-full bg-[#2563EB] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                            {state.rank}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-700">
                            {state.rank}
                          </span>
                        )}
                      </div>

                      {/* State name */}
                      <span
                        className={`text-xs sm:text-[13px] truncate transition-colors ${
                          isSelected
                            ? "font-bold text-slate-900"
                            : "font-semibold text-slate-800"
                        }`}
                      >
                        {state.name}
                      </span>

                      {/* Horizontal progress bar */}
                      <div className="h-2 w-full bg-[#E2E8F0] rounded-full overflow-hidden flex items-center">
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(0, state.score))}%`,
                          }}
                        />
                      </div>

                      {/* Score number */}
                      <span
                        className={`text-xs sm:text-[13px] text-right font-bold transition-colors ${
                          isSelected ? "text-slate-900" : "text-slate-700"
                        }`}
                      >
                        {state.score}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer: Pagination (Clean without top border matching screenshot) */}
          <div className="flex items-center justify-end gap-3 pt-3 mt-auto px-2">
            <span className="text-xs text-slate-500 font-medium">
              {filteredStates.length === 0
                ? "0 of 0"
                : `${startIndex + 1}–${Math.min(startIndex + PAGE_SIZE, filteredStates.length)} of ${filteredStates.length}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="map-tooltip"
          ref={tooltipRef}
          style={{ left: 0, top: 0 }}
        >
          <p className="font-bold text-sm mb-1.5">{tooltip.state}</p>
          {tooltip.mentions === "No observations" ? (
            <p className="text-xs text-slate-300 italic">No activity observations in current trend dataset</p>
          ) : (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-4">
                <span style={{ color: "#9BA8B2" }}>Relevance</span>
                <span className="font-semibold">{tooltip.score}/100</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: "#9BA8B2" }}>Mentions</span>
                <span className="font-semibold">{tooltip.mentions}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: "#9BA8B2" }}>Growth</span>
                <span className="font-semibold" style={{ color: "#5A9E7C" }}>{tooltip.growth}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span style={{ color: "#9BA8B2" }}>Sentiment</span>
                <span
                  className="font-semibold capitalize"
                  style={{ color: sentimentColor(tooltip.sentiment) }}
                >
                  {tooltip.sentiment}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </FadeInSection>
  );
}
