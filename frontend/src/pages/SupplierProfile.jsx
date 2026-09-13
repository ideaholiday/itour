import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Check, Languages, MapPin, MessageCircle, Share2, Star } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import SeoHead from "../components/SeoHead.jsx";
import StarRating from "../components/StarRating.jsx";
import Avatar from "../components/ui/Avatar.jsx";
import SupplierBadge from "../components/supplier/SupplierBadge.jsx";

const formatDate = (value) => {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "";
};

function ReviewItem({ review }) {
  return (
    <li className="border-b border-stone-100 py-5 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold text-stone-900">{review.travelerName}</span>
        {review.rating && (
          <span className="inline-flex items-center gap-0.5 text-amber-600">
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} className={`h-3.5 w-3.5 ${index < review.rating ? "fill-amber-500" : "text-stone-300"}`} aria-hidden="true" />
            ))}
            <span className="sr-only">{review.rating} out of 5</span>
          </span>
        )}
        <span className="text-stone-400">{formatDate(review.createdAt)}</span>
        {review.countedInRating ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Check className="h-3 w-3" />Verified booking</span>
        ) : (
          <span className="text-stone-500">Not tied to a booking · not counted in the rating</span>
        )}
      </div>
      {review.title && <p className="mt-2 text-sm font-bold text-stone-900">{review.title}</p>}
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-700">{review.comment}</p>
      {review.photos?.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((photo) => <img key={photo} src={photo} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />)}
        </div>
      )}
      {review.supplierResponse && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
          <span className="block text-xs font-bold text-stone-900">Response from the operator</span>
          {review.supplierResponse}
        </div>
      )}
    </li>
  );
}

function EnquiryForm({ slug, supplierName }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [travelers, setTravelers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentRef, setSentRef] = useState("");
  const role = String(user?.role || user?.user_metadata?.role || "").toUpperCase();

  if (!user) {
    return (
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-stone-900">Ask {supplierName} a question</h2>
        <p className="mt-2 text-sm text-stone-600">Sign in to send an enquiry. Replies arrive in your Idea Holiday messages.</p>
        <button
          type="button"
          onClick={() => navigate(`/login?from=${encodeURIComponent(location.pathname)}`)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400"
        >
          <MessageCircle className="h-4 w-4" />Sign in to enquire
        </button>
      </div>
    );
  }

  if (["SUPPLIER", "ADMIN", "STAFF", "DRIVER"].includes(role)) {
    return (
      <div className="rounded-3xl border border-stone-200 bg-white p-6 text-sm text-stone-600 shadow-sm">
        Enquiries are sent by travelers. Sign in with a traveler account to try the enquiry form.
      </div>
    );
  }

  if (sentRef) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-emerald-900">Enquiry sent</h2>
        <p className="mt-2 text-sm text-emerald-900">{supplierName} will reply in your messages. Reference {sentRef}.</p>
        <Link to={`/messages?enquiry=${encodeURIComponent(sentRef)}`} className="mt-4 inline-flex text-sm font-bold text-emerald-800 underline underline-offset-2">Open messages</Link>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.sendSupplierEnquiry(slug, {
        message: message.trim(),
        travelDate: travelDate || undefined,
        travelers: travelers ? Number(travelers) : undefined,
      });
      setSentRef(result.enquiry.ref);
    } catch (err) {
      setError(err.status === 429 ? "You've sent a lot of enquiries. Try again in an hour." : err.message);
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  return (
    <form onSubmit={submit} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold text-stone-900">Ask {supplierName} a question</h2>
      <p className="mt-1 text-xs text-stone-500">Keep it on Idea Holiday — messages with phone numbers, emails or links aren't sent.</p>
      <label className="mt-4 block text-xs font-bold text-stone-700" htmlFor="enquiry-message">Your question</label>
      <textarea
        id="enquiry-message"
        required
        minLength={10}
        maxLength={2000}
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        className="mt-1 w-full rounded-2xl border border-stone-200 p-3 text-sm focus:border-amber-500 focus:outline-none"
        placeholder="Dates, group size, pickup area, anything you'd like to know"
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-bold text-stone-700">
          Travel date
          <input type="date" min={today} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 p-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-bold text-stone-700">
          Travelers
          <input type="number" min={1} max={100} value={travelers} onChange={(event) => setTravelers(event.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 p-2 text-sm font-normal" />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      <button type="submit" disabled={busy || message.trim().length < 10} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
        <MessageCircle className="h-4 w-4" />{busy ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}

export default function SupplierProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.getSupplierProfile(slug)
      .then((result) => {
        if (cancelled) return;
        if (result.redirectTo) {
          navigate(`/suppliers/${result.redirectTo}`, { replace: true });
          return;
        }
        setData(result);
        setReviews(result.reviews || []);
        setPagination(result.pagination || null);
        setStatus("ready");
      })
      .catch((err) => { if (!cancelled) setStatus(err.status === 404 ? "missing" : "error"); });
    return () => { cancelled = true; };
  }, [slug, navigate]);

  const loadMore = async () => {
    const result = await api.getSupplierProfileReviews(slug, (pagination?.page || 1) + 1);
    setReviews((current) => [...current, ...(result.reviews || [])]);
    setPagination(result.pagination);
  };

  const share = async () => {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try { await navigator.share({ title: data.supplier.name, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  if (status === "loading") {
    return <div className="mx-auto max-w-5xl px-4 py-16"><div className="h-56 animate-pulse rounded-3xl bg-stone-200" /></div>;
  }
  if (status !== "ready") {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <SeoHead title="Operator not found | Idea Holiday" noindex />
        <h1 className="font-display text-2xl font-bold text-stone-900">{status === "missing" ? "This operator isn't listed" : "We couldn't load this operator"}</h1>
        <p className="mt-3 text-sm text-stone-600">{status === "missing" ? "The profile may have been renamed or hidden." : "Please try again in a moment."}</p>
        <Link to="/suppliers" className="mt-6 inline-flex rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950">Browse operators</Link>
      </div>
    );
  }

  const { supplier, seo } = data;
  const facts = [
    supplier.yearsInOperation ? `${supplier.yearsInOperation} years in operation` : null,
    supplier.memberSince ? `On Idea Holiday since ${supplier.memberSince}` : null,
    supplier.businessType || null,
  ].filter(Boolean);

  return (
    <div className="bg-[#FAF9F6] pb-16">
      <SeoHead title={seo.title} description={seo.description} canonical={seo.canonical} image={seo.image} type="profile" jsonLd={seo.jsonLd} noindex={!supplier.indexable} />

      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
        <nav className="flex flex-wrap items-center gap-2 text-xs text-stone-500" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-amber-800">Home</Link><span>›</span>
          <Link to="/suppliers" className="hover:text-amber-800">Operators</Link>
          {supplier.cityPath && <><span>›</span><Link to={supplier.cityPath} className="hover:text-amber-800">{supplier.city}</Link></>}
        </nav>
      </div>
      <div className="relative h-40 bg-gradient-to-br from-amber-200 via-amber-100 to-stone-200 sm:h-64">
        {supplier.coverUrl && <img src={supplier.coverUrl} alt="" className="h-full w-full object-cover" />}
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">

        <header className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            {supplier.logoUrl ? (
              <img src={supplier.logoUrl} alt={`${supplier.name} logo`} className="-mt-14 h-24 w-24 shrink-0 rounded-3xl border-4 border-white bg-white object-cover shadow-md sm:-mt-20 sm:h-28 sm:w-28" />
            ) : (
              <div className="-mt-14 shrink-0 rounded-3xl border-4 border-white bg-white shadow-md sm:-mt-20"><Avatar name={supplier.name} size="xl" /></div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-stone-900 sm:text-3xl">{supplier.name}</h1>
              {supplier.tagline && <p className="mt-1 text-sm text-stone-600">{supplier.tagline}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-600">
                <SupplierBadge badge={supplier.badge} detailed />
                {supplier.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[supplier.city, supplier.state].filter(Boolean).join(", ")}</span>}
                <StarRating rating={supplier.rating.average} count={supplier.rating.count} newLabel="No verified reviews yet" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <a href="#enquire" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400 lg:hidden">
              <MessageCircle className="h-4 w-4" />Enquire
            </a>
            <button type="button" onClick={share} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50">
              {copied ? <><Check className="h-4 w-4 text-emerald-600" />Link copied</> : <><Share2 className="h-4 w-4" />Share</>}
            </button>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <main className="space-y-8">
            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-stone-900">About</h2>
              {supplier.about
                ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">{supplier.about}</p>
                : <p className="mt-3 text-sm text-stone-500">{supplier.name} hasn't added a description yet.</p>}
              {facts.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {facts.map((fact) => <li key={fact} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700"><CalendarDays className="h-3.5 w-3.5" />{fact}</li>)}
                </ul>
              )}
              {(supplier.languages.length > 0 || supplier.serviceCities.length > 0) && (
                <dl className="mt-5 grid gap-4 border-t border-stone-100 pt-5 text-sm sm:grid-cols-2">
                  {supplier.languages.length > 0 && (
                    <div><dt className="flex items-center gap-1 text-xs font-bold text-stone-500"><Languages className="h-3.5 w-3.5" />Languages</dt><dd className="mt-1 text-stone-800">{supplier.languages.join(", ")}</dd></div>
                  )}
                  {supplier.serviceCities.length > 0 && (
                    <div><dt className="flex items-center gap-1 text-xs font-bold text-stone-500"><MapPin className="h-3.5 w-3.5" />Operates in</dt><dd className="mt-1 text-stone-800">{supplier.serviceCities.join(", ")}</dd></div>
                  )}
                </dl>
              )}
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="reviews-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="reviews-heading" className="font-display text-lg font-bold text-stone-900">Reviews</h2>
                {supplier.rating.count > 0 && (
                  <span className="text-sm text-stone-600"><strong className="text-stone-900">{supplier.rating.average}</strong> / 5 from {supplier.rating.count} verified review{supplier.rating.count === 1 ? "" : "s"}</span>
                )}
              </div>
              {reviews.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">No reviews yet. Travelers who book with {supplier.name} on Idea Holiday can review them after the trip.</p>
              ) : (
                <ul className="mt-2">{reviews.map((review) => <ReviewItem key={review.id} review={review} />)}</ul>
              )}
              {pagination?.hasNext && (
                <button type="button" onClick={loadMore} className="mt-4 rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">Show more reviews</button>
              )}
            </section>
          </main>

          <aside id="enquire" className="scroll-mt-24 space-y-4 lg:sticky lg:top-24 lg:self-start">
            <EnquiryForm slug={supplier.slug} supplierName={supplier.name} />
            {supplier.cityPath && (
              <Link to={supplier.cityPath} className="block rounded-3xl border border-stone-200 bg-white p-5 text-sm font-bold text-stone-800 shadow-sm hover:border-amber-300">
                More operators in {supplier.city} →
              </Link>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
