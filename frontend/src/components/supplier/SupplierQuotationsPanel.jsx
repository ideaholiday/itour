import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarPlus, Car, CheckCircle2, Circle, Copy, Download, FileText, Hotel, MessageCircle, Package, Plus, Send, Ticket, Trash2, TriangleAlert } from "lucide-react";
import { authHeaders } from "../../lib/api.js";
import SupplierHotelRatesPanel, { MEAL_PLAN_LABELS } from "./SupplierHotelRatesPanel.jsx";
import SupplierRateSheetPanel, { isTransport } from "./SupplierRateSheetPanel.jsx";
import SupplierTripPanel from "./SupplierTripPanel.jsx";
import { addDays, dayDate, dayRange, insertDayAfter, mealPlansFor, minTripLength, quotationPayload, removeDay, setTripLength, setupSteps } from "../../lib/quotationItinerary.js";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const STATUS_STYLES = { DRAFT: "bg-stone-100 text-stone-700", SENT: "bg-sky-100 text-sky-800", ACCEPTED: "bg-emerald-100 text-emerald-800", DECLINED: "bg-rose-100 text-rose-800" };
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const hotelLabel = (hotel) => `${hotel.name}${hotel.city ? ` · ${hotel.city}` : ""}${hotel.starRating ? ` · ${hotel.starRating}★` : ""}`;
const COST_GROUPS = [["HOTEL", "Hotels"], ["TRANSPORT", "Cars"], ["ACTIVITY", "Activities"], ["CUSTOM", "Extras"]];
// The cost lines of the quotation's package (option 1 until the customer picks), grouped by kind; listings are shown separately.
const costGroups = (quotation) => {
  const option = quotation.selectedOption || 1;
  const lines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (line.option || 1) === option);
  return COST_GROUPS.map(([kind, label]) => {
    const items = lines.filter((line) => line.kind === kind);
    return { label, lines: items, totalInr: items.reduce((sum, line) => sum + Number(line.priceInr || 0), 0) };
  }).filter((group) => group.lines.length);
};
const costLabel = (line, hotels, cabTypes) => {
  if (line.kind === "HOTEL") {
    const hotel = hotels.find((item) => item.id === line.hotelId);
    return [hotel?.name || line.title, line.roomType, `${line.nights} night${line.nights === 1 ? "" : "s"}`, line.rooms > 1 ? `${line.rooms} rooms` : null].filter(Boolean).join(" · ");
  }
  const cab = line.kind === "TRANSPORT" ? cabTypes.find((item) => item.id === line.cabTypeId) : null;
  return [line.title, cab ? `${line.vehicles > 1 ? `${line.vehicles} × ` : ""}${cab.name}` : null].filter(Boolean).join(" · ");
};
const NEW = () => ({ title: "", destination: "", days: [], options: [], customerName: "", customerEmail: "", customerPhone: "", agentId: "", startDate: today(), adults: 2, children: 0, markupPct: 15, notes: "", validUntil: "", lines: [] });

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
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
    const body = quotationPayload(draft);
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
  const dayNumbers = draft ? dayRange(draft.lines, draft.days) : [];
  const lastDay = dayNumbers.length ? dayNumbers[dayNumbers.length - 1] : 1;
  const shortestTrip = draft ? minTripLength(draft.lines, draft.days) : 1;
  const dayOf = (dayNumber) => (draft.days || []).find((day) => Number(day.dayNumber) === dayNumber) || { dayNumber, title: "", description: "" };
  const setDay = (dayNumber, patch) => setDraft({ ...draft, days: [...(draft.days || []).filter((day) => Number(day.dayNumber) !== dayNumber), { ...dayOf(dayNumber), ...patch }] });
  const addLine = (kind, dayNumber = lastDay) => {
    const date = dayDate(draft.startDate, dayNumber);
    const followsGroup = kind === "TRANSPORT" || kind === "ACTIVITY";
    setDraft({ ...draft, lines: [...draft.lines, { kind, dayNumber, title: kind === "HOTEL" ? "Stay" : "", mealPlan: "CP", nights: 1, rooms: 1, adults: followsGroup ? "" : draft.adults, children: followsGroup ? "" : draft.children, vehicles: "", date, checkIn: date }] });
  };
  const dropDay = (dayNumber) => {
    const items = draft.lines.filter((line) => (Number(line.dayNumber) || 1) === dayNumber).length;
    if (items && !window.confirm(`Remove day ${dayNumber} and its ${items} item${items === 1 ? "" : "s"}? Later days move one day earlier.`)) return;
    setDraft({ ...draft, ...removeDay(draft, dayNumber) });
  };
  // With nothing set up for a kind of item, the button opens the rate sheet instead; the draft is kept.
  const hasHotels = hotels.some((hotel) => hotel.rates?.length);
  const hasTransport = services.some((service) => isTransport(service.kind) && service.status === "ACTIVE");
  const hasActivities = services.some((service) => service.kind === "ACTIVITY" && service.status === "ACTIVE");
  const setUp = (sheet, message) => { setNotice(message); setError(""); setTab(sheet); };
  const itemButtons = (dayNumber) => [
    ["HOTEL", Hotel, "Hotel", hasHotels, "hotels", "Add a hotel and its room rates, then go back to your quotation."],
    ["TRANSPORT", Car, "Car", hasTransport, "services", "Add a cab type and a transfer or sightseeing with prices, then go back to your quotation."],
    ["ACTIVITY", Ticket, "Activity", hasActivities, "services", "Add an activity or ticket with prices, then go back to your quotation."],
    ["LISTING", Package, "Your listing", true, null, ""],
    ["CUSTOM", Plus, "Custom", true, null, ""],
  ].filter(([kind]) => kind !== "LISTING" || products.length > 0)
    .map(([kind, Icon, label, ready, sheet, message]) => (
      <button key={kind} type="button" onClick={() => (ready ? addLine(kind, dayNumber) : setUp(sheet, message))} aria-label={ready ? `Add ${label.toLowerCase()} to day ${dayNumber}` : `Set up ${label.toLowerCase()} prices`} title={ready ? `Add to day ${dayNumber}` : "Set this up first"} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${ready ? "border-stone-300 bg-white" : "border-dashed border-stone-300 text-stone-400"}`}>
        <Icon className="h-3.5 w-3.5" /> {label}{!ready && " · set up"}
      </button>
    ));
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
        {notice && <p className="flex items-center gap-2 rounded-2xl bg-sky-50 p-3 text-xs font-semibold text-sky-900"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
        {draft && editable && <button type="button" onClick={() => { setNotice(""); setTab("quotations"); }} className="text-xs font-bold text-amber-700 underline">← Back to your quotation{draft.title ? `: ${draft.title}` : ""} (kept as you left it)</button>}
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
          <SetupGuide steps={setupSteps({ hotels, cabTypes, services, quotationCount: list.length })} setTab={setTab} />
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
                  <span className="flex items-center gap-1 self-center font-black text-amber-700">Day {dayNumber} · {dayDate(draft.startDate, dayNumber)}
                    {editable && dayNumbers.length > 1 && <button type="button" onClick={() => dropDay(dayNumber)} aria-label={`Remove day ${dayNumber}`} title="Remove this day" className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </span>
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
                        <label>Hotel<select value={line.hotelId || ""} onChange={(event) => setLine(index, { hotelId: event.target.value, roomType: "" })} className={`mt-1 block ${input}`}><option value="">Choose…</option>{hotels.map((item) => <option key={item.id} value={item.id}>{hotelLabel(item)}</option>)}</select></label>
                        <label>Room<select value={line.roomType || ""} onChange={(event) => { const plans = mealPlansFor(hotel, event.target.value, null, Object.keys(MEAL_PLAN_LABELS)); setLine(index, { roomType: event.target.value, ...(plans.includes(line.mealPlan) ? {} : { mealPlan: plans[0] }) }); }} className={`mt-1 block ${input}`}><option value="">Choose…</option>{rooms.map((room) => <option key={room}>{room}</option>)}</select></label>
                        <label>Meals<select value={line.mealPlan} onChange={(event) => setLine(index, { mealPlan: event.target.value })} className={`mt-1 block ${input}`}>{mealPlansFor(hotel, line.roomType, line.mealPlan, Object.keys(MEAL_PLAN_LABELS)).map((value) => <option key={value} value={value}>{MEAL_PLAN_LABELS[value]}</option>)}</select></label>
                        <label>Check-in<input type="date" value={line.checkIn || ""} onChange={(event) => setLine(index, { checkIn: event.target.value })} className={`mt-1 block ${input}`} /></label>
                        <label>Nights<input type="number" min={1} value={line.nights} onChange={(event) => setLine(index, { nights: event.target.value })} className={`mt-1 block w-16 ${input}`} />{/^\d{4}-\d{2}-\d{2}$/.test(line.checkIn || "") && Number(line.nights) >= 1 && <span className="mt-0.5 block text-[10px] text-stone-400">out {addDays(line.checkIn, Number(line.nights))}</span>}</label>
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
                {editable && <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-stone-500">Add to day {dayNumber}:</span>
                  {itemButtons(dayNumber)}
                  {dayNumber < lastDay && <button type="button" onClick={() => setDraft({ ...draft, ...insertDayAfter(draft, dayNumber) })} title="Later days move one day later" className="ml-auto flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-[11px] font-bold text-stone-500"><CalendarPlus className="h-3.5 w-3.5" /> Insert a day after</button>}
                </div>}
              </div>
            ))}
            {editable && <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => setDay(lastDay + 1, {})} className="flex items-center gap-1 rounded-xl border border-dashed border-stone-300 px-3 py-2 font-bold"><CalendarPlus className="h-4 w-4" /> Add day {lastDay + 1}</button>
              <label className="flex items-center gap-1 text-stone-500">or trip length
                <select value={lastDay} onChange={(event) => setDraft({ ...draft, days: setTripLength(draft.days || [], Number(event.target.value)) })} className={`${input} py-1.5 text-xs`} aria-label="Trip length in days">
                  {Array.from({ length: Math.max(0, 30 - shortestTrip + 1) }, (_, i) => shortestTrip + i).map((days) => <option key={days} value={days}>{days} day{days === 1 ? "" : "s"} / {days - 1} night{days === 2 ? "" : "s"}</option>)}
                </select>
              </label>
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
                {costGroups(saved).map((group) => (
                  <details key={group.label} className="group">
                    <summary className="cursor-pointer list-none">{group.label} <span className="text-stone-400">({group.lines.length})</span><span className="float-right font-mono">{inr(group.totalInr)}</span></summary>
                    <ul className="mb-1 ml-3 space-y-0.5 border-l border-stone-200 pl-2 text-[11px] text-stone-500">
                      {group.lines.map((line) => <li key={line.id}>Day {line.dayNumber} · {costLabel(line, hotels, cabTypes)}<span className="float-right font-mono">{inr(line.priceInr)}</span></li>)}
                    </ul>
                  </details>
                ))}
                <p className="border-t border-stone-100 pt-1 font-bold">Your costs <span className="float-right font-mono">{inr(saved.totals.costInr)}</span></p>
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

          {saved?.status === "ACCEPTED" && saved.trip && <SupplierTripPanel supplierId={supplierId} quotation={saved} hotels={hotels} onChange={open} />}
        </div>
      )}
    </section>
  );
}

// A checklist until the rate sheets and a first quotation exist, so a new supplier knows where to start.
function SetupGuide({ steps, setTab }) {
  if (steps.every((step) => step.done)) return null;
  const next = steps.find((step) => !step.done);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs">
      <p className="font-bold text-amber-900">Get set up to quote in minutes ({steps.filter((step) => step.done).length} of {steps.length} done)</p>
      <p className="mt-0.5 text-amber-800">Add your prices once. Every quotation then prices itself: pick a hotel, car or ticket for each day.</p>
      <ol className="mt-3 space-y-1.5">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button type="button" onClick={() => setTab(step.tab)} disabled={step.tab === "quotations"} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${step === next ? "bg-white font-bold text-stone-900 shadow-sm" : "text-stone-600"}`}>
              {step.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className={step.done ? "line-through" : ""}>{index + 1}. {step.label}</span>
              {step === next && step.tab !== "quotations" && <span className="ml-auto text-amber-700">Open →</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
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
