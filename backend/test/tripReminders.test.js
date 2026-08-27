import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import {
  notifyUpcomingTripReminder,
  notifyPostTripReviewRequest,
  runAutomatedTripReminders,
} from "../src/services/notificationService.js";

describe("WhatsApp & Email Automated Trip Reminders", () => {
  const testSupplierId = "sup_remind_01";
  const testDriverId = "drv_remind_01";
  const testBookingUpcoming = "bk_remind_upcoming_01";
  const testBookingCompleted = "bk_remind_completed_01";
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  before(() => {
    // Safe foreign-key order cleanup
    db.prepare("DELETE FROM notification_deliveries WHERE booking_id IN (?, ?) OR event_key LIKE 'bk_remind_%'").run(testBookingUpcoming, testBookingCompleted);
    db.prepare("DELETE FROM driver_assignment_events WHERE booking_id IN (?, ?)").run(testBookingUpcoming, testBookingCompleted);
    db.prepare("DELETE FROM driver_assignments WHERE booking_id IN (?, ?)").run(testBookingUpcoming, testBookingCompleted);
    db.prepare("DELETE FROM financial_ledger WHERE booking_id IN (?, ?) OR supplier_id = ?").run(testBookingUpcoming, testBookingCompleted, testSupplierId);
    db.prepare("DELETE FROM payout_batch_items WHERE booking_id IN (?, ?)").run(testBookingUpcoming, testBookingCompleted);
    db.prepare("DELETE FROM payout_batches WHERE supplier_id = ?").run(testSupplierId);
    db.prepare("DELETE FROM payouts WHERE booking_id IN (?, ?) OR supplier_id = ?").run(testBookingUpcoming, testBookingCompleted, testSupplierId);
    db.prepare("DELETE FROM supplier_drivers WHERE supplier_id = ?").run(testSupplierId);
    db.prepare("DELETE FROM bookings WHERE id IN (?, ?) OR supplier_id = ?").run(testBookingUpcoming, testBookingCompleted, testSupplierId);
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(testSupplierId);

    // Create supplier
    db.prepare(`
      INSERT INTO suppliers (
        id, company_name, contact_name, email, phone, city, state, kyb_status, commission_rate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', 18, datetime('now'))
    `).run(
      testSupplierId, "Heritage Royal Rajasthan", "Gajendra Singh",
      "heritage@rajasthan.com", "9811223344", "Jaipur", "Rajasthan"
    );

    // Create driver
    db.prepare(`
      INSERT INTO supplier_drivers (
        id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, rating
      ) VALUES (?, ?, ?, ?, ?, ?, 4.9)
    `).run(
      testDriverId, testSupplierId, "Ramesh Kumar", "9876500001", "Toyota Innova Crysta", "RJ14-PA-8899"
    );

    // Create upcoming booking (tomorrow)
    db.prepare(`
      INSERT INTO bookings (
        id, ref, supplier_id, traveler_name, traveler_email, traveler_phone,
        product_type, activity_date, pickup_time, pickup_location, amount_inr, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookingUpcoming, "IH-REM-UPC", testSupplierId, "Pooja Hegde",
      "pooja@example.com", "9876543210", "DAY_TOUR", tomorrow, "08:30 AM",
      "ITC Rajputana, Jaipur", 4500, "confirmed", "PAID"
    );

    // Assign driver to upcoming booking
    db.prepare(`
      INSERT INTO driver_assignments (
        id, booking_id, supplier_id, supplier_driver_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status, assigned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', datetime('now'))
    `).run("da_remind_01", testBookingUpcoming, testSupplierId, testDriverId, "Ramesh Kumar", "9876500001", "Toyota Innova Crysta", "RJ14-PA-8899");

    // Create completed booking (3 days ago)
    db.prepare(`
      INSERT INTO bookings (
        id, ref, supplier_id, traveler_name, traveler_email, traveler_phone,
        product_type, activity_date, pickup_time, pickup_location, amount_inr, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookingCompleted, "IH-REM-CMP", testSupplierId, "Arjun Kapoor",
      "arjun@example.com", "9876543211", "TRANSFER", threeDaysAgo, "10:00 AM",
      "Jaipur Airport T2", 1800, "completed", "PAID"
    );
  });

  it("dispatches 24-hour pre-trip reminder with driver details and records notification log", async () => {
    const result = await notifyUpcomingTripReminder(db, testBookingUpcoming);

    assert.equal(result.eventType, "PRE_TRIP_REMINDER");
    assert.equal(result.bookingRef, "IH-REM-UPC");
    assert.equal(result.recipient, "pooja@example.com");
    assert.ok(result.results.length >= 1);

    // Verify delivery in database
    const log = db.prepare("SELECT * FROM notification_deliveries WHERE event_type = 'PRE_TRIP_REMINDER' AND event_key LIKE ? || ':%'").get(testBookingUpcoming);
    assert.ok(log);
    assert.ok(["SENT", "SKIPPED", "FAILED"].includes(log.status));
    assert.match(log.subject, /Trip Reminder: Your DAY_TOUR is tomorrow/);
  });

  it("dispatches post-trip review invitation with direct review link", async () => {
    const result = await notifyPostTripReviewRequest(db, testBookingCompleted);

    assert.equal(result.eventType, "POST_TRIP_REVIEW_INVITE");
    assert.equal(result.bookingRef, "IH-REM-CMP");
    assert.equal(result.recipient, "arjun@example.com");
    assert.match(result.reviewUrl, /my-reviews\?bookingRef=IH-REM-CMP/);

    // Verify delivery in database
    const log = db.prepare("SELECT * FROM notification_deliveries WHERE event_type = 'POST_TRIP_REVIEW_INVITE' AND event_key LIKE ? || ':%'").get(testBookingCompleted);
    assert.ok(log);
    assert.ok(["SENT", "SKIPPED", "FAILED"].includes(log.status));
    assert.match(log.subject, /How was your trip\? Review your TRANSFER/);
  });

  it("automated reminder batch scanner enforces idempotency and skips already-sent reminders", async () => {
    // Both test bookings already had notifications sent above, so scanner should skip them
    const scan1 = await runAutomatedTripReminders(db);
    assert.equal(scan1.preTripBookings.includes("IH-REM-UPC"), false);
    assert.equal(scan1.postTripBookings.includes("IH-REM-CMP"), false);
  });
});
