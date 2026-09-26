import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Plus, TriangleAlert } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const KIND_LABELS = { TRANSFER: "Transfer", SIGHTSEEING: "Sightseeing", ACTIVITY: "Activity" };
const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const priceText = (item) => (item.kind === "ACTIVITY"
  ? `${inr(item.adultInr)} adult${item.childInr ? ` · ${inr(item.childInr)} child` : ""}`
  : [["Sedan", item.sedanInr], ["Innova", item.innovaInr], ["Tempo", item.tempoInr]].filter(([, value]) => value != null).map(([name, value]) => `${name} ${inr(value)}`).join(" · "));

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * The package library (ADR 047): ready-made transfers, sightseeing and tickets
 * for popular destinations. Ticked entries are added to the supplier's own rate
 * sheet with a year of the example prices, to check and change there.
 */
export default function SupplierPackageLibrary({ supplierId, startOpen = false, onAdded }) {
  const base = `/api/suppliers/${supplierId}/package-library`;
  const [open, setOpen] = useState(startOpen);
  const [library, setLibrary] = useState({ regions: [], items: [] });
  const [region, setRegion] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { setOpen((value) => value || startOpen); }, [startOpen]);
  useEffect(() => {
    if (!open) return;
    request(base).then((data) => {
      setLibrary(data);
      setRegion((current) => current || data.regions[0] || "");
    }).catch((err) => setError(err.message));
  }, [base, open]);

  const items = useMemo(() => library.items.filter((item) => item.region === region), [library, region]);
  const toAdd = items.filter((item) => !item.added);
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  const allPicked = toAdd.length > 0 && toAdd.every((item) => picked.includes(item.id));
  const pickAll = () => setPicked(allPicked ? picked.filter((id) => !toAdd.some((item) => item.id === id)) : [...new Set([...picked, ...toAdd.map((item) => item.id)])]);

  const add = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`${base}/import`, { method: "POST", body: JSON.stringify({ itemIds: picked }) });
      setLibrary(await request(base));
      setPicked([]);
      setNotice(`Added ${result.added.length} to your rate sheet with prices from ${result.validFrom} to ${result.validTo}.${result.cabTypesAdded.length ? ` New cab types: ${result.cabTypesAdded.join(", ")}.` : ""} Check the prices below.`);
      onAdded?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-stone-900"><BookOpen className="h-4 w-4 text-amber-600" /> Package library
          <span className="font-normal text-stone-500">· ready-made transfers, sightseeing and tickets for popular destinations</span></span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs">
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-100 p-2 text-amber-900"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Prices here are examples. Once added, the service is yours: check and change its prices below before you send a quotation.</p>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 font-semibold text-rose-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 p-2 font-semibold text-emerald-800">{notice}</p>}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Destination">
            {library.regions.map((name) => (
              <button key={name} type="button" role="tab" aria-selected={name === region} onClick={() => setRegion(name)}
                className={`rounded-full px-3 py-1 font-bold ${name === region ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}>{name}</button>
            ))}
          </div>
          {items.length > 0 && (
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              <label className="flex items-center gap-2 px-3 py-2 font-bold text-stone-600">
                <input type="checkbox" checked={allPicked} disabled={!toAdd.length} onChange={pickAll} /> Pick all in {region}
              </label>
              {items.map((item) => (
                <label key={item.id} className={`flex items-start gap-2 px-3 py-2 ${item.added ? "opacity-60" : "cursor-pointer"}`}>
                  {item.added ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Already added" />
                    : <input type="checkbox" className="mt-0.5" checked={picked.includes(item.id)} onChange={() => toggle(item.id)} />}
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-stone-900">{item.name}</span>
                    <span className="text-stone-500"> · {KIND_LABELS[item.kind]}{item.city ? ` · ${item.city}` : ""}{item.distanceKm ? ` · ${item.distanceKm} km` : ""}{item.durationHours ? ` · ${item.durationHours} h` : ""}{item.added ? " · added" : ""}</span>
                    {item.dayTitle && <span className="block text-stone-500">Day title: {item.dayTitle}</span>}
                  </span>
                  <span className="shrink-0 text-right font-mono text-stone-700">{priceText(item)}</span>
                </label>
              ))}
            </div>
          )}
          {!library.regions.length && !error && <p className="text-stone-500">Loading…</p>}
          <button type="button" disabled={!picked.length || busy} onClick={add} className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 font-bold text-stone-950 disabled:opacity-40">
            <Plus className="h-4 w-4" /> {busy ? "Adding…" : `Add ${picked.length || ""} to my rate sheet`}
          </button>
        </div>
      )}
    </div>
  );
}
