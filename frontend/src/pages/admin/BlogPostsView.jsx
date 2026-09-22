import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Plus, RefreshCw, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { uploadImage } from "../../lib/imageUpload.js";
import BlogBody from "../../components/BlogBody.jsx";

const inputClass = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";
const EMPTY = { title: "", slug: "", excerpt: "", city: "", coverImage: "", productIds: "", body: "", status: "DRAFT" };
const idList = (value) => String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);

const toForm = (post) => ({
  title: post.title, slug: post.slug, excerpt: post.excerpt || "", city: post.city || "", coverImage: post.coverImage || "",
  productIds: post.productIds.join(", "), body: post.body, status: post.status,
});

const FORMAT_HELP = "## Heading · ### Subheading · - bullet · 1. numbered · > quote · **bold** · [text](/things-to-do/goa) · blank line = new paragraph";

/**
 * Staff blog (ADR 026). Posts are drafts until published; only published
 * posts are public. Linked listings show under the post while they are live.
 */
export default function BlogPostsView() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // { id | null, form }
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.adminListBlogPosts()
      .then((res) => setPosts(res.posts || []))
      .catch((err) => setError(err.message || "Posts couldn't be loaded"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setEditing((current) => ({ ...current, form: { ...current.form, [key]: value } }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { form } = editing;
    const payload = {
      title: form.title,
      slug: form.slug || null,
      excerpt: form.excerpt || null,
      city: form.city || null,
      coverImage: form.coverImage || null,
      productIds: idList(form.productIds),
      body: form.body,
      status: form.status,
    };
    try {
      const res = editing.id ? await api.adminUpdateBlogPost(editing.id, payload) : await api.adminCreateBlogPost(payload);
      setNotice(`"${res.post.title}" saved${res.post.status === "PUBLISHED" ? " and live" : " as a draft"}.`);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message || "That post couldn't be saved");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post) => {
    if (!window.confirm(`Delete "${post.title}"? Its link will stop working.`)) return;
    setError("");
    try {
      await api.adminDeleteBlogPost(post.id);
      setNotice(`"${post.title}" deleted.`);
      load();
    } catch (err) {
      setError(err.message || "That post couldn't be deleted");
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      setField("coverImage", await uploadImage(file));
    } catch (err) {
      setError(err.message || "The photo couldn't be uploaded");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">Blog</h1>
          <p className="text-sm text-stone-500">Travel guides at /blog. Link each one to a city and to listings people can book.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
          <button type="button" onClick={() => { setPreview(false); setEditing({ id: null, form: EMPTY }); }} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" /> New post</button>
        </div>
      </div>

      {error && <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {error}</p>}
      {notice && <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> {notice}</p>}

      {editing && (
        <form onSubmit={save} className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">{editing.id ? "Edit post" : "New post"}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><X className="h-5 w-5" /></button>
          </div>
          <label className="block text-sm font-semibold text-stone-700">Title
            <input required minLength={3} maxLength={160} value={editing.form.title} onChange={(e) => setField("title", e.target.value)} className={inputClass} placeholder="Kedarnath Yatra 2026: a complete guide" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-stone-700">Web address (optional)
              <input value={editing.form.slug} onChange={(e) => setField("slug", e.target.value)} className={inputClass} placeholder="made from the title" />
            </label>
            <label className="block text-sm font-semibold text-stone-700">City (optional)
              <input value={editing.form.city} onChange={(e) => setField("city", e.target.value)} className={inputClass} placeholder="Goa" />
            </label>
          </div>
          <label className="block text-sm font-semibold text-stone-700">Summary (shown in Google and link previews)
            <textarea maxLength={300} rows={2} value={editing.form.excerpt} onChange={(e) => setField("excerpt", e.target.value)} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-stone-700">Cover photo
              <input value={editing.form.coverImage} onChange={(e) => setField("coverImage", e.target.value)} className={inputClass} placeholder="https://… or upload" />
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} className="mt-2 text-xs" />
            </label>
            <label className="block text-sm font-semibold text-stone-700">Listings to book (product ids, up to 12)
              <input value={editing.form.productIds} onChange={(e) => setField("productIds", e.target.value)} className={inputClass} placeholder="prod_abc, prod_def" />
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Post</span>
              <button type="button" onClick={() => setPreview((value) => !value)} className="text-xs font-bold text-amber-700">{preview ? "Edit" : "Preview"}</button>
            </div>
            {preview
              ? <div className="mt-1 rounded-xl border border-stone-200 p-4"><BlogBody body={editing.form.body} /></div>
              : <textarea rows={18} maxLength={60000} value={editing.form.body} onChange={(e) => setField("body", e.target.value)} className={`${inputClass} font-mono`} />}
            <p className="mt-1 text-xs text-stone-500">{FORMAT_HELP}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-stone-700">
              <input type="checkbox" checked={editing.form.status === "PUBLISHED"} onChange={(e) => setField("status", e.target.checked ? "PUBLISHED" : "DRAFT")} className="h-4 w-4 accent-amber-600" />
              Published (visible to everyone)
            </label>
            <button type="submit" disabled={saving || uploading} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        {posts.length === 0 && !loading && <p className="p-6 text-sm text-stone-500">No posts yet. Write the first guide.</p>}
        {posts.map((post) => (
          <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4 last:border-0">
            <div className="min-w-0">
              <p className="truncate font-bold text-stone-900">{post.title}</p>
              <p className="text-xs text-stone-500">
                <span className={post.status === "PUBLISHED" ? "font-bold text-emerald-700" : "font-bold text-stone-500"}>{post.status === "PUBLISHED" ? "Live" : "Draft"}</span>
                {post.city ? ` · ${post.city}` : ""} · {post.readingMinutes} min · {post.path}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {post.status === "PUBLISHED" && <a href={post.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-stone-600"><ExternalLink className="h-4 w-4" /> View</a>}
              <button type="button" onClick={() => { setPreview(false); setEditing({ id: post.id, form: toForm(post) }); }} className="rounded-lg border border-stone-200 px-3 py-1.5 font-semibold">Edit</button>
              <button type="button" onClick={() => remove(post)} className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-700">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
