import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, KeyRound, Pencil, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { api } from "../../lib/api.js";

const EMPTY_FORM = { name: "", email: "", phone: "", role: "STAFF" };
const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500";

function RoleBadge({ role }) {
  return role === "ADMIN"
    ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Administrator</span>
    : <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">Staff</span>;
}

/**
 * The people who run the platform. Staff work in Operations; administrators
 * also have this panel. Everyone here receives booking and operations alerts
 * by email and WhatsApp, so each needs a WhatsApp number that can receive them.
 */
export default function TeamView() {
  const [members, setMembers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [acting, setActing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.adminListTeam()
      .then((res) => {
        setMembers(res.members || []);
        setCurrentUserId(res.currentUserId || null);
      })
      .catch((err) => setError(err.message || "The team couldn't be loaded"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      const res = await api.adminAddTeamMember(form);
      setForm(EMPTY_FORM);
      setAdding(false);
      if (res.temporaryPassword) {
        setCredentials({ name: res.member.name, email: res.member.email, password: res.temporaryPassword });
      } else {
        setNotice(`${res.member.name} already had an account, so they now have ${res.member.role === "ADMIN" ? "administrator" : "staff"} access and sign in with their existing password.`);
      }
    });
  };

  const saveEdit = (event) => {
    event.preventDefault();
    run(editing.id, async () => {
      await api.adminUpdateTeamMember(editing.id, { name: editing.name, phone: editing.phone, role: editing.role });
      setEditing(null);
      setNotice("Saved. Alerts use the new details from the next message.");
    });
  };

  const resetPassword = (member) => {
    if (!window.confirm(`Issue a new temporary password for ${member.name}? Their current password stops working.`)) return;
    run(member.id, async () => {
      const res = await api.adminResetTeamPassword(member.id);
      setCredentials({ name: member.name, email: member.email, password: res.temporaryPassword });
    });
  };

  const removeMember = (member) => {
    if (!window.confirm(`Remove ${member.name}'s team access? They are signed out of Operations immediately and stop receiving alerts. Their account stays as a traveler.`)) return;
    run(member.id, async () => {
      await api.adminRemoveTeamMember(member.id);
      setNotice(`${member.name} no longer has team access.`);
    });
  };

  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(`Idea Holiday team sign-in\nhttps://admin.ideaholiday.in/admin/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy isn't available here. Select the password and copy it manually.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Team</h1>
          <p className="mt-0.5 text-xs text-stone-500">Staff and administrators. Everyone here gets booking and operations alerts by email and WhatsApp.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
          <button onClick={() => { setAdding((open) => !open); setEditing(null); }} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add team member
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
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Temporary password for {credentials.name}</h2>
              <p className="mt-0.5 text-xs text-stone-600">Shown only once. Share it privately; they sign in at admin.ideaholiday.in/admin/login.</p>
            </div>
            <button onClick={() => setCredentials(null)} aria-label="Close" className="rounded-lg p-1 text-stone-500 hover:bg-amber-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-200 bg-white p-3 font-mono text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="break-all"><span className="text-stone-500">{credentials.email}</span> · <strong className="select-all">{credentials.password}</strong></span>
            <button onClick={copyCredentials} className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-1.5 font-sans text-xs font-bold hover:bg-stone-100">
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? "Copied" : "Copy sign-in details"}
            </button>
          </div>
        </section>
      )}

      {adding && (
        <form onSubmit={addMember} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2">
          <label className="text-xs font-bold text-stone-700">Full name<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">WhatsApp number<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className={`mt-1 ${inputClass}`} /></label>
          <label className="text-xs font-bold text-stone-700">Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`mt-1 ${inputClass}`}>
              <option value="STAFF">Staff: Operations only</option>
              <option value="ADMIN">Administrator: full access</option>
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={acting === "add"} className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50">{acting === "add" ? "Adding…" : "Add member"}</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">Cancel</button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {!loading && members.length === 0 && <p className="p-5 text-xs text-stone-500">No team members yet.</p>}
        <ul className="divide-y divide-stone-100">
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            if (editing?.id === member.id) {
              return (
                <li key={member.id} className="p-5">
                  <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-bold text-stone-700">Full name<input required minLength={2} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-xs font-bold text-stone-700">WhatsApp number<input required value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="+91 98765 43210" className={`mt-1 ${inputClass}`} /></label>
                    <label className="text-xs font-bold text-stone-700">Role
                      <select value={editing.role} disabled={isSelf} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={`mt-1 ${inputClass} disabled:bg-stone-100`}>
                        <option value="STAFF">Staff</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    </label>
                    <div className="flex gap-2 sm:col-span-3">
                      <button type="submit" disabled={acting === member.id} className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold hover:bg-stone-100">Cancel</button>
                    </div>
                  </form>
                </li>
              );
            }
            return (
              <li key={member.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-stone-900">{member.name}</strong>
                    <RoleBadge role={member.role} />
                    {isSelf && <span className="text-[10px] font-bold uppercase text-stone-400">You</span>}
                  </div>
                  <p className="mt-0.5 break-all text-xs text-stone-500">{member.email}</p>
                  {member.phone
                    ? <p className="mt-0.5 text-xs text-stone-500">WhatsApp {member.phone}</p>
                    : <p className="mt-0.5 text-xs font-semibold text-amber-700">No WhatsApp number: alerts reach them by email only.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setEditing({ id: member.id, name: member.name, phone: member.phone || "", role: member.role }); setAdding(false); }} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold hover:bg-stone-100">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                  <button onClick={() => resetPassword(member)} disabled={acting === member.id} className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold hover:bg-stone-100 disabled:opacity-50">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Reset password
                  </button>
                  {!isSelf && (
                    <button onClick={() => removeMember(member)} disabled={acting === member.id} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
