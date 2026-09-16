"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { TOPICS, wavePath, fmt } from "@/lib/data";

export default function Home() {
  const router = useRouter();
  const [topicIndex, setTopicIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [swapState, setSwapState] = useState<"in" | "out">("in");

  const topic = TOPICS[topicIndex];
  const topicIndexRef = useRef(0);
  
  // Handlers for manual index change
  const handleSetTopic = (index: number) => {
    topicIndexRef.current = index;
    setSwapState("out");
    setTimeout(() => {
      setTopicIndex(index);
      setSearchTerm(TOPICS[index].label);
      setSwapState("in");
    }, 300);
  };

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (playing) {
      timer = setInterval(() => {
        setSwapState("out");
        setTimeout(() => {
          const next = (topicIndexRef.current + 1) % TOPICS.length;
          topicIndexRef.current = next;
          setTopicIndex(next);
          setSearchTerm(TOPICS[next].label);
          setSwapState("in");
        }, 300);
      }, 7000);
    }
    return () => clearInterval(timer);
  }, [playing]);

  // Initial reveal sync
  useEffect(() => {
    setRevealed(true);
    setSearchTerm(TOPICS[topicIndex].label);
    // Intersection Observer for scroll reveal
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("in");
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -50px 0px" });
    
    document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search input change
  useEffect(() => {
    topicIndexRef.current = topicIndex;
    setSearchTerm(TOPICS[topicIndex].label);
  }, [topicIndex]);

  const matchTopicId = (val: string) => {
    const lower = val.trim().toLowerCase();
    if (!lower) return TOPICS[topicIndex].id;
    const exact = TOPICS.find((t) => t.q === lower || t.label === lower);
    if (exact) return exact.id;
    const partial = TOPICS.find((t) => t.label.includes(lower) || lower.includes(t.label.split(" ")[0]));
    return partial ? partial.id : TOPICS[topicIndex].id;
  };

  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(`/trends?topic=${matchTopicId(searchTerm)}`);
    }
  };

  const dPath = wavePath(topic.shape);

  return (
    <>
      <NavBar activeTab="Overview" />
      
      {/* ── Hero ────────────────────────────────────────── */}
      <main className="relative flex flex-col flex-grow justify-between pt-20 pb-6 overflow-hidden">
        <div className="z-0 absolute inset-0 flex items-end pointer-events-none">
          <svg id="wave" viewBox="0 0 1000 400" preserveAspectRatio="none" className="w-full h-[380px]">
            <path id="wFill" d={`${dPath} L1000,400 L0,400 Z`} fill="rgba(26,115,232,.06)" />
            <path id="wLine" d={dPath} fill="none" stroke="#1a73e8" strokeWidth="2" strokeOpacity=".55" />
          </svg>
          <div className="bottom-0 left-0 absolute bg-gray-200 w-full h-px"></div>
        </div>

        <div className="z-10 relative flex md:flex-row flex-col flex-grow justify-between items-start md:items-center mx-auto px-6 w-full max-w-[1180px]">
          <div className={`mb-12 md:mb-0 w-full md:w-[46%] reveal ${revealed ? "in" : ""}`}>
            <p className="mb-3 font-bold text-[#98a1a9] text-[11px] uppercase tracking-[0.1em]">
              Real-time social listening
            </p>
            <h1 className="font-bold text-[2.75rem] text-gray-900 leading-[1.15] tracking-tight">
              Listen to what<br />
              <span id="heroCountry" className="inline-block bg-[#e8f0fe] my-1 px-2 py-0.5 rounded-md text-[#1a73e8]">
                India
              </span><br />
              is posting about<br />
              right now
            </h1>
            <p className="mt-5 max-w-sm text-[15px] text-gray-500 leading-relaxed">
              Mentions, emotion and influence across X, Telegram, Instagram, Facebook, Reddit and YouTube — read together, in one place.
            </p>
          </div>

          <div className={`flex justify-center md:justify-end w-full md:w-[54%] reveal ${revealed ? "in" : ""}`}>
            <div className="flex items-center bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] p-2 pl-6 border border-gray-100 rounded-full w-full max-w-lg">
              <div className="flex-shrink-0 bg-[#1a73e8] mr-4 rounded-full w-2 h-2 pulse-dot"></div>
              <input
                id="q"
                type="text"
                className={`flex-grow bg-transparent outline-none min-w-0 text-gray-900 text-lg swap ${swapState}`}
                aria-label="Topic"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchSubmit}
              />
              <Link
                href={`/trends?topic=${matchTopicId(searchTerm)}`}
                className="bg-[#1a73e8] hover:bg-blue-700 ml-2 px-6 py-2.5 rounded-full font-medium text-white text-sm whitespace-nowrap transition-colors"
              >
                Explore
              </Link>
            </div>
          </div>
        </div>

        <div className="z-10 relative flex justify-between items-end mx-auto mt-24 mb-2 px-6 w-full max-w-[1180px] font-bold text-[11px] text-gray-400 uppercase tracking-widest">
          <p>Mention volume, past 24 hours</p>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2">
              {TOPICS.map((t, k) => (
                <button
                  key={t.id}
                  aria-label={`Show ${t.label}`}
                  onClick={() => handleSetTopic(k)}
                  className={`rounded-full transition-all ${
                    k === topicIndex ? "w-6 h-1.5 bg-[#1a73e8]" : "w-1.5 h-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setPlaying(!playing)}
              className="ml-2 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Pause rotation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {playing ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                )}
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* ── Why trending ────────────────────────────────── */}
      <section className="reveal">
        <div className="mx-auto px-6 py-14 border-gray-100/70 border-t max-w-[1180px]">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-7">
            <h2 className="font-bold text-gray-900 text-xl tracking-tight">
              Why is <span className={`text-[#1a73e8] swap ${swapState}`}>{topic.label}</span> trending?
            </h2>
            <Link
              href={`/trends?topic=${topic.id}`}
              className="flex items-center space-x-2 bg-blue-50/80 hover:bg-blue-100 px-4 py-1.5 rounded-full font-medium text-[#1a73e8] text-sm transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
              <span>Open in Explore</span>
            </Link>
          </div>

          <div className={`swap ${swapState}`}>
            <div id="cards" className="gap-5 grid grid-cols-1 md:grid-cols-3">
              {topic.posts.map((p, i) => (
                <Link
                  key={i}
                  href={`/trends?topic=${topic.id}`}
                  className="interactive-card bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 flex items-start space-x-4 cursor-pointer"
                >
                  <div
                    className="flex flex-shrink-0 justify-center items-center rounded-lg w-[64px] h-[64px] text-white shadow-sm"
                    style={{ background: p.c }}
                  >
                    {p.tag === "X" && (
                      <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24" aria-label="X">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    )}
                    {p.tag === "TG" && (
                      <svg className="w-7 h-7 fill-white translate-x-[-1px]" viewBox="0 0 24 24" aria-label="Telegram">
                        <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.693c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
                      </svg>
                    )}
                    {p.tag === "RD" && (
                      <svg className="w-7 h-7 fill-white" viewBox="0 0 24 24" aria-label="Reddit">
                        <path d="M22 12c0-1.1-.9-2-2-2-.41 0-.79.13-1.11.34-1.34-.94-3.15-1.55-5.16-1.64l1.07-5.02 3.5.74c.03.82.7 1.48 1.52 1.48 1.1 0 2-.9 2-2s-.9-2-2-2c-.84 0-1.53.52-1.82 1.25l-3.92-.83a.475.475 0 0 0-.55.37l-1.2 5.65c-2.06.07-3.92.68-5.28 1.63-.32-.22-.71-.35-1.13-.35-1.1 0-2 .9-2 2 0 .76.43 1.42 1.06 1.76-.04.28-.06.56-.06.85 0 3.86 4.03 7 9 7s9-3.14 9-7c0-.29-.02-.57-.06-.85.63-.34 1.06-1 1.06-1.76zm-14.5 2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm8.93 4.29c-.77.77-2.04 1.08-3.43 1.08s-2.66-.31-3.43-1.08a.5.5 0 0 1 .71-.71c.56.56 1.58.79 2.72.79s2.16-.23 2.72-.79a.5.5 0 0 1 .71.71zm-.93-2.79c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                      </svg>
                    )}
                    {!["X", "TG", "RD"].includes(p.tag) && p.tag}
                  </div>
                  <div className="flex flex-col justify-between pt-0.5 pb-1 min-w-0">
                    <h3 className="font-medium text-[#202124] text-sm leading-snug card-title">{p.t}</h3>
                    <p className="mt-2 text-[#5f6368] text-[11px]">{p.ago} · {p.src}</p>
                  </div>
                </Link>
              ))}
            </div>
            
            <div id="stats" className="gap-5 grid grid-cols-2 md:grid-cols-4 mt-6">
              {[
                ["Mentions", fmt(topic.vol), false],
                ["Reach", fmt(topic.reach), false],
                ["Growth", '+' + topic.growth + '%', true],
                ["Leading emotion", (() => {
                  const emo = topic.emo as any;
                  const maxKey = Object.keys(emo).reduce((a, b) => emo[a] > emo[b] ? a : b);
                  return maxKey.charAt(0).toUpperCase() + maxKey.slice(1) + ' ' + emo[maxKey] + '%';
                })(), false],
              ].map(([k, v, accent]) => (
                <div key={k as string} className="interactive-card bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3.5 flex flex-col justify-center">
                  <p className={`text-lg font-bold tnum ${accent ? "text-[#1a73e8]" : "text-[#202124]"}`}>
                    {v as React.ReactNode}
                  </p>
                  <p className="mt-1 font-bold text-[11px] text-gray-400 uppercase tracking-widest">
                    {k as string}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center mt-14 mb-2">
            <div
              className="relative flex items-center bg-[#eef2fc] shadow-sm px-4 py-2 font-medium text-[#1a73e8] text-sm floating"
              style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
            >
              Made with Apperture
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
