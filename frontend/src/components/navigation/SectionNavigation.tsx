"use client";

import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { label: "Overview", id: "section-overview" },
  { label: "Momentum", id: "section-momentum" },
  { label: "Audience", id: "section-audience" },
  { label: "Sentiment", id: "section-sentiment" },
  { label: "Influence", id: "section-influence" },
  { label: "Regional", id: "section-regional" },
];

export default function SectionNavigation({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      setActiveId("");
      return;
    }

    // Show nav after hero
    const heroEl = document.getElementById("section-hero");
    const navObserver = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    if (heroEl) navObserver.observe(heroEl);

    // Track active section
    const sectionIds = NAV_ITEMS.map((n) => n.id);
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { threshold: 0.3, rootMargin: "-60px 0px -40% 0px" }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => {
      navObserver.disconnect();
      observerRef.current?.disconnect();
    };
  }, [enabled]);

  if (!enabled) return null;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className={`sticky-nav ${visible ? "visible" : ""}`} role="navigation" aria-label="Section navigation">
      <div className="section-wide">
        <div className="flex items-center h-12 gap-1 overflow-x-auto">
          {/* Logo mark */}
          <div className="flex items-center gap-2 mr-4 shrink-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "var(--navy)" }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.5"/>
                <circle cx="6" cy="6" r="1.5" fill="white"/>
              </svg>
            </div>
            <span
              className="text-xs font-bold tracking-wide hidden sm:block"
              style={{ color: "var(--navy)" }}
            >
              TrendScope
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 mr-3 shrink-0 hidden sm:block" />

          {/* Nav items */}
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 shrink-0"
              style={{
                color: activeId === item.id ? "white" : "var(--slate)",
                background:
                  activeId === item.id ? "var(--accent-blue)" : "transparent",
              }}
              aria-current={activeId === item.id ? "true" : undefined}
            >
              {item.label}
            </button>
          ))}

          {/* Prototype badge */}
          <div className="ml-auto shrink-0 hidden md:block">
            <span className="prototype-badge">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <circle cx="4" cy="4" r="3" fill="#F59E0B"/>
              </svg>
              Prototype · Simulated
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
