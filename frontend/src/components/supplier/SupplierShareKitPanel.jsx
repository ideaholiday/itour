import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Download, Printer, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";

const TARGETS = [
  { key: "profile", title: "Your public profile", help: "For your vehicles, office and social media: people see your reviews and how to book." },
  { key: "review", title: "Review link", help: "For after the trip: travelers confirm their booking reference, then leave a verified review." },
];

const CHANNEL_LABELS = { QR: "QR code", STANDEE: "Standee", STICKER: "Sticker", VOUCHER: "Voucher", WIDGET: "Website widget", LINK: "Shared link" };

/**
 * The share kit (docs/SHARE_KIT.md): QR codes, printable standees and stickers,
 * an embeddable review widget, and how many visits each one brought.
 */
export default function SupplierShareKitPanel({ supplierId }) {
  const [kit, setKit] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    setError("");
    api.supplierShareKit(supplierId)
      .then((res) => setKit(res.shareKit))
      .catch((err) => setError(err.message || "The share kit couldn't be loaded"));
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Copy isn't available here. Select the text and copy it manually.");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-stone-900">Share kit</h2>
          <p className="mt-1 text-sm text-stone-600">QR codes and printouts for your vehicles and office, and a reviews widget for your website.</p>
        </div>
        <button type="button" onClick={load} className="rounded-xl border border-stone-300 p-2.5 text-stone-500 hover:text-stone-900" aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}
      {kit && !kit.visible && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Your profile is hidden, so these codes won't open anything until you publish it again.</div>}

      {kit && (
        <div className="grid gap-5 lg:grid-cols-2">
          {TARGETS.map((target) => {
            const links = kit.links[target.key];
            return (
              <div key={target.key} className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">{target.title}</h3>
                  <p className="mt-0.5 text-xs text-stone-500">{target.help}</p>
                </div>
                <img src={links.qrSvg} alt={`QR code for ${target.title.toLowerCase()}`} width="160" height="160" className="rounded-xl border border-stone-100" />
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <a href={`${links.qrSvg}&download=1`} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:border-amber-500"><Download className="h-3.5 w-3.5" /> SVG</a>
                  <a href={`${links.qrPng}&download=1`} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:border-amber-500"><Download className="h-3.5 w-3.5" /> PNG</a>
                  <a href={links.standee} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:border-amber-500"><Printer className="h-3.5 w-3.5" /> A5 standee</a>
                  <a href={links.sticker} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:border-amber-500"><Printer className="h-3.5 w-3.5" /> 3-inch sticker</a>
                  <button type="button" onClick={() => copy(target.key, links.tracked)} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 hover:border-amber-500">
                    {copied === target.key ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Copy link
                  </button>
                </div>
                <p className="text-[11px] text-stone-400">Print pages open in a new tab: use Print → Save as PDF.</p>
              </div>
            );
          })}

          <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-stone-900">Reviews widget for your website</h3>
            <p className="text-xs text-stone-500">Paste this where you want your Idea Holiday rating and latest reviews to appear.</p>
            <textarea readOnly value={kit.embedCode} rows={4} className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2 font-mono text-[11px]" aria-label="Widget embed code" />
            <button type="button" onClick={() => copy("embed", kit.embedCode)} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold hover:border-amber-500">
              {copied === "embed" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Copy embed code
            </button>
          </div>

          <div className="space-y-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-stone-900">Visits from your share kit</h3>
            {kit.scans.length === 0 ? (
              <p className="text-xs text-stone-500">No visits yet. Each time someone scans a code or opens a link, it shows here.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase text-stone-500"><tr><th className="py-1.5">Where</th><th>Opens</th><th className="text-right">Last 30 days</th><th className="text-right">All time</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {kit.scans.map((row) => (
                    <tr key={`${row.target}-${row.channel}`}>
                      <td className="py-1.5">{CHANNEL_LABELS[row.channel] || row.channel}</td>
                      <td>{row.target === "REVIEW" ? "Review link" : "Profile"}</td>
                      <td className="text-right">{row.last30Days}</td>
                      <td className="text-right">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
