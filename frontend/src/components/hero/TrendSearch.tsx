"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ALL_TRENDS } from "@/data/trends";

interface TrendSearchProps {
  onSelect: (trendId: string) => void;
}

export default function TrendSearch({ onSelect }: TrendSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_TRENDS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [query]);

  const showSuggestions = isOpen && suggestions.length > 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (id: string) => {
    setQuery("");
    setIsOpen(false);
    onSelect(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) handleSelect(suggestions[0].id);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          {/* Search icon */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--slate)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <input
            ref={inputRef}
            id="trend-search"
            type="text"
            role="combobox"
            className="search-input"
            placeholder="Search for a trend..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setIsOpen(true);
            }}
            autoComplete="off"
            aria-label="Search for a trend"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            aria-controls="trend-suggestions-list"
          />
          {query && (
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: "var(--slate)" }}
              onClick={() => {
                setQuery("");
                setIsOpen(false);
              }}
              aria-label="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Dropdown */}
      {showSuggestions && (
        <div
          id="trend-suggestions-list"
          className="absolute top-full left-0 right-0 mt-2 rounded-xl border shadow-lg z-50 overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "#E2E8F0" }}
          role="listbox"
          aria-label="Trend suggestions"
        >
          {suggestions.map((trend) => (
            <button
              key={trend.id}
              role="option"
              aria-selected={false}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
              onClick={() => handleSelect(trend.id)}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--secondary)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--accent-blue)" }}>
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                  <polyline points="16 7 22 7 22 13"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{trend.name}</p>
                <p className="text-xs" style={{ color: "var(--slate)" }}>{trend.category}</p>
              </div>
              <span className="ml-auto text-xs font-bold" style={{ color: "var(--accent-green)" }}>{trend.growthPercent}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
