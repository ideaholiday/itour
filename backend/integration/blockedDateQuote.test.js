import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * A date the supplier closed in their calendar quotes as unavailable (409),
 * with a traveler-facing "Sold out" message instead of a server error.
 */
test("a supplier-blocked date quotes as sold out instead of failing", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const product = db.prepare(`
    SELECT p.id, p.supplier_id FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.product_type = 'TRANSFER' AND p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1
      AND s.kyb_status = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM native_inventory_rules n WHERE n.product_id = p.id)
    ORDER BY p.id LIMIT 1
  `).get();
  assert.ok(product, "the demo marketplace seeds a published transfer from an approved supplier");

  const day = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  const input = { product_id: product.id, activity_date: day, adults: 2, children: 0, luggage_bags: 0, vehicle_category: "SEDAN" };
  const open = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(open.response.status, 200, JSON.stringify(open.data));

  db.prepare(`
    INSERT INTO blocked_dates (id, supplier_id, product_id, scope_type, availability_type, start_date, end_date,
      capacity_limit, is_active, reason, created_at)
    VALUES ('blk_quote_test', ?, ?, 'PRODUCT', 'FULL_DAY', ?, ?, 0, 1, 'Scheduled fleet maintenance', datetime('now'))
  `).run(product.supplier_id, product.id, day, day);

  const closed = await requestJson(api.baseUrl, "/api/bookings/quote", { body: input });
  assert.equal(closed.response.status, 409, JSON.stringify(closed.data));
  assert.equal(closed.data.error, "Sold out on the selected date. Please choose another date.");
});
