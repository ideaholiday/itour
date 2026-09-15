import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildCspDirectives, configureSecurity } from "../src/middleware/security.js";
import securityTxtRouter from "../src/routes/securityTxt.js";

test("buildCspDirectives constructs allowed directives for third-party integrations", () => {
  const directives = buildCspDirectives({
    NODE_ENV: "production",
    ALLOWED_ORIGINS: "https://ideaholiday.in",
    PUBLIC_APP_URL: "https://ideaholiday.in",
  });

  assert.ok(directives.defaultSrc.includes("'self'"));
  assert.ok(directives.scriptSrc.some((s) => s.includes("apis.mappls.com")));
  assert.ok(directives.scriptSrc.some((s) => s.includes("sdk.cashfree.com")));
  assert.ok(directives.scriptSrc.some((s) => s.includes("checkout.razorpay.com")));
  assert.ok(directives.connectSrc.some((s) => s.includes("supabase.co")));
  assert.ok(directives.connectSrc.includes("https://payments-test.cashfree.com"));
  assert.ok(directives.frameSrc.includes("https://sandbox.cashfree.com"));
  assert.ok(directives.frameSrc.includes("https://payments-test.cashfree.com"));
  assert.ok(directives.frameSrc.includes("https://payments.cashfree.com"));
  assert.ok(directives.frameAncestors.includes("'none'"));
  assert.ok(directives.objectSrc.includes("'none'"));
});

test("security.txt route serves RFC 9116 content", () => {
  const headers = {};
  let body = "";
  const req = { method: "GET", url: "/.well-known/security.txt" };
  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    send(text) {
      body = text;
    },
  };

  securityTxtRouter.handle(req, res);
  assert.ok(headers["content-type"].includes("text/plain"));
  assert.ok(body.includes("Contact: mailto:security@ideaholiday.in"));
  assert.ok(body.includes("Expires:"));
  assert.ok(body.includes("Canonical:"));
});

test("pages send a Referer origin so OpenStreetMap serves map tiles", async () => {
  const app = express();
  configureSecurity(app, { NODE_ENV: "test" });
  app.get("/", (_req, res) => res.send("ok"));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  } finally {
    server.close();
  }
});
