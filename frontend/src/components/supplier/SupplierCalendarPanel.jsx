import React, { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../lib/api.js";

const WHOLE_DAY = "";
const emptyOverride = () => ({ localDate: "", localTime: WHOLE_DAY, capacity: "", closed: false, note: "" });

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
