import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  assignDriverToBooking,
  getDispatchTimeline,
  getFleetAvailability,
  normalizeDriverPhone,
  normalizeVehicleNumber,
  updateDispatchStatus,
} from "../src/services/driverDispatchService.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, duration_hours REAL);
    CREATE TABLE transfer_routes (product_id TEXT, duration_mins INTEGER);
    CREATE TABLE package_itineraries (product_id TEXT, total_days INTEGER);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, product_id TEXT, product_type TEXT,
      activity_date TEXT, pickup_time TEXT, vehicle_category TEXT, payment_status TEXT,
      supplier_assignment_status TEXT, status TEXT
    );
    CREATE TABLE supplier_drivers (
      id TEXT PRIMARY KEY, supplier_id TEXT, driver_name TEXT, driver_phone TEXT,
      vehicle_model TEXT, vehicle_number TEXT, status TEXT
    );
    CREATE TABLE driver_assignments (
      id TEXT PRIMARY KEY, booking_id TEXT UNIQUE, supplier_id TEXT, supplier_driver_id TEXT,
      driver_name TEXT, driver_phone TEXT, vehicle_model TEXT, vehicle_number TEXT,
      assignment_status TEXT, assignment_source TEXT, assigned_by TEXT, notes TEXT,
      assigned_at TEXT DEFAULT (datetime('now')), last_status_at TEXT, en_route_at TEXT,
      arrived_at TEXT, trip_started_at TEXT, completed_at TEXT
    );
    CREATE TABLE driver_assignment_events (
      id TEXT PRIMARY KEY, assignment_id TEXT, booking_id TEXT, supplier_id TEXT,
      supplier_driver_id TEXT, event_type TEXT, previous_status TEXT, new_status TEXT,
      note TEXT, actor_id TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE payouts (booking_id TEXT, payout_status TEXT);
  `);
  db.prepare("INSERT INTO products VALUES ('product-1', 2)").run();
  db.prepare("INSERT INTO supplier_drivers VALUES ('driver-1', 'supplier-1', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'GA-03-AB-1234', 'AVAILABLE')").run();
  return db;
}

function addBooking(db, id, time, overrides = {}) {
  const booking = {
    ref: `IH-${id}`,
    date: "2026-09-10",
    category: "SEDAN",
    payment: "PAID",
    assignment: "SUPPLIER_ACCEPTED",
    status: "confirmed",
    ...overrides,
  };
  db.prepare("INSERT INTO bookings VALUES (?, ?, 'supplier-1', 'product-1', 'TRANSFER', ?, ?, ?, ?, ?, ?)")
    .run(id, booking.ref, booking.date, time, booking.category, booking.payment, booking.assignment, booking.status);
}

test("normalizes driver contact and vehicle registration", () => {
  assert.equal(normalizeDriverPhone("98765 43210"), "+919876543210");
  assert.equal(normalizeVehicleNumber("ga-03-ab-1234"), "GA-03-AB-1234");
  assert.throws(() => normalizeDriverPhone("123"), /valid driver/i);
  assert.throws(() => normalizeVehicleNumber("plate"), /valid vehicle/i);
});

test("assigns a compatible roster driver and records an audit event", () => {
  const db = database();
  addBooking(db, "booking-1", "09:00");
  const assignment = assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1", actorId: "supplier-user" });
  assert.equal(assignment.supplier_driver_id, "driver-1");
  assert.equal(assignment.assignment_status, "ASSIGNED");
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'booking-1'").get().status, "driver_assigned");
  assert.equal(getDispatchTimeline(db, "booking-1")[0].event_type, "ASSIGNED");
  db.close();
});

test("blocks overlapping driver or vehicle assignments and allows a later trip", () => {
  const db = database();
  addBooking(db, "booking-1", "09:00");
  addBooking(db, "booking-2", "10:00");
  addBooking(db, "booking-3", "12:00");
  assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1" });
  assert.equal(getFleetAvailability(db, { supplierId: "supplier-1", bookingId: "booking-2" })[0].available, false);
  assert.throws(() => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-2", supplierDriverId: "driver-1" }), /already assigned/i);
  assert.doesNotThrow(() => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-3", supplierDriverId: "driver-1" }));
  db.close();
});

test("enforces dispatch order and requires the OTP path to start a trip", () => {
  const db = database();
  addBooking(db, "booking-1", "09:00");
  assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1" });
  assert.throws(() => updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "TRIP_STARTED" }), /pickup OTP/i);
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "EN_ROUTE" });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "ARRIVED" });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "TRIP_STARTED", allowTripStart: true });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "COMPLETED" });
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'booking-1'").get().status, "completed");
  assert.equal(getDispatchTimeline(db, "booking-1").at(-1).new_status, "COMPLETED");
  db.close();
});
