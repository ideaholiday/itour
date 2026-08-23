import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  getDailyOverview,
  getBookingTrends,
  getCohortRetention,
  getSupplierPerformance,
  getRevenueBreakdown,
  getConversionFunnel,
  getAnomalyAlerts
} from "../src/services/analyticsService.js";
import { logAnalyticsEvent } from "../src/services/eventLogService.js";

function setupTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      city TEXT,
      kyb_status TEXT
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      destination_name TEXT,
      product_type TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      product_id TEXT,
      supplier_id TEXT,
      product_type TEXT,
      amount_inr REAL,
      commission_amount REAL,
      supplier_payout_amount REAL,
      payment_method TEXT,
      payment_status TEXT,
      status TEXT,
      pickup_location TEXT,
      supplier_response_status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      amount REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE quality_scores (
      entity_type TEXT,
      entity_id TEXT,
      score_100 REAL,
      average_rating REAL,
      review_count INTEGER
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_role TEXT,
      resource_type TEXT,
      resource_id TEXT,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      outcome TEXT DEFAULT 'SUCCEEDED',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed sample suppliers
  db.prepare("INSERT INTO suppliers VALUES ('sup-1', 'Goa Fleet Co', 'Goa', 'APPROVED')").run();
  db.prepare("INSERT INTO suppliers VALUES ('sup-2', 'Delhi Express', 'Delhi', 'APPROVED')").run();

  // Seed sample products
  db.prepare("INSERT INTO products VALUES ('prod-1', 'Goa', 'TRANSFER')").run();
  db.prepare("INSERT INTO products VALUES ('prod-2', 'Delhi', 'TOUR')").run();

  // Seed sample bookings
  db.prepare(`
    INSERT INTO bookings (id, user_id, product_id, supplier_id, product_type, amount_inr, commission_amount, supplier_payout_amount, payment_method, payment_status, status, supplier_response_status, created_at)
    VALUES
      ('b-1', 'u-1', 'prod-1', 'sup-1', 'TRANSFER', 2000, 300, 1700, 'UPI', 'SUCCESS', 'completed', 'ACCEPTED', datetime('now', '-5 days')),
      ('b-2', 'u-1', 'prod-2', 'sup-2', 'TOUR', 5000, 750, 4250, 'CARD', 'SUCCESS', 'confirmed', 'ACCEPTED', datetime('now', '-2 days')),
      ('b-3', 'u-2', 'prod-1', 'sup-1', 'TRANSFER', 1500, 225, 1275, 'UPI', 'FAILED', 'cancelled', 'DECLINED', datetime('now', '-1 days'))
  `).run();

  // Seed sample refund
  db.prepare("INSERT INTO refunds VALUES ('ref-1', 'b-3', 1500, datetime('now', '-1 days'))").run();

  // Seed quality score
  db.prepare("INSERT INTO quality_scores VALUES ('SUPPLIER', 'sup-1', 95.5, 4.8, 25)").run();

  return db;
}

test("getDailyOverview returns aggregated KPIs and percentage changes", () => {
  const db = setupTestDb();
  const overview = getDailyOverview(db, { days: 30 });

  assert.equal(overview.period.days, 30);
  assert.equal(overview.kpis.totalBookings.value, 3);
  assert.equal(overview.kpis.revenue.value, 7000); // b-1 (2000) + b-2 (5000)
  assert.equal(overview.kpis.avgOrderValue.value, 3500); // 7000 / 2
  assert.equal(overview.kpis.cancellationRate.value, 33.33); // 1 / 3
  assert.equal(overview.kpis.refundRate.value, 33.33);
  assert.equal(overview.kpis.activeSuppliers.value, 2);
  assert.equal(overview.kpis.uniqueCustomers.value, 2);
});

test("getBookingTrends returns points grouped by day or month", () => {
  const db = setupTestDb();
  const dailyTrends = getBookingTrends(db, { days: 30, groupBy: "day" });
  assert.ok(Array.isArray(dailyTrends.points));
  assert.ok(dailyTrends.points.length > 0);

  const monthlyTrends = getBookingTrends(db, { days: 90, groupBy: "month" });
  assert.equal(monthlyTrends.groupBy, "month");
  assert.ok(Array.isArray(monthlyTrends.points));
});

test("getCohortRetention calculates user retention over time", () => {
  const db = setupTestDb();
  const cohorts = getCohortRetention(db, { months: 6 });
  assert.equal(cohorts.months, 6);
  assert.ok(Array.isArray(cohorts.cohorts));
  if (cohorts.cohorts.length > 0) {
    assert.ok(cohorts.cohorts[0].cohortSize >= 1);
    assert.ok(cohorts.cohorts[0].retention);
  }
});

test("getSupplierPerformance returns ranked supplier metrics", () => {
  const db = setupTestDb();
  const result = getSupplierPerformance(db, { days: 30, limit: 10 });
  assert.ok(Array.isArray(result.suppliers));
  assert.ok(result.suppliers.length >= 1);

  const topSupplier = result.suppliers[0];
  assert.ok(topSupplier.name);
  assert.ok(topSupplier.revenue >= 0);
  assert.equal(topSupplier.rank, 1);
  if (topSupplier.supplierId === "sup-1") {
    assert.equal(topSupplier.qualityScore, 95.5);
    assert.equal(topSupplier.avgRating, 4.8);
  }
});

test("getRevenueBreakdown returns segments by product type and destination", () => {
  const db = setupTestDb();
  const breakdown = getRevenueBreakdown(db, { days: 30 });
  assert.equal(breakdown.totalRevenue, 7000);
  assert.ok(Array.isArray(breakdown.byProductType));
  assert.ok(Array.isArray(breakdown.byDestination));
  assert.ok(Array.isArray(breakdown.byPaymentMethod));
  assert.ok(breakdown.byProductType.length >= 2);
});

test("getConversionFunnel returns funnel stages", () => {
  const db = setupTestDb();
  const funnel = getConversionFunnel(db, { days: 30 });
  assert.ok(Array.isArray(funnel.stages));
  assert.ok(funnel.stages.length >= 4);
  assert.equal(funnel.stages[0].name, "Bookings Created");
  assert.equal(funnel.stages[0].count, 3);
});

test("getAnomalyAlerts returns stats and handles small datasets gracefully", () => {
  const db = setupTestDb();
  const alerts = getAnomalyAlerts(db);
  assert.ok(alerts.alerts !== undefined);
});

test("logAnalyticsEvent writes event safely to audit_logs", () => {
  const db = setupTestDb();
  logAnalyticsEvent(db, {
    name: "search_performed",
    actorId: "u-123",
    actorRole: "TRAVELER",
    resourceType: "SEARCH",
    resourceId: "dest-goa",
    properties: { reason: "scuba diving", channel: "web" }
  });

  const row = db.prepare("SELECT * FROM audit_logs WHERE action = 'analytics.search_performed'").get();
  assert.ok(row);
  assert.equal(row.actor_id, "u-123");
  assert.equal(row.actor_role, "TRAVELER");
  assert.ok(row.metadata.includes("scuba diving"));
});
