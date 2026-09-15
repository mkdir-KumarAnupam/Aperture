"use client";

import dynamic from "next/dynamic";
import { TrendAnalytics } from "@/data/types";
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

export function InfluenceTrendCard({ trend }: { trend: TrendAnalytics }) {
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

  // Build graph data for react-force-graph-2d
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      platform: n.platform,
      community: n.community,
      influence: n.influence,
      val: Math.pow(n.influence / 36, 2),
      color: COMMUNITY_COLORS[n.community] ?? "#3B82F6",
    })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.strength,
    })),
  }), [nodes, edges]);

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
      }

      // Label for top nodes or on hover
      if (node.influence >= 80 || isHovered) {
        const label = node.label;
        ctx.font = `${isHovered ? "bold " : ""}${Math.max(8, 10 / globalScale)}px Inter, sans-serif`;
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
    <div className="report-card p-5 sm:p-6 flex flex-col justify-between h-full relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
          Influence Trend
        </h2>
        <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-full">
          Cluster Network
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 w-full rounded-xl overflow-hidden my-auto"
        style={{ minHeight: 380, height: "100%" }}
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

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>Force-directed propagation graph</span>
        <span className="font-semibold text-slate-600">{nodes.length} Key Voices</span>
      </div>
    </div>
  );
}

export default InfluenceTrendCard;
