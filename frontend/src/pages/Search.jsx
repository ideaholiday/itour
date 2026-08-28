import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import TicketCard from "../components/TicketCard.jsx";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  RefreshCw,
  Search as SearchIcon,
  SlidersHorizontal,
  Sparkles,
  X,
  Map as MapIcon,
  LayoutGrid,
  Star,
  Clock,
  Car,
  ShieldCheck,
  Zap,
  MapPin,
  Check,
} from "lucide-react";
import SearchMapView from "../components/traveler/SearchMapView.jsx";
import { SearchSuggestions } from "../components/traveler/SearchSuggestions.jsx";

const TYPE_OPTIONS = [
  { id: "", label: "All Products" },
  { id: "PACKAGE", label: "🎒 Packages" },
  { id: "TOUR", label: "🗺️ Tours" },
  { id: "TRANSFER", label: "🚗 Transfers" },
  { id: "ATTRACTION", label: "🎡 Attractions" },
  { id: "EXPERIENCE", label: "🤿 Experiences" },
];

const GROUP_OPTIONS = [
  { id: "", label: "All Modes" },
  { id: "SHARED", label: "👥 Shared (SIC)" },
  { id: "PRIVATE", label: "🚗 Private" },
];

const DURATION_OPTIONS = [
  { id: "", label: "Any Duration" },
  { id: "short", label: "Under 4 hours", bucket: "short" },
  { id: "half_day", label: "4 to 8 hours (Half Day)", bucket: "half_day" },
  { id: "full_day", label: "Full Day (8–24h)", bucket: "full_day" },
  { id: "multi_day", label: "Multi-Day (Packages)", bucket: "multi_day" },
];

const VEHICLE_OPTIONS = [
  { id: "", label: "All Vehicles" },
  { id: "SEDAN", label: "Sedan (Dzire / Etios)", icon: "🚗" },
  { id: "SUV", label: "SUV (Ertiga / Carens)", icon: "🚙" },
  { id: "PREMIUM_MUV", label: "Innova Crysta", icon: "🚐" },
  { id: "LUXURY", label: "Luxury Class", icon: "✨" },
  { id: "GROUP_TEMPO", label: "Tempo Traveller", icon: "🚌" },
];

const RATING_OPTIONS = [
  { value: "", label: "Any Rating" },
  { value: "4.5", label: "4.5★ & up" },
  { value: "4.0", label: "4.0★ & up" },
  { value: "3.5", label: "3.5★ & up" },
];

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
  { value: "newest", label: "Newest First" },
];

const POPULAR_DESTINATIONS = [
  { id: "goa", name: "Goa" },
  { id: "bangkok", name: "Bangkok" },
  { id: "pattaya", name: "Pattaya" },
  { id: "delhi", name: "Delhi NCR" },
  { id: "jaipur", name: "Jaipur" },
  { id: "agra", name: "Agra" },
  { id: "mumbai", name: "Mumbai" },
  { id: "udaipur", name: "Udaipur" },
];

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stone-100 dark:border-stone-800 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200 hover:text-amber-600 transition"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-stone-400" /> : <ChevronDown className="h-3.5 w-3.5 text-stone-400" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [activities, setActivities] = useState([]);
  const [facets, setFacets] = useState(null);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState("GRID"); // 'GRID' | 'SPLIT'
  const [localQ, setLocalQ] = useState("");
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [recentSearches, setRecentSearches] = useState([]);
  const cardRefs = useRef({});

  // Query Params
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const destination = params.get("destination") || "";
  const sort = params.get("sort") || "recommended";
  const groupType = params.get("groupType") || "";
  const duration = params.get("duration") || "";
  const vehicleType = params.get("vehicleType") || "";
  const minRating = params.get("minRating") || "";
  const minPrice = params.get("minPrice") || "";
  const maxPrice = params.get("maxPrice") || "";
  const instantOnly = params.get("instantOnly") === "1" || params.get("instantOnly") === "true";
  const freeCancellation = params.get("freeCancellation") === "1" || params.get("freeCancellation") === "true";
  const bestseller = params.get("bestseller") === "1" || params.get("bestseller") === "true";

  const rawType = (params.get("type") || params.get("productType") || "").toUpperCase();
  let type = rawType;
  if (/^TRANSFER/i.test(rawType)) type = "TRANSFER";
  else if (/^DAY|^TOUR/i.test(rawType)) type = "TOUR";
  else if (/^MULTI|^PACK|^PKG/i.test(rawType)) type = "PACKAGE";
  else if (/^ATTR/i.test(rawType)) type = "ATTRACTION";
  else if (/^EXP/i.test(rawType)) type = "EXPERIENCE";

  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  useEffect(() => {
    setPriceRange({ min: minPrice, max: maxPrice });
  }, [minPrice, maxPrice]);

  useEffect(() => {
    let active = true;
    api.getDestinations()
      .then((data) => {
        if (active && Array.isArray(data)) setDestinations(data);
      })
      .catch(() => {});

    api.get("/search/recent")
      .then((res) => {
        if (active && Array.isArray(res)) setRecentSearches(res);
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  const loadActivities = () => {
    setLoading(true);
    setError(null);
    const searchParams = {
      q,
      category,
      city: destination,
      destination,
      type,
      productType: type,
      groupType,
      duration,
      vehicleType,
      minPrice,
      maxPrice,
      minRating,
      instantOnly: instantOnly ? "1" : "",
      freeCancellation: freeCancellation ? "1" : "",
      bestseller: bestseller ? "1" : "",
      sort,
      limit: 50,
    };

    api.getActivities(searchParams)
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.products || []);
        setActivities(list);
        if (data?.facets) setFacets(data.facets);
        analytics.trackViewItemList(list, q || category || destination || "All Experiences");
      })
      .catch((err) => {
        console.error("Search failed:", err);
        setError(err.message || "Failed to load experiences. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadActivities();
  }, [q, category, destination, type, groupType, duration, vehicleType, minRating, minPrice, maxPrice, instantOnly, freeCancellation, bestseller, sort]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value !== undefined && value !== null && value !== "") {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next);
  };

  const clearAll = () => {
    setParams(new URLSearchParams());
    setPriceRange({ min: "", max: "" });
  };

  const handleApplyPrice = (e) => {
    if (e) e.preventDefault();
    const next = new URLSearchParams(params);
    if (priceRange.min) next.set("minPrice", priceRange.min);
    else next.delete("minPrice");
    if (priceRange.max) next.set("maxPrice", priceRange.max);
    else next.delete("maxPrice");
    setParams(next);
  };

  // Scroll to card when pin is clicked on map
  const handleSelectProduct = (product) => {
    setSelectedProductId(product.id);
    const elem = cardRefs.current[product.id];
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Active filter chips
  const activeFilters = [
    q && { label: `"${q}"`, key: "q" },
    type && { label: TYPE_OPTIONS.find((o) => o.id === type)?.label || type, key: "type" },
    groupType && { label: GROUP_OPTIONS.find((o) => o.id === groupType)?.label || groupType, key: "groupType" },
    category && { label: category, key: "category" },
    destination && { label: destination, key: "destination" },
    duration && { label: DURATION_OPTIONS.find((o) => o.id === duration)?.label || duration, key: "duration" },
    vehicleType && { label: VEHICLE_OPTIONS.find((o) => o.id === vehicleType)?.label || vehicleType, key: "vehicleType" },
    minRating && { label: `${minRating}★+`, key: "minRating" },
    (minPrice || maxPrice) && { label: `₹${minPrice || 0} - ₹${maxPrice || "max"}`, key: "price" },
    instantOnly && { label: "Instant Confirmation", key: "instantOnly" },
    freeCancellation && { label: "Free Cancellation", key: "freeCancellation" },
    bestseller && { label: "Best Sellers", key: "bestseller" },
  ].filter(Boolean);

  const displayDestinations = destinations.length > 0 ? destinations : POPULAR_DESTINATIONS;

  const SidebarContent = () => (
    <div className="space-y-1">
      {/* Experience Type */}
      <FilterSection title="Experience Type">
        <div className="space-y-1.5">
          {TYPE_OPTIONS.map((opt) => {
            const count = facets?.productTypes?.find((p) => p.type === opt.id)?.count;
            return (
              <label key={opt.id} className="flex cursor-pointer items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="type"
                    checked={type === opt.id}
                    onChange={() => update("type", opt.id)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">{opt.label}</span>
                </div>
                {count !== undefined && <span className="text-[10px] text-stone-400 font-mono">({count})</span>}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Duration Buckets */}
      <FilterSection title="Duration">
        <div className="space-y-1.5">
          {DURATION_OPTIONS.map((opt) => {
            const count = opt.bucket && facets?.durations ? facets.durations[opt.bucket] : null;
            return (
              <label key={opt.id} className="flex cursor-pointer items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="duration"
                    checked={duration === opt.id}
                    onChange={() => update("duration", opt.id)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">{opt.label}</span>
                </div>
                {count !== null && <span className="text-[10px] text-stone-400 font-mono">({count})</span>}
              </label>
            );
          })}
        </div>
      </FilterSection>

      {/* Price Range */}
      <FilterSection title="Budget (₹ INR)">
        <form onSubmit={handleApplyPrice} className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min ₹"
              value={priceRange.min}
              onChange={(e) => setPriceRange({ ...priceRange, min: e.target.value })}
              className="w-1/2 px-2.5 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
            />
            <span className="text-xs text-stone-400">—</span>
            <input
              type="number"
              placeholder="Max ₹"
              value={priceRange.max}
              onChange={(e) => setPriceRange({ ...priceRange, max: e.target.value })}
              className="w-1/2 px-2.5 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold hover:bg-stone-800 transition"
          >
            Apply Price
          </button>
        </form>
      </FilterSection>

      {/* Star Rating */}
      <FilterSection title="Minimum Rating">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {RATING_OPTIONS.map((r) => {
            const isSelected = minRating === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => update("minRating", isSelected ? "" : r.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                  isSelected
                    ? "bg-amber-500 text-stone-950 border-amber-500 shadow-xs"
                    : "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-stone-400"
                }`}
              >
                {r.value && <Star className={`w-3 h-3 ${isSelected ? "fill-stone-950" : "fill-amber-400 text-amber-500"}`} />}
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>
      </FilterSection>

      {/* Categories with Facet Counts */}
      <FilterSection title="Categories" defaultOpen={false}>
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => update("category", "")}
            className={`w-full rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold transition ${
              !category ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            All categories
          </button>
          {facets?.categories?.length ? (
            facets.categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => update("category", category === c.name ? "" : c.name)}
                className={`w-full rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold transition flex items-center justify-between ${
                  category === c.name ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({c.count})</span>
              </button>
            ))
          ) : (
            displayDestinations.slice(0, 8).map((d) => (
              <button
                key={d.id || d.name}
                type="button"
                onClick={() => update("destination", d.id || d.name)}
                className="w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                {d.name}
              </button>
            ))
          )}
        </div>
      </FilterSection>

      {/* Vehicle Category (For transfers & cabs) */}
      <FilterSection title="Vehicle Category" defaultOpen={false}>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {VEHICLE_OPTIONS.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
              <input
                type="radio"
                name="vehicleType"
                checked={vehicleType === v.id}
                onChange={() => update("vehicleType", v.id)}
                className="h-4 w-4 accent-amber-600"
              />
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                {v.icon} {v.label}
              </span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* Perks & Features */}
      <FilterSection title="Features & Perks" defaultOpen={true}>
        <div className="space-y-2 pt-1">
          <label className="flex cursor-pointer items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> Instant Confirmation
            </span>
            <input
              type="checkbox"
              checked={instantOnly}
              onChange={(e) => update("instantOnly", e.target.checked ? "1" : "")}
              className="h-4 w-4 rounded accent-amber-600"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Free Cancellation
            </span>
            <input
              type="checkbox"
              checked={freeCancellation}
              onChange={(e) => update("freeCancellation", e.target.checked ? "1" : "")}
              className="h-4 w-4 rounded accent-amber-600"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition">
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Best Sellers Only
            </span>
            <input
              type="checkbox"
              checked={bestseller}
              onChange={(e) => update("bestseller", e.target.checked ? "1" : "")}
              className="h-4 w-4 rounded accent-amber-600"
            />
          </label>
        </div>
      </FilterSection>
    </div>
  );

  const searchTitle = q
    ? `Search results for "${q}" | Idea Holiday`
    : destination
    ? `${destination} Tours, Cabs & Experiences | Idea Holiday`
    : category
    ? `${category} in India | Idea Holiday`
    : type === "TRANSFER"
    ? "Airport & Outstation Cabs Across India | Idea Holiday"
    : "Explore Tours & Travel Experiences Across India | Idea Holiday";

  const searchDesc = destination
    ? `Book top-rated tours, day sightseeing, water sports, and airport cabs in ${destination} with verified local operators on Idea Holiday.`
    : "Discover and book curated day tours, activities, transfers and multi-day packages across India with transparent pricing and instant booking.";

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <SeoHead
        title={searchTitle}
        description={searchDesc}
        canonical={`https://ideaholiday.in/search${params.toString() ? `?${params.toString()}` : ""}`}
      />

      {/* ── Sticky Search & Control Bar ── */}
      <div className="sticky top-[68px] z-30 border-b border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Search input with autocomplete */}
          <div className="relative flex-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update("q", localQ.trim());
              }}
              className="flex items-center gap-2 rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/80 px-4 py-2.5 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition"
            >
              <SearchIcon className="h-4 w-4 shrink-0 text-stone-400" />
              <input
                value={localQ}
                onChange={(e) => setLocalQ(e.target.value)}
                placeholder="Search destinations, tours, Taj Mahal, Goa scuba, airport cabs…"
                className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm font-medium text-stone-900 dark:text-stone-100 outline-none placeholder:text-stone-400"
              />
              {localQ && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalQ("");
                    update("q", "");
                  }}
                  className="rounded-full p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>
            <SearchSuggestions
              query={localQ}
              onSelect={(item) => {
                setLocalQ(item.value);
                if (item.type === "destination") update("destination", item.value);
                else update("q", item.value);
              }}
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sort}
            onChange={(e) => update("sort", e.target.value)}
            className="hidden rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2.5 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-200 outline-none focus:border-amber-500 sm:block"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* View Mode Toggle: Grid vs Split Map */}
          <div className="hidden md:flex items-center rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-1">
            <button
              type="button"
              onClick={() => setViewMode("GRID")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                viewMode === "GRID"
                  ? "bg-amber-500 text-stone-950 shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("SPLIT")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                viewMode === "SPLIT"
                  ? "bg-amber-500 text-stone-950 shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map View</span>
            </button>
          </div>

          {/* Mobile filters button */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2.5 text-xs font-bold text-stone-700 dark:text-stone-200 lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-stone-950">
                {activeFilters.length}
              </span>
            )}
          </button>
        </div>

        {/* Active Filter Chips & Quick History */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6 lg:px-8">
          {activeFilters.length > 0 ? (
            <>
              {activeFilters.map(({ label, key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (key === "price") {
                      update("minPrice", "");
                      update("maxPrice", "");
                    } else {
                      update(key, "");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 px-3 py-1 text-xs font-bold text-amber-900 dark:text-amber-300 hover:bg-amber-200 transition"
                >
                  <span>{label}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-bold text-stone-400 hover:text-amber-600 transition underline"
              >
                Clear all
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs text-stone-500 no-scrollbar">
              {recentSearches.length > 0 && (
                <>
                  <span className="flex items-center gap-1 font-semibold text-stone-600 dark:text-stone-400 shrink-0">
                    🕐 Recent:
                  </span>
                  {recentSearches.slice(0, 4).map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setLocalQ(s.q || s); update("q", s.q || s); }}
                      className="shrink-0 rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1 font-semibold text-stone-600 dark:text-stone-400 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-900 transition"
                    >
                      {s.q || s}
                    </button>
                  ))}
                  <span className="text-stone-200 dark:text-stone-700">|</span>
                </>
              )}
              <span className="flex items-center gap-1 font-semibold text-stone-700 dark:text-stone-300 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Popular:
              </span>
              {POPULAR_DESTINATIONS.map((dest) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => update("destination", dest.name)}
                  className="shrink-0 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-2.5 py-1 font-semibold text-stone-700 dark:text-stone-300 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-900 transition"
                >
                  {dest.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Results Header */}
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100">
              {destination
                ? `Experiences in ${destination}`
                : q
                ? `Results for "${q}"`
                : category
                ? `${category} in India`
                : "All Experiences & Cabs"}
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              {loading
                ? "Searching verified inventory…"
                : `${activities.length} verified listing${activities.length !== 1 ? "s" : ""} available`}
              {" · "}Direct verified operator prices, 24/7 support
            </p>
          </div>

          {/* Mobile Map Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "GRID" ? "SPLIT" : "GRID")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs font-bold text-stone-800 dark:text-stone-200 shadow-xs"
            >
              {viewMode === "GRID" ? <MapIcon className="w-3.5 h-3.5 text-amber-500" /> : <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />}
              <span>{viewMode === "GRID" ? "Map View" : "Grid View"}</span>
            </button>
          </div>
        </div>

        {/* ── Product Type Tab Row ── */}
        <div className="mb-5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {TYPE_OPTIONS.map((opt) => {
            const count = opt.id
              ? facets?.productTypes?.find((p) => p.type === opt.id)?.count
              : activities.length;
            const isActive = type === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update("type", opt.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition ${
                  isActive
                    ? "border-amber-500 bg-amber-500 text-stone-950 shadow-sm"
                    : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                }`}
              >
                {opt.label}
                {count !== undefined && (
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${isActive ? "bg-stone-950/20 text-stone-950" : "bg-stone-100 dark:bg-stone-800 text-stone-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          {/* ── Sidebar (Desktop) ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-[140px] rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-stone-900 dark:text-stone-100">
                  <Filter className="h-3.5 w-3.5 text-amber-500" /> Filters
                </h2>
                {activeFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <SidebarContent />
            </div>
          </aside>

          {/* ── Mobile Filters Drawer ── */}
          {mobileFiltersOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setMobileFiltersOpen(false)} />
              <div className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-white dark:bg-stone-900 p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
                  <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">Filters</h2>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <SidebarContent />
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="mt-6 w-full rounded-2xl bg-amber-500 py-3.5 text-xs font-extrabold text-stone-950 shadow-md hover:bg-amber-400 transition"
                >
                  Show {activities.length} result{activities.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* ── Results Container ── */}
          <div>
            {error ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 p-8 text-center shadow-sm">
                <p className="font-bold text-rose-800 dark:text-rose-300">{error}</p>
                <button
                  type="button"
                  onClick={loadActivities}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition"
                >
                  <RefreshCw className="h-4 w-4" /> Retry Search
                </button>
              </div>
            ) : loading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex h-[380px] flex-col rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-xs animate-pulse"
                  >
                    <div className="h-48 w-full rounded-2xl bg-stone-200 dark:bg-stone-800" />
                    <div className="mt-4 h-4 w-24 rounded bg-stone-200 dark:bg-stone-800" />
                    <div className="mt-2 h-6 w-3/4 rounded bg-stone-200 dark:bg-stone-800" />
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 sm:p-12 text-center shadow-xs">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-3xl">
                  🔍
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-stone-900 dark:text-stone-100">
                  No experiences match that search
                </h3>
                <p className="mx-auto mt-2 max-w-md text-xs text-stone-500">
                  We couldn't find listings matching your specific criteria. Try adjusting your filters or search a popular destination.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {POPULAR_DESTINATIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => update("destination", d.name)}
                      className="rounded-full border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 px-3.5 py-1.5 text-xs font-bold text-stone-700 dark:text-stone-300 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition"
                    >
                      {d.name}
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-2xl bg-amber-500 hover:bg-amber-400 px-6 py-2.5 text-xs font-bold text-stone-950 shadow-xs transition"
                  >
                    Clear all filters
                  </button>
                  <Link
                    to="/transfers"
                    className="rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-6 py-2.5 text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-stone-50 transition"
                  >
                    Search Airport Transfers
                  </Link>
                </div>
              </div>
            ) : viewMode === "SPLIT" ? (
              /* ── Split Map & List View ── */
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                  {activities.map((a) => (
                    <div
                      key={a.id}
                      ref={(el) => (cardRefs.current[a.id] = el)}
                      onMouseEnter={() => setHoveredProductId(a.id)}
                      onMouseLeave={() => setHoveredProductId(null)}
                      className={`transition-all duration-200 rounded-3xl ${
                        selectedProductId === a.id ? "ring-2 ring-amber-500 shadow-xl" : ""
                      }`}
                    >
                      <TicketCard activity={a} />
                    </div>
                  ))}
                </div>

                <div className="h-[calc(100vh-200px)] sticky top-[140px]">
                  <SearchMapView
                    products={activities}
                    hoveredProductId={hoveredProductId}
                    selectedProductId={selectedProductId}
                    onSelectProduct={handleSelectProduct}
                    className="h-full"
                  />
                </div>
              </div>
            ) : (
              /* ── Grid View ── */
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {activities.map((a) => (
                  <div
                    key={a.id}
                    ref={(el) => (cardRefs.current[a.id] = el)}
                    onMouseEnter={() => setHoveredProductId(a.id)}
                    onMouseLeave={() => setHoveredProductId(null)}
                  >
                    <TicketCard activity={a} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
