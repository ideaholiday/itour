import test from "node:test";
import assert from "node:assert/strict";
import { validateTransferMeta } from "../src/lib/transferListing.js";

const validRoute = {
  routeType: "RAILWAY_TRANSFER",
  originName: "Lucknow Junction Railway Station",
  originLat: 26.8315,
  originLng: 80.9231,
  destName: "Hazratganj Hotel",
  destLat: 26.8529,
  destLng: 80.9462,
  distanceKm: 6.2,
  durationMins: 25,
  vehicleCategory: "SEDAN",
  freeWaitingMins: 30,
};

test("accepts the supported supplier transfer route types", () => {
  for (const routeType of ["AIRPORT_TRANSFER", "RAILWAY_TRANSFER", "INTERCITY_TRANSFER", "HOTEL_TRANSFER"]) {
    const result = validateTransferMeta({ ...validRoute, routeType });
    assert.equal(result.error, undefined);
    const expected = routeType === "AIRPORT_TRANSFER" ? "AIRPORT_PICKUP"
      : routeType === "RAILWAY_TRANSFER" ? "RAILWAY_PICKUP"
        : routeType === "INTERCITY_TRANSFER" ? "CITY_TO_CITY" : "POINT_TO_POINT";
    assert.equal(result.value.routeType, expected);
  }
});

test("rejects missing map points and unsupported transfer types", () => {
  assert.match(validateTransferMeta({ ...validRoute, routeType: "BOAT_TRANSFER" }).error, /valid transfer type/i);
  assert.match(validateTransferMeta({ ...validRoute, destLat: null }).error, /map coordinates/i);
});

test("uses the selected vehicle capacity and preserves inclusion flags", () => {
  const result = validateTransferMeta({ ...validRoute, vehicleCategory: "GROUP_TEMPO", tollIncluded: false, stateTaxIncluded: true });
  assert.equal(result.value.maxPax, 26);
  assert.equal(result.value.maxBags, 20);
  assert.equal(result.value.tollIncluded, 0);
  assert.equal(result.value.stateTaxIncluded, 1);
});

test("normalizes legacy airport route values", () => {
  const result = validateTransferMeta({ ...validRoute, routeType: "AIRPORT_PICKUP" });
  assert.equal(result.value.routeType, "AIRPORT_PICKUP");
});
