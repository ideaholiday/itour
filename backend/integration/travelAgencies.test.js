import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * IdeaHoliday B2B travel agents (ADR 054): a traveler account applies with a
 * GSTIN or PAN, an admin approves it with a 5–10% discount, rejects it with a
 * reason (the agency can fix and reapply) or suspends it.
 */

const ADMIN = { email: "agency.admin@example.test", password: "Integration@Admin2026" };
const APPLICATION = {
  agencyName: "Awadh Holidays", contactName: "Sana Mirza", phone: "98765 11122",
  pan: "abcde1234f", city: "Lucknow", state: "Uttar Pradesh",
};

test("a traveler applies as a travel agency and an admin reviews it", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_agency_admin', 'Agency Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const agent = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Sana Mirza", email: "sana@awadh.example.test", password: "Integration@2026", phone: "+919876511122" } });
  const token = agent.data.token;
  assert.ok(token);

  const program = await requestJson(api.baseUrl, "/api/agents/program");
  assert.deepEqual([program.data.discountMinPct, program.data.discountMaxPct], [5, 10]);

  assert.equal((await requestJson(api.baseUrl, "/api/agents/apply", { body: APPLICATION })).response.status, 401);
  assert.equal((await requestJson(api.baseUrl, "/api/agents/me", { token })).data.agency, null);

  // A GSTIN or a PAN is required, in the right format, and they must agree.
  const noTaxId = await requestJson(api.baseUrl, "/api/agents/apply", { token, body: { ...APPLICATION, pan: "" } });
  assert.equal(noTaxId.response.status, 400);
  assert.equal(noTaxId.data.code, "TAX_ID_REQUIRED");
  const badGstin = await requestJson(api.baseUrl, "/api/agents/apply", { token, body: { ...APPLICATION, pan: "", gstin: "09ABCDE1234" } });
  assert.equal(badGstin.data.code, "INVALID_GSTIN");
  const mismatch = await requestJson(api.baseUrl, "/api/agents/apply", { token, body: { ...APPLICATION, gstin: "09ZZZZZ9999Z1Z5" } });
  assert.equal(mismatch.data.code, "PAN_GSTIN_MISMATCH");

  const applied = await requestJson(api.baseUrl, "/api/agents/apply", { token, body: APPLICATION });
  assert.equal(applied.response.status, 201, JSON.stringify(applied.data));
  assert.equal(applied.data.agency.status, "PENDING");
  assert.equal(applied.data.agency.pan, "ABCDE1234F");
  assert.equal(applied.data.agency.phone, "+919876511122");
  assert.equal(applied.data.agency.discountPct, null, "no agent price until approved");
  const agencyId = applied.data.agency.id;

  // Only traveler accounts apply, not staff, supplier or admin logins.
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_agency_staff', 'Ops Staff', 'staff.agency@example.test', ?, 'STAFF')").run(hashPassword("Integration@2026"));
  const staffToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "staff.agency@example.test", password: "Integration@2026", portal: "admin" } })).data.token;
  assert.ok(staffToken);
  const staffApply = await requestJson(api.baseUrl, "/api/agents/apply", { token: staffToken, body: APPLICATION });
  assert.equal(staffApply.response.status, 403);
  assert.equal(staffApply.data.code, "NOT_A_TRAVELER_ACCOUNT");

  // Only admins review.
  assert.equal((await requestJson(api.baseUrl, "/api/admin/agencies", { token })).response.status, 403);
  const queue = await requestJson(api.baseUrl, "/api/admin/agencies?status=PENDING", { token: adminToken });
  assert.equal(queue.response.status, 200, JSON.stringify(queue.data));
  assert.equal(queue.data.counts.PENDING, 1);
  assert.equal(queue.data.agencies[0].email, "sana@awadh.example.test");

  const review = (body) => requestJson(api.baseUrl, `/api/admin/agencies/${agencyId}`, { method: "PATCH", token: adminToken, body });

  // Rejecting needs a reason; the agency sees it, fixes the details and is pending again.
  assert.equal((await review({ status: "REJECTED" })).data.code, "REASON_REQUIRED");
  const rejected = await review({ status: "REJECTED", reason: "PAN name doesn't match the agency" });
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.data));
  assert.equal((await requestJson(api.baseUrl, "/api/agents/me", { token })).data.agency.reviewNote, "PAN name doesn't match the agency");
  const reapplied = await requestJson(api.baseUrl, "/api/agents/apply", { token, body: { ...APPLICATION, gstin: "09ABCDE1234F1Z5" } });
  assert.equal(reapplied.response.status, 200);
  assert.equal(reapplied.data.agency.status, "PENDING");
  assert.equal(reapplied.data.agency.gstin, "09ABCDE1234F1Z5");

  // The discount is 5–10%.
  assert.equal((await review({ status: "APPROVED", discountPct: 12 })).response.status, 400);
  const approved = await review({ status: "APPROVED", discountPct: 8 });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
  const me = (await requestJson(api.baseUrl, "/api/agents/me", { token })).data.agency;
  assert.equal(me.status, "APPROVED");
  assert.equal(me.discountPct, 8);

  // An approved agency can't reapply; an admin can change its discount or suspend it.
  assert.equal((await requestJson(api.baseUrl, "/api/agents/apply", { token, body: APPLICATION })).response.status, 409);
  assert.equal((await review({ status: "APPROVED", discountPct: 10 })).data.agency.discountPct, 10);
  assert.equal((await review({ status: "REJECTED", reason: "Too late to reject" })).data.code, "INVALID_TRANSITION");
  const suspended = await review({ status: "SUSPENDED", reason: "Chargebacks" });
  assert.equal(suspended.data.agency.status, "SUSPENDED");
  assert.equal((await requestJson(api.baseUrl, "/api/agents/me", { token })).data.agency.discountPct, null);

  // Each decision is audited and the agency is emailed.
  const audits = db.prepare("SELECT action FROM audit_logs WHERE resource_id = ? ORDER BY created_at").all(agencyId).map((row) => row.action);
  assert.ok(audits.includes("TRAVEL_AGENCY_APPLIED"));
  assert.equal(audits.filter((action) => action === "TRAVEL_AGENCY_REVIEWED").length, 4);
  let emails = [];
  for (let i = 0; i < 20 && emails.length < 4; i += 1) {
    emails = db.prepare("SELECT event_type FROM notification_deliveries WHERE event_type LIKE 'TRAVEL_AGENCY_%'").all().map((row) => row.event_type);
    if (emails.length < 4) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (const event of ["TRAVEL_AGENCY_APPLIED", "TRAVEL_AGENCY_REJECTED", "TRAVEL_AGENCY_APPROVED", "TRAVEL_AGENCY_SUSPENDED"]) {
    assert.ok(emails.includes(event), `${event} email sent`);
  }
});
