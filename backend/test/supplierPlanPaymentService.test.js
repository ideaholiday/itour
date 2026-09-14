import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { updateSettings } from "../src/services/programSettingsService.js";
import { isSupplierSubscriptionCovered } from "../src/services/supplierKybGate.js";
import { createCoupon } from "../src/services/couponService.js";
import {
  confirmSubscriptionPayment,
  listSubscriptionPayments,
  quoteSubscriptionPayment,
  renderSubscriptionInvoice,
  startSubscriptionPayment,
  verifySubscriptionPayment,
} from "../src/services/supplierPlanPaymentService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, contact_name TEXT, email TEXT, phone TEXT, city TEXT, state TEXT, gstin TEXT, kyb_status TEXT, created_at TEXT);
    CREATE TABLE promo_codes (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, description TEXT, discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
      discount_value REAL NOT NULL, min_order_inr REAL DEFAULT 0.0, max_discount_inr REAL, usage_limit INTEGER DEFAULT 1000,
      times_used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE affiliates (id TEXT PRIMARY KEY, affiliate_code TEXT, status TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, user_id TEXT, payment_status TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, status TEXT);
    CREATE TABLE supplier_verifications (
      id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING_CHECKS', checks TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'ADMIN', purchase_id TEXT, valid_from TEXT, valid_until TEXT, decided_by TEXT, decision_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO suppliers VALUES
      ('sup_new', 'Kayak Co', 'Farah', 'farah@example.test', '+919800000011', 'Panaji', 'Goa', '30ABCDE1234F1Z5', 'APPROVED', '2026-10-01 10:00:00'),
      ('sup_old', 'Old Cabs', 'Ravi', 'ravi@example.test', '+919800000012', 'Pune', 'Maharashtra', NULL, 'APPROVED', '2026-01-01 10:00:00');
  `);
  for (const name of ["037_program_settings.sql", "039_supplier_subscriptions.sql", "040_coupon_engine.sql", "043_supplier_plan_payments.sql", "045_supplier_profile_plans.sql"]) executeMigrationSql(db, upSql(name));
  return db;
}

const gateway = (overrides = {}) => ({
  createOrder: async ({ orderId, amount }) => ({ orderId, paymentSessionId: `session_${orderId}`, environment: "TEST", amount }),
  getPayments: async () => [],
  getOrder: async () => ({ order_status: "ACTIVE" }),
  ...overrides,
});

test("nothing is for sale until an admin sets a price; exempt suppliers need nothing", () => {
  const db = database();
  assert.throws(() => quoteSubscriptionPayment(db, "sup_new"), (e) => e.code === "NOT_FOR_SALE");
  updateSettings(db, "supplier_subscriptions", { priceInr: 999 }, { reason: "Owner set the price" });
  assert.throws(() => quoteSubscriptionPayment(db, "sup_old"), (e) => e.code === "NOT_REQUIRED");

  const quote = quoteSubscriptionPayment(db, "sup_new");
  assert.deepEqual([quote.baseInr, quote.taxableInr, quote.gstInr, quote.totalInr, quote.periodMonths, quote.sacCode], [999, 999, 179.82, 1178.82, 12, "998559"]);
});

test("a paid subscription activates only on a confirmed payment of the priced amount", async () => {
  const db = database();
  updateSettings(db, "supplier_subscriptions", { priceInr: 1000, billingPeriodMonths: 12 }, { reason: "Set price" });
  const now = new Date("2026-10-02T10:00:00Z");
  const started = await startSubscriptionPayment(db, "sup_new", { gateway: gateway(), now });
  assert.equal(started.quote.totalInr, 1180);
  assert.match(started.checkout.orderId, /^subs_/);
  assert.equal(started.payment.status, "PENDING");
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), false);

  await assert.rejects(verifySubscriptionPayment(db, "sup_new", started.payment.id, { gateway: gateway(), now }), (e) => e.code === "NOT_PAID");
  assert.throws(() => confirmSubscriptionPayment(db, { orderId: started.checkout.orderId, amount: 1000, now }), (e) => e.code === "AMOUNT_MISMATCH");

  const paid = await verifySubscriptionPayment(db, "sup_new", started.payment.id, {
    gateway: gateway({ getPayments: async () => [{ payment_status: "SUCCESS", cf_payment_id: 555, payment_amount: 1180, payment_currency: "INR" }] }),
    now,
  });
  assert.deepEqual([paid.status, paid.cashfree_payment_id, paid.invoice_number], ["PAID", "555", "IHS/2026-27/00001"]);
  const subscription = db.prepare("SELECT * FROM supplier_subscriptions WHERE id = ?").get(paid.subscription_id);
  assert.deepEqual([subscription.status, subscription.source, subscription.starts_at, subscription.ends_at], ["ACTIVE", "PURCHASE", "2026-10-02 10:00:00", "2027-10-02 10:00:00"]);

  // A repeated webhook changes nothing.
  assert.equal(confirmSubscriptionPayment(db, { orderId: started.checkout.orderId, amount: 1180, now }).invoice_number, "IHS/2026-27/00001");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM supplier_subscriptions").get().n, 1);

  // Renewing before it ends starts the next year when this one ends.
  const renewal = await startSubscriptionPayment(db, "sup_new", { gateway: gateway(), now });
  const renewed = confirmSubscriptionPayment(db, { orderId: renewal.checkout.orderId, amount: 1180, now });
  assert.equal(db.prepare("SELECT starts_at FROM supplier_subscriptions WHERE id = ?").get(renewed.subscription_id).starts_at, "2027-10-02 10:00:00");
  assert.equal(renewed.invoice_number, "IHS/2026-27/00002");
});

test("supplier coupons discount the price before GST; a 100% coupon activates with no payment", async () => {
  const db = database();
  updateSettings(db, "supplier_subscriptions", { priceInr: 2000 }, { reason: "Set price" });
  createCoupon(db, { code: "HALFOFF", discountType: "PERCENTAGE", discountValue: 50 });
  db.prepare("UPDATE promo_codes SET audience = 'SUPPLIER_SUBSCRIPTION' WHERE code = 'HALFOFF'").run();
  createCoupon(db, { code: "FOUNDER", discountType: "PERCENTAGE", discountValue: 100, perUserLimit: 1 });
  db.prepare("UPDATE promo_codes SET audience = 'SUPPLIER_SUBSCRIPTION' WHERE code = 'FOUNDER'").run();
  createCoupon(db, { code: "TRAVEL10", discountType: "PERCENTAGE", discountValue: 10 });

  const half = quoteSubscriptionPayment(db, "sup_new", { couponCode: "halfoff" });
  assert.deepEqual([half.discountInr, half.taxableInr, half.gstInr, half.totalInr], [1000, 1000, 180, 1180]);
  assert.throws(() => quoteSubscriptionPayment(db, "sup_new", { couponCode: "TRAVEL10" }), (e) => e.code === "WRONG_AUDIENCE");

  const free = await startSubscriptionPayment(db, "sup_new", { couponCode: "FOUNDER", gateway: gateway({ createOrder: async () => { throw new Error("must not be called"); } }) });
  assert.equal(free.checkout, null);
  assert.equal(free.payment.status, "FREE");
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), true);
  assert.equal(db.prepare("SELECT source FROM supplier_subscriptions WHERE id = ?").get(free.payment.subscription_id).source, "COUPON");
  assert.throws(() => quoteSubscriptionPayment(db, "sup_new", { couponCode: "FOUNDER" }), (e) => e.code === "PER_USER_LIMIT", "once per supplier");
  assert.equal(listSubscriptionPayments(db, "sup_new")[0].invoiceNumber, "IHS/2026-27/00001");
});

test("a gateway failure fails the attempt without activating anything", async () => {
  const db = database();
  updateSettings(db, "supplier_subscriptions", { priceInr: 500 }, { reason: "Set price" });
  await assert.rejects(startSubscriptionPayment(db, "sup_new", { gateway: gateway({ createOrder: async () => { throw new Error("Cashfree credentials are not configured"); } }) }), (e) => e.status === 502);
  assert.deepEqual(listSubscriptionPayments(db, "sup_new").map((p) => p.status), ["FAILED"]);
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), false);
});

test("the invoice splits GST by place of supply when the business state is known", async () => {
  const db = database();
  updateSettings(db, "supplier_subscriptions", { priceInr: 1000 }, { reason: "Set price" });
  const started = await startSubscriptionPayment(db, "sup_new", { gateway: gateway(), now: new Date("2026-10-02T10:00:00Z") });
  confirmSubscriptionPayment(db, { orderId: started.checkout.orderId, amount: 1180, now: new Date("2026-10-02T10:00:00Z") });
  assert.throws(() => renderSubscriptionInvoice(db, "sup_old", started.payment.id), (e) => e.status === 404, "another supplier's invoice");

  const previous = process.env.BUSINESS_STATE;
  try {
    delete process.env.BUSINESS_STATE;
    assert.match(renderSubscriptionInvoice(db, "sup_new", started.payment.id), /GST @ 18%.*₹180\.00/s);
    process.env.BUSINESS_STATE = "Goa";
    const intra = renderSubscriptionInvoice(db, "sup_new", started.payment.id);
    assert.match(intra, /CGST @ 9%.*₹90\.00.*SGST @ 9%.*₹90\.00/s);
    assert.match(intra, /SAC 998559/);
    assert.match(intra, /30ABCDE1234F1Z5/);
    process.env.BUSINESS_STATE = "Karnataka";
    assert.match(renderSubscriptionInvoice(db, "sup_new", started.payment.id), /IGST @ 18%/);
  } finally {
    if (previous === undefined) delete process.env.BUSINESS_STATE;
    else process.env.BUSINESS_STATE = previous;
  }
});
