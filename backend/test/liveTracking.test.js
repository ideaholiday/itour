import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import {
  getLiveDispatchTelemetry,
  updateDriverCoordinates,
  getDriverCoordinates,
  verifyPickupOtp,
  updateDispatchStatus,
  assignDriverToBooking
} from "../src/services/driverDispatchService.js";
import { hashPickupOtp } from "../src/services/bookingService.js";

describe("Operations Live Dispatch & Driver Tracking", () => {
  const supplierId = "sup_test_live_dispatch";
  const productId = "prd_test_live_dispatch";
  const bookingId = "bk_test_live_dispatch";

  before(() => {
    // Cleanup any existing test artifacts
    db.prepare("DELETE FROM driver_assignment_events WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM driver_assignments WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM financial_ledger WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(supplierId);

    // Insert test supplier
    db.prepare(`
      INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status)
      VALUES (?, 'Agra Express Travels', 'Rajesh Sharma', 'agra@example.com', '+919876543210', 'Agra', 'Uttar Pradesh', 'VERIFIED')
    `).run(supplierId);

    // Insert test product
    db.prepare(`
      INSERT INTO products (id, title, city, state, category, product_type, duration_hours, price_inr, supplier_id, status)
      VALUES (?, 'Taj Mahal Sunrise Experience', 'Agra', 'Uttar Pradesh', 'Heritage', 'DAY_TOUR', 4, 2500, ?, 'PUBLISHED')
    `).run(productId, supplierId);

    // Insert test booking with OTP
    const testOtp = "7821";
    const otpHash = hashPickupOtp(bookingId, testOtp);
    db.prepare(`
      INSERT INTO bookings (
        id, ref, product_type, supplier_id, product_id, traveler_name, traveler_phone,
        status, payment_status, supplier_assignment_status, activity_date, pickup_time, pickup_location, pickup_lat, pickup_lng,
        drop_location, drop_lat, drop_lng, adults, children, amount_inr, otp_hash, otp_code
      ) VALUES (
        ?, 'IH-LIVE-7821', 'DAY_TOUR', ?, ?, 'Elena Rostova', '+12025550143',
        'confirmed', 'PAID', 'SUPPLIER_ACCEPTED', '2026-09-01', '06:00', 'ITC Mughal, Agra', 27.1612, 78.0423,
        'Taj Mahal East Gate', 27.1751, 78.0421, 2, 0, 2500, ?, ?
      )
    `).run(bookingId, supplierId, productId, otpHash, testOtp);
  });

  after(() => {
    // Cleanup
    db.prepare("DELETE FROM driver_assignment_events WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM driver_assignments WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM financial_ledger WHERE booking_id = ?").run(bookingId);
    db.prepare("DELETE FROM bookings WHERE id = ?").run(bookingId);
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(supplierId);
  });

  it("assigns a driver and fetches live dispatch telemetry with coordinates", () => {
    const assignment = assignDriverToBooking(db, {
      supplierId,
      bookingId,
      manualDriver: {
        driverName: "Sanjay Verma",
        driverPhone: "+919811223344",
        vehicleModel: "Toyota Innova Crysta",
        vehicleNumber: "UP-80-AB-1234"
      },
      actorId: "OPS_TEST"
    });

    assert.ok(assignment.id);
    assert.equal(assignment.driver_name, "Sanjay Verma");
    assert.equal(assignment.assignment_status, "ASSIGNED");

    const telemetryList = getLiveDispatchTelemetry(db);
    assert.ok(Array.isArray(telemetryList));
    const item = telemetryList.find((t) => t.booking_id === bookingId);
    assert.ok(item, "Test booking should appear in live dispatch telemetry");
    assert.equal(item.driver_name, "Sanjay Verma");
    assert.equal(item.vehicle_number, "UP-80-AB-1234");
    assert.ok(item.driver_telemetry);
    assert.ok(typeof item.driver_telemetry.lat === "number");
    assert.ok(typeof item.driver_telemetry.lng === "number");
  });

  it("updates driver live GPS coordinates and retrieves telemetry", () => {
    const assignment = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(bookingId);
    assert.ok(assignment);

    const updateRes = updateDriverCoordinates(db, assignment.id, {
      lat: 27.1650,
      lng: 78.0410,
      speed_kmh: 42,
      heading: 90,
      battery_pct: 88
    });

    assert.equal(updateRes.assignmentId, assignment.id);
    assert.equal(updateRes.telemetry.lat, 27.1650);
    assert.equal(updateRes.telemetry.speed_kmh, 42);
    assert.equal(updateRes.telemetry.heading, 90);

    const cached = getDriverCoordinates(assignment.id);
    assert.ok(cached);
    assert.equal(cached.lat, 27.1650);
  });

  it("verifies valid traveler pickup OTP and blocks incorrect OTP", () => {
    // Incorrect OTP
    assert.throws(
      () => verifyPickupOtp(db, bookingId, "0000"),
      /Invalid pickup OTP/
    );

    // Correct OTP
    const valid = verifyPickupOtp(db, bookingId, "7821");
    assert.equal(valid.valid, true);
  });

  it("advances trip status lifecycle: ASSIGNED -> EN_ROUTE -> ARRIVED -> TRIP_STARTED (via OTP) -> COMPLETED", () => {
    // EN_ROUTE
    const r1 = updateDispatchStatus(db, {
      supplierId,
      bookingId,
      nextStatus: "EN_ROUTE",
      actorId: "OPS_TEST"
    });
    assert.equal(r1.assignment.assignment_status, "EN_ROUTE");

    // ARRIVED
    const r2 = updateDispatchStatus(db, {
      supplierId,
      bookingId,
      nextStatus: "ARRIVED",
      actorId: "OPS_TEST"
    });
    assert.equal(r2.assignment.assignment_status, "ARRIVED");

    // TRIP_STARTED requires OTP check or allowTripStart: true
    assert.throws(
      () => updateDispatchStatus(db, {
        supplierId,
        bookingId,
        nextStatus: "TRIP_STARTED",
        actorId: "OPS_TEST",
        allowTripStart: false
      }),
      /Verify the traveler's pickup OTP/
    );

    // TRIP_STARTED with allowTripStart (after verifyPickupOtp)
    verifyPickupOtp(db, bookingId, "7821");
    const r3 = updateDispatchStatus(db, {
      supplierId,
      bookingId,
      nextStatus: "TRIP_STARTED",
      actorId: "OPS_TEST",
      allowTripStart: true
    });
    assert.equal(r3.assignment.assignment_status, "TRIP_STARTED");

    const bookingAfterStart = db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
    assert.equal(bookingAfterStart.status, "in_progress");

    // COMPLETED
    const r4 = updateDispatchStatus(db, {
      supplierId,
      bookingId,
      nextStatus: "COMPLETED",
      actorId: "OPS_TEST"
    });
    assert.equal(r4.assignment.assignment_status, "COMPLETED");

    const bookingAfterComplete = db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
    assert.equal(bookingAfterComplete.status, "completed");
  });
});
