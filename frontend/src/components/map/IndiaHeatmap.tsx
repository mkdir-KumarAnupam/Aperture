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
    NAME_1?: string;
    name?: string;
    [key: string]: unknown;
  };
}

// State name normalizer — GeoJSON uses NAME_1 property
const STATE_NAME_ALIASES: Record<string, string> = {
  Orissa: "Odisha",
  Uttaranchal: "Uttarakhand",
};

function getStateName(geo: GeoFeature): string {
  const mapName = geo.properties?.NAME_1 ?? geo.properties?.name ?? "";
  return STATE_NAME_ALIASES[mapName] ?? mapName;
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
      const data = regionalLookup[stateName];
      positionTooltip(e.clientX, e.clientY);
      if (data && hoveredStateRef.current !== stateName) {
        hoveredStateRef.current = stateName;
        setTooltip({
          state: stateName,
          score: data.score,
          mentions: data.mentions,
          growth: data.growth,
          sentiment: data.sentiment,
        });
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
              <span className="prototype-badge">State-level · Simulated</span>
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
                scale: 1040,
                center: [82.5, 22.5],
              }}
              width={760}
              height={580}
              style={{ width: "100%", height: "100%", maxHeight: 520 }}
            >
              <Geographies geography={geoData}>
                {({ geographies }: { geographies: GeoFeature[] }) =>
                  geographies.map((geo) => {
                    const stateName = getStateName(geo);
                    const data = regionalLookup[stateName];
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
                            strokeWidth: 0.8,
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

          <p className="text-xs pt-2.5 border-t text-gray-400 mt-1" style={{ borderColor: "#EEF2F5" }}>
            Normalized regional concentration calculated across geographic user signals
          </p>
        </div>

        {/* State rankings panel — spans 1 col */}
        <div className="lg:col-span-1 card flex flex-col justify-between h-full">
          <div>
            <h3 className="text-sm font-bold mb-1" style={{ color: "var(--navy)" }}>
              Top States
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
              Highest activity and regional momentum
            </p>
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 flex-1 my-1" style={{ maxHeight: "clamp(420px, 56vh, 520px)" }}>
            {Object.entries(trend.regional)
              .sort(([, a], [, b]) => b.score - a.score)
              .slice(0, 10)
              .map(([state, data], i) => (
                <div
                  key={state}
                  className="flex items-center gap-2.5 p-2 rounded-lg border"
                  style={{ borderColor: "#E2E8F0", background: "var(--bg)" }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{
                      background: i < 3 ? "var(--navy)" : "var(--secondary)",
                      color: i < 3 ? "white" : "var(--slate)",
                    }}
                  >
                    {i + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: "var(--navy)" }}>
                      {state}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--slate)" }}>
                      {data.mentions} mentions
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-black" style={{ color: "var(--navy)" }}>
                      {data.score}
                    </p>
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: "var(--accent-green)" }}
                    >
                      {data.growth}
                    </p>
                  </div>

                  {/* Sentiment dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sentimentColor(data.sentiment) }}
                    title={data.sentiment}
                  />
                </div>
              ))}
          </div>

          <p className="text-xs pt-3 border-t text-gray-400" style={{ borderColor: "#EEF2F5" }}>
            State-level relevance scores (0–100). District breakdown is future scope.
          </p>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="map-tooltip"
          ref={tooltipRef}
          style={{ left: 0, top: 0 }}
        >
          <p className="font-bold text-sm mb-2">{tooltip.state}</p>
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
        </div>
      )}
    </FadeInSection>
  );
}
