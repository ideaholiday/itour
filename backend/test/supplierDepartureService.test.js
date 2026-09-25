import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { checkInBooking, departureManifest, indiaDate, manifestCsv, parseBookingReference, setAttendance } from "../src/services/supplierDepartureService.js";

/** Supplier check-in, no-shows and guest lists (docs/SUPPLIER_OPERATIONS.md). */

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, product_type TEXT);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, product_id TEXT, status TEXT, payment_status TEXT,
      activity_date TEXT, pickup_time TEXT, pickup_location TEXT, adults INTEGER, children INTEGER,
      traveler_name TEXT, traveler_phone TEXT, special_requests TEXT, variant_name TEXT
    );
    INSERT INTO products VALUES ('prd_1', 'sup_1', 'Dolphin cruise', 'EXPERIENCE');
    INSERT INTO bookings VALUES
      ('bk_1', 'IH-AAA111', 'sup_1', 'prd_1', 'confirmed', 'PAID', '2026-09-16', '09:00', 'Jetty', 2, 1, 'Asha', '+91 90000 00001', NULL, NULL),
      ('bk_2', 'IH-BBB222', 'sup_1', 'prd_1', 'cancelled', 'REFUNDED_TO_WALLET', '2026-09-16', '09:00', 'Jetty', 4, 0, 'Ravi', NULL, NULL, NULL),
      ('bk_3', 'IH-CCC333', 'sup_2', 'prd_1', 'confirmed', 'PAID', '2026-09-16', '09:00', 'Jetty', 1, 0, 'Other', NULL, NULL, NULL);
  `);
  executeMigrationSql(db, upSql("047_booking_attendance.sql"));
  // Migration 062: where the booking came from and what its guest still owes.
  db.exec("ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'B2C'; ALTER TABLE bookings ADD COLUMN balance_due_inr INTEGER NOT NULL DEFAULT 0;");
  return db;
}

// 2026-09-15 20:00 UTC is already 16 September in India.
const LATE_EVENING_UTC = new Date("2026-09-15T20:00:00Z");

test("the voucher QR link, a typed reference and junk each parse as expected", () => {
  assert.equal(parseBookingReference("https://ideaholiday.in/booking-confirmed/IH-AAA111"), "IH-AAA111");
  assert.equal(parseBookingReference("https://ideaholiday.in/booking-confirmed/IH-AAA111?utm=x#top"), "IH-AAA111");
  assert.equal(parseBookingReference("  ih-aaa111 "), "ih-aaa111");
  assert.equal(parseBookingReference("DROP TABLE bookings;"), null);
  assert.equal(parseBookingReference(""), null);
});

test("today is the date in India, not in UTC", () => {
  assert.equal(indiaDate(LATE_EVENING_UTC), "2026-09-16");
});

test("check-in works only on the trip date in India and only for the supplier's own bookings", () => {
  const db = database();
  assert.throws(() => checkInBooking(db, { supplierId: "sup_1", code: "IH-AAA111", now: new Date("2026-09-15T10:00:00Z") }), { code: "WRONG_DATE" });
  const first = checkInBooking(db, { supplierId: "sup_1", code: "IH-AAA111", actorId: "usr_s", now: LATE_EVENING_UTC });
  assert.equal(first.alreadyCheckedIn, false);
  assert.equal(checkInBooking(db, { supplierId: "sup_1", code: "IH-AAA111", now: LATE_EVENING_UTC }).alreadyCheckedIn, true);
  assert.throws(() => checkInBooking(db, { supplierId: "sup_1", code: "IH-BBB222", now: LATE_EVENING_UTC }), { code: "BOOKING_CANCELLED" });
  assert.throws(() => checkInBooking(db, { supplierId: "sup_1", code: "IH-CCC333", now: LATE_EVENING_UTC }), { status: 404 });
});

test("a no-show waits for the trip date and can be undone", () => {
  const db = database();
  assert.throws(() => setAttendance(db, { supplierId: "sup_1", bookingId: "bk_1", status: "NO_SHOW", now: new Date("2026-09-15T10:00:00Z") }), { code: "TOO_EARLY" });
  assert.equal(setAttendance(db, { supplierId: "sup_1", bookingId: "bk_1", status: "NO_SHOW", now: LATE_EVENING_UTC }).attendanceStatus, "NO_SHOW");
  assert.equal(setAttendance(db, { supplierId: "sup_1", bookingId: "bk_1", status: "NONE", now: LATE_EVENING_UTC }).attendanceStatus, null);
});

test("the guest list counts live guests and escapes spreadsheet formulas", () => {
  const db = database();
  db.prepare("UPDATE bookings SET traveler_name = '@SUM(A1)', special_requests = 'Veg, no onion' WHERE id = 'bk_1'").run();
  const manifest = departureManifest(db, { supplierId: "sup_1", productId: "prd_1", date: "2026-09-16" });
  assert.deepEqual(manifest.totals, { bookings: 1, guests: 3, checkedIn: 0, noShow: 0, cancelledBookings: 1 });
  const csv = manifestCsv(manifest);
  assert.match(csv, /IH-AAA111,'@SUM\(A1\),\+91 90000 00001/);
  assert.match(csv, /"Veg, no onion"/);
  assert.match(csv.split("\r\n")[0], /,Source,Balance due$/);

  // A walk-in guest who still owes the operator shows the amount to collect.
  db.prepare("UPDATE bookings SET source = 'WALK_IN', balance_due_inr = 500 WHERE id = 'bk_1'").run();
  const counter = departureManifest(db, { supplierId: "sup_1", productId: "prd_1", date: "2026-09-16" });
  assert.equal(counter.bookings[0].source, "WALK_IN");
  assert.equal(counter.bookings[0].balanceDueInr, 500);
  assert.match(manifestCsv(counter), /,WALK_IN,500\r\n/);
  assert.throws(() => departureManifest(db, { supplierId: "sup_2", productId: "prd_1", date: "2026-09-16" }), { code: "PRODUCT_NOT_FOUND" });
});
