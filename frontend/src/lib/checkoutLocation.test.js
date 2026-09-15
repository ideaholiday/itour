import assert from "node:assert/strict";
import test from "node:test";
import { isValidTravelNumber, typedAddressAccepted } from "./checkoutLocation.js";

test("flight and train numbers are accepted, free text is not", () => {
  for (const value of ["6E-2134", "AI 864", "ai864", "12004"]) assert.equal(isValidTravelNumber(value), true, value);
  for (const value of ["BY TRAIN", "", "6E-21345"]) assert.equal(isValidTravelNumber(value), false, value);
});

test("a typed hotel address is bookable when no location rule exists", () => {
  assert.equal(typedAddressAccepted(undefined, "Gomti Inn, Gomti Nagar"), true);
  assert.equal(typedAddressAccepted(undefined, "ab"), false);
});

test("a typed hotel address must name the city or state for a scoped rule", () => {
  const rule = { mode: "RADIUS_FROM_CENTER", allowedCity: "Lucknow", allowedState: "Uttar Pradesh (UP)" };
  assert.equal(typedAddressAccepted(rule, "Gomti inn Gomti nagar lucknow 226010"), true);
  assert.equal(typedAddressAccepted(rule, "Gomti Inn, Gomti Nagar"), false);
  assert.equal(typedAddressAccepted({ ...rule, mode: "CITY_ANYWHERE" }, "Hotel Clarks, LUCKNOW"), true);
});

test("a fixed terminal never accepts a typed address", () => {
  assert.equal(typedAddressAccepted({ mode: "FIXED_LOCATION", allowedCity: "Lucknow" }, "Lucknow airport"), false);
});
