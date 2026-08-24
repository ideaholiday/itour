import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Globe } from "lucide-react";
import { useCurrency } from "../lib/currency.jsx";

export default function CurrencySelector({ className = "" }) {
  const { currency, setCurrency, currencies } = useCurrency();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const activeInfo = currencies.find((c) => c.code === currency) || currencies[0];

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-800/80 px-3 py-1.5 text-xs font-bold text-stone-700 dark:text-stone-200 hover:border-amber-400 hover:text-amber-800 dark:hover:text-amber-400 shadow-xs transition-all cursor-pointer"
        aria-haspopup="true"
        aria-expanded={open}
        title="Select Display Currency"
      >
        <span className="text-sm leading-none">{activeInfo.flag}</span>
        <span className="font-mono">{activeInfo.code} ({activeInfo.symbol})</span>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 border-b border-stone-100 dark:border-stone-800 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 flex items-center gap-1">
              <Globe className="w-3 h-3 text-amber-500" /> Select Currency
            </span>
          </div>

          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {currencies.map((c) => {
              const isSelected = c.code === currency;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCurrency(c.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                    isSelected
                      ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-bold"
                      : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base leading-none">{c.flag}</span>
                    <div>
                      <div className="font-bold font-mono leading-tight">{c.code} ({c.symbol})</div>
                      <div className="text-[10px] text-stone-600 dark:text-stone-400 leading-tight">{c.name}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-1 pt-1.5 border-t border-stone-100 dark:border-stone-800 px-2 text-[9px] text-stone-600 dark:text-stone-400 text-center">
            Checkout is processed in INR (₹)
          </div>
        </div>
      )}
    </div>
  );
}
