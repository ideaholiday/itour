import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { redeemCoupon, releaseCouponRedemptions, validatePromoCode } from "../src/services/promoService.js";
import { createCoupon, listCouponRedemptions, listCoupons, updateCoupon } from "../src/services/couponService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

/** promo_codes as db.js creates it, with migration 040 applied from the real file. */
function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, referral_code TEXT);
    CREATE TABLE promo_codes (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, description TEXT, discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
      discount_value REAL NOT NULL, min_order_inr REAL DEFAULT 0.0, max_discount_inr REAL, usage_limit INTEGER DEFAULT 1000,
      times_used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE affiliates (id TEXT PRIMARY KEY, affiliate_code TEXT, status TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, amount_inr REAL, status TEXT, payment_status TEXT, refunded_amount REAL DEFAULT 0, refund_amount_inr REAL DEFAULT 0);
    CREATE TABLE booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, expires_at TEXT);
    INSERT INTO users (id, name) VALUES ('usr_admin', 'Asha Admin'), ('usr_anu', 'Anu'), ('usr_ben', 'Ben');
    INSERT INTO affiliates VALUES ('aff_1', 'CREATOR10', 'ACTIVE');
    INSERT INTO promo_codes (id, code, discount_type, discount_value, max_discount_inr) VALUES ('promo_creator', 'CREATOR10', 'PERCENTAGE', 5, 1000);
  `);
  executeMigrationSql(db, upSql("040_coupon_engine.sql"));
  return db;
}

const tour = { id: "prd_tour", product_type: "TOUR", supplier_id: "sup_goa" };
const cab = { id: "prd_cab", product_type: "TRANSFER", supplier_id: "sup_other" };

function book(db, id, { userId, amount = 5000, payment = "PENDING", status = "pending_payment", holdExpired = false }) {
  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, status, payment_status) VALUES (?, ?, ?, ?, ?, ?)").run(id, `IH-${id}`, userId, amount, status, payment);
  db.prepare("INSERT INTO booking_holds (id, booking_id, status, expires_at) VALUES (?, ?, ?, ?)")
    .run(`hold_${id}`, id, holdExpired ? "EXPIRED" : "ACTIVE", holdExpired ? "2020-01-01 00:00:00" : "2099-01-01 00:00:00");
}

test("admins create coupons with limits and targeting; bad input and taken codes are refused", () => {
  const db = database();
  const coupon = createCoupon(db, {
    code: "goa500", description: "₹500 off Goa tours", discountType: "FIXED", discountValue: 500, minOrderInr: 2000,
    usageLimit: 2, perUserLimit: 1, productTypes: ["tour"], supplierIds: ["sup_goa"], expiresAt: "2099-12-31",
  }, { actorId: "usr_admin" });
  assert.deepEqual(
    [coupon.code, coupon.productTypes, coupon.supplierIds, coupon.expiresAt, coupon.perUserLimit, coupon.isActive, coupon.isCreatorCode],
    ["GOA500", ["TOUR"], ["sup_goa"], "2099-12-31 23:59:59", 1, true, false],
  );

  const refuse = (input, code) => assert.throws(() => createCoupon(db, input), (error) => error.code === code);
  refuse({ code: "GOA500", discountType: "FIXED", discountValue: 100 }, "CODE_TAKEN");
  refuse({ code: "CREATOR10", discountType: "FIXED", discountValue: 100 }, "CODE_TAKEN");
  refuse({ code: "REF-ANU123", discountType: "FIXED", discountValue: 100 }, "RESERVED_CODE");
  refuse({ code: "x!", discountType: "FIXED", discountValue: 100 }, "INVALID_COUPON");
  refuse({ code: "HALFPLUS", discountType: "PERCENTAGE", discountValue: 120 }, "INVALID_COUPON");
  refuse({ code: "BACKWARDS", discountType: "FIXED", discountValue: 100, startsAt: "2099-02-01", expiresAt: "2099-01-01" }, "INVALID_COUPON");

  assert.throws(() => updateCoupon(db, coupon.id, { code: "OTHER" }), (error) => error.code === "CODE_IMMUTABLE");
  assert.equal(updateCoupon(db, coupon.id, { isActive: false }).isActive, false);
  assert.equal(updateCoupon(db, coupon.id, { discountValue: 400, isActive: true }).discountValue, 400);

  // A creator's code follows their tier: only on/off here.
  assert.throws(() => updateCoupon(db, "promo_creator", { discountValue: 50 }), (error) => error.code === "CREATOR_CODE");
  assert.equal(updateCoupon(db, "promo_creator", { isActive: false }).isActive, false);
  assert.equal(listCoupons(db).find((c) => c.code === "CREATOR10").isCreatorCode, true);
});

test("a coupon applies only to its products, suppliers, dates and travelers", () => {
  const db = database();
  createCoupon(db, { code: "GOATOUR", discountType: "PERCENTAGE", discountValue: 10, productTypes: ["TOUR"], supplierIds: ["sup_goa"], perUserLimit: 1 });
  createCoupon(db, { code: "FIRSTTRIP", discountType: "FIXED", discountValue: 300, firstBookingOnly: true });
  createCoupon(db, { code: "LATER", discountType: "FIXED", discountValue: 300, startsAt: "2099-01-01" });
  db.prepare("UPDATE promo_codes SET audience = 'SUPPLIER_SUBSCRIPTION' WHERE code = 'LATER'").run();
  createCoupon(db, { code: "SOON", discountType: "FIXED", discountValue: 300, startsAt: "2099-01-01" });
  const check = (code, options) => validatePromoCode(db, { code, amountInr: 5000, ...options });
  const refused = (code, options, errorCode) => assert.throws(() => check(code, options), (error) => error.code === errorCode);

  assert.equal(check("GOATOUR", { userId: "usr_anu", product: tour }).discountAmount, 500);
  assert.equal(check("GOATOUR", { userId: "usr_anu" }).discountAmount, 500, "no product yet: the quote checks targeting");
  refused("GOATOUR", { userId: "usr_anu", product: cab }, "NOT_APPLICABLE");
  refused("GOATOUR", { product: tour }, "SIGN_IN_REQUIRED");
  refused("SOON", { userId: "usr_anu" }, "NOT_STARTED");
  refused("LATER", { userId: "usr_anu" }, "WRONG_AUDIENCE");

  book(db, "bk_anu_1", { userId: "usr_anu" });
  redeemCoupon(db, { code: "GOATOUR", bookingId: "bk_anu_1", userId: "usr_anu", discountInr: 500 });
  refused("GOATOUR", { userId: "usr_anu", product: tour }, "PER_USER_LIMIT");
  assert.equal(check("GOATOUR", { userId: "usr_ben", product: tour }).valid, true, "another traveler still can");

  assert.equal(check("FIRSTTRIP", { userId: "usr_ben" }).discountAmount, 300);
  book(db, "bk_ben_paid", { userId: "usr_ben", payment: "PAID", status: "confirmed" });
  refused("FIRSTTRIP", { userId: "usr_ben" }, "FIRST_BOOKING_ONLY");
});

test("the usage limit is enforced at redemption, and uses from bookings that never went ahead come back", () => {
  const db = database();
  const coupon = createCoupon(db, { code: "TWICE", discountType: "FIXED", discountValue: 200, usageLimit: 2 });
  book(db, "bk_paid", { userId: "usr_anu", payment: "PAID", status: "confirmed" });
  book(db, "bk_abandoned", { userId: "usr_ben", holdExpired: true });
  book(db, "bk_third", { userId: "usr_ben" });
  redeemCoupon(db, { code: "TWICE", bookingId: "bk_paid", userId: "usr_anu", discountInr: 200 });
  redeemCoupon(db, { code: "TWICE", bookingId: "bk_abandoned", userId: "usr_ben", discountInr: 200 });
  assert.throws(() => redeemCoupon(db, { code: "TWICE", bookingId: "bk_third", userId: "usr_ben", discountInr: 200 }), (error) => error.status === 409 && error.code === "USAGE_LIMIT");

  assert.deepEqual(releaseCouponRedemptions(db), { released: 1 });
  assert.deepEqual(releaseCouponRedemptions(db), { released: 0 }, "safe to repeat");
  const report = listCouponRedemptions(db, coupon.id);
  assert.equal(report.coupon.timesUsed, 1);
  assert.deepEqual(report.redemptions.map((r) => [r.bookingRef, r.status]).sort(), [["IH-bk_abandoned", "RELEASED"], ["IH-bk_paid", "ACTIVE"]]);
  redeemCoupon(db, { code: "TWICE", bookingId: "bk_third", userId: "usr_ben", discountInr: 200 });

  // A full refund gives the use back; a partial one keeps it.
  db.prepare("UPDATE bookings SET payment_status = 'PARTIALLY_REFUNDED', refunded_amount = 1000 WHERE id = 'bk_paid'").run();
  assert.equal(releaseCouponRedemptions(db).released, 0);
  db.prepare("UPDATE bookings SET payment_status = 'REFUNDED', refunded_amount = 5000 WHERE id = 'bk_paid'").run();
  assert.equal(releaseCouponRedemptions(db).released, 1);
  assert.equal(listCoupons(db).find((c) => c.code === "TWICE").redeemedCount, 1);
});
