import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Car, Plus, Ticket, Trash2 } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export const SERVICE_KIND_LABELS = { TRANSFER: "Transfer", SIGHTSEEING: "Sightseeing by car", ACTIVITY: "Activity / ticket" };
export const isTransport = (kind) => kind === "TRANSFER" || kind === "SIGHTSEEING";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const NEW_SERVICE = () => ({ kind: "SIGHTSEEING", pricing: "FIXED", distanceKm: "", name: "", city: "", fromPlace: "", toPlace: "", closedWeekdays: [], dayTitle: "", dayDescription: "" });

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * The supplier's private rate sheet for transfers, sightseeing and activities
 * (ADR 042). Cars are priced per vehicle for each cab type, fixed or per km
 * (ADR 044), activities per adult and child, by season. Used only to price quotations; never listed.
 */
export default function SupplierRateSheetPanel({ supplierId, onChange }) {
  const base = `/api/suppliers/${supplierId}`;
  const [cabTypes, setCabTypes] = useState([]);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");
  const [cabDraft, setCabDraft] = useState({ name: "", seats: "" });
  const [serviceDraft, setServiceDraft] = useState(NEW_SERVICE);
  const [rateDrafts, setRateDrafts] = useState({});

  const load = useCallback(() => Promise.all([request(`${base}/cab-types`), request(`${base}/services`)])
    .then(([cabs, list]) => {
      setCabTypes(cabs.cabTypes || []); setServices(list.services || []);
      onChange?.({ cabTypes: cabs.cabTypes || [], services: list.services || [] });
    })
    .catch((err) => setError(err.message)), [base, onChange]);
  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setError("");
    try { await action(); await load(); } catch (err) { setError(err.message); }
  };

  const addCab = (event) => {
    event.preventDefault();
    run(async () => {
      await request(`${base}/cab-types`, { method: "POST", body: JSON.stringify({ name: cabDraft.name, seats: Number(cabDraft.seats) }) });
      setCabDraft({ name: "", seats: "" });
    });
  };

  const addService = (event) => {
    event.preventDefault();
    const draft = serviceDraft;
    run(async () => {
      await request(`${base}/services`, { method: "POST", body: JSON.stringify({
        kind: draft.kind, name: draft.name, city: draft.city || null, closedWeekdays: draft.closedWeekdays,
        fromPlace: draft.kind === "TRANSFER" ? draft.fromPlace || null : null, toPlace: draft.kind === "TRANSFER" ? draft.toPlace || null : null,
        dayTitle: draft.dayTitle || null, dayDescription: draft.dayDescription || null,
        pricing: isTransport(draft.kind) ? draft.pricing : "FIXED", distanceKm: isTransport(draft.kind) && draft.distanceKm ? Number(draft.distanceKm) : null,
      }) });
      setServiceDraft(NEW_SERVICE());
    });
  };

  const addRate = (service) => (event) => {
    event.preventDefault();
    const draft = rateDrafts[service.id] || {};
    const cab = { cabTypeId: draft.cabTypeId || cabTypes[0]?.id, validFrom: draft.validFrom, validTo: draft.validTo };
    const body = service.pricing === "PER_KM" && isTransport(service.kind)
      ? { ...cab, perKmInr: Number(draft.perKmInr), minKmPerDay: Number(draft.minKmPerDay || 0), driverAllowanceInr: Number(draft.driverAllowanceInr || 0) }
      : isTransport(service.kind)
      ? { ...cab, vehicleInr: Number(draft.vehicleInr) }
      : { validFrom: draft.validFrom, validTo: draft.validTo, adultInr: Number(draft.adultInr), childInr: Number(draft.childInr || 0) };
    run(async () => {
      await request(`${base}/services/${service.id}/rates`, { method: "POST", body: JSON.stringify(body) });
      // Keep the season, so the next cab type for it is one price away.
      setRateDrafts({ ...rateDrafts, [service.id]: { cabTypeId: draft.cabTypeId, validFrom: draft.validFrom, validTo: draft.validTo } });
    });
  };
  const setRate = (serviceId, field, value) => setRateDrafts({ ...rateDrafts, [serviceId]: { ...(rateDrafts[serviceId] || {}), [field]: value } });
  const toggleDay = (day) => setServiceDraft({ ...serviceDraft, closedWeekdays: serviceDraft.closedWeekdays.includes(day) ? serviceDraft.closedWeekdays.filter((item) => item !== day) : [...serviceDraft.closedWeekdays, day] });
  const cabName = (id) => cabTypes.find((cab) => cab.id === id)?.name || "Cab";

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600">Your own prices for transfers, sightseeing and tickets. Only you see them; quotations use them and add your markup. Nothing here is listed or sold online.</p>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-900"><Car className="h-4 w-4" /> Cab types</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {cabTypes.map((cab) => <span key={cab.id} className="rounded-full bg-stone-100 px-3 py-1 font-semibold">{cab.name} · {cab.seats} seats</span>)}
          {!cabTypes.length && <span className="text-stone-500">Add the vehicles you use, e.g. Sedan (4 seats), Innova (6), Tempo Traveller (12).</span>}
        </div>
        <form onSubmit={addCab} className="flex flex-wrap gap-2">
          <input required minLength={2} placeholder="Cab type, e.g. Innova Crysta" value={cabDraft.name} onChange={(event) => setCabDraft({ ...cabDraft, name: event.target.value })} className={`${input} min-w-48 flex-1`} aria-label="Cab type" />
          <input required type="number" min={1} max={100} placeholder="Seats" value={cabDraft.seats} onChange={(event) => setCabDraft({ ...cabDraft, seats: event.target.value })} className={`${input} w-24`} aria-label="Seats" />
          <button type="submit" className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4" /> Add cab type</button>
        </form>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-900"><Ticket className="h-4 w-4" /> Transfers, sightseeing and activities</h3>
        <form onSubmit={addService} className="grid gap-2 rounded-2xl border border-dashed border-stone-300 p-3 text-xs sm:grid-cols-3">
          <select value={serviceDraft.kind} onChange={(event) => setServiceDraft({ ...serviceDraft, kind: event.target.value })} className={input} aria-label="Kind">
            {Object.entries(SERVICE_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input required minLength={2} placeholder={serviceDraft.kind === "TRANSFER" ? "Name, e.g. Delhi Airport to Hotel" : serviceDraft.kind === "ACTIVITY" ? "Name, e.g. Taj Mahal entry" : "Name, e.g. Agra local sightseeing"} value={serviceDraft.name} onChange={(event) => setServiceDraft({ ...serviceDraft, name: event.target.value })} className={input} aria-label="Service name" />
          <input placeholder="City" value={serviceDraft.city} onChange={(event) => setServiceDraft({ ...serviceDraft, city: event.target.value })} className={input} aria-label="City" />
          {isTransport(serviceDraft.kind) && <>
            <select value={serviceDraft.pricing} onChange={(event) => setServiceDraft({ ...serviceDraft, pricing: event.target.value })} className={input} aria-label="Car pricing">
              <option value="FIXED">Fixed price per vehicle</option>
              <option value="PER_KM">Per km (min km/day + driver allowance)</option>
            </select>
            {serviceDraft.pricing === "PER_KM" && <input type="number" min={1} placeholder="Usual distance (km)" value={serviceDraft.distanceKm} onChange={(event) => setServiceDraft({ ...serviceDraft, distanceKm: event.target.value })} className={input} aria-label="Usual distance in km" />}
          </>}
          {serviceDraft.kind === "TRANSFER" && <>
            <input placeholder="From, e.g. IGI Airport" value={serviceDraft.fromPlace} onChange={(event) => setServiceDraft({ ...serviceDraft, fromPlace: event.target.value })} className={input} aria-label="From" />
            <input placeholder="To, e.g. Hotel in Delhi" value={serviceDraft.toPlace} onChange={(event) => setServiceDraft({ ...serviceDraft, toPlace: event.target.value })} className={`${input} sm:col-span-2`} aria-label="To" />
          </>}
          <input placeholder="Day title for the quotation, e.g. Agra: Taj Mahal and Agra Fort" value={serviceDraft.dayTitle} onChange={(event) => setServiceDraft({ ...serviceDraft, dayTitle: event.target.value })} className={`${input} sm:col-span-3`} aria-label="Day title" />
          <textarea rows={2} placeholder="Day description for the quotation (optional)" value={serviceDraft.dayDescription} onChange={(event) => setServiceDraft({ ...serviceDraft, dayDescription: event.target.value })} className={`${input} sm:col-span-3`} aria-label="Day description" />
          <fieldset className="flex flex-wrap items-center gap-1 sm:col-span-2">
            <legend className="sr-only">Closed on</legend>
            <span className="mr-1 text-stone-500">Closed on</span>
            {WEEKDAYS.map((label, day) => (
              <button key={label} type="button" onClick={() => toggleDay(day)} aria-pressed={serviceDraft.closedWeekdays.includes(day)} className={`rounded-lg px-2 py-1 font-bold ${serviceDraft.closedWeekdays.includes(day) ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-stone-500"}`}>{label}</button>
            ))}
          </fieldset>
          <button type="submit" className="flex items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 font-bold text-stone-950"><Plus className="h-4 w-4" /> Add service</button>
        </form>

        {services.map((service) => {
          const draft = rateDrafts[service.id] || {};
          const car = isTransport(service.kind);
          const perKm = car && service.pricing === "PER_KM";
          return (
            <div key={service.id} className="rounded-2xl border border-stone-200 p-4">
              <p className="font-bold text-stone-900">{service.name}
                <span className="font-normal text-stone-500"> · {SERVICE_KIND_LABELS[service.kind]}{service.city ? ` · ${service.city}` : ""}{service.fromPlace || service.toPlace ? ` · ${service.fromPlace || "?"} → ${service.toPlace || "?"}` : ""}{perKm ? ` · per km${service.distanceKm ? `, usually ${service.distanceKm} km` : ""}` : ""}{service.closedWeekdays.length ? ` · closed ${service.closedWeekdays.map((day) => WEEKDAYS[day]).join(", ")}` : ""}</span>
              </p>
              {service.dayTitle && <p className="text-xs text-stone-500">Day title: {service.dayTitle}</p>}
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-[10px] uppercase text-stone-400"><tr><th className="py-1">{car ? "Cab" : "Ticket"}</th><th>Season</th><th className="text-right">{perKm ? "Per km · min km/day · driver/day" : car ? "Per vehicle" : "Adult"}</th>{!car && <th className="text-right">Child</th>}<th /></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {service.rates.map((rate) => (
                    <tr key={rate.id}>
                      <td className="py-1.5">{car ? cabName(rate.cabTypeId) : "Per person"}</td><td>{rate.validFrom} → {rate.validTo}</td>
                      <td className="text-right font-mono">{perKm ? `₹${rate.perKmInr}/km · ${rate.minKmPerDay} km · ${inr(rate.driverAllowanceInr)}` : inr(car ? rate.vehicleInr : rate.adultInr)}</td>{!car && <td className="text-right font-mono">{inr(rate.childInr)}</td>}
                      <td className="text-right"><button onClick={() => run(() => request(`${base}/services/${service.id}/rates/${rate.id}`, { method: "DELETE" }))} aria-label={`Remove ${service.name} ${rate.validFrom} rate`} className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                  {!service.rates.length && <tr><td colSpan={5} className="py-2 text-stone-500">No prices yet.</td></tr>}
                </tbody>
              </table>
              <form onSubmit={addRate(service)} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
                {car && <select required value={draft.cabTypeId || cabTypes[0]?.id || ""} onChange={(event) => setRate(service.id, "cabTypeId", event.target.value)} className={input} aria-label="Cab type">
                  {!cabTypes.length && <option value="">Add a cab type first</option>}
                  {cabTypes.map((cab) => <option key={cab.id} value={cab.id}>{cab.name} ({cab.seats})</option>)}
                </select>}
                <input required type="date" value={draft.validFrom || ""} onChange={(event) => setRate(service.id, "validFrom", event.target.value)} className={input} aria-label="Season from" />
                <input required type="date" value={draft.validTo || ""} onChange={(event) => setRate(service.id, "validTo", event.target.value)} className={input} aria-label="Season to" />
                {perKm ? <>
                  <input required type="number" min={0} step="0.5" placeholder="₹ per km" value={draft.perKmInr || ""} onChange={(event) => setRate(service.id, "perKmInr", event.target.value)} className={`${input} w-28`} aria-label="Price per km" />
                  <input type="number" min={0} placeholder="Min km / day" value={draft.minKmPerDay || ""} onChange={(event) => setRate(service.id, "minKmPerDay", event.target.value)} className={`${input} w-28`} aria-label="Minimum km per day" />
                  <input type="number" min={0} placeholder="Driver ₹ / day" value={draft.driverAllowanceInr || ""} onChange={(event) => setRate(service.id, "driverAllowanceInr", event.target.value)} className={`${input} w-32`} aria-label="Driver allowance per day" />
                </> : car
                  ? <input required type="number" min={0} placeholder="Per vehicle ₹" value={draft.vehicleInr || ""} onChange={(event) => setRate(service.id, "vehicleInr", event.target.value)} className={`${input} w-32`} aria-label="Price per vehicle" />
                  : <>
                    <input required type="number" min={0} placeholder="Adult ₹" value={draft.adultInr || ""} onChange={(event) => setRate(service.id, "adultInr", event.target.value)} className={`${input} w-28`} aria-label="Adult price" />
                    <input type="number" min={0} placeholder="Child ₹" value={draft.childInr || ""} onChange={(event) => setRate(service.id, "childInr", event.target.value)} className={`${input} w-24`} aria-label="Child price" />
                  </>}
                <button type="submit" disabled={car && !cabTypes.length} className="rounded-xl border border-stone-300 px-3 py-2 font-bold disabled:opacity-40">Add season</button>
              </form>
            </div>
          );
        })}
        {!services.length && <p className="text-xs text-stone-500">No services yet.</p>}
      </div>
    </div>
  );
}
