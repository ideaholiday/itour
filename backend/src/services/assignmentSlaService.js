import { nanoid } from "nanoid";
import { assignmentReason, findAutomaticSupplierAssignment } from "./supplierAssignmentService.js";
import { notifyAssignmentUpdate, queueNotification } from "./notificationService.js";

export const DEFAULT_SUPPLIER_ACCEPTANCE_MINUTES = 10;

function queueAssignmentNotification(db, bookingId, result, label) {
  const notificationsAvailable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_deliveries'").get();
  if (notificationsAvailable) queueNotification(notifyAssignmentUpdate(db, bookingId, result), label);
}

const acceptanceMinutes = () => {
  const configured = Number(process.env.SUPPLIER_ACCEPTANCE_MINUTES);
  return Number.isFinite(configured) && configured >= 1 && configured <= 120
    ? configured
    : DEFAULT_SUPPLIER_ACCEPTANCE_MINUTES;
};

export function supplierAcceptanceDeadline(now = new Date(), minutes = acceptanceMinutes()) {
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

export function beginSupplierAcceptance(db, bookingId, now = new Date()) {
  const deadline = supplierAcceptanceDeadline(now);
  const booking = db.prepare("SELECT assignment_round FROM bookings WHERE id = ?").get(bookingId);
  if (!booking) throw new Error("Booking not found while starting supplier acceptance");
  db.prepare(`
    UPDATE bookings
    SET supplier_assignment_status = 'AWAITING_ACCEPTANCE', supplier_response_status = 'PENDING',
        supplier_response_deadline = ?, supplier_responded_at = NULL, supplier_response_note = NULL
    WHERE id = ?
  `).run(deadline, bookingId);
  db.prepare(`
    UPDATE supplier_assignment_attempts
    SET response_status = 'PENDING'
    WHERE booking_id = ? AND assignment_round = ? AND decision = 'SELECTED'
  `).run(bookingId, Number(booking.assignment_round) || 1);
  return deadline;
}

function bookingQuote(db, booking) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(booking.product_id);
  if (!product) throw Object.assign(new Error("Booked product is unavailable for fallback assignment"), { status: 409 });
  return {
    product,
    activityDate: booking.activity_date,
    adults: Number(booking.adults) || 1,
    children: Number(booking.children) || 0,
    luggage: Number(booking.luggage_bags) || 0,
    vehicleCategory: booking.vehicle_category,
    variantName: booking.variant_name,
    totalAmount: Number(booking.amount_inr) || 0,
  };
}

function bookingInput(booking) {
  return {
    pickup_lat: booking.pickup_lat,
    pickup_lng: booking.pickup_lng,
    drop_lat: booking.drop_lat,
    drop_lng: booking.drop_lng,
    pickup_time: booking.pickup_time,
  };
}

function insertAssignmentRound(db, bookingId, assignment, round) {
  const insertAttempt = db.prepare(`
    INSERT INTO supplier_assignment_attempts (
      id, booking_id, supplier_id, candidate_product_id, coverage_zone_id, decision,
      score, candidate_price, vehicle_category, assignment_round, response_status,
      rejection_reasons, score_breakdown
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const candidate of assignment.candidates) {
    const isSelected = assignment.selected
      && candidate.supplierId === assignment.selected.supplierId
      && candidate.candidateProductId === assignment.selected.candidateProductId;
    insertAttempt.run(
      `asa_${nanoid(12)}`,
      bookingId,
      candidate.supplierId,
      candidate.candidateProductId,
      candidate.coverage?.fence?.id || null,
      isSelected ? "SELECTED" : candidate.eligible ? "ELIGIBLE_NOT_SELECTED" : "REJECTED",
      candidate.score,
      candidate.candidatePrice,
      candidate.vehicleCategory,
      round,
      isSelected ? "PENDING" : "NOT_SELECTED",
      JSON.stringify(candidate.rejectionReasons),
      JSON.stringify(candidate.scoreBreakdown),
    );
  }
}

export function fallbackSupplierAssignment(db, booking, { outcome, note, now = new Date() }) {
  const currentRound = Number(booking.assignment_round) || 1;
  const previousSupplierIds = db.prepare(`
    SELECT DISTINCT supplier_id FROM supplier_assignment_attempts
    WHERE booking_id = ? AND (response_status IN ('REJECTED', 'TIMED_OUT') OR decision IN ('DECLINED', 'TIMED_OUT'))
  `).all(booking.id).map((item) => item.supplier_id);
  if (!previousSupplierIds.includes(booking.supplier_id)) previousSupplierIds.push(booking.supplier_id);

  const assignment = findAutomaticSupplierAssignment(db, {
    quote: bookingQuote(db, booking),
    input: bookingInput(booking),
    excludedSupplierIds: previousSupplierIds,
  });
  const nextRound = currentRound + 1;
  const selected = assignment.selected;
  const responseStatus = outcome === "TIMED_OUT" ? "TIMED_OUT" : "REJECTED";

  const result = db.transaction(() => {
    const latest = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booking.id);
    if (!latest || latest.supplier_id !== booking.supplier_id || Number(latest.assignment_round) !== currentRound || latest.supplier_response_status !== "PENDING") {
      return { changed: false, status: latest?.supplier_assignment_status || "UNCHANGED" };
    }
    db.prepare(`
      UPDATE supplier_assignment_attempts
      SET decision = ?, response_status = ?, response_at = ?, response_note = ?
      WHERE booking_id = ? AND assignment_round = ? AND decision = 'SELECTED'
    `).run(outcome === "TIMED_OUT" ? "TIMED_OUT" : "DECLINED", responseStatus, now.toISOString(), note, booking.id, currentRound);

    if (!selected) {
      db.prepare(`
        UPDATE bookings
        SET supplier_id = NULL, supplier_assignment_status = 'MANUAL_REVIEW_REQUIRED',
            supplier_response_status = ?, supplier_response_deadline = NULL,
            supplier_responded_at = ?, supplier_response_note = ?, supplier_assignment_reason = ?,
            supplier_assignment_score = NULL, assigned_supplier_product_id = NULL
        WHERE id = ?
      `).run(responseStatus, now.toISOString(), note, "No eligible fallback supplier remained after the response SLA.", booking.id);
      db.prepare("UPDATE payouts SET payout_status = 'ASSIGNMENT_PENDING' WHERE booking_id = ?").run(booking.id);
      db.prepare(`
        INSERT INTO staff_tasks (id, task_type, booking_id, assigned_staff_name, priority, status, notes)
        VALUES (?, 'SUPPLIER_ASSIGNMENT_FAILURE', ?, 'Marketplace Operations', 'CRITICAL', 'OPEN', ?)
      `).run(`task_sla_${nanoid(10)}`, booking.id, `Round ${currentRound} ${responseStatus.toLowerCase()}. No eligible replacement supplier found.`);
      return { changed: true, status: "MANUAL_REVIEW_REQUIRED", replacement: null, candidatesChecked: assignment.candidates.length };
    }

    const commissionAmount = Math.round(Number(booking.amount_inr) * Number(selected.commissionRate) / 100);
    const payoutAmount = Number(booking.amount_inr) - commissionAmount;
    const deadline = supplierAcceptanceDeadline(now);
    const reason = assignmentReason(selected);
    db.prepare(`
      UPDATE bookings
      SET supplier_id = ?, supplier_assignment_status = 'AWAITING_ACCEPTANCE', supplier_assignment_method = 'SLA_FALLBACK',
          supplier_assignment_score = ?, supplier_assignment_reason = ?, assigned_supplier_product_id = ?, supplier_assigned_at = ?,
          supplier_response_status = 'PENDING', supplier_response_deadline = ?, supplier_responded_at = NULL,
          supplier_response_note = NULL, assignment_round = ?, commission_amount = ?, commission_rate_snapshot = ?, supplier_payout_amount = ?
      WHERE id = ?
    `).run(selected.supplierId, selected.score, reason, selected.candidateProductId, now.toISOString(), deadline, nextRound, commissionAmount, selected.commissionRate, payoutAmount, booking.id);
    db.prepare("UPDATE payouts SET supplier_id = ?, commission_amount = ?, net_payout = ?, payout_status = 'PAYMENT_HELD' WHERE booking_id = ?")
      .run(selected.supplierId, commissionAmount, payoutAmount, booking.id);
    insertAssignmentRound(db, booking.id, assignment, nextRound);
    return {
      changed: true,
      status: "AWAITING_ACCEPTANCE",
      replacement: { supplierId: selected.supplierId, supplierName: selected.supplierName, score: selected.score, deadline, round: nextRound },
      candidatesChecked: assignment.candidates.length,
    };
  })();
  if (result.changed) queueAssignmentNotification(db, booking.id, result, "Supplier fallback notification");
  return result;
}

export function respondToSupplierAssignment(db, { bookingId, supplierId, action, note = "", now = new Date() }) {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
  if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });
  if (booking.supplier_id !== supplierId) throw Object.assign(new Error("This assignment belongs to another supplier"), { status: 403 });
  if (booking.payment_status !== "PAID") throw Object.assign(new Error("Supplier response starts only after payment"), { status: 409 });
  if (booking.supplier_response_status !== "PENDING") throw Object.assign(new Error(`This assignment is already ${String(booking.supplier_response_status || "closed").toLowerCase()}`), { status: 409 });
  if (booking.supplier_response_deadline && new Date(booking.supplier_response_deadline).getTime() <= now.getTime()) {
    const fallback = fallbackSupplierAssignment(db, booking, { outcome: "TIMED_OUT", note: "Supplier response window expired", now });
    return { success: false, expired: true, ...fallback };
  }

  const normalizedAction = String(action || "").trim().toUpperCase();
  const responseNote = String(note || "").trim();
  if (!['ACCEPT', 'REJECT'].includes(normalizedAction)) throw Object.assign(new Error("Choose ACCEPT or REJECT"), { status: 400 });
  if (normalizedAction === "REJECT" && responseNote.length < 5) throw Object.assign(new Error("Add a short reason when rejecting an assignment"), { status: 400 });

  if (normalizedAction === "ACCEPT") {
    const result = db.transaction(() => {
      const updated = db.prepare(`
        UPDATE bookings SET supplier_assignment_status = 'SUPPLIER_ACCEPTED', supplier_response_status = 'ACCEPTED',
          supplier_responded_at = ?, supplier_response_note = ?, supplier_response_deadline = NULL
        WHERE id = ? AND supplier_id = ? AND supplier_response_status = 'PENDING'
      `).run(now.toISOString(), responseNote || "Supplier accepted the booking.", booking.id, supplierId);
      if (!updated.changes) throw Object.assign(new Error("Assignment response was already processed"), { status: 409 });
      db.prepare(`
        UPDATE supplier_assignment_attempts SET response_status = 'ACCEPTED', response_at = ?, response_note = ?
        WHERE booking_id = ? AND assignment_round = ? AND decision = 'SELECTED'
      `).run(now.toISOString(), responseNote || "Supplier accepted the booking.", booking.id, Number(booking.assignment_round) || 1);
      return { success: true, status: "SUPPLIER_ACCEPTED", bookingId: booking.id, bookingRef: booking.ref };
    })();
    queueAssignmentNotification(db, booking.id, result, "Supplier acceptance notification");
    return result;
  }

  return { success: true, ...fallbackSupplierAssignment(db, booking, { outcome: "REJECTED", note: responseNote, now }) };
}

export function processExpiredSupplierAssignments(db, { now = new Date(), limit = 25 } = {}) {
  const expired = db.prepare(`
    SELECT * FROM bookings
    WHERE supplier_response_status = 'PENDING' AND supplier_response_deadline IS NOT NULL
      AND supplier_response_deadline <= ?
    ORDER BY supplier_response_deadline ASC LIMIT ?
  `).all(now.toISOString(), Number(limit) || 25);
  const results = expired.map((booking) => fallbackSupplierAssignment(db, booking, {
    outcome: "TIMED_OUT",
    note: "Supplier response window expired",
    now,
  }));
  return {
    checked: expired.length,
    reassigned: results.filter((item) => item.replacement).length,
    manualReview: results.filter((item) => item.status === "MANUAL_REVIEW_REQUIRED").length,
    results,
  };
}
