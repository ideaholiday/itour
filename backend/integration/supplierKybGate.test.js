import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * A supplier whose KYB is not approved keeps its listings in the supplier
 * panel, but travelers and search engines don't see them and can't quote them.
 */

const listIds = (data) => (Array.isArray(data) ? data : data.products || data.activities || []).map((product) => product.id);

test("products of a supplier without approved KYB are hidden and cannot be quoted", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const product = db.prepare(`
    SELECT p.id, p.supplier_id, p.city FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1 AND s.kyb_status = 'APPROVED'
    ORDER BY p.id LIMIT 1
  `).get();
  assert.ok(product, "the demo marketplace seeds a published product from an approved supplier");

  const visible = await requestJson(api.baseUrl, `/api/activities/${product.id}`);
  assert.equal(visible.response.status, 200, JSON.stringify(visible.data));

  db.prepare("UPDATE suppliers SET kyb_status = 'PENDING' WHERE id = ?").run(product.supplier_id);

  const detail = await requestJson(api.baseUrl, `/api/activities/${product.id}`);
  assert.equal(detail.response.status, 404);

  const options = await requestJson(api.baseUrl, `/api/activities/${product.id}/options`);
  assert.equal(options.response.status, 404);

  // Queries not issued before the change, so no cached response is served.
  const listing = await requestJson(api.baseUrl, `/api/activities?destination=${encodeURIComponent(product.city)}`);
  assert.equal(listing.response.status, 200, JSON.stringify(listing.data));
  assert.equal(listIds(listing.data).includes(product.id), false);

  const search = await requestJson(api.baseUrl, `/api/search?limit=100&city=${encodeURIComponent(product.city)}`);
  assert.equal(search.response.status, 200, JSON.stringify(search.data));
  assert.equal(listIds(search.data).includes(product.id), false);

  const sitemap = await requestJson(api.baseUrl, "/sitemap.xml");
  assert.equal(sitemap.response.status, 200);
  assert.equal(String(sitemap.data).includes(`/${encodeURIComponent(product.id)}<`), false);

  const tomorrow = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  const quote = await requestJson(api.baseUrl, "/api/bookings/quote", {
    body: { product_id: product.id, activity_date: tomorrow, adults: 1 },
  });
  assert.equal(quote.response.status, 409, JSON.stringify(quote.data));

  const slots = await requestJson(api.baseUrl, `/api/availability/native/${product.id}?date=${tomorrow}`);
  assert.equal(slots.response.status, 404);
});
