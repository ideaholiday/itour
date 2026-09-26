import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Pencil, Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import RouteLibraryAdmin from "./RouteLibraryAdmin.jsx";

const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";
const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const KIND_LABELS = { TRANSFER: "Transfer", SIGHTSEEING: "Sightseeing by car", ACTIVITY: "Activity / ticket" };
const isCar = (kind) => kind === "TRANSFER" || kind === "SIGHTSEEING";
const EMPTY = {
  region: "", kind: "SIGHTSEEING", name: "", city: "", fromPlace: "", toPlace: "", distanceKm: "", durationHours: "",
  dayTitle: "", dayDescription: "", sedanInr: "", innovaInr: "", tempoInr: "", adultInr: "", childInr: "", sortOrder: "", status: "ACTIVE",
};
const numberOrNull = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
const toForm = (item) => Object.fromEntries(Object.entries({ ...EMPTY, ...item }).map(([key, value]) => [key, value ?? ""]));

function priceText(item) {
  if (!isCar(item.kind)) return `${inr(item.adultInr)} adult · ${inr(item.childInr)} child`;
  return [["Sedan", item.sedanInr], ["Innova", item.innovaInr], ["Tempo", item.tempoInr]].filter(([, value]) => value != null).map(([name, value]) => `${name} ${inr(value)}`).join(" · ");
}

/**
 * The package library (ADR 047): ready-made transfers, sightseeing and
 * activities by destination, with example prices. Suppliers add entries to
 * their own rate sheets; a change here reaches only suppliers who add it later.
 * Entries are hidden, never deleted.
 */
export default function PackageLibraryView() {
  const [section, setSection] = useState("items");
  const [library, setLibrary] = useState({ regions: [], items: [] });
  const [region, setRegion] = useState("");
  const [editing, setEditing] = useState(null); // { id | null, form }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.adminListLibrary()
    .then((res) => { setLibrary(res); setRegion((current) => current || res.regions[0] || ""); })
    .catch((err) => setError(err.message || "The library couldn't be loaded")), []);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => library.items.filter((item) => item.region === region), [library, region]);
  const setField = (key, value) => setEditing((current) => ({ ...current, form: { ...current.form, [key]: value } }));

  const payload = (form) => {
    const car = isCar(form.kind);
    return {
      region: form.region.trim(), kind: form.kind, name: form.name.trim(), city: form.city || null,
      fromPlace: form.kind === "TRANSFER" ? form.fromPlace || null : null, toPlace: form.kind === "TRANSFER" ? form.toPlace || null : null,
      distanceKm: car ? numberOrNull(form.distanceKm) : null, durationHours: numberOrNull(form.durationHours),
      dayTitle: form.dayTitle || null, dayDescription: form.dayDescription || null,
      sedanInr: car ? numberOrNull(form.sedanInr) : null, innovaInr: car ? numberOrNull(form.innovaInr) : null, tempoInr: car ? numberOrNull(form.tempoInr) : null,
      adultInr: car ? null : numberOrNull(form.adultInr), childInr: car ? null : numberOrNull(form.childInr),
      sortOrder: Number(form.sortOrder) || 0, status: form.status,
    };
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const body = payload(editing.form);
      if (editing.id) await api.adminUpdateLibraryItem(editing.id, body);
      else await api.adminCreateLibraryItem(body);
      setNotice(`${body.name} saved.`);
      setRegion(body.region);
      setEditing(null);
      load();
    } catch (err) { setError(err.message || "That entry couldn't be saved"); } finally { setSaving(false); }
  };

  const toggle = async (item) => {
    setError(""); setNotice("");
    try {
      await api.adminUpdateLibraryItem(item.id, payload(toForm({ ...item, status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })));
      load();
    } catch (err) { setError(err.message || "That entry couldn't be changed"); }
  };

  const form = editing?.form;
  const sections = (
    <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm font-bold" role="tablist" aria-label="Library">
      {[["items", "Cars & activities"], ["routes", "Routes & cities"]].map(([value, label]) => (
        <button key={value} type="button" role="tab" aria-selected={section === value} onClick={() => setSection(value)} className={`rounded-lg px-3 py-1.5 ${section === value ? "bg-white shadow-sm" : "text-stone-500"}`}>{label}</button>
      ))}
    </div>
  );
  if (section === "routes") {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-black text-stone-900">Package library</h1>
        {sections}
        <RouteLibraryAdmin items={library.items} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {sections}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Package library</h1>
          <p className="mt-1 max-w-3xl text-sm text-stone-500">Ready-made transfers, sightseeing and tickets that suppliers add to their own rate sheets for quotations. Prices are examples: suppliers check and change them after adding. A change here reaches only suppliers who add the entry afterwards.</p>
        </div>
        <button type="button" onClick={() => setEditing({ id: null, form: { ...EMPTY, region } })} className="flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-stone-950"><Plus className="h-4 w-4" /> New entry</button>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
      {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</p>}

      {editing && (
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <h2 className="font-bold text-stone-900">{editing.id ? `Edit ${form.name}` : "New library entry"}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded p-1 text-stone-400 hover:text-stone-700"><X className="h-4 w-4" /></button>
          </div>
          <label className="text-xs text-stone-500">Destination (region)
            <input required minLength={2} list="library-regions" value={form.region} onChange={(event) => setField("region", event.target.value)} className={`mt-1 ${inputClass}`} />
            <datalist id="library-regions">{library.regions.map((name) => <option key={name} value={name} />)}</datalist>
          </label>
          <label className="text-xs text-stone-500">Kind
            <select value={form.kind} onChange={(event) => setField("kind", event.target.value)} className={`mt-1 ${inputClass}`}>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs text-stone-500">City<input value={form.city} onChange={(event) => setField("city", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs text-stone-500 sm:col-span-2">Name<input required minLength={2} value={form.name} onChange={(event) => setField("name", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs text-stone-500">Duration (hours)<input type="number" min={0} step="0.5" value={form.durationHours} onChange={(event) => setField("durationHours", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          {form.kind === "TRANSFER" && <>
            <label className="text-xs text-stone-500">From<input value={form.fromPlace} onChange={(event) => setField("fromPlace", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500">To<input value={form.toPlace} onChange={(event) => setField("toPlace", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </>}
          {isCar(form.kind) && <label className="text-xs text-stone-500">Distance (km)<input type="number" min={1} value={form.distanceKm} onChange={(event) => setField("distanceKm", event.target.value)} className={`mt-1 ${inputClass}`} /></label>}
          <label className="text-xs text-stone-500 sm:col-span-3">Day title for quotations<input value={form.dayTitle} onChange={(event) => setField("dayTitle", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs text-stone-500 sm:col-span-3">Day description for quotations<textarea rows={3} value={form.dayDescription} onChange={(event) => setField("dayDescription", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          {isCar(form.kind) ? <>
            <label className="text-xs text-stone-500">Example price: Sedan (4) ₹<input type="number" min={0} value={form.sedanInr} onChange={(event) => setField("sedanInr", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500">Innova (6) ₹<input type="number" min={0} value={form.innovaInr} onChange={(event) => setField("innovaInr", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500">Tempo Traveller (12) ₹<input type="number" min={0} value={form.tempoInr} onChange={(event) => setField("tempoInr", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </> : <>
            <label className="text-xs text-stone-500">Example price: adult ₹<input required type="number" min={0} value={form.adultInr} onChange={(event) => setField("adultInr", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
            <label className="text-xs text-stone-500">Child ₹<input type="number" min={0} value={form.childInr} onChange={(event) => setField("childInr", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          </>}
          <label className="text-xs text-stone-500">Order in list<input type="number" min={0} value={form.sortOrder} onChange={(event) => setField("sortOrder", event.target.value)} className={`mt-1 ${inputClass}`} /></label>
          <label className="flex items-center gap-2 text-xs text-stone-600"><input type="checkbox" checked={form.status === "ACTIVE"} onChange={(event) => setField("status", event.target.checked ? "ACTIVE" : "INACTIVE")} /> Shown to suppliers</label>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-stone-300 px-4 py-2 font-bold">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-stone-950 disabled:opacity-50">{saving ? "Saving…" : "Save entry"}</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Destination">
        {library.regions.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={name === region} onClick={() => setRegion(name)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${name === region ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}>
            {name} <span className="opacity-60">{library.items.filter((item) => item.region === name).length}</span>
          </button>
        ))}
      </div>

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm shadow-sm">
        {items.map((item) => (
          <div key={item.id} className={`flex flex-wrap items-start gap-3 p-4 ${item.status === "ACTIVE" ? "" : "bg-stone-50 opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-stone-900">{item.name}{item.status !== "ACTIVE" && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-600">Hidden</span>}</p>
              <p className="text-xs text-stone-500">{KIND_LABELS[item.kind]}{item.city ? ` · ${item.city}` : ""}{item.fromPlace || item.toPlace ? ` · ${item.fromPlace || "?"} → ${item.toPlace || "?"}` : ""}{item.distanceKm ? ` · ${item.distanceKm} km` : ""}{item.durationHours ? ` · ${item.durationHours} h` : ""}</p>
              {item.dayTitle && <p className="text-xs text-stone-500">Day title: {item.dayTitle}</p>}
            </div>
            <p className="font-mono text-xs text-stone-700">{priceText(item)}</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setEditing({ id: item.id, form: toForm(item) })} aria-label={`Edit ${item.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => toggle(item)} aria-label={item.status === "ACTIVE" ? `Hide ${item.name}` : `Show ${item.name}`} className="rounded-lg border border-stone-200 p-1.5 text-stone-500 hover:text-stone-900">{item.status === "ACTIVE" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
            </div>
          </div>
        ))}
        {!items.length && <p className="p-4 text-sm text-stone-500">No entries yet.</p>}
      </div>
    </div>
  );
}
