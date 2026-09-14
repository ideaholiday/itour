import crypto from "node:crypto";
import { ARRIVAL_RADIUS_M, distanceMeters, telemetryFromAssignment } from "./driverLocationService.js";
import { tripEta } from "./etaService.js";

/**
 * The traveler's live trip page (ADR 012, phase 2).
 *
 * A signed link, sent when the driver goes on the way, opens /track/<ref>
 * without signing in. The traveler sees the driver's position for the whole
 * trip (on the way, arrived, started) with an ETA to pickup, then to drop-off.
 * The signature covers the booking id and reference, so a link can't be
 * reused for another booking; it expires 7 days after it was sent.
 */

const LINK_TTL_SECONDS = 7 * 24 * 3600;
const SHOWN_STATUSES = new Set(["EN_ROUTE", "ARRIVED", "TRIP_STARTED"]);

const secret = () => process.env.DOCUMENT_LINK_SECRET || process.env.OTP_SECRET || process.env.JWT_SECRET || "idea-holiday-local-document-secret-change-me";
const sign = (payload) => crypto.createHmac("sha256", secret()).update(`trip-tracking.${payload}`).digest("base64url");

export function createTrackingToken(booking, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ b: booking.id, r: booking.ref, exp: Math.floor(now / 1000) + LINK_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyTrackingToken(token, booking, now = Date.now()) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.b === booking.id && data.r === booking.ref && Number(data.exp) >= Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function trackingUrl(booking, now = Date.now()) {
  const base = String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/$/, "");
  return `${base}/track/${encodeURIComponent(booking.ref)}#${createTrackingToken(booking, now)}`;
}

function coordinate(lat, lng) {
  const point = { lat: Number(lat), lng: Number(lng) };
  return lat === null || lat === undefined || lng === null || lng === undefined || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ? null : point;
}

export function findTrackableBooking(db, ref) {
  return db.prepare(`SELECT b.id, b.ref, b.user_id, b.traveler_email, b.status, b.payment_status, b.activity_date, b.pickup_time,
      b.pickup_location, b.pickup_lat, b.pickup_lng, b.drop_location, b.drop_lat, b.drop_lng, p.title AS product_title
    FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.ref = ?`).get(String(ref || "").toUpperCase()) || null;
}

/** What the tracking page shows. Never includes the traveler's own contact details. */
export async function buildTripTracking(db, booking, { now = new Date(), eta = tripEta } = {}) {
  const assignment = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = ? AND assignment_status <> 'CANCELLED'").get(booking.id);
  const cancelled = String(booking.status || "").toLowerCase() === "cancelled";
  const accepted = assignment?.acknowledgement === "ACCEPTED";
  const status = cancelled ? "CANCELLED"
    : !assignment || !accepted ? "DRIVER_PENDING"
      : assignment.assignment_status;
  const pickup = coordinate(booking.pickup_lat, booking.pickup_lng);
  const drop = coordinate(booking.drop_lat, booking.drop_lng);
  const location = SHOWN_STATUSES.has(status) ? telemetryFromAssignment(assignment, now) : null;

  let arrival = null;
  if (location && location.freshness !== "LOST") {
    const target = status === "EN_ROUTE" ? pickup : status === "TRIP_STARTED" ? drop : null;
    if (target) {
      const estimate = await eta(location, target, { now: now.getTime() });
      if (estimate) arrival = { ...estimate, to: status === "EN_ROUTE" ? "PICKUP" : "DROP" };
    }
  }

  return {
    ref: booking.ref,
    title: booking.product_title || "Your trip",
    activityDate: booking.activity_date,
    pickupTime: booking.pickup_time,
    pickupLocation: booking.pickup_location,
    dropLocation: booking.drop_location || null,
    pickup,
    drop,
    status,
    driver: accepted && !cancelled ? {
      name: assignment.driver_name,
      phone: assignment.driver_phone,
      vehicleModel: assignment.vehicle_model,
      vehicleNumber: assignment.vehicle_number,
    } : null,
    location,
    distanceToPickupM: status === "EN_ROUTE" ? distanceMeters(location, pickup) : null,
    arrivalRadiusM: ARRIVAL_RADIUS_M,
    eta: arrival,
    updatedAt: now.toISOString(),
  };
}
