import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  calculateRefundQuote,
  createRefundRecord,
  createSettlementBatch,
  failRefund,
  finalizeRefund,
  getReconciliationReport,
  processSettlementBatch,
  reconcileSettlementBatch,
  resolveCommissionRate,
} from "../src/services/financeService.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, kyb_status TEXT, payout_bank_details TEXT, commission_rate REAL, commission_override_rate REAL);
    CREATE TABLE category_commissions (category_code TEXT PRIMARY KEY, default_commission_rate REAL);
    CREATE TABLE products (id TEXT PRIMARY KEY, cancellation_policy TEXT);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, product_id TEXT, supplier_id TEXT, activity_date TEXT, pickup_time TEXT,
      amount_inr REAL, commission_amount REAL, commission_rate_snapshot REAL, payment_status TEXT,
      status TEXT, refunded_amount REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, supplier_id TEXT, booking_id TEXT, gross_amount REAL, commission_amount REAL,
      net_payout REAL, payout_status TEXT, processed_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      transfer_id TEXT, settlement_batch_id TEXT, provider TEXT, provider_status TEXT, failure_reason TEXT,
      reconciled_at TEXT, reconciliation_note TEXT, idempotency_key TEXT
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, booking_id TEXT, booking_ref TEXT, refund_amount REAL, refund_percentage INTEGER,
      policy_tier TEXT, gateway_refund_id TEXT, status TEXT, reason TEXT, processed_at TEXT,
      currency TEXT, requested_by TEXT, requested_at TEXT, provider_status TEXT, error_message TEXT,
      reconciled_at TEXT, idempotency_key TEXT
    );
    CREATE TABLE payout_batches (
      id TEXT PRIMARY KEY, batch_ref TEXT UNIQUE, supplier_id TEXT, gross_amount REAL, commission_amount REAL,
      net_amount REAL, payout_count INTEGER, status TEXT, provider TEXT, provider_batch_id TEXT, notes TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')), processed_at TEXT, reconciled_at TEXT
    );
    CREATE TABLE payout_batch_items (id TEXT PRIMARY KEY, batch_id TEXT, payout_id TEXT UNIQUE, booking_id TEXT, amount REAL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE financial_ledger (
      id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, payout_id TEXT, refund_id TEXT,
      event_type TEXT, amount REAL, currency TEXT, status TEXT, external_reference TEXT,
      idempotency_key TEXT UNIQUE, metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO suppliers VALUES ('supplier-1', 'Goa Cabs', 'APPROVED', ?, 18, NULL)").run(JSON.stringify({ account_number: "123456", ifsc: "HDFC0001234" }));
  db.prepare("INSERT INTO category_commissions VALUES ('TRANSFER', 15)").run();
  db.prepare("INSERT INTO products VALUES ('product-1', 'MODERATE_48H')").run();
  db.prepare("INSERT INTO bookings (id, ref, product_id, supplier_id, activity_date, pickup_time, amount_inr, commission_amount, commission_rate_snapshot, payment_status, status) VALUES ('booking-1', 'IH-FIN-1', 'product-1', 'supplier-1', '2026-09-10', '10:00', 1000, 200, 20, 'PAID', 'confirmed')").run();
  db.prepare("INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status) VALUES ('payout-1', 'supplier-1', 'booking-1', 1000, 200, 800, 'PAYMENT_HELD')").run();
  return db;
}

test("supplier commission override takes priority over the category default", () => {
  const db = database();
  assert.equal(resolveCommissionRate(db, "supplier-1", "TRANSFER"), 15);
  db.prepare("UPDATE suppliers SET commission_override_rate = 12 WHERE id = 'supplier-1'").run();
  assert.equal(resolveCommissionRate(db, "supplier-1", "TRANSFER"), 12);
  db.close();
});

test("uses the product cancellation policy instead of a global refund rule", () => {
  const db = database();
  const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  
  // Set created_at to 3 days ago so grace period does not trigger
  booking.created_at = "2026-09-01T10:00:00";

  // MODERATE_48H test
  assert.equal(calculateRefundQuote(db, booking, { now: new Date("2026-09-08T08:00:00") }).refundPercentage, 100);
  assert.equal(calculateRefundQuote(db, booking, { now: new Date("2026-09-09T04:00:00") }).refundPercentage, 50);
  assert.equal(calculateRefundQuote(db, booking, { now: new Date("2026-09-09T12:00:00") }).refundPercentage, 0);

  // FLEXIBLE_24H test
  const flexBooking = { ...booking, cancellation_policy: "FLEXIBLE_24H" };
  assert.equal(calculateRefundQuote(db, flexBooking, { now: new Date("2026-09-09T08:00:00") }).refundPercentage, 100);
  assert.equal(calculateRefundQuote(db, flexBooking, { now: new Date("2026-09-09T12:00:00") }).refundPercentage, 0);

  // STRICT_7D test
  const strictBooking = { ...booking, cancellation_policy: "STRICT_7D" };
  assert.equal(calculateRefundQuote(db, strictBooking, { now: new Date("2026-09-02T10:00:00") }).refundPercentage, 100);
  assert.equal(calculateRefundQuote(db, strictBooking, { now: new Date("2026-09-05T10:00:00") }).refundPercentage, 50);
  assert.equal(calculateRefundQuote(db, strictBooking, { now: new Date("2026-09-09T10:00:00") }).refundPercentage, 0);

  // Booking Grace Window test (booked 2 hours ago, trip in 20 hours)
  const recentBooking = {
    ...booking,
    cancellation_policy: "FLEXIBLE_24H",
    created_at: "2026-09-09T12:00:00",
  };
  assert.equal(
    calculateRefundQuote(db, recentBooking, { now: new Date("2026-09-09T14:00:00") }).refundPercentage,
    100
  );

  db.close();
});

test("partial refund preserves only the retained commission and supplier share", () => {
  const db = database();
  const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  const quote = calculateRefundQuote(db, booking, { overridePercentage: 50 });
  const refund = createRefundRecord(db, { booking, quote, reason: "Admin approved", actorId: "admin-1" });
  const allocation = finalizeRefund(db, { booking, refund, providerResult: { refundId: "rfnd_123", status: "PROCESSED" } });
  assert.deepEqual(allocation, { refundAmount: 500, retainedAmount: 500, retainedCommission: 100, retainedSupplierShare: 400, paymentStatus: "PARTIALLY_REFUNDED" });
  assert.deepEqual(db.prepare("SELECT gross_amount, commission_amount, net_payout, payout_status FROM payouts").get(), { gross_amount: 500, commission_amount: 100, net_payout: 400, payout_status: "SCHEDULED" });
  assert.equal(getReconciliationReport(db).rows[0].balanced, true);
  db.close();
});

test("failed refunds can be retried with the same idempotency record", () => {
  const db = database();
  const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  const quote = calculateRefundQuote(db, booking, { overridePercentage: 100 });
  const first = createRefundRecord(db, { booking, quote, reason: "First attempt", actorId: "admin-1" });
  failRefund(db, first.id, "Provider timeout");
  const retry = createRefundRecord(db, { booking, quote, reason: "Retry", actorId: "admin-1" });
  assert.equal(retry.id, first.id);
  assert.equal(retry.status, "PENDING");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM refunds").get().count, 1);
  db.close();
});

test("settlement batches require a provider reference and support reconciliation", () => {
  const db = database();
  db.prepare("UPDATE payouts SET payout_status = 'SCHEDULED'").run();
  const batch = createSettlementBatch(db, { supplierId: "supplier-1", payoutIds: ["payout-1"], actorId: "admin-1" });
  assert.equal(batch.status, "READY");
  assert.equal(batch.net_amount, 800);
  assert.throws(() => processSettlementBatch(db, { batchId: batch.id }), /reference/i);
  const processed = processSettlementBatch(db, { batchId: batch.id, provider: "BANK", providerReference: "UTR123", actorId: "admin-1" });
  assert.equal(processed.batch.status, "PROCESSED");
  assert.equal(db.prepare("SELECT transfer_id FROM payouts").get().transfer_id, "UTR123");
  const reconciled = reconcileSettlementBatch(db, { batchId: batch.id, note: "Matched bank statement" });
  assert.equal(reconciled.status, "RECONCILED");
  db.close();
});
