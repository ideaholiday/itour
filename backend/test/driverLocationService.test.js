import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import {
  assertDriverSharingLocation,
  driverLocationTrail,
  latestDriverLocation,
  locationFreshness,
  normalizeLocationPoint,
  purgeExpiredDriverLocations,
  recordDriverLocations,
} from "../src/services/driverLocationService.js";

const NOW = new Date("2026-09-14T08:00:00.000Z");
const at = (secondsAgo) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();

function database() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE driver_assignments (
    id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, assignment_status TEXT, acknowledgement TEXT
  )`);
  executeMigrationSql(db, fs.readFileSync(new URL("../migrations/035_driver_live_location.sql", import.meta.url), "utf8").split("-- @down")[0]);
  db.prepare("INSERT INTO driver_assignments (id, booking_id, supplier_id, assignment_status, acknowledgement) VALUES ('da-1', 'bk-1', 'sup-1', 'ASSIGNED', 'ACCEPTED')").run();
  return db;
}
const assignment = (db) => db.prepare("SELECT * FROM driver_assignments WHERE id = 'da-1'").get();

test("points are validated before they are stored", () => {
  assert.ok(normalizeLocationPoint({ lat: 26.8467, lng: 80.9462, accuracy: 12, recordedAt: at(5) }, NOW).point);
  assert.equal(normalizeLocationPoint({ lat: 91, lng: 80 }, NOW).rejected, "INVALID_COORDINATES");
  assert.equal(normalizeLocationPoint({ lat: 0, lng: 0 }, NOW).rejected, "INVALID_COORDINATES", "a browser's empty fix is not a place");
  assert.equal(normalizeLocationPoint({ lat: 26.8, lng: 80.9, accuracy: 5000 }, NOW).rejected, "LOW_ACCURACY");
  assert.equal(normalizeLocationPoint({ lat: 26.8, lng: 80.9, recordedAt: new Date(NOW.getTime() + 10 * 60_000).toISOString() }, NOW).rejected, "FUTURE_TIME");
  assert.equal(normalizeLocationPoint({ lat: 26.8, lng: 80.9, speed: 100 }, NOW).rejected, "IMPOSSIBLE_SPEED", "360 km/h from a phone is noise");
  assert.equal(normalizeLocationPoint({ lat: 26.8, lng: 80.9, speed: 10 }, NOW).point.speed_kmh, 36, "the Geolocation API reports metres per second");
});

test("a batch stores every valid point and the latest position never moves backwards", () => {
  const db = database();
  const result = recordDriverLocations(db, { assignment: assignment(db) }, [
    { lat: 26.84, lng: 80.94, accuracy: 20, recordedAt: at(30) },
    { lat: 26.85, lng: 80.95, accuracy: 15, recordedAt: at(10) },
    { lat: 99, lng: 80.95 },
  ], { now: NOW });
  assert.equal(result.accepted, 2);
  assert.deepEqual(result.rejected, { INVALID_COORDINATES: 1 });
  assert.equal(result.latest.lat, 26.85);
  assert.equal(result.latest.freshness, "LIVE");

  // A delayed batch from before the network gap arrives later.
  recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.80, lng: 80.90, recordedAt: at(120) }], { now: NOW });
  assert.equal(latestDriverLocation(db, "da-1", NOW).lat, 26.85);
  assert.deepEqual(driverLocationTrail(db, "da-1").map((point) => point.lat), [26.80, 26.84, 26.85], "the trail is ordered by when each point was recorded");
});

test("location is only taken during an accepted, active trip", () => {
  const db = database();
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'PENDING'").run();
  assert.throws(() => recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.8, lng: 80.9 }], { now: NOW }), (err) => err.code === "TRIP_NOT_ACCEPTED");
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED', assignment_status = 'COMPLETED'").run();
  assert.throws(() => recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.8, lng: 80.9 }], { now: NOW }), (err) => err.code === "TRIP_NOT_TRACKABLE");
});

test("freshness is live for a minute, delayed up to five, then lost", () => {
  assert.equal(locationFreshness(at(30), NOW), "LIVE");
  assert.equal(locationFreshness(at(200), NOW), "DELAYED");
  assert.equal(locationFreshness(at(900), NOW), "LOST");
  assert.equal(locationFreshness(null, NOW), "NONE");
});

test("only a recent fix from the driver's own phone counts as sharing", () => {
  const db = database();
  assert.throws(() => assertDriverSharingLocation(db, "da-1", NOW), (err) => err.code === "LOCATION_SHARING_REQUIRED");
  recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.8, lng: 80.9, recordedAt: at(20) }], { source: "OPS", now: NOW });
  assert.throws(() => assertDriverSharingLocation(db, "da-1", NOW), "a position typed in by operations is not the driver sharing");
  recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.8, lng: 80.9, recordedAt: at(10) }], { now: NOW });
  assert.doesNotThrow(() => assertDriverSharingLocation(db, "da-1", NOW));
  assert.throws(() => assertDriverSharingLocation(db, "da-1", new Date(NOW.getTime() + 6 * 60_000)), "a fix older than five minutes is not sharing");
});

test("positions older than 30 days are deleted, including the trip's last position", () => {
  const db = database();
  recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 26.8, lng: 80.9, recordedAt: at(5) }], { now: NOW });
  assert.deepEqual(purgeExpiredDriverLocations(db, new Date(NOW.getTime() + 29 * 86_400_000)), { pings: 0, assignments: 0 });
  assert.deepEqual(purgeExpiredDriverLocations(db, new Date(NOW.getTime() + 31 * 86_400_000)), { pings: 1, assignments: 1 });
  assert.equal(latestDriverLocation(db, "da-1", NOW), null);
});

test("location risk: late, not moving and signal lost are told apart", async () => {
  const { assessDriverLocationRisk, distanceMeters, estimateDrive } = await import("../src/services/driverLocationService.js");
  assert.equal(distanceMeters({ lat: 26.8467, lng: 80.9462 }, { lat: 26.8467, lng: 80.9462 }), 0);
  assert.ok(Math.abs(distanceMeters({ lat: 26.8467, lng: 80.9462 }, { lat: 26.7606, lng: 80.8893 }) - 11_140) < 200, "Hazratganj to Lucknow airport is about 11 km as the crow flies");
  assert.deepEqual(estimateDrive(10_000), { distanceM: 13_500, minutes: 21 });

  const db = database();
  db.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE'").run();
  const booking = { pickup_lat: 26.8467, pickup_lng: 80.9462 };
  const pickupAtMs = NOW.getTime() + 20 * 60_000;
  const risk = () => assessDriverLocationRisk(db, { booking, assignment: assignment(db), pickupAtMs, now: NOW });

  assert.equal(risk().reason, "SIGNAL_LOST", "on the way without any position");
  // 30 km out with 20 minutes to go.
  recordDriverLocations(db, { assignment: assignment(db) }, [{ lat: 27.1167, lng: 81.0, recordedAt: at(20) }], { now: NOW });
  assert.equal(risk().reason, "RUNNING_LATE");
  assert.match(risk().detail, /may be \d+ min late/);

  // Close enough to make it, but parked 3 km away for 10 minutes.
  const parked = database();
  parked.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE'").run();
  const points = [600, 420, 240, 60].map((secondsAgo) => ({ lat: 26.8737, lng: 80.9462, recordedAt: at(secondsAgo) }));
  recordDriverLocations(parked, { assignment: assignment(parked) }, points, { now: NOW });
  assert.equal(assessDriverLocationRisk(parked, { booking, assignment: assignment(parked), pickupAtMs, now: NOW }).reason, "NOT_MOVING");

  // Moving towards pickup and on time: no alert.
  const moving = database();
  moving.prepare("UPDATE driver_assignments SET assignment_status = 'EN_ROUTE'").run();
  recordDriverLocations(moving, { assignment: assignment(moving) }, [600, 300, 30].map((secondsAgo, index) => ({ lat: 26.88 - index * 0.01, lng: 80.9462, recordedAt: at(secondsAgo) })), { now: NOW });
  assert.equal(assessDriverLocationRisk(moving, { booking, assignment: assignment(moving), pickupAtMs, now: NOW }), null);
});

test("a missed-pickup alert names the pickup in the trip city's time (ADR 023)", async () => {
  const { assessDriverLocationRisk } = await import("../src/services/driverLocationService.js");
  const { COUNTRY_TIME } = await import("../src/lib/localTime.js");
  const db = database();
  // 09:00 in Bangkok is 07:30 in India.
  const pickupAtMs = Date.parse("2026-09-14T09:00:00+07:00");
  const risk = (time) => assessDriverLocationRisk(db, { booking: {}, assignment: assignment(db), pickupAtMs, now: NOW, time });
  assert.match(risk(COUNTRY_TIME.Thailand).detail, /the 09:00 ICT pickup/);
  assert.match(risk(undefined).detail, /the 07:30 IST pickup/, "India time when the trip city is unknown");
});
