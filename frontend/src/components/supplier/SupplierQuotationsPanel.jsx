import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, BookmarkPlus, CalendarPlus, Car, CheckCircle2, Circle, Copy, Download, MapPin, FileText, Hotel, MessageCircle, Package, Plus, Send, Ticket, Trash2, TriangleAlert, User, Users } from "lucide-react";
import { authHeaders } from "../../lib/api.js";
import SupplierHotelRatesPanel, { MEAL_PLAN_LABELS } from "./SupplierHotelRatesPanel.jsx";
import SupplierRateSheetPanel, { isTransport } from "./SupplierRateSheetPanel.jsx";
import SupplierTripPanel from "./SupplierTripPanel.jsx";
import Combobox from "../Combobox.jsx";
import { addDays, applyRoute, routeFromDraft, routeItemLines, builderSteps, cityOfDay, cleanItems, mergeItems, tripInclusions, dayAfterService, dayDate, dayRange, hotelRateGap, insertDayAfter, legStays, mealPlansFor, minTripLength, nearestFirst, planFromLegs, quotationPayload, removeDay, routeTitle, setTripLength, setupSteps } from "../../lib/quotationItinerary.js";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const STATUS_STYLES = { DRAFT: "bg-stone-100 text-stone-700", SENT: "bg-sky-100 text-sky-800", ACCEPTED: "bg-emerald-100 text-emerald-800", DECLINED: "bg-rose-100 text-rose-800" };
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
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
// Agent or direct: most operators quote B2B, so a new quotation is for an agent unless this browser last chose direct (ADR 048).
const MODE_KEY = "idea.quotation.forAgent";
const lastMode = () => { try { return window.localStorage.getItem(MODE_KEY) !== "direct"; } catch { return true; } };
const rememberMode = (forAgent) => { try { window.localStorage.setItem(MODE_KEY, forAgent ? "agent" : "direct"); } catch { /* private mode */ } };
const chain = (legs = []) => legs.map((leg) => `${leg.city} ${leg.nights}N`).join(" → ");
const NEW = () => ({ forAgent: lastMode(), title: "", destination: "", days: [], legs: [], options: [], inclusions: [], exclusions: [], customerName: "", customerEmail: "", customerPhone: "", agentId: "", startDate: today(), adults: 2, children: 0, markupPct: 15, notes: "", validUntil: "", lines: [] });

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
  const [cities, setCities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [terms, setTerms] = useState({ inclusions: [], exclusions: [] });
  const [routeLib, setRouteLib] = useState({ routes: [], cities: [] });
  const [routeId, setRouteId] = useState("");
  const [appliedRoute, setAppliedRoute] = useState(null);
  const [routeMissing, setRouteMissing] = useState([]);
  const [newAgent, setNewAgent] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [step, setStep] = useState("trip");
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
    request(`${base}/route-library`).then((data) => setRouteLib({ routes: data.routes || [], cities: data.cities || [] })).catch(() => {});
    request(`${base}/quotation-terms`).then((data) => setTerms(data.terms || { inclusions: [], exclusions: [] })).catch(() => {});
    request(`${base}/agents`).then((data) => setAgents((data.agents || []).filter((agent) => agent.status === "ACTIVE"))).catch(() => {});
    // Cities for the destination and leg pickers: the marketplace catalogue,
    // merged with cities the supplier's own hotels sit in, so a hotel city
    // the catalogue doesn't have still autocompletes.
    request("/api/destinations").then((data) => setCities(Array.isArray(data) ? data : [])).catch(() => {});
  }, [base, loadList]);

  const onRateSheet = useCallback(({ cabTypes: cabs, services: list }) => { setCabTypes(cabs); setServices(list); }, []);
  // Saved customers per scope (migration 076). Reloaded when the picked agent
  // changes: an agent's customers stay on that agent's list, direct customers
  // stay on the supplier's own.
  const scopeAgentId = (draft && !saved ? draft.agentId : saved?.agentId) || "direct";
  useEffect(() => {
    request(`${base}/customers?agentId=${encodeURIComponent(scopeAgentId)}`).then((data) => setCustomers(data.customers || [])).catch(() => setCustomers([]));
  }, [base, scopeAgentId]);
  const customerOptions = React.useMemo(() => customers.map((row) => ({
    value: row.id, label: row.name, hint: [row.phone, row.email].filter(Boolean).join(" · "),
  })), [customers]);
  const pickCustomer = (customerId) => {
    const row = customers.find((item) => item.id === customerId);
    if (!row) return;
    setDraft({ ...draft, customerName: row.name, customerEmail: row.email || "", customerPhone: row.phone || "" });
  };
  const cityOptions = React.useMemo(() => {
    const map = new Map();
    for (const dest of cities) if (dest?.name) map.set(dest.name.toLowerCase(), { name: dest.name, hint: dest.state || dest.country || "" });
    for (const hotel of hotels) if (hotel?.city) { const key = hotel.city.toLowerCase(); if (!map.has(key)) map.set(key, { name: hotel.city, hint: "your hotel" }); }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [cities, hotels]);

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
    setDraft({ ...quotation, forAgent: Boolean(quotation.agentId), inclusions: quotation.inclusions || [], exclusions: quotation.exclusions || [], destination: quotation.destination || "", days: quotation.days || [], legs: quotation.legs || [], options: (quotation.options || []).map((option) => ({ name: option.name })), customerEmail: quotation.customerEmail || "", customerPhone: quotation.customerPhone || "", agentId: quotation.agentId || "", notes: quotation.notes || "", validUntil: quotation.validUntil || "",
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

  const downloadPdf = async (variant = "BRAND") => {
    try {
      const response = await fetch(`${base}/quotations/${saved.id}/pdf${variant === "AGENT" ? "?variant=AGENT" : ""}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("The PDF couldn't be made");
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: `${saved.ref}${variant === "AGENT" ? "-agent" : ""}.pdf` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  };

  const sendToAgent = async () => {
    const data = await act("/send-to-agent", {}, null);
    if (!data) return;
    setNotice(data.email.status === "SENT" ? `Trade quotation emailed to ${data.agent?.email || "the agent"}.` : "Agent email wasn't sent" + (data.email.error ? `: ${data.email.error}` : "."));
  };

  // Copies any quotation to a new start date as a new draft, priced again (ADR 042).
  const copyFrom = (quotationId, body, message) => run(async () => {
    const data = await request(`${base}/quotations/${quotationId}/copy`, { method: "POST", body: JSON.stringify(body) });
    open(data.quotation);
    return data;
  }, message);
  const startFrom = (quotationId) => copyFrom(quotationId, {
    startDate: draft.startDate, ...(draft.customerName.trim().length >= 2 ? { customerName: draft.customerName, customerEmail: draft.customerEmail || null, customerPhone: draft.customerPhone || null } : {}),
  }, "Started from a past quotation and priced for your dates. Check it and save.").then((data) => { if (data) setStep("days"); });

  // A line's date follows its day, so moving a day or the start date moves the dates with it.
  const setLine = (index, patch) => setDraft({ ...draft, lines: draft.lines.map((line, i) => {
    if (i !== index) return line;
    const next = { ...line, ...patch };
    if (patch.dayNumber !== undefined && Number(patch.dayNumber) >= 1) Object.assign(next, { date: dayDate(draft.startDate, patch.dayNumber), checkIn: dayDate(draft.startDate, patch.dayNumber) });
    // A hotel sits on its check-in day, so moving the check-in moves the stay to that day.
    if (patch.checkIn !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(patch.checkIn) && daysBetween(draft.startDate, patch.checkIn) >= 0) Object.assign(next, { dayNumber: daysBetween(draft.startDate, patch.checkIn) + 1, date: patch.checkIn });
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
  // Typing in a day makes its text the supplier's own, so a car or activity picked later won't replace it.
  const setDay = (dayNumber, patch) => setDraft({ ...draft, days: [...(draft.days || []).filter((day) => Number(day.dayNumber) !== dayNumber), { ...dayOf(dayNumber), ...patch, auto: false }] });
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
  const editable = !saved || ["DRAFT", "SENT"].includes(saved.status);
  const setUp = (sheet, message) => { setNotice(message); setError(""); setTab(sheet); };
  const itemButtons = (dayNumber, kinds = ["HOTEL", "TRANSPORT", "ACTIVITY", "LISTING", "CUSTOM"]) => [
    ["HOTEL", Hotel, "Hotel", hasHotels, "hotels", "Add a hotel and its room rates, then go back to your quotation."],
    ["TRANSPORT", Car, "Car", hasTransport, "services", "Add a cab type and a transfer or sightseeing with prices, then go back to your quotation."],
    ["ACTIVITY", Ticket, "Activity", hasActivities, "services", "Add an activity or ticket with prices, then go back to your quotation."],
    ["LISTING", Package, "Your listing", true, null, ""],
    ["CUSTOM", Plus, "Custom", true, null, ""],
  ].filter(([kind]) => kinds.includes(kind) && (kind !== "LISTING" || products.length > 0))
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
    const nextDay = dayAfterService(day, service);
    const days = nextDay === day ? draft.days : [...(draft.days || []).filter((item) => Number(item.dayNumber) !== dayNumber), nextDay];
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
  // The day's city (from the route) comes first in every picker.
  const serviceOptionsList = (kinds, city) => nearestFirst(services.filter((service) => kinds.includes(service.kind) && service.status === "ACTIVE"), city)
    .map((service) => ({ value: service.id, label: service.name, hint: service.city || "" }));
  const hotelOptionsList = (city) => nearestFirst(hotels, city).map((hotel) => ({ value: hotel.id, label: hotel.name, hint: [hotel.city, hotel.starRating ? `${hotel.starRating}★` : ""].filter(Boolean).join(" · ") }));
  const lineCity = (line) => (draft ? line.city || cityOfDay(draft.legs, Number(line.dayNumber) || 1) : "");
  // The route laid out as hotel stays; the hotels match it when option 1 has one stay per city on its check-in day.
  const routeStays = draft ? legStays(draft.legs).filter((stay) => stay.nights > 0) : [];
  const firstOptionStays = draft ? draft.lines.filter((line) => line.kind === "HOTEL" && (Number(line.option) || 1) === 1).map((line) => `${Number(line.dayNumber) || 1}:${Number(line.nights) || 1}`).sort() : [];
  const routeMatches = routeStays.map((stay) => `${stay.checkInDay}:${stay.nights}`).sort().join() === firstOptionStays.join();
  const layOut = () => {
    if (firstOptionStays.length && !routeMatches && !window.confirm("Set the hotel stays to the route: one per city, from its check-in day for its nights. Hotels already picked on those days are kept; other stays are removed. Continue?")) return;
    const cities = [...new Set(routeStays.map((stay) => stay.city))];
    setDraft({ ...draft, ...planFromLegs(draft, { cities: routeLib.cities }), title: draft.title || routeTitle(draft.legs), destination: draft.destination || cities.join(", ") });
  };
  // One item's fields. Hotels take their day from the check-in date; the rest pick a day.
  const lineEditor = (line, index) => {
    const hotel = hotels.find((item) => item.id === line.hotelId);
    const rooms = hotel ? [...new Set(hotel.rates.map((rate) => rate.roomType))] : [];
    return (
      <fieldset key={index} disabled={!editable} className="flex flex-wrap items-end gap-2 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3 text-xs">
        {line.kind !== "HOTEL" && <label>Day<input type="number" min={1} value={line.dayNumber} onChange={(event) => setLine(index, { dayNumber: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>}
        {line.kind === "HOTEL" && <>
          {draft.options.length >= 2 && <label>Option<select value={Number(line.option) || 1} onChange={(event) => setLine(index, { option: Number(event.target.value) })} className={`mt-1 block ${input}`}>{draft.options.map((option, i) => <option key={i} value={i + 1}>{option.name || `Option ${i + 1}`}</option>)}</select></label>}
          <label className="block w-56">{lineCity(line) ? `Hotel in ${lineCity(line)}` : "Hotel"}<Combobox value={line.hotelId || ""} onChange={(value) => setLine(index, { hotelId: value, roomType: "" })} options={hotelOptionsList(lineCity(line))} placeholder="Search hotels…" ariaLabel={`hotel-${index}`} className="mt-1" /></label>
          <label>Room<select value={line.roomType || ""} onChange={(event) => { const plans = mealPlansFor(hotel, event.target.value, null, Object.keys(MEAL_PLAN_LABELS)); setLine(index, { roomType: event.target.value, ...(plans.includes(line.mealPlan) ? {} : { mealPlan: plans[0] }) }); }} className={`mt-1 block ${input}`}><option value="">Choose…</option>{rooms.map((room) => <option key={room}>{room}</option>)}</select></label>
          <label>Meals<select value={line.mealPlan} onChange={(event) => setLine(index, { mealPlan: event.target.value })} className={`mt-1 block ${input}`}>{mealPlansFor(hotel, line.roomType, line.mealPlan, Object.keys(MEAL_PLAN_LABELS)).map((value) => <option key={value} value={value}>{MEAL_PLAN_LABELS[value]}</option>)}</select></label>
          <label>Check-in<input type="date" value={line.checkIn || ""} onChange={(event) => setLine(index, { checkIn: event.target.value })} className={`mt-1 block ${input}`} /></label>
          <label>Nights<input type="number" min={1} value={line.nights} onChange={(event) => setLine(index, { nights: event.target.value })} className={`mt-1 block w-16 ${input}`} />{/^\d{4}-\d{2}-\d{2}$/.test(line.checkIn || "") && Number(line.nights) >= 1 && <span className="mt-0.5 block text-[10px] text-stone-400">out {addDays(line.checkIn, Number(line.nights))}</span>}</label>
          <label>Rooms<input type="number" min={1} value={line.rooms} onChange={(event) => setLine(index, { rooms: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
          <label>Extra adults<input type="number" min={0} value={line.extraAdults || 0} onChange={(event) => setLine(index, { extraAdults: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
          {(() => { const gap = hotelRateGap(hotel, line); return gap ? <p className="basis-full text-[11px] font-semibold text-rose-600">No {line.roomType} {MEAL_PLAN_LABELS[line.mealPlan] || line.mealPlan} rate for {gap} — add it in the hotel rate sheet, or this hotel stays at ₹0 and out of the total.</p> : null; })()}
        </>}
        {line.kind === "LISTING" && <>
          <label className="block w-56">Listing<Combobox value={line.productId || ""} onChange={(value) => setLine(index, { productId: value, title: products.find((item) => item.id === value)?.title || "" })} options={productOptionsList} placeholder="Search listings…" ariaLabel={`listing-${index}`} className="mt-1" /></label>
          <label>Date<input type="date" value={line.date || ""} onChange={(event) => setLine(index, { date: event.target.value })} className={`mt-1 block ${input}`} /></label>
          <label>Time<input type="time" value={line.pickupTime || ""} onChange={(event) => setLine(index, { pickupTime: event.target.value })} className={`mt-1 block ${input}`} /></label>
          <label>Adults<input type="number" min={1} value={line.adults} onChange={(event) => setLine(index, { adults: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
          <label>Children<input type="number" min={0} value={line.children} onChange={(event) => setLine(index, { children: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
        </>}
        {line.kind === "TRANSPORT" && <>
          <label className="block w-56">Car service<Combobox value={line.serviceId || ""} onChange={(value) => pickService(index, value)} options={serviceOptionsList(["TRANSFER", "SIGHTSEEING"], lineCity(line))} placeholder="Search car services…" ariaLabel={`car-${index}`} className="mt-1" /></label>
          <label className="block w-40">Cab<Combobox value={line.cabTypeId || ""} onChange={(value) => setLine(index, { cabTypeId: value })} options={cabsFor(services.find((item) => item.id === line.serviceId)).map((cab) => ({ value: cab.id, label: cab.name, hint: `${cab.seats} seats` }))} placeholder="Choose cab…" ariaLabel={`cab-${index}`} className="mt-1" /></label>
          <label>Cabs<input type="number" min={1} placeholder="Auto" value={line.vehicles ?? ""} onChange={(event) => setLine(index, { vehicles: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
          {services.find((item) => item.id === line.serviceId)?.pricing === "PER_KM" && <>
            <label>Km<input type="number" min={1} placeholder={String(services.find((item) => item.id === line.serviceId)?.distanceKm || "")} value={line.km ?? ""} onChange={(event) => setLine(index, { km: event.target.value })} className={`mt-1 block w-20 ${input}`} /></label>
            <label>Car days<input type="number" min={1} placeholder="1" value={line.carDays ?? ""} onChange={(event) => setLine(index, { carDays: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
          </>}
          <label>Date<input type="date" value={line.date || ""} onChange={(event) => setLine(index, { date: event.target.value })} className={`mt-1 block ${input}`} /></label>
        </>}
        {line.kind === "ACTIVITY" && <>
          <label className="block w-56">Activity<Combobox value={line.serviceId || ""} onChange={(value) => pickService(index, value)} options={serviceOptionsList(["ACTIVITY"], lineCity(line))} placeholder="Search activities…" ariaLabel={`activity-${index}`} className="mt-1" /></label>
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
  };
  const steps = draft ? builderSteps(draft, { saved: Boolean(saved) }) : [];
  const stepIndex = Math.max(0, steps.findIndex((item) => item.key === step));
  const goTo = (key) => {
    // Leaving the route with cities set and no hotels yet lays the trip out, so the next step isn't empty.
    if (step === "route" && key !== "route" && routeStays.length && !firstOptionStays.length && editable) layOut();
    setStep(key);
  };
  const productOptionsList = products.map((product) => ({ value: product.id, label: product.title }));
  const agentOptionsList = agents.map((agent) => ({ value: agent.id, label: agent.name, hint: agent.contactName || "" }));
  const isAgentMode = draft ? draft.forAgent !== false : true;
  const pickedAgent = draft?.agentId ? agents.find((agent) => agent.id === draft.agentId) : null;
  const setMode = (forAgent) => { rememberMode(forAgent); setDraft({ ...draft, forAgent, agentId: forAgent ? draft.agentId : "" }); };
  // A new agent from inside the builder, picked at once (ADR 048).
  const addAgent = () => run(async () => {
    const body = { name: newAgent.name, contactName: newAgent.contactName || null, phone: newAgent.phone || null, email: newAgent.email || null, markupPct: Number(newAgent.markupPct) || 0 };
    const { agent } = await request(`${base}/agents`, { method: "POST", body: JSON.stringify(body) });
    setAgents([...agents, agent]);
    setDraft({ ...draft, forAgent: true, agentId: agent.id });
    setNewAgent(null);
  }, "Agent added and picked.");

  // Route library (ADR 048): the supplier's own routes first, then the shared ones.
  const routeOptions = routeLib.routes.map((route) => ({ value: route.id, label: route.name, hint: [route.own ? "Your route" : route.region, route.legs.map((leg) => leg.city).join(" ")].filter(Boolean).join(" · ") }));
  const pickedRoute = routeLib.routes.find((route) => route.id === routeId) || null;
  const useRoute = () => {
    const replacing = (draft.legs || []).length || draft.lines.some((line) => line.kind === "TRANSPORT" || line.kind === "ACTIVITY");
    if (replacing && !window.confirm(`Use ${pickedRoute.name}? Its cities, days, cars and activities replace this quotation's. Hotels already picked on a city's check-in day stay.`)) return;
    const { draft: next, missing } = applyRoute(draft, pickedRoute, { cities: routeLib.cities, services, cabTypes });
    setDraft(next); setAppliedRoute(pickedRoute); setRouteMissing(missing); setError("");
    setNotice(`${pickedRoute.name} laid out: ${next.legs.reduce((sum, leg) => sum + leg.nights, 0) + 1} days. Pick a hotel for each city below.`);
  };
  // Adds the route's missing library entries to the rate sheet (ADR 047), then puts them on their days.
  const addMissing = () => run(async () => {
    await request(`${base}/package-library/import`, { method: "POST", body: JSON.stringify({ itemIds: routeMissing.map((item) => item.id) }) });
    const [fresh, cabs] = await Promise.all([request(`${base}/services`), request(`${base}/cab-types`)]);
    setServices(fresh.services || []); setCabTypes(cabs.cabTypes || []);
    const { lines, missing } = routeItemLines(appliedRoute, draft, { services: fresh.services || [], cabTypes: cabs.cabTypes || [] });
    setDraft({ ...draft, lines: [...draft.lines, ...lines] });
    setRouteMissing(missing);
  }, "Added to your rate sheet at the library's example prices and put on their days. Check the prices under Cars & activities.");
  const saveAsRoute = () => run(async () => {
    const body = routeFromDraft(draft, services);
    if (!body.legs.length) throw new Error("Add the cities and nights on Route & hotels first");
    if (body.name.length < 2) throw new Error("Give the trip a title first; it names the route");
    await request(`${base}/routes`, { method: "POST", body: JSON.stringify(body) });
    const data = await request(`${base}/route-library`);
    setRouteLib({ routes: data.routes || [], cities: data.cities || [] });
  }, "Saved to your routes. It's at the top of the route list for your next quotation.");
  const agentsInList = [...new Map(list.filter((row) => row.agentId).map((row) => [row.agentId, row.agentName || "Agent"])).entries()];
  const shownList = list.filter((row) => listFilter === "all" || (listFilter === "direct" ? !row.agentId : row.agentId === listFilter));

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
          <button onClick={() => { setSaved(null); setDraft({ ...NEW(), inclusions: terms.inclusions, exclusions: terms.exclusions }); setStep("trip"); setRouteId(""); setAppliedRoute(null); setRouteMissing([]); }} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950"><Plus className="h-4 w-4" /> New quotation</button>
          {list.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Show quotations for">
              {[["all", "All"], ["direct", "Direct customers"], ...agentsInList].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setListFilter(value)} aria-pressed={listFilter === value} className={`rounded-full border px-3 py-1 font-bold ${listFilter === value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600"}`}>{label}</button>
              ))}
            </div>
          )}
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
            {shownList.map((row) => (
              <li key={row.id}>
                <button onClick={() => request(`${base}/quotations/${row.id}`).then((data) => { open(data.quotation); setStep(data.quotation.status === "DRAFT" ? "days" : "price"); }).catch((err) => setError(err.message))} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-stone-50">
                  <span className="min-w-0"><strong className="block truncate text-sm text-stone-900">{row.title}</strong><span className="text-xs text-stone-500">{row.agentName && <span className="mr-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-800">{row.agentName}</span>}{row.ref} · {row.customerName}{row.destination ? ` · ${row.destination}` : ""} · from {row.startDate}</span></span>
                  <span className="text-right"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[row.status]}`}>{row.status}</span><span className="mt-1 block font-mono text-sm font-bold">{inr(row.totalInr)}</span></span>
                </button>
              </li>
            ))}
            {!shownList.length && <li className="p-6 text-center text-xs text-stone-500">{list.length ? "None for this choice." : "No quotations yet."}</li>}
          </ul>
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => { setDraft(null); setSaved(null); setShared(null); }} className="text-xs font-bold text-stone-600 underline">← All quotations</button>
            {saved && <span className="text-xs text-stone-500">{saved.ref} · <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[saved.status]}`}>{saved.status}</span></span>}
          </div>

          <Stepper steps={steps} step={stepIndex} onPick={goTo} />

          {step === "trip" && <>
            <div role="radiogroup" aria-label="Who the quotation is for" className="grid gap-2 sm:grid-cols-2">
              {[[true, Users, "For a travel agent (B2B)", "Trade PDF with the agent's net price and margin; your brand stays off it."], [false, User, "Direct customer", "Your branded PDF with one retail price."]].map(([value, Icon, label, hint]) => (
                <button key={label} type="button" role="radio" aria-checked={isAgentMode === value} disabled={!editable} onClick={() => setMode(value)}
                  className={`flex items-start gap-2 rounded-2xl border p-3 text-left text-xs ${isAgentMode === value ? (value ? "border-indigo-400 bg-indigo-50 text-indigo-950" : "border-emerald-400 bg-emerald-50 text-emerald-950") : "border-stone-200 text-stone-500"}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><strong className="block text-sm">{label}</strong>{hint}</span>
                </button>
              ))}
            </div>
            {isAgentMode && (
              <fieldset disabled={!editable} className="space-y-2 rounded-2xl border border-indigo-200 p-3 text-xs">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-56 flex-1 text-stone-500">Agent<Combobox value={draft.agentId || ""} onChange={(value) => setDraft({ ...draft, agentId: value })} options={agentOptionsList} placeholder="Search your agents…" ariaLabel="agent" className="mt-1" /></label>
                  <button type="button" onClick={() => setNewAgent(newAgent ? null : { name: "", contactName: "", phone: "", email: "", markupPct: "" })} className="rounded-xl border border-indigo-300 px-3 py-2 font-bold text-indigo-800">{newAgent ? "Cancel" : "+ New agent"}</button>
                </div>
                {newAgent && (
                  <div className="grid gap-2 rounded-xl bg-indigo-50 p-2 sm:grid-cols-5">
                    <input placeholder="Agency name" value={newAgent.name} onChange={(event) => setNewAgent({ ...newAgent, name: event.target.value })} className={input} aria-label="New agent name" />
                    <input placeholder="Contact person" value={newAgent.contactName} onChange={(event) => setNewAgent({ ...newAgent, contactName: event.target.value })} className={input} aria-label="New agent contact" />
                    <input placeholder="Phone" value={newAgent.phone} onChange={(event) => setNewAgent({ ...newAgent, phone: event.target.value })} className={input} aria-label="New agent phone" />
                    <input placeholder="Email" type="email" value={newAgent.email} onChange={(event) => setNewAgent({ ...newAgent, email: event.target.value })} className={input} aria-label="New agent email" />
                    <span className="flex gap-2"><input type="number" min={0} max={200} placeholder="Markup %" value={newAgent.markupPct} onChange={(event) => setNewAgent({ ...newAgent, markupPct: event.target.value })} className={`w-full ${input}`} aria-label="New agent markup" />
                      <button type="button" disabled={newAgent.name.trim().length < 2} onClick={addAgent} className="rounded-xl bg-indigo-600 px-3 font-bold text-white disabled:opacity-40">Add</button></span>
                  </div>
                )}
                {pickedAgent && <p className="text-indigo-900">{pickedAgent.contactName ? `${pickedAgent.contactName} · ` : ""}the agent's markup is <strong>{Number(pickedAgent.markupPct || 0)}%</strong> on your costs. {pickedAgent.email ? `The trade PDF goes to ${pickedAgent.email}.` : "No email on file: download the agent PDF to share it."}</p>}
              </fieldset>
            )}
            <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-stone-500">{isAgentMode ? "Traveller (the agent's client)" : "Customer"}<Combobox
                freeText allowClear={false}
                value={draft.customerName}
                onChange={(next) => {
                  const picked = customers.find((row) => row.name === next);
                  if (picked) pickCustomer(picked.id);
                  else setDraft({ ...draft, customerName: next });
                }}
                options={customerOptions.map((option) => ({ ...option, value: option.label }))}
                placeholder={isAgentMode ? "Traveller's name, or pick one of this agent's" : "Name, or pick a saved customer"}
                ariaLabel="customer-name"
                className="mt-1"
              /></label>
              <span className="grid grid-cols-2 gap-2 self-end sm:col-span-2">
                <input placeholder={isAgentMode ? "Traveller's email (optional)" : "Customer email"} type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} className={input} aria-label="Customer email" />
                <input placeholder={isAgentMode ? "Traveller's phone (optional)" : "Customer phone"} value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} className={input} aria-label="Customer phone" />
              </span>
              <label className="text-xs text-stone-500">Starts<input type="date" value={draft.startDate} onChange={(event) => setStart(event.target.value)} className={`mt-1 w-full ${input}`} /></label>
              <label className="text-xs text-stone-500">Adults / children<span className="mt-1 flex gap-2"><input type="number" min={1} value={draft.adults} onChange={(event) => setDraft({ ...draft, adults: event.target.value })} className={`w-full ${input}`} aria-label="Adults" /><input type="number" min={0} value={draft.children} onChange={(event) => setDraft({ ...draft, children: event.target.value })} className={`w-full ${input}`} aria-label="Children" /></span></label>
              <label className="text-xs text-stone-500">Destination<Combobox freeText allowClear={false} value={draft.destination} onChange={(value) => setDraft({ ...draft, destination: value })} options={cityOptions.map((city) => ({ value: city.name, label: city.name, hint: city.hint }))} placeholder="e.g. Lucknow, Ayodhya" ariaLabel="destination" className="mt-1" /></label>
              <label className="text-xs text-stone-500 sm:col-span-3">Trip title<input placeholder="Filled from the route if left empty, e.g. Lucknow & Ayodhya 4N/5D" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`mt-1 w-full ${input}`} aria-label="Title" /></label>
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
          </>}

          {step === "route" && <>
            {editable && routeLib.routes.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="flex items-center gap-1 font-bold text-stone-800"><MapPin className="h-4 w-4 text-amber-700" /> Start from a ready route</p>
                <div className="flex flex-wrap items-end gap-2">
                  <Combobox value={routeId} onChange={setRouteId} options={routeOptions} placeholder="Search routes, e.g. Lucknow Ayodhya Varanasi" ariaLabel="route" className="min-w-64 flex-1" />
                  <button type="button" disabled={!pickedRoute} onClick={useRoute} className="rounded-xl bg-amber-500 px-3 py-2 font-bold text-stone-950 disabled:opacity-40">Use this route</button>
                </div>
                {pickedRoute && (
                  <div className="rounded-xl bg-white p-2 text-stone-600">
                    <p><strong className="text-stone-900">{chain(pickedRoute.legs)}</strong>{pickedRoute.own && <span className="ml-1 rounded-full bg-amber-100 px-2 text-[10px] font-black text-amber-800">YOUR ROUTE</span>}</p>
                    {pickedRoute.description && <p className="mt-0.5">{pickedRoute.description}</p>}
                    <ol className="mt-1 space-y-0.5">{pickedRoute.days.filter((day) => day.title).map((day) => <li key={day.dayNumber}>Day {day.dayNumber}: {day.title}{day.items?.length ? <span className="text-stone-400"> · {day.items.map((item) => item.name).join(", ")}</span> : null}</li>)}</ol>
                  </div>
                )}
                {routeMissing.length > 0 && (
                  <p className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 text-amber-900">
                    <span className="flex-1">{routeMissing.length} of the route's cars and activities aren't on your rate sheet yet: {routeMissing.map((item) => item.name).join(", ")}.</span>
                    <button type="button" onClick={addMissing} className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white">Add them at example prices</button>
                  </p>
                )}
              </div>
            )}
            <fieldset disabled={!editable} className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 p-3 text-xs">
              <span className="font-bold text-stone-700">Destinations</span>
              {(draft.legs || []).length === 0 && <span className="text-stone-500">Add the cities in order with the nights in each, e.g. Lucknow 2N → Ayodhya 2N. The days and one hotel stay per city are laid out for you.</span>}
              {(draft.legs || []).map((leg, index) => (
                <span key={index} className="flex items-center gap-1">
                  <Combobox freeText allowClear={false} value={leg.city} onChange={(value) => setDraft({ ...draft, legs: draft.legs.map((item, i) => (i === index ? { ...item, city: value } : item)) })} options={cityOptions.map((city) => ({ value: city.name, label: city.name, hint: city.hint }))} placeholder="City" ariaLabel={`leg-${index}-city`} className="w-40" />
                  <input type="number" min={0} max={60} value={leg.nights} onChange={(event) => setDraft({ ...draft, legs: draft.legs.map((item, i) => (i === index ? { ...item, nights: Number(event.target.value) } : item)) })} className={`${input} w-16 py-1.5`} aria-label={`Leg ${index + 1} nights`} />
                  <span className="text-stone-500">N</span>
                  <button type="button" onClick={() => setDraft({ ...draft, legs: draft.legs.filter((_, i) => i !== index) })} aria-label={`Remove leg ${index + 1}`} className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  {index < draft.legs.length - 1 && <span className="text-amber-700">→</span>}
                </span>
              ))}
              {(draft.legs || []).length < 20 && <button type="button" onClick={() => setDraft({ ...draft, legs: [...(draft.legs || []), { city: "", nights: 1 }] })} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-1.5 font-bold"><Plus className="h-3.5 w-3.5" /> {(draft.legs || []).length ? "Add city" : "Add first city"}</button>}
            </fieldset>
            {editable && routeStays.length > 0 && (
              <div className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 text-xs ${routeMatches ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <span className="flex-1">{routeMatches
                  ? `${routeStays.reduce((sum, stay) => sum + stay.nights, 0) + 1} days, one hotel stay per city. Pick each hotel below.`
                  : "The hotel stays don't follow the route yet."}</span>
                {!routeMatches && <button type="button" onClick={layOut} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-stone-950">Lay out days and hotels from the route</button>}
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
            {(draft.options.length >= 2 ? draft.options.map((option, index) => ({ number: index + 1, name: option.name })) : [{ number: 1, name: "" }]).map((option) => (
              <div key={option.number} className="space-y-2">
                {option.name && <p className="text-xs font-black text-stone-700">{option.name}</p>}
                {draft.lines.map((line, index) => (line.kind === "HOTEL" && (Number(line.option) || 1) === option.number ? { line, index } : null)).filter(Boolean)
                  .sort((a, b) => (Number(a.line.dayNumber) || 1) - (Number(b.line.dayNumber) || 1))
                  .map(({ line, index }) => <React.Fragment key={index}>{lineEditor(line, index)}</React.Fragment>)}
              </div>
            ))}
            {editable && <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-stone-500">{routeStays.length ? "Add another stay by hand:" : "No route? Add a stay by hand:"}</span>
              {itemButtons(1, ["HOTEL"])}
            </div>}
          </>}

          {step === "days" && <div className="space-y-2">
            {dayNumbers.map((dayNumber) => {
              const city = cityOfDay(draft.legs, dayNumber);
              const stays = draft.lines.filter((line) => line.kind === "HOTEL" && (Number(line.dayNumber) || 1) === dayNumber);
              return (
                <div key={dayNumber} className="space-y-2 rounded-2xl border border-stone-200 p-3">
                  <fieldset disabled={!editable} className="grid gap-2 text-xs sm:grid-cols-[10rem_1fr]">
                    <span className="flex items-center gap-1 self-center font-black text-amber-700">Day {dayNumber} · {dayDate(draft.startDate, dayNumber)}{city && <span className="font-semibold text-stone-500"> · {city}</span>}
                      {editable && dayNumbers.length > 1 && <button type="button" onClick={() => dropDay(dayNumber)} aria-label={`Remove day ${dayNumber}`} title="Remove this day" className="rounded p-1 text-stone-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </span>
                    <input placeholder="Day title, e.g. Ayodhya: Ram Mandir darshan" value={dayOf(dayNumber).title || ""} onChange={(event) => setDay(dayNumber, { title: event.target.value })} className={input} aria-label={`Day ${dayNumber} title`} />
                    <textarea rows={2} placeholder="What happens this day (on the PDF). Picking a car or activity fills this for you." value={dayOf(dayNumber).description || ""} onChange={(event) => setDay(dayNumber, { description: event.target.value })} className={`${input} sm:col-span-2`} aria-label={`Day ${dayNumber} description`} />
                  </fieldset>
                  {stays.map((line) => {
                    const hotel = hotels.find((item) => item.id === line.hotelId);
                    const optionName = draft.options.length >= 2 ? draft.options[(Number(line.option) || 1) - 1]?.name : "";
                    return (
                      <p key={`${line.option}-${line.dayNumber}-${line.hotelId}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
                        <Hotel className="h-3.5 w-3.5 text-amber-700" />
                        <span>{optionName && <strong>{optionName}: </strong>}Check in {hotel ? <strong>{hotel.name}</strong> : <em className="text-rose-600">hotel not picked</em>}{line.roomType ? ` · ${line.roomType}` : ""} · {line.nights} night{Number(line.nights) === 1 ? "" : "s"}</span>
                        {editable && <button type="button" onClick={() => setStep("route")} className="ml-auto font-bold text-amber-700 underline">Change</button>}
                      </p>
                    );
                  })}
                  {draft.lines.map((line, index) => (line.kind !== "HOTEL" && (Number(line.dayNumber) || 1) === dayNumber ? <React.Fragment key={index}>{lineEditor(line, index)}</React.Fragment> : null))}
                  {editable && <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-stone-500">Add to day {dayNumber}:</span>
                    {itemButtons(dayNumber, ["TRANSPORT", "ACTIVITY", "LISTING", "CUSTOM"])}
                    {dayNumber < lastDay && <button type="button" onClick={() => setDraft({ ...draft, ...insertDayAfter(draft, dayNumber) })} title="Later days move one day later" className="ml-auto flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-[11px] font-bold text-stone-500"><CalendarPlus className="h-3.5 w-3.5" /> Insert a day after</button>}
                  </div>}
                </div>
              );
            })}
            {editable && <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => setDay(lastDay + 1, {})} className="flex items-center gap-1 rounded-xl border border-dashed border-stone-300 px-3 py-2 font-bold"><CalendarPlus className="h-4 w-4" /> Add day {lastDay + 1}</button>
              <label className="flex items-center gap-1 text-stone-500">or trip length
                <select value={lastDay} onChange={(event) => setDraft({ ...draft, days: setTripLength(draft.days || [], Number(event.target.value)) })} className={`${input} py-1.5 text-xs`} aria-label="Trip length in days">
                  {Array.from({ length: Math.max(0, 30 - shortestTrip + 1) }, (_, i) => shortestTrip + i).map((days) => <option key={days} value={days}>{days} day{days === 1 ? "" : "s"} / {days - 1} night{days === 2 ? "" : "s"}</option>)}
                </select>
              </label>
            </div>}
          </div>}

          {step === "price" && <>
            <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-stone-500">Markup on your costs (%)<input type="number" min={0} max={200} step="0.5" value={draft.markupPct} onChange={(event) => setDraft({ ...draft, markupPct: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
              <label className="text-xs text-stone-500">Valid until<input type="date" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
              <div className="flex flex-wrap items-center gap-2 self-end text-xs">
                <button type="button" disabled={!terms.inclusions.length && !terms.exclusions.length} title={terms.inclusions.length || terms.exclusions.length ? "" : "Save your lists as standard first"} onClick={() => setDraft({ ...draft, inclusions: mergeItems(draft.inclusions, terms.inclusions), exclusions: mergeItems(draft.exclusions, terms.exclusions) })} className="rounded-xl border border-stone-300 px-3 py-2 font-bold disabled:opacity-40">Use my standard lists</button>
                <button type="button" disabled={!cleanItems(draft.inclusions).length && !cleanItems(draft.exclusions).length} onClick={() => run(async () => { const data = await request(`${base}/quotation-terms`, { method: "PUT", body: JSON.stringify({ inclusions: cleanItems(draft.inclusions), exclusions: cleanItems(draft.exclusions) }) }); setTerms(data.terms); }, "Saved as your standard lists. Every new quotation starts with them.")} className="rounded-xl border border-stone-300 px-3 py-2 font-bold disabled:opacity-40">Save as my standard lists</button>
              </div>
              <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
                <TermsList label="What's included" items={draft.inclusions} onChange={(inclusions) => setDraft({ ...draft, inclusions })} placeholder={"Daily breakfast\nAirport pickup and drop"}
                  actions={<button type="button" onClick={() => setDraft({ ...draft, inclusions: mergeItems(draft.inclusions, tripInclusions(draft, { hotels, cabTypes })) })} className="font-bold text-amber-700 underline">Add from this trip</button>} />
                <TermsList label="Not included" items={draft.exclusions} onChange={(exclusions) => setDraft({ ...draft, exclusions })} placeholder={"Airfare and train fare\nMonument entry tickets\nPersonal expenses"} />
              </div>
              <textarea placeholder="Other notes for the customer (payment terms, cancellation)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} className={`${input} sm:col-span-3`} aria-label="Notes" />
            </fieldset>
            {!saved && <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">Save to price the package. You'll see your costs, markup and what the customer pays.</p>}
          {saved && saved.options.length > 0 && !saved.selectedOption && (
            <div className="overflow-x-auto rounded-2xl border border-stone-200 p-3">
              <table className="w-full text-right text-xs">
                <thead className="text-[10px] uppercase text-stone-400"><tr><th className="py-1 text-left">Option</th><th>Your costs</th><th>Markup</th><th>Your listings</th><th>GST</th>{saved.trade && <th className="text-indigo-700">Agent net</th>}<th className="text-stone-600">Customer pays</th><th>Per person</th></tr></thead>
                <tbody className="divide-y divide-stone-100 font-mono">
                  {saved.options.map((option) => (
                    <tr key={option.number}>
                      <td className="py-1.5 text-left font-sans font-bold">{option.name}</td><td>{inr(option.totals.costInr)}</td><td>{inr(option.totals.markupInr)}</td><td>{inr(option.totals.listingsInr)}</td><td>{inr(option.totals.gstInr)}</td>
                      {saved.trade && <td className="text-indigo-700">{inr(saved.trade.options.find((item) => item.number === option.number)?.netInr)}</td>}
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

          {saved?.trade && !(saved.options.length > 0 && !saved.selectedOption) && (
            <div className="grid gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-950 sm:grid-cols-3" role="group" aria-label="Agent's price">
              <p className="text-xs">Guest pays (retail)<strong className="block font-mono text-lg">{inr(saved.totals.totalInr)}</strong></p>
              <p className="text-xs">{saved.agentName || "The agent"} pays you, at {saved.trade.markupPct}% markup<strong className="block font-mono text-lg">{inr(saved.trade.netInr)}</strong></p>
              <p className="text-xs">Agent's margin<strong className="block font-mono text-lg text-emerald-700">{inr(saved.trade.marginInr)}</strong></p>
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
            {saved?.agentId && saved.status !== "DECLINED" && <button onClick={sendToAgent} className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white"><Send className="h-4 w-4" /> Send to agent</button>}
            {saved?.agentId && <button onClick={() => downloadPdf("AGENT")} className="flex items-center gap-1 rounded-xl border border-indigo-300 px-4 py-2.5 text-xs font-bold text-indigo-800"><Download className="h-4 w-4" /> Agent PDF</button>}
            {saved && <button onClick={() => downloadPdf("BRAND")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" /> {saved.agentId ? "Branded PDF" : "PDF"}</button>}
            {saved && saved.status !== "DECLINED" && (!saved.agentId || saved.customerEmail || saved.customerPhone) && <button onClick={send} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Send className="h-4 w-4" /> {saved.agentId ? "Send to traveller" : "Send to customer"}</button>}
            {saved && <button type="button" onClick={saveAsRoute} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><BookmarkPlus className="h-4 w-4" /> Save as my route</button>}
            {saved && <span className="flex items-center gap-1">
              <input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} className={`${input} py-2 text-xs`} aria-label="Start date for the copy" />
              <button onClick={() => copyFrom(saved.id, { startDate: copyDate }, "Copied as a new draft for the new dates. Change the customer and save.").then((data) => { if (data) setStep("trip"); })} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Copy className="h-4 w-4" /> Copy to this date</button>
            </span>}
            {saved?.status === "SENT" && <>
              {saved.options.length > 0 && <select value={acceptOption} onChange={(event) => setAcceptOption(Number(event.target.value))} className={`${input} py-2 text-xs`} aria-label="Option the customer chose">{saved.options.map((option) => <option key={option.number} value={option.number}>{option.name}</option>)}</select>}
              <button onClick={() => act("/status", saved.options.length ? { status: "ACCEPTED", option: acceptOption } : { status: "ACCEPTED" }, "Accepted. Book the listings below and record payments.")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">{saved.agentId ? "Agent confirmed" : "Customer accepted"}</button>
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
          </>}

          <div className="flex items-center gap-2 border-t border-stone-100 pt-4">
            {stepIndex > 0 && <button type="button" onClick={() => goTo(steps[stepIndex - 1].key)} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><ArrowLeft className="h-4 w-4" /> {steps[stepIndex - 1].label}</button>}
            {editable && step !== "price" && <button type="button" onClick={save} className="rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold">Save draft</button>}
            {stepIndex < steps.length - 1 && <button type="button" onClick={() => goTo(steps[stepIndex + 1].key)} className="ml-auto flex items-center gap-1 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white">{steps[stepIndex + 1].label} <ArrowRight className="h-4 w-4" /></button>}
          </div>
        </div>
      )}
    </section>
  );
}

// A list typed one item per line; blank lines are dropped when saved.
function TermsList({ label, items = [], onChange, placeholder, actions = null }) {
  return (
    <label className="text-xs text-stone-500">
      <span className="flex items-center justify-between gap-2">{label} <span className="text-[10px]">one per line</span></span>
      <textarea rows={5} value={items.join("\n")} onChange={(event) => onChange(event.target.value.split("\n"))} placeholder={placeholder} aria-label={label} className={`mt-1 w-full ${input}`} />
      {actions && <span className="mt-1 block">{actions}</span>}
    </label>
  );
}

// The builder's steps across the top: done ones ticked, each one open at any time.
function Stepper({ steps, step, onPick }) {
  return (
    <ol className="grid gap-1 rounded-2xl bg-stone-100 p-1 text-xs sm:grid-cols-4">
      {steps.map((item, index) => (
        <li key={item.key}>
          <button type="button" onClick={() => onPick(item.key)} aria-current={index === step ? "step" : undefined} title={item.missing.length ? `Still needs ${item.missing.join(", ")}` : "Done"}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-bold ${index === step ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>
            {item.missing.length ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 text-[10px]">{index + 1}</span> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
            <span className="min-w-0"><span className="block truncate">{item.label}</span>{index === step && item.missing.length > 0 && <span className="block truncate text-[10px] font-semibold text-amber-700">Needs {item.missing[0]}</span>}</span>
          </button>
        </li>
      ))}
    </ol>
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
