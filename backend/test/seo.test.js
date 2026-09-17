import test from "node:test";
import assert from "node:assert/strict";
import { generateSitemapXml, generateRobotsTxt } from "../src/routes/seo.js";

test("sitemap.xml lists public routes, cities with live products, and products without a guessed lastmod", () => {
  const sampleProducts = [
    { id: "act_goa_scuba", title: "Goa Scuba" },
    { id: "act_taj_sunrise", title: "Taj Sunrise" }
  ];

  const xml = generateSitemapXml(sampleProducts, "https://ideaholiday.in", [{ name: "Goa" }, { name: "Navi Mumbai" }]);

  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/transfers<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/privacy-policy<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search\?destination=Goa<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search\?destination=Navi%20Mumbai<\/loc>/);
  assert.doesNotMatch(xml, /search\?q=/, "no hard-coded cities that may have nothing to book");
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/activity\/Goa-Scuba\/act_goa_scuba<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/activity\/Taj-Sunrise\/act_taj_sunrise<\/loc>/);
  assert.match(xml, /<priority>1.0<\/priority>/);
  assert.match(xml, /<priority>0.85<\/priority>/);
});

test("robots.txt declares crawling rules, disallows private panels and points to sitemap", () => {
  const robots = generateRobotsTxt("https://ideaholiday.in");

  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/ops/);
  assert.match(robots, /Disallow: \/supplier\/dashboard/);
  assert.match(robots, /Disallow: \/checkout/);
  assert.match(robots, /Sitemap: https:\/\/ideaholiday.in\/sitemap.xml/);
});

// ── Supplier profiles ─────────────────────────────────────────
import fs from "node:fs";
import {
  escapeHtml, generateSupplierSitemapXml, jsonForScript, renderSeoHtml, supplierDirectoryPage, supplierProfilePage,
} from "../src/routes/seo.js";
import { backfillSupplierSlugs, grantSupplierVerification, REQUIRED_VERIFICATION_CHECKS, updateSupplierProfile } from "../src/services/supplierProfileService.js";
import { addSupplier, addUser, supplierProfileDatabase } from "./fixtures/supplierProfileDatabase.js";

const INDEX_TEMPLATE = fs.readFileSync(new URL("../../frontend/index.html", import.meta.url), "utf8");
const headOf = (html) => html.slice(0, html.indexOf("</head>"));
const count = (html, pattern) => (html.match(pattern) || []).length;

test("robots.txt also points to the supplier sitemap", () => {
  assert.match(generateRobotsTxt("https://ideaholiday.in"), /Sitemap: https:\/\/ideaholiday.in\/sitemap-suppliers.xml/);
});

test("page head tags replace the site defaults exactly once, and nothing in them can break out", () => {
  const html = renderSeoHtml(INDEX_TEMPLATE, {
    title: `Evil "</title><script>alert(1)</script>`,
    description: "Tours & <b>transfers</b>",
    canonical: "https://ideaholiday.in/suppliers/x",
    robots: "noindex, follow",
    jsonLd: { name: "</script><script>alert(1)</script>" },
  });
  const head = headOf(html);
  assert.equal(count(head, /<title>/g), 1);
  assert.equal(count(head, /<meta name="description"/g), 1);
  assert.equal(count(head, /<meta name="robots"/g), 1);
  assert.equal(count(head, /<link rel="canonical"/g), 1);
  assert.equal(count(head, /property="og:title"/g), 1);
  assert.equal(count(head, /name="twitter:image"/g), 1);
  assert.match(head, /<meta name="robots" content="noindex, follow" \/>/);
  assert.equal(head.includes("<script>alert(1)"), false);
  assert.match(head, /&lt;\/title&gt;&lt;script&gt;/);
  assert.match(head, /Tours &amp; &lt;b&gt;/);
  assert.equal(count(html, /<\/script><script>alert/g), 0);
  assert.match(html, /Google Tag Manager/, "the rest of the template is untouched");
  assert.equal(escapeHtml(`'"`), "&#39;&quot;");
  assert.equal(JSON.parse(jsonForScript({ a: "</script>&" })).a, "</script>&");
});

test("a supplier profile page gets its own head, a 301 for old or miscased links, and noindex until KYB approval", () => {
  const db = supplierProfileDatabase();
  const approved = addSupplier(db, { id: "sup_blue", email: "b@example.com", company_name: "Blue Lagoon Watersports", city: "Goa", state: "Goa" });
  addSupplier(db, { id: "sup_new", email: "n@example.com", company_name: "New Wave Tours", city: "Goa", state: "Goa", kyb_status: "PENDING" });
  addSupplier(db, { id: "sup_hidden", email: "h@example.com", company_name: "Hidden Cabs", profile_status: "HIDDEN" });
  backfillSupplierSlugs(db);
  updateSupplierProfile(db, approved.id, { tagline: "Scuba & parasailing at Calangute", languages: ["English", "Konkani"], socialLinks: { instagram: "https://instagram.com/bluelagoon" } });
  grantSupplierVerification(db, approved.id, { checks: REQUIRED_VERIFICATION_CHECKS });
  addUser(db);
  for (const [id, rating] of [["r1", 5], ["r2", 4], ["r3", 5]]) {
    db.prepare("INSERT INTO reviews (id, user_id, product_id, supplier_id, experience_rating, supplier_rating, comment) VALUES (?, 'user_amit', 'p', 'sup_blue', ?, ?, 'Great dive')").run(id, rating, rating);
  }

  const page = supplierProfilePage(db, "blue-lagoon-watersports", INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.equal(page.status, 200);
  const head = headOf(page.html);
  assert.match(head, /<title>Blue Lagoon Watersports – Travel operator in Goa \| Idea Holiday<\/title>/);
  assert.match(head, /content="Scuba &amp; parasailing at Calangute. Rated 4.7\/5 from 3 verified reviews./);
  assert.match(head, /<link rel="canonical" href="https:\/\/ideaholiday.in\/suppliers\/blue-lagoon-watersports" \/>/);
  assert.match(head, /content="index, follow"/);
  const jsonLd = JSON.parse(head.match(/<script type="application\/ld\+json" id="structured-data-json-ld">([\s\S]*?)<\/script>/)[1]);
  const business = jsonLd["@graph"].find((node) => node["@type"] === "TravelAgency");
  assert.deepEqual(business.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1 });
  assert.deepEqual(business.sameAs, ["https://instagram.com/bluelagoon"]);
  assert.equal(business.address.addressCountry, "IN");
  assert.equal(JSON.stringify(jsonLd).includes("b@example.com"), false);
  assert.deepEqual(jsonLd["@graph"][1].itemListElement.map((item) => item.name), ["Home", "Operators", "Goa", "Blue Lagoon Watersports"]);

  const pending = supplierProfilePage(db, "new-wave-tours", INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.equal(pending.status, 200);
  assert.match(headOf(pending.html), /content="noindex, follow"/);
  assert.equal(headOf(pending.html).includes("aggregateRating"), false, "no rating markup without reviews");

  updateSupplierProfile(db, approved.id, { slug: "blue-lagoon-goa" });
  assert.deepEqual(supplierProfilePage(db, "blue-lagoon-watersports", INDEX_TEMPLATE), { status: 301, location: "/suppliers/blue-lagoon-goa" });
  assert.deepEqual(supplierProfilePage(db, "Blue-Lagoon-Goa", INDEX_TEMPLATE), { status: 301, location: "/suppliers/blue-lagoon-goa" });

  for (const slug of ["hidden-cabs", "no-such-operator"]) {
    const missing = supplierProfilePage(db, slug, INDEX_TEMPLATE);
    assert.equal(missing.status, 404);
    assert.match(headOf(missing.html), /noindex/);
  }

  const directory = supplierDirectoryPage(db, null, INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.match(headOf(directory.html), /<link rel="canonical" href="https:\/\/ideaholiday.in\/suppliers" \/>/);
  const goa = supplierDirectoryPage(db, "goa", INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.match(headOf(goa.html), /<title>Tour operators in Goa \| Idea Holiday<\/title>/);
  assert.match(headOf(goa.html), /content="index, follow"/);
  assert.deepEqual(supplierDirectoryPage(db, "GOA", INDEX_TEMPLATE), { status: 301, location: "/suppliers/in/goa" });
  assert.equal(supplierDirectoryPage(db, "atlantis", INDEX_TEMPLATE).status, 404);
  db.close();
});

test("the supplier sitemap lists the directory, cities and profiles", () => {
  const xml = generateSupplierSitemapXml({
    profiles: [{ path: "/suppliers/blue-lagoon-goa", updatedAt: "2026-09-01 08:00:00" }],
    cities: [{ path: "/suppliers/in/goa" }],
  }, "https://ideaholiday.in");
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/suppliers<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/suppliers\/in\/goa<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/suppliers\/blue-lagoon-goa<\/loc>\n    <lastmod>2026-09-01<\/lastmod>/);
});

// ── Activities, city search pages, 404s ───────────────────────
import Database from "better-sqlite3";
import { activityPage, liveCities, notFoundPage, searchPage } from "../src/routes/seo.js";
import { isKnownSpaPath, SPA_ROUTES } from "../../shared/spaRoutes.js";

function catalogDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, kyb_status TEXT, subscription_exempt INTEGER DEFAULT 0);
    CREATE TABLE supplier_subscriptions (id TEXT PRIMARY KEY, supplier_id TEXT, status TEXT, starts_at TEXT, ends_at TEXT);
    CREATE TABLE products (
      id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, city TEXT, category TEXT, product_type TEXT, short_desc TEXT,
      price_inr REAL, hero_image TEXT, images TEXT, status TEXT DEFAULT 'PUBLISHED', is_published INTEGER DEFAULT 1
    );
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, average_rating REAL);
    INSERT INTO suppliers VALUES ('sup_ok', 'APPROVED', 1), ('sup_pending', 'PENDING', 1), ('sup_lapsed', 'APPROVED', 0);
  `);
  const add = db.prepare("INSERT INTO products (id, supplier_id, title, city, category, product_type, short_desc, price_inr, images, status, is_published) VALUES (?, ?, ?, ?, 'Water sports', ?, ?, ?, ?, ?, ?)");
  add.run("p_scuba", "sup_ok", "Grande Island Scuba Dive", "Goa", "EXPERIENCE", "A 30 minute guided dive for beginners.", 2999, JSON.stringify(["/uploads/scuba.jpg"]), "PUBLISHED", 1);
  add.run("p_zoo", "sup_ok", "Lucknow Zoo Entry", "LUCKNOW", "ATTRACTION", null, 0, null, "PUBLISHED", 1);
  add.run("p_cab", "sup_ok", "Airport cab", "lucknow", "TRANSFER", null, 900, null, "PUBLISHED", 1);
  add.run("p_draft", "sup_ok", "Draft tour", "Agra", "TOUR", null, 500, null, "DRAFT", 1);
  add.run("p_hidden", "sup_ok", "Unpublished tour", "Agra", "TOUR", null, 500, null, "PUBLISHED", 0);
  add.run("p_pending", "sup_pending", "Pending supplier tour", "Jaipur", "TOUR", null, 500, null, "PUBLISHED", 1);
  add.run("p_lapsed", "sup_lapsed", "Uncovered supplier tour", "Delhi", "TOUR", null, 500, null, "PUBLISHED", 1);
  db.prepare("INSERT INTO quality_scores VALUES ('PRODUCT', 'p_scuba', 4, 4.5)").run();
  return db;
}

test("an activity page is served with its own title, preview image, canonical and structured data", () => {
  const db = catalogDatabase();
  const page = activityPage(db, "p_scuba", INDEX_TEMPLATE, "https://ideaholiday.in");
  assert.equal(page.status, 200);
  const head = headOf(page.html);
  assert.match(head, /<title>Grande Island Scuba Dive in Goa - Book on Idea Holiday<\/title>/);
  assert.match(head, /<meta name="description" content="A 30 minute guided dive for beginners." \/>/);
  assert.match(head, /<link rel="canonical" href="https:\/\/ideaholiday.in\/activity\/Grande-Island-Scuba-Dive\/p_scuba" \/>/);
  assert.match(head, /<meta property="og:image" content="https:\/\/ideaholiday.in\/uploads\/scuba.jpg" \/>/);
  assert.match(head, /<meta property="og:type" content="product" \/>/);
  assert.equal(count(head, /<link rel="canonical"/g), 1, "the home page canonical is replaced, not kept");
  assert.equal(count(head, /<title>/g), 1);
  const jsonLd = JSON.parse(head.match(/<script type="application\/ld\+json" id="structured-data-json-ld">([\s\S]*?)<\/script>/)[1]);
  const product = jsonLd["@graph"][0];
  assert.equal(product.offers.price, 2999);
  assert.deepEqual(product.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 4, bestRating: "5", worstRating: "1" });
  assert.deepEqual(jsonLd["@graph"][1].itemListElement.map((item) => item.name), ["Home", "Goa", "Grande Island Scuba Dive"]);

  const zoo = headOf(activityPage(db, "p_zoo", INDEX_TEMPLATE, "https://ideaholiday.in").html);
  assert.match(zoo, /<title>Lucknow Zoo Entry - Book on Idea Holiday<\/title>/, "city already in the title is not repeated");
  assert.match(zoo, /og:image" content="https:\/\/ideaholiday.in\/idea-holiday-social.png"/);
  assert.equal(zoo.includes('"offers"'), false, "no price, no offer markup");
  assert.equal(zoo.includes("aggregateRating"), false);

  for (const id of ["p_draft", "p_hidden", "p_pending", "p_lapsed", "missing"]) {
    const missing = activityPage(db, id, INDEX_TEMPLATE, "https://ideaholiday.in");
    assert.equal(missing.status, 404, id);
    assert.match(headOf(missing.html), /content="noindex, follow"/);
  }
  db.close();
});

test("city pages are indexable only where something is bookable; keyword and filtered searches are noindex", () => {
  const db = catalogDatabase();
  assert.deepEqual(liveCities(db), [{ name: "Goa", products: 1 }, { name: "Lucknow", products: 2 }]);

  const lucknow = headOf(searchPage(db, { destination: "lucknow" }, INDEX_TEMPLATE, "https://ideaholiday.in").html);
  assert.match(lucknow, /<title>Lucknow Tours, Cabs &amp; Experiences \| Idea Holiday<\/title>/);
  assert.match(lucknow, /<link rel="canonical" href="https:\/\/ideaholiday.in\/search\?destination=Lucknow" \/>/);
  assert.match(lucknow, /content="index, follow"/);

  assert.match(headOf(searchPage(db, { destination: "Jaipur" }, INDEX_TEMPLATE).html), /content="noindex, follow"/);
  assert.match(headOf(searchPage(db, { q: "scuba" }, INDEX_TEMPLATE).html), /content="noindex, follow"/);
  assert.match(headOf(searchPage(db, { destination: "Goa", sort: "price_asc" }, INDEX_TEMPLATE).html), /content="noindex, follow"/);
  const all = headOf(searchPage(db, {}, INDEX_TEMPLATE, "https://ideaholiday.in").html);
  assert.match(all, /<link rel="canonical" href="https:\/\/ideaholiday.in\/search" \/>/);
  assert.match(all, /content="index, follow"/);
  db.close();
});

test("a path the app has no page for is a noindex 404; every App.jsx route is known", () => {
  const page = notFoundPage(INDEX_TEMPLATE, "/no-such-page", "https://ideaholiday.in");
  assert.equal(page.status, 404);
  assert.match(headOf(page.html), /content="noindex, follow"/);
  assert.match(page.html, /<div id="root"><\/div>/, "the app still renders its not-found screen");

  const appSource = fs.readFileSync(new URL("../../frontend/src/App.jsx", import.meta.url), "utf8");
  const appRoutes = [...appSource.matchAll(/path="([^"]+)"/g)].map((match) => match[1]).filter((route) => route !== "*");
  assert.ok(appRoutes.length > 50);
  assert.deepEqual(appRoutes.filter((route) => !SPA_ROUTES.includes(route)), [], "add new App.jsx routes to shared/spaRoutes.js");
  assert.deepEqual(SPA_ROUTES.filter((route) => !appRoutes.includes(route)), [], "remove routes App.jsx no longer has");

  for (const known of ["/", "/activity/Goa-Scuba/p1", "/About-Us/", "/checkout/verify", "/privacy-policy"]) assert.equal(isKnownSpaPath(known), true, known);
  for (const unknown of ["/my-trips", "/activity", "/assets/missing.js", "/admin/nope/deeper"]) assert.equal(isKnownSpaPath(unknown), false, unknown);
});
