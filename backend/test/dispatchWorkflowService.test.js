import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { assignDriverToBooking } from "../src/services/driverDispatchService.js";
import { enqueueDispatch } from "../src/services/dispatchStateService.js";
import { recordDriverLocations } from "../src/services/driverLocationService.js";
import {
  classifyDeliveryResults,
  dispatchRetryDelayMs,
  confirmDriverByPhone,
  dispatchReadiness,
  operationsTripOverride,
  processTripWatch,
  driverAction,
  effectiveDispatchSettings,
  rankDriverCandidates,
  escalationStages,
  listDispatchExceptions,
  processDispatchOutbox,
  processDispatchSchedule,
  DISPATCH_DELIVERY_MAX_ATTEMPTS,
} from "../src/services/dispatchWorkflowService.js";

// These suites exercise manual dispatch; automatic assignment is covered explicitly.
process.env.DISPATCH_AUTO_DEFAULT = "false";

// 2099-09-10 09:00 IST
const PICKUP = Date.UTC(2099, 8, 10, 9, 0) - 330 * 60000;

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, phone TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, duration_hours REAL, group_type TEXT);
    CREATE TABLE transfer_routes (product_id TEXT, duration_mins INTEGER);
    CREATE TABLE package_itineraries (product_id TEXT, total_days INTEGER);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, product_id TEXT, product_option_id TEXT, product_type TEXT,
      activity_date TEXT, pickup_time TEXT, pickup_location TEXT, drop_location TEXT, vehicle_category TEXT,
      payment_status TEXT, supplier_assignment_status TEXT, status TEXT, adults INTEGER DEFAULT 2, children INTEGER DEFAULT 0,
      traveler_name TEXT, traveler_email TEXT, traveler_phone TEXT
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
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE payouts (booking_id TEXT, payout_status TEXT);
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, smoothed_rating REAL, PRIMARY KEY (entity_type, entity_id));
  `);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/026_driver_dispatch_workflow.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/031_staff_task_supplier.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/035_driver_live_location.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.prepare("INSERT INTO suppliers (id) VALUES ('supplier-1')").run();
  db.prepare("INSERT INTO products (id, duration_hours, group_type) VALUES ('lucknow-tour', 8, 'PRIVATE')").run();
  db.prepare("INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status) VALUES ('driver-1', 'supplier-1', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'UP-32-AB-1234', 'AVAILABLE')").run();
  db.prepare("UPDATE supplier_drivers SET driver_email = 'ravi@example.test', seat_capacity = 4").run();
  db.prepare(`INSERT INTO bookings (id, ref, supplier_id, product_id, product_type, activity_date, pickup_time, pickup_location, vehicle_category, payment_status, supplier_assignment_status, status)
    VALUES ('booking-1', 'IH-ABC', 'supplier-1', 'lucknow-tour', 'TOUR', '2099-09-10', '09:00', 'Hazratganj, Lucknow', 'SEDAN', 'PAID', 'SUPPLIER_ACCEPTED', 'confirmed')`).run();
  return db;
}

const booking = (db) => db.prepare("SELECT * FROM bookings WHERE id = 'booking-1'").get();
const jobs = (db, eventType) => db.prepare("SELECT * FROM dispatch_outbox WHERE event_type = ? ORDER BY rowid").all(eventType);
const assign = (db) => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1", actorId: "supplier-user" });
const decline = (db, assignment) => driverAction(db, { assignment }, { action: "DECLINE", note: "Vehicle in service" });

test("classifies delivery results into delivered, permanent and retryable failures", () => {
  const outcome = classifyDeliveryResults([
    { success: true, channel: "EMAIL", recipientRole: "TRAVELER", deliveryId: "d1" },
    { success: false, skipped: true, channel: "WHATSAPP", deliveryId: "d2" },
    { success: false, channel: "WHATSAPP", recipientRole: "STAFF", error: "A valid WhatsApp phone number is required" },
    { success: false, channel: "WHATSAPP", recipientRole: "DRIVER", deliveryId: "d3", error: "WhatsApp API request timed out" },
  ]);
  assert.equal(outcome.delivered, 1);
  assert.deepEqual(outcome.permanent, ["STAFF WHATSAPP: A valid WhatsApp phone number is required"]);
  assert.deepEqual(outcome.transient, ["DRIVER WHATSAPP: WhatsApp API request timed out"]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(dispatchRetryDelayMs), [2, 4, 8, 16, 32, 60, 60].map((m) => m * 60000));
});

test("retries provider failures with backoff, then dead-letters to an operations task", async () => {
  const db = database();
  enqueueDispatch(db, booking(db), null, "ASSIGNMENT_REQUIRED", { now: new Date(PICKUP - 30 * 3600000), occurrence: "e0" });
  const failing = async () => ({ results: [{ success: false, deliveryId: "d1", channel: "WHATSAPP", recipientRole: "SUPPLIER", error: "HTTP 500" }] });
  let now = PICKUP - 30 * 3600000;
  for (let attempt = 1; attempt < DISPATCH_DELIVERY_MAX_ATTEMPTS; attempt++) {
    const result = await processDispatchOutbox(db, failing, { now: new Date(now) });
    assert.deepEqual([result.completed, result.failed], [0, 0]);
    const job = jobs(db, "ASSIGNMENT_REQUIRED")[0];
    assert.equal(job.status, "PENDING");
    assert.equal(Date.parse(job.available_at) - now, dispatchRetryDelayMs(attempt));
    now = Date.parse(job.available_at);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM staff_tasks WHERE task_type = 'NOTIFICATION_FAILED'").get().n, 0);
  const last = await processDispatchOutbox(db, failing, { now: new Date(now) });
  assert.equal(last.failed, 1);
  const job = jobs(db, "ASSIGNMENT_REQUIRED")[0];
  assert.equal(job.status, "FAILED");
  assert.equal(job.attempts, DISPATCH_DELIVERY_MAX_ATTEMPTS);
  assert.match(db.prepare("SELECT notes FROM staff_tasks WHERE task_type = 'NOTIFICATION_FAILED' AND status = 'OPEN'").get().notes, /SUPPLIER WHATSAPP: HTTP 500/);
  assert.equal((await processDispatchOutbox(db, failing, { now: new Date(now + 3600000) })).checked, 0);
});

test("a recipient that can never be reached does not block the job", async () => {
  const db = database();
  enqueueDispatch(db, booking(db), null, "ASSIGNMENT_REQUIRED", { now: new Date(PICKUP - 30 * 3600000), occurrence: "e0" });
  let calls = 0;
  const partial = async () => { calls++; return { results: [
    { success: true, deliveryId: "d1", channel: "EMAIL", recipientRole: "SUPPLIER" },
    { success: false, channel: "WHATSAPP", recipientRole: "STAFF", error: "A valid WhatsApp phone number is required" },
  ] }; };
  const result = await processDispatchOutbox(db, partial, { now: new Date(PICKUP - 30 * 3600000) });
  assert.equal(result.completed, 1);
  assert.equal(jobs(db, "ASSIGNMENT_REQUIRED")[0].status, "COMPLETE");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM staff_tasks WHERE task_type = 'NOTIFICATION_FAILED'").get().n, 1);
  await processDispatchOutbox(db, partial, { now: new Date(PICKUP - 20 * 3600000) });
  assert.equal(calls, 1);
});

test("a thrown delivery error is retried rather than lost", async () => {
  const db = database();
  enqueueDispatch(db, booking(db), null, "ASSIGNMENT_REQUIRED", { now: new Date(PICKUP - 30 * 3600000), occurrence: "e0" });
  await processDispatchOutbox(db, async () => { throw new Error("database busy"); }, { now: new Date(PICKUP - 30 * 3600000) });
  const job = jobs(db, "ASSIGNMENT_REQUIRED")[0];
  assert.equal(job.status, "PENDING");
  assert.match(job.last_error, /database busy/);
});

test("each declined driver alerts the supplier again and keeps earlier alerts", () => {
  const db = database();
  decline(db, assign(db));
  decline(db, assign(db));
  const alerts = jobs(db, "ASSIGNMENT_REQUIRED");
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts.map((a) => a.status), ["PENDING", "PENDING"]);
  assert.notEqual(alerts[0].id, alerts[1].id);
});

test("a traveler reminder queued before a decline is still delivered", () => {
  const db = database();
  enqueueDispatch(db, booking(db), null, "PRE_TRIP_REMINDER");
  const assignment = assign(db);
  decline(db, assignment);
  assert.equal(jobs(db, "PRE_TRIP_REMINDER")[0].status, "PENDING");
  assert.equal(jobs(db, "DRIVER_REQUEST")[0].status, "CANCELLED");
  assert.equal(jobs(db, "DRIVER_REMOVED")[0].status, "PENDING");
});

test("an uppercase CANCELLED booking still removes the driver", () => {
  const db = database();
  assign(db);
  db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = 'booking-1'").run();
  processDispatchSchedule(db, { now: new Date(PICKUP - 30 * 3600000) });
  assert.equal(db.prepare("SELECT assignment_status FROM driver_assignments WHERE booking_id = 'booking-1'").get().assignment_status, "CANCELLED");
  assert.equal(jobs(db, "DRIVER_REMOVED").length, 1);
});

test("the 24-hour deadline alert is sent once per schedule", () => {
  const db = database();
  for (const hours of [20, 18, 16]) processDispatchSchedule(db, { now: new Date(PICKUP - hours * 3600000) });
  const alerts = jobs(db, "ASSIGNMENT_REQUIRED");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].id, /:T24$/);
  assert.equal(jobs(db, "PRE_TRIP_REMINDER").length, 1);
});

test("no extra 24-hour alert when automatic assignment already raised one inside the window", () => {
  const db = database();
  db.prepare("INSERT INTO dispatch_settings (supplier_id, automatic_enabled) VALUES ('supplier-1', 1)").run();
  db.prepare("UPDATE supplier_drivers SET status = 'UNAVAILABLE'").run();
  processDispatchSchedule(db, { now: new Date(PICKUP - 20 * 3600000) });
  processDispatchSchedule(db, { now: new Date(PICKUP - 19 * 3600000) });
  const alerts = jobs(db, "ASSIGNMENT_REQUIRED");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].id, /:e0$/);
});

test("an unassigned reminder becomes stale once a driver accepts", async () => {
  const db = database();
  const now = new Date(PICKUP - 10 * 3600000);
  enqueueDispatch(db, booking(db), null, "PRE_TRIP_REMINDER", { now });
  driverAction(db, { assignment: assign(db) }, { action: "ACCEPT" });
  let delivered = [];
  await processDispatchOutbox(db, async (_db, job) => { delivered.push(job.event_type); return { results: [{ success: true, deliveryId: "d" }] }; }, { now });
  assert.equal(jobs(db, "PRE_TRIP_REMINDER")[0].status, "CANCELLED");
  assert.ok(!delivered.includes("PRE_TRIP_REMINDER"));
});

const task = (db) => db.prepare("SELECT * FROM staff_tasks WHERE task_type = 'DRIVER_ASSIGNMENT_REQUIRED' AND status = 'OPEN'").get();

test("escalation ladder defaults to 24, 12 and 6 hours and accepts an override", () => {
  assert.deepEqual(escalationStages(undefined).map((s) => [s.stage, s.priority]), [["T24", "HIGH"], ["T12", "CRITICAL"], ["T6", "CRITICAL"]]);
  assert.match(escalationStages(undefined)[2].reason, /operations to take over/);
  assert.deepEqual(escalationStages("6, 48,x,12").map((s) => s.hours), [48, 12, 6]);
  assert.deepEqual(escalationStages("").map((s) => s.hours), [24, 12, 6]);
});

test("an unconfirmed booking escalates once per stage and its task becomes CRITICAL", () => {
  const db = database();
  for (const hours of [23, 20, 11, 10, 5.5, 5, 1]) processDispatchSchedule(db, { now: new Date(PICKUP - hours * 3600000) });
  assert.deepEqual(jobs(db, "ASSIGNMENT_REQUIRED").map((j) => j.id.split(":").at(-1)), ["T24", "T12", "T6"]);
  assert.equal(task(db).priority, "CRITICAL");
  assert.match(task(db).notes, /operations to take over/);
});

test("a booking first seen inside the 6-hour window gets only the takeover alert", () => {
  const db = database();
  processDispatchSchedule(db, { now: new Date(PICKUP - 4 * 3600000) });
  assert.deepEqual(jobs(db, "ASSIGNMENT_REQUIRED").map((j) => j.id.split(":").at(-1)), ["T6"]);
});

test("a later decline does not lower a CRITICAL task", () => {
  const db = database();
  processDispatchSchedule(db, { now: new Date(PICKUP - 10 * 3600000) });
  assert.equal(task(db).priority, "CRITICAL");
  decline(db, assign(db));
  assert.equal(task(db).priority, "CRITICAL");
  assert.match(task(db).notes, /Driver declined/);
});

test("confirmed by phone accepts a pending driver, closes the task and tells the traveler", () => {
  const db = database();
  const now = new Date(PICKUP - 10 * 3600000);
  processDispatchSchedule(db, { now });
  assign(db);
  assert.throws(() => confirmDriverByPhone(db, { bookingId: "booking-1", supplierId: "supplier-1", actorId: "u1", note: "" }), /Add a note/);
  assert.throws(() => confirmDriverByPhone(db, { bookingId: "booking-1", supplierId: "other-supplier", actorId: "u1", note: "Called Ravi" }), /not found/);
  const confirmed = confirmDriverByPhone(db, { bookingId: "booking-1", supplierId: "supplier-1", actorId: "u1", note: "Called Ravi at 18:05, he accepted" });
  assert.equal(confirmed.acknowledgement, "ACCEPTED");
  assert.equal(task(db), undefined);
  assert.equal(jobs(db, "DRIVER_CONFIRMED").length, 1);
  const event = db.prepare("SELECT * FROM driver_assignment_events WHERE event_type = 'ACCEPT_BY_PHONE'").get();
  assert.equal(event.actor_id, "u1");
  assert.match(event.note, /Confirmed by phone: Called Ravi/);
  assert.equal(confirmDriverByPhone(db, { bookingId: "booking-1", actorId: "u1", note: "again" }).acknowledgement, "ACCEPTED");
  assert.equal(jobs(db, "DRIVER_CONFIRMED").length, 1);
});

test("confirmed by phone works after the response deadline but not after the driver was removed", () => {
  const db = database();
  const assignment = assign(db);
  db.prepare("UPDATE driver_assignments SET response_deadline = '2000-01-01T00:00:00.000Z'").run();
  assert.equal(confirmDriverByPhone(db, { bookingId: "booking-1", actorId: "ops", note: "Driver confirmed on call" }).acknowledgement, "ACCEPTED");

  const other = database();
  decline(other, assign(other));
  assert.throws(() => confirmDriverByPhone(other, { bookingId: "booking-1", actorId: "ops", note: "Driver confirmed on call" }), /no longer (waiting|available)/);
  assert.ok(assignment.id);
});

test("the dispatch queue lists open work by time to pickup with the driver state", () => {
  const db = database();
  db.prepare(`INSERT INTO bookings (id, ref, supplier_id, product_id, product_type, activity_date, pickup_time, pickup_location, vehicle_category, payment_status, supplier_assignment_status, status)
    VALUES ('booking-2', 'IH-EARLY', 'supplier-1', 'lucknow-tour', 'TOUR', '2099-09-10', '06:00', 'Charbagh', 'SEDAN', 'PAID', 'SUPPLIER_ACCEPTED', 'confirmed')`).run();
  const now = new Date(PICKUP - 10 * 3600000);
  processDispatchSchedule(db, { now });
  assign(db);
  const queue = listDispatchExceptions(db, { now });
  assert.deepEqual(queue.map((row) => row.ref), ["IH-EARLY", "IH-ABC"]);
  assert.equal(queue[0].minutes_to_pickup, 420);
  assert.deepEqual(queue.map((row) => row.driver_state), ["NO_DRIVER", "AWAITING_DRIVER"]);
  assert.equal(listDispatchExceptions(db, { supplierId: "someone-else", now }).length, 0);
});

function withAutoDefault(value, work) {
  const saved = process.env.DISPATCH_AUTO_DEFAULT;
  process.env.DISPATCH_AUTO_DEFAULT = value;
  try { return work(); } finally { process.env.DISPATCH_AUTO_DEFAULT = saved; }
}

function addDriver(db, id, name, plate, extra = {}) {
  db.prepare("INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status) VALUES (?, 'supplier-1', ?, ?, 'Swift Dzire Sedan', ?, 'AVAILABLE')")
    .run(id, name, `+9198765${String(Math.floor(Math.random() * 90000) + 10000)}`, plate);
  db.prepare("UPDATE supplier_drivers SET driver_email = ?, seat_capacity = ?, dispatch_priority = ? WHERE id = ?").run(extra.email ?? `${id}@example.test`, extra.seats ?? 4, extra.priority ?? 0, id);
}

function driverEvent(db, driverId, eventType, daysAgo = 1, base = new Date()) {
  const createdAt = new Date(base.getTime() - daysAgo * 86400000).toISOString().slice(0, 19).replace("T", " ");
  db.prepare("INSERT INTO driver_assignment_events (id, assignment_id, booking_id, supplier_id, supplier_driver_id, event_type, created_at) VALUES (?, 'old', 'old-booking', 'supplier-1', ?, ?, ?)")
    .run(`evt-${Math.random()}`, driverId, eventType, createdAt);
}

test("automatic assignment is on by default, can be turned off platform-wide, and a supplier choice wins", () => {
  const db = database();
  assert.equal(withAutoDefault(undefined, () => effectiveDispatchSettings(db, "supplier-1")).automatic_enabled, 1);
  assert.equal(withAutoDefault("false", () => effectiveDispatchSettings(db, "supplier-1")).automatic_enabled, 0);
  assert.equal(withAutoDefault(undefined, () => effectiveDispatchSettings(db, "supplier-1")).source, "DEFAULT");
  db.prepare("INSERT INTO dispatch_settings (supplier_id, automatic_enabled, lead_hours) VALUES ('supplier-1', 0, 72)").run();
  const saved = withAutoDefault("true", () => effectiveDispatchSettings(db, "supplier-1"));
  assert.deepEqual([saved.automatic_enabled, saved.lead_hours, saved.source, saved.response_minutes], [0, 72, "SUPPLIER", 30]);
});

test("readiness names what blocks each driver from automatic assignment", () => {
  const db = database();
  addDriver(db, "driver-2", "Suresh", "UP-32-CD-5678", { email: "", seats: 0 });
  db.prepare("UPDATE supplier_drivers SET status = 'SUSPENDED' WHERE id = 'driver-1'").run();
  const readiness = dispatchReadiness(db, "supplier-1");
  assert.deepEqual([readiness.total, readiness.ready], [2, 0]);
  assert.deepEqual(readiness.drivers.find((d) => d.id === "driver-2").missing, ["driver email", "seat capacity"]);
  assert.deepEqual(readiness.drivers.find((d) => d.id === "driver-1").missing, []);
});

test("ranking prefers reliable, rated, less busy drivers, and the supplier priority comes first", () => {
  const db = database();
  addDriver(db, "driver-2", "Suresh", "UP-32-CD-5678");
  addDriver(db, "driver-3", "Mohan", "UP-32-EF-9012");
  for (let i = 0; i < 4; i++) driverEvent(db, "driver-1", "DECLINE");
  driverEvent(db, "driver-1", "TIMED_OUT");
  for (let i = 0; i < 5; i++) driverEvent(db, "driver-2", "ACCEPT");
  driverEvent(db, "driver-3", "DECLINE", 200); // outside the 90-day window
  db.prepare("INSERT INTO quality_scores (entity_type, entity_id, review_count, smoothed_rating) VALUES ('DRIVER', 'driver-3', 12, 4.9)").run();
  const booking = db.prepare("SELECT * FROM bookings WHERE id = 'booking-1'").get();
  const drivers = db.prepare("SELECT * FROM supplier_drivers").all();
  const now = new Date();
  const ranked = rankDriverCandidates(db, booking, drivers, now);
  assert.deepEqual(ranked.map((d) => d.id), ["driver-2", "driver-3", "driver-1"]);
  assert.deepEqual([ranked[2].score_breakdown.accepted, ranked[2].score_breakdown.refused], [0, 5]);
  assert.equal(ranked[1].score_breakdown.refused, 0);
  assert.equal(ranked[0].score, ranked[0].score_breakdown.reliability + ranked[0].score_breakdown.rating + ranked[0].score_breakdown.availability);

  db.prepare(`INSERT INTO bookings (id, ref, supplier_id, product_id, product_type, activity_date, pickup_time, pickup_location, vehicle_category, payment_status, supplier_assignment_status, status)
    VALUES ('booking-busy', 'IH-BUSY', 'supplier-1', 'lucknow-tour', 'TOUR', '2099-09-10', '20:00', 'Aminabad', 'SEDAN', 'PAID', 'SUPPLIER_ACCEPTED', 'confirmed')`).run();
  for (const [i, ref] of ["b1", "b2"].entries()) {
    db.prepare("INSERT INTO driver_assignments (id, booking_id, supplier_id, supplier_driver_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status) VALUES (?, ?, 'supplier-1', 'driver-2', 'Suresh', '+919800000000', 'Swift', 'UP-32-CD-5678', 'ASSIGNED')").run(`busy-${i}`, ref);
    db.prepare(`INSERT INTO bookings (id, ref, supplier_id, activity_date, status) VALUES (?, ?, 'supplier-1', '2099-09-10', 'driver_assigned')`).run(ref, ref);
  }
  assert.equal(rankDriverCandidates(db, booking, drivers, now).find((d) => d.id === "driver-2").score_breakdown.sameDayTrips, 2);

  db.prepare("UPDATE supplier_drivers SET dispatch_priority = 10 WHERE id = 'driver-1'").run();
  assert.equal(rankDriverCandidates(db, booking, db.prepare("SELECT * FROM supplier_drivers").all(), now)[0].id, "driver-1");
});

test("automatic assignment picks the best driver, records why, and tells the supplier", async () => {
  const db = database();
  addDriver(db, "driver-2", "Suresh", "UP-32-CD-5678");
  const now = new Date(PICKUP - 30 * 3600000);
  for (let i = 0; i < 3; i++) driverEvent(db, "driver-1", "DECLINE", 1, now);
  const result = withAutoDefault(undefined, () => processDispatchSchedule(db, { now }));
  assert.equal(result.assigned, 1);
  const assignment = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = 'booking-1'").get();
  assert.deepEqual([assignment.supplier_driver_id, assignment.assignment_source, assignment.acknowledgement], ["driver-2", "AUTOMATIC", "PENDING"]);
  const details = JSON.parse(db.prepare("SELECT details FROM driver_assignment_events WHERE booking_id = 'booking-1' AND event_type = 'ASSIGNED'").get().details);
  assert.equal(details.automatic, true);
  assert.equal(details.candidates, 2);
  assert.ok(details.score > 0 && details.scoreBreakdown.reliability > 0);
  assert.equal(jobs(db, "DRIVER_AUTO_ASSIGNED").length, 1);
  assert.equal(jobs(db, "DRIVER_REQUEST").length, 1);

  driverAction(db, { assignment }, { action: "ACCEPT" }, now);
  assert.equal(db.prepare("SELECT outcome FROM dispatch_attempts WHERE supplier_driver_id = 'driver-2'").get().outcome, "ACCEPTED");
  const delivered = [];
  await processDispatchOutbox(db, async (_db, job) => { delivered.push(job.event_type); return { results: [{ success: true }] }; }, { now });
  assert.ok(!delivered.includes("DRIVER_AUTO_ASSIGNED"), "a notice about a driver who already accepted is dropped");
  assert.equal(db.prepare("SELECT supplier_driver_id FROM driver_assignment_events WHERE event_type = 'ACCEPT'").get().supplier_driver_id, "driver-2");
});

test("a supplier that switched automatic assignment off gets no automatic driver", () => {
  const db = database();
  db.prepare("INSERT INTO dispatch_settings (supplier_id, automatic_enabled) VALUES ('supplier-1', 0)").run();
  const result = withAutoDefault(undefined, () => processDispatchSchedule(db, { now: new Date(PICKUP - 30 * 3600000) }));
  assert.equal(result.assigned, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_assignments").get().n, 0);
});

test("a timed-out driver is recorded against their reliability and the next driver is requested", () => {
  const db = database();
  addDriver(db, "driver-2", "Suresh", "UP-32-CD-5678");
  const first = new Date(PICKUP - 30 * 3600000);
  withAutoDefault(undefined, () => processDispatchSchedule(db, { now: first }));
  const firstDriver = db.prepare("SELECT supplier_driver_id FROM driver_assignments").get().supplier_driver_id;
  withAutoDefault(undefined, () => processDispatchSchedule(db, { now: new Date(first.getTime() + 31 * 60000) }));
  const timedOut = db.prepare("SELECT * FROM driver_assignment_events WHERE event_type = 'TIMED_OUT'").get();
  assert.equal(timedOut.supplier_driver_id, firstDriver);
  const next = db.prepare("SELECT * FROM driver_assignments").get();
  assert.notEqual(next.supplier_driver_id, firstDriver);
  assert.equal(next.acknowledgement, "PENDING");
  assert.equal(db.prepare("SELECT outcome FROM dispatch_attempts WHERE supplier_driver_id = ?").get(firstDriver).outcome, "TIMED_OUT");
});

test("a shared departure without enough seats is not split onto another driver", () => {
  const db = database();
  db.prepare("UPDATE products SET group_type = 'SHARED' WHERE id = 'lucknow-tour'").run();
  db.prepare("UPDATE bookings SET product_option_id = 'morning' WHERE id = 'booking-1'").run();
  db.prepare(`INSERT INTO bookings (id, ref, supplier_id, product_id, product_option_id, product_type, activity_date, pickup_time, pickup_location, vehicle_category, payment_status, supplier_assignment_status, status, adults)
    VALUES ('booking-2', 'IH-SHARED', 'supplier-1', 'lucknow-tour', 'morning', 'TOUR', '2099-09-10', '09:00', 'Hazratganj, Lucknow', 'SEDAN', 'PAID', 'SUPPLIER_ACCEPTED', 'confirmed', 3)`).run();
  addDriver(db, "driver-2", "Suresh", "UP-32-CD-5678", { seats: 7 });
  db.prepare("UPDATE supplier_drivers SET dispatch_priority = 50 WHERE id = 'driver-1'").run();
  withAutoDefault(undefined, () => processDispatchSchedule(db, { now: new Date(PICKUP - 30 * 3600000) }));
  const rows = db.prepare("SELECT booking_id, supplier_driver_id FROM driver_assignments ORDER BY booking_id").all();
  assert.deepEqual(rows, [{ booking_id: "booking-1", supplier_driver_id: "driver-1" }]);
  assert.match(db.prepare("SELECT notes FROM staff_tasks WHERE booking_id = 'booking-2'").get().notes, /No eligible driver/);
});

const HOUR = 3600000;
const acceptedTrip = (db) => driverAction(db, { assignment: assign(db) }, { action: "ACCEPT" });
const tripTaskOf = (db, type) => db.prepare("SELECT * FROM staff_tasks WHERE task_type = ? AND status = 'OPEN'").get(type);

test("a driver who has not answered gets one reminder at half the response window", () => {
  const db = database();
  const assignment = assign(db);
  const deadline = Date.parse(assignment.response_deadline);
  processDispatchSchedule(db, { now: new Date(deadline - 20 * 60000) });
  assert.equal(jobs(db, "DRIVER_REQUEST_REMINDER").length, 0);
  processDispatchSchedule(db, { now: new Date(deadline - 14 * 60000) });
  processDispatchSchedule(db, { now: new Date(deadline - 5 * 60000) });
  assert.equal(jobs(db, "DRIVER_REQUEST_REMINDER").length, 1);
});

test("operations can start a trip without the pickup OTP and complete it, with the reason on record", () => {
  const db = database();
  acceptedTrip(db);
  assert.throws(() => operationsTripOverride(db, { bookingId: "IH-ABC", action: "START", actorId: "ops", note: "" }), /reason is required/);
  assert.throws(() => operationsTripOverride(db, { bookingId: "IH-ABC", action: "COMPLETE", actorId: "ops", note: "Traveler called" }), /Only a started trip/);
  db.prepare("INSERT INTO payouts VALUES ('booking-1', 'PAYMENT_HELD')").run();
  assert.equal(operationsTripOverride(db, { bookingId: "IH-ABC", action: "START", actorId: "ops", note: "Traveler phone dead; ID checked by driver" }).assignment_status, "TRIP_STARTED");
  assert.equal(booking(db).status, "in_progress");
  assert.throws(() => operationsTripOverride(db, { bookingId: "IH-ABC", action: "START", actorId: "ops", note: "again" }), /cannot be started/);
  assert.equal(operationsTripOverride(db, { bookingId: "IH-ABC", action: "COMPLETE", actorId: "ops", note: "Traveler confirmed drop at hotel" }).assignment_status, "COMPLETED");
  assert.equal(booking(db).status, "completed");
  assert.equal(db.prepare("SELECT payout_status FROM payouts").get().payout_status, "SCHEDULED");
  const notes = db.prepare("SELECT note, actor_id FROM driver_assignment_events WHERE event_type = 'STATUS_CHANGED' ORDER BY rowid").all();
  assert.match(notes[0].note, /^Started without pickup OTP by operations: Traveler phone dead/);
  assert.match(notes[1].note, /^Completed by operations: Traveler confirmed drop/);
  assert.deepEqual(notes.map((n) => n.actor_id), ["ops", "ops"]);
});

test("operations cannot start a trip the driver has not accepted", () => {
  const db = database();
  assign(db);
  assert.throws(() => operationsTripOverride(db, { bookingId: "booking-1", action: "START", actorId: "ops", note: "Driver on site" }), /accept/);
});

test("a started trip left open escalates to driver and supplier, then operations, and completion clears it", async () => {
  const db = database();
  acceptedTrip(db);
  operationsTripOverride(db, { bookingId: "booking-1", action: "START", actorId: "ops", note: "Phone dead" });
  const end = PICKUP + 8 * HOUR; // 8-hour tour
  processTripWatch(db, { now: new Date(end + 1 * HOUR) });
  assert.equal(tripTaskOf(db, "TRIP_COMPLETION_OVERDUE"), undefined);
  processTripWatch(db, { now: new Date(end + 2.5 * HOUR) });
  processTripWatch(db, { now: new Date(end + 3 * HOUR) });
  assert.equal(tripTaskOf(db, "TRIP_COMPLETION_OVERDUE").priority, "HIGH");
  assert.equal(jobs(db, "TRIP_OVERDUE").length, 1);
  processTripWatch(db, { now: new Date(end + 6.5 * HOUR) });
  assert.equal(tripTaskOf(db, "TRIP_COMPLETION_OVERDUE").priority, "CRITICAL");
  assert.equal(jobs(db, "TRIP_OVERDUE_OPS").length, 1);
  const pendingOps = jobs(db, "TRIP_OVERDUE_OPS")[0];
  operationsTripOverride(db, { bookingId: "booking-1", action: "COMPLETE", actorId: "ops", note: "Driver forgot to press complete" });
  assert.equal(tripTaskOf(db, "TRIP_COMPLETION_OVERDUE"), undefined);
  await processDispatchOutbox(db, async () => ({ results: [{ success: true }] }), { now: new Date(end + 7 * HOUR) });
  assert.equal(db.prepare("SELECT status FROM dispatch_outbox WHERE id = ?").get(pendingOps.id).status, "CANCELLED");
});

test("an accepted trip not started an hour after pickup alerts operations until it starts", () => {
  const db = database();
  acceptedTrip(db);
  processTripWatch(db, { now: new Date(PICKUP + 30 * 60000) });
  assert.equal(tripTaskOf(db, "PICKUP_NOT_STARTED"), undefined);
  const result = processTripWatch(db, { now: new Date(PICKUP + 70 * 60000) });
  assert.equal(result.alerts, 1);
  processTripWatch(db, { now: new Date(PICKUP + 90 * 60000) });
  assert.equal(jobs(db, "PICKUP_NOT_STARTED").length, 1);
  assert.equal(tripTaskOf(db, "PICKUP_NOT_STARTED").priority, "CRITICAL");
  operationsTripOverride(db, { bookingId: "booking-1", action: "START", actorId: "ops", note: "Traveler found at gate 2" });
  assert.equal(tripTaskOf(db, "PICKUP_NOT_STARTED"), undefined);
});

test("the dispatch queue lists trip problems separately from driver assignment", () => {
  const db = database();
  acceptedTrip(db);
  processTripWatch(db, { now: new Date(PICKUP + 70 * 60000) });
  assert.equal(listDispatchExceptions(db, { now: new Date(PICKUP + 70 * 60000) }).length, 0);
  const issues = listDispatchExceptions(db, { now: new Date(PICKUP + 70 * 60000), taskTypes: ["PICKUP_NOT_STARTED", "TRIP_COMPLETION_OVERDUE"] });
  assert.deepEqual(issues.map((i) => [i.task_type, i.minutes_to_pickup]), [["PICKUP_NOT_STARTED", -70]]);
});

test("a driver must share live location before going on the way, arriving or starting the trip", () => {
  const db = database();
  const assignment = acceptedTrip(db);
  const context = { assignment: db.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignment.id) };
  assert.throws(() => driverAction(db, context, { action: "EN_ROUTE" }), (err) => err.code === "LOCATION_SHARING_REQUIRED");
  assert.equal(db.prepare("SELECT assignment_status FROM driver_assignments WHERE id = ?").get(assignment.id).assignment_status, "ASSIGNED");

  recordDriverLocations(db, context, [{ lat: 26.8467, lng: 80.9462, accuracy: 18 }]);
  assert.equal(driverAction(db, context, { action: "EN_ROUTE" }).assignment_status, "EN_ROUTE");

  // Sharing stopped long ago: arriving is refused until the phone reports again.
  db.prepare("UPDATE driver_assignments SET last_location_at = ? WHERE id = ?").run(new Date(Date.now() - 10 * 60_000).toISOString(), assignment.id);
  assert.throws(() => driverAction(db, context, { action: "ARRIVED" }), (err) => err.code === "LOCATION_SHARING_REQUIRED");
  assert.throws(() => driverAction(db, context, { action: "START", otp: "1234" }), (err) => err.code === "LOCATION_SHARING_REQUIRED", "checked before the OTP, so no attempt is used");
});

test("from 30 minutes before pickup, a driver who may miss it opens one task and alert per reason until they arrive", () => {
  const db = database();
  const assignment = acceptedTrip(db);
  processTripWatch(db, { now: new Date(PICKUP - 45 * 60000) });
  assert.equal(tripTaskOf(db, "DRIVER_LOCATION_RISK"), undefined, "nothing is checked earlier than 30 minutes before pickup");

  processTripWatch(db, { now: new Date(PICKUP - 25 * 60000) });
  processTripWatch(db, { now: new Date(PICKUP - 20 * 60000) });
  assert.match(tripTaskOf(db, "DRIVER_LOCATION_RISK").notes, /has not started/);
  assert.equal(jobs(db, "DRIVER_LOCATION_RISK").length, 1, "the same reason alerts once");

  // On the way, but the phone stopped sharing: a new reason, a new alert.
  const context = { assignment: db.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignment.id) };
  recordDriverLocations(db, context, [{ lat: 26.8467, lng: 80.9462 }]);
  driverAction(db, context, { action: "EN_ROUTE" });
  db.prepare("UPDATE driver_assignments SET last_location_at = ? WHERE id = ?").run(new Date(PICKUP - 30 * 60000).toISOString(), assignment.id);
  processTripWatch(db, { now: new Date(PICKUP - 15 * 60000) });
  assert.match(tripTaskOf(db, "DRIVER_LOCATION_RISK").notes, /live location stopped/);
  assert.equal(jobs(db, "DRIVER_LOCATION_RISK").length, 2);

  // Reaching pickup settles it.
  db.prepare("UPDATE driver_assignments SET last_location_source = 'DRIVER', last_location_at = ? WHERE id = ?").run(new Date().toISOString(), assignment.id);
  driverAction(db, context, { action: "ARRIVED" });
  assert.equal(tripTaskOf(db, "DRIVER_LOCATION_RISK"), undefined);
});
