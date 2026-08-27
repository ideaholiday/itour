import { Router } from "express";
import db from "../db.js";
import { validateBody } from "../middleware/validation.js";
import { bookingQuoteSchema } from "../validators/apiSchemas.js";
import { calculateBookingQuote, publicQuote } from "../services/bookingService.js";
import { assertBookingLocations } from "../services/locationValidationService.js";
import { getBookingQuestions, validateOptionLogistics, validateQuestionAnswers } from "../services/logisticsService.js";

const router = Router();

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
