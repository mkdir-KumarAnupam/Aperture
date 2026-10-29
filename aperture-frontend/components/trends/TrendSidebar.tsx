"use client";

import { useEffect, useState, useMemo } from "react";
import { TOPICS, volOf, reachOf, fmt, rng, hash, seriesFor, RANGES, C } from "@/lib/data";
import { PlatformIcon } from "./PlatformIcon";

function Sparkline({ t, range, w = 54, h = 18 }: { t: any; range: string; w?: number; h?: number }) {
  const d = seriesFor(t, range, "All India").slice(0, RANGES.find((r) => r.id === range)?.n || 24);
  const pts = d.map((v, i) => `${(i / (d.length - 1) * w).toFixed(1)},${(h - v / 100 * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={t.growth > 150 ? "#10b981" : "#94a3b8"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrendSidebar({
  topic,
  range,
  region,
  selectedState,
  onSelectTopic,
}: {
  topic: any;
  range: string;
  region: string;
  selectedState: string | null;
  onSelectTopic: (id: string) => void;
}) {
  const [platformMix, setPlatformMix] = useState<number[]>([]);
  const platforms = [
    { key: "telegram", name: "Telegram", color: "#229ED9" },
    { key: "x", name: "X (Twitter)", color: "#111827" },
    { key: "reddit", name: "Reddit", color: "#FF4500" },
  ];

  useEffect(() => {
    const r = rng(hash(topic.id + "platform"));
    let w = [r() * 1.5 + 0.5, r() * 1.0 + 0.3, r() * 0.7 + 0.2];
    const sum = w.reduce((a, b) => a + b, 0);
    const mix = w.map((v) => Math.round((v / sum) * 100));
    const diff = 100 - mix.reduce((a, b) => a + b, 0);
    mix[0] += diff;

    // Animate in
    setPlatformMix([0, 0, 0]);
    const timer = setTimeout(() => {
      setPlatformMix(mix);
    }, 100);
    return () => clearTimeout(timer);
  }, [topic.id]);

  const related = useMemo(() => {
    return [...TOPICS].filter((t) => t.id !== topic.id).sort((a, b) => b.growth - a.growth).slice(0, 5);
  }, [topic.id]);

  return (
    <aside className="w-full lg:w-[260px] shrink-0 order-2 lg:order-1 reveal in">
      <div className="lg:sticky lg:top-24 space-y-6">
        
        {/* 1. Research Dossier / Key Metrics & Platform Spread Card */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm w-full">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              <h3 className="text-[11px] sm:text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em]">
                At A Glance
              </h3>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {range} · {region === "All India" ? "National" : region}
            </span>
          </div>

          {/* Dossier Metrics */}
          <dl className="space-y-3 mb-5">
            <div className="flex justify-between items-baseline">
              <dt className="text-xs font-medium text-gray-500">Mentions</dt>
              <dd className="font-extrabold text-gray-900 tnum text-[16px]">
                {fmt(volOf(topic, selectedState, region))}
              </dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-xs font-medium text-gray-500">Reach</dt>
              <dd className="font-extrabold text-gray-900 tnum text-[16px]">
                {fmt(reachOf(topic, selectedState, region))}
              </dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-xs font-medium text-gray-500">Growth</dt>
              <dd className="font-extrabold text-blue-600 tnum text-[16px]">
                +{topic.growth}%
              </dd>
            </div>
          </dl>

          {/* Platform Mix Section */}
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold text-[#80868b] uppercase tracking-[0.15em] flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Platform Mix
              </p>
              <span className="text-[10px] font-semibold text-gray-400">Cross-channel</span>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="flex w-full h-2 rounded-full overflow-hidden bg-gray-100 gap-0.5 p-0.5 mb-3">
              {platformMix.map((val, i) => (
                <div
                  key={i}
                  className={`h-full transition-all duration-700 ${
                    i === 0 ? "rounded-l-full" : i === platformMix.length - 1 ? "rounded-r-full" : ""
                  }`}
                  style={{ width: `${val}%`, backgroundColor: platforms[i].color }}
                  title={`${platforms[i].name}: ${val}%`}
                />
              ))}
            </div>

            {/* Platform Micro-Chips */}
            <div className="space-y-1.5">
              {platforms.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-gray-50/70 border border-gray-100/80 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PlatformIcon platform={p.key as any} size="xs" />
                    <span className="font-medium text-gray-700 truncate">{p.name}</span>
                  </div>
                  <span className="font-bold text-gray-900 tnum">{platformMix[i] || 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Related Trends Card */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm w-full">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 mb-2.5 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <h3 className="text-[11px] sm:text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em]">
                Related Trends
              </h3>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {related.length} Active
            </span>
          </div>

          {/* Trend Items */}
          <div className="space-y-1">
            {related.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTopic(t.id)}
                className="w-full text-left p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-gray-100 transition-all duration-150 group flex items-center justify-between gap-2.5 cursor-pointer"
                title={`Switch to ${t.name}`}
              >
                <div className="flex-grow min-w-0 pr-1">
                  <span className="block text-[12.5px] font-semibold text-gray-800 break-words leading-snug group-hover:text-blue-600 transition-colors">
                    {t.name}
                  </span>
                  <span className="block text-[10.5px] text-gray-400 mt-0.5 truncate font-medium">
                    {t.cat} · {fmt(volOf(t, null, "All India"))}
                  </span>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Sparkline t={t} range={range} />
                  <span className={`text-[11px] font-bold w-9 text-right tnum ${t.growth > 150 ? "text-emerald-600" : "text-gray-500"}`}>
                    +{t.growth}%
                  </span>
                </div>
              </button>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-3 pt-2.5 border-t border-gray-100/70 font-medium">
            Select trend to inspect dossier
          </p>
        </div>

      </div>
    </aside>
  );
}
