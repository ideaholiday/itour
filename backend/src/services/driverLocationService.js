import { randomUUID } from "node:crypto";
import { INDIA_TIME, localClock } from "../lib/localTime.js";

/**
 * Live driver location (ADR 012).
 *
 * The driver's phone sends positions from the private trip page. A driver must
 * be sharing before they can go "On the way", arrive or start the trip, and
 * keeps sharing until the trip is completed. Operations, the supplier and the
 * traveler see the position for the whole trip. Pings are deleted after
 * 30 days.
 *
 * Nothing here invents a position: a trip with no accepted ping has no
 * location, and maps say so.
 */

export const LOCATION_RETENTION_DAYS = 30;
/** How recent a fix must be before a driver may change trip status. */
export const LOCATION_REQUIRED_WITHIN_MS = 5 * 60_000;
/** Positions worse than this are not stored (indoor or cell-tower guesses). */
export const MAX_ACCURACY_M = 1_000;
export const MAX_POINTS_PER_BATCH = 20;
const MAX_SPEED_KMH = 250;
const MAX_CLOCK_SKEW_MS = 2 * 60_000;
const MAX_POINT_AGE_MS = 6 * 3_600_000;
/** Statuses during which a driver's position may be recorded. */
const TRACKABLE_STATUSES = new Set(["ASSIGNED", "EN_ROUTE", "ARRIVED", "TRIP_STARTED"]);

function locationError(message, status = 400, code = "INVALID_LOCATION") {
  return Object.assign(new Error(message), { status, code });
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A validated point, or the reason it was rejected. */
export function normalizeLocationPoint(point, now = new Date()) {
  const lat = finiteOrNull(point?.lat);
  const lng = finiteOrNull(point?.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
    return { rejected: "INVALID_COORDINATES" };
  }
  const accuracy = finiteOrNull(point.accuracy ?? point.accuracy_m);
  if (accuracy !== null && (accuracy < 0 || accuracy > MAX_ACCURACY_M)) return { rejected: "LOW_ACCURACY" };
  const recordedMs = point.recordedAt || point.recorded_at ? Date.parse(point.recordedAt || point.recorded_at) : now.getTime();
  if (!Number.isFinite(recordedMs)) return { rejected: "INVALID_TIME" };
  if (recordedMs > now.getTime() + MAX_CLOCK_SKEW_MS) return { rejected: "FUTURE_TIME" };
  if (recordedMs < now.getTime() - MAX_POINT_AGE_MS) return { rejected: "STALE_TIME" };
  let speed = finiteOrNull(point.speed_kmh ?? point.speedKmh);
  if (speed === null && finiteOrNull(point.speed) !== null) speed = Number(point.speed) * 3.6; // Geolocation API reports m/s
  if (speed !== null && (speed < 0 || speed > MAX_SPEED_KMH)) return { rejected: "IMPOSSIBLE_SPEED" };
  const heading = finiteOrNull(point.heading);
  return {
    point: {
      lat,
      lng,
      accuracy_m: accuracy === null ? null : Math.round(accuracy),
      speed_kmh: speed === null ? null : Math.round(speed),
      heading: heading === null || heading < 0 || heading > 360 ? null : Math.round(heading),
      recorded_at: new Date(recordedMs).toISOString(),
    },
  };
}

/**
 * Store a batch of positions for an assignment and move its latest position
 * forward. Returns counts so the phone can tell the driver what was accepted.
 */
export function recordDriverLocations(db, { assignment, booking }, points, { source = "DRIVER", now = new Date() } = {}) {
  if (!assignment) throw locationError("Driver assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
  if (!Array.isArray(points) || points.length === 0) throw locationError("Send at least one location point");
  if (points.length > MAX_POINTS_PER_BATCH) throw locationError(`Send at most ${MAX_POINTS_PER_BATCH} points at a time`);
  const status = String(assignment.assignment_status || "").toUpperCase();
  if (!TRACKABLE_STATUSES.has(status)) throw locationError("Location sharing has ended for this trip", 409, "TRIP_NOT_TRACKABLE");
  if (source === "DRIVER" && assignment.acknowledgement && assignment.acknowledgement !== "ACCEPTED") {
    throw locationError("Accept the trip before sharing location", 409, "TRIP_NOT_ACCEPTED");
  }

  const accepted = [];
  const rejected = {};
  for (const raw of points) {
    const result = normalizeLocationPoint(raw, now);
    if (result.point) accepted.push(result.point);
    else rejected[result.rejected] = (rejected[result.rejected] || 0) + 1;
  }
  if (accepted.length === 0) {
    const reason = Object.keys(rejected)[0];
    throw locationError(reason === "LOW_ACCURACY"
      ? "Your GPS signal is too weak. Move to an open area and try again."
      : "The location could not be used. Check that location is on for this browser.", 422, reason);
  }

  const receivedAt = now.toISOString();
  const bookingId = booking?.id || assignment.booking_id;
  const supplierId = booking?.supplier_id || assignment.supplier_id;
  const insert = db.prepare(`INSERT INTO driver_location_pings
    (id, assignment_id, booking_id, supplier_id, lat, lng, accuracy_m, speed_kmh, heading, source, recorded_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const newest = accepted.reduce((latest, point) => (point.recorded_at > latest.recorded_at ? point : latest));

  db.transaction(() => {
    for (const point of accepted) {
      insert.run(randomUUID(), assignment.id, bookingId, supplierId, point.lat, point.lng, point.accuracy_m, point.speed_kmh, point.heading, source, point.recorded_at, receivedAt);
    }
    // Batches can arrive out of order after a network gap; never move backwards.
    db.prepare(`UPDATE driver_assignments
      SET last_lat = ?, last_lng = ?, last_accuracy_m = ?, last_speed_kmh = ?, last_heading = ?, last_location_source = ?, last_location_at = ?
      WHERE id = ? AND (last_location_at IS NULL OR last_location_at < ?)`)
      .run(newest.lat, newest.lng, newest.accuracy_m, newest.speed_kmh, newest.heading, source, newest.recorded_at, assignment.id, newest.recorded_at);
  })();

  return { accepted: accepted.length, rejected, latest: latestDriverLocation(db, assignment.id, now) };
}

/** LIVE under a minute, DELAYED up to five, then LOST. */
export function locationFreshness(lastLocationAt, now = new Date()) {
  const at = Date.parse(lastLocationAt || "");
  if (!Number.isFinite(at)) return "NONE";
  const ageMs = now.getTime() - at;
  if (ageMs <= 60_000) return "LIVE";
  if (ageMs <= 5 * 60_000) return "DELAYED";
  return "LOST";
}

/** The telemetry shape maps use, or null when nothing was reported. */
export function telemetryFromAssignment(row, now = new Date()) {
  if (!row || row.last_lat === null || row.last_lat === undefined || row.last_lng === null || row.last_lng === undefined || !row.last_location_at) return null;
  return {
    lat: Number(row.last_lat),
    lng: Number(row.last_lng),
    accuracy_m: finiteOrNull(row.last_accuracy_m),
    speed_kmh: finiteOrNull(row.last_speed_kmh),
    heading: finiteOrNull(row.last_heading),
    source: row.last_location_source || "DRIVER",
    updated_at: row.last_location_at,
    freshness: locationFreshness(row.last_location_at, now),
  };
}

export function latestDriverLocation(db, assignmentId, now = new Date()) {
  const row = db.prepare("SELECT last_lat, last_lng, last_accuracy_m, last_speed_kmh, last_heading, last_location_source, last_location_at FROM driver_assignments WHERE id = ?").get(assignmentId);
  return telemetryFromAssignment(row, now);
}

/** Recent positions for a trip, oldest first, for drawing its path. */
export function driverLocationTrail(db, assignmentId, { limit = 300 } = {}) {
  return db.prepare(`SELECT lat, lng, accuracy_m, speed_kmh, heading, source, recorded_at FROM driver_location_pings
    WHERE assignment_id = ? ORDER BY recorded_at DESC LIMIT ?`).all(assignmentId, Math.min(Math.max(Number(limit) || 300, 1), 1_000)).reverse();
}

/** Throws unless the driver's own phone reported a position in the last five minutes. */
export function assertDriverSharingLocation(db, assignmentId, now = new Date()) {
  const row = db.prepare("SELECT last_location_at, last_location_source FROM driver_assignments WHERE id = ?").get(assignmentId);
  const at = Date.parse(row?.last_location_at || "");
  if (row?.last_location_source !== "DRIVER" || !Number.isFinite(at) || now.getTime() - at > LOCATION_REQUIRED_WITHIN_MS) {
    throw locationError("Share your live location first. Tap the button again and allow location for this page.", 409, "LOCATION_SHARING_REQUIRED");
  }
}

/** Delete positions older than the retention period, including each trip's last position. */
export function purgeExpiredDriverLocations(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - LOCATION_RETENTION_DAYS * 86_400_000).toISOString();
  return db.transaction(() => ({
    pings: db.prepare("DELETE FROM driver_location_pings WHERE received_at < ?").run(cutoff).changes,
    assignments: db.prepare(`UPDATE driver_assignments
      SET last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL, last_speed_kmh = NULL, last_heading = NULL, last_location_source = NULL, last_location_at = NULL
      WHERE last_location_at IS NOT NULL AND last_location_at < ?`).run(cutoff).changes,
  }))();
}

/** Great-circle distance in metres, or null when either point is missing. */
export function distanceMeters(from, to) {
  const points = [from?.lat, from?.lng, to?.lat, to?.lng].map(finiteOrNull);
  if (points.some((value) => value === null)) return null;
  const [lat1, lng1, lat2, lng2] = points;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Travel time from straight-line distance, for alerts and as the ETA fallback:
 * roads are ~1.35× the straight line; city trips average ~22 km/h, regional
 * ~40 km/h and highway runs ~55 km/h in India.
 */
export function estimateDrive(distanceM) {
  if (!Number.isFinite(distanceM)) return null;
  const roadKm = (distanceM * 1.35) / 1000;
  const speedKmh = roadKm < 10 ? 22 : roadKm < 50 ? 40 : 55;
  return { distanceM: Math.round(roadKm * 1000), minutes: Math.max(1, Math.ceil((roadKm / speedKmh) * 60)) };
}

/** Within this distance of pickup the driver page suggests tapping Arrived. */
export const ARRIVAL_RADIUS_M = 150;
export const LOCATION_RISK = Object.freeze({ watchMinutesBefore: 30, lateGraceMinutes: 10, stillWindowMinutes: 10, stillRadiusM: 150, farFromPickupM: 1_000 });

/**
 * Why a driver may miss a pickup that starts soon, from what their phone
 * reported. Returns null when nothing looks wrong. Uses the local estimate only,
 * so the scheduler never spends paid routing calls.
 */
export function assessDriverLocationRisk(db, { booking, assignment, pickupAtMs, now = new Date(), time = INDIA_TIME }) {
  const status = assignment?.assignment_status;
  const minutesToPickup = Math.round((pickupAtMs - now.getTime()) / 60_000);
  // The pickup in the trip city's own time: IST in India, ICT in Thailand (ADR 023).
  const pickupClock = `${localClock(pickupAtMs, time)} ${time.label}`;
  if (status === "ASSIGNED") {
    return { reason: "NOT_ON_THE_WAY", detail: `Driver has not started for the ${pickupClock} pickup (${minutesToPickup > 0 ? `${minutesToPickup} min left` : "pickup time reached"})` };
  }
  if (status !== "EN_ROUTE") return null;
  const location = telemetryFromAssignment(assignment, now);
  if (!location || location.freshness === "LOST") {
    return { reason: "SIGNAL_LOST", detail: location ? `Driver's live location stopped ${Math.round((now.getTime() - Date.parse(location.updated_at)) / 60_000)} min ago while on the way` : "Driver is on the way but has not shared a location" };
  }
  const pickup = { lat: booking.pickup_lat, lng: booking.pickup_lng };
  const distance = distanceMeters(location, pickup);
  if (distance !== null) {
    const drive = estimateDrive(distance);
    const lateBy = Math.round((now.getTime() + drive.minutes * 60_000 - pickupAtMs) / 60_000);
    if (lateBy > LOCATION_RISK.lateGraceMinutes) {
      return { reason: "RUNNING_LATE", detail: `Driver is about ${(drive.distanceM / 1000).toFixed(1)} km away and may be ${lateBy} min late for the ${pickupClock} pickup` };
    }
  }
  const since = new Date(now.getTime() - LOCATION_RISK.stillWindowMinutes * 60_000).toISOString();
  const recent = db.prepare("SELECT lat, lng, recorded_at FROM driver_location_pings WHERE assignment_id = ? AND source = 'DRIVER' AND recorded_at >= ? ORDER BY recorded_at").all(assignment.id, since);
  const spanMinutes = recent.length > 1 ? (Date.parse(recent.at(-1).recorded_at) - Date.parse(recent[0].recorded_at)) / 60_000 : 0;
  if (spanMinutes >= LOCATION_RISK.stillWindowMinutes - 2 && (distance === null || distance > LOCATION_RISK.farFromPickupM)) {
    const moved = Math.max(...recent.map((point) => distanceMeters(recent[0], point)));
    if (moved < LOCATION_RISK.stillRadiusM) {
      return { reason: "NOT_MOVING", detail: `Driver has not moved for ${Math.round(spanMinutes)} min${distance !== null ? `, about ${(distance / 1000).toFixed(1)} km from pickup` : ""}` };
    }
  }
  return null;
}
