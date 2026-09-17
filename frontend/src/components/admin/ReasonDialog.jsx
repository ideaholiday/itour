import React, { useEffect, useRef, useState } from "react";

/**
 * Asks for a written reason before an admin decision that affects someone's
 * money or access. The reason goes to the audit log with the decision.
 *
 * Render it when `request` is set: { title, message, confirmLabel, tone, requireReason, placeholder }.
 */
export default function ReasonDialog({ request, busy = false, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setReason("");
    if (request) setTimeout(() => inputRef.current?.focus(), 0);
  }, [request]);

  if (!request) return null;
  const requireReason = request.requireReason !== false;
  const ready = !requireReason || reason.trim().length >= 3;
  const danger = request.tone === "danger";

  const submit = (event) => {
    event.preventDefault();
    if (ready && !busy) onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
        <div>
          <h3 id="reason-dialog-title" className="font-display text-lg font-bold text-stone-900">{request.title}</h3>
          {request.message && <p className="mt-1 text-xs leading-5 text-stone-600">{request.message}</p>}
        </div>
        <label className="block text-xs font-semibold text-stone-700">
          Reason{requireReason ? "" : " (optional)"}
          <textarea
            ref={inputRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
            rows={3}
            maxLength={500}
            placeholder={request.placeholder || "Recorded in the audit log"}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100">Cancel</button>
          <button
            type="submit"
            disabled={!ready || busy}
            className={`rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"}`}
          >
            {busy ? "Saving…" : request.confirmLabel || "Confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}
