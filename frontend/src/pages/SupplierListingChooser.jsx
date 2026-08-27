import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

const PRODUCT_TYPES = [
  {
    emoji: "🎒",
    title: "Package",
    subtitle: "2–7+ Day Holiday Packages",
    description: "Multi-day bundles with or without hotel — transport, sightseeing, day-by-day itinerary.",
    to: "/supplier/products/new",
    badge: "High Value",
    badgeColor: "bg-amber-100 text-amber-900",
    borderColor: "border-amber-300",
    bgColor: "bg-amber-50/50",
    subtypes: ["Package with Hotel", "Package without Hotel"],
  },
  {
    emoji: "🗺️",
    title: "Tour",
    subtitle: "Day Tours & Excursions",
    description: "City sightseeing, heritage walks, island trips — shared SIC coach or private vehicle.",
    to: "/supplier/products/new",
    badge: "High Volume",
    badgeColor: "bg-blue-100 text-blue-900",
    borderColor: "border-blue-300",
    bgColor: "bg-blue-50/40",
    subtypes: ["Shared SIC Coach", "Private Tour"],
  },
  {
    emoji: "🚗",
    title: "Transfer",
    subtitle: "Point-to-Point Private Transfers",
    description: "Airport, railway station, or city-to-city — dedicated vehicle with fixed pricing.",
    to: "/supplier/products/new",
    badge: "Fastest Setup",
    badgeColor: "bg-indigo-100 text-indigo-900",
    borderColor: "border-indigo-300",
    bgColor: "bg-indigo-50/40",
    subtypes: ["Airport / Railway", "Intercity Hotel", "City to City"],
  },
  {
    emoji: "🎡",
    title: "Attraction",
    subtitle: "Venues, Shows & Theme Parks",
    description: "Fixed venue entry — casino, safari, water park, show. Add SIC or private transfer if needed.",
    to: "/supplier/products/new",
    badge: "High Margin",
    badgeColor: "bg-rose-100 text-rose-900",
    borderColor: "border-rose-300",
    bgColor: "bg-rose-50/40",
    subtypes: ["Ticket Only", "Ticket + SIC Transfer", "Ticket + Private Transfer"],
  },
  {
    emoji: "🤿",
    title: "Experience",
    subtitle: "Active & Hands-On Activities",
    description: "Scuba diving, cooking class, ATV, skydiving — you DO something. Optional hotel pickup.",
    to: "/supplier/products/new",
    badge: "High Repeat",
    badgeColor: "bg-emerald-100 text-emerald-900",
    borderColor: "border-emerald-300",
    bgColor: "bg-emerald-50/40",
    subtypes: ["Ticket Only", "Ticket + SIC Transfer", "Ticket + Private Transfer"],
  },
];

export default function SupplierListingChooser() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/supplier/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-amber-800 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to supplier dashboard
        </Link>

        <header className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-800">
            <Sparkles className="h-4 w-4 text-amber-600" /> IdeaHoliday Travel Marketplace
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-stone-900 sm:text-4xl">
            What type of product are you listing?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Choose your product category below. The builder will adapt to show exactly the right fields —
            itinerary, pricing tiers, vehicle options, SIC hubs — for your product type.
          </p>
        </header>

        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_TYPES.map(({ emoji, title, subtitle, description, to, badge, badgeColor, borderColor, bgColor, subtypes }) => (
            <Link
              key={title}
              to={to}
              className={`group flex flex-col justify-between rounded-3xl border-2 p-6 transition-all hover:-translate-y-1 hover:shadow-xl ${borderColor} ${bgColor}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white border border-stone-200 shadow-sm text-2xl">
                    {emoji}
                  </div>
                  <span className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold shadow-sm ${badgeColor}`}>
                    {badge}
                  </span>
                </div>

                <h2 className="mt-4 font-display text-xl font-bold text-stone-900">{title}</h2>
                <span className="text-xs font-semibold text-stone-600">{subtitle}</span>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">{description}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {subtypes.map((label) => (
                    <span
                      key={label}
                      className="rounded-xl bg-white/80 border border-stone-200/80 px-2.5 py-1 text-[10px] font-medium text-stone-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-stone-200/60 pt-4">
                <span className="text-xs font-black text-stone-700 group-hover:text-amber-800 transition">
                  Open {title} Builder &rarr;
                </span>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-white text-stone-900 shadow-sm transition group-hover:translate-x-1">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-stone-400">
          All 5 product types share the same 7-step builder — type selector, about &amp; photos, overview, itinerary, pricing, settings, and publish.
        </p>
      </div>
    </div>
  );
}
