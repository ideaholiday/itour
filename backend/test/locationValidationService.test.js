import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { seedCanonicalLocations } from "../src/data/canonicalLocations.js";
import {
  getPickupSuggestions,
  validateBookingLocations,
  validatePickupPoint,
  validateTransferRoute,
} from "../src/services/locationValidationService.js";

function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, product_type TEXT, title TEXT, city TEXT, state TEXT);
    CREATE TABLE canonical_locations (id TEXT PRIMARY KEY, name TEXT, short_name TEXT, iata_code TEXT, location_type TEXT, city TEXT, state TEXT, country TEXT, lat REAL, lng REAL, radius_km REAL, aliases TEXT, is_active INTEGER, created_at TEXT);
    CREATE TABLE product_location_rules (id TEXT PRIMARY KEY, product_id TEXT, rule_side TEXT, rule_mode TEXT, fixed_location_id TEXT, allowed_location_types TEXT, center_lat REAL, center_lng REAL, radius_km REAL, allowed_state TEXT, allowed_city TEXT, polygon_coordinates TEXT, error_message TEXT, suggestion TEXT, is_active INTEGER, UNIQUE(product_id, rule_side));
    CREATE TABLE transfer_routes (id TEXT PRIMARY KEY, product_id TEXT, route_type TEXT, origin_name TEXT, origin_lat REAL, origin_lng REAL, origin_radius_km REAL, origin_iata TEXT, origin_location_id TEXT, dest_name TEXT, dest_lat REAL, dest_lng REAL, dest_radius_km REAL, dest_iata TEXT, dest_location_id TEXT, interstate_permit_tax INTEGER, night_allowance_inr REAL);
    CREATE TABLE day_tours (id TEXT PRIMARY KEY, product_id TEXT, duration_hours REAL, distance_km_limit REAL, available_time_slots TEXT, group_type TEXT, places_covered TEXT, vehicle_rules TEXT, pickup_service_type TEXT, advance_booking_cutoff_hours REAL, operating_start_time TEXT, operating_end_time TEXT);
    CREATE TABLE package_itineraries (id TEXT PRIMARY KEY, product_id TEXT, total_days INTEGER, total_nights INTEGER, day_wise_details TEXT, start_city TEXT, end_city TEXT, vehicle_category TEXT);
  `);
  seedCanonicalLocations(db);
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)").run("mopa", "TRANSFER", "Mopa to North Goa", "North Goa", "Goa");
  db.prepare(`INSERT INTO transfer_routes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("route_mopa", "mopa", "AIRPORT_PICKUP", "Mopa Airport (GOX)", 15.7538, 73.8643, 3, "GOX", "airport_gox", "North Goa Hotels", 15.5439, 73.7553, 40, null, null, 0, 300);
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)").run("tour", "DAY_TOUR", "North Goa Tour", "North Goa", "Goa");
  db.prepare(`INSERT INTO day_tours VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("day_tour", "tour", 8, 40, JSON.stringify(["09:00", "14:00"]), "PRIVATE", "[]", JSON.stringify([{ pax_max: 6, category: "SUV" }]), "HOTEL_PICKUP_ANYWHERE", 4, "06:00", "22:00");
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)").run("package", "MULTI_DAY_PACKAGE", "Goa Package", "Goa", "Goa");
  db.prepare("INSERT INTO package_itineraries VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("pkg", "package", 3, 2, JSON.stringify([{ day: 1, city: "North Goa" }, { day: 2, city: "South Goa" }, { day: 3, city: "Goa" }]), "Goa", "Goa", "SEDAN");
  return db;
}

test("rejects the Mopa to Delhi drop-off with a structured drop code", () => {
  const db = fixture();
  const result = validateTransferRoute(db, "mopa", 15.7538, 73.8643, 28.5562, 77.1);
  assert.equal(result.valid, false);
  assert.equal(result.code, "INVALID_DROP_POINT");
  assert.ok(result.detail.provided_distance_km > 1_000);
  assert.match(result.detail.suggestion, /North Goa/i);
});

test("accepts Mopa to Calangute inside the product radius", () => {
  const db = fixture();
  const result = validateTransferRoute(db, "mopa", 15.7538, 73.8643, 15.545, 73.7523);
  assert.equal(result.valid, true);
  assert.ok(result.drop.distanceKm < 5);
});

test("quote validation defers transfer location checks until guest selects a point", () => {
  const db = fixture();
  const result = validateBookingLocations(db, { product_id: "mopa", activity_date: "2035-01-15", adults: 1 }, { requireOperationalDetails: false, deferLocationValidation: true });
  assert.equal(result.valid, true);
  assert.equal(result.pickup, null);
  assert.equal(result.drop, null);
});

test("non-quote validation still requires transfer locations", () => {
  const db = fixture();
  const result = validateBookingLocations(db, { product_id: "mopa", activity_date: "2035-01-15", adults: 1 }, { requireOperationalDetails: false });
  assert.equal(result.valid, false);
  assert.equal(result.code, "INVALID_PICKUP_POINT");
});

test("fixed airport pickup cannot be overridden", () => {
  const db = fixture();
  const result = validatePickupPoint(db, "mopa", "PICKUP", 15.3808, 73.8314, "Dabolim Airport");
  assert.equal(result.valid, false);
  assert.equal(result.code, "INVALID_PICKUP_POINT");
  assert.equal(result.detail.fixed_location, "Manohar International Airport, Mopa (GOX)");
});

test("city-to-city routes enforce distinct endpoint radii and interstate permits", () => {
  const db = fixture();
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)").run("city_route", "TRANSFER", "Delhi to Agra", "Delhi NCR", "Delhi");
  db.prepare(`INSERT INTO transfer_routes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("route_city", "city_route", "CITY_TO_CITY", "Delhi NCR", 28.6139, 77.2090, 25, null, null, "Agra", 27.1767, 78.0081, 25, null, null, 1, 300);
  assert.equal(validateTransferRoute(db, "city_route", 28.6139, 77.2090, 27.1767, 78.0081).valid, true);
  const outside = validateTransferRoute(db, "city_route", 19.0896, 72.8656, 27.1767, 78.0081);
  assert.equal(outside.valid, false);
  assert.equal(outside.code, "INVALID_PICKUP_POINT");
});

test("product-scoped airport suggestions exclude other states", () => {
  const db = fixture();
  const suggestions = getPickupSuggestions(db, "mopa", "PICKUP", "airport");
  assert.ok(suggestions.some((item) => item.iataCode === "GOX"));
  assert.ok(suggestions.every((item) => item.state === "Goa"));
});

test("polygon rules use deterministic point-in-polygon validation", () => {
  const db = fixture();
  db.prepare(`INSERT INTO product_location_rules VALUES (?, ?, 'DROP', 'ZONE_POLYGON', NULL, '[]', NULL, NULL, NULL, 'Goa', 'North Goa', ?, 'Outside polygon', 'Choose inside polygon', 1)`)
    .run("polygon", "mopa", JSON.stringify([[15.4, 73.7], [15.7, 73.7], [15.7, 73.9], [15.4, 73.9]]));
  assert.equal(validatePickupPoint(db, "mopa", "DROP", 15.545, 73.7523).valid, true);
  assert.equal(validatePickupPoint(db, "mopa", "DROP", 15.8, 73.75).code, "INVALID_DROP_POINT");
});

test("day-tour pickup rejects a different state", () => {
  const db = fixture();
  const result = validatePickupPoint(db, "tour", "PICKUP", 18.5821, 73.9197, "Pune hotel");
  assert.equal(result.valid, false);
  assert.equal(result.detail.detected_state, "Maharashtra");
});

test("day tours accept configured slots and reject arbitrary times", () => {
  const db = fixture();
  const base = { product_id: "tour", activity_date: "2035-01-15", pickup_lat: 15.545, pickup_lng: 73.7523, pickup_time: "09:00", adults: 2 };
  assert.equal(validateBookingLocations(db, base, { now: new Date("2035-01-14T00:00:00") }).valid, true);
  const invalid = validateBookingLocations(db, { ...base, pickup_time: "03:00" }, { now: new Date("2035-01-14T00:00:00") });
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /available departure slots/i);
});

test("day-tour cutoff rejects bookings less than four hours before departure", () => {
  const db = fixture();
  const result = validateBookingLocations(db, { product_id: "tour", activity_date: "2035-01-15", pickup_lat: 15.545, pickup_lng: 73.7523, pickup_time: "09:00", adults: 2 }, { now: new Date("2035-01-15T06:30:00") });
  assert.equal(result.valid, false);
  assert.match(result.error, /4 hours/i);
});

test("day-tour vehicle rules enforce the maximum supported group", () => {
  const db = fixture();
  const result = validateBookingLocations(db, { product_id: "tour", activity_date: "2035-01-15", pickup_lat: 15.545, pickup_lng: 73.7523, pickup_time: "09:00", adults: 7 }, { now: new Date("2035-01-14T00:00:00") });
  assert.equal(result.valid, false);
  assert.match(result.error, /capacity/i);
});

test("airport pickup requires a valid flight number and arrival time", () => {
  const db = fixture();
  const base = { product_id: "mopa", pickup_lat: 15.7538, pickup_lng: 73.8643, drop_lat: 15.545, drop_lng: 73.7523 };
  assert.match(validateBookingLocations(db, base).error, /flight number/i);
  assert.match(validateBookingLocations(db, { ...base, flight_number: "AI 103" }).error, /arrival time/i);
  assert.equal(validateBookingLocations(db, { ...base, flight_number: "AI 103", flight_arrival_time: "23:10" }).valid, true);
});

test("airport drop requires the scheduled departure time", () => {
  const db = fixture();
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?)").run("drop_route", "TRANSFER", "North Goa to Mopa", "North Goa", "Goa");
  db.prepare(`INSERT INTO transfer_routes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("route_drop", "drop_route", "AIRPORT_DROP", "North Goa Hotels", 15.545, 73.7523, 40, null, null, "Mopa Airport (GOX)", 15.7538, 73.8643, 3, "GOX", "airport_gox", 0, 300);
  const base = { product_id: "drop_route", pickup_lat: 15.545, pickup_lng: 73.7523, drop_lat: 15.7538, drop_lng: 73.8643, flight_number: "6E-421" };
  assert.match(validateBookingLocations(db, base).error, /departure time/i);
  assert.equal(validateBookingLocations(db, { ...base, flight_departure_time: "06:30" }).valid, true);
});

test("multi-day package enforces start/end anchors and every hotel city", () => {
  const db = fixture();
  const valid = {
    product_id: "package", pickup_lat: 15.7538, pickup_lng: 73.8643,
    drop_lat: 15.3808, drop_lng: 73.8314,
    package_hotels: [
      { day: 1, city: "North Goa", lat: 15.545, lng: 73.7523 },
      { day: 2, city: "South Goa", lat: 15.2678, lng: 73.9156 },
    ],
  };
  assert.equal(validateBookingLocations(db, valid).valid, true);
  const wrongHotel = validateBookingLocations(db, { ...valid, package_hotels: [{ day: 1, city: "Pune", lat: 18.5821, lng: 73.9197 }, valid.package_hotels[1]] });
  assert.equal(wrongHotel.valid, false);
  assert.match(wrongHotel.error, /day 1/i);
  const missing = validateBookingLocations(db, { ...valid, package_hotels: [] });
  assert.equal(missing.detail.required_hotels, 2);
});

test("free-form in-zone hotels use the hybrid ops-review trust model", () => {
  const db = fixture();
  db.prepare(`INSERT INTO product_location_rules VALUES (?, ?, 'PICKUP', 'CITY_ANYWHERE', NULL, ?, NULL, NULL, 40, 'Goa', 'North Goa', '[]', 'Outside city', 'Choose Goa', 1)`)
    .run("tour_types", "tour", JSON.stringify(["HOTEL_ZONE"]));
  const result = validatePickupPoint(db, "tour", "PICKUP", 15.49, 73.8278, "Independent hotel in Panaji");
  assert.equal(result.valid, true);
  assert.equal(result.needsOpsReview, true);
});
