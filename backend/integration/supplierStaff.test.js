import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Supplier staff logins (ADR 036): the owner adds a manager, front desk and
// guide, and each reaches only what their role allows.

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

function setup(db) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 20, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  db.prepare("UPDATE suppliers SET payout_bank_details = '{\"account\":\"123456789\"}', pan_number = 'ABCDE1234F' WHERE id = ?").run(supplier.id);
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  const ownerToken = jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET);
  return { product, option, supplier, ownerToken };
}

async function addStaff(api, ctx, body) {
  const added = await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/staff`, { token: ctx.ownerToken, body });
  assert.equal(added.response.status, 201, JSON.stringify(added.data));
  assert.ok(added.data.temporaryPassword);
  const login = await requestJson(api.baseUrl, "/api/auth/login", { body: { email: body.email, password: added.data.temporaryPassword, portal: "supplier" } });
  assert.equal(login.response.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.user.supplier_id, ctx.supplier.id);
  assert.equal(login.data.user.supplier_role, body.role);
  return { id: added.data.member.id, token: login.data.token };
}

const call = (api, ctx, token, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token, ...options });

const walkIn = (ctx, date) => ({
  product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", adults: 2, children: 0,
  source: "WALK_IN", traveler_name: "Counter Guest", traveler_phone: "+919812345678", payments: [{ mode: "CASH", amount_inr: 500 }],
});

test("front desk takes walk-ins without the owner's password but can't touch prices, payouts or staff", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const desk = await addStaff(api, ctx, { name: "Counter Staff", email: "desk@example.com", role: "FRONT_DESK" });

  const created = await call(api, ctx, desk.token, "/bookings", { body: walkIn(ctx, date) });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const booking = created.data.booking;
  assert.equal(db.prepare("SELECT created_by_user_id FROM bookings WHERE id = ?").get(booking.id).created_by_user_id, desk.id);
  assert.equal((await call(api, ctx, desk.token, `/bookings/${booking.id}/payments`, { body: { mode: "UPI", amount_inr: 500 } })).response.status, 201);
  assert.equal((await call(api, ctx, desk.token, `/manifest?productId=${ctx.product.id}&date=${date}`)).response.status, 200);

  // The account view hides bank, PAN, KYB documents and payouts.
  const account = await call(api, ctx, desk.token, "");
  assert.equal(account.response.status, 200);
  assert.equal(account.data.access.role, "FRONT_DESK");
  assert.equal(account.data.supplier.payout_bank_details, undefined);
  assert.equal(account.data.supplier.pan_number, undefined);
  assert.deepEqual(account.data.payouts, []);
  assert.ok(account.data.bookings.some((row) => row.id === booking.id));

  for (const [path, options] of [
    [`/bookings/${booking.id}/cancel`, { body: { reason: "Guest changed plans" } }],
    ["/dashboard-stats", {}],
    ["/payout-ledger", {}],
    ["/subscription", {}],
    ["/staff", {}],
    ["/staff", { body: { name: "Another", email: "another@example.com", role: "MANAGER" } }],
  ]) {
    const refused = await call(api, ctx, desk.token, path, options);
    assert.equal(refused.response.status, 403, `${path}: ${JSON.stringify(refused.data)}`);
  }
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = ?").get(booking.id).status, "confirmed");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM supplier_members WHERE supplier_id = ?").get(ctx.supplier.id).count, 1);

  // Outside /api/suppliers/:id: enquiries and support cases are manager work.
  assert.equal((await requestJson(api.baseUrl, "/api/enquiries", { token: desk.token })).response.status, 403);
});

test("a guide sees the manifest with phones but no balances, and nothing else", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  assert.equal((await call(api, ctx, ctx.ownerToken, "/bookings", { body: walkIn(ctx, date) })).response.status, 201);
  const guide = await addStaff(api, ctx, { name: "Tour Guide", email: "guide@example.com", role: "GUIDE" });

  const manifest = await call(api, ctx, guide.token, `/manifest?productId=${ctx.product.id}&date=${date}`);
  assert.equal(manifest.response.status, 200, JSON.stringify(manifest.data));
  const [row] = manifest.data.manifest.bookings;
  assert.equal(row.travelerPhone, "+919812345678");
  assert.equal(row.balanceDueInr, null);
  const owner = await call(api, ctx, ctx.ownerToken, `/manifest?productId=${ctx.product.id}&date=${date}`);
  assert.equal(owner.data.manifest.bookings[0].balanceDueInr, 1600);

  const account = await call(api, ctx, guide.token, "");
  assert.equal(account.data.access.role, "GUIDE");
  assert.deepEqual(account.data.bookings, []);
  assert.ok(account.data.products.length > 0);

  assert.equal((await call(api, ctx, guide.token, "/bookings", { body: walkIn(ctx, date) })).response.status, 403);
  assert.equal((await call(api, ctx, guide.token, `/availability?date=${date}`)).response.status, 403);
});

test("a manager runs the business but not money, KYB, plans or staff", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const manager = await addStaff(api, ctx, { name: "Ops Manager", email: "manager@example.com", role: "MANAGER" });

  assert.equal((await call(api, ctx, manager.token, "/dashboard-stats")).response.status, 200);
  assert.equal((await call(api, ctx, manager.token, "/resources")).response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/enquiries", { token: manager.token })).response.status, 200);
  for (const [path, options] of [
    ["/payout-ledger", {}],
    ["/payout", { method: "PATCH", body: { accountNumber: "999" } }],
    ["/kyb/verifications", {}],
    ["/subscription", {}],
    ["/profile", { method: "PATCH", body: { companyName: "Taken Over Ltd" } }],
    ["/staff", {}],
  ]) {
    const refused = await call(api, ctx, manager.token, path, options);
    assert.equal(refused.response.status, 403, `${path}: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, "SUPPLIER_ROLE_FORBIDDEN");
  }
  assert.equal(db.prepare("SELECT company_name FROM suppliers WHERE id = ?").get(ctx.supplier.id).company_name, ctx.supplier.company_name);
});

test("the owner changes and removes staff, and it applies to open sessions at once", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const staff = await addStaff(api, ctx, { name: "Counter Staff", email: "desk@example.com", role: "FRONT_DESK" });

  // An owner's or another supplier's email can't become staff.
  const taken = await call(api, ctx, ctx.ownerToken, "/staff", { body: { name: "Owner Again", email: ctx.supplier.email, role: "MANAGER" } });
  assert.equal(taken.response.status, 409);
  assert.equal(taken.data.code, "ACCOUNT_IN_USE");

  const listed = await call(api, ctx, ctx.ownerToken, "/staff");
  assert.deepEqual(listed.data.members.map((member) => [member.email, member.role]), [["desk@example.com", "FRONT_DESK"]]);
  assert.equal(JSON.stringify(listed.data).includes("password"), false);

  // Demoted to guide: the same token loses walk-ins immediately.
  const demoted = await call(api, ctx, ctx.ownerToken, `/staff/${staff.id}`, { method: "PATCH", body: { role: "GUIDE" } });
  assert.equal(demoted.response.status, 200, JSON.stringify(demoted.data));
  assert.equal((await call(api, ctx, staff.token, "/bookings", { body: walkIn(ctx, date) })).response.status, 403);

  // A new temporary password replaces the old one.
  const reset = await call(api, ctx, ctx.ownerToken, `/staff/${staff.id}/reset-password`, { body: {} });
  assert.equal(reset.response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk@example.com", password: reset.data.temporaryPassword, portal: "supplier" } })).response.status, 200);

  // Removed: the account becomes a traveler and the supplier is closed to it.
  assert.equal((await call(api, ctx, ctx.ownerToken, `/staff/${staff.id}`, { method: "DELETE" })).response.status, 200);
  assert.equal(db.prepare("SELECT role FROM users WHERE id = ?").get(staff.id).role, "TRAVELER");
  assert.equal((await call(api, ctx, staff.token, `/manifest?productId=${ctx.product.id}&date=${date}`)).response.status, 403);
  assert.equal((await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk@example.com", password: reset.data.temporaryPassword, portal: "supplier" } })).response.status, 403);
});
