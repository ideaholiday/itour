import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  verifyCashfreeWebhookSignature,
  createCashfreeOrder,
  processCashfreeRefund,
  getCashfreeOrder,
  getCashfreeRefundStatus,
  initiateCashfreeTransfer,
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

// --- Error paths on the Cashfree HTTP boundary ---
// These exercise cashfreeRequest, which every call in this module routes
// through, so a mistake here affects orders, refunds, payouts and KYB alike.

/** Replaces global fetch for one test and restores it afterwards. */
function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function withCredentials(t) {
  const previous = { ...process.env };
  process.env.CASHFREE_APP_ID = "test_app_id";
  process.env.CASHFREE_SECRET_KEY = "test_secret_key_12345";
  process.env.CASHFREE_ENV = "TEST";
  t.after(() => { process.env = previous; });
}

test("Cashfree calls refuse to leave the process without credentials", async t => {
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  delete process.env.CASHFREE_APP_ID;
  delete process.env.CASHFREE_SECRET_KEY;
  const calls = stubFetch(t, () => jsonResponse({}));

  await assert.rejects(
    () => getCashfreeOrder("order_1"),
    /credentials are not configured/,
    "a missing key must fail before any network call"
  );
  assert.equal(calls.length, 0, "no request may be attempted without credentials");
});

test("Cashfree surfaces the provider's own error message, then falls back", async t => {
  withCredentials(t);

  stubFetch(t, () => jsonResponse({ message: "order_id already exists" }, { ok: false, status: 409 }));
  await assert.rejects(() => getCashfreeOrder("dupe"), /order_id already exists/);

  stubFetch(t, () => jsonResponse({ error: { message: "nested provider detail" } }, { ok: false, status: 400 }));
  await assert.rejects(() => getCashfreeOrder("nested"), /nested provider detail/);

  // An empty or non-JSON body must still produce an actionable error.
  stubFetch(t, () => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } }));
  await assert.rejects(() => getCashfreeOrder("bad-body"), /failed with status 502/);
});

test("Cashfree targets sandbox unless the environment is explicitly production", async t => {
  withCredentials(t);

  let calls = stubFetch(t, () => jsonResponse({ ok: true }));
  await getCashfreeOrder("o1");
  assert.match(calls[0].url, /^https:\/\/sandbox\.cashfree\.com\/pg\//, "TEST must stay on sandbox");

  for (const env of ["PROD", "PRODUCTION", "prod"]) {
    process.env.CASHFREE_ENV = env;
    calls = stubFetch(t, () => jsonResponse({ ok: true }));
    await getCashfreeOrder("o2");
    assert.match(calls[0].url, /^https:\/\/api\.cashfree\.com\/pg\//, `${env} must reach live`);
  }

  // Anything unrecognised must not silently become live.
  process.env.CASHFREE_ENV = "staging";
  calls = stubFetch(t, () => jsonResponse({ ok: true }));
  await getCashfreeOrder("o3");
  assert.match(calls[0].url, /sandbox/, "an unknown environment must fail safe to sandbox");
});

test("Cashfree sends credentials as headers and never in the path or body", async t => {
  withCredentials(t);
  const calls = stubFetch(t, () => jsonResponse({ ok: true }));
  await getCashfreeOrder("order_1");

  const { url, options } = calls[0];
  assert.equal(options.headers["x-client-id"], "test_app_id");
  assert.equal(options.headers["x-client-secret"], "test_secret_key_12345");
  assert.doesNotMatch(url, /test_secret_key/, "the secret must never appear in a URL");
});

test("Cashfree order and refund ids are URL-encoded on the way out", async t => {
  withCredentials(t);
  const calls = stubFetch(t, () => jsonResponse({ refund_id: "r1" }));

  await getCashfreeRefundStatus("ord/../../admin", "rf?x=1");
  assert.doesNotMatch(calls[0].url, /\.\.\//, "path traversal must not survive into the request");
  assert.match(calls[0].url, /ord%2F\.\.%2F\.\.%2Fadmin/);
  assert.match(calls[0].url, /rf%3Fx%3D1/);
});

test("a Cashfree refund rounds to paise, truncates the note and defaults its status", async t => {
  withCredentials(t);
  const calls = stubFetch(t, () => jsonResponse({ cf_refund_id: "cf_1", refund_amount: 1234.57 }));

  const result = await processCashfreeRefund({
    orderId: "order_9",
    amount: 1234.5678,
    reason: "x".repeat(250),
  });

  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.refund_amount, 1234.57, "amounts are rounded to two decimals");
  assert.equal(sent.refund_note.length, 100, "the note is truncated to the provider's limit");
  assert.equal(sent.refund_speed, "STANDARD");
  assert.match(sent.refund_id, /^rfnd_\d+_[0-9a-f]{8}$/, "a generated refund id carries a random suffix so it cannot collide");

  assert.equal(result.success, true);
  assert.equal(result.cfRefundId, "cf_1");
  assert.equal(result.status, "PROCESSED", "a missing provider status defaults to PROCESSED");
});

test("a Cashfree refund keeps a caller-supplied idempotent refund id", async t => {
  withCredentials(t);
  const calls = stubFetch(t, () => jsonResponse({ refund_status: "PENDING" }));

  const result = await processCashfreeRefund({ orderId: "o", refundId: "rfnd_booking_42", amount: 100 });
  assert.equal(JSON.parse(calls[0].options.body).refund_id, "rfnd_booking_42");
  assert.equal(result.refundId, "rfnd_booking_42");
  assert.equal(result.status, "PENDING", "the provider's status wins when present");
});

test("webhook signatures reject every malformed input without throwing", () => {
  process.env.CASHFREE_SECRET_KEY = "test_secret_key_12345";
  const body = JSON.stringify({ order: { order_id: "o1" } });
  const timestamp = "1699999999";
  const valid = crypto.createHmac("sha256", "test_secret_key_12345").update(`${timestamp}${body}`).digest("base64");

  assert.equal(verifyCashfreeWebhookSignature(body, valid, timestamp), true);
  assert.equal(verifyCashfreeWebhookSignature(body, valid, "1700000000"), false, "a replayed timestamp must not verify");
  assert.equal(verifyCashfreeWebhookSignature(`${body} `, valid, timestamp), false, "a tampered body must not verify");
  assert.equal(verifyCashfreeWebhookSignature(body, "short", timestamp), false, "a length mismatch must not throw");
  assert.equal(verifyCashfreeWebhookSignature(body, "", timestamp), false);
  assert.equal(verifyCashfreeWebhookSignature("", valid, timestamp), false);
  assert.equal(verifyCashfreeWebhookSignature(body, valid, ""), false);
  assert.equal(verifyCashfreeWebhookSignature(body, null, timestamp), false);

  delete process.env.CASHFREE_SECRET_KEY;
  assert.equal(verifyCashfreeWebhookSignature(body, valid, timestamp), false, "no secret means no trust");
});

test("a Cashfree refund refuses an invalid amount instead of posting it", async t => {
  withCredentials(t);
  const calls = stubFetch(t, () => jsonResponse({}));

  // Previously these reached the provider as refund_amount null, 0 or negative.
  for (const amount of [undefined, null, "abc", NaN, 0, -50]) {
    await assert.rejects(
      () => processCashfreeRefund({ orderId: "o", amount }),
      /Refund amount must be a positive number/,
      `amount ${JSON.stringify(amount)} must be rejected locally`
    );
  }
  await assert.rejects(() => processCashfreeRefund({ orderId: "", amount: 100 }), /requires an order reference/);
  assert.equal(calls.length, 0, "no invalid refund may reach the payment provider");
});

test("generated Cashfree refund ids are unique within the same millisecond", async t => {
  withCredentials(t);
  stubFetch(t, () => jsonResponse({}));

  const ids = new Set();
  for (let i = 0; i < 50; i += 1) {
    const result = await processCashfreeRefund({ orderId: "o", amount: 10 });
    ids.add(result.refundId);
  }
  // refund_id is the provider's idempotency key, so a collision would make one
  // refund silently duplicate another.
  assert.equal(ids.size, 50, "every generated refund id must be distinct");
});

test("a supplier payout is never faked on live traffic", async t => {
  withCredentials(t);
  const payout = { transferId: "tr_1", amount: 1500, beneficiaryDetails: { account_number: "50200012345678", ifsc: "HDFC0000123" } };

  // Local sandbox keeps the simulated settlement for development.
  delete process.env.K_SERVICE;
  delete process.env.NODE_ENV;
  assert.equal((await initiateCashfreeTransfer(payout)).status, "PROCESSED");

  // Cloud Run on sandbox keys: no real transfer is possible, so refuse.
  process.env.K_SERVICE = "idea-holiday-marketplace";
  await assert.rejects(() => initiateCashfreeTransfer(payout), (err) => err.code === "PAYOUT_NOT_CONFIGURED");

  // Live keys, but Cashfree does not confirm the transfer.
  process.env.CASHFREE_ENV = "PROD";
  stubFetch(t, () => jsonResponse({ status: "ERROR", message: "Insufficient balance" }, { ok: false, status: 400 }));
  await assert.rejects(() => initiateCashfreeTransfer(payout), (err) => err.code === "PAYOUT_NOT_COMPLETED" && /Insufficient balance/.test(err.message));

  stubFetch(t, () => { throw new TypeError("fetch failed"); });
  await assert.rejects(() => initiateCashfreeTransfer(payout), (err) => err.code === "PAYOUT_NOT_COMPLETED");

  stubFetch(t, () => jsonResponse({ status: "SUCCESS", data: { referenceId: "ref_9", utr: "UTR123" } }));
  const done = await initiateCashfreeTransfer(payout);
  assert.equal(done.utr, "UTR123");
});
