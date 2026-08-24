import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Hotel, MapPin, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import { api } from "../lib/api.js";
import { analytics } from "../lib/analytics.js";
import SeoHead from "../components/SeoHead.jsx";
import StarRating from "../components/StarRating.jsx";
import DatePicker from "../components/ui/DatePicker.jsx";
import ReviewGallery from "../components/traveler/ReviewGallery.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import PriceCalendarWidget from "../components/traveler/PriceCalendarWidget.jsx";
import { useCurrency } from "../lib/currency.jsx";

const VEHICLES = [
  { code: "SEDAN", name: "Sedan (Dzire / Etios)", pax: 4, bags: 3, icon: "🚗" },
  { code: "SUV", name: "SUV / MUV (Ertiga)", pax: 6, bags: 4, icon: "🚙" },
  { code: "PREMIUM_MUV", name: "Premium MUV (Innova Crysta)", pax: 6, bags: 5, icon: "🚐" },
  { code: "LUXURY", name: "Luxury Class (Mercedes / BMW)", pax: 3, bags: 3, icon: "✨" },
  { code: "GROUP_TEMPO", name: "Tempo Traveller (12-26 Seater)", pax: 26, bags: 20, icon: "🚌" }
];

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
  const firstStop = Array.isArray(activity?.itinerary) ? activity.itinerary[0] : null;
  const match = String(firstStop?.duration || firstStop?.time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return "09:00";
  let hours = Number(match[1]);
  if (match[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
  if (match[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function TravelerCounter({ label, helper, value, min, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
      <div><strong className="block text-xs text-stone-900">{label}</strong><span className="text-[10px] text-stone-500">{helper}</span></div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Remove ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-base text-stone-700 hover:bg-stone-100 disabled:opacity-30">−</button>
        <span className="w-5 text-center text-sm font-bold text-stone-900">{value}</span>
        <button type="button" aria-label={`Add ${label}`} onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-base text-stone-700 hover:bg-stone-100">+</button>
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
      if ((data?.productType || data?.product_type) === "TRANSFER" && data?.pricingVariants?.length) setSelectedVariant(data.pricingVariants[0]);
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

  const productType = activity?.productType || activity?.product_type || "DAY_TOUR";
  const isTransfer = productType === "TRANSFER";
  const isPackage = productType === "MULTI_DAY_PACKAGE";
  const isExperience = productType === "DAY_TOUR" || isPackage;
  const isSharedTour = Boolean(activity && !isTransfer && (activity.groupType === "SHARED" || activity.group_type === "SHARED" || activity.pricingVariants?.some((item) => item.pricing_model === "PER_PERSON" && /shared|seat/i.test(item.variant_name || ""))));
  const dayWiseDetails = activity?.packageItinerary?.dayWiseDetails || [];
  const sightseeingStops = Array.isArray(activity?.itinerary) ? activity.itinerary : [];
  const startTime = useMemo(() => startTimeFromActivity(activity), [activity]);

  useEffect(() => {
    if (!activity || !isTransfer || !date || adults < 1) return;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      api.getBookingQuote({ product_id: id, activity_date: date, adults, children, luggage_bags: 0, vehicle_category: selectedVehicle, variant_name: selectedVariant?.variant_name || selectedVariant?.variantName || "Standard Booking" })
        .then((data) => setServerQuote(data.quote))
        .catch((error) => { setServerQuote(null); setQuoteError(error.message || "This option is unavailable."); })
        .finally(() => setQuoteLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [activity, isTransfer, id, date, adults, children, selectedVehicle, selectedVariant]);

  useEffect(() => {
    if (!isExperience) return;
    setAvailabilityChecked(false);
    setAvailabilityOptions([]);
    setSelectedVariant(null);
    setServerQuote(null);
    setQuoteError("");
  }, [date, adults, children, isExperience]);

  if (!activity) return <div className="mx-auto max-w-6xl px-5 py-20 text-center text-stone-500">{quoteError || "Loading experience details…"}</div>;

  const variants = activity.pricingVariants?.length ? activity.pricingVariants : [{ variant_name: isSharedTour ? "Shared tour" : "Standard option", base_price: activity.priceInr || activity.price_inr }];
  const selectedVariantName = selectedVariant?.variant_name || selectedVariant?.variantName || "";
  const imagesList = activity.images?.filter(Boolean)?.length ? activity.images.filter(Boolean) : [activity.heroImage || activity.hero_image].filter(Boolean);
  const meetingPoint = isPackage ? activity.packageItinerary?.start_point || activity.packageItinerary?.start_city || `${activity.city} arrival point` : (typeof sightseeingStops[0] === "string" ? sightseeingStops[0] : sightseeingStops[0]?.name) || `${activity.city} meeting point`;

  const checkAvailability = async () => {
    setQuoteLoading(true);
    setQuoteError("");
    setAvailabilityChecked(false);
    setSelectedVariant(null);
    setServerQuote(null);
    const results = await Promise.all(variants.map(async (variantItem) => {
      const variantName = variantItem.variant_name || variantItem.variantName || "Standard option";
      const vehicle = isSharedTour ? "SHARED_SEAT" : isPackage ? "SEDAN" : vehicleForVariant(variantName);
      try {
        const response = await api.getBookingQuote({ product_id: id, activity_date: date, adults, children, luggage_bags: 0, vehicle_category: vehicle, variant_name: variantName });
        return { variant: variantItem, vehicle, quote: response.quote };
      } catch (error) {
        return { variant: variantItem, vehicle, error: error.message || "Unavailable" };
      }
    }));
    const available = results.filter((item) => item.quote);
    setAvailabilityOptions(available);
    setAvailabilityChecked(true);
    setQuoteLoading(false);
    if (!available.length) setQuoteError(results[0]?.error || "No options are available for this date and group size.");
  };

  const selectOption = (option) => {
    setSelectedVariant(option.variant);
    setSelectedVehicle(option.vehicle);
    setServerQuote(option.quote);
    setQuoteError("");
  };

  const goToCheckout = () => {
    const params = new URLSearchParams({
      date,
      adults: String(adults),
      children: String(children),
      vehicle: isSharedTour ? "SHARED_SEAT" : selectedVehicle,
      variant: selectedVariantName || (isTransfer ? "Private chauffeur transfer" : "Standard option"),
      time: startTime,
    });
    if (selectedAddonIds.length > 0) {
      params.set("addons", selectedAddonIds.join(","));
    }
    navigate(`/checkout/${id}?${params.toString()}`);
  };

  const canContinue = isTransfer ? Boolean(date && adults > 0 && serverQuote && !quoteLoading && !quoteError) : Boolean(selectedVariant && serverQuote && !quoteLoading);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": isPackage ? "TouristTrip" : "Product",
        "@id": `https://ideaholiday.in/activity/${activity.id}#product`,
        "name": activity.title,
        "description": activity.shortDescription || activity.short_description || activity.description || activity.title,
        "image": imagesList.length ? imagesList : ["https://ideaholiday.in/idea-holiday-social.png"],
        "category": activity.category || "Tour",
        "offers": {
          "@type": "Offer",
          "priceCurrency": "INR",
          "price": activity.priceInr || activity.price_inr || activity.base_fare || 999,
          "availability": "https://schema.org/InStock",
          "url": `https://ideaholiday.in/activity/${activity.id}`,
          "seller": {
            "@type": "Organization",
            "name": "Idea Holiday"
          }
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": activity.rating || 4.8,
          "reviewCount": activity.reviewCount || activity.review_count || 120,
          "bestRating": "5",
          "worstRating": "1"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://ideaholiday.in/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": activity.destination_name || activity.city || "Experiences",
            "item": `https://ideaholiday.in/search?q=${encodeURIComponent(activity.destination_name || activity.city || "")}`
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": activity.title,
            "item": `https://ideaholiday.in/activity/${activity.id}`
          }
        ]
      }
    ]
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title={`${activity.title} — Book on Idea Holiday`}
        description={activity.shortDescription || activity.short_description || activity.description || `Book ${activity.title} in ${activity.city || "India"} with trusted local operators on Idea Holiday.`}
        canonical={`https://ideaholiday.in/activity/${activity.id}`}
        image={imagesList[0] || "https://ideaholiday.in/idea-holiday-social.png"}
        jsonLd={productJsonLd}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-2 text-xs text-stone-500">
          <Link to="/" className="hover:text-amber-800 transition">Home</Link>
          <span>›</span>
          <Link to="/search" className="hover:text-amber-800 transition">Experiences</Link>
          {activity.city && <>
            <span>›</span>
            <Link to={`/search?q=${encodeURIComponent(activity.city)}`} className="hover:text-amber-800 transition">{activity.city}</Link>
          </>}
          <span>›</span>
          <span className="line-clamp-1 text-stone-700 font-medium">{activity.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            <span>{isTransfer ? "Private transfer" : isPackage ? "Multi-day tour" : isSharedTour ? "Shared day tour" : "Private day tour"}</span>
            <span>·</span>
            <span>{activity.city}, {activity.state}</span>
          </div>
          <h1 className="max-w-4xl font-display text-3xl font-bold text-stone-900 sm:text-4xl">{activity.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {reviewData.quality?.review_count > 0
              ? <StarRating rating={Number(reviewData.quality.average_rating)} count={reviewData.quality.review_count} size="md" />
              : <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-bold text-stone-500">New · no verified reviews yet</span>}
            <span className="text-emerald-800 font-semibold text-xs">Supplied by {activity.supplierName || "Idea Holiday partner"}</span>
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
                { icon: Clock3, label: isPackage ? `${activity.packageItinerary?.total_days || Math.ceil((activity.durationHours || 24) / 24)} days` : `${activity.durationHours || 8} hours`, sub: "Duration" },
                { icon: Users, label: isSharedTour ? "Shared group" : "Private", sub: "Tour format" },
                { icon: MapPin, label: activity.city || "India", sub: "Location" },
                { icon: ShieldCheck, label: "Free cancellation", sub: "Up to 24h before" },
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

            {/* ── Overview ── */}
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
              <h2 className="font-display text-2xl font-bold text-stone-900">Overview</h2>
              <p className="text-sm leading-relaxed text-stone-600">{activity.fullDesc || activity.shortDesc}</p>
              
              {isTransfer && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                    <Sparkles className="h-4 w-4 text-emerald-700" />
                    <span>Flexible Doorstep Drop-off / Pickup</span>
                  </div>
                  <p className="text-xs leading-relaxed text-emerald-900">
                    {activity.transferMeta?.serviceDirection === "DEPARTURE"
                      ? `Your chauffeur will pick you up from any hotel, resort, Airbnb, or home address in ${activity.transferMeta?.zoneName || activity.city} and drop you directly at the departure terminal.`
                      : `Your chauffeur will meet you with a nameboard at the terminal and drop you off directly at any hotel, resort, Airbnb, or home in ${activity.transferMeta?.zoneName || activity.city}. Free flight tracking and waiting time included.`}
                  </p>
                </div>
              )}
            </section>

            {/* ── Vehicle picker (transfers) ── */}
            {isTransfer && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="font-display text-xl font-bold text-stone-900">Choose your private vehicle</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {VEHICLES.map((vehicle) => (
                    <button
                      key={vehicle.code}
                      type="button"
                      onClick={() => { setSelectedVehicle(vehicle.code); const matching = activity.pricingVariants?.find((item) => vehicleForVariant(item.variant_name) === vehicle.code); if (matching) setSelectedVariant(matching); }}
                      className={`relative rounded-2xl border p-4 text-left transition hover:border-amber-400 ${selectedVehicle === vehicle.code ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400 shadow-sm" : "border-stone-200 bg-[#FAF9F6]"}`}
                    >
                      <span className="text-2xl">{vehicle.icon}</span>
                      <strong className="mt-2 block text-sm text-stone-900">{vehicle.name}</strong>
                      <span className="text-[11px] text-stone-500">Up to {vehicle.pax} travelers · {vehicle.bags} bags</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Meeting point (tours) ── */}
            {!isTransfer && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-800">
                    <MapPin className="h-5 w-5 text-amber-700" />
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-bold text-stone-900">Meeting and pickup</h2>
                    <p className="text-xs text-stone-500">Know where the experience begins before checkout.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                  <strong className="block text-sm text-stone-900">{isPackage ? "Start point" : isSharedTour ? "Meeting point" : "Hotel pickup"}</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-stone-600">{meetingPoint}{!isPackage && sightseeingStops[0]?.duration ? ` · ${sightseeingStops[0].duration}` : ""}</span>
                  <p className="mt-3 text-xs text-stone-400">You can confirm a listed meeting point or provide pickup details during checkout.</p>
                </div>
              </section>
            )}

            {/* ── Day-wise itinerary ── */}
            {dayWiseDetails.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl font-bold text-stone-900">Itinerary</h2>
                <div className="mt-4 space-y-3">
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
            )}

            {/* ── Sightseeing stops timeline ── */}
            {!dayWiseDetails.length && sightseeingStops.length > 0 && (
              <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl font-bold text-stone-900">What to expect</h2>
                <div className="relative mt-5 space-y-5 border-l-2 border-amber-300 pl-6">
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
            )}

            {/* ── What's included / excluded ── */}
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

            {/* ── Dynamic Price Calendar & Seasonality ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900">
                    Seasonal & Demand Price Calendar
                  </h3>
                  <p className="text-xs text-stone-500">
                    Compare daily departure rates to find saver deals and avoid peak surcharges.
                  </p>
                </div>
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
                  {!serverQuote && <span className="text-xs text-stone-400">per person</span>}
                </div>
                {addonsTotalInr > 0 && (
                  <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-bold font-mono mt-0.5">
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
                    {isPackage ? "Start date" : "Date"}
                  </span>
                  <DatePicker value={date} min={localDate(0)} onChange={setDate} theme="light" showIcon={false} ariaLabel={isPackage ? "Choose package start date" : "Choose tour date"} popoverTitle={isPackage ? "Choose package start date" : "Choose tour date"} buttonClassName="py-3.5 border-stone-300 rounded-xl" />
                </div>
                <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold text-stone-700">
                    <Users className="h-4 w-4 text-amber-600" />Travelers
                  </div>
                  <div className="space-y-2">
                    <TravelerCounter label="Adults" helper="Age 12+" value={adults} min={1} onChange={setAdults} />
                    <TravelerCounter label="Children" helper="Age 3–11" value={children} min={0} onChange={setChildren} />
                  </div>
                </div>
              </div>

              {isExperience && !availabilityChecked && (
                <button type="button" disabled={quoteLoading || !date} onClick={checkAvailability} className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3.5 text-sm font-bold text-stone-950 transition shadow-sm disabled:opacity-50">
                  {quoteLoading ? "Checking availability…" : "Check availability"}
                </button>
              )}

              {isExperience && availabilityChecked && availabilityOptions.length > 0 && (
                <div className="space-y-3 border-t border-stone-200 pt-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />{availabilityOptions.length} option{availabilityOptions.length === 1 ? "" : "s"} available
                  </div>
                  {availabilityOptions.map((option, index) => {
                    const optionName = option.variant.variant_name || option.variant.variantName || "Standard option";
                    const selected = selectedVariantName === optionName;
                    return (
                      <button type="button" key={`${optionName}-${index}`} onClick={() => selectOption(option)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-400 shadow-sm" : "border-stone-200 bg-[#FAF9F6] hover:border-stone-300"}`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <strong className="block text-sm text-stone-900">{optionName}</strong>
                            <span className="mt-1 flex items-center gap-1 text-[11px] text-stone-500">
                              {isPackage ? <Hotel className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                              {isPackage ? `${activity.packageItinerary?.total_days || "Multi"}-day package` : `Starts at ${startTime}`}
                            </span>
                          </span>
                          <span className="text-right">
                            <strong className="block text-lg text-stone-900 font-mono">{formatPrice(option.quote.breakdown.totalAmount)}</strong>
                            <span className="text-[10px] text-stone-400">total</span>
                          </span>
                        </span>
                        <span className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${selected ? "text-amber-800" : "text-stone-400"}`}>
                          {selected ? <><Check className="h-3.5 w-3.5 text-amber-700" />Selected</> : "Select option"}
                        </span>
                      </button>
                    );
                  })}
                  <button type="button" onClick={checkAvailability} className="text-xs font-bold text-stone-500 hover:text-amber-800 transition">Change or refresh availability</button>
                </div>
              )}

              {/* ── Optional Add-On Extras Customizer ── */}
              {(isTransfer || selectedVariant) && availableAddons.length > 0 && (
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
                            onChange={() => {}} // Handled by parent div
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

              {(isTransfer || selectedVariant) && (
                <button type="button" disabled={!canContinue} onClick={goToCheckout} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-4 text-sm font-bold text-stone-950 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-40">
                  Continue to booking <ArrowRight className="h-4 w-4" />
                </button>
              )}

              <div className="space-y-2 border-t border-stone-200 pt-4 text-[11px] leading-relaxed text-stone-500">
                <p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" /><span><strong className="text-stone-700">Free cancellation</strong> up to 24 hours before the experience starts.</span></p>
                <p className="flex gap-2"><Sparkles className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" /><span>Instant confirmation with mobile voucher.</span></p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
