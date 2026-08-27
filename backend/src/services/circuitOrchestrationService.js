import { nanoid } from "nanoid";

const upper = (value) => String(value || "").trim().toUpperCase();
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function orchestrationError(message, status = 400, code = "CIRCUIT_ORCHESTRATION_ERROR") {
  return Object.assign(new Error(message), { status, code });
}

function addEvent(database, {
  orderId, requestId = null, eventKey, eventType, bookingId = null, supplierId = null,
  status, provider = null, providerReference = null, details = {}, now = new Date(),
}) {
  const existing = database.prepare("SELECT * FROM circuit_orchestration_events WHERE event_key = ?").get(eventKey);
  if (existing) return { event: existing, idempotent: true };
  const id = `coe_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO circuit_orchestration_events (
      id, circuit_order_id, management_request_id, event_key, event_type, booking_id,
      supplier_id, status, provider, provider_reference, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orderId, requestId, eventKey, eventType, bookingId, supplierId, status,
    provider, providerReference, JSON.stringify(details), now.toISOString(),
  );
  return { event: database.prepare("SELECT * FROM circuit_orchestration_events WHERE id = ?").get(id), idempotent: false };
}

function ensureReviewTask(database, orderId, taskType, notes, bookingId = null) {
  const existing = database.prepare(`
    SELECT id FROM staff_tasks
    WHERE circuit_order_id = ? AND task_type = ? AND status = 'OPEN'
    LIMIT 1
  `).get(orderId, taskType);
  if (existing) return existing.id;
  const id = `task_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO staff_tasks (
      id, task_type, booking_id, circuit_order_id, assigned_staff_name, priority, status, notes, created_at
    ) VALUES (?, ?, ?, ?, 'Circuit Operations Desk', 'CRITICAL', 'OPEN', ?, ?)
  `).run(id, taskType, bookingId, orderId, notes, new Date().toISOString());
  return id;
}

export function beginCircuitReconfirmation(database, { orderId, requestId, items, deadline, now = new Date() }) {
  const nowIso = now.toISOString();
  for (const item of items) {
    database.prepare(`
      UPDATE circuit_order_items
      SET reconfirmation_status = 'PENDING', reconfirmation_deadline = ?, reconfirmed_at = NULL
      WHERE id = ?
    `).run(deadline, item.orderItemId);
    addEvent(database, {
      orderId, requestId, eventKey: `reschedule:${requestId}:${item.bookingId}:requested`,
      eventType: "SUPPLIER_RECONFIRMATION_REQUESTED", bookingId: item.bookingId,
      supplierId: item.supplierId, status: "PENDING", details: { proposedDate: item.proposedDate, deadline }, now,
    });
  }
  database.prepare(`
    UPDATE circuit_orders SET management_status = 'SUPPLIER_RECONFIRMATION_PENDING',
      reconfirmation_status = 'PENDING', reconfirmation_deadline = ?, reconfirmed_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(deadline, nowIso, orderId);
  database.prepare(`
    UPDATE circuit_management_requests SET orchestration_status = 'SUPPLIER_RECONFIRMATION_PENDING', updated_at = ?
    WHERE id = ?
  `).run(nowIso, requestId);
}

function circuitReconfirmationContext(database, bookingId) {
  return database.prepare(`
    SELECT b.id AS booking_id, b.ref AS booking_ref, b.supplier_id, b.supplier_response_status,
      b.supplier_response_deadline, coi.id AS item_id, coi.circuit_order_id,
      coi.reconfirmation_status, coi.reconfirmation_deadline, co.order_ref,
      (SELECT id FROM circuit_management_requests
       WHERE circuit_order_id = co.id AND request_type = 'RESCHEDULE' AND status = 'APPROVED'
       ORDER BY reviewed_at DESC LIMIT 1) AS request_id
    FROM bookings b
    JOIN circuit_order_items coi ON coi.booking_id = b.id
    JOIN circuit_orders co ON co.id = coi.circuit_order_id
    WHERE b.id = ? OR b.ref = ?
  `).get(bookingId, bookingId);
}

export function respondToCircuitReconfirmation(database, { bookingId, supplierId, action, note = "", now = new Date() }) {
  const context = circuitReconfirmationContext(database, bookingId);
  if (!context) throw orchestrationError("Circuit booking not found", 404, "CIRCUIT_BOOKING_NOT_FOUND");
  if (context.supplier_id !== supplierId) throw orchestrationError("This circuit stop belongs to another supplier", 403, "SUPPLIER_MISMATCH");
  if (context.reconfirmation_status !== "PENDING") {
    throw orchestrationError(`This reconfirmation is already ${upper(context.reconfirmation_status || "closed").toLowerCase()}`, 409, "RECONFIRMATION_CLOSED");
  }
  if (context.reconfirmation_deadline && new Date(context.reconfirmation_deadline).getTime() <= now.getTime()) {
    processExpiredCircuitReconfirmations(database, { now, limit: 100 });
    return { success: false, expired: true, circuitReconfirmation: true, circuitOrderId: context.circuit_order_id, status: "RECONFIRMATION_REVIEW_REQUIRED" };
  }
  const normalizedAction = upper(action);
  const responseNote = String(note || "").trim();
  if (!["ACCEPT", "REJECT"].includes(normalizedAction)) throw orchestrationError("Choose ACCEPT or REJECT", 400, "RECONFIRMATION_ACTION_INVALID");
  if (normalizedAction === "REJECT" && responseNote.length < 5) throw orchestrationError("Add a short reason when declining the new dates", 400, "RECONFIRMATION_REASON_REQUIRED");

  const result = database.transaction(() => {
    const nowIso = now.toISOString();
    const itemStatus = normalizedAction === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    database.prepare(`
      UPDATE circuit_order_items SET reconfirmation_status = ?, reconfirmation_deadline = NULL,
        reconfirmed_at = ? WHERE id = ? AND reconfirmation_status = 'PENDING'
    `).run(itemStatus, normalizedAction === "ACCEPT" ? nowIso : null, context.item_id);
    database.prepare(`
      UPDATE bookings SET supplier_assignment_status = ?, supplier_response_status = ?,
        supplier_response_deadline = NULL, supplier_responded_at = ?, supplier_response_note = ? WHERE id = ?
    `).run(
      normalizedAction === "ACCEPT" ? "RESCHEDULE_RECONFIRMED" : "RESCHEDULE_REJECTED",
      itemStatus, nowIso, responseNote || "Supplier accepted the rescheduled dates.", context.booking_id,
    );
    addEvent(database, {
      orderId: context.circuit_order_id, requestId: context.request_id,
      eventKey: `reschedule:${context.request_id}:${context.booking_id}:${itemStatus.toLowerCase()}`,
      eventType: `SUPPLIER_RECONFIRMATION_${itemStatus}`, bookingId: context.booking_id,
      supplierId, status: itemStatus, details: { note: responseNote }, now,
    });

    if (normalizedAction === "REJECT") {
      database.prepare(`UPDATE circuit_orders SET management_status = 'RECONFIRMATION_REVIEW_REQUIRED',
        reconfirmation_status = 'REVIEW_REQUIRED', updated_at = ? WHERE id = ?`).run(nowIso, context.circuit_order_id);
      database.prepare(`UPDATE circuit_management_requests SET orchestration_status = 'RECONFIRMATION_REVIEW_REQUIRED', updated_at = ? WHERE id = ?`)
        .run(nowIso, context.request_id);
      ensureReviewTask(database, context.circuit_order_id, "CIRCUIT_RECONFIRMATION_FAILURE", `${context.booking_ref} cannot honor the new circuit dates: ${responseNote}`, context.booking_id);
      return { success: true, status: "RECONFIRMATION_REVIEW_REQUIRED", allConfirmed: false };
    }

    const pending = database.prepare(`SELECT COUNT(*) AS count FROM circuit_order_items WHERE circuit_order_id = ? AND reconfirmation_status = 'PENDING'`)
      .get(context.circuit_order_id).count;
    const blocked = database.prepare(`SELECT COUNT(*) AS count FROM circuit_order_items WHERE circuit_order_id = ? AND reconfirmation_status IN ('REJECTED', 'TIMED_OUT')`)
      .get(context.circuit_order_id).count;
    if (!Number(pending) && !Number(blocked)) {
      database.prepare(`UPDATE circuit_orders SET management_status = 'COMPLETED', reconfirmation_status = 'CONFIRMED',
        reconfirmation_deadline = NULL, reconfirmed_at = ?, updated_at = ? WHERE id = ?`)
        .run(nowIso, nowIso, context.circuit_order_id);
      database.prepare(`UPDATE circuit_management_requests SET orchestration_status = 'COMPLETED', updated_at = ? WHERE id = ?`)
        .run(nowIso, context.request_id);
      addEvent(database, {
        orderId: context.circuit_order_id, requestId: context.request_id,
        eventKey: `reschedule:${context.request_id}:all-confirmed`, eventType: "CIRCUIT_RECONFIRMED",
        status: "CONFIRMED", now,
      });
      return { success: true, status: "CONFIRMED", allConfirmed: true };
    }
    return { success: true, status: "SUPPLIER_RECONFIRMATION_PENDING", allConfirmed: false };
  })();
  return { ...result, circuitReconfirmation: true, circuitOrderId: context.circuit_order_id, bookingId: context.booking_id, bookingRef: context.booking_ref };
}

export function processExpiredCircuitReconfirmations(database, { now = new Date(), limit = 50 } = {}) {
  const expired = database.prepare(`
    SELECT coi.*, b.ref AS booking_ref FROM circuit_order_items coi
    JOIN bookings b ON b.id = coi.booking_id
    WHERE coi.reconfirmation_status = 'PENDING' AND coi.reconfirmation_deadline IS NOT NULL
      AND coi.reconfirmation_deadline <= ?
    ORDER BY coi.reconfirmation_deadline ASC LIMIT ?
  `).all(now.toISOString(), Number(limit) || 50);
  const orderIds = [...new Set(expired.map((item) => item.circuit_order_id))];
  database.transaction(() => {
    for (const item of expired) {
      database.prepare("UPDATE circuit_order_items SET reconfirmation_status = 'TIMED_OUT', reconfirmation_deadline = NULL WHERE id = ? AND reconfirmation_status = 'PENDING'")
        .run(item.id);
      database.prepare(`UPDATE bookings SET supplier_assignment_status = 'RESCHEDULE_RECONFIRMATION_TIMED_OUT',
        supplier_response_status = 'TIMED_OUT', supplier_response_deadline = NULL, supplier_responded_at = ? WHERE id = ?`)
        .run(now.toISOString(), item.booking_id);
      const request = database.prepare(`SELECT id FROM circuit_management_requests WHERE circuit_order_id = ? AND request_type = 'RESCHEDULE' AND status = 'APPROVED' ORDER BY reviewed_at DESC LIMIT 1`)
        .get(item.circuit_order_id);
      addEvent(database, {
        orderId: item.circuit_order_id, requestId: request?.id,
        eventKey: `reschedule:${request?.id}:${item.booking_id}:timed-out`, eventType: "SUPPLIER_RECONFIRMATION_TIMED_OUT",
        bookingId: item.booking_id, supplierId: item.supplier_id, status: "TIMED_OUT", now,
      });
    }
    for (const orderId of orderIds) {
      database.prepare(`UPDATE circuit_orders SET management_status = 'RECONFIRMATION_REVIEW_REQUIRED',
        reconfirmation_status = 'REVIEW_REQUIRED', updated_at = ? WHERE id = ?`).run(now.toISOString(), orderId);
      database.prepare(`UPDATE circuit_management_requests SET orchestration_status = 'RECONFIRMATION_REVIEW_REQUIRED', updated_at = ?
        WHERE id = (SELECT id FROM circuit_management_requests WHERE circuit_order_id = ? AND request_type = 'RESCHEDULE' AND status = 'APPROVED' ORDER BY reviewed_at DESC LIMIT 1)`)
        .run(now.toISOString(), orderId);
      ensureReviewTask(database, orderId, "CIRCUIT_RECONFIRMATION_SLA_BREACH", "One or more suppliers missed the grouped reschedule reconfirmation SLA.");
    }
  })();
  return { checked: expired.length, ordersReviewRequired: orderIds.length, orderIds };
}

export function registerCircuitRefundSubmission(database, { orderId, requestId, provider, refundId, amount, now = new Date() }) {
  const normalizedProvider = upper(provider);
  const immediate = normalizedProvider === "DEMO" || money(amount) <= 0;
  const state = immediate ? "RECONCILED" : "PENDING";
  database.transaction(() => {
    database.prepare(`UPDATE circuit_orders SET refund_reconciliation_status = ?, refund_reconciled_at = ?,
      management_status = ?, updated_at = ? WHERE id = ?`).run(
      state, immediate ? now.toISOString() : null, immediate ? "COMPLETED" : "REFUND_RECONCILIATION_PENDING", now.toISOString(), orderId,
    );
    database.prepare(`UPDATE circuit_management_requests SET orchestration_status = ?, refund_expected_status = 'PROCESSED',
      refund_reconciled_at = ?, updated_at = ? WHERE id = ?`).run(
      immediate ? "COMPLETED" : "REFUND_RECONCILIATION_PENDING", immediate ? now.toISOString() : null, now.toISOString(), requestId,
    );
    if (!immediate) {
      database.prepare(`UPDATE refunds SET provider_status = 'PENDING_WEBHOOK', reconciled_at = NULL
        WHERE booking_id IN (SELECT booking_id FROM circuit_order_items WHERE circuit_order_id = ?)`)
        .run(orderId);
    }
    addEvent(database, {
      orderId, requestId, eventKey: `refund:${requestId}:submitted`, eventType: "PARENT_REFUND_SUBMITTED",
      status: state, provider: normalizedProvider, providerReference: refundId,
      details: { amount: money(amount) }, now,
    });
  })();
  return { state, immediate };
}

function normalizeRefundStatus(status) {
  const value = upper(status);
  if (["SUCCESS", "PROCESSED", "REFUNDED", "COMPLETED"].includes(value)) return "PROCESSED";
  if (["FAILED", "CANCELLED", "REJECTED"].includes(value)) return "FAILED";
  return "PENDING";
}

export function reconcileCircuitRefund(database, {
  provider, eventKey, gatewayRefundId, providerStatus, amount, paymentId = null, paymentOrderId = null, now = new Date(),
}) {
  if (!eventKey) throw orchestrationError("Refund webhook event key is required", 400, "EVENT_KEY_REQUIRED");
  const prior = database.prepare("SELECT * FROM circuit_orchestration_events WHERE event_key = ?").get(eventKey);
  if (prior) return { success: true, idempotent: true, status: prior.status, circuitOrderId: prior.circuit_order_id };
  let request = gatewayRefundId ? database.prepare(`SELECT * FROM circuit_management_requests WHERE gateway_refund_id = ? ORDER BY reviewed_at DESC LIMIT 1`).get(gatewayRefundId) : null;
  if (!request && (paymentId || paymentOrderId)) {
    request = database.prepare(`
      SELECT cmr.* FROM circuit_management_requests cmr JOIN circuit_orders co ON co.id = cmr.circuit_order_id
      WHERE cmr.request_type = 'CANCELLATION' AND (co.payment_id = ? OR co.payment_order_id = ?)
      ORDER BY cmr.reviewed_at DESC LIMIT 1
    `).get(paymentId || "", paymentOrderId || "");
  }
  if (!request) return { success: true, ignored: true, reason: "CIRCUIT_REFUND_NOT_FOUND" };
  const order = database.prepare("SELECT * FROM circuit_orders WHERE id = ?").get(request.circuit_order_id);
  const normalizedStatus = normalizeRefundStatus(providerStatus);
  const receivedAmount = amount == null ? null : money(amount);
  const expectedAmount = money(request.refund_amount);
  const amountMismatch = receivedAmount != null && Math.abs(receivedAmount - expectedAmount) >= 0.01;
  const requiresReview = normalizedStatus === "FAILED" || amountMismatch;
  const nowIso = now.toISOString();

  database.transaction(() => {
    const parentState = requiresReview ? "REVIEW_REQUIRED" : normalizedStatus === "PROCESSED" ? "RECONCILED" : "PENDING";
    database.prepare(`UPDATE circuit_orders SET refund_reconciliation_status = ?, refund_reconciled_at = ?,
      management_status = ?, updated_at = ? WHERE id = ?`).run(
      parentState, parentState === "RECONCILED" ? nowIso : null,
      parentState === "RECONCILED" ? "COMPLETED" : parentState === "PENDING" ? "REFUND_RECONCILIATION_PENDING" : "REFUND_REVIEW_REQUIRED",
      nowIso, order.id,
    );
    database.prepare(`UPDATE circuit_management_requests SET gateway_status = ?, orchestration_status = ?,
      refund_reconciled_at = ?, failure_code = ?, updated_at = ? WHERE id = ?`).run(
      normalizedStatus, parentState === "RECONCILED" ? "COMPLETED" : parentState === "PENDING" ? "REFUND_RECONCILIATION_PENDING" : "REFUND_REVIEW_REQUIRED",
      parentState === "RECONCILED" ? nowIso : null,
      amountMismatch ? "REFUND_AMOUNT_MISMATCH" : normalizedStatus === "FAILED" ? "REFUND_PROVIDER_FAILED" : null,
      nowIso, request.id,
    );
    database.prepare(`UPDATE refunds SET provider_status = ?, reconciled_at = ?
      WHERE booking_id IN (SELECT booking_id FROM circuit_order_items WHERE circuit_order_id = ?)`)
      .run(normalizedStatus, parentState === "RECONCILED" ? nowIso : null, order.id);
    addEvent(database, {
      orderId: order.id, requestId: request.id, eventKey, eventType: "PARENT_REFUND_WEBHOOK",
      status: parentState, provider: upper(provider), providerReference: gatewayRefundId,
      details: { providerStatus, receivedAmount, expectedAmount, amountMismatch }, now,
    });
    if (requiresReview) {
      ensureReviewTask(database, order.id, "CIRCUIT_REFUND_RECONCILIATION", amountMismatch
        ? `Refund amount mismatch: expected ${expectedAmount}, provider reported ${receivedAmount}.`
        : `Refund ${gatewayRefundId || request.gateway_refund_id || "provider reference"} reported ${providerStatus}.`);
    }
  })();
  return { success: true, idempotent: false, status: requiresReview ? "REVIEW_REQUIRED" : normalizedStatus === "PROCESSED" ? "RECONCILED" : "PENDING", circuitOrderId: order.id };
}
