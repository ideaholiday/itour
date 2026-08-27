import { nanoid } from "nanoid";
import { evaluateSupplierAvailability } from "./availabilityService.js";
import { resolveCommissionRate } from "./financeService.js";

const HOLD_VALIDITY_MS = 15 * 60 * 1000;
const ACTIVE_ORDER_STATUS = "PENDING_PAYMENT";

function orderError(message, status = 400, code = "CIRCUIT_ORDER_ERROR", details = undefined) {
  return Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pickupTime(line) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(line.pickupTime || ""))) return line.pickupTime;
  const slot = String(line.timeSlot || "").toUpperCase();
  if (slot.includes("AFTERNOON")) return "14:00";
  if (slot.includes("EVENING")) return "18:00";
  return "09:00";
}

function contactDetails(user, input = {}) {
  const travelerName = String(input.travelerName || user?.name || "").trim();
  const travelerEmail = String(input.travelerEmail || user?.email || "").trim().toLowerCase();
  const travelerPhone = String(input.travelerPhone || user?.phone || "").trim();
  if (travelerName.length < 2) throw orderError("Traveler name is required", 400, "TRAVELER_CONTACT_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(travelerEmail)) {
    throw orderError("Enter a valid traveler email", 400, "TRAVELER_CONTACT_REQUIRED");
  }
  if (!/^\+?[0-9][0-9\s-]{7,17}$/.test(travelerPhone)) {
    throw orderError("Enter a valid traveler phone number", 400, "TRAVELER_CONTACT_REQUIRED");
  }
  return { travelerName, travelerEmail, travelerPhone };
}

function orderRecord(database, orderId, userId) {
  const order = database.prepare("SELECT * FROM circuit_orders WHERE (id = ? OR order_ref = ?) AND user_id = ?")
    .get(orderId, orderId, userId);
  if (!order) throw orderError("Circuit order not found", 404, "CIRCUIT_ORDER_NOT_FOUND");
  const items = database.prepare(`
    SELECT coi.*, b.ref AS booking_ref, b.status AS booking_status, b.payment_status,
      p.title AS product_title, s.company_name AS supplier_name
    FROM circuit_order_items coi
    JOIN bookings b ON b.id = coi.booking_id
    LEFT JOIN products p ON p.id = coi.product_id
    LEFT JOIN suppliers s ON s.id = coi.supplier_id
    WHERE coi.circuit_order_id = ?
    ORDER BY coi.sequence_number ASC
  `).all(order.id);
  const holds = database.prepare(`
    SELECT id, circuit_order_item_id, booking_id, product_id, supplier_id, activity_date,
      pickup_time, vehicle_category, units, status, expires_at, released_at, consumed_at
    FROM inventory_holds WHERE circuit_order_id = ? ORDER BY created_at ASC
  `).all(order.id);
  const managementRequests = database.prepare(`
    SELECT id, request_ref, request_type, status, reason, refund_amount,
      cancellation_fee_amount, gateway_refund_id, gateway_status, failure_code,
      resolution, reviewed_by, reviewed_at, orchestration_status, refund_expected_status,
      refund_reconciled_at, created_at, updated_at
    FROM circuit_management_requests WHERE circuit_order_id = ? ORDER BY created_at DESC
  `).all(order.id);
  return {
    orderId: order.id,
    orderRef: order.order_ref,
    quoteId: order.quote_id,
    itineraryId: order.itinerary_id,
    status: order.status,
    currency: order.currency,
    adultsCount: Number(order.adults_count),
    childrenCount: Number(order.children_count),
    traveler: {
      name: order.traveler_name,
      email: order.traveler_email,
      phone: order.traveler_phone,
    },
    breakdown: {
      baseAmount: Number(order.base_amount),
      taxesAmount: Number(order.taxes_amount),
      totalAmount: Number(order.total_amount),
    },
    holdExpiresAt: order.hold_expires_at,
    paymentReference: order.payment_reference || null,
    payment: {
      provider: order.payment_provider || null,
      status: order.payment_status || "PENDING",
      orderStatus: order.payment_order_status || "NOT_STARTED",
      orderId: order.payment_order_id || null,
      sessionId: order.payment_session_id || null,
      paymentId: order.payment_id || null,
      verifiedAt: order.payment_verified_at || null,
      failedAt: order.payment_failed_at || null,
      failureCode: order.payment_failure_code || null,
    },
    management: {
      status: order.management_status || "NONE",
      refundedAmount: Number(order.refunded_amount || 0),
      cancellationFeeAmount: Number(order.cancellation_fee_amount || 0),
      cancelledAt: order.cancelled_at || null,
      refundedAt: order.refunded_at || null,
      rescheduledAt: order.rescheduled_at || null,
      reconfirmationStatus: order.reconfirmation_status || "NOT_REQUIRED",
      reconfirmationDeadline: order.reconfirmation_deadline || null,
      reconfirmedAt: order.reconfirmed_at || null,
      refundReconciliationStatus: order.refund_reconciliation_status || "NOT_REQUIRED",
      refundReconciledAt: order.refund_reconciled_at || null,
      currentRequest: managementRequests.find((request) => ["PENDING", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED"].includes(request.status)) || null,
      requests: managementRequests.map((request) => ({
        requestId: request.id,
        requestRef: request.request_ref,
        type: request.request_type,
        status: request.status,
        reason: request.reason,
        refundAmount: Number(request.refund_amount || 0),
        cancellationFeeAmount: Number(request.cancellation_fee_amount || 0),
        gatewayRefundId: request.gateway_refund_id || null,
        gatewayStatus: request.gateway_status || null,
        failureCode: request.failure_code || null,
        resolution: request.resolution || null,
        reviewedBy: request.reviewed_by || null,
        reviewedAt: request.reviewed_at || null,
        orchestrationStatus: request.orchestration_status || "NOT_STARTED",
        refundExpectedStatus: request.refund_expected_status || null,
        refundReconciledAt: request.refund_reconciled_at || null,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      })),
    },
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map((item) => ({
      orderItemId: item.id,
      quoteLineItemId: item.quote_line_item_id,
      bookingId: item.booking_id,
      bookingRef: item.booking_ref,
      sequenceNumber: Number(item.sequence_number),
      productId: item.product_id,
      productTitle: item.product_title || item.variant_name || "Circuit experience",
      supplierId: item.supplier_id,
      supplierName: item.supplier_name || null,
      activityDate: item.activity_date,
      pickupTime: item.pickup_time,
      vehicleCategory: item.vehicle_category,
      variantName: item.variant_name,
      status: item.status,
      bookingStatus: item.booking_status,
      paymentStatus: item.payment_status,
      reconfirmationStatus: item.reconfirmation_status || "NOT_REQUIRED",
      reconfirmationDeadline: item.reconfirmation_deadline || null,
      reconfirmedAt: item.reconfirmed_at || null,
      breakdown: {
        baseAmount: Number(item.base_amount),
        taxesAmount: Number(item.taxes_amount),
        totalAmount: Number(item.total_amount),
      },
    })),
    holds: holds.map((hold) => ({
      holdId: hold.id,
      orderItemId: hold.circuit_order_item_id,
      bookingId: hold.booking_id,
      productId: hold.product_id,
      supplierId: hold.supplier_id,
      activityDate: hold.activity_date,
      pickupTime: hold.pickup_time,
      vehicleCategory: hold.vehicle_category,
      units: Number(hold.units),
      status: hold.status,
      expiresAt: hold.expires_at,
      releasedAt: hold.released_at,
      consumedAt: hold.consumed_at,
    })),
  };
}

export function expireCircuitOrderHolds(database, now = new Date()) {
  const nowIso = now.toISOString();
  const expired = database.prepare(`
    SELECT id FROM circuit_orders
    WHERE status = 'PENDING_PAYMENT' AND hold_expires_at <= ?
  `).all(nowIso);
  if (!expired.length) return { expiredOrderIds: [], releasedHolds: 0 };

  const orderIds = expired.map((row) => row.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  let releasedHolds = 0;
  database.transaction(() => {
    database.prepare(`UPDATE circuit_orders SET status = 'EXPIRED', updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...orderIds);
    releasedHolds = database.prepare(`
      UPDATE inventory_holds SET status = 'EXPIRED', released_at = ?
      WHERE circuit_order_id IN (${placeholders}) AND status = 'ACTIVE'
    `).run(nowIso, ...orderIds).changes;
    database.prepare(`UPDATE circuit_order_items SET status = 'EXPIRED' WHERE circuit_order_id IN (${placeholders}) AND status = 'HELD_PENDING_PAYMENT'`).run(...orderIds);
    database.prepare(`
      UPDATE bookings SET status = 'cancelled', payment_status = 'EXPIRED', supplier_assignment_status = 'HOLD_EXPIRED'
      WHERE circuit_order_id IN (${placeholders}) AND status = 'pending_payment'
    `).run(...orderIds);
    database.prepare(`
      UPDATE payouts SET payout_status = 'CANCELLED'
      WHERE booking_id IN (SELECT id FROM bookings WHERE circuit_order_id IN (${placeholders}))
        AND payout_status = 'PENDING_PAYMENT'
    `).run(...orderIds);
  })();
  return { expiredOrderIds: orderIds, releasedHolds };
}

export function getCircuitOrder(database, orderId, userId, { now = new Date() } = {}) {
  expireCircuitOrderHolds(database, now);
  return orderRecord(database, orderId, userId);
}

export function consumeCircuitQuote(database, input, { now = new Date() } = {}) {
  const quoteId = String(input?.quoteId || "").trim();
  const userId = String(input?.userId || "").trim();
  const idempotencyKey = String(input?.idempotencyKey || "").trim();
  if (!quoteId) throw orderError("Circuit quote is required", 400, "QUOTE_REQUIRED");
  if (!userId) throw orderError("Sign in before creating a circuit order", 401, "AUTH_REQUIRED");
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw orderError("Provide an idempotency key between 8 and 160 characters", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }

  expireCircuitOrderHolds(database, now);
  const prior = database.prepare("SELECT * FROM circuit_orders WHERE user_id = ? AND idempotency_key = ?").get(userId, idempotencyKey);
  if (prior) {
    if (prior.quote_id !== quoteId) throw orderError("This idempotency key is already attached to another quote", 409, "IDEMPOTENCY_KEY_REUSED");
    return { ...orderRecord(database, prior.id, userId), idempotent: true };
  }

  const quote = database.prepare("SELECT * FROM circuit_quotes WHERE id = ? AND user_id = ?").get(quoteId, userId);
  if (!quote) throw orderError("Circuit quote not found", 404, "CIRCUIT_QUOTE_NOT_FOUND");
  if (quote.circuit_order_id || quote.consumed_at) {
    throw orderError("This circuit quote has already been consumed", 409, "QUOTE_ALREADY_CONSUMED", { circuitOrderId: quote.circuit_order_id || null });
  }
  if (String(quote.status).toUpperCase() !== "READY") {
    throw orderError("Resolve every quote issue before creating a circuit order", 409, "QUOTE_NOT_READY");
  }
  if (new Date(quote.expires_at).getTime() <= now.getTime()) {
    throw orderError("This circuit quote has expired. Request a fresh quote", 410, "QUOTE_EXPIRED");
  }
  const quoteIssues = parseJsonArray(quote.issues);
  const lines = parseJsonArray(quote.line_items);
  if (quoteIssues.length || !lines.length) throw orderError("The circuit quote is incomplete", 409, "QUOTE_NOT_READY");
  if (new Set(lines.map((line) => String(line.itemId || ""))).size !== lines.length) {
    throw orderError("The circuit quote contains duplicate line items", 409, "QUOTE_INTEGRITY_ERROR");
  }

  const lineTotal = money(lines.reduce((sum, line) => sum + Number(line.breakdown?.totalAmount || 0), 0));
  if (lineTotal !== money(quote.total_amount)) {
    throw orderError("The circuit quote total does not match its line items", 409, "QUOTE_INTEGRITY_ERROR");
  }
  const user = database.prepare("SELECT id, name, email, phone FROM users WHERE id = ?").get(userId);
  if (!user) throw orderError("Traveler account not found", 404, "TRAVELER_NOT_FOUND");
  const contact = contactDetails(user, input);
  const orderId = `co_${nanoid(14)}`;
  const orderRef = `IHC-${nanoid(8).toUpperCase()}`;
  const holdExpiresAt = new Date(now.getTime() + HOLD_VALIDITY_MS).toISOString();

  const createOrder = database.transaction(() => {
    database.prepare(`
      INSERT INTO circuit_orders (
        id, order_ref, quote_id, itinerary_id, user_id, idempotency_key, status, currency,
        adults_count, children_count, traveler_name, traveler_email, traveler_phone,
        base_amount, taxes_amount, total_amount, hold_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId, orderRef, quote.id, quote.itinerary_id, userId, idempotencyKey, quote.currency || "INR",
      quote.adults_count, quote.children_count, contact.travelerName, contact.travelerEmail,
      contact.travelerPhone, quote.base_amount, quote.taxes_amount, quote.total_amount, holdExpiresAt,
    );

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = database.prepare(`
        SELECT p.*, s.kyb_status, s.supplier_code, s.company_name AS supplier_name
        FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?
      `).get(line.productId);
      if (!product || product.status !== "PUBLISHED" || Number(product.is_published ?? 1) !== 1) {
        throw orderError(`${line.productTitle || "Circuit item"} is no longer published`, 409, "PRODUCT_UNAVAILABLE");
      }
      if (product.kyb_status !== "APPROVED" || String(product.supplier_id) !== String(line.supplierId)) {
        throw orderError(`${line.productTitle || product.title} is no longer available from the quoted supplier`, 409, "SUPPLIER_UNAVAILABLE");
      }

      const linePickupTime = pickupTime(line);
      const availability = evaluateSupplierAvailability(database, {
        supplierId: product.supplier_id,
        productId: product.id,
        activityDate: line.activityDate,
        pickupTime: linePickupTime,
        vehicleCategory: line.vehicleCategory,
      });
      if (!availability.available) {
        throw orderError(availability.reasons[0] || `${product.title} is no longer available`, 409, "INVENTORY_UNAVAILABLE", {
          quoteLineItemId: line.itemId,
          reasons: availability.reasons,
        });
      }

      const breakdown = line.breakdown || {};
      const baseAmount = money(breakdown.baseAmount);
      const taxesAmount = money(Number(breakdown.fastagTolls || 0) + Number(breakdown.stateTax || 0) + Number(breakdown.gstAmount || 0));
      const totalAmount = money(breakdown.totalAmount);
      if (baseAmount < 0 || taxesAmount < 0 || totalAmount < 0 || money(baseAmount + taxesAmount) !== totalAmount) {
        throw orderError(`Invalid price snapshot for ${product.title}`, 409, "QUOTE_INTEGRITY_ERROR");
      }

      const orderItemId = `coi_${nanoid(14)}`;
      const bookingId = `bk_${nanoid(12)}`;
      const bookingRef = `IH-${nanoid(7).toUpperCase()}`;
      const commissionRate = resolveCommissionRate(database, product.supplier_id, product.product_type);
      const commissionAmount = money(totalAmount * commissionRate / 100);
      const supplierPayout = money(totalAmount - commissionAmount);
      const location = String(line.location || product.city || product.destination_name || "Supplier meeting point").trim();

      database.prepare(`
        INSERT INTO bookings (
          id, ref, client_request_id, circuit_order_id, circuit_order_item_id, user_id,
          product_id, supplier_id, product_code, supplier_code, product_type, variant_name,
          activity_date, pickup_time, pickup_type, pickup_location, adults, children, luggage_bags,
          vehicle_category, traveler_name, traveler_phone, traveler_email, amount_inr,
          tolls_and_tax_amount, commission_amount, commission_rate_snapshot, supplier_payout_amount,
          payment_method, payment_status, status, supplier_assignment_status, supplier_assignment_method,
          supplier_assignment_reason, assigned_supplier_product_id, supplier_assigned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MEETING_POINT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'CIRCUIT', 'PENDING', 'pending_payment', 'RESERVED_PENDING_PAYMENT', 'CIRCUIT_QUOTE_V1', ?, ?, datetime('now'))
      `).run(
        bookingId, bookingRef, `circuit:${orderId}:${line.itemId}`, orderId, orderItemId, userId,
        product.id, product.supplier_id, product.product_code || product.id,
        product.supplier_code || product.supplier_id, product.product_type, line.variantName || "Standard Booking",
        line.activityDate, linePickupTime, location,
        Number(line.adults ?? quote.adults_count), Number(line.children ?? quote.children_count), Number(line.luggage || 0),
        line.vehicleCategory || null, contact.travelerName, contact.travelerPhone, contact.travelerEmail,
        totalAmount, taxesAmount, commissionAmount, commissionRate, supplierPayout,
        "Reserved from an owned, ready circuit quote", product.id,
      );
      database.prepare(`
        INSERT INTO circuit_order_items (
          id, circuit_order_id, quote_line_item_id, booking_id, sequence_number, product_id,
          supplier_id, activity_date, pickup_time, vehicle_category, variant_name,
          base_amount, taxes_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderItemId, orderId, String(line.itemId), bookingId, index + 1, product.id,
        product.supplier_id, line.activityDate, linePickupTime, line.vehicleCategory || null,
        line.variantName || "Standard Booking", baseAmount, taxesAmount, totalAmount,
      );
      database.prepare(`
        INSERT INTO inventory_holds (
          id, circuit_order_id, circuit_order_item_id, booking_id, user_id, product_id,
          supplier_id, activity_date, pickup_time, vehicle_category, units, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        `hold_${nanoid(14)}`, orderId, orderItemId, bookingId, userId, product.id,
        product.supplier_id, line.activityDate, linePickupTime, line.vehicleCategory || null, holdExpiresAt,
      );
      database.prepare(`
        INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT')
      `).run(`pay_${nanoid(12)}`, product.supplier_id, bookingId, totalAmount, commissionAmount, supplierPayout);
    }

    const consumed = database.prepare(`
      UPDATE circuit_quotes SET consumed_at = ?, circuit_order_id = ?
      WHERE id = ? AND user_id = ? AND consumed_at IS NULL AND circuit_order_id IS NULL
    `).run(now.toISOString(), orderId, quote.id, userId);
    if (consumed.changes !== 1) throw orderError("This circuit quote has already been consumed", 409, "QUOTE_ALREADY_CONSUMED");
  });

  try {
    createOrder();
  } catch (error) {
    const existing = database.prepare("SELECT * FROM circuit_orders WHERE user_id = ? AND idempotency_key = ?").get(userId, idempotencyKey);
    if (existing && existing.quote_id === quoteId) return { ...orderRecord(database, existing.id, userId), idempotent: true };
    throw error;
  }
  return { ...orderRecord(database, orderId, userId), idempotent: false };
}

export const CIRCUIT_ORDER_HOLD_VALIDITY_MS = HOLD_VALIDITY_MS;
export const CIRCUIT_ORDER_PENDING_STATUS = ACTIVE_ORDER_STATUS;
