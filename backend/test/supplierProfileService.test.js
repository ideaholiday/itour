import test from "node:test";
import assert from "node:assert/strict";
import {
  backfillSupplierSlugs, containsContactDetails, deriveBadge, directoryCities, ensurePublicSlug, findDirectoryCity,
  grantSupplierVerification, isProfileIndexable, isProfileVisible, ownerProfileView, profileCompleteness,
  publicSupplierReviews, publicSupplierView, resolveProfileSlug, revokeSupplierVerification, searchSupplierDirectory,
  setProfileSuspended, sitemapSupplierEntries, slugify, updateSupplierProfile, REQUIRED_VERIFICATION_CHECKS,
} from "../src/services/supplierProfileService.js";
import { addSupplier, addUser, supplierProfileDatabase } from "./fixtures/supplierProfileDatabase.js";

const NOW = new Date("2026-09-13T10:00:00.000Z");

function addReview(db, { id, supplierId = "sup_awadh", rating = 5, source = "VERIFIED", status = "PUBLISHED", bookingId = null, userId = "user_amit", createdAt = "2026-08-01 10:00:00" }) {
  db.prepare(`INSERT INTO reviews (id, booking_id, user_id, product_id, supplier_id, experience_rating, supplier_rating, comment, status, source, created_at)
    VALUES (?, ?, ?, 'prod_1', ?, ?, ?, 'Driver was on time and polite.', ?, ?, ?)`).run(id, bookingId, userId, supplierId, rating, rating, status, source, createdAt);
}

test("slugs are readable, unique, avoid reserved words and survive renames as redirects", () => {
  const db = supplierProfileDatabase();
  assert.equal(slugify("  Śrī Awadh Express Cabs & Tours!! "), "sri-awadh-express-cabs-tours");

  const first = addSupplier(db);
  const second = addSupplier(db, { id: "sup_awadh_2", email: "b@example.com", city: "Kanpur" });
  const third = addSupplier(db, { id: "sup_awadh_3", email: "c@example.com", city: "Kanpur" });
  const reserved = addSupplier(db, { id: "sup_in", email: "d@example.com", company_name: "IN" });
  assert.equal(backfillSupplierSlugs(db), 4);

  const slugOf = (id) => db.prepare("SELECT public_slug FROM suppliers WHERE id = ?").get(id).public_slug;
  assert.equal(slugOf(first.id), "awadh-express-cabs");
  assert.equal(slugOf(second.id), "awadh-express-cabs-kanpur", "a clash falls back to name + city");
  assert.equal(slugOf(third.id), "awadh-express-cabs-2");
  assert.notEqual(slugOf(reserved.id), "in", "the city directory prefix is never a profile");
  assert.equal(backfillSupplierSlugs(db), 0, "backfill is idempotent");

  updateSupplierProfile(db, first.id, { slug: "Awadh Cabs Lucknow" });
  assert.deepEqual(resolveProfileSlug(db, "awadh-express-cabs"), { redirectTo: "awadh-cabs-lucknow" });
  assert.equal(resolveProfileSlug(db, "AWADH-CABS-LUCKNOW").supplier.id, first.id);
  assert.throws(() => updateSupplierProfile(db, second.id, { slug: "awadh-express-cabs" }), /already taken/, "an old slug stays with its owner");
  assert.throws(() => updateSupplierProfile(db, second.id, { slug: "admin" }), /reserved/);

  // Taking an old slug back removes it from the redirect list.
  updateSupplierProfile(db, first.id, { slug: "awadh-express-cabs" });
  assert.equal(resolveProfileSlug(db, "awadh-express-cabs").supplier.id, first.id);
  assert.deepEqual(resolveProfileSlug(db, "awadh-cabs-lucknow"), { redirectTo: "awadh-express-cabs" });
  db.close();
});

test("the public view never carries contact, tax or bank details", () => {
  const db = supplierProfileDatabase();
  const supplier = addSupplier(db, {
    website_url: "https://awadh.example",
    business_type: "Transfers",
    years_in_operation: 12,
  });
  updateSupplierProfile(db, supplier.id, {
    tagline: "Airport and outstation cabs across Awadh",
    languages: ["Hindi", "English"],
    serviceCities: ["Lucknow", "Ayodhya"],
    socialLinks: { instagram: "https://www.instagram.com/awadhcabs" },
  });
  const view = publicSupplierView(db, db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id), { now: NOW });
  const serialized = JSON.stringify(view);

  for (const secret of [supplier.email, supplier.phone, supplier.gstin, supplier.pan_number, "123456789012", "HDFC0000001", "Rakesh", supplier.id]) {
    assert.equal(serialized.includes(secret), false, `public view leaked ${secret}`);
  }
  assert.deepEqual(Object.keys(view).sort(), [
    "about", "badge", "businessType", "city", "cityPath", "coverUrl", "indexable", "languages", "logoUrl", "memberSince", "name",
    "path", "rating", "sameAs", "serviceCities", "slug", "spotlights", "state", "tagline", "yearsInOperation",
  ]);
  assert.equal(view.path, "/suppliers/awadh-express-cabs");
  assert.equal(view.cityPath, "/suppliers/in/lucknow");
  assert.equal(view.memberSince, 2025);
  assert.deepEqual(view.sameAs, ["https://www.instagram.com/awadhcabs"]);
  db.close();
});

test("profile text refuses phone numbers, emails, links and WhatsApp", () => {
  for (const text of ["Call 98765 43210 for bookings", "Mail us at bookings@awadh.in", "See www.awadh.in", "WhatsApp us anytime", "+91-(987)-654-3210"]) {
    assert.equal(containsContactDetails(text), true, text);
  }
  for (const text of ["Serving Lucknow since 2012 with 40 cars", "Family-run, 4.8 rated, 24x7 airport pickups"]) {
    assert.equal(containsContactDetails(text), false, text);
  }

  const db = supplierProfileDatabase();
  const supplier = addSupplier(db);
  assert.throws(() => updateSupplierProfile(db, supplier.id, { about: "Book direct on 9876543210 and save" }), (error) => error.status === 400 && /enquiries/.test(error.message));
  assert.throws(() => updateSupplierProfile(db, supplier.id, { logoUrl: "javascript:alert(1)" }), /uploaded image or an https link/);
  assert.throws(() => updateSupplierProfile(db, supplier.id, { socialLinks: { instagram: "https://evil.example/awadh" } }), /instagram.com/);
  assert.throws(() => updateSupplierProfile(db, supplier.id, { socialLinks: { whatsapp: "https://wa.me/1" } }), /Unknown social link/);
  assert.throws(() => updateSupplierProfile(db, supplier.id, { languages: Array.from({ length: 11 }, (_, i) => `L${i}`) }), /at most 10/);

  const saved = updateSupplierProfile(db, supplier.id, { logoUrl: "/uploads/logo-1.png", coverUrl: "https://cdn.example/cover.jpg", languages: ["Hindi", "Hindi", " "] });
  assert.equal(saved.profile.logoUrl, "/uploads/logo-1.png");
  assert.deepEqual(saved.profile.languages, ["Hindi"], "duplicates and blanks are dropped");
  db.close();
});

test("visibility and indexing follow profile status and KYB", () => {
  assert.equal(isProfileVisible({ profile_status: null, kyb_status: "PENDING" }), true, "every registered supplier is listed by default");
  assert.equal(isProfileIndexable({ profile_status: null, kyb_status: "PENDING" }), false, "but Google only sees it after KYB approval");
  assert.equal(isProfileIndexable({ profile_status: "PUBLISHED", kyb_status: "APPROVED" }), true);
  assert.equal(isProfileVisible({ profile_status: "HIDDEN", kyb_status: "APPROVED" }), false);
  assert.equal(isProfileVisible({ profile_status: "PUBLISHED", kyb_status: "SUSPENDED" }), false);

  const db = supplierProfileDatabase();
  const supplier = addSupplier(db);
  updateSupplierProfile(db, supplier.id, { profileStatus: "HIDDEN" });
  assert.equal(ownerProfileView(db, supplier.id).visible, false);
  setProfileSuspended(db, supplier.id, { suspended: true, reason: "Impersonating another operator" });
  assert.throws(() => updateSupplierProfile(db, supplier.id, { profileStatus: "PUBLISHED" }), (error) => error.status === 409);
  assert.throws(() => setProfileSuspended(db, supplier.id, { suspended: true }), /reason/);
  setProfileSuspended(db, supplier.id, { suspended: false });
  assert.equal(ownerProfileView(db, supplier.id).visible, true);
  db.close();
});

test("the Verified badge needs KYB approval, the required checks, and an unexpired grant", () => {
  const db = supplierProfileDatabase();
  const pending = addSupplier(db, { id: "sup_pending", email: "p@example.com", kyb_status: "PENDING" });
  const supplier = addSupplier(db);
  const current = () => db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id);

  assert.equal(deriveBadge(db, current(), NOW).status, "NOT_VERIFIED");
  assert.throws(() => grantSupplierVerification(db, pending.id, { checks: REQUIRED_VERIFICATION_CHECKS }), (error) => error.status === 409);
  assert.throws(() => grantSupplierVerification(db, supplier.id, { checks: ["BUSINESS_IDENTITY", "BANK_ACCOUNT"] }), /Business address, Call with the owner/);
  assert.throws(() => grantSupplierVerification(db, supplier.id, { checks: [...REQUIRED_VERIFICATION_CHECKS, "PAID"] }), /Unknown/);

  grantSupplierVerification(db, supplier.id, { checks: [...REQUIRED_VERIFICATION_CHECKS, "TOURISM_REGISTRATION"], actorId: "admin@ideaholiday.in", now: NOW });
  const badge = deriveBadge(db, current(), NOW);
  assert.equal(badge.status, "VERIFIED");
  assert.equal(badge.validUntil, "2027-09-13T10:00:00.000Z");
  assert.ok(badge.checks.includes("Tourism or trade registration"));

  assert.equal(deriveBadge(db, current(), new Date("2027-09-14T00:00:00.000Z")).status, "NOT_VERIFIED", "the badge lapses after a year with no job");
  db.prepare("UPDATE suppliers SET kyb_status = 'SUSPENDED' WHERE id = ?").run(supplier.id);
  assert.equal(deriveBadge(db, current(), NOW).status, "NOT_VERIFIED", "a KYB suspension removes it at once");
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED' WHERE id = ?").run(supplier.id);

  // A renewal supersedes the active grant instead of stacking.
  grantSupplierVerification(db, supplier.id, { checks: REQUIRED_VERIFICATION_CHECKS, now: NOW });
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM supplier_verifications WHERE supplier_id = ? AND status = 'ACTIVE'").get(supplier.id).c, 1);

  assert.throws(() => revokeSupplierVerification(db, supplier.id, { reason: "no" }), /reason/);
  revokeSupplierVerification(db, supplier.id, { reason: "Business address proof was forged", actorId: "admin" });
  assert.equal(deriveBadge(db, current(), NOW).status, "NOT_VERIFIED");
  assert.throws(() => revokeSupplierVerification(db, supplier.id, { reason: "Again, nothing active" }), (error) => error.status === 404);
  db.close();
});

test("ratings count booking-verified reviews only; open reviews are shown and marked", () => {
  const db = supplierProfileDatabase();
  const supplier = addSupplier(db);
  addUser(db);
  addUser(db, { id: "user_sneha", name: "Sneha", email: "sneha@example.com" });
  db.prepare("INSERT INTO bookings (id, ref, user_id, supplier_id, traveler_name, status) VALUES ('bk_1', 'IH-1', 'user_amit', 'sup_awadh', 'Amit Kumar Singh', 'completed')").run();
  addReview(db, { id: "rev_1", rating: 5, bookingId: "bk_1", createdAt: "2026-08-03 10:00:00" });
  addReview(db, { id: "rev_2", rating: 3, createdAt: "2026-08-02 10:00:00" });
  addReview(db, { id: "rev_open", rating: 1, source: "SHARE_LINK", userId: "user_sneha", createdAt: "2026-08-04 10:00:00" });
  addReview(db, { id: "rev_hidden", rating: 1, status: "PENDING" });
  db.prepare("INSERT INTO review_photos (id, review_id, photo_url) VALUES ('ph_1', 'rev_1', '/uploads/car.jpg')").run();

  const view = publicSupplierView(db, supplier, { now: NOW });
  assert.deepEqual(view.rating, { count: 2, average: 4 });

  const { reviews, pagination } = publicSupplierReviews(db, supplier.id, { limit: 2 });
  assert.equal(pagination.total, 3, "pending reviews are not public");
  assert.equal(pagination.hasNext, true);
  assert.equal(reviews[0].id, "rev_open");
  assert.equal(reviews[0].countedInRating, false);
  assert.equal(reviews[0].travelerName, "Sneha");
  assert.equal(reviews[1].travelerName, "Amit K.", "surnames are shortened");
  assert.deepEqual(reviews[1].photos, ["/uploads/car.jpg"]);
  assert.equal("productTitle" in reviews[1], false, "a profile review does not name the product");
  db.close();
});

test("the directory lists visible profiles, verified first, with city and text filters", () => {
  const db = supplierProfileDatabase();
  addSupplier(db, { id: "sup_a", email: "a@example.com", company_name: "Anand Tours", city: "Goa", state: "Goa" });
  const verified = addSupplier(db, { id: "sup_b", email: "b@example.com", company_name: "Blue Lagoon Watersports", city: "Goa", state: "Goa" });
  addSupplier(db, { id: "sup_c", email: "c@example.com", company_name: "Coastal Cabs", city: "Mumbai", state: "Maharashtra", kyb_status: "PENDING" });
  addSupplier(db, { id: "sup_d", email: "d@example.com", company_name: "Dune Safaris", city: "Jaisalmer", state: "Rajasthan", profile_status: "HIDDEN" });
  addSupplier(db, { id: "sup_e", email: "e@example.com", company_name: "Evergreen Kerala", city: "Kochi", state: "Kerala", kyb_status: "SUSPENDED" });
  updateSupplierProfile(db, "sup_c", { serviceCities: ["Goa", "Pune"] });
  grantSupplierVerification(db, verified.id, { checks: REQUIRED_VERIFICATION_CHECKS, now: NOW });

  const all = searchSupplierDirectory(db, { now: NOW });
  assert.deepEqual(all.suppliers.map((s) => s.name), ["Blue Lagoon Watersports", "Anand Tours", "Coastal Cabs"]);
  assert.equal(all.suppliers[0].verified, true);

  assert.deepEqual(searchSupplierDirectory(db, { city: "goa", now: NOW }).suppliers.map((s) => s.name), ["Blue Lagoon Watersports", "Anand Tours", "Coastal Cabs"], "service cities count");
  assert.deepEqual(searchSupplierDirectory(db, { q: "LAGOON", now: NOW }).suppliers.map((s) => s.name), ["Blue Lagoon Watersports"]);
  assert.deepEqual(searchSupplierDirectory(db, { verified: true, now: NOW }).suppliers.map((s) => s.name), ["Blue Lagoon Watersports"]);
  assert.equal(searchSupplierDirectory(db, { q: "dune", now: NOW }).pagination.total, 0);

  assert.deepEqual(directoryCities(db).map((c) => [c.city, c.supplierCount]), [["Goa", 2], ["Mumbai", 1]]);
  assert.equal(findDirectoryCity(db, "GOA").path, "/suppliers/in/goa");
  assert.equal(findDirectoryCity(db, "jaisalmer"), null);

  const sitemap = sitemapSupplierEntries(db);
  assert.deepEqual(sitemap.profiles.map((p) => p.path).sort(), ["/suppliers/anand-tours", "/suppliers/blue-lagoon-watersports"], "unapproved KYB stays out of Google");
  assert.deepEqual(sitemap.cities.map((c) => c.slug), ["goa"]);
  db.close();
});

test("completeness lists what is missing and the owner view reports the latest verification", () => {
  const db = supplierProfileDatabase();
  const supplier = addSupplier(db);
  const empty = profileCompleteness(supplier);
  assert.equal(empty.score, 0);
  assert.equal(empty.missing.length, 8);

  updateSupplierProfile(db, supplier.id, {
    tagline: "Airport cabs",
    about: "A".repeat(150),
    logoUrl: "/uploads/logo.png",
    coverUrl: "/uploads/cover.png",
    languages: ["Hindi"],
    serviceCities: ["Lucknow"],
    socialLinks: { website: "https://awadh.example" },
  });
  db.prepare("UPDATE suppliers SET years_in_operation = 5 WHERE id = ?").run(supplier.id);
  grantSupplierVerification(db, supplier.id, { checks: REQUIRED_VERIFICATION_CHECKS, now: NOW });

  const owner = ownerProfileView(db, supplier.id, { now: NOW });
  assert.equal(owner.completeness.score, 100);
  assert.equal(owner.verification.status, "ACTIVE");
  assert.equal(owner.publicView.badge.status, "VERIFIED");
  assert.equal(owner.indexable, true);
  assert.equal(ensurePublicSlug(db, db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplier.id)), "awadh-express-cabs");
  assert.throws(() => ownerProfileView(db, "sup_missing"), (error) => error.status === 404);
  db.close();
});
