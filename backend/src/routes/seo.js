import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "../db.js";
import logger from "../config/logger.js";
import { approvedSupplierSql } from "../services/supplierKybGate.js";
import { activityPath } from "../../../shared/activityUrl.js";
import { activitySeo, displayCity } from "../../../shared/activitySeo.js";
import {
  findDirectoryCity, isProfileVisible, profilePath, publicSupplierView, resolveProfileSlug, sitemapSupplierEntries,
} from "../services/supplierProfileService.js";

const router = Router();
const BASE_URL = process.env.PUBLIC_ORIGIN || "https://ideaholiday.in";
const DEFAULT_SOCIAL_IMAGE = "https://ideaholiday.in/idea-holiday-social.png";
const INDEX_TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "frontend", "dist", "index.html");

// Product identity remains stable when a title changes; old links redirect permanently.
router.get(["/activity/:id", "/activity/:slug/:id"], (req, res, next) => {
  try {
    const product = db.prepare("SELECT id, title FROM products WHERE id = ?").get(req.params.id);
    if (!product) return next();
    const canonical = activityPath(product);
    if (req.path === canonical) return next();
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(301, `${canonical}${query}`);
  } catch (error) { next(error); }
});

/** Products and cities with something bookable today (see liveProductSql). */
export function generateSitemapXml(products = [], baseUrl = BASE_URL, cities = []) {
  const staticUrls = [
    { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${baseUrl}/transfers`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/search`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/how-it-works`, priority: "0.7", changefreq: "monthly" },
    { loc: `${baseUrl}/about-us`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/contact-us`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/terms`, priority: "0.5", changefreq: "monthly" },
    { loc: `${baseUrl}/cancellation`, priority: "0.5", changefreq: "monthly" },
    { loc: `${baseUrl}/privacy-policy`, priority: "0.5", changefreq: "monthly" },
  ];

  const destinationUrls = (cities || []).map((city) => ({
    loc: `${baseUrl}${citySearchPath(city.name)}`,
    priority: "0.8",
    changefreq: "weekly",
  }));

  // No <lastmod>: products carry no edit time, and a guessed date teaches
  // Google to ignore the field for the whole site.
  const productUrls = (products || []).map((p) => ({
    loc: `${baseUrl}${activityPath(p)}`,
    priority: "0.85",
    changefreq: "weekly",
  }));

  const allUrls = [...staticUrls, ...destinationUrls, ...productUrls];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  allUrls.forEach((entry) => {
    xml += `  <url>\n`;
    xml += `    <loc>${xmlEscape(entry.loc)}</loc>\n`;
    if (entry.changefreq) {
      xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
    }
    if (entry.priority) {
      xml += `    <priority>${entry.priority}</priority>\n`;
    }
    xml += `  </url>\n`;
  });

  xml += `</urlset>`;
  return xml;
}

export function generateRobotsTxt(baseUrl = BASE_URL) {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/*
Disallow: /ops
Disallow: /ops/*
Disallow: /supplier/dashboard
Disallow: /supplier/bookings
Disallow: /checkout
Disallow: /checkout/*
Disallow: /circuit-checkout/
Disallow: /booking-confirmed/
Disallow: /driver/
Disallow: /track/

Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-suppliers.xml
`;
}

const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Supplier profiles and city directory pages that are allowed in Google. */
export function generateSupplierSitemapXml({ profiles = [], cities = [] } = {}, baseUrl = BASE_URL) {
  const day = (value) => {
    const date = new Date(String(value || "").replace(" ", "T"));
    return Number.isFinite(date.getTime()) ? date.toISOString().split("T")[0] : null;
  };
  const urls = [
    { loc: `${baseUrl}/suppliers`, changefreq: "daily", priority: "0.7" },
    ...cities.map((city) => ({ loc: `${baseUrl}${city.path}`, changefreq: "weekly", priority: "0.7" })),
    ...profiles.map((profile) => ({ loc: `${baseUrl}${profile.path}`, lastmod: day(profile.updatedAt), changefreq: "weekly", priority: "0.6" })),
  ];
  const body = urls.map((entry) => [
    "  <url>",
    `    <loc>${xmlEscape(entry.loc)}</loc>`,
    entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    "  </url>",
  ].filter(Boolean).join("\n")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** JSON for a <script> body: `<` is escaped so no value can close the tag. */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const HEAD_TAG_PATTERNS = [
  /<title>[\s\S]*?<\/title>\s*/i,
  /<meta\s+name="description"[^>]*>\s*/i,
  /<meta\s+name="robots"[^>]*>\s*/i,
  /<meta\s+property="og:(?:title|description|image|type|url)"[^>]*>\s*/gi,
  /<meta\s+name="twitter:(?:title|description|image)"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/i,
  /<script[^>]+id="structured-data-json-ld"[\s\S]*?<\/script>\s*/i,
];

/**
 * Writes a page's own title, description, canonical, robots, Open Graph and
 * JSON-LD into the built index.html, replacing the site-wide defaults. Link
 * previews (WhatsApp, Facebook) never run JavaScript, so without this every
 * shared profile would preview as the home page. SeoHead updates the same tags
 * in the browser afterwards.
 */
export function renderSeoHtml(template, { title, description, canonical, image = DEFAULT_SOCIAL_IMAGE, robots = "index, follow", type = "website", jsonLd = null }) {
  let html = String(template);
  for (const pattern of HEAD_TAG_PATTERNS) html = html.replace(pattern, "");
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    jsonLd ? `<script type="application/ld+json" id="structured-data-json-ld">${jsonForScript(jsonLd)}</script>` : null,
  ].filter(Boolean).map((tag) => `    ${tag}`).join("\n");
  return html.replace(/<\/head>/i, `${tags}\n  </head>`);
}

function absoluteUrl(url, baseUrl) {
  if (!url) return null;
  return /^https:\/\//i.test(url) ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

function excerpt(text, max = 155) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

// Google shows review stars only when there is enough to rate; three counted
// reviews is our floor for putting a rating in structured data.
const MIN_REVIEWS_FOR_RATING_MARKUP = 3;

export function supplierProfileSeo(view, baseUrl = BASE_URL) {
  const canonical = `${baseUrl}${view.path}`;
  const place = [view.city, view.state].filter(Boolean).join(", ");
  const ratingLine = view.rating.count > 0 && view.rating.average
    ? ` Rated ${view.rating.average}/5 from ${view.rating.count} verified review${view.rating.count === 1 ? "" : "s"}.`
    : "";
  const lead = view.tagline || excerpt(view.about, 110) || `Travel operator${place ? ` in ${place}` : ""}.`;
  const description = excerpt(`${lead.replace(/[.\s]*$/, ".")}${ratingLine} Read reviews and send an enquiry on Idea Holiday.`);
  const image = absoluteUrl(view.coverUrl || view.logoUrl, baseUrl) || DEFAULT_SOCIAL_IMAGE;

  const business = {
    "@type": "TravelAgency",
    "@id": `${canonical}#business`,
    name: view.name,
    url: canonical,
    description: view.about ? excerpt(view.about, 500) : lead,
    image,
    ...(view.logoUrl ? { logo: absoluteUrl(view.logoUrl, baseUrl) } : {}),
    address: { "@type": "PostalAddress", ...(view.city ? { addressLocality: view.city } : {}), ...(view.state ? { addressRegion: view.state } : {}), addressCountry: "IN" },
    ...(view.serviceCities.length ? { areaServed: view.serviceCities } : {}),
    ...(view.languages.length ? { knowsLanguage: view.languages } : {}),
    ...(view.sameAs.length ? { sameAs: view.sameAs } : {}),
    ...(view.rating.count >= MIN_REVIEWS_FOR_RATING_MARKUP && view.rating.average ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: view.rating.average, reviewCount: view.rating.count, bestRating: 5, worstRating: 1 },
    } : {}),
  };
  const crumbs = [
    { name: "Home", item: `${baseUrl}/` },
    { name: "Operators", item: `${baseUrl}/suppliers` },
    ...(view.city && view.cityPath ? [{ name: view.city, item: `${baseUrl}${view.cityPath}` }] : []),
    { name: view.name, item: canonical },
  ];

  return {
    title: `${view.name}${view.city ? ` – Travel operator in ${view.city}` : ""} | Idea Holiday`,
    description,
    canonical,
    image,
    type: "profile",
    robots: view.indexable ? "index, follow" : "noindex, follow",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        business,
        { "@type": "BreadcrumbList", itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })) },
      ],
    },
  };
}

const NOT_FOUND_SEO = (baseUrl, pathName) => ({
  title: "Operator not found | Idea Holiday",
  description: "This operator profile is not available on Idea Holiday.",
  canonical: `${baseUrl}${pathName}`,
  robots: "noindex, follow",
});

/**
 * What /suppliers/:slug answers before the SPA loads: a 301 for a renamed
 * profile, the page with its own head tags, or a noindex 404.
 */
export function supplierProfilePage(database, slug, template, baseUrl = BASE_URL) {
  const resolved = resolveProfileSlug(database, slug);
  if (resolved?.redirectTo) return { status: 301, location: profilePath(resolved.redirectTo) };
  if (!resolved || !isProfileVisible(resolved.supplier)) {
    return { status: 404, html: renderSeoHtml(template, NOT_FOUND_SEO(baseUrl, `/suppliers/${encodeURIComponent(slug)}`)) };
  }
  const view = publicSupplierView(database, resolved.supplier);
  // A differently-cased or encoded request settles on the one canonical path.
  if (`/suppliers/${slug}` !== view.path) return { status: 301, location: view.path };
  return { status: 200, html: renderSeoHtml(template, supplierProfileSeo(view, baseUrl)) };
}

export function supplierDirectoryPage(database, citySlug, template, baseUrl = BASE_URL) {
  if (!citySlug) {
    return {
      status: 200,
      html: renderSeoHtml(template, {
        title: "Tour and travel operators in India | Idea Holiday",
        description: "Find local tour operators, transfer companies and activity providers across India. See which are verified, read reviews and send an enquiry.",
        canonical: `${baseUrl}/suppliers`,
      }),
    };
  }
  const city = findDirectoryCity(database, citySlug);
  if (!city) {
    return { status: 404, html: renderSeoHtml(template, { ...NOT_FOUND_SEO(baseUrl, `/suppliers/in/${encodeURIComponent(citySlug)}`), title: "No operators listed here yet | Idea Holiday" }) };
  }
  if (citySlug !== city.slug) return { status: 301, location: city.path };
  const hasIndexable = sitemapSupplierEntries(database).cities.some((entry) => entry.slug === city.slug);
  return {
    status: 200,
    html: renderSeoHtml(template, {
      title: `Tour operators in ${city.city} | Idea Holiday`,
      description: `Local tour operators, transfer companies and activity providers in ${city.city}${city.state ? `, ${city.state}` : ""}. See who is verified, read reviews and send an enquiry.`,
      canonical: `${baseUrl}${city.path}`,
      robots: hasIndexable ? "index, follow" : "noindex, follow",
    }),
  };
}

// ── Activities, city search pages and 404s ────────────────────

/** SQL condition: a product travelers can see and book right now (same rule as GET /api/activities/:id). */
export function liveProductSql(alias = "p") {
  return `${alias}.status = 'PUBLISHED' AND COALESCE(${alias}.is_published, 1) = 1 AND ${approvedSupplierSql(alias)}`;
}

export function citySearchPath(city) {
  return `/search?destination=${encodeURIComponent(city)}`;
}

/** Cities with at least one live product, named the way most of their listings spell them. */
export function liveCities(database) {
  const rows = database.prepare(`
    SELECT TRIM(p.city) AS city, COUNT(*) AS products FROM products p
    WHERE ${liveProductSql("p")} AND TRIM(COALESCE(p.city, '')) <> ''
    GROUP BY TRIM(p.city)
  `).all();
  const byKey = new Map();
  for (const row of rows) {
    const name = displayCity(row.city);
    const key = name.toLowerCase();
    const entry = byKey.get(key) || { name, products: 0, best: 0 };
    entry.products += Number(row.products);
    if (Number(row.products) > entry.best) Object.assign(entry, { name, best: Number(row.products) });
    byKey.set(key, entry);
  }
  return [...byKey.values()].map(({ name, products }) => ({ name, products })).sort((a, b) => a.name.localeCompare(b.name));
}

const notFoundSeo = (baseUrl, pathName, title = "Page not found | Idea Holiday") => ({
  title,
  description: "This page is not available on Idea Holiday.",
  canonical: `${baseUrl}${pathName}`,
  robots: "noindex, follow",
});

function parseImages(row) {
  let images = [];
  try {
    const parsed = JSON.parse(row.images || "[]");
    if (Array.isArray(parsed)) images = parsed.filter((url) => typeof url === "string");
  } catch {
    // Legacy rows may hold a bare URL.
    if (typeof row.images === "string") images = [row.images];
  }
  return images.length ? images : [row.hero_image].filter(Boolean);
}

/** What /activity/:slug/:id answers before the SPA loads: its own head tags, or a noindex 404. */
export function activityPage(database, id, template, baseUrl = BASE_URL) {
  const row = database.prepare(`
    SELECT p.id, p.title, p.city, p.category, p.product_type, p.short_desc, p.price_inr, p.hero_image, p.images
    FROM products p WHERE p.id = ? AND ${liveProductSql("p")}
  `).get(id);
  if (!row) {
    return { status: 404, html: renderSeoHtml(template, notFoundSeo(baseUrl, `/activity/${encodeURIComponent(id)}`, "Experience not available | Idea Holiday")) };
  }
  let quality = null;
  try {
    quality = database.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(row.id);
  } catch {
    quality = null;
  }
  const seo = activitySeo({
    id: row.id,
    title: row.title,
    city: row.city,
    category: row.category,
    shortDesc: row.short_desc,
    priceInr: row.price_inr,
    images: parseImages(row),
    rating: quality?.review_count ? quality.average_rating : null,
    reviewCount: quality?.review_count || 0,
  }, { baseUrl, isPackage: String(row.product_type || "").toUpperCase() === "PACKAGE" });
  return { status: 200, html: renderSeoHtml(template, seo) };
}

/**
 * /search head tags. A city page (?destination= alone) is indexable when that
 * city has live products; keyword searches and filtered views are noindex so
 * Google doesn't fill up with near-duplicate result pages.
 */
export function searchPage(database, query, template, baseUrl = BASE_URL) {
  const keys = Object.keys(query || {}).filter((key) => String(query[key] ?? "").trim() !== "");
  const destination = String(query?.destination || "").trim();
  if (!keys.length) {
    return {
      status: 200,
      html: renderSeoHtml(template, {
        title: "Explore Tours & Travel Experiences Across India | Idea Holiday",
        description: "Discover and book curated day tours, activities, transfers and multi-day packages across India with transparent pricing.",
        canonical: `${baseUrl}/search`,
      }),
    };
  }
  if (destination && keys.length === 1) {
    const city = liveCities(database).find((entry) => entry.name.toLowerCase() === displayCity(destination).toLowerCase());
    const name = city?.name || displayCity(destination);
    const canonicalPath = citySearchPath(name);
    return {
      status: 200,
      html: renderSeoHtml(template, {
        title: `${name} Tours, Cabs & Experiences | Idea Holiday`,
        description: `Book tours, day sightseeing, activities and airport cabs in ${name} from local operators on Idea Holiday.`,
        canonical: `${baseUrl}${canonicalPath}`,
        robots: city ? "index, follow" : "noindex, follow",
      }),
    };
  }
  return {
    status: 200,
    html: renderSeoHtml(template, {
      title: "Search results | Idea Holiday",
      description: "Tours, activities, transfers and packages on Idea Holiday.",
      canonical: destination ? `${baseUrl}${citySearchPath(displayCity(destination))}` : `${baseUrl}/search`,
      robots: "noindex, follow",
    }),
  };
}

/** The SPA shell with a 404 status for a path the React app has no page for. */
export function notFoundPage(template, pathName, baseUrl = BASE_URL) {
  return { status: 404, html: renderSeoHtml(template, notFoundSeo(baseUrl, pathName)) };
}

let cachedTemplate = null;
export function indexTemplate() {
  if (cachedTemplate && process.env.NODE_ENV === "production") return cachedTemplate;
  try {
    cachedTemplate = fs.readFileSync(INDEX_TEMPLATE_PATH, "utf8");
    return cachedTemplate;
  } catch {
    // No built frontend (local API-only runs): let the SPA fallback answer.
    return null;
  }
}

function sendPage(res, page) {
  if (page.location) return res.redirect(301, page.location);
  res.setHeader("Cache-Control", page.status === 200 ? "public, max-age=60, stale-while-revalidate=300" : "no-store");
  return res.status(page.status).type("html").send(page.html);
}

router.get(["/activity/:id", "/activity/:slug/:id"], (req, res, next) => {
  const template = indexTemplate();
  if (!template) return next();
  try {
    return sendPage(res, activityPage(db, req.params.id, template, BASE_URL));
  } catch (error) {
    logger.error("Activity page render failed", { requestId: req.requestId, error });
    return next();
  }
});

// Short link people type or print; the policy lives at one canonical address.
router.get("/privacy", (_req, res) => res.redirect(301, "/privacy-policy"));

router.get("/search", (req, res, next) => {
  const template = indexTemplate();
  if (!template) return next();
  try {
    return sendPage(res, searchPage(db, req.query, template, BASE_URL));
  } catch (error) {
    logger.error("Search page render failed", { requestId: req.requestId, error });
    return next();
  }
});

router.get("/suppliers/in/:citySlug", (req, res, next) => {
  const template = indexTemplate();
  if (!template) return next();
  try {
    return sendPage(res, supplierDirectoryPage(db, req.params.citySlug, template, BASE_URL));
  } catch (error) {
    logger.error("Supplier city page render failed", { requestId: req.requestId, error });
    return next();
  }
});

router.get("/suppliers/:slug", (req, res, next) => {
  const template = indexTemplate();
  if (!template) return next();
  try {
    return sendPage(res, supplierProfilePage(db, req.params.slug, template, BASE_URL));
  } catch (error) {
    logger.error("Supplier profile page render failed", { requestId: req.requestId, error });
    return next();
  }
});

router.get("/suppliers", (req, res, next) => {
  const template = indexTemplate();
  if (!template) return next();
  try {
    return sendPage(res, supplierDirectoryPage(db, null, template, BASE_URL));
  } catch (error) {
    logger.error("Supplier directory page render failed", { requestId: req.requestId, error });
    return next();
  }
});

router.get("/sitemap-suppliers.xml", (req, res) => {
  try {
    res.header("Content-Type", "application/xml");
    res.send(generateSupplierSitemapXml(sitemapSupplierEntries(db), BASE_URL));
  } catch (err) {
    logger.error("Supplier sitemap generation failed", { requestId: req.requestId, error: err });
    res.status(500).send("Error generating sitemap");
  }
});

// ── GET /sitemap.xml ───────────────────────────────────────────
router.get("/sitemap.xml", (req, res) => {
  try {
    let products = [];
    let cities = [];
    try {
      products = db
        .prepare(`SELECT p.id, p.title FROM products p WHERE ${liveProductSql("p")} ORDER BY p.id DESC`)
        .all() || [];
      cities = liveCities(db);
    } catch (dbErr) {
      logger.warn("Sitemap database fallback failed", { requestId: req.requestId, error: dbErr });
      products = [];
      cities = [];
    }

    const xml = generateSitemapXml(products, BASE_URL, cities);
    res.header("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    logger.error("Sitemap generation failed", { requestId: req.requestId, error: err });
    res.status(500).send("Error generating sitemap");
  }
});

// ── GET /robots.txt ────────────────────────────────────────────
router.get("/robots.txt", (req, res) => {
  const robots = generateRobotsTxt(BASE_URL);
  res.header("Content-Type", "text/plain");
  res.send(robots);
});

export default router;
