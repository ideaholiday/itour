import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "subs.pay.admin@example.test", password: "Integration@Admin2026" };

test("suppliers buy their subscription: priced by the server, coupons before GST, a tax invoice", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_subs_pay_admin', 'Subs Pay Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const token = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  // The demo supplier is seeded at startup, so it counts as new.
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE COALESCE(subscription_exempt, 0) = 0 AND kyb_status = 'APPROVED' LIMIT 1").get().id;
  const path = (suffix = "") => `/api/suppliers/${supplierId}/subscription${suffix}`;

  const before = await requestJson(api.baseUrl, path(), { token });
  assert.equal(before.response.status, 200, JSON.stringify(before.data));
  assert.equal(before.data.plan, null, "not on sale until the owner sets a price");
  assert.equal((await requestJson(api.baseUrl, path("/quote"), { token, body: {} })).data.code, "NOT_FOR_SALE");

  const priced = await requestJson(api.baseUrl, "/api/admin/programs/supplier_subscriptions", {
    method: "PUT", token, body: { settings: { priceInr: 999, billingPeriodMonths: 12 }, reason: "Owner set the price" },
  });
  assert.equal(priced.response.status, 200, JSON.stringify(priced.data));

  const quote = await requestJson(api.baseUrl, path("/quote"), { token, body: {} });
  assert.deepEqual([quote.data.quote.baseInr, quote.data.quote.gstInr, quote.data.quote.totalInr, quote.data.quote.sacCode], [999, 179.82, 1178.82, "998559"]);

  await t.test("without a payment gateway the attempt fails cleanly and nothing is activated", async () => {
    const attempt = await requestJson(api.baseUrl, path("/checkout"), { token, body: {} });
    assert.equal(attempt.response.status, 502, JSON.stringify(attempt.data));
    assert.equal(attempt.data.code, "PAYMENT_UNAVAILABLE");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM supplier_subscriptions WHERE supplier_id = ? AND source = 'PURCHASE'").get(supplierId).n, 0);
  });

  await t.test("a traveler coupon is refused; a 100% supplier coupon subscribes with an invoice", async () => {
    const traveler = await requestJson(api.baseUrl, "/api/admin/coupons", { token, body: { code: "TRIPONLY", discountType: "PERCENTAGE", discountValue: 10 } });
    assert.equal(traveler.response.status, 201);
    assert.equal((await requestJson(api.baseUrl, path("/quote"), { token, body: { couponCode: "TRIPONLY" } })).data.code, "WRONG_AUDIENCE");

    const founder = await requestJson(api.baseUrl, "/api/admin/coupons", {
      token, body: { code: "FOUNDER100", audience: "SUPPLIER_SUBSCRIPTION", discountType: "PERCENTAGE", discountValue: 100, perUserLimit: 1 },
    });
    assert.equal(founder.response.status, 201, JSON.stringify(founder.data));

    const free = await requestJson(api.baseUrl, path("/checkout"), { token, body: { couponCode: "founder100" } });
    assert.equal(free.response.status, 201, JSON.stringify(free.data));
    assert.deepEqual([free.data.checkout, free.data.payment.status, free.data.payment.totalInr], [null, "FREE", 0]);
    assert.match(free.data.payment.invoiceNumber, /^IHS\/\d{4}-\d{2}\/00001$/);

    const after = await requestJson(api.baseUrl, path(), { token });
    assert.equal(after.data.subscription.covered, true);
    assert.ok(after.data.subscription.history.some((row) => row.source === "COUPON" && row.status === "ACTIVE"));

    const invoice = await requestJson(api.baseUrl, path(`/payments/${free.data.payment.id}/invoice`), { token });
    assert.equal(invoice.response.status, 200);
    assert.match(invoice.data, /Tax invoice/);
    assert.match(invoice.data, /SAC 998559/);
    assert.match(invoice.data, /Coupon FOUNDER100/);

    assert.equal((await requestJson(api.baseUrl, path("/quote"), { token, body: { couponCode: "FOUNDER100" } })).data.code, "PER_USER_LIMIT");
  });
});
