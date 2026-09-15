import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  TrendingUp,
  IndianRupee,
  Share2,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Wallet,
  Users,
  Award,
  HelpCircle,
  ChevronRight,
  Copy,
  Zap,
  Building2,
  Globe,
  Flame,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const PERKS = [
  {
    icon: IndianRupee,
    title: "10% Cash Commission",
    desc: "Earn a high 10% cash payout on every completed tour, circuit, and transfer booking made through your code or link.",
    color: "from-amber-500 to-amber-600",
  },
  {
    icon: Zap,
    title: "Custom Coupon Code",
    desc: "Create your branded coupon code (e.g. EXPLORE10). Your followers get 5% instant checkout savings, and you earn 10%.",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: ShieldCheck,
    title: "Instant Bank Payouts",
    desc: "Fast KYC verification via PAN & Bank Account with automated Penny-Drop verification. Withdraw directly to any Indian bank or UPI.",
    color: "from-blue-500 to-indigo-600",
  },
  {
    icon: TrendingUp,
    title: "Live Tracking & Analytics",
    desc: "Transparent dashboard displaying real-time link clicks, bookings, conversion rates, and accrued earnings.",
    color: "from-rose-500 to-pink-600",
  },
];

const FAQS = [
  {
    q: "How does the Idea Holiday Influencer & Affiliate Program work?",
    a: "When you join, you get a customized coupon code (e.g. TRAVEL10) and deep referral tracking links. When your followers use your code or link to book any travel experience on Idea Holiday, they receive an exclusive discount, and you earn 10% cash commission on the trip value.",
  },
  {
    q: "When do my earnings become available for payout?",
    a: "Commissions are recorded in your dashboard in Pending status immediately upon booking. Once your follower completes their journey, the earnings mature to Available for Withdrawal, preventing chargeback and cancellation issues.",
  },
  {
    q: "What is the minimum withdrawal threshold and payout method?",
    a: "The minimum payout threshold is ₹1,000. You can request a payout anytime to your verified Indian bank account (via NEFT/IMPS) or your UPI ID directly from your dashboard.",
  },
  {
    q: "Why do I need to complete KYC verification?",
    a: "Because Idea Holiday pays real cash directly to your bank account, Indian tax and financial compliance guidelines require PAN verification and bank account verification (via Penny-Drop sync) before disbursing affiliate earnings.",
  },
];

export default function AffiliateLandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bookingCount, setBookingCount] = useState(25);
  const [avgBookingPrice, setAvgBookingPrice] = useState(6000);
  const [openFaq, setOpenFaq] = useState(null);
  const [loadingCheck, setLoadingCheck] = useState(true);
  const [isAffiliate, setIsAffiliate] = useState(false);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState("INSTAGRAM");
  const [channelUrl, setChannelUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!user) {
      setLoadingCheck(false);
      return;
    }
    api.getAffiliateMe()
      .then((res) => {
        if (res?.registered && res?.affiliate) {
          setIsAffiliate(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCheck(false));
  }, [user]);

  const estimatedMonthly = Math.round(bookingCount * avgBookingPrice * 0.10);

  const handleApplyClick = () => {
    if (!user) {
      navigate("/login?redirect=/affiliate");
      return;
    }
    if (isAffiliate) {
      navigate("/affiliate/dashboard");
      return;
    }
    setShowModal(true);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!channelName.trim()) {
      setFormError("Please enter your channel or profile name");
      return;
    }

    setSubmitting(true);
    try {
      await api.registerAffiliate({
        channelName,
        channelType,
        channelUrl,
        customCode: customCode.trim().toUpperCase(),
        bio,
      });
      navigate("/affiliate/dashboard");
    } catch (err) {
      setFormError(err?.message || "Failed to register affiliate profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <SeoHead
        title="Creator & Influencer Affiliate Program | Idea Holiday"
        description="Partner with Idea Holiday. Share your customized coupon code, recommend unforgettable travel experiences across India, and earn a 10% cash commission on every booking."
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-stone-200 dark:border-stone-800">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Influencer & Affiliate Partner Network
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-display tracking-tight leading-tight">
              Turn Your Travel Passion Into{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700">
                10% Cash Earnings
              </span>
            </h1>
            <p className="text-lg md:text-xl text-stone-600 dark:text-stone-300 max-w-2xl mx-auto leading-relaxed">
              Recommend India's best sightseeing tours, airport cabs, and multi-day circuits.
              Share your custom coupon code, give your community discounts, and earn 10% on every completed trip.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleApplyClick}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-base shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
              >
                {isAffiliate ? "Go to Your Dashboard" : "Join Affiliate Program"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#calculator"
                className="w-full sm:w-auto px-6 py-4 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-900 font-semibold text-sm transition-colors text-center"
              >
                Estimate Your Earnings
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 pt-6 text-xs text-stone-500 dark:text-stone-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Free to Join
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Direct Bank Payouts
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Transparent Tracking
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Perks Grid */}
      <section className="py-16 md:py-24 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl font-bold font-display tracking-tight mb-3">
            Why Creators & Affiliates Choose Idea Holiday
          </h2>
          <p className="text-stone-600 dark:text-stone-400 text-sm md:text-base">
            Everything you need to monetize your travel content with high-converting local experiences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PERKS.map((perk, idx) => {
            const Icon = perk.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${perk.color} text-white flex items-center justify-center mb-5 shadow-sm`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">{perk.title}</h3>
                <p className="text-stone-600 dark:text-stone-400 text-sm leading-relaxed">
                  {perk.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Earnings Calculator */}
      <section id="calculator" className="py-16 bg-stone-100/70 dark:bg-stone-900/50 border-y border-stone-200 dark:border-stone-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-8 md:p-12 border border-stone-200 dark:border-stone-800 shadow-lg">
            <div className="text-center max-w-xl mx-auto mb-10">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                Calculator
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold font-display mt-3 mb-2">
                Estimate Your Monthly Commission
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                See how quickly 10% earnings add up with your audience.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold">Bookings Referred Per Month</label>
                    <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                      {bookingCount} bookings
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="150"
                    step="5"
                    value={bookingCount}
                    onChange={(e) => setBookingCount(Number(e.target.value))}
                    className="w-full h-2 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-stone-400 mt-1">
                    <span>5</span>
                    <span>75</span>
                    <span>150+</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold">Average Experience Price</label>
                    <span className="text-base font-bold text-stone-900 dark:text-stone-100">
                      ₹{avgBookingPrice.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="20000"
                    step="1000"
                    value={avgBookingPrice}
                    onChange={(e) => setAvgBookingPrice(Number(e.target.value))}
                    className="w-full h-2 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-stone-400 mt-1">
                    <span>₹2,000 (Cabs/Tours)</span>
                    <span>₹10,000</span>
                    <span>₹20,000 (Circuits)</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-stone-700 dark:text-stone-300">
                  💡 <strong>Did you know?</strong> Multi-day circuits and private heritage tours average over ₹12,000 per booking, generating ₹1,200+ in a single referral.
                </div>
              </div>

              <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-stone-950 shadow-xl flex flex-col justify-center items-center">
                <span className="text-xs font-bold uppercase tracking-wider bg-stone-950/10 px-3 py-1 rounded-full mb-3">
                  Your Estimated Earnings
                </span>
                <div className="text-5xl md:text-6xl font-black font-display tracking-tight my-2">
                  ₹{estimatedMonthly.toLocaleString("en-IN")}
                </div>
                <span className="text-xs font-semibold text-stone-950/70 mb-6">
                  per month (10% on ₹{(bookingCount * avgBookingPrice).toLocaleString("en-IN")} booking value)
                </span>
                <button
                  onClick={handleApplyClick}
                  className="w-full py-3.5 px-6 rounded-xl bg-stone-950 hover:bg-stone-900 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  Start Earning Today
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold font-display tracking-tight mb-3">
            How It Works in 4 Simple Steps
          </h2>
          <p className="text-stone-600 dark:text-stone-400 text-sm">
            Zero setup fee, no upfront commitment, seamless tracking.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              step: "01",
              title: "Apply & Choose Code",
              desc: "Sign up in 60 seconds and choose your personalized coupon code (e.g. TRAVEL10).",
            },
            {
              step: "02",
              title: "Share with Audience",
              desc: "Post links on your Instagram Bio, YouTube descriptions, blogs, or WhatsApp groups.",
            },
            {
              step: "03",
              title: "Followers Save 5%",
              desc: "Your audience enjoys instant savings at checkout, boosting conversion rates.",
            },
            {
              step: "04",
              title: "Get 10% Bank Payout",
              desc: "Once trips conclude, withdraw your earnings directly to your verified bank or UPI.",
            },
          ].map((item, idx) => (
            <div key={idx} className="relative">
              <div className="text-5xl font-black font-display text-amber-500/20 mb-3">
                {item.step}
              </div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 border-t border-stone-200 dark:border-stone-800 max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl font-bold font-display text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full px-6 py-4 text-left font-semibold text-sm flex items-center justify-between gap-4"
              >
                <span>{faq.q}</span>
                <ChevronRight className={`w-4 h-4 text-stone-400 transition-transform ${openFaq === idx ? "rotate-90" : ""}`} />
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-5 text-sm text-stone-600 dark:text-stone-400 leading-relaxed border-t border-stone-100 dark:border-stone-800 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 text-lg font-bold"
            >
              ✕
            </button>

            <div className="mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                Application
              </span>
              <h3 className="text-2xl font-bold font-display mt-2">Join as an Influencer Partner</h3>
              <p className="text-xs text-stone-500 mt-1">
                Configure your channel and custom coupon code to begin earning 10%.
              </p>
            </div>

            {formError && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Channel / Profile Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Travel With Rohit, Backpacking Diaries"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                    Primary Platform *
                  </label>
                  <select
                    value={channelType}
                    onChange={(e) => setChannelType(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="YOUTUBE">YouTube</option>
                    <option value="BLOG">Blog / Website</option>
                    <option value="TIKTOK">TikTok</option>
                    <option value="COMMUNITY">WhatsApp / Telegram</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                    Custom Coupon Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ROHIT10"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    maxLength={15}
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm font-mono tracking-wider focus:ring-2 focus:ring-amber-500 outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Profile / Channel Link
                </label>
                <input
                  type="url"
                  placeholder="https://instagram.com/yourhandle or https://youtube.com/@channel"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Bio / Travel Niche (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Tell us a little about your travel content or community..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Setting Up Profile..." : "Create My Affiliate Dashboard"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
