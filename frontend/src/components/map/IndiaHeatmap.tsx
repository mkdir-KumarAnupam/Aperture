"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import { GlobalTimeframe, TrendAnalytics } from "@/data/types";
import { getTimeframeRegional } from "@/data/timeframeAdapters";
import { InfluenceTrendCard } from "@/components/analytics/InfluenceNetwork";

const GEO_URL = "/india-states-simplified.json";
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

const STATE_NAME_ALIASES: Record<string, string> = {
  Orissa: "Odisha",
  Uttaranchal: "Uttarakhand",
  "Andaman and Nicobar Islands": "Andaman and Nicobar",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli",
};

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
}

export default function IndiaHeatmap({
  trend,
  timeframe = "30D",
}: {
  trend: TrendAnalytics;
  timeframe?: GlobalTimeframe;
}) {
  const [geoData, setGeoData] = useState<string | Record<string, unknown>>(
    cachedGeoData || GEO_URL
  );
  const [zoomScale, setZoomScale] = useState(1);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const hoveredStateRef = useRef<string | null>(null);

  const regionalLookup = useMemo(
    () => getTimeframeRegional(trend.regional, timeframe),
    [trend.regional, timeframe]
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

  const positionTooltip = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y };
    tooltipRef.current?.style.setProperty(
      "transform",
      `translate3d(${x + 14}px, ${y - 10}px, 0)`
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
          });
        } else {
          setTooltip({
            state: stateName,
            score: 0,
            mentions: "No observations",
            growth: "N/A",
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

  const handleZoomIn = () => setZoomScale((z) => Math.min(z * 1.25, 2.5));
  const handleZoomOut = () => setZoomScale((z) => Math.max(z * 0.8, 0.75));

  return (
    <section
      id="section-regional"
      className="w-full border-b border-slate-200/80 px-6 sm:px-10 lg:px-12 py-6 flex flex-col justify-center"
      style={{ minHeight: "70vh" }}
    >
      <div
        className="grid grid-cols-1 lg:grid-cols-2 items-stretch h-full"
        style={{ minHeight: "68vh" }}
      >
        {/* ── 50% Left: India Map with Vertical Legend ────────────────────── */}
        <div className="pr-0 lg:pr-8 pb-8 lg:pb-0 flex flex-col justify-between h-full relative border-b lg:border-b-0 lg:border-r border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
              Regional Intelligence
            </h2>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold text-slate-400">
                Survey of India Boundary · {timeframe}
              </span>
              <div className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs">
                <span>India</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Map canvas container */}
          <div className="relative flex-1 w-full my-auto flex items-center justify-center overflow-hidden min-h-[460px]">
            {/* ── Vertical Legend placed on Left / Y-Axis (Exact Reference Layout) ── */}
            <div className="map-vertical-legend">
              <div className="text-[10px] font-bold text-slate-500 uppercase leading-tight">
                <span>Relevance</span>
                <br />
                <span>Score</span>
              </div>
              <span className="text-[10px] font-bold text-slate-700 mt-1">High</span>
              <div className="map-vertical-bar" />
              <span className="text-[10px] font-bold text-slate-500">Low</span>
            </div>

            {/* ── Zoom Controls (Bottom Right of Map) ──────────────────────── */}
            <div className="map-zoom-control">
              <button
                type="button"
                onClick={handleZoomIn}
                className="map-zoom-btn"
                title="Zoom In"
                aria-label="Zoom in map"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="map-zoom-btn"
                title="Zoom Out"
                aria-label="Zoom out map"
              >
                −
              </button>
            </div>

            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                scale: 960 * zoomScale,
                center: [82.5, 22.5],
              }}
              width={760}
              height={580}
              style={{ width: "100%", height: "100%", maxHeight: "62vh" }}
            >
              <Geographies geography={geoData}>
                {({ geographies }: { geographies: GeoFeature[] }) =>
                  geographies.map((geo) => {
                    const stateName = getStateName(geo);
                    const data = getRegionalItem(regionalLookup, stateName);
                    const score = data?.score ?? 0;
                    const fillColor = getScoreColor(score);

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseMove={(e) => handleMouseMove(geo, e)}
                        onMouseLeave={handleMouseLeave}
                        style={{
                          default: {
                            fill: fillColor,
                            stroke: "#FFFFFF",
                            strokeWidth: 0.65,
                            outline: "none",
                            transition: "all 0.15s ease",
                          },
                          hover: {
                            fill: "#2563EB",
                            stroke: "#FFFFFF",
                            strokeWidth: 1.2,
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: {
                            fill: "#1D4ED8",
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
        </div>

        {/* ── 50% Right: Influence Trend ───────────────────────────────── */}
        <div className="pl-0 lg:pl-8 pt-8 lg:pt-0 flex flex-col justify-between h-full relative">
          <InfluenceTrendCard trend={trend} timeframe={timeframe} />
        </div>
      </div>

      {/* ── Hover Tooltip (Dark Navy Card Treatment matching reference) ──── */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed pointer-events-none z-50 bg-[#0F172A] text-white p-3 rounded-xl shadow-2xl border border-slate-700/60 min-w-[170px]"
          style={{ left: 0, top: 0, willChange: "transform" }}
        >
          <p className="font-bold text-sm text-white mb-2 pb-1 border-b border-slate-700">
            {tooltip.state}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-400">Relevance Score</span>
              <span className="font-bold text-white tabular-nums">{tooltip.score}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-400">Mentions</span>
              <span className="font-bold text-white tabular-nums">{tooltip.mentions}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-400">Change</span>
              <span className="font-bold text-emerald-400 tabular-nums">{tooltip.growth}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
