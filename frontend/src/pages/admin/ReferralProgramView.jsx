import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { api } from "../../lib/api.js";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const pct = (value) => `${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;

const SIGNAL_LABELS = {
  SELF_REFERRAL: "Referred their own account",
  SAME_PHONE: "Same phone as referrer",
  EMAIL_ALIAS: "Same mailbox as referrer",
  SAME_DEVICE: "Signed up from referrer's browser",
  NOT_NEW_TRAVELER: "Had already booked before",
  SIGNUP_VELOCITY: "Many signups in 24 hours",
  EARNING_VELOCITY: "High earnings in 30 days",
};

/**
 * Travel & Earn operations: what the program costs as a share of the margin it
 * brings in, and the rewards and pairings waiting for a person to decide.
 */
export default function ReferralProgramView() {
  const [days, setDays] = useState(90);
  const [metrics, setMetrics] = useState(null);
  const [queue, setQueue] = useState({ rewards: [], blockedRelationships: [], signals: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acting, setActing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api.getReferralMetrics(days), api.getReferralReviewQueue()])
      .then(([metricsRes, queueRes]) => {
        setMetrics(metricsRes);
        setQueue(queueRes);
      })
      .catch((err) => setError(err.message || "Referral data couldn't be loaded"))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (rewardId, decision) => {
    setActing(rewardId);
    setError("");
    try {
      await api.reviewReferralReward(rewardId, { decision });
      setNotice(decision === "APPROVE" ? "Approved. The credit reaches the wallet on the next run, within 5 minutes." : "Rejected. No credit will be issued.");
      load();
    } catch (err) {
      setError(err.message || "The decision couldn't be saved");
    } finally {
      setActing(null);
    }
  };

  const reopen = async (relationshipId) => {
    setActing(relationshipId);
    setError("");
    try {
      await api.setReferralRelationshipStatus(relationshipId, { status: "ACTIVE" });
      setNotice("Referral reopened. The friend's future trips will earn for the referrer.");
      load();
    } catch (err) {
      setError(err.message || "The referral couldn't be reopened");
    } finally {
      setActing(null);
    }
  };

  const costHealthy = !metrics || metrics.costPctOfMargin <= 20;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Travel &amp; Earn</h1>
          <p className="mt-0.5 text-xs text-stone-500">Traveler referrals: cost against margin, and rewards that need a decision.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="referral-window" className="sr-only">Time window</label>
          <select id="referral-window" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs font-bold">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {metrics && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Cost as share of margin" value={pct(metrics.costPctOfMargin)} tone={costHealthy ? "good" : "bad"}
              note={`${money(metrics.costInr)} of ${money(metrics.referredMarginInr)} earned on referred trips`} />
            <Stat label="New travelers from referrals" value={metrics.referredFirstTrips}
              note={`${pct(metrics.clickToFirstTripPct)} of ${metrics.clicks} link clicks`} />
            <Stat label="Referred bookings" value={metrics.referredPaidBookings}
              note={`${money(metrics.referredGmvInr)} in bookings`} />
            <Stat label="Viral coefficient" value={metrics.viralCoefficient}
              note="New referred travelers per paying traveler" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Where the money went" icon={TrendingUp}>
              <Row label="Friend discounts" value={money(metrics.friendDiscountsInr)} />
              <Row label="Referrer credit cleared" value={money(metrics.referrerCreditClearedInr)} />
              <Row label="Credit reversed on refunds" value={`${metrics.reversals.count} · ${money(metrics.reversals.amountInr)}`} />
            </Panel>
            <Panel title="Wallet credit" icon={Users}>
              <Row label="Issued" value={money(metrics.wallet.issuedInr)} />
              <Row label="Spent on bookings" value={money(metrics.wallet.redeemedInr)} />
              <Row label="Expired unspent" value={`${money(metrics.wallet.expiredInr)} (${pct(metrics.wallet.breakagePct)})`} />
              <Row label="Ledger mismatches" value={metrics.walletDiscrepancies} tone={metrics.walletDiscrepancies ? "bad" : "good"} />
            </Panel>
            <Panel title="Abuse checks" icon={ShieldAlert}>
              {metrics.fraudSignals.length === 0 ? (
                <p className="text-xs text-stone-500">No signals in this window.</p>
              ) : metrics.fraudSignals.map((signal) => (
                <Row key={`${signal.signal}-${signal.action}`} label={`${SIGNAL_LABELS[signal.signal] || signal.signal} (${signal.action.toLowerCase().replaceAll("_", " ")})`} value={signal.count} />
              ))}
            </Panel>
          </div>
        </>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-bold">Rewards waiting for review <span className="text-stone-400">({queue.rewards.length})</span></h2>
        <p className="mt-0.5 text-xs text-stone-500">Held because the referrer earned a lot quickly or brought in many signups at once.</p>
        {queue.rewards.length === 0 ? (
          <p className="mt-4 text-xs text-stone-500">Nothing to review.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-stone-500">
                <tr><th className="py-2 pr-3">Referrer</th><th className="py-2 pr-3">Friend</th><th className="py-2 pr-3">Booking</th><th className="py-2 pr-3 text-right">Credit</th><th className="py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {queue.rewards.map((reward) => (
                  <tr key={reward.id}>
                    <td className="py-2.5 pr-3"><span className="font-semibold">{reward.referrer_name}</span><span className="block text-stone-500">{reward.referrer_email}</span></td>
                    <td className="py-2.5 pr-3">{reward.friend_name}</td>
                    <td className="py-2.5 pr-3 font-mono">{reward.booking_ref} · {money(reward.amount_inr)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono font-bold">{money(reward.referrer_amount_inr)}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button disabled={acting === reward.id} onClick={() => decide(reward.id, "APPROVE")} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">Approve</button>
                      <button disabled={acting === reward.id} onClick={() => decide(reward.id, "REJECT")} className="ml-2 rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 disabled:opacity-50">Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-bold">Blocked referrals <span className="text-stone-400">({queue.blockedRelationships.length})</span></h2>
        <p className="mt-0.5 text-xs text-stone-500">Pairings that looked like one person on two accounts. Reopen one only if they're genuinely different people, such as family sharing a phone.</p>
        {queue.blockedRelationships.length === 0 ? (
          <p className="mt-4 text-xs text-stone-500">No blocked referrals.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {queue.blockedRelationships.map((relationship) => (
              <li key={relationship.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
                <span>
                  <strong>{relationship.referrer_name}</strong> referred <strong>{relationship.friend_name}</strong>
                  <span className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">{SIGNAL_LABELS[relationship.blocked_reason] || relationship.blocked_reason}</span>
                </span>
                <button disabled={acting === relationship.id} onClick={() => reopen(relationship.id)} className="rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 disabled:opacity-50">Reopen</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, note, tone = null }) {
  const toneClass = tone === "bad" ? "text-rose-700" : tone === "good" ? "text-emerald-700" : "text-stone-900";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <span className="text-[11px] font-bold text-stone-500">{label}</span>
      <span className={`mt-1 block font-mono text-2xl font-extrabold tabular-nums ${toneClass}`}>{value}</span>
      <span className="mt-1 block text-[11px] text-stone-500">{note}</span>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4 text-amber-700" aria-hidden="true" /> {title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, tone = null }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-stone-600">{label}</span>
      <span className={`font-mono font-bold tabular-nums ${tone === "bad" ? "text-rose-700" : "text-stone-900"}`}>{value}</span>
    </div>
  );
}
