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
import { migratedDb } from "./helpers/migratedDb.js";

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
      city TEXT,
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
      refund_amount REAL,
      requested_at TEXT DEFAULT (datetime('now'))
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

// A migrated database with no bookings, refunds or audit events, and a helper
// that adds `count` bookings created `daysAgo` days ago.
function emptyAnalyticsDb(t) {
  const db = migratedDb(t);
  db.pragma("foreign_keys = OFF");
  db.exec("DELETE FROM bookings; DELETE FROM refunds; DELETE FROM audit_logs;");
  let next = 0;
  const insert = db.prepare(`INSERT INTO bookings (id, ref, product_type, activity_date, pickup_location, amount_inr, status, payment_status, created_at)
    VALUES (?, ?, 'ACTIVITY', '2099-01-01', 'Jetty', ?, ?, ?, datetime('now', ?))`);
  const addBookings = (daysAgo, count, { amount = 1000, status = "confirmed", paymentStatus = "PAID" } = {}) => {
    for (let i = 0; i < count; i++) {
      next += 1;
      insert.run(`bk_a${next}`, `IH-A${next}`, amount, status, paymentStatus, `-${daysAgo} days`);
    }
  };
  return { db, addBookings };
}

const alertTypes = (result) => result.alerts.map((alert) => alert.type).sort();

test("bookings dropping to none today and yesterday raise low-volume alerts", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  for (let day = 2; day <= 11; day++) addBookings(day, 10);
  const result = getAnomalyAlerts(db);
  assert.deepEqual(alertTypes(result), ["LOW_BOOKINGS", "LOW_BOOKINGS", "LOW_REVENUE", "LOW_REVENUE"]);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(result.alerts.filter((alert) => alert.day === today).length, 2);
  assert.ok(result.alerts.every((alert) => alert.value === 0 && alert.zScore < -2));
});

test("a steady week raises nothing, and fewer than seven days of data is not judged", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  for (let day = 0; day <= 5; day++) addBookings(day, 3);
  assert.match(getAnomalyAlerts(db).message, /need 7\+ days/);
  addBookings(6, 3);
  const steady = getAnomalyAlerts(db);
  assert.deepEqual(steady.alerts, []);
  assert.deepEqual(steady.stats.bookings, { mean: 3, stdDev: 0 });
});

test("a burst of bookings is flagged as unusually high, and a burst of cancellations as a spike", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  for (let day = 1; day <= 11; day++) addBookings(day, 1);
  addBookings(0, 16);
  addBookings(0, 4, { status: "cancelled", paymentStatus: "REFUNDED" });
  const result = getAnomalyAlerts(db);
  assert.deepEqual(alertTypes(result), ["CANCELLATION_SPIKE", "HIGH_BOOKINGS"]);
  const spike = result.alerts.find((alert) => alert.type === "CANCELLATION_SPIKE");
  assert.equal(spike.value, 4);
  assert.equal(spike.expected, 0.13);
});

test("KPIs compare with the previous period, and weekly trends group by week", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  addBookings(40, 2, { amount: 1000 });
  addBookings(5, 3, { amount: 1000 });
  const overview = getDailyOverview(db, { days: 30 });
  assert.deepEqual(overview.kpis.totalBookings, { value: 3, change: 50 });
  assert.deepEqual(overview.kpis.revenue, { value: 3000, change: 50 });
  assert.deepEqual(overview.kpis.cancellationRate, { value: 0, change: 0 });

  const weekly = getBookingTrends(db, { days: 90, groupBy: "week" });
  assert.equal(weekly.groupBy, "week");
  assert.ok(weekly.points.every((point) => /^\d{4}-W\d{2}$/.test(point.period)));
});

test("the funnel starts at searches and views once audit events exist", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  addBookings(1, 1, { status: "pending_payment", paymentStatus: "PENDING" });
  addBookings(1, 2, { status: "confirmed" });
  addBookings(1, 1, { status: "completed" });
  assert.deepEqual(getConversionFunnel(db).stages.map((stage) => stage.count), [4, 3, 3, 1]);

  const event = db.prepare("INSERT INTO audit_logs (id, action, resource_type) VALUES (?, ?, 'product')");
  for (let i = 0; i < 20; i++) event.run(`al_s${i}`, "search");
  for (let i = 0; i < 8; i++) event.run(`al_v${i}`, "product_view");
  const funnel = getConversionFunnel(db);
  assert.deepEqual(funnel.stages.map((stage) => [stage.name, stage.count, stage.conversionFromPrev]), [
    ["Searches", 20, 100],
    ["Product Views", 8, 40],
    ["Bookings Created", 4, 50],
    ["Payment Initiated", 3, 75],
    ["Confirmed", 3, 100],
    ["Completed", 1, 33.33],
  ]);
  assert.equal(funnel.overallConversion, 5);
});

test("the overview counts refunds and the breakdown groups revenue by city on the migrated schema", t => {
  const { db, addBookings } = emptyAnalyticsDb(t);
  addBookings(3, 2, { amount: 2000 });
  db.prepare("UPDATE bookings SET product_id = (SELECT id FROM products WHERE city = 'Goa' LIMIT 1)").run();
  const refund = db.prepare(`INSERT INTO refunds (id, booking_id, booking_ref, refund_amount, refund_percentage, policy_tier, status, requested_at)
    VALUES (?, ?, ?, ?, 100, 'FULL', 'PROCESSED', datetime('now', ?))`);
  refund.run("rf_1", "bk_a1", "IH-A1", 1500, "-2 days");
  refund.run("rf_old", "bk_a2", "IH-A2", 900, "-45 days");

  const overview = getDailyOverview(db, { days: 30 });
  assert.deepEqual(overview.kpis.refundsTotal, { value: 1500 });
  assert.deepEqual(overview.kpis.refundRate, { value: 50, change: 0 });

  const breakdown = getRevenueBreakdown(db, { days: 30 });
  assert.deepEqual(breakdown.byDestination, [{ destination: "Goa", bookings: 2, revenue: 4000, share: 100 }]);
});
