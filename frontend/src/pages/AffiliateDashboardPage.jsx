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
  QrCode,
  ExternalLink,
  Clock,
  AlertCircle,
  Building,
  CreditCard,
  Check,
  RefreshCw,
  Send,
  Sliders,
  DollarSign,
  Download,
} from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function AffiliateDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("toolkit");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [customDestination, setCustomDestination] = useState("");
  const [generatedDeepLink, setGeneratedDeepLink] = useState("");
  // A creator's own label for a post ("reels-goa"), carried on the link as ?sub=
  // so the dashboard can show which post actually sold.
  const [campaignLabel, setCampaignLabel] = useState("");
  const [liveCities, setLiveCities] = useState([]);

  // KYC Form State
  const [panNumber, setPanNumber] = useState("");
  const [panHolderName, setPanHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [bankAccountType, setBankAccountType] = useState("SAVINGS");
  const [upiId, setUpiId] = useState("");
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycSuccessMsg, setKycSuccessMsg] = useState("");
  const [kycErrorMsg, setKycErrorMsg] = useState("");

  // Payout Request State
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("BANK_TRANSFER");
  const [payoutAccountId, setPayoutAccountId] = useState("");
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState("");
  const [payoutErrorMsg, setPayoutErrorMsg] = useState("");
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  // Payout Account State
  const [newAccountMethod, setNewAccountMethod] = useState("BANK_TRANSFER");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [newAccountIfsc, setNewAccountIfsc] = useState("");
  const [newAccountHolder, setNewAccountHolder] = useState("");
  const [newAccountType, setNewAccountType] = useState("SAVINGS");
  const [newAccountUpi, setNewAccountUpi] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountMsg, setAccountMsg] = useState("");
  const [accountErrorMsg, setAccountErrorMsg] = useState("");

  const payoutAccounts = data?.payoutAccounts || [];
  const usableAccounts = payoutAccounts.filter((account) => account.isUsable);
  const payoutPolicy = data?.payoutPolicy || {};

  // What a withdrawal of this size actually lands in the bank, after TDS. Shown
  // while the creator types, so the figure is never a surprise afterwards.
  const payoutPreview = (() => {
    const gross = Number(payoutAmount) || 0;
    const rate = Number(payoutPolicy.tdsRate) || 0;
    const tds = Math.round(gross * rate * 100) / 100;
    return { gross, rate, tds, net: Math.round((gross - tds) * 100) / 100 };
  })();

  const handleAddPayoutAccount = async (e) => {
    e.preventDefault();
    setAccountSubmitting(true);
    setAccountMsg("");
    setAccountErrorMsg("");

    try {
      const res = await api.addAffiliatePayoutAccount(
        newAccountMethod === "UPI"
          ? { method: "UPI", upiId: newAccountUpi.trim() }
          : {
              method: "BANK_TRANSFER",
              accountNumber: newAccountNumber.trim(),
              ifsc: newAccountIfsc.trim(),
              accountHolder: newAccountHolder.trim(),
              accountType: newAccountType,
            }
      );
      setAccountMsg(res?.message || "Payout account added.");
      setNewAccountNumber("");
      setNewAccountIfsc("");
      setNewAccountUpi("");
      fetchDashboard();
    } catch (err) {
      setAccountErrorMsg(err?.message || "Could not add this payout account");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleSetPrimaryAccount = async (accountId) => {
    setAccountErrorMsg("");
    try {
      await api.setPrimaryAffiliatePayoutAccount(accountId);
      setAccountMsg("Future payouts will go to this account.");
      fetchDashboard();
    } catch (err) {
      setAccountErrorMsg(err?.message || "Could not change the primary account");
    }
  };

  const handleRemoveAccount = async (accountId) => {
    setAccountErrorMsg("");
    try {
      await api.removeAffiliatePayoutAccount(accountId);
      setAccountMsg("Payout account removed.");
      fetchDashboard();
    } catch (err) {
      setAccountErrorMsg(err?.message || "Could not remove this account");
    }
  };

  const fetchDashboard = () => {
    setLoading(true);
    api.getAffiliateDashboard()
      .then((res) => {
        if (res?.success && res?.dashboard) {
          setData(res.dashboard);
          // Pre-populate KYC fields if already entered
          if (res.dashboard.kycDetails) {
            setPanHolderName(res.dashboard.kycDetails.panHolderName || "");
            setBankIfsc(res.dashboard.kycDetails.bankIfsc || "");
            setBankAccountHolder(res.dashboard.kycDetails.bankAccountHolder || "");
            setUpiId(res.dashboard.kycDetails.upiId || "");
          }
        }
      })
      .catch((err) => {
        if (err?.status === 404 || err?.message?.includes("register first")) {
          navigate("/affiliate");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) {
      navigate(`/login?from=${encodeURIComponent("/affiliate/dashboard")}`);
      return;
    }
    fetchDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    api.getAffiliateProgram()
      .then((res) => {
        const cities = res?.program?.liveCities || [];
        setLiveCities(cities);
        setCustomDestination((current) => current || cities[0] || "transfers");
      })
      .catch(() => setCustomDestination((current) => current || "transfers"));
  }, []);

  useEffect(() => {
    if (!data?.affiliateCode || !customDestination) return;
    const base = window.location.origin;
    const params = new URLSearchParams({ ref: data.affiliateCode });
    const label = campaignLabel.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    if (label) params.set("sub", label);
    if (customDestination === "circuit-planner") {
      setGeneratedDeepLink(`${base}/circuit-planner?${params}`);
    } else if (customDestination === "transfers") {
      setGeneratedDeepLink(`${base}/transfers?${params}`);
    } else {
      setGeneratedDeepLink(`${base}/search?destination=${encodeURIComponent(customDestination)}&${params}`);
    }
  }, [customDestination, campaignLabel, data]);

  const copyText = async (text, type = "code") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
      return;
    }
    if (type === "code") {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    setKycSubmitting(true);
    setKycSuccessMsg("");
    setKycErrorMsg("");

    try {
      const res = await api.updateAffiliateKyc({
        panNumber,
        panHolderName,
        bankAccountNumber,
        bankIfsc,
        bankAccountHolder,
        bankAccountType,
        upiId,
      });
      setKycSuccessMsg(res?.message || "KYC and Bank details updated successfully!");
      fetchDashboard();
    } catch (err) {
      setKycErrorMsg(err?.message || "Failed to submit KYC details");
    } finally {
      setKycSubmitting(false);
    }
  };

  const handlePayoutSubmit = async (e) => {
    e.preventDefault();
    setPayoutSubmitting(true);
    setPayoutSuccessMsg("");
    setPayoutErrorMsg("");

    try {
      const res = await api.requestAffiliatePayout({
        amountInr: Number(payoutAmount),
        paymentMethod: payoutMethod,
        payoutAccountId: payoutAccountId || undefined,
      });
      setPayoutSuccessMsg(res?.message || "Payout requested successfully!");
      setShowPayoutModal(false);
      setPayoutAmount("");
      fetchDashboard();
    } catch (err) {
      setPayoutErrorMsg(err?.message || "Payout request failed");
    } finally {
      setPayoutSubmitting(false);
    }
  };

  // "Use for travel": earnings move into the wallet (1% TDS, no minimum) and never expire there.
  const handleWalletTransfer = async () => {
    const amount = Number(payoutAmount);
    if (!amount) {
      setPayoutErrorMsg("Enter the amount to move into your wallet");
      return;
    }
    setPayoutSubmitting(true);
    setPayoutSuccessMsg("");
    setPayoutErrorMsg("");
    try {
      const res = await api.moveAffiliateEarningsToWallet({ amountInr: amount });
      setPayoutSuccessMsg(res?.message || "Moved to your wallet.");
      setShowPayoutModal(false);
      setPayoutAmount("");
      fetchDashboard();
    } catch (err) {
      setPayoutErrorMsg(err?.message || "Could not move your earnings");
    } finally {
      setPayoutSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#FAF9F6] dark:bg-stone-950">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Loading Influencer Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const defaultShareUrl = data.shareLinks?.defaultLink || `${window.location.origin}/?ref=${data.affiliateCode}`;
  // This creator's real rates (their own, or their tier's), never a fixed number.
  const pctText = (value) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
  const commissionText = pctText(Number(data.commissionRate || 0) * 100);
  const discountText = pctText(data.travelerDiscountPct);
  const windowDays = data.payoutPolicy?.attributionWindowDays || 30;

  return (
    <div className="min-h-screen bg-[#FAF9F6] dark:bg-stone-950 text-stone-900 dark:text-stone-100 pb-20">
      <SeoHead title={`Influencer Dashboard (${data.affiliateCode}) | Idea Holiday`} />

      {/* Top Header Bar */}
      <div className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  Creator Partner
                </span>
                {data.kycStatus === "VERIFIED" ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> KYC Verified
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> KYC Action Needed
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight">
                {data.channelName}
              </h1>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Earning {commissionText} on every booking referred with coupon{" "}
                <strong className="text-amber-600 dark:text-amber-400 font-mono">{data.affiliateCode}</strong>
                {data.tier?.label && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-900/5 dark:bg-stone-100/10 border border-stone-300 dark:border-stone-700 align-middle">
                    {data.tier.label} tier
                  </span>
                )}
              </p>
              {/* What the next tier is worth, and exactly how far away it is. */}
              {data.tier?.next && (
                <p className="text-[11px] text-stone-400 mt-1">
                  {data.tier.next.bookingsToGo > 0
                    ? `${data.tier.next.bookingsToGo} more completed bookings`
                    : "Almost there"}
                  {data.tier.next.gmvToGoInr > 0
                    ? ` and ₹${Number(data.tier.next.gmvToGoInr).toLocaleString("en-IN")} more in bookings`
                    : ""}
                  {" "}unlocks {data.tier.next.label} at {pctText(Number(data.tier.next.commissionRate) * 100)}.
                  {data.tier.ratesOverridden ? " Your own rates stay until Idea Holiday changes them." : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => copyText(data.affiliateCode, "code")}
                className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold font-mono tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedCode ? "Copied!" : `Code: ${data.affiliateCode}`}
              </button>
              <button
                onClick={() => {
                  if (data.kycStatus !== "VERIFIED") {
                    setActiveTab("kyc");
                  } else {
                    setShowPayoutModal(true);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                Withdraw Earnings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Lifetime Earnings
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-display text-emerald-600 dark:text-emerald-400">
              ₹{Number(data.metrics.lifetimeEarningsInr || 0).toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">Commission on completed trips</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Available to Withdraw
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-display text-amber-600 dark:text-amber-400">
              ₹{Number(data.metrics.availableBalanceInr || 0).toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">Ready for bank transfer</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Pending Trip Completion
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-display text-stone-700 dark:text-stone-300">
              ₹{Number(data.metrics.pendingEarningsInr || 0).toLocaleString("en-IN")}
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">Matures once traveler completes trip</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 block mb-1">
              Bookings & Traffic
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-display text-blue-600 dark:text-blue-400">
              {data.metrics.totalBookingsCount}
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              {data.metrics.totalClicksCount} clicks ({data.metrics.conversionRate} conv)
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 dark:border-stone-800 mb-8 overflow-x-auto gap-2">
          {[
            { id: "toolkit", label: "Share & Promo Toolkit", icon: Share2 },
            { id: "bookings", label: `Referred Bookings (${data.referrals.length})`, icon: Users },
            { id: "kyc", label: "KYC & Bank Settings", icon: ShieldCheck },
            { id: "payouts", label: `Payouts (${data.payouts.length})`, icon: Wallet },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                    : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: SHARE TOOLKIT */}
        {activeTab === "toolkit" && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Coupon Card */}
              <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
                    Your Branded Coupon
                  </span>
                  <span className="text-xs text-stone-500">Traveler: {discountText} off • You: {commissionText}</span>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center shadow-sm">
                  <div className="text-3xl sm:text-4xl font-black font-mono tracking-wider text-stone-900 dark:text-stone-100 my-2">
                    {data.affiliateCode}
                  </div>
                  <p className="text-xs text-stone-500 mb-5">
                    Share this code anywhere. When a follower enters it at checkout, the booking is credited to you. It can't be used on your own bookings.
                  </p>
                  <button
                    onClick={() => copyText(data.affiliateCode, "code")}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedCode ? "Coupon Code Copied!" : "Copy Coupon Code"}
                  </button>
                </div>
              </div>

              {/* Referral Link Card */}
              <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Auto-Attributing Link
                  </span>
                  <span className="text-xs text-stone-400">{windowDays}-day attribution</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-stone-600 dark:text-stone-300 block mb-1">
                      Main Storefront Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={defaultShareUrl}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono select-all outline-none"
                      />
                      <button
                        onClick={() => copyText(defaultShareUrl, "link")}
                        className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold whitespace-nowrap cursor-pointer transition-colors"
                      >
                        {copiedLink ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Destination Deep-Link Builder */}
                  <div>
                    <label className="text-xs font-semibold text-stone-600 dark:text-stone-300 block mb-1">
                      Generate Deep Link by Destination
                    </label>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        ...liveCities.slice(0, 7).map((city) => ({ id: city, label: city })),
                        { id: "transfers", label: "Airport Cabs" },
                        { id: "circuit-planner", label: "Circuit Planner" },
                      ].map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setCustomDestination(d.id)}
                          className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            customDestination === d.id
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400 font-bold"
                              : "border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 block mb-1" htmlFor="campaign-label">
                      Campaign label (optional)
                    </label>
                    <input
                      id="campaign-label"
                      value={campaignLabel}
                      onChange={(e) => setCampaignLabel(e.target.value)}
                      maxLength={64}
                      placeholder="e.g. reels-goa-sept"
                      className="w-full mb-2 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="mb-2 text-[11px] text-stone-400">Use a different label per post to see which one brings bookings.</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedDeepLink}
                        className="w-full px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono select-all outline-none"
                      />
                      <button
                        onClick={() => copyText(generatedDeepLink, "link")}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold whitespace-nowrap cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ready-Made Caption Templates */}
            <div className="p-6 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Pre-Written Templates for Your Socials
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-xs flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-stone-700 dark:text-stone-300 block mb-1">📸 Instagram Story / Bio</span>
                    <p className="text-stone-500 leading-relaxed">
                      "Planning your next trip? Use my code <strong>{data.affiliateCode}</strong> on @IdeaHoliday for {discountText} off tours, airport cabs & activities in India and across Asia! Link in bio: {defaultShareUrl}"
                    </p>
                  </div>
                  <button
                    onClick={() => copyText(`Planning your next trip? Use my code ${data.affiliateCode} on @IdeaHoliday for ${discountText} off tours, airport cabs & activities in India and across Asia! Link in bio: ${defaultShareUrl}`, "link")}
                    className="mt-3 py-1.5 px-3 rounded-lg bg-stone-200 dark:bg-stone-700 text-[11px] font-bold self-start cursor-pointer hover:bg-stone-300"
                  >
                    Copy Template
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-xs flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-stone-700 dark:text-stone-300 block mb-1">🎥 YouTube Video Description</span>
                    <p className="text-stone-500 leading-relaxed">
                      "Book verified sightseeing experiences, private transfers, and curated itineraries at Idea Holiday. Get {discountText} off using code <strong>{data.affiliateCode}</strong>: {defaultShareUrl}"
                    </p>
                  </div>
                  <button
                    onClick={() => copyText(`Book verified sightseeing experiences and private transfers at Idea Holiday. Get ${discountText} off using code ${data.affiliateCode}: ${defaultShareUrl}`, "link")}
                    className="mt-3 py-1.5 px-3 rounded-lg bg-stone-200 dark:bg-stone-700 text-[11px] font-bold self-start cursor-pointer hover:bg-stone-300"
                  >
                    Copy Template
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-xs flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-stone-700 dark:text-stone-300 block mb-1">💬 WhatsApp Group Message</span>
                    <p className="text-stone-500 leading-relaxed">
                      "Hey everyone! For anyone heading on vacation soon, book cabs, guided tours, and activities on Idea Holiday with my code <strong>{data.affiliateCode}</strong>: {defaultShareUrl}"
                    </p>
                  </div>
                  <button
                    onClick={() => copyText(`Hey everyone! For anyone heading on vacation soon, book activities on Idea Holiday with my code ${data.affiliateCode}: ${defaultShareUrl}`, "link")}
                    className="mt-3 py-1.5 px-3 rounded-lg bg-stone-200 dark:bg-stone-700 text-[11px] font-bold self-start cursor-pointer hover:bg-stone-300"
                  >
                    Copy Template
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REFERRED BOOKINGS LOG */}
        {activeTab === "bookings" && (
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Referred Bookings & Commission</h3>
                <p className="text-xs text-stone-500">
                  Completed bookings made with your code or link earn {commissionText} commission.
                </p>
              </div>
            </div>

            {data.referrals.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-stone-300 dark:text-stone-700 mx-auto mb-3" />
                <h4 className="font-bold text-base mb-1">No bookings recorded yet</h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto mb-4">
                  Share your coupon code <strong className="text-amber-500">{data.affiliateCode}</strong> on your social profiles to start generating bookings!
                </p>
                <button
                  onClick={() => setActiveTab("toolkit")}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer"
                >
                  Get Share Links
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 uppercase tracking-wider font-semibold border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="px-6 py-3.5">Booking Ref</th>
                      <th className="px-6 py-3.5">Experience</th>
                      <th className="px-6 py-3.5">Activity Date</th>
                      <th className="px-6 py-3.5">Trip Total</th>
                      <th className="px-6 py-3.5">Your Earning</th>
                      <th className="px-6 py-3.5">Source</th>
                      <th className="px-6 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {data.referrals.map((refItem) => (
                      <tr key={refItem.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                        <td className="px-6 py-4 font-mono font-bold text-stone-900 dark:text-stone-100">
                          {refItem.bookingRef}
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate font-medium">
                          {refItem.productTitle}
                        </td>
                        <td className="px-6 py-4 text-stone-500">
                          {refItem.activityDate || "Upcoming"}
                        </td>
                        <td className="px-6 py-4 font-semibold">
                          ₹{Number(refItem.bookingAmountInr).toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                          +₹{Number(refItem.earningInr).toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            {refItem.attributionType === "COUPON_CODE" ? "Coupon" : "Link"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {refItem.status === "ELIGIBLE" ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Available for Payout
                            </span>
                          ) : refItem.status === "PENDING" ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Pending Trip
                            </span>
                          ) : refItem.status === "PAID" ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Paid Out
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              Cancelled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: KYC & BANK SETTINGS */}
        {activeTab === "kyc" && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Payout destinations — where the referral bonus actually lands */}
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 shadow-sm">
              <div className="flex items-start justify-between gap-4 pb-6 mb-6 border-b border-stone-200 dark:border-stone-800">
                <div>
                  <h3 className="text-xl font-bold font-display">Payout Accounts</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Where your referral earnings are sent. Every bank account is confirmed with
                    a ₹1 penny drop before it can receive money.
                  </p>
                </div>
                <Building className="w-5 h-5 text-stone-400 shrink-0" />
              </div>

              {accountMsg && (
                <div className="p-4 mb-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {accountMsg}
                </div>
              )}
              {accountErrorMsg && (
                <div className="p-4 mb-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {accountErrorMsg}
                </div>
              )}

              {payoutAccounts.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-400 border border-dashed border-stone-300 dark:border-stone-700 rounded-2xl mb-6">
                  No payout account yet. Add a bank account below so your earnings have
                  somewhere to go.
                </div>
              ) : (
                <div className="space-y-3 mb-8">
                  {payoutAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {account.method === "UPI"
                            ? <CreditCard className="w-4 h-4 text-stone-400 shrink-0" />
                            : <Building className="w-4 h-4 text-stone-400 shrink-0" />}
                          <span className="font-bold text-xs truncate">
                            {account.method === "UPI"
                              ? account.upiId
                              : `${account.bankName || "Bank"} ${account.accountNumber || ""}`}
                          </span>
                          {account.isPrimary && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Primary
                            </span>
                          )}
                          {account.verificationStatus === "VERIFIED" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Verified
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {account.verificationStatus === "FAILED" ? "Verification failed" : "Awaiting verification"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 mt-1 pl-6">
                          {account.method === "UPI"
                            ? "UPI handle"
                            : `${account.accountHolder || ""} · ${account.ifsc || ""} · ${account.accountType || "SAVINGS"}`}
                        </div>
                        {/* A verified account that is still cooling off after a change. */}
                        {account.verificationStatus === "VERIFIED" && !account.isUsable && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 pl-6 flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            Usable from {account.usableFrom} UTC — new accounts wait
                            {` ${payoutPolicy.accountCoolingHours || 24}h`} for your security.
                          </div>
                        )}
                        {account.verificationMessage && (
                          <div className="text-[11px] text-stone-400 mt-1 pl-6">{account.verificationMessage}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!account.isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryAccount(account.id)}
                            className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-[11px] font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                          >
                            Make primary
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAccount(account.id)}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddPayoutAccount} className="space-y-4 pt-6 border-t border-stone-200 dark:border-stone-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">Add a payout account</h4>

                <div className="flex gap-2">
                  {[
                    { id: "BANK_TRANSFER", label: "Bank account" },
                    { id: "UPI", label: "UPI ID" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setNewAccountMethod(option.id)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                        newAccountMethod === option.id
                          ? "bg-amber-500 text-stone-950 border-amber-500"
                          : "border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {newAccountMethod === "BANK_TRANSFER" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Account number *</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Enter full account number"
                          value={newAccountNumber}
                          onChange={(e) => setNewAccountNumber(e.target.value.replace(/\D/g, ""))}
                          required
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">IFSC code *</label>
                        <input
                          type="text"
                          placeholder="e.g. HDFC0001234"
                          value={newAccountIfsc}
                          onChange={(e) => setNewAccountIfsc(e.target.value.toUpperCase())}
                          maxLength={11}
                          required
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono uppercase tracking-wider outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Account holder name *</label>
                        <input
                          type="text"
                          placeholder="Name as registered with the bank"
                          value={newAccountHolder}
                          onChange={(e) => setNewAccountHolder(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Account type</label>
                        <select
                          value={newAccountType}
                          onChange={(e) => setNewAccountType(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="SAVINGS">Savings account</option>
                          <option value="CURRENT">Current account</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold mb-1">UPI ID *</label>
                    <input
                      type="text"
                      placeholder="yourname@okhdfcbank"
                      value={newAccountUpi}
                      onChange={(e) => setNewAccountUpi(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-[10px] text-stone-400 mt-1 block">
                      A UPI handle is confirmed by the first transfer that lands on it.
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={accountSubmitting}
                  className="w-full py-3.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {accountSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
                  {accountSubmitting ? "Confirming with your bank..." : "Add & verify account"}
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-stone-200 dark:border-stone-800">
                <div>
                  <h3 className="text-xl font-bold font-display">KYC & Bank Account Verification</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Required for direct bank deposits and TDS compliance in India.
                  </p>
                </div>
                <div>
                  {data.kycStatus === "VERIFIED" ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified ✅
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Verification Pending
                    </span>
                  )}
                </div>
              </div>

              {kycSuccessMsg && (
                <div className="p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {kycSuccessMsg}
                </div>
              )}

              {kycErrorMsg && (
                <div className="p-4 mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {kycErrorMsg}
                </div>
              )}

              <form onSubmit={handleKycSubmit} className="space-y-6">
                {/* PAN Section */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">1. Tax Identification (PAN)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">PAN Card Number *</label>
                      <input
                        type="text"
                        placeholder="ABCDE1234F"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                        maxLength={10}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono uppercase tracking-wider outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <span className="text-[10px] text-stone-400 mt-1 block">10-character alphanumeric PAN</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Name on PAN Card *</label>
                      <input
                        type="text"
                        placeholder="Full name as printed on PAN"
                        value={panHolderName}
                        onChange={(e) => setPanHolderName(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Account Section */}
                <div className="space-y-4 pt-4 border-t border-stone-200 dark:border-stone-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">2. Bank Account Details (verified by penny drop)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Bank Account Number *</label>
                      <input
                        type="password"
                        placeholder="Enter full account number"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ""))}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">IFSC Code *</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC0001234, SBIN0001234"
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        maxLength={11}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-mono uppercase tracking-wider outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Beneficiary Account Holder Name *</label>
                      <input
                        type="text"
                        placeholder="Name registered with bank"
                        value={bankAccountHolder}
                        onChange={(e) => setBankAccountHolder(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Account Type</label>
                      <select
                        value={bankAccountType}
                        onChange={(e) => setBankAccountType(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="SAVINGS">Savings Account</option>
                        <option value="CURRENT">Current Account</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">UPI ID (optional)</label>
                    <input
                      type="text"
                      placeholder="yourname@okhdfcbank, name@upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={kycSubmitting}
                    className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {kycSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {kycSubmitting ? "Verifying with Bank..." : "Verify & Save KYC Details"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: PAYOUTS HISTORY */}
        {activeTab === "payouts" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div>
                <span className="text-xs text-stone-500 block">Available Withdrawable Balance</span>
                <div className="text-3xl font-extrabold font-display text-amber-600 dark:text-amber-400">
                  ₹{Number(data.metrics.withdrawableInr ?? data.metrics.availableBalanceInr ?? 0).toLocaleString("en-IN")}
                </div>
                <span className="text-xs text-stone-400 mt-0.5 block">
                  Minimum payout threshold: ₹{Number(payoutPolicy.minPayoutInr || 1000).toLocaleString("en-IN")}
                </span>
              </div>
              <button
                onClick={() => {
                  if (data.kycStatus !== "VERIFIED") {
                    setActiveTab("kyc");
                  } else {
                    setShowPayoutModal(true);
                  }
                }}
                className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                Request Bank Payout
              </button>
            </div>

            {/* Where the rest of the money is. A creator asking "why can't I
                withdraw all of it?" should find the answer here, not in support. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: "Awaiting trip",
                  value: data.metrics.pendingEarningsInr,
                  hint: "Booked, but the trip has not happened yet",
                  tone: "text-stone-600 dark:text-stone-300",
                },
                {
                  label: "Clearing",
                  value: data.metrics.onHoldInr,
                  hint: `Earned — withdrawable after ${payoutPolicy.holdDays || 14} days`,
                  tone: "text-amber-600 dark:text-amber-400",
                },
                {
                  label: "In progress",
                  value: data.metrics.reservedInr,
                  hint: "Requested, awaiting settlement",
                  tone: "text-sky-600 dark:text-sky-400",
                },
                {
                  label: "Paid to you",
                  value: data.metrics.netReceivedInr,
                  hint: `After ₹${Number(data.metrics.tdsWithheldInr || 0).toLocaleString("en-IN")} TDS`,
                  tone: "text-emerald-600 dark:text-emerald-400",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 shadow-sm"
                >
                  <span className="text-[11px] text-stone-500 block">{card.label}</span>
                  <div className={`text-xl font-extrabold font-display mt-0.5 ${card.tone}`}>
                    ₹{Number(card.value || 0).toLocaleString("en-IN")}
                  </div>
                  <span className="text-[10px] text-stone-400 mt-1 block leading-tight">{card.hint}</span>
                </div>
              ))}
            </div>

            {payoutPolicy.tdsNote && (
              <div className="p-4 rounded-2xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px text-stone-400" />
                <span>{payoutPolicy.tdsNote}</span>
              </div>
            )}

            <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-stone-200 dark:border-stone-800">
                <h3 className="font-bold text-base">Withdrawal & Settlement History</h3>
              </div>

              {data.payouts.length === 0 ? (
                <div className="p-12 text-center text-stone-400 text-xs">
                  No payout requests recorded yet. Once your balance reaches ₹1,000, you can request a withdrawal.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 uppercase tracking-wider font-semibold border-b border-stone-200 dark:border-stone-800">
                      <tr>
                        <th className="px-6 py-3.5">Payout ID</th>
                        <th className="px-6 py-3.5">Amount</th>
                        <th className="px-6 py-3.5">Method</th>
                        <th className="px-6 py-3.5">Bank UTR Reference</th>
                        <th className="px-6 py-3.5">Requested Date</th>
                        <th className="px-6 py-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {data.payouts.map((p) => (
                        <tr key={p.id}>
                          <td className="px-6 py-4 font-mono font-bold">{p.id}</td>
                          <td className="px-6 py-4 font-extrabold text-stone-900 dark:text-stone-100">
                            ₹{Number(p.amountInr).toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4 font-medium">{p.paymentMethod}</td>
                          <td className="px-6 py-4 font-mono text-stone-500">
                            {p.utrReference || "Processing"}
                          </td>
                          <td className="px-6 py-4 text-stone-500">
                            {p.requestedAt ? new Date(p.requestedAt).toLocaleDateString("en-IN") : "-"}
                          </td>
                          <td className="px-6 py-4">
                            {p.status === "PAID" ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Paid Out
                              </span>
                            ) : p.status === "REQUESTED" ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                In Queue
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                {p.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payout Request Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowPayoutModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-stone-600 p-1 font-bold"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold font-display mb-1">Request Bank Withdrawal</h3>
            <p className="text-xs text-stone-500 mb-5">
              Available balance: <strong>₹{Number(data.metrics.withdrawableInr ?? data.metrics.availableBalanceInr ?? 0).toLocaleString("en-IN")}</strong>
            </p>

            {payoutErrorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-rose-500/10 text-rose-600 text-xs font-semibold">
                {payoutErrorMsg}
              </div>
            )}

            <form onSubmit={handlePayoutSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Withdrawal Amount (INR) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-stone-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1000"
                    max={data.metrics.withdrawableInr ?? data.metrics.availableBalanceInr}
                    required
                    placeholder="e.g. 2500"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <span className="text-[11px] text-stone-400 mt-1 block">
                  Minimum withdrawal is ₹{Number(payoutPolicy.minPayoutInr || 1000).toLocaleString("en-IN")}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Payout Destination *</label>
                {usableAccounts.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400">
                    No verified account is ready to receive a payout yet. Add one under
                    KYC & Bank, or wait for a recently added account to finish its security
                    hold.
                  </div>
                ) : (
                  <select
                    value={payoutAccountId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setPayoutAccountId(selectedId);
                      const selected = usableAccounts.find((account) => account.id === selectedId);
                      if (selected) setPayoutMethod(selected.method);
                    }}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Choose an account…</option>
                    {usableAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.method === "UPI"
                          ? `UPI · ${account.upiId}`
                          : `${account.bankName || "Bank"} ${account.accountNumber || ""}`}
                        {account.isPrimary ? " (primary)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* The number that actually arrives, before they commit to it. */}
              {payoutPreview.gross > 0 && (
                <div className="p-4 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Withdrawal</span>
                    <span className="font-semibold">₹{payoutPreview.gross.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">
                      TDS @ {Number((payoutPreview.rate * 100).toFixed(2))}%
                    </span>
                    <span className="font-semibold text-rose-600">
                      −₹{payoutPreview.tds.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-stone-200 dark:border-stone-700">
                    <span className="font-bold">Credited to your account</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                      ₹{payoutPreview.net.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={payoutSubmitting || usableAccounts.length === 0}
                  className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {payoutSubmitting ? "Submitting Request..." : "Confirm Payout Request"}
                </button>
                <button
                  type="button"
                  onClick={handleWalletTransfer}
                  disabled={payoutSubmitting}
                  className="mt-2 w-full py-3 rounded-xl border border-amber-500 text-amber-700 dark:text-amber-400 font-bold text-xs transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                >
                  Use for travel instead
                </button>
                <p className="mt-1.5 text-[10px] text-stone-500 text-center">
                  Moves this amount into your Idea Holiday wallet, less 1% TDS. No minimum, no bank account needed, never expires, and can pay a whole booking. It can't be turned back into cash.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
