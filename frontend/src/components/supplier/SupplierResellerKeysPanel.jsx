import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Copy, KeyRound, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That didn't work");
  return data;
}

/**
 * Reseller API keys (ADR 041), owner only. A reseller books your listings over
 * the OCTo API with its key; the bookings are your direct sales. Link a key to
 * one of your agents to apply their net rate and credit limit.
 */
export default function SupplierResellerKeysPanel({ supplierId }) {
  const base = `/api/suppliers/${supplierId}/api-keys`;
  const [keys, setKeys] = useState([]);
  const [agents, setAgents] = useState([]);
  const [draft, setDraft] = useState({ name: "", agentId: "" });
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => request(base).then((data) => setKeys(data.resellers || [])).catch((err) => setError(err.message)), [base]);
  useEffect(() => {
    load();
    request(`/api/suppliers/${supplierId}/agents`).then((data) => setAgents((data.agents || []).filter((agent) => agent.status === "ACTIVE"))).catch(() => {});
  }, [load, supplierId]);

  const create = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const data = await request(base, { method: "POST", body: JSON.stringify({ name: draft.name, agentId: draft.agentId || null }) });
      setIssued(data);
      setDraft({ name: "", agentId: "" });
      load();
    } catch (err) { setError(err.message); }
  };

  const revoke = async (key) => {
    if (!window.confirm(`Revoke ${key.name}'s key? It stops working immediately; bookings already made stay.`)) return;
    try { await request(`${base}/${key.id}`, { method: "DELETE" }); load(); } catch (err) { setError(err.message); }
  };

  const apiBase = `${window.location.origin}/octo`;

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-display text-xl font-bold text-stone-900">Reseller API keys</h2>
        <p className="mt-1 text-sm text-stone-600">Let a hotel desk, agency or booking site book your listings directly over the OCTo API. Their bookings are your own sales, with no Idea Holiday commission. Choose which listings they can sell under each listing's "Sells on".</p>
      </div>
      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}

      {issued && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-sm font-bold text-stone-900">Key for {issued.reseller.name}</h3><p className="text-xs text-stone-600">Shown only once. Send it privately; they call {apiBase} with <code>Authorization: Bearer &lt;key&gt;</code>.</p></div>
            <button onClick={() => setIssued(null)} aria-label="Close" className="rounded p-1 text-stone-500 hover:bg-amber-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="select-all break-all text-sm">{issued.key}</code>
            <button onClick={() => navigator.clipboard?.writeText(issued.key)} className="flex items-center gap-1 self-start rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold"><Copy className="h-3.5 w-3.5" /> Copy</button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-bold text-stone-700">Reseller<input required minLength={2} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Sea View hotel desk" className="mt-1 block w-60 rounded-xl border border-stone-200 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-bold text-stone-700">Net rate and credit from agent (optional)
          <select value={draft.agentId} onChange={(event) => setDraft({ ...draft, agentId: event.target.value })} className="mt-1 block rounded-xl border border-stone-200 px-3 py-2 text-sm">
            <option value="">None: normal price, owed to you</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.commissionPct}%)</option>)}
          </select>
        </label>
        <button type="submit" className="flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950"><KeyRound className="h-4 w-4" /> Create key</button>
      </form>

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
        {keys.map((key) => (
          <li key={key.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 text-sm ${key.status !== "ACTIVE" ? "text-stone-400" : ""}`}>
            <div>
              <strong className="block">{key.name}</strong>
              <span className="text-xs text-stone-500"><code>{key.keyPrefix}…</code>{key.agentName ? ` · ${key.agentName}'s rate` : ""} · {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleDateString("en-IN")}` : "never used"}{key.status !== "ACTIVE" ? " · revoked" : ""}</span>
            </div>
            {key.status === "ACTIVE" && <button onClick={() => revoke(key)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Revoke</button>}
          </li>
        ))}
        {!keys.length && <li className="p-6 text-center text-xs text-stone-500">No keys yet.</li>}
      </ul>
    </section>
  );
}
