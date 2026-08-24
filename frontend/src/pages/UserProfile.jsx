import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Shield,
  Heart,
  Bell,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Compass,
  Globe,
  Lock,
  PhoneCall,
  UserCheck,
  Star,
  Ticket,
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  ArrowRight,
  Store,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";
import Card, { CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import Tabs from "../components/ui/Tabs";

export function UserProfile() {
  const { user, login } = useAuth();
  const userRole = String(user?.role || user?.user_metadata?.role || "").toUpperCase();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    city: "",
    state: "",
    country: "India",
    currency_pref: "INR",
    language_pref: "en",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_relationship: "Family",
    dietary_preferences: "",
    travel_interests: ["Heritage", "Scenic Tours"],
    email_notifications: true,
    whatsapp_updates: true,
  });

  const [referralData, setReferralData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await api.get("/users/profile");
        const userData = res?.user || {};
        const profileData = userData?.profile || {};
        const prefs = profileData?.travel_preferences || {};

        setProfile((prev) => ({
          ...prev,
          name: userData.name || prev.name,
          email: userData.email || prev.email,
          phone: userData.phone || profileData.phone || prev.phone,
          city: prefs.city || prev.city,
          state: prefs.state || prev.state,
          country: prefs.country || prev.country,
          currency_pref: prefs.currency_pref || prev.currency_pref,
          language_pref: prefs.language_pref || prev.language_pref,
          dietary_preferences: prefs.dietary_preferences || prev.dietary_preferences,
          travel_interests: prefs.travel_interests || prev.travel_interests,
          emergency_contact_name: profileData.emergency_contact_name || prev.emergency_contact_name,
          emergency_contact_phone: profileData.emergency_contact_phone || prev.emergency_contact_phone,
          emergency_relationship: prefs.emergency_relationship || prev.emergency_relationship,
          email_notifications: prefs.email_notifications !== false,
          whatsapp_updates: prefs.whatsapp_updates !== false,
        }));
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    }

    async function loadReferral() {
      try {
        const refRes = await api.getUserReferralStats();
        if (refRes?.referral) {
          setReferralData(refRes.referral);
        }
      } catch (err) {
        console.error("Failed to load referral stats", err);
      }
    }

    loadProfile();
    loadReferral();
  }, []);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        displayName: profile.name,
        phone: profile.phone,
        emergencyContactName: profile.emergency_contact_name,
        emergencyContactPhone: profile.emergency_contact_phone,
        travelPreferences: {
          city: profile.city,
          state: profile.state,
          country: profile.country,
          currency_pref: profile.currency_pref,
          language_pref: profile.language_pref,
          dietary_preferences: profile.dietary_preferences,
          travel_interests: profile.travel_interests,
          emergency_relationship: profile.emergency_relationship,
          email_notifications: profile.email_notifications,
          whatsapp_updates: profile.whatsapp_updates,
        },
      };

      const res = await api.patch("/users/profile", payload);
      if (res?.user && login) {
        login({ ...user, name: profile.name, phone: profile.phone });
      }
      setSuccess("Profile and preferences saved successfully.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest) => {
    setProfile((prev) => {
      const current = prev.travel_interests || [];
      const updated = current.includes(interest)
        ? current.filter((i) => i !== interest)
        : [...current, interest];
      return { ...prev, travel_interests: updated };
    });
  };

  const completenessChecks = [
    { label: "Full Name", met: Boolean(profile.name?.trim()) },
    { label: "Verified Email", met: Boolean(profile.email?.trim()) },
    { label: "Phone Number", met: Boolean(profile.phone?.trim()) },
    { label: "Emergency Contact", met: Boolean(profile.emergency_contact_name?.trim() && profile.emergency_contact_phone?.trim()) },
    { label: "Travel Preferences", met: Boolean(profile.dietary_preferences?.trim() || profile.travel_interests?.length) },
  ];
  const completedCount = completenessChecks.filter((c) => c.met).length;
  const completenessPercent = Math.round((completedCount / completenessChecks.length) * 100);

  const availableInterests = [
    "Heritage & Forts",
    "Scenic Nature",
    "Beaches & Water Sports",
    "Culinary & Food Walks",
    "Spiritual & Temples",
    "Wildlife & Safari",
    "Adventure Trekking",
    "Luxury Day Tours",
  ];

  const tabs = [
    {
      id: "personal",
      label: "Personal Info",
      icon: User,
      content: (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Full Name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder="e.g. Jitendra Maury"
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={profile.email}
              disabled
              helperText="Managed by authentication provider"
            />
            <Input
              label="Phone / Mobile Number"
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
            <Input
              label="City & State"
              value={profile.city ? `${profile.city}${profile.state ? `, ${profile.state}` : ""}` : ""}
              onChange={(e) => {
                const parts = e.target.value.split(",");
                setProfile({
                  ...profile,
                  city: parts[0]?.trim() || "",
                  state: parts[1]?.trim() || profile.state,
                });
              }}
              placeholder="e.g. Mumbai, Maharashtra"
            />
            <Input
              label="Country / Nationality"
              value={profile.country}
              onChange={(e) => setProfile({ ...profile, country: e.target.value })}
              placeholder="India"
            />
          </div>

          <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
            <span className="text-xs text-stone-500">Changes apply to all upcoming bookings and guest manifests</span>
            <Button type="submit" variant="primary" loading={saving} icon={Save}>
              Save Personal Info
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "preferences",
      label: "Travel Preferences",
      icon: Compass,
      content: (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1.5">
                Preferred Currency
              </label>
              <select
                value={profile.currency_pref}
                onChange={(e) => setProfile({ ...profile, currency_pref: e.target.value })}
                className="w-full rounded-2xl border border-stone-200 dark:border-stone-700 p-3 text-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
              >
                <option value="INR">INR (₹) - Indian Rupee</option>
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="AED">AED (د.إ) - UAE Dirham</option>
                <option value="SGD">SGD (S$) - Singapore Dollar</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1.5">
                Preferred Guide / Tour Language
              </label>
              <select
                value={profile.language_pref}
                onChange={(e) => setProfile({ ...profile, language_pref: e.target.value })}
                className="w-full rounded-2xl border border-stone-200 dark:border-stone-700 p-3 text-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
              >
                <option value="en">English (Primary)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="mr">Marathi (मराठी)</option>
                <option value="gu">Gujarati (ગુજરાતી)</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="fr">French (Français)</option>
                <option value="de">German (Deutsch)</option>
                <option value="es">Spanish (Español)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1.5">
                Dietary & Meal Preferences
              </label>
              <input
                type="text"
                placeholder="e.g. Vegetarian, Jain food, Vegan, No nuts, Halal..."
                value={profile.dietary_preferences}
                onChange={(e) => setProfile({ ...profile, dietary_preferences: e.target.value })}
                className="w-full rounded-2xl border border-stone-200 dark:border-stone-700 p-3 text-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
              />
              <span className="text-[11px] text-stone-400 mt-1 block">
                Automatically shared with operators providing included lunches & meal breaks.
              </span>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">
                Favorite Travel Styles & Experiences
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {availableInterests.map((interest) => {
                  const selected = (profile.travel_interests || []).includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                        selected
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-xs"
                          : "bg-stone-50 dark:bg-stone-800/60 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-stone-300"
                      }`}
                    >
                      {selected ? "✓ " : "+ "}
                      {interest}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex justify-end">
            <Button type="submit" variant="primary" loading={saving} icon={Save}>
              Save Travel Preferences
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "emergency",
      label: "Safety & Emergency",
      icon: Shield,
      content: (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex items-start gap-3">
            <PhoneCall className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                Active Ride & Tour Safety
              </h4>
              <p className="text-xs text-stone-600 dark:text-stone-300">
                Your emergency contact information is securely dispatched to your chauffeur or licensed tour leader only for SOS or itinerary critical updates.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input
              label="Primary Emergency Contact Name"
              placeholder="e.g. Priya Sharma"
              value={profile.emergency_contact_name}
              onChange={(e) => setProfile({ ...profile, emergency_contact_name: e.target.value })}
            />
            <Input
              label="Emergency Contact Phone"
              type="tel"
              placeholder="+91 98765 00000"
              value={profile.emergency_contact_phone}
              onChange={(e) => setProfile({ ...profile, emergency_contact_phone: e.target.value })}
            />
            <div>
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1.5">
                Relationship
              </label>
              <select
                value={profile.emergency_relationship}
                onChange={(e) => setProfile({ ...profile, emergency_relationship: e.target.value })}
                className="w-full rounded-2xl border border-stone-200 dark:border-stone-700 p-3 text-sm bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
              >
                <option value="Spouse">Spouse / Partner</option>
                <option value="Parent">Parent</option>
                <option value="Sibling">Sibling</option>
                <option value="Friend">Friend</option>
                <option value="Colleague">Colleague / Work</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex justify-end">
            <Button type="submit" variant="primary" loading={saving} icon={Save}>
              Save Emergency Contacts
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "notifications",
      label: "Notifications & Alerts",
      icon: Bell,
      content: (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-stone-900/50">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-100 block">
                  Email Booking Confirmations & Vouchers
                </span>
                <p className="text-xs text-stone-500">
                  Receive instant PDF booking receipts, itinerary timeline, and supplier contact passes.
                </p>
              </div>
              <input
                type="checkbox"
                checked={profile.email_notifications}
                onChange={(e) => setProfile({ ...profile, email_notifications: e.target.checked })}
                className="h-5 w-5 rounded-md border-stone-300 text-amber-600 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-stone-900/50">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-100 block">
                  WhatsApp Dispatch & Driver Tracking
                </span>
                <p className="text-xs text-stone-500">
                  Receive chauffeur vehicle plate number, driver selfie verification, and live ETA pings.
                </p>
              </div>
              <input
                type="checkbox"
                checked={profile.whatsapp_updates}
                onChange={(e) => setProfile({ ...profile, whatsapp_updates: e.target.checked })}
                className="h-5 w-5 rounded-md border-stone-300 text-amber-600 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex justify-end">
            <Button type="submit" variant="primary" loading={saving} icon={Save}>
              Save Notification Preferences
            </Button>
          </div>
        </form>
      ),
    },
    {
      id: "referrals",
      label: "Referrals & Rewards",
      icon: Gift,
      content: (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-3xl p-6 text-stone-950 shadow-sm relative overflow-hidden">
            <div className="relative z-10 max-w-lg space-y-2">
              <span className="bg-stone-950 text-white text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase">
                GIVE ₹250, GET ₹250
              </span>
              <h3 className="text-2xl font-serif font-bold text-stone-950">
                Invite Friends to Idea Holiday
              </h3>
              <p className="text-xs text-stone-900/80 font-medium leading-relaxed">
                Share your unique invite link with fellow travelers. Your friends get an instant ₹250 discount on their first booking, and you earn up to ₹500 wallet credit when their trip completes!
              </p>
              <div className="pt-2">
                <Link
                  to="/travel-and-earn"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-950 hover:bg-stone-900 text-white text-xs font-bold px-4 py-2 shadow-md transition"
                >
                  <span>Open Travel & Earn Rewards Hub</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            <Gift className="absolute -right-4 -bottom-4 w-36 h-36 text-amber-400/40 pointer-events-none" />
          </div>

          {/* Referral Link & Code Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#FAF9F6] dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300 block">Your Referral Code</span>
              <div className="flex items-center gap-2">
                <span className="flex-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                  {referralData?.referralCode || "REF-TRVL..."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (referralData?.referralCode) {
                      navigator.clipboard.writeText(referralData.referralCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1 transition"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="bg-[#FAF9F6] dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300 block">Share Invite Link</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralData?.referralLink || "https://ideaholiday.com/signup?ref=..."}
                  className="flex-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-mono text-stone-600 dark:text-stone-400 truncate outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (referralData?.referralLink) {
                      navigator.clipboard.writeText(referralData.referralLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center gap-1 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick WhatsApp Share Button */}
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
              `Hey! Plan your next India vacation, tour, or airport cab with Idea Holiday. Use my referral code ${referralData?.referralCode || ""} to get an instant ₹250 discount on your first booking: ${referralData?.referralLink || "https://ideaholiday.com"}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-sm"
          >
            <Share2 className="w-4 h-4" /> Share with Friends on WhatsApp
          </a>

          {/* Earnings & Referrals Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-mono text-stone-500 uppercase block">Total Earned Credits</span>
              <span className="text-2xl font-serif font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                ₹{(referralData?.totalCreditsEarned || 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-mono text-stone-500 uppercase block">Pending Rewards</span>
              <span className="text-2xl font-serif font-bold text-amber-600 dark:text-amber-400 mt-1 block">
                ₹{(referralData?.pendingCredits || 0).toLocaleString("en-IN")}
              </span>
              <span className="text-[10px] text-stone-400">Releases on trip completion</span>
            </div>
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] font-mono text-stone-500 uppercase block">Friends Joined</span>
              <span className="text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1 block">
                {referralData?.friendsInvitedCount || 0}
              </span>
            </div>
          </div>

          {/* Referral History List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase font-mono">
              Invited Friends Activity
            </h4>
            {!referralData?.referrals || referralData.referrals.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl text-xs text-stone-500">
                You haven't referred any friends yet. Share your code to start earning travel credits!
              </div>
            ) : (
              <div className="space-y-2">
                {referralData.referrals.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-[#FAF9F6] dark:bg-stone-900/40 text-xs font-mono"
                  >
                    <div>
                      <strong className="text-stone-900 dark:text-stone-100 block">{item.referredName}</strong>
                      <span className="text-[10px] text-stone-500">{item.bookingRef} &bull; {new Date(item.createdAt).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.status === "REWARDED"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}>
                        {item.status} (+₹{item.rewardInr})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 sm:p-8 rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
          <Avatar name={profile.name || "User"} size="xl" className="ring-4 ring-amber-500/20 text-lg shadow-sm" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 font-display">
                {profile.name || "Traveler Profile"}
              </h1>
            </div>
            <p className="text-xs font-mono text-stone-500">{profile.email}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                {userRole === "SUPPLIER" ? (
                  <Link
                    to="/supplier"
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-stone-950 bg-amber-500 hover:bg-amber-400 border border-amber-600 px-3 py-0.5 rounded-full shadow-xs transition"
                  >
                    <Store className="w-3.5 h-3.5 text-stone-950" /> Supplier Portal
                  </Link>
                ) : userRole === "ADMIN" ? (
                  <Link
                    to="/admin"
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-white bg-purple-600 hover:bg-purple-500 border border-purple-700 px-3 py-0.5 rounded-full shadow-xs transition"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5 text-white" /> Admin Console
                  </Link>
                ) : userRole === "OPS" || userRole === "STAFF" || userRole === "DRIVER" ? (
                  <Link
                    to="/ops"
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-white bg-blue-600 hover:bg-blue-500 border border-blue-700 px-3 py-0.5 rounded-full shadow-xs transition"
                  >
                    <Shield className="w-3.5 h-3.5 text-white" /> Ops & Dispatch
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 px-2.5 py-0.5 rounded-full">
                    <Shield className="w-3 h-3 text-amber-600" /> Idea Holiday Verified Member
                  </span>
                )}
                <Link
                  to="/my-reviews"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-700 dark:text-stone-300 hover:text-amber-600 bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 rounded-full border border-stone-200 dark:border-stone-700 transition"
                >
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> My Reviews
                </Link>
                <Link
                  to="/my-bookings"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-700 dark:text-stone-300 hover:text-amber-600 bg-stone-100 dark:bg-stone-800 px-2.5 py-0.5 rounded-full border border-stone-200 dark:border-stone-700 transition"
                >
                  <Ticket className="w-3 h-3 text-amber-500" /> My Bookings
                </Link>
              </div>
            </div>
          </div>

        <div className="w-full sm:w-48 p-4 rounded-2xl bg-[#FAF9F6] dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 text-center space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 dark:text-stone-300">
            <span>Profile Quality</span>
            <span className="text-amber-600 font-mono">{completenessPercent}%</span>
          </div>
          <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${completenessPercent}%` }}
            />
          </div>
          <p className="text-[10px] text-stone-400">
            {completenessPercent === 100 ? "All essential profile info is set" : "Add details for smoother tour check-ins"}
          </p>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/80 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300/80 text-xs text-red-800 dark:text-red-200 flex items-center gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <Card elevation="sm">
        <CardContent className="p-6 sm:p-8">
          <Tabs tabs={tabs} />
        </CardContent>
      </Card>
    </div>
  );
}

export default UserProfile;
