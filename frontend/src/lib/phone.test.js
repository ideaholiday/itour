import assert from "node:assert/strict";
import test from "node:test";
import { countryForCurrency, joinPhone, splitPhone, toE164 } from "./phone.js";

test("the picker and number box round-trip a stored number", () => {
  assert.deepEqual(splitPhone("+66 081 234 5678"), { iso: "TH", number: "081 234 5678" });
  assert.deepEqual(splitPhone("+971501234567"), { iso: "AE", number: "501234567" });
  assert.deepEqual(splitPhone("+919876543210"), { iso: "IN", number: "9876543210" });
  assert.deepEqual(splitPhone("9876543210"), { iso: "IN", number: "9876543210" });
  assert.deepEqual(splitPhone("+44 7700 900123"), { iso: "OTHER", number: "+44 7700 900123" });
  assert.deepEqual(splitPhone(""), { iso: null, number: "" });
  assert.equal(joinPhone("TH", "081 234 5678"), "+66 081 234 5678");
  assert.equal(joinPhone("TH", ""), "");
});

test("what the form submits matches the backend", () => {
  assert.equal(toE164(joinPhone("TH", "081 234 5678")), "+66812345678");
  assert.equal(toE164(joinPhone("AE", "050 123 4567")), "+971501234567");
  assert.equal(toE164(joinPhone("IN", "98765 43210")), "+919876543210");
  assert.equal(toE164(joinPhone("IN", "081 234 5678")), null);
});

test("the header currency picks the starting country", () => {
  assert.equal(countryForCurrency("AED"), "AE");
  assert.equal(countryForCurrency("INR"), "IN");
  assert.equal(countryForCurrency("USD"), "IN");
});
