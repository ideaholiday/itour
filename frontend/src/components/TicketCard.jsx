import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { activityPath } from "../lib/activityUrl.js";
import {
  Clock,
  Heart,
  MapPin,
  Star,
  Car,
  Compass,
  Package as PackageIcon,
  Ticket,
  Sparkles,
  Check,
  Zap,
} from "lucide-react";
import { useCurrency } from "../lib/currency.jsx";

const FALLBACK_IMAGES = {
  TRANSFER: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80",
  TOUR: "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=800&q=80",
  DAY_TOUR: "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=800&q=80",
  PACKAGE: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=800&q=80",
  MULTI_DAY_PACKAGE: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=800&q=80",
  ATTRACTION: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?auto=format&fit=crop&w=800&q=80",
  EXPERIENCE: "https://images.unsplash.com/photo-1506461883276-594a12b11cf3?auto=format&fit=crop&w=800&q=80",
};

const PRODUCT_TYPE_CONFIG = {
  TRANSFER: {
    label: "Transfer",
    color: "bg-indigo-600 text-white",
    icon: Car,
  },
  TOUR: {
    label: "Tour",
    color: "bg-blue-600 text-white",
    icon: Compass,
  },
  DAY_TOUR: {
    label: "Day Tour",
    color: "bg-blue-600 text-white",
    icon: Compass,
  },
  PACKAGE: {
    label: "Package",
    color: "bg-amber-500 text-stone-950",
    icon: PackageIcon,
  },
  MULTI_DAY_PACKAGE: {
    label: "Package",
    color: "bg-amber-500 text-stone-950",
    icon: PackageIcon,
  },
  ATTRACTION: {
    label: "Attraction",
    color: "bg-rose-600 text-white",
    icon: Ticket,
  },
  EXPERIENCE: {
    label: "Experience",
    color: "bg-emerald-600 text-white",
    icon: Sparkles,
  },
};

/**
 * TicketCard — World-class travel activity & transfer card
 * Inspired by GetYourGuide, Klook, and Viator design standards.
 */
export default function TicketCard({ activity }) {
  const { formatPrice, currency } = useCurrency();
  const {
    id,
    title,
    images,
    heroImage,
    hero_image,
    price_inr,
    priceInr,
    strike_price_inr,
    strikePriceInr,
    rating,
    review_count,
    reviewCount,
    bestseller,
    duration_hours,
    durationHours,
    duration_days,
    durationDays,
    destination_name,
    city,
    groupType,
    group_type,
    productType,
    product_type,
    productSubType,
    product_sub_type,
  } = activity || {};

  const rawType = (productType || product_type || "TOUR").toUpperCase();
  const rawSubType = (productSubType || product_sub_type || "").toUpperCase();
  const loc = destination_name || city || "India";

  const isTransfer = rawType === "TRANSFER";
  const isPackage = rawType === "PACKAGE" || rawType === "MULTI_DAY_PACKAGE";
  const isShared =
    !isTransfer &&
    (rawSubType === "SIC" ||
      rawSubType === "TICKET_SIC" ||
      groupType === "SHARED" ||
      group_type === "SHARED" ||
      title?.toLowerCase().includes("shared") ||
      title?.toLowerCase().includes("sic"));

  const defaultFallback = FALLBACK_IMAGES[rawType] || FALLBACK_IMAGES.TOUR;
  const initialImg =
    (images && Array.isArray(images) && images.length > 0 && typeof images[0] === "string" && images[0].trim().length > 5)
      ? images[0].trim()
      : (typeof heroImage === "string" && heroImage.trim().length > 5)
      ? heroImage.trim()
      : (typeof hero_image === "string" && hero_image.trim().length > 5)
      ? hero_image.trim()
      : defaultFallback;

  const [imgSrc, setImgSrc] = useState(initialImg);

  useEffect(() => {
    setImgSrc(initialImg);
  }, [initialImg]);

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
  } else if (isTransfer) {
    durationLabel = "Flexible";
  }

  const effectivePrice = priceInr ?? price_inr ?? 0;
  const effectiveStrike = strikePriceInr ?? strike_price_inr;
  const rawReviews = reviewCount ?? review_count;
  const effectiveRating = Number(rating || 4.8).toFixed(1);

  const typeConfig = PRODUCT_TYPE_CONFIG[rawType] || PRODUCT_TYPE_CONFIG.TOUR;
  const TypeIcon = typeConfig.icon;

  const [wishlist, setWishlist] = useState(false);

  return (
    <Link
      to={activityPath(id, title)}
      className="group block h-full text-stone-900 dark:text-stone-100"
      aria-label={`${title}, starting from ${formatPrice(effectivePrice)}`}
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-card card-hover">
        {/* Photo Container — bulletproof aspect ratio that never collapses */}
        <div className="relative aspect-[16/10] sm:aspect-[4/3] min-h-[185px] w-full overflow-hidden bg-stone-100 dark:bg-stone-800">
          <img
            src={imgSrc}
            alt={title || "Activity"}
            loading="lazy"
            decoding="async"
            onError={() => setImgSrc(defaultFallback)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />

          {/* Subtle bottom gradient for image contrast */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-stone-950/60 via-stone-950/10 to-transparent" />

          {/* Badges Top-Left */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm backdrop-blur-xs ${typeConfig.color}`}
            >
              <TypeIcon className="h-3 w-3" />
              <span>{isTransfer ? "Airport Transfer" : typeConfig.label}</span>
            </span>

            {bestseller && (
              <span className="relative overflow-hidden rounded-md bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-950 shadow-sm">
                ⭐ Bestseller
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
              </span>
            )}

            {isShared ? (
              <span className="rounded-md bg-stone-900/85 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                SIC / Shared
              </span>
            ) : isTransfer ? (
              <span className="rounded-md bg-stone-900/80 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                Private Cab
              </span>
            ) : null}
          </div>

          {/* Wishlist Heart Top-Right — optimistic toggle */}
          <button
            type="button"
            aria-label={wishlist ? "Remove from wishlist" : "Save to wishlist"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setWishlist((w) => !w);
            }}
            className={`absolute top-2.5 right-2.5 z-10 grid h-8 w-8 place-items-center rounded-full shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-110 ${
              wishlist
                ? "bg-rose-500 text-white scale-110"
                : "bg-white/90 dark:bg-stone-900/90 text-stone-400 hover:bg-rose-50 dark:hover:bg-stone-800 hover:text-rose-500"
            }`}
          >
            <Heart className={`h-4 w-4 transition-all duration-200 ${wishlist ? "fill-current" : ""}`} />
          </button>

          {/* Location on photo bottom */}
          <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-[11px] font-bold text-white drop-shadow-sm">
            <MapPin className="h-3 w-3 text-amber-400" />
            <span className="capitalize">{loc}</span>
          </div>
        </div>

        {/* Card Body */}
        <div className="flex flex-1 flex-col p-4">
          {/* Category breadcrumb & duration row */}
          <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            <span className="uppercase tracking-wider text-[10px] font-bold text-amber-800 dark:text-amber-400">
              {isTransfer ? "Private Airport Transfer" : isPackage ? "Holiday Package" : "Experience"}
            </span>
            {durationLabel && (
              <span className="flex items-center gap-1 shrink-0 font-medium text-stone-500 dark:text-stone-400">
                <Clock className="h-3 w-3 text-stone-400" />
                {durationLabel}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="mt-1.5 font-display text-[15px] sm:text-base font-bold leading-snug text-stone-900 dark:text-stone-100 line-clamp-2 min-h-[2.6rem] group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
            {title}
          </h3>

          {/* Ratings & Social Proof (Viator style) */}
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <div className="flex items-center text-amber-500">
              <Star className="h-3.5 w-3.5 fill-current" />
            </div>
            <span className="font-bold text-stone-900 dark:text-stone-100">{effectiveRating}</span>
            <span className="text-stone-400 dark:text-stone-500">
              {rawReviews && rawReviews > 0
                ? `(${Number(rawReviews).toLocaleString()})`
                : "· Verified Partner"}
            </span>
          </div>

          {/* Key Value Props (Klook / Viator / GetYourGuide style) */}
          <div className="mt-2.5 space-y-1 text-[11px] text-stone-600 dark:text-stone-400">
            {isTransfer ? (
              <>
                <div className="flex items-center gap-1.5 truncate">
                  <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">60 min airport wait & flight tracking</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Door-to-door AC cab · Highway tolls included</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5 truncate">
                  <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Instant booking confirmation</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">Verified local guide & sanitized travel</span>
                </div>
              </>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1 min-h-3" />

          {/* Price & Cancellation Footer */}
          <div className="mt-3 flex items-end justify-between border-t border-stone-100 dark:border-stone-800/80 pt-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                From
              </span>
              <div className="flex items-baseline gap-1.5">
                {effectiveStrike && (
                  <span className="text-xs text-rose-400 line-through font-semibold">
                    {formatPrice(effectiveStrike)}
                  </span>
                )}
                <span className="font-display text-xl font-extrabold text-stone-900 dark:text-stone-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                  {formatPrice(effectivePrice)}
                </span>
                <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  {isTransfer
                    ? "/ vehicle"
                    : isPackage
                    ? "/ person"
                    : isShared
                    ? "/ seat"
                    : "/ person"}
                </span>
              </div>
              {currency !== "INR" && (
                <span className="block text-[9px] text-stone-400 font-mono">
                  (₹{Number(effectivePrice).toLocaleString("en-IN")})
                </span>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              {effectiveStrike && (
                <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {Math.round(((effectiveStrike - effectivePrice) / effectiveStrike) * 100)}% OFF
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                <Check className="h-3 w-3" />
                <span>Free cancel</span>
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
