import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, KeyRound, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { authHeaders } from "../../lib/api.js";
import PhoneInput from "../PhoneInput.jsx";

import { STAFF_ROLE_LABELS } from "./staffRoles.js";
const ROLE_HELP = {
  MANAGER: "Listings, prices, calendar, bookings, cancellations, dispatch and reviews. No bank details, KYB, plans or staff.",
  FRONT_DESK: "Walk-in and phone bookings, payments, vouchers, guest list and check-in.",
  GUIDE: "Guest list, check-in and no-shows for a departure.",
};
const EMPTY_FORM = { name: "", email: "", phone: "", role: "FRONT_DESK" };
const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That change couldn't be saved");
  return data;
}

/**
 * Staff logins (ADR 036), owner only: each person signs in with their own email
 * and password, so the owner's password is never shared at the counter.
 */
export default function SupplierStaffPanel({ supplierId }) {
  const base = `/api/suppliers/${supplierId}/staff`;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [acting, setActing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    request(base)
      .then((res) => setMembers(res.members || []))
      .catch((err) => setError(err.message || "Your staff couldn't be loaded"))
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, action) => {
    setActing(key);
    setError("");
    setNotice("");
    try {
      await action();
      load();
    } catch (err) {
      setError(err.message || "That change couldn't be saved");
    } finally {
      setActing(null);
    }
  };

  const addMember = (event) => {
    event.preventDefault();
    run("add", async () => {
      const body = { ...form, phone: form.phone || undefined };
      const res = await request(base, { method: "POST", body: JSON.stringify(body) });
      setForm(EMPTY_FORM);
      setAdding(false);
      if (res.temporaryPassword) {
        setCredentials({ name: res.member.name, email: res.member.email, password: res.temporaryPassword });
      } else {
        setNotice(`${res.member.name} already had an IdeaHoliday account, so they sign in with their existing password.`);
      }
    });
  };

  const changeRole = (member, role) => run(member.id, async () => {
    await request(`${base}/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
    setNotice(`${member.name} is now ${STAFF_ROLE_LABELS[role].toLowerCase()}. It applies straight away.`);
  });

  const resetPassword = (member) => {
    if (!window.confirm(`Issue a new temporary password for ${member.name}? Their current password stops working.`)) return;
    run(member.id, async () => {
      const res = await request(`${base}/${member.id}/reset-password`, { method: "POST" });
      setCredentials({ name: member.name, email: member.email, password: res.temporaryPassword });
    });
  };

  const removeMember = (member) => {
    if (!window.confirm(`Remove ${member.name}'s access? They lose access to your account immediately.`)) return;
    run(member.id, async () => {
      await request(`${base}/${member.id}`, { method: "DELETE" });
      setNotice(`${member.name} no longer has access.`);
    });
  };

  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(`IdeaHoliday partner sign-in\n${window.location.origin}/supplier/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy isn't available here. Select the password and copy it manually.");
    }
  };

  return (
    <section className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-stone-900">Staff</h2>
          <p className="mt-1 text-sm text-stone-600">Give your team their own sign-in. Only you can add or remove staff.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
          <button onClick={() => setAdding((open) => !open)} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add staff
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

      {credentials && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Temporary password for {credentials.name}</h3>
              <p className="mt-0.5 text-xs text-stone-600">Shown only once. Share it privately; they sign in at {window.location.host}/supplier/login.</p>
            </div>
            <button onClick={() => setCredentials(null)} aria-label="Close" className="rounded-lg p-1 text-stone-500 hover:bg-amber-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 font-mono text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="break-all"><span className="text-stone-500">{credentials.email}</span> · <strong className="select-all">{credentials.password}</strong></span>
            <button onClick={copyCredentials} className="flex items-center gap-1.5 self-start rounded-lg border border-stone-200 px-3 py-1.5 font-sans text-xs font-bold hover:bg-stone-50">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? "Copied" : "Copy sign-in"}
            </button>
          </div>
        </div>
      )}

      {adding && (
        <form onSubmit={addMember} className="grid gap-3 rounded-2xl border border-stone-200 bg-[#FAF9F6] p-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-stone-700">Name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <div className="text-xs font-bold text-stone-700"><label htmlFor="staff-add-phone">Phone (optional)</label><PhoneInput id="staff-add-phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} className="mt-1" inputClassName={inputClass} /></div>
          <label className="text-xs font-bold text-stone-700">Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={`mt-1 ${inputClass}`}>
              {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="mt-1 block font-normal text-stone-500">{ROLE_HELP[form.role]}</span>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={acting === "add"} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-60">Add and create password</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">Cancel</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
        {members.map((member) => (
          <li key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-stone-900">{member.name}</p>
              <p className="truncate text-xs text-stone-500">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={`Role for ${member.name}`} value={member.role} disabled={acting === member.id} onChange={(event) => changeRole(member, event.target.value)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold">
                {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button onClick={() => resetPassword(member)} disabled={acting === member.id} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold hover:bg-stone-100"><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> New password</button>
              <button onClick={() => removeMember(member)} disabled={acting === member.id} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove</button>
            </div>
          </li>
        ))}
        {!members.length && !loading && <li className="p-6 text-center text-xs text-stone-500">No staff yet. Add your front desk so they can take walk-ins with their own sign-in.</li>}
      </ul>
    </section>
  );
}
