import { nanoid } from "nanoid";
import { calculateRefundQuote } from "./financeService.js";

const CASE_TYPES = new Set(["CANCELLATION", "COMPLAINT", "REFUND_DISPUTE", "SAFETY", "OTHER"]);
const CASE_STATUSES = new Set(["OPEN", "UNDER_REVIEW", "AWAITING_GUEST", "AWAITING_SUPPLIER", "APPROVED", "REJECTED", "RESOLVED", "CLOSED"]);
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);
const clean = (value, max = 2000) => String(value || "").trim().slice(0, max);
const supportError = (message, status = 400) => Object.assign(new Error(message), { status });
const plusHours = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

export function supportCase(database, ref) {
  return database.prepare(`
    SELECT sc.*, b.ref AS booking_ref, b.user_id, b.traveler_name, b.traveler_email,
      b.traveler_phone, b.activity_date, b.pickup_time, b.pickup_location, b.amount_inr,
      b.payment_status, b.status AS booking_status, b.razorpay_payment_id,
      p.title AS product_title, p.cancellation_policy, s.company_name AS supplier_name
    FROM support_cases sc
    JOIN bookings b ON b.id = sc.booking_id
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = sc.supplier_id
    WHERE sc.id = ? OR sc.case_ref = ?
  `).get(ref, ref);
}

export function supportCaseDetails(database, ref, { includeInternal = false } = {}) {
  const item = supportCase(database, ref);
  if (!item) throw supportError("Support case not found", 404);
  const messages = database.prepare(`SELECT * FROM support_case_messages WHERE case_id = ? ${includeInternal ? "" : "AND is_internal = 0"} ORDER BY created_at ASC`).all(item.id);
  const evidence = database.prepare("SELECT * FROM support_case_evidence WHERE case_id = ? ORDER BY created_at ASC").all(item.id);
  const events = database.prepare("SELECT * FROM support_case_events WHERE case_id = ? ORDER BY created_at ASC").all(item.id).map((event) => ({ ...event, metadata: JSON.parse(event.metadata || "{}") }));
  return { ...item, messages, evidence, events };
}

export function createSupportCase(database, { booking, actor, caseType, category, subject, description, requestedRefundPercentage }) {
  const type = String(caseType || "COMPLAINT").toUpperCase();
  if (!CASE_TYPES.has(type)) throw supportError("Choose a valid support request type");
  const detail = clean(description);
  if (detail.length < 10) throw supportError("Describe what happened in at least 10 characters");
  if (["CANCELLATION", "REFUND_DISPUTE"].includes(type) && booking.payment_status !== "PAID") throw supportError("Only a paid booking can have a cancellation or refund request", 409);
  if (type === "CANCELLATION" && ["cancelled", "completed"].includes(String(booking.status).toLowerCase())) throw supportError("This booking can no longer be cancelled", 409);
  const duplicate = database.prepare("SELECT case_ref FROM support_cases WHERE booking_id = ? AND case_type = ? AND status NOT IN ('REJECTED','RESOLVED','CLOSED') LIMIT 1").get(booking.id, type);
  if (duplicate) throw supportError(`An active ${type.toLowerCase().replaceAll("_", " ")} case already exists: ${duplicate.case_ref}`, 409);

  const quote = ["CANCELLATION", "REFUND_DISPUTE"].includes(type) ? calculateRefundQuote(database, booking) : null;
  const urgent = type === "SAFETY" || (quote && quote.hoursUntilPickup <= 24);
  const priority = urgent ? "URGENT" : type === "COMPLAINT" ? "HIGH" : "NORMAL";
  const id = `case_${nanoid(12)}`;
  const caseRef = `SUP-${nanoid(8).toUpperCase()}`;
  const requested = requestedRefundPercentage === undefined || requestedRefundPercentage === null || requestedRefundPercentage === ""
    ? quote?.refundPercentage ?? null : Number(requestedRefundPercentage);
  if (requested !== null && ![0, 50, 100].includes(requested)) throw supportError("Requested refund must be 0%, 50% or 100%");
  const title = clean(subject, 160) || `${type.replaceAll("_", " ")} for ${booking.ref}`;
  const firstResponseHours = urgent ? 1 : 6;
  const resolutionHours = urgent ? 12 : 72;

  database.transaction(() => {
    database.prepare(`
      INSERT INTO support_cases (
        id, case_ref, booking_id, supplier_id, opened_by_user_id, case_type, category,
        subject, description, priority, status, requested_refund_percentage,
        policy_refund_percentage, policy_refund_amount, first_response_due_at, resolution_due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
    `).run(id, caseRef, booking.id, booking.supplier_id, actor.id || booking.user_id, type, clean(category, 80) || "GENERAL", title, detail, priority, requested, quote?.refundPercentage ?? null, quote?.refundAmount ?? null, plusHours(firstResponseHours), plusHours(resolutionHours));
    database.prepare("INSERT INTO support_case_messages (id, case_id, author_id, author_role, author_name, message) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`msg_${nanoid(12)}`, id, actor.id || null, String(actor.role || "TRAVELER").toUpperCase(), actor.name || booking.traveler_name, detail);
    database.prepare("INSERT INTO support_case_events (id, case_id, actor_id, actor_role, event_type, next_status, note, metadata) VALUES (?, ?, ?, ?, 'CASE_OPENED', 'OPEN', ?, ?)")
      .run(`evt_${nanoid(12)}`, id, actor.id || null, String(actor.role || "TRAVELER").toUpperCase(), title, JSON.stringify({ bookingRef: booking.ref, policyQuote: quote }));
    database.prepare("INSERT INTO staff_tasks (id, task_type, booking_id, assigned_staff_name, priority, status, notes) VALUES (?, 'SUPPORT_CASE', ?, 'Customer Support', ?, 'OPEN', ?)")
      .run(`task_${nanoid(12)}`, booking.id, priority === "URGENT" ? "CRITICAL" : priority, `${caseRef}: ${title}`);
  })();
  return supportCaseDetails(database, id, { includeInternal: true });
}

export function addSupportMessage(database, item, { actor, message, isInternal = false }) {
  const body = clean(message);
  if (body.length < 2) throw supportError("Enter a message");
  if (isInternal && !["ADMIN", "STAFF"].includes(String(actor.role).toUpperCase())) throw supportError("Only operations can add an internal note", 403);
  const role = String(actor.role || "TRAVELER").toUpperCase();
  database.transaction(() => {
    database.prepare("INSERT INTO support_case_messages (id, case_id, author_id, author_role, author_name, message, is_internal) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(`msg_${nanoid(12)}`, item.id, actor.id || null, role, actor.name || role, body, isInternal ? 1 : 0);
    database.prepare("UPDATE support_cases SET first_responded_at = CASE WHEN ? IN ('ADMIN','STAFF') THEN COALESCE(first_responded_at, datetime('now')) ELSE first_responded_at END, updated_at = datetime('now') WHERE id = ?")
      .run(role, item.id);
    database.prepare("INSERT INTO support_case_events (id, case_id, actor_id, actor_role, event_type, note, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(`evt_${nanoid(12)}`, item.id, actor.id || null, role, isInternal ? "INTERNAL_NOTE_ADDED" : "MESSAGE_ADDED", body.slice(0, 250), "{}");
  })();
  return supportCaseDetails(database, item.id, { includeInternal: ["ADMIN", "STAFF"].includes(role) });
}

export function addSupportEvidence(database, item, { actor, evidenceUrl, displayName, note }) {
  let url;
  try { url = new URL(String(evidenceUrl || "")); } catch { throw supportError("Enter a valid evidence URL"); }
  if (!["https:", "http:"].includes(url.protocol)) throw supportError("Evidence must use an HTTP or HTTPS URL");
  const role = String(actor.role || "TRAVELER").toUpperCase();
  database.transaction(() => {
    database.prepare("INSERT INTO support_case_evidence (id, case_id, submitted_by, submitted_role, evidence_url, display_name, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(`evd_${nanoid(12)}`, item.id, actor.id || null, role, url.toString(), clean(displayName, 160) || "Evidence", clean(note, 500) || null);
    database.prepare("INSERT INTO support_case_events (id, case_id, actor_id, actor_role, event_type, note, metadata) VALUES (?, ?, ?, ?, 'EVIDENCE_ADDED', ?, ?)")
      .run(`evt_${nanoid(12)}`, item.id, actor.id || null, role, clean(displayName, 160) || "Evidence added", JSON.stringify({ url: url.toString() }));
    database.prepare("UPDATE support_cases SET updated_at = datetime('now') WHERE id = ?").run(item.id);
  })();
  return supportCaseDetails(database, item.id, { includeInternal: ["ADMIN", "STAFF"].includes(role) });
}

export function updateSupportCase(database, item, { actor, status, priority, assignedTo, resolution }) {
  const nextStatus = String(status || item.status).toUpperCase();
  const nextPriority = String(priority || item.priority).toUpperCase();
  if (!CASE_STATUSES.has(nextStatus)) throw supportError("Choose a valid case status");
  if (!PRIORITIES.has(nextPriority)) throw supportError("Choose a valid priority");
  const note = clean(resolution, 1000) || null;
  database.transaction(() => {
    database.prepare(`UPDATE support_cases SET status = ?, priority = ?, assigned_to = ?, resolution = COALESCE(?, resolution),
      first_responded_at = COALESCE(first_responded_at, datetime('now')),
      resolved_at = CASE WHEN ? IN ('REJECTED','RESOLVED','CLOSED') THEN datetime('now') ELSE resolved_at END,
      updated_at = datetime('now') WHERE id = ?`)
      .run(nextStatus, nextPriority, clean(assignedTo, 120) || item.assigned_to, note, nextStatus, item.id);
    database.prepare("INSERT INTO support_case_events (id, case_id, actor_id, actor_role, event_type, previous_status, next_status, note, metadata) VALUES (?, ?, ?, ?, 'STATUS_CHANGED', ?, ?, ?, ?)")
      .run(`evt_${nanoid(12)}`, item.id, actor.id, String(actor.role).toUpperCase(), item.status, nextStatus, note, JSON.stringify({ priority: nextPriority, assignedTo }));
  })();
  return supportCaseDetails(database, item.id, { includeInternal: true });
}

export function recordSupportRefundDecision(database, item, { actor, action, approvedPercentage, refundId, resolution }) {
  const approved = String(action).toUpperCase() === "APPROVE";
  const nextStatus = approved ? "APPROVED" : "REJECTED";
  database.transaction(() => {
    database.prepare(`UPDATE support_cases SET status = ?, approved_refund_percentage = ?, refund_id = ?, resolution = ?,
      first_responded_at = COALESCE(first_responded_at, datetime('now')), resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(nextStatus, approved ? approvedPercentage : null, refundId || null, clean(resolution, 1000), item.id);
    database.prepare("INSERT INTO support_case_events (id, case_id, actor_id, actor_role, event_type, previous_status, next_status, note, metadata) VALUES (?, ?, ?, ?, 'REFUND_DECISION', ?, ?, ?, ?)")
      .run(`evt_${nanoid(12)}`, item.id, actor.id, String(actor.role).toUpperCase(), item.status, nextStatus, clean(resolution, 1000), JSON.stringify({ approvedPercentage, refundId }));
    database.prepare("UPDATE staff_tasks SET status = 'RESOLVED', notes = COALESCE(notes, '') || ? WHERE booking_id = ? AND task_type = 'SUPPORT_CASE' AND status != 'RESOLVED'")
      .run(` | ${item.case_ref}: ${nextStatus}`, item.booking_id);
  })();
  return supportCaseDetails(database, item.id, { includeInternal: true });
}
