import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "coupons.admin@example.test", password: "Integration@Admin2026" };

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("admins create a coupon; travelers use it once, and the report shows each use", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_coupon_admin', 'Coupon Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Vikram Shah", email: "vikram.coupon@example.test", password: "Integration@2026", phone: "+919877700007" },
  });
  const travelerToken = signup.data.token;

  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const product = db.prepare("SELECT id, product_type, supplier_id FROM products WHERE id = ?").get(activity.id);
  const booking = (key, days, code) => requestJson(api.baseUrl, "/api/bookings", {
    token: travelerToken,
    headers: { "Idempotency-Key": key },
    body: {
      product_id: activity.id, activity_date: futureDate(days), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00",
      pickup_location: "Calangute, Goa", promo_code: code,
      traveler_name: "Vikram Shah", traveler_email: "vikram.coupon@example.test", traveler_phone: "+919877700007", payment_method: "DEMO",
    },
  });

  assert.equal((await requestJson(api.baseUrl, "/api/admin/coupons", { token: travelerToken })).response.status, 403);
  const invalid = await requestJson(api.baseUrl, "/api/admin/coupons", { token: adminToken, body: { code: "BAD", discountType: "PERCENTAGE", discountValue: 150 } });
  assert.equal(invalid.response.status, 400);

  const created = await requestJson(api.baseUrl, "/api/admin/coupons", {
    token: adminToken,
    body: { code: "goaonce", description: "₹100 off, once per traveler", discountType: "FIXED", discountValue: 100, perUserLimit: 1, productTypes: [product.product_type], supplierIds: [product.supplier_id] },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const couponId = created.data.coupon.id;
  const other = await requestJson(api.baseUrl, "/api/admin/coupons", {
    token: adminToken, body: { code: "CABSONLY", discountType: "FIXED", discountValue: 100, productTypes: ["TRANSFER"] },
  });
  assert.equal(other.response.status, 201);

  await t.test("a coupon for other products is refused at the quote", async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: travelerToken, body: { product_id: activity.id, activity_date: futureDate(25), adults: 2, promo_code: "CABSONLY" } });
    assert.equal(quote.data.quote.coupon.valid, false);
    assert.match(quote.data.quote.coupon.error, /does not apply/);
  });

  await t.test("the first booking uses the coupon, a second one by the same traveler is refused", async () => {
    const first = await booking("coupon-admin-vikram-1", 26, "GOAONCE");
    assert.equal(first.response.status, 201, `${JSON.stringify(first.data)}\n${api.output()}`);
    assert.equal(first.data.coupon_discount_inr, 100);

    const second = await booking("coupon-admin-vikram-2", 27, "GOAONCE");
    assert.equal(second.response.status, 400, JSON.stringify(second.data));
    assert.equal(second.data.code, "PER_USER_LIMIT");

    const report = await requestJson(api.baseUrl, `/api/admin/coupons/${couponId}/redemptions`, { token: adminToken });
    assert.equal(report.response.status, 200, JSON.stringify(report.data));
    assert.deepEqual([report.data.coupon.timesUsed, report.data.redemptions.length, report.data.redemptions[0].discountInr, report.data.redemptions[0].bookingRef],
      [1, 1, 100, first.data.ref]);
  });

  await t.test("a deactivated coupon stops working", async () => {
    const off = await requestJson(api.baseUrl, `/api/admin/coupons/${couponId}`, { method: "PATCH", token: adminToken, body: { isActive: false } });
    assert.equal(off.response.status, 200);
    const validate = await requestJson(api.baseUrl, "/api/promo/validate", { token: travelerToken, body: { code: "GOAONCE", amountInr: 5000, productId: activity.id } });
    assert.equal(validate.response.status, 400);
    assert.match(validate.data.error, /no longer active/);
    const listed = await requestJson(api.baseUrl, "/api/admin/coupons", { token: adminToken });
    assert.equal(listed.data.coupons.find((c) => c.code === "GOAONCE").isActive, false);
  });
});
