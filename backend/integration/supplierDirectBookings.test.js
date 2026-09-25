import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";
import { generateApiKey } from "../src/middleware/apiPartner.js";

// Supplier-direct bookings (ADR 034): walk-in, phone and manual bookings take
// seats from the same inventory as the marketplace and OCTo partners.

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

function istNow(offsetMinutes = 0) {
  const shifted = new Date(Date.now() + (330 + offsetMinutes) * 60000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

function setup(db, { capacity = 20, departureTimes = ["09:00"], cutoffMinutes = 60 } = {}) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes, capacity, adultPrice: 1000, childPrice: 400, cutoffMinutes, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let user = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!user) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_counter', 'Counter Staff', ?, 'x', 'SUPPLIER')").run(supplier.email);
    user = db.prepare("SELECT * FROM users WHERE id = 'usr_counter'").get();
  }
  const token = jwt.sign({ id: user.id, email: user.email, role: "SUPPLIER" }, JWT_SECRET);
  return { product, option, supplier, token };
}

const direct = (api, ctx, body) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/bookings`, { token: ctx.token, body: {
  product_id: ctx.product.id, product_option_id: ctx.option.id, pickup_time: "09:00", children: 0,
  traveler_name: "Counter Guest", traveler_phone: "+919812345678", ...body,
} });

const vacancies = async (api, ctx, date, time = "09:00") => {
  const day = await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/availability?date=${date}`, { token: ctx.token });
  assert.equal(day.response.status, 200, JSON.stringify(day.data));
  const option = day.data.products.find((row) => row.optionId === ctx.option.id);
  return option.departures.find((slot) => slot.localTime === time).vacancies;
};

test("every channel draws on one departure: marketplace, OCTo partner, phone, manual and walk-in", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  // B2C: 3 seats sold and paid on the marketplace.
  const account = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Market Traveler", email: "market@example.com", password: "Integration@2026", phone: "+919876543210" } });
  const traveler = account.data.token;
  const marketInput = { product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", pickup_location: "Calangute, Goa", adults: 3, children: 0, vehicle_category: "SHARED_SEAT" };
  const market = await requestJson(api.baseUrl, "/api/bookings", { token: traveler, body: { ...marketInput, traveler_name: "Market Traveler", traveler_email: "market@example.com", traveler_phone: "+919876543210", payment_method: "DEMO", client_request_id: "market-3" } });
  assert.equal(market.response.status, 201, JSON.stringify(market.data));
  assert.equal((await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token: traveler, body: { bookingId: market.data.bookingId } })).response.status, 200);

  // API: 5 seats through an OCTo reseller.
  const key = generateApiKey();
  db.prepare("INSERT INTO api_partners (id, name, key_hash, key_prefix) VALUES ('apip_mix', 'Reseller', ?, ?)").run(key.keyHash, key.keyPrefix);
  const octo = await requestJson(api.baseUrl, "/octo/bookings/reservation", { headers: { authorization: `Bearer ${key.key}` }, body: {
    productId: ctx.product.id, optionId: ctx.option.id, availabilityId: `${ctx.option.id}:${date}:09:00`,
    unitItems: Array.from({ length: 5 }, () => ({ unitType: "ADULT" })) } });
  assert.equal(octo.response.status, 201, JSON.stringify(octo.data));
  assert.equal((await requestJson(api.baseUrl, "/octo/bookings/confirmation", { headers: { authorization: `Bearer ${key.key}` }, body: { uuid: octo.data.id } })).response.status, 200);

  // The supplier's own customers: phone 2, manual 2, walk-in 4.
  assert.equal((await direct(api, ctx, { source: "PHONE", activity_date: date, adults: 2 })).response.status, 201);
  assert.equal((await direct(api, ctx, { source: "MANUAL", activity_date: date, adults: 2 })).response.status, 201);
  const walkIn = await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 4, payments: [{ mode: "CASH", amount_inr: 4200 }] });
  assert.equal(walkIn.response.status, 201, JSON.stringify(walkIn.data));

  // 20 − (3 + 5 + 2 + 2 + 4) = 4.
  assert.equal(await vacancies(api, ctx, date), 4);
  const sources = db.prepare("SELECT source, SUM(adults + children) AS seats FROM bookings WHERE product_option_id = ? AND activity_date = ? GROUP BY source ORDER BY source").all(ctx.option.id, date);
  assert.deepEqual(sources.map((row) => [row.source, row.seats]), [["API", 5], ["B2C", 3], ["MANUAL", 2], ["PHONE", 2], ["WALK_IN", 4]]);

  // A fifth seat does not exist for anyone.
  const oversold = await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 5 });
  assert.equal(oversold.response.status, 409);
  assert.equal(oversold.data.code, "INVENTORY_UNAVAILABLE");
  assert.equal((await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 4 })).response.status, 201);
  assert.equal(await vacancies(api, ctx, date), 0);
});

test("a walk-in is confirmed, commission-free, paid to the supplier and never refunded by IdeaHoliday", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  // The counter quotes the guest first: 2 adults at ₹1000 + 5% GST = ₹2100, ₹100 off.
  const quoted = await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/bookings/quote`, { token: ctx.token, body: { product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", adults: 2, children: 0, discount_inr: 100 } });
  assert.equal(quoted.response.status, 200, JSON.stringify(quoted.data));
  assert.equal(quoted.data.quote.totalAmount, 2100);
  assert.equal(quoted.data.quote.amountDueInr, 2000);

  // ₹1500 paid now.
  const created = await direct(api, ctx, {
    source: "WALK_IN", activity_date: date, adults: 2, discount_inr: 100, traveler_email: "walkin@example.com",
    payments: [{ mode: "UPI", amount_inr: 1500, reference: "UPI-123" }], client_request_id: "counter-0001",
    // A total sent by the browser is not a field the API takes.
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const booking = created.data.booking;
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.source, "WALK_IN");
  assert.equal(booking.payment_status, "OFFLINE");
  assert.equal(booking.amount_inr, 2000);
  assert.equal(booking.balance_due_inr, 500);
  assert.equal(booking.commission_amount, 0);
  assert.equal(booking.supplier_payout_amount, 2000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE booking_id = ?").get(booking.id).n, 0, "IdeaHoliday owes the supplier nothing");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM financial_ledger WHERE booking_id = ?").get(booking.id).n, 0);
  assert.equal(db.prepare("SELECT status FROM native_reservations WHERE booking_id = ?").get(booking.id).status, "CONFIRMED");
  assert.equal(db.prepare("SELECT status FROM native_reservation_outbox WHERE booking_id = ?").get(booking.id).status, "SKIPPED");

  // A replay returns the same booking and takes no more seats.
  const replay = await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 2, discount_inr: 100, client_request_id: "counter-0001" });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.data.booking.id, booking.id);
  assert.equal(await vacancies(api, ctx, date), 18);

  // A total the browser invents is refused outright.
  const forged = await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 1, amount_inr: 1 });
  assert.equal(forged.response.status, 400);

  // The balance is collected later; more than is owed is refused.
  const payUrl = `/api/suppliers/${ctx.supplier.id}/bookings/${booking.id}/payments`;
  assert.equal((await requestJson(api.baseUrl, payUrl, { token: ctx.token, body: { mode: "CASH", amount_inr: 600 } })).response.status, 400);
  const settled = await requestJson(api.baseUrl, payUrl, { token: ctx.token, body: { mode: "CASH", amount_inr: 500 } });
  assert.equal(settled.response.status, 201, JSON.stringify(settled.data));
  assert.equal(settled.data.booking.balance_due_inr, 0);
  assert.deepEqual(settled.data.payments.map((payment) => [payment.mode, payment.amount_inr]), [["UPI", 1500], ["CASH", 500]]);

  // Voucher carries the QR; the "invoice" is the operator's payment summary.
  // The counter gets signed links it can print or send to the guest.
  const local = (url) => new URL(url).pathname + new URL(url).search;
  const voucher = await requestJson(api.baseUrl, local(created.data.documents.voucherUrl));
  assert.match(voucher.data, /Booking QR code/);
  const summary = await requestJson(api.baseUrl, local(created.data.documents.invoiceUrl));
  assert.match(summary.data, /Payment summary/);
  assert.doesNotMatch(summary.data, /INV-/);

  // The guest's IdeaHoliday account cannot cancel, reschedule or amend it.
  const guest = await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "walkin@example.com", password: "unused" } });
  assert.notEqual(guest.response.status, 200, "a supplier-entered email does not grant a password");
  const guestUser = db.prepare("SELECT * FROM users WHERE email = 'walkin@example.com'").get();
  const guestToken = jwt.sign({ id: guestUser.id, email: guestUser.email, role: "TRAVELER" }, JWT_SECRET);
  const selfCancel = await requestJson(api.baseUrl, `/api/traveler/bookings/${booking.id}/self-cancel`, { token: guestToken, body: { reason: "Changed plans" } });
  assert.notEqual(selfCancel.response.status, 200);
  const amend = await requestJson(api.baseUrl, `/api/bookings/${booking.ref}/amendment/apply`, { token: guestToken, body: { idempotencyKey: "amend-guest-1", amendmentType: "PICKUP", proposed: { pickup_location: "Elsewhere" } } });
  assert.equal(amend.response.status, 409, JSON.stringify(amend.data));
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = ?").get(booking.id).status, "confirmed");

  // The supplier cancels it: seats come back, no wallet credit is issued.
  const cancelled = await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/bookings/${booking.id}/cancel`, { token: ctx.token, body: { reason: "Guest asked at the counter" } });
  assert.ok([200, 201].includes(cancelled.response.status), JSON.stringify(cancelled.data));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE booking_id = ?").get(booking.id).n, 0);
  assert.equal(await vacancies(api, ctx, date), 20);
});

test("the counter may sell after the online cutoff, until the departure leaves", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const soon = istNow(60);
  if (soon.date !== istNow(0).date) return; // the departure would be tomorrow; nothing to prove near midnight
  const ctx = setup(db, { departureTimes: [soon.time], cutoffMinutes: 120 });

  const account = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Late Traveler", email: "late@example.com", password: "Integration@2026", phone: "+919876543210" } });
  const hold = await requestJson(api.baseUrl, "/api/availability/native/hold", { token: account.data.token, body: { productId: ctx.product.id, optionId: ctx.option.id, localDate: soon.date, localTime: soon.time, adults: 1, requestKey: "online-late" } });
  assert.equal(hold.response.status, 409, "online sales closed two hours before departure");

  const counter = await direct(api, ctx, { source: "WALK_IN", activity_date: soon.date, pickup_time: soon.time, adults: 1 });
  assert.equal(counter.response.status, 201, JSON.stringify(counter.data));
});

test("a supplier cannot sell another supplier's product at its counter", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  db.prepare("INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status) VALUES ('sup_rival', 'Rival Tours', 'Rival', 'rival@example.com', '+919800000000', 'Goa', 'Goa', 'APPROVED')").run();
  db.prepare("INSERT INTO products (id, supplier_id, product_type, title, city, state, category, price_inr, status) VALUES ('prod_rival', 'sup_rival', 'DAY_TOUR', 'Rival cruise', 'Goa', 'Goa', 'Tours', 900, 'PUBLISHED')").run();
  const other = { id: "prod_rival" };
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const refused = await direct(api, ctx, { source: "WALK_IN", activity_date: date, adults: 1, product_id: other.id, product_option_id: null });
  assert.equal(refused.response.status, 404);
  const foreign = await requestJson(api.baseUrl, "/api/suppliers/some_other_supplier/bookings", { token: ctx.token, body: {} });
  assert.equal(foreign.response.status, 403);
});
