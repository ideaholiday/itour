import React, { useState, useEffect } from "react";
import SupplierHeaderNav from "../components/supplier/SupplierHeaderNav.jsx";
import SupplierDashboardOverview from "../components/supplier/SupplierDashboardOverview.jsx";
import { Activity, AlertTriangle, MapPinned, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { authHeaders } from "../lib/api.js";

export default function SupplierDashboardPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const panel = searchParams.get("panel");

  // Resolve supplier ID strictly — no hardcoded fallback
  const supplierId = user?.user_metadata?.supplier_id || user?.supplier_id;

  const [supplierData, setSupplierData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSupplierData = async () => {
    if (!supplierId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupplierData(data);
        setError("");
      } else {
        throw new Error(data.error || "Supplier data unavailable");
      }
    } catch (err) {
      console.error("Failed to fetch supplier data", err);
      setError("We could not refresh live supplier data. Existing dashboard tools remain available.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, [supplierId]);

  // --- No supplier account linked to this user ---
  if (!loading && !supplierId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-8 text-stone-900">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-14 w-14 text-amber-600" />
          <h1 className="mt-6 font-serif text-2xl font-bold">Supplier account not linked</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Your user account doesn't have a supplier profile attached. Please complete the supplier sign-up or contact Idea Holiday support.
          </p>
          <Link
            to="/supplier/signup"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 shadow-sm"
          >
            Complete supplier sign-up
          </Link>
        </div>
      </div>
    );
  }

  const kybStatus = supplierData?.supplier?.kyb_status;
  // Show KYB banner only when not APPROVED and not already on the compliance panel (redundant there)
  const showKybBanner = !loading && supplierData && kybStatus !== "APPROVED" && panel !== "compliance";

  return (
    <div className="dashboard-grid min-h-screen bg-[#FAF9F6] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <SupplierHeaderNav
          supplierData={supplierData}
          activeTab={panel === "fleet" ? "FLEET" : panel === "compliance" ? "KYB" : panel === "listings" ? "BUILDER" : "DASHBOARD"}
        />

        {/* KYB Status Banner — hidden on compliance tab (already shown there) */}
        {showKybBanner && (
          <div className={`flex items-start gap-4 rounded-2xl border p-5 ${
            kybStatus === "SUSPENDED"
              ? "border-rose-300 bg-rose-50"
              : kybStatus === "REJECTED"
              ? "border-rose-300 bg-rose-50"
              : "border-amber-300 bg-amber-50"
          }`}>
            <div className={`mt-0.5 shrink-0 rounded-xl p-2 ${
              kybStatus === "SUSPENDED" || kybStatus === "REJECTED"
                ? "bg-rose-100 text-rose-700"
                : "bg-amber-100 text-amber-800"
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-bold text-sm ${
                kybStatus === "SUSPENDED" || kybStatus === "REJECTED" ? "text-rose-900" : "text-amber-900"
              }`}>
                {kybStatus === "SUSPENDED"
                  ? "Your account has been suspended"
                  : kybStatus === "REJECTED"
                  ? "Your verification was not approved"
                  : "Your account is pending verification"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                {kybStatus === "SUSPENDED"
                  ? "Your account is currently suspended and you cannot receive new bookings. Please contact our support team to understand the next steps."
                  : kybStatus === "REJECTED"
                  ? "Your KYB documents were reviewed and could not be approved. Please re-submit valid documents or contact support for assistance."
                  : "Our team is reviewing your business documents. You will receive an email once approved. Until then, your listings are not visible to travellers and you cannot receive bookings."}
              </p>
              {(kybStatus === "PENDING" || kybStatus === "REJECTED") && (
                <a href="?panel=compliance" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-200 border border-amber-300">
                  View your documents →
                </a>
              )}
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
              kybStatus === "SUSPENDED" || kybStatus === "REJECTED"
                ? "border-rose-300 bg-rose-100 text-rose-800"
                : "border-amber-300 bg-amber-100 text-amber-900 animate-pulse"
            }`}>
              {kybStatus || "PENDING"}
            </span>
          </div>
        )}

        <section className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:flex sm:items-end sm:justify-between sm:p-7">
          <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full border-[36px] border-amber-100/50" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-700">Partner command center</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase text-emerald-800">
                <Activity className="h-3 w-3" /> Live operations
              </span>
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold text-stone-900 sm:text-4xl">Run today's trips. Grow tomorrow's reach.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">Bookings, fleet readiness, inventory listings and payouts in one focused operating view.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 sm:mt-0">
            <button onClick={fetchSupplierData} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />Refresh
            </button>
            <Link to="/supplier/bookings" className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3.5 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-200 border border-amber-300">
              Manage bookings
            </Link>
            <Link to="/supplier/products/create" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-stone-950 hover:bg-amber-400 shadow-sm">
              <Plus className="h-4 w-4" />New listing
            </Link>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />{error}
          </div>
        )}

        <SupplierDashboardOverview
          supplierData={supplierData}
          loading={loading}
          onRefresh={fetchSupplierData}
          initialPanel={panel}
        />
      </div>
    </div>
  );
}
