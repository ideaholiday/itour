import express from "express";
import rateLimit from "express-rate-limit";
import db from "../db.js";
import logger from "../config/logger.js";
import { optionalAuthenticate } from "../middleware/auth.js";
import { buildTripTracking, findTrackableBooking, verifyTrackingToken } from "../services/tripTrackingService.js";

const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); res.set("Referrer-Policy", "no-referrer"); next(); });

function signedInOwner(user, booking) {
  if (!user) return false;
  const role = String(user.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return true;
  return user.id === booking.user_id || Boolean(user.email && user.email.toLowerCase() === String(booking.traveler_email || "").toLowerCase());
}

// GET /api/tracking/:ref - Live trip for the traveler: the signed link's token in
// X-Tracking-Token, or the signed-in traveler who owns the booking.
router.get("/:ref", optionalAuthenticate, async (req, res) => {
  try {
    const booking = findTrackableBooking(db, req.params.ref);
    const token = req.get("x-tracking-token");
    // One answer for "no such booking" and "not yours", so references can't be probed.
    if (!booking || !(verifyTrackingToken(token, booking) || signedInOwner(req.user, booking))) {
      return res.status(404).json({ error: "This tracking link is invalid or has expired. Open My Trips to follow your booking.", code: "TRACKING_NOT_FOUND" });
    }
    return res.json({ success: true, trip: await buildTripTracking(db, booking) });
  } catch (err) {
    logger.error("Trip tracking lookup failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Live tracking is unavailable right now" });
  }
});

export default router;
