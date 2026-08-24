import { describe, it, before } from "node:test";
import assert from "node:assert";
import Database from "better-sqlite3";
import { AddonService } from "../src/services/addonService.js";

describe("AddonService", () => {
  let db;

  before(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE product_addons (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        category TEXT DEFAULT 'GENERAL',
        title TEXT NOT NULL,
        description TEXT,
        price_inr REAL NOT NULL,
        per_person INTEGER DEFAULT 0,
        icon TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE bookings (
        id TEXT PRIMARY KEY,
        ref TEXT,
        selected_addons TEXT DEFAULT '[]'
      );

      INSERT INTO product_addons (id, product_id, category, title, description, price_inr, per_person, icon, is_active)
      VALUES
        ('addon_monument_vip', NULL, 'TICKETS', 'Monument Fast-Track VIP Entry Ticket', 'Skip standard ticket queues', 500.0, 1, '🎫', 1),
        ('addon_pro_dslr_photo', NULL, 'PHOTOGRAPHY', 'Pro DSLR Photographer Package', '25 edited high-resolution photos', 1800.0, 0, '📸', 1),
        ('addon_foreign_guide', NULL, 'GUIDE', 'Certified Foreign Language Guide', 'French / German guide', 2500.0, 0, '🎧', 1),
        ('addon_inactive', NULL, 'SPECIAL', 'Archived Seasonal Extra', 'Not available', 999.0, 0, '❌', 0);

      INSERT INTO bookings (id, ref, selected_addons) VALUES ('bk_test_1', 'BK-AGRA-001', '[]');
    `);
  });

  it("retrieves active add-ons and filters out inactive items", () => {
    const list = AddonService.getProductAddons(db, null);
    assert.strictEqual(list.length, 3);
    const ids = list.map((a) => a.id);
    assert.ok(ids.includes("addon_monument_vip"));
    assert.ok(ids.includes("addon_pro_dslr_photo"));
    assert.ok(!ids.includes("addon_inactive"));
  });

  it("calculates add-on subtotal correctly with both flat and per-person multipliers", () => {
    const selectedIds = ["addon_monument_vip", "addon_pro_dslr_photo"];
    const travelersCount = 4;

    const calc = AddonService.validateAndCalculateAddons(db, selectedIds, travelersCount);

    assert.strictEqual(calc.addons.length, 2);
    // Monument VIP: 500 * 4 = 2000
    const vip = calc.breakdown.find((b) => b.id === "addon_monument_vip");
    assert.strictEqual(vip.quantity, 4);
    assert.strictEqual(vip.subtotalInr, 2000);

    // Photographer: 1800 flat (quantity = 1)
    const photo = calc.breakdown.find((b) => b.id === "addon_pro_dslr_photo");
    assert.strictEqual(photo.quantity, 1);
    assert.strictEqual(photo.subtotalInr, 1800);

    // Total = 2000 + 1800 = 3800
    assert.strictEqual(calc.totalAddonsInr, 3800);
  });

  it("returns zero and empty breakdown when no add-on IDs are provided", () => {
    const calc = AddonService.validateAndCalculateAddons(db, [], 2);
    assert.strictEqual(calc.totalAddonsInr, 0);
    assert.deepStrictEqual(calc.addons, []);
  });

  it("ignores inactive add-on IDs during calculation", () => {
    const calc = AddonService.validateAndCalculateAddons(db, ["addon_inactive", "addon_foreign_guide"], 2);
    assert.strictEqual(calc.addons.length, 1);
    assert.strictEqual(calc.totalAddonsInr, 2500);
  });

  it("creates a custom add-on", () => {
    const created = AddonService.createProductAddon(db, {
      title: "Helicopter Joyride Experience",
      description: "15-minute aerial sightseeing",
      priceInr: 4500,
      perPerson: true,
      category: "LUXURY",
      icon: "🚁",
    });

    assert.ok(created.id.startsWith("addon_"));
    assert.strictEqual(created.title, "Helicopter Joyride Experience");
    assert.strictEqual(created.priceInr, 4500);
    assert.strictEqual(created.perPerson, true);
  });

  it("attaches purchased add-on item list to booking", () => {
    const purchasedAddons = [
      { id: "addon_monument_vip", title: "Monument Fast-Track", subtotalInr: 1000 },
      { id: "addon_pro_dslr_photo", title: "DSLR Photographer", subtotalInr: 1800 },
    ];

    const result = AddonService.attachAddonsToBooking(db, "bk_test_1", purchasedAddons);
    assert.strictEqual(result.success, true);

    const bookingRow = db.prepare("SELECT selected_addons FROM bookings WHERE id = ?").get("bk_test_1");
    const parsed = JSON.parse(bookingRow.selected_addons);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].id, "addon_monument_vip");
  });
});
