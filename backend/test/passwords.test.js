import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, passwordMatches } from "../src/lib/passwords.js";

test("password hashes are salted and verifiable without storing plaintext", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");

  assert.notEqual(first, second);
  assert.equal(first.includes("correct horse battery staple"), false);
  assert.equal(passwordMatches("correct horse battery staple", first), true);
  assert.equal(passwordMatches("incorrect", first), false);
});

test("legacy plaintext credentials can be verified for login-time migration", () => {
  assert.equal(passwordMatches("legacy-password", "legacy-password"), true);
  assert.equal(passwordMatches("wrong-password", "legacy-password"), false);
});
