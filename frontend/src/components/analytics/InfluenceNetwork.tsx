"use client";

import dynamic from "next/dynamic";
import { GlobalTimeframe, TrendAnalytics } from "@/data/types";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";

// Dynamically import the network graph (WebGL canvas — must be client-side only)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-slate-400 text-xs">
      Loading network graph…
    </div>
  ),
});

const COMMUNITY_COLORS: Record<string, string> = {
  "Tech Creators": "#3B82F6",
  "Photography": "#10B981",
  "AI Community": "#8B5CF6",
  "AI Researchers": "#8B5CF6",
  "Fintech": "#F59E0B",
  "Official": "#1E293B",
  "Policy": "#64748B",
  "Business": "#B45309",
  "Fan Groups": "#EF4444",
  "Sports Media": "#2563EB",
  "Stats": "#059669",
  "Fantasy": "#D97706",
  "Global Fans": "#3B82F6",
  "Mega Creators": "#DC2626",
  "Industry": "#2563EB",
  "Creator Tools": "#7C3AED",
  "Regional": "#10B981",
  "Creators": "#D97706",
  "Trends": "#EF4444",
  "EV Community": "#10B981",
  "Infrastructure": "#475569",
  "Finance": "#F59E0B",
  "Media": "#2563EB",
  "Brands": "#DC2626",
  "Tech Hubs": "#3B82F6",
  "Startups": "#F59E0B",
  "Developers": "#475569",
  "General": "#94A3B8",
};

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

export function InfluenceTrendCard({
  trend,
  timeframe = "30D",
}: {
  trend: TrendAnalytics;
  timeframe?: GlobalTimeframe;
}) {
  const hoveredNodeRef = useRef<string | null>(null);
  const [, forceRender] = useState(0);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const configuredTrendRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const [containerHeight, setContainerHeight] = useState(480);

  const { nodes, edges } = trend.influence;

  // Measure container dimensions responsively
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 50) setContainerWidth(entry.contentRect.width);
        if (entry.contentRect.height > 50) setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    if (el.clientWidth > 50) setContainerWidth(el.clientWidth);
    if (el.clientHeight > 50) setContainerHeight(el.clientHeight);

    return () => observer.disconnect();
  }, []);

  // Filter nodes & edges by timeframe window
  const activeNodeCount =
    timeframe === "6H"
      ? Math.max(6, Math.round(nodes.length * 0.55))
      : timeframe === "1D"
      ? Math.max(8, Math.round(nodes.length * 0.75))
      : timeframe === "7D"
      ? Math.max(10, Math.round(nodes.length * 0.9))
      : nodes.length;

  const filteredNodes = useMemo(() => {
    return [...nodes]
      .sort((a, b) => b.influence - a.influence)
      .slice(0, activeNodeCount);
  }, [nodes, activeNodeCount]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          filteredNodeIds.has(e.source as string) &&
          filteredNodeIds.has(e.target as string)
      ),
    [edges, filteredNodeIds]
  );

  // Build graph data for react-force-graph-2d
  const graphData = useMemo(() => ({
    nodes: filteredNodes.map((n) => ({
      id: n.id,
      label: n.label,
      platform: n.platform,
      community: n.community,
      influence: n.influence,
      val: Math.pow(n.influence / 36, 2),
      color: COMMUNITY_COLORS[n.community] ?? "#3B82F6",
    })),
    links: filteredEdges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.strength,
    })),
  }), [filteredNodes, filteredEdges]);

  const configureForces = useCallback(() => {
    const graph = fgRef.current;
    if (!graph) return;

    graph.d3Force("charge")?.strength(-220);
    graph.d3Force("link")?.distance(110).strength(0.65);
    graph.d3Force("collide")?.radius((node: ForceGraphNode) => Math.sqrt(node.val ?? 1) * 8 + 18);
    graph.d3Force("x")?.x(0).strength(0.06);
    graph.d3Force("y")?.y(0).strength(0.06);
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
    graph.zoomToFit(400, 30);
  }, []);

  const nodeCanvasObject = useCallback(
    (nodeObject: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObject as ForceGraphNode;
      const size = Math.sqrt(node.val) * 7 + 3;
      const isHovered = hoveredNodeRef.current === node.id;
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;

      // Circle
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + (isHovered ? "FF" : "DD");
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const label = node.label;
        ctx.font = `bold ${Math.max(10, 12 / globalScale)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0F172A";
        ctx.fillText(label, nx, ny + size + 8 / globalScale);
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
    <div className="flex flex-col justify-between h-full relative w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
          Influence Trend
        </h2>
        <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-0.5 rounded-full shadow-2xs">
          Cluster Network
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 w-full overflow-hidden my-auto"
        style={{ minHeight: 460, height: "100%" }}
      >
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeCanvasObject={nodeCanvasObject}
          linkColor={() => "#CBD5E1"}
          linkWidth={(link: object) => ((link as ForceGraphLink).value ?? 0.5) * 1.5}
          onNodeHover={handleNodeHover}
          backgroundColor="transparent"
          cooldownTicks={90}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.38}
          width={containerWidth}
          height={containerHeight}
          onEngineTick={handleEngineTick}
          onEngineStop={handleEngineStop}
        />
      </div>
    </div>
  );
}

export default InfluenceTrendCard;
