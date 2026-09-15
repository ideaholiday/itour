import React, { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../lib/api.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EXTRA_UNITS = [["SENIOR", "Senior"], ["YOUTH", "Youth"], ["INFANT", "Infant"]];
const json = value => (typeof value === "string" ? JSON.parse(value) : value);

const emptyRate = () => ({
  label: "",
  startsOn: "",
  endsOn: "",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  adultPrice: "",
  childPrice: "",
  priority: 0,
  unitPrices: {},
});

/**
 * Seasonal rates for one booking option.
 *
 * The highest-priority rate covering a travel date and its weekday wins, so the
 * list is ordered the same way the backend resolves it and the winning rate for
 * a given date is the first one that matches.
 */
export default function SupplierRatesPanel({ base, optionId, baseRules }) {
  const [rates, setRates] = useState([]);
  const [draft, setDraft] = useState(emptyRate);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = `${base}/${optionId}/rates`;

  const load = useCallback(() => {
    if (!optionId) return;
    setLoading(true);
    fetch(url, { headers: authHeaders() })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRates(data.rates || []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [url, optionId]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const updateUnit = (unitType, value) => setDraft(current => {
    const unitPrices = { ...current.unitPrices };
    if (value === "") delete unitPrices[unitType];
    else unitPrices[unitType] = Number(value);
    return { ...current, unitPrices };
  });

  async function addRate(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
          weekdays: draft.weekdays,
          adultPrice: Number(draft.adultPrice),
          childPrice: Number(draft.childPrice),
          priority: Number(draft.priority) || 0,
          unitPrices: draft.unitPrices,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft(emptyRate());
      setMessage("Seasonal rate added.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function removeRate(rateId) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${url}/${rateId}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Seasonal rate removed.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 p-2 text-stone-900";

  return (
    <div className="mt-4">
      <p className="text-stone-600">
        Charge more in peak season without editing your base price. A rate applies only inside its
        date range and on the weekdays you tick. When two rates overlap, the higher priority wins.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Dates with no matching rate use your base price of ₹{Number(baseRules?.adultPrice || 0)} adult
        · ₹{Number(baseRules?.childPrice || 0)} child.
      </p>

      <form onSubmit={addRate} className="mt-4 rounded-xl border border-stone-200 p-3">
        <h3 className="font-semibold">Add a seasonal rate</h3>
        <label className="mt-2 block">Name (optional)
          <input type="text" maxLength={120} className={inputClass} placeholder="Christmas week"
            value={draft.label} onChange={e => update("label", e.target.value)} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>From<input required type="date" className={inputClass} value={draft.startsOn} onChange={e => update("startsOn", e.target.value)} /></label>
          <label>To<input required type="date" className={inputClass} value={draft.endsOn} onChange={e => update("endsOn", e.target.value)} /></label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">Applies on</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {DAYS.map((day, index) => (
              <label key={day} className="text-sm">
                <input type="checkbox" checked={draft.weekdays.includes(index)}
                  onChange={e => update("weekdays", e.target.checked
                    ? [...draft.weekdays, index]
                    : draft.weekdays.filter(value => value !== index))} /> {day}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label>Adult (₹)<input required type="number" min="0" step="1" className={inputClass} value={draft.adultPrice} onChange={e => update("adultPrice", e.target.value)} /></label>
          <label>Child (₹)<input required type="number" min="0" step="1" className={inputClass} value={draft.childPrice} onChange={e => update("childPrice", e.target.value)} /></label>
          <label>Priority<input type="number" min="0" max="1000" step="1" className={inputClass} value={draft.priority} onChange={e => update("priority", e.target.value)} /></label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold">Other traveler types (optional)</legend>
          <p className="mt-1 text-xs text-stone-500">Leave blank to use the same rate as your base schedule for that type.</p>
          <div className="mt-1 grid grid-cols-3 gap-3">
            {EXTRA_UNITS.map(([unitType, unitLabel]) => (
              <label key={unitType}>{unitLabel} (₹)
                <input type="number" min="0" step="1" className={inputClass}
                  value={draft.unitPrices[unitType] ?? ""} onChange={e => updateUnit(unitType, e.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={busy} className="mt-3 rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Add seasonal rate"}
        </button>
      </form>

      <h3 className="mt-5 font-semibold">Current seasonal rates</h3>
      {loading && <p className="mt-2 text-sm text-stone-500">Loading rates…</p>}
      {!loading && rates.length === 0 && (
        <p className="mt-2 text-sm text-stone-500">No seasonal rates yet. Every date uses your base price.</p>
      )}
      <ul className="mt-2 space-y-2">
        {rates.map(rate => {
          const weekdays = json(rate.weekdays || "[]");
          const extras = Object.entries(json(rate.unit_prices || "{}"));
          return (
            <li key={rate.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3">
              <div>
                <p className="font-semibold">{rate.label || "Seasonal rate"} <span className="font-normal text-stone-500">· priority {rate.priority}</span></p>
                <p className="text-sm text-stone-600">{rate.starts_on} → {rate.ends_on}</p>
                <p className="text-sm text-stone-600">
                  {weekdays.length === 7 ? "Every day" : weekdays.map(day => DAYS[day]).join(", ")}
                  {" · "}₹{rate.adult_price} adult · ₹{rate.child_price} child
                  {extras.length > 0 && extras.map(([unitType, price]) => ` · ₹${price} ${unitType.toLowerCase()}`).join("")}
                </p>
              </div>
              <button type="button" disabled={busy} onClick={() => removeRate(rate.id)}
                aria-label={`Remove seasonal rate ${rate.label || rate.starts_on}`}
                className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50 disabled:opacity-50">
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3">{message}</p>}
    </div>
  );
}
