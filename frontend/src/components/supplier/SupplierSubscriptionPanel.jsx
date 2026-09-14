import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { api, authHeaders } from "../../lib/api.js";
import { loadCashfreeSdk } from "../../lib/cashfreeSdk.js";

const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function coverText(subscription) {
  if (!subscription) return "";
  if (subscription.exempt) return "You joined before 14 September 2026, so you don't need a subscription.";
  if (!subscription.covered) return "Not covered: your listings are not taking new bookings. Bookings already made are not affected.";
  const until = subscription.cover?.endsAt ? `until ${subscription.cover.endsAt.slice(0, 10)}` : "with no end date yet";
  if (subscription.cover?.source === "LAUNCH") return `Free launch offer, ${until}.`;
  if (subscription.cover?.source === "WAIVER") return `Subscription waived by Idea Holiday, ${until}.`;
  return `Subscribed ${until}.`;
}

/**
 * The supplier's subscription (ADR 017): cover, price with GST, coupon,
 * payment through Cashfree, and GST invoices. The server prices and confirms
 * every payment; this screen only shows what it returns.
 */
export default function SupplierSubscriptionPanel({ supplierId, onRefresh }) {
  const [data, setData] = useState(null);
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.supplierSubscription(supplierId)
      .then(setData)
      .catch((err) => setError(err.message || "The subscription couldn't be loaded"));
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (work) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const priceIt = () => run(async () => {
    const res = await api.supplierSubscriptionQuote(supplierId, { couponCode: coupon.trim() || null });
    setQuote(res.quote);
  });

  const pay = () => run(async () => {
    const res = await api.supplierSubscriptionCheckout(supplierId, { couponCode: coupon.trim() || null, returnUrl: `${window.location.origin}/supplier/dashboard?panel=subscription` });
    if (!res.checkout) {
      setNotice("Your coupon covers the whole subscription. You're subscribed.");
    } else {
      const Cashfree = await loadCashfreeSdk();
      const cashfree = Cashfree({ mode: res.checkout.environment === "PROD" || res.checkout.environment === "PRODUCTION" ? "production" : "sandbox" });
      const result = await cashfree.checkout({ paymentSessionId: res.checkout.paymentSessionId, redirectTarget: "_modal" });
      if (result?.error) throw new Error(result.error.message || "The payment was not completed.");
      const verified = await api.supplierSubscriptionVerify(supplierId, res.payment.id);
      setNotice(`Payment received. Invoice ${verified.invoiceNumber} is ready below.`);
    }
    setQuote(null);
    setCoupon("");
    load();
    onRefresh?.();
  });

  const checkPending = (payment) => run(async () => {
    const verified = await api.supplierSubscriptionVerify(supplierId, payment.id);
    setNotice(`Payment received. Invoice ${verified.invoiceNumber} is ready below.`);
    load();
    onRefresh?.();
  });

  // The invoice needs the sign-in header, so it is fetched and opened as a page.
  const openInvoice = (payment) => run(async () => {
    const response = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/subscription/payments/${encodeURIComponent(payment.id)}/invoice`, { headers: authHeaders() });
    if (!response.ok) throw new Error("The invoice couldn't be opened");
    const url = URL.createObjectURL(new Blob([await response.text()], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  const subscription = data?.subscription;
  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-stone-900">Subscription</h2>
          <p className="mt-1 text-sm text-stone-600">Suppliers who joined from 14 September 2026 need a subscription for their listings to take bookings.</p>
        </div>
        <button type="button" onClick={load} className="rounded-xl border border-stone-300 p-2.5 text-stone-500 hover:text-stone-900" aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}
      {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}

      {subscription && (
        <div className={`rounded-3xl border p-5 ${subscription.covered ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <strong className="text-sm text-stone-900">{coverText(subscription)}</strong>
        </div>
      )}

      {subscription?.required && (
        <div className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          {!data.plan ? (
            <p className="text-sm text-stone-600">The subscription isn't on sale yet. You're covered by the launch offer until it is; we'll let you know before anything changes.</p>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                <strong>{inr(data.plan.priceInr)}</strong> + {data.plan.gstRatePct}% GST for {data.plan.billingPeriodMonths} months.
                If you're already covered, a paid period starts when your current dated cover ends.
              </p>
              <div className="flex flex-wrap gap-2">
                <input value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setQuote(null); }} placeholder="Coupon code (optional)" className="flex-1 rounded-xl border border-stone-300 px-3 py-2 font-mono text-sm uppercase" />
                <button type="button" onClick={priceIt} disabled={busy} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold hover:border-amber-500 disabled:opacity-50">See price</button>
              </div>
              {quote && (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    <tr><td className="py-1.5">Subscription ({quote.periodMonths} months)</td><td className="text-right">{inr(quote.baseInr)}</td></tr>
                    {quote.discountInr > 0 && <tr><td className="py-1.5">Coupon {quote.coupon?.code}</td><td className="text-right">− {inr(quote.discountInr)}</td></tr>}
                    <tr><td className="py-1.5">GST @ {Math.round(quote.gstRate * 100)}%</td><td className="text-right">{inr(quote.gstInr)}</td></tr>
                    <tr className="font-bold"><td className="py-1.5">Total</td><td className="text-right">{inr(quote.totalInr)}</td></tr>
                  </tbody>
                </table>
              )}
              <button type="button" onClick={pay} disabled={busy || !quote} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
                {busy ? "Working…" : quote ? (quote.totalInr > 0 ? `Pay ${inr(quote.totalInr)}` : "Subscribe with coupon") : "See the price first"}
              </button>
            </>
          )}
        </div>
      )}

      {data?.payments?.length > 0 && (
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-stone-900">Payments and invoices</h3>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {data.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>{payment.createdAt.slice(0, 10)} · {inr(payment.totalInr)} · {payment.status === "FREE" ? "Coupon" : payment.status.toLowerCase()}</span>
                {["PAID", "FREE"].includes(payment.status) ? (
                  <button type="button" onClick={() => openInvoice(payment)} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-bold hover:border-amber-500"><FileText className="h-3.5 w-3.5" /> Invoice {payment.invoiceNumber}</button>
                ) : payment.status === "PENDING" ? (
                  <button type="button" onClick={() => checkPending(payment)} disabled={busy} className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-bold hover:border-amber-500">I've paid — check</button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
