import React, { useMemo, useState } from "react";
import { authHeaders } from "../../lib/api.js";
import {
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  RefreshCw,
  Users,
  Car,
  Search,
  Tag,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Zap,
  Edit3,
  Copy,
  Check
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";

const money = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const transferLabels = {
  AIRPORT_TRANSFER: "AIRPORT TRANSFER",
  RAILWAY_TRANSFER: "RAILWAY TRANSFER",
  INTERCITY_TRANSFER: "INTERCITY TRANSFER",
  HOTEL_TRANSFER: "HOTEL TRANSFER",
};

function isLive(product) {
  return product.status === "PUBLISHED" && product.is_published !== 0 && product.is_published !== false;
}

export default function SupplierListingsPanel({ products = [], supplierId, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, LIVE, DRAFT
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL, TRANSFER, TOUR
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Quick Price Edit Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [newPrice, setNewPrice] = useState("");
  const [newStrikePrice, setNewStrikePrice] = useState("");
  const [isSavingPrice, setIsSavingPrice] = useState(false);
  const [copiedId, setCopiedId] = useState("");

  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const counts = useMemo(() => ({
    ALL: products.length,
    LIVE: products.filter(isLive).length,
    DRAFT: products.filter((product) => !isLive(product)).length,
    TRANSFER: products.filter((p) => p.product_type === "TRANSFER").length,
    TOUR: products.filter((p) => p.product_type !== "TRANSFER").length,
  }), [products]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      // Status filter
      if (statusFilter === "LIVE" && !isLive(product)) return false;
      if (statusFilter === "DRAFT" && isLive(product)) return false;

      // Type filter
      if (typeFilter === "TRANSFER" && product.product_type !== "TRANSFER") return false;
      if (typeFilter === "TOUR" && product.product_type === "TRANSFER") return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = product.id?.toLowerCase().includes(q);
        const matchesSupplier = product.supplier_id?.toLowerCase().includes(q);
        const matchesTitle = product.title?.toLowerCase().includes(q);
        const matchesCity = product.city?.toLowerCase().includes(q);
        const matchesOrigin = product.origin_name?.toLowerCase().includes(q);
        const matchesDest = product.dest_name?.toLowerCase().includes(q);
        const matchesCategory = product.category?.toLowerCase().includes(q);
        return matchesId || matchesSupplier || matchesTitle || matchesCity || matchesOrigin || matchesDest || matchesCategory;
      }

      return true;
    });
  }, [products, statusFilter, typeFilter, searchQuery]);

  const updatePublication = async (product) => {
    setUpdatingId(product.id);
    setError("");
    setSuccessMsg("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/products/${product.id}/publication`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ isPublished: !isLive(product) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Publication update failed");
      setSuccessMsg(`Listing "${product.title}" is now ${!isLive(product) ? "Live & Bookable" : "Unpublished / Draft"}.`);
      setTimeout(() => setSuccessMsg(""), 3500);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || "Could not update this listing. Please try again.");
    } finally {
      setUpdatingId("");
    }
  };

  const handleOpenPriceModal = (product) => {
    setEditingProduct(product);
    setNewPrice(String(product.price_inr || ""));
    setNewStrikePrice(product.strike_price_inr ? String(product.strike_price_inr) : "");
    setError("");
  };

  const handleSavePrice = async (e) => {
    e.preventDefault();
    if (!editingProduct || !newPrice) return;
    setIsSavingPrice(true);
    setError("");
    try {
      const res = await api.updateSupplierProductPrice(supplierId, editingProduct.id, {
        priceInr: Number(newPrice),
        strikePriceInr: newStrikePrice ? Number(newStrikePrice) : null,
      });
      setSuccessMsg(res.message || "Price updated successfully!");
      setTimeout(() => setSuccessMsg(""), 3500);
      setEditingProduct(null);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || "Failed to update price");
    } finally {
      setIsSavingPrice(false);
    }
  };

  return (
    <section id="supplier-listings" className="scroll-mt-28 rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-800">Inventory & Listings</span>
          <h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Manage products & pricing</h2>
          <p className="mt-1 text-xs text-stone-500">Live listings, instant publishing, instant booking controls and quick pricing updates.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/supplier/transfers/create"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 px-3.5 py-2.5 text-xs font-bold text-stone-800 shadow-sm"
          >
            <Car className="h-4 w-4 text-amber-600" /> + Add Transfer
          </Link>
          <Link
            to="/supplier/tours/create"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-stone-950 shadow-sm"
          >
            <Plus className="h-4 w-4" /> + Add Day Tour / Activity
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-y border-stone-100 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="flex rounded-xl bg-[#FAF9F6] border border-stone-200 p-1">
            {[
              ["ALL", `All (${counts.ALL})`],
              ["LIVE", `Live (${counts.LIVE})`],
              ["DRAFT", `Draft (${counts.DRAFT})`],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  statusFilter === val ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex rounded-xl bg-[#FAF9F6] border border-stone-200 p-1">
            {[
              ["ALL", "All types"],
              ["TRANSFER", `Transfers (${counts.TRANSFER})`],
              ["TOUR", `Tours (${counts.TOUR})`],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTypeFilter(val)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  typeFilter === val ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, city, route…"
            className="w-full rounded-xl border border-stone-200 bg-[#FAF9F6] py-1.5 pl-9 pr-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" /> {error}
        </div>
      )}
      {successMsg && (
        <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {successMsg}
        </div>
      )}

      {/* Product List */}
      <div className="mt-4 space-y-3">
        {visibleProducts.map((product) => {
          const live = isLive(product);
          const isTransfer = product.product_type === "TRANSFER";
          const shared = !isTransfer && product.group_type === "SHARED";
          const hasDiscount = product.strike_price_inr && Number(product.strike_price_inr) > Number(product.price_inr);

          return (
            <article
              key={product.id}
              className={`grid gap-4 rounded-2xl border p-4 transition sm:grid-cols-[72px_1fr_auto] sm:items-center ${
                live ? "border-stone-200 bg-[#FAF9F6] hover:border-amber-300" : "border-stone-200/80 bg-stone-50/60 opacity-80"
              }`}
            >
              <div className="relative h-18 w-18 overflow-hidden rounded-xl bg-stone-100 border border-stone-200 shrink-0">
                <img
                  src={product.hero_image || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400&q=80"}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {product.is_instant_booking !== 0 && (
                  <span className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-stone-950 shadow-sm" title="Instant Confirmation Enabled">
                    <Zap className="h-2.5 w-2.5 fill-stone-950" />
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm font-bold text-stone-900">{product.title}</strong>
                  <button
                    type="button"
                    onClick={() => handleCopyId(product.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-700 border border-stone-300 hover:bg-amber-100 hover:text-amber-900 transition"
                    title="Click to copy Product ID"
                  >
                    {copiedId === product.id ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5 text-stone-400" />}
                    ID: {product.id}
                  </button>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      live ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {live ? "LIVE" : "DRAFT"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      shared ? "bg-stone-100 text-stone-800 border border-stone-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}
                  >
                    {shared ? <Users className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                    {isTransfer
                      ? transferLabels[product.route_type] || "PRIVATE TRANSFER"
                      : shared
                      ? "SHARED · PER SEAT"
                      : "PRIVATE TOUR"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-stone-500">
                  <span className="font-medium text-stone-700">{product.city || "India"}</span>
                  {product.supplier_id && (
                    <button
                      type="button"
                      onClick={() => handleCopyId(product.supplier_id)}
                      className="font-mono text-[10px] text-stone-500 hover:text-amber-800"
                      title="Click to copy Supplier ID"
                    >
                      Supplier: <span className="underline">{product.supplier_id}</span>
                    </button>
                  )}
                  {isTransfer && product.origin_name && (
                    <span className="font-mono text-stone-600">
                      {product.origin_name} → {product.dest_name}
                    </span>
                  )}
                  {product.duration_hours && (
                    <span className="inline-flex items-center gap-1 text-stone-500">
                      <Clock className="h-3 w-3" /> {product.duration_hours} hrs
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <span className="font-black text-amber-900 font-mono text-sm">
                      {money(product.price_inr)}
                    </span>
                    {hasDiscount && (
                      <span className="text-[10px] text-stone-400 line-through font-mono">
                        {money(product.strike_price_inr)}
                      </span>
                    )}
                    <span className="text-[10px] text-stone-500">{shared ? "/ seat" : "/ vehicle"}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => handleOpenPriceModal(product)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-[11px] font-bold text-stone-700 hover:bg-stone-100 shadow-sm transition"
                  title="Update pricing"
                >
                  <Edit3 className="h-3.5 w-3.5 text-amber-700" /> Price
                </button>

                {live && (
                  <Link
                    to={`/activity/${product.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="View live on marketplace"
                    className="rounded-xl border border-stone-300 bg-white p-2 text-stone-500 hover:text-stone-900 shadow-sm transition"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}

                <button
                  type="button"
                  disabled={updatingId === product.id}
                  onClick={() => updatePublication(product)}
                  className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold disabled:opacity-50 transition shadow-sm ${
                    live
                      ? "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  }`}
                >
                  {updatingId === product.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : live ? (
                    <EyeOff className="h-3.5 w-3.5 text-stone-500" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-white" />
                  )}
                  {live ? "Unpublish" : "Publish Live"}
                </button>
              </div>
            </article>
          );
        })}

        {!visibleProducts.length && (
          <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center">
            <Tag className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-bold text-stone-900">No listings match this filter</p>
            <p className="mt-1 text-xs text-stone-500">Try changing your search keywords, category or publish status filter.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("ALL"); setSearchQuery(""); }}
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 shadow-sm"
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Price Update Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Quick Pricing Update</span>
                <h3 className="text-base font-bold text-stone-900 truncate max-w-xs">{editingProduct.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePrice} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700">Net Selling Price (INR) *</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-stone-400">₹</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="e.g. 2499"
                    className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] py-2.5 pl-8 pr-3 text-sm font-mono font-bold text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[10px] text-stone-500">The amount travelers will pay for this booking.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">Original / Strike Price (INR) (Optional)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-stone-400">₹</span>
                  <input
                    type="number"
                    min="1"
                    value={newStrikePrice}
                    onChange={(e) => setNewStrikePrice(e.target.value)}
                    placeholder="e.g. 2999"
                    className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] py-2.5 pl-8 pr-3 text-sm font-mono font-bold text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-[10px] text-stone-500">Shows crossed-out original price with discount badge.</p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPrice || !newPrice}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2 text-xs font-bold text-stone-950 shadow-sm disabled:opacity-50"
                >
                  {isSavingPrice ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
