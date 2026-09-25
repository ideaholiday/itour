import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * Admin decisions on creators and traveler referrals: each one that takes money
 * or access away needs a written reason, lands in the audit log, and has the
 * effect the admin was told it would.
 */

const ADMIN = { email: "programs.admin@example.test", password: "Integration@Admin2026" };

function auditRow(db, action, resourceId) {
  const row = db.prepare("SELECT * FROM audit_logs WHERE action = ? AND resource_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(action, resourceId);
  return row ? { ...row, metadata: JSON.parse(row.metadata || "{}") } : null;
}

test("creator suspension switches the coupon off, KYC needs a PAN, and every decision is audited", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_programs_admin', 'Programs Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const creator = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Kavya Iyer", email: "kavya.creator@example.test", password: "Integration@2026", phone: "+919777700001" } });
  const registered = await requestJson(api.baseUrl, "/api/affiliate/register", { token: creator.data.token, body: { channelName: "Kavya Travels", customCode: "KAVYAGOA" } });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
  const affiliateId = registered.data.affiliate.id;
  const codeActive = () => db.prepare("SELECT is_active FROM promo_codes WHERE code = 'KAVYAGOA'").get().is_active;
  assert.equal(codeActive(), 1);

  const path = (suffix) => `/api/admin/affiliates/${affiliateId}${suffix}`;

  const noReason = await requestJson(api.baseUrl, path("/status"), { method: "PATCH", token: adminToken, body: { status: "SUSPENDED" } });
  assert.equal(noReason.response.status, 400, "suspending needs a reason");
  assert.equal(codeActive(), 1);

  const suspended = await requestJson(api.baseUrl, path("/status"), { method: "PATCH", token: adminToken, body: { status: "SUSPENDED", reason: "Followers look bought" } });
  assert.equal(suspended.response.status, 200, JSON.stringify(suspended.data));
  assert.equal(codeActive(), 0, "a suspended creator's code no longer discounts bookings");
  const promo = await requestJson(api.baseUrl, "/api/promo/validate", { token: creator.data.token, body: { code: "KAVYAGOA", amountInr: 5000 } });
  assert.notEqual(promo.response.status, 200, JSON.stringify(promo.data));
  const statusAudit = auditRow(db, "AFFILIATE_STATUS_CHANGED", affiliateId);
  assert.deepEqual(
    { previousStatus: statusAudit.metadata.previousStatus, nextStatus: statusAudit.metadata.nextStatus, reason: statusAudit.metadata.reason, actor: statusAudit.actor_id },
    { previousStatus: "ACTIVE", nextStatus: "SUSPENDED", reason: "Followers look bought", actor: "usr_programs_admin" },
  );

  const reactivated = await requestJson(api.baseUrl, path("/status"), { method: "PATCH", token: adminToken, body: { status: "ACTIVE" } });
  assert.equal(reactivated.response.status, 200, "reactivating needs no reason");
  assert.equal(codeActive(), 1);

  assert.equal((await requestJson(api.baseUrl, path("/kyc"), { method: "PATCH", token: adminToken, body: { kyc_status: "VERIFIED" } })).response.status, 400, "a KYC decision needs a reason");
  const noPan = await requestJson(api.baseUrl, path("/kyc"), { method: "PATCH", token: adminToken, body: { kyc_status: "VERIFIED", reason: "Looks fine" } });
  assert.equal(noPan.response.status, 409);
  assert.equal(noPan.data.code, "PAN_MISSING");
  assert.equal(db.prepare("SELECT pan_verified FROM affiliates WHERE id = ?").get(affiliateId).pan_verified, 0);

  db.prepare("UPDATE affiliates SET pan_number = 'ABCDE1234F' WHERE id = ?").run(affiliateId);
  const verified = await requestJson(api.baseUrl, path("/kyc"), { method: "PATCH", token: adminToken, body: { kyc_status: "VERIFIED", reason: "PAN card matches the bank name" } });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.affiliate.pan_number.includes("ABCDE1234F"), false, "PAN stays masked");
  assert.equal(auditRow(db, "AFFILIATE_KYC_DECIDED", affiliateId).metadata.reason, "PAN card matches the bank name");

  const detail = await requestJson(api.baseUrl, path("/detail"), { token: adminToken });
  assert.equal(detail.response.status, 200, JSON.stringify(detail.data));
  assert.equal(detail.data.balances.withdrawableInr, 0);
  assert.deepEqual(detail.data.accounts, []);
  assert.deepEqual(detail.data.referrals, []);
  assert.equal((await requestJson(api.baseUrl, "/api/admin/affiliates/aff_missing/detail", { token: adminToken })).response.status, 404);
  assert.equal((await requestJson(api.baseUrl, path("/detail"), { token: creator.data.token })).response.status, 403, "creators can't read the admin view");

  const metrics = await requestJson(api.baseUrl, "/api/admin/metrics", { token: adminToken });
  assert.equal(metrics.data.metrics.heldReferralRewards, 0);
  assert.equal(typeof metrics.data.metrics.pendingVerificationChecks, "number");
});

test("admins see top referrers, and blocking, reopening and rejecting need a reason", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_referrals_admin', 'Referrals Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const referrer = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Rohan Mehta", email: "rohan.ref@example.test", password: "Integration@2026", phone: "+919777700011" } });
  db.prepare("UPDATE users SET referral_code = 'REF-ROHAN77' WHERE id = ?").run(referrer.data.user.id);
  const friend = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Isha Menon", email: "isha.friend@example.test", password: "Integration@2026", phone: "+919777700012", referralCode: "REF-ROHAN77" } });
  assert.equal(friend.response.status, 200, JSON.stringify(friend.data));
  assert.deepEqual(friend.data.referral, { referred: true });

  const queue = await requestJson(api.baseUrl, "/api/referral/admin/review", { token: adminToken });
  assert.equal(queue.response.status, 200, JSON.stringify(queue.data));
  const top = queue.data.topReferrers.find((row) => row.referrer_user_id === referrer.data.user.id);
  assert.ok(top, JSON.stringify(queue.data.topReferrers));
  assert.equal(top.friends, 1);
  const relationship = top.activeRelationships[0];
  assert.equal(relationship.friend_name, "Isha Menon");

  const relPath = `/api/referral/admin/relationships/${relationship.id}`;
  assert.equal((await requestJson(api.baseUrl, relPath, { method: "PATCH", token: adminToken, body: { status: "BLOCKED" } })).response.status, 400);
  const blocked = await requestJson(api.baseUrl, relPath, { method: "PATCH", token: adminToken, body: { status: "BLOCKED", reason: "Same address and card" } });
  assert.equal(blocked.response.status, 200, JSON.stringify(blocked.data));

  assert.equal((await requestJson(api.baseUrl, relPath, { method: "PATCH", token: adminToken, body: { status: "ACTIVE" } })).response.status, 400, "reopening needs a reason");
  const reopened = await requestJson(api.baseUrl, relPath, { method: "PATCH", token: adminToken, body: { status: "ACTIVE", reason: "Spoke to both: siblings" } });
  assert.equal(reopened.response.status, 200);
  const audit = auditRow(db, "REFERRAL_RELATIONSHIP_STATUS_CHANGED", relationship.id);
  assert.equal(audit.metadata.reason, "Spoke to both: siblings");
  assert.equal(audit.metadata.previousStatus, "BLOCKED: Same address and card", "the audit keeps why it had been blocked");
  assert.equal(audit.actor_id, "usr_referrals_admin");

  const rejectNoNote = await requestJson(api.baseUrl, "/api/referral/admin/rewards/rr_missing/review", { method: "POST", token: adminToken, body: { decision: "REJECT" } });
  assert.equal(rejectNoNote.response.status, 400, "rejecting a reward needs a reason");
  const approveNoNote = await requestJson(api.baseUrl, "/api/referral/admin/rewards/rr_missing/review", { method: "POST", token: adminToken, body: { decision: "APPROVE" } });
  assert.equal(approveNoNote.response.status, 404, "approving needs no note; this reward just doesn't exist");
});

test("operations staff review referrals, but creator payouts and KYC stay admin-only", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const STAFF = { email: "ops.staff@example.test", password: "Integration@Staff2026" };
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_ops_staff', 'Ops Staff', ?, ?, 'STAFF')").run(STAFF.email, hashPassword(STAFF.password));
  const staffLogin = await requestJson(api.baseUrl, "/api/auth/login", { body: STAFF });
  assert.equal(staffLogin.response.status, 200, JSON.stringify(staffLogin.data));
  const staffToken = staffLogin.data.token;

  const referrer = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Dev Anand", email: "dev.ref@example.test", password: "Integration@2026", phone: "+919777700021" } });
  db.prepare("UPDATE users SET referral_code = 'REF-DEV21' WHERE id = ?").run(referrer.data.user.id);
  await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Meera Nair", email: "meera.friend@example.test", password: "Integration@2026", phone: "+919777700022", referralCode: "REF-DEV21" } });

  const queue = await requestJson(api.baseUrl, "/api/referral/admin/review", { token: staffToken });
  assert.equal(queue.response.status, 200, JSON.stringify(queue.data));
  assert.equal((await requestJson(api.baseUrl, "/api/referral/admin/metrics?days=30", { token: staffToken })).response.status, 200);
  const relationship = queue.data.topReferrers.find((row) => row.referrer_user_id === referrer.data.user.id).activeRelationships[0];
  const blocked = await requestJson(api.baseUrl, `/api/referral/admin/relationships/${relationship.id}`, { method: "PATCH", token: staffToken, body: { status: "BLOCKED", reason: "Same device as referrer" } });
  assert.equal(blocked.response.status, 200, JSON.stringify(blocked.data));
  assert.equal(auditRow(db, "REFERRAL_RELATIONSHIP_STATUS_CHANGED", relationship.id).actor_id, "usr_ops_staff");

  for (const path of ["/api/admin/affiliates", "/api/admin/affiliates/payouts", "/api/admin/affiliates/tiers", "/api/admin/metrics"]) {
    assert.equal((await requestJson(api.baseUrl, path, { token: staffToken })).response.status, 403, path);
  }
});
