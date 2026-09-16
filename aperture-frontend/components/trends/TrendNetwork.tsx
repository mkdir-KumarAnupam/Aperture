"use client";

import { useEffect, useState, useRef } from "react";
import { rng, hash, C } from "@/lib/data";

export function TrendNetwork({ topic, range }: { topic: any; range: string }) {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [netStep, setNetStep] = useState<number>(100);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const r = rng(hash(topic.id + range));
    const numNodes = 24;
    const comms = ['c1', 'c2', 'c3', 'c4'];
    const colors = [C.blue, C.green, C.yellow, C.purple];

    const newNodes = [];
    for(let i=0; i<numNodes; i++) {
      const isHub = i < 3;
      const commIdx = isHub ? i : Math.floor(r() * comms.length);
      newNodes.push({
        id: i,
        x: 60 + r() * 500,
        y: 40 + r() * 240,
        r: isHub ? 12 + r()*8 : 4 + r()*4,
        c: colors[commIdx],
        step: i === 0 ? 0 : Math.floor(r() * 100),
      });
    }

    const newEdges = [];
    for(let i=0; i<numNodes*1.4; i++) {
      const s = newNodes[Math.floor(r()*numNodes)];
      const tg = newNodes[Math.floor(r()*numNodes)];
      if(s !== tg) {
        const eStep = Math.max(s.step, tg.step) + Math.floor(r() * 10);
        newEdges.push({ s, tg, step: Math.min(100, eStep) });
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setNetStep(100);
  }, [topic.id, range]);

  const handlePlay = () => {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    setNetStep(0);
    setIsPlaying(true);
    playIntervalRef.current = setInterval(() => {
      setNetStep((prev) => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(playIntervalRef.current!);
          setIsPlaying(false);
          return 100;
        }
        return next;
      });
    }, 40);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    setIsPlaying(false);
    setNetStep(parseInt(e.target.value));
  };

  const seedLabel = `Seed: @user_${Math.floor(rng(hash(topic.id))() * 9999)}`;

  return (
    <>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">How it spread</h2>
        <button
          onClick={handlePlay}
          className="text-[11px] font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors shrink-0 flex items-center gap-1.5"
        >
          {isPlaying ? "Playing..." : "Replay spread"}
        </button>
      </div>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">Minimalist representation of top influence hubs across communities. Scrub the timeline to view progression.</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 relative overflow-hidden interactive-card">
        <div className="w-full min-h-[320px] flex items-center justify-center p-4">
          <svg viewBox="0 0 620 320" style={{ width: '100%', height: 'auto', aspectRatio: '620/320' }}>
            <defs>
              <pattern id="netGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f1f3f4" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#netGrid)" />
            
            {edges.map((e, i) => (
              <line
                key={`e${i}`}
                x1={e.s.x} y1={e.s.y} x2={e.tg.x} y2={e.tg.y}
                stroke="#e8eaed" strokeWidth="1" className="net-edge"
                style={{ opacity: e.step <= netStep ? 0.8 : 0, transition: 'opacity 0.2s ease' }}
              />
            ))}
            
            {nodes.map((n, i) => {
              const isSeed = i === 0;
              const isVisible = n.step <= netStep;
              return (
                <circle
                  key={`n${i}`}
                  cx={n.x} cy={n.y} r={n.r} fill={n.c}
                  className={`net-node cursor-pointer ${isVisible ? 'floating' : ''}`}
                  stroke={isSeed ? C.yellow : '#ffffff'}
                  strokeWidth={isSeed ? 3 : 1.5}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'scale(1)' : 'scale(0.5)',
                    transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transformOrigin: `${n.x}px ${n.y}px`,
                    animationDelay: `${Math.random() * 200}ms`
                  }}
                />
              );
            })}
          </svg>
        </div>
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            <span>Origin</span>
            <span>{netStep === 100 ? 'Window complete' : `Progression: ${netStep}%`}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={netStep}
            onChange={handleScrub}
            className="w-full"
          />
          <p className="text-[11px] text-gray-500 mt-2 font-medium flex items-center">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: C.yellow }}></span>
            {seedLabel}
          </p>
        </div>
      </div>
    </>
  );
}
