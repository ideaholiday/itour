import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { pendingRefundQuote, refundCancelledBooking } from "../src/services/bookingRefundService.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, amount_inr REAL, commission_amount REAL,
      commission_rate_snapshot REAL, payment_method TEXT, payment_status TEXT, status TEXT,
      cashfree_order_id TEXT, razorpay_payment_id TEXT, refund_amount_inr REAL DEFAULT 0, refunded_amount REAL DEFAULT 0
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, booking_id TEXT, gross_amount REAL, commission_amount REAL, net_payout REAL,
      payout_status TEXT, settlement_batch_id TEXT
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, booking_id TEXT, booking_ref TEXT, refund_amount REAL, refund_percentage INTEGER,
      policy_tier TEXT, gateway_refund_id TEXT, status TEXT, reason TEXT, processed_at TEXT,
      currency TEXT, requested_by TEXT, requested_at TEXT, provider_status TEXT, error_message TEXT,
      reconciled_at TEXT, idempotency_key TEXT
    );
    CREATE TABLE financial_ledger (
      id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, payout_id TEXT, refund_id TEXT,
      event_type TEXT, amount REAL, currency TEXT, status TEXT, external_reference TEXT,
      idempotency_key TEXT UNIQUE, metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // The state a self-service cancellation of a Cashfree booking leaves behind.
  db.prepare(`INSERT INTO bookings (id, ref, supplier_id, amount_inr, commission_amount, commission_rate_snapshot, payment_method,
    payment_status, status, cashfree_order_id, refund_amount_inr) VALUES
    ('bk-1', 'IH-TEST1', 'sup-1', 1000, 180, 18, 'CASHFREE', 'REFUND_INITIATED', 'cancelled', 'ih_IHTEST1_1', 1000)`).run();
  db.prepare("INSERT INTO payouts VALUES ('pay-1', 'bk-1', 1000, 180, 820, 'CANCELLED', NULL)").run();
  return db;
}

function fakeCashfree(outcomes) {
  const calls = [];
  return {
    calls,
    cashfree: async (request) => {
      calls.push(request);
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return { refundId: request.refundId, cfRefundId: "cf-1", amount: request.amount, status: "PENDING" };
    },
  };
}

test("a self-cancelled Cashfree booking is refunded through Cashfree for the amount it owes", async () => {
  const db = database();
  const gateway = fakeCashfree(["ok"]);

  const result = await refundCancelledBooking(db, "bk-1", { reason: "plan changed", actorId: "user-1" }, gateway);

  assert.equal(gateway.calls.length, 1);
  assert.equal(gateway.calls[0].orderId, "ih_IHTEST1_1");
  assert.equal(gateway.calls[0].amount, 1000);
  assert.equal(result.status, "PROCESSED");
  assert.equal(result.paymentStatus, "REFUNDED");
  const booking = db.prepare("SELECT payment_status, refunded_amount FROM bookings WHERE id = 'bk-1'").get();
  assert.deepEqual({ ...booking }, { payment_status: "REFUNDED", refunded_amount: 1000 });
  const refund = db.prepare("SELECT * FROM refunds WHERE booking_id = 'bk-1'").get();
  assert.equal(refund.status, "PROCESSED");
  assert.equal(refund.id, gateway.calls[0].refundId, "the refund row id is the Cashfree idempotency key");
});

test("a gateway failure keeps the refund owed, and a retry reuses the same Cashfree refund id", async () => {
  const db = database();
  const gateway = fakeCashfree([new Error("Cashfree request failed with status 500"), "ok"]);

  const failed = await refundCancelledBooking(db, "bk-1", { reason: "plan changed" }, gateway);
  assert.equal(failed.status, "FAILED");
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id = 'bk-1'").get().payment_status, "REFUND_INITIATED");
  assert.equal(db.prepare("SELECT status FROM refunds WHERE booking_id = 'bk-1'").get().status, "FAILED");

  const retried = await refundCancelledBooking(db, "bk-1", { reason: "plan changed" }, gateway);
  assert.equal(retried.status, "PROCESSED");
  assert.equal(gateway.calls[1].refundId, gateway.calls[0].refundId);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM refunds").get().count, 1);
});

test("nothing is sent when the cancellation owes no refund", async () => {
  const db = database();
  db.prepare("UPDATE bookings SET payment_status = 'REFUND_NOT_APPLICABLE', refund_amount_inr = 0").run();
  const gateway = fakeCashfree([]);
  assert.equal(await refundCancelledBooking(db, "bk-1", { reason: "late" }, gateway), null);
  assert.equal(gateway.calls.length, 0);
});

test("a partial refund keeps its recorded amount and percentage", () => {
  const quote = pendingRefundQuote({ id: "bk-2", ref: "IH-2", amount_inr: 3000, refund_amount_inr: 1500 });
  assert.equal(quote.refundAmount, 1500);
  assert.equal(quote.refundPercentage, 50);
  assert.equal(quote.cancellationFee, 1500);
});
