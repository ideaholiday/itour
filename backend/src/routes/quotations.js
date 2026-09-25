import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { verifyQuotationToken } from "../services/quotationService.js";
import { quotationPdf } from "../services/quotationPdfService.js";
import { createRateLimiter } from "../middleware/security.js";

// The customer's quotation link (ADR 040): a signed token, no sign-in, like a voucher link.
const router = Router();
const shareLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: 120, scope: "quotation-share" });

router.get("/share/:token", shareLimiter, async (req, res) => {
  const quotationId = verifyQuotationToken(req.params.token);
  if (!quotationId) return res.status(404).json({ error: "This quotation link is invalid or has expired. Ask the operator for a new one." });
  try {
    const row = db.prepare("SELECT supplier_id FROM quotations WHERE id = ?").get(quotationId);
    if (!row) return res.status(404).json({ error: "Quotation not found" });
    const { buffer, filename } = await quotationPdf(db, row.supplier_id, quotationId);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
    return res.send(buffer);
  } catch (error) {
    logger.error("Quotation share link failed", { requestId: req.requestId, error });
    return res.status(500).json({ error: "The quotation couldn't be opened" });
  }
});

export default router;
