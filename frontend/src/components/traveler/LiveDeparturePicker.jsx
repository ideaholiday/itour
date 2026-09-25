import React, { useEffect, useRef, useState } from "react";

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Slots carry their city's zone (ADR 023); a Bangkok 09:00 is 09:00 in Bangkok.
const ZONE_NAMES = { "Asia/Kolkata": "India Standard Time", "Asia/Bangkok": "Thailand time (ICT)" };
const zoneName = slot => ZONE_NAMES[slot?.timeZone] || (slot?.timeLabel ? `Local time (${slot.timeLabel})` : "India Standard Time");
const rupees = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export default function LiveDeparturePicker({ productId, date, selectedTime, selectedOptionId, onSelect }) {
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!productId || !VALID_DATE.test(String(date || ""))) {
      setSlots([]);
      setError("");
      return;
    }
    let active = true;
    const refresh = () => fetch(`/api/availability/native/${encodeURIComponent(productId)}?date=${encodeURIComponent(date)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) {
        const rawMsg = String(data.error || "");
        const looksLikeJson = rawMsg.trimStart().startsWith("[") || rawMsg.trimStart().startsWith("{");
        throw new Error(looksLikeJson ? "Choose a valid tour date." : (rawMsg || "Choose a valid tour date."));
      }
      if (active) { setSlots(data.slots || []); setError(""); }
    }).catch((err) => { if (active) setError(err?.message || "Availability could not be refreshed. Please choose another tour date."); });
    refresh(); const interval = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [productId, date]);

  // The page falls back to the product's first start time, which a supplier may
  // have closed for this date. Move the traveler to a departure they can book
  // rather than leaving them on an error, once per product and date.
  const autoSelectedFor = useRef("");
  useEffect(() => {
    if (!slots.length) return;
    const key = `${productId}:${date}`;
    if (autoSelectedFor.current === key) return;
    const current = slots.find(slot => slot.localTime === selectedTime && (!selectedOptionId || slot.optionId === selectedOptionId));
    if (current?.available) { autoSelectedFor.current = key; return; }
    const firstAvailable = slots.find(slot => slot.available);
    if (firstAvailable) {
      autoSelectedFor.current = key;
      onSelect(firstAvailable);
    }
  }, [slots, productId, date, selectedTime, selectedOptionId, onSelect]);

  if (!slots.length && !error) return null;

  // Party minimums and seasonal rates are set per departure, but in practice a
  // whole date usually shares them. Surface them once above the list so the
  // traveler sees the rule before they start picking times.
  const minimum = Math.max(0, ...slots.map(slot => Number(slot.minPartySize) || 0));
  const seasonal = slots.find(slot => slot.priceScheduleLabel)?.priceScheduleLabel;
  const promoted = slots.find(slot => slot.promotion)?.promotion?.label;

  return <section className="my-4 rounded-xl border border-emerald-200 bg-white p-4"><h3 className="font-bold text-stone-900">Live departure availability</h3><p className="mt-1 text-xs text-stone-600">{zoneName(slots[0])} · Updated every 15 seconds</p>
    {error && <p role="alert">{error}</p>}
    {seasonal && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{seasonal} pricing applies on this date.</p>}
    {promoted && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{promoted} — discount already applied below.</p>}
    {minimum > 1 && <p className="mt-2 text-xs text-stone-600">This experience runs with a minimum of {minimum} travelers.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{slots.map(slot => {
      const selected = selectedTime === slot.localTime && (!selectedOptionId || selectedOptionId === slot.optionId);
      return <button key={slot.id} type="button" disabled={!slot.available} aria-pressed={selected} onClick={() => onSelect(slot)}
        className={`rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${selected ? "border-emerald-800 bg-emerald-50" : "border-stone-300"}`}>
        <span className="block font-semibold">{slot.optionName ? `${slot.optionName} · ` : ""}{slot.localTime}</span>
        <span className="block text-xs text-stone-600">
          {slot.available ? `${slot.vacancies} seats left` : slot.status.replaceAll("_", " ")}
          {slot.adultPrice != null && (
            <> · {slot.listAdultPrice > slot.adultPrice && (
              <span className="text-stone-400 line-through">{rupees(slot.listAdultPrice)}</span>
            )} <span className={slot.listAdultPrice > slot.adultPrice ? "font-semibold text-emerald-800" : ""}>{rupees(slot.adultPrice)}</span> per adult</>
          )}
        </span>
        {slot.promotion && (
          <span className="block text-xs font-semibold text-emerald-800">
            {slot.promotion.label || "Promotion"} applied
          </span>
        )}
        {slot.supplierNote && <span className="block text-xs text-amber-800">{slot.supplierNote}</span>}
      </button>;
    })}</div>
    <p className="mt-2 text-xs text-stone-500">Prices are per traveler before 5% tax.</p>
  </section>;
}
