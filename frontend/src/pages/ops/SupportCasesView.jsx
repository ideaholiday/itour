import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Headphones, MessageSquare, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { api, authHeaders } from "../../lib/api.js";

const badge = (status) => ["APPROVED", "RESOLVED", "CLOSED"].includes(status) ? "bg-emerald-100 text-emerald-900 border border-emerald-300" : status === "REJECTED" ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-amber-100 text-amber-900 border border-amber-300";

export default function SupportCasesView() {
  const [cases, setCases] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [refundPercentage, setRefundPercentage] = useState(100);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function loadCases() {
    setLoading(true);
    try {
      const data = await api.getSupportCases({ status, search });
      setCases(data.cases || []);
      setMetrics(data.metrics || null);
    } catch (err) { setFeedback(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadCases(); }, [status]);

  async function openCase(ref) {
    try { const data = await api.getSupportCase(ref); setSelected(data.case); setRefundPercentage(data.case.policy_refund_percentage ?? 100); setNote(data.case.resolution || ""); }
    catch (err) { setFeedback(err.message); }
  }

  async function updateStatus(nextStatus) {
    if (!selected) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(selected.case_ref)}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ status: nextStatus, priority: selected.priority, resolution: note, assignedTo: "Customer Support" }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSelected(data.case); setFeedback(`${selected.case_ref} updated.`); loadCases();
    } catch (err) { setFeedback(err.message); } finally { setWorking(false); }
  }

  async function decide(action) {
    if (!selected) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(selected.case_ref)}/refund-decision`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ action, approvedRefundPercentage: Number(refundPercentage), resolution: note }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSelected(data.case); setFeedback(data.message); loadCases();
    } catch (err) { setFeedback(err.message); } finally { setWorking(false); }
  }

  async function sendMessage() {
    if (!message.trim() || !selected) return;
    setWorking(true);
    try { const data = await api.addSupportMessage(selected.case_ref, { message, isInternal: internal }); setSelected(data.case); setMessage(""); setFeedback(internal ? "Internal note added." : "Reply sent and logged."); loadCases(); }
    catch (err) { setFeedback(err.message); } finally { setWorking(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Support and disputes</span><h1 className="mt-1 flex items-center gap-3 font-serif text-2xl font-bold text-stone-900"><Headphones className="h-7 w-7 text-amber-600" /> Case resolution desk</h1><p className="mt-1 text-xs text-stone-600">Review cancellation requests, complaints, evidence, guest conversations and controlled refund approvals.</p></div>
      <div className="grid gap-3 sm:grid-cols-4">{[["Active", metrics?.active, Headphones], ["Urgent", metrics?.urgent, AlertTriangle], ["SLA breached", metrics?.sla_breached, Clock3], ["All cases", metrics?.total, ShieldCheck]].map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-amber-600" /><strong className="mt-3 block text-2xl text-stone-900">{value ?? 0}</strong><span className="text-[10px] uppercase text-stone-500">{label}</span></div>)}</div>
      {feedback && <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><span>{feedback}</span><button onClick={() => setFeedback("")}>Dismiss</button></div>}
      <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row shadow-sm"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadCases()} placeholder="Case, booking or subject" className="w-full rounded-xl border border-stone-300 bg-[#FAF9F6] p-2.5 pl-10 text-xs text-stone-900 focus:bg-white focus:border-amber-500 outline-none" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-stone-300 bg-[#FAF9F6] px-3 text-xs text-stone-900 focus:bg-white focus:border-amber-500 outline-none"><option>ALL</option><option>OPEN</option><option>UNDER_REVIEW</option><option>AWAITING_GUEST</option><option>AWAITING_SUPPLIER</option><option>APPROVED</option><option>REJECTED</option><option>RESOLVED</option></select><button onClick={loadCases} className="inline-flex items-center gap-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-bold px-4 text-xs"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} /> Search</button></div>

      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <div className="max-h-[760px] space-y-2 overflow-y-auto rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">{cases.map((item) => <button key={item.id} onClick={() => openCase(item.case_ref)} className={`w-full rounded-2xl border p-4 text-left transition-all ${selected?.id === item.id ? "border-amber-500 bg-amber-50/60 shadow-sm" : "border-stone-200 bg-[#FAF9F6] hover:bg-white hover:border-amber-400"}`}><div className="flex items-center justify-between"><strong className="text-xs text-amber-800 font-bold">{item.case_ref}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${badge(item.status)}`}>{item.status.replaceAll("_", " ")}</span></div><h3 className="mt-2 text-sm font-bold text-stone-900">{item.subject}</h3><p className="mt-1 text-[10px] text-stone-500">{item.booking_ref} · {item.case_type.replaceAll("_", " ")} · {item.priority}</p>{(item.first_response_breached || item.resolution_breached) ? <span className="mt-2 inline-block text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded">SLA BREACHED</span> : null}</button>)}{!cases.length && <p className="p-8 text-center text-xs text-stone-500">No matching support cases.</p>}</div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">{selected ? <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4"><div><span className="text-xs font-bold text-amber-800">{selected.case_ref} · {selected.booking_ref}</span><h2 className="mt-1 font-serif text-xl font-bold text-stone-900">{selected.subject}</h2><p className="mt-1 text-xs text-stone-600">{selected.traveler_name} · {selected.product_title} · {selected.supplier_name}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${badge(selected.status)}`}>{selected.status}</span></div><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{[["Priority", selected.priority], ["Policy refund", `${selected.policy_refund_percentage ?? "—"}%`], ["Requested", `${selected.requested_refund_percentage ?? "—"}%`], ["Paid", `₹${Number(selected.amount_inr || 0).toLocaleString("en-IN")}`]].map(([label, value]) => <div key={label} className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-3"><span className="block text-[9px] uppercase text-stone-500 font-bold">{label}</span><strong className="mt-1 block text-stone-900">{value}</strong></div>)}</div><div className="rounded-xl bg-[#FAF9F6] border border-stone-200 p-4 text-xs leading-relaxed text-stone-800">{selected.description}</div>
          {selected.evidence?.length > 0 && <div><h3 className="text-[10px] font-bold uppercase text-stone-500">Evidence</h3><div className="mt-2 flex flex-wrap gap-2">{selected.evidence.map((item) => <a key={item.id} href={item.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-amber-800 font-bold hover:bg-stone-100">{item.display_name}<ExternalLink className="h-3 w-3" /></a>)}</div></div>}
          <div><h3 className="text-[10px] font-bold uppercase text-stone-500">Conversation and audit</h3><div className="mt-2 max-h-56 space-y-2 overflow-y-auto">{selected.messages?.map((item) => <div key={item.id} className={`rounded-xl p-3 text-xs ${item.is_internal ? "border border-amber-300 bg-amber-50" : "bg-[#FAF9F6] border border-stone-200"}`}><div className="flex justify-between text-[9px] uppercase text-stone-500 font-bold"><span>{item.author_role}{item.is_internal ? " · INTERNAL" : ""}</span><span>{item.created_at}</span></div><p className="mt-1 text-stone-800">{item.message}</p></div>)}</div><div className="mt-3 flex gap-2"><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Reply or internal investigation note" className="flex-1 rounded-xl border border-stone-300 bg-[#FAF9F6] p-3 text-xs text-stone-900 focus:bg-white focus:border-amber-500 outline-none" /><button onClick={sendMessage} disabled={working} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 text-xs font-bold text-stone-950 shadow-sm">Send</button></div><label className="mt-2 flex items-center gap-2 text-[10px] text-amber-900 font-bold"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-amber-500" /> Internal note—not visible to guest or supplier</label></div>
          <div className="rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Required decision or resolution reason" className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-900 focus:border-amber-500 outline-none" /><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => updateStatus("UNDER_REVIEW")} disabled={working} className="rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900">Start review</button><button onClick={() => updateStatus("AWAITING_GUEST")} disabled={working} className="rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-bold px-3 py-2 text-xs">Await guest</button><button onClick={() => updateStatus("AWAITING_SUPPLIER")} disabled={working} className="rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-bold px-3 py-2 text-xs">Await supplier</button>{["CANCELLATION", "REFUND_DISPUTE"].includes(selected.case_type) && <><select value={refundPercentage} onChange={(e) => setRefundPercentage(e.target.value)} className="rounded-xl border border-stone-300 bg-white px-3 text-xs text-stone-900"><option value="0">0%</option><option value="50">50%</option><option value="100">100%</option></select><button onClick={() => decide("APPROVE")} disabled={working || note.trim().length < 5} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-sm"><CheckCircle2 className="h-3.5 w-3.5" /> Approve refund</button><button onClick={() => decide("REJECT")} disabled={working || note.trim().length < 5} className="inline-flex items-center gap-1 rounded-xl bg-rose-100 hover:bg-rose-200 border border-rose-300 px-3 py-2 text-xs font-bold text-rose-900"><XCircle className="h-3.5 w-3.5" /> Reject</button></>}<button onClick={() => updateStatus("RESOLVED")} disabled={working || note.trim().length < 5} className="rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-2 text-xs font-bold text-stone-950 shadow-sm">Resolve complaint</button></div></div></div> : <div className="grid min-h-96 place-items-center text-center"><div><MessageSquare className="mx-auto h-10 w-10 text-stone-400" /><p className="mt-3 text-sm text-stone-500">Choose a case to review its evidence, messages and decisions.</p></div></div>}</div>
      </div>
    </div>
  );
}
