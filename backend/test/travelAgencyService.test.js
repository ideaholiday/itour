import assert from "node:assert/strict";
import { test } from "node:test";
import { agentPrice, assertNoAgentCoupon, normalizeTaxIds } from "../src/services/travelAgencyService.js";

const agency = { id: "agy_1", agency_name: "Awadh Holidays", discount_pct: 10 };

test("the agent price is the website price less the agency's %, rounded", () => {
  assert.deepEqual(agentPrice(agency, { totalInr: 4_999, commissionInr: 1_500 }), {
    agencyId: "agy_1", agencyName: "Awadh Holidays", discountPct: 10,
    websitePriceInr: 4_999, discountInr: 500, agentPriceInr: 4_499, cappedByCommission: false,
  });
  assert.equal(agentPrice(null, { totalInr: 1000, commissionInr: 300 }), null);
});

test("the discount always stays below the booking's commission", () => {
  // A listing with a 5% commission override can't fund a 10% agent discount.
  const price = agentPrice(agency, { totalInr: 2_000, commissionInr: 100 });
  assert.equal(price.discountInr, 99, "IdeaHoliday keeps at least ₹1");
  assert.equal(price.agentPriceInr, 1_901);
  assert.equal(price.cappedByCommission, true);
  assert.equal(agentPrice(agency, { totalInr: 2_000, commissionInr: 0 }).discountInr, 0);
});

test("an agency gives a GSTIN or a PAN, and they must agree", () => {
  assert.deepEqual(normalizeTaxIds({ gstin: " 09abcde1234f1z5 " }), { gstin: "09ABCDE1234F1Z5", pan: "ABCDE1234F" });
  assert.deepEqual(normalizeTaxIds({ pan: "abcde1234f" }), { gstin: null, pan: "ABCDE1234F" });
  assert.throws(() => normalizeTaxIds({}), { code: "TAX_ID_REQUIRED" });
  assert.throws(() => normalizeTaxIds({ pan: "ABCDE12345" }), { code: "INVALID_PAN" });
  assert.throws(() => normalizeTaxIds({ gstin: "09ABCDE1234F1Z5", pan: "ZZZZZ9999Z" }), { code: "PAN_GSTIN_MISMATCH" });
});

test("agent bookings take no coupon", () => {
  assert.throws(() => assertNoAgentCoupon(agency, "GOA10"), { code: "AGENT_NO_COUPONS", status: 400 });
  assert.doesNotThrow(() => assertNoAgentCoupon(agency, ""));
  assert.doesNotThrow(() => assertNoAgentCoupon(null, "GOA10"));
});
