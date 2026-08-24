import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Copy,
  FileCheck,
  MessageSquare,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";
import BlockDatesModal from "./BlockDatesModal.jsx";
import ManageFleetModal from "./ManageFleetModal.jsx";
import SupplierListingsPanel from "./SupplierListingsPanel.jsx";
import SupplierRevenueCard from "./SupplierRevenueCard.jsx";
import SupplierBookingSnapshot from "./SupplierBookingSnapshot.jsx";
import SupplierPerformanceRing from "./SupplierPerformanceRing.jsx";
import SupplierQuickActions from "./SupplierQuickActions.jsx";
import SupplierAnalyticsDashboard from "./SupplierAnalyticsDashboard.jsx";
import SupplierCompliancePanel from "./SupplierCompliancePanel.jsx";
import { authHeaders } from "../../lib/api.js";

const money = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const productScore = (product) => {
  const checks = [product.title, product.short_desc, product.hero_image, Number(product.price_inr) > 0, product.inclusions, product.itinerary];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

export default function SupplierDashboardOverview({ supplierData, loading, onRefresh, initialPanel }) {
  const [blockOpen, setBlockOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [updating, setUpdating] = useState("");
  const [copiedRef, setCopiedRef] = useState("");
  const supplier = supplierData?.supplier || {};
  const bookings = supplierData?.bookings || [];
  const products = supplierData?.products || [];
  const drivers = supplierData?.drivers || [];
  const blockedDates = supplierData?.blockedDates || [];
  const payouts = supplierData?.payouts || [];
  const kybDocs = supplierData?.kybDocs || [];

  useEffect(() => {
    if (initialPanel === "fleet") setFleetOpen(true);
    if (initialPanel === "listings") {
      const el = document.getElementById("supplier-listings");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  }, [initialPanel]);

  const activeBookings = bookings.filter((booking) => !["completed", "cancelled"].includes(booking.status));
  const pendingBookings = bookings.filter((booking) => booking.status === "pending_confirmation" || booking.supplier_response_status === "PENDING");
  const completed = bookings.filter((booking) => booking.status === "completed");
  const revenue = payouts.filter((payout) => payout.payout_status !== "CANCELLED").reduce((sum, payout) => sum + Number(payout.net_payout || 0), 0);
  const paid = payouts.filter((payout) => payout.payout_status === "PROCESSED").reduce((sum, payout) => sum + Number(payout.net_payout || 0), 0);
  const scheduled = payouts.filter((payout) => ["SCHEDULED", "BATCHED"].includes(payout.payout_status)).reduce((sum, payout) => sum + Number(payout.net_payout || 0), 0);
  const averageOrder = bookings.length ? bookings.reduce((sum, booking) => sum + Number(booking.amount_inr || 0), 0) / bookings.length : 0;
  const fulfillment = bookings.length ? Math.round((completed.length / (bookings.filter((booking) => booking.status !== "cancelled").length || 1)) * 100) : 100;
  const instantProducts = products.filter((product) => product.is_instant_booking !== 0).length;
  const listingAverage = products.length ? Math.round(products.reduce((sum, product) => sum + productScore(product), 0) / products.length) : 0;
  const performanceScore = Math.round(
    (Number(supplier.rating || 4.8) / 5) * 35 +
    Math.min(1, fulfillment / 95) * 25 +
    (products.length ? instantProducts / products.length : 0) * 20 +
    (listingAverage / 100) * 20
  );

  const monthlyRevenue = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(2026, 7 - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: date.toLocaleString("en-IN", { month: "short" }),
        value: 0
      };
    });
    bookings.forEach((booking) => {
      const payout = payouts.find((item) => item.booking_id === booking.id);
      const month = months.find((item) => booking.activity_date?.startsWith(item.key));
      if (month && payout?.payout_status !== "CANCELLED") {
        month.value += Number(payout?.net_payout || booking.supplier_payout_amount || 0);
      }
    });
    return months;
  }, [bookings, payouts]);

  const chartMax = Math.max(...monthlyRevenue.map((item) => item.value), 1);
  const kybStatus = supplier.kyb_status || "PENDING";
  const isApproved = kybStatus === "APPROVED";

  const actionItems = [
    !isApproved && {
      level: "urgent",
      title: kybStatus === "SUSPENDED"
        ? "Account suspended — contact support"
        : kybStatus === "REJECTED"
        ? "Verification rejected — re-submit documents"
        : "Awaiting KYB verification — not receiving bookings",
      copy: kybStatus === "SUSPENDED"
        ? "Your account has been suspended. Reach out to the Idea Holiday team."
        : kybStatus === "REJECTED"
        ? "Your documents were not approved. Upload valid copies to resume."
        : "Our admin team is reviewing your business documents. You'll be notified by email.",
      to: "?panel=compliance",
      cta: "View compliance"
    },
    pendingBookings.length > 0 && {
      level: "urgent",
      title: `${pendingBookings.length} booking${pendingBookings.length > 1 ? "s" : ""} need confirmation`,
      copy: "Respond quickly to protect your acceptance score.",
      to: "/supplier/bookings",
      cta: "Review bookings"
    },
    activeBookings.filter((booking) => !booking.driver_name).length > 0 && {
      level: "urgent",
      title: `${activeBookings.filter((booking) => !booking.driver_name).length} trip${activeBookings.filter((booking) => !booking.driver_name).length > 1 ? "s" : ""} need a driver`,
      copy: "Assign fleet before the traveler dispatch window.",
      action: () => setFleetOpen(true),
      cta: "Assign fleet"
    },
    products.some((product) => productScore(product) < 85) && {
      level: "growth",
      title: "Improve listing quality",
      copy: "Complete photos, inclusions and itinerary to improve conversion.",
      to: "/supplier/products/create",
      cta: "Improve products"
    }
  ].filter(Boolean);

  const handleCopyRef = (ref) => {
    if (!ref) return;
    navigator.clipboard?.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(""), 2000);
  };

  const updateTrip = async (bookingId, status) => {
    if (!supplier.id) return;
    setUpdating(bookingId);
    try {
      await fetch(`/api/suppliers/${supplier.id}/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status })
      });
      await onRefresh?.();
    } finally {
      setUpdating("");
    }
  };

  if (initialPanel === "compliance") {
    return (
      <SupplierCompliancePanel
        supplierData={supplierData}
        supplierId={supplier.id}
        onRefresh={onRefresh}
      />
    );
  }

  if (showAnalytics) {
    return (
      <SupplierAnalyticsDashboard
        supplierId={supplier.id}
        onBack={() => setShowAnalytics(false)}
      />
    );
  }

  const dashboardStats = {
    today: {
      bookings: activeBookings.length,
      revenue_inr: revenue / 30,
      trips_in_progress: activeBookings.filter(b => b.status === "in_progress").length,
      trips_upcoming: activeBookings.filter(b => b.status === "confirmed").length,
      trips_completed: completed.length,
    },
    month: {
      bookings: bookings.length,
      revenue_inr: revenue,
      growth_pct: 14.8,
    },
    week: {
      trend: [4, 6, 8, 5, 9, 7, activeBookings.length || 5],
    },
    ratings: {
      avg: Number(supplier.rating || 4.8),
      completion_rate: fulfillment,
      cancellation_rate: 100 - fulfillment,
    },
    alerts: pendingBookings.slice(0, 2).map(b => ({
      type: "SLA_PENDING",
      booking_id: b.id,
      deadline: "Within 2h",
    })),
  };

  return (
    <div className="space-y-6">
      {/* Phase 4: Supplier Core Intelligence Grid */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SupplierRevenueCard stats={dashboardStats} />
        <SupplierBookingSnapshot stats={dashboardStats} />
        <SupplierPerformanceRing stats={dashboardStats} />
        <SupplierQuickActions
          onNewListing={() => {
            const el = document.getElementById("supplier-listings");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          onManageFleet={() => setFleetOpen(true)}
          onBlockDates={() => setBlockOpen(true)}
          onViewAnalytics={() => setShowAnalytics(true)}
          onViewPayouts={() => {
            const el = document.getElementById("payouts-section");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </section>
      {/* Supplier Onboarding Checklist Card */}
      {products.length === 0 && bookings.length === 0 && (
        <section className="rounded-3xl border border-amber-300 bg-white p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-200 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-900 border border-amber-300">
                  Getting started
                </span>
                <span className="text-xs font-mono text-stone-500">Partner activation checklist</span>
                {supplier.id && (
                  <button
                    type="button"
                    onClick={() => handleCopyRef(supplier.id)}
                    className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition ml-1"
                    title="Copy Supplier ID"
                  >
                    {copiedRef === supplier.id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                    <span>ID: {supplier.id}</span>
                  </button>
                )}
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Welcome to Idea Holiday! Complete your setup</h2>
              <p className="mt-1 text-xs text-stone-500">Follow these steps to get verified, publish inventory and start receiving confirmed bookings.</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-black text-amber-800 font-mono">
                {Math.round(([true, supplier.kyb_status === "APPROVED", products.length > 0, drivers.length > 0].filter(Boolean).length / 4) * 100)}%
              </span>
              <span className="block text-[10px] text-stone-400 uppercase font-bold">Setup progress</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-xs font-bold text-stone-900">1. Account created</strong>
                <span className="mt-0.5 block text-[11px] text-stone-600">Profile registered</span>
              </div>
            </div>

            {/* Step 2 */}
            <Link
              to="?panel=compliance"
              className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                supplier.kyb_status === "APPROVED"
                  ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400"
                  : "border-stone-200 bg-[#FAF9F6] hover:border-amber-400"
              }`}
            >
              {supplier.kyb_status === "APPROVED" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <strong className="block text-xs font-bold text-stone-900">2. KYB verification</strong>
                  <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${
                    supplier.kyb_status === "APPROVED" ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                  }`}>
                    {supplier.kyb_status || "PENDING"}
                  </span>
                </div>
                <span className="mt-0.5 block text-[11px] text-stone-500">View documents →</span>
              </div>
            </Link>

            {/* Step 3 */}
            <Link
              to="/supplier/products/create"
              className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                products.length > 0
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-stone-200 bg-[#FAF9F6] hover:border-amber-400"
              }`}
            >
              {products.length > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Plus className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block text-xs font-bold text-stone-900">3. Add first listing</strong>
                <span className="mt-0.5 block text-[11px] text-stone-500">Transfers or day tours →</span>
              </div>
            </Link>

            {/* Step 4 */}
            <button
              onClick={() => setFleetOpen(true)}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                drivers.length > 0
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-stone-200 bg-[#FAF9F6] hover:border-amber-400"
              }`}
            >
              {drivers.length > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Car className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <strong className="block text-xs font-bold text-stone-900">4. Add fleet driver</strong>
                <span className="mt-0.5 block text-[11px] text-stone-500">Enable trip dispatch →</span>
              </div>
            </button>
          </div>
        </section>
      )}

      {/* KPI Stats Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [CircleDollarSign, "Net revenue", money(revenue), `${money(paid)} paid out`, "text-emerald-600"],
          [CalendarCheck, "Active bookings", activeBookings.length, `${pendingBookings.length} awaiting confirmation`, "text-amber-600"],
          [TrendingUp, "Fulfillment rate", `${fulfillment}%`, `${completed.length} completed trips`, "text-amber-800"],
          [Star, "Partner score", performanceScore, `${supplier.rating || 4.9} traveler rating`, "text-amber-600"]
        ].map(([Icon, label, value, note, color]) => (
          <article key={label} className="group rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[.15em] text-stone-400">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <strong className="mt-5 block text-3xl font-bold text-stone-900 font-mono">{loading ? "…" : value}</strong>
            <span className="mt-1 block text-xs text-stone-500">{note}</span>
          </article>
        ))}
      </section>

      {/* Action Center & Growth Score */}
      <div className="grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-800">Action center</span>
              <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">What needs you now</h2>
            </div>
            <button onClick={onRefresh} className="rounded-xl border border-stone-300 p-2.5 text-stone-500 hover:text-stone-900">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {actionItems.length ? (
              actionItems.map((item) => {
                const inner = (
                  <>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${item.level === "urgent" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                      {item.level === "urgent" ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm text-stone-900">{item.title}</strong>
                      <span className="mt-1 block text-xs text-stone-500">{item.copy}</span>
                    </span>
                    <span className="hidden items-center gap-1 text-xs font-bold text-amber-800 sm:flex">
                      {item.cta}<ChevronRight className="h-4 w-4" />
                    </span>
                  </>
                );
                return item.to ? (
                  <Link key={item.title} to={item.to} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 hover:border-amber-400">
                    {inner}
                  </Link>
                ) : (
                  <button key={item.title} onClick={item.action} className="flex w-full items-center gap-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-left hover:border-amber-400">
                    {inner}
                  </button>
                );
              })
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <div>
                  <strong className="text-sm text-stone-900">You’re all caught up</strong>
                  <p className="mt-1 text-xs text-stone-600">Bookings, fleet and listings are ready for traveler demand.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-amber-300 bg-amber-500 p-6 text-stone-950 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-[.16em] text-stone-900/70">Idea Holiday growth score</span>
          <div className="mt-4 flex items-end gap-3">
            <strong className="text-6xl font-black">{performanceScore}</strong>
            <span className="mb-2 text-sm font-bold">/ 100<br />Excellent</span>
          </div>
          <p className="mt-5 text-sm font-semibold leading-relaxed text-stone-900/80">
            Your rating and fulfillment are strong. Keep your listings updated and maintain swift booking confirmation to earn priority placement.
          </p>
          <Link to="/supplier/products/create" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-5 py-3 text-xs font-bold text-white hover:bg-stone-800">
            Add more products <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>

      {/* Revenue Pulse & Operations Readiness */}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-800">Earnings</span>
              <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Revenue pulse</h2>
            </div>
            <div className="text-right">
              <strong className="block text-xl font-bold text-stone-900 font-mono">{money(revenue)}</strong>
              <span className="text-[10px] text-stone-500">Net after commission</span>
            </div>
          </div>
          <div className="mt-8 flex h-44 items-end gap-3">
            {monthlyRevenue.map((month) => (
              <div key={month.key} className="flex h-full flex-1 flex-col justify-end gap-2">
                <span className="text-center text-[9px] font-bold text-stone-600">{month.value ? money(month.value) : ""}</span>
                <div className="min-h-1 rounded-t-xl bg-gradient-to-t from-amber-600 to-amber-400 transition-all" style={{ height: `${Math.max(4, (month.value / chartMax) * 100)}%` }} />
                <span className="text-center text-[10px] font-bold text-stone-500">{month.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-stone-200 pt-5 text-center">
            <div>
              <strong className="block text-sm font-bold text-stone-900">{money(averageOrder)}</strong>
              <span className="text-[10px] text-stone-500">Avg. booking</span>
            </div>
            <div>
              <strong className="block text-sm text-emerald-800 font-bold">{money(scheduled)}</strong>
              <span className="text-[10px] text-stone-500">Next payout</span>
            </div>
            <div>
              <strong className="block text-sm font-bold text-stone-900">{supplier.commission_rate || 18}%</strong>
              <span className="text-[10px] text-stone-500">Commission</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-800">Operations</span>
              <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Readiness & fleet</h2>
            </div>
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-6 space-y-5">
            {[
              ["Fleet drivers available", drivers.filter((driver) => driver.status !== "UNAVAILABLE").length, drivers.length || 1, `${drivers.length} registered`, () => setFleetOpen(true)],
              ["Bookable inventory", products.filter((product) => product.status === "PUBLISHED" && product.is_published !== 0).length, products.length || 1, `${products.length} products`, () => document.getElementById("supplier-listings")?.scrollIntoView({ behavior: "smooth" })],
              ["Active blackout rules", blockedDates.length, Math.max(blockedDates.length, 1), `${blockedDates.length} blocked windows`, () => setBlockOpen(true)]
            ].map(([label, current, total, note, action]) => (
              <button key={label} onClick={action || undefined} className="block w-full text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-700">{label}</span>
                  <span className="text-stone-500">{note}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: `${Math.min(100, (current / total) * 100)}%` }} />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={() => setBlockOpen(true)} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-left hover:border-amber-400">
              <Calendar className="h-5 w-5 text-amber-600" />
              <strong className="mt-3 block text-xs font-bold text-stone-900">Manage calendar</strong>
              <span className="mt-1 block text-[10px] text-stone-500">{blockedDates.length} blackout rules</span>
            </button>
            <button onClick={() => setFleetOpen(true)} className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 text-left hover:border-amber-400">
              <Users className="h-5 w-5 text-amber-600" />
              <strong className="mt-3 block text-xs font-bold text-stone-900">Manage fleet</strong>
              <span className="mt-1 block text-[10px] text-stone-500">{drivers.length} active drivers</span>
            </button>
          </div>
        </section>
      </div>

      {/* Settlement Register Table */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-800">Settlement register</span>
            <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Supplier payouts & settlement</h2>
            <p className="mt-1 text-xs text-stone-500">Booking-level gross, commission, net payable and bank-reference status.</p>
          </div>
          <div className="text-right">
            <strong className="block text-lg font-bold text-emerald-800 font-mono">{money(paid)}</strong>
            <span className="text-[10px] text-stone-500">Processed to date</span>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-200">
              <tr>
                <th className="pb-3">Booking</th>
                <th className="pb-3">Gross</th>
                <th className="pb-3">Commission</th>
                <th className="pb-3">Net payable</th>
                <th className="pb-3">Settlement</th>
                <th className="pb-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b border-stone-200 divide-stone-200">
              {payouts.slice(0, 8).map((payout) => (
                <tr key={payout.id}>
                  <td className="py-3 font-bold text-amber-800">
                    {bookings.find((booking) => booking.id === payout.booking_id)?.ref || payout.booking_id}
                  </td>
                  <td className="py-3 text-stone-900">{money(payout.gross_amount)}</td>
                  <td className="py-3 text-stone-500">{money(payout.commission_amount)}</td>
                  <td className="py-3 font-bold text-emerald-800">{money(payout.net_payout)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold border ${
                      payout.payout_status === "RECONCILED" || payout.payout_status === "PROCESSED"
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : payout.payout_status === "BATCHED"
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-stone-100 text-stone-700 border-stone-300"
                    }`}>
                      {payout.settlement_status || payout.payout_status}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-[10px]">
                    {payout.transfer_id || payout.provider_batch_id ? (
                      <span className="text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {payout.transfer_id || payout.provider_batch_id}
                      </span>
                    ) : (
                      <span className="text-stone-400">Scheduled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payouts.length && <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-xs text-stone-500">Payouts will appear after a paid booking is completed.</p>}
        </div>
      </section>

      {/* Upcoming Trips Widget */}
      <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-800">Live operations</span>
            <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Upcoming trips</h2>
            <p className="mt-1 text-xs text-stone-500">Confirm, dispatch and contact travelers without leaving the dashboard.</p>
          </div>
          <Link to="/supplier/bookings" className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:underline">
            Open all bookings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-5 space-y-3">
          {(activeBookings.length ? activeBookings : bookings.slice(0, 3)).slice(0, 4).map((trip) => {
            const phone = trip.traveler_phone || "";
            const driver = trip.driver_name || "Unassigned";
            return (
              <article key={trip.id} className="grid gap-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 md:grid-cols-[.8fr_1.2fr_1fr_auto] md:items-center">
                <div>
                  <span className="text-[10px] font-bold uppercase text-stone-400">{trip.activity_date || "Upcoming"} · {trip.pickup_time || "Time TBC"}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-bold text-stone-900">{trip.ref}</strong>
                    <button onClick={() => handleCopyRef(trip.ref)} title="Copy reference" className="p-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-600 transition">
                      {copiedRef === trip.ref ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                    {trip.product_id && (
                      <button
                        onClick={() => handleCopyRef(trip.product_id)}
                        title="Copy Product ID"
                        className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300 text-stone-600 hover:text-amber-800"
                      >
                        {copiedRef === trip.product_id ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5 text-stone-400" />}
                        <span>PID: {trip.product_id}</span>
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <strong className="block text-sm font-bold text-stone-900">{trip.traveler_name || "Traveler"}</strong>
                  <span className="mt-1 block truncate text-xs text-stone-500">{trip.pickup_location || "Pickup to be confirmed"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400">Driver</span>
                  <strong className={`mt-1 block text-xs ${trip.driver_name ? "text-emerald-800 font-bold" : "text-amber-800 font-bold"}`}>{driver}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`tel:${phone}`} className="rounded-xl border border-stone-300 p-2.5 text-stone-600 hover:bg-stone-100">
                    <Phone className="h-4 w-4" />
                  </a>
                  <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-800">
                    <MessageSquare className="h-4 w-4" />
                  </a>
                  {trip.status === "pending_confirmation" && (
                    <button disabled={updating === trip.id} onClick={() => updateTrip(trip.id, "confirmed")} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-2.5 text-[10px] font-bold text-stone-950 shadow-sm">
                      Confirm
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!bookings.length && (
            <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center">
              <Car className="mx-auto h-8 w-8 text-stone-400" />
              <h3 className="mt-3 text-sm font-bold text-stone-900">No trips yet</h3>
              <p className="mt-1 text-xs text-stone-500">New bookings will appear here with their dispatch status.</p>
            </div>
          )}
        </div>
      </section>

      {/* Listings Inventory & Quality Signals */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <SupplierListingsPanel products={products} supplierId={supplier.id} onRefresh={onRefresh} />
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-800">
              <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
            </span>
            <div>
              <strong className="text-2xl font-bold text-stone-900">{supplier.rating || 4.9}</strong>
              <span className="ml-2 text-xs text-stone-500">traveler rating</span>
            </div>
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold text-stone-900">Quality signals</h2>
          <p className="mt-2 text-xs text-stone-500">Calculated from your current bookings and published listings.</p>
          <div className="mt-5 space-y-4">
            {[
              ["Traveler rating", Math.round((Number(supplier.rating || 4.9) / 5) * 100)],
              ["Trip fulfillment", fulfillment],
              ["Listing completeness", listingAverage],
              ["Instant bookability", products.length ? Math.round((instantProducts / products.length) * 100) : 0]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-600">{label}</span>
                  <strong className="text-stone-900">{value}%</strong>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-stone-200">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <BlockDatesModal isOpen={blockOpen} onClose={() => setBlockOpen(false)} supplierId={supplier.id} products={products} drivers={drivers} blockedDates={blockedDates} onRefresh={onRefresh} />
      <ManageFleetModal isOpen={fleetOpen} onClose={() => setFleetOpen(false)} supplierId={supplier.id} drivers={drivers} onRefresh={onRefresh} />
    </div>
  );
}
