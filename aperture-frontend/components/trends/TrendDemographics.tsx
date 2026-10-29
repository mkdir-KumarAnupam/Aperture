"use client";

import { useEffect, useState, useRef } from "react";
import { hash, rng } from "@/lib/data";

export function TrendDemographics({ topic }: { topic: any }) {
  const [agesData, setAgesData] = useState<{ label: string; pct: number }[]>([]);
  const [langsData, setLangsData] = useState<{ label: string; pct: number; c: string; stroke: string; dashoffset: number }[]>([]);
  const [cohorts, setCohorts] = useState<{ c: string; size: number; op: number }[]>([]);
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);
  const [isFilled, setIsFilled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let fillTimer: NodeJS.Timeout | null = null;
    const parentSection = containerRef.current?.closest("section");

    const triggerFill = () => {
      if (fillTimer) clearTimeout(fillTimer);
      setIsFilled(false);
      fillTimer = setTimeout(() => {
        setIsFilled(true);
      }, 220);
    };

    const resetFill = () => {
      if (fillTimer) clearTimeout(fillTimer);
      setIsFilled(false);
    };

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !document.body.classList.contains("presentation-mode")) {
        triggerFill();
      }
    }, { threshold: 0.1 });
    if (containerRef.current) obs.observe(containerRef.current);

    let mutObs: MutationObserver | null = null;
    if (parentSection) {
      if (parentSection.classList.contains("active-slide")) {
        triggerFill();
      }

      mutObs = new MutationObserver(() => {
        if (parentSection.classList.contains("active-slide")) {
          triggerFill();
        } else if (document.body.classList.contains("presentation-mode")) {
          resetFill();
        }
      });
      mutObs.observe(parentSection, { attributes: true, attributeFilter: ["class"] });
    }

    return () => {
      if (fillTimer) clearTimeout(fillTimer);
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
  const maxAge = agesData.reduce((prev, current) => (prev && prev.pct > current.pct) ? prev : current, agesData[0]);

  return (
    <div ref={containerRef} className="bg-white p-5 sm:p-6 md:p-7 rounded-2xl border border-gray-100 shadow-sm w-full trend-demographics-card">
      {/* 3-Column Layout: Proportional grid (6fr : 7fr : 3fr) with balanced spacing and height consistency */}
      <div className="grid grid-cols-1 md:grid-cols-[6fr_7fr_3fr] gap-6 md:gap-0 items-stretch">
        
        {/* 1. Age Bracket Estimates */}
        <div className="flex flex-col justify-between h-full md:pr-5 lg:pr-6 md:border-r border-gray-100">
          <h3 className="text-[11px] sm:text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em] mb-2 sm:mb-2.5 flex items-center justify-center md:justify-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Age Bracket Estimates
          </h3>
          <div className="space-y-3 w-full max-w-[250px] mx-auto my-auto py-1 demo-age-container">
            {agesData.map((d, i) => {
              const isPeak = maxAge && d.label === maxAge.label;
              return (
                <div key={i}>
                  <div className="flex justify-between mb-1 text-[11px]">
                    <span className={`font-semibold ${isPeak ? "text-blue-600 font-bold" : "text-gray-600"}`}>
                      {d.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isPeak && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                          Peak
                        </span>
                      )}
                      <span className={`tnum ${isPeak ? "text-blue-700 font-bold" : "text-gray-900 font-bold"}`}>
                        {d.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-[#f1f3f4] rounded-full w-full h-1.5 overflow-hidden">
                    <div 
                      className={`rounded-full h-1.5 transition-all ${isPeak ? "bg-[#1a73e8]" : "bg-blue-400"}`}
                      style={{ 
                        width: isFilled ? `${d.pct}%` : '0%',
                        transition: isFilled 
                          ? `width 1.1s cubic-bezier(0.16, 1, 0.3, 1) ${i * 70}ms` 
                          : 'none'
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 font-medium text-center">
            Peak: <span className="text-gray-600 font-semibold">{maxAge ? `${maxAge.label} (${maxAge.pct}%)` : "—"}</span>
          </p>
        </div>
        
        {/* 2. Primary Language (Enlarged Donut chart with structured 2x2 legend matrix) */}
        <div className="flex flex-col justify-between h-full md:px-4 lg:px-6 md:border-r border-gray-100">
          <h3 className="text-[11px] sm:text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em] mb-2 sm:mb-2.5 flex items-center justify-center md:justify-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            Primary Language
          </h3>

          {/* Enlarged Donut Chart */}
          <div className="my-auto flex flex-col items-center justify-center py-1">
            <div className="relative w-36 h-36 sm:w-40 sm:h-40 mx-auto shrink-0 lang-donut-container">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f8f9fa" strokeWidth="11"></circle>
                {langsData.map((d, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={d.c}
                    strokeWidth={hoveredLang === d.label ? 14 : 11}
                    strokeDasharray={d.stroke}
                    strokeDashoffset={isFilled ? d.dashoffset : 251.327}
                    strokeLinecap="round"
                    opacity={hoveredLang && hoveredLang !== d.label ? 0.3 : 1}
                    className="donut-segment transition-all duration-1000 ease-out cursor-pointer"
                    onMouseEnter={() => setHoveredLang(d.label)}
                    onMouseLeave={() => setHoveredLang(null)}
                  ></circle>
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[26px] sm:text-[30px] font-extrabold text-gray-800 tnum leading-none mb-1">
                  {hoveredLang ? langsData.find(l => l.label === hoveredLang)?.pct : maxLang?.pct}%
                </span>
                <span className="text-[10px] sm:text-[11px] font-bold text-[#80868b] uppercase tracking-wider truncate max-w-[90px]">
                  {hoveredLang || maxLang?.label}
                </span>
              </div>
            </div>

            {/* Structured 2x2 Legend Pills Matrix */}
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[240px] mx-auto pt-2.5 demo-lang-matrix">
              {langsData.map((d, i) => (
                <div 
                  key={i} 
                  onMouseEnter={() => setHoveredLang(d.label)}
                  onMouseLeave={() => setHoveredLang(null)}
                  className={`flex items-center justify-between gap-1 text-[10.5px] px-2.5 py-1 rounded-full cursor-pointer transition-all duration-150 border ${
                    hoveredLang === d.label 
                      ? 'bg-gray-100 font-bold text-gray-900 border-gray-300 shadow-2xs scale-[1.02]' 
                      : 'text-gray-600 bg-gray-50/80 border-gray-100 hover:bg-gray-100/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 shadow-2xs" style={{ background: d.c }}></span>
                    <span className="font-medium truncate">{d.label}</span>
                  </div>
                  <span className="font-bold tnum text-gray-900 shrink-0">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-2 font-medium">
            Dominant: <span className="text-gray-600 font-semibold">{maxLang?.label} ({maxLang?.pct}%)</span>
          </p>
        </div>

        {/* 3. Key Cohorts (Purple theme & refined vertical letter pacing) */}
        <div className="flex flex-col justify-between h-full md:pl-5 lg:pl-6">
          <h3 className="text-[11px] sm:text-[12px] font-bold text-[#80868b] uppercase tracking-[0.15em] mb-2 sm:mb-2.5 flex items-center justify-center md:justify-start gap-1.5">
            <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Key Cohorts
          </h3>

          {/* Super Skinny Vertical Tags Ribbon Container */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 my-auto h-[180px] demo-cohorts-ribbons">
            {cohorts.map((c, i) => (
              <div
                key={i}
                title={`${c.c} (Affinity cluster)`}
                className="demo-cohort-ribbon group relative flex flex-col items-center justify-center py-2.5 px-0.5 rounded-full transition-all duration-200 shadow-2xs cursor-default h-full w-[20px] sm:w-[22px] select-none border border-gray-200/80 bg-gray-50/80 hover:bg-purple-50/90 hover:border-purple-300"
              >
                <div className="flex flex-col items-center justify-center text-[9px] font-bold tracking-wider uppercase leading-none text-gray-700 group-hover:text-purple-700 transition-colors">
                  {c.c.split("").map((char, charIdx) => (
                    <span
                      key={charIdx}
                      className={char === " " || char === "-" ? "h-1.5 block text-center opacity-40 font-black" : "leading-[1.12] block text-center"}
                    >
                      {char === " " ? "•" : char}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-2 font-medium">
            Affinity clusters
          </p>
        </div>

      </div>
    </div>
  );
}
