import test from "node:test";
import assert from "node:assert/strict";
import { demoPaymentsEnabled } from "../src/services/checkoutModeService.js";
test("production and Cloud Run never accept free demo payments even with legacy flags", () => {
  assert.equal(demoPaymentsEnabled({ K_SERVICE: "marketplace", ENABLE_DEMO_PAYMENT: "true" }), false);
  assert.equal(demoPaymentsEnabled({ NODE_ENV: "production", DEMO_PAYMENT_ONLY: "true" }), false);
  assert.equal(demoPaymentsEnabled({ NODE_ENV: "test", DEMO_PAYMENT_ONLY: "true" }), true);
  assert.equal(demoPaymentsEnabled({ NODE_ENV: "test", DEMO_PAYMENT_ONLY: "false", ENABLE_DEMO_PAYMENT: "false" }), false);
});
