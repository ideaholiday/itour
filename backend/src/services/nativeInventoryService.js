import { randomUUID } from "node:crypto";
import { z } from "zod";

export const NATIVE_HOLD_MINUTES = 10;

/**
 * Unit types the reservation engine can bill, and how each rolls up into the
 * `adults` / `children` seat counts the rest of the platform reads.
 *
 * Every unit occupies one seat. Infant-on-lap (a unit that bills but does not
 * consume capacity) is deliberately not modelled yet — see
 * docs/RESERVATION_ENGINE_V2_PLAN.md.
 */
export const UNIT_TYPES = ["ADULT", "CHILD", "INFANT", "SENIOR", "YOUTH"];
const CHILD_UNIT_TYPES = new Set(["CHILD", "INFANT"]);
export const isChildUnit = (unitType) => CHILD_UNIT_TYPES.has(String(unitType).toUpperCase());

/**
 * Normalizes a unit-item list into a stable, deduplicated breakdown plus the
 * adults/children totals it rolls up to.
 *
 * Callers that send no unit items keep the legacy behaviour: the adults and
 * children counts become ADULT and CHILD lines.
 */
export function normalizeUnitItems(unitItems, { adults = 0, children = 0, seatlessUnits = [] } = {}) {
  const seatless = new Set((seatlessUnits || []).map((unit) => String(unit).toUpperCase()));
  const totals = new Map();

  if (Array.isArray(unitItems) && unitItems.length) {
    for (const item of unitItems) {
      const unitType = String(item?.unitType || "").toUpperCase();
      if (!UNIT_TYPES.includes(unitType)) {
        throw inventoryError(`Unknown traveler type "${item?.unitType}"`, "UNKNOWN_UNIT_TYPE", 400);
      }
      const quantity = Number(item?.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw inventoryError("Traveler counts must be whole numbers of at least one", "INVALID_UNIT_QUANTITY", 400);
      }
      totals.set(unitType, (totals.get(unitType) || 0) + quantity);
    }
  } else {
    if (adults > 0) totals.set("ADULT", adults);
    if (children > 0) totals.set("CHILD", children);
  }

  const items = UNIT_TYPES.filter((type) => totals.get(type)).map((type) => ({
    unitType: type, quantity: totals.get(type), occupiesSeat: !seatless.has(type),
  }));
  // Seatless units still bill and still reach the manifest through
  // booking_unit_items; they simply do not consume capacity.
  const seated = items.filter((item) => item.occupiesSeat);
  const adultSeats = seated.filter((item) => !isChildUnit(item.unitType)).reduce((sum, item) => sum + item.quantity, 0);
  const childSeats = seated.filter((item) => isChildUnit(item.unitType)).reduce((sum, item) => sum + item.quantity, 0);
  return { items, adults: adultSeats, children: childSeats, seats: adultSeats + childSeats };
}

/** Prices a normalized breakdown against a resolved unit price map. */
export function priceUnitItems(items, unitPrices) {
  return items.reduce((total, item) => {
    const price = unitPrices[item.unitType];
    if (price == null) {
      throw inventoryError(`This departure does not sell the ${item.unitType.toLowerCase()} traveler type`, "UNIT_TYPE_NOT_SOLD", 409);
    }
    return total + Number(price) * item.quantity;
  }, 0);
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const inventoryRulesSchema = z.object({
  operatingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  departureTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(24),
  capacity: z.number().int().min(1).max(10000),
  adultPrice: z.number().int().min(1).max(10000000),
  childPrice: z.number().int().min(0).max(10000000),
  cutoffMinutes: z.number().int().min(0).max(43200),
  cancellationHours: z.number().int().min(0).max(8760),
  blackoutDates: z.array(date).max(730),
  // Optional, not defaulted: an omitted field must leave the stored value alone
  // so a client that only knows the pre-v2 payload cannot silently reset it.
  minPartySize: z.number().int().min(1).max(100).optional(),
  maxPartySize: z.number().int().min(0).max(100).optional(),
  unitPrices: z.object({
    ADULT: z.number().int().min(0).max(10000000).optional(),
    CHILD: z.number().int().min(0).max(10000000).optional(),
    INFANT: z.number().int().min(0).max(10000000).optional(),
    SENIOR: z.number().int().min(0).max(10000000).optional(),
    YOUTH: z.number().int().min(0).max(10000000).optional(),
  }).strict().optional(),
  // ADULT is never seatless: somebody has to hold the lap.
  seatlessUnits: z.array(z.enum(["CHILD", "INFANT", "SENIOR", "YOUTH"])).max(4).optional(),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const priceScheduleSchema = z.object({
  label: z.string().max(120).default(""),
  startsOn: date, endsOn: date,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  adultPrice: z.number().int().min(0).max(10000000),
  childPrice: z.number().int().min(0).max(10000000),
  priority: z.number().int().min(0).max(1000).default(0),
  unitPrices: z.object({
    ADULT: z.number().int().min(0).max(10000000).optional(),
    CHILD: z.number().int().min(0).max(10000000).optional(),
    INFANT: z.number().int().min(0).max(10000000).optional(),
    SENIOR: z.number().int().min(0).max(10000000).optional(),
    YOUTH: z.number().int().min(0).max(10000000).optional(),
  }).strict().default({}),
}).refine((v) => v.startsOn <= v.endsOn, { message: "startsOn must not be after endsOn", path: ["endsOn"] });

export const slotOverrideSchema = z.object({
  localDate: date,
  localTime: time.optional().default(""),
  capacity: z.number().int().min(0).max(10000).nullable().default(null),
  closed: z.boolean().default(false),
  note: z.string().max(280).default(""),
});
export const nativeHoldSchema = z.object({
  productId: z.string().min(1).max(200), optionId: z.string().min(1).max(200),
  localDate: date, localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  adults: z.number().int().min(1).max(26), children: z.number().int().min(0).max(25).default(0),
  unitItems: z.array(z.object({
    unitType: z.enum(["ADULT", "CHILD", "INFANT", "SENIOR", "YOUTH"]),
    quantity: z.number().int().min(1).max(26),
  })).max(5).optional(),
  requestKey: z.string().min(1).max(200),
});
const parse = (v) => typeof v === "string" ? JSON.parse(v) : v;
export const inventoryError = (message, code = "INVENTORY_UNAVAILABLE", status = 409) => Object.assign(new Error(message), { code, status });

export function getInventoryRules(db, productId, optionId) {
  // Service fixtures and pre-migration databases have no native inventory yet.
  try { db.prepare("SELECT option_id FROM native_inventory_rules LIMIT 1").get(); }
  catch (error) { if (/no such table/.test(error.message)) return null; throw error; }
  return optionId
    ? db.prepare("SELECT * FROM native_inventory_rules WHERE product_id = ? AND option_id = ?").get(productId, optionId)
    : db.prepare(`SELECT * FROM native_inventory_rules WHERE option_id = (
      SELECT id FROM product_options WHERE product_id = ? AND (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false')) ORDER BY name, id LIMIT 1
    )`).get(productId);
}

export function saveInventoryRules(db, productId, optionId, input) {
  const rules = inventoryRulesSchema.parse(input);
  return db.transaction(() => {
    // This write serializes supplier edits with reservations on both database engines.
    db.prepare("UPDATE products SET id = id WHERE id = ?").run(productId);
    const option = db.prepare("SELECT id FROM product_options WHERE id = ? AND product_id = ?").get(optionId, productId);
    if (!option) throw inventoryError("Option not found", "OPTION_NOT_FOUND", 404);
    const previous = getInventoryRules(db, productId, optionId);
    const minPartySize = rules.minPartySize ?? Number(previous?.min_party_size ?? 1);
    const maxPartySize = rules.maxPartySize ?? Number(previous?.max_party_size ?? 0);
    const unitPrices = rules.unitPrices ?? (previous?.unit_prices ? parse(previous.unit_prices) : {});
    const seatlessUnits = rules.seatlessUnits ?? (previous?.seatless_units ? parse(previous.seatless_units) : []);
    if (maxPartySize !== 0 && maxPartySize < minPartySize) {
      throw inventoryError("Maximum party size must be 0 (no cap) or at least the minimum", "INVALID_PARTY_SIZE", 400);
    }
    if (!previous) {
      const active = db.prepare("SELECT id FROM bookings WHERE product_id = ? AND status NOT IN ('cancelled', 'completed') LIMIT 1").get(productId);
      if (active) throw inventoryError("This listing has existing reservations. Reconcile them before enabling seat inventory.", "EXISTING_RESERVATIONS");
    }
    db.prepare(`INSERT INTO native_inventory_rules (option_id, product_id, operating_days, departure_times, capacity, adult_price, child_price, cutoff_minutes, cancellation_hours, blackout_dates, min_party_size, max_party_size, unit_prices, seatless_units)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(option_id) DO UPDATE SET operating_days=excluded.operating_days,
      departure_times=excluded.departure_times, capacity=excluded.capacity, adult_price=excluded.adult_price, child_price=excluded.child_price,
      cutoff_minutes=excluded.cutoff_minutes, cancellation_hours=excluded.cancellation_hours, blackout_dates=excluded.blackout_dates,
      min_party_size=excluded.min_party_size, max_party_size=excluded.max_party_size,
      unit_prices=excluded.unit_prices, seatless_units=excluded.seatless_units, updated_at=CURRENT_TIMESTAMP`).run(
      optionId, productId, JSON.stringify([...new Set(rules.operatingDays)]), JSON.stringify([...new Set(rules.departureTimes)].sort()), rules.capacity,
      rules.adultPrice, rules.childPrice, rules.cutoffMinutes, rules.cancellationHours, JSON.stringify(rules.blackoutDates),
      minPartySize, maxPartySize, JSON.stringify(unitPrices), JSON.stringify(seatlessUnits));
    const current = getInventoryRules(db, productId, optionId);
    for (const slot of db.prepare("SELECT * FROM native_availability_slots WHERE option_id = ?").all(optionId)) {
      // A per-date override outranks the weekly rule, so re-sync to the effective
      // values rather than clobbering supplier calendar edits with the rule capacity.
      const override = resolveOverride(db, optionId, slot.local_date, slot.local_time);
      const effectiveCapacity = override?.capacity ?? rules.capacity;
      const used = occupied(db, slot.id);
      if (effectiveCapacity < used) throw inventoryError(`Capacity cannot be below ${used} reserved seats on ${slot.local_date} at ${slot.local_time}`, "CAPACITY_BELOW_RESERVED");
      const open = operates(current, slot.local_date, slot.local_time) && !override?.closed;
      db.prepare("UPDATE native_availability_slots SET capacity = ?, closed = ? WHERE id = ?").run(effectiveCapacity, open ? 0 : 1, slot.id);
    }
    db.prepare("UPDATE product_options SET confirmation_type = 'INSTANT', available_start_times = ?, capacity = ? WHERE id = ?").run(JSON.stringify(rules.departureTimes), rules.capacity, optionId);
    return current;
  })();
}

function operates(rules, localDate, time) {
  return parse(rules.operating_days).includes(new Date(`${localDate}T00:00:00Z`).getUTCDay())
    && parse(rules.departure_times).includes(time) && !parse(rules.blackout_dates).includes(localDate);
}
function occupied(db, slotId, excludeId = "") {
  return Number(db.prepare(`SELECT COALESCE(SUM(r.adults + r.children), 0) AS seats FROM native_reservations r
    LEFT JOIN bookings b ON b.id = r.booking_id WHERE r.availability_slot = ? AND r.id <> ?
    AND (b.id IS NULL OR b.status <> 'cancelled') AND (r.status = 'CONFIRMED' OR (r.status = 'ON_HOLD' AND r.utc_expires_at > ?))`).get(slotId, excludeId, new Date().toISOString()).seats);
}
// Pre-v2 databases and service fixtures have no v2 tables; treat them as "no rows".
function optionalQuery(db, run) {
  try { return run(); }
  catch (error) { if (/no such table|does not exist/i.test(error.message)) return null; throw error; }
}

/**
 * Resolves the rate for one travel date.
 *
 * The highest-priority schedule whose range covers the date and whose weekday
 * list includes that weekday wins; ties break on the most recently created row.
 * Falls back to the option's base adult/child price when nothing matches.
 */
export function resolvePricing(db, rules, localDate) {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  const rows = optionalQuery(db, () => db.prepare(
    `SELECT * FROM native_price_schedules WHERE option_id = ? AND starts_on <= ? AND ends_on >= ?
     ORDER BY priority DESC, created_at DESC, id DESC`
  ).all(rules.option_id, localDate, localDate)) || [];

  const baseUnitPrices = buildUnitPrices(rules.adult_price, rules.child_price, rules.unit_prices);

  for (const row of rows) {
    if (!parse(row.weekdays).includes(weekday)) continue;
    return {
      adultPrice: Number(row.adult_price), childPrice: Number(row.child_price),
      // A seasonal rate overlays the base map rather than replacing it, so a unit
      // type the supplier priced once on the schedule keeps selling in season
      // unless the rate deliberately overrides it.
      unitPrices: { ...baseUnitPrices, ...buildUnitPrices(row.adult_price, row.child_price, row.unit_prices) },
      priceScheduleId: row.id, priceScheduleLabel: row.label || null,
    };
  }
  return {
    adultPrice: Number(rules.adult_price), childPrice: Number(rules.child_price),
    unitPrices: baseUnitPrices,
    priceScheduleId: null, priceScheduleLabel: null,
  };
}

/**
 * Builds the sellable unit price map for a rate.
 *
 * ADULT and CHILD always exist so legacy bookings keep working. Extra unit
 * types appear only when the supplier priced them; an unpriced type is not
 * sold, which `priceUnitItems` reports as `UNIT_TYPE_NOT_SOLD`.
 */
function buildUnitPrices(adultPrice, childPrice, extended) {
  const prices = { ADULT: Number(adultPrice), CHILD: Number(childPrice) };
  const configured = extended ? parse(extended) : {};
  for (const [key, value] of Object.entries(configured || {})) {
    const unitType = String(key).toUpperCase();
    if (UNIT_TYPES.includes(unitType) && value != null) prices[unitType] = Number(value);
  }
  return prices;
}

/** Resolves a calendar override: the exact departure first, then the whole day. */
export function resolveOverride(db, optionId, localDate, time) {
  const rows = optionalQuery(db, () => db.prepare(
    "SELECT * FROM native_slot_overrides WHERE option_id = ? AND local_date = ? AND local_time IN (?, '')"
  ).all(optionId, localDate, time)) || [];
  const match = rows.find((row) => row.local_time === time) || rows.find((row) => row.local_time === "");
  if (!match) return null;
  return {
    capacity: match.capacity == null ? null : Number(match.capacity),
    closed: Number(match.closed) === 1,
    note: match.note || "",
    scope: match.local_time === "" ? "DAY" : "DEPARTURE",
  };
}

/** Resources constraining an option, with the seats each already has committed. */
function linkedResources(db, optionId, localDate, time, excludeId = "") {
  const rows = optionalQuery(db, () => db.prepare(
    `SELECT r.id, r.name, r.capacity FROM native_resources r
     JOIN native_resource_options ro ON ro.resource_id = r.id
     WHERE ro.option_id = ?`
  ).all(optionId)) || [];
  if (!rows.length) return [];

  const now = new Date().toISOString();
  return rows.map((resource) => {
    // Every option sharing this resource competes for the same departure time.
    const used = Number(db.prepare(
      `SELECT COALESCE(SUM(r.adults + r.children), 0) AS seats
       FROM native_reservations r
       JOIN native_availability_slots s ON s.id = r.availability_slot
       LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE s.option_id IN (SELECT option_id FROM native_resource_options WHERE resource_id = ?)
         AND s.local_date = ? AND s.local_time = ? AND r.id <> ?
         AND (b.id IS NULL OR b.status <> 'cancelled')
         AND (r.status = 'CONFIRMED' OR (r.status = 'ON_HOLD' AND r.utc_expires_at > ?))`
    ).get(resource.id, localDate, time, excludeId, now).seats);
    return {
      id: resource.id,
      name: resource.name,
      capacity: Number(resource.capacity),
      vacancies: Math.max(0, Number(resource.capacity) - used),
    };
  });
}

function slotView(db, rules, localDate, time, excludeId = "") {
  const id = `${rules.option_id}:${localDate}:${time}`;
  const start = `${localDate}T${time}:00+05:30`;
  const cutoff = new Date(Date.parse(start) - Number(rules.cutoff_minutes) * 60000).toISOString();
  const override = resolveOverride(db, rules.option_id, localDate, time);
  const pricing = resolvePricing(db, rules, localDate);
  const capacity = override?.capacity ?? Number(rules.capacity);
  const resources = linkedResources(db, rules.option_id, localDate, time, excludeId);
  // A shared vehicle or guide caps the departure below its own pool.
  const vacancies = Math.min(
    Math.max(0, capacity - occupied(db, id, excludeId)),
    ...resources.map((resource) => resource.vacancies),
  );
  const limitingResource = resources.find((resource) => resource.vacancies <= vacancies) || null;
  const open = operates(rules, localDate, time) && !override?.closed;
  const status = !open ? "CLOSED" : Date.parse(cutoff) <= Date.now() ? "CUTOFF" : vacancies === 0 ? "SOLD_OUT" : "AVAILABLE";
  const minPartySize = Math.max(1, Number(rules.min_party_size ?? 1));
  const maxPartySize = Math.max(0, Number(rules.max_party_size ?? 0));
  return { id, productId: rules.product_id, optionId: rules.option_id, localDateTimeStart: start, utcCutoffAt: cutoff, timeZone: rules.time_zone,
    localDate, localTime: time, capacity, vacancies, available: status === "AVAILABLE", status,
    adultPrice: pricing.adultPrice, childPrice: pricing.childPrice, unitPrices: pricing.unitPrices,
    priceScheduleId: pricing.priceScheduleId, priceScheduleLabel: pricing.priceScheduleLabel,
    minPartySize, maxPartySize, supplierNote: override?.note || null,
    seatlessUnits: parse(rules.seatless_units || "[]"),
    sharedResource: limitingResource ? { name: limitingResource.name, capacity: limitingResource.capacity } : null,
    cancellationHours: Number(rules.cancellation_hours) };
}
export function listNativeAvailability(db, productId, optionId, localDate) {
  date.parse(localDate);
  const rules = optionId
    ? [getInventoryRules(db, productId, optionId)].filter(Boolean)
    : db.prepare(`SELECT n.*, o.name AS option_name FROM native_inventory_rules n JOIN product_options o ON o.id = n.option_id
      WHERE n.product_id = ? AND (o.is_active IS NULL OR CAST(o.is_active AS TEXT) NOT IN ('0', 'false')) ORDER BY o.name, o.id`).all(productId);
  return rules.flatMap(rule => parse(rule.departure_times).map(time => ({ ...slotView(db, rule, localDate, time), optionName: rule.option_name || null })));
}
export function checkNativeInventory(db, input, { ownerId } = {}) {
  const productId = input.product_id || input.activity_id;
  const rules = getInventoryRules(db, productId, input.product_option_id);
  if (!rules) return null;
  const localDate = date.parse(input.activity_date);
  const time = input.pickup_time || "09:00";
  let excludeId = "";
  let heldPricing = null;
  if (input.native_hold_id && ownerId) {
    const hold = db.prepare("SELECT * FROM native_reservations WHERE id = ? AND owner_id = ?").get(input.native_hold_id, ownerId);
    if (!hold || hold.availability_slot !== `${rules.option_id}:${localDate}:${time}` || Number(hold.adults) !== Number(input.adults || 1) || Number(hold.children) !== Number(input.children || 0)) throw inventoryError("Reservation does not match these details", "HOLD_MISMATCH");
    if (hold.status !== "ON_HOLD" || hold.utc_expires_at <= new Date().toISOString()) throw inventoryError("Reservation expired. Start a new checkout.", "HOLD_EXPIRED");
    excludeId = hold.id;
    // The hold's own breakdown and frozen total win over anything re-sent now.
    heldPricing = { ...parse(hold.pricing_snapshot || "{}"), unitItems: parse(hold.unit_items || "[]") };
  }
  const slot = slotView(db, rules, localDate, time, excludeId);
  if (excludeId) return { ...slot, ...heldPricing, available: true, status: "AVAILABLE" };
  const party = Number(input.adults || 1) + Number(input.children || 0);
  if (slot.minPartySize > 1 && party < slot.minPartySize) {
    throw inventoryError(`This departure needs at least ${slot.minPartySize} travelers to run.`, "BELOW_MIN_PARTY_SIZE");
  }
  if (slot.maxPartySize > 0 && party > slot.maxPartySize) {
    throw inventoryError(`This departure allows at most ${slot.maxPartySize} travelers per booking.`, "ABOVE_MAX_PARTY_SIZE");
  }
  if (!slot.available || slot.vacancies < party) throw inventoryError("This departure no longer has enough seats or has closed. Choose another departure.");
  return slot;
}
export function reserveNativeInventory(db, { productId, optionId, localDate, localTime, adults, children = 0, unitItems, ownerId, requestKey }) {
  // A unit breakdown, when supplied, is authoritative for the seat counts.
  const optionRules = getInventoryRules(db, productId, optionId);
  const breakdown = normalizeUnitItems(unitItems, {
    adults: Number(adults) || 0, children: Number(children) || 0,
    seatlessUnits: optionRules ? parse(optionRules.seatless_units || "[]") : [],
  });
  adults = breakdown.adults;
  children = breakdown.children;
  if (!ownerId || typeof requestKey !== "string" || !requestKey || requestKey.length > 200 || !Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0 || adults + children > 26) throw inventoryError("Invalid reservation request", "INVALID_RESERVATION", 400);
  return db.transaction(() => {
    db.prepare("UPDATE products SET id = id WHERE id = ?").run(productId);
    const existing = db.prepare("SELECT r.*, s.product_id, s.option_id, s.local_date, s.local_time FROM native_reservations r JOIN native_availability_slots s ON s.id = r.availability_slot WHERE owner_id = ? AND request_key = ?").get(ownerId, requestKey);
    if (existing) {
      if (existing.product_id !== productId || existing.option_id !== optionId || existing.local_date !== localDate || existing.local_time !== localTime || Number(existing.adults) !== adults || Number(existing.children) !== children) throw inventoryError("Reservation key already used for different details", "IDEMPOTENCY_CONFLICT");
      if (existing.status !== "ON_HOLD" || existing.utc_expires_at <= new Date().toISOString()) throw inventoryError("Reservation expired. Start a new checkout.", "HOLD_EXPIRED");
      return existing;
    }
    const activeOption = db.prepare("SELECT id FROM product_options WHERE id = ? AND product_id = ? AND (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false'))").get(optionId, productId);
    if (!activeOption) throw inventoryError("This option is no longer available", "OPTION_NOT_AVAILABLE");
    const slot = checkNativeInventory(db, { product_id: productId, product_option_id: optionId, activity_date: localDate, pickup_time: localTime, adults, children });
    if (!slot) throw inventoryError("Seat inventory is not enabled for this option", "INVENTORY_NOT_ENABLED");
    db.prepare("INSERT INTO native_availability_slots (id, product_id, option_id, local_date, local_time, capacity) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(slot.id, productId, optionId, localDate, localTime, slot.capacity);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + NATIVE_HOLD_MINUTES * 60000).toISOString();
    // Priced now so a later repricing cannot move this traveler's total.
    const unitTotal = priceUnitItems(breakdown.items, slot.unitPrices);
    db.prepare("INSERT INTO native_reservations (id, availability_slot, owner_id, request_key, adults, children, status, utc_expires_at, pricing_snapshot, unit_items) VALUES (?, ?, ?, ?, ?, ?, 'ON_HOLD', ?, ?, ?)").run(id, slot.id, ownerId, requestKey, adults, children, expiresAt, JSON.stringify({ adultPrice: slot.adultPrice, childPrice: slot.childPrice, unitPrices: slot.unitPrices, unitTotal, cancellationHours: slot.cancellationHours, priceScheduleId: slot.priceScheduleId }), JSON.stringify(breakdown.items));
    return db.prepare("SELECT * FROM native_reservations WHERE id = ?").get(id);
  })();
}
export function attachNativeReservation(db, holdId, booking, ownerId) {
  const hold = db.prepare("SELECT * FROM native_reservations WHERE id = ?").get(holdId);
  const slotId = `${booking.product_option_id}:${booking.activity_date}:${booking.pickup_time}`;
  if (!hold || hold.owner_id !== ownerId || hold.availability_slot !== slotId || Number(hold.adults) !== Number(booking.adults) || Number(hold.children) !== Number(booking.children) || hold.booking_id && hold.booking_id !== booking.id) throw inventoryError("Reservation does not match this booking", "HOLD_MISMATCH");
  if (hold.status !== "ON_HOLD" || hold.utc_expires_at <= new Date().toISOString()) throw inventoryError("Reservation expired. Start a new checkout.", "HOLD_EXPIRED");
  const pricing = parse(hold.pricing_snapshot || "{}");
  if (pricing.adultPrice != null && booking.amount_inr != null) {
    // Prefer the frozen unit total; fall back to adult/child for pre-P1 holds.
    const base = pricing.unitTotal != null
      ? Number(pricing.unitTotal)
      : Number(pricing.adultPrice) * Number(hold.adults) + Number(pricing.childPrice) * Number(hold.children);
    if (Number(booking.amount_inr) !== base + Math.round(base * 0.05)) throw inventoryError("Price changed before seats were reserved. Recheck the price.", "PRICE_CHANGED");
  }
  const updated = db.prepare("UPDATE native_reservations SET booking_id = ? WHERE id = ? AND booking_id IS NULL AND status = 'ON_HOLD'").run(booking.id, hold.id);
  if (!updated.changes && hold.booking_id !== booking.id) throw inventoryError("Reservation already attached", "HOLD_MISMATCH");
  return { ...hold, pricing };
}
export function confirmNativeReservation(db, booking) {
  if (!getInventoryRules(db, booking.product_id, booking.product_option_id)) return;
  db.prepare("UPDATE products SET id = id WHERE id = ?").run(booking.product_id);
  const hold = db.prepare("SELECT * FROM native_reservations WHERE booking_id = ?").get(booking.id);
  if (!hold) {
    if (getInventoryRules(db, booking.product_id, booking.product_option_id)) throw inventoryError("Seat reservation missing", "HOLD_EXPIRED");
    return;
  }
  if (hold.status === "CONFIRMED") return;
  const changed = db.prepare("UPDATE native_reservations SET status = 'CONFIRMED' WHERE id = ? AND status = 'ON_HOLD' AND utc_expires_at > ?").run(hold.id, new Date().toISOString());
  if (!changed.changes) throw inventoryError("Seat reservation expired. Payment requires review.", "HOLD_EXPIRED");
  db.prepare("INSERT INTO native_reservation_outbox (booking_id, available_at) VALUES (?, ?) ON CONFLICT(booking_id) DO NOTHING").run(booking.id, new Date().toISOString());
}
export function releaseNativeReservation(db, bookingId) {
  db.prepare("UPDATE native_reservations SET status = 'CANCELLED' WHERE booking_id = ? AND status = 'ON_HOLD'").run(bookingId);
  db.prepare("UPDATE booking_holds SET status = 'EXPIRED' WHERE booking_id = ? AND status = 'ACTIVE'").run(bookingId);
}

// Called inside the booking mutation transaction so either both inventories move or neither does.
export function moveNativeReservation(db, booking, localDate, localTime = booking.pickup_time) {
  if (!getInventoryRules(db, booking.product_id, booking.product_option_id)) return;
  db.prepare("UPDATE products SET id = id WHERE id = ?").run(booking.product_id);
  const existing = db.prepare("SELECT * FROM native_reservations WHERE booking_id = ? AND status = 'CONFIRMED'").get(booking.id);
  if (!existing) throw inventoryError("Confirmed seat reservation missing", "RESERVATION_MISSING");
  if (existing.availability_slot === `${booking.product_option_id}:${localDate}:${localTime}`) return;
  const slot = checkNativeInventory(db, { product_id: booking.product_id, product_option_id: booking.product_option_id, activity_date: localDate, pickup_time: localTime, adults: booking.adults, children: booking.children });
  db.prepare("INSERT INTO native_availability_slots (id, product_id, option_id, local_date, local_time, capacity) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").run(slot.id, booking.product_id, booking.product_option_id, localDate, localTime, slot.capacity);
  db.prepare("UPDATE native_reservations SET availability_slot = ? WHERE id = ? AND status = 'CONFIRMED'").run(slot.id, existing.id);
}

// --- Seasonal pricing (supplier extranet) ---------------------------------

export function listPriceSchedules(db, productId, optionId) {
  return optionalQuery(db, () => db.prepare(
    "SELECT * FROM native_price_schedules WHERE product_id = ? AND option_id = ? ORDER BY priority DESC, starts_on ASC, id ASC"
  ).all(productId, optionId)) || [];
}

export function savePriceSchedule(db, productId, optionId, input) {
  const schedule = priceScheduleSchema.parse(input);
  if (!getInventoryRules(db, productId, optionId)) {
    throw inventoryError("Enable seat inventory before adding seasonal rates.", "INVENTORY_NOT_ENABLED", 409);
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO native_price_schedules (id, option_id, product_id, label, starts_on, ends_on, weekdays, adult_price, child_price, priority, unit_prices)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, optionId, productId, schedule.label, schedule.startsOn, schedule.endsOn,
    JSON.stringify([...new Set(schedule.weekdays)].sort()), schedule.adultPrice, schedule.childPrice, schedule.priority,
    JSON.stringify(schedule.unitPrices));
  return db.prepare("SELECT * FROM native_price_schedules WHERE id = ?").get(id);
}

export function deletePriceSchedule(db, productId, optionId, scheduleId) {
  const removed = db.prepare("DELETE FROM native_price_schedules WHERE id = ? AND product_id = ? AND option_id = ?")
    .run(scheduleId, productId, optionId);
  if (!removed.changes) throw inventoryError("Rate schedule not found", "SCHEDULE_NOT_FOUND", 404);
  return { id: scheduleId };
}

// --- Calendar overrides (supplier extranet) -------------------------------

export function listSlotOverrides(db, productId, optionId, { from, to } = {}) {
  const rows = optionalQuery(db, () => db.prepare(
    "SELECT * FROM native_slot_overrides WHERE product_id = ? AND option_id = ? ORDER BY local_date ASC, local_time ASC"
  ).all(productId, optionId)) || [];
  return rows.filter((row) => (!from || row.local_date >= from) && (!to || row.local_date <= to));
}

/**
 * Closes or resizes one date, or one departure on a date.
 *
 * Refuses to cut capacity below seats already held or confirmed for that
 * departure, mirroring the guard on whole-option capacity edits.
 */
export function saveSlotOverride(db, productId, optionId, input) {
  const override = slotOverrideSchema.parse(input);
  const rules = getInventoryRules(db, productId, optionId);
  if (!rules) throw inventoryError("Enable seat inventory before editing the calendar.", "INVENTORY_NOT_ENABLED", 409);

  return db.transaction(() => {
    db.prepare("UPDATE products SET id = id WHERE id = ?").run(productId);

    if (override.capacity != null) {
      const times = override.localTime ? [override.localTime] : parse(rules.departure_times);
      for (const time of times) {
        const used = occupied(db, `${optionId}:${override.localDate}:${time}`);
        if (override.capacity < used) {
          throw inventoryError(`Capacity cannot be below ${used} reserved seats on ${override.localDate} at ${time}`, "CAPACITY_BELOW_RESERVED");
        }
      }
    }

    const id = `${optionId}:${override.localDate}:${override.localTime}`;
    db.prepare(`INSERT INTO native_slot_overrides (id, option_id, product_id, local_date, local_time, capacity, closed, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(option_id, local_date, local_time) DO UPDATE SET
      capacity=excluded.capacity, closed=excluded.closed, note=excluded.note, updated_at=CURRENT_TIMESTAMP`).run(
      id, optionId, productId, override.localDate, override.localTime,
      override.capacity, override.closed ? 1 : 0, override.note);

    // Keep any already-materialized slots in step with the new override.
    for (const slot of db.prepare("SELECT * FROM native_availability_slots WHERE option_id = ? AND local_date = ?").all(optionId, override.localDate)) {
      if (override.localTime && slot.local_time !== override.localTime) continue;
      const effective = resolveOverride(db, optionId, slot.local_date, slot.local_time);
      const open = operates(rules, slot.local_date, slot.local_time) && !effective?.closed;
      db.prepare("UPDATE native_availability_slots SET capacity = ?, closed = ? WHERE id = ?")
        .run(effective?.capacity ?? Number(rules.capacity), open ? 0 : 1, slot.id);
    }
    return db.prepare("SELECT * FROM native_slot_overrides WHERE id = ?").get(id);
  })();
}

export function deleteSlotOverride(db, productId, optionId, localDate, localTime = "") {
  const removed = db.prepare("DELETE FROM native_slot_overrides WHERE product_id = ? AND option_id = ? AND local_date = ? AND local_time = ?")
    .run(productId, optionId, localDate, localTime);
  if (!removed.changes) throw inventoryError("Calendar override not found", "OVERRIDE_NOT_FOUND", 404);
  return { localDate, localTime };
}

// --- Booking unit items ---------------------------------------------------

/**
 * Records the billed unit breakdown for a booking.
 *
 * Additive to `bookings.adults` / `bookings.children`, which stay the canonical
 * seat counts. Safe to call for any booking: pre-P1 databases without the table
 * are skipped rather than failing the checkout transaction.
 */
export function saveBookingUnitItems(db, bookingId, items, unitPrices = {}) {
  if (!Array.isArray(items) || !items.length) return [];
  return optionalQuery(db, () => {
    db.prepare("DELETE FROM booking_unit_items WHERE booking_id = ?").run(bookingId);
    for (const item of items) {
      db.prepare(
        "INSERT INTO booking_unit_items (id, booking_id, unit_type, quantity, unit_price_inr) VALUES (?, ?, ?, ?, ?)"
      ).run(`${bookingId}:${item.unitType}`, bookingId, item.unitType, item.quantity, Number(unitPrices[item.unitType] ?? 0));
    }
    return items;
  }) || [];
}

export function listBookingUnitItems(db, bookingId) {
  return optionalQuery(db, () => db.prepare(
    "SELECT unit_type AS unitType, quantity, unit_price_inr AS unitPriceInr FROM booking_unit_items WHERE booking_id = ? ORDER BY unit_type"
  ).all(bookingId)) || [];
}

// --- Month pricing (traveler price calendar) ------------------------------

/**
 * Resolves one month of seasonal prices and open/closed state for a product.
 *
 * Deliberately avoids per-slot occupancy counting: a month calendar only needs
 * the rate and whether the date sells at all, so this stays a handful of queries
 * rather than one per departure per day.
 *
 * @returns {null|{optionId: string, basePriceInr: number, days: Array}} null when
 *   the product has no native inventory, so callers can fall back to their own
 *   pricing.
 */
export function listNativeMonthPricing(db, productId, yearMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(yearMonth || ""))) return null;
  const rules = getInventoryRules(db, productId);
  if (!rules) return null;

  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const departures = parse(rules.departure_times);
  const days = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const localDate = `${yearMonth}-${String(day).padStart(2, "0")}`;
    const pricing = resolvePricing(db, rules, localDate);
    const open = departures.some((time) =>
      operates(rules, localDate, time) && !resolveOverride(db, rules.option_id, localDate, time)?.closed);
    days.push({
      date: localDate,
      priceInr: pricing.adultPrice,
      available: open,
      scheduleLabel: pricing.priceScheduleLabel,
    });
  }

  return { optionId: rules.option_id, basePriceInr: Number(rules.adult_price), days };
}

// --- Shared resources (supplier extranet) ---------------------------------

export const resourceSchema = z.object({
  name: z.string().min(1).max(120),
  capacity: z.number().int().min(0).max(10000),
  optionIds: z.array(z.string().min(1).max(200)).max(50).default([]),
});

export function listResources(db, supplierId) {
  const rows = optionalQuery(db, () => db.prepare(
    "SELECT * FROM native_resources WHERE supplier_id = ? ORDER BY name ASC, id ASC"
  ).all(supplierId)) || [];
  return rows.map((resource) => ({
    ...resource,
    optionIds: (optionalQuery(db, () => db.prepare(
      "SELECT option_id FROM native_resource_options WHERE resource_id = ?"
    ).all(resource.id)) || []).map((row) => row.option_id),
  }));
}

/**
 * Creates or replaces a shared resource and the options it constrains.
 *
 * Refuses to shrink below seats already committed on any linked departure, the
 * same guard the option-level and per-date capacity edits use.
 */
export function saveResource(db, supplierId, input, resourceId = null) {
  const resource = resourceSchema.parse(input);
  return db.transaction(() => {
    for (const optionId of resource.optionIds) {
      const owned = db.prepare(
        `SELECT n.option_id FROM native_inventory_rules n
         JOIN products p ON p.id = n.product_id
         WHERE n.option_id = ? AND p.supplier_id = ?`
      ).get(optionId, supplierId);
      if (!owned) throw inventoryError("Option not found for this supplier", "OPTION_NOT_FOUND", 404);
    }

    const id = resourceId || randomUUID();
    if (resourceId) {
      const existing = db.prepare("SELECT id FROM native_resources WHERE id = ? AND supplier_id = ?").get(resourceId, supplierId);
      if (!existing) throw inventoryError("Resource not found", "RESOURCE_NOT_FOUND", 404);
      db.prepare("UPDATE native_resources SET name = ?, capacity = ? WHERE id = ?").run(resource.name, resource.capacity, id);
      db.prepare("DELETE FROM native_resource_options WHERE resource_id = ?").run(id);
    } else {
      db.prepare("INSERT INTO native_resources (id, supplier_id, name, capacity) VALUES (?, ?, ?, ?)")
        .run(id, supplierId, resource.name, resource.capacity);
    }
    for (const optionId of resource.optionIds) {
      db.prepare("INSERT INTO native_resource_options (resource_id, option_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
        .run(id, optionId);
    }

    const committed = Number(db.prepare(
      `SELECT COALESCE(MAX(seats), 0) AS seats FROM (
         SELECT s.local_date, s.local_time, SUM(r.adults + r.children) AS seats
         FROM native_reservations r
         JOIN native_availability_slots s ON s.id = r.availability_slot
         LEFT JOIN bookings b ON b.id = r.booking_id
         WHERE s.option_id IN (SELECT option_id FROM native_resource_options WHERE resource_id = ?)
           AND (b.id IS NULL OR b.status <> 'cancelled')
           AND (r.status = 'CONFIRMED' OR (r.status = 'ON_HOLD' AND r.utc_expires_at > ?))
         GROUP BY s.local_date, s.local_time
       )`
    ).get(id, new Date().toISOString()).seats);
    if (resource.capacity < committed) {
      throw inventoryError(`Capacity cannot be below ${committed} seats already committed on a shared departure`, "CAPACITY_BELOW_RESERVED");
    }

    return listResources(db, supplierId).find((row) => row.id === id);
  })();
}

export function deleteResource(db, supplierId, resourceId) {
  const removed = db.transaction(() => {
    db.prepare("DELETE FROM native_resource_options WHERE resource_id = ?").run(resourceId);
    return db.prepare("DELETE FROM native_resources WHERE id = ? AND supplier_id = ?").run(resourceId, supplierId);
  })();
  if (!removed.changes) throw inventoryError("Resource not found", "RESOURCE_NOT_FOUND", 404);
  return { id: resourceId };
}
