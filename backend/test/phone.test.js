import test from "node:test";
import assert from "node:assert/strict";
import { phoneCountry, toE164 } from "../src/lib/phone.js";
import { normalizeWhatsAppPhone } from "../src/services/whatsappService.js";
import { authSchemas } from "../src/validators/apiSchemas.js";

test("Indian numbers keep working however they are typed", () => {
  for (const typed of ["9876543210", "98765 43210", "09876543210", "+91 98765 43210", "919876543210", "0091 9876543210"]) {
    assert.equal(toE164(typed), "+919876543210", typed);
  }
});

test("Thai and UAE local numbers get their own country code, never +91", () => {
  assert.equal(toE164("081 234 5678", "TH"), "+66812345678");
  assert.equal(toE164("050 123 4567", "AE"), "+971501234567");
  assert.equal(toE164("050 123 4567", "971"), "+971501234567");
  // Without a country, a 10-digit number with a trunk 0 is not an Indian mobile.
  assert.equal(toE164("0812345678"), null);
  assert.equal(toE164("0501234567"), null);
  assert.equal(normalizeWhatsAppPhone("0812345678"), null);
});

test("a typed country code wins over the selected country", () => {
  assert.equal(toE164("+66 81 234 5678", "IN"), "+66812345678");
  assert.equal(toE164("+66 081 234 5678"), "+66812345678");
  assert.equal(toE164("+971 50 123 4567", "TH"), "+971501234567");
  assert.equal(toE164("66812345678"), "+66812345678");
  assert.equal(toE164("+1 212 555 0100"), "+12125550100");
});

test("numbers that are not mobiles in a known country are rejected", () => {
  assert.equal(toE164("+91 12345 67890"), null);
  assert.equal(toE164("+66 21 234 567"), null);
  assert.equal(toE164("+971 4 123 4567"), null);
  assert.equal(toE164("12345678"), null);
  assert.equal(toE164(""), null);
});

test("countries are found by ISO or dial code", () => {
  assert.equal(phoneCountry("th").dialCode, "66");
  assert.equal(phoneCountry("+971").iso, "AE");
  assert.equal(phoneCountry("44"), null);
});

test("signup accepts Thai and UAE numbers and rejects a local number with no country", () => {
  const base = { name: "Somchai", email: "somchai@example.com", password: "secret123" };
  assert.equal(authSchemas.signup.safeParse({ ...base, phone: "+66 81 234 5678" }).success, true);
  assert.equal(authSchemas.signup.safeParse({ ...base, phone: "+971 50 123 4567" }).success, true);
  assert.equal(authSchemas.signup.safeParse({ ...base, phone: "081 234 5678" }).success, false);
});
