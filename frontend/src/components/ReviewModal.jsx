import React, { useState } from "react";
import { CheckCircle2, Star, X } from "lucide-react";
import { api } from "../lib/api.js";

const tagOptions = ["ON_TIME", "FRIENDLY_DRIVER", "CLEAN_VEHICLE", "GREAT_GUIDE", "GOOD_VALUE", "ACCURATE_LISTING", "SAFE_DRIVING", "POOR_COMMUNICATION", "LATE_PICKUP", "VEHICLE_ISSUE", "ITINERARY_ISSUE"];

function RatingInput({ label, value, onChange, optional }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-stone-700">{label}</span>
        {optional && <span className="text-[9px] text-stone-400 font-bold">Optional</span>}
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button type="button" key={score} onClick={() => onChange(score)} aria-label={`${label} ${score} stars`}>
            <Star className={`h-7 w-7 transition ${score <= value ? "fill-amber-400 text-amber-500" : "text-stone-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewModal({ booking, onClose, onSuccess }) {
  const [experienceRating, setExperienceRating] = useState(5);
  const [supplierRating, setSupplierRating] = useState(5);
  const [driverRating, setDriverRating] = useState(booking.driver_name ? 5 : null);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState([]);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 6));
  async function submit() {
    setSaving(true); setError("");
    try {
      const data = await api.createReview({ bookingId: booking.id, experienceRating, supplierRating, driverRating, title, comment, tags, wouldRecommend });
      onSuccess?.(data); onClose();
    } catch (err) { setError(err.message || "Review could not be submitted"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-stone-200 bg-white p-6 text-stone-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Verified completed trip</span>
            <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Review {booking.product_title}</h2>
            <p className="mt-1 text-xs text-stone-500">Booking {booking.ref} · Ratings are separated so quality issues reach the right team.</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-stone-100 hover:bg-stone-200 p-2 text-stone-500"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <RatingInput label="Experience" value={experienceRating} onChange={setExperienceRating} />
          <RatingInput label="Supplier" value={supplierRating} onChange={setSupplierRating} />
          {booking.driver_name && <RatingInput label={`Driver · ${booking.driver_name}`} value={driverRating} onChange={setDriverRating} optional />}
        </div>
        <div className="mt-6 space-y-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Short review title" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white outline-none" />
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={5} placeholder="What went well? What should improve?" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white outline-none" />
        </div>
        <div className="mt-5">
          <span className="text-xs font-bold text-stone-700">Quick quality signals</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagOptions.map((tag) => (
              <button type="button" key={tag} onClick={() => toggleTag(tag)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${tags.includes(tag) ? "border-amber-400 bg-amber-100 text-amber-900" : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50"}`}>
                {tag.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-5 flex items-center gap-2 text-xs font-bold text-stone-700">
          <input type="checkbox" checked={wouldRecommend} onChange={(event) => setWouldRecommend(event.target.checked)} className="accent-amber-500 h-4 w-4 rounded" /> I would recommend this experience
        </label>
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[10px] leading-relaxed text-stone-600">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />Only completed bookings can review. Contact details, promotional links or high-risk language are held for moderation.
        </div>
        {error && <p className="mt-3 rounded-xl bg-rose-50 border border-rose-300 p-3 text-xs text-rose-800">{error}</p>}
        <div className="mt-5 flex justify-end gap-3 border-t border-stone-200 pt-4">
          <button onClick={onClose} className="rounded-xl border border-stone-300 bg-stone-100 hover:bg-stone-200 px-4 py-2.5 text-xs font-bold text-stone-700">Later</button>
          <button disabled={saving || comment.trim().length < 10} onClick={submit} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 disabled:opacity-40 shadow-sm">Submit verified review</button>
        </div>
      </div>
    </div>
  );
}
