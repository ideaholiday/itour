import React, { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../lib/api.js";

const WHOLE_DAY = "";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const emptyOverride = () => ({ localDate: "", localTime: WHOLE_DAY, capacity: "", closed: false, note: "" });
const emptyRange = () => ({ from: "", to: "", localTime: WHOLE_DAY, weekdays: [], capacity: "", closed: true, note: "" });

/**
 * Per-date and per-departure calendar control for one booking option.
 *
 * Blackout dates (on the schedule tab) close a whole date for good. These
 * overrides are the finer instrument: close or resize a single departure, or one
 * whole date, while leaving the weekly schedule untouched.
 */
export default function SupplierCalendarPanel({ base, optionId, departureTimes = [], capacity }) {
  const [overrides, setOverrides] = useState([]);
  const [draft, setDraft] = useState(emptyOverride);
  const [range, setRange] = useState(emptyRange);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = `${base}/${optionId}/calendar`;

  const load = useCallback(() => {
    if (!optionId) return;
    setLoading(true);
    fetch(url, { headers: authHeaders() })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setOverrides(data.overrides || []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [url, optionId]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  async function saveOverride(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          localDate: draft.localDate,
          localTime: draft.localTime,
          capacity: draft.capacity === "" ? null : Number(draft.capacity),
          closed: draft.closed,
          note: draft.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft(emptyOverride());
      setMessage("Calendar updated. Travelers see this immediately.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function saveRange(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${url}/range`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          from: range.from, to: range.to, localTime: range.localTime,
          weekdays: range.weekdays.length ? range.weekdays : undefined,
          capacity: range.capacity === "" ? null : Number(range.capacity),
          closed: range.closed, note: range.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const skipped = data.skippedNonOperating?.length
        ? ` ${data.skippedNonOperating.length} non-operating date${data.skippedNonOperating.length === 1 ? "" : "s"} skipped.`
        : "";
      setRange(emptyRange());
      setMessage(`Updated ${data.appliedCount} date${data.appliedCount === 1 ? "" : "s"}.${skipped}`);
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function clearRange() {
    if (!range.from || !range.to) { setMessage("Choose a from and to date to clear."); return; }
    setBusy(true); setMessage("");
    try {
      const query = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&localTime=${encodeURIComponent(range.localTime || "")}`;
      const response = await fetch(`${url}/range${query}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(`Cleared ${data.removedCount} override${data.removedCount === 1 ? "" : "s"}. Those dates follow your weekly schedule again.`);
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function removeOverride(localDate, localTime) {
    setBusy(true); setMessage("");
    try {
      const query = `?localDate=${encodeURIComponent(localDate)}&localTime=${encodeURIComponent(localTime || "")}`;
      const response = await fetch(`${url}${query}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Override removed. This departure follows your weekly schedule again.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 p-2 text-stone-900";

  return (
    <div className="mt-4">
      <p className="text-stone-600">
        Adjust one date without touching your weekly schedule. Close a departure when a boat is in
        for repair, or drop its seat count for a day. Everything else keeps running as normal.
      </p>

      <form onSubmit={saveOverride} className="mt-4 rounded-xl border border-stone-200 p-3">
        <h3 className="font-semibold">Close or resize a departure</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>Date<input required aria-label="Date to adjust" type="date" className={inputClass} value={draft.localDate} onChange={e => update("localDate", e.target.value)} /></label>
          <label>Departure
            <select aria-label="Departure to adjust" className={inputClass} value={draft.localTime} onChange={e => update("localTime", e.target.value)}>
              <option value={WHOLE_DAY}>Whole day (every departure)</option>
              {departureTimes.map(time => <option key={time} value={time}>{time}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>Seats for this date
            <input type="number" min="0" step="1" className={inputClass} placeholder={`Leave blank for ${capacity ?? "the usual"}`}
              value={draft.capacity} onChange={e => update("capacity", e.target.value)} />
          </label>
          <label className="flex items-end pb-2">
            <span className="text-sm">
              <input type="checkbox" checked={draft.closed} onChange={e => update("closed", e.target.checked)} />
              {" "}Close this departure entirely
            </span>
          </label>
        </div>
        <label className="mt-2 block">Reason (optional, shown to travelers)
          <input type="text" maxLength={280} className={inputClass} placeholder="Boat maintenance"
            value={draft.note} onChange={e => update("note", e.target.value)} />
        </label>
        <p className="mt-2 text-xs text-stone-500">
          Seats cannot drop below the number already reserved for that departure.
        </p>
        <button disabled={busy} className="mt-3 rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Apply to calendar"}
        </button>
      </form>

      <form onSubmit={saveRange} className="mt-4 rounded-xl border border-stone-200 p-3">
        <h3 className="font-semibold">Apply across a date range</h3>
        <p className="mt-1 text-xs text-stone-500">
          Close a whole season or resize a month in one go. Dates you do not operate on are skipped.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <label>From<input required aria-label="Range from" type="date" className={inputClass} value={range.from} onChange={e => setRange(c => ({ ...c, from: e.target.value }))} /></label>
          <label>To<input required aria-label="Range to" type="date" className={inputClass} value={range.to} onChange={e => setRange(c => ({ ...c, to: e.target.value }))} /></label>
          <label>Departure
            <select aria-label="Range departure" className={inputClass} value={range.localTime} onChange={e => setRange(c => ({ ...c, localTime: e.target.value }))}>
              <option value={WHOLE_DAY}>Whole day</option>
              {departureTimes.map(time => <option key={time} value={time}>{time}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="mt-2">
          <legend className="text-sm font-semibold">Only these weekdays (optional)</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {DAYS.map((day, index) => (
              <label key={day} className="text-sm">
                <input type="checkbox" checked={range.weekdays.includes(index)}
                  onChange={e => setRange(c => ({ ...c, weekdays: e.target.checked
                    ? [...c.weekdays, index]
                    : c.weekdays.filter(value => value !== index) }))} /> {day}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>Seats across the range
            <input type="number" min="0" step="1" className={inputClass} placeholder="Leave blank to keep the usual"
              value={range.capacity} onChange={e => setRange(c => ({ ...c, capacity: e.target.value }))} />
          </label>
          <label className="flex items-end pb-2">
            <span className="text-sm">
              <input type="checkbox" aria-label="Close the whole range"
                checked={range.closed} onChange={e => setRange(c => ({ ...c, closed: e.target.checked }))} />
              {" "}Close these departures
            </span>
          </label>
        </div>
        <label className="mt-2 block">Reason (optional)
          <input type="text" maxLength={280} className={inputClass} placeholder="Monsoon closure"
            value={range.note} onChange={e => setRange(c => ({ ...c, note: e.target.value }))} />
        </label>
        <p className="mt-2 text-xs text-stone-500">
          Applied as one change — if any date already has more seats reserved than you set,
          nothing in the range is altered.
        </p>
        <div className="mt-3 flex gap-2">
          <button disabled={busy} className="rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Apply to range"}
          </button>
          <button type="button" disabled={busy} onClick={clearRange}
            className="rounded-xl border border-stone-300 px-4 py-2 font-semibold hover:bg-stone-50 disabled:opacity-50">
            Clear range
          </button>
        </div>
      </form>

      <h3 className="mt-5 font-semibold">Calendar overrides</h3>
      {loading && <p className="mt-2 text-sm text-stone-500">Loading calendar…</p>}
      {!loading && overrides.length === 0 && (
        <p className="mt-2 text-sm text-stone-500">No overrides. Every date follows your weekly schedule.</p>
      )}
      <ul className="mt-2 space-y-2">
        {overrides.map(override => (
          <li key={`${override.local_date}:${override.local_time}`} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3">
            <div>
              <p className="font-semibold">
                {override.local_date} · {override.local_time || "Whole day"}
              </p>
              <p className="text-sm text-stone-600">
                {Number(override.closed) === 1
                  ? "Closed"
                  : override.capacity == null ? "Open, usual seats" : `Open, ${override.capacity} seats`}
                {override.note ? ` · ${override.note}` : ""}
              </p>
            </div>
            <button type="button" disabled={busy} onClick={() => removeOverride(override.local_date, override.local_time)}
              aria-label={`Remove override for ${override.local_date} ${override.local_time || "whole day"}`}
              className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50 disabled:opacity-50">
              Remove
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3">{message}</p>}
    </div>
  );
}
