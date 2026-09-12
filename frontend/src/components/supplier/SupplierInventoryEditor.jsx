import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import { authHeaders } from "../../lib/api.js";
import SupplierRatesPanel from "./SupplierRatesPanel.jsx";
import SupplierCalendarPanel from "./SupplierCalendarPanel.jsx";

const getDefaults = (product) => {
  const basePrice = Number(product?.price_inr || product?.priceInr || 1000);
  return {
    operatingDays: [0, 1, 2, 3, 4, 5, 6],
    departureTimes: ["09:00"],
    capacity: 20,
    adultPrice: basePrice,
    childPrice: Math.round(basePrice * 0.5),
    cutoffMinutes: 120,
    cancellationHours: 24,
    blackoutDates: [],
    minPartySize: 1,
    maxPartySize: 0,
    unitPrices: {}
  };
};
const json = value => typeof value === "string" ? JSON.parse(value) : value;

const MAX_BLACKOUT_DATES = 730;
const MAX_BLACKOUT_RANGE_DAYS = 366;

// Expands an inclusive date range into individual YYYY-MM-DD strings so a
// supplier can close a whole season (e.g. monsoon, off-season) in one action
// instead of adding each date one at a time.
function expandDateRange(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > MAX_BLACKOUT_RANGE_DAYS) return [];
  const dates = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export default function SupplierInventoryEditor({ supplierId, product, onClose }) {
  const dialogRef = useRef(null);
  const [blackoutDate, setBlackoutDate] = useState("");
  const [blackoutRangeFrom, setBlackoutRangeFrom] = useState("");
  const [blackoutRangeTo, setBlackoutRangeTo] = useState("");
  const [newDepartureTime, setNewDepartureTime] = useState("");
  const [options, setOptions] = useState([]);
  const [optionId, setOptionId] = useState("");
  const [rules, setRules] = useState(() => getDefaults(product));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState("schedule");
  const base = `/api/suppliers/${supplierId}/products/${product.id}/inventory`;
  // Rates and calendar both hang off saved inventory, so they stay locked until
  // this option has a schedule to attach them to.
  const inventorySaved = Boolean(options.find(option => option.id === optionId)?.inventory);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("button")?.focus();
    const keydown = event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = [...dialogRef.current.querySelectorAll("button:not(:disabled), input, select, textarea")];
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); previousFocus?.focus(); };
  }, []);

  const loadOptions = () => {
    setIsLoading(true);
    setMessage("");
    fetch(base, { headers: authHeaders() }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const opts = data.options || [];
      setOptions(opts);
      if (opts.length > 0) {
        setOptionId(current => (opts.some(o => o.id === current) ? current : opts[0].id));
      } else {
        setMessage("No booking options available. Please retry to load default options.");
      }
    }).catch(error => { setMessage(error.message); }).finally(() => { setIsLoading(false); });
  };

  useEffect(() => {
    loadOptions();
  }, [base]);
  useEffect(() => {
    const saved = options.find(option => option.id === optionId)?.inventory;
    setRules(saved ? { operatingDays: json(saved.operating_days), departureTimes: json(saved.departure_times), capacity: Number(saved.capacity), adultPrice: Number(saved.adult_price), childPrice: Number(saved.child_price), cutoffMinutes: Number(saved.cutoff_minutes), cancellationHours: Number(saved.cancellation_hours), blackoutDates: json(saved.blackout_dates), minPartySize: Number(saved.min_party_size ?? 1), maxPartySize: Number(saved.max_party_size ?? 0), unitPrices: json(saved.unit_prices || "{}") } : getDefaults(product));
  }, [optionId, options, product]);
  const update = (key, value) => setRules(current => ({ ...current, [key]: value }));
  async function save(event) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch(`${base}/${optionId}`, { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(rules) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      // Reload so the rates and calendar tabs unlock straight away rather than
      // waiting for the supplier to close and reopen the editor.
      loadOptions();
      setMessage("Saved. Departures now accept instant bookings with a 10-minute checkout hold.");
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }
  const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 p-2 text-stone-900";
  return createPortal(<div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Seats and schedule">
    <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 text-sm text-stone-900">
      <div className="flex justify-between gap-4"><h2 className="text-xl font-bold">Seats and schedule</h2><button type="button" onClick={onClose} aria-label="Close inventory editor">Close</button></div>
      <p className="mt-2 text-stone-600">{product.title} · All times are India Standard Time. Every traveler, of any type, uses one seat.</p>
      <label className="mt-4 block">Booking option
        <div className="flex items-center gap-2">
          <select disabled={isLoading || options.length === 0} className={inputClass} value={optionId} onChange={e => setOptionId(e.target.value)}>
            {options.length === 0 ? (
              <option value="">{isLoading ? "Loading options…" : "No options found"}</option>
            ) : (
              options.map(option => <option key={option.id} value={option.id}>{option.name || "Standard option"}</option>)
            )}
          </select>
          {options.length === 0 && !isLoading && (
            <button type="button" onClick={loadOptions} className="mt-1 whitespace-nowrap rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50">
              Refresh
            </button>
          )}
        </div>
      </label>

      <nav className="mt-4 flex gap-1 border-b border-stone-200" aria-label="Inventory sections">
        {[["schedule", "Seats & schedule"], ["rates", "Seasonal rates"], ["calendar", "Calendar"]].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
            className={`rounded-t-lg px-3 py-2 font-semibold ${tab === key ? "border-b-2 border-emerald-800 text-emerald-900" : "text-stone-500 hover:text-stone-800"}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "schedule" && <form onSubmit={save}>
      <fieldset className="mt-4"><legend className="font-semibold">Operating days</legend><div className="mt-2 flex flex-wrap gap-3">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <label key={day}><input type="checkbox" checked={rules.operatingDays.includes(index)} onChange={e => update("operatingDays", e.target.checked ? [...rules.operatingDays, index] : rules.operatingDays.filter(item => item !== index))} /> {day}</label>)}</div></fieldset>
      <fieldset className="mt-4">
        <legend className="font-semibold">Departure times</legend>
        <p className="mt-1 text-xs text-stone-500">Every time below repeats automatically on every checked operating day going forward. No need to add each date.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {rules.departureTimes.map(time => (
            <button key={time} type="button" className="rounded-lg bg-stone-100 px-2 py-1" onClick={() => update("departureTimes", rules.departureTimes.filter(value => value !== time))} aria-label={`Remove departure time ${time}`}>{time} ×</button>
          ))}
          {rules.departureTimes.length === 0 && <span className="text-xs text-stone-500">No departure times yet.</span>}
        </div>
        <div className="mt-2 flex items-end gap-2">
          <label className="flex-1">Add a time<input type="time" className={inputClass} value={newDepartureTime} onChange={e => setNewDepartureTime(e.target.value)} /></label>
          <button type="button" disabled={!newDepartureTime} className="rounded-lg border p-2" onClick={() => { update("departureTimes", [...new Set([...rules.departureTimes, newDepartureTime])].sort()); setNewDepartureTime(""); }}>Add time</button>
        </div>
      </fieldset>
      <div className="mt-4 grid grid-cols-2 gap-4">{[["capacity", "Seats per departure", 1], ["adultPrice", "Adult price (₹, before 5% tax)", 1], ["childPrice", "Child price (₹, before 5% tax)", 0], ["cutoffMinutes", "Stop bookings before start (minutes)", 0], ["cancellationHours", "Free cancellation before start (hours)", 0]].map(([key, label, min]) => <label key={key}>{label}<input required type="number" min={min} step="1" className={inputClass} value={rules[key]} onChange={e => update(key, Number(e.target.value))} /></label>)}</div>
      <fieldset className="mt-4">
        <legend className="font-semibold">Party size</legend>
        <p className="mt-1 text-xs text-stone-500">Use the minimum for departures that only run with a group. Set the maximum to 0 for no limit.</p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <label>Minimum travelers to run
            <input required type="number" min="1" max="100" step="1" className={inputClass}
              value={rules.minPartySize} onChange={e => update("minPartySize", Number(e.target.value))} />
          </label>
          <label>Maximum per booking
            <input required type="number" min="0" max="100" step="1" className={inputClass}
              value={rules.maxPartySize} onChange={e => update("maxPartySize", Number(e.target.value))} />
          </label>
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="font-semibold">Other traveler types</legend>
        <p className="mt-1 text-xs text-stone-500">Leave blank if you do not sell that type. Blank types cannot be booked.</p>
        <div className="mt-2 grid grid-cols-3 gap-4">
          {[["SENIOR", "Senior (₹)"], ["YOUTH", "Youth (₹)"], ["INFANT", "Infant (₹)"]].map(([unitType, label]) => (
            <label key={unitType}>{label}
              <input type="number" min="0" step="1" className={inputClass}
                value={rules.unitPrices?.[unitType] ?? ""}
                onChange={e => update("unitPrices", (() => {
                  const next = { ...rules.unitPrices };
                  if (e.target.value === "") delete next[unitType];
                  else next[unitType] = Number(e.target.value);
                  return next;
                })())} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="font-semibold">Blackout dates</legend>
        <p className="mt-1 text-xs text-stone-500">Close a single date, or block a whole season (e.g. monsoon, festival closure) in one action.</p>
        <div className="flex items-end gap-2"><label className="flex-1">Date to close<input type="date" className={inputClass} value={blackoutDate} onChange={e => setBlackoutDate(e.target.value)} /></label><button type="button" disabled={!blackoutDate} className="rounded-lg border p-2" onClick={() => { update("blackoutDates", [...new Set([...rules.blackoutDates, blackoutDate])].sort().slice(0, MAX_BLACKOUT_DATES)); setBlackoutDate(""); }}>Add closed date</button></div>
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-stone-200 p-2">
          <label className="flex-1">Block a range from<input type="date" className={inputClass} value={blackoutRangeFrom} onChange={e => setBlackoutRangeFrom(e.target.value)} /></label>
          <label className="flex-1">to<input type="date" className={inputClass} value={blackoutRangeTo} onChange={e => setBlackoutRangeTo(e.target.value)} /></label>
          <button type="button" disabled={!blackoutRangeFrom || !blackoutRangeTo} className="rounded-lg border p-2" onClick={() => {
            const range = expandDateRange(blackoutRangeFrom, blackoutRangeTo);
            if (!range.length) { setMessage(`Choose a valid range of up to ${MAX_BLACKOUT_RANGE_DAYS} days, with the start on or before the end date.`); return; }
            const merged = [...new Set([...rules.blackoutDates, ...range])].sort().slice(0, MAX_BLACKOUT_DATES);
            update("blackoutDates", merged);
            setBlackoutRangeFrom(""); setBlackoutRangeTo("");
            setMessage(`Blocked ${range.length} date${range.length === 1 ? "" : "s"}.`);
          }}>Block range</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{rules.blackoutDates.map(day => <button key={day} type="button" className="rounded-lg bg-stone-100 px-2 py-1" onClick={() => update("blackoutDates", rules.blackoutDates.filter(value => value !== day))} aria-label={`Remove blackout ${day}`}>{day} ×</button>)}</div>
      </fieldset>
      <p className="mt-3 text-xs text-stone-600">Saving enables automatic confirmation for this option. Blackouts stop new sales and keep existing reservations. Capacity cannot be reduced below reserved seats.</p>
      {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3">{message}</p>}
      <button disabled={saving || !optionId} className="mt-4 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save schedule"}</button>
      </form>}

      {tab === "rates" && (inventorySaved
        ? <SupplierRatesPanel base={base} optionId={optionId} baseRules={rules} />
        : <p className="mt-4 rounded-lg bg-amber-50 p-3">Save a schedule for this option first. Seasonal rates adjust that base price.</p>)}

      {tab === "calendar" && (inventorySaved
        ? <SupplierCalendarPanel base={base} optionId={optionId} departureTimes={rules.departureTimes} capacity={rules.capacity} />
        : <p className="mt-4 rounded-lg bg-amber-50 p-3">Save a schedule for this option first. The calendar adjusts individual dates on that schedule.</p>)}
    </div>
  </div>, document.body);
}
