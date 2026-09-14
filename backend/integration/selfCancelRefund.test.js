import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Cancelling a paid trip from My Trips must send the refund to the payment gateway,
 * not only mark the booking REFUND_INITIATED.
 */
test("self-service cancellation of a paid booking refunds it through the gateway", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Refund Traveler", email: "refund.traveler@example.test", password: "Integration@2026", phone: "+919876543210" },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const token = signup.data.token;

  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const activityDate = new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);
  const created = await requestJson(api.baseUrl, "/api/bookings", {
    token,
    headers: { "Idempotency-Key": "self-cancel-refund-booking" },
    body: {
      product_id: activity.id, activity_date: activityDate, adults: 2, children: 0, luggage_bags: 0,
      pickup_time: "09:00", pickup_location: "Calangute, Goa",
      traveler_name: "Refund Traveler", traveler_email: "refund.traveler@example.test", traveler_phone: "+919876543210",
      payment_method: "DEMO",
    },
  });
  assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
  const paid = await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token, body: { bookingId: created.data.bookingId } });
  assert.equal(paid.response.status, 200, JSON.stringify(paid.data));

  const cancelled = await requestJson(api.baseUrl, `/api/bookings/${created.data.bookingId}/self-cancel`, { token, body: { reason: "plan changed" } });
  assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.data));
  assert.ok(cancelled.data.refundAmountInr > 0);
  assert.equal(cancelled.data.refund?.status, "PROCESSED", JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.paymentStatus, "REFUNDED");

  const db = new Database(api.databasePath, { readonly: true });
  t.after(() => db.close());
  const booking = db.prepare("SELECT status, payment_status, refunded_amount FROM bookings WHERE id = ?").get(created.data.bookingId);
  assert.equal(booking.status, "cancelled");
  assert.equal(booking.payment_status, "REFUNDED");
  assert.equal(booking.refunded_amount, cancelled.data.refundAmountInr);
  const refunds = db.prepare("SELECT status, refund_amount FROM refunds WHERE booking_id = ?").all(created.data.bookingId);
  assert.deepEqual(refunds.map((row) => ({ ...row })), [{ status: "PROCESSED", refund_amount: cancelled.data.refundAmountInr }]);

  const again = await requestJson(api.baseUrl, `/api/bookings/${created.data.bookingId}/self-cancel`, { token, body: { reason: "again" } });
  assert.equal(again.response.status, 409, JSON.stringify(again.data));
});
