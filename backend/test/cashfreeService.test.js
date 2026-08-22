import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  verifyCashfreeWebhookSignature,
  createCashfreeOrder,
  processCashfreeRefund,
} from "../src/services/cashfreeService.js";

test("verifies Cashfree webhook signature correctly", () => {
  const secretKey = "test_secret_key_12345";
  process.env.CASHFREE_SECRET_KEY = secretKey;

  const rawBody = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: { order_id: "ih_test_order_1" },
      payment: { cf_payment_id: "123456", payment_status: "SUCCESS" },
    },
  });
  const timestamp = "1723456789";

  const payload = `${timestamp}${rawBody}`;
  const validSignature = crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("base64");

  assert.equal(
    verifyCashfreeWebhookSignature(rawBody, validSignature, timestamp),
    true
  );

  assert.equal(
    verifyCashfreeWebhookSignature(rawBody, "invalid_sig", timestamp),
    false
  );

  assert.equal(
    verifyCashfreeWebhookSignature(rawBody, validSignature, "wrong_timestamp"),
    false
  );
});

test("creates Cashfree order payload and sanitizes fields", async () => {
  process.env.CASHFREE_APP_ID = "unit-test-client-id";
  process.env.CASHFREE_SECRET_KEY = "unit-test-client-secret";
  process.env.CASHFREE_ENV = "TEST";

  const originalFetch = global.fetch;
  const orderId = "ih_order_unit_test_" + Date.now().toString().slice(-6);

  global.fetch = async (url, options) => {
    assert.match(url, /sandbox\.cashfree\.com\/pg\/orders/);
    assert.equal(options.method, "POST");
    const parsed = JSON.parse(options.body);
    assert.equal(parsed.order_id, orderId);
    assert.equal(parsed.order_amount, 1500);
    assert.equal(parsed.order_currency, "INR");
    assert.equal(parsed.customer_details.customer_id, "cust_unit_test");
    assert.equal(parsed.customer_details.customer_phone, "9876543210");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        order_id: orderId,
        payment_session_id: "session_mock_cf_12345",
        order_amount: 1500,
        order_status: "ACTIVE"
      })
    };
  };

  try {
    const result = await createCashfreeOrder({
      orderId,
      amount: 1500,
      customer: {
        id: "cust_unit_test",
        name: "Unit Tester",
        email: "unit@example.com",
        phone: "9876543210",
      },
      notes: {
        platform: "Idea Holiday",
        test: "unit",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.orderId, orderId);
    assert.equal(result.paymentSessionId, "session_mock_cf_12345");
    assert.equal(result.orderAmount, 1500);
  } finally {
    global.fetch = originalFetch;
  }
});
