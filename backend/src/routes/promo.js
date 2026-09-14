import express from "express";
import db from "../db.js";
import { validatePromoCode } from "../services/promoService.js";
import { getTravelerLoyaltyProfile } from "../services/loyaltyService.js";
import { authenticate, optionalAuthMiddleware } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";

// Codes are short: limit checks per client so they can't be guessed by brute force.
const validateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30, scope: "promo-validate" });

const router = express.Router();

// GET /api/promo/active - List publicly available featured promo codes
router.get("/active", (req, res) => {
  try {
    const codes = db.prepare(`
      SELECT code, description, discount_type, discount_value, min_order_inr, max_discount_inr
      FROM promo_codes
      WHERE is_active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        AND COALESCE(audience, 'TRAVELER') = 'TRAVELER' AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
        AND COALESCE(first_booking_only, 0) = 0 AND per_user_limit IS NULL
        AND product_types_json IS NULL AND product_ids_json IS NULL AND supplier_ids_json IS NULL
      ORDER BY discount_value DESC
    `).all();

    res.json({ success: true, vouchers: codes });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active promo vouchers" });
  }
});

// POST /api/promo/validate - Validate a promo code against an order total
router.post("/validate", validateLimiter, optionalAuthMiddleware, (req, res) => {
  try {
    const { code, amountInr, productId } = req.body;
    if (!code) return res.status(400).json({ error: "Promo code is required" });
    const product = productId
      ? db.prepare("SELECT id, product_type, supplier_id FROM products WHERE id = ?").get(String(productId)) || null
      : null;

    const result = validatePromoCode(db, {
      code,
      amountInr: Number(amountInr || 0),
      userId: req.user?.id || null,
      product,
    });

    res.json({ success: true, promo: result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "Invalid promo code", code: err.code });
  }
});

// GET /api/promo/user/referral - Get traveler referral link, stats, and credits
router.get("/user/referral", authenticate, (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    const stats = getTravelerLoyaltyProfile(db, req.user.id);
    res.json({ success: true, referral: stats });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load referral statistics" });
  }
});

export default router;
