import test from "node:test";
import assert from "node:assert/strict";
import { activeCampaign, CAMPAIGN_TTL_MS, parseCampaignParams } from "../../shared/campaignAttribution.js";

test("campaign tags and ad click ids are read from a landing URL; other params are ignored", () => {
  assert.deepEqual(
    parseCampaignParams("?utm_source=instagram&utm_medium=social&utm_campaign=goa_launch&fbclid=abc&destination=Goa"),
    { utm_source: "instagram", utm_medium: "social", utm_campaign: "goa_launch", fbclid: "abc" },
  );
  assert.deepEqual(parseCampaignParams("?gclid=xyz"), { gclid: "xyz" });
  assert.equal(parseCampaignParams("?destination=Goa&utm_source="), null);
  assert.equal(parseCampaignParams(""), null);
  assert.equal(parseCampaignParams(`?utm_campaign=${"x".repeat(500)}`).utm_campaign.length, 200);
});

test("a stored campaign is credited for 30 days, then dropped", () => {
  const capturedAt = Date.UTC(2026, 8, 1);
  const stored = { utm_source: "instagram", capturedAt };
  assert.deepEqual(activeCampaign(stored, capturedAt + CAMPAIGN_TTL_MS - 1), { utm_source: "instagram" });
  assert.equal(activeCampaign(stored, capturedAt + CAMPAIGN_TTL_MS + 1), null);
  assert.equal(activeCampaign(null), null);
  assert.equal(activeCampaign({ utm_source: "instagram" }), null, "no capture time, no credit");
});
