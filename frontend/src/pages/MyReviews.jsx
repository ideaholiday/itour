import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, MessageSquare, CheckCircle2, Clock, Image, ArrowRight, ShieldCheck, Tag, ThumbsUp, Calendar, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import ReviewCard from "../components/traveler/ReviewCard.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import SeoHead from "../components/SeoHead.jsx";

export default function MyReviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("REVIEWS"); // 'REVIEWS' | 'UNREVIEWED'
  const [selectedBookingForReview, setSelectedBookingForReview] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [reviewsRes, eligibleRes] = await Promise.all([
        api.getMyReviews().catch(() => ({ reviews: [] })),
        api.getEligibleReviews().catch(() => ({ bookings: [] })),
      ]);
      setReviews(reviewsRes?.reviews || []);
      setEligibleBookings(eligibleRes?.bookings || []);
    } catch (err) {
      setError(err.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalReviews = reviews.length;
  const totalPhotos = reviews.reduce((acc, r) => acc + (r.photos?.length || 0), 0);
  const avgRatingGiven = totalReviews > 0
    ? (reviews.reduce((acc, r) => acc + (r.experience_rating || r.rating || 5), 0) / totalReviews).toFixed(1)
    : "—";

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-stone-950 py-10 px-4 sm:px-6 lg:px-8">
      <SeoHead
        title="My Reviews | Idea Holiday"
        description="View and manage your verified traveler reviews and rate your completed travel experiences."
      />

      <div className="max-w-4xl mx-auto space-y-8">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Traveler Profile
            </span>
            <h1 className="font-display text-3xl font-extrabold text-stone-950 dark:text-stone-50">
              My Reviews & Feedback
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Your genuine reviews help fellow travelers make informed decisions and help operators maintain high quality.
            </p>
          </div>
          <Link
            to="/my-bookings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline"
          >
            <span>View all bookings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* ── Stat Highlights ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs text-center">
            <span className="text-[10px] font-bold uppercase text-stone-400">Reviews Written</span>
            <div className="text-2xl font-black text-stone-900 dark:text-stone-100 font-mono mt-1">
              {totalReviews}
            </div>
          </div>
          <div className="p-4 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs text-center">
            <span className="text-[10px] font-bold uppercase text-stone-400">Avg Rating Given</span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1 flex items-center justify-center gap-1">
              {avgRatingGiven} {avgRatingGiven !== "—" && <Star className="w-4 h-4 fill-amber-400 text-amber-500 inline" />}
            </div>
          </div>
          <div className="p-4 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs text-center">
            <span className="text-[10px] font-bold uppercase text-stone-400">Photos Shared</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {totalPhotos}
            </div>
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center gap-2 border-b border-stone-200 dark:border-stone-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("REVIEWS")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "REVIEWS"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            My Reviews ({reviews.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("UNREVIEWED")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "UNREVIEWED"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            <span>Unreviewed Trips</span>
            {eligibleBookings.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 text-[10px] grid place-items-center font-bold">
                {eligibleBookings.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Tab Contents ── */}
        {loading ? (
          <div className="p-12 text-center text-xs text-stone-400 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
            Loading your reviews...
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-800">
            {error}
          </div>
        ) : activeTab === "REVIEWS" ? (
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="p-10 text-center rounded-3xl border border-dashed border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-3">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">
                  You haven't written any reviews yet.
                </p>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  After completing a tour, package or airport transfer, you can submit verified feedback here.
                </p>
                {eligibleBookings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("UNREVIEWED")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-xs transition"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>Review your recent trip ({eligibleBookings.length} waiting)</span>
                  </button>
                )}
              </div>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="space-y-2">
                  <div className="flex items-center justify-between px-2 text-[11px] text-stone-500">
                    <span className="font-bold text-stone-800 dark:text-stone-200">
                      Experience: {rev.product_title || "Travel Experience"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      rev.status === "PUBLISHED"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    }`}>
                      {rev.status === "PUBLISHED" ? "Published" : "Under Moderation"}
                    </span>
                  </div>
                  <ReviewCard review={rev} />
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Unreviewed Trips Tab ── */
          <div className="space-y-4">
            {eligibleBookings.length === 0 ? (
              <div className="p-10 text-center rounded-3xl border border-dashed border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-2">
                <p className="text-sm font-bold text-stone-700 dark:text-stone-300">
                  All caught up!
                </p>
                <p className="text-xs text-stone-500">
                  You have reviewed all your completed bookings. Thank you for helping the community!
                </p>
              </div>
            ) : (
              eligibleBookings.map((b) => (
                <div
                  key={b.id}
                  className="p-5 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                      Completed Trip
                    </span>
                    <h3 className="font-display text-base font-bold text-stone-900 dark:text-stone-100">
                      {b.product_title}
                    </h3>
                    <p className="text-xs text-stone-500">
                      Booking Ref: <strong className="font-mono text-stone-700 dark:text-stone-300">{b.ref}</strong>
                      {b.activity_date && ` · Traveled on ${b.activity_date}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedBookingForReview(b)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-xs transition shrink-0"
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Write Review</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Review Modal ── */}
        {selectedBookingForReview && (
          <ReviewModal
            booking={selectedBookingForReview}
            onClose={() => setSelectedBookingForReview(null)}
            onSuccess={() => {
              setSelectedBookingForReview(null);
              loadData();
            }}
          />
        )}
      </div>
    </div>
  );
}
