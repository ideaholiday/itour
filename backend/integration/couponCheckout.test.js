import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

let api;

before(async () => {
  api = await startTestServer();
});

after(async () => {
  await api?.stop();
});

function futureDate(days = 21) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function withDatabase(work) {
  const database = new Database(api.databasePath);
  try {
    return work(database);
  } finally {
    database.close();
  }
}

test("Coupons: the gateway charges the discounted price checkout shows, within the giveaway cap", async (t) => {
  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  assert.ok(activity?.id, "demo data has a bookable Goa activity");

  withDatabase((database) => {
    database.prepare(`
      INSERT INTO promo_codes (id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, usage_limit, is_active, expires_at)
      VALUES
        ('p_it_small', 'ITFLAT50', 'Flat ₹50 off', 'FIXED', 50, 0, 50, 100, 1, NULL),
        ('p_it_big', 'ITHALF', 'Half price', 'PERCENTAGE', 50, 0, 1000000, 100, 1, NULL),
        ('p_it_old', 'ITEXPIRED', 'Expired', 'FIXED', 50, 0, 50, 100, 1, '2020-01-01T00:00:00Z')
    `).run();
  });

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Anita Rao", email: "anita.coupon@example.test", password: "Integration@2026", phone: "+919833300003" },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const token = signup.data.token;

  const quoteInput = {
    product_id: activity.id,
    activity_date: futureDate(),
    adults: 2,
    children: 0,
    luggage_bags: 0,
    pickup_time: "09:00",
    pickup_location: "Calangute, Goa",
  };
  const traveler = { traveler_name: "Anita Rao", traveler_email: "anita.coupon@example.test", traveler_phone: "+919833300003", payment_method: "DEMO" };

  const book = (headersKey, body) => requestJson(api.baseUrl, "/api/bookings", {
    token,
    headers: { "Idempotency-Key": headersKey },
    body: { ...quoteInput, ...traveler, ...body },
  });
  const bookingRow = (id) => withDatabase((database) => database.prepare("SELECT * FROM bookings WHERE id = ?").get(id));
  const assertReconciles = (row) => assert.equal(
    Math.round((row.amount_inr + row.wallet_credit_applied_inr + row.referral_discount_inr + row.coupon_discount_inr) * 100),
    Math.round((row.commission_amount + row.supplier_payout_amount) * 100),
    "the coupon comes out of commission, not the supplier's payout",
  );

  await t.test("the quote prices the coupon, and the booking charges exactly that", async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token, body: { ...quoteInput, promo_code: "itflat50" } });
    assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
    const coupon = quote.data.quote.coupon;
    assert.deepEqual([coupon.valid, coupon.code, coupon.discountInr, coupon.capped], [true, "ITFLAT50", 50, false]);
    assert.equal("creatorCommissionInr" in coupon, false);
    assert.equal("referrerCreditInr" in quote.data.quote.referral, false, "commission-derived amounts stay on the server");

    const created = await book("coupon-anita-1", { promo_code: "ITFLAT50" });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    assert.equal(created.data.coupon_discount_inr, 50);
    assert.equal(created.data.amount_inr, created.data.original_amount_inr - 50);

    const row = bookingRow(created.data.bookingId);
    assert.equal(row.amount_inr, created.data.amount_inr, "the gateway charges amount_inr");
    assert.equal(row.coupon_discount_inr, 50);
    assert.equal(row.supplier_payout_amount, created.data.original_amount_inr - row.commission_amount);
    assertReconciles(row);

    const payment = await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token, body: { bookingId: created.data.bookingId } });
    assert.equal(payment.response.status, 200, `${JSON.stringify(payment.data)}\n${api.output()}`);
    const invoice = await requestJson(api.baseUrl, `/api/bookings/${created.data.ref}/documents/invoice`, { token });
    assert.equal(invoice.response.status, 200);
    assert.match(invoice.data, /Promo code discount \(ITFLAT50\)/);
  });

  await t.test("a deep coupon is cut to 10% of the booking value", async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token, body: { ...quoteInput, activity_date: futureDate(22), promo_code: "ITHALF" } });
    assert.equal(quote.data.quote.coupon.capped, true);

    const created = await book("coupon-anita-2", { activity_date: futureDate(22), promo_code: "ITHALF" });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    const row = bookingRow(created.data.bookingId);
    const expected = Math.floor(Math.min(created.data.original_amount_inr * 0.1, row.commission_amount));
    assert.ok(expected > 0);
    assert.equal(row.coupon_discount_inr, expected);
    assert.equal(quote.data.quote.coupon.discountInr, expected, "checkout showed what was charged");
    assert.equal(row.amount_inr, created.data.original_amount_inr - expected);
    assertReconciles(row);
  });

  await t.test("a code that is no longer valid refuses the booking instead of charging full price", async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token, body: { ...quoteInput, promo_code: "ITEXPIRED" } });
    assert.equal(quote.response.status, 200);
    assert.equal(quote.data.quote.coupon.valid, false);
    assert.match(quote.data.quote.coupon.error, /expired/);

    const created = await book("coupon-anita-3", { activity_date: futureDate(23), promo_code: "ITEXPIRED" });
    assert.equal(created.response.status, 400, JSON.stringify(created.data));
    assert.match(created.data.error, /expired/);
    const count = withDatabase((database) => database.prepare("SELECT COUNT(*) AS n FROM bookings WHERE client_request_id = 'coupon-anita-3'").get().n);
    assert.equal(count, 0);
  });
});
