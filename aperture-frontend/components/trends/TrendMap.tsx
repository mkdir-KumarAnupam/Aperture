"use client";

import { useEffect, useState, useRef } from "react";
import { stateScore, REGION_OF, lerpColor, C } from "@/lib/data";

const EXTRA: Record<string, string> = {
  orissa:'Odisha',uttaranchal:'Uttarakhand',nctofdelhi:'Delhi',pondicherry:'Andhra Pradesh',puducherry:'Andhra Pradesh',chandigarh:'Punjab',lakshadweep:'Kerala',daman:'Gujarat',dadranagarhaveli:'Gujarat',damandiu:'Gujarat',
  inka:'Karnataka',intg:'Telangana',inmh:'Maharashtra',indl:'Delhi',inup:'Uttar Pradesh',inbr:'Bihar',inrj:'Rajasthan',ingj:'Gujarat',intn:'Tamil Nadu',inwb:'West Bengal',inpb:'Punjab',inkl:'Kerala',inas:'Assam',inmp:'Madhya Pradesh',inap:'Andhra Pradesh'
};

const norm = (s: string) => (s||'').toLowerCase().replace(/&/g,' and ').replace(/\band\b/g,' ').replace(/[^a-z]/g,'');
import { STATES } from "@/lib/data";

const SN = STATES.map(([name]) => ({ name: name as string, n: norm(name as string) }));

function matchState(label: string | null) {
  const l = norm(label || '');
  if (!l) return null;
  if (EXTRA[l]) return EXTRA[l];
  let h = SN.find((s) => s.n === l) || SN.find((s) => l.includes(s.n) || s.n.includes(l));
  if (h) return h.name;
  for (const k in EXTRA) {
    if (l.includes(k)) return EXTRA[k];
  }
  return null;
}

export function TrendMap({ topic, region, selectedState, setSelectedState }: { topic: any; region: string; selectedState: string | null; setSelectedState: (s: string | null) => void; }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [mapSvgStr, setMapSvgStr] = useState<string | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);

  useEffect(() => {
    async function fetchMap() {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/@svg-maps/india@1.0.1/india.svg');
        if (res.ok) {
          const txt = await res.text();
          setMapSvgStr(txt);
          setMapState('ok');
        } else {
          setMapState('fail');
        }
      } catch (e) {
        setMapState('fail');
      }
    }
    fetchMap();
  }, []);

  useEffect(() => {
    if (mapState !== 'ok' || !mapSvgStr || !mapRef.current) return;
    const host = mapRef.current;
    host.innerHTML = '';
    
    const doc = new DOMParser().parseFromString(mapSvgStr, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return;
    
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', `width:100%;height:100%;transform-origin:center;transform:scale(${zoom});transition:transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)`);

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.prepend(defs);
    }

    if (!svg.querySelector('#checkPattern')) {
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', 'checkPattern');
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('width', '8');
      pattern.setAttribute('height', '8');
      pattern.setAttribute('patternTransform', 'rotate(45)');

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '8');
      bg.setAttribute('height', '8');
      bg.setAttribute('fill', '#fbbc04');

      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', '0'); line1.setAttribute('y1', '0');
      line1.setAttribute('x2', '0'); line1.setAttribute('y2', '8');
      line1.setAttribute('stroke', '#ffffff');
      line1.setAttribute('stroke-width', '2');
      line1.setAttribute('opacity', '0.8');

      const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', '0'); line2.setAttribute('y1', '0');
      line2.setAttribute('x2', '8'); line2.setAttribute('y2', '0');
      line2.setAttribute('stroke', '#ffffff');
      line2.setAttribute('stroke-width', '2');
      line2.setAttribute('opacity', '0.8');

      pattern.appendChild(bg);
      pattern.appendChild(line1);
      pattern.appendChild(line2);
      defs.appendChild(pattern);
    }

    let styleEl = svg.querySelector('style#mapHoverStyle');
    if (!styleEl) {
      styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.setAttribute('id', 'mapHoverStyle');
      styleEl.textContent = `
        path.map-state {
          transition: fill 0.2s ease, stroke 0.15s ease, stroke-width 0.15s ease;
        }
        path.map-state.in-region {
          cursor: pointer;
        }
        path.map-state.in-region:hover {
          stroke: #202124 !important;
          stroke-width: 2.5px !important;
        }
      `;
      svg.prepend(styleEl);
    }

    const paths = svg.querySelectorAll('path');
    paths.forEach(p => {
      const id = p.getAttribute('name') || p.getAttribute('title') || p.getAttribute('id');
      const sName = matchState(id);
      if (!sName) { p.setAttribute('fill', '#f1f3f4'); return; }

      const score = stateScore(topic, sName);
      const inRegion = region === 'All India' || REGION_OF[sName] === region;
      const isSelected = selectedState === sName;
      const isOrigin = sName === topic.hubs[0];

      let fill = '#f1f3f4';
      if (inRegion) fill = lerpColor(score / 100);
      if (selectedState && !isSelected && inRegion) fill = '#e8eaed';
      if (isSelected) fill = C.yellow;
      if (isOrigin && inRegion) fill = 'url(#checkPattern)';

      p.classList.add('map-state');
      if (inRegion) {
        p.classList.add('in-region');
        p.setAttribute('data-sname', sName);
        p.setAttribute('data-score', String(score));
        if (isOrigin) p.setAttribute('data-origin', 'true');
      } else {
        p.classList.remove('in-region');
        p.removeAttribute('data-sname');
        p.removeAttribute('data-score');
        p.removeAttribute('data-origin');
      }

      p.setAttribute('fill', fill);
      p.setAttribute('stroke', isOrigin ? '#f9ab00' : isSelected ? '#1a73e8' : '#ffffff');
      p.setAttribute('stroke-width', isOrigin || isSelected ? '2.5' : '1.5');
      if (isOrigin) p.parentNode?.appendChild(p);
    });

    svg.addEventListener('mousemove', (ev) => {
      const target = (ev.target as Element)?.closest('path.map-state.in-region');
      if (target) {
        const sName = target.getAttribute('data-sname');
        const score = target.getAttribute('data-score');
        const isOrigin = target.getAttribute('data-origin') === 'true';
        const hostRect = host.getBoundingClientRect();
        setTip({
          html: `<p class="font-bold text-white mb-0.5">${sName} ${isOrigin ? '<span class="text-[#fbbc04] ml-1">(Origin)</span>' : ''}</p><p class="text-gray-400">Relevance score: <span class="text-white font-medium">${score}</span></p>`,
          x: ev.clientX - hostRect.left,
          y: ev.clientY - hostRect.top
        });
      } else {
        setTip(null);
      }
    });

    svg.addEventListener('mouseleave', () => {
      setTip(null);
    });

    svg.addEventListener('click', (ev) => {
      const target = (ev.target as Element)?.closest('path.map-state.in-region');
      if (target) {
        const sName = target.getAttribute('data-sname');
        if (sName) {
          setSelectedState(selectedState === sName ? null : sName);
        }
      }
    });

    host.appendChild(svg);
  }, [mapState, mapSvgStr, topic, region, selectedState, zoom, setSelectedState]);

  return (
    <div className="relative w-full min-h-[350px] bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden interactive-card">
      <div ref={mapRef} className="w-full h-[350px] flex items-center justify-center">
        {mapState === 'loading' && <p className="text-sm font-medium text-gray-400 animate-pulse">Loading map geometry...</p>}
        {mapState === 'fail' && <p className="text-sm text-gray-400">Map data unavailable.</p>}
      </div>

      {tip && (
        <div
          className="absolute z-20 pointer-events-none bg-gray-900 text-white shadow-xl rounded-md px-3 py-2 text-xs transition-all duration-75 ease-out"
          style={{ left: Math.min(tip.x + 14, 500), top: tip.y - 10 }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        ></div>
      )}

      <div className="absolute right-3 top-3 flex flex-col bg-white border border-gray-200 rounded-md shadow-sm text-gray-500 overflow-hidden">
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.5))} className="w-8 h-8 hover:bg-gray-50 hover:text-blue-600 border-b border-gray-100 transition-colors text-lg" aria-label="Zoom in">+</button>
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="w-8 h-8 hover:bg-gray-50 hover:text-blue-600 transition-colors text-lg" aria-label="Zoom out">−</button>
      </div>

      <div className="absolute bottom-4 left-4 bg-white/95 px-3 py-2 rounded-lg border border-gray-100 shadow-sm text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-3">
        Low
        <div className="segmented-scale">
          <span className="seg-1"></span><span className="seg-2"></span><span className="seg-3"></span><span className="seg-4"></span><span className="seg-5"></span>
        </div>
        High
      </div>
    </div>
  );
}
