import React, { useState, useEffect } from "react";
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  CreditCard,
  Building2,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Send,
  X,
  Sparkles,
  ChevronRight,
  Eye,
  Clock,
  Copy,
  Check
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

export default function SupplierApprovalView() {
  const [suppliers, setSuppliers] = useState([]);
  const [statusCounts, setStatusCounts] = useState({ ALL: 0, PENDING: 0, APPROVED: 0, SUSPENDED: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [message, setMessage] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/suppliers?status=${statusFilter}`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Supplier list could not be loaded");
      setSuppliers(data.suppliers);
      setStatusCounts((current) => ({ ...current, ...(data.statusCounts || {}) }));
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      setMessage({ type: "error", text: err.message || "Supplier list could not be loaded" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [statusFilter]);

  const handleOpenDrawer = (supplier) => {
    setSelectedSupplier(supplier);
    setRejectionReason("");
    setSuspendReason("");
    setRejectModalOpen(false);
    setSuspendModalOpen(false);
    setDrawerOpen(true);
  };

  const handleVerifyAction = async (action, reason = "") => {
    if (!selectedSupplier) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/suppliers/${selectedSupplier.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action, // 'APPROVED' | 'REJECTED' | 'SUSPENDED'
          reason,
          commissionRate: selectedSupplier.commission_rate ?? 15.0
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Supplier status could not be updated");

      setMessage({
        type: data.notificationWarning ? "warning" : action === "APPROVED" ? "success" : "warning",
        text: data.message
      });
      setDrawerOpen(false);
      setRejectModalOpen(false);
      setSuspendModalOpen(false);
      setRejectionReason("");
      setSuspendReason("");
      await fetchSuppliers();
    } catch (err) {
      console.error("Verification Error:", err);
      setMessage({ type: "error", text: err.message || "Network error occurred during verification" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunAutoVerify = async () => {
    if (!selectedSupplier) return;
    setAutoVerifying(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/suppliers/${selectedSupplier.id}/kyb/auto-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Cashfree SecureID check failed");

      setMessage({ type: "success", text: "Cashfree SecureID KYB Verification audit completed." });
      if (data.supplier) {
        setSelectedSupplier((prev) => ({
          ...prev,
          ...data.supplier,
          secureIdVerifications: data.verifications || prev?.secureIdVerifications || [],
        }));
      }
      await fetchSuppliers();
    } catch (err) {
      console.error("Cashfree KYB Error:", err);
      setMessage({ type: "error", text: err.message || "Failed to execute Cashfree SecureID check" });
    } finally {
      setAutoVerifying(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      s.id?.toLowerCase().includes(term) ||
      s.company_name?.toLowerCase().includes(term) ||
      s.contact_name?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.city?.toLowerCase().includes(term) ||
      s.gstin?.toLowerCase().includes(term) ||
      s.pan_number?.toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (status, isVerified) => {
    if (status === "SUSPENDED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/30">
          <AlertTriangle className="w-3.5 h-3.5" /> Suspended
        </span>
      );
    }
    if (status === "APPROVED" || isVerified) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" /> Approved / Verified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
        <Clock className="w-3.5 h-3.5" /> Pending Verification
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* View Title Header */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
              MODULE 1
            </span>
            <span className="text-stone-500 text-xs font-mono">/admin/suppliers</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 flex items-center gap-3">
            <Users className="w-7 h-7 text-amber-600" />
            Supplier Approval & KYB Verification System
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Inspect supplier registration dossiers, review commercial transport licenses, GSTIN, PAN and bank credentials, and notify partners through Amazon SES and WhatsApp Cloud API.
          </p>
        </div>
      </div>

      {message && (
        <div role="status" aria-live="polite" className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-4 shadow-sm ${
          message.type === "success"
            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
            : message.type === "error"
              ? "bg-rose-50 text-rose-900 border-rose-300"
              : "bg-amber-50 text-amber-900 border-amber-300"
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline hover:text-stone-900">Dismiss</button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: "ALL", label: "All Suppliers" },
            { id: "PENDING", label: "Pending KYB" },
            { id: "APPROVED", label: "Approved" },
            { id: "SUSPENDED", label: "Suspended" }
          ].map((tab) => {
            const tabCount = statusCounts[tab.id] || 0;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                  statusFilter === tab.id
                    ? "bg-amber-500 text-stone-950 shadow-sm"
                    : "bg-stone-50 text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200"
                }`}
              >
                {tab.label}
                {!loading && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                    statusFilter === tab.id ? "bg-stone-950/20 text-stone-950" : tab.id === "PENDING" ? "bg-amber-100 text-amber-900 border border-amber-300" : tab.id === "SUSPENDED" ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-stone-200 text-stone-700"
                  }`}>{tabCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search supplier code, company, GSTIN, PAN, city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Supplier Table */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-500 uppercase tracking-wider">
                <th className="py-4 px-6">Company & Contact</th>
                <th className="py-4 px-4">Location</th>
                <th className="py-4 px-4">GSTIN & PAN</th>
                <th className="py-4 px-4">Commission</th>
                <th className="py-4 px-4">Products</th>
                <th className="py-4 px-4">KYB Status</th>
                <th className="py-4 px-6 text-right">Verification Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500">
                    Loading supplier KYB registry...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500">
                    No supplier registrations found matching current filter.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-stone-50 transition-colors cursor-pointer"
                    onClick={() => handleOpenDrawer(s)}
                  >
                    <td className="py-4 px-6">
                      <div className="font-bold text-sm text-stone-900 font-sans">{s.company_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleCopyId(s.id); }}
                          className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                          title="Click to copy Supplier ID"
                        >
                          {copiedId === s.id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                          <span>ID: {s.id}</span>
                        </button>
                      </div>
                      <div className="text-xs text-stone-500 flex items-center gap-2 mt-1">
                        <span>{s.contact_name}</span> &bull; <span>{s.phone}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-stone-700">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{s.city}, {s.state}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-stone-700">
                      <div>GST: <span className="text-amber-800 font-bold">{s.gstin || "N/A"}</span></div>
                      <div>PAN: <span className="text-stone-500">{s.pan_number || "N/A"}</span></div>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold text-amber-700">
                      {s.commission_rate || 15.0}%
                    </td>
                    <td className="py-4 px-4 font-mono text-stone-700">
                      <div className="font-bold text-emerald-700">{s.published_products || 0} live</div>
                      <div className="text-[10px] text-stone-500">{s.total_products || 0} total</div>
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(s.kyb_status, s.is_verified)}
                    </td>
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleOpenDrawer(s)}
                        className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Inspect Dossier</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VERIFICATION DRAWER (SLIDE-OVER PANEL) */}
      {drawerOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white border-l border-stone-200 h-full overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
                      VERIFICATION DOSSIER
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(selectedSupplier.id)}
                      className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                      title="Click to copy Supplier ID"
                    >
                      {copiedId === selectedSupplier.id ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 text-stone-400" />}
                      <span>ID: {selectedSupplier.id}</span>
                    </button>
                  </div>
                  <h2 className="text-xl font-serif font-bold text-stone-900 mt-1">
                    {selectedSupplier.company_name}
                  </h2>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 border border-stone-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Header Bar */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-500 block font-mono">Current Verification Status</span>
                  <div className="mt-1">
                    {getStatusBadge(selectedSupplier.kyb_status, selectedSupplier.is_verified)}
                  </div>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="text-stone-500 block">Platform Commission</span>
                  <span className="text-amber-700 font-bold text-base">{selectedSupplier.commission_rate || 15}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
                  <span className="block text-[10px] font-mono uppercase text-stone-500">Total listings</span>
                  <strong className="mt-1 block text-2xl text-stone-900">{selectedSupplier.total_products || 0}</strong>
                </div>
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
                  <span className="block text-[10px] font-mono uppercase text-emerald-800">Active listings</span>
                  <strong className="mt-1 block text-2xl text-emerald-700">{selectedSupplier.published_products || 0}</strong>
                </div>
              </div>

              {/* Company & Contact Details */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600" /> Company & Business Contact Profile
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-stone-500 block">Contact Person</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.contact_name}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Phone Number</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.phone}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Email Address</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.email}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block">Operational Base</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.city}, {selectedSupplier.state}</span>
                  </div>
                </div>
              </div>

              {/* Cashfree SecureID KYB Verification Suite Section */}
              <div className="bg-gradient-to-br from-amber-500/10 via-amber-50 to-emerald-500/10 border border-amber-300 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-700" />
                    <div>
                      <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">
                        Cashfree SecureID KYB Engine
                      </h3>
                      <span className="text-[10px] text-stone-500">Real-Time GSTIN, PAN & Bank Account Verification</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={autoVerifying}
                    onClick={handleRunAutoVerify}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition shadow-xs disabled:opacity-50"
                  >
                    {autoVerifying ? (
                      <>
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                        <span>Auditing…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Run SecureID Audit</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                  {/* GSTIN Badge */}
                  <div className="bg-white/90 border border-stone-200 p-2.5 rounded-xl">
                    <span className="text-[10px] text-stone-500 block">GSTIN STATUS</span>
                    <span className={`font-bold block mt-0.5 text-xs ${selectedSupplier.gstin_verified === 1 ? "text-emerald-700" : "text-amber-800"}`}>
                      {selectedSupplier.gstin_verified === 1 ? `Active (${selectedSupplier.gstin_verified_status || "Valid"})` : "Unverified"}
                    </span>
                    {selectedSupplier.gstin_verified_name && (
                      <span className="text-[9px] text-stone-600 block mt-0.5 truncate font-sans" title={selectedSupplier.gstin_verified_name}>
                        {selectedSupplier.gstin_verified_name}
                      </span>
                    )}
                  </div>

                  {/* PAN Badge */}
                  <div className="bg-white/90 border border-stone-200 p-2.5 rounded-xl">
                    <span className="text-[10px] text-stone-500 block">PAN STATUS</span>
                    <span className={`font-bold block mt-0.5 text-xs ${selectedSupplier.pan_verified === 1 ? "text-emerald-700" : "text-amber-800"}`}>
                      {selectedSupplier.pan_verified === 1 ? `Valid (${selectedSupplier.pan_type || "Company"})` : "Unverified"}
                    </span>
                    {selectedSupplier.pan_verified_name && (
                      <span className="text-[9px] text-stone-600 block mt-0.5 truncate font-sans" title={selectedSupplier.pan_verified_name}>
                        {selectedSupplier.pan_verified_name}
                      </span>
                    )}
                  </div>

                  {/* Bank Penny Drop Badge */}
                  <div className="bg-white/90 border border-stone-200 p-2.5 rounded-xl">
                    <span className="text-[10px] text-stone-500 block">BANK PENNY-DROP</span>
                    <span className={`font-bold block mt-0.5 text-xs ${selectedSupplier.bank_verified === 1 ? "text-emerald-700" : "text-amber-800"}`}>
                      {selectedSupplier.bank_verified === 1 ? `Match: ${selectedSupplier.bank_match_score || 100}%` : "Unverified"}
                    </span>
                    {selectedSupplier.bank_verified_name && (
                      <span className="text-[9px] text-stone-600 block mt-0.5 truncate font-sans" title={selectedSupplier.bank_verified_name}>
                        {selectedSupplier.bank_verified_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tax & Legal Documents (GSTIN, PAN) */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" /> Tax Identifiers & Registrations
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 text-[10px] block uppercase">GSTIN Number</span>
                    <span className="text-amber-800 font-bold text-sm block mt-0.5">{selectedSupplier.gstin || "09AAACA1234A1Z5"}</span>
                  </div>
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 text-[10px] block uppercase">PAN Number</span>
                    <span className="text-stone-900 font-bold text-sm block mt-0.5">{selectedSupplier.pan_number || "AAACA1234A"}</span>
                  </div>
                </div>
              </div>

              {/* Bank Account Details */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-600" /> Payout Bank Account Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 block">Account Number</span>
                    <span className="text-emerald-700 font-bold">{selectedSupplier.bankDetails?.account_number || "91827364512"}</span>
                  </div>
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 block">IFSC Code</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.bankDetails?.ifsc || "HDFC0000123"}</span>
                  </div>
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 block">Bank Name</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.bankDetails?.bank_name || "HDFC Bank"}</span>
                  </div>
                  <div className="bg-white border border-stone-200 p-3 rounded-xl">
                    <span className="text-stone-500 block">UPI ID</span>
                    <span className="text-stone-900 font-bold">{selectedSupplier.bankDetails?.upi_id || `${selectedSupplier.company_name?.toLowerCase().replace(/\s+/g, "")}@upi`}</span>
                  </div>
                </div>
              </div>

              {/* Commercial Transport License Attachment */}
              <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600" /> Commercial Transport License Attachment
                </h3>

                <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-stone-900 font-mono">
                      {selectedSupplier.attachments?.commercialLicense?.doc_number || "CTL-COMMERCIAL-PERMIT-2026"}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      Official Commercial Fleet Operator Permit & License
                    </div>
                  </div>
                  <button
                    onClick={() => setPreviewDoc(selectedSupplier.attachments?.commercialLicense?.doc_url || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80")}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Document
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons: One-Click Approve / Reject / Suspend */}
            <div className="pt-6 border-t border-stone-200 space-y-3">
              <div className="text-[10px] font-mono text-stone-500 text-center">
                Approving or rejecting updates <code className="text-amber-800 font-bold">supplier.is_verified</code> and records email and WhatsApp delivery results for this partner.
              </div>

              {!["APPROVED", "SUSPENDED"].includes(selectedSupplier.kyb_status) && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleVerifyAction("APPROVED", "Supplier approved by administrator.")}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 text-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {actionLoading ? "Saving KYB Decision…" : "Approve Supplier & Send Email"}
                  </button>

                  <button
                    disabled={actionLoading}
                    onClick={() => setRejectModalOpen(true)}
                    className="bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold py-3 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject with Reason
                  </button>
                </div>
              )}

              {/* Suspend — only shown when supplier is currently APPROVED */}
              {selectedSupplier.kyb_status === "APPROVED" && (
                <button
                  disabled={actionLoading}
                  onClick={() => setSuspendModalOpen(true)}
                  className="w-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold py-2.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Suspend Active Account
                </button>
              )}

              {selectedSupplier.kyb_status === "SUSPENDED" && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleVerifyAction("APPROVED", "Supplier account reactivated by administrator.")}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {actionLoading ? "Reactivating…" : "Reactivate Supplier & Notify"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON PROMPT MODAL */}
      {rejectModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" /> Reject Supplier Registration
            </h3>
            <p className="text-xs text-stone-600">
              Provide a specific reason for rejection. This text will be included in the automated email sent to <strong className="text-stone-900">{selectedSupplier.email}</strong>.
            </p>

            <textarea
              rows={4}
              placeholder="e.g., Commercial Transport License permit copy is unreadable or expired. Please upload valid GSTIN certificate."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-3 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={() => handleVerifyAction("REJECTED", rejectionReason)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 disabled:opacity-50 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Reject & Send Notification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUSPENSION REASON MODAL */}
      {suspendModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-amber-300 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Suspend Supplier Account
            </h3>
            <p className="text-xs leading-relaxed text-stone-600">
              Explain why <strong className="text-stone-900">{selectedSupplier.company_name}</strong> is being suspended. The reason will be included in the supplier notification.
            </p>
            <textarea
              autoFocus
              rows={4}
              placeholder="e.g., Commercial permit expired and must be renewed before new bookings can be accepted."
              value={suspendReason}
              onChange={(event) => setSuspendReason(event.target.value)}
              className="w-full bg-[#FAF9F6] border border-stone-300 rounded-xl p-3 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:bg-white"
            />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => { setSuspendModalOpen(false); setSuspendReason(""); }}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || suspendReason.trim().length < 5}
                onClick={() => handleVerifyAction("SUSPENDED", suspendReason.trim())}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs flex items-center gap-2 disabled:opacity-50 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Suspend & Notify
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT ATTACHMENT PREVIEW MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-3xl w-full bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setPreviewDoc(null)}
              className="absolute top-4 right-4 p-2 bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" /> Attachment Document Viewer
            </h3>
            <div className="bg-[#FAF9F6] border border-stone-200 rounded-2xl overflow-hidden h-96 flex items-center justify-center">
              <img
                src={previewDoc}
                alt="Commercial Transport License"
                className="max-h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
