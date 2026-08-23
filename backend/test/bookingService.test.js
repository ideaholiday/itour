import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activatePickupOtp,
  canTransitionBooking,
  decryptPickupOtp,
  generatePickupOtp,
  hashPickupOtp,
  pickupOtpMatches
} from "../src/services/bookingService.js";

test("pickup OTP is six digits, encrypted at rest and timing-safe verifiable", () => {
  const booking = { id: "bk_test", activity_date: "2030-01-15", pickup_time: "10:30" };
  const activated = activatePickupOtp(booking);
  assert.match(activated.otp, /^\d{6}$/);
  assert.equal(decryptPickupOtp(activated.otpEncrypted), activated.otp);
  assert.equal(pickupOtpMatches(booking.id, activated.otp, activated.otpHash), true);
  assert.equal(pickupOtpMatches(booking.id, "000000", activated.otpHash), activated.otp === "000000");
  assert.notEqual(activated.otpHash, activated.otp);
});

test("OTP hashing is scoped to a booking", () => {
  const otp = generatePickupOtp();
  assert.notEqual(hashPickupOtp("bk_one", otp), hashPickupOtp("bk_two", otp));
});

test("booking state machine requires OTP path before trip completion", () => {
  assert.equal(canTransitionBooking("pending_payment", "confirmed"), true);
  assert.equal(canTransitionBooking("confirmed", "driver_assigned"), true);
  assert.equal(canTransitionBooking("driver_assigned", "in_progress"), true);
  assert.equal(canTransitionBooking("confirmed", "completed"), false);
  assert.equal(canTransitionBooking("in_progress", "completed"), true);
  assert.equal(canTransitionBooking("completed", "in_progress"), false);
});

test("booking creation SQL statement has equal column and value expressions", () => {
  const routeSource = readFileSync(new URL("../src/routes/bookings.js", import.meta.url), "utf8");
  const insertMatch = routeSource.match(/`INSERT INTO bookings \(([\s\S]+?)\) VALUES \(([\s\S]+?)\)`/i);
  assert.ok(insertMatch, "Should find the production booking insert");

  const columns = insertMatch[1].split(",").map((value) => value.trim()).filter(Boolean);
  const values = insertMatch[2].split(",").map((value) => value.trim()).filter(Boolean);

  assert.equal(columns.length, 48, "Production booking insert must include all 48 target columns");
  assert.equal(values.length, 48, "Production booking insert must provide all 48 value expressions");
  assert.equal(columns.length, values.length, "Target columns count must equal value expressions count");
});
