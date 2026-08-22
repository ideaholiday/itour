import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, Clock3, FileText, KeyRound, MapPin, RefreshCw, TestTube2, Ticket } from "lucide-react";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import SeoHead from "../components/SeoHead.jsx";

export default function BookingConfirmed() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const isDemo = params.get("demo") === "1";

  useEffect(() => {
    const handleLoadedBooking = (data) => {
      const b = data.booking || null;
      setBooking(b);
      if (b) {
        analytics.trackPurchase(ref, {
          id: b.product_id || b.activity_id,
          title: b.product_title,
          category: b.category || "Tour",
          city: b.city || "India",
          price_inr: b.total_price_inr || b.total_amount_inr || 0,
        }, b.total_price_inr || b.total_amount_inr || 0, isDemo ? "DEMO" : "CASHFREE");
      }
    };

    const orderId = params.get("order_id");
    if (orderId && (!booking || booking.payment_status !== "PAID")) {
      api.verifyCashfreePayment({ orderId, bookingRef: ref }).catch((err) => {
        console.warn("Cashfree return verification check:", err.message);
      }).finally(() => {
        api.getBooking(ref)
          .then(handleLoadedBooking)
          .catch((err) => setError(err.message || "Your ticket could not be loaded."));
      });
    } else {
      api.getBooking(ref)
        .then(handleLoadedBooking)
        .catch((err) => setError(err.message || "Your ticket could not be loaded."));
    }
    api.getBookingDocuments(ref).then((data) => setDocuments(data.documents || null)).catch(() => {});
  }, [ref, params, isDemo]);

  async function resendDocuments() {
    setSending(true);
    setNotice("");
    try {
      await api.resendGuestNotification(ref, "DOCUMENTS");
      setNotice("Voucher and invoice sent to your enabled email/WhatsApp channels.");
    } catch (err) {
      setNotice(err.message || "Documents could not be resent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-[70vh] bg-[#FAF9F6] px-4 py-12 text-stone-900">
      <div className="mx-auto max-w-2xl">
        <div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-emerald-200 bg-emerald-500 text-stone-950 shadow-md shadow-emerald-500/20"><Check className="h-10 w-10 stroke-[3] text-white" /></div><span className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-emerald-900 border border-emerald-300">Booking confirmed</span><h1 className="mt-3 font-serif text-4xl font-bold text-stone-900">A lovely day is now on your calendar.</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-stone-600">Your pickup details are saved and your local operator has everything needed to get the experience started smoothly.</p></div>

        {isDemo && <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900"><TestTube2 className="h-4 w-4" /> Demo payment completed—no money was charged.</div>}
        {error && <div className="mt-6 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-center text-sm text-rose-900">{error}</div>}

        <article className="mt-7 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          {booking?.hero_image && <img src={booking.hero_image} alt="" className="h-52 w-full object-cover" />}
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Booking reference</span><strong className="mt-1 block font-mono text-2xl tracking-wider text-amber-700">{ref}</strong></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-black text-emerald-900 border border-emerald-300">PAID · CONFIRMED</span></div>
            <h2 className="mt-5 font-serif text-2xl font-bold text-stone-900">{booking?.product_title || "Your Idea Holiday experience"}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-stone-50 border border-stone-200 p-4"><CalendarDays className="h-5 w-5 text-amber-600" /><span className="mt-3 block text-[10px] text-stone-500">Date</span><strong className="mt-1 block text-xs text-stone-900">{booking?.activity_date || "Loading…"}</strong></div><div className="rounded-2xl bg-stone-50 border border-stone-200 p-4"><Clock3 className="h-5 w-5 text-amber-600" /><span className="mt-3 block text-[10px] text-stone-500">Ready time</span><strong className="mt-1 block text-xs text-stone-900">{booking?.pickup_time || "Loading…"}</strong></div><div className="rounded-2xl bg-stone-50 border border-stone-200 p-4"><MapPin className="h-5 w-5 text-emerald-600" /><span className="mt-3 block text-[10px] text-stone-500">Pickup</span><strong className="mt-1 block text-xs text-stone-900">{booking?.pickup_location || "Loading…"}</strong></div></div>
            {booking?.drop_location && (
              <div className="mt-3 rounded-2xl bg-emerald-50/50 border border-emerald-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Destination Drop-off</span>
                  {booking?.flight_number && (
                    <span className="text-[10px] font-mono font-bold text-stone-700 bg-white px-2 py-0.5 rounded border border-stone-300">
                      Flight/Train: {booking.flight_number}
                    </span>
                  )}
                </div>
                <strong className="mt-1 block text-xs text-stone-900">{booking.drop_location}</strong>
              </div>
            )}
            {booking?.pickupOtp && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-900"><KeyRound className="h-4 w-4 text-amber-700" /> Traveler-only pickup code</div><strong className="mt-2 block font-mono text-3xl tracking-[.28em] text-stone-900">{booking.pickupOtp}</strong><p className="mt-2 text-xs leading-relaxed text-stone-600">Share this with the driver only after you meet the correct driver and verify the vehicle plate. The trip starts when the operator enters it.</p></div>}
            {documents && <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-700"><FileText className="h-4 w-4 text-amber-600" /> Travel documents</div><p className="mt-2 text-xs text-stone-600">Secure links expire automatically. The shareable voucher never contains your pickup code.</p><div className="mt-4 flex flex-wrap gap-2"><a href={documents.voucherUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-amber-100 border border-amber-300 px-4 py-2.5 text-xs font-bold text-amber-900">Open voucher</a><a href={documents.invoiceUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-stone-200 px-4 py-2.5 text-xs font-bold text-stone-800">Open invoice</a><button type="button" disabled={sending} onClick={resendDocuments} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 disabled:opacity-50 hover:bg-stone-100"><RefreshCw className={`h-3.5 w-3.5 ${sending ? "animate-spin" : ""}`} /> Send again</button></div>{notice && <p className="mt-3 text-xs text-amber-800">{notice}</p>}</div>}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Link to="/bookings" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-stone-950 hover:bg-amber-400 shadow-sm"><Ticket className="h-4 w-4" /> Open My Trips</Link><Link to="/search" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50">Keep exploring <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
        </article>
      </div>
    </div>
  );
}
