import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, BadgePercent, Briefcase, CheckCircle2, Clock, ShieldCheck, Ticket } from "lucide-react";
import SeoHead from "../components/SeoHead.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

/**
 * IdeaHoliday B2B travel agents (ADR 054). An agent signs in with a normal
 * traveler account, applies with a GSTIN or PAN, and once IdeaHoliday approves
 * the agency books every listing at the agent price. /agents explains the
 * program and shows the application's status; /agents/signup opens the form.
 */

const EMPTY = { agencyName: "", contactName: "", phone: "", gstin: "", pan: "", address: "", city: "", state: "", website: "" };
const inputClass = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500";

/**
 * The agency's logo on its clients' vouchers and in their messages (ADR 055).
 * Uploaded like any photo, then saved; without one, the agency's name is shown.
 */
function AgencyLogo({ agency, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (logoUrl) => {
    const res = await api.setAgencyLogo(logoUrl);
    onSaved(res.agency);
  };
  const upload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Use an image under 2 MB"); return; }
    setBusy(true);
    setError("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api.uploadFile({ data: reader.result, filename: file.name, mimeType: file.type, entityType: "GENERAL" });
        await save(res.upload.url);
      } catch (err) {
        setError(err.message || "The logo couldn't be uploaded");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="text-sm font-bold text-stone-900">Your brand on client vouchers</h3>
      <p className="mt-1 text-xs text-stone-600">Your clients see your logo and name on their voucher and in their emails, not Idea Holiday's.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {agency.logoUrl
          ? <img src={agency.logoUrl} alt={`${agency.agencyName} logo`} className="h-12 max-w-[180px] rounded border border-stone-200 bg-white object-contain p-1" />
          : <span className="text-sm font-bold text-stone-700">{agency.agencyName}</span>}
        <label className={`cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold hover:bg-stone-100 ${busy ? "opacity-50" : ""}`}>
          {busy ? "Uploading…" : agency.logoUrl ? "Change logo" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={upload} />
        </label>
        {agency.logoUrl && !busy && (
          <button type="button" onClick={() => save(null).catch((err) => setError(err.message))} className="text-xs font-bold text-rose-700 hover:underline">Remove</button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}

function StatusPanel({ agency, onEdit, onSaved }) {
  if (agency.status === "APPROVED") {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
        <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><h2 className="font-bold">{agency.agencyName} is approved</h2></div>
        <p className="mt-2 text-sm text-emerald-900">Your agent price is <strong>{agency.discountPct}% below the website price</strong> on every listing and circuit, plus 18% GST on Idea Holiday's service fee, invoiced to your agency. You see it on the listing and at checkout; enter your client's details and they get the voucher without the price.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/search" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500">Book for a client</Link>
          <Link to="/agents/dashboard" className="rounded-xl border border-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100">My agent bookings</Link>
        </div>
        <AgencyLogo agency={agency} onSaved={onSaved} />
      </div>
    );
  }
  if (agency.status === "PENDING") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-800"><Clock className="h-5 w-5" aria-hidden="true" /><h2 className="font-bold">We're checking {agency.agencyName}</h2></div>
        <p className="mt-2 text-sm text-amber-900">We check your {agency.gstin ? "GSTIN" : "PAN"} and reply by email, usually within two working days. Until then your account works as a traveler account.</p>
        <button onClick={onEdit} className="mt-4 rounded-xl border border-amber-400 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100">Edit application</button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-rose-300 bg-rose-50 p-6">
      <div className="flex items-center gap-2 text-rose-800"><AlertCircle className="h-5 w-5" aria-hidden="true" />
        <h2 className="font-bold">{agency.status === "REJECTED" ? "We couldn't approve your agency yet" : "Agent prices are paused on your account"}</h2>
      </div>
      {agency.reviewNote && <p className="mt-2 text-sm text-rose-900">Reason: {agency.reviewNote}</p>}
      {agency.status === "REJECTED"
        ? <button onClick={onEdit} className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500">Fix details and apply again</button>
        : <p className="mt-2 text-sm text-rose-900">Bookings you already made are not affected; see them in <Link to="/agents/dashboard" className="font-bold underline">My agent bookings</Link>. Contact us to talk about it.</p>}
    </div>
  );
}

export default function TravelAgentsPage({ openForm = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [program, setProgram] = useState({ discountMinPct: 5, discountMaxPct: 10 });
  const [agency, setAgency] = useState(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getAgentProgram().then((res) => setProgram(res)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    api.getMyAgency()
      .then((res) => {
        setAgency(res.agency);
        if (!res.agency && openForm) setEditing(true);
        if (!res.agency) setForm((current) => ({ ...current, contactName: current.contactName || user.name || "", phone: current.phone || user.phone || "" }));
      })
      .catch((err) => setError(err.message || "Your agency couldn't be loaded"))
      .finally(() => setLoading(false));
  }, [user, openForm]);

  const startApplication = () => {
    if (!user) {
      navigate(`/signup?from=${encodeURIComponent("/agents/signup")}`);
      return;
    }
    if (agency) {
      setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, agency[key] || ""])) });
    }
    setEditing(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.gstin.trim() && !form.pan.trim()) { setError("Enter your agency's GSTIN or PAN"); return; }
    setSaving(true);
    try {
      const res = await api.applyAsAgency(form);
      setAgency(res.agency);
      setEditing(false);
    } catch (err) {
      setError(err.message || "Your application couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });
  const isTraveler = !user || String(user.role || user.user_metadata?.role || "traveler").toUpperCase() === "TRAVELER";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <SeoHead
        title="Travel agents: book IdeaHoliday tours, transfers and packages at agent prices"
        description={`Travel agencies book every IdeaHoliday listing for their clients at ${program.discountMinPct}–${program.discountMaxPct}% below the website price. Sign up with your GSTIN or PAN.`}
      />
      <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800"><Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> For travel agents</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">Book for your clients at agent prices</h1>
          <p className="mt-3 text-base text-stone-600">
            Tours, activities, attractions, transfers, holiday packages and multi-city circuits from verified local operators,
            {" "}{program.discountMinPct}–{program.discountMaxPct}% below the price on our website. You charge your client what you like.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-stone-700">
            <li className="flex gap-3"><BadgePercent className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> Your agent price is shown on every listing once you're approved.</li>
            <li className="flex gap-3"><Ticket className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> Live seats and instant vouchers, the same as our travelers get.</li>
            <li className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" /> Sign up with your GSTIN or PAN. We check it and approve you by email.</li>
          </ul>
          <p className="mt-6 text-xs text-stone-500">Pay online when you book. One login for you and your bookings: the same account works on the website and the app.</p>
        </div>

        <div>
          {loading && <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">Loading…</div>}
          {!loading && error && !editing && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-700"><AlertCircle className="h-4 w-4" aria-hidden="true" /> {error}</div>
          )}
          {!loading && !isTraveler && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
              You're signed in with a supplier or staff login. Sign in with a traveler account to apply as a travel agent.
            </div>
          )}
          {!loading && isTraveler && !editing && agency && <StatusPanel agency={agency} onEdit={startApplication} onSaved={setAgency} />}
          {!loading && isTraveler && !editing && !agency && (
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="font-bold text-stone-900">Join as a travel agent</h2>
              <p className="mt-1 text-sm text-stone-600">{user ? "Takes two minutes. Keep your GSTIN or PAN handy." : "Create a free account or sign in, then tell us about your agency."}</p>
              <button onClick={startApplication} className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400">
                {user ? "Apply now" : "Sign up or sign in to apply"}
              </button>
            </div>
          )}
          {!loading && isTraveler && editing && (
            <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-2">
              <h2 className="font-bold text-stone-900 sm:col-span-2">Your agency</h2>
              <label className="text-xs font-bold text-stone-700 sm:col-span-2">Agency name<input required minLength={2} maxLength={160} className={inputClass} {...field("agencyName")} /></label>
              <label className="text-xs font-bold text-stone-700">Contact person<input required minLength={2} maxLength={120} className={inputClass} {...field("contactName")} /></label>
              <div className="text-xs font-bold text-stone-700"><label htmlFor="agency-phone">WhatsApp number</label><PhoneInput id="agency-phone" required value={form.phone} onChange={(phone) => setForm({ ...form, phone })} className="mt-1" inputClassName={inputClass.replace("mt-1 ", "")} /></div>
              <label className="text-xs font-bold text-stone-700">GSTIN<input maxLength={15} placeholder="09ABCDE1234F1Z5" className={`${inputClass} uppercase`} {...field("gstin")} /></label>
              <label className="text-xs font-bold text-stone-700">PAN<input maxLength={10} placeholder="ABCDE1234F" className={`${inputClass} uppercase`} {...field("pan")} /></label>
              <p className="-mt-1 text-[11px] text-stone-500 sm:col-span-2">One of the two is enough. With a GSTIN we take the PAN from it.</p>
              <label className="text-xs font-bold text-stone-700 sm:col-span-2">Office address<input maxLength={500} className={inputClass} {...field("address")} /></label>
              <label className="text-xs font-bold text-stone-700">City<input required minLength={2} maxLength={100} className={inputClass} {...field("city")} /></label>
              <label className="text-xs font-bold text-stone-700">State<input required minLength={2} maxLength={100} className={inputClass} {...field("state")} /></label>
              <label className="text-xs font-bold text-stone-700 sm:col-span-2">Website or Instagram (optional)<input maxLength={300} className={inputClass} {...field("website")} /></label>
              {error && <p role="alert" className="text-xs font-semibold text-rose-700 sm:col-span-2">{error}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <button disabled={saving} className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-60">{saving ? "Sending…" : "Send application"}</button>
                {agency && <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-bold hover:bg-stone-100">Cancel</button>}
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
