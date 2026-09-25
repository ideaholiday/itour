import React, { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  Building,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  RefreshCw,
  ShieldCheck,
  Search,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { authHeaders } from "../../lib/api.js";
import ReasonDialog from "../../components/admin/ReasonDialog.jsx";

const STATUS_STYLES = {
  REQUESTED: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  PROCESSING: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  PAID: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  REJECTED: "bg-rose-500/10 text-rose-700 border-rose-500/30",
};

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

// commission_rate is a fraction (0.125); show it as 12.5%, not a rounded 13%.
function ratePct(fraction) {
  return Math.round(Number(fraction || 0) * 10000) / 100;
}

async function adminFetch(path, options = {}) {
  const response = await fetch(`/api/admin/affiliates${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data;
}

/**
 * The creator payout queue.
 *
 * Full bank details are deliberately not in the table. They are fetched one
 * payout at a time, from an endpoint that logs the disclosure, so reading an
 * account number is an act rather than a side effect of loading a page.
 */
export default function AffiliatePayoutsView() {
  const [tab, setTab] = useState("payouts");
  const [statusFilter, setStatusFilter] = useState("REQUESTED");
  const [payouts, setPayouts] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [openPayout, setOpenPayout] = useState(null);
  const [instrument, setInstrument] = useState(null);
  const [instrumentLoading, setInstrumentLoading] = useState(false);
  const [utr, setUtr] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tierWarning, setTierWarning] = useState(null);
  const [decision, setDecision] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [detail, setDetail] = useState(null);

  // Typing in the search box waits for a pause instead of querying per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPayouts = useCallback(() => {
    setLoading(true);
    setError("");
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    return adminFetch(`/payouts${query}`)
      .then((res) => setPayouts(res.payouts || []))
      .catch((err) => setError(err.message || "Could not load payouts"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const loadCreators = useCallback(() => {
    return adminFetch(`/${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ""}`)
      .then((res) => setAffiliates(res.affiliates || []))
      .catch((err) => setError(err.message || "Could not load creators"));
  }, [debouncedSearch]);

  // A tier over the giveaway cap means creators' audience discounts are cut,
  // often to nothing, at checkout: the cap is spent on their commission first.
  const loadTierWarning = useCallback(() => {
    adminFetch("/tiers")
      .then((res) => {
        const over = (res.tiers || []).filter((tier) => tier.overCap && tier.creators > 0);
        setTierWarning(over.length ? { cap: res.giveawayCapPct, tiers: over } : null);
      })
      .catch(() => setTierWarning(null));
  }, []);

  const load = useCallback(() => {
    loadPayouts();
    loadCreators();
    loadTierWarning();
  }, [loadPayouts, loadCreators, loadTierWarning]);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);
  useEffect(() => { loadCreators(); }, [loadCreators]);
  useEffect(() => { loadTierWarning(); }, [loadTierWarning]);

  const openSettlement = async (payout) => {
    setOpenPayout(payout);
    setInstrument(null);
    setUtr("");
    setRejectReason("");
    setInstrumentLoading(true);
    try {
      const res = await adminFetch(`/payouts/${encodeURIComponent(payout.id)}/instrument`);
      setInstrument(res);
    } catch (err) {
      setInstrument({ error: err.message });
    } finally {
      setInstrumentLoading(false);
    }
  };

  const settle = async () => {
    setActing(true);
    setError("");
    try {
      await adminFetch(`/payouts/${encodeURIComponent(openPayout.id)}/settle`, {
        method: "POST",
        body: JSON.stringify({ utrReference: utr.trim() }),
      });
      setNotice(`Payout ${openPayout.id} settled.`);
      setOpenPayout(null);
      load();
    } catch (err) {
      setError(err.message || "Could not settle this payout");
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    setActing(true);
    setError("");
    try {
      await adminFetch(`/payouts/${encodeURIComponent(openPayout.id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setNotice(`Payout ${openPayout.id} rejected; the balance went back to the creator.`);
      setOpenPayout(null);
      load();
    } catch (err) {
      setError(err.message || "Could not reject this payout");
    } finally {
      setActing(false);
    }
  };

  // A creator's own rates (ADR 017): empty uses their tier's. Must fit the giveaway cap.
  const [rateEdit, setRateEdit] = useState(null);
  const saveRates = async (event) => {
    event.preventDefault();
    try {
      const pctOrNull = (value) => (value === "" ? null : Number(value));
      const res = await adminFetch(`/${encodeURIComponent(rateEdit.affiliate.id)}/rates`, {
        method: "PUT",
        body: JSON.stringify({ commissionPct: pctOrNull(rateEdit.commissionPct), travelerDiscountPct: pctOrNull(rateEdit.travelerDiscountPct), reason: rateEdit.reason }),
      });
      setNotice(`${rateEdit.affiliate.channel_name}: ${res.commissionPct}% commission, ${res.travelerDiscountPct}% audience discount on new bookings.${res.notified ? " They were emailed." : ""}`);
      setRateEdit(null);
      load();
    } catch (err) {
      setError(err.message || "Could not update the creator's rates");
    }
  };

  // KYC and account status change only after a reason is written; the select
  // just opens the dialog, and the API records the reason in the audit log.
  const askKyc = (affiliate, kycStatus) => {
    if (kycStatus === affiliate.kyc_status) return;
    setDecision({
      kind: "kyc", affiliate, value: kycStatus, tone: kycStatus === "VERIFIED" ? null : "danger",
      title: `${kycStatus === "VERIFIED" ? "Verify" : kycStatus === "REJECTED" ? "Reject" : "Reopen"} KYC for ${affiliate.channel_name}?`,
      message: kycStatus === "VERIFIED"
        ? `You are confirming PAN ${affiliate.pan_number || "(none on file)"} belongs to this creator. They can then be paid, with TDS filed against it. Bank accounts still need the bank's own verification.`
        : "The creator can't be paid until KYC is verified again. Commission keeps accruing.",
      confirmLabel: "Save KYC decision",
      placeholder: kycStatus === "VERIFIED" ? "e.g. PAN card checked against the name on the bank account" : "e.g. name on PAN doesn't match the account holder",
    });
  };

  const askStatus = (affiliate, status) => {
    if (status === affiliate.status) return;
    setDecision({
      kind: "status", affiliate, value: status, tone: status === "ACTIVE" ? null : "danger",
      requireReason: status !== "ACTIVE",
      title: `${status === "ACTIVE" ? "Activate" : status === "SUSPENDED" ? "Suspend" : status === "REJECTED" ? "Reject" : "Set to pending"} ${affiliate.channel_name}?`,
      message: status === "ACTIVE"
        ? `Their code ${affiliate.affiliate_code} works again and new bookings earn commission.`
        : `Their code ${affiliate.affiliate_code} stops giving a discount and new bookings earn nothing. Commission already earned is kept.`,
      confirmLabel: status === "ACTIVE" ? "Activate" : "Save",
      placeholder: "e.g. fake followers; bookings cancelled after every payout",
    });
  };

  const confirmDecision = async (reason) => {
    setDeciding(true);
    setError("");
    try {
      const { kind, affiliate, value } = decision;
      await adminFetch(`/${encodeURIComponent(affiliate.id)}/${kind}`, {
        method: "PATCH",
        body: JSON.stringify(kind === "kyc" ? { kyc_status: value, reason } : { status: value, ...(reason ? { reason } : {}) }),
      });
      setNotice(kind === "kyc" ? `${affiliate.channel_name}: KYC is now ${value}.` : `${affiliate.channel_name} is now ${value}.`);
      setDecision(null);
      loadCreators();
    } catch (err) {
      setError(err.message || "Could not save the decision");
      setDecision(null);
    } finally {
      setDeciding(false);
    }
  };

  useEffect(() => {
    if (!detail) return undefined;
    const close = (event) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detail]);

  const openDetail = async (affiliate) => {
    setDetail({ affiliate, loading: true });
    try {
      const res = await adminFetch(`/${encodeURIComponent(affiliate.id)}/detail`);
      setDetail({ affiliate, ...res, loading: false });
    } catch (err) {
      setDetail({ affiliate, loading: false, error: err.message || "Could not load this creator" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Creators & Payouts</h1>
          <p className="mt-0.5 text-xs text-stone-500">
            Settle influencer commission and review partner KYC.
          </p>
        </div>
        <button
          onClick={load}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {tierWarning && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {tierWarning.tiers.map((tier) => `${tier.label} (${tier.creators} creator${tier.creators === 1 ? "" : "s"})`).join(", ")} {tierWarning.tiers.length === 1 ? "is" : "are"} over the {tierWarning.cap}% giveaway cap.
            Their followers' coupon discount is cut at checkout, often to ₹0, because the cap is spent on commission first.
          </span>
          <Link to="/admin/programs" className="font-bold underline">Fix the tier rates in Programs</Link>
        </div>
      )}

      <div className="flex gap-2 border-b border-stone-200">
        {[
          { id: "payouts", label: "Payout queue", icon: Wallet },
          { id: "creators", label: "Creators", icon: ShieldCheck },
        ].map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              tab === entry.id
                ? "border-amber-500 text-stone-900"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            <entry.icon className="h-3.5 w-3.5" />
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "payouts" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {["REQUESTED", "PROCESSING", "PAID", "REJECTED", ""].map((status) => (
              <button
                key={status || "ALL"}
                onClick={() => setStatusFilter(status)}
                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  statusFilter === status
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 text-stone-500 hover:bg-stone-100"
                }`}
              >
                {status || "All"}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
            {payouts.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-400">
                {loading ? "Loading…" : "No payouts match this filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 font-semibold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-5 py-3.5">Creator</th>
                      <th className="px-5 py-3.5">Destination</th>
                      <th className="px-5 py-3.5 text-right">Gross</th>
                      <th className="px-5 py-3.5 text-right">TDS</th>
                      <th className="px-5 py-3.5 text-right">Net to pay</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {payouts.map((payout) => (
                      <tr key={payout.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3.5">
                          <div className="font-bold">{payout.channel_name}</div>
                          <div className="font-mono text-[10px] text-stone-400">
                            {payout.affiliate_code} · {payout.user_email}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {payout.account_method === "UPI"
                              ? <CreditCard className="h-3.5 w-3.5 text-stone-400" />
                              : <Building className="h-3.5 w-3.5 text-stone-400" />}
                            <span className="font-mono text-[11px]">{payout.destination || "—"}</span>
                          </div>
                          {payout.account_name_match_score != null && (
                            <div className="mt-0.5 text-[10px] text-stone-400">
                              Name match {Math.round(payout.account_name_match_score)}%
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold">{money(payout.grossAmountInr)}</td>
                        <td className="px-5 py-3.5 text-right text-rose-600">
                          −{money(payout.tdsAmountInr)}
                          <span className="ml-1 text-[10px] text-stone-400">
                            @{Math.round(Number(payout.tds_rate || 0) * 100)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-extrabold text-emerald-700">
                          {money(payout.netAmountInr)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                              STATUS_STYLES[payout.status] || "border-stone-200 bg-stone-100 text-stone-600"
                            }`}
                          >
                            {payout.status}
                          </span>
                          {payout.utr_reference && (
                            <div className="mt-1 font-mono text-[10px] text-stone-400">
                              UTR {payout.utr_reference}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {["REQUESTED", "PROCESSING"].includes(payout.status) && (
                            <button
                              onClick={() => openSettlement(payout)}
                              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] font-bold hover:bg-stone-100"
                            >
                              <Eye className="h-3 w-3" />
                              Settle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "creators" && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-3 h-4 w-4 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by code, channel, or email"
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-11 pr-4 text-xs outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
            {rateEdit && (
              <form onSubmit={saveRates} className="m-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs">
                <p className="font-bold text-stone-900">Rates for {rateEdit.affiliate.channel_name}</p>
                <p className="text-stone-600">Both are % of booking value. Leave a field empty to use the {rateEdit.affiliate.tier_code || "STARTER"} tier's rate. Together they must fit the giveaway cap.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block font-semibold text-stone-700">Commission (%)
                    <input type="number" min="0" max="50" step="0.5" value={rateEdit.commissionPct} onChange={(e) => setRateEdit({ ...rateEdit, commissionPct: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5" />
                  </label>
                  <label className="block font-semibold text-stone-700">Audience discount (%)
                    <input type="number" min="0" max="50" step="0.5" value={rateEdit.travelerDiscountPct} onChange={(e) => setRateEdit({ ...rateEdit, travelerDiscountPct: e.target.value })} className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5" />
                  </label>
                  <label className="block font-semibold text-stone-700">Reason
                    <input value={rateEdit.reason} onChange={(e) => setRateEdit({ ...rateEdit, reason: e.target.value })} minLength={3} maxLength={500} required className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5" />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={rateEdit.reason.trim().length < 3} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-stone-950 disabled:opacity-50">Save rates</button>
                  <button type="button" onClick={() => setRateEdit(null)} className="rounded-lg bg-stone-200 px-3 py-1.5 font-bold text-stone-800">Cancel</button>
                </div>
              </form>
            )}
            {affiliates.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-400">
                {loading ? "Loading…" : "No creators found."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 bg-stone-50 font-semibold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-5 py-3.5">Creator</th>
                      <th className="px-5 py-3.5">Tier</th>
                      <th className="px-5 py-3.5 text-right">Referrals</th>
                      <th className="px-5 py-3.5 text-right">Lifetime</th>
                      <th className="px-5 py-3.5">KYC</th>
                      <th className="px-5 py-3.5">Account</th>
                      <th className="px-5 py-3.5">Rates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {affiliates.map((affiliate) => (
                      <tr key={affiliate.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3.5">
                          <button type="button" onClick={() => openDetail(affiliate)} className="text-left font-bold hover:text-amber-800 hover:underline">
                            {affiliate.channel_name}
                          </button>
                          <div className="font-mono text-[10px] text-stone-400">
                            {affiliate.affiliate_code} · {affiliate.user_email}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-bold">
                            {affiliate.tier_code || "STARTER"}
                          </span>
                          <span className="ml-1.5 text-[10px] text-stone-400">
                            {ratePct(affiliate.commission_rate)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">{affiliate.referrals_count}</td>
                        <td className="px-5 py-3.5 text-right font-semibold">
                          {money(affiliate.lifetime_earnings_inr)}
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            aria-label={`KYC for ${affiliate.channel_name}`}
                            value={affiliate.kyc_status}
                            onChange={(event) => askKyc(affiliate, event.target.value)}
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold"
                          >
                            {["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"].map((value) => (
                              <option key={value} value={value} disabled={value === "UNVERIFIED"}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1 font-mono text-[10px] text-stone-400">
                            {affiliate.pan_number ? `PAN ${affiliate.pan_number}${affiliate.pan_verified ? " ✓" : ""}` : "No PAN yet"}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            aria-label={`Account status for ${affiliate.channel_name}`}
                            value={affiliate.status}
                            onChange={(event) => askStatus(affiliate, event.target.value)}
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold"
                          >
                            {["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"].map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setRateEdit({
                              affiliate,
                              commissionPct: affiliate.commission_override_rate === null || affiliate.commission_override_rate === undefined ? "" : String(Math.round(Number(affiliate.commission_override_rate) * 10000) / 100),
                              travelerDiscountPct: affiliate.traveler_discount_override_pct ?? "",
                              reason: "",
                            })}
                            className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold hover:border-amber-500"
                          >
                            {ratePct(affiliate.commission_rate)}% + {Number(affiliate.traveler_discount_pct || 0)}%
                            {(affiliate.commission_override_rate !== null && affiliate.commission_override_rate !== undefined) || (affiliate.traveler_discount_override_pct !== null && affiliate.traveler_discount_override_pct !== undefined) ? " · own" : ""}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settlement drawer: the only place a full account number appears. */}
      {openPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl sm:p-8">
            <button
              onClick={() => setOpenPayout(null)}
              className="absolute right-5 top-5 cursor-pointer p-1 font-bold text-stone-400 hover:text-stone-600"
            >
              ✕
            </button>

            <h3 className="font-display text-xl font-bold">Settle payout</h3>
            <p className="mb-5 text-xs text-stone-500">
              {openPayout.channel_name} · {openPayout.affiliate_code}
            </p>

            {instrumentLoading && (
              <div className="py-8 text-center text-xs text-stone-400">Loading bank details…</div>
            )}

            {instrument?.error && (
              <div className="mb-4 rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">
                {instrument.error}
              </div>
            )}

            {instrument?.instrument && (
              <>
                <div className="mb-4 space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs">
                  {instrument.instrument.method === "UPI" ? (
                    <div className="flex justify-between">
                      <span className="text-stone-500">UPI ID</span>
                      <span className="font-mono font-bold">{instrument.instrument.upiId}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Account number</span>
                        <span className="font-mono font-bold">{instrument.instrument.accountNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">IFSC</span>
                        <span className="font-mono font-bold">{instrument.instrument.ifsc}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Beneficiary</span>
                        <span className="font-bold">{instrument.instrument.accountHolder}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Bank</span>
                        <span>{instrument.instrument.bankName || "—"}</span>
                      </div>
                    </>
                  )}
                  {instrument.instrument.nameMatchScore != null && (
                    <div className="flex justify-between border-t border-stone-200 pt-2">
                      <span className="text-stone-500">Name match at bank</span>
                      <span className="font-bold">{Math.round(instrument.instrument.nameMatchScore)}%</span>
                    </div>
                  )}
                </div>

                <div className="mb-5 space-y-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-600">Gross commission</span>
                    <span className="font-semibold">{money(instrument.amounts.grossInr)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-600">
                      TDS @ {Math.round(Number(instrument.amounts.tdsRate || 0) * 100)}%
                    </span>
                    <span className="font-semibold text-rose-600">−{money(instrument.amounts.tdsInr)}</span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-500/20 pt-1.5">
                    <span className="font-bold">Transfer this amount</span>
                    <span className="font-extrabold text-emerald-700">{money(instrument.amounts.netInr)}</span>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Bank UTR reference</label>
                <input
                  value={utr}
                  onChange={(event) => setUtr(event.target.value)}
                  placeholder="e.g. HDFCN52024090112345"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={settle}
                disabled={acting || !utr.trim()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark as paid
              </button>

              <div className="border-t border-stone-200 pt-3">
                <label className="mb-1 block text-xs font-semibold">Or reject, returning the balance</label>
                <input
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Reason, e.g. bank returned the transfer"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  onClick={reject}
                  disabled={acting || !rejectReason.trim()}
                  className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-500/30 py-2.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  Reject payout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} aria-label="Creator details">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold">{detail.affiliate.channel_name}</h3>
                <p className="font-mono text-[11px] text-stone-500">{detail.affiliate.affiliate_code} · {detail.affiliate.user_email}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="rounded-lg p-1 text-stone-400 hover:text-stone-700"><X className="h-5 w-5" /></button>
            </div>
            {detail.loading && <p className="text-xs text-stone-400">Loading…</p>}
            {detail.error && <p className="rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-700">{detail.error}</p>}
            {detail.balances && (
              <div className="space-y-5 text-xs">
                <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["Trip not done yet", detail.balances.pendingInr],
                    ["Clearing (hold)", detail.balances.onHoldInr],
                    ["Withdrawable", detail.balances.withdrawableInr],
                    ["Payout requested", detail.balances.reservedInr],
                    ["Paid (gross)", detail.balances.paidInr],
                    ["TDS withheld", detail.balances.tdsWithheldInr],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-stone-200 p-3">
                      <span className="block text-[10px] font-bold text-stone-500">{label}</span>
                      <span className="font-mono text-sm font-extrabold">{money(value)}</span>
                    </div>
                  ))}
                </section>
                <p className="text-stone-500">{detail.clicks30d} link clicks in the last 30 days.</p>

                <section>
                  <h4 className="mb-2 font-bold">Payout accounts</h4>
                  {detail.accounts.length === 0 ? <p className="text-stone-500">None added. The creator can't be paid until they add one.</p> : (
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                      {detail.accounts.map((account) => (
                        <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <span className="font-mono">{account.label}{account.isPrimary ? " · primary" : ""}{account.status !== "ACTIVE" ? " · archived" : ""}</span>
                          <span className={`font-bold ${account.isUsable ? "text-emerald-700" : "text-amber-700"}`}>
                            {account.verificationStatus}{account.nameMatchScore != null ? ` · name ${Math.round(account.nameMatchScore)}%` : ""}{account.verificationStatus === "VERIFIED" && !account.isUsable && account.status === "ACTIVE" ? " · cooling off" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 font-bold">What sells (campaign labels)</h4>
                  {detail.campaigns.length === 0 ? <p className="text-stone-500">No bookings yet.</p> : (
                    <ul className="space-y-1">
                      {detail.campaigns.map((campaign) => (
                        <li key={campaign.subId || "none"} className="flex justify-between"><span className="font-mono">{campaign.subId || "(no label)"}</span><span>{campaign.bookings} booking{campaign.bookings === 1 ? "" : "s"} · {money(campaign.earningInr)}</span></li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 font-bold">Recent referrals</h4>
                  {detail.referrals.length === 0 ? <p className="text-stone-500">None yet.</p> : (
                    <table className="w-full text-left">
                      <thead className="text-[10px] uppercase tracking-wider text-stone-500"><tr><th className="py-1.5 pr-2">Booking</th><th className="py-1.5 pr-2">Via</th><th className="py-1.5 pr-2 text-right">Earning</th><th className="py-1.5">Status</th></tr></thead>
                      <tbody className="divide-y divide-stone-100">
                        {detail.referrals.map((referral) => (
                          <tr key={referral.id}>
                            <td className="py-1.5 pr-2 font-mono">{referral.booking_ref || "—"}<span className="block text-[10px] text-stone-400">{String(referral.created_at || "").slice(0, 10)}</span></td>
                            <td className="py-1.5 pr-2">{referral.attribution_type === "REFERRAL_LINK" ? "Link" : "Coupon"}{referral.sub_id ? ` · ${referral.sub_id}` : ""}</td>
                            <td className="py-1.5 pr-2 text-right font-mono">{money(referral.earning_inr)} <span className="text-[10px] text-stone-400">@{ratePct(referral.commission_rate)}%</span></td>
                            <td className="py-1.5">{referral.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}

      <ReasonDialog request={decision} busy={deciding} onConfirm={confirmDecision} onCancel={() => setDecision(null)} />
    </div>
  );
}
