import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { assignDriverToBooking } from "../src/services/driverDispatchService.js";
import { enqueueDispatch } from "../src/services/dispatchStateService.js";
import { driverAction, processDispatchOutbox, processDispatchSchedule } from "../src/services/dispatchWorkflowService.js";
import {
  DISPATCH_WHATSAPP_TEMPLATES,
  buildDispatchMessages,
  deliverDispatchNotification,
  formatPickup,
  pickupDayWord,
} from "../src/services/dispatchNotificationService.js";
import { templateParameterText, whatsAppTemplate } from "../src/services/whatsappService.js";

process.env.JWT_SECRET ||= "dispatch-notification-test-secret";
for (const spec of Object.values(DISPATCH_WHATSAPP_TEMPLATES)) process.env[spec.env] = `ih_${spec.env.toLowerCase()}`;

// These suites exercise manual dispatch; automatic assignment is covered explicitly.
process.env.DISPATCH_AUTO_DEFAULT = "false";

// 2099-09-10 09:00 IST
const PICKUP = Date.UTC(2099, 8, 10, 9, 0) - 330 * 60000;
const HOUR = 3600000;

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, email TEXT, phone TEXT, contact_name TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, role TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, duration_hours REAL, group_type TEXT);
    CREATE TABLE transfer_routes (product_id TEXT, duration_mins INTEGER);
    CREATE TABLE package_itineraries (product_id TEXT, total_days INTEGER);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, supplier_id TEXT, product_id TEXT, product_option_id TEXT, product_type TEXT,
      activity_date TEXT, pickup_time TEXT, pickup_location TEXT, drop_location TEXT, vehicle_category TEXT,
      payment_status TEXT, supplier_assignment_status TEXT, status TEXT, adults INTEGER DEFAULT 2, children INTEGER DEFAULT 1,
      traveler_name TEXT, traveler_email TEXT, traveler_phone TEXT
    );
    CREATE TABLE supplier_drivers (id TEXT PRIMARY KEY, supplier_id TEXT, driver_name TEXT, driver_phone TEXT, vehicle_model TEXT, vehicle_number TEXT, status TEXT);
    CREATE TABLE driver_assignments (
      id TEXT PRIMARY KEY, booking_id TEXT UNIQUE, supplier_id TEXT, supplier_driver_id TEXT,
      driver_name TEXT, driver_phone TEXT, vehicle_model TEXT, vehicle_number TEXT,
      assignment_status TEXT, assignment_source TEXT, assigned_by TEXT, notes TEXT,
      assigned_at TEXT DEFAULT (datetime('now')), last_status_at TEXT, en_route_at TEXT,
      arrived_at TEXT, trip_started_at TEXT, completed_at TEXT
    );
    CREATE TABLE driver_assignment_events (
      id TEXT PRIMARY KEY, assignment_id TEXT, booking_id TEXT, supplier_id TEXT, supplier_driver_id TEXT, event_type TEXT,
      previous_status TEXT, new_status TEXT, note TEXT, actor_id TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, product_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE payouts (booking_id TEXT, payout_status TEXT);
    CREATE TABLE quality_scores (entity_type TEXT, entity_id TEXT, review_count INTEGER, smoothed_rating REAL, PRIMARY KEY (entity_type, entity_id));
  `);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/026_driver_dispatch_workflow.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/031_staff_task_supplier.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.prepare("INSERT INTO suppliers VALUES ('supplier-1', 'ops@lucknowcabs.test', '+919000000001', 'Amit')").run();
  db.prepare("INSERT INTO users VALUES ('staff-1', 'Neha', 'neha@ideaholiday.test', '+919000000002', 'STAFF')").run();
  db.prepare("INSERT INTO products VALUES ('lucknow-tour', 'Lucknow City Tour with Zoo', 8, 'PRIVATE')").run();
  db.prepare("INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status) VALUES ('driver-1', 'supplier-1', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'UP-32-AB-1234', 'AVAILABLE')").run();
  db.prepare("UPDATE supplier_drivers SET driver_email = 'ravi@example.test', seat_capacity = 4").run();
  db.prepare(`INSERT INTO bookings (id, ref, user_id, supplier_id, product_id, product_type, activity_date, pickup_time, pickup_location, vehicle_category, payment_status, supplier_assignment_status, status, traveler_name, traveler_email, traveler_phone)
    VALUES ('booking-1', 'IH-ABC', 'user-abc', 'supplier-1', 'lucknow-tour', 'TOUR', '2099-09-10', '09:00', 'Hotel Clarks Awadh,\nHazratganj', 'SEDAN', 'PAID', 'SUPPLIER_ACCEPTED', 'confirmed', 'ABC', 'abc@example.test', '+919811111111')`).run();
  return db;
}

const assign = (db, now = new Date()) => assignDriverToBooking(db, { supplierId: "supplier-1", bookingId: "booking-1", supplierDriverId: "driver-1", actorId: "supplier-user", now });
const accept = (db, now = new Date()) => driverAction(db, { assignment: assign(db, now) }, { action: "ACCEPT" }, now);
const job = (db, eventType, payload = {}) => ({ id: `job-${eventType}`, booking_id: "booking-1", event_type: eventType, revision: "r", payload: JSON.stringify(payload) });
const roles = (messages) => messages.map((m) => m.recipient.role);
const templateKey = (message) => Object.keys(DISPATCH_WHATSAPP_TEMPLATES).find((k) => `ih_${DISPATCH_WHATSAPP_TEMPLATES[k].env.toLowerCase()}` === message.template?.name);
const jobs = (db, eventType) => db.prepare("SELECT * FROM dispatch_outbox WHERE event_type = ?").all(eventType);

test("every dispatch template body matches its variable list and Meta's placement rules", () => {
  for (const [key, spec] of Object.entries(DISPATCH_WHATSAPP_TEMPLATES)) {
    const numbers = [...spec.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    assert.deepEqual(numbers, spec.params.map((_, i) => i + 1), `${key} variables must be {{1}}..{{n}} in order`);
    assert.doesNotMatch(spec.body, /^\s*\{\{|\}\}\s*$/, `${key} cannot start or end with a variable`);
    assert.doesNotMatch(spec.body, /\}\}\s*\{\{/, `${key} cannot have adjacent variables`);
    assert.match(spec.env, /^WHATSAPP_TEMPLATE_DISPATCH_/);
    assert.match(spec.name, spec.reused ? /^idea_holiday_[a-z_]+$/ : /^idea_holiday_dispatch_[a-z_]+$/);
    assert.equal(spec.example.length, spec.params.length, `${key} needs one example per variable`);
    assert.ok(spec.example.every((value) => value && templateParameterText(value) === value), `${key} examples must be single-line`);
  }
});

test("template values are flattened to a single line Meta accepts", () => {
  assert.equal(templateParameterText("Hotel Clarks Awadh,\nHazratganj\t Lucknow"), "Hotel Clarks Awadh, · Hazratganj · Lucknow");
  assert.equal(templateParameterText("a      b"), "a    b");
  assert.equal(templateParameterText(""), "-");
  assert.equal(templateParameterText(null), "-");
  const params = whatsAppTemplate("t", ["x\ny"]).components[0].parameters;
  assert.equal(params[0].text, "x · y");
});

test("formats pickup times and day words in India time", () => {
  assert.equal(formatPickup({ activity_date: "2099-09-10", pickup_time: "09:00" }), "Thu 10 Sep 2099, 09:00 IST");
  const booking = { activity_date: "2099-09-10" };
  assert.equal(pickupDayWord(booking, new Date(PICKUP - 5 * HOUR)), "today");
  assert.equal(pickupDayWord(booking, new Date(PICKUP - 20 * HOUR)), "tomorrow");
  assert.equal(pickupDayWord(booking, new Date(PICKUP - 60 * HOUR)), "on 2099-09-10");
});

test("driver request goes only to the driver with an accept link and no traveler phone", () => {
  const db = database();
  assign(db);
  const [message, ...rest] = buildDispatchMessages(db, job(db, "DRIVER_REQUEST"));
  assert.equal(rest.length, 0);
  assert.equal(message.recipient.role, "DRIVER");
  assert.equal(templateKey(message), "DRIVER_REQUEST");
  assert.equal(message.template.components[0].parameters.length, DISPATCH_WHATSAPP_TEMPLATES.DRIVER_REQUEST.params.length);
  assert.match(message.template.components[0].parameters[7].text, /\/driver\/trip#/);
  assert.doesNotMatch(message.text, /\+919811111111/);
  assert.match(message.html, /Accept or decline/);
});

test("driver confirmation tells the traveler, the driver and the supplier", () => {
  const db = database();
  accept(db);
  const messages = buildDispatchMessages(db, job(db, "DRIVER_CONFIRMED"));
  assert.deepEqual(roles(messages), ["TRAVELER", "DRIVER", "SUPPLIER"]);
  assert.deepEqual(messages.map(templateKey), ["TRAVELER_DRIVER", "DRIVER_TRIP", "TRIP_STATUS"]);
  const travelerParams = messages[0].template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(travelerParams.slice(1, 5), ["Ravi Kumar", "+919876543210", "Swift Dzire Sedan", "UP-32-AB-1234"]);
  assert.match(travelerParams[7], /^https?:\/\//);
  const driverParams = messages[1].template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(driverParams.slice(0, 3), ["IH-ABC", "ABC", "+919811111111"]);
  assert.equal(driverParams[6], "UP-32-AB-1234");
  assert.equal(travelerParams[0], "IH-ABC");
  assert.ok(travelerParams.every((text) => !/[\n\t]/.test(text)));
  assert.match(messages[1].text, /Traveler phone: \+919811111111/);
});

test("24-hour reminder: driver details when confirmed, pending notice otherwise", () => {
  const pending = database();
  const pendingMessages = buildDispatchMessages(pending, job(pending, "PRE_TRIP_REMINDER"), { now: new Date(PICKUP - 20 * HOUR) });
  assert.deepEqual(roles(pendingMessages), ["TRAVELER"]);
  assert.equal(templateKey(pendingMessages[0]), "TRAVELER_PENDING");
  assert.equal(pendingMessages[0].subject, "Trip Reminder: Your Lucknow City Tour with Zoo is tomorrow (IH-ABC)");

  const confirmed = database();
  accept(confirmed);
  const messages = buildDispatchMessages(confirmed, job(confirmed, "PRE_TRIP_REMINDER"), { now: new Date(PICKUP - 20 * HOUR) });
  assert.deepEqual(roles(messages), ["TRAVELER", "DRIVER"]);
  assert.deepEqual(messages.map(templateKey), ["TRAVELER_DRIVER", "DRIVER_TRIP"]);
  assert.match(messages[0].text, /Your trip is tomorrow for Lucknow City Tour with Zoo/);
  assert.equal(messages[0].template.components[0].parameters.length, DISPATCH_WHATSAPP_TEMPLATES.TRAVELER_DRIVER.params.length);
});

test("trip progress is sent to the traveler, and to the supplier only for start and completion", () => {
  const db = database();
  accept(db);
  assert.deepEqual(roles(buildDispatchMessages(db, job(db, "DISPATCH_EN_ROUTE"))), ["TRAVELER"]);
  assert.deepEqual(roles(buildDispatchMessages(db, job(db, "DISPATCH_ARRIVED"))), ["TRAVELER"]);
  assert.deepEqual(roles(buildDispatchMessages(db, job(db, "DISPATCH_TRIP_STARTED"))), ["TRAVELER", "SUPPLIER"]);
  const completed = buildDispatchMessages(db, job(db, "DISPATCH_COMPLETED"));
  assert.deepEqual(roles(completed), ["TRAVELER", "SUPPLIER"]);
  assert.ok(completed.every((m) => templateKey(m) === "TRIP_STATUS"));
});

test("manual assignment alerts reach the supplier and operations with their own dashboard links", () => {
  const db = database();
  const messages = buildDispatchMessages(db, job(db, "ASSIGNMENT_REQUIRED", { reason: "Driver declined; replacement required" }));
  assert.deepEqual(roles(messages), ["SUPPLIER", "STAFF"]);
  assert.match(messages[0].template.components[0].parameters[5].text, /\/supplier\/bookings$/);
  assert.match(messages[1].template.components[0].parameters[5].text, /\/ops\/tasks$/);
  assert.equal(messages[0].template.components[0].parameters[4].text, "Driver declined; replacement required");
});

test("a removed driver is told using the details captured at removal", () => {
  const db = database();
  const messages = buildDispatchMessages(db, job(db, "DRIVER_REMOVED", { driver_name: "Old Driver", driver_phone: "+919822222222", driver_email: "old@example.test", reason: "Booking cancelled" }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].recipient.phone, "+919822222222");
  assert.equal(templateKey(messages[0]), "DRIVER_CANCELLED");
});

test("email HTML escapes booking content", () => {
  const db = database();
  db.prepare("UPDATE bookings SET traveler_name = '<script>x</script>' WHERE id = 'booking-1'").run();
  const [message] = buildDispatchMessages(db, job(db, "PRE_TRIP_REMINDER"), { now: new Date(PICKUP - 20 * HOUR) });
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
});

test("delivery sends HTML email, text fallback and template together, once per recipient", async () => {
  const db = database();
  accept(db);
  const sent = [];
  await deliverDispatchNotification(db, job(db, "DRIVER_CONFIRMED"), { send: async (args) => { sent.push(args); return [{ success: true }]; } });
  assert.equal(sent.length, 3);
  for (const args of sent) {
    assert.ok(args.emailHtml.startsWith("<div"));
    assert.ok(args.emailText.includes("IH-ABC"));
    assert.ok(args.whatsappTemplate?.name);
    assert.equal(args.eventKeyPrefix, `job-DRIVER_CONFIRMED:${args.recipient.role}`);
  }
});

test("a missing template falls back to free text instead of failing", () => {
  const db = database();
  const saved = process.env.WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING;
  delete process.env.WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING;
  try {
    const [message] = buildDispatchMessages(db, job(db, "PRE_TRIP_REMINDER"), { now: new Date(PICKUP - 20 * HOUR) });
    assert.equal(message.template, undefined);
    assert.match(message.text, /driver confirmation is still pending/);
  } finally {
    process.env.WHATSAPP_TEMPLATE_DISPATCH_TRAVELER_PENDING = saved;
  }
});

test("no duplicate 24-hour reminder when the driver confirmed inside the window", () => {
  const db = database();
  accept(db, new Date(PICKUP - 20 * HOUR));
  processDispatchSchedule(db, { now: new Date(PICKUP - 19 * HOUR) });
  assert.equal(jobs(db, "PRE_TRIP_REMINDER").length, 0);
  assert.equal(jobs(db, "DRIVER_CONFIRMED").length, 1);
});

test("a driver confirmed days ahead gets one 24-hour and one 2-hour reminder", () => {
  const db = database();
  accept(db, new Date(PICKUP - 72 * HOUR));
  for (const hours of [30, 23, 20, 1.9, 1.5]) processDispatchSchedule(db, { now: new Date(PICKUP - hours * HOUR) });
  assert.equal(jobs(db, "PRE_TRIP_REMINDER").length, 1);
  assert.equal(jobs(db, "DRIVER_PICKUP_REMINDER").length, 1);
});

test("the 2-hour reminder is skipped once the driver is on the way", async () => {
  const db = database();
  accept(db, new Date(PICKUP - 72 * HOUR));
  db.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE'").run();
  processDispatchSchedule(db, { now: new Date(PICKUP - 1.5 * HOUR) });
  assert.equal(jobs(db, "DRIVER_PICKUP_REMINDER").length, 0);
  const now = new Date(PICKUP - 1.5 * HOUR);
  enqueueDispatch(db, db.prepare("SELECT * FROM bookings").get(), db.prepare("SELECT * FROM driver_assignments").get(), "DRIVER_PICKUP_REMINDER", { now });
  const delivered = [];
  await processDispatchOutbox(db, async (_db, j) => { delivered.push(j.event_type); return { results: [{ success: true }] }; }, { now });
  assert.equal(jobs(db, "DRIVER_PICKUP_REMINDER")[0].status, "CANCELLED");
  assert.ok(!delivered.includes("DRIVER_PICKUP_REMINDER"));
});

test("an automatic assignment notice goes only to the supplier with the driver and deadline", () => {
  const db = database();
  assign(db);
  const messages = buildDispatchMessages(db, job(db, "DRIVER_AUTO_ASSIGNED"));
  assert.deepEqual(roles(messages), ["SUPPLIER"]);
  assert.equal(templateKey(messages[0]), "TRIP_STATUS");
  const params = messages[0].template.components[0].parameters.map((p) => p.text);
  assert.equal(params[2], "Driver auto-assigned");
  assert.match(params[3], /^Ravi Kumar \(Swift Dzire Sedan, UP-32-AB-1234\) was sent the trip request and must accept by \d+ \w{3}, \d{2}:\d{2} IST$/);
});

test("stuck-trip alerts reach the right people through the approved status template", () => {
  const db = database();
  accept(db);
  const overdue = buildDispatchMessages(db, job(db, "TRIP_OVERDUE", { reason: "Trip still open 2 hours after its expected end: driver to mark it complete" }));
  assert.deepEqual(roles(overdue), ["DRIVER", "SUPPLIER"]);
  assert.ok(overdue.every((m) => templateKey(m) === "TRIP_STATUS"));
  assert.match(overdue[0].template.components[0].parameters[3].text, /\/driver\/trip#/);
  assert.deepEqual(roles(buildDispatchMessages(db, job(db, "TRIP_OVERDUE_OPS", { reason: "x" }))), ["SUPPLIER", "STAFF"]);
  const notStarted = buildDispatchMessages(db, job(db, "PICKUP_NOT_STARTED", { reason: "Pickup not started 60 minutes after pickup time" }));
  assert.deepEqual(roles(notStarted), ["SUPPLIER", "STAFF"]);
  assert.match(notStarted[1].template.components[0].parameters[3].text, /Driver Ravi Kumar \(\+919876543210\)/);
});

test("the driver reminder reuses the approved request template, and completion invites a rating and a problem report", () => {
  const db = database();
  assign(db);
  const [reminder, ...rest] = buildDispatchMessages(db, job(db, "DRIVER_REQUEST_REMINDER"));
  assert.equal(rest.length, 0);
  assert.equal(templateKey(reminder), "DRIVER_REQUEST");
  assert.match(reminder.subject, /^Reminder: accept or decline trip IH-ABC before/);
  const other = database();
  accept(other);
  const [traveler] = buildDispatchMessages(other, job(other, "DISPATCH_COMPLETED"));
  assert.match(traveler.template.components[0].parameters[3].text, /Rate your trip: https?:\/\/\S+\/(review\/\S+|my-reviews\?bookingRef=IH-ABC) /);
  assert.match(traveler.template.components[0].parameters[3].text, /\/bookings\?report=IH-ABC$/);
  assert.match(traveler.html, /Rate your trip/);
  assert.match(traveler.html, /Report it before the operator is paid/);
});

test("the traveler gets a live tracking link, and a driver at risk of missing pickup alerts the supplier and operations", () => {
  const db = database();
  accept(db);
  const [onTheWay] = buildDispatchMessages(db, job(db, "DISPATCH_EN_ROUTE"));
  assert.match(onTheWay.template.components[0].parameters[3].text, /Track live: https?:\/\/.+\/track\/IH-ABC#.+/);
  assert.match(onTheWay.html, /Track your driver live/);

  const late = buildDispatchMessages(db, job(db, "DRIVER_LOCATION_RISK", { reason: "Driver is about 12.0 km away and may be 18 min late for the 09:00 IST pickup" }));
  assert.deepEqual(roles(late), ["SUPPLIER", "STAFF"]);
  assert.ok(late.every((m) => templateKey(m) === "TRIP_STATUS"));
  assert.match(late[1].template.components[0].parameters[3].text, /Driver Ravi Kumar \(\+919876543210\)/);
  const lost = buildDispatchMessages(db, job(db, "DRIVER_LOCATION_RISK", { reason: "Driver's live location stopped 7 min ago while on the way" }));
  assert.deepEqual(roles(lost), ["SUPPLIER", "STAFF", "DRIVER"], "the driver is asked to reopen the trip page");
});
