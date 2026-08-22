import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";

export default function ContentPageLayout({
  eyebrow = "Idea Holiday Corporate",
  title,
  intro,
  badgeText = "Verified Corporate Policy",
  badgeIcon: BadgeIcon = ShieldCheck,
  children,
}) {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-800 selection:bg-amber-100 selection:text-amber-900">
      {/* Corporate Header */}
      <header className="relative overflow-hidden border-b border-stone-200 bg-[#F5F3ED] text-stone-900">
        {/* Subtle geometric background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(217,119,6,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-70" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-200/20 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-16">
          <nav className="mb-6 flex items-center gap-2 text-xs font-semibold text-stone-500">
            <Link to="/" className="inline-flex items-center gap-1.5 transition hover:text-amber-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-stone-700 font-bold">{eyebrow.split("·")[0].trim()}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-900 border border-amber-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              {eyebrow}
            </span>
            {badgeText && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900 border border-emerald-300">
                <BadgeIcon className="h-3.5 w-3.5 text-emerald-700" />
                {badgeText}
              </span>
            )}
          </div>

          <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-5xl sm:leading-tight">
            {title}
          </h1>

          {intro && (
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-stone-600 sm:text-lg">
              {intro}
            </p>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export function ArticleSection({ number, title, badge, children }) {
  return (
    <section
      id={`section-${number}`}
      className="group relative scroll-mt-24 border-b border-stone-200 py-10 first:pt-0 last:border-b-0"
    >
      <div className="grid gap-6 md:grid-cols-[4.5rem_1fr]">
        <div className="flex items-start">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white font-mono text-sm font-bold text-stone-900 shadow-sm ring-1 ring-stone-200 transition group-hover:bg-amber-500 group-hover:text-stone-950 group-hover:ring-amber-500">
            {String(number).padStart(2, "0")}
          </span>
        </div>
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-stone-900 sm:text-3xl">
              {title}
            </h2>
            {badge && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
                {badge}
              </span>
            )}
          </div>
          <div className="article-copy space-y-4 text-[15px] leading-relaxed text-stone-600">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
