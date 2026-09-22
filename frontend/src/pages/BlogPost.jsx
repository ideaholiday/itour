import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, MapPin } from "lucide-react";
import { api } from "../lib/api.js";
import { withImageList } from "../lib/destinations.js";
import SeoHead from "../components/SeoHead.jsx";
import TicketCard from "../components/TicketCard.jsx";
import BlogBody from "../components/BlogBody.jsx";
import WhatsAppShare from "../components/WhatsAppShare.jsx";
import { blogPostSeo } from "../../../shared/blogSeo.js";
import { blogPath } from "../../../shared/blogMarkdown.js";

export const formatPostDate = (value) => (value
  ? new Date(`${String(value).replace(" ", "T")}Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
  : "");

export default function BlogPost() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.getBlogPost(slug)
      .then((res) => { if (!cancelled) { setData(res); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("missing"); });
    return () => { cancelled = true; };
  }, [slug]);

  if (status === "loading") return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-stone-500">Loading…</div>;
  if (data?.redirectTo) return <Navigate to={blogPath(data.redirectTo)} replace />;
  if (status === "missing" || !data?.post) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <SeoHead title="Post not found" noindex canonical={`https://ideaholiday.in${blogPath(slug)}`} />
        <h1 className="font-display text-3xl text-stone-900 dark:text-stone-100">This guide isn't available</h1>
        <Link to="/blog" className="mt-6 inline-flex items-center gap-2 font-bold text-amber-700">All travel guides <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  const { post } = data;
  const products = (data.products || []).map(withImageList);
  const seo = blogPostSeo(post);

  return (
    <article className="bg-stone-50 pb-16 dark:bg-stone-950">
      <SeoHead title={seo.title} description={seo.description} canonical={seo.canonical} image={seo.image} type="article" jsonLd={seo.jsonLd} />
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-500 hover:text-amber-700"><ArrowLeft className="h-4 w-4" /> Travel guides</Link>
        <h1 className="mt-4 font-display text-3xl leading-tight text-stone-900 dark:text-stone-100 sm:text-5xl">{post.title}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
          <span className="font-semibold text-stone-700 dark:text-stone-300">{post.authorName}</span>
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>}
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {post.readingMinutes} min read</span>
          {post.city && <Link to={post.cityPath} className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-800"><MapPin className="h-3.5 w-3.5" /> {post.city}</Link>}
        </p>
        <WhatsAppShare kind="blog" itemId={post.slug} className="mt-4" urls={{ en: seo.canonical }} data={{ title: post.title }} />
      </div>
      {post.coverImage && (
        <div className="mx-auto mt-6 max-w-4xl px-4">
          <img src={post.coverImage} alt="" className="aspect-[16/9] w-full rounded-3xl object-cover" />
        </div>
      )}
      <div className="mx-auto mt-8 max-w-3xl px-4">
        <BlogBody body={post.body} />
      </div>

      {products.length > 0 && (
        <section className="mx-auto mt-12 max-w-6xl px-4">
          <h2 className="font-display text-2xl text-stone-900 dark:text-stone-100 sm:text-3xl">Book from this guide</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((activity) => <TicketCard key={activity.id} activity={activity} />)}
          </div>
        </section>
      )}
      {post.city && (
        <div className="mx-auto mt-8 max-w-6xl px-4">
          <Link to={post.cityPath} className="inline-flex items-center gap-2 font-extrabold text-amber-700 hover:text-amber-800 dark:text-amber-400">
            All things to do in {post.city} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </article>
  );
}
