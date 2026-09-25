import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "plans.admin@example.test", password: "Integration@Admin2026" };

test("profile plans: a Spotlight shows on the public profile; a paid check waits for an admin who passes it", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_plans_admin', 'Plans Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const token = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const supplier = db.prepare("SELECT id, public_slug FROM suppliers WHERE kyb_status = 'APPROVED' AND public_slug IS NOT NULL LIMIT 1").get();
  const product = db.prepare("SELECT id, title FROM products WHERE supplier_id = ? AND status = 'PUBLISHED' LIMIT 1").get(supplier.id);
  const plans = (suffix) => `/api/suppliers/${supplier.id}${suffix}`;

  const before = await requestJson(api.baseUrl, `/api/public/suppliers/${supplier.public_slug}`);
  assert.equal(before.response.status, 200, JSON.stringify(before.data));
  assert.deepEqual(before.data.supplier.spotlights, []);

  const quote = await requestJson(api.baseUrl, plans("/plans/quote"), { token, body: { planCode: "VERIFIED_PLUS", productId: product.id } });
  assert.deepEqual([quote.data.quote.baseInr, quote.data.quote.totalInr], [3499, 4128.82]);
  assert.equal((await requestJson(api.baseUrl, plans("/plans/quote"), { token, body: { planCode: "SPOTLIGHT" } })).data.code, "PRODUCT_REQUIRED");

  const coupon = await requestJson(api.baseUrl, "/api/admin/coupons", { token, body: { code: "PLANSFREE", audience: "SUPPLIER_PLANS", discountType: "PERCENTAGE", discountValue: 100 } });
  assert.equal(coupon.response.status, 201, JSON.stringify(coupon.data));
  const bought = await requestJson(api.baseUrl, plans("/plans/checkout"), { token, body: { planCode: "VERIFIED_PLUS", productId: product.id, couponCode: "PLANSFREE" } });
  assert.equal(bought.response.status, 201, JSON.stringify(bought.data));
  assert.equal(bought.data.payment.status, "FREE");

  const profile = await requestJson(api.baseUrl, `/api/public/suppliers/${supplier.public_slug}`);
  assert.deepEqual(profile.data.supplier.spotlights.map((row) => row.id), [product.id]);
  assert.equal(profile.data.supplier.badge.status, "NOT_VERIFIED", "the check is bought, not the badge");

  const status = await requestJson(api.baseUrl, plans("/subscription"), { token });
  assert.ok(status.data.verification.checkPendingSince);
  assert.equal(status.data.spotlights[0].productId, product.id);

  const queue = await requestJson(api.baseUrl, "/api/admin/verification-queue", { token });
  assert.equal(queue.data.queue.length, 1);
  const granted = await requestJson(api.baseUrl, `/api/admin/suppliers/${supplier.id}/profile-verification`, {
    token, body: { action: "GRANT", checks: ["BUSINESS_IDENTITY", "BANK_ACCOUNT", "BUSINESS_ADDRESS", "OWNER_CALL"], reason: "All checks passed" },
  });
  assert.equal(granted.response.status, 201, JSON.stringify(granted.data));
  assert.equal(granted.data.verification.source, "PURCHASE");
  assert.equal((await requestJson(api.baseUrl, "/api/admin/verification-queue", { token })).data.queue.length, 0);
  assert.equal((await requestJson(api.baseUrl, `/api/public/suppliers/${supplier.public_slug}`)).data.supplier.badge.status, "VERIFIED");
});
