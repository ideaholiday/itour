import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import TicketCard from "../components/TicketCard.jsx";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import { ChevronDown, ChevronUp, Filter, RefreshCw, Search as SearchIcon, SlidersHorizontal, Sparkles, X } from "lucide-react";

const TYPE_OPTIONS = [
  { id: "", label: "All Experiences" },
  { id: "DAY_TOUR", label: "🏛️ Day Sightseeing" },
  { id: "TRANSFER", label: "🚗 Airport Transfers" },
  { id: "MULTI_DAY_PACKAGE", label: "🌴 Multi-Day Packages" },
];

const GROUP_OPTIONS = [
  { id: "", label: "All Modes" },
  { id: "SHARED", label: "👥 Shared / Group" },
  { id: "PRIVATE", label: "🚗 Private" },
];

const SORT_OPTIONS = [
  { value: "", label: "Recommended" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
];

const CATEGORIES = [
  "Heritage & Forts", "Beaches & Water Sports", "Wildlife & Safari",
  "Food & Culture", "Backwaters", "Adventure & Trekking",
  "Spiritual", "Day Trips", "Shows & Events", "Sightseeing",
];

const POPULAR_DESTINATIONS = [
  { id: "goa", name: "Goa" },
  { id: "delhi", name: "Delhi NCR" },
  { id: "lucknow", name: "Lucknow" },
  { id: "jaipur", name: "Jaipur" },
  { id: "agra", name: "Agra" },
  { id: "varanasi", name: "Varanasi" },
  { id: "udaipur", name: "Udaipur" },
  { id: "mumbai", name: "Mumbai" },
  { id: "kochi", name: "Kochi" },
];

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-100 py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-bold text-stone-800 hover:text-amber-700 transition"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-stone-400" /> : <ChevronDown className="h-4 w-4 text-stone-400" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [activities, setActivities] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [localQ, setLocalQ] = useState("");

  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const destination = params.get("destination") || "";
  const sort = params.get("sort") || "";
  const groupType = params.get("groupType") || "";

  const rawType = params.get("type") || "";
  let type = rawType;
  if (/^transfer/i.test(rawType)) type = "TRANSFER";
  else if (/^day/i.test(rawType)) type = "DAY_TOUR";
  else if (/^multi/i.test(rawType)) type = "MULTI_DAY_PACKAGE";

  // Match destination safely
  const matchedDest = useMemo(() => {
    if (!destination) return null;
    return destinations.find(
      (d) =>
        d.id?.toLowerCase() === destination.toLowerCase() ||
        d.name?.toLowerCase() === destination.toLowerCase()
    );
  }, [destination, destinations]);

  const destName = matchedDest?.name || (destination ? destination : "");

  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  useEffect(() => {
    let active = true;
    api.getDestinations()
      .then((data) => {
        if (active && Array.isArray(data)) {
          setDestinations(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load destinations:", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadActivities = () => {
    setLoading(true);
    setError(null);
    api.getActivities({ q, category, destination, type, productType: type, groupType, sort })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setActivities(list);
        analytics.trackViewItemList(list, q || category || destName || "All Experiences");
      })
      .catch((err) => {
        console.error("Failed to load search activities:", err);
        setError(err.message || "Failed to load experiences. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadActivities();
  }, [q, category, destination, type, groupType, sort]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const clearAll = () => setParams(new URLSearchParams());

  // Active filter chips
  const activeFilters = [
    q && { label: `"${q}"`, key: "q" },
    type && { label: TYPE_OPTIONS.find((o) => o.id === type)?.label?.replace(/^[^\s]+\s/, "") || type, key: "type" },
    groupType && { label: GROUP_OPTIONS.find((o) => o.id === groupType)?.label?.replace(/^[^\s]+\s/, "") || groupType, key: "groupType" },
    category && { label: category, key: "category" },
    destination && { label: destName || destination, key: "destination" },
  ].filter(Boolean);

  const displayDestinations = destinations.length > 0 ? destinations : POPULAR_DESTINATIONS;

  const SidebarContent = () => (
    <div className="space-y-0">
      {/* Type */}
      <FilterSection title="Experience type">
        <div className="space-y-2">
          {TYPE_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="type"
                checked={type === opt.id}
                onChange={() => update("type", opt.id)}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-sm text-stone-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Group mode */}
      <FilterSection title="Tour mode">
        <div className="space-y-2">
          {GROUP_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="groupType"
                checked={groupType === opt.id}
                onChange={() => update("groupType", opt.id)}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-sm text-stone-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Destination */}
      <FilterSection title="Destination">
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => update("destination", "")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              !destination
                ? "bg-amber-500 text-stone-950 font-bold"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            All destinations
          </button>
          {displayDestinations.map((d) => {
            const isSelected =
              destination &&
              (destination.toLowerCase() === d.id?.toLowerCase() ||
                destination.toLowerCase() === d.name?.toLowerCase());
            return (
              <button
                key={d.id || d.name}
                type="button"
                onClick={() => update("destination", d.id || d.name)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? "bg-amber-500 text-stone-950 font-bold"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </FilterSection>

      {/* Category */}
      <FilterSection title="Category" defaultOpen={false}>
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => update("category", "")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              !category
                ? "bg-amber-500 text-stone-950 font-bold"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            All categories
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update("category", c)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                category === c
                  ? "bg-amber-500 text-stone-950 font-bold"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </FilterSection>
    </div>
  );

  const searchTitle = q
    ? `Search results for "${q}" | Idea Holiday`
    : destName
    ? `${destName} Tours, Cabs & Experiences | Idea Holiday`
    : category
    ? `${category} in India | Idea Holiday`
    : type === "TRANSFER"
    ? "Airport & Outstation Cabs Across India | Idea Holiday"
    : "Explore Tours & Travel Experiences Across India | Idea Holiday";

  const searchDesc = destName
    ? `Book top-rated tours, day sightseeing, water sports, and airport cabs in ${destName} with verified local operators on Idea Holiday.`
    : "Discover and book curated day tours, activities, transfers and multi-day packages across India with transparent pricing and instant booking.";

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title={searchTitle}
        description={searchDesc}
        canonical={`https://ideaholiday.in/search${params.toString() ? `?${params.toString()}` : ""}`}
      />

      {/* ── Sticky search header ── */}
      <div className="sticky top-[68px] z-30 border-b border-stone-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Inline search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update("q", localQ.trim());
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              placeholder="Search destination, tour, or activity (e.g. Goa, Scuba, Taj Mahal)…"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-stone-900 outline-none placeholder:text-stone-400"
            />
            {localQ && (
              <button
                type="button"
                onClick={() => {
                  setLocalQ("");
                  update("q", "");
                }}
                className="rounded-full p-1 text-stone-400 hover:text-stone-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => update("sort", e.target.value)}
            className="hidden rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 outline-none focus:border-amber-500 sm:block"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Mobile filters */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-stone-950">
                {activeFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips & quick suggestions */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6 lg:px-8">
          {activeFilters.length > 0 ? (
            <>
              {activeFilters.map(({ label, key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => update(key, "")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 transition"
                >
                  {label} <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-bold text-stone-400 underline hover:text-stone-700 transition"
              >
                Clear all
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs text-stone-500 no-scrollbar">
              <span className="flex items-center gap-1 font-semibold text-stone-700 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Popular:
              </span>
              {POPULAR_DESTINATIONS.slice(0, 6).map((dest) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => update("destination", dest.id)}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-1 font-semibold text-stone-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition"
                >
                  {dest.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page heading */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-stone-900 sm:text-3xl">
              {destName
                ? `Experiences in ${destName}`
                : q
                ? `Results for "${q}"`
                : category
                ? `${category} Experiences`
                : "All Experiences & Transfers"}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {loading
                ? "Searching verified listings…"
                : `${activities.length} verified listing${activities.length !== 1 ? "s" : ""} found`}
              {" · "}Direct operator prices, verified local suppliers
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          {/* ── Sidebar (desktop) ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-[140px] rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-stone-900">
                  <Filter className="h-4 w-4" /> Filters
                </h2>
                {activeFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 transition"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <SidebarContent />
            </div>
          </aside>

          {/* ── Mobile filters overlay ── */}
          {mobileFiltersOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFiltersOpen(false)} />
              <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">Filters</h2>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="rounded-full p-2 hover:bg-stone-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent />
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="mt-6 w-full rounded-full bg-amber-500 py-3.5 text-sm font-extrabold text-stone-950 shadow-md hover:bg-amber-400 transition"
                >
                  Show {activities.length} result{activities.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          <div>
            {/* Sort bar on mobile */}
            <div className="mb-5 flex items-center justify-between lg:hidden">
              <p className="text-sm font-semibold text-stone-500">
                {loading ? "…" : `${activities.length} results`}
              </p>
              <select
                value={sort}
                onChange={(e) => update("sort", e.target.value)}
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center shadow-sm">
                <p className="font-bold text-rose-800">{error}</p>
                <button
                  type="button"
                  onClick={loadActivities}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 transition"
                >
                  <RefreshCw className="h-4 w-4" /> Retry Search
                </button>
              </div>
            ) : loading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex h-[380px] flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm animate-pulse"
                  >
                    <div className="h-48 w-full rounded-xl bg-stone-200" />
                    <div className="mt-4 h-4 w-24 rounded bg-stone-200" />
                    <div className="mt-2 h-6 w-3/4 rounded bg-stone-200" />
                    <div className="mt-auto flex justify-between border-t border-stone-100 pt-3">
                      <div className="h-6 w-20 rounded bg-stone-200" />
                      <div className="h-6 w-16 rounded bg-stone-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-8 sm:p-12 text-center shadow-sm">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-3xl">
                  🔍
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-stone-900">
                  No experiences match that search
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
                  We couldn't find listings matching your specific criteria. Try exploring another destination or clear your filters.
                </p>

                {/* Popular destination quick clicks */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {POPULAR_DESTINATIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => update("destination", d.id)}
                      className="rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition"
                    >
                      {d.name}
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-full bg-amber-500 hover:bg-amber-400 px-6 py-2.5 text-sm font-bold text-stone-950 shadow-sm transition"
                  >
                    Clear all filters
                  </button>
                  <Link
                    to="/transfers"
                    className="rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-bold text-stone-800 hover:bg-stone-50 transition"
                  >
                    Search Airport Transfers
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {activities.map((a) => (
                  <TicketCard key={a.id} activity={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
