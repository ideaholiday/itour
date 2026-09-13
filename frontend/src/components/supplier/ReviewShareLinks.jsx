import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, MessageCircle, Power } from "lucide-react";
import { api } from "../../lib/api.js";

/**
 * A supplier's review collection links, and the funnel behind them.
 *
 * The link identifies the operator, not a traveler: whoever opens it still has
 * to name a completed booking before they can write anything. That is why this
 * can be printed on a voucher or stuck in a vehicle window without becoming a
 * way to manufacture ratings.
 */
export default function ReviewShareLinks({ products = [] }) {
  const [links, setLinks] = useState([]);
  const [stats, setStats] = useState({ issued: 0, opened: 0, submitted: 0, conversionPct: 0 });
  const [productId, setProductId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getSupplierShareLinks();
      setLinks(data.links || []);
      setStats(data.stats || { issued: 0, opened: 0, submitted: 0, conversionPct: 0 });
    } catch (err) {
      setError(err.message || "Share links could not be loaded.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createSupplierShareLink({ productId: productId || undefined, label: label.trim() || undefined });
      setLabel("");
      setProductId("");
      await load();
    } catch (err) {
      setError(err.message || "Share link could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (link) => {
    try {
      await api.updateSupplierShareLink(link.id, { isActive: !link.is_active });
      await load();
    } catch (err) {
      setError(err.message || "Share link could not be updated.");
    }
  };

  const copy = async (link) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Copying failed — select the link and copy it manually.");
    }
  };

  const whatsappHref = (link) =>
    `https://wa.me/?text=${encodeURIComponent(`Thank you for travelling with us! Would you share a quick review of your trip? ${link.url}`)}`;

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Collect reviews</span>
          <h2 className="mt-1 flex items-center gap-2 font-serif text-xl font-bold text-stone-900">
            <Link2 className="h-5 w-5 text-amber-600" /> Your review links
          </h2>
        </div>
        <div className="flex gap-5 text-right">
          {[["Invites", stats.issued], ["Opened", stats.opened], ["Reviews", stats.submitted], ["Conversion", `${stats.conversionPct}%`]].map(([caption, value]) => (
            <div key={caption}>
              <strong className="block text-xl font-bold text-stone-900">{value}</strong>
              <span className="text-[10px] font-bold uppercase text-stone-500">{caption}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-stone-600">
        Share a link with travelers you have already carried. They enter their booking reference and the last four
        digits of their phone number, so every review that arrives is tied to a completed trip — the same standard as
        the review request we email after each trip.
      </p>

      <form onSubmit={create} className="mt-4 flex flex-wrap gap-2">
        <select value={productId} onChange={(event) => setProductId(event.target.value)}
          className="min-w-[180px] flex-1 rounded-xl border border-stone-300 p-2.5 text-xs">
          <option value="">All of my listings</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
        </select>
        <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120}
          placeholder="Where you will use it — vehicle window, voucher…"
          className="min-w-[200px] flex-1 rounded-xl border border-stone-300 p-2.5 text-xs" />
        <button type="submit" disabled={busy}
          className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">
          {busy ? "Creating…" : "Create link"}
        </button>
      </form>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <article key={link.id} className={`rounded-2xl border p-4 ${link.is_active ? "border-stone-200 bg-[#FAF9F6]" : "border-stone-200 bg-stone-100 opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-stone-900">{link.label || link.product_title || "All listings"}</h3>
                <p className="mt-1 break-all font-mono text-[11px] text-stone-500">{link.url}</p>
              </div>
              <button onClick={() => toggle(link)} title={link.is_active ? "Deactivate" : "Reactivate"}
                className="shrink-0 rounded-lg border border-stone-300 p-1.5 text-stone-500 hover:text-stone-900">
                <Power className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => copy(link)} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white">
                {copied === link.id ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy link</>}
              </button>
              <a href={whatsappHref(link)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white">
                <MessageCircle className="h-3 w-3" /> Share on WhatsApp
              </a>
            </div>

            <p className="mt-3 text-[10px] font-bold uppercase text-stone-500">
              {link.view_count} opened · {link.claim_count} matched a booking · {link.reviews_submitted} reviewed
            </p>
          </article>
        ))}
        {!links.length && (
          <p className="rounded-2xl border border-dashed border-stone-300 p-7 text-center text-xs text-stone-500 md:col-span-2">
            No review links yet. Create one and share it with travelers you have already carried.
          </p>
        )}
      </div>
    </section>
  );
}
