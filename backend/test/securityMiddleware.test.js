import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { allowedOrigins, configureSecurity, corsOptions, createRateLimiter } from "../src/middleware/security.js";

function corsDecision(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
  });
}

async function applyLimiter(limiter, ip = "127.0.0.1") {
  const request = {
    app: { get: () => false },
    headers: {},
    ip,
    method: "GET",
    originalUrl: "/test",
    socket: { remoteAddress: ip },
  };
  const headers = new Map();
  const response = {
    body: null,
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    append(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    json(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
  let nextError = null;
  let nextCalled = false;
  await limiter(request, response, (error) => {
    nextError = error || null;
    nextCalled = !error;
  });
  if (nextError) throw nextError;
  return { headers, nextCalled, request, response };
}

test("production CORS allowlist contains configured application origins only", () => {
  assert.deepEqual(allowedOrigins({
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://admin.ideaholiday.in, https://ideaholiday.in/",
    PUBLIC_APP_URL: "https://ideaholiday.in",
  }), ["https://admin.ideaholiday.in", "https://ideaholiday.in"]);
});

test("security middleware configures proxy trust and strict origin decisions", async () => {
  const app = express();
  configureSecurity(app, {
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://ideaholiday.in",
    GLOBAL_RATE_LIMIT: "100",
    TRUST_PROXY_HOPS: "2",
  });
  const options = corsOptions({
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://ideaholiday.in",
  });

  assert.equal(app.enabled("x-powered-by"), false);
  assert.equal(app.get("trust proxy"), 2);
  assert.equal(await corsDecision(options, "https://ideaholiday.in"), true);
  assert.equal(await corsDecision(options, "https://malicious.example"), false);
  assert.equal(await corsDecision(options, undefined), true);
});

test("rate limiter returns a structured 429 response after the configured limit", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 2, scope: "test" });
  assert.equal((await applyLimiter(limiter)).nextCalled, true);
  assert.equal((await applyLimiter(limiter)).nextCalled, true);
  const blocked = await applyLimiter(limiter);

  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.deepEqual(blocked.response.body, {
    error: "Too many requests",
    scope: "test",
    retryAfterSeconds: 60,
  });
});
