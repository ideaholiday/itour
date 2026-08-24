import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronDown,
  Copy,
  Gift,
  HelpCircle,
  IndianRupee,
  Lock,
  MessageCircle,
  QrCode,
  Send,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const FAQ_ITEMS = [
  {
    q: "How does the Travel & Earn referral program work?",
    a: "When you share your unique referral code or link with friends, they receive an instant ₹250 discount on their first experience booking. Once they complete their journey, your Idea Holiday wallet is automatically credited with up to ₹500.",
  },
  {
    q: "How do I use my earned wallet credits?",
    a: "Your credits are stored in your Idea Holiday Wallet. During checkout for any tour, sightseeing package, or airport cab, toggle 'Apply Wallet Credits' to apply your balance directly toward your booking (up to 50% of the total booking value).",
  },
  {
    q: "Do my Idea Holiday wallet credits expire?",
    a: "No! Earned loyalty credits never expire as long as your account remains active. You can save them up for a big vacation or redeem them for weekend getaways.",
  },
  {
    q: "How do I reach higher loyalty tiers?",
    a: "You start as an Explorer. Once 3 referred friends complete their journeys, you automatically unlock Voyager status (₹350/friend + 5% checkout discount). At 10 completed referrals, you reach Globe Trotter status (₹500/friend + 10% checkout discount + VIP concierge).",
  },
  {
    q: "Is there any limit to how many friends I can refer?",
    a: "There is no limit! You can invite as many colleagues, friends, and family members as you want and earn unlimited travel credits.",
  },
];

const RECENT_ACTIVITY = [
  { name: "Rohit S.", city: "Mumbai", action: "earned ₹350 credits", time: "3 mins ago", tier: "Voyager" },
  { name: "Pooja V.", city: "Bengaluru", action: "redeemed ₹750 on Kerala Houseboat", time: "12 mins ago", tier: "Explorer" },
  { name: "Ankit M.", city: "Delhi", action: "earned ₹500 credits", time: "25 mins ago", tier: "Globe Trotter" },
  { name: "Sneha R.", city: "Pune", action: "unlocked Voyager Tier 🌟", time: "42 mins ago", tier: "Voyager" },
  { name: "Vikram K.", city: "Hyderabad", action: "earned ₹500 credits", time: "1 hour ago", tier: "Globe Trotter" },
];

export default function TravelAndEarn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [friendCount, setFriendCount] = useState(5);
  const [showQr, setShowQr] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    if (user) {
      setLoading(true);
      api.getLoyaltyProfile()
        .then((data) => setProfile(data))
        .catch((err) => console.error("Failed to load loyalty profile:", err))
        .finally(() => setLoading(false));
    }
  }, [user]);

  const referralCode = profile?.referralCode || (user ? `REF-${(user.name || "TRVL").slice(0, 4).toUpperCase()}` : "REF-TRAVEL250");
  const referralLink = profile?.referralLink || `${window.location.origin}/signup?ref=${referralCode}`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(
      `✈️ Hey! Plan your next trip across India with Idea Holiday. Use my referral code *${referralCode}* to get an instant *₹250 discount* on your first tour or airport cab!\n\nClaim your reward here: ${referralLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const shareViaTelegram = () => {
    const text = encodeURIComponent(`Get ₹250 off your first experience on Idea Holiday using code ${referralCode}`);
    window.open(`https://t.telegram.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, "_blank");
  };

  const shareViaTwitter = () => {
    const text = encodeURIComponent(`Explore India with @ideaholiday! Get ₹250 off your first booking using my referral code ${referralCode}:`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(referralLink)}`, "_blank");
  };

  // Calculator logic
  const calcTier = friendCount >= 10 ? "Globe Trotter (₹500/friend)" : friendCount >= 3 ? "Voyager (₹350/friend)" : "Explorer (₹250/friend)";
  const calcRate = friendCount >= 10 ? 500 : friendCount >= 3 ? 350 : 250;
  const calcTotalEarnings = friendCount * calcRate;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <SeoHead
        title="Travel & Earn — Loyalty Rewards & Free Travel Credits | Idea Holiday"
        description="Invite friends to Idea Holiday and earn up to ₹500 in travel credits for every completed journey. Redeem credits for free tours and airport transfers."
      />

      {/* ─── HERO HEADER SECTION ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-950 via-amber-950 to-stone-900 py-16 px-5 sm:px-8 text-white">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-amber-600/10 blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-400/30 px-3.5 py-1 text-xs font-bold text-amber-300 uppercase tracking-widest mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Idea Holiday Travel & Earn</span>
          </div>

          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-5">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Travel More. Spend Less. <br />
                <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent">
                  Earn Free Trips.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-stone-300 max-w-xl leading-relaxed">
                Gift your friends <strong className="text-amber-300 font-semibold">₹250 off</strong> their first tour or private cab. Earn up to <strong className="text-amber-300 font-semibold">₹500</strong> directly in your Idea Holiday Wallet for every completed journey.
              </p>

              {user && profile && (
                <div className="inline-flex items-center gap-4 rounded-2xl bg-stone-900/80 border border-amber-500/30 p-4 shadow-xl">
                  <div className="h-12 w-12 rounded-xl bg-amber-500/20 border border-amber-500/40 grid place-items-center text-amber-400">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs text-stone-400 font-medium block">Your Wallet Balance</span>
                    <span className="text-2xl font-bold font-mono text-white">₹{profile.walletBalanceInr.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-l border-stone-800 pl-4 ml-2">
                    <span className="text-xs text-stone-400 font-medium block">Loyalty Tier</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 mt-0.5">
                      <Award className="h-3.5 w-3.5" />
                      {profile.tier?.name || "Explorer"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Sharing & Code Box */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl bg-white p-6 sm:p-8 text-stone-900 shadow-2xl border border-stone-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Your Personal Invite Code</span>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">₹250 Gift Active</span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 p-4 mb-4">
                  <span className="font-mono text-xl font-extrabold tracking-wider text-amber-950">
                    {referralCode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(referralCode)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold px-3.5 py-2 transition shadow-sm cursor-pointer"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={referralLink}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs font-mono text-stone-600 focus:outline-none select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(referralLink)}
                      className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-700 hover:bg-stone-50 hover:text-stone-950 transition cursor-pointer shrink-0"
                      title="Copy invite link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>

                  <button
                    onClick={shareViaWhatsApp}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 text-sm font-bold shadow-md transition cursor-pointer"
                  >
                    <MessageCircle className="h-4 w-4 fill-white" />
                    <span>Share on WhatsApp</span>
                  </button>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={shareViaTelegram}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 py-2.5 px-3 text-xs font-semibold transition cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5 text-sky-500" />
                      <span>Telegram</span>
                    </button>
                    <button
                      onClick={shareViaTwitter}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 py-2.5 px-3 text-xs font-semibold transition cursor-pointer"
                    >
                      <Share2 className="h-3.5 w-3.5 text-blue-400" />
                      <span>Twitter / X</span>
                    </button>
                    <button
                      onClick={() => setShowQr(!showQr)}
                      className="rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 p-2.5 transition cursor-pointer"
                      title="Show QR Code"
                    >
                      <QrCode className="h-4 w-4 text-stone-600" />
                    </button>
                  </div>

                  {showQr && (
                    <div className="mt-3 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-center animate-in fade-in">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(referralLink)}`}
                        alt="Referral QR Code"
                        className="mx-auto h-32 w-32 rounded-lg shadow-sm border border-stone-200"
                      />
                      <p className="text-[11px] text-stone-500 mt-2 font-medium">Scan to open invite link on mobile</p>
                    </div>
                  )}
                </div>

                {!user && (
                  <p className="text-xs text-stone-500 text-center mt-4 pt-3 border-t border-stone-100">
                    <Link to="/login?redirect=/travel-and-earn" className="text-amber-800 font-bold hover:underline">Sign in</Link> to view your live wallet ledger and rewards.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTERACTIVE EARNINGS CALCULATOR ────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <div className="rounded-3xl bg-white p-8 sm:p-12 shadow-xl border border-stone-200/80">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
              Rewards Calculator
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-stone-900 mt-3">
              How Much Can You Earn?
            </h2>
            <p className="text-sm text-stone-600 mt-2">
              Slide to see your potential travel wallet credits and unlocked loyalty status.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-stone-700">Friends you invite to travel:</span>
                <span className="text-2xl font-extrabold font-mono text-amber-900 bg-amber-100 px-4 py-1 rounded-xl">
                  {friendCount} {friendCount === 1 ? "Friend" : "Friends"}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                value={friendCount}
                onChange={(e) => setFriendCount(Number(e.target.value))}
                className="w-full h-3 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
              />
              <div className="flex justify-between text-xs font-medium text-stone-500">
                <span>1 friend</span>
                <span>10 friends (Globe Trotter)</span>
                <span>25 friends</span>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-3 bg-gradient-to-br from-amber-50 via-orange-50 to-stone-50 rounded-2xl p-6 border border-amber-200/60">
              <div className="text-center sm:text-left">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide block">Your Wallet Credits</span>
                <span className="text-3xl sm:text-4xl font-extrabold font-mono text-amber-900 mt-1 block">
                  ₹{calcTotalEarnings.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="text-center sm:text-left border-y sm:border-y-0 sm:border-x border-amber-200/60 py-4 sm:py-0 sm:px-6">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide block">Unlocked Loyalty Tier</span>
                <span className="text-base font-bold text-stone-900 mt-1.5 block">
                  {calcTier}
                </span>
              </div>
              <div className="text-center sm:text-left">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wide block">What This Gets You</span>
                <p className="text-xs font-medium text-stone-700 mt-1 leading-snug">
                  {friendCount >= 10
                    ? "✨ 2x Full-day sightseeing packages + Airport transfers completely free!"
                    : friendCount >= 5
                    ? "✨ Full Day Taj Mahal Sunrise tour or Goa Cruise for free!"
                    : "✨ Substantial discount on your next holiday booking!"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3-TIER GAMIFIED LOYALTY ROADMAP ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-stone-900">
            Tier Levels & Milestone Perks
          </h2>
          <p className="text-sm text-stone-600 mt-2">
            The more friends you inspire to travel, the higher your reward multipliers become.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Explorer */}
          <div className="rounded-3xl bg-white p-8 border border-stone-200 shadow-sm relative flex flex-col justify-between">
            <div>
              <span className="inline-block rounded-full bg-amber-100 text-amber-800 text-xs font-extrabold px-3 py-1 mb-4 border border-amber-200">
                0 – 2 Referrals
              </span>
              <h3 className="font-display text-2xl font-bold text-stone-900">Explorer</h3>
              <p className="text-xs text-stone-500 mt-1 mb-6">Kickstart your travel journey.</p>
              <div className="space-y-3 text-sm text-stone-700">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>₹250</strong> credit per friend booking</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>₹250</strong> welcome gift for friends</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Standard booking support</span>
                </div>
              </div>
            </div>
          </div>

          {/* Voyager */}
          <div className="rounded-3xl bg-gradient-to-b from-stone-900 to-stone-950 text-white p-8 border-2 border-indigo-400/40 shadow-xl relative flex flex-col justify-between transform md:-translate-y-2">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-0.5 shadow-md">
              Most Popular
            </span>
            <div>
              <span className="inline-block rounded-full bg-indigo-900/80 text-indigo-200 text-xs font-extrabold px-3 py-1 mb-4 border border-indigo-700">
                3 – 9 Referrals
              </span>
              <h3 className="font-display text-2xl font-bold text-white">Voyager</h3>
              <p className="text-xs text-stone-400 mt-1 mb-6">40% boosted reward multiplier.</p>
              <div className="space-y-3 text-sm text-stone-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span><strong>₹350</strong> credit per friend booking</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span><strong>5% Extra</strong> checkout bonus voucher</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Priority booking confirmation</span>
                </div>
              </div>
            </div>
          </div>

          {/* Globe Trotter */}
          <div className="rounded-3xl bg-white p-8 border-2 border-amber-300 shadow-sm relative flex flex-col justify-between">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-600 text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-0.5 shadow-md">
              VIP Status
            </span>
            <div>
              <span className="inline-block rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold px-3 py-1 mb-4 border border-amber-300">
                10+ Referrals
              </span>
              <h3 className="font-display text-2xl font-bold text-stone-900">Globe Trotter</h3>
              <p className="text-xs text-stone-500 mt-1 mb-6">Double rewards & elite perks.</p>
              <div className="space-y-3 text-sm text-stone-700">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span><strong>₹500</strong> credit per friend booking</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span><strong>10% Extra</strong> checkout booster</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>VIP Concierge & Direct Trip Desk</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── LIVE RECENT REWARDS ACTIVITY FEED ─────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <div className="rounded-3xl bg-stone-100/80 border border-stone-200/80 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wider">Live Traveler Rewards Feed</h3>
            </div>
            <span className="text-xs text-stone-500">Updated real-time</span>
          </div>

          <div className="divide-y divide-stone-200">
            {RECENT_ACTIVITY.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-200 font-bold text-amber-900 grid place-items-center text-xs">
                    {item.name[0]}
                  </div>
                  <div>
                    <span className="font-semibold text-stone-900">{item.name}</span>
                    <span className="text-stone-500 ml-1.5">({item.city})</span>
                    <span className="text-stone-700 ml-2 font-medium">{item.action}</span>
                  </div>
                </div>
                <span className="text-stone-400 font-mono text-xs">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ SECTION ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-stone-900">Frequently Asked Questions</h2>
          <p className="text-sm text-stone-600 mt-2">Everything you need to know about Travel & Earn loyalty rewards.</p>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl bg-white border border-stone-200 overflow-hidden transition"
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left font-bold text-stone-900 text-sm sm:text-base hover:bg-stone-50 transition cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown className={`h-4 w-4 text-stone-500 transition-transform ${openFaq === index ? "rotate-180" : ""}`} />
              </button>
              {openFaq === index && (
                <div className="p-5 pt-0 text-sm text-stone-600 leading-relaxed border-t border-stone-100 bg-stone-50/50">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── BOTTOM CTA BANNER ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-amber-600 to-amber-700 p-8 sm:p-12 text-center text-white shadow-xl">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold">Ready to Earn Your Next Vacation?</h2>
          <p className="mt-3 text-amber-100 text-sm sm:text-base max-w-xl mx-auto">
            Start sharing your invite code with friends, family, and social groups today.
          </p>
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              shareViaWhatsApp();
            }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-950 hover:bg-stone-800 text-white px-8 py-3.5 text-sm font-extrabold shadow-lg transition cursor-pointer"
          >
            <span>Invite Friends Now</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
