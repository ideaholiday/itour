import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MessageSquare, Send, Users } from "lucide-react";
import { api } from "../lib/api.js";
import EmptyState from "./ui/EmptyState.jsx";

const STATUS_STYLES = {
  OPEN: "bg-amber-100 text-amber-900",
  REPLIED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-stone-100 text-stone-500",
};

// Timestamps are UTC; SQLite writes them without a zone, Postgres with one.
const formatTime = (value) => {
  const text = String(value || "").replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text) ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
};

/**
 * Enquiry threads between a traveler and a supplier. The server scopes the
 * list to whoever is signed in; `viewer` only decides the wording. Contact
 * details are refused by the server, and its explanation is shown as is.
 */
export default function EnquiryInbox({ viewer = "TRAVELER" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRef = searchParams.get("enquiry");
  const [enquiries, setEnquiries] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSupplier = viewer === "SUPPLIER";

  const loadList = useCallback(() => {
    api.getEnquiries().then((data) => setEnquiries(data.enquiries || [])).catch((err) => { setEnquiries([]); setError(err.message); });
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    setError("");
    setDraft("");
    if (!selectedRef) { setThread(null); return; }
    api.getEnquiry(selectedRef).then((data) => setThread(data.enquiry)).catch((err) => { setThread(null); setError(err.message); });
  }, [selectedRef]);

  const select = (ref) => {
    const next = new URLSearchParams(searchParams);
    if (ref) next.set("enquiry", ref); else next.delete("enquiry");
    setSearchParams(next);
  };

  const send = async (event) => {
    event.preventDefault();
    if (draft.trim().length < 10) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.sendEnquiryMessage(thread.ref, draft.trim());
      setThread(data.enquiry);
      setDraft("");
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      const data = await api.closeEnquiry(thread.ref);
      setThread(data.enquiry);
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (enquiries === null) return <div className="h-64 animate-pulse rounded-3xl bg-stone-200" />;

  if (!enquiries.length && !selectedRef) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No enquiries yet"
        description={isSupplier
          ? "When travelers ask a question from your public profile, it arrives here."
          : "Questions you send to operators from their profiles appear here, with their replies."}
      />
    );
  }

  const counterpart = (item) => (isSupplier ? item.travelerName : item.supplierName);

  return (
    <div className="grid overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm md:grid-cols-[300px_1fr]">
      <ul className={`max-h-[70vh] overflow-y-auto border-stone-100 md:border-r ${selectedRef ? "hidden md:block" : ""}`}>
        {enquiries.map((item) => (
          <li key={item.ref}>
            <button type="button" onClick={() => select(item.ref)} className={`w-full border-b border-stone-100 p-4 text-left hover:bg-stone-50 ${item.ref === selectedRef ? "bg-amber-50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-stone-900">{counterpart(item)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[item.status] || ""}`}>{isSupplier && item.status === "OPEN" ? "Needs reply" : item.status.toLowerCase()}</span>
              </div>
              {item.lastMessage && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{item.lastMessage}</p>}
              <span className="mt-1 block text-[10px] text-stone-400">{formatTime(item.lastMessageAt)}</span>
            </button>
          </li>
        ))}
      </ul>

      <section className={`flex min-h-[420px] flex-col ${selectedRef ? "" : "hidden md:flex"}`}>
        {!thread ? (
          <div className="grid flex-1 place-items-center p-8 text-sm text-stone-500">{error || "Choose an enquiry to read it."}</div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-stone-100 p-4">
              <button type="button" onClick={() => select(null)} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 md:hidden" aria-label="Back to enquiries"><ArrowLeft className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold text-stone-900">
                  {isSupplier ? thread.travelerName : (thread.supplierPath ? <Link to={thread.supplierPath} className="hover:underline">{thread.supplierName}</Link> : thread.supplierName)}
                </h2>
                <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-stone-500">
                  <span>{thread.ref}</span>
                  {thread.travelDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{thread.travelDate}</span>}
                  {thread.travelers && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{thread.travelers}</span>}
                </div>
              </div>
              {thread.status !== "CLOSED" && (
                <button type="button" onClick={close} disabled={busy} className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50">Close</button>
              )}
            </header>

            <ol className="flex-1 space-y-3 overflow-y-auto p-4">
              {thread.messages.map((message) => {
                const mine = (isSupplier && message.authorRole === "SUPPLIER") || (!isSupplier && message.authorRole === "TRAVELER");
                return (
                  <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-amber-500 text-stone-950" : "bg-stone-100 text-stone-800"}`}>
                      <p className="whitespace-pre-line">{message.message}</p>
                      <span className={`mt-1 block text-[10px] ${mine ? "text-stone-800/70" : "text-stone-400"}`}>{formatTime(message.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>

            {thread.status === "CLOSED" ? (
              <p className="border-t border-stone-100 p-4 text-xs text-stone-500">
                This enquiry is closed.{!isSupplier && thread.supplierPath && <> <Link to={thread.supplierPath} className="font-bold text-amber-800 underline">Send a new one</Link></>}
              </p>
            ) : (
              <form onSubmit={send} className="border-t border-stone-100 p-4">
                {error && <p role="alert" className="mb-2 rounded-xl bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Your reply</span>
                    <textarea rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={isSupplier ? "Reply with availability, what's included and how to book" : "Write a message"} className="w-full rounded-2xl border border-stone-200 p-3 text-sm focus:border-amber-500 focus:outline-none" />
                  </label>
                  <button type="submit" disabled={busy || draft.trim().length < 10} className="rounded-2xl bg-amber-500 p-3 text-stone-950 hover:bg-amber-400 disabled:opacity-40" aria-label="Send"><Send className="h-4 w-4" /></button>
                </div>
                <p className="mt-1 text-[10px] text-stone-400">Phone numbers, emails and links aren't sent. Contact details are shared with a booking.</p>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
