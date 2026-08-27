import { nanoid } from "nanoid";
import { activatePickupOtp } from "./bookingService.js";
import { beginSupplierAcceptance } from "./assignmentSlaService.js";
import { recordPaymentCapture } from "./financeService.js";
import { expireCircuitOrderHolds, getCircuitOrder } from "./circuitOrderService.js";

const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const PAYMENT_SETUP_LOCK_MS = 2 * 60 * 1000;
const LIVE_PROVIDERS = new Set(["CASHFREE", "RAZORPAY"]);
const ALL_PROVIDERS = new Set([...LIVE_PROVIDERS, "DEMO"]);

function paymentError(message, status = 400, code = "CIRCUIT_PAYMENT_ERROR") {
  return Object.assign(new Error(message), { status, code });
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function providerName(value, { allowDemo = false } = {}) {
  const provider = String(value || "").trim().toUpperCase();
  const allowed = allowDemo ? ALL_PROVIDERS : LIVE_PROVIDERS;
  if (!allowed.has(provider)) {
    throw paymentError("Choose Cashfree or Razorpay", 400, "PAYMENT_PROVIDER_INVALID");
  }
  return provider;
}

function findOrder(database, target, userId = null) {
  const normalized = String(target || "").trim();
  if (!normalized) throw paymentError("Circuit order is required", 400, "CIRCUIT_ORDER_REQUIRED");
  const ownerClause = userId ? " AND user_id = ?" : "";
  const order = database.prepare(`
    SELECT * FROM circuit_orders
    WHERE (id = ? OR order_ref = ? OR payment_order_id = ?)${ownerClause}
  `).get(normalized, normalized, normalized, ...(userId ? [userId] : []));
  if (!order) throw paymentError("Circuit order not found", 404, "CIRCUIT_ORDER_NOT_FOUND");
  return order;
}

function insertEvent(database, {
  orderId,
  eventKey,
  provider,
  eventType,
  providerOrderId,
  providerPaymentId,
  status,
  amount,
  failureCode,
}) {
  if (!eventKey) return;
  database.prepare(`
    INSERT OR IGNORE INTO circuit_payment_events (
      id, circuit_order_id, event_key, provider, event_type, provider_order_id,
      provider_payment_id, status, amount, failure_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `cpe_${nanoid(14)}`,
    orderId,
    String(eventKey).slice(0, 240),
    provider,
    eventType,
    providerOrderId || null,
    providerPaymentId || null,
    status,
    amount === undefined || amount === null ? null : money(amount),
    failureCode || null,
  );
}

function paymentSetupResult(order, idempotent = false) {
  return {
    orderId: order.id,
    orderRef: order.order_ref,
    provider: order.payment_provider || null,
    paymentOrderId: order.payment_order_id || null,
    paymentSessionId: order.payment_session_id || null,
    setupStatus: order.payment_order_status || "NOT_STARTED",
    amount: Number(order.total_amount),
    currency: order.currency || "INR",
    customer: {
      id: order.user_id,
      name: order.traveler_name,
      email: order.traveler_email,
      phone: order.traveler_phone,
    },
    holdExpiresAt: order.hold_expires_at,
    idempotent,
  };
}

export function claimCircuitPaymentOrder(database, {
  orderId,
  userId,
  provider,
  now = new Date(),
}) {
  const normalizedProvider = providerName(provider);
  expireCircuitOrderHolds(database, now);
  const order = findOrder(database, orderId, userId);

  if (order.payment_status === "PAID" || order.status === "CONFIRMED") {
    throw paymentError("This circuit order is already paid", 409, "CIRCUIT_ORDER_ALREADY_PAID");
  }
  if (order.status !== "PENDING_PAYMENT") {
    throw paymentError("This circuit order is not awaiting payment", 409, "CIRCUIT_ORDER_NOT_PAYABLE");
  }
  if (order.payment_provider && order.payment_provider !== normalizedProvider) {
    throw paymentError(`This circuit order already uses ${order.payment_provider}`, 409, "PAYMENT_PROVIDER_LOCKED");
  }
  if (order.payment_order_id) return paymentSetupResult(order, true);
  const staleBefore = new Date(now.getTime() - PAYMENT_SETUP_LOCK_MS).toISOString();
  const setupIsStale = order.payment_order_status === "CREATING"
    && (!order.updated_at || new Date(order.updated_at).getTime() <= now.getTime() - PAYMENT_SETUP_LOCK_MS);
  if (order.payment_order_status === "CREATING" && !setupIsStale) {
    throw paymentError("A payment order is already being created", 409, "PAYMENT_ORDER_IN_PROGRESS");
  }

  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString();
  const claim = database.transaction(() => {
    const updated = database.prepare(`
      UPDATE circuit_orders
      SET payment_provider = ?, payment_order_status = 'CREATING', payment_failure_code = NULL,
          hold_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'PENDING_PAYMENT' AND payment_order_id IS NULL
        AND (COALESCE(payment_order_status, 'NOT_STARTED') <> 'CREATING' OR updated_at <= ?)
    `).run(normalizedProvider, expiresAt, now.toISOString(), order.id, staleBefore);
    if (updated.changes !== 1) {
      throw paymentError("A payment order is already being created", 409, "PAYMENT_ORDER_IN_PROGRESS");
    }
    database.prepare(`
      UPDATE inventory_holds SET expires_at = ?
      WHERE circuit_order_id = ? AND status = 'ACTIVE'
    `).run(expiresAt, order.id);
  });
  claim();
  return paymentSetupResult(findOrder(database, order.id, userId), false);
}

export function saveCircuitPaymentOrder(database, {
  orderId,
  userId,
  provider,
  paymentOrderId,
  paymentSessionId = null,
  now = new Date(),
}) {
  const normalizedProvider = providerName(provider);
  if (!String(paymentOrderId || "").trim()) {
    throw paymentError("Payment provider order ID is required", 500, "PAYMENT_ORDER_SETUP_FAILED");
  }
  const order = findOrder(database, orderId, userId);
  if (order.payment_order_id) {
    if (order.payment_order_id !== paymentOrderId) {
      throw paymentError("A different provider order is already attached", 409, "PAYMENT_ORDER_CONFLICT");
    }
    return paymentSetupResult(order, true);
  }
  const updated = database.prepare(`
    UPDATE circuit_orders
    SET payment_provider = ?, payment_order_id = ?, payment_session_id = ?,
        payment_order_status = 'CREATED', updated_at = ?
    WHERE id = ? AND status = 'PENDING_PAYMENT' AND payment_order_status = 'CREATING'
      AND payment_order_id IS NULL
  `).run(
    normalizedProvider,
    String(paymentOrderId),
    paymentSessionId ? String(paymentSessionId) : null,
    now.toISOString(),
    order.id,
  );
  if (updated.changes !== 1) {
    throw paymentError("Payment order could not be attached", 409, "PAYMENT_ORDER_CONFLICT");
  }
  return paymentSetupResult(findOrder(database, order.id, userId), false);
}

export function failCircuitPaymentOrderSetup(database, {
  orderId,
  userId,
  failureCode = "PROVIDER_ORDER_FAILED",
  now = new Date(),
}) {
  const order = findOrder(database, orderId, userId);
  database.prepare(`
    UPDATE circuit_orders SET payment_order_status = 'FAILED', payment_failure_code = ?, updated_at = ?
    WHERE id = ? AND payment_order_status = 'CREATING' AND payment_order_id IS NULL
  `).run(String(failureCode).slice(0, 120), now.toISOString(), order.id);
  return paymentSetupResult(findOrder(database, order.id, userId), false);
}

function ensureSelectedAssignment(database, booking) {
  const round = Number(booking.assignment_round) || 1;
  const selected = database.prepare(`
    SELECT id FROM supplier_assignment_attempts
    WHERE booking_id = ? AND assignment_round = ? AND decision = 'SELECTED'
    LIMIT 1
  `).get(booking.id, round);
  if (selected) return selected.id;
  const id = `asa_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO supplier_assignment_attempts (
      id, booking_id, supplier_id, candidate_product_id, decision, score,
      candidate_price, vehicle_category, assignment_round, response_status,
      rejection_reasons, score_breakdown
    ) VALUES (?, ?, ?, ?, 'SELECTED', ?, ?, ?, ?, 'NOT_STARTED', '[]', ?)
  `).run(
    id,
    booking.id,
    booking.supplier_id,
    booking.assigned_supplier_product_id || booking.product_id,
    Number(booking.supplier_assignment_score) || 100,
    Number(booking.amount_inr),
    booking.vehicle_category || null,
    round,
    JSON.stringify({ source: "CIRCUIT_QUOTE_V1", reservedBeforePayment: true }),
  );
  return id;
}

function quarantineCapturedPayment(database, order, {
  provider,
  paymentOrderId,
  paymentId,
  signature,
  amount,
  eventKey,
  failureCode,
  now,
}) {
  database.transaction(() => {
    database.prepare(`
      UPDATE circuit_orders
      SET status = 'PAYMENT_REVIEW_REQUIRED', payment_provider = ?,
          payment_order_id = COALESCE(payment_order_id, ?), payment_id = ?, payment_signature = ?,
          payment_status = 'CAPTURED_REVIEW', payment_order_status = 'CREATED',
          payment_verified_at = ?, payment_failure_code = ?, updated_at = ?
      WHERE id = ? AND payment_status <> 'PAID'
    `).run(provider, paymentOrderId || null, paymentId || null, signature || null,
      now.toISOString(), failureCode, now.toISOString(), order.id);
    database.prepare(`
      UPDATE inventory_holds SET status = CASE WHEN expires_at <= ? THEN 'EXPIRED' ELSE 'RELEASED' END,
        released_at = COALESCE(released_at, ?)
      WHERE circuit_order_id = ? AND status = 'ACTIVE'
    `).run(now.toISOString(), now.toISOString(), order.id);
    database.prepare(`
      UPDATE circuit_order_items SET status = 'PAYMENT_REVIEW_REQUIRED'
      WHERE circuit_order_id = ? AND status = 'HELD_PENDING_PAYMENT'
    `).run(order.id);
    database.prepare(`
      UPDATE bookings SET status = 'cancelled', payment_status = 'PAYMENT_REVIEW_REQUIRED',
        payment_method = ?, supplier_assignment_status = 'PAYMENT_REVIEW_REQUIRED'
      WHERE circuit_order_id = ? AND payment_status <> 'PAID'
    `).run(provider, order.id);
    database.prepare(`
      UPDATE payouts SET payout_status = 'CANCELLED'
      WHERE booking_id IN (SELECT id FROM bookings WHERE circuit_order_id = ?)
        AND payout_status = 'PENDING_PAYMENT'
    `).run(order.id);
    insertEvent(database, {
      orderId: order.id,
      eventKey,
      provider,
      eventType: "PAYMENT_CAPTURED",
      providerOrderId: paymentOrderId,
      providerPaymentId: paymentId,
      status: "REVIEW_REQUIRED",
      amount,
      failureCode,
    });
  })();
  return {
    success: false,
    reviewRequired: true,
    idempotent: false,
    failureCode,
    order: getCircuitOrder(database, order.id, order.user_id, { now }),
    bookings: [],
  };
}

export function confirmCircuitOrderPayment(database, {
  orderId,
  userId = null,
  provider,
  paymentOrderId,
  paymentId,
  signature = null,
  amount,
  eventKey,
  now = new Date(),
}) {
  const normalizedProvider = providerName(provider, { allowDemo: true });
  const order = findOrder(database, orderId || paymentOrderId, userId);
  const providerOrderId = String(paymentOrderId || order.payment_order_id || "").trim() || null;
  const providerPaymentId = String(paymentId || "").trim() || null;

  if (order.payment_status === "PAID" || order.status === "CONFIRMED") {
    insertEvent(database, {
      orderId: order.id, eventKey, provider: normalizedProvider, eventType: "PAYMENT_CAPTURED",
      providerOrderId, providerPaymentId, status: "PAID", amount,
    });
    return {
      success: true,
      reviewRequired: false,
      idempotent: true,
      order: getCircuitOrder(database, order.id, order.user_id, { now }),
      bookings: [],
    };
  }
  if (order.status === "PAYMENT_REVIEW_REQUIRED") {
    return {
      success: false,
      reviewRequired: true,
      idempotent: true,
      failureCode: order.payment_failure_code,
      order: getCircuitOrder(database, order.id, order.user_id, { now }),
      bookings: [],
    };
  }
  if (order.payment_provider && order.payment_provider !== normalizedProvider) {
    throw paymentError("Payment provider does not match this circuit order", 400, "PAYMENT_PROVIDER_MISMATCH");
  }
  if (normalizedProvider !== "DEMO" && !providerOrderId) {
    throw paymentError("Payment provider order ID is required", 400, "PAYMENT_ORDER_REQUIRED");
  }
  if (order.payment_order_id && order.payment_order_id !== providerOrderId) {
    throw paymentError("Payment order does not match this circuit order", 400, "PAYMENT_ORDER_MISMATCH");
  }

  const amountProvided = amount !== undefined && amount !== null && amount !== "" && Number.isFinite(Number(amount));
  if (normalizedProvider !== "DEMO" && !amountProvided) {
    throw paymentError("Captured payment amount is missing", 400, "PAYMENT_AMOUNT_REQUIRED");
  }
  const amountMismatch = amountProvided && money(amount) !== money(order.total_amount);
  const expired = new Date(order.hold_expires_at).getTime() <= now.getTime();
  const invalidLifecycle = order.status !== "PENDING_PAYMENT" || order.payment_status === "FAILED";
  if (amountMismatch || expired || invalidLifecycle) {
    const failureCode = amountMismatch ? "PAYMENT_AMOUNT_MISMATCH" : expired ? "PAYMENT_CAPTURED_AFTER_EXPIRY" : "PAYMENT_CAPTURED_AFTER_FAILURE";
    return quarantineCapturedPayment(database, order, {
      provider: normalizedProvider,
      paymentOrderId: providerOrderId,
      paymentId: providerPaymentId,
      signature,
      amount,
      eventKey,
      failureCode,
      now,
    });
  }

  const items = database.prepare(`
    SELECT * FROM circuit_order_items WHERE circuit_order_id = ? ORDER BY sequence_number
  `).all(order.id);
  const holds = database.prepare(`
    SELECT * FROM inventory_holds WHERE circuit_order_id = ? ORDER BY created_at
  `).all(order.id);
  const bookings = database.prepare(`
    SELECT * FROM bookings WHERE circuit_order_id = ? ORDER BY activity_date, pickup_time, id
  `).all(order.id);
  const payoutCount = database.prepare(`
    SELECT COUNT(*) AS count FROM payouts
    WHERE booking_id IN (SELECT id FROM bookings WHERE circuit_order_id = ?)
  `).get(order.id).count;
  if (!items.length || items.length !== bookings.length || holds.length !== bookings.length || Number(payoutCount) !== bookings.length) {
    throw paymentError("Circuit order children are incomplete; payment needs operations review", 409, "CIRCUIT_ORDER_INTEGRITY_ERROR");
  }
  if (holds.some((hold) => hold.status !== "ACTIVE" || new Date(hold.expires_at).getTime() <= now.getTime())) {
    return quarantineCapturedPayment(database, order, {
      provider: normalizedProvider, paymentOrderId: providerOrderId, paymentId: providerPaymentId,
      signature, amount, eventKey, failureCode: "INVENTORY_HOLD_EXPIRED", now,
    });
  }
  if (bookings.some((booking) => booking.payment_status !== "PENDING" || booking.status !== "pending_payment")) {
    throw paymentError("Circuit order is in a partial payment state", 409, "CIRCUIT_ORDER_INTEGRITY_ERROR");
  }

  const confirmedBookings = [];
  database.transaction(() => {
    const claimed = database.prepare(`
      UPDATE circuit_orders
      SET payment_provider = ?, payment_order_id = COALESCE(payment_order_id, ?),
          payment_id = ?, payment_signature = ?, payment_status = 'PAID',
          payment_order_status = 'CREATED', status = 'CONFIRMED', payment_verified_at = ?,
          payment_failed_at = NULL, payment_failure_code = NULL, payment_reference = ?, updated_at = ?
      WHERE id = ? AND status = 'PENDING_PAYMENT' AND COALESCE(payment_status, 'PENDING') = 'PENDING'
    `).run(
      normalizedProvider,
      providerOrderId,
      providerPaymentId,
      signature,
      now.toISOString(),
      providerPaymentId || providerOrderId,
      now.toISOString(),
      order.id,
    );
    if (claimed.changes !== 1) {
      throw paymentError("Circuit payment was already processed", 409, "CIRCUIT_PAYMENT_ALREADY_PROCESSED");
    }

    for (const booking of bookings) {
      const otp = activatePickupOtp(booking);
      const updated = database.prepare(`
        UPDATE bookings
        SET payment_method = ?, payment_status = 'PAID', status = 'confirmed',
          razorpay_order_id = ?, razorpay_payment_id = ?, razorpay_signature = ?,
          cashfree_order_id = ?, cashfree_payment_id = ?, payment_session_id = COALESCE(payment_session_id, ?),
          otp_code = NULL, otp_hash = ?, otp_encrypted = ?, otp_expires_at = ?,
          otp_attempts = 0, otp_verified_at = NULL
        WHERE id = ? AND payment_status = 'PENDING' AND status = 'pending_payment'
      `).run(
        normalizedProvider,
        ["RAZORPAY", "DEMO"].includes(normalizedProvider) ? providerOrderId : booking.razorpay_order_id || null,
        ["RAZORPAY", "DEMO"].includes(normalizedProvider) ? providerPaymentId : booking.razorpay_payment_id || null,
        ["RAZORPAY", "DEMO"].includes(normalizedProvider) ? signature : booking.razorpay_signature || null,
        normalizedProvider === "CASHFREE" ? providerOrderId : booking.cashfree_order_id || null,
        normalizedProvider === "CASHFREE" ? providerPaymentId : booking.cashfree_payment_id || null,
        normalizedProvider === "CASHFREE" ? order.payment_session_id : booking.payment_session_id || null,
        otp.otpHash,
        otp.otpEncrypted,
        otp.otpExpiresAt,
        booking.id,
      );
      if (updated.changes !== 1) {
        throw paymentError("A circuit child booking could not be activated", 409, "CIRCUIT_ORDER_INTEGRITY_ERROR");
      }
      ensureSelectedAssignment(database, booking);
      const payout = database.prepare(`
        UPDATE payouts SET payout_status = 'PAYMENT_HELD'
        WHERE booking_id = ? AND payout_status = 'PENDING_PAYMENT'
      `).run(booking.id);
      if (payout.changes !== 1) {
        throw paymentError("A circuit child payout could not be secured", 409, "CIRCUIT_ORDER_INTEGRITY_ERROR");
      }
      const supplierResponseDeadline = beginSupplierAcceptance(database, booking.id, now);
      recordPaymentCapture(database, { ...booking, payment_method: normalizedProvider }, providerPaymentId || providerOrderId);
      confirmedBookings.push({
        bookingId: booking.id,
        bookingRef: booking.ref,
        supplierResponseDeadline,
      });
    }

    database.prepare(`
      UPDATE circuit_order_items SET status = 'CONFIRMED'
      WHERE circuit_order_id = ? AND status = 'HELD_PENDING_PAYMENT'
    `).run(order.id);
    database.prepare(`
      UPDATE inventory_holds SET status = 'CONSUMED', consumed_at = ?
      WHERE circuit_order_id = ? AND status = 'ACTIVE'
    `).run(now.toISOString(), order.id);
    insertEvent(database, {
      orderId: order.id,
      eventKey,
      provider: normalizedProvider,
      eventType: "PAYMENT_CAPTURED",
      providerOrderId,
      providerPaymentId,
      status: "PAID",
      amount: amountProvided ? amount : order.total_amount,
    });
  })();

  return {
    success: true,
    reviewRequired: false,
    idempotent: false,
    order: getCircuitOrder(database, order.id, order.user_id, { now }),
    bookings: confirmedBookings,
  };
}

export function failCircuitOrderPayment(database, {
  orderId,
  userId = null,
  provider,
  paymentOrderId,
  paymentId = null,
  failureCode = "PAYMENT_FAILED",
  eventKey,
  now = new Date(),
}) {
  const normalizedProvider = providerName(provider, { allowDemo: true });
  const order = findOrder(database, orderId || paymentOrderId, userId);
  if (order.payment_status === "PAID" || order.status === "CONFIRMED") {
    return { success: true, paid: true, idempotent: true, order: getCircuitOrder(database, order.id, order.user_id, { now }) };
  }
  if (["FAILED", "CAPTURED_REVIEW"].includes(order.payment_status) || ["PAYMENT_FAILED", "PAYMENT_REVIEW_REQUIRED"].includes(order.status)) {
    return { success: false, paid: false, idempotent: true, order: getCircuitOrder(database, order.id, order.user_id, { now }) };
  }
  if (order.payment_order_id && paymentOrderId && order.payment_order_id !== paymentOrderId) {
    throw paymentError("Payment order does not match this circuit order", 400, "PAYMENT_ORDER_MISMATCH");
  }
  const code = String(failureCode || "PAYMENT_FAILED").slice(0, 120);
  database.transaction(() => {
    database.prepare(`
      UPDATE circuit_orders SET status = 'PAYMENT_FAILED', payment_provider = ?,
        payment_order_id = COALESCE(payment_order_id, ?), payment_id = COALESCE(?, payment_id),
        payment_status = 'FAILED', payment_order_status = 'CREATED', payment_failed_at = ?,
        payment_failure_code = ?, updated_at = ?
      WHERE id = ? AND status = 'PENDING_PAYMENT' AND COALESCE(payment_status, 'PENDING') = 'PENDING'
    `).run(normalizedProvider, paymentOrderId || null, paymentId || null, now.toISOString(), code, now.toISOString(), order.id);
    database.prepare(`
      UPDATE inventory_holds SET status = 'RELEASED', released_at = ?
      WHERE circuit_order_id = ? AND status = 'ACTIVE'
    `).run(now.toISOString(), order.id);
    database.prepare(`
      UPDATE circuit_order_items SET status = 'PAYMENT_FAILED'
      WHERE circuit_order_id = ? AND status = 'HELD_PENDING_PAYMENT'
    `).run(order.id);
    database.prepare(`
      UPDATE bookings SET status = 'cancelled', payment_status = 'FAILED', payment_method = ?,
        supplier_assignment_status = 'PAYMENT_FAILED'
      WHERE circuit_order_id = ? AND status = 'pending_payment' AND payment_status = 'PENDING'
    `).run(normalizedProvider, order.id);
    database.prepare(`
      UPDATE payouts SET payout_status = 'CANCELLED'
      WHERE booking_id IN (SELECT id FROM bookings WHERE circuit_order_id = ?)
        AND payout_status = 'PENDING_PAYMENT'
    `).run(order.id);
    insertEvent(database, {
      orderId: order.id,
      eventKey,
      provider: normalizedProvider,
      eventType: "PAYMENT_FAILED",
      providerOrderId: paymentOrderId,
      providerPaymentId: paymentId,
      status: "FAILED",
      failureCode: code,
    });
  })();
  return {
    success: false,
    paid: false,
    idempotent: false,
    order: getCircuitOrder(database, order.id, order.user_id, { now }),
  };
}

export function findCircuitOrderByPaymentOrderId(database, paymentOrderId) {
  if (!paymentOrderId) return null;
  return database.prepare("SELECT * FROM circuit_orders WHERE payment_order_id = ?").get(String(paymentOrderId)) || null;
}

export const CIRCUIT_PAYMENT_WINDOW_MS = PAYMENT_WINDOW_MS;
