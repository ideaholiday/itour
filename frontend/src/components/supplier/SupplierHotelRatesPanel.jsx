import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export const MEAL_PLAN_LABELS = { EP: "Room only (EP)", CP: "Breakfast (CP)", MAP: "Breakfast + dinner (MAP)", AP: "All meals (AP)" };
const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * The supplier's hotel rate sheet (ADR 040): contracted net rates per room type
 * and meal plan, by season. Used only to price quotations; not bookable.
 */
export default function SupplierHotelRatesPanel({ supplierId, onChange }) {
  const base = `/api/suppliers/${supplierId}/hotels`;
  const [hotels, setHotels] = useState([]);
  const [error, setError] = useState("");
  const [hotelDraft, setHotelDraft] = useState({ name: "", city: "", starRating: "", email: "", phone: "" });
  const [contacts, setContacts] = useState({});
  const [rateDrafts, setRateDrafts] = useState({});

  const load = useCallback(() => {
    request(base).then((data) => { setHotels(data.hotels || []); onChange?.(data.hotels || []); }).catch((err) => setError(err.message));
  }, [base, onChange]);
  useEffect(() => { load(); }, [load]);

  const run = async (action) => {
    setError("");
    try { await action(); load(); } catch (err) { setError(err.message); }
  };

  const addHotel = (event) => {
    event.preventDefault();
    run(async () => {
      await request(base, { method: "POST", body: JSON.stringify({ name: hotelDraft.name, city: hotelDraft.city || null, starRating: hotelDraft.starRating ? Number(hotelDraft.starRating) : null, email: hotelDraft.email || null, phone: hotelDraft.phone || null }) });
      setHotelDraft({ name: "", city: "", starRating: "", email: "", phone: "" });
    });
  };

  const addRate = (hotelId) => (event) => {
    event.preventDefault();
    const draft = rateDrafts[hotelId] || {};
    run(async () => {
      await request(`${base}/${hotelId}/rates`, { method: "POST", body: JSON.stringify({
        roomType: draft.roomType, mealPlan: draft.mealPlan || "CP", validFrom: draft.validFrom, validTo: draft.validTo,
        netPerNightInr: Number(draft.netPerNightInr), extraAdultInr: Number(draft.extraAdultInr || 0), childInr: Number(draft.childInr || 0),
        maxGuests: draft.maxGuests ? Number(draft.maxGuests) : null,
      }) });
      setRateDrafts({ ...rateDrafts, [hotelId]: { roomType: draft.roomType, mealPlan: draft.mealPlan } });
    });
  };
  // Where booking requests go (ADR 045).
  const contactOf = (hotel) => contacts[hotel.id] || { email: hotel.email || "", phone: hotel.phone || "" };
  const saveContact = (hotel) => run(async () => {
    const contact = contactOf(hotel);
    await request(`${base}/${hotel.id}`, { method: "PUT", body: JSON.stringify({ name: hotel.name, city: hotel.city, starRating: hotel.starRating, notes: hotel.notes, status: hotel.status, email: contact.email || null, phone: contact.phone || null }) });
    setContacts({ ...contacts, [hotel.id]: undefined });
  });
  const setRate = (hotelId, field, value) => setRateDrafts({ ...rateDrafts, [hotelId]: { ...(rateDrafts[hotelId] || {}), [field]: value } });

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">Your contracted net rates. Quotations price hotel nights from here, night by night, and add your markup.</p>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
      <form onSubmit={addHotel} className="flex flex-wrap gap-2">
        <input required minLength={2} placeholder="Hotel name" value={hotelDraft.name} onChange={(event) => setHotelDraft({ ...hotelDraft, name: event.target.value })} className={`${input} min-w-48 flex-1`} aria-label="Hotel name" />
        <input placeholder="City" value={hotelDraft.city} onChange={(event) => setHotelDraft({ ...hotelDraft, city: event.target.value })} className={`${input} w-36`} aria-label="City" />
        <select value={hotelDraft.starRating} onChange={(event) => setHotelDraft({ ...hotelDraft, starRating: event.target.value })} className={input} aria-label="Stars"><option value="">Stars</option>{[1, 2, 3, 4, 5].map((stars) => <option key={stars} value={stars}>{stars}★</option>)}</select>
        <input type="email" placeholder="Reservations email" value={hotelDraft.email} onChange={(event) => setHotelDraft({ ...hotelDraft, email: event.target.value })} className={`${input} w-52`} aria-label="Hotel email" />
        <input placeholder="Phone" value={hotelDraft.phone} onChange={(event) => setHotelDraft({ ...hotelDraft, phone: event.target.value })} className={`${input} w-36`} aria-label="Hotel phone" />
        <button type="submit" className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950"><Plus className="h-4 w-4" /> Add hotel</button>
      </form>

      {hotels.map((hotel) => {
        const draft = rateDrafts[hotel.id] || {};
        return (
          <div key={hotel.id} className="rounded-2xl border border-stone-200 p-4">
            <p className="font-bold text-stone-900">{hotel.name}<span className="font-normal text-stone-500">{hotel.city ? ` · ${hotel.city}` : ""}{hotel.starRating ? ` · ${hotel.starRating}★` : ""}</span></p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <input type="email" placeholder="Reservations email (for booking requests)" value={contactOf(hotel).email} onChange={(event) => setContacts({ ...contacts, [hotel.id]: { ...contactOf(hotel), email: event.target.value } })} className={`${input} w-64 py-1.5`} aria-label={`${hotel.name} email`} />
              <input placeholder="Phone" value={contactOf(hotel).phone} onChange={(event) => setContacts({ ...contacts, [hotel.id]: { ...contactOf(hotel), phone: event.target.value } })} className={`${input} w-36 py-1.5`} aria-label={`${hotel.name} phone`} />
              {contacts[hotel.id] && <button type="button" onClick={() => saveContact(hotel)} className="rounded-lg border border-stone-300 px-2 py-1.5 font-bold">Save contact</button>}
            </div>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-stone-400"><tr><th className="py-1">Room</th><th>Meals</th><th>Season</th><th className="text-right">Net / night</th><th className="text-right">Extra adult</th><th className="text-right">Child</th><th className="text-right">Sleeps</th><th /></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {hotel.rates.map((rate) => (
                  <tr key={rate.id}>
                    <td className="py-1.5">{rate.roomType}</td><td>{rate.mealPlan}</td><td>{rate.validFrom} → {rate.validTo}</td>
                    <td className="text-right font-mono">{inr(rate.netPerNightInr)}</td><td className="text-right font-mono">{inr(rate.extraAdultInr)}</td><td className="text-right font-mono">{inr(rate.childInr)}</td><td className="text-right">{rate.maxGuests ?? "–"}</td>
                    <td className="text-right"><button onClick={() => run(() => request(`${base}/${hotel.id}/rates/${rate.id}`, { method: "DELETE" }))} aria-label={`Remove ${rate.roomType} ${rate.mealPlan} ${rate.validFrom} rate`} className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
                {!hotel.rates.length && <tr><td colSpan={8} className="py-2 text-stone-500">No rates yet.</td></tr>}
              </tbody>
            </table>
            <form onSubmit={addRate(hotel.id)} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
              <input required placeholder="Room type, e.g. Deluxe" value={draft.roomType || ""} onChange={(event) => setRate(hotel.id, "roomType", event.target.value)} className={`${input} w-40`} aria-label="Room type" />
              <select value={draft.mealPlan || "CP"} onChange={(event) => setRate(hotel.id, "mealPlan", event.target.value)} className={input} aria-label="Meal plan">{Object.entries(MEAL_PLAN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input required type="date" value={draft.validFrom || ""} onChange={(event) => setRate(hotel.id, "validFrom", event.target.value)} className={input} aria-label="Season from" />
              <input required type="date" value={draft.validTo || ""} onChange={(event) => setRate(hotel.id, "validTo", event.target.value)} className={input} aria-label="Season to" />
              <input required type="number" min={0} placeholder="Net / night ₹" value={draft.netPerNightInr || ""} onChange={(event) => setRate(hotel.id, "netPerNightInr", event.target.value)} className={`${input} w-32`} aria-label="Net per night" />
              <input type="number" min={0} placeholder="Extra adult ₹" value={draft.extraAdultInr || ""} onChange={(event) => setRate(hotel.id, "extraAdultInr", event.target.value)} className={`${input} w-28`} aria-label="Extra adult per night" />
              <input type="number" min={0} placeholder="Child ₹" value={draft.childInr || ""} onChange={(event) => setRate(hotel.id, "childInr", event.target.value)} className={`${input} w-24`} aria-label="Child per night" />
              <input type="number" min={1} max={20} placeholder="Sleeps" title="Guests one room sleeps, extra bed included" value={draft.maxGuests || ""} onChange={(event) => setRate(hotel.id, "maxGuests", event.target.value)} className={`${input} w-24`} aria-label="Max guests per room" />
              <button type="submit" className="rounded-xl border border-stone-300 px-3 py-2 font-bold">Add season</button>
            </form>
          </div>
        );
      })}
      {!hotels.length && <p className="text-xs text-stone-500">No hotels yet.</p>}
    </div>
  );
}
