import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * A supplier cancelling a confirmed booking refunds the traveler to their wallet at once and
 * tells them by email and WhatsApp (ADR 019). The traveler can rebook with that credit, even
 * for the whole price, or send what is unspent back to their original payment method.
 */

const SUPPLIER_LOGIN = { email: "multisolution33@gmail.com", password: "Idea@2026" };

function confirmedBooking(db, { ref, userId, email, productId, supplierId, paymentStatus, amountInr }) {
  const id = `bk_${ref.toLowerCase()}`;
  db.prepare(`
    INSERT INTO bookings (id, ref, user_id, product_id, supplier_id, product_type, activity_date,
      pickup_location, drop_location, adults, children, traveler_name, traveler_phone, traveler_email,
      amount_inr, payment_method, payment_status, status, razorpay_payment_id)
    VALUES (?, ?, ?, ?, ?, 'TRANSFER', '2026-12-20', 'Kanpur Airport', 'City hotel', 2, 0, 'Cancel Traveler', '+919876500888', ?, ?, 'DEMO', ?, 'confirmed', ?)
  `).run(id, ref, userId, productId, supplierId, email, amountInr, paymentStatus, paymentStatus === "PAID" ? `pay_demo_${ref}` : null);
  return id;
}

/** Traveler notices keyed by the booking (cancellation) or its refund, once `expected` have been written. */
async function travelerNotices(db, keys, expected) {
  const deadline = Date.now() + 5_000;
  let rows = [];
  while (Date.now() < deadline) {
    rows = db.prepare(`SELECT channel, event_type, recipient_role, body FROM notification_deliveries WHERE event_type IN ('BOOKING_CANCELLED', 'REFUND_STATUS') AND (${keys.map(() => "event_key LIKE ?").join(" OR ")})`)
      .all(...keys.map((key) => `${key}:%`));
    if (rows.length >= expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return rows;
}

test("a supplier cancellation refunds to the wallet, the traveler rebooks with it and takes the rest back as cash", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Cancel Traveler", email: "cancel.traveler@example.test", password: "Integration@2026", phone: "+919876500888" },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const travelerToken = signup.data.token;
  const travelerId = signup.data.user.id;

  const supplier = db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_LOGIN.email);
  const product = db.prepare("SELECT id FROM products WHERE supplier_id = ? LIMIT 1").get(supplier.id);
  const paidId = confirmedBooking(db, { ref: "IH-SUPCXL1", userId: travelerId, email: "cancel.traveler@example.test", productId: product.id, supplierId: supplier.id, paymentStatus: "PAID", amountInr: 50000 });
  const unpaidId = confirmedBooking(db, { ref: "IH-SUPCXL2", userId: travelerId, email: "cancel.traveler@example.test", productId: product.id, supplierId: supplier.id, paymentStatus: "PENDING", amountInr: 1800 });

  const login = await requestJson(api.baseUrl, "/api/auth/login", { body: SUPPLIER_LOGIN });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  const supplierToken = login.data.token;

  // 1. The supplier cancels: the ₹50,000 is in the traveler's wallet at once, and they are told.
  const cancelled = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/bookings/${paidId}/cancel`, {
    token: supplierToken, body: { reason: "Vehicle breakdown / mechanical failure" },
  });
  assert.equal(cancelled.response.status, 200, `${JSON.stringify(cancelled.data)}\n${api.output()}`);
  assert.equal(cancelled.data.walletCreditInr, 50000);
  assert.equal(db.prepare("SELECT payment_status FROM bookings WHERE id = ?").get(paidId).payment_status, "REFUNDED_TO_WALLET");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM refunds WHERE booking_id = ?").get(paidId).n, 0, "no gateway refund until the traveler asks for one");

  const notices = await travelerNotices(db, [paidId], 2);
  assert.deepEqual(notices.map((row) => `${row.event_type}:${row.channel}`).sort(), ["BOOKING_CANCELLED:EMAIL", "BOOKING_CANCELLED:WHATSAPP"], `${JSON.stringify(notices)}\n${api.output()}`);
  assert.match(notices[0].body, /Vehicle breakdown[\s\S]*₹50000 has been refunded to your Idea Holiday wallet[\s\S]*original payment method/);

  // 2. They rebook: refund credit is not capped, so it pays for the whole trip and no gateway is involved.
  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  const rebooked = await requestJson(api.baseUrl, "/api/bookings", {
    token: travelerToken,
    headers: { "Idempotency-Key": "refund-credit-rebooking" },
    body: {
      product_id: activity.id, activity_date: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10), adults: 2, children: 0, luggage_bags: 0,
      pickup_time: "09:00", pickup_location: "Calangute, Goa",
      traveler_name: "Cancel Traveler", traveler_email: "cancel.traveler@example.test", traveler_phone: "+919876500888",
      payment_method: "CASHFREE", wallet_credit_inr: 50000,
    },
  });
  assert.equal(rebooked.response.status, 201, `${JSON.stringify(rebooked.data)}\n${api.output()}`);
  assert.equal(rebooked.data.amount_inr, 0);
  const tripPrice = rebooked.data.wallet_credit_applied_inr;
  assert.ok(tripPrice > 2000, "more than the referral wallet cap");

  const paidWithWallet = await requestJson(api.baseUrl, "/api/checkout/wallet-payment", { token: travelerToken, body: { bookingId: rebooked.data.bookingId } });
  assert.equal(paidWithWallet.response.status, 200, `${JSON.stringify(paidWithWallet.data)}\n${api.output()}`);
  const newBooking = db.prepare("SELECT status, payment_status, payment_method FROM bookings WHERE id = ?").get(rebooked.data.bookingId);
  assert.deepEqual({ ...newBooking }, { status: "confirmed", payment_status: "PAID", payment_method: "WALLET" });

  // 3. My Trips offers the rest back as cash, and they take it.
  const trips = await requestJson(api.baseUrl, "/api/bookings", { token: travelerToken });
  const cancelledTrip = trips.data.find((trip) => trip.id === paidId);
  assert.equal(cancelledTrip.refund_credit_unspent_inr, 50000 - tripPrice);
  assert.ok(cancelledTrip.cash_refundable_until);

  const cashOut = await requestJson(api.baseUrl, `/api/bookings/${paidId}/refund-to-source`, { token: travelerToken, body: {} });
  assert.equal(cashOut.response.status, 200, `${JSON.stringify(cashOut.data)}\n${api.output()}`);
  assert.deepEqual([cashOut.data.refundStatus, cashOut.data.amountInr], ["PROCESSED", 50000 - tripPrice]);
  const refunds = db.prepare("SELECT id, status, refund_amount FROM refunds WHERE booking_id = ?").all(paidId);
  assert.deepEqual(refunds.map((row) => [row.status, row.refund_amount]), [["PROCESSED", 50000 - tripPrice]]);
  assert.equal(db.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(travelerId).wallet_balance_inr, 0);

  const refundNotices = (await travelerNotices(db, [refunds[0].id], 2)).filter((row) => row.event_type === "REFUND_STATUS");
  assert.deepEqual(refundNotices.map((row) => `${row.recipient_role}:${row.channel}`).sort(), ["TRAVELER:EMAIL", "TRAVELER:WHATSAPP"]);

  const again = await requestJson(api.baseUrl, `/api/bookings/${paidId}/refund-to-source`, { token: travelerToken, body: {} });
  assert.equal(again.response.status, 409, JSON.stringify(again.data));

  // An unpaid booking has nothing to refund, but the traveler still hears about it.
  const unpaid = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/bookings/${unpaidId}/cancel`, {
    token: supplierToken, body: { reason: "Severe weather / road blocked / landslide" },
  });
  assert.equal(unpaid.response.status, 200, JSON.stringify(unpaid.data));
  assert.equal(unpaid.data.walletCreditInr, null);
  const unpaidNotices = await travelerNotices(db, [unpaidId], 2);
  assert.deepEqual(unpaidNotices.map((row) => row.channel).sort(), ["EMAIL", "WHATSAPP"]);
  assert.match(unpaidNotices[0].body, /No payment was collected/);

  const twice = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/bookings/${paidId}/cancel`, { token: supplierToken, body: { reason: "Other operational constraint" } });
  assert.equal(twice.response.status, 409);
});
