import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Gift,
  History,
  MessageCircle,
  QrCode,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { inviteLinkFor } from "../components/traveler/ShareTripInvite.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

// Mirrors REFERRAL_POLICY on the server; the signed-in profile overrides these.
const DEFAULT_POLICY = { friendDiscountPct: 10, referrerRewardPct: 10, earningWindowMonths: 24, clearingHoldDays: 7, creditExpiryMonths: 12 };

// Typical bookings, and the credit each typically earns: 10% of what Idea
// Holiday makes on it. Shown as estimates only; the real figure is per booking.
const TRIP_TYPES = [
  { id: "transfer", label: "Airport transfer", typicalPriceInr: 1200, typicalCreditInr: 18 },
  { id: "day_tour", label: "Day tour", typicalPriceInr: 2500, typicalCreditInr: 45 },
  { id: "package", label: "Holiday package", typicalPriceInr: 35000, typicalCreditInr: 420 },
];

const STAGE_LABELS = {
  UPCOMING_TRIP: { label: "Trip coming up", tone: "bg-stone-100 text-stone-700 border-stone-200", icon: Clock },
  CLEARING: { label: "Clearing", tone: "bg-amber-50 text-amber-800 border-amber-200", icon: Clock },
  IN_REVIEW: { label: "Being checked", tone: "bg-indigo-50 text-indigo-800 border-indigo-200", icon: ShieldCheck },
  CREDITED: { label: "In your wallet", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  REVERSED: { label: "Trip refunded", tone: "bg-rose-50 text-rose-700 border-rose-200", icon: History },
};

const formatInr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value) => {
  if (!value) return "";
  const text = String(value);
  const date = new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

function faqItems(policy) {
  return [
    {
      q: "How does Travel & Earn work?",
      a: `Share your invite link. When a friend signs up with it (or enters your code at checkout), their first trip gets a friend discount worth ${policy.friendDiscountPct}% of what Idea Holiday earns on that booking. It's shown in the price before they pay. You earn the same amount again as wallet credit, and you keep earning on every trip they take for ${policy.earningWindowMonths} months.`,
    },
    {
      q: "When does credit reach my wallet?",
      a: `${policy.clearingHoldDays} days after your friend's trip is completed. That gap covers cancellations and refunds: if a trip is refunded, the credit for it is removed.`,
    },
    {
      q: "Why is the amount different for different trips?",
      a: "Rewards are a share of what we earn on each booking rather than a fixed amount, so a holiday package earns much more than an airport transfer. That's what lets us pay on every trip, with no cap on how many friends you invite.",
    },
    {
      q: "How do I use my credit?",
      a: "At checkout, turn on wallet credit. It can cover up to 50% of a booking, up to ₹2,000 per booking. Credit can be spent on any tour, transfer or package, but it can't be withdrawn as cash.",
    },
    {
      q: "Does credit expire?",
      a: `Credit earned under the current program expires ${policy.creditExpiryMonths} months after it reaches your wallet, and we'll remind you before it does. Credit you already had before this change keeps its original terms.`,
    },
    {
      q: "What doesn't count?",
      a: "Referring yourself (a second account on the same phone, email or device), inviting someone who has booked with us before, and bookings that came through a creator's affiliate link or coupon. A traveler can only ever have one referrer.",
    },
    {
      q: "Is there a limit?",
      a: "No limit on friends or trips. If a large amount is earned in a short time, our team checks it before it reaches your wallet.",
    },
  ];
}

export default function TravelAndEarn() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [tripType, setTripType] = useState("day_tour");
  const [friendCount, setFriendCount] = useState(5);
  const [tripsPerYear, setTripsPerYear] = useState(2);

  const loadProfile = () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    api.getLoyaltyProfile()
      .then(setProfile)
      .catch((err) => setError(err?.message || "Your rewards couldn't be loaded. Try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const policy = { ...DEFAULT_POLICY, ...(profile?.policy || {}) };
  const referralCode = profile?.referralCode || null;
  const whatsappLink = inviteLinkFor(profile?.referralLink, "WHATSAPP");
  const copyLink = inviteLinkFor(profile?.referralLink, "COPY");

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const shareViaWhatsApp = () => {
    if (!whatsappLink) return;
    const text = `I plan my trips in India with Idea Holiday. Sign up with my link and your first trip gets a friend discount: ${whatsappLink}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const trip = TRIP_TYPES.find((item) => item.id === tripType) || TRIP_TYPES[1];
  const tripsInWindow = friendCount * tripsPerYear * (policy.earningWindowMonths / 12);
  const estimatedCreditInr = Math.round(tripsInWindow * trip.typicalCreditInr);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title="Travel & Earn: refer friends, earn travel credit | Idea Holiday"
        description="Invite friends to Idea Holiday. They get a discount on their first trip, and you earn wallet credit on every trip they take for 24 months."
      />

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-950 via-amber-950 to-stone-900 py-14 px-5 sm:px-8 text-white">
        <div className="relative mx-auto max-w-6xl grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-400/30 px-3.5 py-1 text-xs font-bold text-amber-300 uppercase tracking-widest">
              <Gift className="h-3.5 w-3.5" aria-hidden="true" /> Travel &amp; Earn
            </span>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] text-balance">
              Invite a friend once.<br />
              <span className="text-amber-300">Earn on every trip they take.</span>
            </h1>
            <p className="text-base sm:text-lg text-stone-300 max-w-xl leading-relaxed">
              Your friend gets a discount on their first trip. You get wallet credit every time they travel with Idea Holiday for the next {policy.earningWindowMonths} months, from airport cabs to week-long holidays.
            </p>

            {user && profile && (
              <div className="inline-flex flex-wrap items-center gap-4 rounded-2xl bg-stone-900/80 border border-amber-500/30 p-4">
                <Wallet className="h-6 w-6 text-amber-400" aria-hidden="true" />
                <div>
                  <span className="text-xs text-stone-400 block">Wallet balance</span>
                  <span className="text-2xl font-bold font-mono">{formatInr(profile.walletBalanceInr)}</span>
                </div>
                <div className="border-l border-stone-700 pl-4">
                  <span className="text-xs text-stone-400 block">Status</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 mt-0.5">
                    <Award className="h-3.5 w-3.5" aria-hidden="true" /> {profile.tier?.name || "Explorer"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Invite box */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-white p-6 sm:p-8 text-stone-900 shadow-2xl border border-stone-100">
              {!user ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">Get your invite link</h2>
                  <p className="text-sm text-stone-600">Sign in and we'll create a personal link and code for you to share.</p>
                  <Link
                    to="/login?from=/travel-and-earn"
                    className="flex items-center justify-center gap-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white py-3 text-sm font-bold transition"
                  >
                    Sign in to start inviting <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <p className="text-xs text-stone-500 text-center">
                    New here? <Link to="/signup" className="font-bold text-amber-800 hover:underline">Create an account</Link>
                  </p>
                </div>
              ) : loading && !profile ? (
                <p className="py-10 text-center text-sm text-stone-500">Loading your invite link…</p>
              ) : error ? (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
                  <p className="text-sm text-red-700">{error}</p>
                  <button onClick={loadProfile} className="mt-2 text-xs font-bold text-red-800 underline">Try again</button>
                </div>
              ) : referralCode ? (
                <div className="space-y-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Your invite code</span>
                  <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 p-4">
                    <span className="font-mono text-xl font-extrabold tracking-wider text-amber-950">{referralCode}</span>
                    <button
                      onClick={() => copyToClipboard(referralCode)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-3.5 py-2 transition"
                    >
                      {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor="invite-link" className="sr-only">Invite link</label>
                    <input
                      id="invite-link"
                      type="text"
                      readOnly
                      value={copyLink}
                      className="w-full min-w-0 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs font-mono text-stone-600 focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(copyLink)}
                      className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-700 hover:bg-stone-50 transition shrink-0"
                      aria-label="Copy invite link"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    onClick={shareViaWhatsApp}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1fb257] text-white py-3 text-sm font-bold shadow-md transition"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Share on WhatsApp
                  </button>

                  <button
                    onClick={() => setShowQr((value) => !value)}
                    aria-expanded={showQr}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 py-2.5 text-xs font-semibold transition"
                  >
                    <QrCode className="h-4 w-4" aria-hidden="true" /> {showQr ? "Hide QR code" : "Show QR code to scan or print"}
                  </button>
                  {showQr && (
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-center">
                      <img
                        src={`/api/referral/qr/${encodeURIComponent(referralCode)}.svg?ch=QR`}
                        alt={`QR code for invite link ${referralCode}`}
                        className="mx-auto h-40 w-40 bg-white p-2 rounded-lg border border-stone-200"
                      />
                      <p className="text-[11px] text-stone-500 mt-2">Scanning opens your invite link.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {profile?.referredBy?.firstTripDiscountAvailable && (
        <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-900">
              <strong>{profile.referredBy.firstName || "A friend"} invited you.</strong> Your first trip gets a friend discount, shown in the price at checkout.
            </p>
            <Link to="/search" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 hover:underline">
              Find a trip <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* ─── SIGNED-IN DASHBOARD ─────────────────────────────────────── */}
      {user && profile && (
        <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-xl border border-stone-200/90">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-100">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-900">Your rewards</h2>
              <Link to="/search" className="inline-flex items-center gap-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-sm font-bold px-4 py-2.5 transition">
                <Wallet className="h-4 w-4" aria-hidden="true" /> Spend credit on a trip
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-6">
              <Metric icon={Wallet} label="Wallet balance" value={formatInr(profile.walletBalanceInr)} highlight
                note={profile.expiringSoonInr > 0 ? `${formatInr(profile.expiringSoonInr)} expires ${formatDate(profile.nextExpiryAt)}` : "Up to 50% off a booking"} />
              <Metric icon={Clock} label="Clearing" value={formatInr(profile.clearingCredits)}
                note={`Spendable ${policy.clearingHoldDays} days after each trip`} />
              <Metric icon={TrendingUp} label="Earned so far" value={formatInr(profile.totalCreditsEarned)}
                note={profile.upcomingCredits > 0 ? `${formatInr(profile.upcomingCredits)} more from trips coming up` : "Credit that reached your wallet"} />
              <Metric icon={Users} label="Friends invited" value={profile.friendsInvitedCount || 0}
                note={`${profile.successfulReferralsCount || 0} have travelled`} />
            </div>

            {profile.clawbackPendingInr > 0 && (
              <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {formatInr(profile.clawbackPendingInr)} of credit from a refunded trip had already been spent. It will be taken from your next credit before that reaches your wallet.
              </p>
            )}

            <div className="rounded-2xl bg-stone-900 text-white p-5 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Award className="h-5 w-5 text-amber-400" aria-hidden="true" /> {profile.tier?.name || "Explorer"}
                </span>
                <span className="text-xs text-stone-300">
                  {profile.nextTier
                    ? `${profile.referralsToNextTier} more ${profile.referralsToNextTier === 1 ? "friend" : "friends"} travelling to reach ${profile.nextTier.name}`
                    : "Highest status reached"}
                </span>
              </div>
              <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={profile.progressPct || 0} aria-valuemin={0} aria-valuemax={100}>
                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.min(100, Math.max(4, profile.progressPct || 0))}%` }} />
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
                <h3 className="flex items-center gap-2 font-bold text-stone-900 text-sm mb-4">
                  <Users className="h-4 w-4" aria-hidden="true" /> Rewards from your friends' trips
                </h3>
                {!profile.rewards?.length ? (
                  <div className="text-center py-8 text-stone-500">
                    <Gift className="h-8 w-8 mx-auto mb-2 text-stone-400" aria-hidden="true" />
                    <p className="text-xs font-medium">
                      {profile.friendsInvitedCount ? "Your friends haven't booked a trip yet." : "No friends have joined yet."}
                    </p>
                    <p className="text-[11px] text-stone-400 mt-1">Rewards appear here as soon as a friend pays for a trip.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-200/80 max-h-80 overflow-y-auto pr-1">
                    {profile.rewards.map((reward) => {
                      const stage = STAGE_LABELS[reward.stage] || STAGE_LABELS.UPCOMING_TRIP;
                      const StageIcon = stage.icon;
                      return (
                        <li key={reward.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-stone-900 block">
                              {reward.friendFirstName}'s {reward.isFirstTrip ? "first trip" : "trip"}
                            </span>
                            <span className="text-[11px] text-stone-500">
                              {reward.stage === "CLEARING" && reward.spendableFrom
                                ? `Spendable from ${formatDate(reward.spendableFrom)}`
                                : reward.stage === "CREDITED"
                                  ? `Added ${formatDate(reward.creditedAt)}`
                                  : reward.tripDate ? `Trip on ${formatDate(reward.tripDate)}` : ""}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block font-mono font-bold text-stone-900">{formatInr(reward.amountInr)}</span>
                            <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${stage.tone}`}>
                              <StageIcon className="h-3 w-3" aria-hidden="true" /> {stage.label}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {profile.friends?.length > 0 && (
                  <p className="mt-4 border-t border-stone-200 pt-3 text-[11px] text-stone-500">
                    Earning from {profile.friends.filter((friend) => friend.status === "ACTIVE").map((friend) => friend.firstName).join(", ") || "no one right now"}.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
                <h3 className="flex items-center gap-2 font-bold text-stone-900 text-sm mb-4">
                  <History className="h-4 w-4" aria-hidden="true" /> Wallet history
                </h3>
                {!profile.transactions?.length ? (
                  <div className="text-center py-8 text-stone-500">
                    <Wallet className="h-8 w-8 mx-auto mb-2 text-stone-400" aria-hidden="true" />
                    <p className="text-xs font-medium">No wallet activity yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-200/80 max-h-80 overflow-y-auto pr-1">
                    {profile.transactions.map((tx) => (
                      <li key={tx.id} className="py-3 flex items-start justify-between text-xs gap-2">
                        <div>
                          <span className="font-medium text-stone-800 block leading-snug">{tx.description}</span>
                          <span className="text-[10px] text-stone-400 mt-0.5 block">
                            {formatDate(tx.createdAt)}{tx.expiresAt && tx.amountInr > 0 ? ` · expires ${formatDate(tx.expiresAt)}` : ""}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono font-bold ${tx.amountInr >= 0 ? "text-emerald-700" : "text-stone-800"}`}>
                            {tx.amountInr >= 0 ? `+${formatInr(tx.amountInr)}` : `−${formatInr(Math.abs(tx.amountInr))}`}
                          </span>
                          <span className="text-[10px] text-stone-400 block font-mono">Balance {formatInr(tx.balanceAfterInr)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <h2 className="font-display text-3xl font-bold text-stone-900 text-center">How it works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { title: "Your friend signs up", body: "They open your link or enter your code when they book. One referrer per traveler, and they must be new to Idea Holiday." },
            { title: "They save on their first trip", body: `A friend discount worth ${policy.friendDiscountPct}% of what we earn on the booking, shown in the price before they pay.` },
            { title: "You earn on every trip", body: `The same share again as wallet credit, on every trip they take for ${policy.earningWindowMonths} months. It's spendable ${policy.clearingHoldDays} days after each trip.` },
          ].map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className="font-mono text-xs font-bold text-amber-700">Step {index + 1}</span>
              <h3 className="mt-2 text-lg font-bold text-stone-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── ESTIMATOR ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <div className="rounded-3xl bg-white p-6 sm:p-10 shadow-xl border border-stone-200/80">
          <h2 className="font-display text-3xl font-bold text-stone-900 text-center">What could you earn?</h2>
          <p className="mt-2 text-sm text-stone-600 text-center max-w-xl mx-auto">
            An estimate from typical prices. Real credit is worked out on each booking, so bigger trips earn more.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <fieldset>
              <legend className="text-sm font-bold text-stone-700 mb-2">Trips your friends usually take</legend>
              <div className="space-y-2">
                {TRIP_TYPES.map((item) => (
                  <label key={item.id} className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm ${tripType === item.id ? "border-amber-500 bg-amber-50" : "border-stone-200"}`}>
                    <span className="flex items-center gap-2">
                      <input id={`trip-type-${item.id}`} type="radio" name="trip-type" value={item.id} checked={tripType === item.id} onChange={() => setTripType(item.id)} className="accent-amber-700" />
                      {item.label}
                    </span>
                    <span className="font-mono text-xs text-stone-500">~{formatInr(item.typicalPriceInr)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="friend-count" className="flex justify-between text-sm font-bold text-stone-700">
                <span>Friends who travel</span><span className="font-mono text-amber-900">{friendCount}</span>
              </label>
              <input id="friend-count" type="range" min="1" max="25" value={friendCount} onChange={(e) => setFriendCount(Number(e.target.value))} className="mt-3 w-full accent-amber-700" />
              <label htmlFor="trips-per-year" className="mt-6 flex justify-between text-sm font-bold text-stone-700">
                <span>Trips each, per year</span><span className="font-mono text-amber-900">{tripsPerYear}</span>
              </label>
              <input id="trips-per-year" type="range" min="1" max="6" value={tripsPerYear} onChange={(e) => setTripsPerYear(Number(e.target.value))} className="mt-3 w-full accent-amber-700" />
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
              <span className="text-xs font-bold uppercase tracking-wide text-stone-500 block">Credit over {policy.earningWindowMonths} months</span>
              <span className="mt-1 block font-mono text-4xl font-extrabold text-amber-900">{formatInr(estimatedCreditInr)}</span>
              <p className="mt-3 text-xs leading-relaxed text-stone-600">
                About {formatInr(trip.typicalCreditInr)} per {trip.label.toLowerCase()}, from {Math.round(tripsInWindow)} trips. Each friend also saves about {formatInr(trip.typicalCreditInr)} on their first one.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATUS ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8">
        <h2 className="font-display text-3xl font-bold text-stone-900 text-center">Status</h2>
        <p className="mt-2 text-sm text-stone-600 text-center max-w-xl mx-auto">
          Everyone earns at the same rate. Status shows how many of your friends have actually travelled.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { name: "Explorer", range: "0–2 friends travelled", body: "Everyone starts here, earning on every trip their friends take." },
            { name: "Voyager", range: "3–9 friends travelled", body: "You've brought a small group of travelers to Idea Holiday." },
            { name: "Globe Trotter", range: "10+ friends travelled", body: "One of the people who has grown Idea Holiday the most." },
          ].map((tier) => (
            <div key={tier.name} className={`rounded-2xl border bg-white p-6 ${profile?.tier?.name === tier.name ? "border-amber-500 ring-2 ring-amber-500/20" : "border-stone-200"}`}>
              <span className="text-xs font-bold text-amber-800">{tier.range}</span>
              <h3 className="mt-1 text-xl font-bold text-stone-900">{tier.name}</h3>
              <p className="mt-2 text-sm text-stone-600">{tier.body}</p>
              {profile?.tier?.name === tier.name && <span className="mt-3 inline-block text-xs font-bold text-amber-800">Your status</span>}
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 pb-16 sm:px-8">
        <h2 className="font-display text-3xl font-bold text-stone-900 text-center mb-8">Questions</h2>
        <div className="space-y-3">
          {faqItems(policy).map((item, index) => (
            <div key={item.q} className="rounded-2xl bg-white border border-stone-200 overflow-hidden">
              <button
                id={`faq-question-${index}`}
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                aria-expanded={openFaq === index}
                aria-controls={`faq-answer-${index}`}
                className="w-full flex items-center justify-between gap-3 p-5 text-left font-bold text-stone-900 text-sm sm:text-base hover:bg-stone-50 transition"
              >
                <span>{item.q}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${openFaq === index ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {openFaq === index && (
                <div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-question-${index}`} className="px-5 pb-5 text-sm text-stone-600 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <div className="rounded-3xl bg-amber-700 p-8 sm:p-12 text-center text-white shadow-xl">
          <h2 className="font-display text-3xl font-extrabold">Who's planning a trip?</h2>
          <p className="mt-3 text-amber-100 text-sm sm:text-base max-w-xl mx-auto">
            Send your link to the friend or family group that's always talking about getting away.
          </p>
          {user && referralCode ? (
            <button onClick={shareViaWhatsApp} className="mt-7 inline-flex items-center gap-2 rounded-full bg-stone-950 hover:bg-stone-800 px-8 py-3.5 text-sm font-extrabold transition">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Invite on WhatsApp
            </button>
          ) : (
            <Link to="/login?from=/travel-and-earn" className="mt-7 inline-flex items-center gap-2 rounded-full bg-stone-950 hover:bg-stone-800 px-8 py-3.5 text-sm font-extrabold transition">
              Sign in to get your link <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note, highlight = false }) {
  return (
    <div className={`rounded-2xl p-4 border ${highlight ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-stone-600">{label}</span>
        <Icon className="h-4 w-4 text-amber-700" aria-hidden="true" />
      </div>
      <div className="font-mono text-2xl sm:text-3xl font-extrabold text-stone-900">{value}</div>
      <span className="text-[11px] text-stone-500 mt-1 block">{note}</span>
    </div>
  );
}
