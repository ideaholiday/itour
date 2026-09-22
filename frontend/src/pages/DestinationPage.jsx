import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { api } from "../lib/api.js";
import { withImageList } from "../lib/destinations.js";
import SeoHead from "../components/SeoHead.jsx";
import TicketCard from "../components/TicketCard.jsx";
import { useCurrency } from "../lib/currency.jsx";
import { destinationPath, destinationSeo } from "../../../shared/destinationSeo.js";
import { BlogPostCard } from "./BlogIndex.jsx";

// Page text in English and Hindi (ADR 028). Listing titles stay as suppliers wrote them.
const TEXT = {
  en: {
    loading: "Loading…",
    missing: "We don't list this place yet",
    browse: "Browse all destinations",
    home: "Home",
    heading: (name) => `Things to do in ${name}`,
    count: (count) => `${count} experience${count === 1 ? "" : "s"}`,
    from: (price) => `from ${price}`,
    empty: (name) => `Nothing is bookable in ${name} yet. Check back soon.`,
    filter: "Filter by date, price and type",
    guides: (name) => `${name} travel guides`,
    faqs: (name) => `${name}: common questions`,
    switchLabel: "हिन्दी में पढ़ें",
  },
  hi: {
    loading: "लोड हो रहा है…",
    missing: "यह जगह अभी हमारी सूची में नहीं है",
    browse: "सभी जगहें देखें",
    home: "होम",
    heading: (name) => `${name} में करने लायक चीज़ें`,
    count: (count) => `${count} अनुभव`,
    from: (price) => `${price} से`,
    empty: (name) => `${name} में अभी कुछ भी बुक नहीं हो सकता। जल्द ही फिर देखें।`,
    filter: "तारीख, कीमत और प्रकार से फ़िल्टर करें",
    guides: (name) => `${name} ट्रैवल गाइड`,
    faqs: (name) => `${name}: आम सवाल`,
    switchLabel: "Read in English",
  },
};

// "Things to do in <city>": a landing page for search engines and shared links,
// in English or Hindi (/hi/…). The server writes the same head tags (routes/seo.js) before this loads.
export default function DestinationPage({ lang = "en" }) {
  const t = TEXT[lang] || TEXT.en;
  const { citySlug } = useParams();
  const { formatPrice } = useCurrency();
  const [page, setPage] = useState(null);
  const [status, setStatus] = useState("loading");
  const [guides, setGuides] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.getDestinationPage(citySlug, lang)
      .then((data) => { if (!cancelled) { setPage({ ...data, products: (data.products || []).map(withImageList) }); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("missing"); });
    return () => { cancelled = true; };
  }, [citySlug, lang]);

  useEffect(() => {
    if (!page?.name) return undefined;
    let cancelled = false;
    api.getBlogPosts({ city: page.name })
      .then((res) => { if (!cancelled) setGuides((res.posts || []).slice(0, 3)); })
      .catch(() => { if (!cancelled) setGuides([]); });
    return () => { cancelled = true; };
  }, [page?.name]);

  if (status === "loading") {
    return <div lang={lang} className="mx-auto max-w-6xl px-4 py-16 text-center text-stone-500">{t.loading}</div>;
  }
  if (status === "missing" || !page) {
    return (
      <div lang={lang} className="mx-auto max-w-xl px-4 py-16 text-center">
        <SeoHead title="Destination not found" noindex lang={lang} canonical={`https://ideaholiday.in${lang === "hi" ? "/hi" : ""}/things-to-do/${encodeURIComponent(citySlug)}`} />
        <h1 className="font-display text-3xl text-stone-900 dark:text-stone-100">{t.missing}</h1>
        <Link to="/search" className="mt-6 inline-flex items-center gap-2 font-bold text-amber-700">{t.browse} <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  const seo = destinationSeo(page, { lang });
  const otherLang = lang === "hi" ? "en" : "hi";
  const searchLink = `/search?destination=${encodeURIComponent(page.name)}`;
  const place = [page.state, page.country !== "India" ? page.country : null].filter(Boolean).join(", ");

  return (
    <div lang={lang} className="bg-stone-50 dark:bg-stone-950">
      <SeoHead title={seo.title} description={seo.description} canonical={seo.canonical} image={seo.image} jsonLd={seo.jsonLd} noindex={page.productCount === 0} lang={seo.lang} alternates={seo.alternates} />

      <section className="relative overflow-hidden bg-stone-900">
        {page.heroImage && <img src={page.heroImage} alt={page.name} className="absolute inset-0 h-full w-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/40 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-24 sm:pt-32">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-white/70">
            <nav aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white">{t.home}</Link> <span aria-hidden="true">/</span> <span>{page.name}</span>
            </nav>
            <Link to={destinationPath(page.name, otherLang)} hrefLang={otherLang} lang={otherLang} className="rounded-full border border-white/40 px-3 py-1 text-white hover:bg-white/10">{t.switchLabel}</Link>
          </div>
          <h1 className="font-display text-4xl text-white sm:text-6xl">{t.heading(page.name)}</h1>
          {(page.tagline || place) && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 sm:text-base">
              <MapPin className="h-4 w-4" /> {page.tagline || place}
            </p>
          )}
          {page.productCount > 0 && (
            <p className="mt-2 text-sm font-bold text-amber-300">
              {t.count(page.productCount)}
              {page.fromPriceInr > 0 ? ` · ${t.from(formatPrice(page.fromPriceInr))}` : ""}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {page.categories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {page.categories.map((category) => (
              <Link
                key={category.name}
                to={`${searchLink}&category=${encodeURIComponent(category.name)}`}
                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-stone-700 hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
              >
                {category.name} <span className="text-stone-400">{category.count}</span>
              </Link>
            ))}
          </div>
        )}

        {page.products.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {page.products.map((activity) => <TicketCard key={activity.id} activity={activity} />)}
          </div>
        ) : (
          <p className="rounded-3xl border border-dashed border-stone-300 p-8 text-center text-stone-600 dark:border-stone-700 dark:text-stone-400">
            {t.empty(page.name)}
          </p>
        )}

        <Link to={searchLink} className="mt-8 inline-flex items-center gap-2 font-extrabold text-amber-700 hover:text-amber-800 dark:text-amber-400">
          {t.filter} <ArrowRight className="h-4 w-4" />
        </Link>

        {guides.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-stone-900 dark:text-stone-100 sm:text-3xl">{t.guides(page.name)}</h2>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((post) => <BlogPostCard key={post.id} post={post} />)}
            </div>
          </section>
        )}

        {page.faqs.length > 0 && (
          <section className="mt-12 max-w-3xl">
            <h2 className="font-display text-2xl text-stone-900 dark:text-stone-100 sm:text-3xl">{t.faqs(page.name)}</h2>
            <div className="mt-4 divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
              {page.faqs.map((faq) => (
                <div key={faq.question} className="p-5">
                  <h3 className="font-bold text-stone-900 dark:text-stone-100">{faq.question}</h3>
                  <p className="mt-1.5 text-stone-600 dark:text-stone-400">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
