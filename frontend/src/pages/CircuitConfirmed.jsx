import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Clock3, KeyRound, Layers3, MapPin, Printer, RotateCcw, ShieldCheck, TestTube2, Ticket } from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import { printConfirmedCircuitVoucher } from "../lib/circuitPrint.js";

function formatDate(value) {
  if (!value) return "Date pending";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export default function CircuitConfirmed() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const purchaseTracked = useRef(false);
  const isDemo = params.get("demo") === "1";

  useEffect(() => {
    api.getCircuitOrder(ref)
      .then((response) => setOrder(response.order))
      .catch((loadError) => setError(loadError.message || "Your circuit confirmation could not be loaded."));
  }, [ref]);

  useEffect(() => {
    if (!order || purchaseTracked.current || order.status !== "CONFIRMED") return;
    purchaseTracked.current = true;
    analytics.trackPurchase(order.orderRef, {
      id: order.orderId,
      title: `Circuit ${order.orderRef}`,
      category: "CIRCUIT",
      city: "India",
      price_inr: order.breakdown.totalAmount,
    }, order.breakdown.totalAmount, isDemo ? "DEMO" : order.payment.provider);
  }, [order, isDemo]);

  if (error) return <div className="mx-auto max-w-xl px-5 py-20 text-center text-rose-800">{error}</div>;
  if (!order) return <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-stone-600">Loading your complete circuit…</div>;

  const confirmed = order.status === "CONFIRMED" && order.payment.status === "PAID";
  return (
    <div className="min-h-[75vh] bg-[#FAF9F6] px-4 py-12 text-stone-900 sm:px-6">
      <SeoHead title={`Circuit ${order.orderRef} confirmed`} description="Your complete Idea Holiday circuit is confirmed." noindex />
      <div className="mx-auto max-w-4xl">
        <header className="text-center">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-4 text-white shadow-lg ${confirmed ? "border-emerald-200 bg-emerald-600" : "border-amber-200 bg-amber-600"}`}><Check className="h-10 w-10 stroke-[3]" /></div>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-900"><Layers3 className="h-3.5 w-3.5" /> Complete circuit · {order.items.length} bookings</span>
          <h1 className="mt-4 font-serif text-4xl font-bold sm:text-5xl">{confirmed ? "Your whole circuit is confirmed." : "Your circuit needs attention."}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">{confirmed ? `One verified payment confirmed all ${order.items.length} experiences together. Each supplier is now completing its acceptance step.` : "No individual circuit booking has been presented as confirmed. Please contact support or return to checkout."}</p>
        </header>

        {isDemo && <div className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900"><TestTube2 className="h-4 w-4" /> Demo grouped payment completed—no money was charged.</div>}

        <article className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-md">
          <div className="bg-stone-950 p-6 text-white sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Circuit order reference</p><strong className="mt-1 block font-mono text-2xl tracking-wider text-amber-300">{order.orderRef}</strong></div><span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-300">PAID ONCE · ALL CONFIRMED</span></div><div className="mt-6 flex flex-wrap gap-5 text-xs text-stone-300"><span className="inline-flex items-center gap-2"><Ticket className="h-4 w-4 text-amber-300" />{order.items.length} booking references</span><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" />₹{Number(order.breakdown.totalAmount).toLocaleString("en-IN")} verified total</span></div></div>
          <div className="space-y-4 p-5 sm:p-7">
            {order.items.map((item) => (
              <section key={item.orderItemId} className="rounded-2xl border border-stone-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Circuit stop {item.sequenceNumber}</p><h2 className="mt-1 font-serif text-xl font-bold">{item.productTitle}</h2><p className="mt-1 text-xs text-stone-500">{item.supplierName || "Verified marketplace supplier"}</p></div><div className="text-right"><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-800">CONFIRMED</span><strong className="mt-2 block font-mono text-xs text-stone-600">{item.bookingRef}</strong></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-stone-50 p-3 text-xs"><CalendarDays className="h-4 w-4 text-amber-700" /><span className="mt-2 block text-stone-500">Date</span><strong className="mt-1 block">{formatDate(item.activityDate)}</strong></div><div className="rounded-xl bg-stone-50 p-3 text-xs"><Clock3 className="h-4 w-4 text-amber-700" /><span className="mt-2 block text-stone-500">Pickup time</span><strong className="mt-1 block">{item.pickupTime}</strong></div><div className="rounded-xl bg-stone-50 p-3 text-xs"><MapPin className="h-4 w-4 text-emerald-700" /><span className="mt-2 block text-stone-500">Status</span><strong className="mt-1 block">Supplier acceptance pending</strong></div></div>
              </section>
            ))}
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-900"><KeyRound className="h-4 w-4" /> Pickup codes stay private</div><p className="mt-2 text-xs leading-relaxed text-stone-600">Each booking has its own secure pickup OTP. Open My Trips to view it, and share it only after checking the correct driver and vehicle.</p></div>
          </div>
        </article>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap"><button type="button" onClick={() => printConfirmedCircuitVoucher(order)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-6 py-3 text-sm font-black text-white hover:bg-stone-800"><Printer className="h-4 w-4 text-amber-300" /> Print official circuit voucher</button><Link to={`/circuit/${order.orderRef}/manage`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-stone-950 hover:bg-amber-400"><RotateCcw className="h-4 w-4" /> Manage complete circuit</Link><Link to="/bookings" className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50"><Ticket className="h-4 w-4" /> Open My Trips</Link><Link to="/circuit-planner" className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50">Plan another circuit <ArrowRight className="h-4 w-4" /></Link></div>
      </div>
    </div>
  );
}
