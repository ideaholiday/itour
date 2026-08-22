import React from "react";

export default function IdeaHolidayLogo({ className = "", dark = false, showTagline = false }) {
  return (
    <span className={`inline-flex flex-col ${className}`} aria-label="idea holiday">
      <span className="inline-flex items-end whitespace-nowrap font-body text-[1em] font-black leading-none tracking-[-0.06em]">
        <span className="relative text-amber-500 font-black">
          idea
          <span
            aria-hidden="true"
            className="absolute -right-[0.02em] -top-[0.34em] h-[0.32em] w-[0.62em] rounded-t-full bg-gradient-to-r from-amber-400 to-amber-500 opacity-95"
          />
        </span>
        <span className="text-emerald-700 font-black">holiday</span>
        <span aria-hidden="true" className="ml-[0.12em] mb-[0.08em] h-[0.18em] w-[0.18em] rounded-full bg-amber-500" />
      </span>
      {showTagline && (
        <span className="mt-1 font-mono text-[0.28em] font-extrabold uppercase tracking-[0.28em] text-amber-800">
          journeys made personal
        </span>
      )}
    </span>
  );
}
