import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarCheck,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock3,
  Compass,
  CreditCard,
  Download,
  Headphones,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  PhoneCall,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  TestTube2,
  Ticket,
  UserRound,
} from "lucide-react";
import CancellationRefundModal from "../components/checkout/CancellationRefundModal.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import ReviewModal from "../components/ReviewModal.jsx";

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
const bookingDate = (booking) => new Date(`${booking.activity_date || booking.travel_date}T00:00:00`);
const normalizedStatus = (booking) => String(booking.status || "confirmed").toLowerCase();
const isCancelled = (booking) => normalizedStatus(booking) === "cancelled";
const isCompleted = (booking) => normalizedStatus(booking) === "completed";
const isUpcoming = (booking) => !isCancelled(booking) && !isCompleted(booking) && bookingDate(booking) >= today();
const formatDate = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date to be confirmed";

function statusStyles(booking) {
  const status = normalizedStatus(booking);
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "completed") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "pending_payment") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function MyBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("UPCOMING");
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [supportInitialType, setSupportInitialType] = useState("CANCELLATION");
  const [supportCases, setSupportCases] = useState([]);
  const [supportDetail, setSupportDetail] = useState(null);
  const [supportReply, setSupportReply] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState({ emailEnabled: true, whatsappEnabled: true });
  const [savingPreferences, setSavingPreferences] = useState(false);

  const fetchBookings = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [data, notificationData, preferenceData, supportData] = await Promise.all([
        api.getMyBookings(),
        api.getMyNotifications().catch(() => ({ deliveries: [] })),
        api.getNotificationPreferences().catch(() => ({
          preferences: { emailEnabled: true, whatsappEnabled: true },
        })),
        api.getSupportCases().catch(() => ({ cases: [] })),
      ]);
      setBookings(Array.isArray(data) ? data : []);
      setNotifications(notificationData.deliveries || []);
      setPreferences(preferenceData.preferences || { emailEnabled: true, whatsappEnabled: true });
      setSupportCases(supportData.cases || []);
    } catch (err) {
      setError(err.message || "We could not load your trips.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  async function changePreference(key, enabled) {
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
    setSavingPreferences(true);
    setPreferences(next);
    try {
      const data = await api.updateNotificationPreferences(next);
      setPreferences(data.preferences);
      setMessage("Notification preferences updated successfully.");
    } catch (err) {
      setPreferences(previous);
      setError(err.message || "Notification preferences could not be updated.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function openSupportCase(ref) {
    try {
      const data = await api.getSupportCase(ref);
      setSupportDetail(data.case);
    } catch (err) {
      setError(err.message || "Support case could not be opened.");
    }
  }

  async function sendSupportReply() {
    if (!supportDetail || !supportReply.trim()) return;
    setSupportSending(true);
    try {
      const data = await api.addSupportMessage(supportDetail.case_ref, { message: supportReply });
      setSupportDetail(data.case);
      setSupportReply("");
      setMessage("Your message was dispatched to the operations desk.");
    } catch (err) {
      setError(err.message || "Reply could not be sent.");
    } finally {
      setSupportSending(false);
    }
  }

  const groups = useMemo(() => {
    const upcoming = bookings
      .filter(isUpcoming)
      .sort((a, b) => bookingDate(a) - bookingDate(b));
    const history = bookings
      .filter((booking) => !isUpcoming(booking))
      .sort((a, b) => bookingDate(b) - bookingDate(a));
    return { upcoming, history };
  }, [bookings]);

  const visibleBookings =
    activeTab === "UPCOMING"
      ? groups.upcoming
      : activeTab === "HISTORY"
      ? groups.history
      : bookings;
  const nextTrip = groups.upcoming[0];

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-[#FAF9F6] px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-lg sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-800">
            <UserRound className="h-8 w-8" />
          </div>
          <span className="mt-4 inline-block text-[10px] font-extrabold uppercase tracking-widest text-amber-800">
            Executive Traveler Space
          </span>
          <h1 className="mt-2 font-display text-2xl font-bold text-stone-900 sm:text-3xl">
            Access Your Bookings
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Sign in to view your upcoming travel itineraries, download official vouchers and GST invoices, track driver assignments, and manage cancellations.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/login?from=/bookings"
              className="inline-flex w-full items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-400 py-3.5 text-sm font-bold text-stone-950 shadow-md transition"
            >
              Sign In to Traveler Space
            </Link>
            <Link
              to="/search"
              className="inline-flex w-full items-center justify-center rounded-xl border border-stone-300 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-100"
            >
              Explore Experiences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {/* Executive Header Banner */}
        <header className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 border border-amber-300 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-amber-900">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Corporate Traveler Hub
              </span>
              <h1 className="font-display text-3xl font-bold text-stone-900 sm:text-4xl">
                My Trips & Itineraries
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-stone-600">
                Manage your confirmed bookings, driver assignments, and official tax vouchers in one unified workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/search"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-3 text-xs font-bold text-stone-950 shadow-sm transition"
              >
                Discover Experiences <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/contact-us"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-100 px-4 py-3 text-xs font-bold text-stone-700 hover:bg-stone-200 transition"
              >
                <Headphones className="h-3.5 w-3.5 text-amber-600" /> 24/7 Concierge
              </Link>
            </div>
          </div>
        </header>

        {/* Real-Time Metrics Ribbon */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <CalendarCheck className="h-5 w-5 text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Active Itineraries
              </span>
            </div>
            <strong className="mt-3 block text-3xl font-bold text-stone-900 font-mono">
              {groups.upcoming.length}
            </strong>
            <span className="text-xs text-stone-500">Upcoming scheduled trips</span>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <Ticket className="h-5 w-5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Confirmed Passes
              </span>
            </div>
            <strong className="mt-3 block text-3xl font-bold text-stone-900 font-mono">
              {bookings.filter((b) => b.payment_status === "PAID").length}
            </strong>
            <span className="text-xs text-stone-500">Verified payment vouchers</span>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <Compass className="h-5 w-5 text-amber-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Next Destination
              </span>
            </div>
            <strong className="mt-3 block truncate text-xl font-bold text-stone-900">
              {nextTrip?.city || "Explore Pan-India"}
            </strong>
            <span className="text-xs text-stone-500">
              {nextTrip ? formatDate(nextTrip.activity_date) : "Ready for next adventure"}
            </span>
          </div>
        </section>

        {/* Guest Notifications & Dispatch Channels */}
        <section className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              <h2 className="font-display text-lg font-bold text-stone-900">
                Traveler Dispatch Preferences
              </h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Select verified communication channels for receiving driver phone numbers, real-time pickup status, gate directions, and digital tax invoices.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 p-3 transition hover:bg-stone-50 bg-[#FAF9F6]">
                <span className="flex items-center gap-2 text-xs font-bold text-stone-900">
                  <Mail className="h-4 w-4 text-amber-600" /> Email Notifications
                </span>
                <input
                  type="checkbox"
                  checked={preferences.emailEnabled}
                  disabled={savingPreferences}
                  onChange={(e) => changePreference("emailEnabled", e.target.checked)}
                  className="h-4 w-4 rounded accent-amber-500"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 p-3 transition hover:bg-stone-50 bg-[#FAF9F6]">
                <span className="flex items-center gap-2 text-xs font-bold text-stone-900">
                  <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Real-Time Dispatch
                </span>
                <input
                  type="checkbox"
                  checked={preferences.whatsappEnabled}
                  disabled={savingPreferences}
                  onChange={(e) => changePreference("whatsappEnabled", e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-stone-200 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                Live Dispatch & Notification Audit
              </h3>
              <span className="text-[11px] font-medium text-stone-400">
                Latest {Math.min(4, notifications.length)} events
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {notifications.length ? (
                notifications.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#FAF9F6] p-3 border border-stone-200"
                  >
                    <div>
                      <strong className="block text-xs font-bold text-stone-900">
                        {String(item.event_type || "Booking update").replaceAll("_", " ")}
                      </strong>
                      <span className="text-[10px] text-stone-500">
                        Ref: {item.booking_ref || "General"} · {item.channel} ·{" "}
                        {item.sent_at || item.created_at}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[9px] font-black ${
                        item.status === "SENT"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : item.status === "FAILED"
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-stone-200 p-5 text-center text-xs text-stone-400">
                  Real-time dispatch confirmations will appear automatically upon booking events.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Support Case Desk */}
        {supportCases.length > 0 && (
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-amber-600" />
                <h2 className="font-display text-lg font-bold text-stone-900">
                  Active Operations & Support Tickets
                </h2>
              </div>
              <span className="text-xs font-bold text-stone-400">
                {supportCases.length} total cases
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {supportCases.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-xs font-mono font-bold text-amber-800">
                      {item.case_ref}
                    </strong>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[9px] font-black ${
                        ["APPROVED", "RESOLVED", "CLOSED"].includes(item.status)
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : item.status === "REJECTED"
                          ? "bg-rose-100 text-rose-900 border border-rose-300"
                          : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}
                    >
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-stone-900">{item.subject}</h3>
                  <p className="mt-1 text-[11px] text-stone-500">
                    Booking: {item.booking_ref} · {item.case_type.replaceAll("_", " ")} ·{" "}
                    {item.message_count} messages
                  </p>
                  {item.resolution && (
                    <p className="mt-2 rounded-xl bg-white p-2 text-xs text-stone-700 border border-stone-200">
                      Resolution: {item.resolution}
                    </p>
                  )}
                  <button
                    onClick={() => openSupportCase(item.case_ref)}
                    className="mt-3 text-xs font-bold text-amber-800 hover:underline"
                  >
                    Open Live Thread →
                  </button>
                </div>
              ))}
            </div>

            {supportDetail && (
              <div className="mt-6 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-sm font-bold text-stone-900">
                      Ticket #{supportDetail.case_ref} Conversation
                    </strong>
                    <p className="text-[11px] text-stone-500">
                      All communications are securely recorded for service auditing.
                    </p>
                  </div>
                  <button
                    onClick={() => setSupportDetail(null)}
                    className="text-xs font-bold text-stone-500 hover:text-stone-800"
                  >
                    Close Thread
                  </button>
                </div>
                <div className="mt-4 max-h-60 space-y-2 overflow-y-auto pr-1">
                  {supportDetail.messages?.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl p-3 text-xs ${
                        item.author_role === "TRAVELER"
                          ? "ml-8 bg-white border border-stone-200 text-stone-900"
                          : "mr-8 bg-amber-50 text-amber-950 border border-amber-200"
                      }`}
                    >
                      <div className="flex justify-between text-[10px] font-bold uppercase text-stone-500">
                        <span>{item.author_role}</span>
                        <span>{item.created_at}</span>
                      </div>
                      <p className="mt-1 leading-relaxed">{item.message}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input
                    value={supportReply}
                    onChange={(e) => setSupportReply(e.target.value)}
                    placeholder="Type your response to the operations team..."
                    className="flex-1 rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-900 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    disabled={supportSending || !supportReply.trim()}
                    onClick={sendSupportReply}
                    className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 text-xs font-bold text-stone-950 transition shadow-sm disabled:opacity-40"
                  >
                    Send Reply
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Global Feedback Banners */}
        {message && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {message}
            </span>
            <button
              onClick={() => setMessage("")}
              className="text-xs font-bold text-emerald-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" /> {error}
            </span>
            <button
              onClick={fetchBookings}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 underline"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {/* Tab Selection Bar */}
        <div className="flex flex-col gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Trip status">
            {[
              ["UPCOMING", "Upcoming Journeys", groups.upcoming.length],
              ["HISTORY", "Past & Completed", groups.history.length],
              ["ALL", "All Records", bookings.length],
            ].map(([id, label, count]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                  activeTab === id
                    ? "bg-amber-500 text-stone-950 shadow-sm"
                    : "bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200"
                }`}
              >
                {label} · {count}
              </button>
            ))}
          </div>
          <button
            onClick={fetchBookings}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-amber-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Trips
          </button>
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((item) => (
              <div
                key={item}
                className="h-56 animate-pulse rounded-3xl border border-stone-200 bg-white"
              />
            ))}
          </div>
        ) : visibleBookings.length ? (
          <div className="space-y-6">
            {visibleBookings.map((booking) => {
              const status = normalizedStatus(booking);
              const confirmed = booking.payment_status === "PAID" && status !== "cancelled";
              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:shadow-lg"
                >
                  <div className="grid md:grid-cols-[260px_1fr]">
                    {/* Media Thumbnail */}
                    <div className="relative min-h-[220px]">
                      <img
                        src={
                          booking.hero_image ||
                          "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=700&q=80"
                        }
                        alt={booking.product_title || "Experience preview"}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <span className="absolute bottom-4 left-4 rounded-xl bg-stone-900/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-md">
                        {booking.city || "Pan-India"}
                      </span>
                    </div>

                    {/* Content Details */}
                    <div className="p-6 sm:p-7">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-mono text-xs font-bold text-amber-900 border border-amber-300">
                              {booking.ref}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-0.5 text-[10px] font-black uppercase ${statusStyles(
                                booking
                              )}`}
                            >
                              {status.replaceAll("_", " ")}
                            </span>
                            {booking.payment_method === "DEMO" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-0.5 text-[9px] font-black text-cyan-800 border border-cyan-200">
                                <TestTube2 className="h-3 w-3" /> DEMO
                              </span>
                            )}
                          </div>
                          <h2 className="mt-2.5 font-display text-xl font-bold text-stone-900 sm:text-2xl">
                            {booking.product_title || booking.product_type}
                          </h2>
                          <p className="mt-1 text-xs text-stone-500">
                            Operated by accredited partner:{" "}
                            <span className="font-semibold text-stone-700">
                              {booking.supplier_name || "Idea Holiday Verified Network"}
                            </span>
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-stone-400 uppercase">
                            Total Invoiced
                          </span>
                          <strong className="block font-display text-2xl font-bold text-amber-800 font-mono">
                            ₹{Number(booking.amount_inr || 0).toLocaleString("en-IN")}
                          </strong>
                        </div>
                      </div>

                      {/* Travel Spec Badges */}
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-[#FAF9F6] p-3.5 border border-stone-200">
                          <CalendarDays className="h-4 w-4 text-amber-600" />
                          <span className="mt-1.5 block text-[10px] uppercase font-bold text-stone-400">
                            Date of Service
                          </span>
                          <strong className="mt-0.5 block text-xs font-semibold text-stone-900">
                            {formatDate(booking.activity_date)}
                          </strong>
                        </div>

                        <div className="rounded-2xl bg-[#FAF9F6] p-3.5 border border-stone-200">
                          <Clock3 className="h-4 w-4 text-amber-600" />
                          <span className="mt-1.5 block text-[10px] uppercase font-bold text-stone-400">
                            Scheduled Departure
                          </span>
                          <strong className="mt-0.5 block text-xs font-semibold text-stone-900">
                            {booking.pickup_time || "To Be Dispatched"}
                          </strong>
                        </div>

                        <div className="rounded-2xl bg-[#FAF9F6] p-3.5 border border-stone-200">
                          <MapPin className="h-4 w-4 text-amber-600" />
                          <span className="mt-1.5 block text-[10px] uppercase font-bold text-stone-400">
                            Pickup / Meeting Point
                          </span>
                          <strong className="mt-0.5 block truncate text-xs font-semibold text-stone-900">
                            {booking.pickup_location || "Coordinated with chauffeur"}
                          </strong>
                        </div>
                      </div>

                      {/* Destination Drop-off & Flight Spec */}
                      {booking.drop_location && (
                        <div className="mt-3 rounded-2xl bg-emerald-50/40 p-3.5 border border-emerald-200">
                          <div className="flex items-center justify-between">
                            <span className="block text-[10px] uppercase font-bold text-emerald-800">
                              Destination Drop-off
                            </span>
                            {booking.flight_number && (
                              <span className="font-mono text-[10px] font-bold text-stone-700 bg-white px-2 py-0.5 rounded border border-stone-300">
                                Flight/Train: {booking.flight_number}
                              </span>
                            )}
                          </div>
                          <strong className="mt-1 block text-xs font-semibold text-stone-900">
                            {booking.drop_location}
                          </strong>
                        </div>
                      )}

                      {/* Chauffeur Dispatch Details */}
                      {booking.driver_name && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                              <Car className="h-4 w-4" />
                            </div>
                            <div>
                              <strong className="block text-stone-900">
                                Assigned Chauffeur: {booking.driver_name} · {booking.vehicle_model}
                              </strong>
                              <span className="font-mono font-bold tracking-wider text-emerald-800">
                                Vehicle Reg: {booking.vehicle_number}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-800 border border-emerald-200">
                              {String(booking.assignment_status || "DISPATCHED").replaceAll(
                                "_",
                                " "
                              )}
                            </span>
                            <a
                              href={`tel:${booking.driver_phone}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-emerald-700"
                            >
                              <PhoneCall className="h-3.5 w-3.5" /> Call Chauffeur
                            </a>
                          </div>
                        </div>
                      )}

                      {/* Card Action Footer */}
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                        <div className="text-[11px] text-stone-500">
                          Payment Status:{" "}
                          <strong
                            className={
                              booking.payment_status === "PAID"
                                ? "text-emerald-800 font-bold"
                                : "text-amber-800 font-bold"
                            }
                          >
                            {booking.payment_status || "PENDING"}
                          </strong>{" "}
                          · Vehicle: {booking.vehicle_category || "Standard"}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {confirmed && (
                            <Link
                              to={`/booking-confirmed/${booking.ref || booking.id}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-stone-950 shadow-sm"
                            >
                              <Ticket className="h-3.5 w-3.5" /> View Digital Pass & QR
                            </Link>
                          )}

                          {isCompleted(booking) && !booking.review_id && (
                            <button
                              onClick={() => setReviewBooking(booking)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-200 border border-amber-300"
                            >
                              <Star className="h-3.5 w-3.5 text-amber-600" /> Write Review
                            </button>
                          )}

                          {booking.review_id && (
                            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                              <Star className="h-3 w-3 fill-current text-emerald-600" /> Review{" "}
                              {booking.review_status.toLowerCase()}
                            </span>
                          )}

                          <button
                            onClick={() => {
                              setSupportInitialType("COMPLAINT");
                              setCancelModalBooking(booking);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-100 px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200"
                          >
                            <Headphones className="h-3.5 w-3.5 text-amber-600" /> Concierge Help
                          </button>

                          {isUpcoming(booking) && confirmed && (
                            <button
                              onClick={() => {
                                setSupportInitialType("CANCELLATION");
                                setCancelModalBooking(booking);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Request Cancellation
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-800">
              <Ticket className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-stone-900">
              {activeTab === "UPCOMING"
                ? "No Upcoming Trips Scheduled"
                : "No Historical Trips Found"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500 leading-relaxed">
              When you book curated tours, transfers, or cultural experiences across India, every detail, voucher, and driver assignment will appear here.
            </p>
            <Link
              to="/search"
              className="mt-6 inline-flex rounded-xl bg-amber-500 hover:bg-amber-400 px-6 py-3 text-xs font-bold text-stone-950 shadow-md"
            >
              Explore Curated Experiences
            </Link>
          </div>
        )}

        {cancelModalBooking && (
          <CancellationRefundModal
            booking={cancelModalBooking}
            initialType={supportInitialType}
            onClose={() => setCancelModalBooking(null)}
            onSuccess={(result) => {
              setMessage(result.message);
              setCancelModalBooking(null);
              fetchBookings();
            }}
          />
        )}
        {reviewBooking && (
          <ReviewModal
            booking={reviewBooking}
            onClose={() => setReviewBooking(null)}
            onSuccess={(result) => {
              setMessage(result.message);
              setReviewBooking(null);
              fetchBookings();
            }}
          />
        )}
      </div>
    </div>
  );
}
