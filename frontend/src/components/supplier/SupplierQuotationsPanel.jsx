import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, Hotel, MessageCircle, Package, Plus, Send, Trash2 } from "lucide-react";
import { authHeaders } from "../../lib/api.js";
import SupplierHotelRatesPanel, { MEAL_PLAN_LABELS } from "./SupplierHotelRatesPanel.jsx";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const STATUS_STYLES = { DRAFT: "bg-stone-100 text-stone-700", SENT: "bg-sky-100 text-sky-800", ACCEPTED: "bg-emerald-100 text-emerald-800", DECLINED: "bg-rose-100 text-rose-800" };
const NEW = () => ({ title: "", customerName: "", customerEmail: "", customerPhone: "", agentId: "", startDate: today(), adults: 2, children: 0, markupPct: 15, notes: "", validUntil: "", lines: [] });

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

// What the server needs for each line; prices are always worked out on the server.
function linePayload(line) {
  const base = { kind: line.kind, dayNumber: Number(line.dayNumber) || 1, title: line.title || (line.kind === "HOTEL" ? "Stay" : "Item"), description: line.description || null };
  if (line.kind === "HOTEL") return { ...base, hotelId: line.hotelId, roomType: line.roomType, mealPlan: line.mealPlan, checkIn: line.checkIn || line.date, nights: Number(line.nights) || 1, rooms: Number(line.rooms) || 1, extraAdults: Number(line.extraAdults) || 0, children: Number(line.children) || 0 };
  if (line.kind === "LISTING") return { ...base, productId: line.productId, productOptionId: line.productOptionId || null, date: line.date, pickupTime: line.pickupTime || null, adults: Number(line.adults) || 1, children: Number(line.children) || 0 };
  return { ...base, date: line.date || null, amountInr: Number(line.amountInr) || 0 };
}

/**
 * Package quotations (ADR 040): hotels from the rate sheet, the supplier's own
 * listings and custom lines, day by day. The server prices every line; the
 * customer's PDF shows one package price. Once accepted, listing lines are
 * booked one click each and payments are recorded against the package.
 */
export default function SupplierQuotationsPanel({ supplierId, products = [] }) {
  const base = `/api/suppliers/${supplierId}`;
  const [tab, setTab] = useState("quotations");
  const [list, setList] = useState([]);
  const [hotels, setHotels] = useState([]);
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
    request(`${base}/agents`).then((data) => setAgents((data.agents || []).filter((agent) => agent.status === "ACTIVE"))).catch(() => {});
  }, [base, loadList]);

  const open = (quotation) => {
    setSaved(quotation); setShared(null); setNotice(""); setError("");
    setDraft({ ...quotation, customerEmail: quotation.customerEmail || "", customerPhone: quotation.customerPhone || "", agentId: quotation.agentId || "", notes: quotation.notes || "", validUntil: quotation.validUntil || "",
      lines: quotation.lines.map((line) => ({ ...line, checkIn: line.kind === "HOTEL" ? line.date : undefined })) });
  };
  const run = async (action, message) => {
    setError(""); setNotice("");
    try { const result = await action(); if (message) setNotice(message); loadList(); return result; } catch (err) { setError(err.message); return null; }
  };

  const save = () => run(async () => {
    const body = { ...draft, customerEmail: draft.customerEmail || null, customerPhone: draft.customerPhone || null, agentId: draft.agentId || null, notes: draft.notes || null, validUntil: draft.validUntil || null,
      adults: Number(draft.adults), children: Number(draft.children), markupPct: Number(draft.markupPct), lines: draft.lines.map(linePayload) };
    for (const key of ["id", "ref", "status", "totals", "payments", "sentAt", "acceptedAt", "createdAt", "updatedAt"]) delete body[key];
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

  const setLine = (index, patch) => setDraft({ ...draft, lines: draft.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const addLine = (kind) => setDraft({ ...draft, lines: [...draft.lines, { kind, dayNumber: 1, title: kind === "CUSTOM" ? "" : kind === "HOTEL" ? "Stay" : "", mealPlan: "CP", nights: 1, rooms: 1, adults: draft.adults, children: draft.children, date: draft.startDate, checkIn: draft.startDate }] });
  const editable = !saved || ["DRAFT", "SENT"].includes(saved.status);

  if (tab === "hotels") {
    return (
      <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <Tabs tab={tab} setTab={setTab} />
        <SupplierHotelRatesPanel supplierId={supplierId} onChange={setHotels} />
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
                  <span className="min-w-0"><strong className="block truncate text-sm text-stone-900">{row.title}</strong><span className="text-xs text-stone-500">{row.ref} · {row.customerName} · from {row.startDate}</span></span>
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
            <input required placeholder="Trip title, e.g. Goa Beach Escape" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${input} sm:col-span-3`} aria-label="Title" />
            <input placeholder="Customer name" value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} className={input} aria-label="Customer name" />
            <input placeholder="Customer email" type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} className={input} aria-label="Customer email" />
            <input placeholder="Customer phone" value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} className={input} aria-label="Customer phone" />
            <label className="text-xs text-stone-500">Starts<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
            <label className="text-xs text-stone-500">Adults / children<span className="mt-1 flex gap-2"><input type="number" min={1} value={draft.adults} onChange={(event) => setDraft({ ...draft, adults: event.target.value })} className={`w-full ${input}`} aria-label="Adults" /><input type="number" min={0} value={draft.children} onChange={(event) => setDraft({ ...draft, children: event.target.value })} className={`w-full ${input}`} aria-label="Children" /></span></label>
            <label className="text-xs text-stone-500">Markup on hotels and extras (%)<input type="number" min={0} max={200} step="0.5" value={draft.markupPct} onChange={(event) => setDraft({ ...draft, markupPct: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
            <label className="text-xs text-stone-500">For agent (optional)<select value={draft.agentId} onChange={(event) => setDraft({ ...draft, agentId: event.target.value })} className={`mt-1 w-full ${input}`}><option value="">Direct customer</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
            <label className="text-xs text-stone-500">Valid until<input type="date" value={draft.validUntil} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })} className={`mt-1 w-full ${input}`} /></label>
            <textarea placeholder="Notes for the customer (inclusions, exclusions, terms)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} className={`${input} sm:col-span-3`} aria-label="Notes" />
          </fieldset>

          <div className="space-y-2">
            {draft.lines.map((line, index) => {
              const hotel = hotels.find((item) => item.id === line.hotelId);
              const rooms = hotel ? [...new Set(hotel.rates.map((rate) => rate.roomType))] : [];
              return (
                <fieldset key={index} disabled={!editable} className="flex flex-wrap items-end gap-2 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3 text-xs">
                  <label>Day<input type="number" min={1} value={line.dayNumber} onChange={(event) => setLine(index, { dayNumber: event.target.value })} className={`mt-1 block w-16 ${input}`} /></label>
                  {line.kind === "HOTEL" && <>
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
            {editable && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => addLine("HOTEL")} disabled={!hotels.length} title={hotels.length ? "" : "Add hotels under Hotel rate sheet first"} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-40"><Hotel className="h-4 w-4" /> Hotel nights</button>
              <button type="button" onClick={() => addLine("LISTING")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"><Package className="h-4 w-4" /> Your listing</button>
              <button type="button" onClick={() => addLine("CUSTOM")} className="flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4" /> Custom item</button>
            </div>}
          </div>

          {saved && (
            <div className="grid gap-2 rounded-2xl border border-stone-200 p-4 text-sm sm:grid-cols-2">
              <div className="space-y-1 text-xs text-stone-600">
                <p className="text-[10px] font-black uppercase text-stone-400">Only you see this</p>
                <p>Hotels and extras (cost) <span className="float-right font-mono">{inr(saved.totals.costInr)}</span></p>
                <p>Markup {saved.markupPct}% <span className="float-right font-mono">{inr(saved.totals.markupInr)}</span></p>
                <p>Your listings <span className="float-right font-mono">{inr(saved.totals.listingsInr)}</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-stone-400">The customer sees</p>
                <p>Package price <span className="float-right font-mono">{inr(saved.totals.subtotalInr)}</span></p>
                {saved.totals.gstInr > 0 && <p>GST {saved.totals.gstPct}% <span className="float-right font-mono">{inr(saved.totals.gstInr)}</span></p>}
                <p className="text-lg font-black">Total <span className="float-right font-mono">{inr(saved.totals.totalInr)}</span></p>
                {saved.status === "ACCEPTED" && <p className="text-xs text-stone-600">Paid {inr(saved.totals.paidInr)} · due <strong>{inr(saved.totals.dueInr)}</strong></p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {editable && <button onClick={save} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950">Save and price</button>}
            {saved && <button onClick={downloadPdf} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" /> PDF</button>}
            {saved && saved.status !== "DECLINED" && <button onClick={send} className="flex items-center gap-1 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><Send className="h-4 w-4" /> Send to customer</button>}
            {saved?.status === "SENT" && <>
              <button onClick={() => act("/status", { status: "ACCEPTED" }, "Accepted. Book the listings below and record payments.")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white">Customer accepted</button>
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
        {[["quotations", "Quotations"], ["hotels", "Hotel rate sheet"]].map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={`rounded-lg px-3 py-1.5 ${tab === value ? "bg-white shadow-sm" : "text-stone-500"}`}>{label}</button>
        ))}
      </div>
    </div>
  );
}
