import React, { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../lib/api.js";

/**
 * Shared vehicles and guides for one booking option.
 *
 * A resource is a real thing the supplier owns that several options draw from at
 * the same departure time. Linking an option here caps it by the resource, so
 * two listings sharing one van can no longer each sell the van's full capacity.
 */
export default function SupplierResourcesPanel({ supplierId, optionId, capacity }) {
  const [resources, setResources] = useState([]);
  const [draft, setDraft] = useState({ name: "", capacity: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const url = `/api/suppliers/${supplierId}/resources`;

  const load = useCallback(() => {
    setLoading(true);
    fetch(url, { headers: authHeaders() })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResources(data.resources || []);
      })
      .catch(error => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => { load(); }, [load]);

  async function send(method, path, body) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${url}${path}`, {
        method,
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      load();
      return data;
    } catch (error) { setMessage(error.message); return null; } finally { setBusy(false); }
  }

  async function createResource(event) {
    event.preventDefault();
    const created = await send("POST", "", { name: draft.name, capacity: Number(draft.capacity), optionIds: [optionId] });
    if (created) { setDraft({ name: "", capacity: "" }); setMessage("Shared vehicle added and linked to this option."); }
  }

  async function toggleLink(resource, linked) {
    const optionIds = linked
      ? resource.optionIds.filter(id => id !== optionId)
      : [...new Set([...resource.optionIds, optionId])];
    const saved = await send("PUT", `/${resource.id}`, { name: resource.name, capacity: Number(resource.capacity), optionIds });
    if (saved) setMessage(linked ? "This option no longer shares that vehicle." : "This option now shares that vehicle.");
  }

  const inputClass = "mt-1 block w-full rounded-lg border border-stone-300 p-2 text-stone-900";

  return (
    <div className="mt-4">
      <p className="text-stone-600">
        If one vehicle or guide serves several listings, link them here. Each departure is then
        limited by whichever is smaller — this option&rsquo;s own seats, or the shared vehicle.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        This option currently sells {capacity ?? "its configured"} seats per departure on its own.
      </p>

      <form onSubmit={createResource} className="mt-4 rounded-xl border border-stone-200 p-3">
        <h3 className="font-semibold">Add a shared vehicle</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label>Name
            <input required type="text" maxLength={120} className={inputClass} placeholder="Tempo Traveller GA-07"
              value={draft.name} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} />
          </label>
          <label>Total seats
            <input required type="number" min="0" step="1" className={inputClass}
              value={draft.capacity} onChange={e => setDraft(current => ({ ...current, capacity: e.target.value }))} />
          </label>
        </div>
        <button disabled={busy} className="mt-3 rounded-xl bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Add and link to this option"}
        </button>
      </form>

      <h3 className="mt-5 font-semibold">Your shared vehicles</h3>
      {loading && <p className="mt-2 text-sm text-stone-500">Loading vehicles…</p>}
      {!loading && resources.length === 0 && (
        <p className="mt-2 text-sm text-stone-500">None yet. This option sells its own seats without a shared limit.</p>
      )}
      <ul className="mt-2 space-y-2">
        {resources.map(resource => {
          const linked = resource.optionIds.includes(optionId);
          return (
            <li key={resource.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${linked ? "border-emerald-300 bg-emerald-50" : "border-stone-200"}`}>
              <div>
                <p className="font-semibold">{resource.name}</p>
                <p className="text-sm text-stone-600">
                  {resource.capacity} seats · shared by {resource.optionIds.length} option{resource.optionIds.length === 1 ? "" : "s"}
                  {linked ? " · including this one" : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" disabled={busy} onClick={() => toggleLink(resource, linked)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50 disabled:opacity-50">
                  {linked ? "Unlink" : "Link"}
                </button>
                <button type="button" disabled={busy} onClick={() => send("DELETE", `/${resource.id}`)}
                  aria-label={`Delete shared vehicle ${resource.name}`}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-50 disabled:opacity-50">
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {message && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3">{message}</p>}
    </div>
  );
}
