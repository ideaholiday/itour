import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleDollarSign, ClipboardCheck, MapPinned, PackageCheck, RefreshCw, Users, AlertTriangle, Activity, Star } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function AdminOverviewView() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/metrics", { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Platform metrics could not be loaded");
      setMetrics(data.metrics || null);
      setError("");
    } catch (err) {
      setError(err.message || "Platform metrics could not be loaded");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const cards = [
    [CircleDollarSign, "Gross booking value", `₹${Number(metrics?.grossRevenue || 0).toLocaleString("en-IN")}`, "text-emerald-700"],
    [Users, "Approved network", `${metrics?.approvedSuppliers ?? "…"} suppliers`, "text-amber-800"],
    [PackageCheck, "Marketplace inventory", `${metrics?.totalProducts || 0} products`, "text-amber-600"],
    [Star, "Quality rating", `${metrics?.avgRating || "4.9"} avg rating`, "text-amber-600"]
  ];

  // Derive platform health dynamically from real metrics
  const healthItems = metrics ? [
    {
      label: "Supplier KYB queue",
      ok: (metrics.pendingKyb || 0) === 0,
      note: (metrics.pendingKyb || 0) > 0
        ? `${metrics.pendingKyb} supplier${metrics.pendingKyb === 1 ? "" : "s"} awaiting verification`
        : "No supplier verifications pending"
    },
    {
      label: "Supplier dispatch",
      ok: (metrics.assignmentManualReview || 0) === 0,
      note: (metrics.assignmentManualReview || 0) > 0
        ? `${metrics.assignmentManualReview} assignment(s) need manual review`
        : `${metrics.autoAssignedBookings} auto-assigned`
    },
    {
      label: "Quality & reviews",
      ok: (metrics.pendingReviews || 0) === 0,
      note: (metrics.pendingReviews || 0) > 0
        ? `${metrics.pendingReviews} review(s) awaiting moderation`
        : "All verified traveler reviews published"
    },
    {
      label: "Listing moderation",
      ok: (metrics.pendingProducts || 0) === 0,
      note: (metrics.pendingProducts || 0) > 0
        ? `${metrics.pendingProducts} listing${metrics.pendingProducts === 1 ? "" : "s"} awaiting review`
        : "No listings awaiting moderation"
    }
  ] : [];

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 sm:flex sm:items-end sm:justify-between shadow-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-700">Executive command center</span>
          <h1 className="mt-2 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">{timeGreeting()}. Here's what needs attention.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">Approve quality supply, protect traveler experience and keep every high-demand destination covered.</p>
        </div>
        <button onClick={load} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 sm:mt-0">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />{error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([Icon, label, value, color]) => (
          <article key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <Icon className={`h-5 w-5 ${color}`} />
            <span className="mt-5 block text-2xl font-bold text-stone-900">{loading ? "…" : value}</span>
            <span className="mt-1 block text-xs text-stone-500">{label}</span>
          </article>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-stone-900">Priority queue</h2>
              <p className="text-xs text-stone-500">Tasks with direct marketplace impact</p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-amber-600" />
          </div>
          <div className="space-y-3">
            {[
              ["Supplier KYB reviews", metrics?.pendingKyb || 0, "/admin/suppliers", "text-amber-700", true],
              ["Listings awaiting moderation", metrics?.pendingProducts || 0, "/admin/products", "text-amber-800", true],
              ["Scheduled supplier payouts", null, "/admin/finance", "text-emerald-700", false],
              ["Quality & traveler reviews", metrics?.pendingReviews || 0, "/admin/quality", "text-amber-600", true],
              ["Supplier booking responses", null, "/ops", (metrics?.assignmentManualReview ? "text-rose-600" : "text-amber-700"), false]
            ].map(([title, count, path, color, showBadge]) => {
              const badgeCount = showBadge ? (loading ? "…" : count) : null;
              const valueLabel = title === "Scheduled supplier payouts"
                ? `₹${Number(metrics?.pendingPayouts || 0).toLocaleString("en-IN")}`
                : title === "Quality & traveler reviews"
                ? `${metrics?.pendingReviews || 0} reviews awaiting moderation`
                : title === "Supplier booking responses"
                ? `${metrics?.supplierResponsesPending || 0} awaiting · ${metrics?.assignmentManualReview || 0} manual`
                : `${count || 0} waiting`;
              return (
                <Link key={title} to={path} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 transition hover:bg-stone-50 hover:border-amber-400">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      {title}
                      {showBadge && count > 0 && !loading && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-900 border border-amber-300 animate-pulse">
                          <AlertTriangle className="h-2.5 w-2.5 text-amber-700" />{count}
                        </span>
                      )}
                    </h3>
                    <span className={`mt-1 block text-xs ${color}`}>{loading ? "…" : valueLabel}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-400" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Activity className="h-7 w-7 text-emerald-600" />
            <div>
              <h2 className="font-serif text-xl font-bold text-stone-900">Platform health</h2>
              <p className="text-xs text-stone-500">Live operational status</p>
            </div>
          </div>
          <div className="mt-6 space-y-3 text-xs">
            {loading ? (
              ["Supplier KYB queue", "Supplier dispatch", "Quality & reviews", "Listing moderation"].map((item) => (
                <div key={item} className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <span className="text-stone-500">{item}</span>
                  <span className="text-stone-400">Loading…</span>
                </div>
              ))
            ) : (
              healthItems.map((item) => (
                <div key={item.label} className="border-b border-stone-100 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">{item.label}</span>
                    <span className={`inline-flex items-center gap-2 font-bold ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>
                      {item.ok
                        ? <><span className="h-2 w-2 rounded-full bg-emerald-500" />Operational</>
                        : <><AlertTriangle className="h-3.5 w-3.5" />Attention</>
                      }
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">{item.note}</p>
                </div>
              ))
            )}
          </div>
          {!loading && metrics && (
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-stone-200 pt-4 text-center text-xs">
              <div><span className="block text-lg font-bold text-emerald-700">{metrics.approvedSuppliers ?? 0}</span><span className="text-stone-500">Approved</span></div>
              <div><span className={`block text-lg font-bold ${(metrics.pendingKyb || 0) > 0 ? "text-amber-700 animate-pulse" : "text-stone-700"}`}>{metrics.pendingKyb ?? 0}</span><span className="text-stone-500">Pending KYB</span></div>
              <div><span className={`block text-lg font-bold ${(metrics.suspendedSuppliers || 0) > 0 ? "text-rose-700" : "text-stone-700"}`}>{metrics.suspendedSuppliers ?? 0}</span><span className="text-stone-500">Suspended</span></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
