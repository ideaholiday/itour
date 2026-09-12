import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { processReservationOutbox } from "../src/services/reservationOutboxService.js";
import { calculateRefundQuote } from "../src/services/financeService.js";
import { moveNativeReservation, checkNativeInventory, saveInventoryRules, listNativeAvailability, reserveNativeInventory, attachNativeReservation, confirmNativeReservation, releaseNativeReservation } from "../src/services/nativeInventoryService.js";

const rules = { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "14:00"], capacity: 3, adultPrice: 1000, childPrice: 400, cutoffMinutes: 120, cancellationHours: 24, blackoutDates: [] };
const future = "2099-05-12";
function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY); INSERT INTO products VALUES ('p');
    CREATE TABLE product_options (id TEXT PRIMARY KEY, product_id TEXT, name TEXT DEFAULT 'Standard', is_active INTEGER DEFAULT 1, confirmation_type TEXT, available_start_times TEXT, capacity INTEGER); INSERT INTO product_options(id, product_id) VALUES ('o', 'p');
    CREATE TABLE bookings (id TEXT PRIMARY KEY, product_id TEXT, status TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY);
    CREATE TABLE booking_holds (booking_id TEXT, status TEXT);`);
  db.exec(readFileSync(new URL("../migrations/017_native_reservations.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.exec(readFileSync(new URL("../migrations/018_native_reservation_delivery.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.exec(readFileSync(new URL("../migrations/019_native_hold_pricing.sql", import.meta.url), "utf8").split("-- @down")[0]);
  saveInventoryRules(db, "p", "o", rules);
  return db;
}
function reserve(db, extra = {}) { return reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 2, children: 1, ownerId: "u", requestKey: "r", ...extra }); }
function booking(db, id = "b") { db.prepare("INSERT INTO bookings VALUES (?, 'p', 'pending_payment')").run(id); return { id, product_id: "p", product_option_id: "o", activity_date: future, pickup_time: "09:00", adults: 2, children: 1 }; }

test("holds count every child and adult, last exactly ten minutes and isolate departures", t => {
  const db = fixture(t); const before = Date.now(); const hold = reserve(db);
  assert.ok(Date.parse(hold.utc_expires_at) - before >= 600000);
  assert.ok(Date.parse(hold.utc_expires_at) - before < 601000);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 0);
  assert.equal(listNativeAvailability(db, "p", "o", future)[1].vacancies, 3);
  assert.throws(() => reserve(db, { ownerId: "other", requestKey: "other" }), /enough seats/);
  const replay = reserve(db); assert.equal(replay.id, hold.id); assert.equal(replay.utc_expires_at, hold.utc_expires_at);
  assert.throws(() => reserve(db, { adults: 1 }), /different details/);
});
test("inactive options reject new holds while preserving an existing checkout", t => {
  const db = fixture(t);
  const hold = reserve(db);
  db.prepare("UPDATE product_options SET is_active = 0 WHERE id = 'o'").run();
  assert.equal(reserve(db).id, hold.id);
  assert.throws(() => reserve(db, { localTime: "14:00", requestKey: "inactive" }), error => error.code === "OPTION_NOT_AVAILABLE");
});
test("expiry releases capacity immediately without waiting for the worker and prevents late confirmation", t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db); attachNativeReservation(db, hold.id, b, "u");
  db.prepare("UPDATE native_reservations SET utc_expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 3);
  reserve(db, { ownerId: "other", requestKey: "other" });
  assert.throws(() => confirmNativeReservation(db, b), /expired/);
});
test("confirmation consumes a hold once, and failed payment cannot release paid inventory", t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db);
  assert.throws(() => attachNativeReservation(db, hold.id, b, "attacker"), /does not match/);
  assert.throws(() => attachNativeReservation(db, hold.id, { ...b, children: 0 }, "u"), /does not match/);
  attachNativeReservation(db, hold.id, b, "u"); confirmNativeReservation(db, b); confirmNativeReservation(db, b); releaseNativeReservation(db, b.id);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 0);
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 3);
});
test("supplier edits cannot reduce seats below holds; blackouts close new sales and preserve holds", t => {
  const db = fixture(t); const hold = reserve(db);
  assert.throws(() => saveInventoryRules(db, "p", "o", { ...rules, capacity: 2 }), /below 3 reserved/);
  saveInventoryRules(db, "p", "o", { ...rules, blackoutDates: [future] });
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].status, "CLOSED");
  const b = booking(db); attachNativeReservation(db, hold.id, b, "u"); confirmNativeReservation(db, b);
  assert.equal(db.prepare("SELECT status FROM native_reservations").get().status, "CONFIRMED");
});
test("failed payment frees seats and cannot be confirmed later", t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db); attachNativeReservation(db, hold.id, b, "u"); releaseNativeReservation(db, b.id);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 3);
  assert.throws(() => confirmNativeReservation(db, b), /expired/);
});
test("invalid calendar dates, malformed schedules and cutoff departures are rejected", t => {
  const db = fixture(t);
  assert.throws(() => listNativeAvailability(db, "p", "o", "2099-02-30"));
  assert.throws(() => saveInventoryRules(db, "p", "o", { ...rules, departureTimes: ["25:00"] }));
  assert.throws(() => reserve(db, { localDate: "2000-01-01" }), /closed/);
  assert.throws(() => reserve(db, { localTime: "10:00" }), /closed/);
});

test("confirmation outbox survives a failed attempt and completes idempotently on retry", async t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db); attachNativeReservation(db, hold.id, b, "u"); confirmNativeReservation(db, b);
  let calls = 0;
  const start = new Date(Date.now() + 1000);
  const delivery = async () => { calls++; return { results: [{ success: calls > 1 }] }; };
  assert.equal((await processReservationOutbox(db, delivery, { now: start })).completed, 0);
  assert.equal(db.prepare("SELECT status FROM native_reservation_outbox").get().status, "PENDING");
  assert.equal((await processReservationOutbox(db, delivery, { now: new Date(start.getTime() + 301000) })).completed, 1);
  assert.equal((await processReservationOutbox(db, delivery, { now: new Date(start.getTime() + 601000) })).checked, 0);
  assert.equal(calls, 2);
});

test("an existing hold retains its price and cancellation terms when the supplier edits the schedule", t => {
  const db = fixture(t); const hold = reserve(db);
  saveInventoryRules(db, "p", "o", { ...rules, adultPrice: 2000, cancellationHours: 48, blackoutDates: [future] });
  const held = checkNativeInventory(db, { product_id: "p", product_option_id: "o", activity_date: future, pickup_time: "09:00", adults: 2, children: 1, native_hold_id: hold.id }, { ownerId: "u" });
  assert.equal(held.adultPrice, 1000); assert.equal(held.cancellationHours, 24); assert.equal(held.available, true);
});

test("rescheduling preserves the old seats on failure and moves them atomically on success", t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db); attachNativeReservation(db, hold.id, b, "u"); confirmNativeReservation(db, b);
  const other = reserve(db, { ownerId: "other", requestKey: "afternoon", localTime: "14:00" });
  assert.throws(() => db.transaction(() => moveNativeReservation(db, b, future, "14:00"))(), /enough seats/);
  assert.equal(db.prepare("SELECT availability_slot FROM native_reservations WHERE booking_id = ?").get(b.id).availability_slot, `o:${future}:09:00`);
  db.prepare("UPDATE native_reservations SET status = 'CANCELLED' WHERE id = ?").run(other.id);
  db.transaction(() => moveNativeReservation(db, b, future, "14:00"))();
  const slots = listNativeAvailability(db, "p", "o", future);
  assert.equal(slots[0].vacancies, 3); assert.equal(slots[1].vacancies, 0);
});
test("custom cancellation deadline uses India time and the frozen policy without legacy grace", () => {
  const b = { id: "refund", activity_date: "2099-05-12", pickup_time: "09:00", amount_inr: 2520,
    logistics_snapshot: JSON.stringify({ nativeCancellationHours: 48 }), created_at: "2099-05-10T00:00:00Z" };
  assert.equal(calculateRefundQuote(null, b, { now: new Date("2099-05-10T03:30:00Z") }).refundPercentage, 100);
  assert.equal(calculateRefundQuote(null, b, { now: new Date("2099-05-10T03:30:00.001Z") }).refundPercentage, 0);
});
