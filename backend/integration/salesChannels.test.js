import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";
import { generateApiKey } from "../src/middleware/apiPartner.js";

// Per-listing sales channels and supplier-issued reseller keys (ADR 041).

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const date = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);

function setup(db) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 20, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  return { product, option, supplier, ownerToken: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

const call = (api, ctx, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token: ctx.ownerToken, ...options });
const octo = (api, key, path, body) => requestJson(api.baseUrl, `/octo${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {}, body });
const reserve = (api, ctx, key, adults = 2) => octo(api, key, "/bookings/reservation", {
  productId: ctx.product.id, optionId: ctx.option.id, availabilityId: `${ctx.option.id}:${date}:09:00`,
  unitItems: Array.from({ length: adults }, () => ({ unitType: "ADULT" })),
});

test("switching a listing off the marketplace hides it and refuses new marketplace bookings; direct sales go on", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);

  const marketplaceSeats = () => requestJson(api.baseUrl, `/api/availability/native/${ctx.product.id}?optionId=${ctx.option.id}&date=${date}`);
  assert.equal((await marketplaceSeats()).response.status, 200);
  assert.equal((await requestJson(api.baseUrl, `/api/activities/${ctx.product.id}`)).response.status, 200);
  const off = await call(api, ctx, `/products/${ctx.product.id}/channels`, { method: "PATCH", body: { marketplace: false } });
  assert.equal(off.response.status, 200, JSON.stringify(off.data));
  assert.deepEqual(off.data.channels, { marketplace: false, ideaholidayApi: true, ownResellers: true });

  assert.equal((await marketplaceSeats()).response.status, 404);
  const listing = await requestJson(api.baseUrl, `/api/activities/${ctx.product.id}`);
  assert.equal(listing.response.status, 404, JSON.stringify(listing.data).slice(0, 200));

  const account = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Market Traveler", email: "channel@example.com", password: "Integration@2026", phone: "+919876543210" } });
  const booking = await requestJson(api.baseUrl, "/api/bookings", { token: account.data.token, body: {
    product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", pickup_location: "Calangute, Goa",
    adults: 2, children: 0, vehicle_category: "SHARED_SEAT", traveler_name: "Market Traveler", traveler_email: "channel@example.com", traveler_phone: "+919876543210",
    payment_method: "DEMO", client_request_id: "channel-off-1",
  } });
  assert.equal(booking.response.status, 409, JSON.stringify(booking.data));
  assert.equal(booking.data.code, "CHANNEL_OFF");

  // IdeaHoliday's API partners still see it; the supplier's walk-ins still work.
  assert.ok((await octo(api, null, "/products")).data.some((product) => product.id === ctx.product.id));
  const walkIn = await call(api, ctx, "/bookings", { body: { source: "WALK_IN", product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", adults: 1, traveler_name: "Counter Guest", traveler_phone: "+919812345678" } });
  assert.equal(walkIn.response.status, 201, JSON.stringify(walkIn.data));

  // Off for IdeaHoliday's API partners too: gone from OCTo and refused.
  await call(api, ctx, `/products/${ctx.product.id}/channels`, { method: "PATCH", body: { ideaholidayApi: false } });
  const partner = generateApiKey();
  db.prepare("INSERT INTO api_partners (id, name, key_hash, key_prefix) VALUES ('apip_ih', 'IH partner', ?, ?)").run(partner.keyHash, partner.keyPrefix);
  assert.equal((await octo(api, partner.key, "/products")).data.some((product) => product.id === ctx.product.id), false);
  const refused = await reserve(api, ctx, partner.key);
  assert.equal(refused.data.code, "PRODUCT_NOT_BOOKABLE");
});

test("the owner issues a reseller key; its bookings are the supplier's direct sales, at a linked agent's net and credit", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);

  // A plain reseller key: normal price, owed to the supplier, no IdeaHoliday commission.
  const issued = await call(api, ctx, "/api-keys", { body: { name: "Beach Shack Kiosk" } });
  assert.equal(issued.response.status, 201, JSON.stringify(issued.data));
  assert.match(issued.data.key, /^ihp_[0-9a-f]{48}$/);
  const listed = await call(api, ctx, "/api-keys");
  assert.equal(JSON.stringify(listed.data).includes(issued.data.key), false);
  assert.equal(listed.data.resellers[0].keyPrefix, issued.data.key.slice(0, 12));

  const held = await reserve(api, ctx, issued.data.key);
  assert.equal(held.response.status, 201, JSON.stringify(held.data));
  const confirmed = await octo(api, issued.data.key, "/bookings/confirmation", { uuid: held.data.id, contact: { fullName: "Kiosk Guest", phoneNumber: "+919811112222" } });
  assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.data));
  const plain = db.prepare("SELECT * FROM bookings WHERE id = (SELECT booking_id FROM native_reservations WHERE id = ?)").get(held.data.id);
  assert.deepEqual([plain.source, plain.payment_status, plain.amount_inr, plain.commission_amount, plain.balance_due_inr, plain.agent_id], ["API", "OFFLINE", 2100, 0, 2100, null]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payouts WHERE booking_id = ?").get(plain.id).count, 0);
  // The guest is never asked to pay a reseller's balance at the meeting point.
  const manifest = await call(api, ctx, `/manifest?productId=${ctx.product.id}&date=${date}`);
  assert.equal(manifest.data.manifest.bookings.find((row) => row.id === plain.id).balanceDueInr, 0);

  // A key linked to an agent: 10% commission, ₹2000 credit.
  const agent = (await call(api, ctx, "/agents", { body: { name: "Hotel Sea View", commissionPct: 10, creditLimitInr: 2000 } })).data.agent;
  const linked = (await call(api, ctx, "/api-keys", { body: { name: "Sea View front desk", agentId: agent.id } })).data;
  const first = await reserve(api, ctx, linked.key);
  assert.equal((await octo(api, linked.key, "/bookings/confirmation", { uuid: first.data.id, contact: { fullName: "Hotel Guest" } })).response.status, 200);
  const agentBooking = db.prepare("SELECT * FROM bookings WHERE agent_id = ?").get(agent.id);
  assert.deepEqual([agentBooking.amount_inr, agentBooking.agent_commission_inr, agentBooking.balance_due_inr], [1890, 210, 1890]);
  // Over the agent's credit: the confirmation is refused and nothing is booked.
  const second = await reserve(api, ctx, linked.key);
  const overLimit = await octo(api, linked.key, "/bookings/confirmation", { uuid: second.data.id, contact: { fullName: "Hotel Guest 2" } });
  assert.equal(overLimit.response.status, 409, JSON.stringify(overLimit.data));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE agent_id = ?").get(agent.id).count, 1);

  // Own-reseller channel off: the supplier's keys can't see or book it, IdeaHoliday's partners still can.
  await call(api, ctx, `/products/${ctx.product.id}/channels`, { method: "PATCH", body: { ownResellers: false } });
  assert.equal((await octo(api, issued.data.key, "/products")).data.some((product) => product.id === ctx.product.id), false);
  assert.equal((await reserve(api, ctx, issued.data.key)).data.code, "PRODUCT_NOT_BOOKABLE");
  assert.ok((await octo(api, null, "/products")).data.some((product) => product.id === ctx.product.id));

  // Revoked: the key stops working at once; a wrong key is refused, not treated as public.
  assert.equal((await call(api, ctx, `/api-keys/${issued.data.reseller.id}`, { method: "DELETE" })).response.status, 200);
  assert.equal((await octo(api, issued.data.key, "/products")).response.status, 401);
});

test("only the owner manages keys; a manager switches channels", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const staff = await call(api, ctx, "/staff", { body: { name: "Ops Manager", email: "manager@example.com", role: "MANAGER" } });
  const manager = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "manager@example.com", password: staff.data.temporaryPassword, portal: "supplier" } })).data.token;
  const asManager = (path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token: manager, ...options });
  assert.equal((await asManager("/api-keys")).response.status, 403);
  assert.equal((await asManager("/api-keys", { body: { name: "Sneaky" } })).response.status, 403);
  assert.equal((await asManager(`/products/${ctx.product.id}/channels`, { method: "PATCH", body: { ownResellers: false } })).response.status, 200);
});
