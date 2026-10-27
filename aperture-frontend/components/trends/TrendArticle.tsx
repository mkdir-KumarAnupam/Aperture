"use client";

import { TrendChart } from "./TrendChart";
import { TrendEmotions } from "./TrendEmotions";
import { TrendDemographics } from "./TrendDemographics";
import { TrendMap } from "./TrendMap";
import { TrendNetwork } from "./TrendNetwork";
import { hash, rng, EMO, QUOTE, fmt, volOf, reachOf } from "@/lib/data";
import { useEffect, useState } from "react";
import { PlatformIcon } from "./PlatformIcon";

export function TrendArticle({
  topic,
  range,
  region,
  forecast,
  setForecast,
  selectedState,
  setSelectedState,
}: {
  topic: any;
  range: string;
  region: string;
  forecast: boolean;
  setForecast: (v: boolean) => void;
  selectedState: string | null;
  setSelectedState: (v: string | null) => void;
}) {
  const [feed, setFeed] = useState<any[]>([]);

  useEffect(() => {
    // Generate Feed
    const r = rng(hash(topic.id + range + "feed"));
    const platforms = [
      { id: "x", n: "X", c: "#000000" },
      { id: "reddit", n: "Reddit", c: "#FF4500" },
      { id: "telegram", n: "Telegram", c: "#24A1DE" },
    ];
    const f = [];
    for(let i=0; i<12; i++) {
      const emoKeys = Object.keys(topic.emo);
      const emoKey = emoKeys[Math.floor(r() * emoKeys.length)];
      const emObj = EMO.find(e => e.k === emoKey)!;
      const plat = platforms[Math.floor(r() * platforms.length)];
      f.push({
        id: i,
        plat,
        emObj,
        text: QUOTE[emoKey],
        ago: `${Math.floor(r() * 23) + 1}h ago`,
        userId: Math.floor(r() * 90000) + 10000
      });
    }
    setFeed(f);
  }, [topic.id, range]);

  return (
    <article className="flex-grow w-full order-1 lg:order-2 timeline min-w-0">
      {/* 00 — Presentation Cover */}
      <section className="present-cover slide-panel">
        <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">
          {topic.cat} | SYNC LIVE
        </p>
        <h1 className="text-6xl font-bold text-gray-900 mb-6 leading-tight tracking-tight">
          {topic.name}
        </h1>
        <p className="text-xl text-gray-500 max-w-3xl mb-14 leading-relaxed">
          {topic.desc}
        </p>

        <div className="grid grid-cols-3 gap-8 bg-white border border-gray-100 p-10 rounded-2xl shadow-sm w-full max-w-3xl">
          <div>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Mentions</p>
            <p className="text-4xl font-bold text-gray-900">{fmt(volOf(topic, selectedState, region))}</p>
          </div>
          <div className="border-l border-gray-200 pl-8">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Reach</p>
            <p className="text-4xl font-bold text-gray-900">{fmt(reachOf(topic, selectedState, region))}</p>
          </div>
          <div className="border-l border-gray-200 pl-8">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Growth</p>
            <p className="text-4xl font-bold text-blue-600">+{topic.growth}%</p>
          </div>
        </div>
      </section>

      {/* 01 — chart */}
      <section className="reveal in slide-panel">
        <div className="marker">1</div>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Interest over time</h2>
          <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none shrink-0 hover:text-gray-800 transition-colors">
            <input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} className="accent-blue-600 w-3.5 h-3.5 cursor-pointer" /> Forecast
          </label>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">Mention volume through the selected window, indexed against the peak. The dashed tail projects the next six steps from the same model.</p>
        
        <TrendChart topic={topic} range={range} region={region} forecast={forecast} />
        
      </section>

      {/* 02 — emotion */}
      <section className="reveal in pt-6 border-t border-gray-100/50 slide-panel">
        <div className="marker">2</div>
        <div className="flex items-center justify-center lg:justify-start gap-3 mb-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Emotion mix</h2>
          <span className="text-[11px] font-bold text-blue-600 bg-blue-50/80 px-2.5 py-1 rounded-full">NLP-derived</span>
        </div>
        <TrendEmotions topic={topic} />
      </section>

      {/* 03 — demographics */}
      <section className="reveal in pt-6 border-t border-gray-100/50 slide-panel">
        <div className="marker">3</div>
        <div className="flex items-center justify-center lg:justify-start gap-3 mb-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Who&apos;s talking</h2>
          <span className="text-[11px] font-bold text-purple-600 bg-purple-50/80 px-2.5 py-1 rounded-full">AI-inferred</span>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">Aggregated and anonymized demographic models based on account activity and network behavior.</p>
        <TrendDemographics topic={topic} />
      </section>

      {/* 04 — keywords */}
      <section className="reveal in pt-6 border-t border-gray-100/50 keywords-section">
        <div className="marker">4</div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-3">Breakout keywords</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">Terms whose share of the conversation jumped this window, ranked by the size of the jump.</p>
        <div className="space-y-1 max-w-md bg-white p-2 rounded-xl border border-gray-100 shadow-sm stagger interactive-card">
          {topic.kw.map((k: string, i: number) => {
            const g = [3200, 780, 410, 260, 190][i] + (hash(k) % 90);
            return (
              <div key={k} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg kwrow">
                <span className="text-sm font-medium text-gray-800 truncate">{k}</span>
                <span className={`text-[11px] font-bold shrink-0 tnum ${i === 0 ? 'text-blue-600 bg-blue-50/80 px-2 py-0.5 rounded' : 'text-green-600'}`}>
                  {i === 0 ? 'Breakout' : '+' + g + '%'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 05 — map */}
      <section className="reveal in pt-4 border-t border-gray-100/50 slide-panel present-map-panel">
        <div className="marker">5</div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5 map-header">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Regional distribution</h2>
          {selectedState && (
            <button onClick={() => setSelectedState(null)} className="text-[11px] font-medium text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition-colors">
              Clear filter: {selectedState}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-3 map-desc">Relevance score by state for this window. The origin region where the trend primarily started is highlighted in vibrant yellow.</p>
        <TrendMap topic={topic} region={region} selectedState={selectedState} setSelectedState={setSelectedState} />
      </section>

      {/* 06 — network */}
      <section className="reveal in pt-6 border-t border-gray-100/50 slide-panel">
        <div className="marker">6</div>
        <TrendNetwork topic={topic} range={range} />
      </section>

      {/* 07 — feed */}
      <section className="reveal in pt-6 border-t border-gray-100/50 slide-panel">
        <div className="marker">7</div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-3">What they&apos;re saying</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">Representative synthetic quotes capturing the core sentiment breakdown of the selected window.</p>

        <div className="interactive-card bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="max-h-[380px] overflow-y-auto scroll p-2">
            {feed.map((f) => (
              <div key={f.id} className="p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 mb-2.5">
                  <PlatformIcon platform={f.plat.id || f.plat.n} size="sm" />
                  <span className="text-[13px] font-bold text-gray-900">
                    @user_{f.userId}
                  </span>
                  <span className="text-[12px] text-gray-400 font-medium ml-1">{f.ago}</span>
                </div>
                <p className="text-[14px] text-[#3c4043] mb-3 leading-relaxed font-medium">{f.text}</p>
                <div className="flex">
                  <span 
                    className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest"
                    style={{ 
                      color: f.emObj.c, 
                      backgroundColor: `${f.emObj.c}15` // light tinted background
                    }}
                  >
                    {f.emObj.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
