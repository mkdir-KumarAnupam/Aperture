"use client";

import { TRENDING_RIBBON_ITEMS } from "@/data/trends";

export default function TrendingRibbon() {
  // Duplicate items for seamless loop
  const items = [...TRENDING_RIBBON_ITEMS, ...TRENDING_RIBBON_ITEMS];

  return (
    <div
      className="w-full overflow-hidden border-b"
      style={{ background: "var(--navy)", borderColor: "#1E3040" }}
      role="marquee"
      aria-label="Currently trending topics"
    >
      <div className="ribbon-track py-2">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center text-xs font-semibold tracking-widest uppercase px-6"
            style={{ color: "#B8D4E8", whiteSpace: "nowrap" }}
          >
            {item}
            <span className="ml-6 text-gray-600">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
