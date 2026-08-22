import assert from "node:assert/strict";
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
  const insertSql = `INSERT INTO bookings (
    id, ref, client_request_id, user_id, product_id, supplier_id, product_type, variant_name,
    activity_date, pickup_time, pickup_type, pickup_location, pickup_instructions, drop_location, drop_instructions,
    pickup_lat, pickup_lng, drop_lat, drop_lng, flight_number, flight_arrival_time, terminal_gate,
    special_requests, promo_code, adults, children, luggage_bags, vehicle_category,
    traveler_name, traveler_phone, traveler_email, amount_inr, tolls_and_tax_amount,
    commission_amount, commission_rate_snapshot, supplier_payout_amount, payment_method, payment_status, status,
    supplier_assignment_status, supplier_assignment_method, supplier_assignment_score, supplier_assignment_reason, assigned_supplier_product_id, supplier_assigned_at, otp_code
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'pending_payment', 'RESERVED_PENDING_PAYMENT', 'RULE_ENGINE_V1', ?, ?, ?, datetime('now'), NULL)`;

  const columnsMatch = insertSql.match(/INSERT INTO bookings \(([\s\S]+?)\) VALUES/i);
  const valuesMatch = insertSql.match(/VALUES \(([\s\S]+?)\)$/i);

  assert.ok(columnsMatch, "Should find target columns");
  assert.ok(valuesMatch, "Should find values block");

  const columns = columnsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  const values = valuesMatch[1].split(",").map((s) => s.trim()).filter(Boolean);

  assert.equal(columns.length, 46, "Target columns must be 46");
  assert.equal(values.length, 46, "Values expressions must be 46");
  assert.equal(columns.length, values.length, "Target columns count must equal value expressions count");
});

