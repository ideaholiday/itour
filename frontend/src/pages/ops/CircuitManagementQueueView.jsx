import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, IndianRupee, Layers3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../../lib/api.js";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function tone(status) {
  if (["APPROVED", "COMPLETED", "RECONCILED", "CONFIRMED"].includes(status)) return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (["REJECTED", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED", "REFUND_REVIEW_REQUIRED", "RECONFIRMATION_REVIEW_REQUIRED"].includes(status)) return "border-rose-300 bg-rose-50 text-rose-900";
  return "border-amber-300 bg-amber-50 text-amber-900";
}

const needsReview = (request) => ["PENDING", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED"].includes(request.status)
  || ["REFUND_REVIEW_REQUIRED", "RECONFIRMATION_REVIEW_REQUIRED"].includes(request.orchestrationStatus);

export default function CircuitManagementQueueView() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [selected, setSelected] = useState(null);
  const [resolution, setResolution] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getCircuitManagementRequests();
      setRequests(data.requests || []);
      setSelected((current) => current ? (data.requests || []).find((item) => item.requestId === current.requestId) || null : null);
    } catch (loadError) {
      setError(loadError.message || "Circuit operations queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => requests.filter((request) => {
    if (filter === "ALL") return true;
    if (filter === "OPEN") return needsReview(request);
    return request.status === filter;
  }), [requests, filter]);

  async function review(action) {
    if (!selected || resolution.trim().length < 5) {
      setError("Add a clear operations resolution before approving or rejecting.");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await api.reviewCircuitManagementRequest(selected.requestId, { action, resolution: resolution.trim() });
      setMessage(action === "APPROVE"
        ? `${selected.requestRef} approved. Every child booking was updated together.`
        : `${selected.requestRef} rejected. The circuit remains unchanged.`);
      setSelected(result.request);
      setResolution("");
      await load();
    } catch (reviewError) {
      setError(reviewError.message || "The operations decision could not be saved.");
      await load();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-amber-800"><Layers3 className="h-4 w-4" /> Multi-supplier circuit controls</span><h1 className="mt-2 font-serif text-3xl font-bold">Circuit changes & refunds</h1><p className="mt-2 max-w-2xl text-sm text-stone-600">Review one parent request, verify every child stop, then approve or reject the complete circuit atomically.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-bold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh queue</button></div>
      </header>

      {(error || message) && <div className={`rounded-2xl border p-4 text-sm font-semibold ${error ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{error || message}</div>}

      <div className="flex flex-wrap gap-2">{[["OPEN", "Needs review"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All requests"]].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-xl px-4 py-2 text-xs font-bold ${filter === id ? "bg-amber-500 text-stone-950" : "border border-stone-200 bg-white text-stone-600"}`}>{label} ({id === "ALL" ? requests.length : id === "OPEN" ? requests.filter(needsReview).length : requests.filter((item) => item.status === id).length})</button>)}</div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-3">
          {loading ? <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">Loading circuit requests…</div> : visible.length ? visible.map((request) => <button key={request.requestId} onClick={() => { setSelected(request); setResolution(""); setError(""); }} className={`block w-full rounded-2xl border p-4 text-left transition ${selected?.requestId === request.requestId ? "border-amber-500 bg-amber-50 shadow-sm" : "border-stone-200 bg-white hover:border-amber-300"}`}><div className="flex items-start justify-between gap-3"><div><strong className="font-mono text-xs text-amber-800">{request.requestRef}</strong><h2 className="mt-1 text-sm font-bold">{request.type === "CANCELLATION" ? "Cancel complete circuit" : "Reschedule complete circuit"}</h2></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${tone(request.orchestrationStatus || request.status)}`}>{(request.orchestrationStatus && request.orchestrationStatus !== "NOT_STARTED" ? request.orchestrationStatus : request.status).replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-stone-600">{request.orderRef} · {request.travelerName} · {request.itemCount} stops</p><p className="mt-2 line-clamp-2 text-xs text-stone-500">{request.reason}</p></button>) : <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">No circuit requests match this queue.</div>}
        </section>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          {!selected ? <div className="grid min-h-72 place-items-center text-center"><div><ShieldCheck className="mx-auto h-10 w-10 text-stone-300" /><p className="mt-3 text-sm font-bold text-stone-500">Select a circuit request to review every child stop.</p></div></div> : <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-black uppercase text-stone-400">{selected.requestRef}</span><h2 className="mt-1 font-serif text-2xl font-bold">{selected.type === "CANCELLATION" ? "Grouped cancellation review" : "Grouped reschedule review"}</h2><p className="mt-1 text-xs text-stone-500">Parent {selected.orderRef} · {selected.itemCount} child bookings · {money(selected.totalAmount)}</p></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${tone(selected.status)}`}>{selected.status.replaceAll("_", " ")}</span></div>
            <div className="rounded-2xl bg-stone-50 p-4"><span className="text-[10px] font-bold uppercase text-stone-500">Traveler reason</span><p className="mt-2 text-sm leading-relaxed">{selected.reason}</p></div>
            {selected.orchestrationStatus && selected.orchestrationStatus !== "NOT_STARTED" && <div className={`rounded-2xl border p-4 text-xs font-bold ${tone(selected.orchestrationStatus)}`}>Post-change orchestration: {selected.orchestrationStatus.replaceAll("_", " ")}{selected.gatewayStatus ? ` · provider ${selected.gatewayStatus}` : ""}</div>}

            {selected.type === "CANCELLATION" ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-stone-200 p-3"><IndianRupee className="h-4 w-4 text-stone-500" /><span className="mt-2 block text-[9px] font-bold uppercase text-stone-400">Paid</span><strong className="text-sm">{money(selected.totalAmount)}</strong></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"><CheckCircle2 className="h-4 w-4" /><span className="mt-2 block text-[9px] font-bold uppercase">Parent refund</span><strong className="text-sm">{money(selected.refundAmount)}</strong></div><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900"><AlertTriangle className="h-4 w-4" /><span className="mt-2 block text-[9px] font-bold uppercase">Retained fee</span><strong className="text-sm">{money(selected.cancellationFeeAmount)}</strong></div></div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><CalendarDays className="h-5 w-5 text-amber-800" /><p className="mt-2"><strong>Requested start:</strong> {selected.requestedChanges.newStartDate} · shift every stop by {selected.requestedChanges.shiftDays} days</p></div>}

            <div className="space-y-2">{(selected.type === "CANCELLATION" ? selected.policySnapshot.items : selected.requestedChanges.items)?.map((item) => <div key={item.orderItemId} className="rounded-xl border border-stone-200 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span><strong>Stop {item.sequenceNumber}</strong> · {item.productTitle}</span>{selected.type === "CANCELLATION" ? <strong className="text-emerald-800">{item.refundPercentage}% · {money(item.refundAmount)}</strong> : <strong>{item.currentDate} → {item.proposedDate}</strong>}</div><p className="mt-1 text-stone-500">{item.supplierName || "Verified supplier"}{item.policyTier ? ` · ${item.policyTier}` : ""}</p></div>)}</div>

            {["PENDING", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED"].includes(selected.status) ? <div className="border-t border-stone-200 pt-5"><label className="text-xs font-bold text-stone-700">Operations resolution<textarea aria-label="Operations resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} rows={3} className="mt-2 block w-full rounded-xl border border-stone-300 px-4 py-3 text-sm" placeholder="Record checks performed and the decision rationale" /></label><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => review("APPROVE")} disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {working ? "Applying atomically…" : "Approve complete circuit"}</button><button onClick={() => review("REJECT")} disabled={working} className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 text-xs font-black text-rose-800 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject request</button></div><p className="mt-3 text-[11px] leading-relaxed text-stone-500">Approval revalidates current policy and inventory. A failed parent refund cancels zero children and remains retryable.</p></div> : selected.resolution && <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs"><strong>Recorded resolution:</strong> {selected.resolution}</div>}
          </div>}
        </section>
      </div>
    </div>
  );
}
