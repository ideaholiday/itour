import express from "express";
import db from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { calculateRefundQuote, createRefundRecord, failRefund, finalizeRefund } from "../services/financeService.js";
import { processRazorpayRefund } from "../services/razorpayService.js";
import { notifyRefundProcessed, notifySupportCaseUpdate, queueNotification } from "../services/notificationService.js";
import {
  addSupportEvidence,
  addSupportMessage,
  createSupportCase,
  recordSupportRefundDecision,
  supportCase,
  supportCaseDetails,
  updateSupportCase,
} from "../services/supportCaseService.js";
import { validateBody } from "../middleware/validation.js";
import { supportSchemas } from "../validators/apiSchemas.js";

const router = express.Router();
router.use(authenticate);
const OPS_ROLES = new Set(["ADMIN", "STAFF"]);

function requester(req) {
  return req.user || null;
}

function canAccess(actor, item) {
  if (!actor) return false;
  const role = String(actor.role || "").toUpperCase();
  if (OPS_ROLES.has(role)) return true;
  if (role === "SUPPLIER") return actor.supplier_id === item.supplier_id;
  return actor.id === item.user_id || (actor.email && actor.email.toLowerCase() === String(item.traveler_email || "").toLowerCase());
}

function bookingForCase(ref) {
  return db.prepare(`SELECT b.*, p.cancellation_policy, p.title AS product_title FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?`).get(ref, ref);
}

router.get("/cases", (req, res) => {
  try {
    const actor = requester(req);
    if (!actor) return res.status(401).json({ error: "Sign in to view support cases" });
    const role = String(actor.role || "TRAVELER").toUpperCase();
    const conditions = [];
    const values = [];
    if (!OPS_ROLES.has(role)) {
      if (role === "SUPPLIER") { conditions.push("sc.supplier_id = ?"); values.push(actor.supplier_id || ""); }
      else { conditions.push("(b.user_id = ? OR (? != '' AND LOWER(b.traveler_email) = LOWER(?)))"); values.push(actor.id || "", actor.email || "", actor.email || ""); }
    }
    if (req.query.status && req.query.status !== "ALL") { conditions.push("sc.status = ?"); values.push(String(req.query.status).toUpperCase()); }
    if (req.query.type && req.query.type !== "ALL") { conditions.push("sc.case_type = ?"); values.push(String(req.query.type).toUpperCase()); }
    if (req.query.search) { conditions.push("(LOWER(sc.case_ref) LIKE ? OR LOWER(b.ref) LIKE ? OR LOWER(sc.subject) LIKE ?)"); const term = `%${String(req.query.search).toLowerCase()}%`; values.push(term, term, term); }
    const cases = db.prepare(`
      SELECT sc.*, b.ref AS booking_ref, b.traveler_name, b.activity_date, b.pickup_time,
        b.amount_inr, b.payment_status, p.title AS product_title, s.company_name AS supplier_name,
        (SELECT COUNT(*) FROM support_case_messages scm WHERE scm.case_id = sc.id ${OPS_ROLES.has(role) ? "" : "AND scm.is_internal = 0"}) AS message_count,
        CASE WHEN sc.first_responded_at IS NULL AND datetime(sc.first_response_due_at) < datetime('now') THEN 1 ELSE 0 END AS first_response_breached,
        CASE WHEN sc.resolved_at IS NULL AND datetime(sc.resolution_due_at) < datetime('now') THEN 1 ELSE 0 END AS resolution_breached
      FROM support_cases sc JOIN bookings b ON b.id = sc.booking_id
      LEFT JOIN products p ON p.id = b.product_id LEFT JOIN suppliers s ON s.id = sc.supplier_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY CASE sc.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END, sc.created_at DESC LIMIT 250
    `).all(...values);
    const metrics = OPS_ROLES.has(role) ? db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status IN ('OPEN','UNDER_REVIEW','AWAITING_GUEST','AWAITING_SUPPLIER') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN priority = 'URGENT' AND status NOT IN ('RESOLVED','REJECTED','CLOSED') THEN 1 ELSE 0 END) AS urgent,
      SUM(CASE WHEN first_responded_at IS NULL AND datetime(first_response_due_at) < datetime('now') THEN 1 ELSE 0 END) AS sla_breached
      FROM support_cases`).get() : null;
    return res.json({ success: true, cases, metrics });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Support cases could not be loaded" });
  }
});

router.post("/cases", validateBody(supportSchemas.create), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor) return res.status(401).json({ error: "Sign in to contact support" });
    const booking = bookingForCase(req.body.bookingId || req.body.bookingRef);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const accessItem = { ...booking, user_id: booking.user_id, traveler_email: booking.traveler_email };
    if (!canAccess(actor, accessItem)) return res.status(403).json({ error: "You do not have access to this booking" });
    const item = createSupportCase(db, { booking, actor, ...req.body });
    queueNotification(notifySupportCaseUpdate(db, item.id, { event: "OPENED" }), "Support case opened notification");
    return res.status(201).json({ success: true, case: item, message: `${item.case_ref} was created. Support will respond by ${item.first_response_due_at}.` });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Support case could not be created" });
  }
});

router.get("/cases/:ref", (req, res) => {
  try {
    const actor = requester(req);
    const item = supportCase(db, req.params.ref);
    if (!item) return res.status(404).json({ error: "Support case not found" });
    if (!canAccess(actor, item)) return res.status(403).json({ error: "You do not have access to this case" });
    return res.json({ success: true, case: supportCaseDetails(db, item.id, { includeInternal: OPS_ROLES.has(String(actor.role).toUpperCase()) }) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Support case could not be loaded" });
  }
});

router.post("/cases/:ref/messages", validateBody(supportSchemas.message), (req, res) => {
  try {
    const actor = requester(req);
    const item = supportCase(db, req.params.ref);
    if (!item) return res.status(404).json({ error: "Support case not found" });
    if (!canAccess(actor, item)) return res.status(403).json({ error: "You do not have access to this case" });
    const updated = addSupportMessage(db, item, { actor, message: req.body.message, isInternal: Boolean(req.body.isInternal) });
    if (!req.body.isInternal) queueNotification(notifySupportCaseUpdate(db, item.id, { event: "MESSAGE" }), "Support case message notification");
    return res.status(201).json({ success: true, case: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Message could not be added" });
  }
});

router.post("/cases/:ref/evidence", validateBody(supportSchemas.evidence), (req, res) => {
  try {
    const actor = requester(req);
    const item = supportCase(db, req.params.ref);
    if (!item) return res.status(404).json({ error: "Support case not found" });
    if (!canAccess(actor, item)) return res.status(403).json({ error: "You do not have access to this case" });
    return res.status(201).json({ success: true, case: addSupportEvidence(db, item, { actor, ...req.body }) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Evidence could not be added" });
  }
});

router.patch("/cases/:ref", validateBody(supportSchemas.update), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !OPS_ROLES.has(String(actor.role).toUpperCase())) return res.status(403).json({ error: "Operations access required" });
    const item = supportCase(db, req.params.ref);
    if (!item) return res.status(404).json({ error: "Support case not found" });
    const updated = updateSupportCase(db, item, { actor, ...req.body });
    queueNotification(notifySupportCaseUpdate(db, item.id, { event: "STATUS" }), "Support case status notification");
    return res.json({ success: true, case: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Support case could not be updated" });
  }
});

router.post("/cases/:ref/refund-decision", validateBody(supportSchemas.refundDecision), async (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !OPS_ROLES.has(String(actor.role).toUpperCase())) return res.status(403).json({ error: "Operations access required" });
    const item = supportCase(db, req.params.ref);
    if (!item) return res.status(404).json({ error: "Support case not found" });
    if (!["CANCELLATION", "REFUND_DISPUTE"].includes(item.case_type)) return res.status(409).json({ error: "This case does not contain a refund request" });
    const action = String(req.body.action || "").toUpperCase();
    const resolution = String(req.body.resolution || "").trim();
    if (!["APPROVE", "REJECT"].includes(action)) return res.status(400).json({ error: "Choose approve or reject" });
    if (resolution.length < 5) return res.status(400).json({ error: "Add a clear decision reason" });
    if (action === "REJECT") {
      const updated = recordSupportRefundDecision(db, item, { actor, action, resolution });
      queueNotification(notifySupportCaseUpdate(db, item.id, { event: "DECISION" }), "Refund decision notification");
      return res.json({ success: true, case: updated, message: `${item.case_ref} was rejected with a recorded reason.` });
    }
    const booking = bookingForCase(item.booking_id);
    if (booking.status === "cancelled" || ["REFUNDED", "PARTIALLY_REFUNDED"].includes(booking.payment_status)) return res.status(409).json({ error: "This booking already has a completed cancellation or refund" });
    if (booking.payment_status !== "PAID") return res.status(409).json({ error: "Only a paid booking can be refunded" });
    const approvedPercentage = req.body.approvedRefundPercentage ?? item.policy_refund_percentage;
    const quote = calculateRefundQuote(db, booking, { overridePercentage: Number(approvedPercentage) });
    const refund = createRefundRecord(db, { booking, quote, reason: resolution, actorId: actor.id });
    let providerResult = { refundId: "rfnd_none", status: "NO_REFUND_APPLICABLE" };
    try {
      if (quote.refundAmount > 0) {
        if (!booking.razorpay_payment_id) throw Object.assign(new Error("Payment reference is missing; finance must review the provider payment"), { status: 409 });
        providerResult = await processRazorpayRefund({ paymentId: booking.razorpay_payment_id, amount: quote.refundAmount, reason: resolution });
      }
    } catch (error) {
      failRefund(db, refund.id, error.message);
      throw error;
    }
    const allocation = finalizeRefund(db, { booking, refund, providerResult });
    const updated = recordSupportRefundDecision(db, item, { actor, action, approvedPercentage: Number(approvedPercentage), refundId: refund.id, resolution });
    queueNotification(notifyRefundProcessed(db, refund.id), "Approved support refund notification");
    queueNotification(notifySupportCaseUpdate(db, item.id, { event: "DECISION" }), "Support decision notification");
    return res.json({ success: true, case: updated, refund, quote, allocation, gatewayRefundId: providerResult.refundId, message: `Refund of ₹${quote.refundAmount} approved for ${item.booking_ref}.` });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Refund decision could not be completed" });
  }
});

export default router;
