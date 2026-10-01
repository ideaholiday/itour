import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";

/**
 * IdeaHoliday B2B travel agencies (ADR 054). Admins check the GSTIN or PAN,
 * approve with an agent discount of 5–10%, reject with a reason the agency
 * sees, or suspend an approved agency.
 */

const TABS = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const inputClass = "rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-500";

function AgencyRow({ agency, onReview, busy }) {
  const [discount, setDiscount] = useState(String(agency.discountPct ?? 5));
  const [reason, setReason] = useState("");
  const pct = Number(discount);
  const decide = (status) => {
    if (status !== "APPROVED" && reason.trim().length < 3) {
      window.alert("Give a reason; the agency sees it.");
      return;
    }
    onReview(agency, { status, discountPct: status === "APPROVED" ? pct : undefined, reason: reason.trim() || undefined });
  };

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-stone-900">{agency.agencyName}</h3>
          <p className="text-xs text-stone-500">{agency.contactName} · {agency.email} · {agency.phone}</p>
          <p className="text-xs text-stone-500">{[agency.address, agency.city, agency.state].filter(Boolean).join(", ")}</p>
          {agency.website && <p className="text-xs text-stone-500 break-all">{agency.website}</p>}
        </div>
        <div className="text-xs text-stone-600 sm:text-right">
          {agency.gstin && <p>GSTIN <span className="font-mono font-bold">{agency.gstin}</span></p>}
          {agency.pan && <p>PAN <span className="font-mono font-bold">{agency.pan}</span></p>}
          <p className="mt-1 text-stone-400">Applied {String(agency.createdAt || "").slice(0, 10)}</p>
        </div>
      </div>
      {agency.reviewNote && <p className="mt-2 text-xs text-rose-700">Reason given: {agency.reviewNote}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs font-bold text-stone-700">
          Agent discount
          <input type="number" min={5} max={10} step={0.5} value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputClass} w-16`} />%
        </label>
        <button disabled={busy || !(pct >= 5 && pct <= 10)} onClick={() => decide("APPROVED")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
          {agency.status === "APPROVED" ? "Save discount" : "Approve"}
        </button>
        {(agency.status === "PENDING" || agency.status === "APPROVED") && (
          <>
            <input placeholder="Reason (shown to the agency)" value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} min-w-[14rem] flex-1`} />
            {agency.status === "PENDING" && <button disabled={busy} onClick={() => decide("REJECTED")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button>}
            {agency.status === "APPROVED" && <button disabled={busy} onClick={() => decide("SUSPENDED")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Suspend</button>}
          </>
        )}
      </div>
    </li>
  );
}

export default function AgenciesView() {
  const [tab, setTab] = useState("PENDING");
  const [agencies, setAgencies] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.adminListAgencies(tab)
      .then((res) => { setAgencies(res.agencies || []); setCounts(res.counts || {}); })
      .catch((err) => setError(err.message || "Agencies couldn't be loaded"))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const review = async (agency, payload) => {
    setBusy(agency.id);
    setError("");
    setNotice("");
    try {
      const res = await api.adminReviewAgency(agency.id, payload);
      const changed = agency.status !== res.agency.status;
      const what = { APPROVED: `is approved at ${res.agency.discountPct}% off`, REJECTED: "was rejected", SUSPENDED: "is suspended" }[res.agency.status];
      setNotice(changed ? `${agency.agencyName} ${what}. We've emailed the agency.` : `${agency.agencyName}'s discount is now ${res.agency.discountPct}%.`);
      load();
    } catch (err) {
      setError(err.message || "That decision couldn't be saved");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Travel agents</h1>
          <p className="mt-0.5 text-xs text-stone-500">IdeaHoliday's B2B agencies. Check the GSTIN or PAN, then approve with a 5–10% agent discount.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 self-start rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${tab === value ? "border-amber-500 bg-amber-500 text-stone-950" : "border-stone-200 hover:bg-stone-100"}`}>
            {value.charAt(0) + value.slice(1).toLowerCase()} ({counts[value] || 0})
          </button>
        ))}
      </div>

      {notice && <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {notice}</div>}
      {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}</div>}

      {!loading && agencies.length === 0 && <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">No {tab.toLowerCase()} agencies.</p>}
      <ul className="space-y-3">
        {agencies.map((agency) => <AgencyRow key={`${agency.id}:${agency.status}:${agency.discountPct}`} agency={agency} onReview={review} busy={busy === agency.id} />)}
      </ul>
    </div>
  );
}
