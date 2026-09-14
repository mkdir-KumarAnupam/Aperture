"use client";

import dynamic from "next/dynamic";
import { TrendAnalytics } from "@/data/types";
import { SectionHeader, FadeInSection, PlatformIcon } from "@/components/ui/SectionHeader";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";

// Dynamically import the network graph (WebGL canvas — must be client-side only)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full" style={{ color: "var(--slate)", fontSize: 12 }}>
      Loading network…
    </div>
  ),
});

const COMMUNITY_COLORS: Record<string, string> = {
  "Tech Creators": "#4A7FA5",
  "Photography": "#5A9E7C",
  "AI Community": "#7B68A4",
  "AI Researchers": "#7B68A4",
  "Fintech": "#C4943A",
  "Official": "#243746",
  "Policy": "#52616B",
  "Business": "#8B4513",
  "Fan Groups": "#C4614A",
  "Sports Media": "#2B6CB0",
  "Stats": "#5A9E7C",
  "Fantasy": "#C4943A",
  "Global Fans": "#4A7FA5",
  "Mega Creators": "#C4614A",
  "Industry": "#4A7FA5",
  "Creator Tools": "#7B68A4",
  "Regional": "#5A9E7C",
  "Creators": "#C4943A",
  "Trends": "#C4614A",
  "EV Community": "#5A9E7C",
  "Infrastructure": "#52616B",
  "Finance": "#C4943A",
  "Media": "#2B6CB0",
  "Brands": "#C4614A",
  "Tech Hubs": "#4A7FA5",
  "Startups": "#C4943A",
  "Developers": "#52616B",
  "General": "#9BA8B2",
};

const TIER_COLORS = {
  high: "#5A9E7C",
  medium: "#C4943A",
  low: "#52616B",
};

const PLATFORM_DISPLAY: Record<string, string> = {
  x: "X",
  reddit: "Reddit",
  telegram: "Telegram",
};

const GRAPH_HEIGHT = 480;

interface ForceGraphNode {
  id: string;
  label: string;
  platform: string;
  community: string;
  influence: number;
  val: number;
  color: string;
  x?: number;
  y?: number;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  value?: number;
}

interface InfluenceNetworkProps {
  trend: TrendAnalytics;
}

export default function InfluenceNetwork({ trend }: InfluenceNetworkProps) {
  const hoveredNodeRef = useRef<string | null>(null);
  const [, forceRender] = useState(0);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const configuredTrendRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(700);

  const { nodes, edges, topInfluencers } = trend.influence;

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  // Build graph data for react-force-graph-2d
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      platform: n.platform,
      community: n.community,
      influence: n.influence,
      val: Math.pow(n.influence / 40, 2), // node size based on influence
      color: COMMUNITY_COLORS[n.community] ?? "#52616B",
    })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.strength,
    })),
  }), [nodes, edges]);

  // Set forces when the client-only graph engine starts, after its ref exists.
  const configureForces = useCallback(() => {
    const graph = fgRef.current;
    if (!graph) return;

    graph.d3Force("charge")?.strength(-260);
    graph.d3Force("link")?.distance(140).strength(0.65);
    graph.d3Force("collide")?.radius((node: ForceGraphNode) => Math.sqrt(node.val ?? 1) * 10 + 24);
    graph.d3Force("x")?.x((node: ForceGraphNode) => (
      node.platform === "reddit" ? -350 : node.platform === "telegram" ? 350 : 0
    )).strength(0.08);
    graph.d3Force("y")?.strength(0.025);
    graph.d3ReheatSimulation();
  }, []);

  const handleEngineTick = useCallback(() => {
    if (configuredTrendRef.current === trend.id) return;
    configuredTrendRef.current = trend.id;
    configureForces();
  }, [configureForces, trend.id]);

  const handleEngineStop = useCallback(() => {
    const graph = fgRef.current;
    if (!graph) return;

    graph.zoomToFit(400, 36);
  }, []);

  const nodeCanvasObject = useCallback(
    (nodeObject: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObject as ForceGraphNode;
      const size = Math.sqrt(node.val) * 8 + 4;
      const isHovered = hoveredNodeRef.current === node.id;
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;

      // Draw circle
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + (isHovered ? "FF" : "CC");
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label (only for influential nodes or on hover)
      if (node.influence >= 76 || (globalScale > 1.15 && node.influence >= 60) || isHovered) {
        const label = node.label;
        ctx.font = `${isHovered ? "bold " : ""}${Math.max(8, 10 / globalScale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(36, 55, 70, 0.85)";
        ctx.fillText(label, nx, ny + size + 10 / globalScale);
      }
    },
    []
  );

  const handleNodeHover = useCallback((nodeObject: object | null) => {
    const node = nodeObject as ForceGraphNode | null;
    hoveredNodeRef.current = node ? node.id : null;
    forceRender((n) => n + 1);
  }, []);

  return (
    <FadeInSection
      id="section-influence"
      className="section-wide analytics-content"
    >
      <SectionHeader trendName={trend.name} sectionName="Influence Network" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch" style={{ minHeight: "clamp(560px, 76vh, 660px)" }}>
        {/* Graph — spans 2 cols */}
        <div className="lg:col-span-2 card flex flex-col justify-between h-full">
          <div>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--navy)" }}>
                  Influence Network
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>
                  Interactive community cluster and voice propagation network
                </p>
              </div>
              <span className="prototype-badge">Force Directed</span>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative flex-1 w-full rounded-lg overflow-hidden border my-2"
            style={{
              background: "var(--bg)",
              borderColor: "#E2E8F0",
              minHeight: GRAPH_HEIGHT,
              height: GRAPH_HEIGHT,
            }}
          >
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={(nodeObject: object, color: string, ctx: CanvasRenderingContext2D) => {
                const node = nodeObject as ForceGraphNode;
                const size = Math.sqrt(node.val) * 8 + 4;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI);
                ctx.fill();
              }}
              linkColor={() => "#DCE7EF"}
              linkWidth={(linkObject: object) => {
                const link = linkObject as ForceGraphLink;
                return (link.value ?? 0.5) * 2;
              }}
              onNodeHover={handleNodeHover}
              backgroundColor="transparent"
              cooldownTicks={100}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.38}
              width={containerWidth}
              height={GRAPH_HEIGHT}
              onEngineTick={handleEngineTick}
              onEngineStop={handleEngineStop}
            />

            {/* Legend */}
            <div
              className="absolute bottom-2.5 left-2.5 text-[11px] p-2 rounded bg-white/90 border backdrop-blur-xs"
              style={{ color: "var(--slate)", borderColor: "#E2E8F0" }}
            >
              <div className="flex flex-col gap-0.5 font-medium">
                <span className="font-bold" style={{ color: "var(--navy)" }}>Legend</span>
                <span>● Larger = Higher influence</span>
                <span>— Connection = Interaction</span>
                <span>🎨 Color = Community</span>
              </div>
            </div>
          </div>

          <p className="text-xs pt-3 border-t text-gray-400" style={{ borderColor: "#EEF2F5" }}>
            Simulated cross-platform network graph with d3-force physics clustering
          </p>
        </div>

        {/* Top Influencers panel — spans 1 col */}
        <div className="lg:col-span-1 card flex flex-col justify-between h-full">
          <div>
            <h3 className="text-sm font-bold mb-1" style={{ color: "var(--navy)" }}>
              Top Influencers
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>
              Key authoritative voices by platform influence
            </p>
          </div>

          <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 my-1" style={{ maxHeight: "clamp(420px, 56vh, 520px)" }}>
            {topInfluencers.map((inf, i) => (
              <div
                key={inf.id}
                className="flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors"
                style={{ borderColor: "#E2E8F0", background: "var(--bg)" }}
              >
                {/* Rank */}
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                  style={{
                    background: i === 0 ? "#C4943A" : i === 1 ? "#52616B" : i === 2 ? "#B87333" : "var(--secondary)",
                    color: i <= 2 ? "white" : "var(--slate)",
                  }}
                >
                  {i + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: "var(--navy)" }}>
                    {inf.label}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      style={{
                        color:
                          inf.platform === "x"
                            ? "var(--navy)"
                            : inf.platform === "reddit"
                            ? "#8B4513"
                            : "var(--accent-blue)",
                      }}
                    >
                      <PlatformIcon platform={inf.platform} size={10} />
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--slate)" }}>
                      {PLATFORM_DISPLAY[inf.platform]}
                    </span>
                  </div>
                </div>

                {/* Influence score + tier */}
                <div className="text-right shrink-0">
                  <span
                    className="text-sm font-black"
                    style={{ color: "var(--navy)" }}
                  >
                    {inf.influence}
                  </span>
                  <p
                    className="text-[10px] capitalize font-semibold"
                    style={{ color: TIER_COLORS[inf.tier] }}
                  >
                    {inf.tier}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs pt-3 border-t text-gray-400" style={{ borderColor: "#EEF2F5" }}>
            Influence scores (0–100) represent estimated reach within the trend conversation
          </p>
        </div>
      </div>
    </FadeInSection>
  );
}
