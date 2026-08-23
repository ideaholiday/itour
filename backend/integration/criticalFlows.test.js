import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

let api;

before(async () => {
  api = await startTestServer({
    METRICS_TOKEN: "integration-metrics-token-with-at-least-32-characters",
  });
});

after(async () => {
  await api?.stop();
});

function futureDate(days = 14) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function signup(email) {
  const result = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: {
      name: "Integration Traveler",
      email,
      password: "Integration@2026",
      phone: "+919876543210",
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.user.role, "TRAVELER");
  assert.ok(result.data.token);
  return result.data;
}

async function waitForAudit(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const database = new Database(api.databasePath, { readonly: true });
    const rows = database.prepare("SELECT * FROM audit_logs ORDER BY created_at, id").all();
    database.close();
    const match = rows.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Expected audit event was not persisted");
}

test("critical traveler API journey enforces identity, ownership, payment, and auditing", async (t) => {
  const requestId = "integration-public-discovery";
  const health = await requestJson(api.baseUrl, "/api/health", {
    headers: { "X-Request-Id": requestId },
  });
  assert.equal(health.response.status, 200);
  assert.equal(health.response.headers.get("x-request-id"), requestId);
  assert.equal(health.data.ok, true);

  const protectedMetrics = await requestJson(api.baseUrl, "/api/metrics");
  assert.equal(protectedMetrics.response.status, 401);
  assert.equal(protectedMetrics.data.code, "AUTH_REQUIRED");

  const telemetry = await requestJson(api.baseUrl, "/api/telemetry/web-vitals", {
    body: {
      app: "vite",
      name: "LCP",
      value: 1800,
      rating: "good",
      route: "/search",
      navigationType: "navigate",
    },
  });
  assert.equal(telemetry.response.status, 202);

  const scrapedMetrics = await requestJson(api.baseUrl, "/api/metrics", {
    token: "integration-metrics-token-with-at-least-32-characters",
  });
  assert.equal(scrapedMetrics.response.status, 200);
  assert.match(scrapedMetrics.data, /idea_holiday_http_requests_total/);
  assert.match(scrapedMetrics.data, /idea_holiday_frontend_web_vital/);

  await t.test("public discovery and stable validation errors", async () => {
    const destinations = await requestJson(api.baseUrl, "/api/destinations");
    assert.equal(destinations.response.status, 200);
    assert.ok(destinations.data.some((destination) => destination.name === "Goa"));

    const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
    assert.equal(activities.response.status, 200);
    assert.ok(activities.data.length > 0);
    assert.ok(activities.data.every((activity) => activity.productType === "DAY_TOUR"));

    const invalidRequestId = "integration-invalid-signup";
    const invalidSignup = await requestJson(api.baseUrl, "/api/auth/signup", {
      headers: { "X-Request-Id": invalidRequestId },
      body: { name: "A", email: "not-an-email", password: "short" },
    });
    assert.equal(invalidSignup.response.status, 400);
    assert.deepEqual(Object.keys(invalidSignup.data).sort(), ["code", "error", "requestId"]);
    assert.equal(invalidSignup.data.code, "VALIDATION_ERROR");
    assert.equal(invalidSignup.data.requestId, invalidRequestId);
  });

  const ownerEmail = "integration.owner@example.test";
  const owner = await signup(ownerEmail);

  await t.test("legacy identity headers are ignored and traveler cannot access admin APIs", async () => {
    const headersOnly = await requestJson(api.baseUrl, "/api/bookings", {
      headers: {
        "X-User-Id": owner.user.id,
        "X-User-Email": ownerEmail,
      },
    });
    assert.equal(headersOnly.response.status, 401);
    assert.equal(headersOnly.data.code, "AUTH_REQUIRED");

    const admin = await requestJson(api.baseUrl, "/api/admin/metrics", { token: owner.token });
    assert.equal(admin.response.status, 403);
    assert.equal(admin.data.code, "FORBIDDEN");

    const denial = await waitForAudit((row) => row.action === "AUTHORIZATION_DENIED" && row.outcome === "DENIED");
    assert.ok(denial.request_id);
  });

  let booking;
  await t.test("traveler discovers, quotes, and books an approved activity", async () => {
    const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
    const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
    assert.ok(activity?.id);

    const quoteInput = {
      product_id: activity.id,
      activity_date: futureDate(),
      adults: 2,
      children: 0,
      luggage_bags: 0,
      pickup_time: "09:00",
      pickup_location: "Calangute, Goa",
    };
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { body: quoteInput });
    assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
    assert.equal(quote.data.quote.productId, activity.id);
    assert.ok(quote.data.quote.breakdown.totalAmount > 0);

    const created = await requestJson(api.baseUrl, "/api/bookings", {
      token: owner.token,
      headers: { "Idempotency-Key": "integration-owner-booking" },
      body: {
        ...quoteInput,
        traveler_name: owner.user.name,
        traveler_email: ownerEmail,
        traveler_phone: "+919876543210",
        payment_method: "DEMO",
      },
    });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    assert.equal(created.data.assignment.status, "RESERVED_PENDING_PAYMENT");
    assert.equal(created.data.payment_status, "PENDING");
    assert.ok(created.data.bookingId);
    assert.ok(created.data.ref);
    booking = created.data;

    const idempotent = await requestJson(api.baseUrl, "/api/bookings", {
      token: owner.token,
      headers: { "Idempotency-Key": "integration-owner-booking" },
      body: {
        ...quoteInput,
        traveler_name: owner.user.name,
        traveler_email: ownerEmail,
        traveler_phone: "+919876543210",
        payment_method: "DEMO",
      },
    });
    assert.equal(idempotent.response.status, 200, JSON.stringify(idempotent.data));
    assert.equal(idempotent.data.idempotent, true);
    assert.equal(idempotent.data.bookingId, booking.bookingId);
  });

  await t.test("only the booking owner can pay for and read the booking", async () => {
    const other = await signup("integration.other@example.test");
    const forbidden = await requestJson(api.baseUrl, `/api/bookings/${booking.ref}`, { token: other.token });
    assert.equal(forbidden.response.status, 403);
    assert.equal(forbidden.data.code, "FORBIDDEN");

    const payment = await requestJson(api.baseUrl, "/api/checkout/demo-payment", {
      token: owner.token,
      body: { bookingId: booking.bookingId },
    });
    assert.equal(payment.response.status, 200, JSON.stringify(payment.data));
    assert.equal(payment.data.success, true);
    assert.equal(payment.data.demo, true);

    const voucher = await requestJson(api.baseUrl, `/api/bookings/${booking.ref}`, { token: owner.token });
    assert.equal(voucher.response.status, 200, JSON.stringify(voucher.data));
    assert.equal(voucher.data.booking.payment_status, "PAID");
    assert.equal(voucher.data.booking.status, "confirmed");
    assert.ok(/^\d{6}$/.test(voucher.data.booking.pickupOtp));
    assert.equal("otp_hash" in voucher.data.booking, false);
    assert.equal("otp_encrypted" in voucher.data.booking, false);

    const documents = await requestJson(api.baseUrl, `/api/bookings/${booking.ref}/documents`, { token: owner.token });
    assert.equal(documents.response.status, 200, JSON.stringify(documents.data));
    assert.match(documents.data.documents.voucherUrl, /\/documents\/voucher\?token=/);
    assert.match(documents.data.documents.invoiceUrl, /\/documents\/invoice\?token=/);

    const signedVoucher = await fetch(documents.data.documents.voucherUrl);
    assert.equal(signedVoucher.status, 200);
    assert.match(await signedVoucher.text(), new RegExp(booking.ref));

    const bookingAudit = await waitForAudit((row) => row.action === "BOOKING_CHANGED" && row.actor_id === owner.user.id);
    assert.equal(bookingAudit.actor_role, "TRAVELER");
    assert.equal(bookingAudit.outcome, "SUCCEEDED");
    assert.equal(String(bookingAudit.metadata).includes(ownerEmail), false);
  });
});
