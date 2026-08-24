import express from "express";
import { nanoid } from "nanoid";
import db from "../db.js";
import { authenticate, optionalAuthMiddleware, requireRoles } from "../middleware/auth.js";
import { createVerifiedReview, moderateReview, recalculateQualityScores, respondToReview, reviewDetails } from "../services/reviewService.js";
import { validateBody } from "../middleware/validation.js";
import { reviewSchemas } from "../validators/apiSchemas.js";

const router = express.Router();
router.use(optionalAuthMiddleware);

function requester(req) {
  return req.user || null;
}

function travelerOwns(actor, booking) {
  return actor && (actor.id === booking.user_id || (actor.email && actor.email.toLowerCase() === String(booking.traveler_email || "").toLowerCase()));
}

function reviewBooking(ref) {
  return db.prepare(`SELECT b.*, p.title AS product_title, s.company_name AS supplier_name,
    da.id AS driver_assignment_id, da.supplier_driver_id, da.driver_name, da.vehicle_number, da.assignment_status
    FROM bookings b JOIN products p ON p.id = b.product_id JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id WHERE b.id = ? OR b.ref = ?`).get(ref, ref);
}

router.get("/eligible", authenticate, (req, res) => {
  const actor = requester(req);
  if (!actor) return res.status(401).json({ error: "Sign in to review completed trips" });
  const rows = db.prepare(`SELECT b.id, b.ref, b.activity_date, b.product_id, b.supplier_id,
    p.title AS product_title, p.hero_image, s.company_name AS supplier_name,
    da.id AS driver_assignment_id, da.driver_name, da.vehicle_number, da.assignment_status
    FROM bookings b JOIN products p ON p.id = b.product_id JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id LEFT JOIN reviews r ON r.booking_id = b.id
    WHERE r.id IS NULL AND (LOWER(b.status) = 'completed' OR da.assignment_status = 'COMPLETED')
      AND (b.user_id = ? OR (? != '' AND LOWER(b.traveler_email) = LOWER(?)))
    ORDER BY b.activity_date DESC`).all(actor.id || "", actor.email || "", actor.email || "");
  return res.json({ success: true, bookings: rows });
});

router.get("/mine", authenticate, (req, res) => {
  const actor = requester(req);
  if (!actor) return res.status(401).json({ error: "Sign in to view reviews" });
  const rows = db.prepare(`SELECT r.*, b.ref AS booking_ref, b.activity_date, p.title AS product_title, s.company_name AS supplier_name, da.driver_name
    FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN products p ON p.id = r.product_id
    JOIN suppliers s ON s.id = r.supplier_id LEFT JOIN driver_assignments da ON da.id = r.driver_assignment_id
    WHERE r.user_id = ? OR (? != '' AND LOWER(b.traveler_email) = LOWER(?)) ORDER BY r.created_at DESC`).all(actor.id || "", actor.email || "", actor.email || "").map((row) => {
      const photos = db.prepare("SELECT photo_url, caption FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(row.id);
      return {
        ...row,
        tags: JSON.parse(row.tags || "[]"),
        photos: photos.map((p) => p.photo_url),
        photo_details: photos,
      };
    });
  return res.json({ success: true, reviews: rows });
});

router.post("/", authenticate, validateBody(reviewSchemas.create), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor) return res.status(401).json({ error: "Sign in to submit a review" });
    const booking = reviewBooking(req.body.bookingId || req.body.bookingRef);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!travelerOwns(actor, booking)) return res.status(403).json({ error: "Only the traveler who completed this booking can review it" });
    const review = createVerifiedReview(db, { booking, actor, input: req.body });
    return res.status(201).json({ success: true, review, message: review.status === "PUBLISHED" ? "Your verified review is now published." : "Your review was received and is awaiting moderation." });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Review could not be submitted" });
  }
});

router.get("/product/:id", (req, res) => {
  const productId = req.params.id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const sort = String(req.query.sort || "newest").toLowerCase();
  const ratingFilter = req.query.rating ? parseInt(req.query.rating, 10) : null;

  // Aggregate overall distribution & quality metrics for this product
  const distRow = db.prepare(`
    SELECT 
      COUNT(*) AS total,
      AVG(experience_rating) AS average,
      SUM(CASE WHEN experience_rating = 5 THEN 1 ELSE 0 END) AS count_5,
      SUM(CASE WHEN experience_rating = 4 THEN 1 ELSE 0 END) AS count_4,
      SUM(CASE WHEN experience_rating = 3 THEN 1 ELSE 0 END) AS count_3,
      SUM(CASE WHEN experience_rating = 2 THEN 1 ELSE 0 END) AS count_2,
      SUM(CASE WHEN experience_rating = 1 THEN 1 ELSE 0 END) AS count_1
    FROM reviews 
    WHERE product_id = ? AND status = 'PUBLISHED'
  `).get(productId) || {};

  const totalReviews = Number(distRow.total || 0);
  const averageRating = distRow.average ? Number(Number(distRow.average).toFixed(2)) : null;
  const distribution = {
    5: Number(distRow.count_5 || 0),
    4: Number(distRow.count_4 || 0),
    3: Number(distRow.count_3 || 0),
    2: Number(distRow.count_2 || 0),
    1: Number(distRow.count_1 || 0)
  };

  // Build filter query
  const whereClauses = ["r.product_id = ?", "r.status = 'PUBLISHED'"];
  const params = [productId];

  if (ratingFilter && ratingFilter >= 1 && ratingFilter <= 5) {
    whereClauses.push("r.experience_rating = ?");
    params.push(ratingFilter);
  }

  // Count matching reviews
  const filteredCountRow = db.prepare(`
    SELECT COUNT(*) AS total FROM reviews r WHERE ${whereClauses.join(" AND ")}
  `).get(...params);
  const filteredTotal = Number(filteredCountRow?.total || 0);

  // Sorting
  let orderBy = "r.created_at DESC";
  if (sort === "highest") {
    orderBy = "r.experience_rating DESC, r.created_at DESC";
  } else if (sort === "lowest") {
    orderBy = "r.experience_rating ASC, r.created_at DESC";
  } else if (sort === "most_helpful") {
    orderBy = "helpful_count DESC, r.created_at DESC";
  }

  const listParams = [...params, limit, offset];
  const reviews = db.prepare(`
    SELECT r.id, r.experience_rating, r.supplier_rating, r.driver_rating, r.title, r.comment, r.tags, r.would_recommend,
      r.supplier_response, r.supplier_responded_at, r.created_at, b.traveler_name, b.activity_date,
      COALESCE(h.helpful_count, 0) AS helpful_count,
      COALESCE(h.unhelpful_count, 0) AS unhelpful_count
    FROM reviews r 
    JOIN bookings b ON b.id = r.booking_id 
    LEFT JOIN (
      SELECT review_id,
        SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) AS helpful_count,
        SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) AS unhelpful_count
      FROM review_helpfulness
      GROUP BY review_id
    ) h ON h.review_id = r.id
    WHERE ${whereClauses.join(" AND ")} 
    ORDER BY ${orderBy} 
    LIMIT ? OFFSET ?
  `).all(...listParams).map((row) => {
    const photos = db.prepare("SELECT photo_url, caption FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(row.id);
    return {
      ...row,
      traveler_name: `${String(row.traveler_name || "Traveler").split(" ")[0]} ${String(row.traveler_name || "").split(" ")[1]?.[0] || ""}.`.trim(),
      tags: JSON.parse(row.tags || "[]"),
      photos: photos.map((p) => p.photo_url),
      photo_details: photos,
      helpful_count: Number(row.helpful_count || 0),
      unhelpful_count: Number(row.unhelpful_count || 0)
    };
  });

  const quality = db.prepare("SELECT * FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(productId) || null;

  return res.json({
    success: true,
    reviews,
    pagination: {
      page,
      limit,
      total: filteredTotal,
      totalPages: Math.ceil(filteredTotal / limit) || 1,
      hasNext: page * limit < filteredTotal,
      hasPrev: page > 1
    },
    distribution,
    totalReviews,
    averageRating,
    quality
  });
});

// Helpfulness voting on reviews
router.post("/:id/helpfulness", authenticate, (req, res) => {
  const userId = req.user?.id;
  const reviewId = req.params.id;
  const isHelpful = req.body.isHelpful === false ? 0 : 1;

  if (!userId) return res.status(401).json({ error: "Sign in to vote on reviews" });

  try {
    const id = `revh_${nanoid(12)}`;
    db.prepare(`
      INSERT INTO review_helpfulness (id, review_id, user_id, is_helpful, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(review_id, user_id) DO UPDATE SET is_helpful = excluded.is_helpful
    `).run(id, reviewId, userId, isHelpful);

    const counts = db.prepare(`
      SELECT 
        SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
        SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) as unhelpful_count
      FROM review_helpfulness
      WHERE review_id = ?
    `).get(reviewId);

    return res.json({
      success: true,
      counts: {
        helpful_count: Number(counts?.helpful_count || 0),
        unhelpful_count: Number(counts?.unhelpful_count || 0)
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Helpfulness vote could not be recorded" });
  }
});

// Photo upload on reviews
router.get("/:id/photos", (req, res) => {
  const photos = db.prepare("SELECT * FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(req.params.id);
  return res.json({ success: true, photos });
});

router.post("/:id/photos", authenticate, (req, res) => {
  const { photoUrl, caption = "", sortOrder = 0 } = req.body;
  if (!photoUrl) return res.status(400).json({ error: "Photo URL is required" });

  const id = `revp_${nanoid(12)}`;
  db.prepare(`
    INSERT INTO review_photos (id, review_id, photo_url, caption, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, req.params.id, photoUrl, caption, sortOrder);

  return res.status(201).json({ success: true, id, photoUrl });
});

router.get("/supplier/:id", optionalAuthMiddleware, (req, res) => {
  const actor = requester(req);
  const role = String(actor?.role || "").toUpperCase();
  const internal = ["ADMIN", "STAFF"].includes(role);
  const statusClause = internal ? "r.status != 'REJECTED'" : "r.status = 'PUBLISHED'";
  const reviews = db.prepare(`SELECT r.*, b.ref AS booking_ref, p.title AS product_title, da.driver_name
    FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN products p ON p.id = r.product_id
    LEFT JOIN driver_assignments da ON da.id = r.driver_assignment_id WHERE r.supplier_id = ? AND ${statusClause} ORDER BY r.created_at DESC LIMIT 200`).all(req.params.id).map((row) => ({ ...row, tags: JSON.parse(row.tags || "[]") }));
  const quality = db.prepare("SELECT * FROM quality_scores WHERE entity_type = 'SUPPLIER' AND entity_id = ?").get(req.params.id) || recalculateQualityScores(db, { supplierId: req.params.id }).supplier;
  return res.json({ success: true, reviews, quality });
});

router.post("/:id/response", authenticate, requireRoles("SUPPLIER"), validateBody(reviewSchemas.response), (req, res) => {
  try {
    const actor = requester(req);
    if (String(actor?.role || "").toUpperCase() !== "SUPPLIER" || !actor.supplier_id) return res.status(403).json({ error: "Supplier access required" });
    return res.json({ success: true, review: respondToReview(db, req.params.id, { supplierId: actor.supplier_id, response: req.body.response }) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Response could not be published" });
  }
});

router.get("/admin/dashboard", authenticate, requireRoles("ADMIN", "STAFF"), (req, res) => {
  const actor = requester(req);
  if (!actor || !["ADMIN", "STAFF"].includes(String(actor.role).toUpperCase())) return res.status(403).json({ error: "Quality moderation access required" });
  const reviewedProducts = db.prepare("SELECT DISTINCT product_id FROM reviews").all();
  const reviewedSuppliers = db.prepare("SELECT DISTINCT supplier_id FROM reviews").all();
  const reviewedDrivers = db.prepare("SELECT DISTINCT supplier_driver_id FROM reviews WHERE supplier_driver_id IS NOT NULL").all();
  for (const row of reviewedProducts) recalculateQualityScores(db, { productId: row.product_id });
  for (const row of reviewedSuppliers) recalculateQualityScores(db, { supplierId: row.supplier_id });
  for (const row of reviewedDrivers) recalculateQualityScores(db, { supplierDriverId: row.supplier_driver_id });
  const reviews = db.prepare(`SELECT r.*, b.ref AS booking_ref, b.traveler_name, p.title AS product_title,
    s.company_name AS supplier_name, da.driver_name FROM reviews r JOIN bookings b ON b.id = r.booking_id
    JOIN products p ON p.id = r.product_id JOIN suppliers s ON s.id = r.supplier_id
    LEFT JOIN driver_assignments da ON da.id = r.driver_assignment_id ORDER BY CASE r.status WHEN 'PENDING' THEN 1 WHEN 'FLAGGED' THEN 2 ELSE 3 END, r.created_at DESC LIMIT 300`).all().map((row) => ({ ...row, tags: JSON.parse(row.tags || "[]") }));
  const scores = db.prepare(`SELECT qs.*, CASE qs.entity_type WHEN 'SUPPLIER' THEN s.company_name WHEN 'PRODUCT' THEN p.title WHEN 'DRIVER' THEN sd.driver_name END AS entity_name
    FROM quality_scores qs LEFT JOIN suppliers s ON qs.entity_type = 'SUPPLIER' AND s.id = qs.entity_id
    LEFT JOIN products p ON qs.entity_type = 'PRODUCT' AND p.id = qs.entity_id
    LEFT JOIN supplier_drivers sd ON qs.entity_type = 'DRIVER' AND sd.id = qs.entity_id ORDER BY qs.score_100 DESC`).all();
  const metrics = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN status IN ('PENDING','FLAGGED') THEN 1 ELSE 0 END) AS moderation_queue,
    AVG(CASE WHEN status = 'PUBLISHED' THEN (experience_rating + supplier_rating + COALESCE(driver_rating, supplier_rating)) / 3.0 END) AS average_rating FROM reviews`).get();
  return res.json({ success: true, reviews, scores, metrics });
});

router.patch("/admin/:id/moderate", authenticate, requireRoles("ADMIN", "STAFF"), validateBody(reviewSchemas.moderate), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !["ADMIN", "STAFF"].includes(String(actor.role).toUpperCase())) return res.status(403).json({ error: "Quality moderation access required" });
    return res.json({ success: true, review: moderateReview(db, req.params.id, { action: req.body.action, reason: req.body.reason, actorId: actor.id }) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Review moderation could not be saved" });
  }
});

export default router;
