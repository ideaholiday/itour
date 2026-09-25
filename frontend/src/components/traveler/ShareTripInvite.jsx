import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Gift, MessageCircle } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

/** Adds the sharing channel to an invite link so the program can tell which prompts work. */
export function inviteLinkFor(referralLink, channel) {
  if (!referralLink) return "";
  try {
    const url = new URL(referralLink);
    url.searchParams.set("ch", channel);
    return url.toString();
  } catch {
    return referralLink;
  }
}

/**
 * The invite prompt shown at moments a traveler is already pleased with a trip:
 * right after booking and after leaving a review. The message names what they
 * booked, because "I just booked X" is a recommendation and a bare code is not.
 */
export default function ShareTripInvite({ productTitle = null, channel = "WHATSAPP", heading = "Your friends get a discount on their first trip", className = "" }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.getLoyaltyProfile().then(setProfile).catch(() => setProfile(null));
  }, [user]);

  if (!user || !profile?.referralCode) return null;

  const link = inviteLinkFor(profile.referralLink, channel);
  const friendPct = profile.policy?.friendDiscountPct ?? 10;
  const message = productTitle
    ? `I just booked "${productTitle}" on Idea Holiday. Sign up with my link and your first trip gets a friend discount: ${link}`
    : `I book my trips on Idea Holiday. Sign up with my link and your first trip gets a friend discount: ${link}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <section className={`rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 print:hidden ${className}`} aria-labelledby="share-trip-invite-heading">
      <div className="flex items-start gap-3">
        <Gift className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="share-trip-invite-heading" className="text-sm font-bold text-stone-900">{heading}</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            Friends who sign up with your link get a discount on their first trip. You earn wallet credit every time they travel for {profile.policy?.earningWindowMonths ?? 24} months, spendable {profile.policy?.clearingHoldDays ?? 7} days after each trip.
            {" "}<Link to="/travel-and-earn" className="font-semibold text-amber-800 underline underline-offset-2">How it works</Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#1fb257] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Share on WhatsApp
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Link copied" : "Copy invite link"}
            </button>
          </div>
          <p className="sr-only">Friend discount is {friendPct}% of our booking fee on their first trip.</p>
        </div>
      </div>
    </section>
  );
}
