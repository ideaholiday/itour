import { describe, it, before, after } from "node:test";

// Identity verification runs against a simulated Cashfree, so these tests do
// not depend on a live account or network.
process.env.CASHFREE_SECUREID_SIMULATE = "true";
import assert from "node:assert/strict";
import db from "../src/db.js";
import affiliateRouter from "../src/routes/affiliate.js";
import adminAffiliatesRouter from "../src/routes/adminAffiliates.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods[method.toLowerCase()]);
  if (!layer) throw new Error(`Route not found: ${method} ${path}`);
  return layer.route.stack.at(-1).handle;
}

describe("Affiliate & Admin API Route Endpoints", () => {
  const testUserId = "user_api_aff_01";
  const testAffCode = "APITEST10";

  before(() => {
    db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    db.prepare(`
      INSERT INTO users (id, name, email, password, phone, role)
      VALUES (?, 'API Creator', 'apicreator@example.com', 'test-password', '9876543212', 'TRAVELER')
    `).run(testUserId);

    db.prepare("UPDATE affiliates SET default_payout_account_id = NULL WHERE user_id = ?").run(testUserId);
    db.prepare("DELETE FROM affiliate_ledger WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM affiliate_referrals WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM affiliate_attributions WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM affiliate_payouts WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM affiliate_payout_accounts WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM affiliate_clicks WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
    db.prepare("DELETE FROM promo_codes WHERE code = ?").run(testAffCode);
    db.prepare("DELETE FROM affiliates WHERE user_id = ? OR affiliate_code = ?").run(testUserId, testAffCode);
  });

  after(() => {
    try {
      db.prepare("UPDATE affiliates SET default_payout_account_id = NULL WHERE user_id = ?").run(testUserId);
    db.prepare("DELETE FROM affiliate_ledger WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM affiliate_referrals WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM affiliate_attributions WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM affiliate_payouts WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM affiliate_payout_accounts WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM affiliate_clicks WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)").run(testUserId);
      db.prepare("DELETE FROM promo_codes WHERE code = ?").run(testAffCode);
      db.prepare("DELETE FROM affiliates WHERE user_id = ?").run(testUserId);
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    } catch {}
  });

  it("GET /me returns registered: false before registration", () => {
    const handler = findRouteHandler(affiliateRouter, "GET", "/me");
    const req = { user: { id: testUserId } };
    const res = createMockRes();

    handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.registered, false);
  });

  it("POST /register creates affiliate profile", async () => {
    const handler = findRouteHandler(affiliateRouter, "POST", "/register");
    const req = {
      user: { id: testUserId },
      body: {
        channelName: "API Creator Studio",
        channelType: "INSTAGRAM",
        channelUrl: "https://instagram.com/apicreator",
        customCode: testAffCode,
        bio: "API test bio",
      },
    };
    const res = createMockRes();

    await handler(req, res);
    assert.equal(res.statusCode, 201);
    assert.ok(res.body.affiliate);
    assert.equal(res.body.affiliate.affiliate_code, testAffCode);
  });

  it("GET /me returns registered: true after registration", () => {
    const handler = findRouteHandler(affiliateRouter, "GET", "/me");
    const req = { user: { id: testUserId } };
    const res = createMockRes();

    handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.registered, true);
    assert.equal(res.body.affiliate.affiliate_code, testAffCode);
  });

  it("GET /dashboard returns aggregated metrics", () => {
    const handler = findRouteHandler(affiliateRouter, "GET", "/dashboard");
    const req = { user: { id: testUserId } };
    const res = createMockRes();

    handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.dashboard);
    assert.equal(res.body.dashboard.affiliateCode, testAffCode);
    assert.equal(res.body.dashboard.commissionRate, 0.10);
  });

  it("POST /track-click records link visits", () => {
    const handler = findRouteHandler(affiliateRouter, "POST", "/track-click");
    const req = {
      body: {
        affiliateCode: testAffCode,
        destinationPath: "/activity/mumbai-heritage-walk",
        referrerUrl: "https://youtube.com",
      },
      ip: "10.0.0.1",
    };
    const res = createMockRes();

    handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
  });

  it("GET /api/admin/affiliates lists affiliates for platform admin", () => {
    const handler = findRouteHandler(adminAffiliatesRouter, "GET", "/");
    const req = { query: { search: testAffCode } };
    const res = createMockRes();

    handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.affiliates.length >= 1);
    assert.equal(res.body.affiliates[0].affiliate_code, testAffCode);
  });
});
