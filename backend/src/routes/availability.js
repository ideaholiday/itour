import { nativeHoldSchema } from "../services/nativeInventoryService.js";
import { getReservationProvider } from "../services/reservationProviders.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { Router } from "express";
import db from "../db.js";
import { approvedSupplierSql } from "../services/supplierKybGate.js";
import { validateBody } from "../middleware/validation.js";
import { bookingQuoteSchema } from "../validators/apiSchemas.js";
import { calculateBookingQuote, publicQuote } from "../services/bookingService.js";
import { assertBookingLocations } from "../services/locationValidationService.js";
import { getBookingQuestions, validateOptionLogistics, validateQuestionAnswers } from "../services/logisticsService.js";

const router = Router();

router.get("/native/:productId", (req, res) => {
  try {
    const product = db.prepare(`SELECT id FROM products WHERE id = ? AND status = 'PUBLISHED' AND ${approvedSupplierSql("products")}`).get(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.set("Cache-Control", "no-store");
    res.json({ slots: getReservationProvider().availability(db, { productId: product.id, optionId: req.query.optionId, localDate: req.query.date, promoCode: req.query.promoCode || null }) });
  } catch (error) {
    const validationIssue = error?.name === "ZodError" || Array.isArray(error?.issues);
    res.status(error.status || 400).json({
      error: validationIssue ? "Choose a valid tour date." : error.message,
      code: validationIssue ? "INVALID_DATE" : error.code,
    });
  }
});
router.post("/native/hold", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(nativeHoldSchema), (req, res) => {
  try {
    const product = db.prepare(`SELECT p.id FROM products p WHERE p.id = ? AND p.status = 'PUBLISHED' AND ${approvedSupplierSql("p")}`).get(req.body.productId);
    if (!product) return res.status(404).json({ error: "Product not available" });
    const hold = getReservationProvider().reserve(db, { ...req.body, ownerId: req.user.id });
    res.status(201).json({ holdId: hold.id, expiresAt: hold.utc_expires_at, status: hold.status });
  } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code }); }
});


router.post("/check", validateBody(bookingQuoteSchema), (req, res) => {
  try {
    const productId = req.body.product_id || req.body.activity_id;
    const option = validateOptionLogistics(db, productId, req.body);
    const answers = validateQuestionAnswers(db, option?.id, req.body.booking_question_answers || {}, req.body);
    assertBookingLocations(db, req.body, { requireOperationalDetails: false });
    const quote = calculateBookingQuote(db, req.body);
    return res.json({ success: true, available: true, checkedAt: new Date().toISOString(), quote: publicQuote(quote), option, bookingQuestions: option ? getBookingQuestions(db, option.id) : [], normalizedAnswers: answers });
  } catch (error) {
    return res.status(error.status || 409).json({ success: false, available: false, error: error.message || "Selected option is unavailable", code: error.code });
  }
});

export default router;
