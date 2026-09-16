import Link from "next/link";
import React from "react";

export function NavBar({
  activeTab = "Overview",
  rightSlot,
}: {
  activeTab?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <nav className="top-0 z-40 sticky flex justify-between items-center bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] px-6 py-3 border-gray-100 border-b">
      <div className="flex items-center space-x-6">
        <Link
          href="/"
          className="font-bold text-gray-800 hover:text-blue-600 text-xl tracking-tight transition-colors duration-300"
        >
          Apperture
        </Link>
        <div className="hidden md:flex items-center text-sm">
          <Link
            href="/"
            className={`px-3 py-1.5 ${
              activeTab === "Overview"
                ? "border-blue-600 border-b-2 font-medium text-blue-600"
                : "rounded-md text-gray-500 hover:text-gray-900 transition-colors duration-300"
            }`}
          >
            Overview
          </Link>
          <Link
            href="/trends"
            className={`px-3 py-1.5 ${
              activeTab === "Trends"
                ? "border-blue-600 border-b-2 font-medium text-blue-600"
                : "rounded-md text-gray-500 hover:text-gray-900 transition-colors duration-300"
            }`}
          >
            Trends
          </Link>
          <Link
            href="/trends"
            className="px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-900 transition-colors duration-300"
          >
            Network
          </Link>
          <Link
            href="/trends"
            className="px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-900 transition-colors duration-300"
          >
            Reports
          </Link>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        {rightSlot || (
          <>
            <div className="hidden sm:flex items-center gap-1.5 font-bold text-[11px] text-gray-400 uppercase tracking-widest"></div>
            <div className="bg-gray-200 w-px h-4"></div>
            <div className="relative group">
              <button className="flex items-center gap-1.5 bg-white px-3 py-1.5 border border-gray-200 hover:border-gray-300 rounded-md text-gray-600 text-sm transition-all duration-300">
                <span>India</span>
                <svg
                  className="w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
            </div>
            <div className="flex justify-center items-center bg-blue-50 border border-blue-100 rounded-full w-8 h-8 font-bold text-blue-600 text-sm">
              A
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
