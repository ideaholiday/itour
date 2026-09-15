import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("a creator uses their earnings for travel: 1% TDS, then they pay past the wallet cap", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Kabir Sen", email: "kabir.creator@example.test", password: "Integration@2026", phone: "+919899900010" },
  });
  const token = signup.data.token;
  const registered = await requestJson(api.baseUrl, "/api/affiliate/register", { token, body: { channelName: "Kabir Trails", customCode: "KABIRGO" } });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
  const affiliateId = registered.data.affiliate.id;

  // Stand in for trips the creator's audience already took: ₹20,000 of cleared commission.
  const activity = (await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR")).data[0];
  db.prepare("INSERT INTO bookings (id, ref, user_id, product_id, product_type, traveler_name, traveler_phone, traveler_email, pickup_location, activity_date, amount_inr, status, payment_status) VALUES ('bk_kabir_src', 'IH-KABSRC', ?, ?, 'TOUR', 'Audience', '+919800000000', 'a@example.test', 'Goa', '2026-01-01', 200000, 'completed', 'PAID')")
    .run(signup.data.user.id, activity.id);
  db.prepare(`INSERT INTO affiliate_referrals (id, affiliate_id, booking_id, attribution_type, booking_amount_inr, commission_rate, earning_inr, status, eligible_at, payable_at)
    VALUES ('ref_kabir', ?, 'bk_kabir_src', 'COUPON_CODE', 200000, 0.1, 20000, 'ELIGIBLE', '2026-01-01 00:00:00', '2026-01-15 00:00:00')`).run(affiliateId);

  const noPan = await requestJson(api.baseUrl, "/api/affiliate/wallet-transfer", { token, body: { amountInr: 10000 } });
  assert.equal(noPan.response.status, 403);
  assert.equal(noPan.data.code, "PAN_NOT_VERIFIED");
  db.prepare("UPDATE affiliates SET pan_verified = 1, kyc_status = 'VERIFIED' WHERE id = ?").run(affiliateId);

  const moved = await requestJson(api.baseUrl, "/api/affiliate/wallet-transfer", { token, body: { amountInr: 10000 } });
  assert.equal(moved.response.status, 201, JSON.stringify(moved.data));
  assert.deepEqual([moved.data.transfer.tdsInr, moved.data.transfer.netInr, moved.data.transfer.balances.withdrawableInr], [100, 9900, 10000]);

  const profile = await requestJson(api.baseUrl, "/api/loyalty/profile", { token });
  assert.deepEqual([profile.data.walletBalanceInr, profile.data.affiliateCreditInr], [9900, 9900]);

  // Earnings are not capped at ₹2,000 or 50%: they can pay the whole booking.
  const created = await requestJson(api.baseUrl, "/api/bookings", {
    token,
    headers: { "Idempotency-Key": "kabir-travel-1" },
    body: {
      product_id: activity.id, activity_date: futureDate(29), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00", pickup_location: "Calangute, Goa",
      traveler_name: "Kabir Sen", traveler_email: "kabir.creator@example.test", traveler_phone: "+919899900010", payment_method: "DEMO",
      wallet_credit_inr: 9900,
    },
  });
  assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
  const expected = Math.min(9900, Math.floor(created.data.original_amount_inr));
  assert.equal(created.data.wallet_credit_applied_inr, expected);
  assert.ok(expected > 2000, "the booking is large enough to prove the cap does not apply");
  assert.equal(created.data.amount_inr, created.data.original_amount_inr - expected);
  const redemption = db.prepare("SELECT affiliate_inr FROM wallet_transactions WHERE booking_id = ? AND entry_type = 'REDEMPTION'").get(created.data.bookingId);
  assert.equal(redemption.affiliate_inr, expected);
});
