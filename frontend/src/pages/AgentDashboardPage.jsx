import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AlertCircle, Copy, Download, FileText, MessageCircle, RefreshCw, RotateCcw, Search, Ticket } from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import CancellationRefundModal from "../components/checkout/CancellationRefundModal.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

/**
 * A travel agency's bookings and statement (ADR 054, plan B3): every booking it
 * made for its clients, filtered by trip or booking date, with what was paid,
 * saved and refunded, the voucher for the client, the invoice for the agency,
 * cancellation, and the statement as CSV.
 */

const STATUS_TABS = [["upcoming", "Upcoming"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All"]];
const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const inputClass = "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

function statusBadge(booking) {
  if (!booking.paid) return ["Not paid", "border-stone-200 bg-stone-50 text-stone-500"];
  if (booking.status === "cancelled") return ["Cancelled", "border-rose-200 bg-rose-50 text-rose-700"];
  if (booking.status === "completed") return ["Completed", "border-stone-200 bg-stone-100 text-stone-700"];
  if (booking.supplierRescheduleStatus === "MOVED") return ["New date offered", "border-amber-200 bg-amber-50 text-amber-800"];
  return ["Confirmed", "border-emerald-200 bg-emerald-50 text-emerald-700"];
}

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const [noAgency, setNoAgency] = useState(false);
  const [filters, setFilters] = useState({ status: "upcoming", dateBy: "trip", from: "", to: "", q: "" });
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [opening, setOpening] = useState(null);

  const params = useCallback(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.getAgencyBookings(params())
      .then(setData)
      .catch((err) => (err.code === "NO_AGENCY" ? setNoAgency(true) : setError(err.message || "Your bookings couldn't be loaded")))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Search as the agent types, without a request per key.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  if (!user) return <Navigate to={`/login?from=${encodeURIComponent("/agents/dashboard")}`} replace />;

  const openDocument = async (booking, kind) => {
    setOpening(`${booking.ref}:${kind}`);
    // Open the tab first so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const res = await api.getBookingDocuments(booking.ref);
      const url = kind === "invoice" ? res.documents?.invoiceUrl : res.documents?.voucherUrl;
      if (!url) throw new Error("That document isn't available yet");
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err.message || "The document couldn't be opened");
    } finally {
      setOpening(null);
    }
  };

  // The client's voucher, without the price, sent on WhatsApp or copied (plan B4).
  const voucherMessage = (booking, url) => [
    `Hello ${booking.guestName},`,
    `Your booking is confirmed: ${booking.productTitle} on ${booking.tripDate}${booking.pickupTime ? ` at ${booking.pickupTime}` : ""}.`,
    `Booking reference: ${booking.ref}`,
    `Your voucher: ${url}`,
    `Show it at pickup. For any change, contact us.`,
    agency?.agencyName ? `- ${agency.agencyName}` : "",
  ].filter(Boolean).join("\n");

  const sendVoucher = async (booking, how) => {
    setOpening(`${booking.ref}:${how}`);
    setError("");
    const tab = how === "whatsapp" ? window.open("", "_blank") : null;
    try {
      const res = await api.getBookingDocuments(booking.ref);
      const url = res.documents?.voucherUrl;
      if (!url) throw new Error("The voucher isn't available yet");
      const text = voucherMessage(booking, url);
      if (how === "whatsapp") {
        const phone = String(booking.guestPhone || "").replace(/\D/g, "");
        const link = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        if (tab) tab.location.href = link; else window.location.href = link;
      } else {
        await navigator.clipboard.writeText(text);
        setMessage(`Copied ${booking.guestName}'s voucher message. Paste it into email or chat.`);
      }
    } catch (err) {
      tab?.close();
      setError(err.message || "The voucher couldn't be shared");
    } finally {
      setOpening(null);
    }
  };

  const downloadCsv = async () => {
    try {
      const blob = await api.downloadAgencyStatement(params());
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `agent_statement_${filters.from || "all"}${filters.to ? `_to_${filters.to}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || "The statement couldn't be downloaded");
    }
  };

  if (noAgency) return <Navigate to="/agents" replace />;

  const agency = data?.agency;
  const totals = data?.totals;
  const bookings = data?.bookings || [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <SeoHead title="Agent bookings | Idea Holiday" description="Your agency's bookings and statement." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Travel agent</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{agency?.agencyName || "Your bookings"}</h1>
          {agency && (
            <p className="mt-1 text-sm text-stone-600">
              {agency.status === "APPROVED"
                ? <>Agent price: <strong>{agency.discountPct}% below the website price</strong>. <Link to="/search" className="font-bold text-amber-700 hover:underline">Book for a client</Link></>
                : <>Agent prices are paused on your account. Your bookings are still here. <Link to="/agents" className="font-bold text-amber-700 hover:underline">Details</Link></>}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold hover:bg-stone-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
          <button onClick={downloadCsv} className="flex items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white hover:bg-stone-800">
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Statement (CSV)
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {STATUS_TABS.map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filters.status === value} onClick={() => setFilters({ ...filters, status: value })}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${filters.status === value ? "border-amber-500 bg-amber-500 text-stone-950" : "border-stone-200 hover:bg-stone-100"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Guest, reference or listing" className={`${inputClass} w-full pl-9`} />
        </label>
        <select aria-label="Filter dates by" value={filters.dateBy} onChange={(e) => setFilters({ ...filters, dateBy: e.target.value })} className={inputClass}>
          <option value="trip">Trip date</option>
          <option value="booked">Booked on</option>
        </select>
        <input type="date" aria-label="From" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={inputClass} />
        <input type="date" aria-label="To" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={inputClass} />
      </div>

      {totals && (
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Paid bookings", totals.bookings], ["Guests", totals.guests], ["You paid", inr(totals.paidInr)], ["You saved", inr(totals.agentDiscountInr)], ["Refunded", inr(totals.refundInr)]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{label}</dt>
              <dd className="mt-1 font-display text-xl font-bold text-stone-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {message && <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="h-4 w-4" aria-hidden="true" /> {error}</p>}

      {!loading && data && bookings.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No bookings here yet.</p>
      )}

      <ul className="mt-5 space-y-3">
        {bookings.map((booking) => {
          const [label, badgeClass] = statusBadge(booking);
          return (
            <li key={booking.id} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}>{label}</span>
                    <span className="font-mono text-xs text-stone-500">{booking.ref}</span>
                  </div>
                  <h2 className="mt-1 font-bold text-stone-900">{booking.productTitle}</h2>
                  <p className="text-sm text-stone-600">
                    {booking.tripDate}{booking.pickupTime ? ` · ${booking.pickupTime}` : ""} · {booking.guestName} · {booking.adults + booking.children} guest{booking.adults + booking.children === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-stone-400">Booked {String(booking.bookedAt || "").slice(0, 10)}{booking.guestPhone ? ` · ${booking.guestPhone}` : ""}</p>
                </div>
                <div className="text-sm sm:text-right">
                  {booking.paid ? (
                    <>
                      <p className="font-bold text-stone-900">Paid {inr(booking.paidInr)}</p>
                      {booking.agentDiscountInr > 0 && <p className="text-xs text-emerald-700">Saved {inr(booking.agentDiscountInr)} on {inr(booking.websitePriceInr)}</p>}
                      {booking.refundInr > 0 && <p className="text-xs text-rose-700">Refunded {inr(booking.refundInr)}</p>}
                    </>
                  ) : <p className="text-xs text-stone-500">Payment not completed</p>}
                </div>
              </div>
              {booking.paid && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  <button onClick={() => openDocument(booking, "voucher")} disabled={opening === `${booking.ref}:voucher`} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-100 disabled:opacity-50">
                    <Ticket className="h-3.5 w-3.5" aria-hidden="true" /> Voucher for client
                  </button>
                  {booking.status !== "cancelled" && (
                    <>
                      <button onClick={() => sendVoucher(booking, "whatsapp")} disabled={!booking.guestPhone || opening === `${booking.ref}:whatsapp`} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Send to client
                      </button>
                      <button onClick={() => sendVoucher(booking, "copy")} disabled={opening === `${booking.ref}:copy`} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-100 disabled:opacity-50">
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy voucher message
                      </button>
                    </>
                  )}
                  <button onClick={() => openDocument(booking, "invoice")} disabled={opening === `${booking.ref}:invoice`} className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-100 disabled:opacity-50">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Invoice
                  </button>
                  {booking.canCancel && (
                    <button onClick={() => setCancelling(booking)} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                    </button>
                  )}
                  {booking.circuitOrderId && booking.status !== "cancelled" && (
                    <Link to={`/circuit/${booking.circuitOrderId}/manage`} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-100">Manage circuit</Link>
                  )}
                  {booking.supplierRescheduleStatus === "MOVED" && (
                    <Link to={`/bookings?ref=${encodeURIComponent(booking.ref)}`} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50">Answer new date</Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {cancelling && (
        <CancellationRefundModal
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onSuccess={(result) => { setMessage(result.message); setCancelling(null); load(); }}
        />
      )}
    </main>
  );
}
