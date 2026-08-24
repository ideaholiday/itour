import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createVerifiedReview, moderateReview, moderationAssessment, respondToReview } from "../src/services/reviewService.js";

function reviewDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, rating REAL DEFAULT 0, review_count INTEGER DEFAULT 0);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, rating REAL DEFAULT 0);
    CREATE TABLE supplier_drivers (id TEXT PRIMARY KEY, driver_name TEXT, rating REAL DEFAULT 0);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, product_id TEXT, supplier_id TEXT, traveler_name TEXT, activity_date TEXT, status TEXT);
    CREATE TABLE driver_assignments (id TEXT PRIMARY KEY, booking_id TEXT, supplier_driver_id TEXT, driver_name TEXT, vehicle_number TEXT, assignment_status TEXT);
    CREATE TABLE support_cases (id TEXT, supplier_id TEXT, case_type TEXT, status TEXT);
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, booking_id TEXT UNIQUE, user_id TEXT, product_id TEXT, supplier_id TEXT, driver_assignment_id TEXT, supplier_driver_id TEXT, experience_rating INTEGER, supplier_rating INTEGER, driver_rating INTEGER, title TEXT, comment TEXT, tags TEXT DEFAULT '[]', would_recommend INTEGER, status TEXT, moderation_reason TEXT, moderated_by TEXT, moderated_at TEXT, supplier_response TEXT, supplier_responded_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE review_photos (id TEXT PRIMARY KEY, review_id TEXT, photo_url TEXT, caption TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE review_helpfulness (id TEXT PRIMARY KEY, review_id TEXT, user_id TEXT, is_helpful INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), UNIQUE(review_id, user_id));
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, average_rating REAL, completion_rate REAL, complaint_rate REAL, score_100 REAL, tier TEXT, components TEXT, updated_at TEXT, PRIMARY KEY(entity_type, entity_id));
    INSERT INTO products VALUES ('product_1', 'Goa tour', 0, 0);
    INSERT INTO suppliers VALUES ('supplier_1', 'Goa Tours', 0);
    INSERT INTO supplier_drivers VALUES ('driver_1', 'Ramesh', 0);
    INSERT INTO bookings VALUES ('booking_1', 'IH-REVIEW1', 'guest_1', 'product_1', 'supplier_1', 'Goa Guest', '2026-08-20', 'completed');
    INSERT INTO driver_assignments VALUES ('assignment_1', 'booking_1', 'driver_1', 'Ramesh', 'GA-01-1234', 'COMPLETED');
  `);
  return database;
}

const completedBooking = {
  id: "booking_1", ref: "IH-REVIEW1", user_id: "guest_1", product_id: "product_1", supplier_id: "supplier_1",
  status: "completed", driver_assignment_id: "assignment_1", supplier_driver_id: "driver_1", driver_name: "Ramesh", assignment_status: "COMPLETED",
};

test("only a completed booking can create one verified multi-entity review", () => {
  const database = reviewDatabase();
  assert.throws(() => createVerifiedReview(database, { booking: { ...completedBooking, id: "other", status: "confirmed", assignment_status: "ASSIGNED" }, actor: { id: "guest_1" }, input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "A very good trip overall" } }), /only after the trip is completed/);
  const review = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: {
      experienceRating: 5,
      supplierRating: 4,
      driverRating: 5,
      comment: "A very good and punctual Goa tour.",
      tags: ["ON_TIME", "SAFE_DRIVING"],
      photos: ["https://example.com/beach.jpg"],
      wouldRecommend: true
    }
  });
  assert.equal(review.status, "PUBLISHED");
  assert.deepEqual(review.tags, ["ON_TIME", "SAFE_DRIVING"]);
  assert.deepEqual(review.photos, ["https://example.com/beach.jpg"]);
  assert.equal(database.prepare("SELECT rating, review_count FROM products").get().review_count, 1);
  assert.equal(database.prepare("SELECT rating FROM suppliers").get().rating, 4);
  assert.equal(database.prepare("SELECT rating FROM supplier_drivers").get().rating, 5);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM quality_scores").get().count, 3);
  assert.throws(() => createVerifiedReview(database, { booking: completedBooking, actor: { id: "guest_1" }, input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "Submitting the review for a second time" } }), /already has a review/);
  database.close();
});

test("contact details and risky language are held for moderation", () => {
  assert.equal(moderationAssessment("Contact me at guest@example.com").status, "PENDING");
  const database = reviewDatabase();
  const review = createVerifiedReview(database, { booking: completedBooking, actor: { id: "guest_1" }, input: { experienceRating: 2, supplierRating: 2, driverRating: 2, comment: "Call me on 9876500001 about this poor service" } });
  assert.equal(review.status, "PENDING");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM quality_scores").get().count, 0);
  assert.equal(database.prepare("SELECT task_type FROM staff_tasks").get().task_type, "QUALITY_REVIEW");
  const published = moderateReview(database, review.id, { action: "PUBLISHED", reason: "Contact details removed externally", actorId: "admin_1" });
  assert.equal(published.status, "PUBLISHED");
  assert.equal(database.prepare("SELECT review_count FROM quality_scores WHERE entity_type = 'SUPPLIER'").get().review_count, 1);
  database.close();
});

test("only the reviewed supplier can publish a response", () => {
  const database = reviewDatabase();
  const review = createVerifiedReview(database, { booking: completedBooking, actor: { id: "guest_1" }, input: { experienceRating: 4, supplierRating: 4, driverRating: 5, comment: "Good tour with a helpful driver." } });
  assert.throws(() => respondToReview(database, review.id, { supplierId: "another_supplier", response: "Thank you" }), /another supplier/);
  const responded = respondToReview(database, review.id, { supplierId: "supplier_1", response: "Thank you for traveling with us." });
  assert.equal(responded.supplier_response, "Thank you for traveling with us.");
  database.close();
});

test("review details include photo URLs and helpfulness vote metrics", () => {
  const database = reviewDatabase();
  const review = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: {
      experienceRating: 5,
      supplierRating: 5,
      driverRating: 5,
      title: "Memorable Experience",
      comment: "Incredible hospitality and punctual driver throughout the day.",
      photos: ["https://example.com/p1.jpg", { url: "https://example.com/p2.jpg", caption: "Sunset view" }]
    }
  });

  // Record helpfulness votes
  database.prepare("INSERT INTO review_helpfulness (id, review_id, user_id, is_helpful) VALUES ('h1', ?, 'user_2', 1)").run(review.id);
  database.prepare("INSERT INTO review_helpfulness (id, review_id, user_id, is_helpful) VALUES ('h2', ?, 'user_3', 1)").run(review.id);
  database.prepare("INSERT INTO review_helpfulness (id, review_id, user_id, is_helpful) VALUES ('h3', ?, 'user_4', 0)").run(review.id);

  const details = database.prepare(`SELECT r.*, b.ref AS booking_ref, b.traveler_name, b.activity_date, p.title AS product_title,
    s.company_name AS supplier_name, da.driver_name, da.vehicle_number
    FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN products p ON p.id = r.product_id
    JOIN suppliers s ON s.id = r.supplier_id LEFT JOIN driver_assignments da ON da.id = r.driver_assignment_id
    WHERE r.id = ?`).get(review.id);
  assert.ok(details);

  const photos = database.prepare("SELECT photo_url FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC").all(review.id);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].photo_url, "https://example.com/p1.jpg");
  assert.equal(photos[1].photo_url, "https://example.com/p2.jpg");

  const votes = database.prepare("SELECT SUM(CASE WHEN is_helpful = 1 THEN 1 ELSE 0 END) AS helpful, SUM(CASE WHEN is_helpful = 0 THEN 1 ELSE 0 END) AS unhelpful FROM review_helpfulness WHERE review_id = ?").get(review.id);
  assert.equal(votes.helpful, 2);
  assert.equal(votes.unhelpful, 1);
  database.close();
});
