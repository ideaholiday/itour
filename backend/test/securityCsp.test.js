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

test("security.txt route serves RFC 9116 content", async () => {
  const app = express();
  app.use("/", securityTxtRouter);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/.well-known/security.txt`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("text/plain"));

    const text = await res.text();
    assert.ok(text.includes("Contact: mailto:security@ideaholiday.in"));
    assert.ok(text.includes("Expires:"));
    assert.ok(text.includes("Canonical:"));
  } finally {
    server.close();
  }
});
