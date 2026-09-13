import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createVerifiedReview, isSupplierSelfReview, moderateReview, moderationAssessment, priorMeanRating, RATING_PRIOR_WEIGHT, respondToReview, smoothedRating } from "../src/services/reviewService.js";

function reviewDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, rating REAL, review_count INTEGER DEFAULT 0, category TEXT DEFAULT 'TOURS');
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, email TEXT, rating REAL);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT DEFAULT 'TRAVELER');
    CREATE TABLE supplier_drivers (id TEXT PRIMARY KEY, driver_name TEXT, rating REAL);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, product_id TEXT, supplier_id TEXT, traveler_name TEXT, traveler_email TEXT, activity_date TEXT, status TEXT);
    CREATE TABLE driver_assignments (id TEXT PRIMARY KEY, booking_id TEXT, supplier_driver_id TEXT, driver_name TEXT, vehicle_number TEXT, assignment_status TEXT);
    CREATE TABLE support_cases (id TEXT, supplier_id TEXT, case_type TEXT, status TEXT);
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, booking_id TEXT UNIQUE, user_id TEXT, product_id TEXT, supplier_id TEXT, driver_assignment_id TEXT, supplier_driver_id TEXT, experience_rating INTEGER, supplier_rating INTEGER, driver_rating INTEGER, title TEXT, comment TEXT, tags TEXT DEFAULT '[]', would_recommend INTEGER, status TEXT, moderation_reason TEXT, moderated_by TEXT, moderated_at TEXT, supplier_response TEXT, supplier_responded_at TEXT, source TEXT NOT NULL DEFAULT 'VERIFIED', invite_id TEXT, verification_method TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE review_photos (id TEXT PRIMARY KEY, review_id TEXT, photo_url TEXT, caption TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE review_helpfulness (id TEXT PRIMARY KEY, review_id TEXT, user_id TEXT, is_helpful INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), UNIQUE(review_id, user_id));
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, verified_review_count INTEGER DEFAULT 0, average_rating REAL, smoothed_rating REAL, completion_rate REAL, complaint_rate REAL, score_100 REAL, tier TEXT, components TEXT, updated_at TEXT, PRIMARY KEY(entity_type, entity_id));
    INSERT INTO products (id, title, category) VALUES ('product_1', 'Goa tour', 'TOURS');
    INSERT INTO suppliers (id, company_name, email) VALUES ('supplier_1', 'Goa Tours', 'owner@goatours.in');
    INSERT INTO users (id, name, email, role) VALUES ('guest_1', 'Goa Guest', 'guest@example.com', 'TRAVELER');
    INSERT INTO users (id, name, email, role) VALUES ('operator_1', 'Goa Tours Owner', 'owner@goatours.in', 'SUPPLIER');
    INSERT INTO supplier_drivers (id, driver_name) VALUES ('driver_1', 'Ramesh');
    INSERT INTO bookings VALUES ('booking_1', 'IH-REVIEW1', 'guest_1', 'product_1', 'supplier_1', 'Goa Guest', 'guest@example.com', '2026-08-20', 'completed');
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

test("a rating is smoothed towards the prior, and an unreviewed entity carries no rating of its own", () => {
  const database = reviewDatabase();

  // No reviews anywhere: the prior is the documented fallback, and a listing
  // holds no rating at all rather than a flattering placeholder.
  assert.equal(priorMeanRating(database, "PRODUCT"), 4.5);
  assert.equal(database.prepare("SELECT rating FROM products WHERE id = 'product_1'").get().rating, null);

  // One 5-star review cannot drag a listing to 5.0 — with a prior weight of 20
  // it lands just above the prior, while the displayed average stays literal.
  createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "Excellent trip from start to end." },
  });

  const score = database.prepare("SELECT review_count, average_rating, smoothed_rating, verified_review_count FROM quality_scores WHERE entity_type = 'PRODUCT'").get();
  assert.equal(score.review_count, 1);
  assert.equal(score.verified_review_count, 1);
  assert.equal(score.average_rating, 5);
  assert.equal(score.smoothed_rating, smoothedRating(5, 1, 4.5));
  assert.ok(score.smoothed_rating > 4.5 && score.smoothed_rating < 4.6);
  assert.equal(database.prepare("SELECT rating, review_count FROM products WHERE id = 'product_1'").get().rating, 5);
  database.close();
});

test("the prior loses influence as real reviews accumulate", () => {
  const prior = 4.5;
  const one = smoothedRating(5, 1, prior);
  const many = smoothedRating(5, RATING_PRIOR_WEIGHT, prior);
  const lots = smoothedRating(5, RATING_PRIOR_WEIGHT * 10, prior);

  assert.ok(one < many && many < lots);
  // At exactly the prior weight the two sides carry equal weight: (4.5 + 5) / 2.
  assert.equal(many, 4.75);
  assert.ok(lots > 4.9, `expected the prior to be all but forgotten, got ${lots}`);
  // A listing with nothing of its own sits exactly at the prior, never at zero.
  assert.equal(smoothedRating(null, 0, prior), prior);
});

test("rejecting the last review clears the rating it created", () => {
  const database = reviewDatabase();
  const review = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "A genuinely excellent day out." },
  });
  assert.equal(database.prepare("SELECT rating FROM products WHERE id = 'product_1'").get().rating, 5);

  moderateReview(database, review.id, { action: "REJECTED", reason: "Submitted by the operator", actorId: "admin_1" });

  const product = database.prepare("SELECT rating, review_count FROM products WHERE id = 'product_1'").get();
  assert.equal(product.rating, null, "a rejected review must not leave its rating behind");
  assert.equal(product.review_count, 0);
  assert.equal(database.prepare("SELECT rating FROM suppliers WHERE id = 'supplier_1'").get().rating, null);
  assert.equal(database.prepare("SELECT review_count FROM quality_scores WHERE entity_type = 'PRODUCT'").get().review_count, 0);
  database.close();
});

test("provenance is recorded on every review", () => {
  const database = reviewDatabase();
  const signedIn = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "Submitted from my bookings list." },
  });
  assert.equal(signedIn.source, "VERIFIED");
  assert.equal(signedIn.verification_method, "SIGNED_IN");
  assert.equal(signedIn.invite_id, null);

  database.prepare("DELETE FROM reviews").run();
  const viaLink = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 4, supplierRating: 4, driverRating: 4, comment: "Submitted from a supplier share link." },
    meta: { inviteId: "rvi_abc", verificationMethod: "BOOKING_REF" },
  });
  assert.equal(viaLink.source, "VERIFIED", "a claimed link is as verified as the emailed invite");
  assert.equal(viaLink.verification_method, "BOOKING_REF");
  assert.equal(viaLink.invite_id, "rvi_abc");
  database.close();
});

test("only rated sources reach a rating", () => {
  const database = reviewDatabase();
  database.prepare("INSERT INTO bookings VALUES ('booking_2', 'IH-REVIEW2', 'guest_2', 'product_1', 'supplier_1', 'Other Guest', 'other@example.com', '2026-08-21', 'completed')").run();
  // An imported review is displayed with attribution but never counted.
  database.prepare(`INSERT INTO reviews (id, booking_id, user_id, product_id, supplier_id, experience_rating, supplier_rating, comment, status, source)
    VALUES ('rev_imported', 'booking_2', 'guest_2', 'product_1', 'supplier_1', 1, 1, 'Imported from an external site', 'PUBLISHED', 'IMPORTED')`).run();

  createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "Verified traveler, genuinely great trip." },
  });

  const score = database.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'PRODUCT'").get();
  assert.equal(score.review_count, 1, "the imported review must not be counted");
  assert.equal(score.average_rating, 5, "the imported 1-star must not move the verified average");
  database.close();
});

test("an operator cannot review their own listing", () => {
  const database = reviewDatabase();

  // The operator's own contact email on the booking, whatever account submits.
  const ownBooking = { ...completedBooking, id: "booking_own", traveler_email: "owner@goatours.in" };
  database.prepare("INSERT INTO bookings VALUES ('booking_own', 'IH-SELF1', 'operator_1', 'product_1', 'supplier_1', 'Goa Tours Owner', 'owner@goatours.in', '2026-08-22', 'completed')").run();
  assert.equal(isSupplierSelfReview(database, ownBooking), true);
  assert.throws(() => createVerifiedReview(database, {
    booking: ownBooking,
    actor: { id: "operator_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "Our own service was excellent today." },
  }), /cannot review their own listing/);

  // A booking in a traveler's name, submitted by the operator's account, is
  // the same thing wearing a different hat.
  assert.equal(isSupplierSelfReview(database, completedBooking, { id: "operator_1" }), true);

  // An ordinary traveler is unaffected.
  assert.equal(isSupplierSelfReview(database, completedBooking, { id: "guest_1" }), false);
  const genuine = createVerifiedReview(database, {
    booking: completedBooking,
    actor: { id: "guest_1" },
    input: { experienceRating: 5, supplierRating: 5, driverRating: 5, comment: "A genuinely good day out in Goa." },
  });
  assert.equal(genuine.status, "PUBLISHED");
  database.close();
});
