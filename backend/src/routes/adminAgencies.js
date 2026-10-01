import express from "express";
import db from "../db.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { travelAgencySchemas } from "../validators/apiSchemas.js";
import { recordAuditEvent } from "../services/auditService.js";
import { queueNotification } from "../services/notificationService.js";
import { agencyView, listAgencies, reviewAgency, sendAgencyEmail } from "../services/travelAgencyService.js";
import logger from "../config/logger.js";

/** Admin review of IdeaHoliday B2B travel agencies (ADR 054). */
const router = express.Router();
router.use(authenticate, requireRoles("ADMIN"));

function failure(res, req, error, fallback) {
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

/** GET /api/admin/agencies?status=PENDING */
router.get("/", (req, res) => {
  try {
    return res.json({ success: true, ...listAgencies(db, { status: String(req.query.status || "").toUpperCase() || undefined }) });
  } catch (error) {
    return failure(res, req, error, "Could not load agencies");
  }
});

/** PATCH /api/admin/agencies/:id  { status, discountPct?, reason? } */
router.patch("/:id", validateBody(travelAgencySchemas.review), (req, res) => {
  try {
    const result = reviewAgency(db, req.params.id, req.body, req.user.id);
    recordAuditEvent(db, {
      action: "TRAVEL_AGENCY_REVIEWED", actor: req.user, resourceType: "TRAVEL_AGENCY", resourceId: req.params.id, requestId: req.requestId,
      metadata: {
        previousStatus: result.previousStatus, nextStatus: result.agency.status,
        previousDiscountPct: result.previousDiscountPct, discountPct: Number(result.agency.discount_pct), reason: req.body.reason || null,
      },
    });
    if (result.previousStatus !== result.agency.status) {
      queueNotification(sendAgencyEmail(db, { agency: result.agency, user: result.user, event: result.agency.status }), "Agency decision email");
    }
    return res.json({ success: true, agency: { ...agencyView(result.agency), discountPct: Number(result.agency.discount_pct) } });
  } catch (error) {
    return failure(res, req, error, "Could not review the agency");
  }
});

export default router;
