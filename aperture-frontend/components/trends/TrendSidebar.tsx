"use client";

import { useEffect, useState, useMemo } from "react";
import { TOPICS, volOf, reachOf, fmt, rng, hash, seriesFor, RANGES, C } from "@/lib/data";

function Sparkline({ t, range, w = 56, h = 20 }: { t: any; range: string; w?: number; h?: number }) {
  const d = seriesFor(t, range, "All India").slice(0, RANGES.find((r) => r.id === range)?.n || 24);
  const pts = d.map((v, i) => `${(i / (d.length - 1) * w).toFixed(1)},${(h - v / 100 * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={t.growth > 150 ? C.green : C.grey} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  const platforms = ["X (Twitter)", "Instagram", "Reddit", "Telegram"];
  const colors = ["#1a73e8", "#4285f4", "#8ab4f8", "#d2e3fc"];

  useEffect(() => {
    const r = rng(hash(topic.id + "platform"));
    let w = [r() * 1.5 + 0.5, r() * 1.2 + 0.3, r() * 0.8 + 0.2, r() * 0.5 + 0.1];
    const sum = w.reduce((a, b) => a + b, 0);
    const mix = w.map((v) => Math.round((v / sum) * 100));
    const diff = 100 - mix.reduce((a, b) => a + b, 0);
    mix[0] += diff;
    
    // Animate in
    setPlatformMix([0, 0, 0, 0]);
    setTimeout(() => {
      setPlatformMix(mix);
    }, 100);
  }, [topic.id]);

  const related = useMemo(() => {
    return [...TOPICS].filter((t) => t.id !== topic.id).sort((a, b) => b.growth - a.growth).slice(0, 6);
  }, [topic.id]);

  return (
    <aside className="w-full lg:w-[240px] shrink-0 order-2 lg:order-1 reveal in">
      <div className="lg:sticky lg:top-24 space-y-10">
        <div className="w-full bg-white rounded-xl p-5 border border-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] font-medium text-[#80868b] mb-4">At a glance</p>
          <dl className="text-[15px]">
            <div className="flex justify-between items-baseline border-b border-gray-100 pb-3">
              <dt className="text-[#5f6368] font-normal">Mentions</dt>
              <dd className="font-bold text-[#202124] tnum text-[17px]">{fmt(volOf(topic, selectedState, region))}</dd>
            </div>
            <div className="flex justify-between items-baseline border-b border-gray-100 py-3">
              <dt className="text-[#5f6368] font-normal">Reach</dt>
              <dd className="font-bold text-[#202124] tnum text-[17px]">{fmt(reachOf(topic, selectedState, region))}</dd>
            </div>
            <div className="flex justify-between items-baseline border-b border-gray-100 py-3">
              <dt className="text-[#5f6368] font-normal">Growth</dt>
              <dd className="font-bold text-[#1a73e8] tnum text-[17px]">+{topic.growth}%</dd>
            </div>
          </dl>
        </div>

        <div className="w-full">
          <div className="flex items-baseline justify-between mb-2 relative group">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Platform Mix</p>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 cursor-pointer">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div className="hidden group-hover:block absolute top-6 right-0 w-48 bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-50">
              <p className="font-medium text-gray-900 mb-1">Ingestion Tier Priority</p>
              <p className="text-gray-500">Darker bars denote platforms designated as Essential. Lighter bars represent Desirable or Extended scopes.</p>
            </div>
          </div>
          <div className="flex w-full h-2 rounded-full overflow-hidden mb-3">
            {platformMix.map((val, i) => (
              <div key={i} className="h-full transition-all duration-500" style={{ width: `${val}%`, backgroundColor: colors[i] }}></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[11px] font-medium text-gray-600">
            {platformMix.map((val, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: colors[i] }}></span>
                <span className="truncate">{platforms[i]} {val}%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Related trends</p>
          <div className="space-y-1 overflow-y-auto scroll pr-1" style={{ maxHeight: "360px" }}>
            {related.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTopic(t.id)}
                className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all duration-300 group"
              >
                <span className="flex-grow min-w-0">
                  <span className="block text-sm font-medium text-gray-800 break-words leading-snug group-hover:text-blue-600 transition-colors duration-300 pr-2">{t.name}</span>
                  <span className="block text-[11px] text-gray-400 mt-0.5">{t.cat} · {fmt(volOf(t, null, "All India"))}</span>
                </span>
                <Sparkline t={t} range={range} />
                <span className={`text-[11px] font-bold w-10 text-right tnum ${t.growth > 150 ? "text-green-600" : "text-gray-400"}`}>
                  +{t.growth}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
