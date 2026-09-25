import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { recordDriverLocations } from "../src/services/driverLocationService.js";
import { tripEta } from "../src/services/etaService.js";
import { buildTripTracking, createTrackingToken, findTrackableBooking, trackingUrl, verifyTrackingToken } from "../src/services/tripTrackingService.js";

const NOW = new Date("2026-09-14T08:00:00.000Z");

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, traveler_email TEXT, traveler_phone TEXT, status TEXT, payment_status TEXT,
      product_id TEXT, activity_date TEXT, pickup_time TEXT, pickup_location TEXT, pickup_lat REAL, pickup_lng REAL, drop_location TEXT, drop_lat REAL, drop_lng REAL);
    CREATE TABLE driver_assignments (id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, driver_name TEXT, driver_phone TEXT, vehicle_model TEXT,
      vehicle_number TEXT, assignment_status TEXT, acknowledgement TEXT);
  `);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/035_driver_live_location.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.prepare("INSERT INTO products VALUES ('p-1', 'Lucknow Airport to City Hotel')").run();
  db.prepare(`INSERT INTO bookings VALUES ('bk-1', 'IH-TRACK1', 'user-1', 'meera@example.test', '+919811111111', 'driver_assigned', 'PAID', 'p-1', '2026-09-14', '14:00',
    'Lucknow Airport', 26.7606, 80.8893, 'Gomti Inn, Gomti Nagar', 26.8570, 80.9990)`).run();
  return db;
}
const booking = (db) => findTrackableBooking(db, "ih-track1");
const assignDriver = (db, status, acknowledgement = "ACCEPTED") => db.prepare(`INSERT OR REPLACE INTO driver_assignments (id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status, acknowledgement)
  VALUES ('da-1', 'bk-1', 'sup-1', 'Ravi Kumar', '+919876543210', 'Swift Dzire', 'UP-32-AB-1234', ?, ?)`).run(status, acknowledgement);
const noEta = async () => ({ minutes: 12, distanceM: 6_400, source: "ESTIMATE" });

test("a tracking link opens only its own booking and expires after 7 days", () => {
  const db = database();
  const token = createTrackingToken(booking(db), NOW.getTime());
  assert.equal(verifyTrackingToken(token, booking(db), NOW.getTime()), true);
  assert.equal(verifyTrackingToken(token, { ...booking(db), id: "bk-2" }, NOW.getTime()), false, "another booking");
  assert.equal(verifyTrackingToken(`${token.slice(0, -2)}xx`, booking(db), NOW.getTime()), false, "tampered");
  assert.equal(verifyTrackingToken(token, booking(db), NOW.getTime() + 8 * 86_400_000), false, "expired");
  assert.equal(verifyTrackingToken("", booking(db), NOW.getTime()), false);
  assert.match(trackingUrl(booking(db), NOW.getTime()), /\/track\/IH-TRACK1#.+\..+$/, "the token rides in the fragment, which is never sent to servers or logs");
});

test("the traveler sees the driver only once they are on the way, with the ETA to pickup then to drop-off", async () => {
  const db = database();
  let trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.status, "DRIVER_PENDING");
  assert.equal(trip.driver, null);

  assignDriver(db, "ASSIGNED", "PENDING");
  assert.equal((await buildTripTracking(db, booking(db), { now: NOW, eta: noEta })).driver, null, "an unconfirmed driver is not shown");

  assignDriver(db, "ASSIGNED");
  trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.driver.vehicleNumber, "UP-32-AB-1234");
  assert.equal(trip.location, null, "not sharing yet");

  const assignment = db.prepare("SELECT * FROM driver_assignments").get();
  recordDriverLocations(db, { assignment }, [{ lat: 26.7700, lng: 80.9000, accuracy: 20, recordedAt: new Date(NOW.getTime() - 10_000).toISOString() }], { now: NOW });
  db.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE'").run();
  trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.location.freshness, "LIVE");
  assert.deepEqual(trip.eta, { minutes: 12, distanceM: 6_400, source: "ESTIMATE", to: "PICKUP" });
  assert.ok(trip.distanceToPickupM > 1_000);
  assert.equal(JSON.stringify(trip).includes("meera@example.test") || JSON.stringify(trip).includes("+919811111111"), false, "never the traveler's own contact details");

  db.prepare("UPDATE driver_assignments SET assignment_status = 'TRIP_STARTED'").run();
  trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.eta.to, "DROP", "during the trip the ETA is to the drop-off");

  // Signal lost: position still shown, but no ETA from a stale fix.
  trip = await buildTripTracking(db, booking(db), { now: new Date(NOW.getTime() + 10 * 60_000), eta: noEta });
  assert.equal(trip.location.freshness, "LOST");
  assert.equal(trip.eta, null);

  db.prepare("UPDATE driver_assignments SET assignment_status = 'COMPLETED'").run();
  trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.location, null, "tracking ends with the trip");

  db.prepare("UPDATE bookings SET status = 'cancelled'").run();
  trip = await buildTripTracking(db, booking(db), { now: NOW, eta: noEta });
  assert.equal(trip.status, "CANCELLED");
  assert.equal(trip.driver, null);
});

test("ETA uses Mappls driving time when enabled, falls back to the estimate, and caches for a minute", async (t) => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.ETA_PROVIDER = "mappls";
  process.env.MAPPLS_API_KEY = "test-mappls-key";
  const from = { lat: 26.7700, lng: 80.9000 };
  const to = { lat: 26.8570, lng: 80.9990 };
  const calls = [];
  const mappls = async (url) => { calls.push(url); return { ok: true, json: async () => ({ results: { code: "Ok", durations: [[0, 1844.4]], distances: [[0, 15817.7]] } }) }; };
  assert.deepEqual(await tripEta(from, to, { now: 1_000, fetchImpl: mappls }), { minutes: 31, distanceM: 15_818, source: "MAPPLS" });
  assert.match(calls[0], /route\.mappls\.com\/route\/dm\/distance_matrix_eta\/driving\/80\.9,26\.77;80\.999,26\.857\?access_token=test-mappls-key&region=ind/);
  await tripEta(from, to, { now: 30_000, fetchImpl: mappls });
  assert.equal(calls.length, 1, "cached within a minute");

  const failing = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const fallback = await tripEta({ lat: 26.70, lng: 80.80 }, to, { now: 1_000, fetchImpl: failing });
  assert.equal(fallback.source, "ESTIMATE");
  assert.ok(fallback.minutes > 0);
  assert.equal((await tripEta(to, to, { now: 1_000, fetchImpl: failing })).source, "NEARBY");
});

test("the traveler sees the pickup time in the trip city's zone (ADR 023)", async () => {
  const db = database();
  assert.equal((await buildTripTracking(db, booking(db), { now: NOW, eta: noEta })).timeLabel, "IST");
  db.exec("ALTER TABLE products ADD COLUMN city TEXT; CREATE TABLE destinations (name TEXT, country TEXT)");
  db.prepare("INSERT INTO destinations VALUES ('Bangkok', 'Thailand')").run();
  db.prepare("UPDATE products SET city = 'Bangkok'").run();
  assert.equal((await buildTripTracking(db, booking(db), { now: NOW, eta: noEta })).timeLabel, "ICT");
});
