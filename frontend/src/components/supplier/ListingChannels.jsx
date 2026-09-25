import React, { useState } from "react";
import { authHeaders } from "../../lib/api.js";

const CHANNELS = [
  ["marketplace", "sell_marketplace", "Idea Holiday marketplace"],
  ["ideaholidayApi", "sell_ideaholiday_api", "Idea Holiday API partners"],
  ["ownResellers", "sell_own_resellers", "Your resellers"],
];

/**
 * Where this listing sells (ADR 041). Walk-in, phone, agent and package sales
 * always work; switching a channel off hides the listing there and stops new
 * sales. Existing bookings are untouched.
 */
export default function ListingChannels({ supplierId, product }) {
  const [state, setState] = useState(() => Object.fromEntries(CHANNELS.map(([key, column]) => [key, Number(product[column] ?? 1) === 1])));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const toggle = async (key) => {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/products/${product.id}/channels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ [key]: !state[key] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't change the channel");
      setState(data.channels);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-[11px]">
      <span className="font-bold uppercase tracking-wide text-stone-400">Sells on</span>
      {CHANNELS.map(([key, , label]) => (
        <button key={key} type="button" role="switch" aria-checked={state[key]} disabled={busy === key} onClick={() => toggle(key)}
          className={`rounded-full border px-2.5 py-1 font-bold transition disabled:opacity-50 ${state[key] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-400 line-through"}`}>
          {label}
        </button>
      ))}
      <span className="text-stone-400">Your own counter, agent and package sales always work.</span>
      {error && <span role="alert" className="font-semibold text-rose-700">{error}</span>}
    </div>
  );
}
