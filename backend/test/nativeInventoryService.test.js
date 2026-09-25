import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { processReservationOutbox } from "../src/services/reservationOutboxService.js";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { calculateRefundQuote } from "../src/services/financeService.js";
import { moveNativeReservation, checkNativeInventory, saveInventoryRules, listNativeAvailability, reserveNativeInventory, attachNativeReservation, confirmNativeReservation, releaseNativeReservation, savePriceSchedule, saveSlotOverride, deleteSlotOverride, normalizeUnitItems, saveBookingUnitItems, listBookingUnitItems, listNativeMonthPricing, saveResource, listResources, deleteResource, savePromotion, listPromotions, deletePromotion, saveSlotOverrideRange, deleteSlotOverrideRange, listSlotOverrides } from "../src/services/nativeInventoryService.js";

const rules = { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "14:00"], capacity: 3, adultPrice: 1000, childPrice: 400, cutoffMinutes: 120, cancellationHours: 24, blackoutDates: [] };
const future = "2099-05-12";
function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT); INSERT INTO products VALUES ('p', 'sup');
    CREATE TABLE product_options (id TEXT PRIMARY KEY, product_id TEXT, name TEXT DEFAULT 'Standard', is_active INTEGER DEFAULT 1, confirmation_type TEXT, available_start_times TEXT, capacity INTEGER); INSERT INTO product_options(id, product_id) VALUES ('o', 'p'), ('o2', 'p');
    CREATE TABLE bookings (id TEXT PRIMARY KEY, product_id TEXT, status TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY); INSERT INTO suppliers VALUES ('sup');
    CREATE TABLE booking_holds (booking_id TEXT, status TEXT);`);
  db.exec(readFileSync(new URL("../migrations/017_native_reservations.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.exec(readFileSync(new URL("../migrations/018_native_reservation_delivery.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.exec(readFileSync(new URL("../migrations/019_native_hold_pricing.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, readFileSync(new URL("../migrations/021_reservation_engine_v2.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, readFileSync(new URL("../migrations/022_booking_unit_items.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, readFileSync(new URL("../migrations/023_shared_resources.sql", import.meta.url), "utf8").split("-- @down")[0]);
  executeMigrationSql(db, readFileSync(new URL("../migrations/024_native_promotions.sql", import.meta.url), "utf8").split("-- @down")[0]);
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
    { items: [{ unitType: "INFANT", quantity: 1, occupiesSeat: true }, { unitType: "SENIOR", quantity: 2, occupiesSeat: true }], adults: 2, children: 1, seats: 3 }
  );
  // No breakdown supplied keeps the legacy adults/children behaviour.
  assert.deepEqual(normalizeUnitItems(null, { adults: 2, children: 1 }).items,
    [{ unitType: "ADULT", quantity: 2, occupiesSeat: true }, { unitType: "CHILD", quantity: 1, occupiesSeat: true }]);
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

test("a seasonal rate inherits base unit prices it does not override", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, unitPrices: { SENIOR: 700, YOUTH: 500 } });
  // A peak rate that only raises adult and child must not stop senior sales.
  savePriceSchedule(db, "p", "o", { startsOn: future, endsOn: future, adultPrice: 2000, childPrice: 800, unitPrices: { YOUTH: 900 }, priority: 5 });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.unitPrices.ADULT, 2000, "the seasonal adult rate applies");
  assert.equal(slot.unitPrices.YOUTH, 900, "an explicitly overridden unit uses the seasonal rate");
  assert.equal(slot.unitPrices.SENIOR, 700, "an unspecified unit keeps its base rate rather than becoming unsellable");

  // And it remains reservable in season.
  const hold = reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", unitItems: [{ unitType: "SENIOR", quantity: 1 }], ownerId: "u", requestKey: "senior-peak" });
  assert.equal(JSON.parse(hold.pricing_snapshot).unitTotal, 700);
});

test("the month price calendar follows seasonal rates and closed dates", t => {
  const db = fixture(t);
  // future is 2099-05-12 (a Tuesday); price peak rates for that week only.
  savePriceSchedule(db, "p", "o", { label: "May peak", startsOn: "2099-05-10", endsOn: "2099-05-16", adultPrice: 2500, childPrice: 900, priority: 5 });
  saveSlotOverride(db, "p", "o", { localDate: "2099-05-20", closed: true });

  const calendar = listNativeMonthPricing(db, "p", "2099-05");
  const byDate = Object.fromEntries(calendar.days.map(day => [day.date, day]));

  assert.equal(calendar.basePriceInr, 1000);
  assert.equal(calendar.days.length, 31);
  assert.equal(byDate["2099-05-12"].priceInr, 2500, "in-season dates use the seasonal rate");
  assert.equal(byDate["2099-05-12"].scheduleLabel, "May peak");
  assert.equal(byDate["2099-05-25"].priceInr, 1000, "out-of-season dates use the base rate");
  assert.equal(byDate["2099-05-20"].available, false, "a whole-day closure marks the date unavailable");
  assert.equal(byDate["2099-05-21"].available, true);
});

test("the month price calendar is null for products without seat inventory", t => {
  const db = fixture(t);
  assert.equal(listNativeMonthPricing(db, "missing-product", "2099-05"), null);
  assert.equal(listNativeMonthPricing(db, "p", "not-a-month"), null);
});

// --- P2: shared resources and seatless units ---

test("two options sharing one vehicle cannot together oversell it", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 10 });
  saveInventoryRules(db, "p", "o2", { ...rules, capacity: 10 });

  // Both options run on the same 6-seat van.
  saveResource(db, "sup", { name: "Tempo Traveller GA-01", capacity: 6, optionIds: ["o", "o2"] });

  // Each option alone would advertise 10 seats; the van caps both at 6.
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 6);
  assert.equal(listNativeAvailability(db, "p", "o2", future)[0].vacancies, 6);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].sharedResource.name, "Tempo Traveller GA-01");

  // Four seats sold on the first option must shrink the second.
  reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 4, ownerId: "u1", requestKey: "k1" });
  assert.equal(listNativeAvailability(db, "p", "o2", future)[0].vacancies, 2, "the shared van is down to two seats");

  // And the van cannot be oversold across the two options.
  assert.throws(
    () => reserveNativeInventory(db, { productId: "p", optionId: "o2", localDate: future, localTime: "09:00", adults: 3, ownerId: "u2", requestKey: "k2" }),
    /no longer has enough seats/
  );
  const fits = reserveNativeInventory(db, { productId: "p", optionId: "o2", localDate: future, localTime: "09:00", adults: 2, ownerId: "u3", requestKey: "k3" });
  assert.equal(fits.status, "ON_HOLD");
});

test("a shared resource constrains only its own departure time", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 10 });
  saveInventoryRules(db, "p", "o2", { ...rules, capacity: 10 });
  saveResource(db, "sup", { name: "Van", capacity: 6, optionIds: ["o", "o2"] });

  reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 6, ownerId: "u", requestKey: "k" });
  assert.equal(listNativeAvailability(db, "p", "o2", future).find(s => s.localTime === "09:00").vacancies, 0);
  assert.equal(listNativeAvailability(db, "p", "o2", future).find(s => s.localTime === "14:00").vacancies, 6, "the van is free again at the later departure");
});

test("a resource cannot be shrunk below seats already committed", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 10 });
  saveResource(db, "sup", { name: "Van", capacity: 8, optionIds: ["o"] });
  reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 5, ownerId: "u", requestKey: "k" });

  const saved = listResources(db, "sup")[0];
  assert.throws(
    () => saveResource(db, "sup", { name: "Van", capacity: 3, optionIds: ["o"] }, saved.id),
    /Capacity cannot be below 5 seats/
  );
  // Unlinking and deleting release the constraint.
  deleteResource(db, "sup", saved.id);
  assert.equal(listResources(db, "sup").length, 0);
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 5);
});

test("a resource rejects options belonging to another supplier", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", rules);
  assert.throws(() => saveResource(db, "other-supplier", { name: "Van", capacity: 4, optionIds: ["o"] }), /Option not found/);
});

test("seatless infants bill without consuming a seat", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 2, unitPrices: { INFANT: 200 }, seatlessUnits: ["INFANT"] });

  // Two adults fill the departure; an infant on a lap still fits.
  const hold = reserveNativeInventory(db, {
    productId: "p", optionId: "o", localDate: future, localTime: "09:00",
    unitItems: [{ unitType: "ADULT", quantity: 2 }, { unitType: "INFANT", quantity: 1 }],
    ownerId: "u", requestKey: "lap",
  });
  assert.equal(Number(hold.adults), 2);
  assert.equal(Number(hold.children), 0, "a seatless infant is not counted as an occupied child seat");
  assert.equal(JSON.parse(hold.pricing_snapshot).unitTotal, 2200, "but it is still billed");
  assert.deepEqual(JSON.parse(hold.unit_items).map(i => i.unitType), ["ADULT", "INFANT"], "and still recorded for the manifest");
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].vacancies, 0);
});

test("seatless units are opt-in and default to occupying a seat", t => {
  const db = fixture(t);
  saveInventoryRules(db, "p", "o", { ...rules, capacity: 2, unitPrices: { INFANT: 200 } });
  assert.throws(
    () => reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", unitItems: [{ unitType: "ADULT", quantity: 2 }, { unitType: "INFANT", quantity: 1 }], ownerId: "u", requestKey: "seated" }),
    /no longer has enough seats/
  );
});

// --- Promotional rates ---

const promoBase = { discountType: "PERCENT", discountValue: 20 };

test("a public promotion discounts the resolved rate for everyone", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, label: "Monsoon sale" });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.listAdultPrice, 1000, "the list price is still published");
  assert.equal(slot.adultPrice, 800, "and the traveler pays the discounted rate");
  assert.equal(slot.unitPrices.CHILD, 320);
  assert.equal(slot.promotion.label, "Monsoon sale");
  assert.equal(slot.promotion.requiresCode, false);
});

test("a promotion discounts the seasonal rate, not the base rate", t => {
  const db = fixture(t);
  savePriceSchedule(db, "p", "o", { startsOn: future, endsOn: future, adultPrice: 2000, childPrice: 800, priority: 5 });
  savePromotion(db, "p", "o", { ...promoBase, discountValue: 25 });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.listAdultPrice, 2000);
  assert.equal(slot.adultPrice, 1500, "25% off the seasonal 2000, not the base 1000");
});

test("a coded promotion stays hidden until the traveler supplies the code", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, code: "MONSOON20", label: "Coded" });

  const public_ = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(public_.promotion, null, "an unredeemed code must not leak into public availability");
  assert.equal(public_.adultPrice, 1000);

  const withCode = listNativeAvailability(db, "p", "o", future, { promoCode: "monsoon20" })[0];
  assert.equal(withCode.adultPrice, 800, "the code applies case-insensitively");
  assert.equal(withCode.promotion.requiresCode, true);
});

test("a wrong or inapplicable code is rejected instead of silently charging full price", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, code: "REAL20" });
  assert.throws(
    () => reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 1, promoCode: "WRONG", ownerId: "u", requestKey: "bad" }),
    /not valid for this departure/
  );
});

test("last-minute and early-bird windows key on booking lead time", t => {
  const db = fixture(t);
  // Last minute: only within 48 hours of departure. `future` is years away.
  savePromotion(db, "p", "o", { ...promoBase, label: "Last minute", maxLeadHours: 48 });
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].promotion, null);

  const soon = new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 10);
  const soonSlot = listNativeAvailability(db, "p", "o", soon).find(s => s.promotion);
  assert.ok(soonSlot, "a departure inside the window gets the last-minute discount");
  assert.equal(soonSlot.promotion.label, "Last minute");

  // Early bird: only when booked well ahead.
  const db2 = fixture(t);
  savePromotion(db2, "p", "o", { ...promoBase, label: "Early bird", minLeadHours: 720 });
  assert.equal(listNativeAvailability(db2, "p", "o", future)[0].promotion.label, "Early bird");
  assert.equal(listNativeAvailability(db2, "p", "o", soon).find(s => s.promotion) ?? null, null);
});

test("flat discounts never drive a unit price below zero", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { discountType: "FLAT", discountValue: 5000 });
  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.adultPrice, 0);
  assert.equal(slot.unitPrices.CHILD, 0);
});

test("only the best promotion applies and discounts never stack", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, label: "Small", discountValue: 10, priority: 1 });
  savePromotion(db, "p", "o", { ...promoBase, label: "Big", discountValue: 30, priority: 9 });

  const slot = listNativeAvailability(db, "p", "o", future)[0];
  assert.equal(slot.promotion.label, "Big");
  assert.equal(slot.adultPrice, 700, "30% off once — not 30% then 10%");
});

test("a promotion stops applying once its redemption cap is reached", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, maxRedemptions: 1 });
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].adultPrice, 800);

  reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 1, ownerId: "u", requestKey: "r1" });
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].promotion, null, "the cap is consumed");
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].adultPrice, 1000);
});

test("a hold freezes its promotion even after the supplier withdraws it", t => {
  const db = fixture(t);
  const promo = savePromotion(db, "p", "o", { ...promoBase, label: "Flash" });
  const hold = reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: future, localTime: "09:00", adults: 2, children: 1, ownerId: "u", requestKey: "frozen" });

  assert.equal(hold.promotion_id, promo.id);
  assert.equal(JSON.parse(hold.pricing_snapshot).unitTotal, 2 * 800 + 1 * 320);

  deletePromotion(db, "p", "o", promo.id);
  const held = checkNativeInventory(db, { product_id: "p", product_option_id: "o", activity_date: future, pickup_time: "09:00", adults: 2, children: 1, native_hold_id: hold.id }, { ownerId: "u" });
  assert.equal(held.adultPrice, 800, "the traveler keeps the price captured at hold time");
  assert.equal(listNativeAvailability(db, "p", "o", future)[0].adultPrice, 1000, "while new travelers pay full price");
});

test("promotion windows and percentages are validated on save", t => {
  const db = fixture(t);
  assert.throws(() => savePromotion(db, "p", "o", { discountType: "PERCENT", discountValue: 150 }));
  assert.throws(() => savePromotion(db, "p", "o", { ...promoBase, minLeadHours: 100, maxLeadHours: 10 }));
  savePromotion(db, "p", "o", { ...promoBase, code: "DUPE" });
  assert.throws(() => savePromotion(db, "p", "o", { ...promoBase, code: "dupe" }), /already exists/);
});

test("the month price calendar shows public promotions but hides coded ones", t => {
  const db = fixture(t);
  savePromotion(db, "p", "o", { ...promoBase, label: "Monsoon sale", travelFrom: "2099-05-01", travelUntil: "2099-05-15" });
  savePromotion(db, "p", "o", { ...promoBase, label: "Insider", code: "SECRET50", discountValue: 50, priority: 9 });

  const byDate = Object.fromEntries(listNativeMonthPricing(db, "p", "2099-05").days.map(d => [d.date, d]));

  assert.equal(byDate["2099-05-12"].listPriceInr, 1000);
  assert.equal(byDate["2099-05-12"].priceInr, 800, "the public promotion reaches the calendar");
  assert.equal(byDate["2099-05-12"].promotionLabel, "Monsoon sale");
  assert.notEqual(byDate["2099-05-12"].priceInr, 500, "the coded promotion must not leak into the calendar");

  assert.equal(byDate["2099-05-25"].priceInr, 1000, "dates outside the promotion window are undiscounted");
  assert.equal(byDate["2099-05-25"].promotionLabel, null);
});

// --- Bulk calendar editing ---

test("a range closure applies to every operating date in one call", t => {
  const db = fixture(t);
  const result = saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-14", closed: true, note: "Monsoon" });

  assert.equal(result.appliedCount, 5);
  assert.deepEqual(result.applied, ["2099-05-10", "2099-05-11", "2099-05-12", "2099-05-13", "2099-05-14"]);
  for (const day of result.applied) {
    for (const slot of listNativeAvailability(db, "p", "o", day)) {
      assert.equal(slot.status, "CLOSED", `${day} ${slot.localTime} should be closed`);
      assert.equal(slot.supplierNote, "Monsoon");
    }
  }
  // Dates outside the range are untouched.
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-15")[0].status, "AVAILABLE");
});

test("a range can target selected weekdays only", t => {
  const db = fixture(t);
  // 2099-05-10 is a Sunday, so Mondays in this window are the 11th and 18th.
  const result = saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-20", weekdays: [1], capacity: 1 });

  assert.deepEqual(result.applied, ["2099-05-11", "2099-05-18"]);
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-11")[0].capacity, 1);
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-12")[0].capacity, 3, "other weekdays keep the rule capacity");
});

test("a range targets one departure when a time is given", t => {
  const db = fixture(t);
  saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-11", localTime: "09:00", closed: true });

  for (const day of ["2099-05-10", "2099-05-11"]) {
    const slots = listNativeAvailability(db, "p", "o", day);
    assert.equal(slots.find(s => s.localTime === "09:00").status, "CLOSED");
    assert.equal(slots.find(s => s.localTime === "14:00").status, "AVAILABLE", "the other departure keeps selling");
  }
});

test("a range skips dates the option does not operate on", t => {
  const db = fixture(t);
  // Operate Mondays only, then sweep a full week.
  saveInventoryRules(db, "p", "o", { ...rules, operatingDays: [1] });
  const result = saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-16", closed: true });

  assert.deepEqual(result.applied, ["2099-05-11"]);
  assert.equal(result.skippedNonOperating.length, 6);
});

test("one conflicting date leaves the whole range untouched", t => {
  const db = fixture(t);
  // Three seats held on the 12th; a range shrinking to 1 must fail atomically.
  reserveNativeInventory(db, { productId: "p", optionId: "o", localDate: "2099-05-12", localTime: "09:00", adults: 2, children: 1, ownerId: "u", requestKey: "held" });

  assert.throws(
    () => saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-14", capacity: 1 }),
    /Capacity cannot be below 3 reserved seats/
  );
  // The 10th and 11th were processed before the 12th threw — they must be rolled back.
  assert.equal(listSlotOverrides(db, "p", "o").length, 0, "no partial range should survive");
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-10")[0].capacity, 3);
});

test("range bounds are validated", t => {
  const db = fixture(t);
  assert.throws(() => saveSlotOverrideRange(db, "p", "o", { from: "2099-05-20", to: "2099-05-10", closed: true }));
  assert.throws(
    () => saveSlotOverrideRange(db, "p", "o", { from: "2099-01-01", to: "2101-01-01", closed: true }),
    /cannot exceed 366 days/
  );
});

test("a range delete reopens every date it covers", t => {
  const db = fixture(t);
  saveSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-14", closed: true, capacity: 1 });
  assert.equal(listSlotOverrides(db, "p", "o").length, 5);

  const removed = deleteSlotOverrideRange(db, "p", "o", { from: "2099-05-10", to: "2099-05-12" });
  assert.equal(removed.removedCount, 3);
  assert.equal(listSlotOverrides(db, "p", "o").length, 2);

  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-10")[0].status, "AVAILABLE");
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-10")[0].capacity, 3, "rule capacity is restored");
  assert.equal(listNativeAvailability(db, "p", "o", "2099-05-13")[0].status, "CLOSED", "dates outside the delete stay closed");
});

test("an explicitly empty departure time means the whole day", t => {
  const db = fixture(t);
  // Clients send localTime as an empty string for "whole day" rather than
  // omitting it, so the empty case must validate, not just default.
  saveSlotOverride(db, "p", "o", { localDate: future, localTime: "", closed: true, note: "Whole day off" });
  for (const slot of listNativeAvailability(db, "p", "o", future)) {
    assert.equal(slot.status, "CLOSED");
    assert.equal(slot.supplierNote, "Whole day off");
  }

  saveSlotOverrideRange(db, "p", "o", { from: "2099-06-01", to: "2099-06-02", localTime: "", capacity: 2 });
  assert.equal(listNativeAvailability(db, "p", "o", "2099-06-01")[0].capacity, 2);

  // A malformed time is still rejected.
  assert.throws(() => saveSlotOverride(db, "p", "o", { localDate: future, localTime: "99:99" }));
});

test("a hold's frozen price adds 5% GST in India, 18% from an Indian supplier abroad and none from a Thai one (ADR 023, ADR 024)", t => {
  const db = fixture(t); const hold = reserve(db); const b = booking(db);
  assert.throws(() => attachNativeReservation(db, hold.id, { ...b, amount_inr: 2400 }, "u"), error => error.code === "PRICE_CHANGED");
  attachNativeReservation(db, hold.id, { ...b, amount_inr: 2520 }, "u");

  db.exec("ALTER TABLE products ADD COLUMN city TEXT; UPDATE products SET city = 'Bangkok'; CREATE TABLE destinations (name TEXT, country TEXT); INSERT INTO destinations VALUES ('Bangkok', 'Thailand'), ('Goa', 'India'); ALTER TABLE suppliers ADD COLUMN city TEXT; UPDATE suppliers SET city = 'Goa';");
  // An Indian supplier's product abroad: 18% (ADR 024).
  const abroad = reserve(db, { localTime: "14:00", adults: 1, children: 0, ownerId: "w", requestKey: "abroad" });
  const ab = { ...booking(db, "ab"), pickup_time: "14:00", adults: 1, children: 0 };
  assert.throws(() => attachNativeReservation(db, abroad.id, { ...ab, amount_inr: 1050 }, "w"), error => error.code === "PRICE_CHANGED");
  attachNativeReservation(db, abroad.id, { ...ab, amount_inr: 1180 }, "w");

  // A Thai supplier's product in Thailand: none.
  db.exec("UPDATE suppliers SET city = 'Bangkok'");
  const thai = reserve(db, { localTime: "14:00", adults: 1, children: 0, ownerId: "v", requestKey: "thai" });
  const tb = { ...booking(db, "tb"), pickup_time: "14:00", adults: 1, children: 0 };
  assert.throws(() => attachNativeReservation(db, thai.id, { ...tb, amount_inr: 1050 }, "v"), error => error.code === "PRICE_CHANGED");
  attachNativeReservation(db, thai.id, { ...tb, amount_inr: 1000 }, "v");
});

// The per-product row lock does not cover a resource shared with another
// product's options; on Postgres two such products could both take the van's
// last seat. Every seat-taking write must lock the linked resource rows too.
function recordSql(db) {
  const seen = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => { seen.push(sql); return prepare(sql); };
  return seen;
}
test("a hold locks the shared resources its option draws from", t => {
  const db = fixture(t);
  saveResource(db, "sup", { name: "Van", capacity: 6, optionIds: ["o"] });
  const seen = recordSql(db);
  reserve(db);
  assert.ok(seen.some((sql) => /UPDATE native_resources SET id = id/.test(sql)), "the shared van row is locked");
});
test("a reschedule locks the shared resources of the new departure", t => {
  const db = fixture(t);
  saveResource(db, "sup", { name: "Van", capacity: 6, optionIds: ["o"] });
  const hold = reserve(db);
  const b = booking(db);
  attachNativeReservation(db, hold.id, b, "u");
  confirmNativeReservation(db, b);
  const seen = recordSql(db);
  moveNativeReservation(db, b, future, "14:00");
  assert.ok(seen.some((sql) => /UPDATE native_resources SET id = id/.test(sql)));
});
