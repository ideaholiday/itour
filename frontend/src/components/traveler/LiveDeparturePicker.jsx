import React, { useEffect, useState } from "react";

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!slots.length && !error) return null;
  return <section className="my-4 rounded-xl border border-emerald-200 bg-white p-4"><h3 className="font-bold text-stone-900">Live departure availability</h3><p className="mt-1 text-xs text-stone-600">India Standard Time · Updated every 15 seconds</p>
    {error && <p role="alert">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">{slots.map(slot => <button key={slot.id} type="button" disabled={!slot.available} aria-pressed={(selectedTime === slot.localTime && (!selectedOptionId || selectedOptionId === slot.optionId))} onClick={() => onSelect(slot)} className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${(selectedTime === slot.localTime && (!selectedOptionId || selectedOptionId === slot.optionId)) ? "border-emerald-800 bg-emerald-50" : "border-stone-300"}`}>{slot.optionName ? `${slot.optionName} · ` : ""}{slot.localTime} · {slot.available ? `${slot.vacancies} seats left` : slot.status.replaceAll("_", " ")}</button>)}</div>
  </section>;
}
