import React from "react";
import { Copy, MapPin, Route, Signpost } from "lucide-react";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

/**
 * How a new quotation starts (ADR 051): a ready route, a past quotation, one
 * city, or several cities. Each opens the builder at the step that fits.
 */
export default function QuotationStart({ recent = [], hasRoutes, onPick, onCopy, onCancel }) {
  const choices = [
    ["SINGLE", MapPin, "Single city", "One city, one hotel, sightseeing day by day. E.g. Varanasi 3N."],
    ["MULTI", Signpost, "Multi-city", "Several cities in order, a hotel in each, cars between them. E.g. Lucknow 2N → Ayodhya 1N → Varanasi 2N."],
    ...(hasRoutes ? [["ROUTE", Route, "Ready route", "Start from a route in the library or one you saved, then adjust."]] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-stone-900">How do you want to start?</h3>
        <button type="button" onClick={onCancel} className="text-sm font-bold text-stone-600 underline">Cancel</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {choices.map(([key, Icon, label, hint]) => (
          <button key={key} type="button" onClick={() => onPick(key)} className="flex flex-col items-start gap-2 rounded-2xl border border-stone-200 p-4 text-left hover:border-amber-400 hover:bg-amber-50 focus-visible:border-amber-500">
            <Icon className="h-6 w-6 text-amber-600" />
            <strong className="text-base text-stone-900">{label}</strong>
            <span className="text-sm text-stone-500">{hint}</span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <div className="rounded-2xl border border-stone-200 p-4">
          <p className="flex items-center gap-1 text-sm font-bold text-stone-800"><Copy className="h-4 w-4" /> Or copy a past quotation</p>
          <p className="text-xs text-stone-500">Same cities, hotels, cars and text, priced again for the new dates.</p>
          <ul className="mt-2 divide-y divide-stone-100">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0"><strong className="block truncate text-stone-900">{row.title}</strong><span className="text-xs text-stone-500">{row.ref}{row.destination ? ` · ${row.destination}` : ""} · {inr(row.totalInr)}</span></span>
                <button type="button" onClick={() => onCopy(row.id)} className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold">Copy</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
