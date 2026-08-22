import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CalendarDays, CarFront, Clock3,
  Plane, Train, Building2, Route, Waves, Sparkles, MapPin, Compass
} from "lucide-react";

const listingTypes = [
  {
    title: "1. Private Transfers & Airport Cabs",
    subtitle: "Airports, Railway Stations & Intercity",
    description: "Fixed hub ↔ flexible destination zone private transfers with vehicle-based fixed pricing and Fastag inclusion.",
    to: "/supplier/transfers/create",
    icon: CarFront,
    badge: "Fastest Setup",
    theme: "border-amber-400 bg-amber-50/50 text-amber-900",
    labels: ["Airport Transfer", "Railway Station", "Intercity Cab", "Hotel Transfer"],
  },
  {
    title: "2. Day Tours & Sightseeing",
    subtitle: "Heritage Walks & City Sightseeing",
    description: "Half-day and full-day monument visits, city tours, boat rides, and guided heritage circuits.",
    to: "/supplier/tours/create?type=day",
    icon: Compass,
    badge: "High Volume",
    theme: "border-stone-200 bg-white text-stone-900",
    labels: ["Full Day Tour", "Half Day Tour", "Private Cab", "Shared Seat"],
  },
  {
    title: "3. Activities, Adventures & Water Sports",
    subtitle: "Scuba, Rafting, Safaris & Water Sports",
    description: "Hourly and timed experiences with equipment, safety briefings, and per-person / slot-based tickets.",
    to: "/supplier/tours/create?type=activity",
    icon: Waves,
    badge: "High Margin",
    theme: "border-cyan-300 bg-cyan-50/40 text-cyan-950",
    labels: ["Water Sports", "Scuba Diving", "River Rafting", "Desert Safari"],
  },
  {
    title: "4. Multi-Day Packages & Circuits",
    subtitle: "2 to 7+ Day Holiday Packages",
    description: "Golden Triangle, Kerala, Himachal, and spiritual circuits with day-by-day itineraries and hotel tiers.",
    to: "/supplier/tours/create?type=package",
    icon: CalendarDays,
    badge: "High Value",
    theme: "border-emerald-300 bg-emerald-50/40 text-emerald-950",
    labels: ["Day-by-Day Plan", "Cab + Hotel Tiers", "Spiritual Yatra", "Family Circuits"],
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
            <Sparkles className="h-4 w-4 text-amber-600" /> India Travel Experience Marketplace
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold text-stone-900 sm:text-4xl">
            What experience would you like to list?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Select a product category below. Each specialized builder includes Indian city presets, one-click content generation, and transparent pricing controls.
          </p>
        </header>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          {listingTypes.map(({ title, subtitle, description, to, icon: Icon, badge, theme, labels }) => (
            <Link
              key={title}
              to={to}
              className={`group flex flex-col justify-between rounded-3xl border p-6 transition-all hover:-translate-y-1 hover:shadow-xl ${theme}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white border border-stone-200 shadow-sm text-stone-900 group-hover:text-amber-700 transition">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 font-mono text-[10px] font-bold text-stone-800 shadow-sm border border-stone-200">
                    {badge}
                  </span>
                </div>
                
                <h2 className="mt-4 font-display text-xl font-bold text-stone-900">{title}</h2>
                <span className="text-xs font-semibold text-amber-800">{subtitle}</span>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">{description}</p>
                
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {labels.map((label) => (
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
                <span className="text-xs font-black text-amber-900 group-hover:text-amber-700">
                  Open Creator Builder &rarr;
                </span>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-white text-stone-900 shadow-sm transition group-hover:translate-x-1">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
