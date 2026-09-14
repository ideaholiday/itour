import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import { validatePromoCode, applyPromoCode, capCouponDiscount, priceCouponForBooking } from "../src/services/promoService.js";
import { ensureUserReferralCode } from "../src/services/loyaltyService.js";

const referralCodeFor = (userId) => ensureUserReferralCode(db, db.prepare("SELECT id, name, referral_code FROM users WHERE id = ?").get(userId));

describe("Traveler Promo Codes & Referral Engine", () => {
  const user1Id = "usr_test_promo_referrer";
  const user2Id = "usr_test_promo_friend";
  const bookingId = "bk_test_promo_sample";

  before(() => {
    // Cleanup
    db.prepare("DELETE FROM wallet_transactions WHERE user_id IN (?, ?)").run(user1Id, user2Id);
    db.prepare("DELETE FROM user_referrals WHERE referrer_user_id IN (?, ?) OR referred_user_id IN (?, ?)").run(user1Id, user2Id, user1Id, user2Id);
    db.prepare("DELETE FROM promo_codes WHERE code IN ('TESTPCT50', 'TESTFIX200', 'TESTEXPIRED', 'TESTINACTIVE')").run();
    try { db.prepare("DELETE FROM coupon_redemptions WHERE booking_id = ?").run(bookingId); } catch {}
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
    try {
      db.prepare("DELETE FROM user_referrals WHERE referrer_user_id IN (?, ?) OR referred_user_id IN (?, ?) OR booking_id = ?").run(user1Id, user2Id, user1Id, user2Id, bookingId);
      db.prepare("DELETE FROM payouts WHERE booking_id = ?").run(bookingId);
      db.prepare("DELETE FROM reviews WHERE booking_id = ?").run(bookingId);
      db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
      db.prepare("DELETE FROM promo_codes WHERE code IN ('TESTPCT50', 'TESTFIX200', 'TESTEXPIRED', 'TESTINACTIVE')").run();
      db.prepare("DELETE FROM wallet_transactions WHERE user_id IN (?, ?)").run(user1Id, user2Id);
      db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(user1Id, user2Id);
    } catch {}
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

  it("recognises an issued traveler referral code without pricing it early", () => {
    const code = referralCodeFor(user1Id);
    assert.match(code, /^REF-/);

    const res = validatePromoCode(db, { code: code.toLowerCase(), amountInr: 2000, userId: user2Id });
    assert.equal(res.valid, true);
    assert.equal(res.type, "REFERRAL");
    assert.equal(res.referrerUserId, user1Id);
    assert.equal(res.discountValue, 10);
    // The rupee amount is 10% of the trip's commission, priced by the booking quote.
    assert.equal(res.discountAmount, 0);
    assert.equal(res.finalAmount, 2000);
  });

  it("does not reconstruct referral codes that were never issued", () => {
    const user = db.prepare("SELECT id, name FROM users WHERE id = ?").get(user2Id);
    const guessed = `REF-${user.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase()}${user.id.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()}`;
    db.prepare("UPDATE users SET referral_code = NULL WHERE id = ?").run(user2Id);
    assert.throws(() => validatePromoCode(db, { code: guessed, amountInr: 2000, userId: user1Id }), /Invalid promo code/);
  });

  it("prevents users from redeeming their own referral code", () => {
    const code = referralCodeFor(user1Id);
    assert.throws(
      () => validatePromoCode(db, { code, amountInr: 2000, userId: user1Id }),
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

  it("prices a coupon for a booking within the giveaway cap", () => {
    // ₹2,000 booking, ₹600 commission: at most 10% of the booking (₹200) is given away.
    const underCap = priceCouponForBooking(db, { code: "TESTFIX200", bookingValueInr: 2000, commissionInr: 600 });
    assert.deepEqual([underCap.discountInr, underCap.capped], [200, false]);

    // A friend discount already spends ₹60 of the ₹200, so the coupon gets the rest.
    const shared = priceCouponForBooking(db, { code: "TESTFIX200", bookingValueInr: 2000, commissionInr: 600, otherGiveawayInr: 60 });
    assert.deepEqual([shared.offeredInr, shared.discountInr, shared.capped], [200, 140, true]);

    assert.equal(priceCouponForBooking(db, { code: referralCodeFor(user1Id), bookingValueInr: 2000, commissionInr: 600, userId: user2Id }), null);
    assert.throws(() => priceCouponForBooking(db, { code: "TESTEXPIRED", bookingValueInr: 2000, commissionInr: 600 }), /expired/);
  });

  it("gives a coupon only what the booking's giveaway budget has left", () => {
    assert.equal(capCouponDiscount({ offeredInr: 5000, budgetInr: 1000 }), 1000);
    assert.equal(capCouponDiscount({ offeredInr: 500, budgetInr: 1000, otherGiveawayInr: 600 }), 400);
    assert.equal(capCouponDiscount({ offeredInr: 500, budgetInr: 1000, otherGiveawayInr: 1500 }), 0);
    assert.equal(capCouponDiscount({ offeredInr: 99.9, budgetInr: 1000 }), 99, "whole rupees, rounded down");
  });

  it("leaves traveler referral codes to the booking route", () => {
    const code = referralCodeFor(user1Id);
    const before = db.prepare("SELECT COUNT(*) AS n FROM user_referrals").get().n;
    const result = applyPromoCode(db, { code, bookingId, userId: user2Id, amountInr: 2000 });
    assert.equal(result.type, "REFERRAL");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_referrals").get().n, before, "no v1 referral row is written");
  });
});
