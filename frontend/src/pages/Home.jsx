import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, CalendarClock, Check, CheckCircle2, Clock, Headphones, Heart, IndianRupee, Loader2, Mail, MapPin, Send, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import SearchBar from "../components/SearchBar.jsx";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useCurrency } from "../lib/currency.jsx";

const HERO_IMAGES = [
  { src: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=90", label: "Taj Mahal, Agra" },
  { src: "https://images.unsplash.com/photo-1599661046827-dacde6976549?auto=format&fit=crop&w=1800&q=90", label: "Jaipur, Rajasthan" },
  { src: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1800&q=90", label: "Kerala Backwaters" },
  { src: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1800&q=90", label: "Goa Beaches" },
  { src: "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&w=1800&q=90", label: "Ladakh" },
];

const CATEGORIES = [
  { emoji: "🎒", label: "Holiday Packages", type: "PACKAGE", to: "/search?type=PACKAGE" },
  { emoji: "🗺️", label: "Tours & Sightseeing", type: "TOUR", to: "/search?type=TOUR" },
  { emoji: "🚗", label: "Transfers & Cabs", type: "TRANSFER", to: "/transfers" },
  { emoji: "🎡", label: "Attractions & Shows", type: "ATTRACTION", to: "/search?type=ATTRACTION" },
  { emoji: "🤿", label: "Active Experiences", type: "EXPERIENCE", to: "/search?type=EXPERIENCE" },
  { emoji: "🌊", label: "Scuba & Water Sports", q: "Scuba" },
  { emoji: "🥘", label: "Cooking & Food Walks", q: "Cooking" },
  { emoji: "🐅", label: "Safaris & Wildlife", q: "Safari" },
  { emoji: "🏝️", label: "Island Trips & Boats", q: "Island" },
  { emoji: "🏎️", label: "ATV & Off-Road", q: "ATV" },
];

const FALLBACK_DESTINATIONS = [
  { id: "goa", name: "Goa", tagline: "Sun, sea & slow days", hero_image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=85" },
  { id: "jaipur", name: "Jaipur", tagline: "Palaces & pink streets", hero_image: "https://images.unsplash.com/photo-1599661046827-dacde6976549?auto=format&fit=crop&w=900&q=85" },
  { id: "kerala", name: "Kerala", tagline: "Backwaters & green escapes", hero_image: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=900&q=85" },
  { id: "agra", name: "Agra", tagline: "Timeless wonder", hero_image: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=85" },
  { id: "ladakh", name: "Ladakh", tagline: "High roads & clear skies", hero_image: "https://images.unsplash.com/photo-1581791538302-03537b9c97bf?auto=format&fit=crop&w=900&q=85" },
];

const FALLBACK_EXPERIENCES = [
  { id: "taj-sunrise", title: "Taj Mahal Sunrise Tour with Local Storyteller", destination_name: "Agra", category: "Heritage", rating: 4.9, review_count: 1284, price_inr: 2499, duration_hours: 4, images: ["https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=600&q=80"], bestseller: true },
  { id: "jaipur-private", title: "Private Jaipur Forts, Palaces & Bazaar Full Day", destination_name: "Jaipur", category: "Sightseeing", rating: 4.8, review_count: 842, price_inr: 3199, duration_hours: 8, images: ["https://images.unsplash.com/photo-1599661046827-dacde6976549?auto=format&fit=crop&w=600&q=80"], bestseller: false },
  { id: "kerala-houseboat", title: "Alleppey Backwater Houseboat Overnight Experience", destination_name: "Kerala", category: "Backwaters", rating: 4.9, review_count: 635, price_inr: 4850, duration_hours: 24, images: ["https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=600&q=80"], bestseller: true },
  { id: "goa-sunset", title: "Goa Sunset Cruise with Live Music & Local Bites", destination_name: "Goa", category: "Cruises", rating: 4.7, review_count: 519, price_inr: 1599, duration_hours: 3, images: ["https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=80"], bestseller: false },
  { id: "delhi-walk", title: "Old Delhi Street Food Walk & Chandni Chowk Tour", destination_name: "Delhi", category: "Food & Culture", rating: 4.8, review_count: 720, price_inr: 1299, duration_hours: 3, images: ["https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=600&q=80"], bestseller: true },
  { id: "varanasi-ghats", title: "Varanasi Sunrise Boat Ride & Ghat Walk", destination_name: "Varanasi", category: "Spiritual", rating: 4.9, review_count: 910, price_inr: 999, duration_hours: 3, images: ["https://images.unsplash.com/photo-1561361058-c24e40f406b8?auto=format&fit=crop&w=600&q=80"], bestseller: true },
];

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "Verified operators", copy: "Every partner KYB-approved by our team", color: "text-emerald-600 bg-emerald-50" },
  { icon: IndianRupee, label: "No hidden fees", copy: "Clear INR pricing, no platform surcharges", color: "text-amber-600 bg-amber-50" },
  { icon: CalendarClock, label: "Free cancellation", copy: "Flexible options on most experiences", color: "text-indigo-600 bg-indigo-50" },
  { icon: Headphones, label: "24×7 human support", copy: "Real help before, during and after", color: "text-rose-600 bg-rose-50" },
];

function HeroSlide({ src, label, active }) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-1000 ${active ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!active}
    >
      <img src={src} alt={label} className="h-full w-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/30 to-slate-950/80" />
    </div>
  );
}

function ExperienceCard({ activity }) {
  const { formatPrice, currency } = useCurrency();
  const { id, title, images, hero_image, heroImage, price_inr, rating, review_count, duration_hours, destination_name, city, bestseller } = activity;
  const img = images?.[0] || heroImage || hero_image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80";
  const loc = destination_name || city || "India";
  const dur = duration_hours >= 24 ? `${Math.round(duration_hours / 24)} day${Math.round(duration_hours / 24) > 1 ? "s" : ""}` : duration_hours >= 1 ? `${duration_hours}h` : `${Math.round((duration_hours || 1) * 60)}m`;

  return (
    <Link to={`/activity/${id}`} className="group flex-shrink-0 w-72 sm:w-auto block">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
        <div className="relative h-52 overflow-hidden">
          <img src={img} alt={title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          {bestseller && (
            <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-stone-950 shadow">
              Bestseller
            </span>
          )}
          <button
            aria-label="Save to wishlist"
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow transition hover:scale-110"
            onClick={(e) => e.preventDefault()}
          >
            <Heart className="h-4 w-4 text-slate-400" />
          </button>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              <MapPin className="h-3 w-3" />{loc}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
              <Clock className="h-3 w-3" />{dur}
            </span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-stone-900 group-hover:text-amber-700 transition-colors min-h-[2.6rem]">{title}</h3>
          <div className="mt-2 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span className="text-xs font-bold text-slate-800">{rating}</span>
            <span className="text-xs text-slate-400">({(review_count || 0).toLocaleString("en-IN")})</span>
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">From</span>
              {currency !== "INR" && (
                <span className="text-[9px] text-slate-400 font-mono">₹{(price_inr || 0).toLocaleString("en-IN")}</span>
              )}
            </div>
            <strong className="font-display text-xl text-stone-900">{formatPrice(price_inr || 0)}</strong>
          </div>
        </div>
      </div>
    </Link>
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
  const scrollRef = useRef(null);

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (!nlEmail || !nlEmail.includes("@")) return;

    setNlStatus("loading");
    setNlMessage("");

    try {
      const res = await api.subscribeNewsletter({
        email: nlEmail.trim(),
        name: nlName.trim() || undefined,
        source: "HOME_CTA",
      });

      if (res && res.success) {
        setNlStatus("success");
        setNlMessage(res.message || "Thank you for subscribing! Check your inbox.");
        setNlEmail("");
        setNlName("");
      } else {
        setNlStatus("error");
        setNlMessage(res?.error || "Failed to subscribe. Please try again.");
      }
    } catch (err) {
      setNlStatus("error");
      setNlMessage(err.message || "Something went wrong. Please try again.");
    }
  };

  // Cycle hero images
  useEffect(() => {
    const interval = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Promise.all([api.getDestinations(), api.getActivities({ sort: "bestseller" })])
      .then(([destData, actData]) => {
        setDestinations(destData?.length ? destData : FALLBACK_DESTINATIONS);
        const featured = (actData || []).filter((a) => a.is_published !== false).slice(0, 8);
        setBestsellers(featured.length ? featured : FALLBACK_EXPERIENCES);
      })
      .catch(() => { setDestinations(FALLBACK_DESTINATIONS); setBestsellers(FALLBACK_EXPERIENCES); })
      .finally(() => setLoading(false));
  }, []);

  const featuredDests = (destinations.length ? destinations : FALLBACK_DESTINATIONS).slice(0, 5);

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://ideaholiday.in/#website",
        "url": "https://ideaholiday.in/",
        "name": "Idea Holiday",
        "description": "India's Premier Travel Experience Marketplace",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://ideaholiday.in/search?q={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Organization",
        "@id": "https://ideaholiday.in/#organization",
        "name": "Idea Holiday",
        "url": "https://ideaholiday.in/",
        "logo": "https://ideaholiday.in/idea-holiday-social.png",
        "sameAs": [
          "https://www.facebook.com/ideaholiday",
          "https://www.instagram.com/ideaholiday"
        ]
      }
    ]
  };

  return (
    <div className="bg-white text-slate-950">
      <SeoHead
        title="Idea Holiday — India's Premier Travel Experience Marketplace"
        description="Book curated day tours, heritage sightseeing, scuba & water sports, airport transfers and holiday packages across India with verified local operators."
        canonical="https://ideaholiday.in/"
        jsonLd={homeJsonLd}
      />

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative isolate z-20 overflow-visible" style={{ minHeight: "92vh" }}>
        {HERO_IMAGES.map((img, i) => (
          <HeroSlide key={img.src} src={img.src} label={img.label} active={i === heroIndex} />
        ))}

        {/* Center content */}
        <div className="relative z-20 flex min-h-[92vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-genda" />
            India's #1 travel experiences marketplace
          </div>

          <h1 className="max-w-4xl text-balance font-display text-5xl font-normal leading-[1.05] text-white drop-shadow-lg sm:text-6xl lg:text-[5.5rem]">
            Discover India like you <span className="italic text-genda">belong here.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
            Book tours, attractions, transfers and day trips — handpicked, clearly priced, easy to cancel.
          </p>

          {/* Search bar */}
          <div className="mt-8 w-full max-w-3xl">
            <SearchBar />
          </div>

          {/* Quick links */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {["Taj Mahal", "Goa Beaches", "Jaipur Forts", "Kerala Houseboats", "Airport Transfers"].map((place) => (
              <Link
                key={place}
                to={`/search?q=${encodeURIComponent(place)}`}
                className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                {place}
              </Link>
            ))}
          </div>
        </div>

        {/* Image indicators */}
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {HERO_IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => setHeroIndex(i)}
              aria-label={`Show ${HERO_IMAGES[i].label}`}
              className={`h-1.5 rounded-full transition-all ${i === heroIndex ? "w-8 bg-genda" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>

        {/* Trust strip */}
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/20 bg-stone-950/40 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-6 px-5 py-3.5 text-xs font-semibold text-white/90 sm:gap-10">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-400" /> 500+ verified experiences</span>
            <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-amber-400" /> KYB-verified operators</span>
            <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-400" /> Free cancellation on most</span>
            <span className="flex items-center gap-2"><Headphones className="h-4 w-4 text-amber-400" /> 24×7 support in Hindi & English</span>
          </div>
        </div>
      </section>

      {/* ─── CATEGORIES ───────────────────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-white py-5">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-1">
            {CATEGORIES.map(({ emoji, label, q, type, to }) => (
              <Link
                key={label}
                to={to || (q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`)}
                className="group flex-shrink-0 flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="whitespace-nowrap text-[11px] font-bold text-stone-700 group-hover:text-amber-800">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DESTINATIONS MOSAIC ──────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mb-8 flex items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700">Where India feels different</p>
            <h2 className="font-display text-3xl text-stone-900 sm:text-5xl">Find your next story</h2>
          </div>
          <Link to="/search" className="hidden items-center gap-2 text-sm font-extrabold text-amber-700 transition hover:text-amber-800 sm:flex">
            All destinations <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid auto-rows-[210px] grid-cols-2 gap-3 lg:grid-cols-4">
          {featuredDests.map((dest, i) => (
            <Link
              key={dest.id}
              to={`/search?destination=${dest.id}`}
              className={`group relative overflow-hidden rounded-3xl ${i === 0 ? "col-span-2 row-span-2" : ""}`}
            >
              <img
                src={dest.hero_image}
                alt={dest.name}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <h3 className={`font-display leading-none text-white ${i === 0 ? "text-3xl sm:text-5xl" : "text-2xl"}`}>{dest.name}</h3>
                <p className="mt-1 text-[11px] font-semibold text-white/80 sm:text-sm">{dest.tagline || dest.state}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                  <MapPin className="h-3 w-3" /> Explore
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── BESTSELLER EXPERIENCES ───────────────────────────────────── */}
      <section className="bg-[#FAF9F6] border-y border-stone-200 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-8 flex items-end justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">Loved by travelers across India</p>
              <h2 className="font-display text-3xl text-stone-900 sm:text-5xl">Experiences worth every rupee</h2>
            </div>
            <Link to="/search" className="hidden items-center gap-2 text-sm font-extrabold text-amber-700 transition hover:text-amber-800 sm:flex">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Horizontal scroll on mobile, 4-col grid on desktop */}
          <div
            ref={scrollRef}
            className="hide-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0"
          >
            {loading
              ? [1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex-shrink-0 w-72 sm:w-auto h-96 animate-pulse rounded-2xl bg-stone-200" />
                ))
              : bestsellers.slice(0, 6).map((activity) => (
                  <ExperienceCard key={activity.id} activity={activity} />
                ))
            }
          </div>

          <div className="mt-8 flex justify-center lg:hidden">
            <Link to="/search" className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-extrabold text-stone-900 transition hover:bg-stone-50">
              See all experiences <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── INDIA-SPECIFIC CATEGORIES GRID ──────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700">Every kind of India trip</p>
          <h2 className="font-display text-3xl text-stone-900 sm:text-4xl">What would you like to do?</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { emoji: "🏰", title: "Heritage & Forts", desc: "Mughal wonders, Rajput palaces", q: "Heritage", bg: "from-amber-50 to-orange-50 border-amber-200" },
            { emoji: "🛶", title: "Backwater Cruises", desc: "Kerala's legendary waterways", q: "Backwaters", bg: "from-emerald-50 to-teal-50 border-emerald-200" },
            { emoji: "🐅", title: "Wildlife Safaris", desc: "Tigers, elephants & birdlife", q: "Wildlife", bg: "from-green-50 to-lime-50 border-green-200" },
            { emoji: "🍛", title: "Food & Street Walks", desc: "Authentic flavors, local stories", q: "Food", bg: "from-red-50 to-orange-50 border-red-200" },
            { emoji: "✈️", title: "Airport Transfers", desc: "Smooth arrivals & departures", type: "TRANSFER", bg: "from-amber-50 to-stone-50 border-amber-200" },
            { emoji: "🏖️", title: "Beach Activities", desc: "Goa, Andamans, Kovalam", q: "Beaches", bg: "from-amber-50 to-yellow-50 border-amber-200" },
            { emoji: "🏔️", title: "Hill Stations", desc: "Shimla, Manali, Darjeeling", q: "Adventure", bg: "from-stone-50 to-amber-50 border-stone-200" },
            { emoji: "🕌", title: "Spiritual Journeys", desc: "Varanasi, Rishikesh, Tirupati", q: "Spiritual", bg: "from-yellow-50 to-amber-50 border-yellow-200" },
          ].map(({ emoji, title, desc, q, type, bg }) => (
            <Link
              key={title}
              to={q ? `/search?q=${encodeURIComponent(q)}` : `/search?type=${type}`}
              className={`group flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 transition hover:-translate-y-0.5 hover:shadow-md ${bg}`}
            >
              <span className="text-3xl">{emoji}</span>
              <div>
                <strong className="block text-sm font-extrabold text-stone-900">{title}</strong>
                <span className="text-xs text-stone-600">{desc}</span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 opacity-0 transition group-hover:opacity-100">
                Explore <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── TRUST SECTION ────────────────────────────────────────────── */}
      <section className="bg-[#F5F3ED] border-y border-stone-200 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-amber-700">The Idea Holiday promise</p>
            <h2 className="font-display text-3xl text-stone-900 sm:text-4xl">Book with complete confidence</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_ITEMS.map(({ icon: Icon, label, copy, color }) => (
              <div key={label} className="rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-sm">
                <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${color}`}>
                  <Icon className="h-7 w-7" />
                </div>
                <strong className="block text-base font-extrabold text-stone-900">{label}</strong>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS STRIP ───────────────────────────────────────── */}
      <section className="border-b border-stone-200 bg-white py-14">
        <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
          <h2 className="font-display text-3xl text-stone-900">How Idea Holiday works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: "01", title: "Search & discover", copy: "Browse 500+ experiences across India — tours, sightseeing, transfers and multi-day packages." },
              { n: "02", title: "Book in minutes", copy: "Secure checkout, instant voucher, flexible payment. No hidden platform fees." },
              { n: "03", title: "Enjoy your trip", copy: "Your verified local operator meets you. We're on standby for any support you need." },
            ].map(({ n, title, copy }) => (
              <div key={n} className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 font-mono text-xl font-black text-amber-800">{n}</span>
                <strong className="font-display text-xl text-stone-900">{title}</strong>
                <p className="text-sm leading-relaxed text-stone-600">{copy}</p>
              </div>
            ))}
          </div>
          <Link
            to="/how-it-works"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-md shadow-amber-500/20 transition"
          >
            Learn more <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ─── NEWSLETTER SUBSCRIPTION SECTION ──────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900 via-stone-900 to-stone-950 p-8 sm:p-12 shadow-xl border border-amber-800/30">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-600/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

          <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Insider Travel Club</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Stay Inspired. Get Secret Deals & Itineraries.
              </h2>
              <p className="text-sm text-stone-300 max-w-xl leading-relaxed">
                Join 10,000+ travelers receiving weekly curated adventures, seasonal discounts, and handpicked local guide recommendations across India.
              </p>
            </div>

            <div className="lg:col-span-5">
              {nlStatus === "success" ? (
                <div className="rounded-2xl bg-emerald-950/60 border border-emerald-500/40 p-6 text-center animate-in fade-in">
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
                      className="w-full sm:w-1/3 rounded-xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm text-white placeholder-stone-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Enter your email address"
                      value={nlEmail}
                      onChange={(e) => {
                        setNlEmail(e.target.value);
                        if (nlStatus === "error") setNlStatus("idle");
                      }}
                      className="w-full sm:w-2/3 rounded-xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm text-white placeholder-stone-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={nlStatus === "loading"}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-6 py-3 text-sm font-bold text-stone-950 shadow-lg shadow-amber-500/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    {nlStatus === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Subscribe for Free</span>
                        <Send className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {nlStatus === "error" && (
                    <p className="text-xs text-rose-400 font-medium">{nlMessage}</p>
                  )}

                  <p className="text-[11px] text-stone-400 text-center">
                    No spam ever. Unsubscribe with a single click anytime.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-16 pb-20 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-amber-400 px-8 py-12 sm:px-12 lg:flex lg:items-center lg:justify-between shadow-md">
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-amber-500/30" />
          <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-amber-300/40" />
          <div className="relative">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-stone-900/80">India's first travel marketplace</p>
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
              className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-6 py-3.5 text-sm font-extrabold text-white transition hover:bg-stone-800 shadow-md"
            >
              Explore experiences <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/supplier/signup"
              className="inline-flex items-center gap-2 rounded-full border-2 border-stone-950/40 bg-white/40 px-6 py-3.5 text-sm font-extrabold text-stone-950 transition hover:bg-white"
            >
              List your experience
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
