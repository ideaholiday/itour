import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Mail, MessageCircle, Minus, Plus, Printer, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

// Supplier-direct booking (ADR 034): a guest at the counter, a phone call or a
// manual entry. Seats come from the same inventory the marketplace sells; the
// server prices the booking and the supplier records what it collected.

const SOURCES = [["WALK_IN", "Walk-in"], ["PHONE", "Phone"], ["MANUAL", "Manual"]];
const MODES = [["CASH", "Cash"], ["UPI", "UPI"], ["CARD", "Card"], ["BANK", "Bank transfer"], ["LATER", "Pay later"]];
const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const requestId = () => `counter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function call(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2">
      <span className="text-sm font-semibold text-stone-800">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
        <span className="w-6 text-center font-bold tabular-nums">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export default function WalkInBookingDrawer({ supplierId, onClose, onCreated }) {
  const [source, setSource] = useState("WALK_IN");
  const [date, setDate] = useState(today());
  const [products, setProducts] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [guest, setGuest] = useState({ name: "", phone: "", email: "" });
  const [discount, setDiscount] = useState(0);
  const [mode, setMode] = useState("CASH");
  const [paid, setPaid] = useState(null);
  const [reference, setReference] = useState("");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [clientRequestId, setClientRequestId] = useState(requestId);
  const [sendStatus, setSendStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    setError("");
    call(`/api/suppliers/${supplierId}/availability?date=${date}`)
      .then((data) => { if (!cancelled) setProducts(data.products || []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [supplierId, date]);

  const party = adults + children;
  const seatsLeft = slot?.vacancies ?? 0;

  // The server is the only price: re-quote whenever the party or discount changes.
  useEffect(() => {
    if (!slot) { setQuote(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      call(`/api/suppliers/${supplierId}/bookings/quote`, {
        product_id: slot.productId, product_option_id: slot.optionId, activity_date: date, pickup_time: slot.localTime,
        adults, children, discount_inr: Number(discount) || 0,
      }).then((data) => { if (!cancelled) { setQuote(data.quote); setError(""); } })
        .catch((err) => { if (!cancelled) { setQuote(null); setError(err.message); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [supplierId, slot, date, adults, children, discount]);

  const amountDue = quote?.amountDueInr ?? 0;
  const paidNow = mode === "LATER" ? 0 : Math.min(amountDue, paid ?? amountDue);

  const departures = useMemo(() => products.filter((product) => product.departures?.length), [products]);

  const pick = (product, departure) => {
    setSlot({ ...departure, productId: product.productId, optionId: product.optionId, title: product.title, optionName: product.optionName });
    setAdults(1);
    setChildren(0);
    setPaid(null);
  };

  const confirm = async (event) => {
    event.preventDefault();
    if (!slot || !quote) return;
    setSaving(true);
    setError("");
    try {
      const data = await call(`/api/suppliers/${supplierId}/bookings`, {
        source, product_id: slot.productId, product_option_id: slot.optionId, activity_date: date, pickup_time: slot.localTime,
        adults, children, traveler_name: guest.name, traveler_phone: guest.phone, traveler_email: guest.email || null,
        discount_inr: Number(discount) || 0,
        payments: paidNow > 0 ? [{ mode, amount_inr: paidNow, reference: reference || null }] : [],
        client_request_id: clientRequestId,
      });
      setResult(data);
      onCreated?.(data.booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendByEmail = async () => {
    setSendStatus("Sending…");
    try {
      await call(`/api/suppliers/${supplierId}/bookings/${result.booking.id}/notifications/resend`, { eventType: "BOOKING_CONFIRMED" });
      setSendStatus("Sent to the guest.");
    } catch (err) {
      setSendStatus(err.message);
    }
  };

  const startAnother = () => {
    setResult(null);
    setSlot(null);
    setGuest({ name: "", phone: "", email: "" });
    setDiscount(0);
    setMode("CASH");
    setPaid(null);
    setReference("");
    setSendStatus("");
    setClientRequestId(requestId());
    call(`/api/suppliers/${supplierId}/availability?date=${date}`).then((data) => setProducts(data.products || [])).catch(() => {});
  };

  const booking = result?.booking;
  const whatsappText = booking
    ? encodeURIComponent(`Hello ${booking.traveler_name}, your booking ${booking.ref} for ${slot?.title} on ${booking.activity_date} at ${booking.pickup_time} is confirmed. Voucher: ${result.documents?.voucherUrl}`)
    : "";

  // Portalled to <body>: the sticky header's backdrop blur would otherwise
  // become the containing block and clip this fixed overlay to the header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/40" role="dialog" aria-modal="true" aria-labelledby="walkin-title" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 id="walkin-title" className="text-lg font-black text-stone-900">New direct booking</h2>
            <p className="text-xs text-stone-500">Your own customer · no commission · seats come from your live inventory</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
        </div>

        {booking ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-sm font-semibold text-emerald-900">Booking confirmed</p>
              <p className="font-mono text-2xl font-black text-stone-900">{booking.ref}</p>
              <p className="text-sm text-stone-600">{slot?.title} · {booking.activity_date} · {booking.pickup_time} · {booking.adults + booking.children} guests</p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl border border-stone-200 p-3"><dt className="text-xs text-stone-500">Total</dt><dd className="font-bold">{inr(booking.amount_inr)}</dd></div>
              <div className="rounded-xl border border-stone-200 p-3"><dt className="text-xs text-stone-500">Paid</dt><dd className="font-bold">{inr(booking.amount_inr - booking.balance_due_inr)}</dd></div>
              <div className={`rounded-xl border p-3 ${booking.balance_due_inr > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200"}`}><dt className="text-xs text-stone-500">Balance due</dt><dd className="font-bold">{inr(booking.balance_due_inr)}</dd></div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <a href={result.documents?.voucherUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white"><Printer className="h-4 w-4" />Print voucher</a>
              <a href={`https://wa.me/${String(booking.traveler_phone || "").replace(/\D/g, "")}?text=${whatsappText}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a>
              {booking.traveler_email && <button onClick={sendByEmail} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-3 text-sm font-bold text-stone-800"><Mail className="h-4 w-4" />Email voucher to {booking.traveler_email}</button>}
            </div>
            {sendStatus && <p className="text-center text-sm text-stone-600" role="status">{sendStatus}</p>}
            <button onClick={startAnother} className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-stone-950">+ Next booking</button>
          </div>
        ) : (
          <form onSubmit={confirm} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="flex gap-1 rounded-xl bg-stone-100 p-1" role="radiogroup" aria-label="Booking source">
                {SOURCES.map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={source === value} onClick={() => setSource(value)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${source === value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}>{label}</button>
                ))}
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Date</span>
                <input type="date" value={date} min={today()} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5" required />
              </label>

              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-wide text-stone-500">Departure · live seats</legend>
                {loadingSlots ? <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading departures…</p>
                  : !departures.length ? <p className="mt-2 text-sm text-stone-500">No seat-inventory departures on this date. Set seats and times under Listings → Seats &amp; schedule.</p>
                  : <div className="mt-2 space-y-3">{departures.map((product) => (
                    <div key={product.optionId}>
                      <p className="text-sm font-bold text-stone-800">{product.title}{product.optionName ? <span className="font-normal text-stone-500"> · {product.optionName}</span> : null}</p>
                      <div className="mt-1 flex flex-wrap gap-2">{product.departures.map((departure) => {
                        const open = departure.status === "AVAILABLE" && departure.vacancies > 0;
                        const chosen = slot?.optionId === product.optionId && slot?.localTime === departure.localTime;
                        return (
                          <button key={departure.localTime} type="button" disabled={!open} onClick={() => pick(product, departure)} className={`rounded-xl border px-3 py-2 text-left text-sm ${chosen ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400" : "border-stone-200"} disabled:cursor-not-allowed disabled:opacity-50`}>
                            <span className="block font-bold">{departure.localTime}</span>
                            <span className="block text-xs text-stone-500">{open ? `${departure.vacancies} of ${departure.capacity} left` : departure.status === "SOLD_OUT" || departure.vacancies === 0 ? "Sold out" : "Closed"}</span>
                          </button>
                        );
                      })}</div>
                    </div>
                  ))}</div>}
              </fieldset>

              {slot && <>
                <div className="space-y-2">
                  <Stepper label="Adults" value={adults} min={1} max={Math.max(1, seatsLeft - children)} onChange={setAdults} />
                  <Stepper label="Children" value={children} min={0} max={Math.max(0, seatsLeft - adults)} onChange={setChildren} />
                  <p className="text-xs text-stone-500">{seatsLeft - party} seats left after this booking.</p>
                </div>

                <div className="grid gap-3">
                  <input value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} placeholder="Guest name" autoComplete="off" className="rounded-xl border border-stone-200 px-3 py-2.5" required minLength={2} />
                  <input value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: event.target.value })} placeholder="Mobile number, e.g. +91 98123 45678" inputMode="tel" autoComplete="off" className="rounded-xl border border-stone-200 px-3 py-2.5" required />
                  <input value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} placeholder="Email (optional)" type="email" autoComplete="off" className="rounded-xl border border-stone-200 px-3 py-2.5" />
                </div>

                <div className="rounded-2xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between text-sm"><span className="text-stone-600">Price incl. taxes</span><span className="font-bold tabular-nums">{quote ? inr(quote.totalAmount) : "…"}</span></div>
                  <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-stone-600">Your discount (₹)</span>
                    <input type="number" min={0} max={quote?.totalAmount || 0} value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} className="w-28 rounded-lg border border-stone-200 px-2 py-1 text-right" />
                  </label>
                  <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2"><span className="font-bold">Guest pays</span><span className="text-xl font-black tabular-nums">{quote ? inr(amountDue) : "…"}</span></div>
                </div>

                <fieldset>
                  <legend className="text-xs font-bold uppercase tracking-wide text-stone-500">Payment received</legend>
                  <div className="mt-2 flex flex-wrap gap-2">{MODES.map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${mode === value ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 text-stone-700"}`}>{label}</button>
                  ))}</div>
                  {mode !== "LATER" && <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-sm"><span className="text-stone-600">Amount (₹)</span><input type="number" min={1} max={amountDue} value={paid ?? amountDue} onChange={(event) => setPaid(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-2" /></label>
                    {mode !== "CASH" && <label className="text-sm"><span className="text-stone-600">Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR / last 4 digits" className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-2" /></label>}
                  </div>}
                  {quote && amountDue - paidNow > 0 && <p className="mt-2 text-sm font-semibold text-amber-700">Balance due at the trip: {inr(amountDue - paidNow)}</p>}
                </fieldset>
              </>}

              {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
            </div>
            <div className="border-t border-stone-200 p-4">
              <button type="submit" disabled={!slot || !quote || saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-stone-950 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {slot && quote ? `Confirm ${party} ${party === 1 ? "guest" : "guests"} · ${inr(amountDue)}` : "Choose a departure"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}