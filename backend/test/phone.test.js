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

test("Singapore mobiles are 8 digits starting 8 or 9 (ADR 024)", () => {
  assert.equal(toE164("8123 4567", "SG"), "+6581234567");
  assert.equal(toE164("+65 9123 4567"), "+6591234567");
  assert.equal(toE164("+65 6123 4567"), null, "a Singapore landline is not a mobile");
});

test("Indonesian mobiles are 9 to 12 digits after the trunk 0 (ADR 024)", () => {
  assert.equal(toE164("0812 3456 7890", "ID"), "+6281234567890");
  assert.equal(toE164("+62 812 3456 789"), "+628123456789");
  assert.equal(toE164("+62 21 1234 5678"), null, "a Jakarta landline is not a mobile");
  assert.equal(toE164("+62 812 3456 7890 12"), null, "too long");
});

test("Maldives mobiles are 7 digits starting 7 or 9 (ADR 024)", () => {
  assert.equal(toE164("791 2345", "MV"), "+9607912345");
  assert.equal(toE164("+960 331 2345"), null, "a Malé landline is not a mobile");
});

test("Bhutan mobiles are 8 digits starting 17 or 77 (ADR 024)", () => {
  assert.equal(toE164("17 12 34 56", "BT"), "+97517123456");
  assert.equal(toE164("+975 77 12 34 56"), "+97577123456");
  assert.equal(toE164("+975 2 32 1234"), null, "a Thimphu landline is not a mobile");
});

test("Japan mobiles are 10 digits starting 70, 80 or 90 (ADR 024)", () => {
  assert.equal(toE164("090 1234 5678", "JP"), "+819012345678");
  assert.equal(toE164("+81 3 1234 5678"), null, "a Tokyo landline is not a mobile");
});

test("Vietnam mobiles are 9 digits starting 3, 5, 7, 8 or 9 (ADR 024)", () => {
  assert.equal(toE164("091 234 5678", "VN"), "+84912345678");
  assert.equal(toE164("+84 24 1234 5678"), null, "a Hanoi landline is not a mobile");
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
