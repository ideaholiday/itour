import express from "express";
import QRCode from "qrcode";
import db from "../db.js";
import logger from "../config/logger.js";
import { authenticate, optionalAuthMiddleware, requireRoles } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/security.js";
import { validateBody } from "../middleware/validation.js";
import { referralSchemas } from "../validators/apiSchemas.js";
import {
  buildReferralLink,
  findReferrerByCode,
  getReferralProgramMetrics,
  getReferralSummary,
  listReferralReviewQueue,
  reviewReferralReward,
  setReferralRelationshipStatus,
  trackReferralClick,
} from "../services/referralService.js";

const router = express.Router();

const clickLimiter = createRateLimiter({ windowMs: 60_000, limit: 60, scope: "referral-click" });

/**
 * POST /api/referral/track-click
 * A traveler opened someone's referral link. Keeps the referral alive until
 * they sign up, so a lost `?ref=` does not lose the referrer their credit.
 */
router.post("/track-click", clickLimiter, optionalAuthMiddleware, validateBody(referralSchemas.trackClick), (req, res) => {
  try {
    const result = trackReferralClick(db, {
      referralCode: req.body.referralCode,
      visitorId: req.body.visitorId,
      channel: req.body.channel || null,
      landingPath: req.body.landingPath || null,
      userId: req.user?.id || null,
    });
    res.json({ success: result.tracked, ...result });
  } catch (error) {
    logger.warn("Referral click tracking failed", { error: error.message });
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/referral/qr/:code.svg?ch=QR
 * A printable QR for an invite link, rendered here so the link is never sent to
 * a third-party QR service.
 */
router.get("/qr/:code.svg", clickLimiter, async (req, res) => {
  try {
    const referrer = findReferrerByCode(db, req.params.code);
    if (!referrer) return res.status(404).json({ error: "Referral code not found" });
    const channel = /^[A-Z]{2,12}$/i.test(String(req.query.ch || "")) ? String(req.query.ch).toUpperCase() : "QR";
    const svg = await QRCode.toString(buildReferralLink(referrer.referral_code, channel), { type: "svg", errorCorrectionLevel: "M", margin: 1 });
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(svg);
  } catch (error) {
    logger.warn("Referral QR failed", { error: error.message });
    return res.status(500).json({ error: "Could not create the QR code" });
  }
});

/** GET /api/referral/me — friends, rewards by stage, and wallet expiry. */
router.get("/me", authenticate, (req, res) => {
  try {
    res.json(getReferralSummary(db, req.user.id));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not load your referrals" });
  }
});

const adminOnly = [authenticate, requireRoles("ADMIN", "STAFF")];

/** GET /api/referral/admin/metrics?days=90 */
router.get("/admin/metrics", ...adminOnly, (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 3650);
    res.json(getReferralProgramMetrics(db, { sinceDays: days }));
  } catch (error) {
    logger.error("Referral metrics failed", { error: error.message });
    res.status(500).json({ error: "Could not load referral metrics" });
  }
});

/** GET /api/referral/admin/review — held rewards, blocked pairings, recent signals. */
router.get("/admin/review", ...adminOnly, (_req, res) => {
  try {
    res.json(listReferralReviewQueue(db));
  } catch (error) {
    logger.error("Referral review queue failed", { error: error.message });
    res.status(500).json({ error: "Could not load the referral review queue" });
  }
});

/** POST /api/referral/admin/rewards/:id/review  { decision: APPROVE | REJECT, note } */
router.post("/admin/rewards/:id/review", ...adminOnly, validateBody(referralSchemas.review), (req, res) => {
  try {
    const reward = reviewReferralReward(db, {
      rewardId: req.params.id,
      decision: req.body.decision,
      note: req.body.note || null,
      actorId: req.user.id,
    });
    res.json({ success: true, reward });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

/** PATCH /api/referral/admin/relationships/:id  { status: ACTIVE | BLOCKED, reason } */
router.patch("/admin/relationships/:id", ...adminOnly, validateBody(referralSchemas.relationship), (req, res) => {
  try {
    const relationship = setReferralRelationshipStatus(db, {
      relationshipId: req.params.id,
      status: req.body.status,
      reason: req.body.reason || null,
      clearReview: req.body.status === "ACTIVE",
    });
    res.json({ success: true, relationship });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
