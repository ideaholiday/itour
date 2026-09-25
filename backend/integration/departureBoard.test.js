import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Departures board and crew assignment (ADR 037).

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

function setup(db) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "14:00"], capacity: 20, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let other = db.prepare("SELECT * FROM products WHERE supplier_id = ? AND id <> ? LIMIT 1").get(supplier.id, product.id);
  if (!other) {
    db.prepare("INSERT INTO products (id, supplier_id, title, product_type, status) VALUES ('prd_board_other', ?, 'Sunset Cruise', 'DAY_TOUR', 'PUBLISHED')").run(supplier.id);
    other = db.prepare("SELECT * FROM products WHERE id = 'prd_board_other'").get();
  }
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  const ownerToken = jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET);
  return { product, option, other, supplier, ownerToken };
}

const call = (api, ctx, token, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token, ...options });

async function walkIn(api, ctx, date, time, adults) {
  const created = await call(api, ctx, ctx.ownerToken, "/bookings", { body: {
    product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: time, adults, children: 0,
    source: "WALK_IN", traveler_name: `Guest ${time}`, traveler_phone: "+919812345678",
  } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  return created.data.booking;
}

async function addStaff(api, ctx, body) {
  const added = await call(api, ctx, ctx.ownerToken, "/staff", { body });
  assert.equal(added.response.status, 201, JSON.stringify(added.data));
  const login = await requestJson(api.baseUrl, "/api/auth/login", { body: { email: body.email, password: added.data.temporaryPassword, portal: "supplier" } });
  return { id: added.data.member.id, token: login.data.token };
}

async function resource(api, ctx, body) {
  const saved = await call(api, ctx, ctx.ownerToken, "/resources", { body: { capacity: 0, optionIds: [], ...body } });
  assert.equal(saved.response.status, 201, JSON.stringify(saved.data));
  return saved.data.resource;
}

const date = () => new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

test("the board shows each departure's seats, guests and crew, and a resource works one departure at a time", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const day = date();
  await walkIn(api, ctx, day, "09:00", 3);
  await walkIn(api, ctx, day, "09:00", 2);

  const van = await resource(api, ctx, { name: "Van KA-01", kind: "VEHICLE" });
  const ravi = await resource(api, ctx, { name: "Ravi", kind: "GUIDE" });
  assert.equal(van.kind, "VEHICLE");

  for (const resourceId of [van.id, ravi.id]) {
    const assigned = await call(api, ctx, ctx.ownerToken, "/departures/assignments", { body: { productId: ctx.product.id, date: day, time: "09:00", resourceId } });
    assert.equal(assigned.response.status, 201, JSON.stringify(assigned.data));
  }
  const again = await call(api, ctx, ctx.ownerToken, "/departures/assignments", { body: { productId: ctx.product.id, date: day, time: "09:00", resourceId: van.id } });
  assert.equal(again.data.code, "ALREADY_ASSIGNED");
  const elsewhere = await call(api, ctx, ctx.ownerToken, "/departures/assignments", { body: { productId: ctx.other.id, date: day, time: "09:00", resourceId: van.id } });
  assert.equal(elsewhere.response.status, 409);
  assert.equal(elsewhere.data.code, "RESOURCE_BUSY");
  // The same van is free for the afternoon.
  assert.equal((await call(api, ctx, ctx.ownerToken, "/departures/assignments", { body: { productId: ctx.product.id, date: day, time: "14:00", resourceId: van.id } })).response.status, 201);

  const board = await call(api, ctx, ctx.ownerToken, `/departures?from=${day}&days=1`);
  assert.equal(board.response.status, 200, JSON.stringify(board.data));
  const morning = board.data.departures.find((row) => row.productId === ctx.product.id && row.time === "09:00");
  assert.equal(morning.bookings, 2);
  assert.equal(morning.guests, 5);
  assert.equal(morning.capacity, 20);
  assert.equal(morning.freeSeats, 15);
  assert.deepEqual(morning.assignments.map((row) => [row.kind, row.name]), [["GUIDE", "Ravi"], ["VEHICLE", "Van KA-01"]]);
  const afternoon = board.data.departures.find((row) => row.productId === ctx.product.id && row.time === "14:00");
  assert.equal(afternoon.guests, 0);
  assert.equal(afternoon.freeSeats, 20);

  // Front desk reads the board but doesn't assign crew.
  const desk = await addStaff(api, ctx, { name: "Counter", email: "desk@example.com", role: "FRONT_DESK" });
  assert.equal((await call(api, ctx, desk.token, `/departures?from=${day}`)).response.status, 200);
  assert.equal((await call(api, ctx, desk.token, "/departures/assignments", { body: { productId: ctx.product.id, date: day, time: "14:00", resourceId: ravi.id } })).response.status, 403);
  assert.equal((await call(api, ctx, desk.token, `/departures/assignments/${morning.assignments[0].id}`, { method: "DELETE" })).response.status, 403);

  // Unassigning frees the guide; deleting the van removes its assignments.
  assert.equal((await call(api, ctx, ctx.ownerToken, `/departures/assignments/${morning.assignments[0].id}`, { method: "DELETE" })).response.status, 200);
  assert.equal((await call(api, ctx, ctx.ownerToken, `/resources/${van.id}`, { method: "DELETE" })).response.status, 200);
  const after = await call(api, ctx, ctx.ownerToken, `/departures?from=${day}`);
  assert.deepEqual(after.data.departures.flatMap((row) => row.assignments), []);
});

test("a guide linked to a guide resource sees and checks in only their own departures", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const day = date();
  const morning = await walkIn(api, ctx, day, "09:00", 2);
  const afternoon = await walkIn(api, ctx, day, "14:00", 4);

  const guide = await addStaff(api, ctx, { name: "Asha", email: "asha@example.com", role: "GUIDE" });
  // Not linked yet: the guide role's normal access, every departure.
  const before = await call(api, ctx, guide.token, `/departures?from=${day}`);
  assert.ok(before.data.departures.some((row) => row.time === "14:00" && row.guests === 4));

  const asha = await resource(api, ctx, { name: "Asha", kind: "GUIDE", userId: guide.id });
  assert.equal(asha.user_id, guide.id);
  assert.equal((await call(api, ctx, ctx.ownerToken, "/departures/assignments", { body: { productId: ctx.product.id, date: day, time: "09:00", resourceId: asha.id } })).response.status, 201);

  const board = await call(api, ctx, guide.token, `/departures?from=${day}`);
  assert.deepEqual(board.data.departures.map((row) => row.time), ["09:00"]);
  assert.equal(board.data.departures[0].balanceDueInr, null);

  const manifest = await call(api, ctx, guide.token, `/manifest?productId=${ctx.product.id}&date=${day}`);
  assert.deepEqual(manifest.data.manifest.bookings.map((row) => row.id), [morning.id]);

  assert.equal((await call(api, ctx, guide.token, `/bookings/${morning.id}/attendance`, { method: "PATCH", body: { status: "CHECKED_IN" } })).response.status, 200);
  const refused = await call(api, ctx, guide.token, `/bookings/${afternoon.id}/attendance`, { method: "PATCH", body: { status: "CHECKED_IN" } });
  assert.equal(refused.response.status, 403);
  assert.equal(refused.data.code, "NOT_YOUR_DEPARTURE");
  const scanned = await call(api, ctx, guide.token, "/check-in", { body: { code: afternoon.ref, allowOtherDate: true } });
  assert.equal(scanned.data.code, "NOT_YOUR_DEPARTURE");
  assert.equal(db.prepare("SELECT attendance_status FROM bookings WHERE id = ?").get(afternoon.id).attendance_status, null);

  // A login from another supplier can't be linked.
  const stranger = await call(api, ctx, ctx.ownerToken, "/resources", { body: { name: "Stranger", capacity: 0, optionIds: [], kind: "GUIDE", userId: "usr_not_staff" } });
  assert.equal(stranger.response.status, 404);
});
