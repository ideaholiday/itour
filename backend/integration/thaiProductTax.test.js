import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 023 step L4: no GST on products in Thailand; Indian products keep theirs.
test("a product in Bangkok quotes without GST, the same product in India with it", async t => {
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
  const thailand = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(thailand.response.status, 200, JSON.stringify(thailand.data));
  const { baseAmount, fastagTolls, stateTax, gstAmount, totalAmount } = thailand.data.quote.breakdown;
  assert.equal(gstAmount, 0);
  assert.equal(totalAmount, baseAmount + fastagTolls + stateTax);
  assert.equal(totalAmount, india.data.quote.breakdown.totalAmount - india.data.quote.breakdown.gstAmount);
});
