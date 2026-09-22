import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { activityPath } from "../lib/activityUrl.js";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Headphones,
  Heart,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
  ChevronRight,
  Globe,
} from "lucide-react";
import SearchBar from "../components/SearchBar.jsx";
import SeoHead from "../components/SeoHead.jsx";
import { SkeletonCard } from "../components/ui/SkeletonLoader.jsx";
import { api } from "../lib/api.js";
import { destinationParam, featuredDestinations, withImageList } from "../lib/destinations.js";
import { useCurrency } from "../lib/currency.jsx";

const HERO_IMAGES = [
  { src: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=90", label: "Taj Mahal, Agra" },
  { src: "https://images.unsplash.com/photo-1599661046827-dacde6976549?auto=format&fit=crop&w=1800&q=90", label: "Jaipur, Rajasthan" },
  { src: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1800&q=90", label: "Kerala Backwaters" },
  { src: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1800&q=90", label: "Goa Beaches" },
  { src: "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&w=1800&q=90", label: "Ladakh" },
];

const CATEGORIES = [
  { emoji: "🎒", label: "Holiday Packages", type: "PACKAGE", to: "/search?type=PACKAGE", color: "from-amber-50 to-orange-50 border-amber-200 hover:border-amber-400" },
  { emoji: "🗺️", label: "Tours & Sightseeing", type: "TOUR", to: "/search?type=TOUR", color: "from-blue-50 to-sky-50 border-blue-200 hover:border-blue-400" },
  { emoji: "🚗", label: "Transfers & Cabs", type: "TRANSFER", to: "/transfers", color: "from-indigo-50 to-violet-50 border-indigo-200 hover:border-indigo-400" },
  { emoji: "🎡", label: "Attractions & Shows", type: "ATTRACTION", to: "/search?type=ATTRACTION", color: "from-rose-50 to-pink-50 border-rose-200 hover:border-rose-400" },
  { emoji: "🤿", label: "Active Experiences", type: "EXPERIENCE", to: "/search?type=EXPERIENCE", color: "from-emerald-50 to-teal-50 border-emerald-200 hover:border-emerald-400" },
  { emoji: "🌊", label: "Scuba & Water Sports", q: "Scuba", color: "from-cyan-50 to-blue-50 border-cyan-200 hover:border-cyan-400" },
  { emoji: "🥘", label: "Cooking & Food Walks", q: "Cooking", color: "from-red-50 to-orange-50 border-red-200 hover:border-red-400" },
  { emoji: "🐅", label: "Safaris & Wildlife", q: "Safari", color: "from-green-50 to-lime-50 border-green-200 hover:border-green-400" },
  { emoji: "🏝️", label: "Island Trips & Boats", q: "Island", color: "from-yellow-50 to-amber-50 border-yellow-200 hover:border-yellow-400" },
  { emoji: "🏎️", label: "ATV & Off-Road", q: "ATV", color: "from-stone-50 to-warm-100 border-stone-200 hover:border-stone-400" },
];

const FALLBACK_DESTINATIONS = [
  { id: "goa", name: "Goa", tagline: "Sun, sea & slow days", hero_image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=85" },
  { id: "jaipur", name: "Jaipur", tagline: "Palaces & pink streets", hero_image: "https://images.unsplash.com/photo-1599661046827-dacde6976549?auto=format&fit=crop&w=900&q=85" },
  { id: "kerala", name: "Kerala", tagline: "Backwaters & green escapes", hero_image: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=900&q=85" },
  { id: "agra", name: "Agra", tagline: "Timeless wonder", hero_image: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=85" },
  { id: "ladakh", name: "Ladakh", tagline: "High roads & clear skies", hero_image: "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&w=900&q=85" },
];

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "Verified operators", copy: "Every partner KYB-approved by our team", color: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", stat: "500+" },
  { icon: IndianRupee, label: "No hidden fees", copy: "Clear INR pricing, no platform surcharges", color: "from-amber-500 to-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", stat: "₹0 fees" },
  { icon: CalendarClock, label: "Free cancellation", copy: "Flexible options on most experiences", color: "from-indigo-500 to-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-900/20", stat: "80%+" },
  { icon: Headphones, label: "24×7 human support", copy: "Real help before, during and after", color: "from-rose-500 to-rose-600", bg: "bg-rose-50 dark:bg-rose-900/20", stat: "< 2 min" },
];

const CATEGORIES_GRID = [
  { emoji: "🏰", title: "Heritage & Forts", desc: "Mughal wonders, Rajput palaces", q: "Heritage", bg: "from-amber-50 to-orange-50 border-amber-200 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800" },
  { emoji: "🛶", title: "Backwater Cruises", desc: "Kerala's legendary waterways", q: "Backwaters", bg: "from-emerald-50 to-teal-50 border-emerald-200 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-800" },
  { emoji: "🐅", title: "Wildlife Safaris", desc: "Tigers, elephants & birdlife", q: "Wildlife", bg: "from-green-50 to-lime-50 border-green-200 dark:from-green-900/20 dark:to-lime-900/20 dark:border-green-800" },
  { emoji: "🍛", title: "Food & Street Walks", desc: "Authentic flavors, local stories", q: "Food", bg: "from-red-50 to-orange-50 border-red-200 dark:from-red-900/20 dark:to-orange-900/20 dark:border-red-800" },
  { emoji: "✈️", title: "Airport Transfers", desc: "Smooth arrivals & departures", type: "TRANSFER", bg: "from-indigo-50 to-violet-50 border-indigo-200 dark:from-indigo-900/20 dark:to-violet-900/20 dark:border-indigo-800" },
  { emoji: "🏖️", title: "Beach Activities", desc: "Goa, Andamans, Kovalam", q: "Beaches", bg: "from-cyan-50 to-blue-50 border-cyan-200 dark:from-cyan-900/20 dark:to-blue-900/20 dark:border-cyan-800" },
  { emoji: "🏔️", title: "Hill Stations", desc: "Shimla, Manali, Darjeeling", q: "Adventure", bg: "from-stone-50 to-slate-50 border-stone-200 dark:from-stone-900/20 dark:to-slate-900/20 dark:border-stone-700" },
  { emoji: "🕌", title: "Spiritual Journeys", desc: "Varanasi, Rishikesh, Tirupati", q: "Spiritual", bg: "from-yellow-50 to-amber-50 border-yellow-200 dark:from-yellow-900/20 dark:to-amber-900/20 dark:border-yellow-800" },
];

// ── Scroll reveal hook ───────────────────────────────────────
function useRevealOnScroll(threshold = 0.12) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return ref;
}

// ── Hero slide ───────────────────────────────────────────────
function HeroSlide({ src, label, active }) {
  return (
    <div
      className={`absolute inset-0 transition-all duration-[1500ms] ease-out ${
        active ? "opacity-100 scale-[1.0]" : "opacity-0 scale-[1.02]"
      }`}
      aria-hidden={!active}
    >
      <img src={src} alt={label} className="h-full w-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/25 to-slate-950/85" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/30 via-transparent to-transparent" />
    </div>
  );
}

// ── Experience card (home) ───────────────────────────────────
function ExperienceCard({ activity, index = 0 }) {
  const { formatPrice, currency } = useCurrency();
  const [wishlist, setWishlist] = useState(false);
  const { id, title, images, hero_image, heroImage, price_inr, rating, review_count, duration_hours, destination_name, city, bestseller } = activity;
  const img = images?.[0] || heroImage || hero_image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80";
  const loc = destination_name || city || "India";
  const dur = duration_hours >= 24 ? `${Math.round(duration_hours / 24)} day${Math.round(duration_hours / 24) > 1 ? "s" : ""}` : duration_hours >= 1 ? `${duration_hours}h` : `${Math.round((duration_hours || 1) * 60)}m`;

  return (
    <Link
      to={activityPath(id, title)}
      className={`group flex-shrink-0 w-72 sm:w-auto block animate-reveal-up animate-delay-${Math.min(index + 1, 6)}`}
    >
      <div className="overflow-hidden rounded-2xl bg-white dark:bg-stone-900 shadow-card border border-stone-100 dark:border-stone-800 card-hover">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Bestseller badge */}
          {bestseller && (
            <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-stone-950 shadow-md">
              ⭐ Bestseller
            </span>
          )}

          {/* Wishlist */}
          <button
            aria-label={wishlist ? "Remove from wishlist" : "Save to wishlist"}
            className={`absolute right-3 top-3 rounded-full p-2 shadow-md transition-all duration-300 hover:scale-110 ${
              wishlist
                ? "bg-rose-500 text-white scale-110"
                : "bg-white/90 text-stone-400 hover:bg-rose-50 hover:text-rose-500"
            }`}
            onClick={(e) => { e.preventDefault(); setWishlist((w) => !w); }}
          >
            <Heart className={`h-4 w-4 transition-all duration-200 ${wishlist ? "fill-current" : ""}`} />
          </button>

          {/* Location & duration chips */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              <MapPin className="h-3 w-3" />{loc}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              <Clock className="h-3 w-3" />{dur}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-stone-900 dark:text-stone-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors min-h-[2.6rem]">
            {title}
          </h3>
          <div className="mt-2 flex items-center gap-1.5">
            {rating ? (
              <>
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                <span className="text-xs font-bold text-stone-800 dark:text-stone-200">{rating}</span>
                <span className="text-xs text-stone-400 dark:text-stone-500">({(review_count || 0).toLocaleString("en-IN")})</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">New listing</span>
            )}
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-stone-100 dark:border-stone-800 pt-3">
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-semibold block">From</span>
              {currency !== "INR" && (
                <span className="text-[9px] text-stone-400 font-mono">₹{(price_inr || 0).toLocaleString("en-IN")}</span>
              )}
            </div>
            <strong className="font-display text-xl text-stone-900 dark:text-stone-100">{formatPrice(price_inr || 0)}</strong>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Stats counter ────────────────────────────────────────────
function StatCounter({ value, label }) {
  return (
    <div className="text-center">
      <div className="font-display text-3xl font-bold text-amber-600 dark:text-amber-400 sm:text-4xl">{value}</div>
      <div className="mt-1 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function Home() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [destinations, setDestinations] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nlEmail, setNlEmail] = useState("");
  const [nlName, setNlName] = useState("");
  const [nlStatus, setNlStatus] = useState("idle");
  const [nlMessage, setNlMessage] = useState("");

  const destRef = useRevealOnScroll();
  const bestRef = useRevealOnScroll();
  const catRef = useRevealOnScroll();
  const trustRef = useRevealOnScroll();
  const howRef = useRevealOnScroll();

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!nlEmail || !nlEmail.includes("@")) return;
    setNlStatus("loading");
    setNlMessage("");
    try {
      const res = await api.subscribeNewsletter({ email: nlEmail.trim(), name: nlName.trim() || undefined, source: "HOME_CTA" });
      if (res && res.success) { setNlStatus("success"); setNlMessage(res.message || "Thank you for subscribing! Check your inbox."); setNlEmail(""); setNlName(""); }
      else { setNlStatus("error"); setNlMessage(res?.error || "Failed to subscribe. Please try again."); }
    } catch (err) { setNlStatus("error"); setNlMessage(err.message || "Something went wrong. Please try again."); }
  };

  // Hero cycle
  useEffect(() => {
    const id = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_IMAGES.length), 5500);
    return () => clearInterval(id);
  }, []);

  // Data fetch
  useEffect(() => {
    Promise.all([api.getDestinations(), api.getActivities({ sort: "bestseller" })])
      .then(([destData, actData]) => {
        // /search answers { products, facets }, not a bare list.
        const products = Array.isArray(actData) ? actData : (actData?.products || []);
        setDestinations(featuredDestinations(destData, actData?.facets?.cities, FALLBACK_DESTINATIONS));
        setBestsellers(products.filter((a) => a.is_published !== false).slice(0, 8).map(withImageList));
      })
      .catch(() => { setDestinations(FALLBACK_DESTINATIONS); setBestsellers([]); })
      .finally(() => setLoading(false));
  }, []);

  // Link a country abroad only once it has something bookable (ADR 023, ADR 024).
  const [liveAbroad, setLiveAbroad] = useState([]);
  useEffect(() => {
    api.getActivities({ limit: 1 })
      .then((data) => setLiveAbroad((data?.facets?.countries || []).filter((c) => c.name && c.name !== "India" && c.count > 0).map((c) => c.name)))
      .catch(() => {});
  }, []);

  const featuredDests = (destinations.length ? destinations : FALLBACK_DESTINATIONS).slice(0, 5);

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": "https://ideaholiday.in/#website", "url": "https://ideaholiday.in/", "name": "Idea Holiday", "description": "India's Premier Travel Experience Marketplace", "potentialAction": { "@type": "SearchAction", "target": "https://ideaholiday.in/search?q={search_term_string}", "query-input": "required name=search_term_string" } },
      { "@type": "Organization", "@id": "https://ideaholiday.in/#organization", "name": "Idea Holiday", "url": "https://ideaholiday.in/", "logo": "https://ideaholiday.in/idea-holiday-social.png", "sameAs": ["https://www.facebook.com/ideaholiday", "https://www.instagram.com/ideaholiday"] }
    ]
  };

  return (
    <div className="bg-white dark:bg-stone-950 text-stone-950 dark:text-stone-50">
      <SeoHead
        title="Idea Holiday — India's Premier Travel Experience Marketplace"
        description="Book curated day tours, heritage sightseeing, scuba & water sports, airport transfers and holiday packages in India and across Asia with verified local operators."
        canonical="https://ideaholiday.in/"
        jsonLd={homeJsonLd}
      />

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative isolate z-20 overflow-hidden" style={{ minHeight: "92vh" }}>
        {HERO_IMAGES.map((img, i) => (
          <HeroSlide key={img.src} src={img.src} label={img.label} active={i === heroIndex} />
        ))}

        {/* Hero content */}
        <div className="relative z-20 flex min-h-[92vh] flex-col items-center justify-center px-4 text-center">

          {/* Animated badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md animate-reveal-up">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
            India's #1 travel experiences marketplace
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-balance font-display text-5xl font-normal leading-[1.05] text-white drop-shadow-lg sm:text-6xl lg:text-[5.5rem] animate-reveal-up animate-delay-1">
            Discover India like you{" "}
            <em className="not-italic text-gradient-gold">belong here.</em>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg animate-reveal-up animate-delay-2">
            Book tours, attractions, transfers and day trips — handpicked, clearly priced, easy to cancel.
          </p>

          {/* Search bar */}
          <div className="mt-8 w-full max-w-3xl animate-reveal-up animate-delay-3">
            <SearchBar />
          </div>

          {/* Quick links */}
          <div className="mt-6 flex flex-wrap justify-center gap-2.5 animate-reveal-up animate-delay-4">
            {["Taj Mahal", "Goa Beaches", "Jaipur Forts", "Kerala Houseboats", "Airport Transfers"].map((place) => (
              <Link
                key={place}
                to={`/search?q=${encodeURIComponent(place)}`}
                className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[12px] font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20 hover:border-white/50 hover:scale-[1.02]"
              >
                {place}
              </Link>
            ))}
          </div>
        </div>

        {/* Slide indicators */}
        <div className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {HERO_IMAGES.map((img, i) => (
            <button
              key={i}
              onClick={() => setHeroIndex(i)}
              aria-label={`Show ${img.label}`}
              className={`h-1.5 rounded-full transition-all duration-400 ${i === heroIndex ? "w-8 bg-amber-400 shadow-glow-sm" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>

        {/* Trust strip */}
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-stone-950/50 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-5 px-5 py-3.5 text-xs font-semibold text-white/90 sm:gap-10">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-400 shrink-0" /> 500+ verified experiences</span>
            <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-amber-400 shrink-0" /> KYB-verified operators</span>
            <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-400 shrink-0" /> Free cancellation on most</span>
            <span className="flex items-center gap-2"><Headphones className="h-4 w-4 text-amber-400 shrink-0" /> 24×7 support in Hindi & English</span>
          </div>
        </div>
      </section>

      {/* ─── CATEGORIES STRIP ─────────────────────────────────────── */}
      <section className="border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 py-5 sticky-below-hero">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="hide-scrollbar snap-x-mandatory flex gap-3 overflow-x-auto pb-1">
            {CATEGORIES.map(({ emoji, label, q, type, to, color }) => (
              <Link
                key={label}
                to={to || (q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`)}
                className={`group snap-start flex-shrink-0 flex flex-col items-center gap-2 rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-card ${color} dark:bg-stone-800 dark:border-stone-700 dark:hover:border-amber-600`}
              >
                <span className="text-2xl leading-none group-hover:scale-110 transition-transform duration-200">{emoji}</span>
                <span className="whitespace-nowrap text-[11px] font-bold text-stone-700 dark:text-stone-300 group-hover:text-amber-800 dark:group-hover:text-amber-400">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border-y border-stone-800 py-8">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StatCounter value="500+" label="Verified Experiences" />
            <StatCounter value="50+" label="Destinations" />
            <StatCounter value="10,000+" label="Happy Travelers" />
            <StatCounter value="4.9★" label="Avg Rating" />
          </div>
        </div>
      </section>

      {/* ─── DESTINATIONS MOSAIC ──────────────────────────────────── */}
      <section ref={destRef} className="reveal-up mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mb-10 flex items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Where India feels different</p>
            <h2 className="font-display text-3xl text-stone-900 dark:text-stone-100 sm:text-5xl">Find your next story</h2>
            {liveAbroad.length > 0 && <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-amber-700 dark:text-amber-400">
              <span>Now across Asia too:</span>
              {liveAbroad.map((country) => (
                <Link key={country} to={`/search?country=${encodeURIComponent(country)}`} className="inline-flex items-center gap-1 hover:text-amber-800 dark:hover:text-amber-300">
                  {country} <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </p>}
          </div>
          <Link to="/search" className="hidden items-center gap-2 text-sm font-extrabold text-amber-700 dark:text-amber-400 transition hover:text-amber-800 dark:hover:text-amber-300 sm:flex">
            All destinations <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid auto-rows-[210px] grid-cols-2 gap-3 lg:grid-cols-4">
          {featuredDests.map((dest, i) => (
            <Link
              key={dest.id}
              to={`/search?destination=${encodeURIComponent(destinationParam(dest))}`}
              className={`group relative overflow-hidden rounded-3xl ${i === 0 ? "col-span-2 row-span-2" : ""}`}
            >
              <img
                src={dest.hero_image}
                alt={dest.name}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/15 to-transparent" />
              {/* Shimmer overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 group-hover:to-transparent transition-all duration-500" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <h3 className={`font-display leading-none text-white ${i === 0 ? "text-3xl sm:text-5xl" : "text-2xl"}`}>{dest.name}</h3>
                <p className="mt-1 text-[11px] font-semibold text-white/80 sm:text-sm">{dest.tagline || dest.state}</p>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <MapPin className="h-3 w-3" /> Explore
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── BESTSELLER EXPERIENCES ───────────────────────────────── */}
      <section ref={bestRef} className={`${!loading && !bestsellers.length ? "hidden " : ""}reveal-up bg-warm-50 dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800 py-16 sm:py-20`}>
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-10 flex items-end justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">Loved by travelers in India and across Asia</p>
              <h2 className="font-display text-3xl text-stone-900 dark:text-stone-100 sm:text-5xl">Experiences worth every rupee</h2>
            </div>
            <Link to="/search" className="hidden items-center gap-2 text-sm font-extrabold text-amber-700 dark:text-amber-400 transition hover:text-amber-800 sm:flex">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="-mx-5 flex gap-4 overflow-x-auto px-5 hide-scrollbar sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
            {loading
              ? [1, 2, 3, 4].map((i) => <SkeletonCard key={i} className="flex-shrink-0 w-72 sm:w-auto" />)
              : bestsellers.slice(0, 6).map((activity, i) => (
                  <ExperienceCard key={activity.id} activity={activity} index={i} />
                ))
            }
          </div>

          <div className="mt-10 flex justify-center lg:hidden">
            <Link to="/search" className="inline-flex items-center gap-2 rounded-full border-2 border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-6 py-3 text-sm font-extrabold text-stone-900 dark:text-stone-100 transition-all duration-200 hover:border-amber-400 hover:shadow-card">
              See all experiences <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── CATEGORIES GRID ──────────────────────────────────────── */}
      <section ref={catRef} className="reveal-up mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Every kind of India trip</p>
          <h2 className="font-display text-3xl text-stone-900 dark:text-stone-100 sm:text-4xl">What would you like to do?</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES_GRID.map(({ emoji, title, desc, q, type, bg }, i) => (
            <Link
              key={title}
              to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
              className={`group flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-card ${bg}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="text-3xl group-hover:scale-110 transition-transform duration-200 origin-left">{emoji}</span>
              <div>
                <strong className="block text-sm font-extrabold text-stone-900 dark:text-stone-100">{title}</strong>
                <span className="text-xs text-stone-600 dark:text-stone-400">{desc}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5">
                Explore <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── TRUST SECTION ────────────────────────────────────────── */}
      <section ref={trustRef} className="reveal-up bg-gradient-to-br from-stone-50 to-warm-100 dark:from-stone-900 dark:to-stone-950 border-y border-stone-200 dark:border-stone-800 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-14 text-center">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">The Idea Holiday promise</p>
            <h2 className="font-display text-3xl text-stone-900 dark:text-stone-100 sm:text-4xl">Book with complete confidence</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_ITEMS.map(({ icon: Icon, label, copy, color, bg, stat }, i) => (
              <div
                key={label}
                className="group rounded-3xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6 text-center shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl ${bg} transition-transform duration-300 group-hover:scale-110`}>
                  <div className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${color} shadow-sm`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="font-display text-2xl font-bold text-stone-900 dark:text-stone-100 mb-1">{stat}</div>
                <strong className="block text-sm font-extrabold text-stone-900 dark:text-stone-100">{label}</strong>
                <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section ref={howRef} className="reveal-up border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 py-16">
        <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Simple process</p>
          <h2 className="font-display text-3xl text-stone-900 dark:text-stone-100">How Idea Holiday works</h2>

          <div className="mt-14 relative grid gap-8 sm:grid-cols-3">
            {/* Connecting line (desktop only) */}
            <div className="absolute top-7 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 dark:from-amber-800 dark:via-amber-600 dark:to-amber-800 hidden sm:block" />

            {[
              { n: "01", title: "Search & discover", copy: "Browse 500+ experiences in India and across Asia — tours, sightseeing, transfers and multi-day packages.", icon: "🔍" },
              { n: "02", title: "Book in minutes", copy: "Secure checkout, instant voucher, flexible payment. No hidden platform fees.", icon: "⚡" },
              { n: "03", title: "Enjoy your trip", copy: "Your verified local operator meets you. We're on standby for any support you need.", icon: "🌟" },
            ].map(({ n, title, copy, icon }, i) => (
              <div key={n} className="flex flex-col items-center gap-4 text-center relative" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="relative">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-glow-sm">
                    <span className="text-2xl">{icon}</span>
                  </div>
                  <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-stone-900 dark:bg-stone-100 text-[10px] font-black text-amber-400 dark:text-amber-600">
                    {n}
                  </span>
                </div>
                <strong className="font-display text-xl text-stone-900 dark:text-stone-100">{title}</strong>
                <p className="text-sm leading-relaxed text-stone-500 dark:text-stone-400 max-w-xs">{copy}</p>
              </div>
            ))}
          </div>

          <Link
            to="/how-it-works"
            className="mt-12 btn-primary inline-flex"
          >
            Learn more <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ─── NEWSLETTER ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900 via-stone-900 to-stone-950 p-8 sm:p-12 shadow-xl border border-amber-800/30">
          {/* Decorative blobs */}
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none animate-float" />
          <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-amber-600/10 blur-3xl pointer-events-none animate-float animate-delay-4" />
          {/* Dot grid overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(245,158,11,0.08) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

          <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                <span>Insider Travel Club</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Stay Inspired. Get Secret Deals & Itineraries.
              </h2>
              <p className="text-sm text-stone-300 max-w-xl leading-relaxed">
                Join 10,000+ travelers receiving weekly curated adventures, seasonal discounts, and handpicked local guide recommendations in India and across Asia.
              </p>
            </div>

            <div className="lg:col-span-5">
              {nlStatus === "success" ? (
                <div className="rounded-2xl bg-emerald-950/60 border border-emerald-500/40 p-6 text-center animate-reveal-in">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-white mb-1">You're On The List! 🎉</h3>
                  <p className="text-xs text-emerald-200">{nlMessage}</p>
                </div>
              ) : (
                <form onSubmit={handleNewsletterSubmit} className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Your name (optional)"
                      value={nlName}
                      onChange={(e) => setNlName(e.target.value)}
                      className="w-full sm:w-1/3 rounded-xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Enter your email address"
                      value={nlEmail}
                      onChange={(e) => { setNlEmail(e.target.value); if (nlStatus === "error") setNlStatus("idle"); }}
                      className="w-full sm:w-2/3 rounded-xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={nlStatus === "loading"}
                    className="w-full btn-primary justify-center rounded-xl py-3.5 text-stone-950 disabled:opacity-60"
                  >
                    {nlStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Subscribe for Free</span><Send className="h-4 w-4" /></>}
                  </button>
                  {nlStatus === "error" && <p className="text-xs text-rose-400 font-medium">{nlMessage}</p>}
                  <p className="text-[11px] text-stone-500 text-center">No spam ever. Unsubscribe anytime with one click.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-10 pb-20 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 px-8 py-14 sm:px-12 lg:flex lg:items-center lg:justify-between shadow-xl shadow-amber-400/20">
          {/* Floating shapes */}
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-amber-300/40 animate-float" />
          <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-amber-600/30 animate-float animate-delay-3" />
          <div className="absolute top-1/2 right-1/3 h-20 w-20 rounded-full bg-white/10 animate-float animate-delay-5" />

          <div className="relative">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-900/70">India's first travel marketplace</p>
            <h2 className="mt-2 max-w-2xl font-display text-4xl text-stone-950 sm:text-5xl">
              One country. A million ideas. Your holiday.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-800 font-medium">
              Partner with India's best local operators — verified, rated and ready to show you the real India.
            </p>
          </div>

          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <Link
              to="/search"
              className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-sm font-extrabold text-white transition-all duration-200 hover:bg-stone-800 hover:shadow-xl hover:-translate-y-0.5 shadow-md"
            >
              Explore experiences <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/supplier/signup"
              className="inline-flex items-center gap-2 rounded-full border-2 border-stone-950/30 bg-white/50 hover:bg-white px-6 py-3.5 text-sm font-extrabold text-stone-950 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            >
              List your experience
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
