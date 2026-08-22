import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCoverageReview } from "../src/lib/coverageReview.js";

test("approval activates a supplier coverage zone", () => {
  assert.deepEqual(normalizeCoverageReview("approved").value, {
    status: "APPROVED",
    isActive: 1,
    reviewNote: "Coverage boundary reviewed and approved.",
  });
});

test("rejection and suspension deactivate coverage and require a reason", () => {
  assert.match(normalizeCoverageReview("REJECTED", "no").error, /short reason/i);
  const suspended = normalizeCoverageReview("SUSPENDED", "Boundary exceeds verified operating area").value;
  assert.equal(suspended.isActive, 0);
  assert.equal(suspended.status, "SUSPENDED");
});
