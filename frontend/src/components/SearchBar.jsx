import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, MapPin, Search, Calendar, Sparkles } from "lucide-react";
import DatePicker, { toLocalISO } from "./ui/DatePicker.jsx";
import { api } from "../lib/api.js";
import { destinationParam } from "../lib/destinations.js";

export default function SearchBar({ initial = "" }) {
  const [q, setQ] = useState(initial);
  const [date, setDate] = useState("");
  const [destinations, setDestinations] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // "where" | "when"
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const query = q.trim();
  const matchingDestinations = query
    ? destinations.filter((d) => `${d.name} ${d.state || ""} ${d.country || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : [];

  useEffect(() => {
    api.getDestinations().then((data) => setDestinations(Array.isArray(data) ? data : [])).catch(() => setDestinations([]));
  }, []);

  useEffect(() => {
    if (!query) { setExperiences([]); setSearching(false); return undefined; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.getActivities({ q: query })
        .then((data) => { if (active) setExperiences(Array.isArray(data) ? data.slice(0, 4) : []); })
        .catch(() => { if (active) setExperiences([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const close = (event) => {
      if (!containerRef.current?.contains(event.target)) { setShowSuggestions(false); setFocusedField(null); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (date) params.set("date", date);
    setShowSuggestions(false);
    setFocusedField(null);
    navigate(`/search${params.toString() ? `?${params}` : ""}`);
  };

  const searchFor = (value = query, destination = "") => {
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    if (destination) params.set("destination", destination);
    if (date) params.set("date", date);
    setShowSuggestions(false);
    setFocusedField(null);
    navigate(`/search${params.toString() ? `?${params}` : ""}`);
  };

  const isFocused = focusedField !== null;

  return (
    <form
      ref={containerRef}
      onSubmit={submit}
      className={`relative w-full max-w-4xl rounded-2xl bg-white/95 dark:bg-stone-900/95 backdrop-blur-md p-2 transition-all duration-300 border sm:flex sm:items-center sm:rounded-full ${
        isFocused
          ? "shadow-[0_8px_40px_rgba(0,0,0,0.25)] border-amber-400/50 ring-2 ring-amber-400/20"
          : "shadow-[0_8px_32px_rgba(0,0,0,0.18)] border-white/30 hover:shadow-[0_8px_40px_rgba(0,0,0,0.22)]"
      }`}
    >
      {/* ── Where? field ── */}
      <label
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3.5 sm:rounded-l-full sm:py-2.5 cursor-text transition-colors duration-200 ${
          focusedField === "where" ? "bg-amber-50/60 dark:bg-amber-900/20" : ""
        }`}
      >
        <MapPin className={`h-5 w-5 shrink-0 transition-colors duration-200 ${focusedField === "where" ? "text-amber-600" : "text-amber-500"}`} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">Where to?</span>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { setShowSuggestions(true); setFocusedField("where"); }}
            placeholder="Search a destination or experience"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && Boolean(query)}
            className="w-full bg-transparent text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none placeholder:font-medium placeholder:text-stone-400 dark:placeholder:text-stone-500 sm:text-base"
          />
        </span>
      </label>

      {/* Divider */}
      <div className="hidden h-10 w-px bg-stone-200 dark:bg-stone-700 sm:block" />

      {/* ── When? field ── */}
      <div
        className={`flex items-center gap-3 rounded-xl px-4 py-3.5 sm:w-56 sm:py-2.5 transition-colors duration-200 ${
          focusedField === "when" ? "bg-amber-50/60 dark:bg-amber-900/20" : ""
        }`}
        onClick={() => setFocusedField("when")}
      >
        <Calendar className={`h-5 w-5 shrink-0 transition-colors duration-200 ${focusedField === "when" ? "text-amber-600" : "text-amber-500"}`} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">When?</span>
          <DatePicker
            value={date}
            min={toLocalISO(new Date())}
            onChange={(v) => { setDate(v); setFocusedField(null); }}
            theme="light"
            clearable
            placeholder="Choose a date"
            buttonClassName="border-0 bg-transparent px-0 py-1 hover:border-transparent text-sm font-semibold text-stone-900 dark:text-stone-100"
          />
        </span>
      </div>

      {/* ── Search button ── */}
      <button
        type="submit"
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-7 py-4 text-sm font-bold text-stone-950 transition-all duration-200 shadow-sm hover:shadow-glow-sm sm:w-auto sm:rounded-full sm:py-3.5 overflow-hidden relative"
      >
        <Search className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
        <span>Search</span>
        {/* Shimmer sweep */}
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
      </button>

      {/* ── Autocomplete dropdown ── */}
      {showSuggestions && query && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-[60] max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-2 shadow-xl animate-reveal-in sm:left-4 sm:right-auto sm:w-[min(34rem,calc(100%-2rem))]"
        >
          {/* Search for query */}
          <button
            type="button"
            onClick={() => searchFor()}
            className="flex w-full items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-3 py-3 text-left text-sm font-semibold text-amber-950 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
          >
            <Search className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            Search for "{query}"
          </button>

          {/* Destination suggestions */}
          {matchingDestinations.length > 0 && (
            <div className="mt-2">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500">Destinations</p>
              {matchingDestinations.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => searchFor(d.name, destinationParam(d))}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <MapPin className="h-4 w-4 text-amber-600" />
                  </span>
                  <span>
                    <span className="block font-semibold">{d.name}</span>
                    {d.state && <span className="block text-xs text-stone-400 dark:text-stone-500">{d.country && d.country !== "India" ? d.country : d.state}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Experience suggestions */}
          {(searching || experiences.length > 0) && (
            <div className="mt-2 border-t border-stone-100 dark:border-stone-800 pt-2">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500">Experiences</p>
              {searching ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-500" />
                  Finding experiences…
                </div>
              ) : (
                experiences.map((exp) => (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => searchFor(exp.title)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-100 dark:bg-stone-800">
                      <Sparkles className="h-4 w-4 text-stone-400" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-200">{exp.title}</span>
                      <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{exp.city}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
