import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, ImagePlus, Search } from "lucide-react";
import { api } from "../../lib/api.js";
import { uploadImage } from "../../lib/imageUpload.js";
import SupplierBadge from "./SupplierBadge.jsx";
import ReviewShareLinks from "./ReviewShareLinks.jsx";

const SOCIAL_FIELDS = [
  ["website", "Website", "https://your-business.in"],
  ["instagram", "Instagram", "https://instagram.com/yourbusiness"],
  ["facebook", "Facebook", "https://facebook.com/yourbusiness"],
  ["youtube", "YouTube", "https://youtube.com/@yourbusiness"],
];

const toList = (text) => text.split(",").map((item) => item.trim()).filter(Boolean);

function ImageField({ label, value, onChange, supplierId, hint }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await uploadImage(file, { entityType: "GENERAL", entityId: supplierId }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  return (
    <div>
      <span className="block text-xs font-bold text-stone-700">{label}</span>
      <div className="mt-1 flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-stone-300 bg-stone-50">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-stone-400" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
            {busy ? "Uploading…" : value ? "Replace" : "Upload"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={upload} disabled={busy} />
          </label>
          {value && <button type="button" onClick={() => onChange("")} className="rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Remove</button>}
        </div>
      </div>
      {hint && <p className="mt-1 text-[11px] text-stone-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/**
 * The supplier's own public profile: what travelers and Google see, the link
 * to share, and the review request links. Contact details can't be added here —
 * the server refuses them and travelers use enquiries instead.
 */
export default function SupplierPublicProfileEditor({ supplierId, products = [] }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const fill = useCallback((result) => {
    setData(result);
    setForm({
      slug: result.profile.slug,
      tagline: result.profile.tagline,
      about: result.profile.about,
      logoUrl: result.profile.logoUrl,
      coverUrl: result.profile.coverUrl,
      languages: result.profile.languages.join(", "),
      serviceCities: result.profile.serviceCities.join(", "),
      socialLinks: { ...result.profile.socialLinks },
    });
  }, []);

  useEffect(() => {
    if (!supplierId) return;
    api.getOwnPublicProfile(supplierId).then(fill).catch((err) => setError(err.message || "Your profile could not be loaded."));
  }, [supplierId, fill]);

  if (!form) {
    return error
      ? <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
      : <div className="h-64 animate-pulse rounded-3xl bg-stone-200" />;
  }

  const set = (key) => (value) => { setSaved(false); setForm((current) => ({ ...current, [key]: value })); };
  const profileUrl = `${window.location.origin.replace(/\/\/supply\./, "//")}${data.profile.path}`;

  const save = async (extra = {}) => {
    setSaving(true);
    setError("");
    try {
      const result = await api.updateOwnPublicProfile(supplierId, {
        slug: form.slug,
        tagline: form.tagline,
        about: form.about,
        logoUrl: form.logoUrl,
        coverUrl: form.coverUrl,
        languages: toList(form.languages),
        serviceCities: toList(form.serviceCities),
        socialLinks: form.socialLinks,
        ...extra,
      });
      fill(result);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const status = data.profile.profileStatus;
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`See our reviews and ask us anything on Idea Holiday: ${profileUrl}`)}`;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-stone-900">Your public profile</h2>
            <p className="mt-1 text-sm text-stone-600">Travelers find this page on Idea Holiday and on Google. Share it anywhere you talk to customers.</p>
          </div>
          <a href={profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
            View as traveler <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate text-xs text-stone-800">{profileUrl}</code>
          <div className="flex gap-2">
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-700 shadow-sm">
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy link</>}
            </button>
            <a href={whatsappShare} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Share on WhatsApp</a>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 p-4">
            <dt className="text-xs font-bold text-stone-500">Visible to travelers</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-bold text-stone-900">
              {data.visible ? <><Eye className="h-4 w-4 text-emerald-600" />Yes</> : <><EyeOff className="h-4 w-4 text-stone-400" />{status === "SUSPENDED" ? "Suspended by Idea Holiday" : "Hidden"}</>}
            </dd>
          </div>
          <div className="rounded-2xl border border-stone-200 p-4">
            <dt className="text-xs font-bold text-stone-500">On Google</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-bold text-stone-900">
              <Search className="h-4 w-4 text-stone-400" />
              {data.indexable ? "Allowed" : data.visible ? "After KYB approval" : "No"}
            </dd>
          </div>
          <div className="rounded-2xl border border-stone-200 p-4">
            <dt className="text-xs font-bold text-stone-500">Badge</dt>
            <dd className="mt-1"><SupplierBadge badge={data.publicView.badge} size="md" /></dd>
            {data.publicView.badge.status !== "VERIFIED" && (
              <p className="mt-2 text-[11px] leading-snug text-stone-500">Verified is a yearly business check by Idea Holiday: identity, bank account, address and a call with you. Contact support to start.</p>
            )}
          </div>
        </dl>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700">
            <span>Profile completeness</span><span>{data.completeness.score}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${data.completeness.score}%` }} /></div>
          {data.completeness.missing.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.completeness.missing.map((item) => <li key={item.key} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">{item.label}</li>)}
            </ul>
          )}
        </div>
      </section>

      <form
        onSubmit={(event) => { event.preventDefault(); save(); }}
        className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h3 className="font-display text-lg font-bold text-stone-900">Edit profile</h3>
        <p className="-mt-3 text-xs text-stone-500">Phone numbers, emails, links and WhatsApp can't go in the text. Travelers reach you through enquiries, which arrive in your Enquiries tab.</p>

        <label className="block text-xs font-bold text-stone-700">
          Profile link
          <div className="mt-1 flex items-center rounded-xl border border-stone-200 focus-within:border-amber-500">
            <span className="pl-3 text-xs text-stone-400">/suppliers/</span>
            <input value={form.slug} onChange={(event) => set("slug")(event.target.value)} className="w-full rounded-xl p-2.5 text-sm font-normal focus:outline-none" />
          </div>
          <span className="mt-1 block text-[11px] font-normal text-stone-500">Old links keep working if you change this.</span>
        </label>

        <label className="block text-xs font-bold text-stone-700">
          Tagline <span className="font-normal text-stone-400">({form.tagline.length}/120)</span>
          <input maxLength={120} value={form.tagline} onChange={(event) => set("tagline")(event.target.value)} placeholder="Airport transfers and day tours across Goa" className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-sm font-normal focus:border-amber-500 focus:outline-none" />
        </label>

        <label className="block text-xs font-bold text-stone-700">
          About your business <span className="font-normal text-stone-400">({form.about.length}/2000)</span>
          <textarea maxLength={2000} rows={6} value={form.about} onChange={(event) => set("about")(event.target.value)} placeholder="How long you've operated, what you run, your vehicles or guides, what travelers love about you" className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-sm font-normal focus:border-amber-500 focus:outline-none" />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <ImageField label="Logo" value={form.logoUrl} onChange={set("logoUrl")} supplierId={supplierId} hint="Square image works best, at least 400 × 400 px" />
          <ImageField label="Cover photo" value={form.coverUrl} onChange={set("coverUrl")} supplierId={supplierId} hint="Wide photo of your vehicles, team or tours, about 1500 × 500 px (3:1). Keep text away from the edges. Also used when your link is shared." />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-xs font-bold text-stone-700">
            Languages
            <input value={form.languages} onChange={(event) => set("languages")(event.target.value)} placeholder="Hindi, English, Konkani" className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-sm font-normal focus:border-amber-500 focus:outline-none" />
          </label>
          <label className="block text-xs font-bold text-stone-700">
            Cities you operate in
            <input value={form.serviceCities} onChange={(event) => set("serviceCities")(event.target.value)} placeholder="Goa, Gokarna" className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-sm font-normal focus:border-amber-500 focus:outline-none" />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-bold text-stone-700">Your other pages</legend>
          <p className="text-[11px] text-stone-500">Not shown to travelers. Google uses them to connect this profile with your business.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {SOCIAL_FIELDS.map(([key, label, placeholder]) => (
              <label key={key} className="block text-[11px] font-semibold text-stone-600">
                {label}
                <input type="url" value={form.socialLinks[key] || ""} placeholder={placeholder}
                  onChange={(event) => set("socialLinks")({ ...form.socialLinks, [key]: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-sm font-normal focus:border-amber-500 focus:outline-none" />
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button>
          {saved && <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" />Saved</span>}
          {status !== "SUSPENDED" && (
            <button type="button" disabled={saving} onClick={() => save({ profileStatus: status === "HIDDEN" ? "PUBLISHED" : "HIDDEN" })} className="ml-auto rounded-2xl border border-stone-200 px-4 py-3 text-xs font-bold text-stone-700 hover:bg-stone-50">
              {status === "HIDDEN" ? "Show my profile" : "Hide my profile"}
            </button>
          )}
        </div>
      </form>

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="font-display text-lg font-bold text-stone-900">Ask for reviews</h3>
        <p className="mt-1 text-sm text-stone-600">Send these links to past customers on WhatsApp or add them to your vouchers. Reviews from a real booking count toward your rating.</p>
        <div className="mt-4"><ReviewShareLinks products={products} /></div>
      </section>
    </div>
  );
}
