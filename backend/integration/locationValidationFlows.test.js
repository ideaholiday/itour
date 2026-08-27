import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

let api;

before(async () => {
  api = await startTestServer();
});

after(async () => {
  await api?.stop();
});

function futureDate(days = 21) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test("HTTP transfer quote rejects Mopa to Delhi and accepts Calangute", async () => {
  const base = {
    productId: "transfer-goa-mopa-north-goa",
    pickupLat: 15.7533,
    pickupLng: 73.8658,
    passengers: 2,
    luggage: 2,
    selectedVehicle: "SEDAN",
    flight_number: "AI 103",
    flight_arrival_time: "09:30",
  };
  const rejected = await requestJson(api.baseUrl, "/api/transfers/quote", { body: { ...base, dropLat: 28.5562, dropLng: 77.1, dropAddress: "Delhi Airport" } });
  assert.equal(rejected.response.status, 400, JSON.stringify(rejected.data));
  assert.equal(rejected.data.code, "INVALID_DROP_POINT");
  assert.match(rejected.data.detail.suggestion, /North Goa/i);
  assert.ok(rejected.data.requestId);

  const accepted = await requestJson(api.baseUrl, "/api/transfers/quote", { body: { ...base, dropLat: 15.545, dropLng: 73.7523, dropAddress: "Calangute hotel" } });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.success, true);
  assert.ok(accepted.data.selectedQuote.costBreakdown.totalAmount > 0);
});

test("HTTP activity detail quote can price a transfer before pickup selection", async () => {
  const result = await requestJson(api.baseUrl, "/api/bookings/quote", {
    body: {
      product_id: "transfer-goa-mopa-north-goa",
      activity_date: futureDate(),
      adults: 1,
      children: 0,
      luggage_bags: 0,
      vehicle_category: "SEDAN",
      variant_name: "Private Sedan",
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.success, true);
  assert.ok(result.data.quote.breakdown.totalAmount > 0);
});

test("HTTP product suggestions are scoped to the fixed airport", async () => {
  const result = await requestJson(api.baseUrl, "/api/activities/transfer-goa-mopa-north-goa/pickup-suggestions?side=PICKUP&q=airport");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.suggestions.some((item) => item.iataCode === "GOX"));
  assert.ok(result.data.suggestions.every((item) => item.state === "Goa"));
});

test("HTTP day-tour quote rejects Pune pickup and accepts a Goa hotel", async () => {
  const products = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const product = products.data.find((item) => item.productType === "DAY_TOUR");
  assert.ok(product);
  const base = { product_id: product.id, activity_date: futureDate(), pickup_time: "09:00", adults: 2, children: 0, vehicle_category: "SEDAN" };
  const rejected = await requestJson(api.baseUrl, "/api/bookings/quote", { body: { ...base, pickup_lat: 18.5821, pickup_lng: 73.9197, pickup_location: "Pune hotel" } });
  assert.equal(rejected.response.status, 400, JSON.stringify(rejected.data));
  assert.equal(rejected.data.code, "INVALID_PICKUP_POINT");

  const accepted = await requestJson(api.baseUrl, "/api/bookings/quote", { body: { ...base, pickup_lat: 15.545, pickup_lng: 73.7523, pickup_location: "Calangute hotel" } });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.success, true);
});

test("HTTP multi-day quote validates arrival, departure, and per-day hotel cities", async () => {
  const products = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=MULTI_DAY_PACKAGE");
  const product = products.data.find((item) => item.packageItinerary?.total_nights >= 2);
  assert.ok(product);
  const base = {
    product_id: product.id,
    activity_date: futureDate(30),
    pickup_time: "09:00",
    pickup_lat: 15.7538,
    pickup_lng: 73.8643,
    drop_lat: 15.3808,
    drop_lng: 73.8314,
    adults: 2,
    children: 0,
    vehicle_category: "SEDAN",
    package_hotels: Array.from({ length: Number(product.packageItinerary.total_nights) }, (_, index) => ({
      day: index + 1,
      name: index === 0 ? "Calangute Hotel" : "South Goa Hotel",
      city: "Goa",
      lat: index === 0 ? 15.545 : 15.2678,
      lng: index === 0 ? 73.7523 : 73.9156,
    })),
  };
  const accepted = await requestJson(api.baseUrl, "/api/bookings/quote", { body: base });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  const missingHotels = await requestJson(api.baseUrl, "/api/bookings/quote", { body: { ...base, package_hotels: [] } });
  assert.equal(missingHotels.response.status, 400, JSON.stringify(missingHotels.data));
  assert.equal(missingHotels.data.code, "INVALID_BOOKING_PARAMS");
});
