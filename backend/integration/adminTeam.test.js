import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * Team management over HTTP: an admin adds staff with a one-time password,
 * staff sign in to operations but not the admin panel, and removing someone
 * revokes access at once, while the last administrator can never be removed.
 */

const ADMIN = { email: "team.admin@example.test", password: "Integration@Admin2026" };

test("admins manage staff and access changes take effect immediately", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_team_admin', 'Team Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  assert.ok(adminToken);

  // Only administrators can see or change the team.
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team")).response.status, 401);

  // A WhatsApp number that can't be delivered to is refused.
  const badPhone = await requestJson(api.baseUrl, "/api/admin/team", {
    token: adminToken, body: { name: "Ravi Kumar", email: "ravi@example.test", phone: "12345678", role: "STAFF" },
  });
  assert.equal(badPhone.response.status, 400);

  const added = await requestJson(api.baseUrl, "/api/admin/team", {
    token: adminToken, body: { name: "Ravi Kumar", email: "Ravi@Example.test", phone: "98765 43210", role: "STAFF" },
  });
  assert.equal(added.response.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.member.role, "STAFF");
  assert.equal(added.data.member.email, "ravi@example.test");
  assert.equal(added.data.member.phone, "+919876543210", "stored in the WhatsApp format alerts use");
  assert.ok(added.data.temporaryPassword?.length >= 12, "a new person gets a one-time password");
  assert.equal(JSON.stringify((await requestJson(api.baseUrl, "/api/admin/team", { token: adminToken })).data).includes(added.data.temporaryPassword), false,
    "the temporary password is never listed again");

  const duplicate = await requestJson(api.baseUrl, "/api/admin/team", {
    token: adminToken, body: { name: "Ravi Kumar", email: "ravi@example.test", phone: "+919876543210" },
  });
  assert.equal(duplicate.response.status, 409);

  // Staff sign in to operations, not the admin panel.
  const staffLogin = await requestJson(api.baseUrl, "/api/auth/login", {
    body: { email: "ravi@example.test", password: added.data.temporaryPassword, portal: "admin" },
  });
  assert.equal(staffLogin.response.status, 200, JSON.stringify(staffLogin.data));
  assert.equal(staffLogin.data.portalRedirect, "/ops");
  const staffToken = staffLogin.data.token;
  assert.equal((await requestJson(api.baseUrl, "/api/ops/tasks", { token: staffToken })).response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team", { token: staffToken })).response.status, 403);

  // Fixing a staff number is how an undeliverable WhatsApp alert gets resolved.
  const edited = await requestJson(api.baseUrl, `/api/admin/team/${added.data.member.id}`, {
    token: adminToken, method: "PATCH", body: { phone: "+91 91234 56789" },
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.data));
  assert.equal(edited.data.member.phone, "+919123456789");

  // A reset issues a new password and the old one stops working.
  const reset = await requestJson(api.baseUrl, `/api/admin/team/${added.data.member.id}/reset-password`, { token: adminToken, method: "POST", body: {} });
  assert.equal(reset.response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "ravi@example.test", password: added.data.temporaryPassword } })).response.status, 401);
  assert.equal((await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "ravi@example.test", password: reset.data.temporaryPassword } })).response.status, 200);

  // An existing traveler is promoted and keeps their own password; a supplier is refused.
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_team_traveler', 'Meera', 'meera@example.test', ?, 'TRAVELER')").run(hashPassword("Traveler@2026"));
  const promoted = await requestJson(api.baseUrl, "/api/admin/team", {
    token: adminToken, body: { name: "Meera Shah", email: "meera@example.test", phone: "+919812345678", role: "ADMIN" },
  });
  assert.equal(promoted.response.status, 201, JSON.stringify(promoted.data));
  assert.equal(promoted.data.promotedExistingAccount, true);
  assert.equal(promoted.data.temporaryPassword, null);
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_team_supplier', 'Cab Co', 'cabs@example.test', ?, 'SUPPLIER')").run(hashPassword("Supplier@2026"));
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team", {
    token: adminToken, body: { name: "Cab Co", email: "cabs@example.test", phone: "+919800000000" },
  })).response.status, 409);

  // Nobody removes themselves, and the last administrator always stays.
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team/usr_team_admin", { token: adminToken, method: "DELETE" })).response.status, 409);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team/usr_team_traveler", { token: adminToken, method: "DELETE" })).response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/team/usr_team_admin", {
    token: adminToken, method: "PATCH", body: { role: "STAFF" },
  })).response.status, 409);

  // Removing staff revokes an already signed-in session straight away.
  const removed = await requestJson(api.baseUrl, `/api/admin/team/${added.data.member.id}`, { token: adminToken, method: "DELETE" });
  assert.equal(removed.response.status, 200);
  assert.equal((await requestJson(api.baseUrl, "/api/ops/tasks", { token: staffToken })).response.status, 403);
  assert.equal(db.prepare("SELECT role FROM users WHERE id = ?").get(added.data.member.id).role, "TRAVELER", "the account and its history are kept");

  const team = await requestJson(api.baseUrl, "/api/admin/team", { token: adminToken });
  assert.deepEqual(team.data.members.map((member) => member.email), [ADMIN.email]);
});
