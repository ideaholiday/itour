import React, { useState, useRef } from "react";
import { CheckCircle2, Star, X, Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { api } from "../lib/api.js";

const tagOptions = ["ON_TIME", "FRIENDLY_DRIVER", "CLEAN_VEHICLE", "GREAT_GUIDE", "GOOD_VALUE", "ACCURATE_LISTING", "SAFE_DRIVING", "POOR_COMMUNICATION", "LATE_PICKUP", "VEHICLE_ISSUE", "ITINERARY_ISSUE"];

function RatingInput({ label, value, onChange, optional }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-300">{label}</span>
        {optional && <span className="text-[9px] text-stone-400 font-bold">Optional</span>}
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button type="button" key={score} onClick={() => onChange(score)} aria-label={`${label} ${score} stars`}>
            <Star className={`h-7 w-7 transition ${score <= value ? "fill-amber-400 text-amber-500" : "text-stone-300 dark:text-stone-700"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewModal({ booking, onClose, onSuccess }) {
  const [experienceRating, setExperienceRating] = useState(5);
  const [supplierRating, setSupplierRating] = useState(5);
  const [driverRating, setDriverRating] = useState(booking?.driver_name ? 5 : null);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const toggleTag = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 6));

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (photos.length + files.length > 5) {
      setError("You can upload a maximum of 5 photos per review.");
      return;
    }

    setUploadingPhoto(true);
    setError("");

    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 5 * 1024 * 1024) {
          setError("Each photo must be under 5MB.");
          continue;
        }

        // Convert file to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upload to backend
        const res = await api.uploadFile({
          data: base64,
          filename: file.name,
          mimeType: file.type,
          entityType: "REVIEW",
          entityId: booking?.id || null,
        });

        if (res?.url) {
          setPhotos((prev) => [...prev, res.url]);
        }
      }
    } catch (err) {
      console.error("Photo upload error", err);
      setError("Failed to upload photo. You can still submit the review without it.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (indexToRemove) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const data = await api.createReview({
        bookingId: booking.id,
        experienceRating,
        supplierRating,
        driverRating,
        title,
        comment,
        tags,
        photos,
        wouldRecommend,
      });
      onSuccess?.(data);
      onClose();
    } catch (err) {
      setError(err.message || "Review could not be submitted");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 text-stone-900 dark:text-stone-100 shadow-2xl">
        <div className="flex items-start justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">Verified completed trip</span>
            <h2 className="mt-1 font-display text-2xl font-bold text-stone-900 dark:text-stone-100">Review {booking.product_title}</h2>
            <p className="mt-1 text-xs text-stone-500">Booking {booking.ref} · Ratings are separated so quality issues reach the right team.</p>
          </div>
          <button onClick={onClose} className="rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 p-2 text-stone-500"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <RatingInput label="Experience" value={experienceRating} onChange={setExperienceRating} />
          <RatingInput label="Supplier" value={supplierRating} onChange={setSupplierRating} />
          {booking.driver_name && <RatingInput label={`Driver · ${booking.driver_name}`} value={driverRating} onChange={setDriverRating} optional />}
        </div>

        <div className="mt-6 space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Short review title (e.g. Unforgettable day with punctual guide!)"
            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-[#FAF9F6] dark:bg-stone-800/60 p-3 text-sm text-stone-900 dark:text-stone-100 focus:border-amber-500 focus:bg-white dark:focus:bg-stone-800 outline-hidden"
          />
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What went well? What should improve? (Minimum 10 characters)"
            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-[#FAF9F6] dark:bg-stone-800/60 p-3 text-sm text-stone-900 dark:text-stone-100 focus:border-amber-500 focus:bg-white dark:focus:bg-stone-800 outline-hidden"
          />
        </div>

        {/* Photo Upload Section */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-amber-600" />
              Add Photos (Optional, max 5)
            </span>
            <span className="text-[10px] text-stone-400 font-medium">
              {photos.length} / 5 photos
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {photos.map((url, idx) => (
              <div key={idx} className="relative w-16 h-16 rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-700 group">
                <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                </button>
              </div>
            ))}

            {photos.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-amber-500 dark:hover:border-amber-500 flex flex-col items-center justify-center text-stone-400 hover:text-amber-600 transition"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span className="text-[9px] font-bold mt-0.5">Upload</span>
                  </>
                )}
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelect}
              accept="image/*"
              multiple
              className="hidden"
            />
          </div>
        </div>

        {/* Quality signals / tags */}
        <div className="mt-5">
          <span className="text-xs font-bold text-stone-700 dark:text-stone-300">Quick quality signals</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagOptions.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${
                  tags.includes(tag)
                    ? "border-amber-400 bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300"
                    : "border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700"
                }`}
              >
                {tag.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-5 flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-300">
          <input
            type="checkbox"
            checked={wouldRecommend}
            onChange={(event) => setWouldRecommend(event.target.checked)}
            className="accent-amber-500 h-4 w-4 rounded"
          />
          I would recommend this experience to other travelers
        </label>

        <div className="mt-5 rounded-2xl border border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/40 dark:border-amber-800/50 p-3 text-[10px] leading-relaxed text-stone-600 dark:text-stone-400">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />
          Only completed bookings can review. Contact details, promotional links or high-risk language are held for moderation.
        </div>

        {error && <p className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 p-3 text-xs text-rose-800 dark:text-rose-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-3 border-t border-stone-200 dark:border-stone-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 px-4 py-2.5 text-xs font-bold text-stone-700 dark:text-stone-300"
          >
            Later
          </button>
          <button
            disabled={saving || comment.trim().length < 10 || uploadingPhoto}
            onClick={submit}
            className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-bold text-stone-950 disabled:opacity-40 shadow-xs transition inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Submit verified review</span>
          </button>
        </div>
      </div>
    </div>
  );
}
