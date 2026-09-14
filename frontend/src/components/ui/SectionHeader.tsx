"use client";

import { useEffect, useRef, useState } from "react";

interface SectionHeaderProps {
  trendName: string;
  sectionName: string;
}

export function SectionHeader({ trendName, sectionName }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-3 sm:mb-4 flex-wrap">
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full border"
        style={{
          color: "var(--navy)",
          borderColor: "var(--soft-blue)",
          background: "var(--secondary)",
        }}
      >
        {trendName}
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-300">
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="section-label">{sectionName}</span>
    </div>
  );
}

interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function FadeInSection({ children, className = "", id }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <div
      ref={ref}
      id={id}
      className={`fade-in-section ${visible ? "visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// Platform icon
export function PlatformIcon({ platform, size = 14 }: { platform: "x" | "reddit" | "telegram"; size?: number }) {
  if (platform === "x") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.635 5.903-5.635zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }
  if (platform === "reddit") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

// Sentiment color
export function sentimentColor(sentiment: "positive" | "neutral" | "negative") {
  if (sentiment === "positive") return "var(--accent-green)";
  if (sentiment === "negative") return "var(--accent-coral)";
  return "var(--accent-amber)";
}

// Platform color
export function platformColor(platform: "x" | "reddit" | "telegram") {
  if (platform === "x") return "var(--x-color)";
  if (platform === "reddit") return "var(--reddit-color)";
  return "var(--telegram-color)";
}

// Growth indicator
export function GrowthBadge({ value }: { value: string }) {
  const isPositive = value.startsWith("+");
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        color: isPositive ? "var(--accent-green)" : "var(--accent-coral)",
        background: isPositive ? "#5A9E7C18" : "#C4614A18",
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d={isPositive ? "M4 6V2M2 4l2-2 2 2" : "M4 2v4M2 4l2 2 2-2"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {value}
    </span>
  );
}
