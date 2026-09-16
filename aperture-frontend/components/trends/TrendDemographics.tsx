"use client";

import { useEffect, useState, useRef } from "react";
import { hash, rng } from "@/lib/data";

export function TrendDemographics({ topic }: { topic: any }) {
  const [agesData, setAgesData] = useState<{ label: string; pct: number }[]>([]);
  const [langsData, setLangsData] = useState<{ label: string; pct: number; c: string; stroke: string; dashoffset: number }[]>([]);
  const [cohorts, setCohorts] = useState<{ c: string; size: number; op: number }[]>([]);
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setMounted(true);
      }
    }, { threshold: 0.1 });
    if (containerRef.current) obs.observe(containerRef.current);

    const parentSection = containerRef.current?.closest("section");
    let mutObs: MutationObserver | null = null;
    if (parentSection) {
      mutObs = new MutationObserver(() => {
        if (parentSection.classList.contains("active-slide")) {
          setMounted(false);
          setTimeout(() => setMounted(true), 50);
        }
      });
      mutObs.observe(parentSection, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      obs.disconnect();
      if (mutObs) mutObs.disconnect();
    };
  }, []);

  useEffect(() => {
    const r = rng(hash(topic.id + 'demo2'));

    // Ages
    const ages = ['13–17', '18–24', '25–34', '35–44', '45+'];
    const aW = [r()*1.2, r()*3, r()*2, r()*1.5, r()*0.8];
    const aSum = aW.reduce((a, b) => a + b, 0);
    setAgesData(aW.map((v, i) => ({ label: ages[i], pct: Math.round((v / aSum) * 100) })));

    // Languages
    const langs = ['Hindi', 'English', 'Hinglish', 'Regional'];
    const lCols = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    const lW = [r()*2, r()*1.5, r()*3.5, r()*0.8];
    const lSum = lW.reduce((a, b) => a + b, 0);
    const lPct = lW.map((v) => Math.round((v / lSum) * 100));
    lPct[0] += 100 - lPct.reduce((a, b) => a + b, 0);

    const C = 2 * Math.PI * 40; // 251.327
    let offset = 0;
    const lData = lPct.map((pct, i) => {
      const L = (pct / 100) * C;
      const gap = 3; 
      const strokeL = Math.max(0, L - gap);
      const stroke = `${strokeL} ${C - strokeL}`;
      const c = lCols[i];
      const dashoffset = -offset;
      offset += L;
      return { label: langs[i], pct, c, stroke, dashoffset };
    });
    setLangsData(lData);

    // Cohorts
    const allCohorts = ['Students', 'Software IT', 'Govt. Sector', 'Creators', 'Finance', 'Healthcare', 'Retail', 'Founders'];
    const cPool = [...allCohorts].sort(() => r() - 0.5).slice(0, 5);
    setCohorts(cPool.map((c, i) => ({ c, size: 12.5 - (i * 0.5), op: 1 - (i * 0.12) })));
  }, [topic.id]);

  const maxLang = langsData.reduce((prev, current) => (prev && prev.pct > current.pct) ? prev : current, langsData[0]);
  

  return (
    <div ref={containerRef} className="flex flex-col interactive-card bg-white p-6 md:p-8 rounded-2xl border border-gray-100 shadow-sm">
      
      {/* Top half: 2 cols */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 pb-10">
        {/* Ages */}
        <div className="flex flex-col h-full">
          <h3 className="text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em] mb-6">
            Age Bracket Estimates
          </h3>
          <div className="space-y-4">
            {agesData.map((d, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1.5 font-bold text-[11px] text-gray-600">
                  <span>{d.label}</span>
                  <span className="tnum">{d.pct}%</span>
                </div>
                <div className="bg-[#f1f3f4] rounded-full w-full h-2 overflow-hidden">
                  <div 
                    className="bg-[#1a73e8] rounded-full h-2 transition-all duration-1000 ease-out" 
                    style={{ width: `${mounted ? d.pct : 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Languages */}
        <div className="flex flex-col h-full">
          <h3 className="text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em] mb-6 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
            Primary Language
          </h3>
          <div className="flex items-center gap-8 mt-2">
            <div className="relative w-32 h-32 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f8f9fa" strokeWidth="12"></circle>
                {langsData.map((d, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={d.c}
                    strokeWidth={hoveredLang === d.label ? 16 : 12}
                    strokeDasharray={d.stroke}
                    strokeDashoffset={mounted ? d.dashoffset : 251.327}
                    strokeLinecap="round"
                    opacity={hoveredLang && hoveredLang !== d.label ? 0.3 : 1}
                    className="donut-segment transition-all duration-1000 ease-out"
                  ></circle>
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center fadein pointer-events-none" style={{ animationDelay: '0.4s' }}>
                <span className="text-[22px] font-extrabold text-gray-800 tnum leading-none mb-1">{hoveredLang ? langsData.find(l => l.label === hoveredLang)?.pct : maxLang?.pct}%</span>
                <span className="text-[10px] font-bold text-[#80868b] uppercase tracking-wider">{hoveredLang || maxLang?.label}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-y-3 w-full max-w-[200px] ml-2">
              {langsData.map((d, i) => (
                <div 
                  key={i} 
                  onMouseEnter={() => setHoveredLang(d.label)}
                  onMouseLeave={() => setHoveredLang(null)}
                  className={`flex items-center justify-between text-[13px] px-2 py-1 -mx-2 rounded-lg cursor-default transition-all duration-200 ${
                    hoveredLang === d.label ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 font-medium text-[#5f6368]">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ background: d.c }}></span>
                    <span className={hoveredLang === d.label ? 'text-gray-900 font-semibold' : ''}>{d.label}</span>
                  </div>
                  <div className={`font-bold tnum pl-4 ${hoveredLang === d.label ? 'text-gray-900' : 'text-[#3c4043]'}`}>{d.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Separator */}
      <div className="border-t border-gray-100/80 w-full mb-8"></div>
      
      {/* Bottom half: Single Row Cohorts */}
      <div className="flex items-center justify-center w-full gap-3 md:gap-4 flex-wrap md:flex-nowrap">
        {cohorts.map((c, i) => (
          <span
            key={i}
            className="px-4 py-1.5 border border-[#dadce0] bg-white rounded-lg text-[12.5px] font-medium text-[#3c4043] tracking-wide shadow-sm whitespace-nowrap"
          >
            {c.c}
          </span>
        ))}
      </div>

    </div>
  );
}
