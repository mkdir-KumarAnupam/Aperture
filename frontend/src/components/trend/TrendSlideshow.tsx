"use client";

import { useState, useEffect } from "react";
import { TrendAnalytics } from "@/data/types";
import { PlatformIcon } from "@/components/ui/SectionHeader";

interface TrendSlideshowProps {
  trend: TrendAnalytics;
}

const PLATFORM_LABELS = { x: "X", reddit: "Reddit", telegram: "Telegram" };

export default function TrendSlideshow({ trend }: TrendSlideshowProps) {
  const [current, setCurrent] = useState(0);
  const posts = trend.posts;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % posts.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [posts.length]);

  const post = posts[current];

  return (
    <div className="flex flex-col flex-1 justify-between h-full">
      {/* Post card */}
      <div className="post-card flex-1 flex flex-col justify-between gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{
              background:
                post.platform === "x"
                  ? "var(--navy)"
                  : post.platform === "reddit"
                  ? "#B87333"
                  : "#2B6CB0",
            }}
          >
            {post.handle[1]?.toUpperCase() ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "var(--navy)" }}>
              {post.handle}
            </p>
            <div className="flex items-center gap-1">
              <span className={`platform-chip chip-${post.platform}`}>
                <PlatformIcon platform={post.platform} size={9} />
                {PLATFORM_LABELS[post.platform]}
              </span>
              <span className="text-xs" style={{ color: "var(--slate)" }}>{post.timestamp}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--slate)" }}>
          {post.content}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: "#F0F4F8" }}>
          <span className="text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <strong style={{ color: "var(--navy)" }}>{post.likes}</strong>
          </span>
          {post.reposts && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <strong style={{ color: "var(--navy)" }}>{post.reposts}</strong>
            </span>
          )}
          <span className="ml-auto text-xs" style={{ color: "var(--slate)" }}>
            Simulated post
          </span>
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2 mt-3">
        {posts.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === current ? "20px" : "6px",
              height: "6px",
              background: i === current ? "var(--accent-blue)" : "var(--soft-blue)",
            }}
            aria-label={`View post ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
