import { nanoid } from "nanoid";
import { evaluateSupplierAvailability } from "./availabilityService.js";
import { calculateRefundQuote, createRefundRecord, finalizeRefund } from "./financeService.js";
import { beginCircuitReconfirmation, registerCircuitRefundSubmission } from "./circuitOrchestrationService.js";

const ACTIVE_REQUEST_STATUSES = new Set(["PENDING", "REFUND_FAILED", "REFUND_RECONCILIATION_REQUIRED"]);
const STAFF_ROLES = new Set(["ADMIN", "STAFF"]);

function managementError(message, status = 400, code = "CIRCUIT_MANAGEMENT_ERROR", details = undefined) {
  return Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });
}

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const upper = (value) => String(value || "").trim().toUpperCase();

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function dateValue(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw managementError("Enter a valid new circuit start date", 400, "INVALID_START_DATE");
  }
  return normalized;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86_400_000);
}

function reconfirmationHours() {
  const configured = Number(process.env.CIRCUIT_RECONFIRMATION_HOURS);
  return Number.isFinite(configured) && configured >= 1 && configured <= 168 ? configured : 24;
}

function requestView(row) {
  if (!row) return null;
  return {
    requestId: row.id,
    requestRef: row.request_ref,
    orderId: row.circuit_order_id,
    orderRef: row.order_ref || null,
    userId: row.user_id,
    travelerName: row.traveler_name || null,
    type: row.request_type,
    status: row.status,
    reason: row.reason,
    requestedChanges: parseJson(row.requested_changes, {}),
    policySnapshot: parseJson(row.policy_snapshot, {}),
    refundAmount: Number(row.refund_amount || 0),
    cancellationFeeAmount: Number(row.cancellation_fee_amount || 0),
    gatewayRefundId: row.gateway_refund_id || null,
    gatewayStatus: row.gateway_status || null,
    failureCode: row.failure_code || null,
    resolution: row.resolution || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    orchestrationStatus: row.orchestration_status || "NOT_STARTED",
    refundExpectedStatus: row.refund_expected_status || null,
    refundReconciledAt: row.refund_reconciled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount: Number(row.item_count || 0),
    totalAmount: Number(row.total_amount || 0),
  };
}

function findOrder(database, target, actor, { staffOnly = false } = {}) {
  const order = database.prepare("SELECT * FROM circuit_orders WHERE id = ? OR order_ref = ?").get(target, target);
  if (!order) throw managementError("Circuit order not found", 404, "CIRCUIT_ORDER_NOT_FOUND");
  const role = upper(actor?.role);
  if (staffOnly && !STAFF_ROLES.has(role)) throw managementError("Operations access required", 403, "OPS_ACCESS_REQUIRED");
  if (!STAFF_ROLES.has(role) && order.user_id !== actor?.id) {
    throw managementError("Circuit order not found", 404, "CIRCUIT_ORDER_NOT_FOUND");
  }
  return order;
}

function orderItems(database, orderId) {
  return database.prepare(`
    SELECT coi.*, b.ref AS booking_ref, b.status AS booking_status, b.payment_status,
      b.payment_method, b.amount_inr, b.created_at AS booking_created_at,
      b.supplier_assignment_status, p.title AS product_title,
      COALESCE(p.cancellation_policy, 'FLEXIBLE_24H') AS cancellation_policy,
      s.company_name AS supplier_name
    FROM circuit_order_items coi
    JOIN bookings b ON b.id = coi.booking_id
    LEFT JOIN products p ON p.id = coi.product_id
    LEFT JOIN suppliers s ON s.id = coi.supplier_id
    WHERE coi.circuit_order_id = ? ORDER BY coi.sequence_number
  `).all(orderId);
}

function assertManageable(order, items) {
  if (order.status !== "CONFIRMED" || order.payment_status !== "PAID") {
    throw managementError("Only a paid, confirmed circuit can be managed", 409, "CIRCUIT_NOT_MANAGEABLE");
  }
  if (!items.length) throw managementError("Circuit order has no child bookings", 409, "CIRCUIT_INTEGRITY_ERROR");
  if (["SUPPLIER_RECONFIRMATION_PENDING", "RECONFIRMATION_REVIEW_REQUIRED"].includes(order.management_status)) {
    throw managementError("Complete the current supplier reconfirmation before starting another circuit change", 409, "CIRCUIT_ORCHESTRATION_OPEN");
  }
  const blocked = items.filter((item) => ["completed", "in_progress", "cancelled"].includes(String(item.booking_status).toLowerCase()));
  if (blocked.length) {
    throw managementError("A circuit cannot be changed after a stop starts, completes, or is cancelled", 409, "CIRCUIT_CHILD_NOT_MANAGEABLE", {
      bookingRefs: blocked.map((item) => item.booking_ref),
    });
  }
}

export function previewCircuitCancellation(database, target, actor, { now = new Date() } = {}) {
  const order = findOrder(database, target, actor);
  const items = orderItems(database, order.id);
  assertManageable(order, items);
  const lines = items.map((item) => {
    const quote = calculateRefundQuote(database, {
      ...item,
      id: item.booking_id,
      ref: item.booking_ref,
      activity_date: item.activity_date,
      pickup_time: item.pickup_time,
      amount_inr: item.amount_inr,
      created_at: item.booking_created_at,
    }, { now });
    return {
      orderItemId: item.id,
      bookingId: item.booking_id,
      bookingRef: item.booking_ref,
      sequenceNumber: Number(item.sequence_number),
      productTitle: item.product_title || item.variant_name || "Circuit experience",
      supplierName: item.supplier_name || null,
      supplierId: item.supplier_id,
      activityDate: item.activity_date,
      pickupTime: item.pickup_time,
      totalAmount: quote.totalAmount,
      refundPercentage: quote.refundPercentage,
      refundAmount: quote.refundAmount,
      cancellationFee: quote.cancellationFee,
      policy: quote.cancellationPolicy,
      policyTier: quote.policyTier,
    };
  });
  return {
    type: "CANCELLATION",
    orderId: order.id,
    orderRef: order.order_ref,
    currency: order.currency,
    itemCount: lines.length,
    totalAmount: money(lines.reduce((sum, item) => sum + item.totalAmount, 0)),
    refundAmount: money(lines.reduce((sum, item) => sum + item.refundAmount, 0)),
    cancellationFeeAmount: money(lines.reduce((sum, item) => sum + item.cancellationFee, 0)),
    items: lines,
  };
}

function rescheduleCutoff(policy) {
  if (upper(policy) === "MODERATE_48H") return 48;
  if (["STRICT", "STRICT_7D"].includes(upper(policy))) return 168;
  if (upper(policy) === "NON_REFUNDABLE") return 72;
  return 24;
}

export function previewCircuitReschedule(database, target, actor, { newStartDate, now = new Date() } = {}) {
  const order = findOrder(database, target, actor);
  const items = orderItems(database, order.id);
  assertManageable(order, items);
  const targetStart = dateValue(newStartDate);
  const currentStart = [...items].sort((a, b) => a.activity_date.localeCompare(b.activity_date))[0].activity_date;
  const shiftDays = daysBetween(currentStart, targetStart);
  if (!shiftDays) throw managementError("Choose a different start date", 400, "START_DATE_UNCHANGED");
  const today = now.toISOString().slice(0, 10);
  if (targetStart <= today) throw managementError("The new circuit must start after today", 400, "START_DATE_IN_PAST");

  const lines = items.map((item) => {
    const proposedDate = shiftDate(item.activity_date, shiftDays);
    const pickupAt = new Date(`${item.activity_date}T${item.pickup_time || "09:00"}:00`).getTime();
    const hoursUntilPickup = Math.max(0, Math.round(((pickupAt - now.getTime()) / 3_600_000) * 10) / 10);
    const cutoffHours = rescheduleCutoff(item.cancellation_policy);
    const availability = evaluateSupplierAvailability(database, {
      supplierId: item.supplier_id,
      productId: item.product_id,
      activityDate: proposedDate,
      pickupTime: item.pickup_time,
      vehicleCategory: item.vehicle_category,
    });
    const reasons = [];
    if (hoursUntilPickup < cutoffHours) reasons.push(`${cutoffHours}h modification deadline has passed`);
    if (!availability.available) reasons.push(...availability.reasons);
    return {
      orderItemId: item.id,
      bookingId: item.booking_id,
      bookingRef: item.booking_ref,
      sequenceNumber: Number(item.sequence_number),
      productTitle: item.product_title || item.variant_name || "Circuit experience",
      supplierName: item.supplier_name || null,
      currentDate: item.activity_date,
      proposedDate,
      pickupTime: item.pickup_time,
      policy: item.cancellation_policy,
      cutoffHours,
      hoursUntilPickup,
      available: reasons.length === 0,
      reasons,
    };
  });
  const blockers = lines.flatMap((item) => item.reasons.map((reason) => ({ bookingRef: item.bookingRef, reason })));
  return {
    type: "RESCHEDULE",
    orderId: order.id,
    orderRef: order.order_ref,
    currentStartDate: currentStart,
    newStartDate: targetStart,
    shiftDays,
    eligible: blockers.length === 0,
    blockers,
    items: lines,
  };
}

export function getCircuitManagement(database, target, actor, { now = new Date() } = {}) {
  const order = findOrder(database, target, actor);
  const requests = database.prepare(`
    SELECT * FROM circuit_management_requests WHERE circuit_order_id = ? ORDER BY created_at DESC
  `).all(order.id).map(requestView);
  let cancellationPreview = null;
  if (order.status === "CONFIRMED" && order.payment_status === "PAID") {
    try { cancellationPreview = previewCircuitCancellation(database, order.id, actor, { now }); } catch {}
  }
  return {
    orderId: order.id,
    orderRef: order.order_ref,
    managementStatus: order.management_status || "NONE",
    currentRequest: requests.find((request) => ACTIVE_REQUEST_STATUSES.has(request.status)) || null,
    requests,
    cancellationPreview,
  };
}

export function createCircuitManagementRequest(database, target, input, actor, { now = new Date() } = {}) {
  const order = findOrder(database, target, actor);
  const type = upper(input?.type);
  if (!["CANCELLATION", "RESCHEDULE"].includes(type)) {
    throw managementError("Choose cancellation or reschedule", 400, "REQUEST_TYPE_INVALID");
  }
  const reason = String(input?.reason || "").trim();
  if (reason.length < 5 || reason.length > 1000) throw managementError("Add a reason of at least 5 characters", 400, "REASON_REQUIRED");
  const idempotencyKey = String(input?.idempotencyKey || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw managementError("Provide an idempotency key between 8 and 160 characters", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }
  const prior = database.prepare("SELECT * FROM circuit_management_requests WHERE circuit_order_id = ? AND idempotency_key = ?").get(order.id, idempotencyKey);
  if (prior) {
    if (prior.request_type !== type) throw managementError("This idempotency key belongs to another circuit action", 409, "IDEMPOTENCY_KEY_REUSED");
    return { request: requestView(prior), idempotent: true };
  }
  const active = database.prepare(`SELECT * FROM circuit_management_requests WHERE circuit_order_id = ? AND status IN ('PENDING','REFUND_FAILED','REFUND_RECONCILIATION_REQUIRED') ORDER BY created_at DESC LIMIT 1`).get(order.id);
  if (active) throw managementError("This circuit already has an open operations request", 409, "MANAGEMENT_REQUEST_OPEN", { requestId: active.id });

  const preview = type === "CANCELLATION"
    ? previewCircuitCancellation(database, order.id, actor, { now })
    : previewCircuitReschedule(database, order.id, actor, { newStartDate: input.newStartDate, now });
  if (type === "RESCHEDULE" && !preview.eligible) {
    throw managementError("One or more circuit stops cannot move to the requested dates", 409, "RESCHEDULE_NOT_AVAILABLE", { blockers: preview.blockers });
  }
  const id = `cmr_${nanoid(14)}`;
  const requestRef = `CM-${nanoid(8).toUpperCase()}`;
  const managementStatus = type === "CANCELLATION" ? "PENDING_CANCELLATION" : "PENDING_RESCHEDULE";
  const requestedChanges = type === "RESCHEDULE"
    ? { newStartDate: preview.newStartDate, shiftDays: preview.shiftDays, items: preview.items }
    : { cancelAllItems: true };
  database.transaction(() => {
    database.prepare(`
      INSERT INTO circuit_management_requests (
        id, request_ref, circuit_order_id, user_id, request_type, reason, idempotency_key,
        requested_changes, policy_snapshot, refund_amount, cancellation_fee_amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, requestRef, order.id, order.user_id, type, reason, idempotencyKey,
      JSON.stringify(requestedChanges), JSON.stringify(preview),
      type === "CANCELLATION" ? preview.refundAmount : 0,
      type === "CANCELLATION" ? preview.cancellationFeeAmount : 0,
      now.toISOString(), now.toISOString(),
    );
    database.prepare("UPDATE circuit_orders SET management_status = ?, updated_at = ? WHERE id = ?")
      .run(managementStatus, now.toISOString(), order.id);
    database.prepare(`
      INSERT INTO staff_tasks (id, task_type, circuit_order_id, assigned_staff_name, priority, status, notes, created_at)
      VALUES (?, ?, ?, 'Circuit Operations Desk', 'HIGH', 'OPEN', ?, ?)
    `).run(`task_${nanoid(12)}`, `CIRCUIT_${type}`, order.id, `${requestRef} · ${order.order_ref} · ${reason}`, now.toISOString());
  })();
  return { request: requestView(database.prepare("SELECT * FROM circuit_management_requests WHERE id = ?").get(id)), idempotent: false };
}

export function listCircuitManagementRequests(database, { status = "", type = "" } = {}) {
  const conditions = [];
  const values = [];
  if (status) { conditions.push("cmr.status = ?"); values.push(upper(status)); }
  if (type) { conditions.push("cmr.request_type = ?"); values.push(upper(type)); }
  return database.prepare(`
    SELECT cmr.*, co.order_ref, co.total_amount, co.traveler_name,
      (SELECT COUNT(*) FROM circuit_order_items coi WHERE coi.circuit_order_id = co.id) AS item_count
    FROM circuit_management_requests cmr
    JOIN circuit_orders co ON co.id = cmr.circuit_order_id
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY CASE cmr.status WHEN 'PENDING' THEN 0 WHEN 'REFUND_FAILED' THEN 1 ELSE 2 END, cmr.created_at ASC
  `).all(...values).map(requestView);
}

function resolveTask(database, orderId, status, note) {
  database.prepare(`UPDATE staff_tasks SET status = ?, notes = COALESCE(notes, '') || ? WHERE circuit_order_id = ? AND status = 'OPEN'`)
    .run(status, `\n${note}`, orderId);
}

function applyReschedule(database, request, order, actor, now) {
  const changes = parseJson(request.requested_changes, {});
  const preview = previewCircuitReschedule(database, order.id, actor, { newStartDate: changes.newStartDate, now });
  if (!preview.eligible) throw managementError("The requested circuit dates are no longer available", 409, "RESCHEDULE_NOT_AVAILABLE", { blockers: preview.blockers });
  const deadline = new Date(now.getTime() + reconfirmationHours() * 3_600_000).toISOString();
  database.transaction(() => {
    for (const item of preview.items) {
      const modificationId = `mod_${nanoid(12)}`;
      database.prepare(`
        UPDATE bookings SET original_activity_date = COALESCE(original_activity_date, activity_date),
          activity_date = ?, rescheduled_at = ?, supplier_assignment_status = 'RESCHEDULED_RECONFIRMATION_REQUIRED',
          supplier_response_status = 'PENDING', supplier_response_deadline = ? WHERE id = ?
      `).run(item.proposedDate, now.toISOString(), deadline, item.bookingId);
      database.prepare("UPDATE circuit_order_items SET activity_date = ?, status = 'RESCHEDULED' WHERE id = ?")
        .run(item.proposedDate, item.orderItemId);
      database.prepare(`
        INSERT INTO booking_modifications (
          id, booking_id, requested_by, modification_type, original_value, requested_value,
          status, supplier_notes, created_at, resolved_at
        ) VALUES (?, ?, ?, 'CIRCUIT_RESCHEDULE', ?, ?, 'APPLIED', ?, ?, ?)
      `).run(
        modificationId, item.bookingId, request.user_id,
        JSON.stringify({ date: item.currentDate, time: item.pickupTime }),
        JSON.stringify({ date: item.proposedDate, time: item.pickupTime }),
        request.reason, now.toISOString(), now.toISOString(),
      );
    }
    beginCircuitReconfirmation(database, {
      orderId: order.id,
      requestId: request.id,
      items: preview.items,
      deadline,
      now,
    });
    database.prepare(`UPDATE circuit_orders SET rescheduled_at = ?, updated_at = ? WHERE id = ?`)
      .run(now.toISOString(), now.toISOString(), order.id);
    database.prepare(`UPDATE circuit_management_requests SET status = 'APPROVED', resolution = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
      .run("All circuit stops rescheduled atomically; suppliers must reconfirm.", actor.id, now.toISOString(), now.toISOString(), request.id);
    resolveTask(database, order.id, "RESOLVED", `${request.request_ref} approved by ${actor.id}`);
  })();
}

async function applyCancellation(database, request, order, actor, now, refundProcessor) {
  const reconcilingCapturedRefund = request.status === "REFUND_RECONCILIATION_REQUIRED" && request.gateway_refund_id;
  const preview = reconcilingCapturedRefund
    ? parseJson(request.policy_snapshot, {})
    : previewCircuitCancellation(database, order.id, actor, { now });
  let providerResult = reconcilingCapturedRefund
    ? { refundId: request.gateway_refund_id, status: request.gateway_status || "PROCESSED", amount: preview.refundAmount }
    : { refundId: null, status: "NOT_APPLICABLE" };
  if (preview.refundAmount > 0 && !reconcilingCapturedRefund) {
    try {
      providerResult = await refundProcessor({ order, request, preview });
    } catch (error) {
      database.transaction(() => {
        database.prepare(`UPDATE circuit_management_requests SET status = 'REFUND_FAILED', gateway_status = 'FAILED', failure_code = ?, resolution = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
          .run("REFUND_PROVIDER_FAILED", String(error.message || "Refund provider failed").slice(0, 1000), actor.id, now.toISOString(), now.toISOString(), request.id);
        database.prepare(`UPDATE circuit_orders SET management_status = 'REFUND_REVIEW_REQUIRED', updated_at = ? WHERE id = ?`).run(now.toISOString(), order.id);
      })();
      throw managementError("The parent refund failed; no child booking was cancelled. Operations can safely retry.", 502, "REFUND_PROVIDER_FAILED");
    }
  }

  try {
    database.transaction(() => {
      for (const item of preview.items) {
        const booking = database.prepare("SELECT * FROM bookings WHERE id = ?").get(item.bookingId);
        const refund = createRefundRecord(database, {
          booking,
          quote: {
            refundAmount: item.refundAmount,
            refundPercentage: item.refundPercentage,
            policyTier: item.policyTier,
          },
          reason: request.reason,
          actorId: actor.id,
        });
        finalizeRefund(database, { booking, refund, providerResult });
        database.prepare("UPDATE bookings SET cancellation_reason = ? WHERE id = ?").run(request.reason, item.bookingId);
      }
      database.prepare("UPDATE circuit_order_items SET status = 'CANCELLED' WHERE circuit_order_id = ?").run(order.id);
      const parentPaymentStatus = preview.refundAmount >= Number(order.total_amount)
        ? "REFUNDED"
        : preview.refundAmount > 0 ? "PARTIALLY_REFUNDED" : "PAID";
      database.prepare(`
        UPDATE circuit_orders SET status = 'CANCELLED', management_status = 'COMPLETED', payment_status = ?,
          refunded_amount = ?, cancellation_fee_amount = ?, cancelled_at = ?, refunded_at = ?, updated_at = ? WHERE id = ?
      `).run(
        parentPaymentStatus, preview.refundAmount, preview.cancellationFeeAmount, now.toISOString(),
        preview.refundAmount > 0 ? now.toISOString() : null, now.toISOString(), order.id,
      );
      database.prepare(`
        UPDATE circuit_management_requests SET status = 'APPROVED', refund_amount = ?, cancellation_fee_amount = ?,
          gateway_refund_id = ?, gateway_status = ?, failure_code = NULL, resolution = ?, reviewed_by = ?,
          reviewed_at = ?, updated_at = ? WHERE id = ?
      `).run(
        preview.refundAmount, preview.cancellationFeeAmount, providerResult.refundId || null,
        providerResult.status || "PROCESSED", `All ${preview.itemCount} circuit stops cancelled atomically.`,
        actor.id, now.toISOString(), now.toISOString(), request.id,
      );
      registerCircuitRefundSubmission(database, {
        orderId: order.id,
        requestId: request.id,
        provider: order.payment_provider || "DEMO",
        refundId: providerResult.refundId || null,
        amount: preview.refundAmount,
        now,
      });
      resolveTask(database, order.id, "RESOLVED", `${request.request_ref} approved by ${actor.id}`);
    })();
  } catch (error) {
    database.prepare(`UPDATE circuit_management_requests SET status = 'REFUND_RECONCILIATION_REQUIRED', gateway_refund_id = ?, gateway_status = ?, failure_code = 'DATABASE_FINALIZATION_FAILED', resolution = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
      .run(providerResult.refundId || null, providerResult.status || "PROCESSED", String(error.message).slice(0, 1000), actor.id, now.toISOString(), now.toISOString(), request.id);
    database.prepare(`UPDATE circuit_orders SET management_status = 'REFUND_RECONCILIATION_REQUIRED', updated_at = ? WHERE id = ?`).run(now.toISOString(), order.id);
    throw managementError("Refund was acknowledged but database reconciliation is required", 500, "REFUND_RECONCILIATION_REQUIRED");
  }
}

export async function reviewCircuitManagementRequest(database, requestId, input, actor, {
  now = new Date(),
  refundProcessor = async () => { throw new Error("Refund provider is not configured"); },
} = {}) {
  if (!STAFF_ROLES.has(upper(actor?.role))) throw managementError("Operations access required", 403, "OPS_ACCESS_REQUIRED");
  const request = database.prepare("SELECT * FROM circuit_management_requests WHERE id = ? OR request_ref = ?").get(requestId, requestId);
  if (!request) throw managementError("Circuit management request not found", 404, "MANAGEMENT_REQUEST_NOT_FOUND");
  const order = findOrder(database, request.circuit_order_id, actor, { staffOnly: true });
  const action = upper(input?.action);
  const resolution = String(input?.resolution || "").trim();
  if (!["APPROVE", "REJECT"].includes(action)) throw managementError("Choose approve or reject", 400, "REVIEW_ACTION_INVALID");
  if (resolution.length < 5) throw managementError("Add an operations resolution", 400, "RESOLUTION_REQUIRED");
  if (request.status === "APPROVED" || request.status === "REJECTED") return { request: requestView(request), idempotent: true };
  if (!ACTIVE_REQUEST_STATUSES.has(request.status)) throw managementError(`Request is ${request.status.toLowerCase()}`, 409, "REQUEST_NOT_REVIEWABLE");

  if (action === "REJECT") {
    database.transaction(() => {
      database.prepare(`UPDATE circuit_management_requests SET status = 'REJECTED', resolution = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
        .run(resolution, actor.id, now.toISOString(), now.toISOString(), request.id);
      database.prepare(`UPDATE circuit_orders SET management_status = 'NONE', updated_at = ? WHERE id = ?`).run(now.toISOString(), order.id);
      resolveTask(database, order.id, "RESOLVED", `${request.request_ref} rejected by ${actor.id}: ${resolution}`);
    })();
  } else if (request.request_type === "RESCHEDULE") {
    applyReschedule(database, request, order, actor, now);
  } else {
    await applyCancellation(database, request, order, actor, now, refundProcessor);
  }
  return {
    request: requestView(database.prepare("SELECT * FROM circuit_management_requests WHERE id = ?").get(request.id)),
    idempotent: false,
  };
}
