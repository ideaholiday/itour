import test from "node:test";
import assert from "node:assert/strict";
import { generateSitemapXml, generateRobotsTxt } from "../src/routes/seo.js";

test("sitemap.xml returns valid XML containing public routes, destination hubs, and dynamic products", () => {
  const sampleProducts = [
    { id: "act_goa_scuba", title: "Goa Scuba", updated_at: "2026-08-20T10:00:00.000Z", category: "ACTIVITY", destination_name: "Goa" },
    { id: "act_taj_sunrise", title: "Taj Sunrise", updated_at: "2026-08-19T10:00:00.000Z", category: "DAY_TOUR", destination_name: "Agra" }
  ];

  const xml = generateSitemapXml(sampleProducts, "https://ideaholiday.in");

  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/transfers<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search<\/loc>/);
  assert.match(xml, /<loc>https:\/\/ideaholiday.in\/search\?q=Goa<\/loc>/);
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
