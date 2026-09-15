import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "programs.admin@example.test", password: "Integration@Admin2026" };

function futureDate(days = 21) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("admins set the giveaway cap, with a reason on record, and checkout follows it", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_programs_admin', 'Programs Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  db.prepare(`INSERT INTO promo_codes (id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, usage_limit, is_active)
    VALUES ('p_programs_half', 'PGHALF', 'Half price', 'PERCENTAGE', 50, 0, 1000000, 100, 1)`).run();
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  assert.ok(adminToken);
  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Kiran Das", email: "kiran.programs@example.test", password: "Integration@2026", phone: "+919844400004" },
  });
  const travelerToken = traveler.data.token;

  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const quoteBody = { product_id: activity.id, activity_date: futureDate(), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00", pickup_location: "Calangute, Goa", promo_code: "PGHALF" };
  const couponQuote = async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: travelerToken, body: quoteBody });
    assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
    return quote.data.quote;
  };

  // Only administrators can read or change program settings.
  assert.equal((await requestJson(api.baseUrl, "/api/admin/programs")).response.status, 401);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/programs", { token: travelerToken })).response.status, 403);
  const refused = await requestJson(api.baseUrl, "/api/admin/programs/giveaway", {
    method: "PUT", token: travelerToken, body: { settings: { maxBookingValuePct: 50 }, reason: "Let me in" },
  });
  assert.equal(refused.response.status, 403);

  const listed = await requestJson(api.baseUrl, "/api/admin/programs", { token: adminToken });
  assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
  assert.deepEqual(listed.data.programs.find((p) => p.key === "giveaway").settings, { maxBookingValuePct: 10 });

  const before = await couponQuote();
  const total = before.breakdown.totalAmount;
  assert.equal(before.coupon.discountInr, Math.floor(total * 0.1));

  // Invalid changes are refused with a reason why.
  const noReason = await requestJson(api.baseUrl, "/api/admin/programs/giveaway", { method: "PUT", token: adminToken, body: { settings: { maxBookingValuePct: 5 } } });
  assert.equal(noReason.response.status, 400);
  const tooHigh = await requestJson(api.baseUrl, "/api/admin/programs/giveaway", { method: "PUT", token: adminToken, body: { settings: { maxBookingValuePct: 80 }, reason: "Big sale" } });
  assert.equal(tooHigh.response.status, 400);
  assert.equal(tooHigh.data.code, "INVALID_SETTINGS");
  const unknown = await requestJson(api.baseUrl, "/api/admin/programs/lottery", { method: "PUT", token: adminToken, body: { settings: {}, reason: "Nope" } });
  assert.equal(unknown.response.status, 404);

  // Share & Earn (10% + 10% of a 30% commission) already takes 6% of a booking.
  const tooTight = await requestJson(api.baseUrl, "/api/admin/programs/giveaway", { method: "PUT", token: adminToken, body: { settings: { maxBookingValuePct: 5 }, reason: "Too tight" } });
  assert.equal(tooTight.response.status, 400);
  assert.equal(tooTight.data.code, "OVER_GIVEAWAY_CAP");
  const generousReferral = await requestJson(api.baseUrl, "/api/admin/programs/referral", { method: "PUT", token: adminToken, body: { settings: { friendDiscountPct: 25 }, reason: "Big referral push" } });
  assert.equal(generousReferral.data.code, "OVER_GIVEAWAY_CAP", "25% + 10% of 30% is 10.5% of a booking");

  const saved = await requestJson(api.baseUrl, "/api/admin/programs/giveaway", {
    method: "PUT", token: adminToken, body: { settings: { maxBookingValuePct: 7 }, reason: "Launch budget is tight" },
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  assert.deepEqual([saved.data.changed, saved.data.settings.maxBookingValuePct], [true, 7]);

  const audit = await requestJson(api.baseUrl, "/api/admin/programs/audit?key=giveaway", { token: adminToken });
  assert.equal(audit.data.changes.length, 1);
  assert.deepEqual([audit.data.changes[0].after.maxBookingValuePct, audit.data.changes[0].reason, audit.data.changes[0].changedByName],
    [7, "Launch budget is tight", "Programs Admin"]);

  const after = await couponQuote();
  assert.equal(after.coupon.discountInr, Math.floor(total * 0.07), "the new cap applies to the next quote");
});
