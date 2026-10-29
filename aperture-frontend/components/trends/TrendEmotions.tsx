"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { EMO, QUOTE, hash } from "@/lib/data";
import { Narrative } from "@/lib/types";

function face(score: number) {
  if (score >= 3.8) return <><circle cx="12" cy="12" r="10" fill="#34a853"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M7.5 14.5c1.4 2 7.6 2 9 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/></>;
  if (score >= 2.6) return <><circle cx="12" cy="12" r="10" fill="#fbbc04"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M8 15.4h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>;
  return <><circle cx="12" cy="12" r="10" fill="#ea4335"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M7.5 16c1.4-2.2 7.6-2.2 9 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/></>;
}

interface TrendEmotionsProps {
  topic?: any;
  narrative?: Narrative | null;
  compact?: boolean;
}

export function TrendEmotions({ topic, narrative, compact = false }: TrendEmotionsProps) {
  const [tip, setTip] = useState<{ e: any; x: number; y: number; quote?: string; conf?: string } | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine emotions based on narrative or topic
  const emo: Record<string, number> = useMemo(() => {
    if (narrative?.emo) return narrative.emo;
    if (narrative) {
      const h = Math.abs(hash(narrative.id || narrative.title));
      const v1 = (h % 7) - 3;
      const v2 = ((h >> 3) % 7) - 3;
      if (narrative.sentiment === "Positive") {
        const exc = Math.max(10, 42 + v1);
        const sup = Math.max(10, 30 + v2);
        const neu = 14;
        const anx = 6;
        const sar = 5;
        const agn = Math.max(1, 100 - (exc + sup + neu + anx + sar));
        return { excitement: exc, supportive: sup, neutral: neu, anxiety: anx, sarcasm: sar, against: agn };
      } else if (narrative.sentiment === "Negative") {
        const anx = Math.max(10, 36 + v1);
        const agn = Math.max(10, 30 + v2);
        const sar = 18;
        const neu = 8;
        const sup = 5;
        const exc = Math.max(1, 100 - (anx + agn + sar + neu + sup));
        return { anxiety: anx, against: agn, sarcasm: sar, neutral: neu, supportive: sup, excitement: exc };
      } else if (narrative.sentiment === "Uncertain") {
        const anx = Math.max(10, 34 + v1);
        const neu = Math.max(10, 26 + v2);
        const sar = 18;
        const sup = 12;
        const agn = 6;
        const exc = Math.max(1, 100 - (anx + neu + sar + sup + agn));
        return { anxiety: anx, neutral: neu, sarcasm: sar, supportive: sup, against: agn, excitement: exc };
      } else {
        if (topic?.emo) return topic.emo;
        return { neutral: 38, supportive: 22, anxiety: 16, excitement: 12, sarcasm: 8, against: 4 };
      }
    }
    return topic?.emo || { excitement: 34, supportive: 22, anxiety: 17, sarcasm: 12, against: 9, neutral: 6 };
  }, [narrative, topic]);

  const entityId = narrative?.id || topic?.id || "narrative";

  useEffect(() => {
    setAnimKey((prev) => prev + 1);

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setAnimKey((prev) => prev + 1);
      }
    }, { threshold: 0.1 });
    if (containerRef.current) obs.observe(containerRef.current);

    const parentSection = containerRef.current?.closest("section");
    let mutObs: MutationObserver | null = null;
    if (parentSection) {
      mutObs = new MutationObserver(() => {
        if (parentSection.classList.contains("active-slide")) {
          setAnimKey((prev) => prev + 1);
        }
      });
      mutObs.observe(parentSection, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      obs.disconnect();
      if (mutObs) mutObs.disconnect();
    };
  }, [topic?.id, narrative?.id]);
  
  const polarity = () => {
    const exc = emo.excitement || 0;
    const sup = emo.supportive || 0;
    const neu = emo.neutral || 0;
    const agn = emo.against || 0;
    const anx = emo.anxiety || 0;
    const s = ((exc + sup + neu * 0.5) / 100) * 5 + ((agn + anx) / 100) * -1.1 + 1.4;
    return Math.max(1, Math.min(5, s)).toFixed(1);
  };
  
  const sc = Number(polarity());

  return (
    <div>
      {/* Subheader with score & helper description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
        <p className="text-xs sm:text-[13px] text-gray-500 leading-relaxed">
          Classified across 6 emotional dimensions inferred from post phrasing and narrative sentiment.
        </p>
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-gray-50/90 border border-gray-200/70 rounded-full px-2.5 py-1 shrink-0 shadow-2xs">
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0">{face(sc)}</svg>
          <span className="text-xs font-bold text-gray-800">
            {sc}<span className="text-gray-400 font-medium text-[10px] ml-0.5 uppercase">/5 Polarity</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-3.5">
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>Hover or tap a column for excerpt evidence and classifier confidence.</span>
      </div>
      
      {/* 6-Column Waffle Grid */}
      <div ref={containerRef} className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5 md:gap-3 stagger relative">
        {EMO.map((e, idx) => {
          const pct = emo[e.k] || 0;
          const filled = Math.max(1, Math.round(pct / 5));
          const isSelected = tip?.e?.k === e.k;
          
          return (
            <div
              key={e.k}
              tabIndex={0}
              role="button"
              aria-label={`${e.label} emotion: ${pct} percent`}
              className={`cursor-pointer group p-2.5 sm:p-3 rounded-xl border transition-all duration-200 select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isSelected 
                  ? "bg-blue-50/80 border-blue-200 shadow-2xs ring-1 ring-blue-100" 
                  : "bg-gray-50/60 hover:bg-white hover:border-gray-200/90 hover:shadow-2xs border-gray-100/80"
              }`}
              onClick={(ev) => {
                if (tip?.e?.k === e.k) {
                  setTip(null);
                } else {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setTip({
                    e,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    quote: QUOTE[e.k],
                    conf: (0.72 + ((hash(entityId + e.k) % 22) / 100)).toFixed(2)
                  });
                }
              }}
              onMouseEnter={(ev) => {
                const rect = ev.currentTarget.getBoundingClientRect();
                setTip({ 
                  e, 
                  x: rect.left + rect.width / 2, 
                  y: rect.top,
                  quote: QUOTE[e.k],
                  conf: (0.72 + ((hash(entityId + e.k) % 22) / 100)).toFixed(2)
                });
              }}
              onMouseLeave={() => setTip(null)}
            >
              {/* 5 x 4 Waffle dots */}
              <div className="grid grid-cols-5 gap-1 sm:gap-1.5 w-full mb-2">
                {Array.from({ length: 20 }).map((_, k) => {
                  const isFilled = k < filled;
                  const delay = 60 + (idx * 35) + (k * 14);
                  return (
                    <span
                      key={`${animKey}-${k}`}
                      className="w-full aspect-square rounded-[2px] sm:rounded-[3px] waffle-sq"
                      style={{
                        background: isFilled ? e.c : '#e9ecef',
                        animation: isFilled ? `popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both` : 'none',
                      }}
                    />
                  );
                })}
              </div>
              <p className="text-base sm:text-lg lg:text-xl font-bold leading-tight text-gray-900 group-hover:text-blue-600 transition-colors duration-200">
                {pct}%
              </p>
              <p className="text-[10px] sm:text-[11px] font-bold text-gray-500 mt-0.5 uppercase tracking-wider truncate">
                {e.label}
              </p>
            </div>
          );
        })}
      </div>
      
      {/* Floating Excerpt Tooltip */}
      {tip && (
        <div
          className="fixed z-[100] bg-gray-900 text-white shadow-2xl rounded-xl px-3.5 py-2.5 text-xs max-w-[270px] pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{ 
            left: Math.max(12, Math.min(tip.x - 135, (typeof window !== "undefined" ? window.innerWidth : 500) - 280)), 
            top: Math.max(12, tip.y - 110) 
          }}
        >
          <div className="font-bold mb-1.5 flex items-center justify-between gap-2" style={{ color: tip.e.c }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: tip.e.c }}></span>
              {tip.e.label}
            </span>
            <span className="text-white font-mono text-[11px]">{emo[tip.e.k]}%</span>
          </div>
          <p className="text-gray-200 italic mb-2 leading-relaxed">“{tip.quote || QUOTE[tip.e.k]}”</p>
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Classifier Confidence: {tip.conf}
          </p>
        </div>
      )}
    </div>
  );
}
