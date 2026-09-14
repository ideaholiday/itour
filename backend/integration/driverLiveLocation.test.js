import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";
import { createTrackingToken } from "../src/services/tripTrackingService.js";

/**
 * Live driver location over HTTP (ADR 012): a driver can't go "On the way"
 * without sharing, the phone's positions are stored, and operations and the
 * supplier both see where the driver is.
 */

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const DOCUMENT_LINK_SECRET = "integration-document-link-secret-32-characters";
const SUPPLIER = { email: "multisolution33@gmail.com", password: "Idea@2026" };
const STAFF = { email: "gps.staff@example.test", password: "Integration@Staff2026" };

function futureDate(days = 10) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The private link a driver receives by WhatsApp or email (see driverAccessToken). */
function driverLinkToken(assignment) {
  return `${assignment.id}.${createHmac("sha256", JWT_SECRET).update(`driver:${assignment.id}:${assignment.revision}:${assignment.schedule_key}`).digest("hex")}`;
}

test("drivers share live location before going on the way, and operations and the supplier see it", async (t) => {
  const api = await startTestServer({ DOCUMENT_LINK_SECRET });
  process.env.DOCUMENT_LINK_SECRET = DOCUMENT_LINK_SECRET;
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  // A paid Goa day tour, booked by a traveler.
  const traveler = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "GPS Traveler", email: "gps.traveler@example.test", password: "GpsTraveler@2026", phone: "+919876543210" },
  });
  assert.equal(traveler.response.status, 200, JSON.stringify(traveler.data));
  const activities = (await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR")).data;
  const activity = activities.find((item) => item.groupType === "SHARED") || activities[0];
  const booking = await requestJson(api.baseUrl, "/api/bookings", {
    token: traveler.data.token,
    headers: { "Idempotency-Key": "gps-integration-booking" },
    body: {
      product_id: activity.id, activity_date: futureDate(), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00",
      pickup_location: "Calangute, Goa", traveler_name: "GPS Traveler", traveler_email: "gps.traveler@example.test",
      traveler_phone: "+919876543210", payment_method: "DEMO",
    },
  });
  assert.equal(booking.response.status, 201, JSON.stringify(booking.data));
  assert.equal((await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token: traveler.data.token, body: { bookingId: booking.data.bookingId } })).response.status, 200);

  // The supplier accepts and assigns a driver confirmed by phone.
  const supplier = (await requestJson(api.baseUrl, "/api/auth/login", { body: SUPPLIER })).data;
  const supplierId = supplier.user.supplier_id;
  const accepted = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/bookings/${booking.data.bookingId}/respond-assignment`, { token: supplier.token, body: { action: "ACCEPT" } });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  const assigned = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/assign-driver`, {
    token: supplier.token,
    body: {
      bookingId: booking.data.bookingId, driverName: "Ravi Kumar", driverPhone: "+919812345678", driverEmail: "ravi.gps@example.test",
      seatCapacity: 6, vehicleModel: "Toyota Innova Crysta", vehicleNumber: "GA-03-AB-1234", confirmedByPhone: true, note: "Called Ravi at 10:00",
    },
  });
  assert.equal(assigned.response.status, 200, JSON.stringify(assigned.data));

  const assignment = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(booking.data.bookingId);
  const session = await requestJson(api.baseUrl, "/api/driver-trips/session", { body: { token: driverLinkToken(assignment) } });
  assert.equal(session.response.status, 200, JSON.stringify(session.data));
  const driverToken = session.data.token;

  // No location yet: the driver cannot go on the way.
  const tooEarly = await requestJson(api.baseUrl, "/api/driver-trips/action", { token: driverToken, body: { action: "EN_ROUTE" } });
  assert.equal(tooEarly.response.status, 409);
  assert.equal(tooEarly.data.code, "LOCATION_SHARING_REQUIRED");

  // Unusable positions are refused with a reason the page can show.
  const weak = await requestJson(api.baseUrl, "/api/driver-trips/location", { token: driverToken, body: { points: [{ lat: 15.5449, lng: 73.7550, accuracy: 4000 }] } });
  assert.equal(weak.response.status, 422);
  assert.equal(weak.data.code, "LOW_ACCURACY");
  assert.equal((await requestJson(api.baseUrl, "/api/driver-trips/location", { body: { points: [{ lat: 15.5, lng: 73.7 }] } })).response.status, 401, "only the driver's session can send a position");

  const shared = await requestJson(api.baseUrl, "/api/driver-trips/location", {
    token: driverToken,
    body: { points: [
      { lat: 15.5401, lng: 73.7601, accuracy: 25, speed: 8, heading: 90, recordedAt: new Date(Date.now() - 20_000).toISOString() },
      { lat: 15.5449, lng: 73.7550, accuracy: 12, speed: 10, heading: 95, recordedAt: new Date().toISOString() },
    ] },
  });
  assert.equal(shared.response.status, 200, JSON.stringify(shared.data));
  assert.equal(shared.data.accepted, 2);
  assert.equal(shared.data.location.freshness, "LIVE");

  const onTheWay = await requestJson(api.baseUrl, "/api/driver-trips/action", { token: driverToken, body: { action: "EN_ROUTE" } });
  assert.equal(onTheWay.response.status, 200, JSON.stringify(onTheWay.data));
  const tripView = await requestJson(api.baseUrl, "/api/driver-trips", { token: driverToken });
  assert.equal(tripView.data.trip.location.lat, 15.5449);
  assert.equal(tripView.data.trip.arrivalRadiusM, 150);

  // The traveler follows the driver: by the signed link, or signed in; nobody else.
  const ref = booking.data.ref;
  const bookingRow = db.prepare("SELECT id, ref FROM bookings WHERE id = ?").get(booking.data.bookingId);
  assert.equal((await requestJson(api.baseUrl, `/api/tracking/${ref}`)).response.status, 404);
  assert.equal((await requestJson(api.baseUrl, `/api/tracking/${ref}`, { token: supplier.token })).response.status, 404, "a supplier uses its own bookings view");
  const byLink = await requestJson(api.baseUrl, `/api/tracking/${ref}`, { headers: { "X-Tracking-Token": createTrackingToken(bookingRow) } });
  assert.equal(byLink.response.status, 200, JSON.stringify(byLink.data));
  assert.equal(byLink.data.trip.status, "EN_ROUTE");
  assert.equal(byLink.data.trip.location.lat, 15.5449);
  assert.equal(byLink.data.trip.driver.vehicleNumber, "GA-03-AB-1234");
  const otherBookingLink = createTrackingToken({ id: "bk_someone_else", ref });
  assert.equal((await requestJson(api.baseUrl, `/api/tracking/${ref}`, { headers: { "X-Tracking-Token": otherBookingLink } })).response.status, 404);
  const signedIn = await requestJson(api.baseUrl, `/api/tracking/${ref.toLowerCase()}`, { token: traveler.data.token });
  assert.equal(signedIn.response.status, 200);
  assert.equal(signedIn.data.trip.driver.name, "Ravi Kumar");

  // Operations see the real position and the trail.
  db.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES ('usr_gps_staff', 'GPS Staff', ?, ?, '+919800000001', 'STAFF')").run(STAFF.email, hashPassword(STAFF.password));
  const staffToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: STAFF })).data.token;
  const live = await requestJson(api.baseUrl, "/api/ops/live-tracking", { token: staffToken });
  const trip = live.data.trips.find((item) => item.booking_id === booking.data.bookingId);
  assert.equal(trip.has_live_gps, true);
  assert.equal(trip.driver_telemetry.lat, 15.5449);
  assert.equal(trip.driver_telemetry.source, "DRIVER");
  const trail = await requestJson(api.baseUrl, `/api/ops/live-tracking/${assignment.id}/trail`, { token: staffToken });
  assert.deepEqual(trail.data.trail.map((point) => point.lat), [15.5401, 15.5449]);
  assert.equal((await requestJson(api.baseUrl, `/api/ops/live-tracking/${assignment.id}/trail`, { token: supplier.token })).response.status, 403, "the ops trail is for operations");

  // The supplier sees the driver's last position on the booking.
  const supplierView = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token: supplier.token });
  const supplierBooking = supplierView.data.bookings.find((item) => item.id === booking.data.bookingId);
  assert.equal(supplierBooking.driver_last_lat, 15.5449);
  assert.ok(supplierBooking.driver_last_location_at);
});
