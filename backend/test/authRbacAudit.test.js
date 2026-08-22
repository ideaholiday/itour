import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import {
  createAuthentication,
  requireBookingOwner,
  requireRoles,
  requireSchedulerOrRoles,
  requireSupplierSelf,
  resolveDatabasePrincipal,
  verifyAccessToken,
} from "../src/middleware/auth.js";
import { auditMutations } from "../src/services/auditService.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, email TEXT UNIQUE);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, cashfree_order_id TEXT, user_id TEXT, traveler_email TEXT, supplier_id TEXT);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, action TEXT, actor_id TEXT, actor_role TEXT, resource_type TEXT,
      resource_id TEXT, request_id TEXT, ip_address TEXT, user_agent TEXT, outcome TEXT,
      metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

function response() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function request(headers = {}) {
  return { headers, requestId: "req-auth", method: "GET", path: "/protected", originalUrl: "/protected", ip: "127.0.0.1" };
}

test("Express JWT verification accepts valid tokens and rejects expired tokens", async () => {
  const secret = process.env.JWT_SECRET || "dev-secret-change-me";
  const valid = jwt.sign({ id: "user_1", email: "one@example.com" }, secret, { expiresIn: "1m" });
  const identity = await verifyAccessToken(valid, { supabaseClient: { auth: { getUser: async () => ({ data: {}, error: new Error("unused") }) } } });
  assert.equal(identity.source, "local");
  const expired = jwt.sign({ id: "user_1", email: "one@example.com", exp: 1 }, secret);
  await assert.rejects(() => verifyAccessToken(expired, { supabaseClient: { auth: { getUser: async () => ({ data: {}, error: new Error("rejected") }) } } }));
});

test("Supabase tokens are verified remotely and rejected sessions fail closed", async () => {
  const token = jwt.sign({ iss: "https://project.supabase.co/auth/v1", sub: "external_1" }, "not-the-backend-secret");
  const accepted = await verifyAccessToken(token, { supabaseClient: { auth: { getUser: async () => ({ data: { user: { id: "external_1", email: "verified@example.com", email_confirmed_at: "2026-08-22T00:00:00Z", user_metadata: { role: "ADMIN" } } }, error: null }) } } });
  assert.deepEqual({ source: accepted.source, externalId: accepted.externalId, email: accepted.email }, { source: "supabase", externalId: "external_1", email: "verified@example.com" });
  await assert.rejects(() => verifyAccessToken(token, { supabaseClient: { auth: { getUser: async () => ({ data: {}, error: new Error("invalid") }) } } }));
});

test("database roles override token metadata, suppliers link by verified email, and unmatched users become travelers", () => {
  const db = database();
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run("admin_1", "Admin", "admin@example.com", "x", "ADMIN");
  db.prepare("INSERT INTO suppliers VALUES (?, ?)").run("supplier_1", "supplier@example.com");
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)").run("supplier_user", "Supplier", "supplier@example.com", "x", "SUPPLIER");

  const admin = resolveDatabasePrincipal({ source: "supabase", externalId: "external-admin", email: "admin@example.com", emailVerified: true, role: "TRAVELER" }, db);
  assert.equal(admin.role, "ADMIN");
  const supplier = resolveDatabasePrincipal({ source: "supabase", externalId: "external-supplier", email: "supplier@example.com", emailVerified: true }, db);
  assert.equal(supplier.supplier_id, "supplier_1");
  const traveler = resolveDatabasePrincipal({ source: "supabase", externalId: "new_external", email: "new@example.com", name: "New User", role: "ADMIN" }, db);
  assert.equal(traveler.role, "TRAVELER");
  assert.equal(traveler.supplier_id, null);
  assert.notEqual(db.prepare("SELECT password FROM users WHERE id = ?").get("new_external").password, "");
  db.prepare("INSERT INTO suppliers VALUES (?, ?)").run("supplier_unverified", "pending@example.com");
  const unverified = resolveDatabasePrincipal({ source: "supabase", externalId: "pending_external", email: "pending@example.com", emailVerified: false }, db);
  assert.equal(unverified.role, "TRAVELER");
  assert.equal(unverified.supplier_id, null);
  db.close();
});

test("legacy identity headers cannot authenticate a request", async () => {
  const db = database();
  const auth = createAuthentication({ database: db, verifyToken: async () => { throw new Error("must not run"); } });
  const req = request({ "x-user-id": "admin_1", "x-user-email": "admin@example.com" });
  const res = response();
  await auth.authenticate(req, res, () => assert.fail("authentication should not succeed"));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "AUTH_REQUIRED");
  assert.equal(db.prepare("SELECT outcome FROM audit_logs").get().outcome, "DENIED");
  db.close();
});

test("role, supplier-self and scheduler guards distinguish 401 and 403", () => {
  const unauthenticated = request();
  const unauthorizedResponse = response();
  requireRoles("ADMIN")(unauthenticated, unauthorizedResponse, () => assert.fail());
  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.equal(unauthorizedResponse.body.code, "AUTH_REQUIRED");

  const traveler = { ...request(), user: { id: "u1", role: "TRAVELER" }, params: { id: "supplier_2" } };
  const forbiddenResponse = response();
  requireSupplierSelf("id")(traveler, forbiddenResponse, () => assert.fail());
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(forbiddenResponse.body.code, "FORBIDDEN");

  const db = database();
  db.prepare("INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?)").run("booking_1", "IH-001", null, "traveler_1", "owner@example.com", "supplier_1");
  let bookingAllowed = false;
  requireBookingOwner({ database: db })({
    ...request(),
    user: { id: "traveler_1", email: "owner@example.com", role: "TRAVELER" },
    params: { ref: "IH-001" },
    body: {},
    query: {},
  }, response(), () => { bookingAllowed = true; });
  assert.equal(bookingAllowed, true);
  const otherTravelerResponse = response();
  requireBookingOwner({ database: db })({
    ...request(),
    user: { id: "traveler_2", email: "other@example.com", role: "TRAVELER" },
    params: { ref: "IH-001" },
    body: {},
    query: {},
  }, otherTravelerResponse, () => assert.fail());
  assert.equal(otherTravelerResponse.statusCode, 403);
  db.close();

  const previous = process.env.ASSIGNMENT_SCHEDULER_TOKEN;
  process.env.ASSIGNMENT_SCHEDULER_TOKEN = "scheduler-secret";
  let allowed = false;
  requireSchedulerOrRoles("ADMIN")({ ...request({ "x-scheduler-token": "scheduler-secret" }) }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
  if (previous === undefined) delete process.env.ASSIGNMENT_SCHEDULER_TOKEN;
  else process.env.ASSIGNMENT_SCHEDULER_TOKEN = previous;
});

test("successful mutations create durable audit rows while failed validation does not", () => {
  const db = database();
  const middleware = auditMutations(db);
  const successfulReq = { ...request(), method: "PATCH", user: { id: "admin_1", role: "ADMIN" }, baseUrl: "/api/admin", route: { path: "/coverage/:id/review" }, originalUrl: "/api/admin/coverage/zone_1/review" };
  const successfulRes = response();
  middleware(successfulReq, successfulRes, () => {});
  successfulRes.statusCode = 200;
  successfulRes.emit("finish");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_logs").get().count, 1);

  const failedReq = { ...successfulReq, requestId: "req-failed" };
  const failedRes = response();
  middleware(failedReq, failedRes, () => {});
  failedRes.statusCode = 400;
  failedRes.emit("finish");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_logs").get().count, 1);
  db.close();
});
