import { nanoid } from "nanoid";

const REVIEW_STATUSES = new Set(["PUBLISHED", "PENDING", "REJECTED", "FLAGGED"]);
const ALLOWED_TAGS = new Set(["ON_TIME", "FRIENDLY_DRIVER", "CLEAN_VEHICLE", "GREAT_GUIDE", "GOOD_VALUE", "ACCURATE_LISTING", "SAFE_DRIVING", "POOR_COMMUNICATION", "LATE_PICKUP", "VEHICLE_ISSUE", "ITINERARY_ISSUE"]);
const reviewError = (message, status = 400) => Object.assign(new Error(message), { status });
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, precision = 2) => Number(Number(value || 0).toFixed(precision));

function rating(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw reviewError(`${label} rating must be between 1 and 5`);
  return parsed;
}

export function moderationAssessment(comment, title = "") {
  const text = `${title} ${comment}`.toLowerCase();
  const reasons = [];
  if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) reasons.push("Contains contact details or a promotional link");
  if (/\b\+?\d[\d\s-]{8,}\b/.test(text)) reasons.push("Contains a phone number");
  if (/\b(?:idiot|stupid|scam|fraud|abuse)\b/i.test(text)) reasons.push("Potentially abusive or high-risk language");
  if (/(.)\1{10,}/.test(text)) reasons.push("Possible spam text");
  return { status: reasons.length ? "PENDING" : "PUBLISHED", reason: reasons.join("; ") || null };
}

function tier(score, reviewCount) {
  if (!reviewCount) return "NEW";
  if (score >= 90) return "EXCELLENT";
  if (score >= 80) return "STRONG";
  if (score >= 70) return "GOOD";
  if (score >= 55) return "WATCH";
  return "NEEDS_ATTENTION";
}

function saveScore(database, { entityType, entityId, reviewCount, averageRating, completionRate = null, complaintRate = null, score, components }) {
  database.prepare(`
    INSERT INTO quality_scores (entity_type, entity_id, review_count, average_rating, completion_rate, complaint_rate, score_100, tier, components, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET review_count = excluded.review_count,
      average_rating = excluded.average_rating, completion_rate = excluded.completion_rate,
      complaint_rate = excluded.complaint_rate, score_100 = excluded.score_100,
      tier = excluded.tier, components = excluded.components, updated_at = datetime('now')
  `).run(entityType, entityId, reviewCount, averageRating, completionRate, complaintRate, score, tier(score, reviewCount), JSON.stringify(components));
}

export function recalculateQualityScores(database, { productId, supplierId, supplierDriverId } = {}) {
  if (productId) {
    const aggregate = database.prepare("SELECT COUNT(*) AS count, AVG(experience_rating) AS average FROM reviews WHERE product_id = ? AND status = 'PUBLISHED'").get(productId);
    const count = Number(aggregate.count || 0);
    const average = round(aggregate.average);
    const confidence = Math.min(1, count / 20);
    const score = count ? round((average / 5 * 90) + confidence * 10) : 0;
    saveScore(database, { entityType: "PRODUCT", entityId: productId, reviewCount: count, averageRating: average || null, score, components: { rating: round(average / 5 * 90), confidence: round(confidence * 10) } });
    if (count) database.prepare("UPDATE products SET rating = ?, review_count = ? WHERE id = ?").run(average, count, productId);
  }
  if (supplierId) {
    const aggregate = database.prepare("SELECT COUNT(*) AS count, AVG(supplier_rating) AS average FROM reviews WHERE supplier_id = ? AND status = 'PUBLISHED'").get(supplierId);
    const tripStats = database.prepare(`SELECT COUNT(*) AS terminal, SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END) AS completed FROM bookings WHERE supplier_id = ? AND LOWER(status) IN ('completed','cancelled')`).get(supplierId);
    const complaints = database.prepare("SELECT COUNT(*) AS count FROM support_cases WHERE supplier_id = ? AND case_type IN ('COMPLAINT','SAFETY') AND status != 'REJECTED'").get(supplierId).count;
    const count = Number(aggregate.count || 0);
    const average = round(aggregate.average);
    const completionRate = tripStats.terminal ? round(Number(tripStats.completed || 0) / tripStats.terminal * 100) : 100;
    const complaintRate = tripStats.terminal ? round(Number(complaints || 0) / tripStats.terminal * 100) : 0;
    const ratingComponent = average ? average / 5 * 70 : 0;
    const completionComponent = completionRate / 100 * 20;
    const complaintComponent = Math.max(0, 10 - complaintRate / 10);
    const confidence = 0.85 + Math.min(1, count / 20) * 0.15;
    const score = count ? round((ratingComponent + completionComponent + complaintComponent) * confidence) : 0;
    saveScore(database, { entityType: "SUPPLIER", entityId: supplierId, reviewCount: count, averageRating: average || null, completionRate, complaintRate, score, components: { rating: round(ratingComponent), completion: round(completionComponent), complaintHealth: round(complaintComponent), confidence: round(confidence * 100) } });
    if (count) database.prepare("UPDATE suppliers SET rating = ? WHERE id = ?").run(average, supplierId);
  }
  if (supplierDriverId) {
    const aggregate = database.prepare("SELECT COUNT(*) AS count, AVG(driver_rating) AS average FROM reviews WHERE supplier_driver_id = ? AND driver_rating IS NOT NULL AND status = 'PUBLISHED'").get(supplierDriverId);
    const assignments = database.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN assignment_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed FROM driver_assignments WHERE supplier_driver_id = ?").get(supplierDriverId);
    const count = Number(aggregate.count || 0);
    const average = round(aggregate.average);
    const completionRate = assignments.total ? round(Number(assignments.completed || 0) / assignments.total * 100) : 100;
    const confidence = 0.85 + Math.min(1, count / 20) * 0.15;
    const score = count ? round(((average / 5 * 85) + (completionRate / 100 * 15)) * confidence) : 0;
    saveScore(database, { entityType: "DRIVER", entityId: supplierDriverId, reviewCount: count, averageRating: average || null, completionRate, score, components: { rating: round(average / 5 * 85), completion: round(completionRate / 100 * 15), confidence: round(confidence * 100) } });
    if (count) database.prepare("UPDATE supplier_drivers SET rating = ? WHERE id = ?").run(average, supplierDriverId);
  }
  return {
    product: productId ? database.prepare("SELECT * FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(productId) : null,
    supplier: supplierId ? database.prepare("SELECT * FROM quality_scores WHERE entity_type = 'SUPPLIER' AND entity_id = ?").get(supplierId) : null,
    driver: supplierDriverId ? database.prepare("SELECT * FROM quality_scores WHERE entity_type = 'DRIVER' AND entity_id = ?").get(supplierDriverId) : null,
  };
}

export function createVerifiedReview(database, { booking, actor, input }) {
  if (String(booking.status).toLowerCase() !== "completed" && String(booking.assignment_status).toUpperCase() !== "COMPLETED") throw reviewError("A review can be submitted only after the trip is completed", 409);
  if (database.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(booking.id)) throw reviewError("This completed booking already has a review", 409);
  const comment = String(input.comment || "").trim().slice(0, 2000);
  if (comment.length < 10) throw reviewError("Write at least 10 characters about the experience");
  const title = String(input.title || "").trim().slice(0, 120);
  const experienceRating = rating(input.experienceRating ?? input.experience_rating, "Experience");
  const supplierRating = rating(input.supplierRating ?? input.supplier_rating, "Supplier");
  const driverRating = rating(input.driverRating ?? input.driver_rating, "Driver", !booking.driver_assignment_id);
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => String(tag).toUpperCase()).filter((tag) => ALLOWED_TAGS.has(tag)))].slice(0, 6);
  const assessment = moderationAssessment(comment, title);
  const id = `rev_${nanoid(12)}`;
  database.prepare(`INSERT INTO reviews (
    id, booking_id, user_id, product_id, supplier_id, driver_assignment_id, supplier_driver_id,
    experience_rating, supplier_rating, driver_rating, title, comment, tags, would_recommend,
    status, moderation_reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, booking.id, booking.user_id || actor.id, booking.product_id, booking.supplier_id,
      booking.driver_assignment_id || null, booking.supplier_driver_id || null,
      experienceRating, supplierRating, driverRating, title || null, comment, JSON.stringify(tags),
      (input.wouldRecommend === false || input.would_recommend === false) ? 0 : 1, assessment.status, assessment.reason);

  if (Array.isArray(input.photos) && input.photos.length > 0) {
    const insertPhoto = database.prepare("INSERT INTO review_photos (id, review_id, photo_url, caption, sort_order, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))");
    input.photos.slice(0, 10).forEach((item, index) => {
      const url = typeof item === "string" ? item : (item?.photo_url || item?.url);
      const caption = typeof item === "object" ? (item?.caption || "") : "";
      if (url && typeof url === "string" && url.trim().length > 0) {
        insertPhoto.run(`revp_${nanoid(10)}`, id, url.trim(), caption, index);
      }
    });
  }

  if (Math.min(experienceRating, supplierRating, driverRating || 5) <= 2) {
    database.prepare("INSERT INTO staff_tasks (id, task_type, booking_id, product_id, assigned_staff_name, priority, status, notes) VALUES (?, 'QUALITY_REVIEW', ?, ?, 'Quality Team', 'HIGH', 'OPEN', ?)")
      .run(`task_${nanoid(12)}`, booking.id, booking.product_id, `Low verified rating on booking ${booking.ref}. Review ${id} requires follow-up.`);
  }
  if (assessment.status === "PUBLISHED") recalculateQualityScores(database, { productId: booking.product_id, supplierId: booking.supplier_id, supplierDriverId: booking.supplier_driver_id });
  return reviewDetails(database, id);
}

export function reviewDetails(database, id) {
  const row = database.prepare(`SELECT r.*, b.ref AS booking_ref, b.traveler_name, b.activity_date, p.title AS product_title,
    s.company_name AS supplier_name, da.driver_name, da.vehicle_number
    FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN products p ON p.id = r.product_id
    JOIN suppliers s ON s.id = r.supplier_id LEFT JOIN driver_assignments da ON da.id = r.driver_assignment_id
    WHERE r.id = ?`).get(id);
  if (!row) throw reviewError("Review not found", 404);

  const photos = database.prepare("SELECT id, photo_url, caption, sort_order FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(id);
  const helpfulness = database.prepare(`
    SELECT 
      SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) AS helpful_count,
      SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) AS unhelpful_count
    FROM review_helpfulness WHERE review_id = ?
  `).get(id) || { helpful_count: 0, unhelpful_count: 0 };

  return {
    ...row,
    tags: JSON.parse(row.tags || "[]"),
    photos: photos.map((p) => p.photo_url),
    photo_details: photos,
    helpful_count: Number(helpfulness.helpful_count || 0),
    unhelpful_count: Number(helpfulness.unhelpful_count || 0)
  };
}

export function moderateReview(database, reviewId, { action, reason, actorId }) {
  const current = reviewDetails(database, reviewId);
  const next = String(action || "").toUpperCase();
  if (!REVIEW_STATUSES.has(next)) throw reviewError("Choose published, pending, rejected or flagged status");
  if (["REJECTED", "FLAGGED"].includes(next) && String(reason || "").trim().length < 5) throw reviewError("Add a moderation reason");
  database.prepare("UPDATE reviews SET status = ?, moderation_reason = ?, moderated_by = ?, moderated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(next, String(reason || "").trim() || null, actorId, reviewId);
  recalculateQualityScores(database, { productId: current.product_id, supplierId: current.supplier_id, supplierDriverId: current.supplier_driver_id });
  return reviewDetails(database, reviewId);
}

export function respondToReview(database, reviewId, { supplierId, response }) {
  const current = reviewDetails(database, reviewId);
  if (current.supplier_id !== supplierId) throw reviewError("This review belongs to another supplier", 403);
  if (current.status !== "PUBLISHED") throw reviewError("Only a published review can receive a public response", 409);
  const body = String(response || "").trim().slice(0, 1000);
  if (body.length < 5) throw reviewError("Write a helpful response");
  database.prepare("UPDATE reviews SET supplier_response = ?, supplier_responded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(body, reviewId);
  return reviewDetails(database, reviewId);
}
