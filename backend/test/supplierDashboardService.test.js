import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { supplierAnalytics, supplierDashboardStats } from "../src/services/supplierDashboardService.js";

// Supplier dashboard numbers (ADR 038): real or null, never a placeholder.

// 2026-09-20 10:00 in India.
const NOW = new Date("2026-09-20T04:30:00Z");

function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, city TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, price_inr INTEGER, rating REAL);
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, average_rating REAL);
    CREATE TABLE supplier_notifications (id TEXT, supplier_id TEXT, is_read INTEGER DEFAULT 0);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, product_id TEXT, activity_date TEXT, status TEXT, payment_status TEXT, source TEXT,
      amount_inr INTEGER, supplier_payout_amount INTEGER, balance_due_inr INTEGER DEFAULT 0, adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
      attendance_status TEXT, otp_hash TEXT, otp_verified_at TEXT, created_at TEXT,
      supplier_assignment_status TEXT, supplier_assigned_at TEXT, supplier_responded_at TEXT, supplier_response_deadline TEXT
    );
    INSERT INTO suppliers VALUES ('s1', 'Goa');
    INSERT INTO products VALUES ('p1', 's1', 'Dolphin Trip', 1000, NULL), ('p2', 's1', 'Spice Farm', 800, NULL);
  `);
  let n = 0;
  db.book = (fields) => {
    n += 1;
    const row = { id: `b${n}`, ref: `IH-${n}`, supplier_id: "s1", product_id: "p1", status: "confirmed", payment_status: "PAID", source: "B2C", amount_inr: 1000, supplier_payout_amount: 850, ...fields };
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO bookings (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((key) => row[key]));
  };
  return db;
}

test("earnings count on the trip date, split marketplace and direct, and leave out cancelled and unpaid", () => {
  const db = fixture();
  db.book({ activity_date: "2026-09-20" }); // marketplace today: 850
  db.book({ activity_date: "2026-09-20", payment_status: "OFFLINE", source: "WALK_IN", amount_inr: 2000, supplier_payout_amount: 2000, balance_due_inr: 500 });
  db.book({ activity_date: "2026-09-18", supplier_payout_amount: 400 });
  db.book({ activity_date: "2026-09-18", status: "cancelled" });
  db.book({ activity_date: "2026-09-18", status: "pending_payment", payment_status: "PENDING" });
  db.book({ activity_date: "2026-09-19", payment_status: "PENDING", source: "API" }); // unpaid partner booking
  db.book({ activity_date: "2026-09-25" }); // future: not earned yet this month
  db.book({ activity_date: "2026-08-15", supplier_payout_amount: 1000 }); // last month, same days
  db.book({ activity_date: "2026-08-25", supplier_payout_amount: 9000 }); // last month, after the 20th

  const stats = supplierDashboardStats(db, "s1", { now: NOW });
  assert.equal(stats.as_of, "2026-09-20");
  assert.equal(stats.today.bookings, 2);
  assert.equal(stats.today.earnings_inr, 2850);
  assert.deepEqual(stats.week.trend, [0, 0, 0, 0, 400, 0, 2850]);
  assert.equal(stats.week.earnings_inr, 3250);
  assert.equal(stats.month.earnings_inr, 3250);
  assert.equal(stats.month.marketplace_inr, 1250);
  assert.equal(stats.month.direct_inr, 2000);
  assert.equal(stats.month.direct_collected_inr, 1500);
  assert.equal(stats.month.direct_due_inr, 500);
  // 3250 against 1000 on 1–20 August.
  assert.equal(stats.month.growth_pct, 225);
});

test("growth, ratings and rates are null without data, never a flattering default", () => {
  const db = fixture();
  db.book({ activity_date: "2026-09-10", status: "completed" });
  const stats = supplierDashboardStats(db, "s1", { now: NOW });
  assert.equal(stats.month.growth_pct, null);
  assert.equal(stats.ratings.avg, null);
  assert.equal(stats.ratings.completion_rate, null);
  assert.equal(stats.ratings.cancellation_rate, null);

  for (let i = 0; i < 4; i += 1) db.book({ activity_date: "2026-09-11", status: "completed" });
  db.book({ activity_date: "2026-09-12", status: "cancelled" });
  db.book({ activity_date: "2026-09-21", status: "confirmed" }); // future trips don't count
  const later = supplierDashboardStats(db, "s1", { now: NOW });
  assert.equal(later.ratings.sample_bookings, 6);
  assert.equal(later.ratings.completion_rate, 83.3);
  assert.equal(later.ratings.cancellation_rate, 16.7);
});

test("analytics: six real months, top listings by earnings, and service metrics from bookings", () => {
  const db = fixture();
  db.book({ activity_date: "2026-04-10", supplier_payout_amount: 700 });
  db.book({ activity_date: "2026-09-05", product_id: "p2", supplier_payout_amount: 3000 });
  db.book({ activity_date: "2026-09-06", status: "cancelled", supplier_payout_amount: 99999 });
  const empty = supplierAnalytics(db, "s1", { now: NOW });
  assert.deepEqual(empty.revenueTrend.map((row) => [row.key, row.revenue_inr]), [["2026-04", 700], ["2026-05", 0], ["2026-06", 0], ["2026-07", 0], ["2026-08", 0], ["2026-09", 3000]]);
  assert.deepEqual(empty.topProducts.map((row) => [row.id, row.total_earnings]), [["p2", 3000], ["p1", 700]]);
  assert.deepEqual([empty.operationalMetrics.medianResponseMins, empty.operationalMetrics.onTimeResponsePct, empty.operationalMetrics.noShowPct, empty.operationalMetrics.otpVerifiedPct], [null, null, null, null]);

  // Five answered requests (10, 20, 30, 40, 90 minutes; the last after its 60-minute deadline) and one ignored.
  for (const minutes of [10, 20, 30, 40, 90]) {
    const assigned = Date.parse("2026-09-15T04:00:00Z");
    db.book({ activity_date: "2026-09-16", supplier_assigned_at: new Date(assigned).toISOString(), supplier_responded_at: new Date(assigned + minutes * 60000).toISOString(), supplier_response_deadline: new Date(assigned + 60 * 60000).toISOString() });
  }
  db.book({ activity_date: "2026-09-16", supplier_assigned_at: "2026-09-15 04:00:00", supplier_response_deadline: "2026-09-15 05:00:00" });
  // Walk-ins never needed an answer.
  db.book({ activity_date: "2026-09-16", source: "WALK_IN", payment_status: "OFFLINE", supplier_assigned_at: "2026-09-15 04:00:00", supplier_responded_at: "2026-09-15 04:00:00", supplier_response_deadline: "2026-09-15 05:00:00" });
  // Attendance: 8 guests checked in over 4 bookings, 2 no-shows in one.
  for (let i = 0; i < 4; i += 1) db.book({ activity_date: "2026-09-17", attendance_status: "CHECKED_IN", adults: 2 });
  db.book({ activity_date: "2026-09-17", attendance_status: "NO_SHOW", adults: 2 });
  // OTP on completed trips: 4 of 5 verified.
  for (let i = 0; i < 5; i += 1) db.book({ activity_date: "2026-09-18", status: "completed", otp_hash: "h", otp_verified_at: i < 4 ? "2026-09-18 05:00:00" : null });

  const metrics = supplierAnalytics(db, "s1", { now: NOW }).operationalMetrics;
  assert.equal(metrics.medianResponseMins, 30);
  assert.equal(metrics.onTimeSample, 6);
  assert.equal(metrics.onTimeResponsePct, 66.7);
  assert.equal(metrics.noShowPct, 20);
  assert.equal(metrics.otpVerifiedPct, 80);
});
