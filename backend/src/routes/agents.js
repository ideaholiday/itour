import express from "express";
import db from "../db.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { travelAgencySchemas } from "../validators/apiSchemas.js";
import { recordAuditEvent } from "../services/auditService.js";
import { queueNotification } from "../services/notificationService.js";
import {
  agencyStatementCsv, agencyView, applyForAgency, getAgencyForUser, listAgencyBookings, sendAgencyEmail,
  AGENCY_DISCOUNT_MAX_PCT, AGENCY_DISCOUNT_MIN_PCT,
} from "../services/travelAgencyService.js";
import logger from "../config/logger.js";

/**
 * IdeaHoliday B2B travel agents (ADR 054): a traveler account applies as an
 * agency; an admin approves it in /api/admin/agencies.
 */
const router = express.Router();

function failure(res, req, error, fallback) {
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

/** GET /api/agents/program: public terms for the agent landing page. */
router.get("/program", (_req, res) => {
  res.json({ success: true, discountMinPct: AGENCY_DISCOUNT_MIN_PCT, discountMaxPct: AGENCY_DISCOUNT_MAX_PCT });
});

/** GET /api/agents/me: the signed-in account's agency, or null. */
router.get("/me", authenticate, (req, res) => {
  try {
    return res.json({ success: true, agency: agencyView(getAgencyForUser(db, req.user.id)) });
  } catch (error) {
    return failure(res, req, error, "Could not load your agency");
  }
});

/** POST /api/agents/apply: apply, edit a pending application, or reapply after a rejection. */
router.post("/apply", authenticate, validateBody(travelAgencySchemas.apply), (req, res) => {
  try {
    const { agency, user, resubmitted } = applyForAgency(db, req.user.id, req.body);
    recordAuditEvent(db, {
      action: resubmitted ? "TRAVEL_AGENCY_UPDATED" : "TRAVEL_AGENCY_APPLIED",
      actor: req.user, resourceType: "TRAVEL_AGENCY", resourceId: agency.id, requestId: req.requestId,
    });
    queueNotification(sendAgencyEmail(db, { agency, user, event: "APPLIED" }), "Agency application email");
    return res.status(resubmitted ? 200 : 201).json({ success: true, agency: agencyView(agency) });
  } catch (error) {
    return failure(res, req, error, "Could not save your application");
  }
});

// The agency's own bookings and statement (plan B3). A suspended agency keeps
// its history; an account with no agency has none.
function statementFor(req) {
  const agency = getAgencyForUser(db, req.user.id);
  if (!agency) throw Object.assign(new Error("Apply as a travel agent first"), { status: 404, code: "NO_AGENCY" });
  const { from, to, dateBy, status, q } = req.query;
  const statuses = ["all", "upcoming", "completed", "cancelled", "unpaid"];
  return {
    agency,
    statement: listAgencyBookings(db, agency.id, {
      from, to, dateBy: dateBy === "booked" ? "booked" : "trip",
      status: statuses.includes(String(status)) ? String(status) : "all", q: String(q || "").slice(0, 100),
    }),
  };
}

/** GET /api/agents/bookings?from&to&dateBy=trip|booked&status=upcoming|completed|cancelled|unpaid|all&q */
router.get("/bookings", authenticate, (req, res) => {
  try {
    const { agency, statement } = statementFor(req);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, agency: agencyView(agency), ...statement });
  } catch (error) {
    return failure(res, req, error, "Could not load your bookings");
  }
});

/** GET /api/agents/bookings.csv: the same rows and totals as a spreadsheet. */
router.get("/bookings.csv", authenticate, (req, res) => {
  try {
    const { statement } = statementFor(req);
    const period = [statement.filters.from, statement.filters.to].filter(Boolean).join("_to_") || "all";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="agent_statement_${period}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(agencyStatementCsv(statement));
  } catch (error) {
    return failure(res, req, error, "Could not build your statement");
  }
});

export default router;
