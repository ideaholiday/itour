import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 023 step L4: no GST on a Thai supplier's product in Thailand; Indian products keep theirs.
// ADR 024 step A4: an Indian supplier's product abroad pays 18%.
test("a product in Bangkok quotes 18% GST from an Indian supplier, none from a Thai one, and India's rate in India", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());

  const product = db.prepare(`
    SELECT p.id, p.city FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.product_type <> 'TRANSFER' AND p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1
      AND s.kyb_status = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM native_inventory_rules n WHERE n.product_id = p.id)
    ORDER BY p.id LIMIT 1
  `).get();
  assert.ok(product, "the demo marketplace seeds a published non-transfer product from an approved supplier");

  const day = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  const input = { product_id: product.id, activity_date: day, adults: 2, children: 0, luggage_bags: 0 };
  const india = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(india.response.status, 200, JSON.stringify(india.data));
  assert.ok(india.data.quote.breakdown.gstAmount > 0);

  db.prepare("UPDATE products SET city = 'Bangkok', state = 'Bangkok' WHERE id = ?").run(product.id);
  // ADR 024 A4: while its supplier is Indian, the product abroad pays 18% GST instead of India's rate.
  const abroad = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(abroad.response.status, 200, JSON.stringify(abroad.data));
  const taxed = abroad.data.quote.breakdown;
  assert.equal(taxed.gstAmount, Math.round((taxed.baseAmount + taxed.fastagTolls + taxed.stateTax) * 0.18));
  assert.equal((await requestJson(api.baseUrl, `/api/activities/${product.id}`)).data.gstFree, false);

  // A Thai supplier's product in Thailand pays none (ADR 023).
  db.prepare("UPDATE suppliers SET city = 'Bangkok', state = 'Bangkok' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run(product.id);
  const thailand = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(thailand.response.status, 200, JSON.stringify(thailand.data));
  const { baseAmount, fastagTolls, stateTax, gstAmount, totalAmount } = thailand.data.quote.breakdown;
  assert.equal(gstAmount, 0);
  assert.equal(totalAmount, baseAmount + fastagTolls + stateTax);
  assert.equal(totalAmount, india.data.quote.breakdown.totalAmount - india.data.quote.breakdown.gstAmount);

  // ADR 024: Dubai follows the same rule: 0% from a UAE supplier, 18% from an Indian one.
  db.prepare("UPDATE products SET city = 'Dubai', state = 'Dubai' WHERE id = ?").run(product.id);
  db.prepare("UPDATE suppliers SET city = 'Dubai', state = 'Dubai' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run(product.id);
  const uae = (await requestJson(api.baseUrl, "/api/bookings/quote", { body: input })).data.quote.breakdown;
  assert.equal(uae.gstAmount, 0);
  db.prepare("UPDATE suppliers SET city = ?, state = 'Goa' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run("Goa", product.id);
  const fromIndia = (await requestJson(api.baseUrl, "/api/bookings/quote", { body: input })).data.quote.breakdown;
  assert.equal(fromIndia.gstAmount, Math.round((fromIndia.baseAmount + fromIndia.fastagTolls + fromIndia.stateTax) * 0.18));

  // Singapore too: 18% from the Indian supplier, 0% once the supplier is in Singapore.
  db.prepare("UPDATE products SET city = 'Singapore', state = 'Singapore' WHERE id = ?").run(product.id);
  const sgFromIndia = (await requestJson(api.baseUrl, "/api/bookings/quote", { body: input })).data.quote.breakdown;
  assert.equal(sgFromIndia.gstAmount, Math.round((sgFromIndia.baseAmount + sgFromIndia.fastagTolls + sgFromIndia.stateTax) * 0.18));
  db.prepare("UPDATE suppliers SET city = 'Singapore', state = 'Singapore' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run(product.id);
  assert.equal((await requestJson(api.baseUrl, "/api/bookings/quote", { body: input })).data.quote.breakdown.gstAmount, 0);

  // Indonesia: a Bali supplier's product is 0% and shows Bali's own time.
  db.prepare("UPDATE products SET city = 'Bali', state = 'Bali' WHERE id = ?").run(product.id);
  db.prepare("UPDATE suppliers SET city = 'Bali', state = 'Bali' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run(product.id);
  assert.equal((await requestJson(api.baseUrl, "/api/bookings/quote", { body: input })).data.quote.breakdown.gstAmount, 0);
  const bali = (await requestJson(api.baseUrl, `/api/activities/${product.id}`)).data;
  assert.deepEqual([bali.country, bali.timeZone, bali.timeLabel, bali.gstFree], ["Indonesia", "Asia/Makassar", "WITA", true]);
});
