import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import logger, { REDACTED, redactSensitive } from "../src/config/logger.js";
import { errorHandler, requestContext, requestLogger, stableErrorResponses } from "../src/middleware/observability.js";

function responseEmitter() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
}

test("nested credentials, OTPs, payment data and PII are absent from serialized logs", () => {
  const input = {
    password: "correct-horse-battery-staple",
    nested: {
      authorization: "Bearer secret-token-value",
      otp: "123456",
      payment: { cardNumber: "4111111111111111", cvv: "123" },
      email: "traveler@example.com",
      phone: "+91 98765 43210",
      pan: "ABCDE1234F",
      gstin: "22ABCDE1234F1Z5",
      providerSecret: "provider-secret",
    },
  };
  const serialized = JSON.stringify(redactSensitive(input));
  for (const forbidden of [
    "correct-horse-battery-staple", "secret-token-value", "123456", "4111111111111111",
    "traveler@example.com", "98765 43210", "ABCDE1234F", "22ABCDE1234F1Z5", "provider-secret",
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(serialized.includes(REDACTED), true);
  assert.equal(redactSensitive("2026-08-22T11:44:55.507Z"), "2026-08-22T11:44:55.507Z");
});

test("request logging includes correlation, normalized route, actor and latency severity", () => {
  const req = {
    headers: { "x-request-id": "request-test-1" },
    method: "GET",
    baseUrl: "/api/bookings",
    route: { path: "/:ref" },
    path: "/ABC123",
    originalUrl: "/api/bookings/ABC123?token=ignored",
    params: { ref: "ABC123" },
    body: { password: "never-log-this" },
    user: { id: "user_1", role: "TRAVELER" },
    ip: "127.0.0.1",
  };
  const res = responseEmitter();
  const captured = [];
  const original = logger.log;
  logger.log = (...args) => captured.push(args);
  try {
    requestContext(req, res, () => {});
    requestLogger(req, res, () => {});
    res.statusCode = 403;
    res.emit("finish");
  } finally {
    logger.log = original;
  }
  assert.equal(req.requestId, "request-test-1");
  assert.equal(res.headers["X-Request-Id"], "request-test-1");
  assert.equal(captured[0][0], "warn");
  assert.equal(captured[0][2].route, "/api/bookings/:ref");
  assert.equal(captured[0][2].actorId, "user_1");
  assert.equal(typeof captured[0][2].durationMs, "number");
  assert.equal("body" in captured[0][2], false);
});

test("central errors are stable and never expose stack or provider details", () => {
  const req = { requestId: "req-error", method: "POST", path: "/api/test", headers: {}, ip: "127.0.0.1" };
  const res = responseEmitter();
  const original = logger.error;
  logger.error = () => {};
  try {
    const error = new Error("provider rejected api-secret-123");
    error.stack = "SECRET STACK";
    errorHandler(error, req, res, () => {});
  } finally {
    logger.error = original;
  }
  assert.deepEqual(res.body, { error: "An unexpected error occurred", code: "INTERNAL_ERROR", requestId: "req-error" });
  assert.equal(JSON.stringify(res.body).includes("provider"), false);
  assert.equal(JSON.stringify(res.body).includes("STACK"), false);
});

test("legacy route errors are normalized to the stable API contract", () => {
  const req = { requestId: "req-normalized" };
  const res = responseEmitter();
  stableErrorResponses(req, res, () => {});
  res.status(502).json({ error: "provider said secret-key-123", providerResponse: { token: "secret" } });
  assert.deepEqual(res.body, {
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
    requestId: "req-normalized",
  });
});
