import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { addSupplier, supplierProfileDatabase } from "./fixtures/supplierProfileDatabase.js";
import { createCoupon } from "../src/services/couponService.js";
import {
  collectVerificationReminders, confirmSubscriptionPayment, listVerificationQueue, quotePlanPayment, rejectPurchasedVerification,
  retryCheckRefund, startPlanPayment, swapSpotlight,
} from "../src/services/supplierPlanPaymentService.js";
import { deriveBadge, grantSupplierVerification, publicSupplierView } from "../src/services/supplierProfileService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];
const CHECKS = ["BUSINESS_IDENTITY", "BANK_ACCOUNT", "BUSINESS_ADDRESS", "OWNER_CALL"];

function database() {
  const db = supplierProfileDatabase();
  db.exec(`
    ALTER TABLE products ADD COLUMN status TEXT; ALTER TABLE products ADD COLUMN is_published INTEGER DEFAULT 1;
    ALTER TABLE products ADD COLUMN hero_image TEXT; ALTER TABLE products ADD COLUMN price_inr REAL; ALTER TABLE products ADD COLUMN city TEXT;
    CREATE TABLE promo_codes (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, description TEXT, discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
      discount_value REAL NOT NULL, min_order_inr REAL DEFAULT 0.0, max_discount_inr REAL, usage_limit INTEGER DEFAULT 1000,
      times_used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE affiliates (id TEXT PRIMARY KEY, affiliate_code TEXT, status TEXT);
  `);
  for (const name of ["037_program_settings.sql", "039_supplier_subscriptions.sql", "040_coupon_engine.sql", "043_supplier_plan_payments.sql", "045_supplier_profile_plans.sql"]) {
    executeMigrationSql(db, upSql(name));
  }
  const supplier = addSupplier(db, { public_slug: "awadh-express-cabs" });
  addSupplier(db, { id: "sup_other", company_name: "Other Cabs", email: "o@example.test", public_slug: "other-cabs" });
  db.exec(`
    UPDATE suppliers SET subscription_exempt = 1;
    INSERT INTO products (id, supplier_id, title, status, price_inr, city) VALUES
      ('prd_cab', 'sup_awadh', 'Lucknow airport cab', 'PUBLISHED', 1200, 'Lucknow'),
      ('prd_tour', 'sup_awadh', 'Ayodhya day tour', 'PUBLISHED', 2500, 'Ayodhya'),
      ('prd_draft', 'sup_awadh', 'Draft tour', 'DRAFT', 900, 'Lucknow'),
      ('prd_theirs', 'sup_other', 'Their tour', 'PUBLISHED', 700, 'Lucknow');
  `);
  return { db, supplier };
}

const gateway = (overrides = {}) => ({
  createOrder: async ({ orderId }) => ({ orderId, paymentSessionId: `s_${orderId}`, environment: "TEST" }),
  getPayments: async () => [],
  getOrder: async () => ({}),
  refund: async ({ refundId, amount }) => ({ refundId, amount }),
  ...overrides,
});

async function buy(db, planCode, { productId = null, couponCode = null, now = new Date() } = {}) {
  const started = await startPlanPayment(db, "sup_awadh", { planCode, productId, couponCode, gateway: gateway(), now });
  if (!started.checkout) return started.payment;
  return confirmSubscriptionPayment(db, { orderId: started.checkout.orderId, amount: started.quote.totalInr, now });
}

test("paying for Verified buys the check, never the badge: it waits for an admin, then counts from the end of the current year", async () => {
  const { db, supplier } = database();
  const quote = quotePlanPayment(db, "sup_awadh", { planCode: "VERIFIED" });
  assert.deepEqual([quote.baseInr, quote.gstInr, quote.totalInr, quote.checkRefundableInr], [999, 179.82, 1178.82, 1178.82]);

  db.prepare("UPDATE suppliers SET kyb_status = 'PENDING' WHERE id = 'sup_awadh'").run();
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "VERIFIED" }), (e) => e.code === "KYB_REQUIRED");
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED' WHERE id = 'sup_awadh'").run();

  const paid = await buy(db, "VERIFIED");
  assert.equal(paid.status, "PAID");
  assert.equal(deriveBadge(db, supplier).status, "NOT_VERIFIED", "paying alone shows no badge");
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "VERIFIED" }), (e) => e.code === "CHECK_PENDING");
  const [queued] = listVerificationQueue(db);
  assert.deepEqual([queued.supplierName, queued.planCode, queued.paidInr], ["Awadh Express Cabs", "VERIFIED", 1178.82]);

  const now = new Date("2026-10-01T00:00:00Z");
  const granted = grantSupplierVerification(db, "sup_awadh", { checks: CHECKS, actorId: "admin", now });
  assert.deepEqual([granted.id, granted.status, granted.source, granted.valid_until], [queued.verificationId, "ACTIVE", "PURCHASE", "2027-10-01T00:00:00.000Z"]);
  assert.equal(listVerificationQueue(db).length, 0);

  // A renewal bought and passed before the badge ends adds a year to its end.
  await buy(db, "VERIFIED");
  const renewed = grantSupplierVerification(db, "sup_awadh", { checks: CHECKS, now: new Date("2027-09-01T00:00:00Z") });
  assert.equal(renewed.valid_until, "2028-09-30T00:00:00.000Z");
});

test("a rejected paid check is refunded; for Verified Plus only the check part, and the Spotlight stays", async () => {
  const { db } = database();
  await buy(db, "VERIFIED");
  const refunds = [];
  const rejected = await rejectPurchasedVerification(db, listVerificationQueue(db)[0].verificationId, {
    reason: "Bank account is not in the business name", gateway: gateway({ refund: async (args) => { refunds.push(args); return { refundId: args.refundId }; } }),
  });
  assert.deepEqual([rejected.status, rejected.refundStatus, rejected.refundAmountInr], ["REJECTED", "PROCESSED", 1178.82]);
  assert.equal(refunds[0].amount, 1178.82);
  await assert.rejects(rejectPurchasedVerification(db, rejected.verificationId, { reason: "Again please" }), (e) => e.code === "ALREADY_DECIDED");

  const plus = await buy(db, "VERIFIED_PLUS", { productId: "prd_cab" });
  assert.equal(plus.total_inr, 4128.82);
  assert.equal(plus.check_refundable_inr, 590, "₹500 of ₹3,499 is the check: 500/3499 of ₹4,128.82");
  const failing = await rejectPurchasedVerification(db, listVerificationQueue(db)[0].verificationId, {
    reason: "Owner did not take the call", gateway: gateway({ refund: async () => { throw new Error("gateway down"); } }),
  });
  assert.equal(failing.refundStatus, "FAILED");
  assert.equal((await retryCheckRefund(db, plus.id, { gateway: gateway() })).refundStatus, "PROCESSED");
  const view = publicSupplierView(db, db.prepare("SELECT * FROM suppliers WHERE id = 'sup_awadh'").get());
  assert.deepEqual(view.spotlights.map((s) => s.title), ["Lucknow airport cab"], "the Spotlight part is kept");
});

test("a Spotlight shows one bookable listing on the profile and can be swapped once a year", async () => {
  const { db } = database();
  const supplierRow = () => db.prepare("SELECT * FROM suppliers WHERE id = 'sup_awadh'").get();
  assert.deepEqual(publicSupplierView(db, supplierRow()).spotlights, [], "no products on a profile without a Spotlight");
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "SPOTLIGHT" }), (e) => e.code === "PRODUCT_REQUIRED");
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "SPOTLIGHT", productId: "prd_theirs" }), (e) => e.code === "PRODUCT_NOT_FOUND");
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "SPOTLIGHT", productId: "prd_draft" }), (e) => e.code === "PRODUCT_NOT_PUBLISHED");

  const start = new Date("2026-10-01T00:00:00Z");
  const paid = await buy(db, "SPOTLIGHT", { productId: "prd_cab", now: start });
  assert.equal(paid.total_inr, 3538.82);
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "SPOTLIGHT", productId: "prd_cab" }), (e) => e.code === "ALREADY_SPOTLIGHTED");
  const [shown] = publicSupplierView(db, supplierRow()).spotlights;
  assert.deepEqual([shown.title, shown.priceInr, shown.path], ["Lucknow airport cab", 1200, "/activity/Lucknow-airport-cab/prd_cab"]);

  const spotlightId = db.prepare("SELECT id FROM product_spotlights").get().id;
  const swapped = swapSpotlight(db, "sup_awadh", spotlightId, { productId: "prd_tour", now: new Date("2026-11-01T00:00:00Z") });
  assert.equal(swapped.title, "Ayodhya day tour");
  assert.throws(() => swapSpotlight(db, "sup_awadh", spotlightId, { productId: "prd_cab", now: new Date("2027-06-01T00:00:00Z") }), (e) => e.code === "SWAP_LIMIT");
  assert.equal(swapSpotlight(db, "sup_awadh", spotlightId, { productId: "prd_cab", now: new Date("2027-11-02T00:00:00Z") }).title, "Lucknow airport cab");

  // A listing that stops being bookable drops off the profile without ending the Spotlight.
  db.prepare("UPDATE products SET status = 'DRAFT' WHERE id = 'prd_cab'").run();
  assert.deepEqual(publicSupplierView(db, supplierRow()).spotlights, []);
});

test("profile plan coupons are their own kind, and Verified badges get renewal reminders", async () => {
  const { db } = database();
  createCoupon(db, { code: "FOUNDING499", audience: "SUPPLIER_PLANS", discountType: "FIXED", discountValue: 500 });
  createCoupon(db, { code: "SUBSONLY", audience: "SUPPLIER_SUBSCRIPTION", discountType: "FIXED", discountValue: 500 });
  const founding = quotePlanPayment(db, "sup_awadh", { planCode: "VERIFIED", couponCode: "FOUNDING499" });
  assert.deepEqual([founding.taxableInr, founding.totalInr], [499, 588.82]);
  assert.throws(() => quotePlanPayment(db, "sup_awadh", { planCode: "VERIFIED", couponCode: "SUBSONLY" }), (e) => e.code === "WRONG_AUDIENCE");

  grantSupplierVerification(db, "sup_awadh", { checks: CHECKS, now: new Date("2026-01-01T00:00:00Z") });
  const at = (iso) => collectVerificationReminders(db, { now: new Date(iso) }).length;
  assert.equal(at("2026-11-01T00:00:00Z"), 0);
  assert.equal(at("2026-12-03T00:00:00Z"), 1, "30 days before");
  assert.equal(at("2026-12-04T00:00:00Z"), 0, "once");
  assert.equal(at("2026-12-26T00:00:00Z"), 1, "7 days before");
});
