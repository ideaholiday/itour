import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Layers3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
  : "Date pending";

function requestKey(orderId, type, suffix = "") {
  const storageKey = `idea_holiday_circuit_management:${orderId}:${type}:${suffix}`;
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = `${type.toLowerCase()}-${orderId}-${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function clearRequestKey(orderId, type, suffix = "") {
  localStorage.removeItem(`idea_holiday_circuit_management:${orderId}:${type}:${suffix}`);
}

function statusTone(status) {
  if (["APPROVED", "COMPLETED", "CONFIRMED", "RECONCILED"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["REJECTED", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED", "REVIEW_REQUIRED"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function CircuitManage() {
  const { ref } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("RESCHEDULE");
  const [reason, setReason] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [reschedulePreview, setReschedulePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getCircuitManagement(ref);
      setData(response);
      if (!newStartDate && response.order?.items?.length) {
        const start = [...response.order.items].sort((a, b) => a.activityDate.localeCompare(b.activityDate))[0].activityDate;
        const date = new Date(`${start}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + 7);
        setNewStartDate(date.toISOString().slice(0, 10));
      }
    } catch (loadError) {
      setError(loadError.message || "Circuit management could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [ref, user]);

  const currentRequest = data?.management?.currentRequest;
  const cancellation = data?.management?.cancellationPreview;
  const manageable = data?.order?.status === "CONFIRMED" && data?.order?.payment?.status === "PAID" && !currentRequest
    && !["SUPPLIER_RECONFIRMATION_PENDING", "RECONFIRMATION_REVIEW_REQUIRED"].includes(data?.order?.management?.status);
  const earliestDate = useMemo(() => data?.order?.items?.length
    ? [...data.order.items].sort((a, b) => a.activityDate.localeCompare(b.activityDate))[0].activityDate
    : "", [data]);

  async function previewReschedule() {
    if (!newStartDate) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await api.previewCircuitReschedule(data.order.orderId, newStartDate);
      setReschedulePreview(response.preview);
    } catch (previewError) {
      setReschedulePreview(null);
      setError(previewError.message || "Those circuit dates could not be checked.");
    } finally {
      setWorking(false);
    }
  }

  async function submitRequest(type) {
    if (reason.trim().length < 5) {
      setError("Please add a short reason for the operations team.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const suffix = type === "RESCHEDULE" ? newStartDate : "all";
      await api.createCircuitManagementRequest(data.order.orderId, {
        type,
        reason: reason.trim(),
        ...(type === "RESCHEDULE" ? { newStartDate } : {}),
        idempotencyKey: requestKey(data.order.orderId, type, suffix),
      });
      clearRequestKey(data.order.orderId, type, suffix);
      setMessage(type === "RESCHEDULE"
        ? "Your complete-circuit date change is awaiting operations approval. No stop has changed yet."
        : "Your grouped cancellation is awaiting operations approval. No stop has been cancelled yet.");
      await load();
    } catch (submitError) {
      setError(submitError.message || "Your circuit request could not be submitted.");
    } finally {
      setWorking(false);
    }
  }

  if (!user) {
    return <div className="grid min-h-[65vh] place-items-center px-4"><div className="max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center"><h1 className="font-serif text-2xl font-bold">Sign in to manage your circuit</h1><Link to={`/login?from=${encodeURIComponent(location.pathname)}`} className="mt-5 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-stone-950">Sign in</Link></div></div>;
  }
  if (loading) return <div className="grid min-h-[65vh] place-items-center text-sm font-semibold text-stone-600">Loading circuit controls…</div>;
  if (!data) return <div className="mx-auto max-w-xl px-5 py-20 text-center text-rose-800">{error || "Circuit not found."}</div>;

  const { order, management } = data;
  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-10 text-stone-900 sm:px-6">
      <SeoHead title={`Manage circuit ${order.orderRef}`} description="Manage your complete Idea Holiday circuit." noindex />
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to={`/circuit-confirmed/${order.orderRef}`} className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-amber-800"><ArrowLeft className="h-4 w-4" /> Back to circuit confirmation</Link>

        <header className="overflow-hidden rounded-3xl bg-stone-950 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-amber-300"><Layers3 className="h-4 w-4" /> Parent-level trip controls</span><h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Manage your complete circuit</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-300">Every request covers all {order.items.length} bookings. Operations applies the change atomically, so your circuit cannot be left half-cancelled or partly rescheduled.</p></div><div className="rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-right"><span className="block text-[9px] font-bold uppercase text-stone-400">Circuit reference</span><strong className="font-mono text-amber-300">{order.orderRef}</strong></div></div>
        </header>

        {(error || message) && <div className={`rounded-2xl border p-4 text-sm font-semibold ${error ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

        {currentRequest && (
          <section className={`rounded-3xl border p-6 ${statusTone(currentRequest.status)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-black uppercase tracking-wider">Operations review in progress</span><h2 className="mt-1 font-serif text-2xl font-bold">{currentRequest.type === "CANCELLATION" ? "Grouped cancellation pending" : "Circuit reschedule pending"}</h2><p className="mt-2 max-w-2xl text-sm">No partial result will be applied. Request {currentRequest.requestRef} remains controlled by the parent order.</p></div><span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-black">{currentRequest.status.replaceAll("_", " ")}</span></div>
            {currentRequest.failureCode && <p className="mt-3 rounded-xl bg-white/60 p-3 text-xs font-bold">{currentRequest.failureCode.replaceAll("_", " ")} — operations can safely retry without cancelling children twice.</p>}
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-4"><CalendarDays className="h-5 w-5 text-amber-700" /><span className="mt-2 block text-[10px] font-bold uppercase text-stone-400">Current start</span><strong className="mt-1 block text-sm">{formatDate(earliestDate)}</strong></div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4"><IndianRupee className="h-5 w-5 text-emerald-700" /><span className="mt-2 block text-[10px] font-bold uppercase text-stone-400">Paid total</span><strong className="mt-1 block text-sm">{formatMoney(order.breakdown.totalAmount)}</strong></div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4"><ShieldCheck className="h-5 w-5 text-emerald-700" /><span className="mt-2 block text-[10px] font-bold uppercase text-stone-400">Management state</span><strong className="mt-1 block text-sm">{management.managementStatus.replaceAll("_", " ")}</strong></div>
        </section>

        {order.management.reconfirmationStatus !== "NOT_REQUIRED" && (
          <section className={`rounded-3xl border p-5 sm:p-6 ${statusTone(order.management.reconfirmationStatus)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-black uppercase tracking-wider">Supplier reconfirmation SLA</span><h2 className="mt-1 font-serif text-2xl font-bold">{order.management.reconfirmationStatus === "CONFIRMED" ? "Every supplier confirmed the new dates" : order.management.reconfirmationStatus === "REVIEW_REQUIRED" ? "Operations is reviewing a supplier issue" : "New dates awaiting supplier confirmation"}</h2><p className="mt-2 text-sm">The itinerary remains grouped. No individual stop will be reassigned automatically.</p></div><span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-black">{order.management.reconfirmationStatus.replaceAll("_", " ")}</span></div>
            {order.management.reconfirmationDeadline && <p className="mt-3 text-xs font-bold"><Clock3 className="mr-1 inline h-4 w-4" /> Response deadline: {new Date(order.management.reconfirmationDeadline).toLocaleString("en-IN")}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">{order.items.map((item) => <div key={item.orderItemId} className="rounded-xl border border-current/10 bg-white/60 p-3 text-xs"><strong>Stop {item.sequenceNumber} · {item.productTitle}</strong><span className="mt-1 block">{item.reconfirmationStatus.replaceAll("_", " ")}</span></div>)}</div>
          </section>
        )}

        {order.management.refundReconciliationStatus !== "NOT_REQUIRED" && (
          <section className={`rounded-3xl border p-5 ${statusTone(order.management.refundReconciliationStatus)}`}><span className="text-[10px] font-black uppercase tracking-wider">Live refund reconciliation</span><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">Provider status: {order.management.refundReconciliationStatus.replaceAll("_", " ")}</h2>{order.management.refundReconciledAt && <span className="text-xs font-bold">Reconciled {new Date(order.management.refundReconciledAt).toLocaleString("en-IN")}</span>}</div></section>
        )}

        {manageable && <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex gap-2 border-b border-stone-200 pb-4">
            <button onClick={() => setTab("RESCHEDULE")} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === "RESCHEDULE" ? "bg-amber-500 text-stone-950" : "bg-stone-100 text-stone-600"}`}><RotateCcw className="mr-1.5 inline h-4 w-4" /> Reschedule all stops</button>
            <button onClick={() => setTab("CANCELLATION")} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === "CANCELLATION" ? "bg-rose-600 text-white" : "bg-stone-100 text-stone-600"}`}><XCircle className="mr-1.5 inline h-4 w-4" /> Cancel complete circuit</button>
          </div>

          {tab === "RESCHEDULE" ? <div className="mt-6 space-y-5">
            <div><h2 className="font-serif text-2xl font-bold">Move the whole circuit together</h2><p className="mt-1 text-sm text-stone-600">Choose a new first day. Every stop moves by the same number of days and is rechecked against supplier inventory.</p></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-xs font-bold text-stone-700">New circuit start date<input aria-label="New circuit start date" type="date" min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} value={newStartDate} onChange={(event) => { setNewStartDate(event.target.value); setReschedulePreview(null); }} className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm" /></label><button onClick={previewReschedule} disabled={working || !newStartDate} className="self-end rounded-xl border border-amber-400 bg-amber-50 px-5 py-3 text-xs font-black text-amber-900 disabled:opacity-50">{working ? "Checking…" : "Check every stop"}</button></div>
            {reschedulePreview && <div className={`rounded-2xl border p-4 ${reschedulePreview.eligible ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}><div className="flex items-center gap-2 text-sm font-bold">{reschedulePreview.eligible ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-rose-700" />}{reschedulePreview.eligible ? `All ${reschedulePreview.items.length} stops are currently available` : "Some stops cannot be moved"}</div><div className="mt-3 space-y-2">{reschedulePreview.items.map((item) => <div key={item.orderItemId} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white/70 p-3 text-xs"><span><strong>Stop {item.sequenceNumber}</strong> · {item.productTitle}</span><span>{formatDate(item.currentDate)} → <strong>{formatDate(item.proposedDate)}</strong></span></div>)}</div></div>}
            <label className="block text-xs font-bold text-stone-700">Reason for changing the circuit<textarea aria-label="Circuit change reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm" placeholder="Tell operations why you need these new dates" /></label>
            <button onClick={() => submitRequest("RESCHEDULE")} disabled={working || !reschedulePreview?.eligible} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-stone-950 disabled:opacity-50"><ShieldCheck className="h-4 w-4" /> Submit complete-circuit reschedule</button>
          </div> : <div className="mt-6 space-y-5">
            <div><h2 className="font-serif text-2xl font-bold text-rose-900">Cancel every circuit booking</h2><p className="mt-1 text-sm text-stone-600">The refund is calculated per supplier policy, then combined into one parent refund. Operations must approve before anything changes.</p></div>
            {cancellation && <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-stone-100 p-4"><span className="text-[10px] font-bold uppercase text-stone-500">Paid</span><strong className="mt-1 block">{formatMoney(cancellation.totalAmount)}</strong></div><div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900"><span className="text-[10px] font-bold uppercase">Policy refund</span><strong className="mt-1 block">{formatMoney(cancellation.refundAmount)}</strong></div><div className="rounded-2xl bg-rose-50 p-4 text-rose-900"><span className="text-[10px] font-bold uppercase">Cancellation fee</span><strong className="mt-1 block">{formatMoney(cancellation.cancellationFeeAmount)}</strong></div></div>}
            <div className="space-y-2">{cancellation?.items.map((item) => <div key={item.orderItemId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 text-xs"><span><strong>Stop {item.sequenceNumber}</strong> · {item.productTitle}<small className="mt-1 block text-stone-500">{item.policyTier}</small></span><span className="font-bold text-emerald-800">{item.refundPercentage}% · {formatMoney(item.refundAmount)}</span></div>)}</div>
            <label className="block text-xs font-bold text-stone-700">Cancellation reason<textarea aria-label="Circuit cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm" placeholder="Tell operations why the complete circuit must be cancelled" /></label>
            <button onClick={() => submitRequest("CANCELLATION")} disabled={working || !cancellation} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><AlertTriangle className="h-4 w-4" /> Request grouped cancellation</button>
          </div>}
        </section>}

        {management.requests.length > 0 && <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-7"><h2 className="font-serif text-xl font-bold">Circuit request history</h2><div className="mt-4 space-y-3">{management.requests.map((request) => <article key={request.requestId} className="rounded-2xl border border-stone-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong className="font-mono text-xs">{request.requestRef}</strong><p className="mt-1 text-sm font-bold">{request.type.replaceAll("_", " ")}</p></div><span className={`h-fit rounded-full border px-2.5 py-1 text-[9px] font-black ${statusTone(request.status)}`}>{request.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-stone-600">{request.reason}</p>{request.resolution && <p className="mt-2 rounded-xl bg-stone-50 p-3 text-xs"><strong>Operations:</strong> {request.resolution}</p>}</article>)}</div></section>}
      </div>
    </div>
  );
}
