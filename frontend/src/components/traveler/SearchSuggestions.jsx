import { activityPath } from "../../lib/activityUrl.js";
import React, { useState, useEffect, useRef } from "react";
import { MapPin, Compass, ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";

// Fast in-memory cache across typing sessions
const clientSuggestionsCache = new Map();

export function SearchSuggestions({ query, onSelect, className = "" }) {
  const [suggestions, setSuggestions] = useState({ destinations: [], products: [], experiences: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const trimmed = (query || "").trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions({ destinations: [], products: [], experiences: [], categories: [] });
      setLoading(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    if (clientSuggestionsCache.has(cacheKey)) {
      setSuggestions(clientSuggestionsCache.get(cacheKey));
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.getSuggestions(trimmed, { signal: controller.signal });
        if (res && !controller.signal.aborted) {
          const normalized = {
            destinations: Array.isArray(res.destinations) ? res.destinations : [],
            products: Array.isArray(res.products) ? res.products : [],
            experiences: Array.isArray(res.experiences) ? res.experiences : [],
            categories: Array.isArray(res.categories) ? res.categories : [],
          };
          clientSuggestionsCache.set(cacheKey, normalized);
          setSuggestions(normalized);
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error("Suggestions error", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const hasDestinations = suggestions.destinations?.length > 0;
  const rawProducts = suggestions.products?.length > 0 ? suggestions.products : suggestions.experiences || [];
  const hasProducts = rawProducts.length > 0;
  const hasCategories = suggestions.categories?.length > 0;

  const hasResults = hasDestinations || hasProducts || hasCategories;

  if (!query || query.trim().length < 2 || (!loading && !hasResults)) {
    return null;
  }

  return (
    <div
      className={`absolute left-0 right-0 top-full mt-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl z-50 overflow-hidden divide-y divide-stone-100 dark:divide-stone-800 animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* Destinations */}
      {hasDestinations && (
        <div className="p-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 block mb-1.5">
            Destinations
          </span>
          <div className="space-y-1">
            {suggestions.destinations.map((dest, idx) => {
              const destName = typeof dest === "string" ? dest : dest.destination || dest.name || "";
              const primaryName = destName.split(",")[0].trim();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelect && onSelect({ type: "destination", value: primaryName })}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 transition-colors">
                        {destName}
                      </span>
                      <span className="text-[10px] text-stone-400 block">
                        {dest?.count ? `${dest.count} experiences available` : "Explore destination"}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Experiences & Products */}
      {hasProducts && (
        <div className="p-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 block mb-1.5">
            Experiences & Transfers
          </span>
          <div className="space-y-1">
            {rawProducts.map((prod, idx) => {
              const isObj = typeof prod === "object" && prod !== null;
              const title = isObj ? prod.title : prod;
              const id = isObj ? prod.id : null;
              const subtext = isObj && (prod.destination || prod.price_inr)
                ? `${prod.destination || ""} ${prod.price_inr ? `· ₹${Number(prod.price_inr).toLocaleString("en-IN")}` : ""}`.trim()
                : "Top recommended experience";

              if (id) {
                return (
                  <Link
                    key={id || idx}
                    to={activityPath(id, title)}
                    onClick={() => onSelect && onSelect({ type: "product", value: prod })}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0">
                        <Compass className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate block group-hover:text-amber-600 transition-colors">
                          {title}
                        </span>
                        <span className="text-[10px] text-stone-400 flex items-center gap-1">
                          {subtext}
                        </span>
                      </div>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition-colors" />
                  </Link>
                );
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelect && onSelect({ type: "experience", value: title })}
                  className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center shrink-0">
                      <Compass className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate block group-hover:text-amber-600 transition-colors">
                        {title}
                      </span>
                      <span className="text-[10px] text-stone-400 block">
                        Search all matching experiences
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchSuggestions;
