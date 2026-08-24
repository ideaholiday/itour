import { describe, it, before } from "node:test";
import assert from "node:assert";
import Database from "better-sqlite3";
import { ItineraryService } from "../src/services/itineraryService.js";

describe("ItineraryService", () => {
  let db;

  before(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        role TEXT
      );

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        title TEXT,
        slug TEXT,
        destination TEXT,
        price_inr REAL,
        hero_image TEXT,
        duration_hours REAL,
        rating REAL,
        category TEXT,
        product_type TEXT
      );

      CREATE TABLE traveler_itineraries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        destination TEXT,
        start_date TEXT,
        days_count INTEGER DEFAULT 3,
        items TEXT DEFAULT '[]',
        is_public INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO users (id, name, email, role) VALUES ('usr_1', 'Rohan Sharma', 'rohan@example.com', 'TRAVELER');
      INSERT INTO users (id, name, email, role) VALUES ('usr_2', 'Priya Patel', 'priya@example.com', 'TRAVELER');

      INSERT INTO products (id, title, slug, destination, price_inr, hero_image, duration_hours, rating, category, product_type)
      VALUES
        ('prod_taj', 'Sunrise Taj Mahal Tour', 'sunrise-taj-mahal', 'Agra', 2499.0, 'https://example.com/taj.jpg', 6.0, 4.9, 'Heritage', 'ACTIVITY'),
        ('prod_fort', 'Agra Fort Guided Walk', 'agra-fort-walk', 'Agra', 1299.0, 'https://example.com/fort.jpg', 3.0, 4.8, 'Heritage', 'ACTIVITY'),
        ('prod_fateh', 'Fatehpur Sikri Excursion', 'fatehpur-sikri', 'Agra', 1899.0, 'https://example.com/fateh.jpg', 4.5, 4.7, 'Heritage', 'ACTIVITY');
    `);
  });

  it("creates a new multi-day trip itinerary with items and computes total budget and duration", () => {
    const payload = {
      title: "Agra Heritage 2-Day Getaway",
      destination: "Agra",
      startDate: "2026-10-15",
      daysCount: 2,
      isPublic: true,
      items: [
        { dayNumber: 1, timeSlot: "MORNING", productId: "prod_taj", notes: "Catch early sunrise view" },
        { dayNumber: 1, timeSlot: "AFTERNOON", productId: "prod_fort", notes: "Lunch nearby followed by fort exploration" },
        { dayNumber: 2, timeSlot: "MORNING", productId: "prod_fateh", notes: "Half day excursion" },
      ],
    };

    const created = ItineraryService.createItinerary(db, "usr_1", payload);

    assert.ok(created.id.startsWith("itin_"));
    assert.strictEqual(created.title, "Agra Heritage 2-Day Getaway");
    assert.strictEqual(created.destination, "Agra");
    assert.strictEqual(created.daysCount, 2);
    assert.strictEqual(created.isPublic, true);
    assert.strictEqual(created.activityCount, 3);
    // Total price = 2499 + 1299 + 1899 = 5697
    assert.strictEqual(created.totalEstimatedInr, 5697);
    // Total duration = 6.0 + 3.0 + 4.5 = 13.5
    assert.strictEqual(created.totalDurationHours, 13.5);
    assert.strictEqual(created.items[0].product.title, "Sunrise Taj Mahal Tour");
  });

  it("updates an existing itinerary", () => {
    const created = ItineraryService.createItinerary(db, "usr_1", {
      title: "Initial Plan",
      destination: "Agra",
      daysCount: 1,
      items: [{ dayNumber: 1, timeSlot: "MORNING", productId: "prod_taj" }],
    });

    const updated = ItineraryService.updateItinerary(db, "usr_1", created.id, {
      title: "Updated Agra Trip Plan",
      daysCount: 3,
      items: [
        { dayNumber: 1, timeSlot: "MORNING", productId: "prod_taj" },
        { dayNumber: 2, timeSlot: "MORNING", productId: "prod_fort" },
      ],
    });

    assert.strictEqual(updated.title, "Updated Agra Trip Plan");
    assert.strictEqual(updated.daysCount, 3);
    assert.strictEqual(updated.totalEstimatedInr, 2499 + 1299);
  });

  it("prevents unauthorized users from updating another traveler's itinerary", () => {
    const created = ItineraryService.createItinerary(db, "usr_1", {
      title: "Private Plan",
      isPublic: false,
    });

    assert.throws(() => {
      ItineraryService.updateItinerary(db, "usr_2", created.id, { title: "Hacked Title" });
    }, /FORBIDDEN/);
  });

  it("fetches user itineraries list", () => {
    const list = ItineraryService.getUserItineraries(db, "usr_1");
    assert.ok(list.length >= 2);
    assert.strictEqual(list[0].creatorName, "Rohan Sharma");
  });

  it("enforces privacy on private itineraries when fetched by non-owners", () => {
    const priv = ItineraryService.createItinerary(db, "usr_1", {
      title: "Secret Family Vacation",
      isPublic: false,
    });

    // Owner can fetch
    const ownerView = ItineraryService.getItineraryById(db, priv.id, "usr_1");
    assert.strictEqual(ownerView.title, "Secret Family Vacation");

    // Other user cannot fetch private itinerary
    assert.throws(() => {
      ItineraryService.getItineraryById(db, priv.id, "usr_2");
    }, /FORBIDDEN/);
  });

  it("deletes an itinerary", () => {
    const created = ItineraryService.createItinerary(db, "usr_1", { title: "To Delete" });
    const res = ItineraryService.deleteItinerary(db, "usr_1", created.id);
    assert.strictEqual(res.deleted, true);

    const fetched = ItineraryService.getItineraryById(db, created.id);
    assert.strictEqual(fetched, null);
  });
});
