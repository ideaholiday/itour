import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * The creator side of the program: what the landing page may promise, what a
 * creator can register, and the controls that stop their earnings being
 * redirected or their code being used for a personal discount.
 *
 * Verification is pointed at an address that refuses connections, so every
 * PAN and penny-drop check behaves like a provider outage and nothing leaves
 * the machine.
 */

// Stored times are UTC without a zone ("2026-09-17 10:00:00").
const utcMs = (value) => {
  const text = String(value).replace(" ", "T");
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`).getTime();
};

const OUTAGE = {
  CASHFREE_SECUREID_SIMULATE: "false",
  CASHFREE_SECUREID_SIMULATION_FALLBACK: "false",
  CASHFREE_SECUREID_PROXY_URL: "http://127.0.0.1:9",
  CASHFREE_SECUREID_TIMEOUT_MS: "2000",
};

test("creators get honest program terms, can't use their own code, and can't dodge payout safeguards", async (t) => {
  const api = await startTestServer(OUTAGE);
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  // Public program terms come from the live tiers.
  const program = await requestJson(api.baseUrl, "/api/affiliate/program");
  assert.equal(program.response.status, 200, JSON.stringify(program.data));
  const starter = db.prepare("SELECT * FROM affiliate_tiers ORDER BY sort_order LIMIT 1").get();
  assert.equal(program.data.program.entryTier.commissionPct, Math.round(starter.commission_rate * 10000) / 100);
  assert.equal(program.data.program.entryTier.travelerDiscountPct, starter.traveler_discount_pct);
  assert.equal(program.data.program.minPayoutInr, 1000);
  assert.ok(Array.isArray(program.data.program.liveCities));

  const signup = (name, email, phone) => requestJson(api.baseUrl, "/api/auth/signup", { body: { name, email, password: "Integration@2026", phone } });
  const creator = await signup("Tara Singh", "tara.creator@example.test", "+919666600001");
  const follower = await signup("Kabir Das", "kabir.follower@example.test", "+919666600002");
  const token = creator.data.token;

  const badLink = await requestJson(api.baseUrl, "/api/affiliate/register", { token, body: { channelName: "Tara Trips", channelUrl: "javascript:alert(1)" } });
  assert.equal(badLink.response.status, 400, "only web links are accepted");
  const badType = await requestJson(api.baseUrl, "/api/affiliate/register", { token, body: { channelName: "Tara Trips", channelType: "<script>" } });
  assert.equal(badType.response.status, 400);
  const registered = await requestJson(api.baseUrl, "/api/affiliate/register", { token, body: { channelName: "Tara Trips", channelType: "INSTAGRAM", channelUrl: "https://instagram.com/taratrips", customCode: "TARATRIPS" } });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.data));
  const affiliateId = registered.data.affiliate.id;

  // The code discounts a follower's booking, never the creator's own.
  const own = await requestJson(api.baseUrl, "/api/promo/validate", { token, body: { code: "TARATRIPS", amountInr: 5000 } });
  assert.equal(own.response.status, 400, JSON.stringify(own.data));
  assert.match(own.data.error, /your own creator code/);
  const followerUse = await requestJson(api.baseUrl, "/api/promo/validate", { token: follower.data.token, body: { code: "TARATRIPS", amountInr: 5000 } });
  assert.equal(followerUse.response.status, 200, JSON.stringify(followerUse.data));

  // First account is usable at once; removing it and adding another is still a change of destination.
  const addBank = (accountNumber) => requestJson(api.baseUrl, "/api/affiliate/payout-accounts", {
    token, body: { method: "BANK_TRANSFER", accountNumber, ifsc: "HDFC0001234", accountHolder: "Tara Singh" },
  });
  const first = await addBank("123456789012");
  assert.equal(first.response.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.account.verificationStatus, "PENDING", "an outage never marks an account verified");
  assert.ok(utcMs(first.data.account.usableFrom) <= Date.now() + 60_000);
  assert.equal((await requestJson(api.baseUrl, `/api/affiliate/payout-accounts/${first.data.account.id}`, { method: "DELETE", token })).response.status, 200);
  const second = await addBank("998877665544");
  assert.equal(second.response.status, 201, JSON.stringify(second.data));
  const hoursUntilUsable = (utcMs(second.data.account.usableFrom) - Date.now()) / 3_600_000;
  assert.ok(hoursUntilUsable > 23, `archiving every account must not skip the 24h cooling period (usable in ${hoursUntilUsable.toFixed(1)}h)`);

  // Five new accounts a day, then refused (each bank account is a paid check).
  for (const upiId of ["tara@okhdfcbank", "tara.trips@okaxis", "tara1@ybl"]) {
    const added = await requestJson(api.baseUrl, "/api/affiliate/payout-accounts", { token, body: { method: "UPI", upiId } });
    assert.equal(added.response.status, 201, JSON.stringify(added.data));
  }
  const sixth = await requestJson(api.baseUrl, "/api/affiliate/payout-accounts", { token, body: { method: "UPI", upiId: "tara2@ybl" } });
  assert.equal(sixth.response.status, 429, JSON.stringify(sixth.data));

  // A verified PAN swapped for another during an outage does not stay verified.
  db.prepare("UPDATE affiliates SET pan_number = 'ABCDE1234F', pan_verified = 1, kyc_status = 'VERIFIED' WHERE id = ?").run(affiliateId);
  const samePan = await requestJson(api.baseUrl, "/api/affiliate/kyc", { token, body: { panNumber: "ABCDE1234F", panHolderName: "Tara Singh" } });
  assert.equal(samePan.response.status, 200, JSON.stringify(samePan.data));
  assert.equal(db.prepare("SELECT pan_verified FROM affiliates WHERE id = ?").get(affiliateId).pan_verified, 1, "resubmitting the verified PAN keeps it verified");
  const swapped = await requestJson(api.baseUrl, "/api/affiliate/kyc", { token, body: { panNumber: "ZZZZZ9999Z", panHolderName: "Someone Else" } });
  assert.equal(swapped.response.status, 200, JSON.stringify(swapped.data));
  const after = db.prepare("SELECT pan_verified, kyc_status FROM affiliates WHERE id = ?").get(affiliateId);
  assert.deepEqual({ ...after }, { pan_verified: 0, kyc_status: "PENDING_REVIEW" });

  // The dashboard reports the rates this creator actually has.
  db.prepare("UPDATE affiliates SET commission_override_rate = 0.065, traveler_discount_override_pct = 3.5 WHERE id = ?").run(affiliateId);
  const dashboard = await requestJson(api.baseUrl, "/api/affiliate/dashboard", { token });
  assert.equal(dashboard.response.status, 200, JSON.stringify(dashboard.data));
  assert.equal(dashboard.data.dashboard.commissionRate, 0.065);
  assert.equal(dashboard.data.dashboard.travelerDiscountPct, 3.5);
  assert.equal(dashboard.data.dashboard.tier.ratesOverridden, true);
});
