"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { TOPICS, REGIONS, RANGES } from "@/lib/data";
import { TrendSidebar } from "@/components/trends/TrendSidebar";
import { TrendArticle } from "@/components/trends/TrendArticle";

function TrendsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTopic = searchParams.get("topic");
  
  const initialTopic = TOPICS.find((t) => t.id === rawTopic) ? rawTopic : "genai";

  const [topicId, setTopicId] = useState<string>(initialTopic as string);
  const [range, setRange] = useState<string>("30D");
  const [region, setRegion] = useState<string>("All India");
  const [forecast, setForecast] = useState<boolean>(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [isPresentation, setIsPresentation] = useState<boolean>(false);
  const [curSlide, setCurSlide] = useState<number>(0);
  const totalSlides = 8;

  // Sync URL to topicId
  useEffect(() => {
    if (rawTopic && rawTopic !== topicId && TOPICS.some((t) => t.id === rawTopic)) {
      setTopicId(rawTopic);
    }
  }, [rawTopic]);

  useEffect(() => {
    if (isPresentation) {
      document.body.classList.add("presentation-mode");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.body.classList.remove("presentation-mode");
      const slides = document.querySelectorAll(".slide-panel");
      slides.forEach((s) => s.classList.remove("active-slide", "past-slide"));
    }
    return () => {
      document.body.classList.remove("presentation-mode");
    };
  }, [isPresentation]);

  useEffect(() => {
    if (!isPresentation) return;
    const slides = document.querySelectorAll(".slide-panel");
    slides.forEach((s, i) => {
      s.classList.remove("active-slide", "past-slide");
      if (i === curSlide) {
        s.classList.add("active-slide");
      } else if (i < curSlide) {
        s.classList.add("past-slide");
      }
    });
  }, [isPresentation, curSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPresentation) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setCurSlide((prev) => Math.min(totalSlides - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsPresentation(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresentation, totalSlides]);

  const setTopicWithUrl = (id: string) => {
    setTopicId(id);
    setSelectedState(null);
    router.replace(`/trends?topic=${id}`);
  };

  const topic = TOPICS.find((t) => t.id === topicId) || TOPICS[0];

  return (
    <>
      {/* Presentation Mode Elements */}
      <div id="presentProgress">
        <div
          id="presentProgressBar"
          style={{ width: `${((curSlide + 1) / totalSlides) * 100}%` }}
        ></div>
      </div>
      <button
        id="exitPresentBtn"
        onClick={() => setIsPresentation(false)}
        className="top-6 right-6 z-50 fixed flex items-center gap-2 bg-white hover:bg-gray-50 shadow-lg px-4 py-2 border border-gray-200 rounded-full font-bold text-gray-700 hover:text-red-600 text-xs uppercase tracking-widest transition-all cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
        Exit
      </button>
      <div
        id="presentNav"
        className="bottom-8 left-1/2 z-50 fixed flex items-center gap-4 bg-gray-900/90 shadow-2xl backdrop-blur px-3 py-2 rounded-full text-white -translate-x-1/2 translate-y-8 transform"
      >
        <button
          id="pPrev"
          onClick={() => setCurSlide((prev) => Math.max(0, prev - 1))}
          className="hover:bg-gray-700 p-2 rounded-full transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span id="pCount" className="w-12 font-bold text-[13px] text-gray-300 text-center tracking-widest tnum">
          {curSlide + 1} / {totalSlides}
        </span>
        <button
          id="pNext"
          onClick={() => setCurSlide((prev) => Math.min(totalSlides - 1, prev + 1))}
          className="hover:bg-gray-700 p-2 rounded-full transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <NavBar
        activeTab="Trends"
        rightSlot={
          <>
            <button
              id="presentBtn"
              onClick={() => {
                setCurSlide(0);
                setIsPresentation(true);
              }}
              className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-all duration-300 border border-gray-200/60 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Present
            </button>
            <div className="w-px h-4 bg-gray-200"></div>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setSelectedState(null);
              }}
              className="bg-white border border-gray-200 text-sm rounded-md px-3 py-1.5 text-gray-600 focus:border-blue-500 cursor-pointer transition-all duration-300 hover:border-gray-300"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="flex items-center bg-gray-50 border border-gray-100 rounded-lg p-1 text-sm font-medium text-gray-600">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  className={`px-3 py-1.5 rounded-md transition-all ease-in-out duration-300 ${
                    range === r.id ? "bg-white shadow-sm font-bold text-gray-900" : "hover:bg-gray-100"
                  }`}
                  onClick={() => setRange(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <main className="max-w-[1180px] mx-auto w-full px-6 py-12 transition-all duration-500" id="mainLayout">
        <header className="max-w-[720px] reveal in">
          <button onClick={() => router.push("/")} className="explore-link text-xs font-medium text-gray-400 hover:text-blue-600 transition-colors duration-300 flex items-center gap-1 w-fit mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Explore
          </button>
          <div className="header-meta flex items-center mt-4 mb-3">
            <p className="text-[11px] font-bold text-[#98a1a9] uppercase tracking-[0.1em] leading-none">
              <span>{topic.cat}</span> <span className="mx-1.5 text-[#e8eaed]">|</span> <span>SYNC 2S AGO</span>
            </p>
          </div>
          <h1 className="text-[2.8rem] leading-tight font-bold text-gray-900 mb-4 tracking-tight">
            {topic.name}
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">{topic.desc}</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-16 mt-14" id="splitLayout">
          <TrendSidebar
            topic={topic}
            range={range}
            region={region}
            selectedState={selectedState}
            onSelectTopic={setTopicWithUrl}
          />
          <TrendArticle
            topic={topic}
            range={range}
            region={region}
            forecast={forecast}
            setForecast={setForecast}
            selectedState={selectedState}
            setSelectedState={setSelectedState}
          />
        </div>
      </main>
    </>
  );
}

export default function TrendsPage() {
  return (
    <Suspense fallback={<div>Loading trends...</div>}>
      <TrendsContent />
    </Suspense>
  );
}
