import { randomUUID } from "node:crypto";
import { z } from "zod";

export const NATIVE_HOLD_MINUTES = 10;
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
});
export const nativeHoldSchema = z.object({
  productId: z.string().min(1).max(200), optionId: z.string().min(1).max(200),
  localDate: date, localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  adults: z.number().int().min(1).max(26), children: z.number().int().min(0).max(25).default(0),
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
    if (!previous) {
      const active = db.prepare("SELECT id FROM bookings WHERE product_id = ? AND status NOT IN ('cancelled', 'completed') LIMIT 1").get(productId);
      if (active) throw inventoryError("This listing has existing reservations. Reconcile them before enabling seat inventory.", "EXISTING_RESERVATIONS");
    }
    db.prepare(`INSERT INTO native_inventory_rules (option_id, product_id, operating_days, departure_times, capacity, adult_price, child_price, cutoff_minutes, cancellation_hours, blackout_dates)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(option_id) DO UPDATE SET operating_days=excluded.operating_days,
      departure_times=excluded.departure_times, capacity=excluded.capacity, adult_price=excluded.adult_price, child_price=excluded.child_price,
      cutoff_minutes=excluded.cutoff_minutes, cancellation_hours=excluded.cancellation_hours, blackout_dates=excluded.blackout_dates, updated_at=CURRENT_TIMESTAMP`).run(
      optionId, productId, JSON.stringify([...new Set(rules.operatingDays)]), JSON.stringify([...new Set(rules.departureTimes)].sort()), rules.capacity,
      rules.adultPrice, rules.childPrice, rules.cutoffMinutes, rules.cancellationHours, JSON.stringify(rules.blackoutDates));
    const current = getInventoryRules(db, productId, optionId);
    for (const slot of db.prepare("SELECT * FROM native_availability_slots WHERE option_id = ?").all(optionId)) {
      const used = occupied(db, slot.id);
      if (rules.capacity < used) throw inventoryError(`Capacity cannot be below ${used} reserved seats on ${slot.local_date} at ${slot.local_time}`, "CAPACITY_BELOW_RESERVED");
      db.prepare("UPDATE native_availability_slots SET capacity = ?, closed = ? WHERE id = ?").run(rules.capacity, operates(current, slot.local_date, slot.local_time) ? 0 : 1, slot.id);
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
function slotView(db, rules, localDate, time, excludeId = "") {
  const id = `${rules.option_id}:${localDate}:${time}`;
  const start = `${localDate}T${time}:00+05:30`;
  const cutoff = new Date(Date.parse(start) - Number(rules.cutoff_minutes) * 60000).toISOString();
  const vacancies = Math.max(0, Number(rules.capacity) - occupied(db, id, excludeId));
  const status = !operates(rules, localDate, time) ? "CLOSED" : Date.parse(cutoff) <= Date.now() ? "CUTOFF" : vacancies === 0 ? "SOLD_OUT" : "AVAILABLE";
  return { id, productId: rules.product_id, optionId: rules.option_id, localDateTimeStart: start, utcCutoffAt: cutoff, timeZone: rules.time_zone,
    localDate, localTime: time, capacity: Number(rules.capacity), vacancies, available: status === "AVAILABLE", status,
    adultPrice: Number(rules.adult_price), childPrice: Number(rules.child_price), cancellationHours: Number(rules.cancellation_hours) };
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
    heldPricing = parse(hold.pricing_snapshot || "{}");
  }
  const slot = slotView(db, rules, localDate, time, excludeId);
  if (excludeId) return { ...slot, ...heldPricing, available: true, status: "AVAILABLE" };
  if (!slot.available || slot.vacancies < Number(input.adults || 1) + Number(input.children || 0)) throw inventoryError("This departure no longer has enough seats or has closed. Choose another departure.");
  return slot;
}
export function reserveNativeInventory(db, { productId, optionId, localDate, localTime, adults, children = 0, ownerId, requestKey }) {
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
    db.prepare("INSERT INTO native_reservations (id, availability_slot, owner_id, request_key, adults, children, status, utc_expires_at, pricing_snapshot) VALUES (?, ?, ?, ?, ?, ?, 'ON_HOLD', ?, ?)").run(id, slot.id, ownerId, requestKey, adults, children, expiresAt, JSON.stringify({ adultPrice: slot.adultPrice, childPrice: slot.childPrice, cancellationHours: slot.cancellationHours }));
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
    const base = Number(pricing.adultPrice) * Number(hold.adults) + Number(pricing.childPrice) * Number(hold.children);
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
