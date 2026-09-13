import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { api } from "../../lib/api.js";
import SupplierBadge from "../supplier/SupplierBadge.jsx";

const formatDate = (value) => {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

/**
 * Public profile controls for one supplier: grant the yearly Verified badge
 * once the checks are done, revoke it, or suspend the public profile.
 * The server enforces KYB approval and the required checks.
 */
export default function SupplierProfileAdminPanel({ supplierId }) {
  const [data, setData] = useState(null);
  const [checks, setChecks] = useState([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = useCallback(() => {
    if (!supplierId) return;
    api.adminGetSupplierPublicProfile(supplierId)
      .then((result) => { setData(result); setChecks([]); })
      .catch((err) => setMessage({ type: "error", text: err.message }));
  }, [supplierId]);

  useEffect(() => { setData(null); setMessage(null); setReason(""); load(); }, [load]);

  if (!data) return <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />;

  const run = async (action, success) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setReason("");
      setMessage({ type: "success", text: success });
      load();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const badge = data.publicView.badge;
  const suspended = data.profile.profileStatus === "SUSPENDED";
  const toggle = (code) => setChecks((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  const missingRequired = data.requiredChecks.filter((code) => !checks.includes(code));

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-stone-900">Public profile</h3>
        <a href={`${window.location.origin.replace(/\/\/(admin|supply)\./, "//")}${data.profile.path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline">
          {data.profile.path} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
        <SupplierBadge badge={badge} size="md" />
        {badge.status === "VERIFIED" && <span>Valid until {formatDate(badge.validUntil)}</span>}
        <span>{data.visible ? "Visible" : suspended ? "Suspended" : "Hidden by supplier"}</span>
        <span>{data.indexable ? "Indexed by Google" : "Not indexed"}</span>
        <span>Completeness {data.completeness.score}%</span>
      </div>

      {data.verification && data.verification.status !== "ACTIVE" && data.verification.reason && (
        <p className="text-xs text-stone-500">Last decision ({data.verification.status.toLowerCase()}): {data.verification.reason}</p>
      )}

      {badge.status !== "VERIFIED" ? (
        <div className="space-y-2">
          <p className="text-xs font-bold text-stone-700">Checks completed</p>
          {data.kybStatus !== "APPROVED" && <p className="text-xs text-amber-800">Approve KYB before granting the Verified badge.</p>}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {Object.entries(data.checkCatalog).map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={checks.includes(code)} onChange={() => toggle(code)} className="h-4 w-4 accent-emerald-600" />
                {label}{data.requiredChecks.includes(code) && <span className="text-rose-600">*</span>}
              </label>
            ))}
          </div>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Note (optional): what was checked and how" className="w-full rounded-xl border border-stone-200 p-2 text-xs" />
          <button
            type="button"
            disabled={busy || missingRequired.length > 0 || data.kybStatus !== "APPROVED"}
            onClick={() => run(() => api.adminDecideSupplierVerification(supplierId, { action: "GRANT", checks, reason }), "Verified badge granted for one year.")}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            <BadgeCheck className="h-4 w-4" />Grant Verified badge (1 year)
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for removing the badge" className="w-full rounded-xl border border-stone-200 p-2 text-xs" />
          <button type="button" disabled={busy || reason.trim().length < 5}
            onClick={() => run(() => api.adminDecideSupplierVerification(supplierId, { action: "REVOKE", reason }), "Verified badge removed.")}
            className="w-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-800 disabled:opacity-40">
            Remove Verified badge
          </button>
        </div>
      )}

      <div className="border-t border-stone-200 pt-3">
        {suspended ? (
          <button type="button" disabled={busy}
            onClick={() => run(() => api.adminSetSupplierProfileStatus(supplierId, { suspended: false }), "Profile restored.")}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-800">
            Restore public profile
          </button>
        ) : (
          <button type="button" disabled={busy || reason.trim().length < 5}
            onClick={() => run(() => api.adminSetSupplierProfileStatus(supplierId, { suspended: true, reason }), "Profile suspended.")}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 disabled:opacity-40"
            title="Uses the reason typed above">
            Suspend public profile (uses the reason above)
          </button>
        )}
      </div>

      {message && <p role="status" className={`rounded-xl p-2 text-xs ${message.type === "error" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}
    </section>
  );
}
