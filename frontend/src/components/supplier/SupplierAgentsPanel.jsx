import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, RefreshCw, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

const inr = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";
const EMPTY = { name: "", contactName: "", phone: "", email: "", commissionPct: 10, markupPct: 10, creditLimitInr: 0, status: "ACTIVE" };
const MODES = [["BANK", "Bank transfer"], ["UPI", "UPI"], ["CASH", "Cash"], ["CARD", "Card"]];

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * The supplier's own agents, hotels and resellers (ADR 039): commission, credit
 * limit, special rates per listing, what each owes, payments and a statement.
 * Bookings for an agent are made from the walk-in drawer.
 */
export default function SupplierAgentsPanel({ supplierId, products = [] }) {
  const base = `/api/suppliers/${supplierId}/agents`;
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [statement, setStatement] = useState(null);
  const [payment, setPayment] = useState({ mode: "BANK", amount_inr: "", reference: "" });
  const [rateDraft, setRateDraft] = useState({ productId: "", commissionPct: "" });

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    request(base).then((data) => setAgents(data.agents || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const openStatement = useCallback((agentId) => {
    setSelected(agentId);
    setStatement(null);
    request(`${base}/${agentId}/statement`).then(setStatement).catch((err) => setError(err.message));
  }, [base]);

  const run = async (action, message) => {
    setError(""); setNotice("");
    try {
      await action();
      if (message) setNotice(message);
      load();
      if (selected) openStatement(selected);
    } catch (err) { setError(err.message); }
  };

  const save = (event) => {
    event.preventDefault();
    const body = { ...editing, commissionPct: Number(editing.commissionPct), markupPct: Number(editing.markupPct || 0), creditLimitInr: Number(editing.creditLimitInr), phone: editing.phone || null, email: editing.email || null, contactName: editing.contactName || null };
    delete body.id;
    run(async () => {
      await request(editing.id ? `${base}/${editing.id}` : base, { method: editing.id ? "PUT" : "POST", body: JSON.stringify(body) });
      setEditing(null);
    }, `${editing.name} saved.`);
  };

  const recordPayment = (event) => {
    event.preventDefault();
    run(async () => {
      const data = await request(`${base}/${selected}/payments`, { method: "POST", body: JSON.stringify({ mode: payment.mode, amount_inr: Number(payment.amount_inr), reference: payment.reference || null }) });
      setPayment({ mode: payment.mode, amount_inr: "", reference: "" });
      setNotice(`Payment applied to ${data.applied.map((entry) => entry.ref).join(", ")}. ${data.agent.name} now owes ${inr(data.agent.owedInr)}.`);
    });
  };

  const saveRates = (rates) => run(() => request(`${base}/${selected}/rates`, { method: "PUT", body: JSON.stringify({ rates }) }), "Special rates saved.");
  const agent = agents.find((row) => row.id === selected);
  const productTitle = (id) => products.find((product) => product.id === id)?.title || id;

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-stone-900">Agents</h2>
          <p className="mt-1 text-sm text-stone-600">Your travel agents, hotels and resellers. Book for them from the Walk-in drawer (choose Agent).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
          <button onClick={() => setEditing({ ...EMPTY })} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400"><Plus className="h-3.5 w-3.5" /> Add agent</button>
        </div>
      </div>

      {notice && <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p>}
      {error && <p role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

      {editing && (
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-stone-700">Agency, hotel or reseller<input required minLength={2} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Contact person<input value={editing.contactName || ""} onChange={(event) => setEditing({ ...editing, contactName: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Phone<input value={editing.phone || ""} placeholder="+91 98765 43210" onChange={(event) => setEditing({ ...editing, phone: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Email<input type="email" value={editing.email || ""} onChange={(event) => setEditing({ ...editing, email: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Commission %<input type="number" min={0} max={90} step="0.5" required value={editing.commissionPct} onChange={(event) => setEditing({ ...editing, commissionPct: event.target.value })} className={`mt-1 ${inputClass}`} /><span className="mt-1 block font-normal text-stone-500">Direct bookings: they pay the price minus this.</span></label>
          <label className="text-xs font-bold text-stone-700">Package markup %<input type="number" min={0} max={200} step="0.5" value={editing.markupPct || 0} onChange={(event) => setEditing({ ...editing, markupPct: event.target.value })} className={`mt-1 ${inputClass}`} /><span className="mt-1 block font-normal text-stone-500">Quotation trade PDF: their net = your costs + this markup + GST.</span></label>
          <label className="text-xs font-bold text-stone-700">Credit limit (₹)<input type="number" min={0} step="100" required value={editing.creditLimitInr} onChange={(event) => setEditing({ ...editing, creditLimitInr: event.target.value })} className={`mt-1 ${inputClass}`} /><span className="mt-1 block font-normal text-stone-500">0 means they pay at booking.</span></label>
          {editing.id && <label className="text-xs font-bold text-stone-700">Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className={`mt-1 ${inputClass}`}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (can't book)</option></select></label>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400">Save</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-stone-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-500">
            <tr><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3 text-right">Owes</th><th className="px-4 py-3 text-right">Credit left</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {agents.map((row) => (
              <tr key={row.id} className={row.status === "INACTIVE" ? "text-stone-400" : ""}>
                <td className="px-4 py-3"><strong className="block">{row.name}</strong><span className="text-xs text-stone-500">{[row.contactName, row.phone].filter(Boolean).join(" · ") || "—"}{row.status === "INACTIVE" ? " · inactive" : ""}</span></td>
                <td className="px-4 py-3">{row.commissionPct}%{row.rates.length ? <span className="block text-xs text-stone-500">+ {row.rates.length} special</span> : null}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{inr(row.owedInr)}</td>
                <td className="px-4 py-3 text-right font-mono">{inr(row.availableCreditInr)}<span className="block text-xs text-stone-400">of {inr(row.creditLimitInr)}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openStatement(row.id)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-50">Statement</button>
                  <button onClick={() => setEditing({ ...row })} className="ml-2 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold hover:bg-stone-50">Edit</button>
                </td>
              </tr>
            ))}
            {!agents.length && !loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-stone-500">No agents yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {agent && (
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-base font-bold text-stone-900">{agent.name}</h3><p className="text-xs text-stone-500">Owes {inr(agent.owedInr)} · credit left {inr(agent.availableCreditInr)}</p></div>
            <button onClick={() => { setSelected(null); setStatement(null); }} aria-label="Close statement" className="rounded-lg p-1 text-stone-500 hover:bg-stone-200"><X className="h-4 w-4" /></button>
          </div>

          {agent.owedInr > 0 && (
            <form onSubmit={recordPayment} className="flex flex-wrap items-end gap-2">
              <select value={payment.mode} onChange={(event) => setPayment({ ...payment, mode: event.target.value })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" aria-label="Payment mode">{MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <input type="number" required min={1} max={agent.owedInr} placeholder="Amount (₹)" value={payment.amount_inr} onChange={(event) => setPayment({ ...payment, amount_inr: event.target.value })} className="w-32 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" aria-label="Amount" />
              <input placeholder="Reference" value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className="w-40 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" aria-label="Reference" />
              <button type="submit" className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white">Record payment</button>
              <span className="text-xs text-stone-500">Applied to the oldest trips first.</span>
            </form>
          )}

          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-500">Special rates</h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              {agent.rates.map((rate) => (
                <li key={rate.productId} className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs">
                  {productTitle(rate.productId)} · {rate.commissionPct}%
                  <button onClick={() => saveRates(agent.rates.filter((item) => item.productId !== rate.productId))} aria-label={`Remove special rate for ${productTitle(rate.productId)}`} className="rounded-full p-0.5 hover:bg-stone-100"><X className="h-3 w-3" /></button>
                </li>
              ))}
              {!agent.rates.length && <li className="text-xs text-stone-500">Every listing at {agent.commissionPct}%.</li>}
            </ul>
            <form onSubmit={(event) => { event.preventDefault(); saveRates([...agent.rates.filter((item) => item.productId !== rateDraft.productId), { productId: rateDraft.productId, commissionPct: Number(rateDraft.commissionPct) }]); setRateDraft({ productId: "", commissionPct: "" }); }} className="mt-2 flex flex-wrap gap-2">
              <select required value={rateDraft.productId} onChange={(event) => setRateDraft({ ...rateDraft, productId: event.target.value })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" aria-label="Listing"><option value="">Listing…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select>
              <input type="number" required min={0} max={90} step="0.5" placeholder="%" value={rateDraft.commissionPct} onChange={(event) => setRateDraft({ ...rateDraft, commissionPct: event.target.value })} className="w-20 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" aria-label="Commission %" />
              <button type="submit" className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold">Set special rate</button>
            </form>
          </div>

          {statement ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-[10px] font-black uppercase tracking-wider text-stone-500"><tr><th className="py-2">Trip</th><th>Booking</th><th className="text-right">Price</th><th className="text-right">Commission</th><th className="text-right">Net</th><th className="text-right">Paid</th><th className="text-right">Due</th></tr></thead>
                <tbody className="divide-y divide-stone-200">
                  {statement.bookings.map((row) => (
                    <tr key={row.id} className={String(row.status).toLowerCase() === "cancelled" ? "text-stone-400 line-through" : ""}>
                      <td className="py-2">{row.date}{row.time ? ` ${row.time}` : ""}</td>
                      <td>{row.ref} · {row.productTitle} · {row.travelerName} ({row.guests})</td>
                      <td className="text-right font-mono">{inr(row.grossInr)}</td><td className="text-right font-mono">{inr(row.commissionInr)}</td>
                      <td className="text-right font-mono">{inr(row.netInr)}</td><td className="text-right font-mono">{inr(row.paidInr)}</td><td className="text-right font-mono font-bold">{inr(row.dueInr)}</td>
                    </tr>
                  ))}
                  {!statement.bookings.length && <tr><td colSpan={7} className="py-4 text-center text-stone-500">No bookings yet.</td></tr>}
                </tbody>
                <tfoot className="font-bold"><tr><td className="py-2" colSpan={2}>{statement.totals.bookings} bookings</td><td className="text-right font-mono">{inr(statement.totals.grossInr)}</td><td className="text-right font-mono">{inr(statement.totals.commissionInr)}</td><td className="text-right font-mono">{inr(statement.totals.netInr)}</td><td className="text-right font-mono">{inr(statement.totals.paidInr)}</td><td className="text-right font-mono">{inr(statement.totals.dueInr)}</td></tr></tfoot>
              </table>
            </div>
          ) : <p className="text-xs text-stone-500">Loading statement…</p>}
        </div>
      )}
    </section>
  );
}
