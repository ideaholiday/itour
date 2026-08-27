import React from "react";
import { Link } from "react-router-dom";
import { Clock, Heart, MapPin, Star, Sparkles, Compass, Car, Ticket, Waves } from "lucide-react";
import { useCurrency } from "../lib/currency.jsx";

const PRODUCT_TYPE_BADGES = {
  PACKAGE: { label: "Package", color: "bg-amber-500 text-stone-950" },
  TOUR: { label: "Tour", color: "bg-blue-600 text-white" },
  TRANSFER: { label: "Transfer", color: "bg-indigo-600 text-white" },
  ATTRACTION: { label: "Attraction", color: "bg-rose-600 text-white" },
  EXPERIENCE: { label: "Experience", color: "bg-emerald-600 text-white" },
  DAY_TOUR: { label: "Tour", color: "bg-blue-600 text-white" },
  MULTI_DAY_PACKAGE: { label: "Package", color: "bg-amber-500 text-stone-950" },
};

/**
 * TicketCard — Photo-first card used across the marketplace for all 5 product types.
 */
export default function TicketCard({ activity }) {
  const { formatPrice, currency } = useCurrency();
  const {
    id, title, images, heroImage, hero_image,
    price_inr, priceInr, strike_price_inr, strikePriceInr,
    rating, review_count, reviewCount,
    bestseller, duration_hours, durationHours, duration_days, durationDays,
    destination_name, city, category,
    groupType, group_type, productType, product_type,
    productSubType, product_sub_type
  } = activity;

  const rawType = (productType || product_type || "TOUR").toUpperCase();
  const rawSubType = (productSubType || product_sub_type || "").toUpperCase();
  const img = images?.[0] || heroImage || hero_image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80";
  const loc = destination_name || city || "India";
  
  const isTransfer = rawType === "TRANSFER";
  const isPackage = rawType === "PACKAGE" || rawType === "MULTI_DAY_PACKAGE";
  const isShared = !isTransfer && (
    rawSubType === "SIC" ||
    rawSubType === "TICKET_SIC" ||
    groupType === "SHARED" || group_type === "SHARED" ||
    title?.toLowerCase().includes("shared") ||
    title?.toLowerCase().includes("sic")
  );

  let durationLabel = "";
  const dDays = durationDays || duration_days;
  const dHours = durationHours || duration_hours;
  if (dDays && dDays > 1) {
    durationLabel = `${dDays} days`;
  } else if (dHours) {
    if (dHours >= 24) {
      const days = Math.round(dHours / 24);
      durationLabel = `${days} day${days > 1 ? "s" : ""}`;
    } else if (dHours >= 1) {
      durationLabel = `${dHours}h`;
    } else {
      durationLabel = `${Math.round(dHours * 60)}m`;
    }
  }

  const effectivePrice = priceInr ?? price_inr ?? 0;
  const effectiveStrike = strikePriceInr ?? strike_price_inr;
  const effectiveReviews = reviewCount ?? review_count ?? 12;

  const typeBadge = PRODUCT_TYPE_BADGES[rawType] || PRODUCT_TYPE_BADGES.TOUR;

  return (
    <Link
      to={`/activity/${id}`}
      className="group block h-full text-stone-900"
      aria-label={`${title}, starting from ${formatPrice(effectivePrice)}`}
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-stone-300 hover:shadow-lg">
        {/* Photo container */}
        <div className="relative aspect-4/3 w-full overflow-hidden bg-stone-100">
          <img
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />

          {/* Badges top-left */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-xs ${typeBadge.color}`}>
              {typeBadge.label}
            </span>
            {bestseller && (
              <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-stone-950 shadow-xs">
                Bestseller
              </span>
            )}
            {isShared && (
              <span className="rounded-md bg-stone-900/80 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                SIC / Shared
              </span>
            )}
          </div>

          {/* Wishlist heart */}
          <button
            type="button"
            aria-label="Save to wishlist"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="absolute top-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-xs backdrop-blur-xs transition hover:scale-110 hover:bg-white hover:text-rose-500"
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>

        {/* Card body */}
        <div className="flex flex-1 flex-col p-4">
          {/* Destination + duration row */}
          <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0 text-amber-700" />
              <span className="truncate">{loc}</span>
            </span>
            {durationLabel && (
              <span className="flex items-center gap-1 shrink-0 text-stone-400">
                <Clock className="h-3 w-3" />
                {durationLabel}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="mt-1.5 font-display text-sm font-bold leading-snug text-stone-900 line-clamp-2 group-hover:text-amber-800">
            {title}
          </h3>

          {/* Rating */}
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <div className="flex items-center gap-1">
              <div className="flex items-center text-amber-500">
                <Star className="h-3.5 w-3.5 fill-current" />
              </div>
              <span className="font-bold text-stone-900">{Number(rating || 4.8).toFixed(1)}</span>
              <span className="text-stone-400">({effectiveReviews.toLocaleString()})</span>
            </div>
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
                {effectiveStrike && (
                  <span className="text-xs text-stone-400 line-through">
                    {formatPrice(effectiveStrike)}
                  </span>
                )}
                <span className="font-display text-xl font-bold text-stone-900">
                  {formatPrice(effectivePrice)}
                </span>
                <span className="text-[10px] text-stone-400">
                  {isTransfer ? "/ vehicle" : isPackage ? "/ person" : isShared ? "/ seat" : "/ person"}
                </span>
              </div>
              {currency !== "INR" && (
                <span className="block text-[9px] text-stone-400 font-mono">
                  (₹{Number(effectivePrice).toLocaleString("en-IN")})
                </span>
              )}
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
