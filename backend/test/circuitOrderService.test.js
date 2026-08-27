import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  CIRCUIT_ORDER_HOLD_VALIDITY_MS,
  consumeCircuitQuote,
  expireCircuitOrderHolds,
  getCircuitOrder,
} from "../src/services/circuitOrderService.js";
import { evaluateSupplierAvailability } from "../src/services/availabilityService.js";
import {
  claimCircuitPaymentOrder,
  confirmCircuitOrderPayment,
  failCircuitOrderPayment,
  saveCircuitPaymentOrder,
} from "../src/services/circuitPaymentService.js";
import {
  createCircuitManagementRequest,
  previewCircuitCancellation,
  reviewCircuitManagementRequest,
} from "../src/services/circuitManagementService.js";
import {
  processExpiredCircuitReconfirmations,
  reconcileCircuitRefund,
  respondToCircuitReconfirmation,
} from "../src/services/circuitOrchestrationService.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");

function testDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT);
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, supplier_code TEXT, company_name TEXT, kyb_status TEXT,
      commission_rate REAL, commission_override_rate REAL
    );
    CREATE TABLE category_commissions (category_code TEXT, default_commission_rate REAL);
    CREATE TABLE products (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_code TEXT, title TEXT, product_type TEXT,
      city TEXT, destination_name TEXT, status TEXT, is_published INTEGER,
      cancellation_policy TEXT DEFAULT 'FLEXIBLE_24H'
    );
    CREATE TABLE blocked_dates (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, scope_type TEXT,
      vehicle_id TEXT, vehicle_category TEXT, availability_type TEXT, start_date TEXT,
      end_date TEXT, start_time TEXT, end_time TEXT, capacity_limit INTEGER,
      is_active INTEGER, reason TEXT, created_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, client_request_id TEXT UNIQUE, circuit_order_id TEXT,
      circuit_order_item_id TEXT, user_id TEXT, product_id TEXT, supplier_id TEXT,
      product_code TEXT, supplier_code TEXT, product_type TEXT, variant_name TEXT,
      activity_date TEXT, pickup_time TEXT, pickup_type TEXT, pickup_location TEXT,
      adults INTEGER, children INTEGER, luggage_bags INTEGER, vehicle_category TEXT,
      traveler_name TEXT, traveler_phone TEXT, traveler_email TEXT, amount_inr REAL,
      tolls_and_tax_amount REAL, commission_amount REAL, commission_rate_snapshot REAL,
      supplier_payout_amount REAL, payment_method TEXT, payment_status TEXT, status TEXT,
      supplier_assignment_status TEXT, supplier_assignment_method TEXT,
      supplier_assignment_score REAL, supplier_assignment_reason TEXT,
      assigned_supplier_product_id TEXT, supplier_assigned_at TEXT,
      supplier_response_status TEXT DEFAULT 'NOT_STARTED', supplier_response_deadline TEXT,
      supplier_responded_at TEXT, supplier_response_note TEXT, assignment_round INTEGER DEFAULT 1,
      razorpay_order_id TEXT, razorpay_payment_id TEXT, razorpay_signature TEXT,
      cashfree_order_id TEXT, cashfree_payment_id TEXT, payment_session_id TEXT,
      otp_code TEXT, otp_hash TEXT, otp_encrypted TEXT, otp_expires_at TEXT,
      otp_attempts INTEGER DEFAULT 0, otp_verified_at TEXT,
      original_activity_date TEXT, rescheduled_at TEXT, refund_amount_inr REAL DEFAULT 0,
      cancellation_fee_inr REAL DEFAULT 0, cancellation_reason TEXT, refunded_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, supplier_id TEXT, booking_id TEXT, gross_amount REAL,
      commission_amount REAL, net_payout REAL, payout_status TEXT, settlement_batch_id TEXT
    );
    CREATE TABLE circuit_quotes (
      id TEXT PRIMARY KEY, itinerary_id TEXT, user_id TEXT, status TEXT, currency TEXT,
      adults_count INTEGER, children_count INTEGER, base_amount REAL, taxes_amount REAL,
      total_amount REAL, line_items TEXT, issues TEXT, expires_at TEXT, consumed_at TEXT,
      circuit_order_id TEXT
    );
    CREATE TABLE circuit_orders (
      id TEXT PRIMARY KEY, order_ref TEXT UNIQUE, quote_id TEXT UNIQUE, itinerary_id TEXT,
      user_id TEXT, idempotency_key TEXT, status TEXT, currency TEXT, adults_count INTEGER,
      children_count INTEGER, traveler_name TEXT, traveler_email TEXT, traveler_phone TEXT,
      base_amount REAL, taxes_amount REAL, total_amount REAL, payment_reference TEXT,
      payment_provider TEXT, payment_order_id TEXT UNIQUE, payment_session_id TEXT,
      payment_id TEXT, payment_signature TEXT, payment_status TEXT DEFAULT 'PENDING',
      payment_order_status TEXT DEFAULT 'NOT_STARTED', payment_verified_at TEXT,
      payment_failed_at TEXT, payment_failure_code TEXT,
      management_status TEXT DEFAULT 'NONE', refunded_amount REAL DEFAULT 0,
      cancellation_fee_amount REAL DEFAULT 0, cancelled_at TEXT, refunded_at TEXT, rescheduled_at TEXT,
      reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED', reconfirmation_deadline TEXT, reconfirmed_at TEXT,
      refund_reconciliation_status TEXT DEFAULT 'NOT_REQUIRED', refund_reconciled_at TEXT,
      hold_expires_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, idempotency_key)
    );
    CREATE TABLE circuit_order_items (
      id TEXT PRIMARY KEY, circuit_order_id TEXT, quote_line_item_id TEXT, booking_id TEXT UNIQUE,
      sequence_number INTEGER, product_id TEXT, supplier_id TEXT, activity_date TEXT,
      pickup_time TEXT, vehicle_category TEXT, variant_name TEXT, status TEXT DEFAULT 'HELD_PENDING_PAYMENT',
      reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED', reconfirmation_deadline TEXT, reconfirmed_at TEXT,
      base_amount REAL, taxes_amount REAL, total_amount REAL, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(circuit_order_id, quote_line_item_id)
    );
    CREATE TABLE inventory_holds (
      id TEXT PRIMARY KEY, circuit_order_id TEXT, circuit_order_item_id TEXT, booking_id TEXT UNIQUE,
      user_id TEXT, product_id TEXT, supplier_id TEXT, activity_date TEXT, pickup_time TEXT,
      vehicle_category TEXT, units INTEGER, status TEXT DEFAULT 'ACTIVE', expires_at TEXT,
      released_at TEXT, consumed_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE supplier_assignment_attempts (
      id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, candidate_product_id TEXT,
      coverage_zone_id TEXT, decision TEXT, score REAL, candidate_price REAL,
      vehicle_category TEXT, assignment_round INTEGER DEFAULT 1,
      response_status TEXT DEFAULT 'NOT_STARTED', response_at TEXT, response_note TEXT,
      rejection_reasons TEXT DEFAULT '[]', score_breakdown TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE financial_ledger (
      id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, payout_id TEXT, refund_id TEXT,
      event_type TEXT, amount REAL, currency TEXT, status TEXT, external_reference TEXT,
      idempotency_key TEXT UNIQUE, metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE circuit_payment_events (
      id TEXT PRIMARY KEY, circuit_order_id TEXT, event_key TEXT UNIQUE, provider TEXT,
      event_type TEXT, provider_order_id TEXT, provider_payment_id TEXT, status TEXT,
      amount REAL, failure_code TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE circuit_management_requests (
      id TEXT PRIMARY KEY, request_ref TEXT UNIQUE, circuit_order_id TEXT, user_id TEXT,
      request_type TEXT, status TEXT DEFAULT 'PENDING', reason TEXT, idempotency_key TEXT,
      requested_changes TEXT DEFAULT '{}', policy_snapshot TEXT DEFAULT '{}', refund_amount REAL DEFAULT 0,
      cancellation_fee_amount REAL DEFAULT 0, gateway_refund_id TEXT, gateway_status TEXT,
      failure_code TEXT, resolution TEXT, reviewed_by TEXT, reviewed_at TEXT,
      orchestration_status TEXT DEFAULT 'NOT_STARTED', refund_expected_status TEXT, refund_reconciled_at TEXT,
      created_at TEXT, updated_at TEXT, UNIQUE(circuit_order_id, idempotency_key)
    );
    CREATE TABLE staff_tasks (
      id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, circuit_order_id TEXT,
      assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT, created_at TEXT
    );
    CREATE TABLE circuit_orchestration_events (
      id TEXT PRIMARY KEY, circuit_order_id TEXT, management_request_id TEXT, event_key TEXT UNIQUE,
      event_type TEXT, booking_id TEXT, supplier_id TEXT, status TEXT, provider TEXT,
      provider_reference TEXT, details TEXT DEFAULT '{}', created_at TEXT
    );
    CREATE TABLE booking_modifications (
      id TEXT PRIMARY KEY, booking_id TEXT, requested_by TEXT, modification_type TEXT,
      original_value TEXT, requested_value TEXT, price_difference_inr REAL DEFAULT 0,
      status TEXT, supplier_notes TEXT, created_at TEXT, resolved_at TEXT
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, booking_id TEXT, booking_ref TEXT, refund_amount REAL,
      refund_percentage INTEGER, policy_tier TEXT, gateway_refund_id TEXT, status TEXT,
      reason TEXT, requested_by TEXT, requested_at TEXT, processed_at TEXT, provider_status TEXT,
      error_message TEXT, currency TEXT, idempotency_key TEXT UNIQUE, reconciled_at TEXT
    );
  `);
  database.prepare("INSERT INTO users VALUES (?, ?, ?, ?)")
    .run("traveler_1", "Circuit Traveler", "circuit@example.test", "+919876543210");
  database.prepare("INSERT INTO suppliers VALUES (?, ?, ?, 'APPROVED', 18, NULL)")
    .run("supplier_1", "SUP-1", "Circuit Supplier");
  database.prepare("INSERT INTO category_commissions VALUES ('DAY_TOUR', 18)").run();
  database.prepare("INSERT INTO products VALUES (?, 'supplier_1', ?, ?, 'DAY_TOUR', 'Goa', 'Goa', 'PUBLISHED', 1, 'FLEXIBLE_24H')")
    .run("product_1", "PROD-1", "Heritage Walk");
  database.prepare("INSERT INTO products VALUES (?, 'supplier_1', ?, ?, 'DAY_TOUR', 'Goa', 'Goa', 'PUBLISHED', 1, 'FLEXIBLE_24H')")
    .run("product_2", "PROD-2", "Island Tour");
  return database;
}

function line(itemId, productId, totalAmount, day, pickup = "09:00") {
  const baseAmount = totalAmount / 1.05;
  return {
    itemId,
    productId,
    productTitle: productId === "product_1" ? "Heritage Walk" : "Island Tour",
    productType: "DAY_TOUR",
    supplierId: "supplier_1",
    activityDate: `2030-01-${String(day).padStart(2, "0")}`,
    pickupTime: pickup,
    location: "Panaji",
    vehicleCategory: "SHARED_SEAT",
    variantName: "Standard",
    adults: 2,
    children: 1,
    luggage: 1,
    breakdown: {
      baseAmount,
      fastagTolls: 0,
      stateTax: 0,
      gstAmount: totalAmount - baseAmount,
      totalAmount,
    },
  };
}

function insertQuote(database, {
  id = "quote_1",
  userId = "traveler_1",
  status = "READY",
  expiresAt = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
  lines = [line("item_1", "product_1", 1050, 10), line("item_2", "product_2", 2100, 11, "14:00")],
} = {}) {
  const baseAmount = lines.reduce((sum, item) => sum + item.breakdown.baseAmount, 0);
  const taxesAmount = lines.reduce((sum, item) => sum + item.breakdown.gstAmount, 0);
  const totalAmount = lines.reduce((sum, item) => sum + item.breakdown.totalAmount, 0);
  database.prepare(`
    INSERT INTO circuit_quotes (
      id, itinerary_id, user_id, status, currency, adults_count, children_count,
      base_amount, taxes_amount, total_amount, line_items, issues, expires_at
    ) VALUES (?, 'itinerary_1', ?, ?, 'INR', 2, 1, ?, ?, ?, ?, '[]', ?)
  `).run(id, userId, status, baseAmount, taxesAmount, totalAmount, JSON.stringify(lines), expiresAt);
}

test("atomically consumes a ready quote into a parent order, child bookings, payouts, and holds", () => {
  const database = testDatabase();
  insertQuote(database);

  const result = consumeCircuitQuote(database, {
    quoteId: "quote_1",
    userId: "traveler_1",
    idempotencyKey: "circuit-request-001",
  }, { now: NOW });

  assert.equal(result.idempotent, false);
  assert.equal(result.status, "PENDING_PAYMENT");
  assert.equal(result.breakdown.totalAmount, 3150);
  assert.equal(result.items.length, 2);
  assert.equal(result.holds.length, 2);
  assert.ok(result.items.every((item) => item.bookingStatus === "pending_payment"));
  assert.ok(result.holds.every((hold) => hold.status === "ACTIVE"));
  assert.equal(new Date(result.holdExpiresAt).getTime() - NOW.getTime(), CIRCUIT_ORDER_HOLD_VALIDITY_MS);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'PENDING_PAYMENT'").get().count, 2);
  assert.deepEqual(
    database.prepare("SELECT consumed_at, circuit_order_id FROM circuit_quotes WHERE id = 'quote_1'").get(),
    { consumed_at: NOW.toISOString(), circuit_order_id: result.orderId },
  );
  assert.equal(getCircuitOrder(database, result.orderRef, "traveler_1", { now: NOW }).orderId, result.orderId);
  assert.throws(
    () => getCircuitOrder(database, result.orderId, "another_traveler", { now: NOW }),
    (error) => error.status === 404 && error.code === "CIRCUIT_ORDER_NOT_FOUND",
  );
});

test("returns the original order for an idempotent retry and rejects key reuse", () => {
  const database = testDatabase();
  insertQuote(database);
  const input = { quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-request-002" };
  const first = consumeCircuitQuote(database, input, { now: NOW });
  const retry = consumeCircuitQuote(database, input, { now: NOW });

  assert.equal(retry.idempotent, true);
  assert.equal(retry.orderId, first.orderId);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_orders").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings").get().count, 2);

  insertQuote(database, { id: "quote_2" });
  assert.throws(
    () => consumeCircuitQuote(database, { ...input, quoteId: "quote_2" }, { now: NOW }),
    (error) => error.status === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.throws(
    () => consumeCircuitQuote(database, { ...input, idempotencyKey: "another-request-key" }, { now: NOW }),
    (error) => error.status === 409 && error.code === "QUOTE_ALREADY_CONSUMED",
  );
});

test("rolls back the entire circuit when a later line item has no inventory", () => {
  const database = testDatabase();
  insertQuote(database);
  database.prepare(`
    INSERT INTO blocked_dates (
      id, supplier_id, product_id, scope_type, availability_type, start_date, end_date,
      capacity_limit, is_active, reason, created_at
    ) VALUES ('block_2', 'supplier_1', 'product_2', 'PRODUCT', 'FULL_DAY', '2030-01-11',
      '2030-01-11', 0, 1, 'Island tour sold out', datetime('now'))
  `).run();

  assert.throws(
    () => consumeCircuitQuote(database, {
      quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-request-003",
    }, { now: NOW }),
    (error) => error.status === 409 && error.code === "INVENTORY_UNAVAILABLE",
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_orders").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_order_items").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM inventory_holds").get().count, 0);
  assert.equal(database.prepare("SELECT consumed_at FROM circuit_quotes WHERE id = 'quote_1'").get().consumed_at, null);
});

test("expires abandoned orders and releases their booking-backed capacity holds", () => {
  const database = testDatabase();
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-request-004",
  }, { now: NOW });
  database.prepare("UPDATE circuit_orders SET hold_expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(order.orderId);
  database.prepare("UPDATE inventory_holds SET expires_at = '2020-01-01T00:00:00.000Z' WHERE circuit_order_id = ?").run(order.orderId);
  database.prepare(`
    INSERT INTO blocked_dates (
      id, supplier_id, product_id, scope_type, availability_type, start_date, end_date,
      capacity_limit, is_active, reason, created_at
    ) VALUES ('capacity_1', 'supplier_1', 'product_1', 'PRODUCT', 'FULL_DAY', '2030-01-10',
      '2030-01-10', 1, 1, 'One booking maximum', datetime('now'))
  `).run();
  assert.equal(evaluateSupplierAvailability(database, {
    supplierId: "supplier_1", productId: "product_1", activityDate: "2030-01-10",
    pickupTime: "09:00", vehicleCategory: "SHARED_SEAT",
  }).available, true);
  const afterExpiry = new Date(NOW.getTime() + CIRCUIT_ORDER_HOLD_VALIDITY_MS + 1);
  const expired = expireCircuitOrderHolds(database, afterExpiry);

  assert.deepEqual(expired.expiredOrderIds, [order.orderId]);
  assert.equal(expired.releasedHolds, 2);
  const loaded = getCircuitOrder(database, order.orderId, "traveler_1", { now: afterExpiry });
  assert.equal(loaded.status, "EXPIRED");
  assert.ok(loaded.items.every((item) => item.bookingStatus === "cancelled" && item.paymentStatus === "EXPIRED"));
  assert.ok(loaded.holds.every((hold) => hold.status === "EXPIRED" && hold.releasedAt === afterExpiry.toISOString()));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'CANCELLED'").get().count, 2);
});

test("requires quote ownership, readiness, freshness, and complete traveler contact", () => {
  const database = testDatabase();
  insertQuote(database, { id: "partial", status: "PARTIAL" });
  insertQuote(database, { id: "expired", expiresAt: new Date(NOW.getTime() - 1).toISOString() });

  assert.throws(
    () => consumeCircuitQuote(database, { quoteId: "partial", userId: "traveler_1", idempotencyKey: "circuit-request-005" }, { now: NOW }),
    (error) => error.code === "QUOTE_NOT_READY",
  );
  assert.throws(
    () => consumeCircuitQuote(database, { quoteId: "expired", userId: "traveler_1", idempotencyKey: "circuit-request-006" }, { now: NOW }),
    (error) => error.status === 410 && error.code === "QUOTE_EXPIRED",
  );
  assert.throws(
    () => consumeCircuitQuote(database, { quoteId: "partial", userId: "another_user", idempotencyKey: "circuit-request-007" }, { now: NOW }),
    (error) => error.status === 404 && error.code === "CIRCUIT_QUOTE_NOT_FOUND",
  );
  database.prepare("UPDATE users SET phone = NULL WHERE id = 'traveler_1'").run();
  insertQuote(database, { id: "no_contact" });
  assert.throws(
    () => consumeCircuitQuote(database, { quoteId: "no_contact", userId: "traveler_1", idempotencyKey: "circuit-request-008" }, { now: NOW }),
    (error) => error.code === "TRAVELER_CONTACT_REQUIRED",
  );
});

test("confirms one grouped charge by atomically activating every circuit booking", () => {
  const database = testDatabase();
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-payment-001",
  }, { now: NOW });

  const claim = claimCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "CASHFREE", now: NOW,
  });
  assert.equal(claim.setupStatus, "CREATING");
  const setup = saveCircuitPaymentOrder(database, {
    orderId: order.orderId,
    userId: "traveler_1",
    provider: "CASHFREE",
    paymentOrderId: "cf_circuit_001",
    paymentSessionId: "session_circuit_001",
    now: NOW,
  });
  assert.equal(setup.setupStatus, "CREATED");
  assert.equal(claimCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "CASHFREE", now: NOW,
  }).idempotent, true);

  const result = confirmCircuitOrderPayment(database, {
    orderId: order.orderId,
    userId: "traveler_1",
    provider: "CASHFREE",
    paymentOrderId: "cf_circuit_001",
    paymentId: "cf_payment_001",
    signature: "cashfree_verified",
    amount: 3150,
    eventKey: "cashfree:event:001",
    now: NOW,
  });

  assert.equal(result.success, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.order.status, "CONFIRMED");
  assert.equal(result.order.payment.status, "PAID");
  assert.equal(result.bookings.length, 2);
  assert.ok(result.order.items.every((item) => item.status === "CONFIRMED" && item.bookingStatus === "confirmed" && item.paymentStatus === "PAID"));
  assert.ok(result.order.holds.every((hold) => hold.status === "CONSUMED" && hold.consumedAt === NOW.toISOString()));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE otp_hash IS NOT NULL AND otp_encrypted IS NOT NULL").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'PAYMENT_HELD'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM supplier_assignment_attempts WHERE decision = 'SELECTED' AND response_status = 'PENDING'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM financial_ledger WHERE event_type = 'PAYMENT_CAPTURED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_payment_events WHERE status = 'PAID'").get().count, 1);

  const replay = confirmCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "CASHFREE",
    paymentOrderId: "cf_circuit_001",
    paymentId: "cf_payment_001",
    amount: 3150,
    eventKey: "cashfree:event:001",
    now: NOW,
  });
  assert.equal(replay.idempotent, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM financial_ledger").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_payment_events").get().count, 1);
});

test("rolls back all child activation when any circuit booking cannot be confirmed", () => {
  const database = testDatabase();
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-payment-002",
  }, { now: NOW });
  claimCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "RAZORPAY", now: NOW,
  });
  saveCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "RAZORPAY",
    paymentOrderId: "rzp_circuit_002", now: NOW,
  });
  const secondBooking = database.prepare(`
    SELECT booking_id FROM circuit_order_items WHERE circuit_order_id = ? ORDER BY sequence_number DESC LIMIT 1
  `).get(order.orderId).booking_id;
  database.exec(`
    CREATE TRIGGER reject_second_circuit_booking BEFORE UPDATE OF payment_status ON bookings
    WHEN NEW.id = '${secondBooking}' AND NEW.payment_status = 'PAID'
    BEGIN SELECT RAISE(ABORT, 'simulated child activation failure'); END;
  `);

  assert.throws(() => confirmCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "RAZORPAY",
    paymentOrderId: "rzp_circuit_002",
    paymentId: "rzp_payment_002",
    signature: "verified",
    amount: 3150,
    eventKey: "razorpay:event:002",
    now: NOW,
  }), /simulated child activation failure/);
  assert.equal(database.prepare("SELECT status FROM circuit_orders WHERE id = ?").get(order.orderId).status, "PENDING_PAYMENT");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE payment_status = 'PAID'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM inventory_holds WHERE status = 'ACTIVE'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'PAYMENT_HELD'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM financial_ledger").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_payment_events").get().count, 0);
});

test("quarantines a captured circuit payment when its amount does not match", () => {
  const database = testDatabase();
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-payment-003",
  }, { now: NOW });
  const result = confirmCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "DEMO",
    paymentOrderId: "demo_order_003",
    paymentId: "demo_payment_003",
    signature: "demo",
    amount: 3000,
    eventKey: "demo:event:003",
    now: NOW,
  });

  assert.equal(result.success, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.failureCode, "PAYMENT_AMOUNT_MISMATCH");
  assert.equal(result.order.status, "PAYMENT_REVIEW_REQUIRED");
  assert.equal(result.order.payment.status, "CAPTURED_REVIEW");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE payment_status = 'PAID'").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE payment_status = 'PAYMENT_REVIEW_REQUIRED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'CANCELLED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM financial_ledger").get().count, 0);
});

test("a failed grouped payment releases every hold and is replay safe", () => {
  const database = testDatabase();
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: "circuit-payment-004",
  }, { now: NOW });
  claimCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "CASHFREE", now: NOW,
  });
  saveCircuitPaymentOrder(database, {
    orderId: order.orderId, userId: "traveler_1", provider: "CASHFREE",
    paymentOrderId: "cf_circuit_004", now: NOW,
  });

  const failed = failCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "CASHFREE",
    paymentOrderId: "cf_circuit_004",
    paymentId: "cf_failed_004",
    failureCode: "PAYMENT_USER_DROPPED_WEBHOOK",
    eventKey: "cashfree:event:004",
    now: NOW,
  });
  assert.equal(failed.idempotent, false);
  assert.equal(failed.order.status, "PAYMENT_FAILED");
  assert.ok(failed.order.holds.every((hold) => hold.status === "RELEASED"));
  assert.ok(failed.order.items.every((item) => item.status === "PAYMENT_FAILED" && item.paymentStatus === "FAILED"));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payouts WHERE payout_status = 'CANCELLED'").get().count, 2);

  const replay = failCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "CASHFREE",
    paymentOrderId: "cf_circuit_004",
    paymentId: "cf_failed_004",
    eventKey: "cashfree:event:004",
    now: NOW,
  });
  assert.equal(replay.idempotent, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_payment_events").get().count, 1);
});

function confirmedCircuit(database, key) {
  insertQuote(database);
  const order = consumeCircuitQuote(database, {
    quoteId: "quote_1", userId: "traveler_1", idempotencyKey: key,
  }, { now: NOW });
  return confirmCircuitOrderPayment(database, {
    orderId: order.orderId,
    provider: "DEMO",
    paymentOrderId: `demo_order_${key}`,
    paymentId: `pay_demo_${key}`,
    signature: "demo",
    amount: 3150,
    eventKey: `demo:${key}`,
    now: NOW,
  }).order;
}

test("operations approves one parent cancellation and refunds every child atomically", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-cancel-001");
  const traveler = { id: "traveler_1", role: "TRAVELER" };
  const operations = { id: "ops_1", role: "STAFF" };
  const preview = previewCircuitCancellation(database, order.orderId, traveler, { now: NOW });
  assert.equal(preview.itemCount, 2);
  assert.equal(preview.refundAmount, 3150);

  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "CANCELLATION",
    reason: "The complete circuit can no longer be attended",
    idempotencyKey: "cancel-parent-request-001",
  }, traveler, { now: NOW });
  assert.equal(created.request.status, "PENDING");
  assert.equal(database.prepare("SELECT management_status FROM circuit_orders WHERE id = ?").get(order.orderId).management_status, "PENDING_CANCELLATION");

  const reviewed = await reviewCircuitManagementRequest(database, created.request.requestId, {
    action: "APPROVE",
    resolution: "Policy and parent payment verified",
  }, operations, {
    now: NOW,
    refundProcessor: async ({ preview: current }) => ({ refundId: "rfnd_parent_001", status: "PROCESSED", amount: current.refundAmount }),
  });

  assert.equal(reviewed.request.status, "APPROVED");
  assert.deepEqual(database.prepare("SELECT status, payment_status, refunded_amount FROM circuit_orders WHERE id = ?").get(order.orderId), {
    status: "CANCELLED", payment_status: "REFUNDED", refunded_amount: 3150,
  });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status = 'cancelled' AND payment_status = 'REFUNDED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_order_items WHERE status = 'CANCELLED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM refunds WHERE status = 'PROCESSED'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE status = 'RESOLVED'").get().count, 1);
});

test("a failed parent refund leaves every circuit child confirmed and retryable", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-refund-failure-001");
  const traveler = { id: "traveler_1", role: "TRAVELER" };
  const operations = { id: "ops_1", role: "STAFF" };
  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "CANCELLATION",
    reason: "Cancel the entire circuit after a travel disruption",
    idempotencyKey: "cancel-parent-failure-001",
  }, traveler, { now: NOW });

  await assert.rejects(
    reviewCircuitManagementRequest(database, created.request.requestId, {
      action: "APPROVE", resolution: "Policy verified; issue the grouped refund",
    }, operations, { now: NOW, refundProcessor: async () => { throw new Error("provider unavailable"); } }),
    (error) => error.code === "REFUND_PROVIDER_FAILED",
  );
  assert.equal(database.prepare("SELECT status FROM circuit_management_requests WHERE id = ?").get(created.request.requestId).status, "REFUND_FAILED");
  assert.equal(database.prepare("SELECT status FROM circuit_orders WHERE id = ?").get(order.orderId).status, "CONFIRMED");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status = 'confirmed' AND payment_status = 'PAID'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM refunds").get().count, 0);
});

test("operations reschedules every circuit stop with one reviewed request", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-reschedule-001");
  const traveler = { id: "traveler_1", role: "TRAVELER" };
  const operations = { id: "ops_1", role: "STAFF" };
  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "RESCHEDULE",
    newStartDate: "2030-01-17",
    reason: "Move the whole holiday by exactly one week",
    idempotencyKey: "reschedule-parent-request-001",
  }, traveler, { now: NOW });
  assert.equal(created.request.requestedChanges.items.length, 2);

  const reviewed = await reviewCircuitManagementRequest(database, created.request.requestId, {
    action: "APPROVE",
    resolution: "All suppliers and modification windows verified",
  }, operations, { now: NOW });
  assert.equal(reviewed.request.status, "APPROVED");
  assert.deepEqual(
    database.prepare("SELECT activity_date FROM bookings ORDER BY activity_date").all().map((row) => row.activity_date),
    ["2030-01-17", "2030-01-18"],
  );
  assert.deepEqual(
    database.prepare("SELECT activity_date FROM circuit_order_items ORDER BY sequence_number").all().map((row) => row.activity_date),
    ["2030-01-17", "2030-01-18"],
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM booking_modifications WHERE modification_type = 'CIRCUIT_RESCHEDULE' AND status = 'APPLIED'").get().count, 2);
  assert.equal(database.prepare("SELECT management_status FROM circuit_orders WHERE id = ?").get(order.orderId).management_status, "SUPPLIER_RECONFIRMATION_PENDING");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_order_items WHERE reconfirmation_status = 'PENDING'").get().count, 2);

  const bookings = database.prepare("SELECT id FROM bookings ORDER BY activity_date").all();
  const first = respondToCircuitReconfirmation(database, {
    bookingId: bookings[0].id, supplierId: "supplier_1", action: "ACCEPT", now: new Date("2030-01-01T11:00:00.000Z"),
  });
  assert.equal(first.allConfirmed, false);
  const second = respondToCircuitReconfirmation(database, {
    bookingId: bookings[1].id, supplierId: "supplier_1", action: "ACCEPT", now: new Date("2030-01-01T11:01:00.000Z"),
  });
  assert.equal(second.allConfirmed, true);
  assert.deepEqual(
    database.prepare("SELECT management_status, reconfirmation_status FROM circuit_orders WHERE id = ?").get(order.orderId),
    { management_status: "COMPLETED", reconfirmation_status: "CONFIRMED" },
  );
});

test("a supplier rejection holds the complete rescheduled circuit for operations review", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-reschedule-reject-001");
  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "RESCHEDULE", newStartDate: "2030-01-17", reason: "Move every stop by one week",
    idempotencyKey: "reschedule-reject-parent-001",
  }, { id: "traveler_1", role: "TRAVELER" }, { now: NOW });
  await reviewCircuitManagementRequest(database, created.request.requestId, {
    action: "APPROVE", resolution: "New dates available at review time",
  }, { id: "ops_1", role: "STAFF" }, { now: NOW });
  const booking = database.prepare("SELECT id FROM bookings ORDER BY activity_date LIMIT 1").get();
  const result = respondToCircuitReconfirmation(database, {
    bookingId: booking.id, supplierId: "supplier_1", action: "REJECT",
    note: "Fleet unavailable on the new date", now: new Date("2030-01-01T11:00:00.000Z"),
  });
  assert.equal(result.status, "RECONFIRMATION_REVIEW_REQUIRED");
  assert.equal(database.prepare("SELECT reconfirmation_status FROM circuit_orders WHERE id = ?").get(order.orderId).reconfirmation_status, "REVIEW_REQUIRED");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE supplier_id = 'supplier_1'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE task_type = 'CIRCUIT_RECONFIRMATION_FAILURE' AND status = 'OPEN'").get().count, 1);
});

test("expired reconfirmations create one parent SLA review without supplier fallback", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-reschedule-timeout-001");
  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "RESCHEDULE", newStartDate: "2030-01-17", reason: "Move every stop by one week",
    idempotencyKey: "reschedule-timeout-parent-001",
  }, { id: "traveler_1", role: "TRAVELER" }, { now: NOW });
  await reviewCircuitManagementRequest(database, created.request.requestId, {
    action: "APPROVE", resolution: "Dates checked for all suppliers",
  }, { id: "ops_1", role: "STAFF" }, { now: NOW });
  const result = processExpiredCircuitReconfirmations(database, { now: new Date("2030-01-02T11:00:00.000Z") });
  assert.equal(result.checked, 2);
  assert.equal(result.ordersReviewRequired, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM circuit_order_items WHERE reconfirmation_status = 'TIMED_OUT'").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE task_type = 'CIRCUIT_RECONFIRMATION_SLA_BREACH'").get().count, 1);
});

test("live refund webhooks reconcile once and flag provider amount mismatches", async () => {
  const database = testDatabase();
  const order = confirmedCircuit(database, "management-live-refund-001");
  database.prepare("UPDATE circuit_orders SET payment_provider = 'CASHFREE', payment_order_id = 'cf_parent_001' WHERE id = ?").run(order.orderId);
  const created = createCircuitManagementRequest(database, order.orderId, {
    type: "CANCELLATION", reason: "Cancel the complete circuit for testing",
    idempotencyKey: "live-refund-parent-001",
  }, { id: "traveler_1", role: "TRAVELER" }, { now: NOW });
  await reviewCircuitManagementRequest(database, created.request.requestId, {
    action: "APPROVE", resolution: "Policy checked and parent refund submitted",
  }, { id: "ops_1", role: "STAFF" }, {
    now: NOW,
    refundProcessor: async ({ preview }) => ({ refundId: "cf_refund_001", status: "PENDING", amount: preview.refundAmount }),
  });
  assert.equal(database.prepare("SELECT refund_reconciliation_status FROM circuit_orders WHERE id = ?").get(order.orderId).refund_reconciliation_status, "PENDING");
  const expected = database.prepare("SELECT refund_amount FROM circuit_management_requests WHERE id = ?").get(created.request.requestId).refund_amount;
  const reconciled = reconcileCircuitRefund(database, {
    provider: "CASHFREE", eventKey: "cf:refund:001:success", gatewayRefundId: "cf_refund_001",
    providerStatus: "SUCCESS", amount: expected, now: new Date("2030-01-01T12:00:00.000Z"),
  });
  assert.equal(reconciled.status, "RECONCILED");
  assert.equal(reconcileCircuitRefund(database, {
    provider: "CASHFREE", eventKey: "cf:refund:001:success", gatewayRefundId: "cf_refund_001",
    providerStatus: "SUCCESS", amount: expected,
  }).idempotent, true);

  const mismatch = reconcileCircuitRefund(database, {
    provider: "CASHFREE", eventKey: "cf:refund:001:mismatch", gatewayRefundId: "cf_refund_001",
    providerStatus: "SUCCESS", amount: expected - 100,
  });
  assert.equal(mismatch.status, "REVIEW_REQUIRED");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM staff_tasks WHERE task_type = 'CIRCUIT_REFUND_RECONCILIATION'").get().count, 1);
});
