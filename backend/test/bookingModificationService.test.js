import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { BookingModificationService } from "../src/services/bookingModificationService.js";

describe("BookingModificationService", () => {
  let db;

  const traveler1 = { id: "usr_traveler_1", email: "traveler1@example.com", role: "TRAVELER" };
  const traveler2 = { id: "usr_traveler_2", email: "traveler2@example.com", role: "TRAVELER" };
  const adminUser = { id: "usr_admin", email: "admin@ideaholiday.in", role: "ADMIN" };

  before(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        role TEXT DEFAULT 'TRAVELER'
      );

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        title TEXT,
        cancellation_policy TEXT DEFAULT 'FLEXIBLE_24H'
      );

      CREATE TABLE bookings (
        id TEXT PRIMARY KEY,
        ref TEXT,
        user_id TEXT REFERENCES users(id),
        product_id TEXT REFERENCES products(id),
        activity_date TEXT NOT NULL,
        pickup_time TEXT DEFAULT '09:00',
        amount_inr REAL NOT NULL,
        payment_method TEXT DEFAULT 'UPI',
        payment_status TEXT DEFAULT 'PAID',
        status TEXT DEFAULT 'CONFIRMED',
        original_activity_date TEXT,
        rescheduled_at TEXT,
        refund_amount_inr REAL DEFAULT 0.0,
        cancellation_fee_inr REAL DEFAULT 0.0,
        cancellation_reason TEXT,
        traveler_email TEXT
      );

      CREATE TABLE booking_modifications (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id),
        requested_by TEXT NOT NULL REFERENCES users(id),
        modification_type TEXT NOT NULL,
        original_value TEXT NOT NULL,
        requested_value TEXT NOT NULL,
        price_difference_inr INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDING',
        supplier_notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT
      );

      CREATE TABLE payouts (
        id TEXT PRIMARY KEY,
        booking_id TEXT,
        payout_status TEXT DEFAULT 'PENDING'
      );

      INSERT INTO users (id, name, email, role) VALUES
        ('usr_traveler_1', 'Rohan Gupta', 'traveler1@example.com', 'TRAVELER'),
        ('usr_traveler_2', 'Ananya Roy', 'traveler2@example.com', 'TRAVELER'),
        ('usr_admin', 'Admin User', 'admin@ideaholiday.in', 'ADMIN');

      INSERT INTO products (id, title, cancellation_policy) VALUES
        ('prod_flex', 'Taj Mahal Day Tour', 'FLEXIBLE_24H'),
        ('prod_mod', 'Goa Scuba Package', 'MODERATE_48H'),
        ('prod_strict', 'Ladakh Bike Expedition', 'STRICT');

      -- Booking 1: Future trip 10 days out (fully eligible)
      INSERT INTO bookings (id, ref, user_id, product_id, activity_date, pickup_time, amount_inr, status, traveler_email)
      VALUES ('bk_future_10d', 'IH-MOD-001', 'usr_traveler_1', 'prod_flex', '2030-05-15', '09:00', 5000.0, 'CONFIRMED', 'traveler1@example.com');

      -- Booking 2: Past / today trip (within 2 hours)
      INSERT INTO bookings (id, ref, user_id, product_id, activity_date, pickup_time, amount_inr, status, traveler_email)
      VALUES ('bk_today_imminent', 'IH-MOD-002', 'usr_traveler_1', 'prod_flex', '2020-01-01', '09:00', 3000.0, 'CONFIRMED', 'traveler1@example.com');

      -- Booking 3: Cancelled trip
      INSERT INTO bookings (id, ref, user_id, product_id, activity_date, pickup_time, amount_inr, status, traveler_email)
      VALUES ('bk_cancelled_trip', 'IH-MOD-003', 'usr_traveler_1', 'prod_flex', '2030-05-15', '09:00', 2000.0, 'cancelled', 'traveler1@example.com');

      -- Booking 4: Moderate policy trip 10 days out
      INSERT INTO bookings (id, ref, user_id, product_id, activity_date, pickup_time, amount_inr, status, traveler_email)
      VALUES ('bk_moderate_trip', 'IH-MOD-004', 'usr_traveler_1', 'prod_mod', '2030-06-01', '10:00', 8000.0, 'CONFIRMED', 'traveler1@example.com');

      INSERT INTO payouts (id, booking_id, payout_status) VALUES ('po_1', 'bk_future_10d', 'SCHEDULED');
    `);
  });

  it("checks reschedule eligibility accurately for future trips", () => {
    const res = BookingModificationService.checkRescheduleEligibility(db, "bk_future_10d", traveler1);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.currentDate, "2030-05-15");
    assert.strictEqual(res.cutoffHours, 24);
    assert.ok(res.hoursUntilDeparture > 100);
  });

  it("blocks reschedule when cutoff window has closed for standard travelers", () => {
    const res = BookingModificationService.checkRescheduleEligibility(db, "bk_today_imminent", traveler1);
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason.includes("Reschedule window closed"));
  });

  it("allows admin override for rescheduling even inside cutoff window", () => {
    const res = BookingModificationService.checkRescheduleEligibility(db, "bk_today_imminent", adminUser);
    assert.strictEqual(res.eligible, true);
  });

  it("prevents unauthorized users from modifying another traveler's booking", () => {
    const res = BookingModificationService.checkRescheduleEligibility(db, "bk_future_10d", traveler2);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.error, "UNAUTHORIZED");
  });

  it("executes reschedule atomically and records audit entry", () => {
    const result = BookingModificationService.requestReschedule(
      db,
      "bk_future_10d",
      { newDate: "2030-05-20", newTime: "11:30", reason: "Flight delayed by airline" },
      traveler1
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.previousDate, "2030-05-15");
    assert.strictEqual(result.newDate, "2030-05-20");
    assert.strictEqual(result.newTime, "11:30");

    const updatedBooking = db.prepare("SELECT * FROM bookings WHERE id = ?").get("bk_future_10d");
    assert.strictEqual(updatedBooking.activity_date, "2030-05-20");
    assert.strictEqual(updatedBooking.pickup_time, "11:30");
    assert.strictEqual(updatedBooking.original_activity_date, "2030-05-15");
    assert.ok(updatedBooking.rescheduled_at);

    const modLog = db.prepare("SELECT * FROM booking_modifications WHERE booking_id = ?").get("bk_future_10d");
    assert.strictEqual(modLog.modification_type, "RESCHEDULE");
    assert.strictEqual(modLog.status, "APPLIED");
    assert.strictEqual(modLog.supplier_notes, "Flight delayed by airline");
  });

  it("calculates 100% full refund preview for flexible trips cancelled well in advance", () => {
    const preview = BookingModificationService.calculateCancellationRefundPreview(db, "bk_moderate_trip", traveler1);
    assert.strictEqual(preview.totalAmountInr, 8000);
    assert.strictEqual(preview.refundPercentage, 100);
    assert.strictEqual(preview.refundAmountInr, 8000);
    assert.strictEqual(preview.cancellationFeeInr, 0);
    assert.strictEqual(preview.isFullyRefundable, true);
  });

  it("calculates 0% refund for past / late cancellations under policy cutoff", () => {
    const preview = BookingModificationService.calculateCancellationRefundPreview(db, "bk_today_imminent", traveler1);
    assert.strictEqual(preview.totalAmountInr, 3000);
    assert.strictEqual(preview.refundPercentage, 0);
    assert.strictEqual(preview.refundAmountInr, 0);
    assert.strictEqual(preview.cancellationFeeInr, 3000);
    assert.strictEqual(preview.isFullyRefundable, false);
  });

  it("executes self-service cancellation, cancels payout, and updates ledger statuses", () => {
    const result = BookingModificationService.executeSelfServiceCancellation(
      db,
      "bk_moderate_trip",
      { reason: "Personal emergency" },
      traveler1
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, "cancelled");
    assert.strictEqual(result.refundAmountInr, 8000);
    assert.strictEqual(result.paymentStatus, "REFUND_INITIATED");

    const bookingRow = db.prepare("SELECT * FROM bookings WHERE id = ?").get("bk_moderate_trip");
    assert.strictEqual(bookingRow.status, "cancelled");
    assert.strictEqual(bookingRow.payment_status, "REFUND_INITIATED");
    assert.strictEqual(bookingRow.refund_amount_inr, 8000);
    assert.strictEqual(bookingRow.cancellation_reason, "Personal emergency");
  });
});
