import React, { useState } from "react";
import { Star, MessageSquare, ArrowUpDown, Filter, ChevronDown, CheckCircle2, Camera } from "lucide-react";
import ReviewCard from "./ReviewCard";
import Button from "../ui/Button";

export function ReviewGallery({
  reviews = [],
  avgRating = 0,
  totalReviews = 0,
  distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  quality = null,
  onWriteReview = null,
  canWriteReview = false,
  selectedRating = "ALL",
  onRatingChange = null,
  sortBy = "newest",
  onSortChange = null,
  loading = false,
  pagination = null,
  onLoadMore = null,
}) {
  const [internalRating, setInternalRating] = useState("ALL");
  const [internalSort, setInternalSort] = useState("newest");

  const currentRating = onRatingChange ? selectedRating : internalRating;
  const currentSort = onSortChange ? sortBy : internalSort;

  const handleRatingClick = (rating) => {
    if (onRatingChange) {
      onRatingChange(rating);
    } else {
      setInternalRating(rating);
    }
  };

  const handleSortChange = (e) => {
    const val = e.target.value;
    if (onSortChange) {
      onSortChange(val);
    } else {
      setInternalSort(val);
    }
  };

  // If filtered locally (fallback when no server-side handler provided)
  const displayReviews = onRatingChange
    ? reviews
    : reviews
        .filter((r) => {
          if (currentRating === "ALL") return true;
          const stars = Math.floor(r.experience_rating ?? r.rating ?? 5);
          return stars === parseInt(currentRating, 10);
        })
        .sort((a, b) => {
          if (currentSort === "highest") {
            return (b.experience_rating ?? b.rating ?? 0) - (a.experience_rating ?? a.rating ?? 0);
          }
          if (currentSort === "lowest") {
            return (a.experience_rating ?? a.rating ?? 0) - (b.experience_rating ?? b.rating ?? 0);
          }
          if (currentSort === "most_helpful") {
            return (b.helpful_count ?? 0) - (a.helpful_count ?? 0);
          }
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

  // Calculate rating distribution totals
  const totalInDist = Object.values(distribution || {}).reduce((acc, curr) => acc + (Number(curr) || 0), 0) || totalReviews || 1;

  // Collect all photos from all reviews
  const allPhotos = reviews.flatMap((r) => (r.photos || []).map((p) => (typeof p === "string" ? p : p.photo_url || p.url))).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* ── Summary & Breakdown Card ── */}
      <div className="p-6 rounded-3xl border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Overall Rating Block */}
          <div className="md:col-span-4 flex flex-col items-center md:items-start justify-center border-b md:border-b-0 md:border-r border-stone-200 dark:border-stone-800 pb-5 md:pb-0 md:pr-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Verified Experience Rating
            </span>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-black text-stone-950 dark:text-stone-50 font-mono tracking-tight">
                {avgRating > 0 ? Number(avgRating).toFixed(1) : "—"}
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-0.5 text-amber-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(avgRating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-stone-300 dark:text-stone-700"
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-stone-500 font-medium">
                  {totalReviews > 0 ? `Based on ${totalReviews} verified ${totalReviews === 1 ? "review" : "reviews"}` : "No verified reviews yet"}
                </div>
              </div>
            </div>

            {quality && quality.score_100 > 0 && (
              <div className="mt-3 flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Quality Score: {quality.score_100}/100 ({quality.tier})</span>
              </div>
            )}
          </div>

          {/* Distribution Bars */}
          <div className="md:col-span-5 space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = Number(distribution[stars] || 0);
              const pct = totalInDist > 0 ? Math.round((count / totalInDist) * 100) : 0;
              const isSelected = String(currentRating) === String(stars);

              return (
                <button
                  type="button"
                  key={stars}
                  onClick={() => handleRatingClick(isSelected ? "ALL" : String(stars))}
                  className={`w-full flex items-center gap-2.5 text-xs text-left group rounded-lg px-1.5 py-0.5 transition ${
                    isSelected ? "bg-amber-100/70 dark:bg-amber-950/50" : "hover:bg-stone-200/40 dark:hover:bg-stone-800/40"
                  }`}
                >
                  <span className="w-7 text-[11px] font-bold text-stone-600 dark:text-stone-400 flex items-center gap-0.5 shrink-0">
                    {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-500 inline" />
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isSelected ? "bg-amber-600" : "bg-amber-400 group-hover:bg-amber-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-[10px] text-stone-400 text-right font-mono shrink-0">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action / CTA Column */}
          <div className="md:col-span-3 flex flex-col items-center md:items-end justify-center gap-3">
            {onWriteReview && (
              <button
                type="button"
                onClick={onWriteReview}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-sm transition hover:shadow"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Write a Review</span>
              </button>
            )}
            <p className="text-[10px] text-stone-400 text-center md:text-right leading-relaxed">
              Reviews can only be submitted after completing a verified booking.
            </p>
          </div>
        </div>
      </div>

      {/* ── Filter & Sorting Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Star Rating Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["ALL", "5", "4", "3", "2", "1"].map((star) => {
            const isSelected = String(currentRating) === star;
            return (
              <button
                key={star}
                type="button"
                onClick={() => handleRatingClick(star)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-amber-500 text-stone-950 shadow-xs"
                    : "bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
                }`}
              >
                {star === "ALL" ? "All Stars" : `${star}★`}
              </button>
            );
          })}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <label htmlFor="review-sort" className="text-[11px] font-bold text-stone-500 flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" />
            Sort:
          </label>
          <select
            id="review-sort"
            value={currentSort}
            onChange={handleSortChange}
            className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-bold text-stone-800 dark:text-stone-200 outline-hidden focus:border-amber-500"
          >
            <option value="newest">Newest First</option>
            <option value="highest">Highest Rating</option>
            <option value="lowest">Lowest Rating</option>
            <option value="most_helpful">Most Helpful</option>
          </select>
        </div>
      </div>

      {/* ── Review Cards List ── */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-stone-400 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
            Loading reviews...
          </div>
        ) : displayReviews.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-200 dark:border-stone-800 p-8 text-center text-xs text-stone-400 bg-white dark:bg-stone-900 space-y-2">
            <p className="font-semibold text-stone-600 dark:text-stone-300">
              {currentRating !== "ALL"
                ? `No ${currentRating}-star reviews found.`
                : "No verified traveler reviews yet."}
            </p>
            <p className="text-[11px]">
              {currentRating !== "ALL"
                ? "Try selecting another rating filter above."
                : "Book this experience and be the first to share your verified review!"}
            </p>
          </div>
        ) : (
          displayReviews.map((rev) => <ReviewCard key={rev.id || rev._id} review={rev} />)
        )}
      </div>

      {/* ── Load More / Pagination ── */}
      {pagination && pagination.hasNext && onLoadMore && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="px-6 py-2.5 rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-xs font-bold text-stone-800 dark:text-stone-200 shadow-xs transition"
          >
            {loading ? "Loading..." : `Load More Reviews (${pagination.total - displayReviews.length} remaining)`}
          </button>
        </div>
      )}
    </div>
  );
}

export default ReviewGallery;
