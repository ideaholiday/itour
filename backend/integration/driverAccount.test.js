import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Driver sign-in by email code over HTTP (ADR 053): the code request never
 * reveals who is a driver, a right code gives a session, and the session
 * reads only this driver's trips.
 */

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const EMAIL = "signin.driver@example.test";

test("drivers sign in with an email code and see only their own trips", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());
  const supplier = db.prepare("SELECT id FROM suppliers LIMIT 1").get();
  db.prepare(`INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status, driver_email, seat_capacity)
    VALUES ('drv_signin', ?, 'Sign In Driver', '+919876500001', 'Swift Dzire Sedan', 'GA-01-ZZ-0001', 'AVAILABLE', ?, 4)`).run(supplier.id, EMAIL);

  // The same answer for a driver and a stranger.
  const known = await requestJson(api.baseUrl, "/api/driver-account/code", { body: { login: "98765 00001" } });
  const stranger = await requestJson(api.baseUrl, "/api/driver-account/code", { body: { login: "nobody@example.test" } });
  assert.equal(known.response.status, 200);
  assert.deepEqual(stranger.data, known.data);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_login_codes WHERE email = ?").get(EMAIL).n, 1);

  // Email is off in tests, so replace the code with one this test knows.
  const hash = createHmac("sha256", JWT_SECRET).update(`driver-login:${EMAIL}:123456`).digest("hex");
  db.prepare("UPDATE driver_login_codes SET code_hash = ? WHERE email = ?").run(hash, EMAIL);
  assert.equal((await requestJson(api.baseUrl, "/api/driver-account/session", { body: { login: EMAIL, code: "654321" } })).response.status, 401);
  const session = await requestJson(api.baseUrl, "/api/driver-account/session", { body: { login: EMAIL, code: "123456" } });
  assert.equal(session.response.status, 200, JSON.stringify(session.data));

  const trips = await requestJson(api.baseUrl, "/api/driver-account/trips", { token: session.data.token });
  assert.equal(trips.response.status, 200, JSON.stringify(trips.data));
  assert.deepEqual([trips.data.waiting, trips.data.upcoming, trips.data.past], [[], [], []]);
  assert.equal((await requestJson(api.baseUrl, "/api/driver-account/trips")).response.status, 401, "the list needs a driver session");

  const someoneElse = db.prepare("SELECT id FROM driver_assignments WHERE LOWER(COALESCE(driver_email, '')) <> ? LIMIT 1").get(EMAIL);
  const link = await requestJson(api.baseUrl, `/api/driver-account/trips/${someoneElse?.id || "missing"}/link`, { token: session.data.token, body: {} });
  assert.equal(link.response.status, 404, "another driver's trip is not found");
});
