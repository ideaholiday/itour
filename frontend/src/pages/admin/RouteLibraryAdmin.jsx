import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { formatLegs, parseLegs, routeDays } from "../../lib/routeLibrary.js";

const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";
const lines = (items = []) => items.join("\n");
const unlines = (text) => text.split("\n").map((item) => item.trim()).filter(Boolean);
const EMPTY_ROUTE = { region: "", name: "", description: "", legsText: "", days: [], inclusions: "", exclusions: "", sortOrder: 0, status: "ACTIVE" };
const EMPTY_CITY = { region: "", name: "", description: "", dayTitle: "", dayDescription: "", sortOrder: 0, status: "ACTIVE" };

const routeForm = (route) => ({ ...EMPTY_ROUTE, ...route, description: route.description || "", region: route.region || "", legsText: formatLegs(route.legs), inclusions: lines(route.inclusions), exclusions: lines(route.exclusions) });
const routePayload = (form) => {
  const legs = parseLegs(form.legsText);
  return {
    region: form.region.trim() || null, name: form.name.trim(), description: form.description.trim() || null, legs,
    days: routeDays(legs, form.days).filter((day) => day.title || day.description || day.itemIds.length)
      .map((day) => ({ dayNumber: day.dayNumber, title: day.title || null, description: day.description || null, itemIds: day.itemIds })),
    inclusions: unlines(form.inclusions), exclusions: unlines(form.exclusions), sortOrder: Number(form.sortOrder) || 0, status: form.status,
  };
};
const cityPayload = (form) => ({
  region: form.region.trim(), name: form.name.trim(), description: form.description || null, dayTitle: form.dayTitle || null,
  dayDescription: form.dayDescription || null, sortOrder: Number(form.sortOrder) || 0, status: form.status,
});

/**
 * Routes and cities (ADR 048): named circuits with day-by-day text and the
 * library cars and activities each day uses, and city descriptions with the
 * text of a day spent there. Suppliers start quotations from them; nothing
 * here is priced. Hidden, never deleted.
 */
export default function RouteLibraryAdmin({ items = [] }) {
  const [library, setLibrary] = useState({ routes: [], cities: [] });
  const [editing, setEditing] = useState(null); // { type: "route" | "city", id, form }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => api.adminListRouteLibrary().then((res) => setLibrary({ routes: res.routes || [], cities: res.cities || [] }))
    .catch((err) => setError(err.message || "The route library couldn't be loaded")), []);
  useEffect(() => { load(); }, [load]);

  const setField = (key, value) => setEditing((current) => ({ ...current, form: { ...current.form, [key]: value } }));
  const setDayField = (dayNumber, patch) => setEditing((current) => {
    const days = routeDays(parseLegs(current.form.legsText), current.form.days).map((day) => (day.dayNumber === dayNumber ? { ...day, ...patch } : day));
    return { ...current, form: { ...current.form, days } };
  });

  const persist = async (type, id, body, message) => {
    setError(""); setNotice("");
    try {
      if (type === "route") await api.adminSaveRoute(id, body); else await api.adminSaveCity(id, body);
      setNotice(message); setEditing(null); load();
    } catch (err) { setError(err.message || "That couldn't be saved"); }
  };
  const submit = (event) => {
    event.preventDefault();
    const { type, id, form } = editing;
    const body = type === "route" ? routePayload(form) : cityPayload(form);
    persist(type, id, body, `${body.name} saved.`);
  };

  const form = editing?.form;
  const legs = editing?.type === "route" ? parseLegs(form.legsText) : [];
  const routeCities = new Set(legs.map((leg) => leg.city.toLowerCase()));
  const itemName = (id) => items.find((item) => item.id === id)?.name || id;
  // Cars and activities in the route's cities come first.
  const choices = [...items].filter((item) => item.status === "ACTIVE")
    .sort((a, b) => Number(!routeCities.has(String(a.city).toLowerCase())) - Number(!routeCities.has(String(b.city).toLowerCase())) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-stone-500">Ready-made circuits and city descriptions. A supplier picks a route and gets its cities, nights, day text, inclusions and the cars and activities below, priced from its own rate sheet. A change here reaches only quotations made afterwards.</p>
        <span className="flex gap-2">
          <button type="button" onClick={() => setEditing({ type: "city", id: null, form: { ...EMPTY_CITY } })} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold"><Plus className="h-4 w-4" /> New city</button>
          <button type="button" onClick={() => setEditing({ type: "route", id: null, form: { ...EMPTY_ROUTE } })} className="flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-stone-950"><Plus className="h-4 w-4" /> New route</button>
        </span>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</p>}

      {editing && (
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <h2 className="font-bold text-stone-900">{editing.id ? `Edit ${form.name}` : editing.type === "route" ? "New route" : "New city"}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded p-1 text-stone-400 hover:text-stone-700"><X className="h-4 w-4" /></button>
          </div>
          <label className="text-xs text-stone-500">Region<input required={editing.type === "city"} value={form.region} onChange={(event) => setField("region", event.target.value)} placeholder="Uttar Pradesh" className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs text-stone-500 sm:col-span-2">{editing.type === "route" ? "Route name" : "City"}<input required minLength={2} value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder={editing.type === "route" ? "Lucknow – Ayodhya – Varanasi 6N/7D" : "Ayodhya"} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs text-stone-500 sm:col-span-3">Description<textarea rows={2} value={form.description} onChange={(event) => setField("description", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          {editing.type === "city" ? <>
            <label className="text-xs text-stone-500 sm:col-span-3">Title of a day spent here<input value={form.dayTitle} onChange={(event) => setField("dayTitle", event.target.value)} placeholder="Ayodhya: Ram Mandir darshan" className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500 sm:col-span-3">What happens that day<textarea rows={3} value={form.dayDescription} onChange={(event) => setField("dayDescription", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </> : <>
            <label className="text-xs text-stone-500 sm:col-span-3">Cities and nights, in order<input required value={form.legsText} onChange={(event) => setField("legsText", event.target.value)} placeholder="Lucknow 2, Ayodhya 2, Varanasi 2" aria-label="Cities and nights" className={`mt-1 ${inputClass}`} /></label>
            <div className="space-y-2 sm:col-span-3">
              {legs.length > 0 && routeDays(legs, form.days).map((day) => (
                <div key={day.dayNumber} className="grid gap-2 rounded-xl border border-stone-200 p-3 sm:grid-cols-[5rem_1fr]">
                  <span className="text-xs font-black text-amber-700">Day {day.dayNumber}</span>
                  <input value={day.title} onChange={(event) => setDayField(day.dayNumber, { title: event.target.value })} placeholder="Day title" aria-label={`Route day ${day.dayNumber} title`} className={inputClass} />
                  <textarea rows={2} value={day.description} onChange={(event) => setDayField(day.dayNumber, { description: event.target.value })} placeholder="What happens this day" aria-label={`Route day ${day.dayNumber} description`} className={`sm:col-span-2 ${inputClass}`} />
                  <div className="flex flex-wrap items-center gap-1.5 text-xs sm:col-span-2">
                    {day.itemIds.map((id) => (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">{itemName(id)}
                        <button type="button" onClick={() => setDayField(day.dayNumber, { itemIds: day.itemIds.filter((item) => item !== id) })} aria-label={`Remove ${itemName(id)}`}><X className="h-3 w-3" /></button></span>
                    ))}
                    <select value="" onChange={(event) => event.target.value && setDayField(day.dayNumber, { itemIds: [...day.itemIds, event.target.value] })} aria-label={`Add a car or activity to day ${day.dayNumber}`} className="rounded-lg border border-stone-200 px-2 py-1">
                      <option value="">+ Car or activity…</option>
                      {choices.filter((item) => !day.itemIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}{item.city ? ` (${item.city})` : ""}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <label className="text-xs text-stone-500 sm:col-span-3 lg:col-span-1">What's included, one per line<textarea rows={4} value={form.inclusions} onChange={(event) => setField("inclusions", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500 sm:col-span-3 lg:col-span-2">Not included, one per line<textarea rows={4} value={form.exclusions} onChange={(event) => setField("exclusions", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </>}
          <label className="text-xs text-stone-500">Order in list<input type="number" min={0} value={form.sortOrder} onChange={(event) => setField("sortOrder", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={form.status === "ACTIVE"} onChange={(event) => setField("status", event.target.checked ? "ACTIVE" : "INACTIVE")} /> Shown to suppliers</label>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-stone-300 px-4 py-2 font-bold">Cancel</button>
            <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-stone-950">Save {editing.type}</button>
          </div>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-black text-stone-900">Routes</h2>
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm shadow-sm">
          {library.routes.map((route) => (
            <div key={route.id} className={`flex flex-wrap items-start gap-3 p-4 ${route.status === "ACTIVE" ? "" : "bg-stone-50 opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-stone-900">{route.name}{route.status !== "ACTIVE" && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-600">Hidden</span>}</p>
                <p className="text-xs text-stone-500">{route.region ? `${route.region} · ` : ""}{route.legs.map((leg) => `${leg.city} ${leg.nights}N`).join(" → ")} · {route.days.length} days written</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setEditing({ type: "route", id: route.id, form: routeForm(route) })} aria-label={`Edit ${route.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => persist("route", route.id, routePayload(routeForm({ ...route, status: route.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })), `${route.name} ${route.status === "ACTIVE" ? "hidden" : "shown"}.`)} aria-label={route.status === "ACTIVE" ? `Hide ${route.name}` : `Show ${route.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900">{route.status === "ACTIVE" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
              </div>
            </div>
          ))}
          {!library.routes.length && <p className="p-4 text-sm text-stone-500">No routes yet.</p>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-stone-900">Cities</h2>
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm shadow-sm">
          {library.cities.map((city) => (
            <div key={city.id} className={`flex flex-wrap items-start gap-3 p-4 ${city.status === "ACTIVE" ? "" : "bg-stone-50 opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-stone-900">{city.name} <span className="text-xs font-normal text-stone-500">· {city.region}</span></p>
                {city.description && <p className="text-xs text-stone-500">{city.description}</p>}
                {city.dayTitle && <p className="text-xs text-stone-500">Day: {city.dayTitle}</p>}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setEditing({ type: "city", id: city.id, form: { ...EMPTY_CITY, ...city, description: city.description || "", dayTitle: city.dayTitle || "", dayDescription: city.dayDescription || "" } })} aria-label={`Edit ${city.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => persist("city", city.id, cityPayload({ ...EMPTY_CITY, ...city, status: city.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }), `${city.name} ${city.status === "ACTIVE" ? "hidden" : "shown"}.`)} aria-label={city.status === "ACTIVE" ? `Hide ${city.name}` : `Show ${city.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900">{city.status === "ACTIVE" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
