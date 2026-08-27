import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Hotel,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Bus,
  Car,
  Ticket,
  AlertCircle,
  Info,
  Compass,
  Waves,
  Zap,
  Globe
} from "lucide-react";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import SeoHead from "../components/SeoHead.jsx";
import StarRating from "../components/StarRating.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import ReviewGallery from "../components/traveler/ReviewGallery.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import PriceCalendarWidget from "../components/traveler/PriceCalendarWidget.jsx";
import { useCurrency } from "../lib/currency.jsx";

const DEFAULT_VEHICLES = [
  { code: "SEDAN", name: "Sedan (Dzire / Etios)", pax: 4, bags: 3, icon: "🚗" },
  { code: "SUV", name: "SUV / MUV (Ertiga / Innova)", pax: 6, bags: 4, icon: "🚙" },
  { code: "PREMIUM_MUV", name: "Premium MUV (Innova Crysta)", pax: 6, bags: 5, icon: "🚐" },
  { code: "LUXURY", name: "Luxury Class (Mercedes / BMW)", pax: 3, bags: 3, icon: "✨" },
  { code: "GROUP_TEMPO", name: "Tempo Traveller (12-26 Seater)", pax: 26, bags: 20, icon: "🚌" },
];

const PRODUCT_TYPE_META = {
  PACKAGE: { label: "Holiday Package", badgeColor: "bg-amber-100 text-amber-900 border-amber-300", icon: Compass },
  TOUR: { label: "Tour & Sightseeing", badgeColor: "bg-blue-100 text-blue-900 border-blue-300", icon: Compass },
  TRANSFER: { label: "Private Transfer", badgeColor: "bg-indigo-100 text-indigo-900 border-indigo-300", icon: Car },
  ATTRACTION: { label: "Attraction", badgeColor: "bg-rose-100 text-rose-900 border-rose-300", icon: Ticket },
  EXPERIENCE: { label: "Experience", badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-300", icon: Waves },
  DAY_TOUR: { label: "Day Sightseeing", badgeColor: "bg-blue-100 text-blue-900 border-blue-300", icon: Compass },
  MULTI_DAY_PACKAGE: { label: "Multi-Day Package", badgeColor: "bg-amber-100 text-amber-900 border-amber-300", icon: Compass },
};

const PRODUCT_SUBTYPE_LABELS = {
  WITH_HOTEL: "Package with Hotel",
  WITHOUT_HOTEL: "Package without Hotel",
  SIC: "Shared SIC Coach",
  PRIVATE: "Private",
  AIRPORT_RAILWAY: "Airport / Railway Transfer",
  INTERCITY_HOTEL: "Intercity Hotel Transfer",
  CITY_TO_CITY: "City to City Transfer",
  TICKET_ONLY: "Ticket Only",
  TICKET_SIC: "Ticket + SIC Hotel Transfer",
  TICKET_PRIVATE: "Ticket + Private Transfer",
};

function localDate(daysFromToday = 0) {
  const value = new Date();
  value.setDate(value.getDate() + daysFromToday);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function vehicleForVariant(name = "") {
  const value = String(name).toLowerCase();
  if (/tempo|traveller|bus/.test(value)) return "GROUP_TEMPO";
  if (/luxury|mercedes|bmw|audi/.test(value)) return "LUXURY";
  if (/innova|crysta|hycross|premium muv/.test(value)) return "PREMIUM_MUV";
  if (/suv|ertiga|marazzo/.test(value)) return "SUV";
  return "SEDAN";
}

function startTimeFromActivity(activity) {
  if (activity?.itineraryItems?.length) {
    const first = activity.itineraryItems[0];
    if (first.time_label || first.timeLabel) return first.time_label || first.timeLabel;
  }
  const firstStop = Array.isArray(activity?.itinerary) ? activity.itinerary[0] : null;
  const match = String(firstStop?.duration || firstStop?.time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return "09:00";
  let hours = Number(match[1]);
  if (match[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
  if (match[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function TravelerCounter({ label, helper, value, min, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
      <div>
        <strong className="block text-xs text-stone-900">{label}</strong>
        <span className="text-[10px] text-stone-500">{helper}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-base text-stone-700 hover:bg-stone-100 disabled:opacity-30"
        >
          −
        </button>
        <span className="w-5 text-center text-sm font-bold text-stone-900">{value}</span>
        <button
          type="button"
          aria-label={`Add ${label}`}
          onClick={() => onChange(value + 1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-base text-stone-700 hover:bg-stone-100"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function ActivityDetail() {
  const { formatPrice, currency } = useCurrency();
  const { id } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState(null);
  const [date, setDate] = useState(() => localDate(1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedVehicle, setSelectedVehicle] = useState("SEDAN");
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedHotelTierId, setSelectedHotelTierId] = useState(null);
  const [ticketSelections, setTicketSelections] = useState({});
  const [openDayIndex, setOpenDayIndex] = useState(0);
  const [serverQuote, setServerQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [availabilityOptions, setAvailabilityOptions] = useState([]);
  const [availabilityChecked, setAvailabilityChecked] = useState(false);
  const [reviewData, setReviewData] = useState({ reviews: [], quality: null, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, totalReviews: 0, averageRating: 0, pagination: null });
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSort, setReviewSort] = useState("newest");
  const [reviewRating, setReviewRating] = useState("ALL");
  const [eligibleBooking, setEligibleBooking] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [availableAddons, setAvailableAddons] = useState([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);

  useEffect(() => {
    api.getProductAddons(id)
      .then((res) => {
        if (res?.addons) setAvailableAddons(res.addons);
      })
      .catch(() => {});
  }, [id]);

  const toggleAddon = (addonId) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((i) => i !== addonId) : [...prev, addonId]
    );
  };

  const headcount = (adults || 1) + (children || 0);
  const addonsTotalInr = useMemo(() => {
    return selectedAddonIds.reduce((sum, addonId) => {
      const addon = availableAddons.find((a) => a.id === addonId);
      if (!addon) return sum;
      return sum + (addon.perPerson ? addon.priceInr * headcount : addon.priceInr);
    }, 0);
  }, [selectedAddonIds, availableAddons, headcount]);

  const fetchReviews = (page = 1, append = false) => {
    setReviewLoading(true);
    const params = { page, limit: 10, sort: reviewSort };
    if (reviewRating !== "ALL") params.rating = reviewRating;
    api.getProductReviews(id, params)
      .then((data) => {
        setReviewData((prev) => ({
          ...data,
          reviews: append ? [...prev.reviews, ...(data.reviews || [])] : (data.reviews || [])
        }));
      })
      .catch(() => setReviewData((prev) => (append ? prev : { reviews: [], quality: null, distribution: {}, totalReviews: 0 })))
      .finally(() => setReviewLoading(false));
  };

  useEffect(() => {
    let active = true;
    api.getActivity(id).then((data) => {
      if (!active) return;
      setActivity(data);
      analytics.trackViewItem(data);
      if (data?.hotelTiers?.length) {
        const recommended = data.hotelTiers.find((h) => h.is_recommended) || data.hotelTiers[0];
        setSelectedHotelTierId(recommended?.id || null);
      }
      if (data?.vehicleOptions?.length) {
        const recVeh = data.vehicleOptions.find((v) => v.is_recommended) || data.vehicleOptions[0];
        if (recVeh) setSelectedVehicle(recVeh.vehicle_type || recVeh.vehicleType || "SEDAN");
      }
      if (data?.ticketTiers?.length) {
        const initial = {};
        data.ticketTiers.forEach((tier, idx) => {
          initial[tier.id] = idx === 0 ? 2 : 0; // Default 2 for top tier (e.g. Adult)
        });
        setTicketSelections(initial);
      }
      if ((data?.productType || data?.product_type) === "TRANSFER" && data?.pricingVariants?.length) {
        setSelectedVariant(data.pricingVariants[0]);
      }
    }).catch((error) => setQuoteError(error.message || "This experience is unavailable."));
    window.scrollTo(0, 0);
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    fetchReviews(1, false);
  }, [id, reviewSort, reviewRating]);

  useEffect(() => {
    api.getEligibleReviews()
      .then((res) => {
        const eligible = res?.bookings?.find((b) => b.product_id === id);
        setEligibleBooking(eligible || null);
      })
      .catch(() => setEligibleBooking(null));
  }, [id]);

  const rawProductType = activity?.productType || activity?.product_type || "TOUR";
  const productSubType = activity?.productSubType || activity?.product_sub_type || "";
  const isTransfer = rawProductType === "TRANSFER";
  const isPackage = rawProductType === "PACKAGE" || rawProductType === "MULTI_DAY_PACKAGE";
  const isTour = rawProductType === "TOUR" || rawProductType === "DAY_TOUR";
  const isAttraction = rawProductType === "ATTRACTION";
  const isExperience = rawProductType === "EXPERIENCE";
  const isSharedTour = Boolean(
    activity &&
    !isTransfer &&
    (activity.groupType === "SHARED" ||
      activity.group_type === "SHARED" ||
      productSubType === "SIC" ||
      productSubType === "TICKET_SIC" ||
      activity.pricingVariants?.some((item) => item.pricing_model === "PER_PERSON" && /shared|seat/i.test(item.variant_name || "")))
  );

  const ticketTiers = activity?.ticketTiers || [];
  const vehicleOptions = activity?.vehicleOptions || [];
  const hotelTiers = activity?.hotelTiers || [];
  const sicHubs = activity?.sicHubs || [];
  const itineraryItems = activity?.itineraryItems || [];
  const dayWiseDetails = activity?.packageItinerary?.dayWiseDetails || [];
  const sightseeingStops = Array.isArray(activity?.itinerary) ? activity.itinerary : [];
  const startTime = useMemo(() => startTimeFromActivity(activity), [activity]);

  // Request instant price quote when selections change
  useEffect(() => {
    if (!activity || !date) return;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      api.getBookingQuote({
        product_id: id,
        activity_date: date,
        adults: adults || 1,
        children: children || 0,
        luggage_bags: 0,
        vehicle_category: selectedVehicle,
        variant_name: selectedVariant?.variant_name || selectedVariant?.variantName || "Standard Booking",
        hotel_tier_id: selectedHotelTierId,
        ticket_selections: ticketSelections,
      })
        .then((data) => setServerQuote(data.quote))
        .catch((error) => {
          setServerQuote(null);
          setQuoteError(error.message || "Pricing currently unavailable for this configuration.");
        })
        .finally(() => setQuoteLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activity, id, date, adults, children, selectedVehicle, selectedVariant, selectedHotelTierId, ticketSelections]);

  if (!activity) {
    return <div className="mx-auto max-w-6xl px-5 py-20 text-center text-stone-500">{quoteError || "Loading experience details…"}</div>;
  }

  const variants = activity.pricingVariants?.length
    ? activity.pricingVariants
    : [{ variant_name: isSharedTour ? "Shared tour" : "Standard option", base_price: activity.priceInr || activity.price_inr }];
  const selectedVariantName = selectedVariant?.variant_name || selectedVariant?.variantName || "";
  const imagesList = activity.images?.filter(Boolean)?.length
    ? activity.images.filter(Boolean)
    : [activity.heroImage || activity.hero_image].filter(Boolean);

  const meetingPoint = isPackage
    ? activity.packageItinerary?.start_point || activity.packageItinerary?.start_city || `${activity.city} arrival point`
    : sicHubs.length > 0
    ? `${sicHubs[0].hub_name || sicHubs[0].hubName} (${sicHubs[0].departure_time || sicHubs[0].departureTime})`
    : (typeof sightseeingStops[0] === "string" ? sightseeingStops[0] : sightseeingStops[0]?.name) || `${activity.city} meeting point`;

  const goToCheckout = () => {
    const params = new URLSearchParams({
      date,
      adults: String(adults || 1),
      children: String(children || 0),
      vehicle: isSharedTour ? "SHARED_SEAT" : selectedVehicle,
      variant: selectedVariantName || (isTransfer ? "Private chauffeur transfer" : "Standard option"),
      time: startTime,
    });
    if (selectedHotelTierId) params.set("hotelTier", selectedHotelTierId);
    if (selectedAddonIds.length > 0) params.set("addons", selectedAddonIds.join(","));
    navigate(`/checkout/${id}?${params.toString()}`);
  };

  const typeMeta = PRODUCT_TYPE_META[rawProductType] || PRODUCT_TYPE_META.TOUR;
  const TypeIcon = typeMeta.icon;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": isPackage ? "TouristTrip" : "Product",
        "@id": `https://ideaholiday.in/activity/${activity.id}#product`,
        "name": activity.title,
        "description": activity.shortDesc || activity.short_desc || activity.description || activity.title,
        "image": imagesList.length ? imagesList : ["https://ideaholiday.in/idea-holiday-social.png"],
        "category": activity.category || typeMeta.label,
        "offers": {
          "@type": "Offer",
          "priceCurrency": "INR",
          "price": activity.priceInr || activity.price_inr || 999,
          "availability": "https://schema.org/InStock",
          "url": `https://ideaholiday.in/activity/${activity.id}`,
          "seller": { "@type": "Organization", "name": "Idea Holiday" }
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": activity.rating || 4.8,
          "reviewCount": activity.reviewCount || activity.review_count || 12,
          "bestRating": "5",
          "worstRating": "1"
        }
      }
    ]
  };

  // Group itinerary items by day if multi-day
  const multiDayItinerary = useMemo(() => {
    if (!itineraryItems.length) return null;
    const isMulti = itineraryItems.some((i) => Number(i.day_number || i.dayNumber) > 0) || isPackage;
    if (!isMulti) return null;
    const grouped = {};
    itineraryItems.forEach((item) => {
      const d = Number(item.day_number || item.dayNumber || 1);
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(item);
    });
    return grouped;
  }, [itineraryItems, isPackage]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title={`${activity.title} — Book on Idea Holiday`}
        description={activity.shortDesc || activity.short_desc || `Book ${activity.title} in ${activity.city || "India"} on Idea Holiday.`}
        canonical={`https://ideaholiday.in/activity/${activity.id}`}
        image={imagesList[0] || "https://ideaholiday.in/idea-holiday-social.png"}
        jsonLd={productJsonLd}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-2 text-xs text-stone-500">
          <Link to="/" className="hover:text-amber-800 transition">Home</Link>
          <span>›</span>
          <Link to="/search" className="hover:text-amber-800 transition">Marketplace</Link>
          {activity.city && (
            <>
              <span>›</span>
              <Link to={`/search?q=${encodeURIComponent(activity.city)}`} className="hover:text-amber-800 transition">{activity.city}</Link>
            </>
          )}
          <span>›</span>
          <span className="line-clamp-1 text-stone-700 font-medium">{activity.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${typeMeta.badgeColor}`}>
              <TypeIcon className="h-3 w-3" />
              {typeMeta.label}
            </span>
            {productSubType && PRODUCT_SUBTYPE_LABELS[productSubType] && (
              <span className="rounded-full bg-stone-100 border border-stone-200 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                {PRODUCT_SUBTYPE_LABELS[productSubType]}
              </span>
            )}
            <span className="text-stone-300">·</span>
            <span className="text-stone-600 flex items-center gap-1 font-medium">
              <MapPin className="h-3.5 w-3.5 text-stone-400" />
              {activity.city}, {activity.state}
            </span>
          </div>
          <h1 className="max-w-4xl font-display text-3xl font-bold text-stone-900 sm:text-4xl">{activity.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {reviewData.quality?.review_count > 0 ? (
              <StarRating rating={Number(reviewData.quality.average_rating)} count={reviewData.quality.review_count} size="md" />
            ) : (
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-500">
                ★ 4.8 · Verified Operator
              </span>
            )}
            <span className="text-emerald-800 font-semibold text-xs">Supplied by {activity.supplierName || "Idea Holiday Verified Partner"}</span>
            {activity.bestseller && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase text-stone-950">Bestseller</span>}
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
          <main className="space-y-8">

            {/* ── Photo Gallery ── */}
            <div className="overflow-hidden rounded-3xl shadow-sm border border-stone-200 bg-white">
              <img
                src={imagesList[0]}
                alt={activity.title}
                className="h-72 w-full object-cover sm:h-[420px]"
              />
              {imagesList.length > 1 && (
                <div className="hide-scrollbar flex gap-2 overflow-x-auto bg-[#FAF9F6] p-2">
                  {imagesList.slice(1).map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-20 w-28 flex-shrink-0 rounded-xl object-cover opacity-85 hover:opacity-100 cursor-pointer transition border border-stone-200"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Highlight chips ── */}
            <div className="flex flex-wrap gap-3">
              {[
                {
                  icon: Clock3,
                  label: activity.durationDays
                    ? `${activity.durationDays} Days`
                    : isPackage
                    ? `${activity.packageItinerary?.total_days || 3} Days`
                    : `${activity.durationHours || 4} Hours`,
                  sub: "Duration",
                },
                {
                  icon: Users,
                  label: isSharedTour ? "Shared Group (SIC)" : "Private",
                  sub: "Format",
                },
                { icon: MapPin, label: activity.city || "India", sub: "Location" },
                {
                  icon: ShieldCheck,
                  label: activity.freeCancellation !== false ? "Free Cancellation" : "Standard Policy",
                  sub: activity.cancellation_policy || "Up to 24h before",
                },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={sub} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
                  <Icon className="h-5 w-5 text-amber-600" />
                  <div>
                    <strong className="block text-sm text-stone-900">{label}</strong>
                    <span className="text-[11px] text-stone-500">{sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Highlights (Plan 14) ── */}
            {Array.isArray(activity.highlights) && activity.highlights.length > 0 && (
              <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
                <h2 className="font-display text-xl font-bold text-amber-950 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-600" /> Experience Highlights
                </h2>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {activity.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-stone-800">
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-900">
                        ✓
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Overview ── */}
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-display text-2xl font-bold text-stone-900">About this {typeMeta.label}</h2>
              <p className="text-sm leading-relaxed text-stone-700 whitespace-pre-line">{activity.fullDesc || activity.shortDesc}</p>

              {isTransfer && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Car className="h-4 w-4 text-indigo-700" />
                    <span>Private Doorstep Chauffeur Transfer</span>
                  </div>
                  <p className="text-xs leading-relaxed text-indigo-900">
                    Your dedicated chauffeur will meet you at the designated terminal / hotel address with flight tracking and inclusive Fastag tolls.
                  </p>
                </div>
              )}
            </section>

            {/* ── Hotel Tiers (Package with Hotel) ── */}
            {hotelTiers.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-stone-900 flex items-center gap-2">
                      <Hotel className="h-5 w-5 text-amber-600" /> Accommodation Options
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">Select your preferred hotel category for this package</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {hotelTiers.map((tier) => {
                    const isSelected = selectedHotelTierId === tier.id;
                    const props = Array.isArray(tier.example_properties)
                      ? tier.example_properties
                      : typeof tier.example_properties === "string"
                      ? JSON.parse(tier.example_properties || "[]")
                      : [];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedHotelTierId(tier.id)}
                        className={`rounded-2xl border-2 p-4 text-left transition-all ${
                          isSelected
                            ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400 shadow-sm"
                            : "border-stone-200 bg-stone-50 hover:border-amber-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-stone-900">{tier.tier_name || tier.tierName}</span>
                          {tier.is_recommended ? (
                            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-stone-950">Best Value</span>
                          ) : isSelected ? (
                            <Check className="h-4 w-4 text-amber-700" />
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs font-mono font-bold text-amber-800">
                          {tier.price_per_person_per_night_inr > 0
                            ? `+${formatPrice(tier.price_per_person_per_night_inr)} / person / night`
                            : "Included in base price"}
                        </p>
                        {props.length > 0 && (
                          <div className="mt-2 text-[10px] text-stone-500">
                            e.g. {props.join(", ")}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Vehicle Options (Transfers / Private Tours) ── */}
            {vehicleOptions.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900 flex items-center gap-2">
                    <Car className="h-5 w-5 text-indigo-600" /> Choose Vehicle Class
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">Fixed private vehicle fares — no hidden surge</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {vehicleOptions.map((v) => {
                    const isSelected = selectedVehicle === (v.vehicle_type || v.vehicleType);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVehicle(v.vehicle_type || v.vehicleType)}
                        className={`rounded-2xl border-2 p-4 text-left transition-all ${
                          isSelected
                            ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400 shadow-sm"
                            : "border-stone-200 bg-stone-50 hover:border-amber-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-stone-900">{v.label || v.vehicle_type}</span>
                          {v.is_recommended ? (
                            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-stone-950">★ Best</span>
                          ) : isSelected ? (
                            <Check className="h-4 w-4 text-amber-700" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          Up to {v.max_pax || v.maxPax || 4} pax · {v.max_luggage || v.maxLuggage || 2} bags
                        </p>
                        <p className="mt-2 text-sm font-mono font-bold text-stone-900">
                          {formatPrice(v.price_inr || v.priceInr)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Ticket Tiers (Attractions / Experiences / SIC Tours) ── */}
            {ticketTiers.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900 flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-rose-600" /> Ticket Tiers & Age Categories
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">Select the number of tickets per category</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ticketTiers.map((tier) => {
                    const count = ticketSelections[tier.id] ?? 0;
                    return (
                      <div key={tier.id} className="flex items-center justify-between p-3.5 rounded-2xl border border-stone-200 bg-stone-50">
                        <div>
                          <strong className="block text-sm text-stone-900">{tier.tier_name || tier.tierName}</strong>
                          <span className="text-[11px] text-stone-500">
                            {tier.age_min || tier.age_max
                              ? `Age ${tier.age_min ?? 0}–${tier.age_max ?? "99"}`
                              : "Standard category"}
                          </span>
                          <span className="block mt-1 text-xs font-mono font-bold text-amber-800">
                            {tier.is_free ? "FREE" : formatPrice(tier.price_inr || tier.priceInr)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTicketSelections((prev) => ({ ...prev, [tier.id]: Math.max(0, count - 1) }))}
                            disabled={count <= 0}
                            className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-sm font-bold text-stone-700 hover:bg-stone-200 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-bold text-sm text-stone-900">{count}</span>
                          <button
                            type="button"
                            onClick={() => setTicketSelections((prev) => ({ ...prev, [tier.id]: count + 1 }))}
                            className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-sm font-bold text-stone-700 hover:bg-stone-200"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── SIC Pickup Hubs ── */}
            {sicHubs.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-stone-900 flex items-center gap-2">
                    <Bus className="h-5 w-5 text-blue-600" /> Shared Pickup Hubs & Timings
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">Please arrive at least 15 minutes before the departure time</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sicHubs.map((hub, i) => (
                    <div key={hub.id || i} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="text-sm text-stone-900">{hub.hub_name || hub.hubName}</strong>
                        <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-xs font-mono font-bold text-blue-900">
                          {hub.departure_time || hub.departureTime}
                        </span>
                      </div>
                      {hub.hub_address && (
                        <p className="mt-1 text-xs text-stone-500 flex items-start gap-1">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-stone-400" />
                          {hub.hub_address}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Itinerary (Plan 14 format or legacy) ── */}
            {multiDayItinerary ? (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="font-display text-2xl font-bold text-stone-900">Day-by-Day Itinerary</h2>
                <div className="space-y-3">
                  {Object.entries(multiDayItinerary).map(([dayNum, steps]) => {
                    const open = openDayIndex === Number(dayNum);
                    return (
                      <div key={dayNum} className="overflow-hidden rounded-2xl border border-stone-200">
                        <button
                          type="button"
                          onClick={() => setOpenDayIndex(open ? null : Number(dayNum))}
                          className="flex w-full items-center justify-between p-4 text-left hover:bg-stone-50 bg-[#FAF9F6]"
                        >
                          <span className="flex items-center gap-3">
                            <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-300">
                              Day {dayNum}
                            </span>
                            <strong className="text-sm text-stone-900">
                              {steps[0]?.title || `Day ${dayNum} Plan`}
                            </strong>
                          </span>
                          <ChevronDown className={`h-4 w-4 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="border-t border-stone-200 bg-white p-4 space-y-3">
                            {steps.map((step, idx) => (
                              <div key={step.id || idx} className="flex gap-3 text-sm">
                                <span className="text-lg">{step.icon || "📍"}</span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <strong className="text-stone-900">{step.title}</strong>
                                    {step.duration_text && (
                                      <span className="text-[11px] text-amber-800 font-medium font-mono">
                                        ({step.duration_text})
                                      </span>
                                    )}
                                  </div>
                                  {step.description && <p className="mt-1 text-xs text-stone-600 leading-relaxed">{step.description}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : itineraryItems.length > 0 ? (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="font-display text-2xl font-bold text-stone-900">Itinerary & Timeline</h2>
                <div className="relative border-l-2 border-amber-300 pl-6 space-y-5">
                  {itineraryItems.map((item, idx) => (
                    <div key={item.id || idx} className="relative">
                      <span className="absolute -left-[31px] top-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-white bg-amber-500 text-[8px] text-white shadow-sm" />
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-mono font-bold text-amber-800">{item.time_label || item.timeLabel}</span>
                        <strong className="text-sm text-stone-900">{item.title}</strong>
                        {item.duration_text && <span className="text-[11px] text-stone-400">· {item.duration_text}</span>}
                      </div>
                      {item.description && <p className="mt-1 text-xs text-stone-600 leading-relaxed">{item.description}</p>}
                    </div>
                  ))}
                </div>
              </section>
            ) : dayWiseDetails.length > 0 ? (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="font-display text-2xl font-bold text-stone-900">Itinerary</h2>
                <div className="space-y-3">
                  {dayWiseDetails.map((dayItem, index) => {
                    const open = openDayIndex === index;
                    return (
                      <div key={index} className="overflow-hidden rounded-2xl border border-stone-200">
                        <button type="button" onClick={() => setOpenDayIndex(open ? null : index)} className="flex w-full items-center justify-between p-4 text-left hover:bg-stone-50 bg-[#FAF9F6]">
                          <span className="flex items-center gap-3">
                            <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 border border-amber-300">Day {dayItem.day || index + 1}</span>
                            <strong className="text-sm text-stone-900">{dayItem.title}</strong>
                          </span>
                          <ChevronDown className={`h-4 w-4 text-stone-400 transition ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && <div className="border-t border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-600">{dayItem.description}</div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : sightseeingStops.length > 0 ? (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="font-display text-2xl font-bold text-stone-900">What to expect</h2>
                <div className="relative border-l-2 border-amber-300 pl-6 space-y-5">
                  {sightseeingStops.map((stop, index) => (
                    <div key={index} className="relative">
                      <span className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-4 border-white bg-amber-500 shadow-sm" />
                      <strong className="block text-sm text-stone-900">{typeof stop === "string" ? stop : stop.name}</strong>
                      {stop.duration && <span className="text-[11px] text-amber-800 font-medium">{stop.duration}</span>}
                      {typeof stop !== "string" && stop.description && (
                        <p className="mt-1 text-sm leading-relaxed text-stone-600">{stop.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── Inclusions / Exclusions ── */}
            {((activity.inclusions?.length || 0) > 0 || (activity.exclusions?.length || 0) > 0) && (
              <section className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-emerald-800">✓ What's included</h3>
                  <ul className="mt-3 space-y-2">
                    {(activity.inclusions || []).map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-stone-700">
                        <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-rose-700">✗ Not included</h3>
                  <ul className="mt-3 space-y-2">
                    {(activity.exclusions || []).map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-stone-600">
                        <span className="text-rose-500 font-bold mt-0.5">×</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* ── Essential Information (Plan 14) ── */}
            {Array.isArray(activity.essentialInfo) && activity.essentialInfo.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
                <h3 className="font-display text-lg font-bold text-stone-900 flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600" /> Essential Information
                </h3>
                <ul className="space-y-2">
                  {activity.essentialInfo.map((info, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-stone-600 leading-relaxed">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>{info}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Dynamic Price Calendar & Seasonality ── */}
            <section className="space-y-3">
              <div>
                <h3 className="font-display text-lg font-bold text-stone-900">
                  Seasonal & Demand Price Calendar
                </h3>
                <p className="text-xs text-stone-500">
                  Compare daily departure rates to find saver deals and avoid peak surcharges.
                </p>
              </div>
              <PriceCalendarWidget
                productId={id}
                basePrice={activity.priceInr || activity.price_inr || 1499}
                selectedDate={date}
                onSelectDate={(selectedDateStr) => {
                  setDate(selectedDateStr);
                  setAvailabilityChecked(false);
                  setAvailabilityOptions([]);
                  setServerQuote(null);
                }}
              />
            </section>

            {/* ── Reviews ── */}
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <ReviewGallery
                reviews={reviewData.reviews || []}
                avgRating={Number(reviewData.averageRating || reviewData.quality?.average_rating || activity.rating || 0)}
                totalReviews={Number(reviewData.totalReviews || reviewData.quality?.review_count || activity.review_count || 0)}
                distribution={reviewData.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }}
                quality={reviewData.quality}
                onWriteReview={eligibleBooking ? () => setShowReviewModal(true) : null}
                canWriteReview={Boolean(eligibleBooking)}
                selectedRating={reviewRating}
                onRatingChange={(newRating) => setReviewRating(newRating)}
                sortBy={reviewSort}
                onSortChange={(newSort) => setReviewSort(newSort)}
                loading={reviewLoading}
                pagination={reviewData.pagination}
                onLoadMore={() => {
                  if (reviewData.pagination?.hasNext) {
                    fetchReviews(reviewData.pagination.page + 1, true);
                  }
                }}
              />
            </section>

            {showReviewModal && eligibleBooking && (
              <ReviewModal
                booking={eligibleBooking}
                onClose={() => setShowReviewModal(false)}
                onSuccess={() => {
                  setShowReviewModal(false);
                  fetchReviews(1, false);
                  setEligibleBooking(null);
                }}
              />
            )}
          </main>

          {/* ── Booking sidebar ── */}
          <aside className="h-fit lg:sticky lg:top-[140px]">
            <div className="space-y-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-xl sm:p-6">
              <div>
                <span className="text-xs font-semibold text-stone-500">{serverQuote ? "Your total" : "From"}</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <strong className="font-display text-3xl text-stone-900">
                    {formatPrice((serverQuote?.breakdown?.totalAmount ?? activity.priceInr ?? activity.price_inr) + addonsTotalInr)}
                  </strong>
                  {!serverQuote && (
                    <span className="text-xs text-stone-400">
                      {isTransfer ? "per vehicle" : isPackage ? "per person" : "per ticket"}
                    </span>
                  )}
                </div>
                {addonsTotalInr > 0 && (
                  <span className="block text-[11px] text-amber-700 font-bold font-mono mt-0.5">
                    Includes {formatPrice(addonsTotalInr)} in selected add-ons
                  </span>
                )}
                {currency !== "INR" && (
                  <span className="block text-[10px] text-stone-400 font-mono mt-0.5">
                    (₹{Number((serverQuote?.breakdown?.totalAmount ?? activity.priceInr ?? activity.price_inr ?? 0) + addonsTotalInr).toLocaleString("en-IN")})
                  </span>
                )}
              </div>

              <div className="space-y-3 border-t border-stone-200 pt-5">
                <div>
                  <span className="mb-2 flex items-center gap-2 text-xs font-bold text-stone-700">
                    <CalendarDays className="h-4 w-4 text-amber-600" />
                    {isPackage ? "Trip Start Date" : "Activity Date"}
                  </span>
                  <DatePicker
                    value={date}
                    min={localDate(0)}
                    onChange={setDate}
                    theme="light"
                    showIcon={false}
                    ariaLabel={isPackage ? "Choose start date" : "Choose tour date"}
                    popoverTitle={isPackage ? "Choose start date" : "Choose tour date"}
                    buttonClassName="py-3.5 border-stone-300 rounded-xl"
                  />
                </div>

                {/* Travelers counter */}
                <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold text-stone-700">
                    <Users className="h-4 w-4 text-amber-600" />
                    Travelers
                  </div>
                  <div className="space-y-2">
                    <TravelerCounter label="Adults" helper="Age 12+" value={adults} min={1} onChange={setAdults} />
                    <TravelerCounter label="Children" helper="Age 3–11" value={children} min={0} onChange={setChildren} />
                  </div>
                </div>
              </div>

              {/* ── Optional Add-On Extras Customizer ── */}
              {availableAddons.length > 0 && (
                <div className="space-y-3 border-t border-stone-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Enhance Your Trip (Add-Ons)
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">Optional</span>
                  </div>

                  <div className="space-y-2">
                    {availableAddons.map((addon) => {
                      const isSelected = selectedAddonIds.includes(addon.id);
                      const addonCalculatedPrice = addon.perPerson ? addon.priceInr * headcount : addon.priceInr;

                      return (
                        <div
                          key={addon.id}
                          onClick={() => toggleAddon(addon.id)}
                          className={`p-3 rounded-2xl border cursor-pointer transition flex items-start gap-3 ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/70 shadow-xs"
                              : "border-stone-200 bg-[#FAF9F6] hover:border-stone-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-stone-900 flex items-center gap-1">
                                <span>{addon.icon}</span> {addon.title}
                              </span>
                              <span className="text-xs font-mono font-bold text-amber-800 shrink-0">
                                +{formatPrice(addonCalculatedPrice)}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                              {addon.description}
                            </p>
                            {addon.perPerson && (
                              <span className="text-[10px] text-stone-400 font-mono">
                                ({formatPrice(addon.priceInr)} &times; {headcount} travelers)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {quoteError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{quoteError}</div>}

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!date || quoteLoading || Boolean(quoteError)}
                  onClick={goToCheckout}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-4 text-sm font-bold text-stone-950 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue to booking <ArrowRight className="h-4 w-4" />
                </button>
                <Link
                  to={`/circuit-planner?addActivityId=${id}&destination=${encodeURIComponent(activity.destination || activity.city || "")}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 px-4 py-2.5 text-xs font-bold text-stone-700 transition"
                >
                  <MapPin className="h-3.5 w-3.5 text-amber-700" />
                  <span>Add to Multi-Day Circuit Planner</span>
                </Link>
              </div>

              <div className="space-y-2 border-t border-stone-200 pt-4 text-[11px] leading-relaxed text-stone-500">
                <p className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span><strong className="text-stone-700">Free cancellation</strong> up to 24 hours before start.</span>
                </p>
                <p className="flex gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>Instant confirmation with mobile voucher.</span>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
