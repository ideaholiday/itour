import express from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { authenticate } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";
import { validateBody } from "../middleware/validation.js";
import { profileSchemas } from "../validators/apiSchemas.js";
import { addEnquiryMessage, closeEnquiry, enquiryThread, listEnquiries } from "../services/supplierEnquiryService.js";

/**
 * Enquiry threads for both sides. The signed-in account decides the scope:
 * a traveler sees their own enquiries, a supplier sees enquiries sent to them.
 * New enquiries are opened from a profile: POST /api/public/suppliers/:slug/enquiries.
 */
const router = express.Router();
router.use(authenticate);

const messageLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: 60, scope: "enquiry-message" });

function failure(res, req, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

router.get("/", (req, res) => {
  try {
    return res.json({ success: true, enquiries: listEnquiries(db, req.user, { status: req.query.status }) });
  } catch (error) {
    return failure(res, req, error, "Could not load enquiries");
  }
});

router.get("/:ref", (req, res) => {
  try {
    return res.json({ success: true, enquiry: enquiryThread(db, req.params.ref, req.user) });
  } catch (error) {
    return failure(res, req, error, "Could not load enquiry");
  }
});

router.post("/:ref/messages", messageLimiter, validateBody(profileSchemas.enquiryMessage), (req, res) => {
  try {
    return res.status(201).json({ success: true, enquiry: addEnquiryMessage(db, req.params.ref, req.user, req.body.message) });
  } catch (error) {
    return failure(res, req, error, "Your message could not be sent");
  }
});

router.post("/:ref/close", (req, res) => {
  try {
    return res.json({ success: true, enquiry: closeEnquiry(db, req.params.ref, req.user) });
  } catch (error) {
    return failure(res, req, error, "Could not close enquiry");
  }
});

export default router;
