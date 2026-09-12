import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { processReservationOutbox } from "../src/services/reservationOutboxService.js";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { calculateRefundQuote } from "../src/services/financeService.js";
import { moveNativeReservation, checkNativeInventory, saveInventoryRules, listNativeAvailability, reserveNativeInventory, attachNativeReservation, confirmNativeReservation, releaseNativeReservation, savePriceSchedule, saveSlotOverride, deleteSlotOverride, normalizeUnitItems, saveBookingUnitItems, listBookingUnitItems } from "../src/services/nativeInventoryService.js";

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
  executeMigrationSql(db, readFileSync(new URL("../migrations/021_reservation_engine_v2.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, readFileSync(new URL("../migrations/022_booking_unit_items.sql", import.meta.url), "utf8").split("-- @down")[0]);
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

// --- Reservation engine v2: seasonal rates, calendar overrides, party sizes ---

test("seasonal rates override the base price only inside their range and weekdays", t => {
  const db = fixture(t);
  // 2099-05-12 is a Tuesday; 2099-05-16 is a Saturday.
  savePriceSchedule(db, "p", "o", {
    label: "Peak season", startsOn: "2099-05-01", endsOn: "2099-05-31",
    weekdays: [6], adultPrice: 2500, childPrice: 900, priority: 10,
  });

  const tuesday = listNativeAvailability(db, "p", "o", "2099-05-12")[0];
  assert.equal(tuesday.adultPrice, 1000, "weekday outside the schedule keeps the base rate");
  assert.equal(tuesday.priceScheduleId, null);

  const saturday = listNativeAvailability(db, "p", "o", "2099-05-16")[0];
  assert.equal(saturday.adultPrice, 2500);
  assert.equal(saturday.childPrice, 900);
  assert.equal(saturday.priceScheduleLabel, "Peak season");

  const outside = listNativeAvailability(db, "p", "o", "2099-06-13")[0];
  assert.equal(outside.adultPrice, 1000, "dates past the range fall back to the base rate");
});

test("the highest priority seasonal rate wins when ranges overlap", t => {
  const db = fixture(t);
  savePriceSchedule(db, "p", "o", { label: "Summer", startsOn: "2099-05-01", endsOn: "2099-05-31", adultPrice: 1500, childPrice: 500, priority: 1 });
  savePriceSchedule(db, "p", "o", { label: "Festival", startsOn: "2099-05-10", endsOn: "2099-05-14", adultPrice: 3000, childPrice: 1200, priority: 9 });

  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-12")[0].adultPrice, 3000);
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-20")[0].adultPrice, 1500);
});

test("a hold freezes the seasonal rate even after the supplier reprices", t => {
  const db = fixture(t);
  savePriceSchedule(db, "p", "o", { startsOn: future, endsOn: future, adultPrice: 2000, childPrice: 800, priority: 5 });
  const hold = reserve(db);

  savePriceSchedule(db, "p", "o", { startsOn: future, endsOn: future, adultPrice: 9999, childPrice: 9999, priority: 99 });

  const held = checkNativeInventory(db, { product_id: "p", product_option_id: "o", activity_date: future, pickup_time: "09:00", adults: 2, children: 1, native_hold_id: hold.id }, { ownerId: "u" });
  assert.equal(held.adultPrice, 2000, "the traveler keeps the price captured at hold time");
  assert.equal(held.childPrice, 800);
});

test("closing one departure leaves the other departures on that date sellable", t => {
  const db = fixture(t);
  saveSlotOverride(db, "p", "o", { localDate: future, localTime: "09:00", closed: true, note: "Boat maintenance" });

  const slots = listNativeAvailability(db, "p", "o", future);
  const nine = slots.find(s => s.localTime === "09:00");
  const two = slots.find(s => s.localTime === "14:00");
  assert.equal(nine.status, "CLOSED");
  assert.equal(nine.supplierNote, "Boat maintenance");
  assert.equal(two.status, "AVAILABLE");

  assert.throws(() => reserve(db, { requestKey: "blocked" }), /no longer has enough seats or has closed/);
});

test("a whole-day override closes every departure on that date", t => {
  const db = fixture(t);
  saveSlotOverride(db, "p", "o", { localDate: future, closed: true });
  for (const slot of listNativeAvailability(db, "p", "o", future)) assert.equal(slot.status, "CLOSED");
});

test("per-date capacity overrides apply and survive a later rules edit", t => {
  const db = fixture(t);
  saveSlotOverride(db, "p", "o", { localDate: future, localTime: "09:00", capacity: 1 });
  assert.equal(listNativeAvailability(db, "p", "o", future).find(s => s.localTime === "09:00").capacity, 1);

  // Re-saving the weekly rules must not clobber the supplier's calendar edit.
  saveInventoryRules(db, "p", "o", rules);
  assert.equal(listNativeAvailability(db, "p", "o", future).find(s => s.localTime === "09:00").capacity, 1);
  assert.equal(listNativeAvailability(db, "p", "o", future).find(s => s.localTime === "14:00").capacity, 3);
});

test("a capacity override cannot cut below seats already reserved", t => {
  const db = fixture(t);
  reserve(db); // holds 3 seats (2 adults + 1 child)
  assert.throws(
    () => saveSlotOverride(db, "p", "o", { localDate: future, localTime: "09:00", capacity: 1 }),
    /Capacity cannot be below 3 reserved seats/
  );
});

test("removing an override restores the weekly rule capacity and open state", t => {
  const db = fixture(t);
  saveSlotOverride(db, "p", "o", { localDate: future, localTime: "09:00", capacity: 1, closed: true });
  assert.equal(listNativeAvailability(db, "p", "o", future).find(s => s.localTime === "09:00").status, "CLOSED");

  deleteSlotOverride(db, "p", "o", future, "09:00");
  const restored = listNativeAvailability(db, "p", "o", future).find(s => s.localTime === "09:00");
  assert.equal(restored.status, "AVAILABLE");
  assert.equal(restored.capacity, 3);
});

test("party-size rules reject undersized and oversized bookings", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 10, minPartySize: 4, maxPartySize: 6 });

  assert.throws(() => reserve(db, { adults: 2, children: 0, requestKey: "small" }), /needs at least 4 travelers/);
  assert.throws(() => reserve(db, { adults: 7, children: 0, requestKey: "big" }), /at most 6 travelers/);

  const ok = reserve(db, { adults: 4, children: 0, requestKey: "justright" });
  assert.equal(ok.status, "ON_HOLD");
});

test("party-size bounds are published on every departure and validated on save", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 2, maxPartySize: 8 });
  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.minPartySize, 2);
  assert.equal(slot.maxPartySize, 8);

  assert.throws(() => saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 6, maxPartySize: 2 }));
});

// --- P1: multi-unit-type pricing and booking unit items ---

test("unit breakdowns roll up into adults and children and reject bad input", () => {
  assert.deepEqual(
    normalizeUnitItems([{ unitType: "SENIOR", quantity: 2 }, { unitType: "INFANT", quantity: 1 }]),
    { items: [{ unitType: "INFANT", quantity: 1 }, { unitType: "SENIOR", quantity: 2 }], adults: 2, children: 1, seats: 3 }
  );
  // No breakdown supplied keeps the legacy adults/children behaviour.
  assert.deepEqual(normalizeUnitItems(null, { adults: 2, children: 1 }).items,
    [{ unitType: "ADULT", quantity: 2 }, { unitType: "CHILD", quantity: 1 }]);
  // Repeated types accumulate rather than overwrite.
  assert.equal(normalizeUnitItems([{ unitType: "ADULT", quantity: 1 }, { unitType: "ADULT", quantity: 2 }]).adults, 3);

  assert.throws(() => normalizeUnitItems([{ unitType: "MARTIAN", quantity: 1 }]), /Unknown traveler type/);
  assert.throws(() => normalizeUnitItems([{ unitType: "ADULT", quantity: 0 }]), /whole numbers of at least one/);
});

test("suppliers can price senior and infant units distinctly from adult and child", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 20, unitPrices: { SENIOR: 700, INFANT: 0 } });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.deepEqual(slot.unitPrices, { ADULT: 1000, CHILD: 400, SENIOR: 700, INFANT: 0 });

  // 2 seniors + 1 infant bills at the senior rate, not the adult rate.
  const hold = reserveNativeInventory(db, {
    productId: "p", optionId: "o", localDate: future, localTime: "09:00",
    unitItems: [{ unitType: "SENIOR", quantity: 2 }, { unitType: "INFANT", quantity: 1 }],
    ownerId: "u", requestKey: "seniors",
  });
  assert.equal(JSON.parse(hold.pricing_snapshot).unitTotal, 1400);
  assert.equal(Number(hold.adults), 2, "seniors occupy adult seats");
  assert.equal(Number(hold.children), 1, "infants occupy child seats");
});

test("seasonal rates can carry their own senior pricing", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, unitPrices: { SENIOR: 700 } });
  savePriceSchedule(db, "p", "o", { startsOn: future, endsOn: future, adultPrice: 2000, childPrice: 800, unitPrices: { SENIOR: 1500 }, priority: 5 });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.unitPrices.SENIOR, 1500, "the seasonal senior rate applies on that date");
  assert.equal(slot.unitPrices.ADULT, 2000);

  const offPeak = listNativeAvailability(db, "p", "o", "2099-06-13")[0];
  assert.equal(offPeak.unitPrices.SENIOR, 700, "other dates keep the base senior rate");
});

test("a unit type the supplier has not priced cannot be reserved", t => {
  const db = fixture(t);
  assert.throws(
    () => reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", unitItems: [{ unitType: "SENIOR", quantity: 1 }], ownerId: "u", requestKey: "unpriced" }),
    /does not sell the senior traveler type/
  );
});

test("unit items are recorded against the booking with their billed price", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, unitPrices: { SENIOR: 700 } });
  booking(db, "b1");

  const items = [{ unitType: "ADULT", quantity: 1 }, { unitType: "SENIOR", quantity: 2 }];
  saveBookingUnitItems(db, "b1", items, { ADULT: 1000, SENIOR: 700 });

  assert.deepEqual(listBookingUnitItems(db, "b1"), [
    { unitType: "ADULT", quantity: 1, unitPriceInr: 1000 },
    { unitType: "SENIOR", quantity: 2, unitPriceInr: 700 },
  ]);

  // Re-saving replaces rather than duplicating.
  saveBookingUnitItems(db, "b1", [{ unitType: "ADULT", quantity: 4 }], { ADULT: 1000 });
  assert.deepEqual(listBookingUnitItems(db, "b1"), [{ unitType: "ADULT", quantity: 4, unitPriceInr: 1000 }]);
});

test("booking unit items are skipped on databases without the table", t => {
  // A pre-P1 database must not fail checkout just because the table is absent.
  const db = new Database(":memory:");
  t.after(() => db.close());
  assert.deepEqual(saveBookingUnitItems(db, "b1", [{ unitType: "ADULT", quantity: 1 }], { ADULT: 1000 }), []);
  assert.deepEqual(listBookingUnitItems(db, "b1"), []);
});

test("a pre-v2 rules payload leaves party sizes and unit prices untouched", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 4, maxPartySize: 8, unitPrices: { SENIOR: 700 } });

  // The supplier UI that predates v2 sends only the original eight fields.
  saveInventoryRules(db, "p", "o", rules);

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.minPartySize, 4, "an omitted minPartySize must not reset to 1");
  assert.equal(slot.maxPartySize, 8, "an omitted maxPartySize must not reset to 0");
  assert.equal(slot.unitPrices.SENIOR, 700, "an omitted unitPrices must not wipe configured rates");

  // Explicitly sending values still overwrites them.
  saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 1, maxPartySize: 0, unitPrices: {} });
  const reset = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(reset.minPartySize, 1);
  assert.equal(reset.maxPartySize, 0);
  assert.equal(reset.unitPrices.SENIOR, undefined);
});

test("a maximum party size below the minimum is rejected", t => {
  const db = fixture(t);
  assert.throws(() => saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 6, maxPartySize: 2 }), /at least the minimum/);
  // A stored minimum is respected when only the maximum is sent.
  saveInventoryRules(db, "p", "o", { ...rules, minPartySize: 6 });
  assert.throws(() => saveInventoryRules(db, "p", "o", { ...rules, maxPartySize: 2 }), /at least the minimum/);
});
