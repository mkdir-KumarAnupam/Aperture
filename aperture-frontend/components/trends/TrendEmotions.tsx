"use client";

import { useState, useRef, useEffect } from "react";
import { EMO, QUOTE, hash } from "@/lib/data";

function face(score: number) {
  if (score >= 3.8) return <><circle cx="12" cy="12" r="10" fill="#34a853"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M7.5 14.5c1.4 2 7.6 2 9 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/></>;
  if (score >= 2.6) return <><circle cx="12" cy="12" r="10" fill="#fbbc04"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M8 15.4h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></>;
  return <><circle cx="12" cy="12" r="10" fill="#ea4335"/><circle cx="8.6" cy="10" r="1.4" fill="#fff"/><circle cx="15.4" cy="10" r="1.4" fill="#fff"/><path d="M7.5 16c1.4-2.2 7.6-2.2 9 0" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/></>;
}

export function TrendEmotions({ topic }: { topic: any }) {
  const [tip, setTip] = useState<{ e: any; x: number; y: number } | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, [topic.id]);
  
  const polarity = () => {
    const s = (topic.emo.excitement + topic.emo.supportive + topic.emo.neutral * 0.5) / 100 * 5 + (topic.emo.against + topic.emo.anxiety) / 100 * -1.1 + 1.4;
    return Math.max(1, Math.min(5, s)).toFixed(1);
  };
  
  const sc = Number(polarity());

  return (
    <>
      <p className="text-sm text-gray-500 leading-relaxed mb-2">
        Classified beyond positive and negative, since a post can be excited, sarcastic or anxious about the same fact.
        <span className="inline-flex items-center gap-1.5 align-middle ml-1">
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]">{face(sc)}</svg>
          <span className="text-[13px] font-bold text-gray-800">{sc}<span className="text-[#98a1a9] font-medium text-[11px] ml-0.5 uppercase">/5 SCORE</span></span>
        </span>
      </p>
      <p className="text-[12px] text-gray-400 mb-8">Hover a column for a representative post and its confidence score.</p>
      
      <div ref={containerRef} className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-8 stagger relative">
        {EMO.map((e, idx) => {
          const pct = topic.emo[e.k];
          const filled = Math.max(1, Math.round(pct / 5));
          
          return (
            <div
              key={e.k}
              className="cursor-default group p-2 -m-2 rounded-lg hover:bg-gray-50 transition-all duration-300"
              onMouseEnter={(ev) => setTip({ e, x: ev.clientX, y: ev.clientY })}
              onMouseMove={(ev) => setTip({ e, x: ev.clientX, y: ev.clientY })}
              onMouseLeave={() => setTip(null)}
            >
              <div className="grid grid-cols-5 gap-1.5 w-full mb-3">
                {Array.from({ length: 20 }).map((_, k) => {
                  const isFilled = k < filled;
                  const delay = (idx * 40) + (k * 15);
                  return (
                    <span
                      key={`${animKey}-${k}`}
                      className="w-full aspect-square rounded-[3px] waffle-sq"
                      style={{
                        background: isFilled ? e.c : '#f1f3f4',
                        animation: isFilled ? `popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms both` : 'none',
                      }}
                    />
                  );
                })}
              </div>
              <p className="text-xl font-bold leading-none text-gray-900 group-hover:text-blue-600 transition-colors duration-300">{pct}%</p>
              <p className="text-[11px] font-bold text-gray-500 mt-1 uppercase tracking-wider">{e.label}</p>
            </div>
          );
        })}
      </div>
      
      {tip && (
        <div
          className="fixed z-50 bg-gray-900 text-white shadow-xl rounded-lg px-4 py-3 text-sm max-w-[260px] pointer-events-none transition-opacity duration-150"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}
        >
          <p className="font-bold mb-2 flex items-center gap-2" style={{ color: tip.e.c }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: tip.e.c }}></span>
            {tip.e.label} · {topic.emo[tip.e.k]}%
          </p>
          <p className="text-gray-300 italic mb-2">“{QUOTE[tip.e.k]}”</p>
          <p className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">
            Classifier Confidence: {(0.72 + ((hash(topic.id + tip.e.k) % 22) / 100)).toFixed(2)}
          </p>
        </div>
      )}
    </>
  );
}
