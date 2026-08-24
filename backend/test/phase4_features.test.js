import test from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import { cacheService } from "../src/services/cacheService.js";
import { UploadService } from "../src/services/uploadService.js";
import { SearchService } from "../src/services/searchService.js";
import { ExportService } from "../src/services/exportService.js";
import { sseService } from "../src/services/sseService.js";
import { paginate } from "../src/middleware/pagination.js";
import { swaggerSpec } from "../src/config/swagger.js";

test("Phase 4: Cache service supports TTL, get/set, invalidation, and metrics", () => {
  cacheService.clear();
  cacheService.set("test:key:1", { name: "Taj Tour" }, 60);
  assert.deepEqual(cacheService.get("test:key:1"), { name: "Taj Tour" });

  cacheService.set("test:key:2", { name: "Jaipur Fort" }, 60);
  cacheService.set("other:key:1", { name: "Goa Beach" }, 60);

  const invalidatedCount = cacheService.invalidatePattern("test:key:*");
  assert.equal(invalidatedCount, 2);
  assert.equal(cacheService.get("test:key:1"), null);
  assert.deepEqual(cacheService.get("other:key:1"), { name: "Goa Beach" });

  const stats = cacheService.getStats();
  assert.ok(stats.sets >= 3);
  assert.ok(stats.size >= 1);
});

test("Phase 4: Universal pagination middleware formats standardized response", (t, done) => {
  const middleware = paginate(10, 50);
  const req = { query: { page: "2", limit: "15" } };
  const res = {};

  middleware(req, res, () => {
    assert.equal(req.pagination.page, 2);
    assert.equal(req.pagination.limit, 15);
    assert.equal(req.pagination.offset, 15);

    const formatted = req.pagination.formatResponse(["item1", "item2"], 45);
    assert.deepEqual(formatted.pagination, {
      page: 2,
      limit: 15,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    done();
  });
});

test("Phase 4: File upload service saves buffers and tracks metadata in uploads table", () => {
  const buffer = Buffer.from("dummy-image-data-for-testing");
  const upload = UploadService.saveFileBuffer({
    buffer,
    originalName: "test-hero.jpg",
    mimeType: "image/jpeg",
    userId: "user_traveler",
    entityType: "PRODUCT",
    entityId: "prod_test_123",
  });

  assert.ok(upload.id.startsWith("upload_"));
  assert.equal(upload.original_name, "test-hero.jpg");
  assert.equal(upload.mime_type, "image/jpeg");
  assert.equal(upload.size_bytes, buffer.length);
  assert.ok(upload.url.startsWith("/uploads/"));

  const retrieved = UploadService.getUploadById(upload.id);
  assert.equal(retrieved.id, upload.id);
  assert.equal(retrieved.entity_type, "PRODUCT");
});

test("Phase 4: Search service returns suggestions, filtered products, and records search history", () => {
  const defaultSuggestions = SearchService.getSuggestions("");
  assert.ok(Array.isArray(defaultSuggestions.destinations));
  assert.ok(defaultSuggestions.destinations.length > 0);

  const querySuggestions = SearchService.getSuggestions("Jaipur");
  assert.ok(Array.isArray(querySuggestions.destinations));

  const searchResults = SearchService.searchProducts({
    city: "Jaipur",
    limit: 5,
  });
  assert.ok(Array.isArray(searchResults.products));
  assert.ok(searchResults.pagination.total >= 0);

  const historyId = SearchService.recordHistory("user_traveler", "Jaipur Palace", "Tours", "Jaipur");
  assert.ok(historyId);

  const recent = SearchService.getRecentSearches("user_traveler");
  assert.ok(recent.some(r => r.search_query === "Jaipur Palace"));
});

test("Phase 4: Data export engine exports datasets to CSV and JSON", () => {
  const bookingsResult = ExportService.createExportJob({
    userId: "user_admin",
    exportType: "bookings",
    format: "csv",
  });
  assert.ok(bookingsResult.jobId.startsWith("exp_"));
  assert.equal(bookingsResult.status, "COMPLETED");
  assert.equal(typeof bookingsResult.content, "string");

  const productsResult = ExportService.createExportJob({
    userId: "user_admin",
    exportType: "products",
    format: "json",
  });
  assert.equal(productsResult.format, "json");
  const parsed = JSON.parse(productsResult.content);
  assert.ok(Array.isArray(parsed));
});

test("Phase 4: SSE service manages channel subscriptions and client broadcasts", () => {
  const mockClients = [];
  const mockRes = {
    written: [],
    write(data) {
      this.written.push(data);
    },
    on(event, handler) {
      this.closeHandler = handler;
    },
  };

  sseService.subscribe("supplier:SUP_TEST", mockRes, "user_sup");
  assert.ok(mockRes.written.length > 0);
  assert.ok(mockRes.written[0].includes("CONNECTED"));

  const recipientCount = sseService.publish("supplier:SUP_TEST", "NEW_BOOKING", { bookingId: "BK-999" });
  assert.equal(recipientCount, 1);
  assert.ok(mockRes.written.some(w => w.includes("BK-999")));
});

test("Phase 4: OpenAPI Swagger specification declares essential paths and schemas", () => {
  assert.equal(swaggerSpec.openapi, "3.0.3");
  assert.ok(swaggerSpec.paths["/health"]);
  assert.ok(swaggerSpec.paths["/search"]);
  assert.ok(swaggerSpec.paths["/uploads"]);
  assert.ok(swaggerSpec.paths["/exports"]);
});

test("Phase 4: Database stores and manages Wishlists, User Profiles, and Booking Modifications", () => {
  // 1. User profile
  const existingUser = db.prepare("SELECT id FROM users LIMIT 1").get();
  const testUserId = existingUser ? existingUser.id : "user_traveler";
  const profId = `prof_${Date.now()}`;
  db.prepare(`
    INSERT INTO user_profiles (id, user_id, display_name, phone, travel_preferences, created_at, updated_at)
    VALUES (?, ?, 'Test Explorer', '+919876543210', '{"style":"luxury"}', datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET display_name = 'Test Explorer'
  `).run(profId, testUserId);

  const profile = db.prepare("SELECT * FROM user_profiles WHERE user_id = ?").get(testUserId);
  assert.equal(profile.display_name, "Test Explorer");

  // 2. Wishlists
  const sampleProduct = db.prepare("SELECT id FROM products LIMIT 1").get();
  if (sampleProduct) {
    db.prepare("DELETE FROM wishlists WHERE user_id = ?").run(testUserId);
    const wishId = `wsh_${Date.now()}`;
    db.prepare("INSERT INTO wishlists (id, user_id, product_id, price_at_save, added_at) VALUES (?, ?, ?, 2500, datetime('now'))")
      .run(wishId, testUserId, sampleProduct.id);

    const wishlistCount = db.prepare("SELECT COUNT(*) as count FROM wishlists WHERE user_id = ?").get(testUserId).count;
    assert.equal(wishlistCount, 1);
  }

  // 3. Booking modifications
  const sampleBooking = db.prepare("SELECT id FROM bookings LIMIT 1").get();
  if (sampleBooking) {
    const modId = `mod_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    db.prepare(`
      INSERT INTO booking_modifications (id, booking_id, requested_by, modification_type, original_value, requested_value, status, created_at)
      VALUES (?, ?, ?, 'DATE_CHANGE', '2026-09-01', '2026-09-05', 'PENDING', datetime('now'))
    `).run(modId, sampleBooking.id, testUserId);

    const mod = db.prepare("SELECT * FROM booking_modifications WHERE id = ?").get(modId);
    assert.equal(mod.modification_type, "DATE_CHANGE");
    assert.equal(mod.status, "PENDING");
  }
});

test("Phase 4: Supplier Media, FAQs, Add-ons, and Dynamic Pricing Rules database storage", () => {
  const sampleProduct = db.prepare("SELECT id, supplier_id FROM products LIMIT 1").get();
  if (sampleProduct) {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mediaId = `media_${nonce}`;
    const faqId = `faq_${nonce}`;
    const addonId = `addon_${nonce}`;
    const pruleId = `prule_${nonce}`;

    // Media
    db.prepare("INSERT INTO product_media (id, product_id, url, alt_text, sort_order) VALUES (?, ?, 'https://example.com/img.jpg', 'Tour Photo', 1)")
      .run(mediaId, sampleProduct.id);
    const media = db.prepare("SELECT * FROM product_media WHERE id = ?").get(mediaId);
    assert.equal(media.alt_text, "Tour Photo");

    // FAQs
    db.prepare("INSERT INTO product_faqs (id, product_id, question, answer, sort_order) VALUES (?, ?, 'What is included?', 'Transport and guide', 1)")
      .run(faqId, sampleProduct.id);
    const faq = db.prepare("SELECT * FROM product_faqs WHERE id = ?").get(faqId);
    assert.equal(faq.question, "What is included?");

    // Addons
    db.prepare("INSERT INTO product_addons (id, product_id, addon_name, price_inr, pricing_type) VALUES (?, ?, 'Photography Package', 1500, 'FLAT')")
      .run(addonId, sampleProduct.id);
    const addon = db.prepare("SELECT * FROM product_addons WHERE id = ?").get(addonId);
    assert.equal(addon.addon_name, "Photography Package");
    assert.equal(addon.price_inr, 1500);

    // Pricing rules
    db.prepare("INSERT INTO pricing_rules (id, product_id, rule_type, title, adjustment_type, adjustment_value) VALUES (?, ?, 'SEASONAL', 'Winter Surge', 'PERCENT', 15)")
      .run(pruleId, sampleProduct.id);
    const prule = db.prepare("SELECT * FROM pricing_rules WHERE id = ?").get(pruleId);
    assert.equal(prule.title, "Winter Surge");
    assert.equal(prule.adjustment_value, 15);
  }
});
