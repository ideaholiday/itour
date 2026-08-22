import assert from "node:assert/strict";
import test from "node:test";
import { rankSupplierCandidates } from "../src/services/supplierAssignmentService.js";

const approvedFence = {
  id: "fence_goa",
  city: "Goa",
  center_lat: 15.2993,
  center_lng: 74.124,
  radius_km: 35,
  polygon_coordinates: "[]",
  is_active: 1,
  approval_status: "APPROVED",
};

const request = {
  productType: "TRANSFER",
  city: "Goa",
  pickupLat: 15.31,
  pickupLng: 74.13,
  vehicleCategory: "SEDAN",
  routeType: "AIRPORT_TRANSFER",
  passengers: 3,
  luggage: 2,
  customerBudget: 1500,
};

const candidate = (overrides = {}) => ({
  supplierId: "supplier_one",
  supplierName: "Goa Partner One",
  candidateProductId: "product_one",
  productCity: "Goa",
  price: 1000,
  isPublished: true,
  kybStatus: "APPROVED",
  rating: 4.8,
  commissionRate: 15,
  routeType: "AIRPORT_PICKUP",
  vehicleCategory: "SEDAN",
  maxPassengers: 4,
  maxLuggage: 3,
  isBlocked: false,
  activeBookings: 0,
  drivers: [],
  fences: [approvedFence],
  isRequestedListing: true,
  ...overrides,
});

test("selects the best eligible supplier using coverage, vehicle, price and availability", () => {
  const result = rankSupplierCandidates([
    candidate({ supplierId: "premium", candidateProductId: "premium_product", price: 1300, rating: 5 }),
    candidate({ supplierId: "value", candidateProductId: "value_product", price: 950, rating: 4.8, isRequestedListing: false }),
  ], request);

  assert.equal(result.selected.supplierId, "value");
  assert.equal(result.selected.coverage.method, "APPROVED_RADIUS");
  assert.equal(result.selected.eligible, true);
  assert.ok(result.selected.score > 80);
});

test("rejects suppliers with unapproved coverage, wrong vehicles, blocked dates or excessive price", () => {
  const result = rankSupplierCandidates([
    candidate({ supplierId: "pending", fences: [{ ...approvedFence, approval_status: "PENDING_REVIEW", is_active: 0 }] }),
    candidate({ supplierId: "wrong_vehicle", vehicleCategory: "SUV" }),
    candidate({ supplierId: "blocked", isBlocked: true }),
    candidate({ supplierId: "expensive", price: 1800 }),
  ], request);

  assert.equal(result.selected, null);
  const reasons = Object.fromEntries(result.candidates.map((item) => [item.supplierId, item.rejectionReasons]));
  assert.ok(reasons.pending.some((reason) => /outside approved coverage/i.test(reason)));
  assert.ok(reasons.wrong_vehicle.some((reason) => /vehicle sedan/i.test(reason)));
  assert.ok(reasons.blocked.some((reason) => /blocked/i.test(reason)));
  assert.ok(reasons.expensive.some((reason) => /fare/i.test(reason)));
});

test("uses approved city coverage when coordinates are unavailable", () => {
  const result = rankSupplierCandidates([candidate()], { ...request, pickupLat: null, pickupLng: null });
  assert.equal(result.selected.coverage.method, "APPROVED_CITY_ZONE");
  assert.equal(result.selected.eligible, true);
});

test("matches day tour supplier when listing city matches without custom geo fences and with variant budget", () => {
  const dayTourCandidate = candidate({
    supplierId: "goa_tour_ops",
    candidateProductId: "prod_day_tour_1",
    productCity: "Goa",
    price: 699,
    vehicleCategory: "SHARED_SEAT",
    fences: [],
    isRequestedListing: true,
  });

  const dayTourRequest = {
    productType: "DAY_TOUR",
    city: "Goa",
    pickupLat: null,
    pickupLng: null,
    vehicleCategory: "SHARED_SEAT",
    passengers: 1,
    luggage: 0,
    customerBudget: 734,
  };

  const result = rankSupplierCandidates([dayTourCandidate], dayTourRequest);
  assert.equal(result.selected.supplierId, "goa_tour_ops");
  assert.equal(result.selected.eligible, true);
  assert.equal(result.selected.coverage.method, "APPROVED_CITY_ZONE");
  assert.equal(result.selected.rejectionReasons.length, 0);
});
