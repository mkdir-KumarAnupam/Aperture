"use client";

import TrendingRibbon from "./TrendingRibbon";
import TrendSearch from "./TrendSearch";
import HotTrends from "./HotTrends";

interface HeroProps {
  activeTrendId: string | null;
  onSelectTrend: (id: string) => void;
}

export default function Hero({ activeTrendId, onSelectTrend }: HeroProps) {
  return (
    <section id="section-hero" className="relative overflow-hidden">
      <TrendingRibbon />

      <div
        className="hero-panel relative"
        style={{
          background:
            "linear-gradient(160deg, var(--bg) 0%, var(--secondary) 60%, var(--soft-blue) 100%)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, #DCE7EF 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.4,
          }}
        />

        <div className="relative section-wide h-full py-5 sm:py-7 flex flex-col items-center text-center">
          <h1 className="hero-heading text-4xl sm:text-5xl lg:text-6xl mb-4 max-w-3xl">
            <span style={{ color: "var(--navy)" }}>Understand what</span>
            <br />
            <span className="gradient-text">India is talking about.</span>
          </h1>

          <p className="text-sm font-semibold mb-3" style={{ color: "var(--accent-blue)" }}>
            Search a trend or choose one below to begin your analysis.
          </p>
          <div className="w-full max-w-3xl mx-auto mb-5">
            <TrendSearch onSelect={onSelectTrend} />
          </div>

          <div className="w-full">
            <HotTrends activeTrendId={activeTrendId} onSelect={onSelectTrend} />
          </div>
        </div>
      </div>
    </section>
  );
}
