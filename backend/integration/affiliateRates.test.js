import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN = { email: "rates.admin@example.test", password: "Integration@Admin2026" };

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("admins set creator tier and personal rates within the cap, and bookings use them", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_rates_admin', 'Rates Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const signup = (name, email, phone) => requestJson(api.baseUrl, "/api/auth/signup", { body: { name, email, password: "Integration@2026", phone } });
  const creator = await signup("Neha Kapoor", "neha.creator@example.test", "+919888800008");
  const traveler = await signup("Arjun Rao", "arjun.traveler@example.test", "+919888800009");

  const registered = await requestJson(api.baseUrl, "/api/affiliate/register", { token: creator.data.token, body: { channelName: "Neha Wanders", customCode: "NEHAGOA" } });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
  const affiliateId = registered.data.affiliate.id;

  assert.equal((await requestJson(api.baseUrl, "/api/admin/affiliates/tiers", { token: traveler.data.token })).response.status, 403);
  const tiers = await requestJson(api.baseUrl, "/api/admin/affiliates/tiers", { token: adminToken });
  assert.equal(tiers.response.status, 200, JSON.stringify(tiers.data));
  assert.equal(tiers.data.tiers.find((tier) => tier.code === "STARTER").overCap, true, "10% + 5% is over the 10% cap");

  const overCap = await requestJson(api.baseUrl, "/api/admin/affiliates/tiers/STARTER", { method: "PUT", token: adminToken, body: { commissionPct: 8, travelerDiscountPct: 5, reason: "Too generous" } });
  assert.equal(overCap.response.status, 400);
  assert.equal(overCap.data.code, "OVER_GIVEAWAY_CAP");

  const saved = await requestJson(api.baseUrl, "/api/admin/affiliates/tiers/STARTER", { method: "PUT", token: adminToken, body: { commissionPct: 6, travelerDiscountPct: 3, reason: "Fit the 10% cap" } });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
  assert.deepEqual([saved.data.tier.commissionPct, saved.data.tier.overCap, saved.data.notified], [6, false, 1]);
  assert.equal(db.prepare("SELECT discount_value FROM promo_codes WHERE code = 'NEHAGOA'").get().discount_value, 3);

  const personal = await requestJson(api.baseUrl, `/api/admin/affiliates/${affiliateId}/rates`, { method: "PUT", token: adminToken, body: { commissionPct: 7, reason: "Top creator" } });
  assert.equal(personal.response.status, 200, JSON.stringify(personal.data));
  assert.deepEqual([personal.data.commissionPct, personal.data.travelerDiscountPct, personal.data.commissionOverridden], [7, 3, true]);

  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const created = await requestJson(api.baseUrl, "/api/bookings", {
    token: traveler.data.token,
    headers: { "Idempotency-Key": "rates-arjun-1" },
    body: {
      product_id: activity.id, activity_date: futureDate(28), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00",
      pickup_location: "Calangute, Goa", promo_code: "NEHAGOA",
      traveler_name: "Arjun Rao", traveler_email: "arjun.traveler@example.test", traveler_phone: "+919888800009", payment_method: "DEMO",
    },
  });
  assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
  const total = created.data.original_amount_inr;
  // 7% creator commission + 3% audience discount fits the 10% cap exactly.
  assert.equal(created.data.coupon_discount_inr, Math.min(1000, Math.floor(total * 0.03)));
  const referral = db.prepare("SELECT commission_rate, earning_inr FROM affiliate_referrals WHERE booking_id = ?").get(created.data.bookingId);
  assert.deepEqual([referral.commission_rate, referral.earning_inr], [0.07, Math.round(total * 0.07 * 100) / 100]);

  const history = await requestJson(api.baseUrl, "/api/admin/affiliates/tiers", { token: adminToken });
  assert.deepEqual(history.data.changes.map((change) => change.scope), ["AFFILIATE", "TIER"]);
});
