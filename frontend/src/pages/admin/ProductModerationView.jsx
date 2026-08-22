import React, { useState, useEffect } from "react";
import { authHeaders } from "../../lib/api.js";
import {
  Package,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Settings,
  Car,
  Compass,
  Calendar,
  Percent,
  Building2,
  SlidersHorizontal,
  Search,
  Sparkles,
  MapPin,
  Clock,
  ChevronRight,
  Save,
  Copy,
  Check
} from "lucide-react";

export default function ProductModerationView() {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectProduct, setInspectProduct] = useState(null);
  const [activeTab, setActiveTab] = useState("LISTINGS"); // 'LISTINGS' | 'COMMISSION'
  const [message, setMessage] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };
  const [confirmToggleId, setConfirmToggleId] = useState(null);

  const fetchModerationData = async () => {
    setLoading(true);
    try {
      const [prodRes, supRes, catRes] = await Promise.all([
        fetch(`/api/admin/products?status=${statusFilter}&type=${typeFilter}`, { headers: authHeaders() }),
        fetch("/api/admin/suppliers", { headers: authHeaders() }),
        fetch("/api/admin/categories/commission", { headers: authHeaders() })
      ]);

      const pData = await prodRes.json();
      const sData = await supRes.json();
      const cData = await catRes.json();

      if (pData.success) setProducts(pData.products);
      if (sData.success) setSuppliers(sData.suppliers);
      if (cData.success) setCategories(cData.categories);
    } catch (err) {
      console.error("Error fetching moderation data:", err);
      setMessage({ type: "error", text: "Failed to load moderation data. Please refresh." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModerationData();
  }, [statusFilter, typeFilter]);

  const handleTogglePublished = async (productId, currentPublish) => {
    setUpdatingId(productId);
    setConfirmToggleId(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/toggle-published`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ isPublished: !currentPublish })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, is_published: data.is_published, status: data.status }
              : p
          )
        );
      } else {
        throw new Error(data.error || "Failed to update publication status");
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update publication status" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateSupplierCommission = async (supplierId, rate) => {
    try {
      const res = await fetch(`/api/admin/suppliers/${supplierId}/commission`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ commissionRate: rate })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        fetchModerationData();
      } else {
        throw new Error(data.error || "Failed to update commission rate");
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update commission rate" });
    }
  };

  const handleUpdateCategoryCommission = async (categoryCode, rate) => {
    try {
      const res = await fetch("/api/admin/categories/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ categoryCode, defaultCommissionRate: rate })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message });
        fetchModerationData();
      } else {
        throw new Error(data.error || "Failed to update category commission");
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update category commission" });
    }
  };

  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.id?.toLowerCase().includes(term) ||
      p.supplier_id?.toLowerCase().includes(term) ||
      p.title?.toLowerCase().includes(term) ||
      p.city?.toLowerCase().includes(term) ||
      p.supplier_name?.toLowerCase().includes(term) ||
      p.product_type?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* View Title Header */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
              MODULE 2
            </span>
            <span className="text-stone-500 text-xs font-mono">/admin/products</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-3">
            <Package className="w-7 h-7 text-amber-600" />
            Listing Moderation & Commission Management
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Review transfer routes & tour itineraries submitted by suppliers. Moderate listing visibility with content approval toggles (`is_published`) and set custom platform commission overrides.
          </p>
        </div>

        {/* View Mode Selector Tabs */}
        <div className="flex items-center gap-2 bg-stone-50 p-1.5 rounded-2xl border border-stone-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("LISTINGS")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              activeTab === "LISTINGS"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Package className="w-4 h-4" /> Listings Queue
          </button>

          <button
            onClick={() => setActiveTab("COMMISSION")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              activeTab === "COMMISSION"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" /> Commission Overrides
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between shadow-sm ${
          message.type === "error"
            ? "bg-rose-50 border-rose-300 text-rose-900"
            : "bg-emerald-50 border-emerald-300 text-emerald-900"
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline hover:text-stone-900">Dismiss</button>
        </div>
      )}

      {/* TAB 1: LISTINGS MODERATION QUEUE */}
      {activeTab === "LISTINGS" && (
        <>
          {/* Controls Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-mono text-stone-500 mr-1">Product Type:</span>
              {["ALL", "TRANSFER", "DAY_TOUR", "MULTI_DAY_PACKAGE"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    typeFilter === t
                      ? "bg-amber-500 text-stone-950 shadow-sm"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search product code, listing title, supplier code, city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 uppercase tracking-wider">
                    <th className="py-4 px-6">Product & Type</th>
                    <th className="py-4 px-4">Supplier</th>
                    <th className="py-4 px-4">Price & Commission</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Marketplace Visibility</th>
                    <th className="py-4 px-6 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-500">
                        Loading product listings queue...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-500">
                        No product listings found.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.hero_image || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=400&q=80"}
                              alt={p.title}
                              className="w-12 h-12 rounded-xl object-cover border border-stone-200"
                            />
                            <div>
                              <div className="font-bold text-sm text-stone-900 font-sans line-clamp-1">{p.title}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleCopyId(p.id); }}
                                  className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                                  title="Click to copy Product ID"
                                >
                                  {copiedId === p.id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                                  <span>ID: {p.id}</span>
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-500">
                                <span className="bg-stone-100 px-2 py-0.5 rounded text-amber-800 font-bold border border-stone-200">{p.product_type}</span>
                                {p.product_type !== "TRANSFER" && (
                                  <span className={`px-2 py-0.5 rounded font-bold ${p.group_type === "SHARED" ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                                    {p.group_type === "SHARED" ? "👥 SHARED" : "🚗 PRIVATE"}
                                  </span>
                                )}
                                <span>{p.city}, {p.state}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-bold text-stone-900 font-sans">{p.supplier_name || "Idea Holiday Partner"}</div>
                          {p.supplier_id && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleCopyId(p.supplier_id); }}
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-stone-500 hover:text-amber-800 mt-0.5"
                              title="Click to copy Supplier ID"
                            >
                              {copiedId === p.supplier_id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                              <span>{p.supplier_id}</span>
                            </button>
                          )}
                          <div className="text-[10px] text-stone-400 mt-0.5">Rate: {p.supplier_commission || 15}%</div>
                        </td>

                        <td className="py-4 px-4 font-mono">
                          <div className="text-emerald-700 font-bold text-sm">₹{(p.price_inr || 1200).toLocaleString()}</div>
                          <div className="text-[10px] text-stone-500">
                            Split: ₹{Math.round((p.price_inr || 1200) * ((p.supplier_commission || 15) / 100))} Comm.
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                            p.status === "PUBLISHED"
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : p.status === "PENDING_REVIEW"
                              ? "bg-amber-100 text-amber-900 border-amber-300 animate-pulse"
                              : "bg-stone-100 text-stone-600 border-stone-300"
                          }`}>
                            {p.status}
                          </span>
                        </td>

                        <td className="py-4 px-4">
                          {confirmToggleId === p.id ? (
                            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-50 border border-amber-400">
                              <span className="text-[10px] text-amber-900 font-sans px-1 font-bold">
                                {p.is_published ? "Hide?" : "Publish?"}
                              </span>
                              <button
                                disabled={updatingId === p.id}
                                onClick={() => handleTogglePublished(p.id, p.is_published)}
                                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-[10px] font-bold shadow-sm"
                              >
                                {updatingId === p.id ? "…" : "Yes"}
                              </button>
                              <button
                                onClick={() => setConfirmToggleId(null)}
                                className="px-2 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-800 text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={updatingId === p.id}
                              onClick={() => setConfirmToggleId(p.id)}
                              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all border ${
                                p.is_published
                                  ? "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-rose-100 hover:text-rose-900 hover:border-rose-300"
                                  : "bg-stone-100 text-stone-600 border-stone-300 hover:bg-emerald-100 hover:text-emerald-900 hover:border-emerald-300"
                              }`}
                            >
                              {p.is_published ? (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-emerald-700" /> Published (Live)
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-stone-500" /> Hidden / Draft
                                </>
                              )}
                            </button>
                          )}
                        </td>

                        <td className="py-4 px-6 text-right">
                          <button
                            onClick={() => setInspectProduct(p)}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          >
                            Inspect Route/Itinerary
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: PLATFORM COMMISSION OVERRIDES */}
      {activeTab === "COMMISSION" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Global Category Commissions Panel */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="border-b border-stone-200 pb-3">
              <h2 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-600" /> Category Level Platform Commission Defaults
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Set default platform take-rate percentage per product category (Transfers, Sightseeing, Multi-day packages).
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {categories.map((c) => (
                <div key={c.category_code} className="bg-[#FAF9F6] border border-stone-200 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-stone-900 font-bold font-sans text-sm block">{c.category_name || c.category_code}</span>
                    <span className="text-stone-500 text-[10px]">Category Code: {c.category_code}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      defaultValue={c.default_commission_rate || 15}
                      onBlur={(e) => handleUpdateCategoryCommission(c.category_code, e.target.value)}
                      className="w-20 bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-center text-amber-700 font-bold focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-stone-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplier Vendor Override Controls */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="border-b border-stone-200 pb-3">
              <h2 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-600" /> Vendor-Specific Commission Overrides
              </h2>
              <p className="text-xs text-stone-600 mt-0.5">
                Override platform commission for high-volume vendors (e.g. reduce from 15% default to 10% incentive rate).
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs max-h-96 overflow-y-auto pr-2">
              {suppliers.map((s) => (
                <div key={s.id} className="bg-[#FAF9F6] border border-stone-200 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-stone-900 font-bold font-sans text-sm block">{s.company_name}</span>
                    <span className="text-stone-500 text-[10px]">{s.city}, {s.state} &bull; Contact: {s.contact_name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      defaultValue={s.commission_rate || 15.0}
                      onBlur={(e) => handleUpdateSupplierCommission(s.id, e.target.value)}
                      className="w-20 bg-white border border-stone-300 rounded-xl px-2.5 py-1.5 text-center text-emerald-700 font-bold focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-stone-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT INSPECTION MODAL */}
      {inspectProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded uppercase font-bold">
                    {inspectProduct.product_type} INSPECTION
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyId(inspectProduct.id)}
                    className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                    title="Click to copy Product ID"
                  >
                    {copiedId === inspectProduct.id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                    <span>Product ID: {inspectProduct.id}</span>
                  </button>
                  {inspectProduct.supplier_id && (
                    <button
                      type="button"
                      onClick={() => handleCopyId(inspectProduct.supplier_id)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                      title="Click to copy Supplier ID"
                    >
                      {copiedId === inspectProduct.supplier_id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                      <span>Supplier ID: {inspectProduct.supplier_id}</span>
                    </button>
                  )}
                </div>
                <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">
                  {inspectProduct.title}
                </h3>
              </div>
              <button
                onClick={() => setInspectProduct(null)}
                className="px-3 py-1 bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>

            {/* Transfer Metadata */}
            {inspectProduct.product_type === "TRANSFER" && inspectProduct.routeDetail && (
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-4 space-y-3 font-mono text-xs">
                <h4 className="text-amber-700 font-bold flex items-center gap-2">
                  <Car className="w-4 h-4" /> Transfer Route & Coverage Metadata
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-stone-500 block">Origin Hub</span>
                    <span className="text-stone-900 font-bold">{inspectProduct.routeDetail.origin_name}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Destination Coverage Zone</span>
                    <span className="text-stone-900 font-bold">{inspectProduct.routeDetail.zone_name || inspectProduct.routeDetail.dest_name}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Service Direction & Type</span>
                    <span className="text-stone-900 font-bold">
                      {inspectProduct.routeDetail.service_direction || "ARRIVAL"} &bull; {inspectProduct.routeDetail.route_type || "AIRPORT_TRANSFER"}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Distance & Waiting Time</span>
                    <span className="text-stone-900 font-bold">
                      {inspectProduct.routeDetail.distance_km} KM &bull; {inspectProduct.routeDetail.free_waiting_mins || 60} mins free wait
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Package Itinerary Metadata */}
            {inspectProduct.product_type === "MULTI_DAY_PACKAGE" && inspectProduct.packageDetail && (
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-4 space-y-3 font-mono text-xs">
                <h4 className="text-stone-900 font-bold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-600" /> Package Itinerary ({inspectProduct.packageDetail.total_days} Days / {inspectProduct.packageDetail.total_nights} Nights)
                </h4>
                <div>
                  <span className="text-stone-500 block">Start - End City</span>
                  <span className="text-stone-900 font-bold">{inspectProduct.packageDetail.start_city} &rarr; {inspectProduct.packageDetail.end_city}</span>
                </div>
              </div>
            )}

            {/* Inclusions & Exclusions */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-[#FAF9F6] border border-stone-200 p-3 rounded-2xl">
                <span className="text-emerald-700 font-bold block mb-1">Inclusions</span>
                <p className="text-stone-700">{inspectProduct.inclusions || "AC Vehicle, Chauffeur, Tolls"}</p>
              </div>
              <div className="bg-[#FAF9F6] border border-stone-200 p-3 rounded-2xl">
                <span className="text-rose-700 font-bold block mb-1">Exclusions</span>
                <p className="text-stone-700">{inspectProduct.exclusions || "Personal expenses, Tips"}</p>
              </div>
            </div>

            {/* Toggle Content Approval Button inside Modal */}
            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={() => {
                  handleTogglePublished(inspectProduct.id, inspectProduct.is_published);
                  setInspectProduct(null);
                }}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs ${
                  inspectProduct.is_published
                    ? "bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm"
                }`}
              >
                {inspectProduct.is_published ? "Unpublish Listing" : "Approve & Publish Listing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
