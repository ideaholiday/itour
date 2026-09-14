import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "commission.admin@example.test", password: "Integration@Admin2026" };

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function eventually(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return check();
}

test("commission: 30% by default, admins override per product with a reason, bookings keep their rate", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_commission_admin', 'Commission Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Meera Iyer", email: "meera.commission@example.test", password: "Integration@2026", phone: "+919855500005" },
  });
  const travelerToken = traveler.data.token;

  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const book = async (key, days) => {
    const created = await requestJson(api.baseUrl, "/api/bookings", {
      token: travelerToken,
      headers: { "Idempotency-Key": key },
      body: {
        product_id: activity.id, activity_date: futureDate(days), adults: 2, children: 0, luggage_bags: 0,
        pickup_time: "09:00", pickup_location: "Calangute, Goa",
        traveler_name: "Meera Iyer", traveler_email: "meera.commission@example.test", traveler_phone: "+919855500005", payment_method: "DEMO",
      },
    });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(created.data.bookingId);
  };

  await t.test("only admins can change commission, and only with a reason", async () => {
    assert.equal((await requestJson(api.baseUrl, "/api/admin/commission", { token: travelerToken })).response.status, 403);
    const noReason = await requestJson(api.baseUrl, `/api/admin/products/${activity.id}/commission`, { method: "PUT", token: adminToken, body: { commissionRate: 25 } });
    assert.equal(noReason.response.status, 400);
    const tooHigh = await requestJson(api.baseUrl, `/api/admin/products/${activity.id}/commission`, { method: "PUT", token: adminToken, body: { commissionRate: 60, reason: "Too high" } });
    assert.equal(tooHigh.response.status, 400);
  });

  let supplierId;
  await t.test("apply-to-all clears approval-time overrides so bookings use the 30% default", async () => {
    // Stand in for a supplier approved by hand before ADR 017, pinned to 18%.
    supplierId = db.prepare("SELECT supplier_id FROM products WHERE id = ?").get(activity.id).supplier_id;
    db.prepare("UPDATE suppliers SET commission_override_rate = 18 WHERE id = ?").run(supplierId);

    const listed = await requestJson(api.baseUrl, "/api/admin/commission", { token: adminToken });
    assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
    assert.equal(listed.data.defaultRatePercent, 30);
    assert.ok(listed.data.suppliers.some((supplier) => supplier.id === supplierId && supplier.rate === 18));

    const cleared = await requestJson(api.baseUrl, "/api/admin/commission/clear-overrides", {
      token: adminToken, body: { reason: "Launch: 30% for everyone (ADR 017)", notify: false },
    });
    assert.equal(cleared.response.status, 200, JSON.stringify(cleared.data));
    assert.ok(cleared.data.clearedSuppliers >= 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM suppliers WHERE commission_override_rate IS NOT NULL").get().n, 0);
    const change = db.prepare("SELECT * FROM commission_rate_changes WHERE supplier_id = ? ORDER BY created_at DESC").get(supplierId);
    assert.deepEqual([change.old_rate, change.new_rate, change.notify], [18, 30, 0], "the launch change sends no notice");
  });

  let first;
  await t.test("a new booking is charged 30% commission", async () => {
    first = await book("commission-meera-1", 21);
    assert.equal(first.commission_rate_snapshot, 30);
    assert.equal(first.commission_amount, Math.round(first.amount_inr * 0.3));
    assert.equal(first.supplier_payout_amount, first.amount_inr - first.commission_amount);
  });

  await t.test("a product override applies to the next booking, not the one already made, and notifies the supplier", async () => {
    const productId = first.assigned_supplier_product_id || activity.id;
    const saved = await requestJson(api.baseUrl, `/api/admin/products/${productId}/commission`, {
      method: "PUT", token: adminToken, body: { commissionRate: 25, reason: "Partner rate for this tour" },
    });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
    assert.deepEqual([saved.data.rate, saved.data.change.oldRate, saved.data.change.newRate, saved.data.change.notify], [25, 30, 25, true]);

    const second = await book("commission-meera-2", 22);
    assert.equal(second.assigned_supplier_product_id, first.assigned_supplier_product_id);
    assert.equal(second.commission_rate_snapshot, 25);
    assert.equal(second.commission_amount, Math.round(second.amount_inr * 0.25));
    assert.equal(db.prepare("SELECT commission_rate_snapshot FROM bookings WHERE id = ?").get(first.id).commission_rate_snapshot, 30, "the earlier booking keeps its rate");

    const notified = await eventually(() => db.prepare("SELECT notified_at FROM commission_rate_changes WHERE id = ?").get(saved.data.change.id).notified_at);
    assert.ok(notified, "the notice was sent and stamped");

    const adminProducts = await requestJson(api.baseUrl, "/api/admin/products?status=ALL", { token: adminToken });
    assert.equal(adminProducts.data.products.find((product) => product.id === productId).commission_rate_effective, 25);
  });

  await t.test("changing the platform default is recorded as one platform change", async () => {
    const saved = await requestJson(api.baseUrl, "/api/admin/programs/commission", {
      method: "PUT", token: adminToken, body: { settings: { defaultRatePercent: 28 }, reason: "Festival season" },
    });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
    const change = db.prepare("SELECT * FROM commission_rate_changes WHERE scope = 'PLATFORM'").get();
    assert.deepEqual([change.old_rate, change.new_rate, change.notify, change.reason], [30, 28, 1, "Festival season"]);
    const listed = await requestJson(api.baseUrl, "/api/admin/commission", { token: adminToken });
    assert.equal(listed.data.defaultRatePercent, 28);
  });
});
