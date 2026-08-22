import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import DatePicker, { toLocalISO } from "./ui/DatePicker.jsx";
import { api } from "../lib/api.js";

export default function SearchBar({ initial = "" }) {
  const [q, setQ] = useState(initial);
  const [date, setDate] = useState("");
  const [destinations, setDestinations] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const query = q.trim();
  const matchingDestinations = query
    ? destinations.filter((destination) => `${destination.name} ${destination.state || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : [];

  useEffect(() => {
    api.getDestinations().then((data) => setDestinations(Array.isArray(data) ? data : [])).catch(() => setDestinations([]));
  }, []);

  useEffect(() => {
    if (!query) {
      setExperiences([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.getActivities({ q: query })
        .then((data) => { if (active) setExperiences(Array.isArray(data) ? data.slice(0, 4) : []); })
        .catch(() => { if (active) setExperiences([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const closeSuggestions = (event) => {
      if (!containerRef.current?.contains(event.target)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", closeSuggestions);
    return () => document.removeEventListener("mousedown", closeSuggestions);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (date) params.set("date", date);
    setShowSuggestions(false);
    navigate(`/search${params.toString() ? `?${params}` : ""}`);
  };

  const searchFor = (value = query, destination = "") => {
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    if (destination) params.set("destination", destination);
    if (date) params.set("date", date);
    setShowSuggestions(false);
    navigate(`/search${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <form ref={containerRef} onSubmit={submit} className="relative w-full max-w-4xl rounded-2xl bg-white p-2 shadow-xl border border-stone-200 sm:flex sm:items-center sm:rounded-full">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3.5 sm:rounded-l-full sm:py-2">
        <MapPin className="h-5 w-5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">Where to?</span>
          <input
            value={q}
            onChange={(event) => { setQ(event.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search a destination or experience"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && Boolean(query)}
            className="w-full bg-transparent text-sm font-semibold text-stone-900 outline-none placeholder:font-medium placeholder:text-stone-400 sm:text-base"
          />
        </span>
      </label>
      <div className="hidden h-9 w-px bg-stone-200 sm:block" />
      <div className="flex items-center gap-3 rounded-xl px-4 py-3.5 sm:w-60 sm:py-2">
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500">When?</span>
          <DatePicker value={date} min={toLocalISO(new Date())} onChange={setDate} theme="light" clearable placeholder="Choose a date" buttonClassName="border-0 bg-transparent px-0 py-1 hover:border-transparent" />
        </span>
      </div>
      <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-7 py-4 text-sm font-bold text-stone-950 transition shadow-sm sm:w-auto sm:rounded-full">
        <Search className="h-5 w-5" /> Search
      </button>

      {showSuggestions && query && (
        <div role="listbox" className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[min(30rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-2 shadow-2xl sm:left-4 sm:right-auto sm:w-[min(32rem,calc(100%-2rem))]">
          <button type="button" onClick={() => searchFor()} className="flex w-full items-center gap-3 rounded-xl bg-amber-50 px-3 py-3 text-left text-sm font-semibold text-amber-950 hover:bg-amber-100">
            <Search className="h-4 w-4 shrink-0 text-amber-700" />
            Search for “{query}”
          </button>

          {matchingDestinations.length > 0 && (
            <div className="mt-2">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">Destinations</p>
              {matchingDestinations.map((destination) => (
                <button key={destination.id} type="button" onClick={() => searchFor(destination.name, destination.id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50">
                  <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>{destination.name}{destination.state ? `, ${destination.state}` : ""}</span>
                </button>
              ))}
            </div>
          )}

          {(searching || experiences.length > 0) && (
            <div className="mt-2 border-t border-stone-100 pt-2">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">Experiences</p>
              {searching ? <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Finding experiences…</div> : experiences.map((experience) => (
                <button key={experience.id} type="button" onClick={() => searchFor(experience.title)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-stone-50">
                  <Search className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-stone-800">{experience.title}</span><span className="block truncate text-xs text-stone-500">{experience.city}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
