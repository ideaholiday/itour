import { fleetSupportsVehicle } from "../lib/vehicleInventory.js";

export const AVAILABILITY_SCOPES = ["ALL", "PRODUCT", "VEHICLE_CATEGORY", "VEHICLE"];
export const AVAILABILITY_TYPES = ["FULL_DAY", "TIME_SLOT"];
const ACTIVE_BOOKING_STATUSES = ["pending_payment", "pending_confirmation", "confirmed", "driver_assigned", "in_progress"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const circuitOrderSupport = new WeakMap();

const upper = (value) => String(value || "").trim().toUpperCase();

export function timeToMinutes(value) {
  if (!TIME_PATTERN.test(String(value || ""))) return null;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeRangesOverlap(startA, endA, startB, endB) {
  const values = [startA, endA, startB, endB].map(timeToMinutes);
  if (values.some((value) => value === null)) return false;
  return values[0] < values[3] && values[2] < values[1];
}

export function normalizeAvailabilityRule(input = {}) {
  const scopeType = upper(input.scopeType || (input.productId ? "PRODUCT" : "ALL"));
  const availabilityType = upper(input.availabilityType || "FULL_DAY");
  const startDate = String(input.startDate || "").trim();
  const endDate = String(input.endDate || "").trim();
  const startTime = availabilityType === "TIME_SLOT" ? String(input.startTime || "").trim() : null;
  const endTime = availabilityType === "TIME_SLOT" ? String(input.endTime || "").trim() : null;
  const capacityLimit = Number(input.capacityLimit ?? 0);

  if (!AVAILABILITY_SCOPES.includes(scopeType)) throw Object.assign(new Error("Choose a valid availability scope"), { status: 400 });
  if (!AVAILABILITY_TYPES.includes(availabilityType)) throw Object.assign(new Error("Choose full day or time slot"), { status: 400 });
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate) || endDate < startDate) throw Object.assign(new Error("Enter a valid start and end date"), { status: 400 });
  if (availabilityType === "TIME_SLOT" && (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || timeToMinutes(endTime) <= timeToMinutes(startTime))) {
    throw Object.assign(new Error("Enter a valid time slot with the end after the start"), { status: 400 });
  }
  if (!Number.isInteger(capacityLimit) || capacityLimit < 0 || capacityLimit > 50) throw Object.assign(new Error("Booking capacity must be a whole number from 0 to 50"), { status: 400 });
  if (scopeType === "PRODUCT" && !input.productId) throw Object.assign(new Error("Choose a product for this rule"), { status: 400 });
  if (scopeType === "VEHICLE" && !input.vehicleId) throw Object.assign(new Error("Choose a vehicle for this rule"), { status: 400 });
  if (scopeType === "VEHICLE_CATEGORY" && !input.vehicleCategory) throw Object.assign(new Error("Choose a vehicle category for this rule"), { status: 400 });

  return {
    scopeType,
    availabilityType,
    productId: scopeType === "PRODUCT" ? String(input.productId) : null,
    vehicleId: scopeType === "VEHICLE" ? String(input.vehicleId) : null,
    vehicleCategory: scopeType === "VEHICLE_CATEGORY" ? upper(input.vehicleCategory) : null,
    startDate,
    endDate,
    startTime,
    endTime,
    capacityLimit: scopeType === "VEHICLE" ? 0 : capacityLimit,
    reason: String(input.reason || "Supplier unavailable").trim().slice(0, 240),
  };
}

function ruleAppliesAtTime(rule, pickupTime) {
  if (upper(rule.availability_type) !== "TIME_SLOT") return true;
  const pickup = timeToMinutes(pickupTime);
  if (pickup === null) return true;
  return pickup >= timeToMinutes(rule.start_time) && pickup < timeToMinutes(rule.end_time);
}

function supportsCircuitOrders(db) {
  if (circuitOrderSupport.has(db)) return circuitOrderSupport.get(db);
  try {
    db.prepare("SELECT circuit_order_id FROM bookings LIMIT 0").all();
    db.prepare("SELECT id FROM circuit_orders LIMIT 0").all();
    circuitOrderSupport.set(db, true);
    return true;
  } catch {
    circuitOrderSupport.set(db, false);
    return false;
  }
}

function countBookings(db, { supplierId, activityDate, vehicleCategory, rule }) {
  const statusSlots = ACTIVE_BOOKING_STATUSES.map(() => "?").join(", ");
  const params = [supplierId, activityDate, ...ACTIVE_BOOKING_STATUSES];
  let sql = `SELECT COUNT(*) AS count FROM bookings WHERE supplier_id = ? AND activity_date = ? AND LOWER(status) IN (${statusSlots})`;
  if (supportsCircuitOrders(db)) {
    sql += ` AND (circuit_order_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM circuit_orders co
      WHERE co.id = bookings.circuit_order_id
        AND co.status = 'PENDING_PAYMENT'
        AND co.hold_expires_at <= datetime('now')
    ))`;
  }
  if (upper(rule.scope_type) === "PRODUCT" && rule.product_id) {
    sql += " AND COALESCE(assigned_supplier_product_id, product_id) = ?";
    params.push(rule.product_id);
  }
  if (upper(rule.scope_type) === "VEHICLE_CATEGORY" && vehicleCategory) {
    sql += " AND UPPER(COALESCE(vehicle_category, '')) = ?";
    params.push(upper(vehicleCategory));
  }
  if (upper(rule.availability_type) === "TIME_SLOT") {
    sql += " AND pickup_time >= ? AND pickup_time < ?";
    params.push(rule.start_time, rule.end_time);
  }
  return Number(db.prepare(sql).get(...params)?.count || 0);
}

function ruleMatchesScope(rule, { productId, vehicleCategory }) {
  const scope = upper(rule.scope_type || (rule.product_id ? "PRODUCT" : "ALL"));
  if (scope === "ALL") return true;
  if (scope === "PRODUCT") return String(rule.product_id || "") === String(productId || "");
  if (scope === "VEHICLE_CATEGORY") return upper(rule.vehicle_category) === upper(vehicleCategory);
  return false;
}

export function evaluateSupplierAvailability(db, { supplierId, productId, activityDate, pickupTime, vehicleCategory }) {
  const rules = db.prepare(`
    SELECT * FROM blocked_dates
    WHERE supplier_id = ? AND COALESCE(is_active, 1) = 1
      AND ? BETWEEN start_date AND end_date
    ORDER BY capacity_limit ASC, created_at ASC
  `).all(supplierId, activityDate);
  const applicable = rules.filter((rule) => ruleAppliesAtTime(rule, pickupTime));
  const scopedRules = applicable.filter((rule) => ruleMatchesScope(rule, { productId, vehicleCategory }));
  const reasons = [];

  for (const rule of scopedRules) {
    const limit = Number(rule.capacity_limit || 0);
    const currentBookings = countBookings(db, { supplierId, activityDate, vehicleCategory, rule });
    if (limit === 0) reasons.push(rule.reason || "Supplier blocked this date or time");
    else if (currentBookings >= limit) reasons.push(`${rule.reason || "Booking capacity reached"} (maximum ${limit})`);
  }

  const vehicleRules = applicable.filter((rule) => upper(rule.scope_type) === "VEHICLE" && rule.vehicle_id);
  let fleet = { managed: false, capacity: null, vehicles: [] };
  let remainingFleetCapacity = null;
  if (vehicleCategory && vehicleRules.length) {
    const drivers = db.prepare("SELECT id, vehicle_model, status FROM supplier_drivers WHERE supplier_id = ?").all(supplierId);
    fleet = fleetSupportsVehicle(drivers, vehicleCategory);
    if (fleet.managed && fleet.capacity > 0) {
      const blockedVehicleIds = new Set(vehicleRules.map((rule) => String(rule.vehicle_id)));
      const blockedVehicles = fleet.vehicles.filter((vehicle) => blockedVehicleIds.has(String(vehicle.id))).length;
      const categoryRule = { scope_type: "VEHICLE_CATEGORY", availability_type: "FULL_DAY" };
      const activeBookings = countBookings(db, { supplierId, activityDate, vehicleCategory, rule: categoryRule });
      remainingFleetCapacity = Math.max(0, fleet.capacity - blockedVehicles - activeBookings);
      if (remainingFleetCapacity === 0) reasons.push(`No ${upper(vehicleCategory).replaceAll("_", " ")} vehicle remains available`);
    }
  }

  return {
    available: reasons.length === 0,
    reasons: [...new Set(reasons)],
    matchingRuleIds: [...scopedRules, ...vehicleRules].map((rule) => rule.id),
    remainingFleetCapacity,
  };
}
