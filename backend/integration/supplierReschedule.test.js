import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Supplier reschedule and the booking calendar (ADR 037).

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

function setup(db, capacity = 10) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "14:00"], capacity, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  return { product, option, supplier, ownerToken: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

const call = (api, ctx, token, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token, ...options });
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function traveler(api, email) {
  const account = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Market Traveler", email, password: "Integration@2026", phone: "+919876543210" } });
  assert.equal(account.response.status, 200, JSON.stringify(account.data));
  return account.data.token;
}

async function paidBooking(api, ctx, token, email, date, adults = 2) {
  const created = await requestJson(api.baseUrl, "/api/bookings", { token, body: {
    product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", pickup_location: "Calangute, Goa",
    adults, children: 0, vehicle_category: "SHARED_SEAT", traveler_name: "Market Traveler", traveler_email: email, traveler_phone: "+919876543210",
    payment_method: "DEMO", client_request_id: `market-${email}`,
  } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal((await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token, body: { bookingId: created.data.bookingId } })).response.status, 200);
  return created.data.bookingId;
}

async function vacancies(api, ctx, date, time) {
  const board = await call(api, ctx, ctx.ownerToken, `/departures?from=${date}`);
  return board.data.departures.find((row) => row.productId === ctx.product.id && row.time === time).freeSeats;
}

test("a supplier moves a paid booking at the same price, and the traveler declines it for a full wallet refund", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const [from, to] = [day(6), day(8)];
  const token = await traveler(api, "moved@example.com");
  const bookingId = await paidBooking(api, ctx, token, "moved@example.com", from);
  const before = db.prepare("SELECT amount_inr, ref FROM bookings WHERE id = ?").get(bookingId);

  const moved = await call(api, ctx, ctx.ownerToken, `/bookings/${bookingId}/reschedule`, { body: { date: to, time: "14:00", reason: "Boat engine repair" } });
  assert.equal(moved.response.status, 200, JSON.stringify(moved.data));
  assert.deepEqual(moved.data.to, { date: to, time: "14:00" });
  assert.equal(moved.data.travelerMayDecline, true);

  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  assert.equal(row.activity_date, to);
  assert.equal(row.pickup_time, "14:00");
  assert.equal(row.amount_inr, before.amount_inr);
  assert.equal(row.supplier_reschedule_status, "MOVED");
  assert.equal(row.supplier_reschedule_from_date, from);
  assert.equal(await vacancies(api, ctx, from, "09:00"), 10);
  assert.equal(await vacancies(api, ctx, to, "14:00"), 8);

  // The traveler's booking list carries the notice.
  const mine = await requestJson(api.baseUrl, "/api/bookings", { token });
  const listed = (mine.data.bookings || mine.data).find((booking) => booking.id === bookingId);
  assert.equal(listed.supplier_reschedule_status, "MOVED");

  // Someone else can't answer for them.
  const other = await traveler(api, "other@example.com");
  assert.equal((await requestJson(api.baseUrl, `/api/bookings/${before.ref}/supplier-reschedule/decline`, { token: other, body: {} })).response.status, 404);

  const declined = await requestJson(api.baseUrl, `/api/bookings/${before.ref}/supplier-reschedule/decline`, { token, body: {} });
  assert.equal(declined.response.status, 200, JSON.stringify(declined.data));
  assert.equal(declined.data.walletCreditInr, before.amount_inr);
  const after = db.prepare("SELECT status, payment_status, supplier_reschedule_status FROM bookings WHERE id = ?").get(bookingId);
  assert.deepEqual(after, { status: "cancelled", payment_status: "REFUNDED_TO_WALLET", supplier_reschedule_status: "DECLINED" });
  assert.equal(await vacancies(api, ctx, to, "14:00"), 10);
  assert.ok(db.prepare("SELECT 1 FROM supplier_notifications WHERE supplier_id = ? AND type = 'RESCHEDULE_DECLINED'").get(ctx.supplier.id));
  assert.equal((await requestJson(api.baseUrl, `/api/bookings/${before.ref}/supplier-reschedule/decline`, { token, body: {} })).data.code, "NO_OPEN_RESCHEDULE");
});

test("a traveler keeps the new date; a walk-in just moves; full, same and started departures are refused", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db, 4);
  const date = day(6);
  const token = await traveler(api, "keeps@example.com");
  const bookingId = await paidBooking(api, ctx, token, "keeps@example.com", date, 2);
  const ref = db.prepare("SELECT ref FROM bookings WHERE id = ?").get(bookingId).ref;

  // 14:00 holds 4; a walk-in of 3 leaves 1, too few for this party of 2.
  const walkIn = await call(api, ctx, ctx.ownerToken, "/bookings", { body: { product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "14:00", adults: 3, children: 0, source: "WALK_IN", traveler_name: "Counter Guest", traveler_phone: "+919812345678" } });
  assert.equal(walkIn.response.status, 201, JSON.stringify(walkIn.data));
  const full = await call(api, ctx, ctx.ownerToken, `/bookings/${bookingId}/reschedule`, { body: { date, time: "14:00", reason: "Guide unwell" } });
  assert.equal(full.response.status, 409);
  assert.equal(full.data.code, "INVENTORY_UNAVAILABLE");
  assert.equal(db.prepare("SELECT pickup_time FROM bookings WHERE id = ?").get(bookingId).pickup_time, "09:00");

  assert.equal((await call(api, ctx, ctx.ownerToken, `/bookings/${bookingId}/reschedule`, { body: { date, time: "09:00", reason: "No change" } })).data.code, "SAME_DEPARTURE");
  assert.equal((await call(api, ctx, ctx.ownerToken, `/bookings/${bookingId}/reschedule`, { body: { date: day(-1), time: "09:00", reason: "Too late" } })).data.code, "DEPARTURE_IN_PAST");

  // The walk-in moves with no traveler choice.
  const walkInMoved = await call(api, ctx, ctx.ownerToken, `/bookings/${walkIn.data.booking.id}/reschedule`, { body: { date: day(7), time: "09:00", reason: "Guest asked" } });
  assert.equal(walkInMoved.response.status, 200, JSON.stringify(walkInMoved.data));
  assert.equal(walkInMoved.data.travelerMayDecline, false);
  assert.equal(db.prepare("SELECT supplier_reschedule_status FROM bookings WHERE id = ?").get(walkIn.data.booking.id).supplier_reschedule_status, null);

  // Now 14:00 has room; the traveler keeps the new time.
  assert.equal((await call(api, ctx, ctx.ownerToken, `/bookings/${bookingId}/reschedule`, { body: { date, time: "14:00", reason: "Guide unwell" } })).response.status, 200);
  const kept = await requestJson(api.baseUrl, `/api/bookings/${ref}/supplier-reschedule/accept`, { token, body: {} });
  assert.equal(kept.response.status, 200, JSON.stringify(kept.data));
  assert.equal(db.prepare("SELECT status, supplier_reschedule_status FROM bookings WHERE id = ?").get(bookingId).supplier_reschedule_status, "ACCEPTED");
  assert.equal((await requestJson(api.baseUrl, `/api/bookings/${ref}/supplier-reschedule/decline`, { token, body: {} })).data.code, "NO_OPEN_RESCHEDULE");

  // Front desk can't move bookings; everyone but guides reads the calendar.
  const staff = await call(api, ctx, ctx.ownerToken, "/staff", { body: { name: "Counter", email: "desk@example.com", role: "FRONT_DESK" } });
  const desk = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk@example.com", password: staff.data.temporaryPassword, portal: "supplier" } })).data.token;
  assert.equal((await call(api, ctx, desk, `/bookings/${bookingId}/reschedule`, { body: { date: day(9), time: "09:00", reason: "Try" } })).response.status, 403);
  const calendar = await call(api, ctx, desk, `/booking-calendar?month=${date.slice(0, 7)}`);
  assert.equal(calendar.response.status, 200, JSON.stringify(calendar.data));
  const today = calendar.data.days.find((row) => row.date === date);
  assert.deepEqual(today && { bookings: today.bookings, guests: today.guests, departures: today.departures }, { bookings: 1, guests: 2, departures: 1 });
});
