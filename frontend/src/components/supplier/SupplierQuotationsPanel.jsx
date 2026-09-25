import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarPlus, Car, CheckCircle2, Copy, Download, FileText, Hotel, MessageCircle, Package, Plus, Send, Ticket, Trash2, TriangleAlert } from "lucide-react";
import { authHeaders } from "../../lib/api.js";
import SupplierHotelRatesPanel, { MEAL_PLAN_LABELS } from "./SupplierHotelRatesPanel.jsx";
import SupplierRateSheetPanel, { isTransport } from "./SupplierRateSheetPanel.jsx";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const STATUS_STYLES = { DRAFT: "bg-stone-100 text-stone-700", SENT: "bg-sky-100 text-sky-800", ACCEPTED: "bg-emerald-100 text-emerald-800", DECLINED: "bg-rose-100 text-rose-800" };
const addDays = (date, days) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const dayDate = (startDate, dayNumber) => addDays(startDate, (Number(dayNumber) || 1) - 1);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const count = (value) => (value === "" || value == null ? null : Number(value));
const NEW = () => ({ title: "", destination: "", days: [], options: [], customerName: "", customerEmail: "", customerPhone: "", agentId: "", startDate: today(), adults: 2, children: 0, markupPct: 15, notes: "", validUntil: "", lines: [] });

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

// What the server needs for each line; prices are always worked out on the server.
function linePayload(line) {
  const base = { kind: line.kind, dayNumber: Number(line.dayNumber) || 1, title: line.title || (line.kind === "HOTEL" ? "Stay" : "Item"), description: line.description || null };
  if (line.kind === "HOTEL") return { ...base, option: Number(line.option) || 1, hotelId: line.hotelId, roomType: line.roomType, mealPlan: line.mealPlan, checkIn: line.checkIn || line.date, nights: Number(line.nights) || 1, rooms: Number(line.rooms) || 1, extraAdults: Number(line.extraAdults) || 0, children: Number(line.children) || 0 };
  if (line.kind === "LISTING") return { ...base, productId: line.productId, productOptionId: line.productOptionId || null, date: line.date, pickupTime: line.pickupTime || null, adults: Number(line.adults) || 1, children: Number(line.children) || 0 };
  // Rate-sheet lines: an empty count follows the quotation's travelers, and an empty cab count means enough cabs for everyone.
  if (line.kind === "TRANSPORT") return { ...base, title: line.title || null, serviceId: line.serviceId, cabTypeId: line.cabTypeId, date: line.date, vehicles: count(line.vehicles), km: count(line.km), carDays: count(line.carDays), adults: count(line.adults), children: count(line.children) };
  if (line.kind === "ACTIVITY") return { ...base, title: line.title || null, serviceId: line.serviceId, date: line.date, adults: count(line.adults), children: count(line.children) };
  return { ...base, date: line.date || null, amountInr: Number(line.amountInr) || 0 };
}

/**
 * Package quotations (ADR 040, ADR 042): hotels, cars and activities from the
 * supplier's private rate sheets, its own listings and custom lines, day by
 * day with a title and text per day, and optionally 2–6 hotel options sharing
 * everything else (ADR 043). The server prices every line; the
 * customer's PDF shows one package price. Once accepted, listing lines are
 * booked one click each and payments are recorded against the package.
 */
export default function SupplierQuotationsPanel({ supplierId, products = [] }) {
  const base = `/api/suppliers/${supplierId}`;
  const [tab, setTab] = useState("quotations");
  const [list, setList] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [cabTypes, setCabTypes] = useState([]);
  const [services, setServices] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [copyDate, setCopyDate] = useState(today);
  const [acceptOption, setAcceptOption] = useState(1);
  const [agents, setAgents] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shared, setShared] = useState(null);
  const [payment, setPayment] = useState({ mode: "UPI", amount_inr: "", reference: "" });

  const loadList = useCallback(() => request(`${base}/quotations`).then((data) => setList(data.quotations || [])).catch((err) => setError(err.message)), [base]);
  useEffect(() => {
    loadList();
    request(`${base}/hotels`).then((data) => setHotels(data.hotels || [])).catch(() => {});
    request(`${base}/cab-types`).then((data) => setCabTypes(data.cabTypes || [])).catch(() => {});
    request(`${base}/services`).then((data) => setServices(data.services || [])).catch(() => {});
    request(`${base}/agents`).then((data) => setAgents((data.agents || []).filter((agent) => agent.status === "ACTIVE"))).catch(() => {});
  }, [base, loadList]);

  const onRateSheet = useCallback(({ cabTypes: cabs, services: list }) => { setCabTypes(cabs); setServices(list); }, []);

  // Past quotations for the destination being typed, to start from one (ADR 042).
  const destination = draft && !saved ? String(draft.destination || "").trim() : "";
  useEffect(() => {
    if (destination.length < 2) { setSuggestions([]); return undefined; }
    const timer = setTimeout(() => request(`${base}/quotations/suggestions?destination=${encodeURIComponent(destination)}`).then((data) => setSuggestions(data.quotations || [])).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [base, destination]);

  const open = (quotation) => {
    setSaved(quotation); setShared(null); setNotice(""); setError("");
    const group = quotation.adults + quotation.children;
    setAcceptOption(quotation.selectedOption || 1);
    setDraft({ ...quotation, destination: quotation.destination || "", days: quotation.days || [], options: (quotation.options || []).map((option) => ({ name: option.name })), customerEmail: quotation.customerEmail || "", customerPhone: quotation.customerPhone || "", agentId: quotation.agentId || "", notes: quotation.notes || "", validUntil: quotation.validUntil || "",
      lines: quotation.lines.map((line) => {
        const next = { ...line, checkIn: line.kind === "HOTEL" ? line.date : undefined };
        if (line.kind !== "TRANSPORT" && line.kind !== "ACTIVITY") return next;
        // Counts that match the group were left to follow it; keep them following.
        const followsGroup = line.adults === quotation.adults && line.children === quotation.children;
        if (followsGroup) Object.assign(next, { adults: "", children: "" });
        const cab = cabTypes.find((item) => item.id === line.cabTypeId);
        if (followsGroup && cab && line.vehicles === Math.max(1, Math.ceil(group / cab.seats))) next.vehicles = "";
        return next;
      }) });
  };
  const run = async (action, message) => {
    setError(""); setNotice("");
    try { const result = await action(); if (message) setNotice(message); loadList(); return result; } catch (err) { setError(err.message); return null; }
  };

  const save = () => run(async () => {
    const body = { ...draft, customerEmail: draft.customerEmail || null, customerPhone: draft.customerPhone || null, agentId: draft.agentId || null, notes: draft.notes || null, validUntil: draft.validUntil || null,
      adults: Number(draft.adults), children: Number(draft.children), markupPct: Number(draft.markupPct), lines: draft.lines.map(linePayload), destination: draft.destination || null,
      days: (draft.days || []).filter((day) => day.title || day.description).map((day) => ({ dayNumber: Number(day.dayNumber), title: day.title || null, description: day.description || null })),
      options: draft.options.length >= 2 ? draft.options.map((option, index) => ({ name: option.name.trim() || `Option ${index + 1}` })) : [] };
    for (const key of ["id", "ref", "status", "totals", "payments", "warnings", "selectedOption", "sentAt", "acceptedAt", "createdAt", "updatedAt"]) delete body[key];
    const data = await request(saved ? `${base}/quotations/${saved.id}` : `${base}/quotations`, { method: saved ? "PUT" : "POST", body: JSON.stringify(body) });
    open(data.quotation);
    return data;
  }, "Saved and priced.");

  const act = (path, body, message) => run(async () => {
    const data = await request(`${base}/quotations/${saved.id}${path}`, { method: "POST", body: JSON.stringify(body || {}) });
    if (data.quotation) open(data.quotation);
    return data;
  }, message);

  const send = async () => {
    const data = await act("/send", {}, null);
    if (!data) return;
    setShared(data);
    setNotice(data.email.status === "SENT" ? `Emailed to ${saved.customerEmail} with the PDF attached.` : "Link ready. Email wasn't sent" + (data.email.error ? `: ${data.email.error}` : "."));
  };

  const downloadPdf = async () => {
    try {
      const response = await fetch(`${base}/quotations/${saved.id}/pdf`, { headers: authHeaders() });
      if (!response.ok) throw new Error("The PDF couldn't be made");
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: `${saved.ref}.pdf` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  };

  // Copies any quotation to a new start date as a new draft, priced again (ADR 042).
  const copyFrom = (quotationId, body, message) => run(async () => {
    const data = await request(`${base}/quotations/${quotationId}/copy`, { method: "POST", body: JSON.stringify(body) });
    open(data.quotation);
    return data;
  }, message);
  const startFrom = (quotationId) => copyFrom(quotationId, {
    startDate: draft.startDate, ...(draft.customerName.trim().length >= 2 ? { customerName: draft.customerName, customerEmail: draft.customerEmail || null, customerPhone: draft.customerPhone || null } : {}),
  }, "Started from a past quotation and priced for your dates. Check it and save.");

  // A line's date follows its day, so moving a day or the start date moves the dates with it.
  const setLine = (index, patch) => setDraft({ ...draft, lines: draft.lines.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, ...patch };
    if (patch.dayNumber !== undefined && Number(patch.dayNumber) >= 1) Object.assign(next, { date: dayDate(draft.startDate, patch.dayNumber), checkIn: dayDate(draft.startDate, patch.dayNumber) });
    return next;
  }) });
  const setStart = (startDate) => {
    const shift = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && draft.startDate ? daysBetween(draft.startDate, startDate) : 0;
    const move = (date) => (date && shift ? addDays(date, shift) : date);
    setDraft({ ...draft, startDate, lines: draft.lines.map((line) => ({ ...line, date: move(line.date), checkIn: move(line.checkIn) })) });
  };
  const dayNumbers = draft ? [...new Set([...draft.lines.map((line) => Number(line.dayNumber) || 1), ...(draft.days || []).map((day) => Number(day.dayNumber))])].sort((a, b) => a - b) : [];
  const lastDay = dayNumbers.length ? dayNumbers[dayNumbers.length - 1] : 1;
  const dayOf = (dayNumber) => (draft.days || []).find((day) => Number(day.dayNumber) === dayNumber) || { dayNumber, title: "", description: "" };
  const setDay = (dayNumber, patch) => setDraft({ ...draft, days: [...(draft.days || []).filter((day) => Number(day.dayNumber) !== dayNumber), { ...dayOf(dayNumber), ...patch }] });
  const addLine = (kind) => {
    const date = dayDate(draft.startDate, lastDay);
    const followsGroup = kind === "TRANSPORT" || kind === "ACTIVITY";
    setDraft({ ...draft, lines: [...draft.lines, { kind, dayNumber: lastDay, title: kind === "HOTEL" ? "Stay" : "", mealPlan: "CP", nights: 1, rooms: 1, adults: followsGroup ? "" : draft.adults, children: followsGroup ? "" : draft.children, vehicles: "", date, checkIn: date }] });
  };
  const cabsFor = (service) => cabTypes.filter((cab) => service?.rates.some((rate) => rate.cabTypeId === cab.id));
  // Choosing a service names the line, picks a cab that has a price, and fills an empty day's title and text.
  const pickService = (index, serviceId) => {
    const service = services.find((item) => item.id === serviceId);
    const line = draft.lines[index];
    const dayNumber = Number(line.dayNumber) || 1;
    const lines = draft.lines.map((item, i) => (i === index ? { ...item, serviceId, title: service?.name || "", cabTypeId: line.kind === "TRANSPORT" ? cabsFor(service)[0]?.id || "" : undefined } : item));
    const day = dayOf(dayNumber);
    const days = service && (service.dayTitle || service.dayDescription) && !day.title && !day.description
      ? [...(draft.days || []).filter((item) => Number(item.dayNumber) !== dayNumber), { dayNumber, title: service.dayTitle || "", description: service.dayDescription || "" }]
      : draft.days;
    setDraft({ ...draft, lines, days });
  };
  // Hotel options (ADR 043): a new option starts as a copy of option 1's hotels, to change hotel by hotel.
  const addOption = () => {
    const options = draft.options.length >= 2 ? [...draft.options, { name: `Option ${draft.options.length + 1}` }] : [{ name: "Option 1" }, { name: "Option 2" }];
    const firstHotels = draft.lines.filter((line) => line.kind === "HOTEL" && (Number(line.option) || 1) === 1);
    setDraft({ ...draft, options, lines: [...draft.lines, ...firstHotels.map((line) => ({ ...line, option: options.length, id: undefined, priceInr: undefined }))] });
  };
  const removeOption = (number) => {
    const options = draft.options.filter((_, index) => index + 1 !== number);
    const lines = draft.lines.filter((line) => line.kind !== "HOTEL" || (Number(line.option) || 1) !== number)
      .map((line) => (line.kind === "HOTEL" ? { ...line, option: options.length >= 2 && (Number(line.option) || 1) > number ? Number(line.option) - 1 : options.length >= 2 ? Number(line.option) || 1 : 1 } : line));
    setDraft({ ...draft, options: options.length >= 2 ? options : [], lines });
  };
  const serviceOptions = (kinds) => services.filter((service) => kinds.includes(service.kind) && service.status === "ACTIVE")
    .map((service) => <option key={service.id} value={service.id}>{service.city ? `${service.city}: ` : ""}{service.name}</option>);
  const editable = !saved || ["DRAFT", "SENT"].includes(saved.status);

  if (tab !== "quotations") {
    return (
      <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <Tabs tab={tab} setTab={setTab} />
        {tab === "hotels" ? <SupplierHotelRatesPanel supplierId={supplierId} onChange={setHotels} /> : <SupplierRateSheetPanel supplierId={supplierId} onChange={onRateSheet} />}
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <Tabs tab={tab} setTab={setTab} />
      {notice && <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
      {error && <p role="alert" className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

      {!draft ? (
        <>
          <button onClick={() => { setSaved(null); setDraft(NEW()); }} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950"><Plus className="h-4 w-4" /> New quotation</button>
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
            {list.map((row) => (
              <li key={row.id}>
                <button onClick={() => request(`${base}/quotations/${row.id}`).then((data) => open(data.quotation)).catch((err) => setError(err.message))} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-stone-50">
                  <span className="min-w-0"><strong className="block truncate text-sm text-stone-900">{row.title}</strong><span className="text-xs text-stone-500">{row.ref} · {row.customerName}{row.destination ? ` · ${row.destination}` : ""} · from {row.startDate}</span></span>
                  <span className="text-right"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[row.status]}`}>{row.status}</span><span className="mt-1 block font-mono text-sm font-bold">{inr(row.totalInr)}</span></span>
                </button>
              </li>
            ))}
            {!list.length && <li className="p-6 text-center text-xs text-stone-500">No quotations yet.</li>}
          </ul>
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => { setDraft(null); setSaved(null); setShared(null); }} className="text-xs font-bold text-stone-600 underline">← All quotations</button>
            {saved && <span className="text-xs text-stone-500">{saved.ref} · <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[saved.status]}`}>{saved.status}</span></span>}
          </div>

          <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-3">
            <input required placeholder="Trip title, e.g. Golden Triangle 4N/5D" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${input} sm:col-span-2`} aria-label="Title" />
            <input placeholder="Destination, e.g. Delhi Agra Jaipur" value={draft.destination} onChange={(event) => setDraft({ ...draft, destination: event.target.value })} className={input} aria-label="Destination" />
            <input placeholder="Customer name" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} className={input} aria-label="Customer name" />
            <input placeholder="Customer email" type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} className={input} aria-label="Customer email" />
            <input placeholder="Customer phone" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} className={input} aria-label="Customer phone" />
            <label className="text-xs text-stone-500">Starts<input type="date" value={draft.startDate} onChange={(event) => setStart(event.target.value)} className={`mt-1 w-full ${input}`} /></label>
            <label className="text-xs text-stone-500">Adults / children<span className="mt-1 flex gap-2"><input type="number" min={1} value={draft.adults} onChange={(event) => setDraft({ ...draft, adults: event.target.value })} className={`w-full ${input}`} aria-label="Adults" /><input type="number" min={0} value={draft.children} onChange={(event) => setDraft({ ...draft, children: event.target.value })} className={`w-full ${input}`} aria-label="Children" /></span></label>
            <label className="text-xs text-stone-500">Markup on your costs (%)<input type="number" min={0} max={200} step="0.5" value={draft.markupPct} onChange={(event) => setDraft({ ...draft, markupPct: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
            <label className="text-xs text-stone-500">For agent (optional)<select value={draft.agentId} onChange={(event) => setDraft({ ...draft, agentId: event.target.value })} className={`mt-1 w-full ${input}`}><option value="">Direct customer</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
            <label className="text-xs text-stone-500">Valid until<input type="date" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
            <textarea placeholder="Notes for the customer (inclusions, exclusions, terms)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} className={`${input} sm:col-span-3`} aria-label="Notes" />
          </fieldset>

          {!saved && suggestions.length > 0 && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs">
              <p className="font-bold text-sky-900">Start from a past quotation for {destination}</p>
              <ul className="mt-2 space-y-1">
                {suggestions.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-2">
                    <span><strong>{row.title}</strong> <span className="text-stone-500">· {row.ref} · {row.days} day{row.days === 1 ? "" : "s"} · {row.adults + row.children} travelers · {inr(row.totalInr)}</span></span>
                    <button type="button" onClick={() => startFrom(row.id)} className="rounded-lg bg-sky-700 px-3 py-1.5 font-bold text-white">Use for {draft.startDate}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset disabled={!editable} className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 p-3 text-xs">
            <span className="font-bold text-stone-700">Hotel options</span>
            {draft.options.length < 2
              ? <span className="text-stone-500">One set of hotels. Offer the customer a choice, e.g. 3 Star and 4 Star, with the rest of the trip the same.</span>
              : draft.options.map((option, index) => (
                <span key={index} className="flex items-center gap-1">
                  <input value={option.name} onChange={(event) => setDraft({ ...draft, options: draft.options.map((item, i) => (i === index ? { name: event.target.value } : item)) })} className={`${input} w-28 py-1.5`} aria-label={`Option ${index + 1} name`} />
                  <button type="button" onClick={() => removeOption(index + 1)} aria-label={`Remove option ${index + 1}`} className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            {draft.options.length < 6 && <button type="button" onClick={addOption} disabled={!draft.lines.some((line) => line.kind === "HOTEL")} title={draft.lines.some((line) => line.kind === "HOTEL") ? "" : "Add hotel nights first"} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 font-bold disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> {draft.options.length < 2 ? "Offer another hotel option" : "Add option"}</button>}
          </fieldset>

          <div className="space-y-2">
            {dayNumbers.map((dayNumber) => (
              <div key={dayNumber} className="space-y-2 rounded-2xl border border-stone-200 p-3">
                <fieldset disabled={!editable} className="grid gap-2 text-xs sm:grid-cols-[10rem_1fr]">
                  <span className="self-center font-black text-amber-700">Day {dayNumber} · {dayDate(draft.startDate, dayNumber)}</span>
                  <input placeholder="Day title, e.g. Agra: Taj Mahal and Agra Fort" value={dayOf(dayNumber).title || ""} onChange={(event) => setDay(dayNumber, { title: event.target.value })} className={input} aria-label={`Day ${dayNumber} title`} />
                  <textarea rows={2} placeholder="What happens this day (on the PDF)" value={dayOf(dayNumber).description || ""} onChange={(event) => setDay(dayNumber, { description: event.target.value })} className={`${input} sm:col-span-2`} aria-label={`Day ${dayNumber} description`} />
                </fieldset>
                {draft.lines.map((line, index) => {
                  if ((Number(line.dayNumber) || 1) !== dayNumber) return null;
                  const hotel = hotels.find((item) => item.id === line.hotelId);
                  const rooms = hotel ? [...new Set(hotel.rates.map((rate) => rate.roomType))] : [];
                  return (
                    <fieldset key={index} disabled={!editable} className="flex flex-wrap items-end gap-2 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3 text-xs">
                      <label>Day<input type="number" min={1} value={line.dayNumber} onChange={(event) => setLine(index, { dayNumber: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                      {line.kind === "HOTEL" && <>
                        {draft.options.length >= 2 && <label>Option<select value={Number(line.option) || 1} onChange={(event) => setLine(index, { option: Number(event.target.value) })} className={`mt-1 block ${input}`}>{draft.options.map((option, i) => <option key={i} value={i + 1}>{option.name || `Option ${i + 1}`}</option>)}</select></label>}
                        <label>Hotel<select value={line.hotelId || ""} onChange={(event) => setLine(index, { hotelId: event.target.value, roomType: "" })} className={`mt-1 block ${input}`}><option value="">Choose…</option>{hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                        <label>Room<select value={line.roomType || ""} onChange={(event) => setLine(index, { roomType: event.target.value })} className={`mt-1 block ${input}`}><option value="">Choose…</option>{rooms.map((room) => <option key={room}>{room}</option>)}</select></label>
                        <label>Meals<select value={line.mealPlan} onChange={(event) => setLine(index, { mealPlan: event.target.value })} className={`mt-1 block ${input}`}>{Object.entries(MEAL_PLAN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                        <label>Check-in<input type="date" value={line.checkIn || ""} onChange={(event) => setLine(index, { checkIn: event.target.value })} className={`mt-1 block ${input}`} /></label>
                        <label>Nights<input type="number" min={1} value={line.nights} onChange={(event) => setLine(index, { nights: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        <label>Rooms<input type="number" min={1} value={line.rooms} onChange={(event) => setLine(index, { rooms: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        <label>Extra adults<input type="number" min={0} value={line.extraAdults || 0} onChange={(event) => setLine(index, { extraAdults: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                      </>}
                      {line.kind === "LISTING" && <>
                        <label>Listing<select value={line.productId || ""} onChange={(event) => setLine(index, { productId: event.target.value, title: products.find((item) => item.id === event.target.value)?.title || "" })} className={`mt-1 block max-w-56 ${input}`}><option value="">Choose…</option>{products.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                        <label>Date<input type="date" value={line.date || ""} onChange={(event) => setLine(index, { date: event.target.value })} className={`mt-1 block ${input}`} /></label>
                        <label>Time<input type="time" value={line.pickupTime || ""} onChange={(event) => setLine(index, { pickupTime: event.target.value })} className={`mt-1 block ${input}`} /></label>
                        <label>Adults<input type="number" min={1} value={line.adults} onChange={(event) => setLine(index, { adults: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        <label>Children<input type="number" min={0} value={line.children} onChange={(event) => setLine(index, { children: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                      </>}
                      {line.kind === "TRANSPORT" && <>
                        <label>Car service<select value={line.serviceId || ""} onChange={(event) => pickService(index, event.target.value)} className={`mt-1 block max-w-56 ${input}`}><option value="">Choose…</option>{serviceOptions(["TRANSFER", "SIGHTSEEING"])}</select></label>
                        <label>Cab<select value={line.cabTypeId || ""} onChange={(event) => setLine(index, { cabTypeId: event.target.value })} className={`mt-1 block ${input}`}><option value="">Choose…</option>{cabsFor(services.find((item) => item.id === line.serviceId)).map((cab) => <option key={cab.id} value={cab.id}>{cab.name} ({cab.seats} seats)</option>)}</select></label>
                        <label>Cabs<input type="number" min={1} placeholder="Auto" value={line.vehicles ?? ""} onChange={(event) => setLine(index, { vehicles: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        {services.find((item) => item.id === line.serviceId)?.pricing === "PER_KM" && <>
                          <label>Km<input type="number" min={1} placeholder={String(services.find((item) => item.id === line.serviceId)?.distanceKm || "")} value={line.km ?? ""} onChange={(event) => setLine(index, { km: event.target.value })} className={`mt-1 block w-20 ${input}`} /></label>
                          <label>Car days<input type="number" min={1} placeholder="1" value={line.carDays ?? ""} onChange={(event) => setLine(index, { carDays: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        </>}
                        <label>Date<input type="date" value={line.date || ""} onChange={(event) => setLine(index, { date: event.target.value })} className={`mt-1 block ${input}`} /></label>
                      </>}
                      {line.kind === "ACTIVITY" && <>
                        <label>Activity<select value={line.serviceId || ""} onChange={(event) => pickService(index, event.target.value)} className={`mt-1 block max-w-56 ${input}`}><option value="">Choose…</option>{serviceOptions(["ACTIVITY"])}</select></label>
                        <label>Date<input type="date" value={line.date || ""} onChange={(event) => setLine(index, { date: event.target.value })} className={`mt-1 block ${input}`} /></label>
                        <label>Adults<input type="number" min={0} placeholder={String(draft.adults)} value={line.adults ?? ""} onChange={(event) => setLine(index, { adults: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                        <label>Children<input type="number" min={0} placeholder={String(draft.children)} value={line.children ?? ""} onChange={(event) => setLine(index, { children: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                      </>}
                      {line.kind === "CUSTOM" && <>
                        <label>Item<input placeholder="Airport cab, permits…" value={line.title} onChange={(event) => setLine(index, { title: event.target.value })} className={`mt-1 block w-48 ${input}`} /></label>
                        <label>Your cost (₹)<input type="number" min={0} value={line.amountInr ?? ""} onChange={(event) => setLine(index, { amountInr: event.target.value })} className={`mt-1 block w-28 ${input}`} /></label>
                      </>}
                      <label className="min-w-40 flex-1">Description on the PDF<input value={line.description || ""} onChange={(event) => setLine(index, { description: event.target.value })} className={`mt-1 block w-full ${input}`} /></label>
                      <span className="ml-auto text-right"><span className="block text-[10px] uppercase text-stone-400">{line.kind === "LISTING" ? "Price, pre-tax" : "Your cost"}</span><strong className="font-mono">{line.priceInr != null ? inr(line.priceInr) : "Save to price"}</strong></span>
                      {saved?.status === "ACCEPTED" && line.kind === "LISTING" && (line.bookingId
                        ? <span className="rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-800">Booked</span>
                        : <button type="button" onClick={() => act(`/lines/${line.id}/book`, {}, `${line.title} booked; seats are held.`)} className="rounded-lg bg-stone-900 px-3 py-2 font-bold text-white disabled:opacity-50" disabled={false}>Book now</button>)}
                      {editable && <button type="button" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })} aria-label="Remove line" className="rounded-lg p-2 text-stone-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                    </fieldset>
                  );
                })}
              </div>
            ))}
            {editable && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => addLine("HOTEL")} disabled={!hotels.length} title={hotels.length ? "" : "Add hotels under Hotel rate sheet first"} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-40"><Hotel className="h-4 w-4" /> Hotel nights</button>
              <button type="button" onClick={() => addLine("LISTING")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"><Package className="h-4 w-4" /> Your listing</button>
              <button type="button" onClick={() => addLine("TRANSPORT")} disabled={!services.some((service) => isTransport(service.kind))} title={services.some((service) => isTransport(service.kind)) ? "" : "Add transfers or sightseeing under Cars & activities first"} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-40"><Car className="h-4 w-4" /> Transfer / sightseeing</button>
              <button type="button" onClick={() => addLine("ACTIVITY")} disabled={!services.some((service) => service.kind === "ACTIVITY")} title={services.some((service) => service.kind === "ACTIVITY") ? "" : "Add activities under Cars & activities first"} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-40"><Ticket className="h-4 w-4" /> Activity / ticket</button>
              <button type="button" onClick={() => addLine("CUSTOM")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4" /> Custom item</button>
              <button type="button" onClick={() => setDay(lastDay + (draft.lines.length || (draft.days || []).length ? 1 : 0), {})} className="flex items-center gap-1 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-xs font-bold"><CalendarPlus className="h-4 w-4" /> Next day</button>
            </div>}
          </div>

          {saved && saved.options.length > 0 && !saved.selectedOption && (
            <div className="overflow-x-auto rounded-2xl border border-stone-200 p-3">
              <table className="w-full text-right text-xs">
                <thead className="text-[10px] uppercase text-stone-400"><tr><th className="py-1 text-left">Option</th><th>Your costs</th><th>Markup</th><th>Your listings</th><th>GST</th><th className="text-stone-600">Customer pays</th><th>Per person</th></tr></thead>
                <tbody className="divide-y divide-stone-100 font-mono">
                  {saved.options.map((option) => (
                    <tr key={option.number}>
                      <td className="py-1.5 text-left font-sans font-bold">{option.name}</td><td>{inr(option.totals.costInr)}</td><td>{inr(option.totals.markupInr)}</td><td>{inr(option.totals.listingsInr)}</td><td>{inr(option.totals.gstInr)}</td>
                      <td className="text-sm font-black">{inr(option.totals.totalInr)}</td><td>{inr(option.totals.perPersonInr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {saved && !(saved.options.length > 0 && !saved.selectedOption) && (
            <div className="grid gap-2 rounded-2xl border border-stone-200 p-4 text-sm sm:grid-cols-2">
              <div className="space-y-1 text-xs text-stone-600">
                <p className="text-[10px] font-black uppercase text-stone-400">Only you see this</p>
                <p>Your costs: hotels, cars, activities, extras <span className="float-right font-mono">{inr(saved.totals.costInr)}</span></p>
                <p>Markup {saved.markupPct}% <span className="float-right font-mono">{inr(saved.totals.markupInr)}</span></p>
                <p>Your listings <span className="float-right font-mono">{inr(saved.totals.listingsInr)}</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-stone-400">The customer sees</p>
                {saved.selectedOption && <p className="text-xs font-bold text-emerald-700">Customer chose {saved.options.find((option) => option.number === saved.selectedOption)?.name}</p>}
                <p>Package price <span className="float-right font-mono">{inr(saved.totals.subtotalInr)}</span></p>
                {saved.totals.gstInr > 0 && <p>GST {saved.totals.gstPct}% <span className="float-right font-mono">{inr(saved.totals.gstInr)}</span></p>}
                <p className="text-lg font-black">Total <span className="float-right font-mono">{inr(saved.totals.totalInr)}</span></p>
                {saved.adults + saved.children > 1 && <p className="text-xs text-stone-500">About {inr(saved.totals.perPersonInr)} per person</p>}
                {saved.status === "ACCEPTED" && <p className="text-xs text-stone-600">Paid {inr(saved.totals.paidInr)} · due <strong>{inr(saved.totals.dueInr)}</strong></p>}
              </div>
            </div>
          )}

          {saved?.warnings?.length > 0 && (
            <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="flex items-center gap-1 font-bold"><TriangleAlert className="h-4 w-4" /> Check before sending</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{saved.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {editable && <button onClick={save} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950">Save and price</button>}
            {saved && <button onClick={downloadPdf} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" /> PDF</button>}
            {saved && saved.status !== "DECLINED" && <button onClick={send} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Send className="h-4 w-4" /> Send to customer</button>}
            {saved && <span className="flex items-center gap-1">
              <input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} className={`${input} py-2 text-xs`} aria-label="Start date for the copy" />
              <button onClick={() => copyFrom(saved.id, { startDate: copyDate }, "Copied as a new draft for the new dates. Change the customer and save.")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Copy className="h-4 w-4" /> Copy to this date</button>
            </span>}
            {saved?.status === "SENT" && <>
              {saved.options.length > 0 && <select value={acceptOption} onChange={(event) => setAcceptOption(Number(event.target.value))} className={`${input} py-2 text-xs`} aria-label="Option the customer chose">{saved.options.map((option) => <option key={option.number} value={option.number}>{option.name}</option>)}</select>}
              <button onClick={() => act("/status", saved.options.length ? { status: "ACCEPTED", option: acceptOption } : { status: "ACCEPTED" }, "Accepted. Book the listings below and record payments.")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">Customer accepted</button>
              <button onClick={() => act("/status", { status: "DECLINED" }, "Marked declined.")} className="rounded-xl border border-rose-300 px-4 py-2.5 text-xs font-bold text-rose-700">Declined</button>
            </>}
          </div>

          {shared && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs">
              <p className="font-bold text-sky-900"><FileText className="mr-1 inline h-4 w-4" />Share link (valid 60 days)</p>
              <p className="mt-1 break-all font-mono text-sky-900">{shared.shareUrl}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => navigator.clipboard?.writeText(shared.shareUrl).then(() => setNotice("Link copied."))} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 font-bold">Copy link</button>
                <a href={`https://wa.me/${String(saved.customerPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(shared.whatsappText)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
              </div>
            </div>
          )}

          {saved?.status === "ACCEPTED" && saved.totals.dueInr > 0 && (
            <form onSubmit={(event) => { event.preventDefault(); act("/payments", { mode: payment.mode, amount_inr: Number(payment.amount_inr), reference: payment.reference || null }, "Payment recorded.").then(() => setPayment({ ...payment, amount_inr: "", reference: "" })); }} className="flex flex-wrap items-end gap-2 text-xs">
              <select value={payment.mode} onChange={(event) => setPayment({ ...payment, mode: event.target.value })} className={input} aria-label="Payment mode">{["UPI", "BANK", "CASH", "CARD"].map((mode) => <option key={mode}>{mode}</option>)}</select>
              <input required type="number" min={1} max={saved.totals.dueInr} placeholder="Amount (₹)" value={payment.amount_inr} onChange={(event) => setPayment({ ...payment, amount_inr: event.target.value })} className={`${input} w-32`} aria-label="Amount" />
              <input placeholder="Reference" value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className={`${input} w-40`} aria-label="Reference" />
              <button type="submit" className="rounded-xl bg-stone-900 px-4 py-2 font-bold text-white">Record payment</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Tabs({ tab, setTab }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-xl font-bold text-stone-900">Packages</h2>
      <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-xs font-bold">
        {[["quotations", "Quotations"], ["hotels", "Hotel rate sheet"], ["services", "Cars & activities"]].map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={`rounded-lg px-3 py-1.5 ${tab === value ? "bg-white shadow-sm" : "text-stone-500"}`}>{label}</button>
        ))}
      </div>
    </div>
  );
}
