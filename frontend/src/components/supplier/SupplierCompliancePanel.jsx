import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileCheck,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const parseBankDetails = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && (parsed.account_number || parsed.bank_name || parsed.ifsc)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const DOC_TYPES = [
  { value: "COMMERCIAL_TRANSPORT_LICENSE", label: "Commercial Transport License / Permit", required: true },
  { value: "GSTIN", label: "GSTIN Certificate", required: false },
  { value: "PAN", label: "PAN Card (Business / Proprietor)", required: true },
  { value: "BANK_CANCELLED_CHEQUE", label: "Cancelled Cheque / Bank Passbook", required: false },
  { value: "TOURISM_LICENSE", label: "Tourism Department Registration", required: false },
  { value: "OTHER", label: "Other Identity / Trade Document", required: false }
];

export default function SupplierCompliancePanel({ supplierData, supplierId, onRefresh }) {
  const supplier = supplierData?.supplier || {};
  const kybDocs = supplierData?.kybDocs || [];
  const bankDetails = parseBankDetails(supplier.payout_bank_details);

  const [copiedRef, setCopiedRef] = useState("");
  const [notification, setNotification] = useState(null);
  const [verifyingField, setVerifyingField] = useState(null); // 'gstin' | 'pan' | 'bank' | 'all'

  // Modals
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Pre-selected doc type when clicking upload for a specific slot
  const [presetDocType, setPresetDocType] = useState("");

  const handleCopyRef = (ref) => {
    if (!ref) return;
    navigator.clipboard?.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(""), 2000);
  };

  const showToast = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Cashfree SecureID verification triggers
  const handleVerifyGstin = async () => {
    if (!supplier.gstin) {
      showToast("error", "Please add a GSTIN number before verifying.");
      return;
    }
    setVerifyingField("gstin");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/kyb/verify-gstin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ gstin: supplier.gstin, businessName: supplier.company_name })
      });
      const data = await res.json();
      if (data.success && data.verification?.valid) {
        showToast("success", `GSTIN Verified with Cashfree: ${data.verification.legalName} (${data.verification.status})`);
        if (onRefresh) onRefresh();
      } else {
        showToast("error", data.error || data.message || "GSTIN verification failed");
      }
    } catch {
      showToast("error", "Network error running GSTIN verification");
    } finally {
      setVerifyingField(null);
    }
  };

  const handleVerifyPan = async () => {
    if (!supplier.pan_number) {
      showToast("error", "Please add a PAN number before verifying.");
      return;
    }
    setVerifyingField("pan");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/kyb/verify-pan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ pan: supplier.pan_number, name: supplier.contact_name || supplier.company_name })
      });
      const data = await res.json();
      if (data.success && data.verification?.valid) {
        showToast("success", `PAN Verified with Cashfree: ${data.verification.registeredName} (${data.verification.type})`);
        if (onRefresh) onRefresh();
      } else {
        showToast("error", data.error || data.message || "PAN verification failed");
      }
    } catch {
      showToast("error", "Network error running PAN verification");
    } finally {
      setVerifyingField(null);
    }
  };

  const handleVerifyBank = async () => {
    if (!bankDetails?.account_number || !bankDetails?.ifsc) {
      showToast("error", "Please configure bank account number and IFSC before verifying.");
      return;
    }
    setVerifyingField("bank");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/kyb/verify-bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          accountNumber: bankDetails.account_number,
          ifsc: bankDetails.ifsc,
          name: bankDetails.account_holder || supplier.contact_name || supplier.company_name
        })
      });
      const data = await res.json();
      if (data.success && data.verification?.valid) {
        showToast("success", `Bank Account Verified with Cashfree: ${data.verification.bankName} (${data.verification.accountHolderName})`);
        if (onRefresh) onRefresh();
      } else {
        showToast("error", data.error || data.message || "Bank verification failed");
      }
    } catch {
      showToast("error", "Network error running bank verification");
    } finally {
      setVerifyingField(null);
    }
  };

  const handleVerifyAll = async () => {
    setVerifyingField("all");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/kyb/verify-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() }
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Full Cashfree SecureID KYB Verification completed!");
        if (onRefresh) onRefresh();
      } else {
        showToast("error", data.error || "Failed to execute comprehensive verification");
      }
    } catch {
      showToast("error", "Network error running comprehensive verification");
    } finally {
      setVerifyingField(null);
    }
  };

  // Compute compliance score
  const isKybApproved = supplier.kyb_status === "APPROVED";
  const hasGstin = Boolean(supplier.gstin && supplier.gstin.trim().length >= 10);
  const hasPan = Boolean(supplier.pan_number && supplier.pan_number.trim().length >= 10);
  const hasPayout = Boolean(bankDetails && bankDetails.account_number && bankDetails.ifsc);
  const hasDocs = kybDocs.length > 0;

  const checks = [
    { label: "Business verification", met: isKybApproved, weight: 25 },
    { label: "PAN on file & verified", met: hasPan, weight: 25 },
    { label: "Payout bank verified", met: hasPayout, weight: 25 },
    { label: "GSTIN on file", met: hasGstin, weight: 15 },
    { label: "Compliance documents", met: hasDocs, weight: 10 }
  ];

  const totalScore = checks.reduce((sum, item) => (item.met ? sum + item.weight : sum), 0);
  const passedCount = checks.filter((c) => c.met).length;

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to remove this document?")) return;
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/kyb/${docId}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Document removed successfully");
        if (onRefresh) onRefresh();
      } else {
        showToast("error", data.error || "Failed to remove document");
      }
    } catch {
      showToast("error", "Network error removing document");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm font-medium shadow-sm transition ${
            notification.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="rounded-lg p-1 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header Card with Progress Gauge */}
      <section className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300">
                Trust & Compliance
              </span>
              {supplier.id && (
                <button
                  type="button"
                  onClick={() => handleCopyRef(supplier.id)}
                  className="inline-flex items-center gap-1 font-mono text-[10px] bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-700 hover:bg-amber-100 hover:text-amber-900 transition"
                  title="Copy Supplier ID"
                >
                  {copiedRef === supplier.id ? (
                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-2.5 h-2.5 text-stone-400" />
                  )}
                  <span>ID: {supplier.id}</span>
                </button>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-stone-900">
              Partner compliance & verification
            </h1>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-stone-600">
              Manage your business tax credentials, payout destination bank, and compliance documents to unlock bookings and instant payouts.
            </p>
          </div>

          {/* Quick Refresh Button */}
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 transition shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Progress Bar & Summary */}
        <div className="mt-6 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-stone-800">Compliance Readiness</span>
              <p className="text-[11px] text-stone-500">
                {passedCount} of {checks.length} requirements fulfilled · {totalScore}% score
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black uppercase border ${
                totalScore === 100
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                  : totalScore >= 60
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-rose-100 text-rose-900 border-rose-300"
              }`}
            >
              {totalScore === 100 ? "Fully Compliant" : totalScore >= 60 ? "Partially Verified" : "Action Required"}
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalScore === 100
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                  : totalScore >= 60
                  ? "bg-gradient-to-r from-amber-500 to-emerald-500"
                  : "bg-gradient-to-r from-rose-500 to-amber-500"
              }`}
              style={{ width: `${Math.max(5, totalScore)}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main 2-Column Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left Column: Verification Documents & Uploads */}
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-900">Verification documents</h2>
                <p className="text-xs text-stone-500">Upload official transport permits and identity files for verification.</p>
              </div>
              <button
                onClick={() => {
                  setPresetDocType("");
                  setUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                <span>Upload</span>
              </button>
            </div>

            {/* Documents List */}
            <div className="mt-5 space-y-3">
              {kybDocs.map((doc) => {
                const isApproved = doc.status === "APPROVED";
                const isPending = doc.status === "PENDING";
                const isRejected = doc.status === "REJECTED";

                return (
                  <article
                    key={doc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 transition hover:border-amber-300"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`rounded-xl p-2.5 shrink-0 ${
                          isApproved ? "bg-emerald-100 text-emerald-700" : isRejected ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        <FileCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-stone-900 truncate">
                            {doc.doc_type?.replaceAll("_", " ")}
                          </h3>
                        </div>
                        <p className="text-[11px] font-mono text-stone-500 truncate">
                          {doc.doc_number || "Document file uploaded"}
                        </p>
                        {doc.rejection_reason && (
                          <p className="mt-1 text-[11px] text-rose-600 font-medium">
                            Note: {doc.rejection_reason}
                          </p>
                        )}
                        {doc.submitted_at && (
                          <span className="mt-0.5 block text-[10px] text-stone-400">
                            Submitted on {new Date(doc.submitted_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : isRejected
                            ? "bg-rose-100 text-rose-900 border-rose-300"
                            : "bg-amber-100 text-amber-900 border-amber-300 animate-pulse"
                        }`}
                      >
                        {doc.status || "PENDING"}
                      </span>

                      {doc.doc_url && (
                        <a
                          href={doc.doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:text-amber-800 hover:border-amber-300 transition"
                          title="View uploaded document"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      {!isApproved && (
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-400 hover:text-rose-600 hover:border-rose-300 transition"
                          title="Remove document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}

              {!kybDocs.length && (
                <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center bg-[#FAF9F6]">
                  <UploadCloud className="mx-auto h-8 w-8 text-amber-600" />
                  <h3 className="mt-2 text-sm font-bold text-stone-800">No documents submitted yet</h3>
                  <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto">
                    Upload your Commercial Transport Permit, PAN copy, or GSTIN certificate to start receiving marketplace bookings.
                  </p>
                  <button
                    onClick={() => {
                      setPresetDocType("COMMERCIAL_TRANSPORT_LICENSE");
                      setUploadModalOpen(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-400 shadow-sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Upload Commercial Permit</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick upload triggers for standard required documents */}
          <div className="mt-6 pt-5 border-t border-stone-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-2">
              Recommended Document Checklist
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOC_TYPES.slice(0, 4).map((type) => {
                const uploaded = kybDocs.find((d) => d.doc_type === type.value);
                return (
                  <button
                    key={type.value}
                    onClick={() => {
                      setPresetDocType(type.value);
                      setUploadModalOpen(true);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition ${
                      uploaded
                        ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 text-stone-700"
                        : "border-stone-200 bg-white hover:border-amber-300 text-stone-600"
                    }`}
                  >
                    <span className="truncate pr-2 font-medium">{type.label}</span>
                    {uploaded ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                        + Add
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Column: Account Health & Tax / Financials */}
        <div className="space-y-6">
          {/* Account Health Card */}
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                <h2 className="font-display text-xl font-bold text-stone-900">Account health</h2>
              </div>
              <span
                className={`text-[10px] font-bold uppercase rounded-full px-2.5 py-0.5 border ${
                  isKybApproved
                    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                    : "bg-amber-100 text-amber-900 border-amber-300"
                }`}
              >
                Status: {supplier.kyb_status || "PENDING"}
              </span>
            </div>

            {/* Cashfree SecureID 1-Click Verification Trigger */}
            <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-900 shrink-0">
                  <Shield className="h-4 w-4 text-amber-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">Cashfree SecureID KYB</span>
                    <span className="text-[9px] font-mono font-bold bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded">API ACTIVE</span>
                  </div>
                  <p className="text-[10px] text-stone-600">Instant real-time GSTIN, PAN & Bank Penny-Drop Validation</p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(verifyingField)}
                onClick={handleVerifyAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50 shrink-0"
              >
                {verifyingField === "all" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Verify All</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Row 1: Business Verification */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 text-sm">
                <div>
                  <span className="text-stone-700 font-medium">Business verification</span>
                  <p className="text-[11px] text-stone-400">KYB approval by Idea Holiday operations</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1 text-xs font-bold ${
                      isKybApproved ? "text-emerald-800" : "text-amber-800"
                    }`}
                  >
                    {isKybApproved ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600" />
                    )}
                    {isKybApproved ? "Approved" : supplier.kyb_status === "REJECTED" ? "Rejected" : "In Review"}
                  </span>
                </div>
              </div>

              {/* Row 2: GSTIN */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-700 font-medium">GSTIN on file</span>
                    {supplier.gstin_verified === 1 && (
                      <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                        VERIFIED ({supplier.gstin_verified_status || "Active"})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-stone-400">
                    {supplier.gstin ? supplier.gstin : "Not provided"}
                    {supplier.gstin_verified_name && (
                      <span className="block text-emerald-700 font-sans text-[10px] font-semibold">
                        Legal Entity: {supplier.gstin_verified_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {supplier.gstin && supplier.gstin_verified !== 1 && (
                    <button
                      type="button"
                      disabled={verifyingField === "gstin"}
                      onClick={handleVerifyGstin}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-1 text-[11px] font-bold transition disabled:opacity-50"
                    >
                      {verifyingField === "gstin" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 text-amber-700" />}
                      <span>Verify GSTIN</span>
                    </button>
                  )}
                  <button
                    onClick={() => setTaxModalOpen(true)}
                    className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-300 transition"
                  >
                    {hasGstin ? "Edit" : "+ Add"}
                  </button>
                </div>
              </div>

              {/* Row 3: PAN */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-700 font-medium">PAN on file</span>
                    {supplier.pan_verified === 1 && (
                      <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                        VERIFIED ({supplier.pan_type || "Business"})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-stone-400">
                    {supplier.pan_number ? supplier.pan_number : "Not provided"}
                    {supplier.pan_verified_name && (
                      <span className="block text-emerald-700 font-sans text-[10px] font-semibold">
                        Registered Name: {supplier.pan_verified_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {supplier.pan_number && supplier.pan_verified !== 1 && (
                    <button
                      type="button"
                      disabled={verifyingField === "pan"}
                      onClick={handleVerifyPan}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-1 text-[11px] font-bold transition disabled:opacity-50"
                    >
                      {verifyingField === "pan" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 text-amber-700" />}
                      <span>Verify PAN</span>
                    </button>
                  )}
                  <button
                    onClick={() => setTaxModalOpen(true)}
                    className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-300 transition"
                  >
                    {hasPan ? "Edit" : "+ Add"}
                  </button>
                </div>
              </div>

              {/* Row 4: Payout Account */}
              <div className="flex items-center justify-between pb-1 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-700 font-medium">Payout destination</span>
                    {supplier.bank_verified === 1 && (
                      <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                        BAV MATCH ({supplier.bank_match_score || 100}%)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400">
                    {hasPayout
                      ? `${bankDetails.bank_name || "Bank"} (••• ${bankDetails.account_number.slice(-4)})`
                      : "Bank account not linked"}
                    {supplier.bank_verified_name && (
                      <span className="block text-emerald-700 font-sans text-[10px] font-semibold">
                        Bank Beneficiary: {supplier.bank_verified_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasPayout && supplier.bank_verified !== 1 && (
                    <button
                      type="button"
                      disabled={verifyingField === "bank"}
                      onClick={handleVerifyBank}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-1 text-[11px] font-bold transition disabled:opacity-50"
                    >
                      {verifyingField === "bank" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3 text-amber-700" />}
                      <span>Penny Drop Test</span>
                    </button>
                  )}
                  <button
                    onClick={() => setPayoutModalOpen(true)}
                    className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-amber-100 hover:text-amber-900 border border-stone-300 transition"
                  >
                    {hasPayout ? "Edit" : "+ Add"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Tax & Financial Details Card */}
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-600" />
                <h3 className="font-display text-lg font-bold text-stone-900">Tax & Bank Profile</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTaxModalOpen(true)}
                  className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100 transition"
                >
                  Edit Tax Info
                </button>
                <button
                  onClick={() => setPayoutModalOpen(true)}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                >
                  Edit Bank
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">GSTIN</span>
                  {supplier.gstin_verified === 1 && (
                    <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-300">
                      Active
                    </span>
                  )}
                </div>
                <strong className="mt-1 block font-mono text-xs text-stone-900 truncate">
                  {supplier.gstin || "—"}
                </strong>
                {supplier.gstin_verified_name && (
                  <span className="mt-0.5 block text-[10px] text-emerald-700 font-medium truncate">
                    {supplier.gstin_verified_name}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">PAN Number</span>
                  {supplier.pan_verified === 1 && (
                    <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-300">
                      Valid
                    </span>
                  )}
                </div>
                <strong className="mt-1 block font-mono text-xs text-stone-900 truncate">
                  {supplier.pan_number || "—"}
                </strong>
                {supplier.pan_verified_name && (
                  <span className="mt-0.5 block text-[10px] text-emerald-700 font-medium truncate">
                    {supplier.pan_verified_name}
                  </span>
                )}
              </div>
              <div className="col-span-2 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-3.5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-stone-400 block">Bank Account</span>
                      {supplier.bank_verified === 1 && (
                        <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-300">
                          Cashfree BAV Verified
                        </span>
                      )}
                    </div>
                    <strong className="mt-0.5 block text-xs text-stone-900 font-bold">
                      {bankDetails?.bank_name || "No Bank Configured"}
                    </strong>
                    <p className="mt-0.5 font-mono text-[11px] text-stone-600">
                      {bankDetails?.account_number ? `A/C: ••••••••${bankDetails.account_number.slice(-4)}` : "Account number missing"} · IFSC: {bankDetails?.ifsc || "—"}
                    </p>
                    {bankDetails?.account_holder && (
                      <p className="text-[10px] text-stone-500 mt-0.5">
                        Beneficiary: {bankDetails.account_holder} ({bankDetails.account_type || "CURRENT"})
                      </p>
                    )}
                  </div>
                  {bankDetails?.upi_id && (
                    <span className="text-[10px] font-mono bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-600">
                      UPI: {bankDetails.upi_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Modal 1: Edit Tax Identifiers (GSTIN & PAN) */}
      {taxModalOpen && (
        <TaxDetailsModal
          isOpen={taxModalOpen}
          onClose={() => setTaxModalOpen(false)}
          supplier={supplier}
          supplierId={supplierId}
          onSuccess={() => {
            setTaxModalOpen(false);
            showToast("success", "Tax details updated successfully");
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Modal 2: Edit Payout Bank Details */}
      {payoutModalOpen && (
        <PayoutBankModal
          isOpen={payoutModalOpen}
          onClose={() => setPayoutModalOpen(false)}
          supplier={supplier}
          supplierId={supplierId}
          bankDetails={bankDetails}
          onSuccess={() => {
            setPayoutModalOpen(false);
            showToast("success", "Payout destination updated successfully");
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Modal 3: Upload Document */}
      {uploadModalOpen && (
        <DocumentUploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          supplierId={supplierId}
          presetType={presetDocType}
          onSuccess={() => {
            setUploadModalOpen(false);
            showToast("success", "Document submitted for verification");
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Sub-component Modal: Tax & Business Details
// -------------------------------------------------------------
function TaxDetailsModal({ isOpen, onClose, supplier, supplierId, onSuccess }) {
  const [gstin, setGstin] = useState(supplier.gstin || "");
  const [pan, setPan] = useState(supplier.pan_number || "");
  const [businessType, setBusinessType] = useState(supplier.business_type || "Private Limited");
  const [websiteUrl, setWebsiteUrl] = useState(supplier.website_url || "");
  const [yearsInOperation, setYearsInOperation] = useState(supplier.years_in_operation || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanGstin = gstin.trim().toUpperCase();
    const cleanPan = pan.trim().toUpperCase();

    // GSTIN format check (15 chars)
    if (cleanGstin && cleanGstin.length !== 15) {
      setError("GSTIN must be exactly 15 characters long (e.g. 22AAAAA0000A1Z5)");
      return;
    }

    // PAN format check (10 chars)
    if (cleanPan && cleanPan.length !== 10) {
      setError("PAN must be exactly 10 characters long (e.g. AAAAA0000A)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          gstin: cleanGstin || null,
          panNumber: cleanPan || null,
          businessType: businessType || null,
          websiteUrl: websiteUrl ? websiteUrl.trim() : null,
          yearsInOperation: yearsInOperation ? Number(yearsInOperation) : null
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || "Failed to update tax details");
      }
    } catch {
      setError("Network error updating tax details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-800">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-stone-900">Tax & Business Credentials</h3>
            <p className="text-xs text-stone-500">Update GSTIN, PAN, and organizational profile.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-stone-700 mb-1">GSTIN Number (Optional)</label>
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 22AAAAA0000A1Z5"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-sm uppercase focus:border-amber-500 focus:outline-hidden"
            />
            <span className="mt-1 block text-[10px] text-stone-400">15-digit alphanumeric Goods & Services Tax Identification Number</span>
          </div>

          <div>
            <label className="block font-bold text-stone-700 mb-1">PAN Number (Required for Payouts)</label>
            <input
              type="text"
              maxLength={10}
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="e.g. AAAAA0000A"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-sm uppercase focus:border-amber-500 focus:outline-hidden"
            />
            <span className="mt-1 block text-[10px] text-stone-400">10-character Permanent Account Number</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Business Structure</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs bg-white focus:border-amber-500 focus:outline-hidden"
              >
                <option value="Private Limited">Private Limited</option>
                <option value="Sole Proprietorship">Sole Proprietorship</option>
                <option value="Partnership">Partnership</option>
                <option value="LLP">Limited Liability Partnership (LLP)</option>
                <option value="Individual Operator">Individual / Tour Leader</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Years Operating</label>
              <input
                type="number"
                min={0}
                max={100}
                value={yearsInOperation}
                onChange={(e) => setYearsInOperation(e.target.value)}
                placeholder="e.g. 5"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-stone-700 mb-1">Company Website (Optional)</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2.5 font-bold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Save Details</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-component Modal: Payout Bank Details
// -------------------------------------------------------------
function PayoutBankModal({ isOpen, onClose, supplier, supplierId, bankDetails, onSuccess }) {
  const [accountHolder, setAccountHolder] = useState(bankDetails?.account_holder || supplier.contact_name || supplier.company_name || "");
  const [bankName, setBankName] = useState(bankDetails?.bank_name || "");
  const [accountNumber, setAccountNumber] = useState(bankDetails?.account_number || "");
  const [confirmAccount, setConfirmAccount] = useState(bankDetails?.account_number || "");
  const [ifsc, setIfsc] = useState(bankDetails?.ifsc || "");
  const [accountType, setAccountType] = useState(bankDetails?.account_type || "CURRENT");
  const [upiId, setUpiId] = useState(bankDetails?.upi_id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanAcc = accountNumber.trim();
    const cleanConfirm = confirmAccount.trim();
    const cleanIfsc = ifsc.trim().toUpperCase();

    if (!accountHolder.trim() || !bankName.trim() || !cleanAcc || !cleanIfsc) {
      setError("Please fill in Account Holder, Bank Name, Account Number, and IFSC Code.");
      return;
    }

    if (cleanAcc !== cleanConfirm) {
      setError("Account numbers do not match. Please verify.");
      return;
    }

    if (cleanIfsc.length !== 11) {
      setError("IFSC code must be exactly 11 characters (e.g. HDFC0001234)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/payout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          accountHolder: accountHolder.trim(),
          bankName: bankName.trim(),
          accountNumber: cleanAcc,
          ifscCode: cleanIfsc,
          accountType,
          upiId: upiId ? upiId.trim() : null
        })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || "Failed to update payout bank details");
      }
    } catch {
      setError("Network error updating payout details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-100 p-2.5 text-emerald-800">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-stone-900">Payout Bank Destination</h3>
            <p className="text-xs text-stone-500">Trip earnings will be automatically settled to this bank account.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-stone-700 mb-1">Beneficiary / Account Holder Name</label>
            <input
              type="text"
              required
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="e.g. Goa Holiday Logistics Pvt Ltd"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Bank Name</label>
              <input
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HDFC Bank"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs bg-white focus:border-amber-500 focus:outline-hidden"
              >
                <option value="CURRENT">Current Account</option>
                <option value="SAVINGS">Savings Account</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Bank Account Number</label>
              <input
                type="password"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Enter account number"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">Re-enter Account Number</label>
              <input
                type="text"
                required
                value={confirmAccount}
                onChange={(e) => setConfirmAccount(e.target.value)}
                placeholder="Re-enter to confirm"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-stone-700 mb-1">IFSC Code</label>
              <input
                type="text"
                required
                maxLength={11}
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                placeholder="e.g. HDFC0001234"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 font-mono text-xs uppercase focus:border-amber-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-700 mb-1">UPI ID (Optional)</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                placeholder="e.g. vendor@hdfcbank"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs focus:border-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2.5 font-bold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Save Payout Bank</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Sub-component Modal: Document Upload
// -------------------------------------------------------------
function DocumentUploadModal({ isOpen, onClose, supplierId, presetType, onSuccess }) {
  const [docType, setDocType] = useState(presetType || "COMMERCIAL_TRANSPORT_LICENSE");
  const [docNumber, setDocNumber] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit. Please upload a smaller PDF or image.");
      return;
    }

    setError("");
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFilePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!docType) {
      setError("Please select a document type");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let docUrl = "https://example.com/docs/uploaded.pdf";

      // If user picked a file, upload to /api/uploads via base64
      if (filePreview && selectedFile) {
        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            data: filePreview,
            filename: selectedFile.name,
            mimeType: selectedFile.type || "application/pdf",
            entityType: "KYB",
            entityId: supplierId
          })
        });

        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.upload?.url) {
          docUrl = uploadData.upload.url;
        }
      }

      // Now submit the KYB record
      const res = await fetch(`/api/suppliers/${supplierId}/kyb`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          docType,
          docNumber: docNumber.trim() || `DOC-${Date.now().toString().slice(-6)}`,
          docUrl
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || "Failed to submit document");
      }
    } catch {
      setError("Network error uploading document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-800">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-stone-900">Upload Verification Document</h3>
            <p className="text-xs text-stone-500">Attach permits, certificates or identity proof.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-stone-700 mb-1">Document Category</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs bg-white focus:border-amber-500 focus:outline-hidden"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-stone-700 mb-1">Document / Certificate Reference Number</label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="e.g. CTL-GA-2026-8812, 22AAAAA0000A1Z5"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs font-mono focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          {/* Drag and Drop File Picker */}
          <div>
            <label className="block font-bold text-stone-700 mb-1">Select File (PDF, PNG, JPG - max 5MB)</label>
            <label className="mt-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-[#FAF9F6] p-6 hover:border-amber-400 hover:bg-amber-50/30 transition cursor-pointer">
              <Upload className="h-7 w-7 text-stone-400" />
              <span className="mt-2 text-xs font-bold text-stone-700">
                {selectedFile ? selectedFile.name : "Click or drag & drop to choose file"}
              </span>
              <span className="mt-0.5 text-[10px] text-stone-400">
                {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Supports PDF, JPEG, PNG, WebP up to 5MB"}
              </span>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2.5 font-bold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50 shadow-sm"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Upload & Submit</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
