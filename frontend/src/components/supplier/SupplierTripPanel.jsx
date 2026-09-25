import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Mail, MessageCircle, Send, TriangleAlert } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const input = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm";
const STATUS_LABELS = { TO_BOOK: "To book", REQUESTED: "Requested", CONFIRMED: "Confirmed", CANCELLED: "Cancelled" };
const STATUS_STYLES = { TO_BOOK: "bg-stone-100 text-stone-700", REQUESTED: "bg-sky-100 text-sky-800", CONFIRMED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-rose-100 text-rose-800" };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * The trip file of an accepted quotation (ADR 045): each hotel, car, activity
 * and custom line's booking status, vendor, confirmation and cost; hotel
 * booking requests by email; drivers for cars; vendor payments; and the final
 * itinerary once everything is confirmed.
 */
export default function SupplierTripPanel({ supplierId, quotation, hotels = [], onChange }) {
  const base = `/api/suppliers/${supplierId}/quotations/${quotation.id}`;
  const [fleet, setFleet] = useState([]);
  const [edits, setEdits] = useState({});
  const [payments, setPayments] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shared, setShared] = useState(null);
  const trip = quotation.trip;
  const lines = quotation.lines.filter((line) => line.arranged);

  useEffect(() => {
    request(`/api/suppliers/${supplierId}/drivers`).then((data) => setFleet(data.drivers || [])).catch(() => {});
  }, [supplierId]);

  const run = async (action, message) => {
    setError(""); setNotice("");
    try {
      const data = await action();
      if (data?.quotation) onChange(data.quotation);
      if (message) setNotice(typeof message === "function" ? message(data) : message);
      return data;
    } catch (err) { setError(err.message); return null; }
  };
  const edit = (line) => edits[line.id] || { status: line.arrangementStatus, vendorName: line.vendorName || "", confirmationRef: line.confirmationRef || "", payableInr: line.payableInr, driverIds: line.driverIds };
  const setEdit = (line, patch) => setEdits({ ...edits, [line.id]: { ...edit(line), ...patch } });
  const save = (line) => {
    const change = edit(line);
    const body = { status: change.status, vendorName: change.vendorName || null, confirmationRef: change.confirmationRef || null, payableInr: Number(change.payableInr) };
    if (line.kind === "TRANSPORT") body.driverIds = change.driverIds.filter(Boolean);
    return run(async () => {
      const data = await request(`${base}/lines/${line.id}/arrangement`, { method: "PATCH", body: JSON.stringify(body) });
      setEdits({ ...edits, [line.id]: undefined });
      return data;
    }, `${line.title} saved.`);
  };
  const emailHotel = (line) => run(() => request(`${base}/lines/${line.id}/request`, { method: "POST", body: "{}" }),
    (data) => (data.email.status === "SENT" ? "Booking request emailed to the hotel." : `The email wasn't sent${data.email.error ? `: ${data.email.error}` : ""}.`));
  const pay = (line) => {
    const draft = payments[line.id] || {};
    return run(async () => {
      const data = await request(`${base}/lines/${line.id}/vendor-payments`, { method: "POST", body: JSON.stringify({ mode: draft.mode || "BANK", amount_inr: Number(draft.amount), reference: draft.reference || null }) });
      setPayments({ ...payments, [line.id]: {} });
      return data;
    }, "Vendor payment recorded.");
  };
  const sendItinerary = () => run(async () => {
    const data = await request(`${base}/itinerary/send`, { method: "POST", body: "{}" });
    setShared(data);
    return data;
  }, (data) => (data.email.status === "SENT" ? `Itinerary emailed to ${quotation.customerEmail} with the PDF.` : "Itinerary link ready. Email wasn't sent" + (data.email.error ? `: ${data.email.error}` : ".")));
  const downloadItinerary = async () => {
    try {
      const response = await fetch(`${base}/itinerary`, { headers: authHeaders() });
      if (!response.ok) throw new Error("The itinerary couldn't be made");
      const url = URL.createObjectURL(await response.blob());
      Object.assign(document.createElement("a"), { href: url, download: `${quotation.ref}-itinerary.pdf` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  };
  const lineName = (line) => (line.kind === "HOTEL" ? hotels.find((hotel) => hotel.id === line.hotelId)?.name || line.title : line.title);

  return (
    <section aria-label="Trip file" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-stone-900">Trip file</h3>
        <p className="text-xs text-stone-600"><strong>{trip.confirmed}</strong> of {trip.items - trip.cancelled} confirmed · {trip.requested} requested · {trip.toBook} to book{trip.unbookedListings ? ` · ${trip.unbookedListings} listing${trip.unbookedListings === 1 ? "" : "s"} to book` : ""}</p>
      </div>
      {trip.alerts.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1 font-bold"><TriangleAlert className="h-4 w-4" /> Travel is close</p>
          <ul className="mt-1 list-disc pl-5">{trip.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>
        </div>
      )}
      {notice && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

      <ul className="space-y-2">
        {lines.map((line) => {
          const change = edit(line);
          const draft = payments[line.id] || {};
          const due = Math.max(0, line.payableInr - line.vendorPaidInr);
          return (
            <li key={line.id} aria-label={`Trip item ${lineName(line)}`} className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS_STYLES[line.arrangementStatus]}`}>{STATUS_LABELS[line.arrangementStatus]}</span>
                <strong className="text-sm text-stone-900">{lineName(line)}</strong>
                <span className="text-stone-500">Day {line.dayNumber}{line.date ? ` · ${line.date}` : ""}{line.kind === "HOTEL" ? ` · ${line.rooms} × ${line.roomType}, ${line.nights} night${line.nights === 1 ? "" : "s"}` : ""}</span>
                {line.kind === "HOTEL" && !["CONFIRMED", "CANCELLED"].includes(line.arrangementStatus) && (
                  <button type="button" onClick={() => emailHotel(line)} className="ml-auto flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 font-bold"><Mail className="h-3.5 w-3.5" /> Email booking request</button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label>Status<select value={change.status} onChange={(event) => setEdit(line, { status: event.target.value })} className={`mt-1 block ${input}`}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Booked with<input value={change.vendorName} onChange={(event) => setEdit(line, { vendorName: event.target.value })} className={`mt-1 block w-36 ${input}`} /></label>
                <label>Confirmation no.<input value={change.confirmationRef} onChange={(event) => setEdit(line, { confirmationRef: event.target.value })} className={`mt-1 block w-32 ${input}`} /></label>
                <label>You owe (₹)<input type="number" min={0} value={change.payableInr} onChange={(event) => setEdit(line, { payableInr: event.target.value })} className={`mt-1 block w-28 ${input}`} /></label>
                {line.kind === "TRANSPORT" && Array.from({ length: line.vehicles || 1 }, (_, slot) => (
                  <label key={slot}>Driver {line.vehicles > 1 ? slot + 1 : ""}<select value={change.driverIds[slot] || ""} onChange={(event) => { const ids = [...change.driverIds]; ids[slot] = event.target.value; setEdit(line, { driverIds: ids }); }} className={`mt-1 block max-w-48 ${input}`}>
                    <option value="">Not assigned</option>
                    {fleet.map((driver) => <option key={driver.id} value={driver.id}>{driver.driver_name} · {driver.vehicle_number}</option>)}
                  </select></label>
                ))}
                <button type="button" onClick={() => save(line)} className="rounded-xl bg-stone-900 px-3 py-2 font-bold text-white">Save</button>
              </div>
              {line.arrangementStatus !== "CANCELLED" && (
                <div className="flex flex-wrap items-center gap-2 text-stone-600">
                  <span>Paid {inr(line.vendorPaidInr)} of {inr(line.payableInr)}{due > 0 ? ` · ${inr(due)} due` : ""}</span>
                  {due > 0 && <>
                    <input type="number" min={1} max={due} placeholder="Amount ₹" value={draft.amount || ""} onChange={(event) => setPayments({ ...payments, [line.id]: { ...draft, amount: event.target.value } })} className={`${input} w-28 py-1.5`} aria-label={`Pay vendor for ${lineName(line)}`} />
                    <select value={draft.mode || "BANK"} onChange={(event) => setPayments({ ...payments, [line.id]: { ...draft, mode: event.target.value } })} className={`${input} py-1.5`} aria-label="Payment mode">{["BANK", "UPI", "CASH", "CARD"].map((mode) => <option key={mode}>{mode}</option>)}</select>
                    <button type="button" onClick={() => pay(line)} disabled={!draft.amount} className="rounded-lg border border-stone-300 px-2 py-1.5 font-bold disabled:opacity-40">Record payment</button>
                  </>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-xs sm:grid-cols-3">
        <p>Customer paid <strong className="block font-mono text-sm">{inr(trip.money.customerPaidInr)} of {inr(trip.money.customerTotalInr)}</strong></p>
        <p>You owe vendors <strong className="block font-mono text-sm">{inr(trip.money.vendorDueInr)} of {inr(trip.money.vendorPayableInr)}</strong></p>
        <p>Your margin before GST <strong className="block font-mono text-sm">{inr(trip.money.marginInr)}</strong></p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadItinerary} className="flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" /> Itinerary PDF</button>
        <button type="button" onClick={sendItinerary} className="flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white"><Send className="h-4 w-4" /> Send final itinerary</button>
      </div>
      {shared && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs">
          <p className="break-all font-mono text-sky-900">{shared.shareUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(shared.shareUrl).then(() => setNotice("Link copied."))} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 font-bold">Copy link</button>
            <a href={`https://wa.me/${String(quotation.customerPhone || "").replace(/\D/g, "")}?text=${encodeURIComponent(shared.whatsappText)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
          </div>
        </div>
      )}
    </section>
  );
}
