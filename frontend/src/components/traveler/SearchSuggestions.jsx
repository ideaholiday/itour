import React, { useState, useEffect, useRef } from "react";
import { Search, MapPin, Compass, Clock, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../lib/api";

export function SearchSuggestions({ query, onSelect, className = "" }) {
  const [suggestions, setSuggestions] = useState({ destinations: [], products: [], categories: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions({ destinations: [], products: [], categories: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search/suggestions?q=${encodeURIComponent(query.trim())}`);
        if (res) {
          setSuggestions(res);
        }
      } catch (err) {
        console.error("Suggestions error", err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const hasResults =
    suggestions.destinations?.length > 0 ||
    suggestions.products?.length > 0 ||
    suggestions.categories?.length > 0;

  if (!query || query.trim().length < 2 || (!loading && !hasResults)) {
    return null;
  }

  return (
    <div
      className={`absolute left-0 right-0 top-full mt-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl z-50 overflow-hidden divide-y divide-stone-100 dark:divide-stone-800 animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {/* Destinations */}
      {suggestions.destinations?.length > 0 && (
        <div className="p-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 block mb-1.5">
            Destinations
          </span>
          <div className="space-y-1">
            {suggestions.destinations.map((dest, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelect && onSelect({ type: "destination", value: dest.destination })}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 group-hover:text-amber-600">
                      {dest.destination}
                    </span>
                    <span className="text-[10px] text-stone-400 block">{dest.count} experiences available</span>
                  </div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-600 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Experiences */}
      {suggestions.products?.length > 0 && (
        <div className="p-3">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-2 block mb-1.5">
            Experiences & Transfers
          </span>
          <div className="space-y-1">
            {suggestions.products.map((prod) => (
              <Link
                key={prod.id}
                to={`/activity/${prod.id}`}
                onClick={() => onSelect && onSelect({ type: "product", value: prod })}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 flex items-center justify-center shrink-0">
                    <Compass className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate block group-hover:text-amber-600">
                      {prod.title}
                    </span>
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      {prod.destination} · ₹{prod.price_inr?.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchSuggestions;
