import React, { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../lib/api.js";

const emptyPromo = () => ({
  label: "",
  code: "",
  discountType: "PERCENT",
  discountValue: "",
  window: "ALWAYS",
  leadHours: "",
  travelFrom: "",
  travelUntil: "",
  maxRedemptions: "",
  priority: 0,
});

const WINDOWS = [
  ["ALWAYS", "Runs all the time"],
  ["LAST_MINUTE", "Last minute — booked close to departure"],
  ["EARLY_BIRD", "Early bird — booked well ahead"],
];

/**
 * Supplier-run promotions for one booking option.
 *
 * Distinct from platform promo codes at checkout: these discount the departure's
 * own rate and can key on how far ahead the traveler books.
 */
export default function SupplierPromotionsPanel({ base, optionId, baseRules }) {
  const [promotions, setPromotions] = useState([]);
  const [draft, setDraft] = useState(emptyPromo);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = `${base}/${optionId}/promotions`;

  const load = useCallback(() => {
    if (!optionId) return;
    setLoading(true);
    fetch(url, { headers: authHeaders() })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPromotions(data.promotions || []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [url, optionId]);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  async function addPromotion(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const lead = draft.leadHours === "" ? null : Number(draft.leadHours);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          code: draft.code.trim() ? draft.code.trim() : null,
          discountType: draft.discountType,
          discountValue: Number(draft.discountValue),
          maxLeadHours: draft.window === "LAST_MINUTE" ? lead : null,
          minLeadHours: draft.window === "EARLY_BIRD" ? lead : null,
          travelFrom: draft.travelFrom || null,
          travelUntil: draft.travelUntil || null,
          maxRedemptions: draft.maxRedemptions === "" ? 0 : Number(draft.maxRedemptions),
          priority: Number(draft.priority) || 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft(emptyPromo());
      setMessage("Promotion added.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function removePromotion(promotionId) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${url}/${promotionId}`, { method: "DELETE", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Promotion removed.");
      load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 p-2 text-stone-900";
  const describe = (promo) => {
    const off = promo.discount_type === "PERCENT" ? `${promo.discount_value}% off` : `₹${promo.discount_value} off`;
    const when = promo.max_lead_hours != null ? `within ${promo.max_lead_hours}h of departure`
      : promo.min_lead_hours != null ? `booked ${promo.min_lead_hours}h+ ahead`
      : "any booking time";
    const cap = Number(promo.max_redemptions) > 0 ? ` · ${promo.redeemed}/${promo.max_redemptions} used` : "";
    return `${off} · ${when}${cap}`;
  };

  return (
    <div className="mt-4">
      <p className="text-stone-600">
        Discount this option&rsquo;s current rate. A promotion comes off whatever price applies that
        day, including a seasonal rate. Leave the code blank to show the deal to everyone, or set one
        so only travelers who enter it get the price.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Current rate: ₹{Number(baseRules?.adultPrice || 0)} adult · ₹{Number(baseRules?.childPrice || 0)} child.
        Only one promotion ever applies — the highest priority, then the deepest discount.
      </p>

      <form onSubmit={addPromotion} className="mt-4 rounded-xl border border-stone-200 p-3">
        <h3 className="font-semibold">Add a promotion</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>Name (optional)
            <input type="text" maxLength={120} className={inputClass} placeholder="Monsoon flash sale"
              value={draft.label} onChange={e => update("label", e.target.value)} />
          </label>
          <label>Promo code (optional)
            <input type="text" maxLength={60} className={inputClass} placeholder="MONSOON20"
              value={draft.code} onChange={e => update("code", e.target.value)} />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <label>Discount type
            <select className={inputClass} value={draft.discountType} onChange={e => update("discountType", e.target.value)}>
              <option value="PERCENT">Percent off</option>
              <option value="FLAT">₹ off per traveler</option>
            </select>
          </label>
          <label>{draft.discountType === "PERCENT" ? "Percent (%)" : "Amount (₹)"}
            <input required type="number" min="0" max={draft.discountType === "PERCENT" ? 100 : undefined} step="1"
              className={inputClass} value={draft.discountValue} onChange={e => update("discountValue", e.target.value)} />
          </label>
          <label>Priority
            <input type="number" min="0" max="1000" step="1" className={inputClass}
              value={draft.priority} onChange={e => update("priority", e.target.value)} />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>When it applies
            <select aria-label="When the promotion applies" className={inputClass}
              value={draft.window} onChange={e => update("window", e.target.value)}>
              {WINDOWS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {draft.window !== "ALWAYS" && (
            <label>{draft.window === "LAST_MINUTE" ? "Within (hours of departure)" : "Booked at least (hours ahead)"}
              <input required type="number" min="0" step="1" className={inputClass}
                value={draft.leadHours} onChange={e => update("leadHours", e.target.value)} />
            </label>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <label>Travel from (optional)<input type="date" className={inputClass} value={draft.travelFrom} onChange={e => update("travelFrom", e.target.value)} /></label>
          <label>Travel until (optional)<input type="date" className={inputClass} value={draft.travelUntil} onChange={e => update("travelUntil", e.target.value)} /></label>
          <label>Max redemptions
            <input type="number" min="0" step="1" className={inputClass} placeholder="Unlimited"
              value={draft.maxRedemptions} onChange={e => update("maxRedemptions", e.target.value)} />
          </label>
        </div>
        <button disabled={busy} className="mt-3 rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Add promotion"}
        </button>
      </form>

      <h3 className="mt-5 font-semibold">Current promotions</h3>
      {loading && <p className="mt-2 text-sm text-stone-500">Loading promotions…</p>}
      {!loading && promotions.length === 0 && (
        <p className="mt-2 text-sm text-stone-500">None yet. Travelers pay the seasonal or base rate.</p>
      )}
      <ul className="mt-2 space-y-2">
        {promotions.map(promo => (
          <li key={promo.id} className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3">
            <div>
              <p className="font-semibold">
                {promo.label || "Promotion"}
                {promo.code ? <span className="ml-2 rounded bg-stone-100 px-2 py-0.5 font-mono text-xs">{promo.code}</span>
                  : <span className="ml-2 text-xs font-normal text-emerald-800">shown to everyone</span>}
              </p>
              <p className="text-sm text-stone-600">{describe(promo)}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => removePromotion(promo.id)}
              aria-label={`Remove promotion ${promo.label || promo.code || promo.id}`}
              className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50 disabled:opacity-50">
              Remove
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3">{message}</p>}
    </div>
  );
}
