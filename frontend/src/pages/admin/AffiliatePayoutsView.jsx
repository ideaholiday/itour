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
} from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const STATUS_STYLES = {
  REQUESTED: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  PROCESSING: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  PAID: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  REJECTED: "bg-rose-500/10 text-rose-700 border-rose-500/30",
};

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
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

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    Promise.all([
      adminFetch(`/payouts${query}`),
      adminFetch(`/${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    ])
      .then(([payoutRes, affiliateRes]) => {
        setPayouts(payoutRes.payouts || []);
        setAffiliates(affiliateRes.affiliates || []);
      })
      .catch((err) => setError(err.message || "Could not load affiliate data"))
      .finally(() => setLoading(false));
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

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

  const updateKyc = async (affiliateId, kycStatus) => {
    try {
      await adminFetch(`/${encodeURIComponent(affiliateId)}/kyc`, {
        method: "PATCH",
        body: JSON.stringify({ kyc_status: kycStatus }),
      });
      setNotice("KYC status updated.");
      load();
    } catch (err) {
      setError(err.message || "Could not update KYC");
    }
  };

  const updateStatus = async (affiliateId, status) => {
    try {
      await adminFetch(`/${encodeURIComponent(affiliateId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice("Affiliate status updated.");
      load();
    } catch (err) {
      setError(err.message || "Could not update status");
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {affiliates.map((affiliate) => (
                      <tr key={affiliate.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3.5">
                          <div className="font-bold">{affiliate.channel_name}</div>
                          <div className="font-mono text-[10px] text-stone-400">
                            {affiliate.affiliate_code} · {affiliate.user_email}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-[10px] font-bold">
                            {affiliate.tier_code || "STARTER"}
                          </span>
                          <span className="ml-1.5 text-[10px] text-stone-400">
                            {Math.round(Number(affiliate.commission_rate || 0) * 100)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">{affiliate.referrals_count}</td>
                        <td className="px-5 py-3.5 text-right font-semibold">
                          {money(affiliate.lifetime_earnings_inr)}
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            value={affiliate.kyc_status}
                            onChange={(event) => updateKyc(affiliate.id, event.target.value)}
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold"
                          >
                            {["UNVERIFIED", "PENDING_REVIEW", "VERIFIED", "REJECTED"].map((value) => (
                              <option key={value} value={value} disabled={value === "UNVERIFIED"}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            value={affiliate.status}
                            onChange={(event) => updateStatus(affiliate.id, event.target.value)}
                            className="cursor-pointer rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold"
                          >
                            {["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"].map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
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
    </div>
  );
}
