import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * ADR 017: suppliers who sign up from 2026-09-14 need a subscription to take
 * bookings. Until payment exists, the launch waiver covers them; admins can end
 * it, waive one supplier, or end a waiver.
 */

const ADMIN = { email: "subscriptions.admin@example.test", password: "Integration@Admin2026" };

test("new suppliers sell under the launch waiver, and stop when their cover ends", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_subs_admin', 'Subs Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const token = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;

  // The demo supplier is seeded at startup, so it counts as new and got a launch waiver.
  const product = db.prepare(`
    SELECT p.id, p.supplier_id FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1 AND s.kyb_status = 'APPROVED' ORDER BY p.id LIMIT 1
  `).get();
  assert.equal(db.prepare("SELECT subscription_exempt FROM suppliers WHERE id = ?").get(product.supplier_id).subscription_exempt, 0);
  const launch = db.prepare("SELECT * FROM supplier_subscriptions WHERE supplier_id = ?").get(product.supplier_id);
  assert.deepEqual([launch.status, launch.source, launch.ends_at], ["WAIVED", "LAUNCH", null]);

  const date = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10);
  const detailStatus = async () => (await requestJson(api.baseUrl, `/api/activities/${product.id}`)).response.status;
  const quote = () => requestJson(api.baseUrl, "/api/bookings/quote", { body: { product_id: product.id, activity_date: date, adults: 1 } });
  assert.equal(await detailStatus(), 200);
  assert.equal((await quote()).response.status, 200);

  const supplierView = await requestJson(api.baseUrl, `/api/admin/suppliers/${product.supplier_id}/subscription`, { token });
  assert.deepEqual([supplierView.data.subscription.required, supplierView.data.subscription.covered, supplierView.data.subscription.cover.source], [true, true, "LAUNCH"]);

  await t.test("ending the launch offer takes new suppliers off sale", async () => {
    const saved = await requestJson(api.baseUrl, "/api/admin/programs/supplier_subscriptions", {
      method: "PUT", token, body: { settings: { launchWaiverUntil: "2026-09-01" }, reason: "Launch offer over" },
    });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
    assert.ok(saved.data.launchWaivers.updated >= 1);
    assert.equal(await detailStatus(), 404);
    const refused = await quote();
    assert.equal(refused.response.status, 409, JSON.stringify(refused.data));
  });

  let waiverId;
  await t.test("an admin waiver puts one supplier back on sale", async () => {
    const noReason = await requestJson(api.baseUrl, `/api/admin/suppliers/${product.supplier_id}/subscription/waiver`, { token, body: { until: "2099-12-31" } });
    assert.equal(noReason.response.status, 400);
    const granted = await requestJson(api.baseUrl, `/api/admin/suppliers/${product.supplier_id}/subscription/waiver`, {
      token, body: { until: "2099-12-31", reason: "Founding partner" },
    });
    assert.equal(granted.response.status, 201, JSON.stringify(granted.data));
    waiverId = granted.data.waiver.id;
    assert.equal(granted.data.subscription.cover.source, "WAIVER");
    assert.equal(await detailStatus(), 200);
    assert.equal((await quote()).response.status, 200);

    const listed = await requestJson(api.baseUrl, "/api/admin/supplier-subscriptions", { token });
    assert.equal(listed.data.suppliers.find((s) => s.id === product.supplier_id).covered, true);
  });

  await t.test("ending the waiver takes it off sale again, and confirmed bookings are untouched", async () => {
    const ended = await requestJson(api.baseUrl, `/api/admin/supplier-subscriptions/${waiverId}/end`, { token, body: { reason: "Partnership ended" } });
    assert.equal(ended.response.status, 200, JSON.stringify(ended.data));
    assert.equal(ended.data.subscription.covered, false);
    assert.equal(await detailStatus(), 404);
  });

  await t.test("a supplier signing up while the launch waiver is on gets one straight away", async () => {
    await requestJson(api.baseUrl, "/api/admin/programs/supplier_subscriptions", {
      method: "PUT", token, body: { settings: { launchWaiverUntil: null }, reason: "Launch offer reopened" },
    });
    const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
      body: { companyName: "Fresh Kayak Co", contactName: "Farah Khan", email: "farah.kayak@example.test", phone: "+919866600006", city: "Goa", state: "Goa", password: "Integration@2026" },
    });
    assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
    const supplierId = signup.data.user.supplier_id || signup.data.supplier?.id || db.prepare("SELECT id FROM suppliers WHERE email = 'farah.kayak@example.test'").get().id;
    const row = db.prepare("SELECT status, source, ends_at FROM supplier_subscriptions WHERE supplier_id = ?").get(supplierId);
    assert.deepEqual([row.status, row.source, row.ends_at], ["WAIVED", "LAUNCH", null]);
  });
});
