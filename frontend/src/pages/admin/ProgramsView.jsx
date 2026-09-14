import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, History, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";

const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500";
const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const SAMPLE_BOOKING_INR = 10_000;

// One editable percentage per program. Add an entry here when a phase adds a program.
const PROGRAM_FORMS = {
  commission: {
    field: "defaultRatePercent",
    label: "Default commission (%)",
    help: "What every booking pays unless its product or supplier has its own rate (set those in Listings → Commission Overrides). The supplier receives the rest of the booking value.",
    example: (pct) => <>On a {inr(SAMPLE_BOOKING_INR)} booking, Idea Holiday keeps <strong className="text-stone-900">{inr(SAMPLE_BOOKING_INR * pct / 100)}</strong> and the supplier receives <strong className="text-stone-900">{inr(SAMPLE_BOOKING_INR * (100 - pct) / 100)}</strong>.</>,
    notifyOption: "Notify suppliers on the default rate",
    saved: (settings) => `Default commission is now ${settings.defaultRatePercent}% for new bookings.`,
  },
  giveaway: {
    field: "maxBookingValuePct",
    label: "Share of booking value (%)",
    help: "The most one booking can give away in total: coupon discount, friend discount and referrer credit, and a creator's commission and discount. It is never more than the booking's commission. Discounts come out of commission, never the supplier's payout.",
    example: (pct) => <>On a {inr(SAMPLE_BOOKING_INR)} booking, programs can give away at most <strong className="text-stone-900">{inr(SAMPLE_BOOKING_INR * pct / 100)}</strong>, or less if the commission is lower.</>,
    saved: (settings) => `Giveaway cap is now ${settings.maxBookingValuePct}% for new bookings.`,
  },
};

function describeChange(change) {
  const keys = [...new Set([...Object.keys(change.before || {}), ...Object.keys(change.after || {})])];
  return keys
    .filter((key) => JSON.stringify(change.before?.[key]) !== JSON.stringify(change.after?.[key]))
    .map((key) => `${key}: ${JSON.stringify(change.before?.[key])} → ${JSON.stringify(change.after?.[key])}`)
    .join(", ");
}

function ProgramForm({ program, onSaved, onError }) {
  const form = PROGRAM_FORMS[program.key];
  const [value, setValue] = useState(String(program.settings[form.field]));
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(program.settings[form.field]));
  }, [program, form.field]);

  const pct = Number(value);
  const valid = value !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 50;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await api.adminUpdateProgram(program.key, {
        settings: { [form.field]: pct },
        reason,
        ...(form.notifyOption ? { notify } : {}),
      });
      setReason("");
      onSaved(res.changed ? form.saved(res.settings) : "Nothing changed.");
    } catch (err) {
      onError(err.message || "That change couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-bold">{program.label}</h2>
        <p className="mt-1 text-xs text-stone-500">{form.help}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-stone-700">
          {form.label}
          <input type="number" min="0" max="50" step="0.5" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} mt-1`} required />
        </label>
        <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
          {valid ? form.example(pct) : "Enter a value from 0 to 50%."}
        </div>
      </div>
      <label className="block text-xs font-semibold text-stone-700">
        Reason for the change
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} placeholder="For example: launch budget" className={`${inputClass} mt-1`} required />
      </label>
      {form.notifyOption && (
        <label className="flex items-center gap-2 text-xs text-stone-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {form.notifyOption}
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] text-stone-400">
          {program.updatedAt ? `Last changed ${program.updatedAt}` : `Default ${program.defaults[form.field]}%, not changed yet`}
        </span>
        <button type="submit" disabled={saving || !valid || reason.trim().length < 3} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
          {saving ? "Saving…" : `Save ${program.label.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}

const REFERRAL_FIELDS = [
  ["friendDiscountPct", "Friend's first-trip discount (% of commission)", 0.5],
  ["referrerRewardPct", "Referrer's credit per trip (% of commission)", 0.5],
  ["earningWindowMonths", "Referrer earns for (months after signup)", 1],
  ["attributionWindowDays", "Referral link counts for (days)", 1],
  ["clearingHoldDays", "Credit spendable after trip + (days)", 1],
  ["creditExpiryMonths", "Credit expires after (months)", 1],
  ["expiryReminderDays", "Expiry reminder (days before)", 1],
  ["maxSignupsPerDay", "Review after this many signups a day", 1],
  ["maxClearedPer30DaysInr", "Review above this credit in 30 days (₹)", 100],
  ["walletMaxSharePct", "Wallet can pay at most (% of what's left)", 1],
  ["walletMaxPerBookingInr", "Wallet can pay at most per booking (₹)", 100],
];

/**
 * Share & Earn (BUSINESS_RULES §11). Rewards are a share of commission, so the
 * server refuses rates that would push a booking past the giveaway cap.
 */
function ReferralSettings({ program, commissionRate, onSaved, onError }) {
  const [draft, setDraft] = useState(program.settings);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(program.settings);
  }, [program]);

  const commission = SAMPLE_BOOKING_INR * (Number(commissionRate) || 0) / 100;
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const settings = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, key === "enabled" ? Boolean(value) : Number(value)]));
      const res = await api.adminUpdateProgram("referral", { settings, reason });
      setReason("");
      onSaved(res.changed ? "Share & Earn settings saved for new rewards." : "Nothing changed.");
    } catch (err) {
      onError(err.message || "That change couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-bold">{program.label}</h2>
        <p className="mt-1 text-xs text-stone-500">
          Travelers invite friends: the friend gets a discount on their first trip and the referrer earns wallet credit on every trip the friend takes.
          Both are a share of Idea Holiday's commission. Existing rewards keep the rates they were created with.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
        <input type="checkbox" checked={Boolean(draft.enabled)} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Program on (off pauses new discounts and rewards; earned credit still clears)
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REFERRAL_FIELDS.map(([key, label, step]) => (
          <label key={key} className="block text-xs font-semibold text-stone-700">
            {label}
            <input type="number" min="0" step={step} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={`${inputClass} mt-1`} required />
          </label>
        ))}
      </div>
      <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
        On a {inr(SAMPLE_BOOKING_INR)} booking at {commissionRate}% commission ({inr(commission)}), the friend gets <strong className="text-stone-900">{inr(commission * Number(draft.friendDiscountPct) / 100)}</strong> off their first trip
        and the referrer earns <strong className="text-stone-900">{inr(commission * Number(draft.referrerRewardPct) / 100)}</strong> per trip.
      </div>
      <label className="block text-xs font-semibold text-stone-700">
        Reason for the change
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} placeholder="For example: festival referral push" className={`${inputClass} mt-1`} required />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
          {saving ? "Saving…" : "Save Share & Earn"}
        </button>
      </div>
    </form>
  );
}

function coverLabel(supplier) {
  if (!supplier.covered) return "Not covered: cannot take new bookings";
  const until = supplier.cover?.endsAt ? `until ${supplier.cover.endsAt.slice(0, 10)}` : "with no end date";
  return supplier.cover?.source === "LAUNCH" ? `Launch offer, ${until}` : supplier.cover?.source === "WAIVER" ? `Waived ${until}` : `Subscribed ${until}`;
}

/**
 * Required subscriptions for suppliers who signed up from 2026-09-14 (ADR 017).
 * Until payment exists, the launch waiver covers them; admins can end it, or
 * waive or end cover for one supplier.
 */
function SupplierSubscriptions({ program, onSaved, onError }) {
  const [launchWaiver, setLaunchWaiver] = useState(program.settings.launchWaiver);
  const [until, setUntil] = useState(program.settings.launchWaiverUntil || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [action, setAction] = useState(null); // { kind: 'waive' | 'end', supplier, until, reason }

  const loadSuppliers = useCallback(() => {
    api.adminListSupplierSubscriptions().then((res) => setSuppliers(res.suppliers || [])).catch((err) => onError(err.message));
  }, [onError]);

  useEffect(() => {
    setLaunchWaiver(program.settings.launchWaiver);
    setUntil(program.settings.launchWaiverUntil || "");
    loadSuppliers();
  }, [program, loadSuppliers]);

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await api.adminUpdateProgram("supplier_subscriptions", { settings: { launchWaiver, launchWaiverUntil: until || null }, reason });
      setReason("");
      onSaved(res.changed ? `Launch offer ${res.settings.launchWaiver ? `is on${res.settings.launchWaiverUntil ? ` until ${res.settings.launchWaiverUntil}` : " with no end date"}` : "is off for new sign-ups"}.` : "Nothing changed.");
    } catch (err) {
      onError(err.message || "That change couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (action.kind === "waive") {
        await api.adminWaiveSupplierSubscription(action.supplier.id, { until: action.until || null, reason: action.reason });
        onSaved(`${action.supplier.name} can take bookings${action.until ? ` until ${action.until}` : " with no end date"}.`);
      } else {
        await api.adminEndSupplierSubscription(action.supplier.cover.id, { reason: action.reason });
        onSaved(`${action.supplier.name}'s cover has ended.`);
      }
      setAction(null);
      loadSuppliers();
    } catch (err) {
      onError(err.message || "That change couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <form onSubmit={saveSettings} className="space-y-4">
        <div>
          <h2 className="text-sm font-bold">{program.label}</h2>
          <p className="mt-1 text-xs text-stone-500">
            Suppliers who signed up from 14 September 2026 need a subscription to take bookings; earlier suppliers are exempt.
            Until online payment is available, the launch offer covers new suppliers for free. Bookings already made are never affected.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
            <input type="checkbox" checked={launchWaiver} onChange={(e) => setLaunchWaiver(e.target.checked)} /> Launch offer on for new suppliers
          </label>
          <label className="block text-xs font-semibold text-stone-700">
            Launch offer ends (empty = no end date yet)
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-stone-700">
          Reason for the change
          <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} placeholder="For example: launch offer ends with paid plans" className={`${inputClass} mt-1`} required />
        </label>
        <p className="text-[11px] text-stone-500">Changing the end date applies to every launch offer already given. Turning the offer off only stops new ones.</p>
        <div className="flex justify-end">
          <button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">
            {saving ? "Saving…" : "Save launch offer"}
          </button>
        </div>
      </form>

      <div className="border-t border-stone-100 pt-4">
        <h3 className="text-xs font-bold text-stone-900">New suppliers ({suppliers.length})</h3>
        {action && (
          <form onSubmit={runAction} className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs">
            <p className="font-bold text-stone-900">{action.kind === "waive" ? `Waive the subscription for ${action.supplier.name}` : `End ${action.supplier.name}'s cover now`}</p>
            {action.kind === "waive" && (
              <label className="block font-semibold text-stone-700">
                Free until (empty = no end date)
                <input type="date" value={action.until} onChange={(e) => setAction({ ...action, until: e.target.value })} className={`${inputClass} mt-1`} />
              </label>
            )}
            <label className="block font-semibold text-stone-700">
              Reason
              <input value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} minLength={3} maxLength={500} required className={`${inputClass} mt-1`} />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving || action.reason.trim().length < 3} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-stone-950 disabled:opacity-50">{action.kind === "waive" ? "Waive" : "End cover"}</button>
              <button type="button" onClick={() => setAction(null)} className="rounded-xl bg-stone-200 px-4 py-2 font-bold text-stone-800">Cancel</button>
            </div>
          </form>
        )}
        {suppliers.length === 0 ? (
          <p className="mt-2 text-xs text-stone-500">No suppliers have signed up since 14 September 2026.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100">
            {suppliers.map((supplier) => (
              <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <strong className="block truncate text-stone-900">{supplier.name}</strong>
                  <span className={supplier.covered ? "text-emerald-700" : "text-rose-700"}>{coverLabel(supplier)}</span>
                  <span className="text-stone-400"> · KYB {supplier.kybStatus}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAction({ kind: "waive", supplier, until: "", reason: "" })} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">Waive</button>
                  {supplier.cover && (
                    <button type="button" onClick={() => setAction({ kind: "end", supplier, reason: "" })} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold text-rose-700 hover:border-rose-400">End</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Settings for the money programs (ADR 017). Every change needs a reason, is
 * kept in the history below, and applies to new bookings only.
 */
export default function ProgramsView() {
  const [programs, setPrograms] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([api.adminListPrograms(), api.adminProgramAudit()])
      .then(([programRes, auditRes]) => {
        setPrograms(programRes.programs || []);
        setChanges(auditRes.changes || []);
      })
      .catch((err) => setError(err.message || "Program settings couldn't be loaded"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = useCallback((message) => {
    setError("");
    setNotice(message);
    load();
  }, [load]);
  const onError = useCallback((message) => {
    setNotice("");
    setError(message);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Programs</h1>
          <p className="mt-0.5 text-xs text-stone-500">Commission and limits for coupons, referrals and creators. Changes apply to new bookings only; existing bookings keep their rates.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 self-start rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {programs.filter((program) => PROGRAM_FORMS[program.key]).map((program) => (
        <ProgramForm key={program.key} program={program} onSaved={onSaved} onError={onError} />
      ))}
      {programs.filter((program) => program.key === "referral").map((program) => (
        <ReferralSettings key={program.key} program={program} commissionRate={programs.find((p) => p.key === "commission")?.settings.defaultRatePercent ?? 30} onSaved={onSaved} onError={onError} />
      ))}
      {programs.filter((program) => program.key === "supplier_subscriptions").map((program) => (
        <SupplierSubscriptions key={program.key} program={program} onSaved={onSaved} onError={onError} />
      ))}

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold"><History className="h-4 w-4" aria-hidden="true" /> Change history</h2>
        {changes.length === 0 ? (
          <p className="mt-3 text-xs text-stone-500">No changes yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {changes.map((change) => (
              <li key={change.id} className="py-3 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong className="text-stone-900">{programs.find((p) => p.key === change.key)?.label || change.key}</strong>
                  <span className="text-stone-400">{change.createdAt} · {change.changedByName || change.changedBy || "Unknown"}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-stone-600">{describeChange(change)}</p>
                <p className="mt-0.5 text-stone-500">“{change.reason}”</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
