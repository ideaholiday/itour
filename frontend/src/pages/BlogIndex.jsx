import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, MapPin } from "lucide-react";
import { api } from "../lib/api.js";
import SeoHead from "../components/SeoHead.jsx";
import { blogIndexSeo } from "../../../shared/blogSeo.js";
import { formatPostDate } from "./BlogPost.jsx";

export function BlogPostCard({ post }) {
  return (
    <Link to={post.path} className="group flex flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      {post.coverImage
        ? <img src={post.coverImage} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
        : <div className="aspect-[16/9] w-full bg-gradient-to-br from-amber-100 to-emerald-100 dark:from-stone-800 dark:to-stone-700" />}
      <div className="flex flex-1 flex-col p-5">
        {post.city && <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-700"><MapPin className="h-3 w-3" /> {post.city}</span>}
        <h2 className="mt-1.5 font-display text-xl leading-snug text-stone-900 group-hover:text-amber-800 dark:text-stone-100">{post.title}</h2>
        <p className="mt-2 line-clamp-3 text-sm text-stone-600 dark:text-stone-400">{post.excerpt}</p>
        <p className="mt-auto flex items-center gap-3 pt-4 text-xs text-stone-500">
          {post.publishedAt && <span>{formatPostDate(post.publishedAt)}</span>}
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {post.readingMinutes} min</span>
        </p>
      </div>
    </Link>
  );
}

export default function BlogIndex() {
  const [searchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [data, setData] = useState({ posts: [], pagination: null });
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.getBlogPosts({ page })
      .then((res) => { if (!cancelled) { setData(res); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [page]);

  const seo = blogIndexSeo({ page });
  const pages = data.pagination?.pages || 1;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <SeoHead title={seo.title} description={seo.description} canonical={seo.canonical} />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-600">Idea Holiday blog</p>
        <h1 className="mt-2 font-display text-4xl text-stone-900 dark:text-stone-100 sm:text-5xl">Travel guides</h1>
        <p className="mt-3 max-w-2xl text-stone-600 dark:text-stone-400">City guides, festival and pilgrimage planning and trip ideas from our team, with tours and cabs you can book.</p>

        {status === "loading" && <p className="mt-10 text-stone-500">Loading…</p>}
        {status === "error" && <p className="mt-10 text-rose-700">The guides couldn't be loaded. Please try again.</p>}
        {status === "ready" && data.posts.length === 0 && <p className="mt-10 text-stone-600">Our first guides are on the way.</p>}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.posts.map((post) => <BlogPostCard key={post.id} post={post} />)}
        </div>
        {pages > 1 && (
          <nav className="mt-10 flex justify-center gap-3" aria-label="Pages">
            {page > 1 && <Link to={page === 2 ? "/blog" : `/blog?page=${page - 1}`} className="rounded-xl border border-stone-300 px-4 py-2 font-bold">Newer</Link>}
            {page < pages && <Link to={`/blog?page=${page + 1}`} className="rounded-xl border border-stone-300 px-4 py-2 font-bold">Older</Link>}
          </nav>
        )}
      </div>
    </div>
  );
}
