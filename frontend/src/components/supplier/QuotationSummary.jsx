import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { addDays, legStays, markupForTarget } from "../../lib/quotationItinerary.js";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const KIND_LABELS = [["HOTEL", "Hotels"], ["TRANSPORT", "Cars"], ["ACTIVITY", "Activities"], ["CUSTOM", "Extras"], ["LISTING", "Your listings"]];

/**
 * The trip calculator (ADR 051): the trip at a glance and its live price while
 * the quotation is built. The price comes from the server's preview, never the
 * browser; "Price from a target" only sets the markup, which the server prices again.
 */
export default function QuotationSummary({ draft, preview, previewing, steps = [], lastDay, isAgentMode, editable, onMarkup }) {
  const [target, setTarget] = useState("");
  const stays = legStays(draft.legs).filter((stay) => stay.nights > 0);
  const people = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
  const totals = preview?.totals;
  const options = preview?.options || [];
  const missing = steps.flatMap((step) => step.missing.map((item) => ({ step: step.label, item }))).filter((row) => row.item !== "save to price it");
  const suggested = totals ? markupForTarget(totals, target) : null;
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-sm">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-stone-400">Trip at a glance</p>
        <p className="mt-1 font-bold text-stone-900">{draft.title || "Untitled trip"}</p>
        {stays.length > 0 && <p className="text-xs text-amber-800">{stays.map((stay) => `${stay.city} ${stay.nights}N`).join(" → ")}</p>}
        <p className="mt-1 text-xs text-stone-500">
          {draft.startDate}{lastDay > 1 && draft.startDate ? ` to ${addDays(draft.startDate, lastDay - 1)}` : ""} · {lastDay} day{lastDay === 1 ? "" : "s"} · {people} traveller{people === 1 ? "" : "s"}
        </p>
        {(draft.arrivalPoint || draft.departurePoint) && <p className="text-xs text-stone-500">{draft.arrivalPoint && `In: ${draft.arrivalPoint}`}{draft.arrivalPoint && draft.departurePoint && " · "}{draft.departurePoint && `Out: ${draft.departurePoint}`}</p>}
      </div>

      <div className="border-t border-stone-200 pt-3" aria-live="polite">
        <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-stone-400">
          {isAgentMode ? "Agent pays (net)" : "Customer pays"} {previewing && <Loader2 className="h-3 w-3 animate-spin" aria-label="Pricing" />}
        </p>
        {!totals || !(preview.lines || [{}]).some((line) => line.priceInr != null) ? <p className="mt-1 text-xs text-stone-500">Pick a hotel, car or activity to see the price.</p> : options.length ? (
          <ul className="mt-1 space-y-1">
            {options.map((option) => (
              <li key={option.number} className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-stone-700">{option.name}</span>
                <span className="text-right"><strong className="font-mono text-base">{inr(option.totals.totalInr)}</strong>{people > 1 && <span className="block text-[11px] text-stone-500">{inr(option.totals.perPersonInr)} / person</span>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="mt-1 font-mono text-2xl font-black text-stone-900">{inr(totals.totalInr)}</p>
            {people > 1 && <p className="text-xs text-stone-500">{inr(totals.perPersonInr)} per person{totals.perCoupleInr ? ` · ${inr(totals.perCoupleInr)} per couple` : ""}</p>}
          </>
        )}
        {totals && (
          <details className="mt-2 text-xs text-stone-600">
            <summary className="cursor-pointer font-bold text-stone-700">How it adds up{options.length ? ` (${options[0].name})` : ""}</summary>
            <ul className="mt-1 space-y-0.5">
              {KIND_LABELS.filter(([kind]) => totals.byKind?.[kind]).map(([kind, label]) => <li key={kind} className="flex justify-between"><span>{label}</span><span className="font-mono">{inr(totals.byKind[kind])}</span></li>)}
              <li className="flex justify-between border-t border-stone-200 pt-0.5"><span>Your costs</span><span className="font-mono">{inr(totals.costInr)}</span></li>
              <li className="flex justify-between"><span>Markup {Number(draft.markupPct) || 0}%</span><span className="font-mono">{inr(totals.markupInr)}</span></li>
              {totals.gstInr > 0 && <li className="flex justify-between"><span>GST {totals.gstPct}%</span><span className="font-mono">{inr(totals.gstInr)}</span></li>}
            </ul>
          </details>
        )}
        {preview?.unpriced > 0 && <p className="mt-2 flex items-start gap-1 text-xs text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{preview.unpriced} item{preview.unpriced === 1 ? " isn't" : "s aren't"} priced yet and {preview.unpriced === 1 ? "is" : "are"} left out.</p>}
      </div>

      {editable && totals?.costInr > 0 && (
        <div className="border-t border-stone-200 pt-3 text-xs">
          <label className="font-bold text-stone-700" htmlFor="quote-target">Price from a target</label>
          <div className="mt-1 flex gap-1.5">
            <input id="quote-target" type="number" min={0} inputMode="numeric" placeholder={`e.g. ${Math.round(totals.totalInr / 1000) * 1000 || 25000}`} value={target} onChange={(event) => setTarget(event.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" />
            <button type="button" disabled={suggested == null} onClick={() => { onMarkup(suggested); setTarget(""); }} className="shrink-0 rounded-xl bg-stone-900 px-3 py-2 font-bold text-white disabled:opacity-40">Set</button>
          </div>
          {suggested != null && <p className="mt-1 text-stone-500">Markup {suggested}%{suggested === 0 || suggested === 200 ? " (the most it can go)" : ""}</p>}
        </div>
      )}

      <div className="border-t border-stone-200 pt-3 text-xs">
        {missing.length ? (
          <>
            <p className="font-bold text-stone-700">Still to do</p>
            <ul className="mt-1 space-y-0.5 text-stone-600">{missing.slice(0, 6).map((row) => <li key={`${row.step}-${row.item}`}>• {row.item} <span className="text-stone-400">({row.step})</span></li>)}</ul>
          </>
        ) : <p className="flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ready to save and send</p>}
      </div>
    </div>
  );
}

// The phone's view of the price: a bar along the bottom of the screen.
export function QuotationPriceBar({ preview, previewing, isAgentMode }) {
  const totals = preview?.totals;
  if (!totals) return null;
  const options = preview.options || [];
  return (
    <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-between gap-3 border-t border-stone-200 bg-white/95 px-6 py-3 text-sm backdrop-blur lg:hidden">
      <span className="text-xs text-stone-500">{isAgentMode ? "Agent pays" : "Customer pays"}{previewing ? "…" : ""}</span>
      <strong className="font-mono">{options.length ? `from ${inr(Math.min(...options.map((option) => option.totals.totalInr)))}` : inr(totals.totalInr)}</strong>
    </div>
  );
}
