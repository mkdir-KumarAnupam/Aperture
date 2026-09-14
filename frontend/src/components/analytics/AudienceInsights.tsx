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
const GENDER_COLORS: Record<string, string> = {
  Male: "#3B759E",
  Female: "#D96B54",
  Other: "#D9822B",
};

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
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#EBF3FA] flex items-center justify-center text-[#3B759E] shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold leading-tight" style={{ color: "var(--navy)" }}>
          {title}
        </h3>
        <p className="text-[11px] sm:text-xs mt-0.5 text-slate-500">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// ── Reusable Key Takeaway Side-Card ───────────────────────────────────────────
function KeyTakeawayCard({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="bg-[#F8FAFC] border border-[#EEF2F6] rounded-xl p-3 sm:p-3.5 flex flex-col justify-center gap-2 h-full">
      <div className="flex items-center gap-1.5 text-[#3B759E]">
        {icon}
        <span className="text-xs font-bold text-[#1E293B]">Key Takeaway</span>
      </div>
      <p className="text-[11px] sm:text-xs leading-relaxed text-[#475569] font-medium">
        {text}
      </p>
    </div>
  );
}

// ── Card 1: Age Distribution (Top Left) ───────────────────────────────────────
function AgeDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const chartData = useMemo(() => {
    return trend.demographics.ageGender.map((b) => ({
      ageRange: b.ageRange,
      share: b.male + b.female + b.other,
    }));
  }, [trend.demographics.ageGender]);

  const topTwoAges = useMemo(() => {
    const sorted = [...chartData].sort((a, b) => b.share - a.share);
    return {
      top1: sorted[0]?.ageRange ?? "25–34",
      top2: sorted[1]?.ageRange ?? "18–24",
    };
  }, [chartData]);

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 h-full">
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

      <div className="flex-1 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
        {/* Bar chart */}
        <div className="flex-1 w-full min-w-0 h-[175px] sm:h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 8, left: -22, bottom: 0 }}
              barSize={18}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
              <XAxis
                dataKey="ageRange"
                tick={{ fontSize: 10, fill: "#64748B" }}
                axisLine={{ stroke: "#E2E8F0" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 24]}
                ticks={[0, 6, 12, 18, 24]}
                tick={{ fontSize: 9, fill: "#94A3B8" }}
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

        {/* Key Takeaway */}
        <div className="w-full sm:w-[35%] shrink-0 h-full">
          <KeyTakeawayCard
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.7 3.7 5.8.5.3.8.8.8 1.4V17h5v-.8c0-.6.3-1.1.8-1.4C17.5 13.7 19 11.5 19 9a7 7 0 0 0-7-7z" />
              </svg>
            }
            text={`The largest share of engagement comes from ${topTwoAges.top1} year olds, followed by ${topTwoAges.top2} year olds.`}
          />
        </div>
      </div>
    </div>
  );
}

// ── Card 2: Gender Distribution (Top Right) ───────────────────────────────────
function GenderDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const { genderData, dominantGender, dominantPercent } = useMemo(() => {
    const raw = trend.demographics.ageGender;
    const totalMale = raw.reduce((sum, b) => sum + b.male, 0);
    const totalFemale = raw.reduce((sum, b) => sum + b.female, 0);
    const totalOther = raw.reduce((sum, b) => sum + b.other, 0);
    const total = totalMale + totalFemale + totalOther || 100;

    const malePct = Math.round((totalMale / total) * 100);
    const femalePct = Math.round((totalFemale / total) * 100);
    const otherPct = Math.max(0, 100 - malePct - femalePct);

    const items = [
      { name: "Male", value: malePct, color: GENDER_COLORS.Male },
      { name: "Female", value: femalePct, color: GENDER_COLORS.Female },
      { name: "Other", value: otherPct, color: GENDER_COLORS.Other },
    ];

    const dominant = items.reduce((prev, curr) => (curr.value > prev.value ? curr : prev), items[0]);

    return {
      genderData: items,
      dominantGender: dominant.name.toLowerCase(),
      dominantPercent: dominant.value,
    };
  }, [trend.demographics.ageGender]);

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 h-full">
      <CardHeader
        title="Gender Distribution"
        subtitle="Audience share by gender"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v6" />
            <path d="M12 16v6" />
            <path d="M4.93 4.93l4.24 4.24" />
            <path d="M14.83 14.83l4.24 4.24" />
            <path d="M14 16h6" />
            <path d="M17 13v6" />
          </svg>
        }
      />

      <div className="flex-1 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
        {/* Donut chart */}
        <div className="w-[170px] h-[170px] sm:w-[200px] sm:h-[200px] shrink-0 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                innerRadius={59}
                outerRadius={89}
                paddingAngle={1.5}
                dataKey="value"
                isAnimationActive={true}
                animationBegin={100}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {genderData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} stroke="#FFFFFF" strokeWidth={1.5} />
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
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center"
          >
            <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color: "var(--navy)" }}>
              {dominantPercent}%
            </span>
            <span className="text-xs sm:text-sm font-bold capitalize text-slate-500 mt-1">
              {dominantGender}
            </span>
          </motion.div>
        </div>

        {/* Legend with percentages */}
        <div className="flex flex-col justify-center gap-2 min-w-[95px] shrink-0">
          {genderData.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-[#64748B]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                {item.name}
              </span>
              <span className="font-bold text-[#1E293B]">{item.value}%</span>
            </div>
          ))}
        </div>

        {/* Key Takeaway */}
        <div className="w-full sm:w-[35%] shrink-0 h-full ml-auto">
          <KeyTakeawayCard
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            text={`The conversation is predominantly driven by a ${dominantGender} audience, with ${dominantPercent}% share.`}
          />
        </div>
      </div>
    </div>
  );
}

// ── Card 3: Language Distribution (Bottom Left) ───────────────────────────────
function LanguageDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const languages = trend.demographics.languages;
  const sorted = useMemo(() => [...languages].sort((a, b) => b.share - a.share), [languages]);
  const topLang = sorted[0] ?? { language: "English", share: 48 };
  const secondLang = sorted[1] ?? { language: "Hindi", share: 22 };

  const renderSliceBadge = (props: PieLabelRenderProps) => {
    const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
    if (percent < 0.07) return null;
    const RADIAN = Math.PI / 180;
    const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.5;
    const x = Number(cx) + radius * Math.cos(-midAngle * RADIAN);
    const y = Number(cy) + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={700}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 h-full">
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

      <div className="flex-1 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
        {/* Donut chart */}
        <div className="w-[170px] h-[170px] sm:w-[200px] sm:h-[200px] shrink-0 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={languages}
                cx="50%"
                cy="50%"
                innerRadius={59}
                outerRadius={89}
                paddingAngle={1.5}
                dataKey="share"
                nameKey="language"
                labelLine={false}
                label={renderSliceBadge}
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
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center"
          >
            <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color: "var(--navy)" }}>
              {topLang.share}%
            </span>
            <span className="text-xs sm:text-sm font-bold leading-tight mt-1" style={{ color: "var(--navy)" }}>
              {topLang.language}
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-0.5">
              Most used
            </span>
          </motion.div>
        </div>

        {/* Legend with percentages */}
        <div className="flex flex-col justify-center gap-1.5 min-w-[105px] shrink-0">
          {languages.slice(0, 6).map((item, i) => (
            <div key={item.language} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-[#64748B] truncate max-w-[70px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LANG_COLORS[i % LANG_COLORS.length] }} />
                {item.language}
              </span>
              <span className="font-bold text-[#1E293B]">{item.share}%</span>
            </div>
          ))}
        </div>

        {/* Key Takeaway */}
        <div className="w-full sm:w-[35%] shrink-0 h-full ml-auto">
          <KeyTakeawayCard
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            text={`Conversations are largely in ${topLang.language}, followed by ${secondLang.language} and regional languages.`}
          />
        </div>
      </div>
    </div>
  );
}

// ── Card 4: Regional Distribution (Bottom Right) ──────────────────────────────
function RegionalDistributionCard({ trend }: { trend: TrendAnalytics }) {
  const topRegions = useMemo(
    () => [...trend.demographics.regions].sort((a, b) => b.share - a.share).slice(0, 5),
    [trend.demographics.regions]
  );

  const top3Names = topRegions.slice(0, 3).map((r) => r.state);

  return (
    <div className="card flex flex-col justify-between p-4 sm:p-5 h-full">
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

      <div className="flex-1 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
        {/* Progress bars */}
        <div className="flex-1 w-full min-w-0 flex flex-col justify-center gap-2 sm:gap-2.5">
          {topRegions.map((region, i) => (
            <div key={region.state}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: "var(--navy)" }}>
                  {region.state}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {region.mentions}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-[#EEF2F6]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${region.share}%`,
                    background: REGION_COLORS[i % REGION_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Key Takeaway */}
        <div className="w-full sm:w-[35%] shrink-0 h-full">
          <KeyTakeawayCard
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10" />
                <path d="M12 20V4" />
                <path d="M6 20v-6" />
              </svg>
            }
            text={`Highest activity from ${top3Names[0] || "lead states"}, ${top3Names[1] || ""} and ${top3Names[2] || ""}. State-level details available in the Regional Intelligence section.`}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Slide Component (2x2 Bento Box Grid) ─────────────────────────────────
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

      {/* ── 2x2 Bento Box Grid (Strictly preserving original container bounds) ─── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
        style={{ minHeight: "clamp(560px, 76vh, 660px)" }}
      >
        <AgeDistributionCard trend={trend} />
        <GenderDistributionCard trend={trend} />
        <LanguageDistributionCard trend={trend} />
        <RegionalDistributionCard trend={trend} />
      </div>
    </FadeInSection>
  );
}
