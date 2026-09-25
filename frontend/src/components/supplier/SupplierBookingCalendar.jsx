import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(month, delta) {
  const [year, index] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, index - 1 + delta, 1));
  return next.toISOString().slice(0, 7);
}

/**
 * Booking calendar (ADR 037): guests and bookings per day for a month. Picking
 * a day opens it on the departures board.
 */
export default function SupplierBookingCalendar({ supplierId, selected, onSelect }) {
  const [month, setMonth] = useState((selected || new Date().toISOString()).slice(0, 7));
  const [days, setDays] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    setError("");
    fetch(`/api/suppliers/${supplierId}/booking-calendar?month=${month}`, { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The calendar couldn't be loaded");
        if (active) setDays(Object.fromEntries((data.days || []).map((day) => [day.date, day])));
      })
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [supplierId, month]);

  const [year, index] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, index - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const title = new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Booking calendar</span>
          <h2 className="mt-1 font-serif text-xl font-bold text-stone-900">{title}</h2>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="rounded-xl border border-stone-300 p-2 text-stone-600 hover:bg-stone-50"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="rounded-xl border border-stone-300 p-2 text-stone-600 hover:bg-stone-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="pb-1 text-[10px] font-bold uppercase text-stone-400">{day}</span>)}
        {cells.map((date, position) => {
          if (!date) return <span key={`blank-${position}`} />;
          const day = days[date];
          const isSelected = date === selected;
          return (
            <button key={date} type="button" onClick={() => onSelect?.(date)} aria-pressed={isSelected}
              aria-label={`${date}: ${day ? `${day.guests} guests, ${day.bookings} bookings` : "no bookings"}`}
              className={`min-h-14 rounded-xl border p-1.5 text-left text-xs transition ${isSelected ? "border-amber-500 bg-amber-50" : day ? "border-stone-200 bg-[#FAF9F6] hover:border-amber-300" : "border-transparent hover:bg-stone-50"}`}>
              <span className="block font-bold text-stone-700">{Number(date.slice(8))}</span>
              {day && <span className="mt-0.5 block text-[10px] font-semibold text-amber-800">{day.guests} guest{day.guests === 1 ? "" : "s"}</span>}
              {day && <span className="block text-[10px] text-stone-500">{day.departures} dep.</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
