import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import {
  validatePromoCode,
  applyPromoCode,
  getUserReferralInfo,
  processReferralRewardOnCompletion
} from "../src/services/promoService.js";

describe("Traveler Promo Codes & Referral Engine", () => {
  const user1Id = "usr_test_promo_referrer";
  const user2Id = "usr_test_promo_friend";
  const bookingId = "bk_test_promo_sample";

  before(() => {
    // Cleanup
    db.prepare("DELETE FROM user_referrals WHERE referrer_user_id IN (?, ?) OR referred_user_id IN (?, ?)").run(user1Id, user2Id, user1Id, user2Id);
    db.prepare("DELETE FROM promo_codes WHERE code IN ('TESTPCT50', 'TESTFIX200', 'TESTEXPIRED', 'TESTINACTIVE')").run();
    db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(user1Id, user2Id);

    // Insert test users
    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, 'Aarav Sharma', 'aarav.sharma@example.com', 'hashed_pw', 'TRAVELER')
    `).run(user1Id);

    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, 'Priya Patel', 'priya.patel@example.com', 'hashed_pw', 'TRAVELER')
    `).run(user2Id);

    // Insert test promo codes
    db.prepare(`
      INSERT INTO promo_codes (id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, usage_limit, is_active)
      VALUES
        ('p_test_pct', 'TESTPCT50', '50% off test up to 300', 'PERCENTAGE', 50.0, 500.0, 300.0, 5, 1),
        ('p_test_fix', 'TESTFIX200', 'Flat 200 off', 'FIXED', 200.0, 1000.0, 200.0, 10, 1),
        ('p_test_inact', 'TESTINACTIVE', 'Inactive code', 'PERCENTAGE', 10.0, 0.0, 100.0, 10, 0)
    `).run();

    db.prepare(`
      INSERT INTO promo_codes (id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, usage_limit, is_active, expires_at)
      VALUES ('p_test_exp', 'TESTEXPIRED', 'Expired code', 'PERCENTAGE', 15.0, 0.0, 500.0, 10, 1, '2020-01-01T00:00:00Z')
    `).run();

    // Insert test booking
    const prod = db.prepare("SELECT id FROM products LIMIT 1").get();
    const prodId = prod ? prod.id : null;
    db.prepare(`
      INSERT OR IGNORE INTO bookings (id, ref, product_id, product_type, traveler_name, traveler_phone, traveler_email, pickup_location, activity_date, amount_inr, status)
      VALUES (?, 'IH-TEST-REF', ?, 'TOUR', 'Priya Patel', '+919876543210', 'priya@example.com', 'Hotel Taj', '2026-09-01', 2000.0, 'CONFIRMED')
    `).run(bookingId, prodId);
  });

  after(() => {
    // Cleanup
    db.prepare("DELETE FROM user_referrals WHERE referrer_user_id IN (?, ?) OR referred_user_id IN (?, ?) OR booking_id = ?").run(user1Id, user2Id, user1Id, user2Id, bookingId);
    db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
    db.prepare("DELETE FROM promo_codes WHERE code IN ('TESTPCT50', 'TESTFIX200', 'TESTEXPIRED', 'TESTINACTIVE')").run();
    db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(user1Id, user2Id);
  });

  it("calculates percentage discount accurately with maximum discount cap", () => {
    // Under cap: 50% of ₹500 = ₹250 (cap is 300)
    const res1 = validatePromoCode(db, { code: "TESTPCT50", amountInr: 500 });
    assert.equal(res1.valid, true);
    assert.equal(res1.discountAmount, 250);
    assert.equal(res1.finalAmount, 250);

    // Over cap: 50% of ₹1000 = ₹500 -> capped at ₹300
    const res2 = validatePromoCode(db, { code: "TESTPCT50", amountInr: 1000 });
    assert.equal(res2.valid, true);
    assert.equal(res2.discountAmount, 300);
    assert.equal(res2.finalAmount, 700);
  });

  it("enforces minimum booking order threshold", () => {
    // Order of ₹300 is below min_order_inr of ₹500
    assert.throws(
      () => validatePromoCode(db, { code: "TESTPCT50", amountInr: 300 }),
      /requires a minimum booking amount/
    );
  });

  it("calculates fixed discount accurately", () => {
    const res = validatePromoCode(db, { code: "TESTFIX200", amountInr: 1500 });
    assert.equal(res.valid, true);
    assert.equal(res.discountAmount, 200);
    assert.equal(res.finalAmount, 1300);
  });

  it("rejects inactive, expired, or non-existent promo codes", () => {
    assert.throws(
      () => validatePromoCode(db, { code: "TESTINACTIVE", amountInr: 1000 }),
      /no longer active/
    );

    assert.throws(
      () => validatePromoCode(db, { code: "TESTEXPIRED", amountInr: 1000 }),
      /expired/
    );

    assert.throws(
      () => validatePromoCode(db, { code: "BOGUSCODE999", amountInr: 1000 }),
      /Invalid promo code/
    );
  });

  it("generates user referral code and provides referral discount to friends", () => {
    const refInfo = getUserReferralInfo(db, user1Id);
    assert.ok(refInfo.referralCode);
    assert.ok(refInfo.referralLink.includes(refInfo.referralCode));
    assert.equal(refInfo.friendsInvitedCount, 0);

    // Friend using Aarav's referral code
    const res = validatePromoCode(db, {
      code: refInfo.referralCode,
      amountInr: 2000,
      userId: user2Id
    });
    assert.equal(res.valid, true);
    assert.equal(res.type, "REFERRAL");
    assert.equal(res.discountAmount, 250);
    assert.equal(res.finalAmount, 1750);
  });

  it("prevents users from redeeming their own referral code", () => {
    const refInfo = getUserReferralInfo(db, user1Id);
    assert.throws(
      () => validatePromoCode(db, { code: refInfo.referralCode, amountInr: 2000, userId: user1Id }),
      /cannot use your own referral code/
    );
  });

  it("applies promo code and increments times_used counter", () => {
    const initial = db.prepare("SELECT times_used FROM promo_codes WHERE code = 'TESTFIX200'").get();
    const result = applyPromoCode(db, { code: "TESTFIX200", bookingId, amountInr: 1500 });
    assert.ok(result);
    assert.equal(result.discountAmount, 200);

    const updated = db.prepare("SELECT times_used FROM promo_codes WHERE code = 'TESTFIX200'").get();
    assert.equal(updated.times_used, initial.times_used + 1);
  });

  it("processes referral rewards upon booking completion", () => {
    const refInfo = getUserReferralInfo(db, user1Id);
    applyPromoCode(db, {
      code: refInfo.referralCode,
      bookingId,
      userId: user2Id,
      amountInr: 2000
    });

    const pendingStats = getUserReferralInfo(db, user1Id);
    assert.equal(pendingStats.pendingCredits, 250);
    assert.equal(pendingStats.totalCreditsEarned, 0);

    // Complete booking
    const rewardRes = processReferralRewardOnCompletion(db, bookingId);
    assert.ok(rewardRes);
    assert.equal(rewardRes.rewarded, true);

    const completedStats = getUserReferralInfo(db, user1Id);
    assert.equal(completedStats.pendingCredits, 0);
    assert.equal(completedStats.totalCreditsEarned, 250);
  });
});
