import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, RefreshCw, X } from "lucide-react";
import { api } from "../../lib/api.js";

const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";
const inr = (value) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
const PRODUCT_TYPES = ["ATTRACTION", "EXPERIENCE", "TRANSFER", "TOUR", "PACKAGE"];

const EMPTY = {
  code: "", description: "", discountType: "PERCENTAGE", discountValue: "", minOrderInr: "", maxDiscountInr: "",
  usageLimit: "", perUserLimit: "", firstBookingOnly: false, startsAt: "", expiresAt: "",
  productTypes: [], productIds: "", supplierIds: "", isActive: true,
};

const numberOrNull = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
const idList = (value) => String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);

function toForm(coupon) {
  return {
    ...EMPTY,
    ...coupon,
    discountValue: String(coupon.discountValue),
    minOrderInr: coupon.minOrderInr ? String(coupon.minOrderInr) : "",
    maxDiscountInr: coupon.maxDiscountInr ?? "",
    usageLimit: coupon.usageLimit ?? "",
    perUserLimit: coupon.perUserLimit ?? "",
    startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
    expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
    productIds: coupon.productIds.join(", "),
    supplierIds: coupon.supplierIds.join(", "),
  };
}

function summary(coupon) {
  const off = coupon.discountType === "PERCENTAGE"
    ? `${coupon.discountValue}% off${coupon.maxDiscountInr ? ` up to ${inr(coupon.maxDiscountInr)}` : ""}`
    : `${inr(coupon.discountValue)} off`;
  const rules = [
    coupon.minOrderInr ? `min ${inr(coupon.minOrderInr)}` : null,
    coupon.perUserLimit ? `${coupon.perUserLimit}× per traveler` : null,
    coupon.firstBookingOnly ? "first booking only" : null,
    coupon.productTypes.length ? coupon.productTypes.join("/") : null,
    coupon.productIds.length ? `${coupon.productIds.length} products` : null,
    coupon.supplierIds.length ? `${coupon.supplierIds.length} suppliers` : null,
    coupon.startsAt ? `from ${coupon.startsAt.slice(0, 10)}` : null,
    coupon.expiresAt ? `until ${coupon.expiresAt.slice(0, 10)}` : null,
  ].filter(Boolean);
  return [off, ...rules].join(" · ");
}

/**
 * Admin coupons (ADR 017). The discount comes out of commission and is cut to
 * the giveaway cap at checkout. Coupons are deactivated, never deleted.
 */
export default function CouponsView() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // { id | null, form }
  const [report, setReport] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.adminListCoupons()
      .then((res) => setCoupons(res.coupons || []))
      .catch((err) => setError(err.message || "Coupons couldn't be loaded"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setEditing((current) => ({ ...current, form: { ...current.form, [key]: value } }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { form } = editing;
    const payload = {
      description: form.description || null,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderInr: Number(form.minOrderInr) || 0,
      maxDiscountInr: numberOrNull(form.maxDiscountInr),
      usageLimit: numberOrNull(form.usageLimit),
      perUserLimit: numberOrNull(form.perUserLimit),
      firstBookingOnly: Boolean(form.firstBookingOnly),
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
      productTypes: form.productTypes,
      productIds: idList(form.productIds),
      supplierIds: idList(form.supplierIds),
      isActive: Boolean(form.isActive),
    };
    try {
      if (editing.id) {
        await api.adminUpdateCoupon(editing.id, payload);
        setNotice(`${form.code} saved.`);
      } else {
        const res = await api.adminCreateCoupon({ code: form.code, ...payload });
        setNotice(`${res.coupon.code} created.`);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message || "That coupon couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (coupon) => {
    setError("");
    try {
      await api.adminUpdateCoupon(coupon.id, { isActive: !coupon.isActive });
      setNotice(`${coupon.code} is now ${coupon.isActive ? "off" : "on"}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openReport = async (coupon) => {
    setError("");
    try {
      setReport(await api.adminCouponRedemptions(coupon.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const form = editing?.form;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Coupons</h1>
          <p className="mt-0.5 text-xs text-stone-500">Codes travelers type at checkout. The discount comes out of commission and is cut to the giveaway cap. Coupons are switched off, never deleted.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
          <button onClick={() => { setEditing({ id: null, form: EMPTY }); setReport(null); }} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New coupon
          </button>
        </div>
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

      {editing && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-amber-300 bg-white p-5 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{editing.id ? `Edit ${form.code}` : "New coupon"}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-1 hover:bg-stone-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block font-semibold text-stone-700">Code
              <input value={form.code} onChange={(e) => setField("code", e.target.value.toUpperCase())} disabled={Boolean(editing.id)} required minLength={3} maxLength={40} className={`${inputClass} mt-1 font-mono uppercase`} />
            </label>
            <label className="block font-semibold text-stone-700">Discount type
              <select value={form.discountType} onChange={(e) => setField("discountType", e.target.value)} className={`${inputClass} mt-1`}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed rupees</option>
              </select>
            </label>
            <label className="block font-semibold text-stone-700">{form.discountType === "PERCENTAGE" ? "Discount (%)" : "Discount (₹)"}
              <input type="number" min="1" step="1" value={form.discountValue} onChange={(e) => setField("discountValue", e.target.value)} required className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Most off per booking (₹, optional)
              <input type="number" min="1" value={form.maxDiscountInr} onChange={(e) => setField("maxDiscountInr", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700 sm:col-span-2">Description
              <input value={form.description || ""} onChange={(e) => setField("description", e.target.value)} maxLength={300} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Minimum booking (₹)
              <input type="number" min="0" value={form.minOrderInr} onChange={(e) => setField("minOrderInr", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Total uses (empty = no limit)
              <input type="number" min="1" value={form.usageLimit} onChange={(e) => setField("usageLimit", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Uses per traveler (empty = no limit)
              <input type="number" min="1" value={form.perUserLimit} onChange={(e) => setField("perUserLimit", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Starts (optional)
              <input type="date" value={form.startsAt} onChange={(e) => setField("startsAt", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block font-semibold text-stone-700">Ends (optional)
              <input type="date" value={form.expiresAt} onChange={(e) => setField("expiresAt", e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <div className="flex flex-col justify-end gap-2 font-semibold text-stone-700">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.firstBookingOnly} onChange={(e) => setField("firstBookingOnly", e.target.checked)} /> First booking only</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => setField("isActive", e.target.checked)} /> On</label>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-semibold text-stone-700">Only for these product types (none ticked = all)</legend>
            <div className="flex flex-wrap gap-3">
              {PRODUCT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.productTypes.includes(type)} onChange={(e) => setField("productTypes", e.target.checked ? [...form.productTypes, type] : form.productTypes.filter((item) => item !== type))} /> {type}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-semibold text-stone-700">Only these product IDs (comma-separated, optional)
              <input value={form.productIds} onChange={(e) => setField("productIds", e.target.value)} className={`${inputClass} mt-1 font-mono`} />
            </label>
            <label className="block font-semibold text-stone-700">Only these supplier IDs (comma-separated, optional)
              <input value={form.supplierIds} onChange={(e) => setField("supplierIds", e.target.value)} className={`${inputClass} mt-1 font-mono`} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-stone-200 px-4 py-2 font-bold text-stone-800">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-stone-950 disabled:opacity-50">{saving ? "Saving…" : editing.id ? "Save coupon" : "Create coupon"}</button>
          </div>
        </form>
      )}

      {report && (
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Uses of {report.coupon.code}: {report.coupon.redeemedCount} · {inr(report.coupon.discountGivenInr)} given</h2>
            <button type="button" onClick={() => setReport(null)} aria-label="Close" className="rounded-lg p-1 hover:bg-stone-100"><X className="h-4 w-4" /></button>
          </div>
          {report.redemptions.length === 0 ? <p className="text-stone-500">Not used yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase text-stone-500">
                  <tr><th className="py-2 pr-3">Booking</th><th className="pr-3">Traveler</th><th className="pr-3">Discount</th><th className="pr-3">Charged</th><th className="pr-3">Payment</th><th className="pr-3">Use</th><th>When</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {report.redemptions.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-mono">{row.bookingRef || row.bookingId}</td>
                      <td className="pr-3">{row.userName || "—"}</td>
                      <td className="pr-3">{inr(row.discountInr)}</td>
                      <td className="pr-3">{row.chargedInr === null ? "—" : inr(row.chargedInr)}</td>
                      <td className="pr-3">{row.paymentStatus}</td>
                      <td className="pr-3">{row.status === "RELEASED" ? `Given back (${row.releaseReason})` : "Counted"}</td>
                      <td>{row.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-2">
        {coupons.length === 0 ? <p className="p-4 text-xs text-stone-500">No coupons yet.</p> : (
          <ul className="divide-y divide-stone-100">
            {coupons.map((coupon) => (
              <li key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-sm text-stone-900">{coupon.code}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${coupon.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{coupon.isActive ? "On" : "Off"}</span>
                    {coupon.isCreatorCode && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Creator code</span>}
                  </div>
                  <p className="mt-0.5 text-stone-600">{summary(coupon)}</p>
                  <p className="text-stone-400">Used {coupon.timesUsed}{coupon.usageLimit ? ` of ${coupon.usageLimit}` : ""} · {inr(coupon.discountGivenInr)} given{coupon.description ? ` · ${coupon.description}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openReport(coupon)} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">Uses</button>
                  {!coupon.isCreatorCode && (
                    <button type="button" onClick={() => { setEditing({ id: coupon.id, form: toForm(coupon) }); setReport(null); }} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">Edit</button>
                  )}
                  <button type="button" onClick={() => toggle(coupon)} className="rounded-lg border border-stone-300 px-2.5 py-1 font-bold hover:border-amber-500">{coupon.isActive ? "Switch off" : "Switch on"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
