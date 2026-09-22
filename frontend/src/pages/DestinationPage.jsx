import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import { api } from "../lib/api.js";
import { withImageList } from "../lib/destinations.js";
import SeoHead from "../components/SeoHead.jsx";
import TicketCard from "../components/TicketCard.jsx";
import { useCurrency } from "../lib/currency.jsx";
import { destinationSeo } from "../../../shared/destinationSeo.js";

// "Things to do in <city>": a landing page for search engines and shared links.
// The server writes the same head tags (routes/seo.js) before this loads.
export default function DestinationPage() {
  const { citySlug } = useParams();
  const { formatPrice } = useCurrency();
  const [page, setPage] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.getDestinationPage(citySlug)
      .then((data) => { if (!cancelled) { setPage({ ...data, products: (data.products || []).map(withImageList) }); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("missing"); });
    return () => { cancelled = true; };
  }, [citySlug]);

  if (status === "loading") {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-stone-500">Loading…</div>;
  }
  if (status === "missing" || !page) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <SeoHead title="Destination not found" noindex canonical={`https://ideaholiday.in/things-to-do/${encodeURIComponent(citySlug)}`} />
        <h1 className="font-display text-3xl text-stone-900 dark:text-stone-100">We don't list this place yet</h1>
        <Link to="/search" className="mt-6 inline-flex items-center gap-2 font-bold text-amber-700">Browse all destinations <ArrowRight className="h-4 w-4" /></Link>
      </div>
    );
  }

  const seo = destinationSeo(page);
  const searchLink = `/search?destination=${encodeURIComponent(page.name)}`;
  const place = [page.state, page.country !== "India" ? page.country : null].filter(Boolean).join(", ");

  return (
    <div className="bg-stone-50 dark:bg-stone-950">
      <SeoHead title={seo.title} description={seo.description} canonical={seo.canonical} image={seo.image} jsonLd={seo.jsonLd} noindex={page.productCount === 0} />

      <section className="relative overflow-hidden bg-stone-900">
        {page.heroImage && <img src={page.heroImage} alt={page.name} className="absolute inset-0 h-full w-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/40 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-24 sm:pt-32">
          <nav aria-label="Breadcrumb" className="mb-3 text-xs font-semibold text-white/70">
            <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden="true">/</span> <span>{page.name}</span>
          </nav>
          <h1 className="font-display text-4xl text-white sm:text-6xl">Things to do in {page.name}</h1>
          {(page.tagline || place) && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 sm:text-base">
              <MapPin className="h-4 w-4" /> {page.tagline || place}
            </p>
          )}
          {page.productCount > 0 && (
            <p className="mt-2 text-sm font-bold text-amber-300">
              {page.productCount} experience{page.productCount === 1 ? "" : "s"}
              {page.fromPriceInr > 0 ? ` · from ${formatPrice(page.fromPriceInr)}` : ""}
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
            Nothing is bookable in {page.name} yet. Check back soon.
          </p>
        )}

        <Link to={searchLink} className="mt-8 inline-flex items-center gap-2 font-extrabold text-amber-700 hover:text-amber-800 dark:text-amber-400">
          Filter by date, price and type <ArrowRight className="h-4 w-4" />
        </Link>

        {page.faqs.length > 0 && (
          <section className="mt-12 max-w-3xl">
            <h2 className="font-display text-2xl text-stone-900 dark:text-stone-100 sm:text-3xl">{page.name}: common questions</h2>
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
