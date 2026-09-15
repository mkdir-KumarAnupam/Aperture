"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  PieLabelRenderProps,
} from "recharts";
import { TrendAnalytics } from "@/data/types";
import { FadeInSection } from "@/components/ui/SectionHeader";

// ── Curated Color Palettes ────────────────────────────────────────────────────
const LANG_COLORS = ["#3B759E", "#4A9E79", "#D9822B", "#D96B54", "#7B68A4", "#52616B"];
const REGION_COLORS = ["#3B759E", "#4A9E79", "#D9822B", "#7B68A4", "#52616B"];

// ── Reusable Card Header ──────────────────────────────────────────────────────
function CardHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EBF3FA] flex items-center justify-center text-[#3B759E] shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm sm:text-base font-bold leading-tight" style={{ color: "var(--navy)" }}>
          {title}
        </h3>
        <p className="text-[11px] sm:text-xs mt-0.5 text-slate-500">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// ── Card 1: Age Distribution ──────────────────────────────────────────────────
function AgeDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const chartData = useMemo(() => {
    return trend.demographics.ageGender.map((b) => ({
      ageRange: b.ageRange,
      share: Math.round((b.male + b.female + b.other) * 10) / 10,
    }));
  }, [trend.demographics.ageGender]);

  const yConfig = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.share), 10);
    if (maxVal <= 24) {
      return { domain: [0, 24], ticks: [0, 6, 12, 18, 24] };
    }
    const ceilMax = Math.ceil(maxVal / 10) * 10;
    const step = ceilMax / 4;
    return {
      domain: [0, ceilMax],
      ticks: [0, step, step * 2, step * 3, ceilMax],
    };
  }, [chartData]);

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 lg:p-6 h-full">
      <CardHeader
        title="Age Distribution"
        subtitle="Audience share across age groups"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />

      {/* Bar chart spanning full card width and filling vertical height cleanly */}
      <div className="flex-1 w-full min-w-0 flex flex-col justify-center my-auto py-2">
        <div className="w-full h-[380px] sm:h-[430px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 10, left: -22, bottom: 0 }}
              barSize={36}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
              <XAxis
                dataKey="ageRange"
                tick={{ fontSize: 11, fill: "#64748B" }}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
              />
              <YAxis
                domain={yConfig.domain}
                ticks={yConfig.ticks}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "11px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                }}
                formatter={(val) => [`${val}%`, "Audience Share"]}
              />
              <Bar
                dataKey="share"
                name="Share"
                fill="#3B759E"
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const SliceLabel = (props: PieLabelRenderProps) => {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, value, percent } = props;
  const shareVal = typeof value === "number" ? value : (percent != null ? Math.round(Number(percent) * 100) : 0);
  if (!shareVal || shareVal < 4) return null;
  const RADIAN = Math.PI / 180;
  const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.52;
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN);
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
    >
      {`${shareVal}%`}
    </text>
  );
};

// ── Card 2: Language Distribution ─────────────────────────────────────────────
function LanguageDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const languages = trend.demographics.languages;
  const sorted = useMemo(() => [...languages].sort((a, b) => b.share - a.share), [languages]);
  const topLang = sorted[0] ?? { language: "English", share: 48 };

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 lg:p-6 h-full">
      <CardHeader
        title="Language Distribution"
        subtitle="Primary language of posts and discussions"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        }
      />

      {/* Donut chart + Legend filling middle space comfortably */}
      <div className="flex-1 w-full min-w-0 flex items-center justify-between gap-2 sm:gap-3 my-auto py-4">
        {/* Donut chart */}
        <div className="w-[220px] h-[220px] sm:w-[250px] sm:h-[250px] xl:w-[265px] xl:h-[265px] shrink-0 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={languages}
                cx="50%"
                cy="50%"
                innerRadius={66}
                outerRadius={114}
                paddingAngle={1.5}
                dataKey="share"
                nameKey="language"
                labelLine={false}
                label={SliceLabel}
                isAnimationActive={true}
                animationBegin={100}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {languages.map((_, i) => (
                  <Cell key={i} fill={LANG_COLORS[i % LANG_COLORS.length]} stroke="#FFFFFF" strokeWidth={1.5} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(val) => [`${val}%`, "Share"]}
              />
            </PieChart>
          </ResponsiveContainer>

          <motion.div
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1"
          >
            <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color: "var(--navy)" }}>
              {topLang.share}%
            </span>
            <span className="text-xs sm:text-sm font-bold leading-tight mt-1" style={{ color: "var(--navy)" }}>
              {topLang.language}
            </span>
            <span className="text-[10px] text-slate-400 font-medium mt-0.5">
              Most used language
            </span>
          </motion.div>
        </div>

        {/* Legend shifted right with compact, tidy gap to percentages */}
        <div className="flex flex-col justify-center gap-3.5 sm:gap-4 shrink-0 ml-auto w-[110px] sm:w-[120px] pr-0.5">
          {languages.slice(0, 6).map((item, i) => (
            <div key={item.language} className="flex items-center justify-between gap-2.5 text-xs sm:text-[13px]">
              <span className="flex items-center gap-2 text-[#64748B] min-w-0 flex-1">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0" style={{ background: LANG_COLORS[i % LANG_COLORS.length] }} />
                <span className="truncate font-medium">{item.language}</span>
              </span>
              <span className="font-bold text-[#1E293B] shrink-0 tabular-nums">{item.share}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Card 3: Regional Distribution ─────────────────────────────────────────────
function RegionalDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const topRegions = useMemo(
    () => [...trend.demographics.regions].sort((a, b) => b.share - a.share).slice(0, 5),
    [trend.demographics.regions]
  );

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 lg:p-6 h-full">
      <CardHeader
        title="Regional Distribution"
        subtitle="Top 5 states by trend activity (relative score)"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        }
      />

      {/* 5 State Progress bars filling vertical space comfortably */}
      <div className="flex-1 w-full min-w-0 flex flex-col justify-center gap-6 sm:gap-7 my-auto py-4">
        {topRegions.map((region, i) => (
          <motion.div
            key={region.state}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: "easeOut" }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-semibold" style={{ color: "var(--navy)" }}>
                {region.state}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {region.mentions}
              </span>
            </div>
            <div className="h-3 sm:h-3.5 rounded-full overflow-hidden bg-[#EEF2F6]">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: `${region.share}%` }}
                transition={{
                  duration: 0.85,
                  delay: 0.15 + i * 0.08,
                  ease: "easeOut",
                }}
                style={{
                  background: REGION_COLORS[i % REGION_COLORS.length],
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Main Slide Component (3-Column Layout, Height Strictly Preserved) ──────────
export default function AudienceInsights({ trend }: { trend: TrendAnalytics }) {
  return (
    <FadeInSection
      id="section-audience"
      className="section-wide analytics-content"
    >
      {/* ── Slide Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-3">
        <div>
          <span className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-slate-400 block mb-0.5">
            AUDIENCE INSIGHTS
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: "var(--navy)" }}>
            Who is engaging with this trend?
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--slate)" }}>
            A detailed look at the people, languages, and regions driving the conversation.
          </p>
        </div>

        {/* Audience Metric Pill Card */}
        <div className="flex items-center gap-5 bg-white border border-slate-200/80 rounded-2xl px-4 py-2 sm:px-5 sm:py-2.5 shadow-2xs shrink-0 self-start md:self-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#EBF3FA] flex items-center justify-center text-[#3B759E] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black leading-none" style={{ color: "var(--navy)" }}>
                {trend.approximateReach}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                Estimated unique audience
              </p>
            </div>
          </div>

          <div className="w-px h-7 sm:h-8 bg-slate-200" />

          <div>
            <div className="flex items-center gap-1 text-emerald-600 font-bold text-base sm:text-lg leading-none">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              <span>{trend.growthPercent}</span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
              vs. previous 30 days
            </p>
          </div>
        </div>
      </div>

      {/* ── 3-Column Bento Grid (Strictly preserving original container bounds) ─── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5 items-stretch"
        style={{ minHeight: "clamp(560px, 76vh, 660px)" }}
      >
        <AgeDistributionCard trend={trend} />
        <LanguageDistributionCard trend={trend} />
        <RegionalDistributionCard trend={trend} />
      </div>
    </FadeInSection>
  );
}
