import assert from "node:assert/strict";
import test from "node:test";
import { requestBoundary, validateBody } from "../src/middleware/validation.js";
import {
  authSchemas,
  bookingCreateSchema,
  checkoutSchemas,
  reviewSchemas,
  supplierSchemas,
  supportSchemas,
} from "../src/validators/apiSchemas.js";

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function run(schema, body) {
  const req = { body, requestId: "req-validation", method: "POST", originalUrl: "/api/test" };
  const res = response();
  let nextCalled = false;
  await validateBody(schema)(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test("request schemas normalize safe authentication input and reject secret-field errors safely", async () => {
  const valid = await run(authSchemas.signup, {
    name: "  Test Traveler  ",
    email: "  Traveler@Example.COM ",
    password: "long-enough-password",
    phone: "+91 99999 99999",
  });
  assert.equal(valid.nextCalled, true);
  assert.equal(valid.req.body.name, "Test Traveler");
  assert.equal(valid.req.body.email, "traveler@example.com");

  const invalid = await run(authSchemas.signup, {
    name: "T",
    email: "private@example.com",
    password: "secret",
  });
  assert.equal(invalid.nextCalled, false);
  assert.equal(invalid.res.statusCode, 400);
  assert.deepEqual(invalid.res.payload, {
    error: "Request validation failed",
    code: "VALIDATION_ERROR",
    requestId: "req-validation",
  });
  assert.equal(JSON.stringify(invalid.res.payload).includes("private@example.com"), false);
  assert.equal(JSON.stringify(invalid.res.payload).includes("secret"), false);
});

test("critical mutation schemas enforce dates, payment signatures, ratings and percentages", async () => {
  const cases = [
    [bookingCreateSchema, { product_id: "prod_1", activity_date: "not-a-date" }],
    [checkoutSchemas.razorpayVerify, { bookingId: "book_1", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "short" }],
    [reviewSchemas.create, { bookingId: "book_1", comment: "Good trip", experienceRating: 9 }],
    [supportSchemas.refundDecision, { action: "APPROVE", resolution: "Valid reason", approvedRefundPercentage: 101 }],
    [supplierSchemas.geofence, { zoneName: "Goa", city: "Goa", centerLat: 95, centerLng: 73 }],
  ];
  for (const [schema, body] of cases) {
    const result = await run(schema, body);
    assert.equal(result.res.statusCode, 400);
    assert.equal(result.res.payload.code, "VALIDATION_ERROR");
  }
});

test("booking creation accepts the UI payload with nullable coordinates", async () => {
  const result = await run(bookingCreateSchema, {
    product_id: "goa-mandovi-sunset-cruise",
    activity_date: "2030-01-15",
    adults: 2,
    children: 0,
    luggage_bags: 0,
    pickup_time: "17:30",
    pickup_location: "Meet at Santa Monica Jetty, Panaji",
    pickup_lat: null,
    pickup_lng: null,
    drop_lat: null,
    drop_lng: null,
    traveler_name: "Browser Traveler",
    traveler_email: "browser@example.com",
    traveler_phone: "+919876543210",
    payment_method: "DEMO",
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.body.pickup_lat, undefined);
  assert.equal(result.req.body.pickup_lng, undefined);
  assert.equal(result.req.body.drop_lat, undefined);
  assert.equal(result.req.body.drop_lng, undefined);
});

test("request boundary blocks prototype keys without echoing payloads", () => {
  const malicious = JSON.parse('{"__proto__":{"admin":true},"password":"must-not-leak"}');
  const req = { body: malicious, query: {}, requestId: "req-boundary", method: "POST", originalUrl: "/api/test" };
  const res = response();
  let nextCalled = false;
  requestBoundary(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "VALIDATION_ERROR");
  assert.equal(JSON.stringify(res.payload).includes("must-not-leak"), false);
});
