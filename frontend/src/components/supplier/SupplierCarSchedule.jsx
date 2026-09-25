import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Car } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const STATUS_STYLES = { TO_BOOK: "bg-stone-100 text-stone-700", REQUESTED: "bg-sky-100 text-sky-800", CONFIRMED: "bg-emerald-100 text-emerald-800" };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * Cars of accepted package trips for a week (ADR 045), with drivers from the
 * fleet. The server refuses a driver who is on another trip or booking those
 * days, unavailable, or whose papers expire before the trip ends.
 */
export default function SupplierCarSchedule({ supplierId, from }) {
  const [schedule, setSchedule] = useState(null);
  const [picks, setPicks] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!from) return;
    request(`/api/suppliers/${supplierId}/car-schedule?from=${from}&days=7`).then(setSchedule).catch((err) => setError(err.message));
  }, [supplierId, from]);
  useEffect(() => { load(); }, [load]);

  const assign = async (car) => {
    setError("");
    try {
      const driverIds = (picks[car.lineId] || car.drivers.map((driver) => driver.id)).filter(Boolean);
      await request(`/api/suppliers/${supplierId}/quotations/${car.quotationId}/lines/${car.lineId}/arrangement`, { method: "PATCH", body: JSON.stringify({ driverIds }) });
      setPicks({ ...picks, [car.lineId]: undefined });
      load();
    } catch (err) { setError(err.message); }
  };

  if (!schedule) return null;
  return (
    <section className="space-y-3 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-stone-900"><Car className="h-5 w-5 text-amber-600" /> Package cars</h2>
        <span className="text-xs text-stone-500">{schedule.from} to {schedule.to}</span>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
        {schedule.cars.map((car) => {
          const chosen = picks[car.lineId] || car.drivers.map((driver) => driver.id);
          return (
            <li key={car.lineId} aria-label={`Car ${car.title} ${car.ref}`} className="flex flex-wrap items-end gap-3 p-3 text-xs">
              <div className="min-w-56 flex-1">
                <p className="font-bold text-stone-900">{car.date}{car.endDate !== car.date ? ` to ${car.endDate}` : ""}{car.startTime ? ` · ${car.startTime}` : ""} · {car.title}</p>
                <p className="text-stone-500">{car.ref} · {car.customerName}{car.customerPhone ? ` · ${car.customerPhone}` : ""} · {car.vehicles} × {car.cabType || "car"} for {car.travelers}{car.fromPlace || car.toPlace ? ` · ${car.fromPlace || "?"} → ${car.toPlace || "?"}` : ""}{car.km ? ` · about ${car.km} km` : ""}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[car.status] || STATUS_STYLES.TO_BOOK}`}>{car.status.replace("_", " ")}</span>
              {Array.from({ length: car.vehicles }, (_, slot) => (
                <select key={slot} value={chosen[slot] || ""} onChange={(event) => { const ids = [...chosen]; ids[slot] = event.target.value; setPicks({ ...picks, [car.lineId]: ids }); }} className={input} aria-label={`Driver ${slot + 1} for ${car.ref}`}>
                  <option value="">No driver</option>
                  {schedule.fleet.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.vehicleNumber}{driver.seats ? ` (${driver.seats} seats)` : ""}</option>)}
                </select>
              ))}
              {picks[car.lineId] && <button type="button" onClick={() => assign(car)} className="rounded-xl bg-stone-900 px-3 py-2 font-bold text-white">Save drivers</button>}
            </li>
          );
        })}
        {!schedule.cars.length && <li className="p-5 text-center text-xs text-stone-500">No package cars this week.</li>}
      </ul>
    </section>
  );
}
