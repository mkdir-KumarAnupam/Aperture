"use client";

import { useEffect, useRef, useState } from "react";
import { seriesFor, RANGES, C, volOf, fmt } from "@/lib/data";

export function TrendChart({ topic, range, region, forecast }: { topic: any; range: string; region: string; forecast: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setIsVisible(true);
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);
  
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    svg.innerHTML = '';
    
    const R = RANGES.find(r => r.id === range)!;
    const n = R.n, fc = 6, total = forecast ? n + fc : n;
    const d = seriesFor(topic, range, region);
    const L = 36, T = 10, W = 1000 - L - 10, H = 270 - T - 20;
    
    const out = [];
    for(let i=0; i<R.n; i++){
      if(range==='6H') out.push(`${String(10+Math.floor(i/4)).padStart(2,'0')}:${String((i%4)*15).padStart(2,'0')}`);
      else if(range==='1D') out.push(`${String(i).padStart(2,'0')}:00`);
      else if(range==='7D') out.push(`Sep ${9+Math.floor(i/4)}`);
      else out.push(`Aug ${18+i}`.replace(/Aug (3[2-9]|4[0-7])/,(m,d)=>'Sep '+(Number(d)-31)));
    }
    const labels = out;
    const x = (i: number) => L + (i / (total - 1)) * W;
    const y = (v: number) => T + H - (v / 100) * H;
    
    const el = (t: string, a: any = {}) => {
      const e = document.createElementNS('http://www.w3.org/2000/svg', t);
      for (const k in a) e.setAttribute(k, a[k]);
      return e;
    };
    
    // Horizontal Grids
    [0,50,100].forEach(g => {
      svg.appendChild(el('line',{x1:L,x2:L+W,y1:y(g),y2:y(g),stroke:'#f1f3f4','stroke-width':1.5}));
      const tx = el('text',{x:L-12,y:y(g)+4,'text-anchor':'end','font-size':11,fill:'#98a1a9','font-family':'Google Sans'});
      tx.textContent = String(g);
      svg.appendChild(tx);
    });

    // Vertical Grids
    const step = Math.ceil(n/7);
    for(let i=0; i<n; i+=step){
      svg.appendChild(el('line',{x1:x(i),x2:x(i),y1:T,y2:T+H,stroke:'#f1f3f4','stroke-width':1.5}));
      const tx = el('text',{x:x(i),y:270-12,'text-anchor':'middle','font-size':11,fill:'#98a1a9','font-weight':'500'});
      tx.textContent = labels[i];
      svg.appendChild(tx);
    }

    if (forecast) {
      svg.appendChild(el('rect',{x:x(n-1),y:T,width:W-(x(n-1)-L),height:H,fill:'#f8f9fa', rx: 4}));
      const ft = el('text',{x:x(n-1)+10,y:T+14,'font-size':10,fill:'#98a1a9','font-weight':'bold','text-transform':'uppercase','letter-spacing':'1px'});
      ft.textContent = 'forecast model';
      svg.appendChild(ft);
    }

    const platforms = [
      { id: 'X (Twitter)', c: '#0f1419', slug: 'X' },
      { id: 'Reddit', c: '#FF4500', slug: 'Reddit' },
      { id: 'Telegram', c: '#24A1DE', slug: 'Telegram' }
    ];
    const seriesData = platforms.map(p => seriesFor(topic, range, region, p.slug));

    platforms.forEach((p, pIdx) => {
      const pData = seriesData[pIdx];
      const hist = pData.slice(0,n).map((v,i) => `${x(i)},${y(v)}`).join(' ');
      const pathEl = el('polyline',{points:hist,fill:'none',stroke:p.c,'stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
      svg.appendChild(pathEl);
      
      try {
        const len = (pathEl as SVGPolylineElement).getTotalLength() + 100;
        pathEl.style.strokeDasharray = `${len}`;
        pathEl.style.strokeDashoffset = isVisible ? '0' : `${len}`;
        if (isVisible) {
          pathEl.style.transition = 'none'; // reset just in case
          pathEl.getBoundingClientRect(); // reflow
          pathEl.style.strokeDashoffset = `${len}`;
          pathEl.getBoundingClientRect(); // reflow
          pathEl.style.transition = `stroke-dashoffset 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) ${pIdx * 0.15}s`;
          pathEl.style.strokeDashoffset = '0';
        }
      } catch(e) {}

      if (forecast) {
        const f = pData.slice(n-1,n+fc).map((v,i) => `${x(n-1+i)},${y(v)}`).join(' ');
        const forecastPath = el('polyline',{points:f,fill:'none',stroke:p.c,'stroke-width':2.5,'stroke-dasharray':'6 6',opacity: isVisible ? .6 : 0,'stroke-linecap':'round'});
        svg.appendChild(forecastPath);
        
        const band = pData.slice(n-1,n+fc);
        const up = band.map((v,i) => `${x(n-1+i)},${y(Math.min(100,v+i*1.8))}`);
        const dn = band.map((v,i) => `${x(n-1+i)},${y(Math.max(0,v-i*1.8))}`).reverse();
        const forecastPolygon = el('polygon',{points:up.concat(dn).join(' '),fill:p.c,opacity: isVisible ? .05 : 0});
        svg.appendChild(forecastPolygon);

        if (isVisible) {
          forecastPath.style.opacity = '0';
          forecastPolygon.style.opacity = '0';
          setTimeout(() => {
            forecastPath.style.transition = 'opacity 0.8s ease-out';
            forecastPolygon.style.transition = 'opacity 0.8s ease-out';
            forecastPath.style.opacity = '0.6';
            forecastPolygon.style.opacity = '0.05';
          }, 1000 + (pIdx * 100));
        }
      }
    });

    topic.events.forEach((e: any) => {
      const i = Math.round(e.at * (n-1));
      const m = el('polygon',{points:`${x(i)},${T+H+6} ${x(i)+6},${T+H+14} ${x(i)},${T+H+22} ${x(i)-6},${T+H+14}`,fill:C.blue,opacity:.9, class: 'node cursor-pointer'});
      m.addEventListener('mouseenter', (ev: any) => {
        const host = svg.parentElement!.getBoundingClientRect();
        setTip({
          x: ev.clientX - host.left,
          y: ev.clientY - host.top,
          html: `<p class="font-bold text-gray-900 mb-1">${e.t}</p><p class="text-gray-500">${labels[i]} · <span class="text-blue-600 font-medium">${e.v}</span></p>`
        });
      });
      m.addEventListener('mouseleave', () => setTip(null));
      svg.appendChild(m);
    });

    const hv = el('line',{x1:0,x2:0,y1:T,y2:T+H,stroke:'#cbd5e1','stroke-width':1.5,'stroke-dasharray':'4 4',opacity:0,style:'transition: all 0.1s; pointer-events: none;'});
    svg.appendChild(hv);
    
    const dots = platforms.map(p => {
      const dot = el('circle',{r:4,fill:p.c,stroke:'#fff','stroke-width':1.5,opacity:0,style:'transition: all 0.1s; pointer-events: none;'});
      svg.appendChild(dot);
      return dot;
    });

    const over = el('rect',{x:L,y:T,width:W,height:H,fill:'transparent',style:'cursor: crosshair;'});
    svg.appendChild(over);

    over.addEventListener('mousemove', (ev: any) => {
      const r = svg.getBoundingClientRect();
      const vx = (ev.clientX - r.left) / r.width * 1000;
      let i = Math.round((vx - L) / W * (total - 1));
      i = Math.max(0, Math.min(total - 1, i));
      
      hv.setAttribute('x1', String(x(i))); hv.setAttribute('x2', String(x(i))); hv.setAttribute('opacity', '1');
      
      let tooltipRows = '';
      platforms.forEach((p, pIdx) => {
        const val = seriesData[pIdx][i];
        dots[pIdx].setAttribute('cx', String(x(i))); 
        dots[pIdx].setAttribute('cy', String(y(val))); 
        dots[pIdx].setAttribute('opacity', '1');
        tooltipRows += `<div class="flex justify-between items-center gap-4 mt-1.5 text-[11px]"><span class="flex items-center gap-1.5 text-gray-600"><span class="w-1.5 h-1.5 rounded-full" style="background:${p.c}"></span> ${p.id}</span><span class="font-bold text-gray-900">${Math.round(val)}</span></div>`;
      });
      
      const lbl = i < n ? labels[i] : `+${i - n + 1} ${R.step} ahead`;
      const host = svg.parentElement!.getBoundingClientRect();
      setTip({
        x: ev.clientX - host.left,
        y: ev.clientY - host.top,
        html: `<p class="font-bold text-gray-500 mb-2 border-b border-gray-100 pb-1.5">${lbl}${i>=n?' <span class="text-blue-600 font-normal ml-1">· Predicted</span>':''}</p>${tooltipRows}`
      });
    });
    over.addEventListener('mouseleave', () => {
      hv.setAttribute('opacity', '0');
      dots.forEach(d => d.setAttribute('opacity', '0'));
      setTip(null);
    });
  }, [topic, range, region, forecast, isVisible]);

  const d = seriesFor(topic, range, region);
  const R = RANGES.find(r => r.id === range)!;
  
  const peakSpark = d.slice(R.n-6, R.n+6).map((v, i, arr) => {
    const min = Math.min(...arr), max = Math.max(...arr), h = 11;
    return `${(i / (arr.length - 1) * 18).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`;
  }).join(' ');

  const volSpark = d.slice(0, R.n).map((v, i, arr) => {
    const min = Math.min(...arr), max = Math.max(...arr), h = 11;
    return `${(i / (arr.length - 1) * 18).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`;
  }).join(' ');

  const forecastPeakIndex = Math.round(Math.max(...d.slice(R.n - 1, R.n + 6)));

  return (
    <>
      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-5">
        <div className="bg-white border border-[#d2e3fc] px-3 py-1.5 rounded-xl flex items-center gap-2.5 shadow-none">
          <span className="flex items-center h-full">
            <svg width="18" height="11" className="overflow-visible"><polyline points={peakSpark} fill="none" stroke="#1a73e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="text-[#1a73e8] font-bold text-[10.5px] uppercase tracking-[0.06em]">Projected Peak:</span>
          <span className="text-gray-900 font-bold text-[12px] tnum">{forecastPeakIndex} / 100 INDEX</span>
        </div>
        <div className="bg-white border border-[#d2e3fc] px-3 py-1.5 rounded-xl flex items-center gap-2.5 shadow-none">
          <span className="flex items-center h-full">
            <svg width="18" height="11" className="overflow-visible"><polyline points={volSpark} fill="none" stroke="#1a73e8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="text-[#1a73e8] font-bold text-[10.5px] uppercase tracking-[0.06em]">Projected:</span>
          <span className="text-gray-900 font-bold text-[12px] tnum">{fmt(volOf(topic, null, region) * 1.12)} MENTIONS/DAY</span>
        </div>
      </div>
      <div ref={containerRef} className="relative bg-white rounded-xl border border-gray-100 px-2 sm:px-4 pt-4 pb-2 shadow-sm interactive-card">
        <svg ref={svgRef} viewBox="0 0 1000 270" style={{ width: '100%', height: 'auto', aspectRatio: '1000/270', overflow: 'visible' }}></svg>
        
        <div className="flex items-center justify-center lg:justify-start mt-2 pt-2.5 border-t border-gray-50/80 px-2">
          <p className="text-[11.5px] text-gray-400 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a73e8] inline-block shadow-sm"></span>
            Markers flag spikes the timeline builder caught — hover one for the trigger post.
          </p>
        </div>

        {tip && (
          <div
            className="absolute z-20 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs min-w-[130px] transition-all duration-100 ease-out"
            style={{ left: Math.min(tip.x + 16, 600), top: tip.y - 20 }}
            dangerouslySetInnerHTML={{ __html: tip.html }}
          ></div>
        )}
      </div>
    </>
  );
}
