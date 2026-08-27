import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Info,
  Layers3,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  TestTube2,
  Users,
  WalletCards,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import { useAuth } from "../lib/auth.jsx";

const PAYMENT_OPTIONS = [
  {
    id: "CASHFREE",
    name: "Cashfree",
    description: "UPI, cards, netbanking and wallets in one secure payment.",
    badge: "RECOMMENDED",
    icon: CreditCard,
  },
  {
    id: "RAZORPAY",
    name: "Razorpay",
    description: "Pay the complete circuit using UPI, cards or netbanking.",
    badge: "SECURE",
    icon: WalletCards,
  },
  {
    id: "DEMO",
    name: "Demo sandbox payment",
    description: "Confirm the complete test circuit instantly with ₹0 charged.",
    badge: "TEST MODE",
    icon: TestTube2,
  },
];

function loadScript(id, src, globalName) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window[globalName]) return resolve(window[globalName]);
    const existing = document.getElementById(id);
    if (existing) {
      if (typeof window !== "undefined" && window[globalName]) return resolve(window[globalName]);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof window !== "undefined" && window[globalName]) {
          clearInterval(interval);
          resolve(window[globalName]);
        } else if (attempts > 40) {
          clearInterval(interval);
          existing.remove();
          loadScript(id, src, globalName).then(resolve).catch(reject);
        }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && window[globalName]) {
        resolve(window[globalName]);
      } else {
        reject(new Error(`${globalName} checkout failed to load`));
      }
    };
    script.onerror = () => reject(new Error(`${globalName} checkout failed to load`));
    document.body.appendChild(script);
  });
}

function formatDate(value) {
  if (!value) return "Date pending";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function remainingLabel(milliseconds) {
  if (milliseconds <= 0) return "Reservation expired";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} remaining`;
}

export default function CircuitCheckout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASHFREE");
  const [processing, setProcessing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadOrder = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.getCircuitOrder(id);
      setOrder(response.order);
      if (response.order.payment?.provider) setPaymentMethod(response.order.payment.provider);
    } catch (loadError) {
      setError(loadError.message || "This circuit reservation could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadOrder();
  }, [id, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!order) return;
    if (order.status === "CONFIRMED") {
      navigate(`/circuit-confirmed/${encodeURIComponent(order.orderRef)}`, { replace: true });
      return;
    }
    analytics.trackBeginCheckout({
      id: order.orderId,
      title: `Circuit ${order.orderRef}`,
      category: "CIRCUIT",
      city: "India",
      price_inr: order.breakdown.totalAmount,
    }, order.breakdown.totalAmount, order.adultsCount + order.childrenCount);
  }, [order?.orderId, order?.status]);

  const expiresAt = order ? new Date(order.holdExpiresAt).getTime() : 0;
  const millisecondsRemaining = expiresAt - now;
  const expired = Boolean(order) && millisecondsRemaining <= 0;
  const providerLocked = order?.payment?.orderId ? order.payment.provider : null;
  const payable = Number(order?.breakdown?.totalAmount || 0);
  const groupedItems = useMemo(() => order?.items || [], [order]);

  async function openCashfree(orderResponse) {
    if (!orderResponse.paymentSessionId) throw new Error("Cashfree payment session is unavailable. Please retry.");
    const Cashfree = await loadScript("cashfree-js-sdk", "https://sdk.cashfree.com/js/v3/cashfree.js", "Cashfree");
    const mode = ["PROD", "PRODUCTION"].includes(String(orderResponse.environment).toUpperCase()) ? "production" : "sandbox";
    const result = await Cashfree({ mode }).checkout({
      paymentSessionId: orderResponse.paymentSessionId,
      redirectTarget: "_modal",
    });
    if (result?.error) throw new Error(result.error.message || "Cashfree payment was cancelled.");
    return api.verifyCircuitPayment(order.orderId, {
      provider: "CASHFREE",
      paymentOrderId: orderResponse.paymentOrderId,
    });
  }

  async function openRazorpay(orderResponse) {
    if (!orderResponse.keyId) throw new Error("Razorpay is not configured for this environment.");
    const Razorpay = await loadScript("razorpay-checkout-js", "https://checkout.razorpay.com/v1/checkout.js", "Razorpay");
    const payment = await new Promise((resolve, reject) => {
      const instance = new Razorpay({
        key: orderResponse.keyId,
        amount: orderResponse.amountInMinorUnits || Math.round(orderResponse.amount * 100),
        currency: orderResponse.currency || "INR",
        order_id: orderResponse.paymentOrderId,
        name: "Idea Holiday",
        description: `Complete circuit ${order.orderRef}`,
        prefill: {
          name: order.traveler.name,
          email: order.traveler.email,
          contact: order.traveler.phone,
        },
        theme: { color: "#047857" },
        handler: resolve,
        modal: { ondismiss: () => reject(new Error("Razorpay payment was cancelled.")) },
      });
      instance.on("payment.failed", (event) => reject(new Error(event?.error?.description || "Razorpay payment failed.")));
      instance.open();
    });
    return api.verifyCircuitPayment(order.orderId, {
      provider: "RAZORPAY",
      paymentOrderId: payment.razorpay_order_id,
      paymentId: payment.razorpay_payment_id,
      signature: payment.razorpay_signature,
    });
  }

  async function handleGroupedPayment() {
    if (!order || processing) return;
    if (expired || order.status !== "PENDING_PAYMENT") {
      setError("This reservation is no longer payable. Return to the planner for a fresh live quote.");
      return;
    }
    setProcessing(true);
    setError("");
    try {
      let result;
      if (paymentMethod === "DEMO") {
        result = await api.completeCircuitDemoPayment(order.orderId);
      } else {
        const paymentOrder = await api.createCircuitPaymentOrder(order.orderId, {
          provider: paymentMethod,
          returnUrl: `${window.location.origin}/circuit-checkout/${encodeURIComponent(order.orderId)}?order_id={order_id}`,
        });
        result = paymentMethod === "CASHFREE"
          ? await openCashfree(paymentOrder)
          : await openRazorpay(paymentOrder);
      }
      if (result.reviewRequired || !result.success) {
        setOrder(result.order || order);
        setError("The payment needs operations review. No circuit booking was activated or partially confirmed.");
        return;
      }
      const confirmedOrder = result.order || order;
      navigate(`/circuit-confirmed/${encodeURIComponent(confirmedOrder.orderRef)}${paymentMethod === "DEMO" ? "?demo=1" : ""}`);
    } catch (paymentError) {
      const message = paymentError.message || "The grouped payment could not be completed. Your circuit was not partially confirmed.";
      await loadOrder().catch(() => {});
      setError(message);
    } finally {
      setProcessing(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-amber-700" />
        <h1 className="mt-5 font-serif text-3xl font-bold">Sign in to continue circuit checkout</h1>
        <Link to={`/login?from=${encodeURIComponent(`/circuit-checkout/${id}`)}`} className="mt-6 inline-flex rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-stone-950">Continue securely</Link>
      </div>
    );
  }
  if (loading) return <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-stone-600">Preparing your grouped checkout…</div>;
  if (!order) return <div className="mx-auto max-w-xl px-5 py-20 text-center text-rose-800">{error || "Circuit order not found."}</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-10 text-stone-900 sm:px-6">
      <SeoHead title={`Circuit checkout ${order.orderRef}`} description="Pay once to confirm your complete Idea Holiday circuit." noindex />
      <div className="mx-auto max-w-6xl">
        <Link to={`/circuit-planner?id=${encodeURIComponent(order.itineraryId)}`} className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-amber-800"><ArrowLeft className="h-4 w-4" /> Back to Circuit Planner</Link>

        <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_380px]">
          <main className="space-y-6">
            <header className="overflow-hidden rounded-3xl bg-stone-950 p-6 text-white shadow-xl sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-300"><Layers3 className="h-3.5 w-3.5" /> Grouped circuit checkout</span>
              <h1 className="mt-4 font-serif text-4xl font-bold">One payment. Your whole circuit.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-300">Every experience below is reserved together. Payment either confirms all {groupedItems.length} bookings or activates none of them.</p>
              <div className={`mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-sm font-bold ${expired ? "bg-rose-500/20 text-rose-200" : "bg-amber-400/15 text-amber-200"}`}><Clock3 className="h-4 w-4" /> {remainingLabel(millisecondsRemaining)}</div>
            </header>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Circuit order</p><h2 className="mt-1 font-serif text-2xl font-bold">{order.orderRef}</h2></div><span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-black text-amber-900">{groupedItems.length} BOOKINGS · ONE CHARGE</span></div>
              <div className="mt-5 space-y-3">
                {groupedItems.map((item) => (
                  <article key={item.orderItemId} className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-[42px_1fr_auto] sm:items-center">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 font-mono text-sm font-black text-amber-900">{item.sequenceNumber}</span>
                    <div><h3 className="text-sm font-bold">{item.productTitle}</h3><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.activityDate)}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{item.pickupTime}</span><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.supplierName || "Verified supplier"}</span></p></div>
                    <strong className="font-mono text-sm">₹{Number(item.breakdown.totalAmount).toLocaleString("en-IN")}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="font-serif text-xl font-bold">Choose one payment method</h2><p className="text-xs text-stone-500">The selected gateway receives only the parent circuit total.</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {PAYMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = paymentMethod === option.id;
                  const disabled = Boolean(providerLocked && providerLocked !== option.id);
                  return <button key={option.id} type="button" disabled={disabled || processing} onClick={() => setPaymentMethod(option.id)} className={`relative rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/15" : "border-stone-200 hover:border-stone-300"} disabled:cursor-not-allowed disabled:opacity-40`}><Icon className={`h-5 w-5 ${selected ? "text-emerald-700" : "text-stone-500"}`} /><span className="mt-3 block text-[8px] font-black uppercase tracking-wider text-stone-500">{option.badge}</span><strong className="mt-1 block text-sm">{option.name}</strong><span className="mt-1 block text-[11px] leading-relaxed text-stone-500">{option.description}</span>{selected && <Check className="absolute right-3 top-3 h-4 w-4 text-emerald-700" />}</button>;
                })}
              </div>
              {providerLocked && <p className="mt-3 text-xs text-stone-500">This reservation is securely attached to {providerLocked}. Complete or retry that payment session.</p>}
            </section>

            {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          </main>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-md">
              <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-700" /><div><p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Protected total</p><p className="text-xs text-stone-600">Server-verified in INR</p></div></div>
              <div className="mt-6 space-y-3 text-xs"><div className="flex justify-between text-stone-600"><span>Experiences and transfers</span><strong>₹{Number(order.breakdown.baseAmount).toLocaleString("en-IN")}</strong></div><div className="flex justify-between text-stone-600"><span>Taxes, tolls and permits</span><strong>₹{Number(order.breakdown.taxesAmount).toLocaleString("en-IN")}</strong></div><div className="flex justify-between border-t border-stone-200 pt-4 text-base"><span className="font-bold">One payment</span><strong className="font-mono text-2xl">₹{payable.toLocaleString("en-IN")}</strong></div></div>
              <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-xs text-stone-600"><div className="flex items-center gap-2 font-bold text-stone-900"><Users className="h-4 w-4 text-amber-700" />{order.adultsCount} adult{order.adultsCount !== 1 ? "s" : ""}{order.childrenCount ? ` · ${order.childrenCount} children` : ""}</div><p className="mt-2">Traveler: {order.traveler.name}</p></div>
              <button type="button" onClick={handleGroupedPayment} disabled={processing || expired || order.status !== "PENDING_PAYMENT"} className="mt-5 w-full rounded-2xl bg-amber-500 px-5 py-4 text-sm font-black text-stone-950 shadow-md transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">{processing ? "Confirming the complete circuit…" : paymentMethod === "DEMO" ? "Confirm demo circuit · ₹0 charged" : `Pay ₹${payable.toLocaleString("en-IN")} once via ${paymentMethod === "CASHFREE" ? "Cashfree" : "Razorpay"}`}</button>
              <p className="mt-3 text-center text-[10px] leading-relaxed text-stone-500">No child booking is confirmed until the complete parent payment is verified.</p>
            </section>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-900"><strong className="block">Atomic booking protection</strong><span className="mt-1 block">If verification fails, every reservation stays unconfirmed and the complete hold is released together.</span></div>
          </aside>
        </div>
      </div>
    </div>
  );
}
