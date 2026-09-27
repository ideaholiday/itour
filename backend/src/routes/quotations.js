import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { findQuotation, quotationView, verifyQuotationToken } from "../services/quotationService.js";
import { quotationPdf } from "../services/quotationPdfService.js";
import { cityImages, presentQuotation, quotationTheme, themeStyle } from "../services/quotationPresentation.js";
import { listHotels } from "../services/supplierHotelService.js";
import { listCabTypes } from "../services/supplierRateSheetService.js";
import { itineraryPdf } from "../services/tripItineraryPdfService.js";
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

// The web itinerary page's data (ADR 051): the same signed link, the customer's view only (no line prices, costs or markup).
router.get("/share/:token/view", shareLimiter, (req, res) => {
  const quotationId = verifyQuotationToken(req.params.token);
  if (!quotationId) return res.status(404).json({ error: "This quotation link is invalid or has expired. Ask the operator for a new one." });
  try {
    const row = db.prepare("SELECT supplier_id FROM quotations WHERE id = ?").get(quotationId);
    if (!row) return res.status(404).json({ error: "Quotation not found" });
    const quotation = quotationView(db, findQuotation(db, row.supplier_id, quotationId));
    const supplier = db.prepare("SELECT company_name, phone, email FROM suppliers WHERE id = ?").get(row.supplier_id) || {};
    const theme = quotationTheme(db, row.supplier_id, quotation);
    const itinerary = presentQuotation({
      quotation, supplier, hotels: listHotels(db, row.supplier_id), cabTypes: listCabTypes(db, row.supplier_id), theme,
      images: cityImages(db, (quotation.legs || []).map((leg) => leg.city)),
    });
    const { headingFont, ...style } = themeStyle(theme);
    res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
    return res.json({ success: true, itinerary: { ...itinerary, status: quotation.status, style, pdfUrl: `/api/quotations/share/${encodeURIComponent(req.params.token)}` } });
  } catch (error) {
    logger.error("Quotation page failed", { requestId: req.requestId, error });
    return res.status(500).json({ error: "The quotation couldn't be opened" });
  }
});

// The customer's final itinerary link (ADR 045): same signing, its own kind of token.
router.get("/itinerary/:token", shareLimiter, async (req, res) => {
  const quotationId = verifyQuotationToken(req.params.token, Date.now(), "itinerary");
  if (!quotationId) return res.status(404).json({ error: "This itinerary link is invalid or has expired. Ask the operator for a new one." });
  try {
    const row = db.prepare("SELECT supplier_id, status FROM quotations WHERE id = ?").get(quotationId);
    if (!row || row.status !== "ACCEPTED") return res.status(404).json({ error: "Itinerary not found" });
    const { buffer, filename } = await itineraryPdf(db, row.supplier_id, quotationId);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
    return res.send(buffer);
  } catch (error) {
    logger.error("Itinerary link failed", { requestId: req.requestId, error });
    return res.status(500).json({ error: "The itinerary couldn't be opened" });
  }
});

export default router;
