import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import ShareTripInvite from "../components/traveler/ShareTripInvite.jsx";

/**
 * The public review page, reached two ways and ending in the same place:
 *
 *   /review/:token — a single-use link from the post-trip email or WhatsApp.
 *   /r/:slug       — a supplier's shared link or printed QR. A signed-in
 *                    traveler can review straight away (shown on the listing,
 *                    not counted in the rating), or identify their booking
 *                    first, which mints a token and gives a verified review.
 *
 * The token paths need no sign-in: the token is the proof the booking is theirs.
 */

const TAGS = ["ON_TIME", "FRIENDLY_DRIVER", "CLEAN_VEHICLE", "GREAT_GUIDE", "GOOD_VALUE", "ACCURATE_LISTING", "SAFE_DRIVING"];
const tagLabel = (tag) => tag.toLowerCase().replace(/_/g, " ");

function Stars({ label, value, onChange, optional = false }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-stone-700">{label}</span>
        {optional && <span className="text-[9px] font-bold text-stone-400">Optional</span>}
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button type="button" key={score} onClick={() => onChange(score)} aria-label={`${label} ${score} stars`}>
            <Star className={`h-8 w-8 transition ${score <= value ? "fill-amber-400 text-amber-500" : "text-stone-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}

export default function ReviewInvite({ mode = "token" }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const isShareLink = mode === "share";
  const { user } = useAuth();

  const [token, setToken] = useState(isShareLink ? searchParams.get("token") || "" : params.token || "");
  const [link, setLink] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [showClaim, setShowClaim] = useState(false);
  const [productId, setProductId] = useState("");

  const [experienceRating, setExperienceRating] = useState(5);
  const [supplierRating, setSupplierRating] = useState(5);
  const [driverRating, setDriverRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState([]);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const loadToken = useCallback(async (value) => {
    try {
      const data = await api.getReviewInvite(value);
      setBooking(data.booking);
      setError("");
    } catch (err) {
      setError(err.message || "This review link could not be opened.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isShareLink && !token) {
        try {
          const data = await api.getReviewShareLink(params.slug);
          if (!cancelled) setLink(data.link);
        } catch (err) {
          if (!cancelled) setError(err.message || "This review link could not be opened.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      if (token) await loadToken(token);
      else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isShareLink, params.slug, token, loadToken]);

  const claim = async (event) => {
    event.preventDefault();
    setClaiming(true);
    setError("");
    try {
      const data = await api.claimReviewShareLink(params.slug, { bookingRef: bookingRef.trim(), phoneLast4: phoneLast4.trim() });
      setToken(data.token);
      setBooking(data.booking);
    } catch (err) {
      setError(err.message || "That booking could not be matched.");
    } finally {
      setClaiming(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (comment.trim().length < 10) {
      setError("Please write at least 10 characters about the experience.");
      return;
    }
    const openReview = !booking;
    if (openReview && !link?.productId && !productId) {
      setError("Please choose the trip you are reviewing.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      experienceRating,
      supplierRating,
      title: title.trim() || undefined,
      comment: comment.trim(),
      tags,
      wouldRecommend,
    };
    try {
      const data = openReview
        ? await api.submitShareLinkReview(params.slug, { ...payload, productId: link?.productId ? undefined : productId })
        : await api.submitInviteReview(token, { ...payload, driverRating: booking?.requiresDriverRating ? driverRating : undefined });
      setSubmitted(data);
    } catch (err) {
      setError(err.message || "Your review could not be submitted.");
    } finally {
      setSaving(false);
    }
  };

  const reviewForm = ({ requiresDriverRating = false, driverName = null, children = null } = {}) => (
    <form onSubmit={submit} className="mt-6 space-y-5">
      {children}
      <Stars label="Your experience" value={experienceRating} onChange={setExperienceRating} />
      <Stars label="The operator" value={supplierRating} onChange={setSupplierRating} />
      {requiresDriverRating && (
        <Stars label={`Your driver${driverName ? ` (${driverName})` : ""}`} value={driverRating} onChange={setDriverRating} />
      )}

      <label className="block">
        <span className="text-xs font-bold text-stone-700">Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120}
          placeholder="Sum it up in a few words" className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-sm" />
      </label>

      <label className="block">
        <span className="text-xs font-bold text-stone-700">What should other travelers know?</span>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={5} maxLength={2000} required
          placeholder="Pickup, the vehicle, the guide, anything that would help someone deciding."
          className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-sm" />
      </label>

      <div>
        <span className="text-xs font-bold text-stone-700">Highlights</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGS.map((tag) => (
            <button type="button" key={tag}
              onClick={() => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 6))}
              className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${tags.includes(tag) ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>
              {tagLabel(tag)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={wouldRecommend} onChange={(event) => setWouldRecommend(event.target.checked)} />
        I would recommend this trip to a friend
      </label>

      {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}

      <button type="submit" disabled={saving}
        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-950 disabled:opacity-60">
        {saving ? "Submitting…" : "Publish my review"}
      </button>
    </form>
  );

  if (loading) {
    return <Shell><div className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></Shell>;
  }

  if (submitted) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 font-display text-2xl font-bold text-stone-900">Thank you</h1>
          <p className="mt-2 text-sm text-stone-600">{submitted.message}</p>
          {booking && <p className="mt-4 text-xs text-stone-400">Your review is tied to booking {booking.bookingRef} and is marked as a verified trip.</p>}
        </div>
        <ShareTripInvite productTitle={booking?.productTitle || link?.productTitle || null} channel="REVIEW" heading="Enjoyed it? Invite a friend" className="mt-6 text-left" />
      </Shell>
    );
  }

  // Share link, no booking identified yet: a signed-in traveler reviews right
  // here; verifying a booking instead is optional and earns the verified badge.
  if (!booking) {
    const claimForm = (
      <form onSubmit={claim} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-bold text-stone-700">Booking reference</span>
          <input value={bookingRef} onChange={(event) => setBookingRef(event.target.value)} placeholder="IH-XXXXXX" required
            className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-sm uppercase" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-stone-700">Last 4 digits of your phone number</span>
          <input value={phoneLast4} onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric" placeholder="0123" required
            className="mt-1 w-full rounded-xl border border-stone-300 p-3 text-sm" />
        </label>
        <button type="submit" disabled={claiming}
          className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-white disabled:opacity-60">
          {claiming ? "Checking…" : "Find my trip"}
        </button>
      </form>
    );

    if (!link) return <Shell><p className="text-sm text-red-700">{error || "This review link could not be opened."}</p></Shell>;

    const productPicker = !link.productId && link.products?.length > 0 && (
      <label className="block">
        <span className="text-xs font-bold text-stone-700">Which trip are you reviewing?</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)} required
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm">
          <option value="">Choose a trip</option>
          {link.products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
        </select>
      </label>
    );

    return (
      <Shell>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Share your experience</span>
        <h1 className="mt-1 font-display text-2xl font-bold text-stone-900">
          How was your trip with {link.supplierName}?
        </h1>
        {link.productTitle && <p className="mt-1 text-sm text-stone-600">{link.productTitle}</p>}

        {showClaim ? (
          <>
            <p className="mt-4 text-sm text-stone-600">
              Booked through Idea Holiday? Both details are on your booking confirmation. Your review will carry a Verified Trip badge.
            </p>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            {claimForm}
            <button type="button" onClick={() => { setShowClaim(false); setError(""); }}
              className="mt-4 w-full text-center text-xs font-bold text-stone-500 underline">
              Back to writing a review
            </button>
          </>
        ) : (
          <>
            {user ? (
              reviewForm({ children: productPicker })
            ) : (
              <div className="mt-5 rounded-2xl bg-stone-50 p-5 text-center">
                <p className="text-sm text-stone-600">Sign in to rate and review this trip. It only takes a moment.</p>
                <Link to={`/login?from=${encodeURIComponent(`/r/${params.slug}`)}`}
                  className="mt-4 block w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-950">
                  Sign in to write a review
                </Link>
              </div>
            )}
            <button type="button" onClick={() => { setShowClaim(true); setError(""); }}
              className="mt-4 w-full text-center text-xs font-bold text-stone-500 underline">
              Booked with Idea Holiday? Verify your booking instead
            </button>
          </>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Verified review · {booking.bookingRef}</span>
      <h1 className="mt-1 font-display text-2xl font-bold text-stone-900">{booking.productTitle}</h1>
      <p className="mt-1 text-sm text-stone-600">{booking.supplierName} · {booking.activityDate}</p>

      {reviewForm({ requiresDriverRating: booking.requiresDriverRating, driverName: booking.driverName })}
    </Shell>
  );
}
