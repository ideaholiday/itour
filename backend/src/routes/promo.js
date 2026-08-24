import express from "express";
import db from "../db.js";
import { validatePromoCode, getUserReferralInfo } from "../services/promoService.js";
import { authenticate, optionalAuthMiddleware } from "../middleware/auth.js";

const router = express.Router();

// GET /api/promo/active - List publicly available featured promo codes
router.get("/active", (req, res) => {
  try {
    const codes = db.prepare(`
      SELECT code, description, discount_type, discount_value, min_order_inr, max_discount_inr
      FROM promo_codes
      WHERE is_active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
      ORDER BY discount_value DESC
    `).all();

    res.json({ success: true, vouchers: codes });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active promo vouchers" });
  }
});

// POST /api/promo/validate - Validate a promo code against an order total
router.post("/validate", optionalAuthMiddleware, (req, res) => {
  try {
    const { code, amountInr } = req.body;
    if (!code) return res.status(400).json({ error: "Promo code is required" });

    const result = validatePromoCode(db, {
      code,
      amountInr: Number(amountInr || 0),
      userId: req.user?.id || null,
    });

    res.json({ success: true, promo: result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "Invalid promo code" });
  }
});

// GET /api/promo/user/referral - Get traveler referral link, stats, and credits
router.get("/user/referral", authenticate, (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    const stats = getUserReferralInfo(db, req.user.id);
    res.json({ success: true, referral: stats });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to load referral statistics" });
  }
});

export default router;
