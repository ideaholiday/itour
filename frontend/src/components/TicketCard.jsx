import React from "react";
import { Link } from "react-router-dom";
import { Clock, Heart, MapPin, Star } from "lucide-react";

/**
 * ExperienceCard — Viator-style tall photo-first card used across the marketplace.
 * Replaces the old horizontal boarding-pass ticket card.
 */
export default function TicketCard({ activity }) {
  const {
    id, title, images, heroImage, hero_image,
    price_inr, strike_price_inr,
    rating, review_count,
    bestseller, duration_hours,
    destination_name, city, category,
    groupType, group_type, productType
  } = activity;

  const img = images?.[0] || heroImage || hero_image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80";
  const loc = destination_name || city || "India";
  const isTransfer = productType === "TRANSFER" || category?.toLowerCase().includes("transfer");
  const isShared = !isTransfer && (
    groupType === "SHARED" || group_type === "SHARED" ||
    title?.toLowerCase().includes("shared") ||
    title?.toLowerCase().includes("group tour") ||
    activity.pricingVariants?.some((p) =>
      p.pricing_model === "PER_PERSON" ||
      p.variant_name?.toLowerCase().includes("seat") ||
      p.variant_name?.toLowerCase().includes("shared")
    )
  );

  let durationLabel = "";
  if (duration_hours) {
    if (duration_hours >= 24) {
      const days = Math.round(duration_hours / 24);
      durationLabel = `${days} day${days > 1 ? "s" : ""}`;
    } else if (duration_hours >= 1) {
      durationLabel = `${duration_hours}h`;
    } else {
      durationLabel = `${Math.round(duration_hours * 60)}m`;
    }
  }

  const modeLabel = isTransfer
    ? "🚗 Transfer"
    : isShared
    ? "👥 Shared"
    : "🚗 Private";

  return (
    <Link to={`/activity/${id}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">

        {/* ── Image ── */}
        <div className="relative h-52 flex-shrink-0 overflow-hidden">
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Top-left badges */}
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {bestseller && (
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-stone-950 shadow-sm">
                Bestseller
              </span>
            )}
            <span className="rounded-full bg-stone-900/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              {modeLabel}
            </span>
          </div>

          {/* Wishlist */}
          <button
            aria-label="Save"
            onClick={(e) => e.preventDefault()}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow transition hover:scale-110 active:scale-95"
          >
            <Heart className="h-4 w-4 text-stone-400 hover:text-rose-500" />
          </button>

          {/* Bottom chips on image */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <MapPin className="h-3 w-3" />{loc}
            </span>
            {durationLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <Clock className="h-3 w-3" />{durationLabel}
              </span>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            {category || (isTransfer ? "Airport Transfer" : "Sightseeing")}
          </p>

          <h3 className="mt-1.5 line-clamp-2 min-h-[2.6rem] text-[15px] font-bold leading-snug text-stone-900 transition-colors group-hover:text-amber-800">
            {title}
          </h3>

          {/* Rating */}
          <div className="mt-2">
            {review_count > 0 ? (
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-stone-800">{Number(rating || 0).toFixed(1)}</span>
                <span className="text-xs text-stone-400">({Number(review_count).toLocaleString("en-IN")})</span>
              </div>
            ) : (
              <span className="text-[10px] font-semibold text-stone-400">New · no reviews yet</span>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Price row */}
          <div className="mt-4 flex items-end justify-between border-t border-stone-100 pt-3">
            <div>
              <span className="block text-[10px] font-semibold uppercase text-stone-400">
                From
              </span>
              <div className="flex items-baseline gap-1.5">
                {strike_price_inr && (
                  <span className="text-xs text-stone-400 line-through">
                    ₹{Number(strike_price_inr).toLocaleString("en-IN")}
                  </span>
                )}
                <span className="font-display text-xl font-bold text-stone-900">
                  ₹{Number(price_inr || 0).toLocaleString("en-IN")}
                </span>
                <span className="text-[10px] text-stone-400">
                  {isShared ? "/ seat" : "/ vehicle"}
                </span>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 border border-emerald-200">
              Free cancel
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
