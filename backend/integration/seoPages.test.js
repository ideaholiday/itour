import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { test } from "node:test";
import Database from "better-sqlite3";
import { startTestServer } from "./helpers/serverHarness.js";
import { activityPath } from "../../shared/activityUrl.js";
import { liveProductSql } from "../src/routes/seo.js";

/**
 * What a crawler or link preview gets before any JavaScript runs: activity
 * pages with their own tags, real 404s, the privacy redirect, noindex on the
 * portal hosts, and a health check that doesn't say where the database lives.
 */

const FRONTEND_BUILT = fs.existsSync(new URL("../../frontend/dist/index.html", import.meta.url));
const headOf = (html) => html.slice(0, html.indexOf("</head>"));

test("marketing and search pages answer with the right status and head tags", { skip: !FRONTEND_BUILT && "frontend not built" }, async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath, { readonly: true });
  t.after(() => db.close());

  const health = await fetch(`${api.baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.database.engine, "sqlite");
  assert.equal("supabaseUrl" in health, false);

  const product = db.prepare(`SELECT p.id, p.title FROM products p WHERE ${liveProductSql("p")} LIMIT 1`).get();
  assert.ok(product, "the demo marketplace seeds a bookable product");
  const page = await fetch(`${api.baseUrl}${activityPath(product)}`);
  assert.equal(page.status, 200);
  const head = headOf(await page.text());
  assert.ok(head.includes(`<link rel="canonical" href="https://ideaholiday.in${activityPath(product)}" />`), "not the home page canonical");
  assert.match(head, /- Book on Idea Holiday<\/title>/);

  const oldLink = await fetch(`${api.baseUrl}/activity/${encodeURIComponent(product.id)}`, { redirect: "manual" });
  assert.equal(oldLink.status, 301);

  const gone = await fetch(`${api.baseUrl}/activity/Nothing-Here/prod_does_not_exist`);
  assert.equal(gone.status, 404);
  assert.match(headOf(await gone.text()), /noindex/);

  for (const path of ["/this-page-does-not-exist", "/my-trips", "/assets/old-build.js"]) {
    const missing = await fetch(`${api.baseUrl}${path}`);
    assert.equal(missing.status, 404, path);
    assert.match(headOf(await missing.text()), /content="noindex, follow"/, path);
  }
  for (const path of ["/", "/about-us", "/login", "/privacy-policy"]) {
    assert.equal((await fetch(`${api.baseUrl}${path}`)).status, 200, path);
  }

  const privacy = await fetch(`${api.baseUrl}/privacy`, { redirect: "manual" });
  assert.equal(privacy.status, 301);
  assert.equal(privacy.headers.get("location"), "/privacy-policy");

  // fetch() drops a Host header, so ask the way a request to the portal domain arrives.
  const portalHeaders = await new Promise((resolve, reject) => {
    http.get(`${api.baseUrl}/`, { headers: { Host: "supply.ideaholiday.in" } }, (response) => {
      response.resume();
      resolve(response.headers);
    }).on("error", reject);
  });
  assert.equal(portalHeaders["x-robots-tag"], "noindex, nofollow");
  const www = await new Promise((resolve, reject) => {
    http.get(`${api.baseUrl}/search?destination=Goa`, { headers: { Host: "www.ideaholiday.in" } }, (response) => {
      response.resume();
      resolve(response);
    }).on("error", reject);
  });
  assert.equal(www.statusCode, 308);
  assert.equal(www.headers.location, "https://ideaholiday.in/search?destination=Goa");

  const marketplace = await fetch(`${api.baseUrl}/`);
  assert.equal(marketplace.headers.get("x-robots-tag"), null);

  const sitemap = await fetch(`${api.baseUrl}/sitemap.xml`).then((response) => response.text());
  assert.ok(sitemap.includes(`https://ideaholiday.in${activityPath(product)}`));
  assert.match(sitemap, /\/privacy-policy<\/loc>/);
});
