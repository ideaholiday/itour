import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { PricingRuleService } from "../src/services/pricingRuleService.js";

describe("PricingRuleService", () => {
  let db;

  before(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        title TEXT,
        price_inr REAL NOT NULL
      );

      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY,
        name TEXT
      );

      CREATE TABLE pricing_rules (
        id TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id),
        supplier_id TEXT REFERENCES suppliers(id),
        rule_type TEXT NOT NULL,
        title TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        day_of_week INTEGER,
        min_group_size INTEGER,
        adjustment_type TEXT NOT NULL DEFAULT 'PERCENT',
        adjustment_value REAL NOT NULL,
        priority INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO products (id, title, price_inr) VALUES
        ('prod_taj_day', 'Taj Mahal Day Tour', 2000.0),
        ('prod_goa_scuba', 'Goa Scuba Diving', 3500.0);

      INSERT INTO suppliers (id, name) VALUES
        ('supp_royal_tours', 'Royal Indian Tours');

      -- Rule 1: Weekend Surge (+15% on Saturday and Sunday)
      INSERT INTO pricing_rules (id, product_id, supplier_id, rule_type, title, day_of_week, adjustment_type, adjustment_value, priority)
      VALUES
        ('rule_sat', NULL, NULL, 'WEEKEND_SURGE', 'Saturday Peak Surge (+15%)', 6, 'PERCENT', 15.0, 1),
        ('rule_sun', NULL, NULL, 'WEEKEND_SURGE', 'Sunday Peak Surge (+15%)', 0, 'PERCENT', 15.0, 1);

      -- Rule 2: Diwali Peak Period (+25% from 2026-10-25 to 2026-11-05)
      INSERT INTO pricing_rules (id, product_id, supplier_id, rule_type, title, start_date, end_date, adjustment_type, adjustment_value, priority)
      VALUES
        ('rule_diwali', NULL, NULL, 'SEASONAL_PEAK', 'Diwali Holiday Surge (+25%)', '2026-10-25', '2026-11-05', 'PERCENT', 25.0, 2);

      -- Rule 3: Group Volume Discount (5+ guests get -10%)
      INSERT INTO pricing_rules (id, product_id, supplier_id, rule_type, title, min_group_size, adjustment_type, adjustment_value, priority)
      VALUES
        ('rule_group', NULL, NULL, 'GROUP_DISCOUNT', 'Group Incentive 5+ Guests (-10%)', 5, 'PERCENT', -10.0, 3);
    `);
  });

  it("applies standard baseline pricing when no dynamic rules match", () => {
    // Wednesday (day 3), standard date, 1 person
    const result = PricingRuleService.applyDynamicPricing(db, "prod_taj_day", 2000, "2026-09-09", 1);
    assert.strictEqual(result.originalBaseInr, 2000);
    assert.strictEqual(result.finalPriceInr, 2000);
    assert.strictEqual(result.totalAdjustmentInr, 0);
    assert.strictEqual(result.appliedRules.length, 0);
  });

  it("applies weekend surge surcharge (+15%) on Saturday and Sunday", () => {
    // 2026-09-12 is Saturday (day 6)
    const result = PricingRuleService.applyDynamicPricing(db, "prod_taj_day", 2000, "2026-09-12", 1);
    assert.strictEqual(result.originalBaseInr, 2000);
    assert.strictEqual(result.finalPriceInr, 2300); // 2000 + 15% (300) = 2300
    assert.strictEqual(result.totalAdjustmentInr, 300);
    assert.strictEqual(result.appliedRules.length, 1);
    assert.strictEqual(result.appliedRules[0].ruleType, "WEEKEND_SURGE");
  });

  it("applies seasonal date range surge (+25%) during festival peak dates", () => {
    // 2026-10-28 is Wednesday inside Diwali peak window
    const result = PricingRuleService.applyDynamicPricing(db, "prod_taj_day", 2000, "2026-10-28", 1);
    assert.strictEqual(result.originalBaseInr, 2000);
    assert.strictEqual(result.finalPriceInr, 2500); // 2000 + 25% (500) = 2500
    assert.strictEqual(result.totalAdjustmentInr, 500);
    assert.strictEqual(result.appliedRules[0].ruleType, "SEASONAL_PEAK");
  });

  it("stacks weekend surge and group discount for large travel parties", () => {
    // 2026-09-13 is Sunday (day 0) with 6 travelers
    // Base 2000 + 15% (300) - 10% (200) = 2100
    const result = PricingRuleService.applyDynamicPricing(db, "prod_taj_day", 2000, "2026-09-13", 6);
    assert.strictEqual(result.originalBaseInr, 2000);
    assert.strictEqual(result.finalPriceInr, 2100);
    assert.strictEqual(result.totalAdjustmentInr, 100);
    assert.strictEqual(result.appliedRules.length, 2);
  });

  it("clamps excessive markups to safety ceiling (200% max)", () => {
    // Add an extreme 250% markup rule
    db.prepare(`
      INSERT INTO pricing_rules (id, product_id, rule_type, title, adjustment_type, adjustment_value, priority)
      VALUES ('rule_extreme', 'prod_goa_scuba', 'EXTREME', 'Extreme Surge (+250%)', 'PERCENT', 250.0, 10)
    `).run();

    const result = PricingRuleService.applyDynamicPricing(db, "prod_goa_scuba", 3500, "2026-09-09", 1);
    assert.strictEqual(result.originalBaseInr, 3500);
    assert.strictEqual(result.finalPriceInr, 7000); // Clamped at 2.0x base
  });

  it("generates monthly calendar pricing breakdown highlighting PEAK and STANDARD days", () => {
    const calendar = PricingRuleService.getMonthPriceCalendar(db, "prod_taj_day", "2026-09");
    assert.strictEqual(calendar.month, "2026-09");
    assert.strictEqual(calendar.days.length, 30);

    const weekendDay = calendar.days.find((d) => d.dayOfWeek === 6);
    assert.ok(weekendDay);
    assert.strictEqual(weekendDay.tier, "PEAK");
    assert.strictEqual(weekendDay.priceInr, 2300);

    const midWeekDay = calendar.days.find((d) => d.dayOfWeek === 3 && d.date === "2026-09-09");
    assert.ok(midWeekDay);
    assert.strictEqual(midWeekDay.tier, "STANDARD");
    assert.strictEqual(midWeekDay.priceInr, 2000);
  });

  it("supports supplier dynamic pricing rule creation, retrieval, and deletion", () => {
    const created = PricingRuleService.createPricingRule(
      db,
      {
        title: "Monsoon Special Saver (-20%)",
        ruleType: "SEASONAL_DEAL",
        startDate: "2026-07-01",
        endDate: "2026-08-31",
        adjustmentType: "PERCENT",
        adjustmentValue: -20.0,
      },
      "supp_royal_tours"
    );

    assert.ok(created.id);
    assert.strictEqual(created.title, "Monsoon Special Saver (-20%)");
    assert.strictEqual(created.supplierId, "supp_royal_tours");

    const rules = PricingRuleService.getSupplierPricingRules(db, "supp_royal_tours");
    assert.ok(rules.some((r) => r.id === created.id));

    const deleted = PricingRuleService.deletePricingRule(db, created.id, "supp_royal_tours");
    assert.strictEqual(deleted, true);

    const remaining = PricingRuleService.getSupplierPricingRules(db, "supp_royal_tours");
    assert.ok(!remaining.some((r) => r.id === created.id));
  });
});
