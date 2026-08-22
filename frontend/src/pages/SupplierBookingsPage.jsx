import React, { useState, useEffect } from "react";
import SupplierHeaderNav from "../components/supplier/SupplierHeaderNav.jsx";
import SupplierBookingManager from "../components/supplier/SupplierBookingManager.jsx";
import { useAuth } from "../lib/auth.jsx";
import { api, authHeaders } from "../lib/api.js";
import { AlertTriangle, Headphones, Star } from "lucide-react";

export default function SupplierBookingsPage() {
  const { user } = useAuth();
  const supplierId = user?.user_metadata?.supplier_id || user?.supplier_id || "sup_lucknow_cabs";
  const [supplierData, setSupplierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supportCases, setSupportCases] = useState([]);
  const [replyingCase, setReplyingCase] = useState(null);
  const [supportReply, setSupportReply] = useState("");
  const [reviewData, setReviewData] = useState({ reviews: [], quality: null });
  const [reviewReply, setReviewReply] = useState("");
  const [replyingReview, setReplyingReview] = useState(null);

  const sendSupportReply = async () => {
    if (!replyingCase || !supportReply.trim()) return;
    try {
      await api.addSupportMessage(replyingCase, { message: supportReply });
      setReplyingCase(null);
      setSupportReply("");
      fetchSupplierData();
    } catch (err) { window.alert(err.message || "Reply could not be sent"); }
  };

  const fetchSupplierData = async () => {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupplierData(data);
      }
      const support = await api.getSupportCases().catch(() => ({ cases: [] }));
      setSupportCases(support.cases || []);
      const reviews = await api.getSupplierReviews(supplierId).catch(() => ({ reviews: [], quality: null }));
      setReviewData(reviews);
    } catch (err) {
      console.error("Failed to fetch supplier data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, [supplierId]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <SupplierHeaderNav supplierData={supplierData} activeTab="BOOKINGS" />
        <SupplierBookingManager
          supplierData={supplierData}
          loading={loading}
          onRefresh={fetchSupplierData}
        />
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Verified traveler quality</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">Ratings and public responses</h2></div>{reviewData.quality && <div className="text-right"><strong className="text-3xl text-amber-600">{reviewData.quality.score_100}</strong><span className="text-xs text-stone-500"> / 100 quality</span><p className="text-[10px] font-bold text-emerald-700">{reviewData.quality.tier} · {reviewData.quality.review_count} reviews</p></div>}</div><div className="mt-4 grid gap-3 md:grid-cols-2">{reviewData.reviews.slice(0, 8).map((review) => <article key={review.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="flex justify-between"><div className="flex gap-1">{[1,2,3,4,5].map((score) => <Star key={score} className={`h-3.5 w-3.5 ${score <= review.supplier_rating ? "fill-amber-500 text-amber-500" : "text-stone-300"}`} />)}</div><span className="text-[9px] font-bold text-stone-500">{review.status}</span></div><h3 className="mt-2 text-sm font-bold text-stone-900">{review.title || review.product_title}</h3><p className="mt-2 text-xs leading-relaxed text-stone-600">{review.comment}</p>{review.supplier_response ? <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900"><strong className="block text-[9px] uppercase text-emerald-800">Your public response</strong>{review.supplier_response}</div> : review.status === "PUBLISHED" && <><button onClick={() => setReplyingReview(review.id)} className="mt-3 text-xs font-bold text-emerald-700 underline">Write public response</button>{replyingReview === review.id && <div className="mt-2 flex gap-2"><input value={reviewReply} onChange={(event) => setReviewReply(event.target.value)} placeholder="Thank the traveler or address feedback…" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white p-2 text-xs" /><button onClick={async () => { await api.respondToReview(review.id, reviewReply); setReviewReply(""); setReplyingReview(null); fetchSupplierData(); }} className="rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm">Publish</button></div>}</>}</article>)}{!reviewData.reviews.length && <p className="rounded-2xl border border-dashed border-stone-300 p-7 text-center text-xs text-stone-500 md:col-span-2">Verified reviews will appear after completed trips.</p>}</div></section>
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Guest support</span><h2 className="mt-1 flex items-center gap-2 font-serif text-xl font-bold text-stone-900"><Headphones className="h-5 w-5 text-amber-600" /> Cases requiring supplier response</h2></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 border border-amber-300">{supportCases.filter((item) => !["RESOLVED", "REJECTED", "CLOSED"].includes(item.status)).length} active</span></div><p className="mt-2 text-xs text-stone-600">Private operations notes are excluded. Reply through support when operations requests supplier information.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{supportCases.slice(0, 6).map((item) => <div key={item.id} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><div className="flex items-center justify-between"><strong className="text-xs text-amber-800">{item.case_ref}</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-900">{item.status.replaceAll("_", " ")}</span></div><h3 className="mt-2 text-sm font-bold text-stone-900">{item.subject}</h3><p className="mt-1 text-[10px] text-stone-500">Booking {item.booking_ref} · {item.case_type.replaceAll("_", " ")}</p>{item.priority === "URGENT" && <span className="mt-2 inline-flex items-center gap-1 text-[9px] font-bold text-rose-600"><AlertTriangle className="h-3 w-3" /> URGENT</span>}<button onClick={() => setReplyingCase(item.case_ref)} className="mt-3 block text-xs font-bold text-amber-700 underline">Reply with information</button>{replyingCase === item.case_ref && <div className="mt-3 flex gap-2"><input value={supportReply} onChange={(event) => setSupportReply(event.target.value)} placeholder="Supplier response…" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white p-2.5 text-xs" /><button onClick={sendSupportReply} className="rounded-xl bg-amber-500 px-3 text-xs font-bold text-stone-950 shadow-sm">Send</button></div>}</div>)}{!supportCases.length && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-xs text-stone-500 md:col-span-2">No support cases are linked to your bookings.</p>}</div></section>
      </div>
    </div>
  );
}
