import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// Travelers can find products in Thailand by country, by name and from destination links (ADR 023).
test("search filters by country, matches 'thailand' and resolves a Thai destination id", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const product = db.prepare(`
    SELECT p.id FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1 AND s.kyb_status = 'APPROVED'
    ORDER BY p.id LIMIT 1
  `).get();
  assert.ok(product);
  db.prepare("UPDATE products SET city = 'Bangkok', state = 'Bangkok' WHERE id = ?").run(product.id);

  const thailand = await requestJson(api.baseUrl, "/api/search?country=Thailand&limit=100");
  assert.equal(thailand.response.status, 200);
  assert.deepEqual(thailand.data.products.map((p) => p.id), [product.id]);
  const [bangkok] = thailand.data.products;
  assert.ok(Math.abs(bangkok.lat - 13.7563) < 0.1 && Math.abs(bangkok.lng - 100.5018) < 0.1, "pinned in Bangkok, not central India");
  assert.equal(thailand.data.facets.countries.find((c) => c.name === "Thailand")?.count, 1);
  assert.ok(thailand.data.facets.countries.find((c) => c.name === "India")?.count > 0);

  const india = await requestJson(api.baseUrl, "/api/search?country=India&limit=100");
  assert.ok(india.data.products.length > 0);
  assert.ok(!india.data.products.some((p) => p.id === product.id));

  const byName = await requestJson(api.baseUrl, "/api/search?q=thailand&limit=100");
  assert.deepEqual(byName.data.products.map((p) => p.id), [product.id]);

  const byId = await requestJson(api.baseUrl, "/api/search?city=city_th_bangkok&limit=100");
  assert.deepEqual(byId.data.products.map((p) => p.id), [product.id]);

  const suggestions = await requestJson(api.baseUrl, "/api/search/suggestions?q=thai");
  assert.ok(suggestions.data.destinations.includes("Bangkok, Thailand"), JSON.stringify(suggestions.data.destinations));
});
