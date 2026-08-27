import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createCircuitQuote, getCircuitQuote } from "../src/services/circuitQuoteService.js";

function futureDate(days = 10) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function testDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, supplier_code TEXT, company_name TEXT, kyb_status TEXT,
      commission_rate REAL, commission_override_rate REAL
    );
    CREATE TABLE category_commissions (category_code TEXT, default_commission_rate REAL);
    CREATE TABLE products (
      id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, product_type TEXT, group_type TEXT,
      city TEXT, state TEXT, price_inr REAL, status TEXT, is_published INTEGER,
      cancellation_policy TEXT
    );
    CREATE TABLE product_pricing (
      id TEXT PRIMARY KEY, product_id TEXT, variant_name TEXT, pricing_model TEXT,
      base_price REAL, estimated_fastag_tolls REAL, estimated_state_tax REAL, tax_percentage REAL
    );
    CREATE TABLE blocked_dates (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, scope_type TEXT,
      availability_type TEXT, start_date TEXT, end_date TEXT, start_time TEXT,
      end_time TEXT, capacity_limit INTEGER, reason TEXT, is_active INTEGER, created_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, assigned_supplier_product_id TEXT,
      activity_date TEXT, pickup_time TEXT, vehicle_category TEXT, status TEXT
    );
    CREATE TABLE circuit_quotes (
      id TEXT PRIMARY KEY, itinerary_id TEXT, user_id TEXT, status TEXT, currency TEXT,
      adults_count INTEGER, children_count INTEGER, start_date TEXT, end_date TEXT,
      base_amount REAL, taxes_amount REAL, total_amount REAL, line_items TEXT, issues TEXT,
      expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  database.prepare("INSERT INTO suppliers VALUES (?, ?, ?, 'APPROVED', 18, NULL)")
    .run("supplier_1", "SUP-1", "Verified Journeys");
  database.prepare("INSERT INTO category_commissions VALUES ('DAY_TOUR', 18)").run();
  database.prepare("INSERT INTO category_commissions VALUES ('TRANSFER', 15)").run();
  database.prepare("INSERT INTO products VALUES (?, 'supplier_1', ?, ?, ?, ?, 'Goa', ?, 'PUBLISHED', 1, ?)")
    .run("tour_1", "Shared Heritage Walk", "DAY_TOUR", "SHARED", "Panaji", 1000, "FLEXIBLE_24H");
  database.prepare("INSERT INTO products VALUES (?, 'supplier_1', ?, ?, ?, ?, 'Goa', ?, 'PUBLISHED', 1, ?)")
    .run("transfer_1", "Private Hotel Transfer", "TRANSFER", "PRIVATE", "Goa", 2000, "MODERATE_48H");
  return database;
}

test("creates and persists a canonical multi-item circuit quote", () => {
  const database = testDatabase();
  const itinerary = {
    id: "itin_1",
    userId: "traveler_1",
    title: "Goa circuit",
    startDate: futureDate(),
    daysCount: 3,
    adultsCount: 2,
    childrenCount: 1,
    items: [
      { id: "walk", dayNumber: 1, title: "Walk", productId: "tour_1", timeSlot: "MORNING" },
      { id: "transfer", dayNumber: 2, title: "Transfer", productId: "transfer_1", timeSlot: "AFTERNOON" },
    ],
  };

  const quote = createCircuitQuote(database, itinerary, "traveler_1", { luggage: 1 });
  assert.equal(quote.status, "READY");
  assert.equal(quote.lineItems.length, 2);
  assert.equal(quote.issues.length, 0);
  assert.equal(quote.lineItems[1].activityDate, futureDate(11));
  assert.equal(quote.breakdown.baseAmount, 4500);
  assert.equal(quote.breakdown.taxesAmount, 225);
  assert.equal(quote.breakdown.totalAmount, 4725);
  assert.match(quote.quoteId, /^cq_/);

  const stored = getCircuitQuote(database, quote.quoteId, "traveler_1");
  assert.equal(stored.quoteId, quote.quoteId);
  assert.equal(stored.expired, false);
  assert.throws(() => getCircuitQuote(database, quote.quoteId, "another_user"), /not found/i);
});

test("flags custom and unavailable items without trusting planner estimates", () => {
  const database = testDatabase();
  const date = futureDate();
  database.prepare(`
    INSERT INTO blocked_dates (
      id, supplier_id, product_id, scope_type, availability_type, start_date, end_date,
      capacity_limit, reason, is_active, created_at
    ) VALUES ('block_1', 'supplier_1', 'tour_1', 'PRODUCT', 'FULL_DAY', ?, ?, 0, 'Sold out', 1, datetime('now'))
  `).run(date, date);
  const itinerary = {
    id: "itin_2",
    userId: "traveler_1",
    startDate: date,
    daysCount: 1,
    adultsCount: 2,
    childrenCount: 0,
    items: [
      { id: "sold-out", dayNumber: 1, title: "Sold out", productId: "tour_1", priceInr: 1 },
      { id: "custom", dayNumber: 1, title: "Custom dinner", priceInr: 999999 },
    ],
  };

  const quote = createCircuitQuote(database, itinerary, "traveler_1");
  assert.equal(quote.status, "ACTION_REQUIRED");
  assert.equal(quote.breakdown.totalAmount, 0);
  assert.deepEqual(quote.issues.map((issue) => issue.code), ["ITEM_UNAVAILABLE", "PRODUCT_LINK_REQUIRED"]);
  assert.equal(quote.issues[0].message, "Sold out");
});

test("requires itinerary ownership and a valid future travel date", () => {
  const database = testDatabase();
  const itinerary = {
    id: "itin_3",
    userId: "traveler_1",
    startDate: "2020-01-01",
    daysCount: 1,
    items: [{ dayNumber: 1, title: "Walk", productId: "tour_1" }],
  };

  assert.throws(
    () => createCircuitQuote(database, itinerary, "another_user"),
    (error) => error.status === 404 && error.code === "ITINERARY_NOT_FOUND",
  );
  assert.throws(
    () => createCircuitQuote(database, itinerary, "traveler_1"),
    (error) => error.status === 400 && error.code === "PAST_START_DATE",
  );
});
