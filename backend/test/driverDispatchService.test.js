import fs from "node:fs";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  assignDriverToBooking,
  bookingWindow,
  bookingWindowsOverlap,
  expiredFleetDocument,
  getDispatchTimeline,
  getDriverCoordinates,
  getFleetAvailability,
  getLiveDispatchTelemetry,
  normalizeDriverPhone,
  normalizeVehicleNumber,
  updateDispatchStatus,
  updateDriverCoordinates,
  verifyPickupOtp,
} from "../src/services/driverDispatchService.js";
import { hashPickupOtp } from "../src/services/bookingService.js";
import { migratedDb } from "./helpers/migratedDb.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY);
    CREATE TABLE products (id TEXT PRIMARY KEY, duration_hours REAL, group_type TEXT);
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
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
  `);
  db.prepare("INSERT INTO products VALUES ('product-1', 2, 'PRIVATE')").run();
  db.prepare("INSERT INTO supplier_drivers VALUES ('driver-1', 'supplier-1', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'GA-03-AB-1234', 'AVAILABLE')").run();
  executeMigrationSql(db, fs.readFileSync(new URL('../migrations/026_driver_dispatch_workflow.sql', import.meta.url), 'utf8').split('-- @down')[0]);
  db.exec("ALTER TABLE bookings ADD COLUMN adults INTEGER DEFAULT 1; ALTER TABLE bookings ADD COLUMN children INTEGER DEFAULT 0");
  db.prepare("UPDATE supplier_drivers SET driver_email = 'driver@example.test', seat_capacity = 4").run();
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
  db.prepare("INSERT INTO bookings (id, ref, supplier_id, product_id, product_type, activity_date, pickup_time, vehicle_category, payment_status, supplier_assignment_status, status) VALUES (?, ?, 'supplier-1', 'product-1', 'TRANSFER', ?, ?, ?, ?, ?, ?)")
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

test("a vehicle whose papers expire before the trip can't be assigned (ADR 024)", () => {
  const db = database();
  executeMigrationSql(db, fs.readFileSync(new URL('../migrations/051_fleet_document_expiry.sql', import.meta.url), 'utf8').split('-- @down')[0]);
  addBooking(db, "booking-1", "09:00");
  db.prepare("UPDATE supplier_drivers SET insurance_expiry = '2026-09-09', license_expiry = '2027-01-01'").run();
  const fleet = getFleetAvailability(db, { supplierId: "supplier-1", bookingId: "booking-1" })[0];
  assert.equal(fleet.available, false);
  assert.match(fleet.reason, /vehicle insurance expired on 2026-09-09/);
  assert.throws(() => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1" }), /vehicle insurance expired/);
  // Valid on the trip date itself, and no date entered, both allow the trip.
  db.prepare("UPDATE supplier_drivers SET insurance_expiry = '2026-09-10', license_expiry = NULL").run();
  assert.equal(getFleetAvailability(db, { supplierId: "supplier-1", bookingId: "booking-1" })[0].available, true);
  assert.doesNotThrow(() => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1" }));
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

test("a clash between trips in different countries is judged in each city's own time (ADR 023)", () => {
  const db = database();
  db.exec("ALTER TABLE products ADD COLUMN city TEXT; CREATE TABLE destinations (name TEXT, country TEXT)");
  db.prepare("INSERT INTO destinations VALUES ('Lucknow', 'India'), ('Bangkok', 'Thailand')").run();
  db.prepare("UPDATE products SET city = 'Lucknow'").run();
  db.prepare("INSERT INTO products (id, duration_hours, group_type, city) VALUES ('product-th', 2, 'PRIVATE', 'Bangkok')").run();
  addBooking(db, "booking-in", "09:00");
  addBooking(db, "booking-th", "12:00");
  db.prepare("UPDATE bookings SET product_id = 'product-th' WHERE id = 'booking-th'").run();
  assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-in", supplierDriverId: "driver-1" });
  // 12:00 in Bangkok is 10:30 in India, inside the 09:00 IST trip's 2 hours plus buffer.
  assert.throws(() => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-th", supplierDriverId: "driver-1" }), /already assigned/i);
  db.close();
});

test("enforces dispatch order and requires the OTP path to start a trip", () => {
  const db = database();
  addBooking(db, "booking-1", "09:00");
  assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1" });
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED'").run();
  assert.throws(() => updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "TRIP_STARTED" }), /pickup OTP/i);
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "EN_ROUTE" });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "ARRIVED" });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "TRIP_STARTED", allowTripStart: true });
  updateDispatchStatus(db, { supplierId: "supplier-1", bookingId: "booking-1", nextStatus: "COMPLETED" });
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'booking-1'").get().status, "completed");
  assert.equal(getDispatchTimeline(db, "booking-1").at(-1).new_status, "COMPLETED");
  db.close();
});

test("a trip's window reads 12-hour times and lasts its package, product or route length", () => {
  const trip = (fields) => ({ activity_date: "2099-03-10", pickup_time: "09:00", product_type: "ACTIVITY", ...fields });
  const hours = (fields) => bookingWindow(trip(fields)).durationHours;
  assert.equal(bookingWindow(trip({ pickup_time: "12:30 AM" })).start, bookingWindow(trip({ pickup_time: "00:30" })).start);
  assert.equal(bookingWindow(trip({ pickup_time: "12:30 pm" })).start, bookingWindow(trip({ pickup_time: "12:30" })).start);
  assert.equal(bookingWindow(trip({ pickup_time: "1:15 PM" })).start, bookingWindow(trip({ pickup_time: "13:15" })).start);
  assert.equal(hours({}), 8);
  assert.equal(hours({ product_type: "transfer" }), 2);
  assert.equal(hours({ product_type: "TRANSFER", duration_mins: 90 }), 1.5);
  assert.equal(hours({ duration_hours: 3, total_days: 2 }), 48);
  for (const time of ["25:00", "9am", "", "10:60"]) assert.throws(() => bookingWindow(trip({ pickup_time: time })), /valid pickup time/);
  for (const date of ["2099-02-30", "", "10-03-2099"]) assert.throws(() => bookingWindow(trip({ activity_date: date })), /invalid travel date/);

  assert.equal(bookingWindowsOverlap(trip({}), trip({ pickup_time: "16:59" })), true);
  assert.equal(bookingWindowsOverlap(trip({}), trip({ pickup_time: "17:00" })), false);
  assert.equal(expiredFleetDocument({ permit_expiry: "2020-01-01" }, null), null);
  assert.equal(expiredFleetDocument({ permit_expiry: "2020-01-01" }, "2099-03-10"), "The vehicle permit expired on 2020-01-01");
});

// Dispatch on a copy of the migrated test database, with one supplier, one
// transfer and one Sedan in the fleet.
function dispatchDb(t) {
  const db = migratedDb(t);
  db.prepare(`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status, subscription_exempt)
    VALUES ('sup_d', 'Dispatch Co', 'D', 'dispatch@example.test', '+919000000003', 'Goa', 'Goa', 'APPROVED', 1)`).run();
  db.prepare(`INSERT INTO products (id, supplier_id, product_type, title, city, state, category, price_inr, duration_hours)
    VALUES ('prd_d', 'sup_d', 'TRANSFER', 'Airport run', 'Goa', 'Goa', 'Transfers', 1500, 2)`).run();
  db.prepare(`INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status, driver_email, seat_capacity)
    VALUES ('drv_fleet', 'sup_d', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'GA-03-AB-1234', 'AVAILABLE', 'ravi@example.test', 4)`).run();
  return db;
}

function addTrip(db, id, fields = {}) {
  const row = {
    id, ref: `IH-${id}`, supplier_id: "sup_d", product_id: "prd_d", product_type: "TRANSFER", activity_date: "2099-03-10",
    pickup_time: "09:00", pickup_location: "Goa Airport", amount_inr: 1500, vehicle_category: "SEDAN", payment_status: "PAID",
    supplier_assignment_status: "SUPPLIER_ACCEPTED", status: "confirmed", adults: 2, children: 0, ...fields,
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO bookings (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
}

const fleetAssign = (db, bookingId, extra = {}) => assignDriverToBooking(db, { supplierId: "sup_d", bookingId, supplierDriverId: "drv_fleet", ...extra });
const manualAssign = (db, bookingId, driver = {}) => assignDriverToBooking(db, {
  supplierId: "sup_d", bookingId, actorId: "ops",
  manualDriver: { driverName: "Manoj", driverPhone: "98123 45678", vehicleModel: "Toyota Etios", vehicleNumber: "ga 07 c 5555", driverEmail: "manoj@example.test", seatCapacity: 4, ...driver },
});
const setStatus = (db, bookingId, nextStatus, extra = {}) => updateDispatchStatus(db, { supplierId: "sup_d", bookingId, nextStatus, ...extra });

function assertDispatchError(fn, status, message) {
  assert.throws(fn, (error) => {
    assert.match(error.message, message);
    assert.equal(error.status, status);
    return true;
  });
}

test("a driver is refused for an unpaid, unaccepted or closed booking", t => {
  const db = dispatchDb(t);
  assertDispatchError(() => fleetAssign(db, "bk_missing"), 404, /not found for this supplier/);
  addTrip(db, "bk_unpaid", { payment_status: "PENDING" });
  assertDispatchError(() => fleetAssign(db, "bk_unpaid"), 409, /after payment is confirmed/);
  addTrip(db, "bk_unaccepted", { supplier_assignment_status: "PENDING_SUPPLIER" });
  assertDispatchError(() => fleetAssign(db, "bk_unaccepted"), 409, /Accept this booking/);
  addTrip(db, "bk_cancelled", { status: "cancelled" });
  assertDispatchError(() => fleetAssign(db, "bk_cancelled"), 409, /while booking is cancelled/);
});

test("a driver is refused when not in the fleet, suspended, the wrong vehicle, too small or without email", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1");
  assertDispatchError(() => fleetAssign(db, "bk_1", { supplierDriverId: "drv_other" }), 404, /your own fleet/);
  db.prepare("UPDATE supplier_drivers SET status = 'SUSPENDED'").run();
  assertDispatchError(() => fleetAssign(db, "bk_1"), 409, /suspended and cannot be assigned/);

  assertDispatchError(() => manualAssign(db, "bk_1", { driverName: "  " }), 400, /Driver name is required/);
  assertDispatchError(() => manualAssign(db, "bk_1", { driverPhone: "123" }), 400, /valid driver mobile/);
  assertDispatchError(() => manualAssign(db, "bk_1", { vehicleNumber: "CAR" }), 400, /valid vehicle registration/);
  assertDispatchError(() => manualAssign(db, "bk_1", { vehicleModel: "Innova Crysta" }), 409, /matching the booked SEDAN category/);
  assertDispatchError(() => manualAssign(db, "bk_1", { seatCapacity: 1 }), 409, /sufficient vehicle seat capacity/);
  assertDispatchError(() => manualAssign(db, "bk_1", { seatCapacity: "four" }), 409, /sufficient vehicle seat capacity/);
  assertDispatchError(() => manualAssign(db, "bk_1", { driverEmail: "manoj" }), 409, /email is required/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_assignments WHERE booking_id = 'bk_1'").get().n, 0);
});

test("the fleet list says why each vehicle can't take a trip", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1");
  assertDispatchError(() => getFleetAvailability(db, { supplierId: "sup_d", bookingId: "bk_missing" }), 404, /not found/);
  const reason = () => getFleetAvailability(db, { supplierId: "sup_d", bookingId: "bk_1" })[0];
  assert.deepEqual([reason().available, reason().reason], [true, null]);
  db.prepare("UPDATE supplier_drivers SET status = 'UNAVAILABLE'").run();
  assert.equal(reason().reason, "Fleet status is unavailable");
  db.prepare("UPDATE supplier_drivers SET status = NULL, vehicle_model = 'Maruti Ertiga'").run();
  assert.deepEqual([reason().available, reason().compatible, reason().reason], [false, false, "Vehicle does not match SEDAN"]);
  db.prepare("UPDATE supplier_drivers SET vehicle_model = 'Dzire', driver_email = NULL").run();
  assert.equal(reason().compatible, false);
});

test("a typed-in driver can be replaced by a fleet driver until the trip is under way", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1");
  const manual = manualAssign(db, "bk_1");
  assert.deepEqual(
    [manual.assignment_source, manual.driver_phone, manual.vehicle_number, manual.acknowledgement, manual.supplier_driver_id],
    ["MANUAL", "+919812345678", "GA 07 C 5555", "PENDING", null]
  );
  assert.ok(Date.parse(manual.response_deadline) > Date.now());

  const replaced = fleetAssign(db, "bk_1", { automatic: true, actorId: "system", assignmentDetails: { reason: "auto" } });
  assert.equal(replaced.id, manual.id);
  assert.deepEqual([replaced.assignment_source, replaced.supplier_driver_id, replaced.driver_name], ["AUTOMATIC", "drv_fleet", "Ravi Kumar"]);
  assert.notEqual(replaced.revision, manual.revision);
  const reassigned = getDispatchTimeline(db, "bk_1").find((row) => row.event_type === "REASSIGNED");
  assert.deepEqual(JSON.parse(reassigned.details), { previousDriver: "Manoj", previousVehicle: "GA 07 C 5555", reason: "auto" });
  const outbox = db.prepare("SELECT event_type FROM dispatch_outbox WHERE booking_id = 'bk_1' ORDER BY event_type").all().map((row) => row.event_type);
  assert.deepEqual(outbox, ["DRIVER_REMOVED", "DRIVER_REQUEST", "DRIVER_REQUEST"]);

  db.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE' WHERE booking_id = 'bk_1'").run();
  assertDispatchError(() => manualAssign(db, "bk_1"), 409, /active trip cannot be reassigned/);
});

test("a dispatch status change needs an accepted assignment for the booked schedule, in order", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1");
  assertDispatchError(() => setStatus(db, "bk_1", "EN_ROUTE"), 409, /Assign a driver/);
  fleetAssign(db, "bk_1");
  assertDispatchError(() => setStatus(db, "bk_1", "EN_ROUTE"), 409, /must accept this assignment/);
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED'").run();

  assert.equal(setStatus(db, "bk_1", "assigned").idempotent, true);
  assertDispatchError(() => setStatus(db, "bk_1", "COMPLETED"), 409, /Cannot move dispatch from ASSIGNED to COMPLETED/);

  db.prepare("UPDATE bookings SET pickup_time = '10:00' WHERE id = 'bk_1'").run();
  assertDispatchError(() => setStatus(db, "bk_1", "EN_ROUTE"), 409, /schedule changed/);
  db.prepare("UPDATE bookings SET pickup_time = '09:00', status = 'cancelled' WHERE id = 'bk_1'").run();
  assertDispatchError(() => setStatus(db, "bk_1", "EN_ROUTE"), 409, /not available for service/);
});

test("a verified pickup OTP starts the trip from any earlier step, and completion releases the payout", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1");
  fleetAssign(db, "bk_1");
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED'").run();
  const task = db.prepare("INSERT INTO staff_tasks (id, task_type, booking_id, status) VALUES (?, ?, 'bk_1', 'OPEN')");
  task.run("st_pickup", "PICKUP_NOT_STARTED");
  task.run("st_gps", "DRIVER_LOCATION_RISK");
  db.prepare("INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status) VALUES ('po_1', 'sup_d', 'bk_1', 1500, 450, 1050, 'PAYMENT_HELD')").run();

  const started = setStatus(db, "bk_1", "TRIP_STARTED", { allowTripStart: true, note: " Guest on board " });
  assert.deepEqual([started.assignment.assignment_status, started.assignment.notes], ["TRIP_STARTED", "Guest on board"]);
  assert.ok(started.assignment.trip_started_at);
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'bk_1'").get().status, "in_progress");
  const taskStatus = (id) => db.prepare("SELECT status FROM staff_tasks WHERE id = ?").get(id).status;
  assert.deepEqual([taskStatus("st_pickup"), taskStatus("st_gps")], ["COMPLETED", "COMPLETED"]);

  const completed = setStatus(db, "bk_1", "COMPLETED");
  assert.equal(completed.assignment.notes, "Guest on board");
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = 'bk_1'").get().status, "completed");
  assert.equal(db.prepare("SELECT payout_status FROM payouts WHERE id = 'po_1'").get().payout_status, "SCHEDULED");
});

test("a pickup OTP is refused when unpaid, locked, expired or wrong, and every guess counts", t => {
  const db = dispatchDb(t);
  const expires = new Date(Date.now() + 86400000).toISOString();
  addTrip(db, "bk_otp", { status: "driver_assigned", otp_hash: hashPickupOtp("bk_otp", "482913"), otp_expires_at: expires });
  const attempts = () => db.prepare("SELECT otp_attempts FROM bookings WHERE id = 'bk_otp'").get().otp_attempts;

  assertDispatchError(() => verifyPickupOtp(db, "bk_missing", "482913"), 409, /not available for pickup/);
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "000000"), 400, /Invalid pickup OTP/);
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "48a913"), 400, /Invalid pickup OTP/);
  assert.equal(attempts(), 2);
  assert.deepEqual(verifyPickupOtp(db, "bk_otp", "482913"), { valid: true, bookingId: "bk_otp" });
  assert.ok(db.prepare("SELECT otp_verified_at FROM bookings WHERE id = 'bk_otp'").get().otp_verified_at);
  // Already verified: a repeat answers valid without spending an attempt.
  assert.deepEqual(verifyPickupOtp(db, "bk_otp", "anything"), { valid: true, bookingId: "bk_otp" });
  assert.equal(attempts(), 3);

  db.prepare("UPDATE bookings SET otp_verified_at = NULL, otp_attempts = 5 WHERE id = 'bk_otp'").run();
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "482913"), 429, /locked/);
  db.prepare("UPDATE bookings SET otp_attempts = 0, otp_expires_at = '2000-01-01T00:00:00Z' WHERE id = 'bk_otp'").run();
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "482913"), 410, /expired/);
  db.prepare("UPDATE bookings SET otp_expires_at = ?, payment_status = 'PENDING' WHERE id = 'bk_otp'").run(expires);
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "482913"), 409, /not available for pickup/);
  db.prepare("UPDATE bookings SET payment_status = 'PAID', status = 'completed' WHERE id = 'bk_otp'").run();
  assertDispatchError(() => verifyPickupOtp(db, "bk_otp", "482913"), 409, /not available for pickup/);
});

test("operations can type in a driver's position, and the live map shows only reported positions", t => {
  const db = dispatchDb(t);
  addTrip(db, "bk_1", { pickup_lat: 15.38, pickup_lng: "" });
  const { id } = fleetAssign(db, "bk_1");
  assertDispatchError(() => updateDriverCoordinates(db, "drv_missing", { lat: 15, lng: 73 }), 404, /assignment not found/);
  for (const coords of [{ lat: "north", lng: 73 }, { lat: null, lng: 73.8 }, { lat: 15.4 }, undefined]) {
    assertDispatchError(() => updateDriverCoordinates(db, id, coords), 400, /Valid numeric lat and lng/);
  }

  const liveRow = () => getLiveDispatchTelemetry(db).find((row) => row.booking_id === "bk_1");
  assert.deepEqual([liveRow().has_live_gps, liveRow().driver_telemetry, liveRow().pickup_lat, liveRow().pickup_lng], [false, null, 15.38, null]);
  assert.equal(getDriverCoordinates(db, id), null);

  const recorded = updateDriverCoordinates(db, id, { lat: 15.4, lng: 73.8, speed: 32 });
  assert.equal(recorded.assignmentId, id);
  const position = getDriverCoordinates(db, id);
  assert.deepEqual([position.lat, position.lng, position.speed_kmh, position.source], [15.4, 73.8, 32, "OPS"]);
  assert.equal(liveRow().has_live_gps, true);
  assert.equal("last_lat" in liveRow(), false);
});
