import React, { useState } from "react";
import { Star, ThumbsUp, CheckCircle, ShieldCheck, Tag, X, User, Calendar } from "lucide-react";
import Avatar from "../ui/Avatar";
import api from "../../lib/api";

export function ReviewCard({ review, onVoteHelpful }) {
  const [helpfulCount, setHelpfulCount] = useState(
    review.helpful_count ?? review.helpful_votes ?? 0
  );
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);

  const travelerName = review.traveler_name || review.author || "Verified Traveler";
  const experienceRating = Number(review.experience_rating ?? review.rating ?? 5);
  const comment = review.comment || review.review_text || "";
  const title = review.title || "";
  const tags = Array.isArray(review.tags) ? review.tags : [];
  const photos = review.photos || [];
  const supplierResponse = review.supplier_response || review.supplier_reply;
  const supplierRespondedAt = review.supplier_responded_at;
  const travelDate = review.activity_date || review.travel_date;
  const formattedDate = review.created_at ? new Date(review.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : null;

  const handleHelpful = async () => {
    if (voted || voting) return;
    setVoting(true);
    try {
      const res = await api.voteReviewHelpfulness(review.id, true);
      if (res?.counts?.helpful_count !== undefined) {
        setHelpfulCount(res.counts.helpful_count);
      } else {
        setHelpfulCount((prev) => prev + 1);
      }
      setVoted(true);
      if (onVoteHelpful) onVoteHelpful(review.id);
    } catch (err) {
      console.error("Failed to record helpfulness vote", err);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs space-y-3.5 transition-all">
      {/* Header with user avatar, verification, and rating */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={travelerName} size="md" />
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                {travelerName}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                <CheckCircle className="w-2.5 h-2.5" />
                Verified Trip
              </span>
              {review.would_recommend !== false && review.wouldRecommend !== false && (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200/50">
                  Recommends
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
              {travelDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-2.5 h-2.5" />
                  Traveled {travelDate}
                </span>
              )}
              {formattedDate && <span>· Reviewed {formattedDate}</span>}
            </div>
          </div>
        </div>

        {/* Rating Score Badge */}
        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/60 dark:border-amber-800/40 px-2.5 py-1 rounded-xl text-amber-700 dark:text-amber-400 font-bold text-xs shrink-0">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
          <span>{experienceRating.toFixed(1)}</span>
        </div>
      </div>

      {/* Multi-entity rating badges (if supplier/driver ratings are available) */}
      {(review.supplier_rating || review.driver_rating) && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {review.supplier_rating && (
            <span className="inline-flex items-center gap-1 text-stone-500 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md">
              Operator: <strong className="text-stone-800 dark:text-stone-200 font-mono">{review.supplier_rating}★</strong>
            </span>
          )}
          {review.driver_rating && (
            <span className="inline-flex items-center gap-1 text-stone-500 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md">
              Driver: <strong className="text-stone-800 dark:text-stone-200 font-mono">{review.driver_rating}★</strong>
            </span>
          )}
        </div>
      )}

      {/* Title & Comment */}
      <div className="space-y-1">
        {title && (
          <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
            {title}
          </h4>
        )}
        <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line">
          {comment}
        </p>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 text-[9px] font-bold text-stone-600 dark:text-stone-400 border border-stone-200/60 dark:border-stone-700/60"
            >
              <Tag className="w-2.5 h-2.5 text-stone-400" />
              {tag.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      )}

      {/* Review Photos */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1.5 scrollbar-thin">
          {photos.map((photo, idx) => {
            const url = typeof photo === "string" ? photo : photo.photo_url || photo.url;
            return (
              <button
                type="button"
                key={idx}
                onClick={() => setActivePhoto(url)}
                className="relative rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 group focus:outline-hidden"
              >
                <img
                  src={url}
                  alt={`Traveler photo ${idx + 1}`}
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover group-hover:scale-105 transition-transform duration-200"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Supplier Response */}
      {supplierResponse && (
        <div className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-300">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Response from Host / Operator</span>
            {supplierRespondedAt && (
              <span className="text-[10px] font-normal text-stone-400 ml-auto">
                {new Date(supplierRespondedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed pl-5">
            {supplierResponse}
          </p>
        </div>
      )}

      {/* Footer / Helpful vote */}
      <div className="pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-500">
        <span className="text-[11px]">Was this review helpful to you?</span>
        <button
          type="button"
          onClick={handleHelpful}
          disabled={voted || voting}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            voted
              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              : "hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700"
          }`}
        >
          <ThumbsUp className={`w-3.5 h-3.5 ${voted ? "fill-amber-600 text-amber-600" : ""}`} />
          <span>{voted ? "Thank you!" : `Helpful (${helpfulCount})`}</span>
        </button>
      </div>

      {/* Lightbox Photo Modal */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setActivePhoto(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] bg-stone-900 rounded-3xl overflow-hidden p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActivePhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              aria-label="Close image"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={activePhoto}
              alt="Enlarged traveler photo"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewCard;
