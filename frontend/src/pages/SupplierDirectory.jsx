import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { api } from "../lib/api.js";
import SeoHead from "../components/SeoHead.jsx";
import StarRating from "../components/StarRating.jsx";
import Avatar from "../components/ui/Avatar.jsx";
import SupplierBadge from "../components/supplier/SupplierBadge.jsx";

const ORIGIN = "https://ideaholiday.in";

export function SupplierCard({ supplier }) {
  return (
    <Link to={supplier.path} className="flex min-w-0 items-start gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md">
      {supplier.logoUrl
        ? <img src={supplier.logoUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
        : <Avatar name={supplier.name} size="lg" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 max-w-full truncate font-display text-base font-bold text-stone-900">{supplier.name}</h3>
          <SupplierBadge verified={supplier.verified} />
        </div>
        {supplier.tagline && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{supplier.tagline}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
          {supplier.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[supplier.city, supplier.state].filter(Boolean).join(", ")}</span>}
          <StarRating rating={supplier.rating.average} count={supplier.rating.count} newLabel="No reviews yet" />
        </div>
      </div>
    </Link>
  );
}

export default function SupplierDirectory() {
  const { citySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [city, setCity] = useState(null);
  const [cities, setCities] = useState([]);
  const [results, setResults] = useState({ suppliers: [], pagination: null });
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const q = searchParams.get("q") || "";
  const verifiedOnly = searchParams.get("verified") === "1";
  const page = Number(searchParams.get("page") || 1);

  useEffect(() => {
    api.getSupplierDirectoryCities().then((data) => setCities(data.cities || [])).catch(() => setCities([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        let cityName = "";
        if (citySlug) {
          const found = await api.getSupplierDirectoryCity(citySlug);
          if (cancelled) return;
          setCity(found.city);
          cityName = found.city.city;
        } else {
          setCity(null);
        }
        const data = await api.searchSuppliers({ q, city: cityName, verified: verifiedOnly ? 1 : undefined, page });
        if (cancelled) return;
        setResults(data);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) setStatus(err.status === 404 ? "missing" : "error");
      }
    })();
    return () => { cancelled = true; };
  }, [citySlug, q, verifiedOnly, page]);

  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next);
  };

  const heading = city ? `Tour operators in ${city.city}` : "Tour and travel operators in India";
  const canonical = city ? `${ORIGIN}${city.path}` : `${ORIGIN}/suppliers`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SeoHead
        title={`${heading} | Idea Holiday`}
        description={city
          ? `Local tour operators, transfer companies and activity providers in ${city.city}. See who is verified, read reviews and send an enquiry.`
          : "Find local tour operators, transfer companies and activity providers across India. See which are verified, read reviews and send an enquiry."}
        canonical={canonical}
        noindex={status === "missing" || (city && !city.indexable) || Boolean(q) || verifiedOnly || page > 1}
      />

      <nav className="flex flex-wrap items-center gap-2 text-xs text-stone-500" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-amber-800">Home</Link><span>›</span>
        {city ? <><Link to="/suppliers" className="hover:text-amber-800">Operators</Link><span>›</span><span>{city.city}</span></> : <span>Operators</span>}
      </nav>

      <h1 className="mt-4 font-display text-3xl font-bold text-stone-900">{status === "missing" ? "No operators listed here yet" : heading}</h1>
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Every operator here is registered with Idea Holiday. <strong className="text-stone-800">Verified</strong> operators have also passed our yearly business checks.
      </p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={(event) => { event.preventDefault(); updateParams({ q: query.trim() }); }}
        role="search"
      >
        <label className="relative flex-1">
          <span className="sr-only">Search operators</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Operator name or city" className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-stone-700">
          <input type="checkbox" checked={verifiedOnly} onChange={(event) => updateParams({ verified: event.target.checked ? "1" : "" })} className="h-4 w-4 accent-amber-500" />
          Verified only
        </label>
        <button type="submit" className="rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 hover:bg-amber-400">Search</button>
      </form>

      {cities.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Browse by city">
          {cities.slice(0, 20).map((entry) => (
            <Link key={entry.slug} to={entry.path} className={`rounded-full border px-3 py-1 text-xs font-semibold ${city?.slug === entry.slug ? "border-amber-500 bg-amber-50 text-amber-900" : "border-stone-200 bg-white text-stone-700 hover:border-amber-300"}`}>
              {entry.city} <span className="text-stone-400">{entry.supplierCount}</span>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-8">
        {status === "loading" && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="h-28 animate-pulse rounded-3xl bg-stone-200" />)}</div>}
        {status === "error" && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">Operators could not be loaded. Please try again.</p>}
        {status === "missing" && <p className="text-sm text-stone-600">We don't have operators in this city yet. <Link to="/suppliers" className="font-bold text-amber-800 underline">See all operators</Link></p>}
        {status === "ready" && (
          results.suppliers.length === 0 ? (
            <p className="text-sm text-stone-600">No operators match your search.</p>
          ) : (
            <>
              <p className="mb-4 text-xs text-stone-500">{results.pagination.total} operator{results.pagination.total === 1 ? "" : "s"}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {results.suppliers.map((supplier) => <SupplierCard key={supplier.slug} supplier={supplier} />)}
              </div>
              {results.pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3 text-sm">
                  <button type="button" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })} className="rounded-xl border border-stone-200 px-4 py-2 font-bold disabled:opacity-40">Previous</button>
                  <span className="text-stone-500">Page {page} of {results.pagination.totalPages}</span>
                  <button type="button" disabled={!results.pagination.hasNext} onClick={() => updateParams({ page: String(page + 1) })} className="rounded-xl border border-stone-200 px-4 py-2 font-bold disabled:opacity-40">Next</button>
                </div>
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}
