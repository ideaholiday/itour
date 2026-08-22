import React, { useState } from "react";
import { AlertTriangle, Calendar, Check, Clock3, Gauge, Trash2, X } from "lucide-react";
import DatePicker, { toLocalISO } from "../ui/DatePicker.jsx";
import { authHeaders } from "../../lib/api.js";

const VEHICLES = [["HATCHBACK", "Hatchback"], ["SEDAN", "Sedan"], ["SUV", "SUV"], ["PREMIUM_MUV", "Premium MUV"], ["LUXURY", "Luxury"], ["GROUP_TEMPO", "Tempo / Bus"]];

const scopeName = (rule, products, drivers) => {
  const scope = rule.scope_type || (rule.product_id ? "PRODUCT" : "ALL");
  if (scope === "PRODUCT") return products.find((item) => item.id === rule.product_id)?.title || "One product";
  if (scope === "VEHICLE") {
    const vehicle = drivers.find((item) => item.id === rule.vehicle_id);
    return vehicle ? `${vehicle.vehicle_model} · ${vehicle.vehicle_number}` : "One vehicle";
  }
  if (scope === "VEHICLE_CATEGORY") return String(rule.vehicle_category || "Vehicle type").replaceAll("_", " ");
  return "All products & fleet";
};

export default function BlockDatesModal({ isOpen, onClose, supplierId, products = [], drivers = [], blockedDates = [], onRefresh }) {
  const [scopeType, setScopeType] = useState("ALL");
  const [productId, setProductId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("SEDAN");
  const [availabilityType, setAvailabilityType] = useState("FULL_DAY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [capacityMode, setCapacityMode] = useState("CLOSED");
  const [capacityLimit, setCapacityLimit] = useState(1);
  const [reason, setReason] = useState("Scheduled fleet maintenance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const saveRule = async (event) => {
    event.preventDefault();
    if (!startDate || !endDate || endDate < startDate) return setError("Choose a valid start and end date.");
    if (scopeType === "PRODUCT" && !productId) return setError("Choose a product.");
    if (scopeType === "VEHICLE" && !vehicleId) return setError("Choose a fleet vehicle.");
    if (availabilityType === "TIME_SLOT" && (!startTime || !endTime || endTime <= startTime)) return setError("End time must be after start time.");
    setLoading(true); setError(""); setSuccessMsg("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/block-dates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ scopeType, productId, vehicleId, vehicleCategory, availabilityType, startDate, endDate, startTime, endTime, capacityLimit: scopeType === "VEHICLE" || capacityMode === "CLOSED" ? 0 : Number(capacityLimit), reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update availability");
      setSuccessMsg(data.message); setStartDate(""); setEndDate("");
      await onRefresh?.();
    } catch (saveError) { setError(saveError.message || "Could not update availability."); }
    finally { setLoading(false); }
  };

  const removeRule = async (ruleId) => {
    setError("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/blocked-dates/${ruleId}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove rule");
      setSuccessMsg("Availability rule removed."); await onRefresh?.();
    } catch (removeError) { setError(removeError.message || "Could not remove rule."); }
  };

  const choiceColors = {
    amber: "border-amber-500 bg-amber-100 text-amber-900 font-bold",
    cyan: "border-stone-400 bg-stone-100 text-stone-900 font-bold",
    rose: "border-rose-400 bg-rose-100 text-rose-900 font-bold",
    emerald: "border-emerald-400 bg-emerald-100 text-emerald-900 font-bold",
  };
  const choiceClass = (selected, color = "amber") => `rounded-xl border px-3 py-2.5 text-xs font-bold transition ${selected ? choiceColors[color] : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-stone-200 bg-[#FAF9F6] px-6 py-4">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl border border-amber-300 bg-amber-100 text-amber-800"><Calendar className="h-5 w-5" /></span><div><h2 className="font-display text-xl font-bold text-stone-900">Availability & capacity</h2><p className="text-xs text-stone-500">Close dates, block a time slot or limit booking inventory.</p></div></div>
          <button onClick={onClose} className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-6 overflow-y-auto p-6">
          {error && <div className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="h-4 w-4" />{error}</div>}
          {successMsg && <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900"><span className="flex items-center gap-2"><Check className="h-4 w-4" />{successMsg}</span><button onClick={() => setSuccessMsg("")} className="font-bold underline">Dismiss</button></div>}

          <form onSubmit={saveRule} className="space-y-5 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-5">
            <div><label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-stone-500">What should this rule control?</label><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[["ALL", "Everything"], ["PRODUCT", "One product"], ["VEHICLE_CATEGORY", "Vehicle type"], ["VEHICLE", "One vehicle"]].map(([value, label]) => <button key={value} type="button" onClick={() => { setScopeType(value); if (value === "VEHICLE") setCapacityMode("CLOSED"); }} className={choiceClass(scopeType === value)}>{label}</button>)}</div></div>

            {scopeType === "PRODUCT" && <div><label className="mb-1.5 block text-xs font-bold text-stone-700">Product / route</label><select value={productId} onChange={(event) => setProductId(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900 outline-none focus:border-amber-500"><option value="">Choose product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>}
            {scopeType === "VEHICLE_CATEGORY" && <div><label className="mb-1.5 block text-xs font-bold text-stone-700">Vehicle category</label><select value={vehicleCategory} onChange={(event) => setVehicleCategory(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900 outline-none focus:border-amber-500">{VEHICLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
            {scopeType === "VEHICLE" && <div><label className="mb-1.5 block text-xs font-bold text-stone-700">Fleet vehicle</label><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900 outline-none focus:border-amber-500"><option value="">Choose vehicle</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.vehicle_model} · {item.vehicle_number} · {item.driver_name}</option>)}</select>{!drivers.length && <p className="mt-2 text-[11px] text-amber-800 font-medium">Add vehicles in Fleet Manager before using this scope.</p>}</div>}

            <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1.5 block text-xs font-bold text-stone-700">Start date</label><DatePicker value={startDate} min={toLocalISO(new Date())} onChange={(next) => { setStartDate(next); if (endDate && endDate < next) setEndDate(next); }} theme="light" placeholder="Choose start date" buttonClassName="border-stone-300 bg-white text-stone-900 py-2.5" /></div><div><label className="mb-1.5 block text-xs font-bold text-stone-700">End date</label><DatePicker value={endDate} min={startDate || toLocalISO(new Date())} onChange={setEndDate} theme="light" placeholder="Choose end date" buttonClassName="border-stone-300 bg-white text-stone-900 py-2.5" /></div></div>

            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-2 block text-xs font-bold text-stone-700">Duration</label><div className="grid grid-cols-2 gap-2">{[["FULL_DAY", "Full day"], ["TIME_SLOT", "Time slot"]].map(([value, label]) => <button type="button" key={value} onClick={() => setAvailabilityType(value)} className={choiceClass(availabilityType === value, "cyan")}><span className="flex items-center justify-center gap-2"><Clock3 className="h-3.5 w-3.5" />{label}</span></button>)}</div></div>
              <div><label className="mb-2 block text-xs font-bold text-stone-700">Inventory</label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setCapacityMode("CLOSED")} className={choiceClass(capacityMode === "CLOSED", "rose")}>Fully closed</button><button type="button" disabled={scopeType === "VEHICLE"} onClick={() => setCapacityMode("LIMITED")} className={`${choiceClass(capacityMode === "LIMITED", "emerald")} disabled:opacity-40`}>Limit capacity</button></div></div>
            </div>

            {availabilityType === "TIME_SLOT" && <div className="grid grid-cols-2 gap-4"><div><label className="mb-1.5 block text-xs font-bold text-stone-700">From</label><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900" /></div><div><label className="mb-1.5 block text-xs font-bold text-stone-700">Until</label><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900" /></div></div>}
            {capacityMode === "LIMITED" && scopeType !== "VEHICLE" && <div><label className="mb-1.5 block text-xs font-bold text-stone-700">Maximum accepted bookings in this period</label><div className="relative"><Gauge className="absolute left-3 top-3 h-4 w-4 text-emerald-600" /><input type="number" min="1" max="50" value={capacityLimit} onChange={(event) => setCapacityLimit(event.target.value)} className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-xs text-stone-900" /></div></div>}
            <div><label className="mb-1.5 block text-xs font-bold text-stone-700">Reason / internal note</label><input value={reason} maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="Maintenance, holiday, private charter…" className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-xs text-stone-900" /></div>
            <div className="flex justify-end"><button disabled={loading} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 shadow-sm disabled:opacity-50">{loading ? "Saving…" : "Save availability rule"}</button></div>
          </form>

          <section><div className="mb-3 flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-wider text-stone-500">Current rules</h3><span className="text-[10px] font-bold text-amber-800">{blockedDates.length} active</span></div>{!blockedDates.length ? <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-xs text-stone-500">No availability restrictions. All inventory is open.</div> : <div className="space-y-2">{blockedDates.map((rule) => <article key={rule.id} className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-stone-900"><span>{rule.start_date}{rule.end_date !== rule.start_date ? ` → ${rule.end_date}` : ""}</span><span className="rounded-full bg-stone-200 px-2 py-1 text-[9px] uppercase text-stone-800">{scopeName(rule, products, drivers)}</span><span className={`rounded-full px-2 py-1 text-[9px] uppercase ${Number(rule.capacity_limit) > 0 ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-rose-100 text-rose-900 border border-rose-300"}`}>{Number(rule.capacity_limit) > 0 ? `Max ${rule.capacity_limit} bookings` : "Closed"}</span></div><p className="mt-2 text-[11px] text-stone-500">{rule.availability_type === "TIME_SLOT" ? `${rule.start_time}–${rule.end_time} · ` : "Full day · "}{rule.reason || "Unavailable"}</p></div><button onClick={() => removeRule(rule.id)} title="Remove rule" className="rounded-xl p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></article>)}</div>}</section>
        </div>
      </div>
    </div>
  );
}
