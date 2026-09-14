import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import SupplierProfileAdminPanel from "../../components/admin/SupplierProfileAdminPanel.jsx";

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const PLAN_NAMES = { VERIFIED: "Verified", VERIFIED_PLUS: "Verified Plus" };

/**
 * Paid Verified checks (ADR 008). Payment buys the check, never the badge: an
 * admin passes it with the checks (granting the badge) or rejects it, which
 * refunds what was paid for the check.
 */
export default function VerificationQueueView() {
  const [data, setData] = useState({ queue: [], failedRefunds: [] });
  const [open, setOpen] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.adminVerificationQueue().then(setData).catch((err) => setError(err.message || "The queue couldn't be loaded"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (work) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      load();
    } catch (err) {
      setError(err.message || "That couldn't be saved");
    } finally {
      setBusy(false);
    }
  };

  const reject = (item) => run(async () => {
    const res = await api.adminRejectVerification(item.verificationId, { reason });
    setRejecting(null);
    setReason("");
    setNotice(res.refundStatus === "PROCESSED" ? `${item.supplierName}: check rejected, ${inr(res.refundAmountInr)} refunded.`
      : res.refundStatus === "FAILED" ? `${item.supplierName}: check rejected, but the refund failed. Retry it below.`
        : `${item.supplierName}: check rejected. Nothing was paid, so nothing to refund.`);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Verified checks</h1>
          <p className="mt-0.5 text-xs text-stone-500">Suppliers who paid for the yearly check. Pass it with the checks to grant the badge, or reject it to refund the check.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}
      {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}

      <section className="rounded-2xl border border-stone-200 bg-white p-2">
        {data.queue.length === 0 ? <p className="p-4 text-xs text-stone-500">No checks waiting.</p> : (
          <ul className="divide-y divide-stone-100">
            {data.queue.map((item) => (
              <li key={item.verificationId} className="space-y-3 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm text-stone-900">{item.supplierName}</strong>
                    <span className="text-stone-500"> · {item.city || "—"} · {PLAN_NAMES[item.planCode] || item.planCode} · paid {inr(item.paidInr)} · since {String(item.requestedAt).slice(0, 10)}</span>
                    {item.kybStatus !== "APPROVED" && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">KYB {item.kybStatus}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(open === item.verificationId ? null : item.verificationId)} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">{open === item.verificationId ? "Close" : "Do the checks"}</button>
                    <button type="button" onClick={() => { setRejecting(item.verificationId); setReason(""); }} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold text-rose-700 hover:border-rose-400">Reject</button>
                  </div>
                </div>
                {open === item.verificationId && <SupplierProfileAdminPanel supplierId={item.supplierId} />}
                {rejecting === item.verificationId && (
                  <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="font-semibold text-stone-800">The badge will not be granted{item.refundableInr > 0 ? ` and ${inr(item.refundableInr)} will be refunded` : ""}.</p>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Which check did not pass" minLength={5} maxLength={500} className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5" aria-label="Reason the checks did not pass" />
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => reject(item)} className="rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">Reject and refund</button>
                      <button type="button" onClick={() => setRejecting(null)} className="rounded-lg bg-stone-200 px-3 py-1.5 font-bold">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.failedRefunds.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-white p-4 text-xs">
          <h2 className="text-sm font-bold text-stone-900">Refunds that failed</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {data.failedRefunds.map((row) => (
              <li key={row.paymentId} className="flex items-center justify-between gap-2 py-2">
                <span>{row.supplierName} · {PLAN_NAMES[row.planCode] || row.planCode} · {inr(row.refundAmountInr)}</span>
                <button type="button" disabled={busy} onClick={() => run(async () => { await api.adminRetryCheckRefund(row.paymentId); setNotice(`${row.supplierName}: refund sent.`); })} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">Retry refund</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
