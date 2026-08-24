import express from "express";
import db from "../db.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";
import { z } from "zod";
import crypto from "crypto";
import logger from "../config/logger.js";
import { sseService } from "../services/sseService.js";
import { ItineraryService } from "../services/itineraryService.js";

const router = express.Router();

// --- USER PROFILE ---
router.get("/users/profile", authenticate, (req, res) => {
  const userId = req.user.id;
  const user = db.prepare("SELECT id, name, email, phone, role FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  let profile = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId);
  if (!profile) {
    // Create initial profile if none exists
    const id = `prof_${crypto.randomBytes(6).toString("hex")}`;
    db.prepare(`
      INSERT INTO user_profiles (id, user_id, display_name, phone, travel_preferences, saved_addresses, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', '[]', datetime('now'), datetime('now'))
    `).run(id, userId, user.name, user.phone);
    profile = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId);
  }

  let travelPreferences = {};
  let savedAddresses = [];
  try { travelPreferences = JSON.parse(profile.travel_preferences || "{}"); } catch {}
  try { savedAddresses = JSON.parse(profile.saved_addresses || "[]"); } catch {}

  return res.json({
    user: {
      ...user,
      profile: {
        ...profile,
        travel_preferences: travelPreferences,
        saved_addresses: savedAddresses,
      },
    },
  });
});

const ProfileUpdateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  phone: z.string().min(5).max(20).optional(),
  avatarUrl: z.string().url().or(z.string().startsWith("/uploads/")).optional().nullable(),
  travelPreferences: z.record(z.any()).optional(),
  savedAddresses: z.array(z.any()).optional(),
  emergencyContactName: z.string().max(100).optional().nullable(),
  emergencyContactPhone: z.string().max(20).optional().nullable(),
});

router.patch("/users/profile", authenticate, (req, res) => {
  const userId = req.user.id;
  const parseResult = ProfileUpdateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "INVALID_PROFILE_UPDATE", details: parseResult.error.flatten() });
  }

  const data = parseResult.data;
  let profile = db.prepare("SELECT id FROM user_profiles WHERE user_id = ?").get(userId);
  if (!profile) {
    const id = `prof_${crypto.randomBytes(6).toString("hex")}`;
    db.prepare(`
      INSERT INTO user_profiles (id, user_id, display_name, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, userId, data.displayName || req.user.name, data.phone || null);
  }

  const updates = [];
  const params = [];

  if (data.displayName !== undefined) {
    updates.push("display_name = ?");
    params.push(data.displayName);
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run(data.displayName, userId);
  }
  if (data.phone !== undefined) {
    updates.push("phone = ?");
    params.push(data.phone);
    db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(data.phone, userId);
  }
  if (data.avatarUrl !== undefined) {
    updates.push("avatar_url = ?");
    params.push(data.avatarUrl);
  }
  if (data.travelPreferences !== undefined) {
    updates.push("travel_preferences = ?");
    params.push(JSON.stringify(data.travelPreferences));
  }
  if (data.savedAddresses !== undefined) {
    updates.push("saved_addresses = ?");
    params.push(JSON.stringify(data.savedAddresses));
  }
  if (data.emergencyContactName !== undefined) {
    updates.push("emergency_contact_name = ?");
    params.push(data.emergencyContactName);
  }
  if (data.emergencyContactPhone !== undefined) {
    updates.push("emergency_contact_phone = ?");
    params.push(data.emergencyContactPhone);
  }

  updates.push("updated_at = datetime('now')");
  params.push(userId);

  if (updates.length > 1) {
    db.prepare(`UPDATE user_profiles SET ${updates.join(", ")} WHERE user_id = ?`).run(...params);
  }

  const updated = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(userId);
  return res.json({ success: true, profile: updated });
});

// --- WISHLIST / FAVORITES ---
router.get("/wishlists", authenticate, (req, res) => {
  const userId = req.user.id;
  const wishlists = db.prepare(`
    SELECT w.id as wishlist_id, w.added_at, w.price_at_save, w.collection_name,
           p.*, s.company_name as supplier_company_name
    FROM wishlists w
    JOIN products p ON p.id = w.product_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE w.user_id = ?
    ORDER BY w.added_at DESC
  `).all(userId);

  return res.json({ wishlists, wishlist: wishlists });
});

router.post("/wishlists/:productId", authenticate, (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;
  const collectionName = req.body?.collectionName || "Favorites";

  const product = db.prepare("SELECT id, price_inr FROM products WHERE id = ?").get(productId);
  if (!product) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });

  const existing = db.prepare("SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?").get(userId, productId);
  if (existing) {
    db.prepare("UPDATE wishlists SET collection_name = ? WHERE id = ?").run(collectionName, existing.id);
    return res.json({ success: true, message: "Updated in wishlist", id: existing.id });
  }

  const id = `wsh_${crypto.randomBytes(6).toString("hex")}`;
  db.prepare(`
    INSERT INTO wishlists (id, user_id, product_id, price_at_save, collection_name, added_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, userId, productId, product.price_inr, collectionName);

  return res.status(201).json({ success: true, id, productId, added: true });
});

router.delete("/wishlists/:productId", authenticate, (req, res) => {
  const userId = req.user.id;
  const { productId } = req.params;
  db.prepare("DELETE FROM wishlists WHERE user_id = ? AND product_id = ?").run(userId, productId);
  return res.json({ success: true, removed: true });
});

// --- TRAVELER ITINERARIES / TRIP PLANNER ---
router.get("/itineraries", authenticate, (req, res) => {
  try {
    const itineraries = ItineraryService.getUserItineraries(db, req.user.id);
    return res.json({ success: true, itineraries });
  } catch (err) {
    logger.error("Failed to fetch user itineraries", { error: err.message });
    return res.status(500).json({ error: "FAILED_TO_FETCH_ITINERARIES" });
  }
});

router.post("/itineraries", authenticate, (req, res) => {
  try {
    const itinerary = ItineraryService.createItinerary(db, req.user.id, req.body);
    return res.status(201).json({ success: true, itinerary });
  } catch (err) {
    logger.error("Failed to create itinerary", { error: err.message });
    return res.status(400).json({ error: err.message || "FAILED_TO_CREATE_ITINERARY" });
  }
});

router.get("/itineraries/:id", optionalAuthenticate, (req, res) => {
  try {
    const itinerary = ItineraryService.getItineraryById(db, req.params.id, req.user?.id || null);
    if (!itinerary) return res.status(404).json({ error: "ITINERARY_NOT_FOUND" });
    return res.json({ success: true, itinerary });
  } catch (err) {
    if (err.message === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
    logger.error("Failed to fetch itinerary by id", { error: err.message });
    return res.status(500).json({ error: "FAILED_TO_FETCH_ITINERARY" });
  }
});

router.put("/itineraries/:id", authenticate, (req, res) => {
  try {
    const itinerary = ItineraryService.updateItinerary(db, req.user.id, req.params.id, req.body);
    return res.json({ success: true, itinerary });
  } catch (err) {
    if (err.message === "ITINERARY_NOT_FOUND") return res.status(404).json({ error: "ITINERARY_NOT_FOUND" });
    if (err.message === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
    logger.error("Failed to update itinerary", { error: err.message });
    return res.status(400).json({ error: err.message || "FAILED_TO_UPDATE_ITINERARY" });
  }
});

router.delete("/itineraries/:id", authenticate, (req, res) => {
  try {
    const result = ItineraryService.deleteItinerary(db, req.user.id, req.params.id);
    return res.json(result);
  } catch (err) {
    if (err.message === "ITINERARY_NOT_FOUND") return res.status(404).json({ error: "ITINERARY_NOT_FOUND" });
    if (err.message === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });
    logger.error("Failed to delete itinerary", { error: err.message });
    return res.status(500).json({ error: "FAILED_TO_DELETE_ITINERARY" });
  }
});

// --- BOOKING MODIFICATIONS ---
const ModificationRequestSchema = z.object({
  modificationType: z.enum(["DATE_CHANGE", "PARTICIPANTS", "VEHICLE_UPGRADE", "HOTEL_UPGRADE", "ADDON"]),
  originalValue: z.string().min(1),
  requestedValue: z.string().min(1),
  priceDifferenceInr: z.number().optional().default(0),
});

router.post("/bookings/:id/modify", authenticate, (req, res) => {
  const userId = req.user.id;
  const bookingId = req.params.id;

  const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND user_id = ?").get(bookingId, userId);
  if (!booking) return res.status(404).json({ error: "BOOKING_NOT_FOUND" });

  const parseResult = ModificationRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "INVALID_MODIFICATION_REQUEST", details: parseResult.error.flatten() });
  }

  const { modificationType, originalValue, requestedValue, priceDifferenceInr } = parseResult.data;
  const id = `mod_${crypto.randomBytes(6).toString("hex")}`;

  db.prepare(`
    INSERT INTO booking_modifications (
      id, booking_id, requested_by, modification_type, original_value,
      requested_value, price_difference_inr, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
  `).run(id, bookingId, userId, modificationType, originalValue, requestedValue, priceDifferenceInr);

  // Notify supplier via SSE
  if (booking.supplier_id) {
    sseService.publish(`supplier:${booking.supplier_id}`, "BOOKING_MODIFICATION_REQUESTED", {
      bookingId,
      modificationId: id,
      modificationType,
    });
  }

  return res.status(201).json({
    success: true,
    modification: {
      id,
      booking_id: bookingId,
      modification_type: modificationType,
      original_value: originalValue,
      requested_value: requestedValue,
      price_difference_inr: priceDifferenceInr,
      status: "PENDING",
    },
  });
});

router.get("/bookings/:id/modifications", authenticate, (req, res) => {
  const bookingId = req.params.id;
  const modifications = db.prepare("SELECT * FROM booking_modifications WHERE booking_id = ? ORDER BY created_at DESC").all(bookingId);
  return res.json({ modifications });
});

// --- PERSONALIZED RECOMMENDATIONS ---
router.get("/recommendations", optionalAuthenticate, (req, res) => {
  const userId = req.user?.id;
  let preferredCity = "Jaipur";

  if (userId) {
    const recentBooking = db.prepare("SELECT p.city FROM bookings b JOIN products p ON p.id = b.product_id WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 1").get(userId);
    if (recentBooking?.city) {
      preferredCity = recentBooking.city;
    }
  }

  const recommendations = db.prepare(`
    SELECT p.*, s.company_name as supplier_company_name
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE (p.is_published = 1 OR p.status = 'PUBLISHED')
    ORDER BY CASE WHEN LOWER(p.city) = LOWER(?) THEN 1 ELSE 2 END, p.rating DESC, p.bestseller DESC
    LIMIT 6
  `).all(preferredCity);

  return res.json({ recommendations, contextCity: preferredCity });
});

// --- REVIEW HELPFULNESS & PHOTOS ---
router.post("/reviews/:id/helpfulness", authenticate, (req, res) => {
  const userId = req.user.id;
  const reviewId = req.params.id;
  const { isHelpful = true } = req.body;

  const id = `revh_${crypto.randomBytes(6).toString("hex")}`;
  try {
    db.prepare(`
      INSERT INTO review_helpfulness (id, review_id, user_id, is_helpful, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(review_id, user_id) DO UPDATE SET is_helpful = excluded.is_helpful
    `).run(id, reviewId, userId, isHelpful ? 1 : 0);

    const counts = db.prepare(`
      SELECT 
        SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
        SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) as unhelpful_count
      FROM review_helpfulness
      WHERE review_id = ?
    `).get(reviewId);

    return res.json({ success: true, counts });
  } catch (error) {
    return res.status(500).json({ error: "FAILED_TO_VOTE" });
  }
});

router.get("/reviews/:id/photos", (req, res) => {
  const photos = db.prepare("SELECT * FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(req.params.id);
  return res.json({ photos });
});

router.post("/reviews/:id/photos", authenticate, (req, res) => {
  const { photoUrl, caption = "", sortOrder = 0 } = req.body;
  if (!photoUrl) return res.status(400).json({ error: "PHOTO_URL_REQUIRED" });

  const id = `revp_${crypto.randomBytes(6).toString("hex")}`;
  db.prepare(`
    INSERT INTO review_photos (id, review_id, photo_url, caption, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, req.params.id, photoUrl, caption, sortOrder);

  return res.status(201).json({ success: true, id, photoUrl });
});

// --- TRAVELER UNIFIED MESSAGES & NOTIFICATIONS ---
router.get("/traveler/messages", authenticate, (req, res) => {
  const userId = req.user.id;

  // Fetch support case threads
  const supportThreads = db.prepare(`
    SELECT sc.id, sc.case_ref, sc.subject, sc.status, sc.priority, sc.created_at,
           b.ref as booking_ref, p.title as product_title,
           (SELECT message FROM support_case_messages WHERE case_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message,
           (SELECT created_at FROM support_case_messages WHERE case_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message_at
    FROM support_cases sc
    JOIN bookings b ON b.id = sc.booking_id
    LEFT JOIN products p ON p.id = b.product_id
    WHERE sc.opened_by_user_id = ?
    ORDER BY sc.created_at DESC
  `).all(userId);

  // Fetch booking status alerts
  const bookingAlerts = db.prepare(`
    SELECT b.id, b.ref, b.activity_date, b.status, b.created_at,
           p.title as product_title,
           da.driver_name, da.driver_phone, da.vehicle_number
     FROM bookings b
     LEFT JOIN products p ON p.id = b.product_id
     LEFT JOIN driver_assignments da ON da.booking_id = b.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
     LIMIT 10
  `).all(userId);

  return res.json({
    supportThreads,
    bookingAlerts,
  });
});

export default router;
