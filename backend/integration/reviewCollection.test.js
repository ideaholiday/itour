import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * The review collection journey over HTTP, both entry points, against a real
 * server and a real database: a supplier shares a link, a traveler who took
 * the trip claims it, and the review that lands is verified and counted.
 */

const SUPPLIER_LOGIN = { email: "multisolution33@gmail.com", password: "Idea@2026" };

/** A completed booking for the demo supplier, written straight to the database. */
function completedBooking(db, { ref, email, phone, productId, supplierId }) {
  const id = `bk_${ref.toLowerCase()}`;
  const userId = `user_${ref.toLowerCase()}`;
  // The traveler account first: bookings.user_id is a foreign key.
  db.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, 'Review Traveler', ?, 'external_test', ?, 'TRAVELER')")
    .run(userId, email, phone);
  db.prepare(`
    INSERT INTO bookings (id, ref, user_id, product_id, supplier_id, product_type, activity_date,
      pickup_location, drop_location, adults, children, traveler_name, traveler_phone, traveler_email,
      amount_inr, payment_method, payment_status, status)
    VALUES (?, ?, ?, ?, ?, 'DAY_TOUR', '2026-08-20', 'Hotel pickup', 'Hotel drop', 2, 0, 'Review Traveler', ?, ?, 2500, 'DEMO', 'PAID', 'completed')
  `).run(id, ref, userId, productId, supplierId, phone, email);
  return id;
}

test("a supplier's share link collects a verified review, and only from a real booking", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const supplier = db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_LOGIN.email);
  const product = db.prepare("SELECT id FROM products WHERE supplier_id = ? AND status = 'PUBLISHED' LIMIT 1").get(supplier.id);
  assert.ok(product, "the demo marketplace should publish at least one listing");

  completedBooking(db, { ref: "IH-SHARE01", email: "share.traveler@example.com", phone: "+919876500777", productId: product.id, supplierId: supplier.id });

  // The supplier creates a link from their dashboard.
  const login = await requestJson(api.baseUrl, "/api/auth/login", { body: SUPPLIER_LOGIN });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const supplierToken = login.data.token;

  const created = await requestJson(api.baseUrl, "/api/reviews/share-links", {
    token: supplierToken, body: { label: "Vehicle window QR" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const slug = created.data.link.slug;

  // A traveler opens it: it names the operator and nothing else.
  const publicView = await requestJson(api.baseUrl, `/api/reviews/share/${slug}`);
  assert.equal(publicView.response.status, 200);
  assert.match(publicView.data.link.supplierName, /MultiSolution/);
  assert.equal(publicView.data.link.productTitle, null);

  // A wrong phone, and an invented reference, answer identically.
  const wrongPhone = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/claim`, { body: { bookingRef: "IH-SHARE01", phoneLast4: "0000" } });
  const unknownRef = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/claim`, { body: { bookingRef: "IH-NOSUCH", phoneLast4: "0777" } });
  assert.equal(wrongPhone.response.status, 404);
  assert.equal(unknownRef.response.status, 404);
  assert.equal(wrongPhone.data.error, unknownRef.data.error, "a failed claim must not say which part was wrong");

  // The real traveler claims it and reviews, without signing in anywhere.
  const claim = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/claim`, { body: { bookingRef: "IH-SHARE01", phoneLast4: "0777" } });
  assert.equal(claim.response.status, 200, JSON.stringify(claim.data));
  assert.equal(claim.data.booking.bookingRef, "IH-SHARE01");

  const form = await requestJson(api.baseUrl, `/api/reviews/invite/${claim.data.token}`);
  assert.equal(form.response.status, 200);
  assert.equal(form.data.booking.bookingRef, "IH-SHARE01");

  const submitted = await requestJson(api.baseUrl, `/api/reviews/invite/${claim.data.token}`, {
    body: { experienceRating: 5, supplierRating: 4, comment: "Driver arrived early and the car was spotless." },
  });
  assert.equal(submitted.response.status, 201, JSON.stringify(submitted.data));
  assert.equal(submitted.data.review.status, "PUBLISHED");

  // Verified, attributed to the link, and counted towards the rating.
  const stored = db.prepare("SELECT source, verification_method, invite_id FROM reviews WHERE booking_id = 'bk_ih-share01'").get();
  assert.equal(stored.source, "VERIFIED");
  assert.equal(stored.verification_method, "BOOKING_REF");
  assert.ok(stored.invite_id);
  const score = db.prepare("SELECT review_count, average_rating, smoothed_rating FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(product.id);
  assert.equal(score.review_count, 1);
  assert.equal(score.average_rating, 5);
  assert.ok(score.smoothed_rating < 5, "one review must not move a listing all the way to 5.0");

  // The token is spent, and the booking cannot be reviewed twice.
  const replay = await requestJson(api.baseUrl, `/api/reviews/invite/${claim.data.token}`, {
    body: { experienceRating: 1, supplierRating: 1, comment: "Trying to submit with the same link again." },
  });
  assert.equal(replay.response.status, 409);

  const reclaim = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/claim`, { body: { bookingRef: "IH-SHARE01", phoneLast4: "0777" } });
  assert.equal(reclaim.response.status, 409, JSON.stringify(reclaim.data));

  // The supplier sees the funnel, and nobody else's links.
  const links = await requestJson(api.baseUrl, "/api/reviews/share-links", { token: supplierToken });
  assert.equal(links.data.links.length, 1);
  assert.equal(links.data.links[0].reviews_submitted, 1);
  assert.equal(links.data.stats.submitted, 1);

  const anonymous = await requestJson(api.baseUrl, "/api/reviews/share-links");
  assert.equal(anonymous.response.status, 401);
});

test("a deactivated link stops collecting, and claims are rate limited", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const supplier = db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_LOGIN.email);
  const product = db.prepare("SELECT id FROM products WHERE supplier_id = ? AND status = 'PUBLISHED' LIMIT 1").get(supplier.id);
  const login = await requestJson(api.baseUrl, "/api/auth/login", { body: SUPPLIER_LOGIN });
  const supplierToken = login.data.token;

  const created = await requestJson(api.baseUrl, "/api/reviews/share-links", { token: supplierToken, body: { productId: product.id } });
  const { id, slug } = created.data.link;

  const off = await requestJson(api.baseUrl, `/api/reviews/share-links/${id}`, { token: supplierToken, method: "PATCH", body: { isActive: false } });
  assert.equal(off.response.status, 200);
  assert.equal(off.data.link.is_active, false);

  const closed = await requestJson(api.baseUrl, `/api/reviews/share/${slug}`);
  assert.equal(closed.response.status, 410);

  const back = await requestJson(api.baseUrl, `/api/reviews/share-links/${id}`, { token: supplierToken, method: "PATCH", body: { isActive: true } });
  assert.equal(back.data.link.is_active, true);
  assert.equal((await requestJson(api.baseUrl, `/api/reviews/share/${slug}`)).response.status, 200);

  // Guessing booking references is throttled rather than answered forever.
  let sawRateLimit = false;
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const guess = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/claim`, { body: { bookingRef: `IH-GUESS${attempt}`, phoneLast4: "1234" } });
    if (guess.response.status === 429) { sawRateLimit = true; break; }
  }
  assert.ok(sawRateLimit, "repeated claim attempts must hit the rate limiter");
});

test("a signed-in traveler can review from a share link without a booking, shown but not counted", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const supplier = db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_LOGIN.email);
  const product = db.prepare("SELECT id FROM products WHERE supplier_id = ? AND status = 'PUBLISHED' LIMIT 1").get(supplier.id);
  const supplierToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: SUPPLIER_LOGIN })).data.token;
  const slug = (await requestJson(api.baseUrl, "/api/reviews/share-links", { token: supplierToken, body: { label: "WhatsApp" } })).data.link.slug;

  // A supplier-wide link lists the operator's trips to choose from.
  const publicView = await requestJson(api.baseUrl, `/api/reviews/share/${slug}`);
  assert.ok(publicView.data.link.products.some((item) => item.id === product.id));

  const body = { productId: product.id, experienceRating: 4, supplierRating: 5, comment: "Lovely day out, the guide knew every story." };

  const anonymous = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/review`, { body });
  assert.equal(anonymous.response.status, 401);

  const ownListing = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/review`, { token: supplierToken, body });
  assert.equal(ownListing.response.status, 403, "the operator cannot review through their own link");

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Link Visitor", email: "link.visitor@example.com", password: "Visitor@2026", phone: "+919876500888" },
  });
  assert.ok([200, 201].includes(signup.response.status), JSON.stringify(signup.data));
  const travelerToken = signup.data.token;

  const before = db.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(product.id) || null;

  const created = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/review`, { token: travelerToken, body });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.review.source, "SHARE_LINK");
  assert.equal(created.data.review.booking_id, null);
  assert.equal(created.data.review.traveler_name, "Link Visitor");

  const again = await requestJson(api.baseUrl, `/api/reviews/share/${slug}/review`, { token: travelerToken, body });
  assert.equal(again.response.status, 409, "one open review per account per listing");

  // Displayed on the listing, labelled by source, and left out of the rating.
  const listing = await requestJson(api.baseUrl, `/api/reviews/product/${product.id}?limit=50`);
  const shown = listing.data.reviews.find((item) => item.id === created.data.review.id);
  assert.ok(shown, "the review appears on the listing");
  assert.equal(shown.source, "SHARE_LINK");
  const after = db.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id = ?").get(product.id) || null;
  assert.deepEqual(after, before, "an unverified review must not move the rating");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE product_id = ? AND source IN ('VERIFIED','SEED') AND status = 'PUBLISHED'").get(product.id).n, listing.data.totalReviews);
});
