import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { findAutomaticSupplierAssignment, rankSupplierCandidates } from "../src/services/supplierAssignmentService.js";

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

test("assigns the purchased transfer variant instead of the route's default vehicle", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_type TEXT, city TEXT,
      price_inr REAL, status TEXT, is_published INTEGER
    );
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, company_name TEXT, kyb_status TEXT, rating REAL,
      commission_rate REAL, commission_override_rate REAL
    );
    CREATE TABLE category_commissions (category_code TEXT, default_commission_rate REAL);
    CREATE TABLE transfer_routes (
      product_id TEXT, route_type TEXT, vehicle_category TEXT,
      max_passengers INTEGER, max_luggage INTEGER
    );
    CREATE TABLE package_itineraries (product_id TEXT, vehicle_category TEXT);
    CREATE TABLE product_pricing (product_id TEXT, variant_name TEXT, base_price REAL);
    CREATE TABLE geo_fences (
      id TEXT PRIMARY KEY, supplier_id TEXT, city TEXT, center_lat REAL, center_lng REAL,
      radius_km REAL, polygon_coordinates TEXT, is_active INTEGER, approval_status TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, supplier_id TEXT, activity_date TEXT, status TEXT,
      vehicle_category TEXT, product_id TEXT, assigned_supplier_product_id TEXT, pickup_time TEXT
    );
    CREATE TABLE supplier_drivers (
      id TEXT PRIMARY KEY, supplier_id TEXT, vehicle_model TEXT, status TEXT
    );
    CREATE TABLE blocked_dates (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, scope_type TEXT,
      vehicle_id TEXT, vehicle_category TEXT, availability_type TEXT,
      start_date TEXT, end_date TEXT, start_time TEXT, end_time TEXT,
      capacity_limit INTEGER, is_active INTEGER, reason TEXT, created_at TEXT
    );
  `);
  db.prepare("INSERT INTO suppliers VALUES (?, ?, ?, ?, ?, ?)")
    .run("lucknow-supplier", "Lucknow Cabs", "APPROVED", 4.9, 18, null);
  db.prepare("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("lucknow-transfer", "lucknow-supplier", "TRANSFER", "Lucknow", 899, "PUBLISHED", 1);
  db.prepare("INSERT INTO transfer_routes VALUES (?, ?, ?, ?, ?)")
    .run("lucknow-transfer", "AIRPORT_PICKUP", "SEDAN", 4, 3);
  db.prepare("INSERT INTO product_pricing VALUES (?, ?, ?)")
    .run("lucknow-transfer", "Ertiga / Marazzo (SUV)", 1399);
  db.prepare("INSERT INTO geo_fences VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("lucknow-zone", "lucknow-supplier", "Lucknow", 26.7606, 80.8893, 35, "[]", 1, "APPROVED");
  db.prepare("INSERT INTO supplier_drivers VALUES (?, ?, ?, ?)")
    .run("ertiga-1", "lucknow-supplier", "Maruti Ertiga ZXI (SUV)", "AVAILABLE");

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get("lucknow-transfer");
  const result = findAutomaticSupplierAssignment(db, {
    quote: {
      product,
      activityDate: "2026-08-25",
      vehicleCategory: "SUV",
      baseAmount: 1200,
      totalAmount: 1260,
      adults: 4,
      children: 0,
      luggage: 2,
    },
    input: { pickup_time: "19:45", pickup_lat: 26.7606, pickup_lng: 80.8893 },
  });

  assert.equal(result.selected?.supplierId, "lucknow-supplier");
  assert.equal(result.selected?.vehicleCategory, "SUV");
  assert.equal(result.selected?.candidatePrice, 1200);
  assert.deepEqual(result.selected?.rejectionReasons, []);
  db.close();
});
