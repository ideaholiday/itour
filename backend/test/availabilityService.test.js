import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { evaluateSupplierAvailability, normalizeAvailabilityRule, timeRangesOverlap } from "../src/services/availabilityService.js";

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE blocked_dates (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, scope_type TEXT,
      vehicle_id TEXT, vehicle_category TEXT, availability_type TEXT,
      start_date TEXT, end_date TEXT, start_time TEXT, end_time TEXT,
      capacity_limit INTEGER, is_active INTEGER, reason TEXT, created_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, assigned_supplier_product_id TEXT,
      activity_date TEXT, pickup_time TEXT, vehicle_category TEXT, status TEXT
    );
    CREATE TABLE supplier_drivers (
      id TEXT PRIMARY KEY, supplier_id TEXT, vehicle_model TEXT, status TEXT
    );
  `);
  return db;
}

function addRule(db, overrides = {}) {
  const rule = {
    id: "rule-1", supplier: "supplier-1", product: null, scope: "ALL", vehicle: null,
    category: null, type: "FULL_DAY", start: "2026-09-10", end: "2026-09-10",
    startTime: null, endTime: null, capacity: 0, reason: "Not available", ...overrides,
  };
  db.prepare(`INSERT INTO blocked_dates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))`)
    .run(rule.id, rule.supplier, rule.product, rule.scope, rule.vehicle, rule.category, rule.type, rule.start, rule.end, rule.startTime, rule.endTime, rule.capacity, rule.reason);
}

const request = { supplierId: "supplier-1", productId: "product-1", activityDate: "2026-09-10", pickupTime: "10:00", vehicleCategory: "SEDAN" };

test("validates date, time, scope and capacity inputs", () => {
  const normalized = normalizeAvailabilityRule({ scopeType: "vehicle_category", vehicleCategory: "sedan", availabilityType: "time_slot", startDate: "2026-09-10", endDate: "2026-09-11", startTime: "09:00", endTime: "12:00", capacityLimit: 2 });
  assert.equal(normalized.scopeType, "VEHICLE_CATEGORY");
  assert.equal(normalized.vehicleCategory, "SEDAN");
  assert.equal(normalized.capacityLimit, 2);
  assert.throws(() => normalizeAvailabilityRule({ startDate: "2026-09-11", endDate: "2026-09-10" }), /valid start and end/i);
  assert.equal(timeRangesOverlap("09:00", "12:00", "11:30", "13:00"), true);
  assert.equal(timeRangesOverlap("09:00", "12:00", "12:00", "13:00"), false);
});

test("vehicle category and time-slot rules only block matching requests", () => {
  const db = database();
  addRule(db, { scope: "VEHICLE_CATEGORY", category: "SEDAN", type: "TIME_SLOT", startTime: "09:00", endTime: "12:00" });
  assert.equal(evaluateSupplierAvailability(db, request).available, false);
  assert.equal(evaluateSupplierAvailability(db, { ...request, pickupTime: "12:00" }).available, true);
  assert.equal(evaluateSupplierAvailability(db, { ...request, vehicleCategory: "SUV" }).available, true);
  db.close();
});

test("capacity rules allow bookings until the configured limit", () => {
  const db = database();
  addRule(db, { capacity: 2, reason: "Festival capacity" });
  const insert = db.prepare("INSERT INTO bookings VALUES (?, 'supplier-1', 'product-1', 'product-1', '2026-09-10', ?, 'SEDAN', 'confirmed')");
  insert.run("booking-1", "09:00");
  assert.equal(evaluateSupplierAvailability(db, request).available, true);
  insert.run("booking-2", "11:00");
  const result = evaluateSupplierAvailability(db, request);
  assert.equal(result.available, false);
  assert.match(result.reasons[0], /maximum 2/i);
  db.close();
});

test("blocking one vehicle preserves other compatible fleet inventory", () => {
  const db = database();
  db.prepare("INSERT INTO supplier_drivers VALUES (?, 'supplier-1', ?, 'AVAILABLE')").run("car-1", "Maruti Dzire Sedan");
  db.prepare("INSERT INTO supplier_drivers VALUES (?, 'supplier-1', ?, 'AVAILABLE')").run("car-2", "Hyundai Aura Sedan");
  addRule(db, { scope: "VEHICLE", vehicle: "car-1", reason: "Vehicle service" });
  const first = evaluateSupplierAvailability(db, request);
  assert.equal(first.available, true);
  assert.equal(first.remainingFleetCapacity, 1);
  db.prepare("INSERT INTO bookings VALUES ('booking-1', 'supplier-1', 'product-1', 'product-1', '2026-09-10', '09:00', 'SEDAN', 'confirmed')").run();
  const second = evaluateSupplierAvailability(db, request);
  assert.equal(second.available, false);
  assert.equal(second.remainingFleetCapacity, 0);
  db.close();
});
