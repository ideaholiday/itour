import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * The supplier's private rate sheet for transfers, sightseeing and activities
 * (ADR 042, docs/SUPPLIER_OPERATIONS.md). Used only to price quotation lines,
 * like the hotel rate sheet: nothing here is listed, sold or holds seats.
 *
 *   TRANSFER / SIGHTSEEING: a car on a route, priced per vehicle for each cab type, by season.
 *   ACTIVITY: an entry ticket or activity, priced per adult and child, by season.
 */

export const SERVICE_KINDS = Object.freeze(["TRANSFER", "SIGHTSEEING", "ACTIVITY"]);
export const isTransport = (kind) => kind === "TRANSFER" || kind === "SIGHTSEEING";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const text = (max) => z.string().trim().max(max).optional().nullable();
const rateSheetError = (message, status = 400, code = "INVALID_SERVICE") => Object.assign(new Error(message), { status, code });
const money = z.number().int().min(0).max(10_000_000);

export const cabTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  seats: z.number().int().min(1).max(100),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const serviceSchema = z.object({
  kind: z.enum(SERVICE_KINDS),
  name: z.string().trim().min(2).max(160),
  city: text(100),
  fromPlace: text(160),
  toPlace: text(160),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  durationHours: z.number().min(0).max(240).optional().nullable(),
  closedWeekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  dayTitle: text(160),
  dayDescription: text(2000),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const serviceRateSchema = z.object({
  cabTypeId: z.string().trim().max(120).optional().nullable(),
  validFrom: isoDate,
  validTo: isoDate,
  vehicleInr: money.optional().nullable(),
  adultInr: money.optional().nullable(),
  childInr: money.default(0),
}).strict().refine((rate) => rate.validFrom <= rate.validTo, { message: "The season must end on or after it starts", path: ["validTo"] });

// --- Cab types ---

function cabTypeView(row) {
  return { id: row.id, name: row.name, seats: Number(row.seats), status: row.status };
}

export function findCabType(db, supplierId, cabTypeId) {
  const row = db.prepare("SELECT * FROM supplier_cab_types WHERE id = ? AND supplier_id = ?").get(cabTypeId, supplierId);
  if (!row) throw rateSheetError("Cab type not found", 404, "CAB_TYPE_NOT_FOUND");
  return row;
}

export function listCabTypes(db, supplierId) {
  return db.prepare("SELECT * FROM supplier_cab_types WHERE supplier_id = ? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, seats, LOWER(name)").all(supplierId).map(cabTypeView);
}

export function saveCabType(db, supplierId, input, cabTypeId = null) {
  const cab = cabTypeSchema.parse(input);
  if (cabTypeId) {
    findCabType(db, supplierId, cabTypeId);
    db.prepare("UPDATE supplier_cab_types SET name = ?, seats = ?, status = ? WHERE id = ? AND supplier_id = ?").run(cab.name, cab.seats, cab.status, cabTypeId, supplierId);
  } else {
    cabTypeId = `cab_${nanoid(12)}`;
    db.prepare("INSERT INTO supplier_cab_types (id, supplier_id, name, seats, status) VALUES (?, ?, ?, ?, ?)").run(cabTypeId, supplierId, cab.name, cab.seats, cab.status);
  }
  return cabTypeView(findCabType(db, supplierId, cabTypeId));
}

// --- Services and their seasons ---

const closedDays = (value) => String(value || "").split(",").filter((day) => day !== "").map(Number);

function rateView(row) {
  return {
    id: row.id, cabTypeId: row.cab_type_id || null, validFrom: row.valid_from, validTo: row.valid_to,
    vehicleInr: row.vehicle_inr ?? null, adultInr: row.adult_inr ?? null, childInr: Number(row.child_inr || 0),
  };
}

function serviceView(db, row) {
  const rates = db.prepare("SELECT * FROM supplier_service_rates WHERE service_id = ? ORDER BY cab_type_id, valid_from").all(row.id).map(rateView);
  return {
    id: row.id, kind: row.kind, name: row.name, city: row.city || null, fromPlace: row.from_place || null, toPlace: row.to_place || null,
    startTime: row.start_time || null, durationHours: row.duration_hours ?? null, closedWeekdays: closedDays(row.closed_weekdays),
    dayTitle: row.day_title || null, dayDescription: row.day_description || null, status: row.status, rates,
  };
}

export function findService(db, supplierId, serviceId) {
  const row = db.prepare("SELECT * FROM supplier_services WHERE id = ? AND supplier_id = ?").get(serviceId, supplierId);
  if (!row) throw rateSheetError("Service not found", 404, "SERVICE_NOT_FOUND");
  return row;
}

export function listServices(db, supplierId) {
  return db.prepare(`SELECT * FROM supplier_services WHERE supplier_id = ?
    ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, LOWER(COALESCE(city, '')), LOWER(name)`).all(supplierId).map((row) => serviceView(db, row));
}

export function saveService(db, supplierId, input, serviceId = null) {
  const service = serviceSchema.parse(input);
  const values = [service.kind, service.name, service.city || null, service.fromPlace || null, service.toPlace || null, service.startTime || null,
    service.durationHours ?? null, [...new Set(service.closedWeekdays)].sort().join(",") || null, service.dayTitle || null, service.dayDescription || null, service.status];
  if (serviceId) {
    const existing = findService(db, supplierId, serviceId);
    if (isTransport(existing.kind) !== isTransport(service.kind)) {
      throw rateSheetError("A car service can't become an activity or the other way round; add a new service", 409, "KIND_CHANGE");
    }
    db.prepare(`UPDATE supplier_services SET kind = ?, name = ?, city = ?, from_place = ?, to_place = ?, start_time = ?, duration_hours = ?,
      closed_weekdays = ?, day_title = ?, day_description = ?, status = ? WHERE id = ? AND supplier_id = ?`).run(...values, serviceId, supplierId);
  } else {
    serviceId = `svc_${nanoid(12)}`;
    db.prepare(`INSERT INTO supplier_services (id, supplier_id, kind, name, city, from_place, to_place, start_time, duration_hours,
      closed_weekdays, day_title, day_description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(serviceId, supplierId, ...values);
  }
  return serviceView(db, findService(db, supplierId, serviceId));
}

/**
 * Adds a season. A car service needs a cab type and a price per vehicle; an
 * activity needs an adult price. Seasons for the same cab type (or the same
 * activity) may not overlap, so every date has one price.
 */
export function addServiceRate(db, supplierId, serviceId, input) {
  const rate = serviceRateSchema.parse(input);
  const service = findService(db, supplierId, serviceId);
  let cabTypeId = null;
  if (isTransport(service.kind)) {
    if (!rate.cabTypeId) throw rateSheetError("Choose the cab type this price is for", 400, "CAB_TYPE_REQUIRED");
    if (rate.vehicleInr == null) throw rateSheetError("Enter the price per vehicle", 400, "PRICE_REQUIRED");
    cabTypeId = findCabType(db, supplierId, rate.cabTypeId).id;
  } else if (rate.adultInr == null) {
    throw rateSheetError("Enter the adult price", 400, "PRICE_REQUIRED");
  }
  const overlap = db.prepare(`SELECT valid_from, valid_to FROM supplier_service_rates
    WHERE service_id = ? AND COALESCE(cab_type_id, '') = ? AND valid_from <= ? AND valid_to >= ?`).get(service.id, cabTypeId || "", rate.validTo, rate.validFrom);
  if (overlap) throw rateSheetError(`This overlaps the ${overlap.valid_from} to ${overlap.valid_to} season`, 409, "RATE_OVERLAP");
  db.prepare(`INSERT INTO supplier_service_rates (id, service_id, cab_type_id, valid_from, valid_to, vehicle_inr, adult_inr, child_inr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`srt_${nanoid(12)}`, service.id, cabTypeId, rate.validFrom, rate.validTo,
    cabTypeId ? rate.vehicleInr : null, cabTypeId ? null : rate.adultInr, cabTypeId ? 0 : rate.childInr);
  return serviceView(db, findService(db, supplierId, service.id));
}

export function deleteServiceRate(db, supplierId, serviceId, rateId) {
  findService(db, supplierId, serviceId);
  const removed = db.prepare("DELETE FROM supplier_service_rates WHERE id = ? AND service_id = ?").run(rateId, serviceId);
  if (!removed.changes) throw rateSheetError("Rate not found", 404, "RATE_NOT_FOUND");
  return serviceView(db, findService(db, supplierId, serviceId));
}

// --- Pricing for quotations ---

function openOn(service, date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (closedDays(service.closed_weekdays).includes(weekday)) {
    throw rateSheetError(`${service.name} doesn't run on ${WEEKDAYS[weekday]}s (${date})`, 409, "SERVICE_CLOSED");
  }
}

/**
 * A transfer or sightseeing tour: vehicles × that cab's price on the date.
 * Without a vehicle count, enough cabs for everyone (children take a seat).
 */
export function transportCost(db, supplierId, { serviceId, cabTypeId, date, vehicles = null, adults, children = 0 }) {
  const service = findService(db, supplierId, serviceId);
  if (!isTransport(service.kind)) throw rateSheetError(`${service.name} is an activity, not a car service`, 409, "WRONG_SERVICE_KIND");
  const cab = findCabType(db, supplierId, cabTypeId);
  openOn(service, date);
  const rate = db.prepare(`SELECT * FROM supplier_service_rates WHERE service_id = ? AND cab_type_id = ? AND valid_from <= ? AND valid_to >= ? LIMIT 1`)
    .get(service.id, cab.id, date, date);
  if (!rate) throw rateSheetError(`${service.name} has no ${cab.name} price for ${date}`, 409, "RATE_MISSING");
  const count = vehicles || Math.max(1, Math.ceil((adults + children) / Number(cab.seats)));
  return { service, cab, vehicles: count, costInr: count * Number(rate.vehicle_inr) };
}

/** An activity: adults × adult price + children × child price on the date. */
export function activityCost(db, supplierId, { serviceId, date, adults, children = 0 }) {
  const service = findService(db, supplierId, serviceId);
  if (service.kind !== "ACTIVITY") throw rateSheetError(`${service.name} is a car service; choose a cab type`, 409, "WRONG_SERVICE_KIND");
  openOn(service, date);
  const rate = db.prepare(`SELECT * FROM supplier_service_rates WHERE service_id = ? AND cab_type_id IS NULL AND valid_from <= ? AND valid_to >= ? LIMIT 1`)
    .get(service.id, date, date);
  if (!rate) throw rateSheetError(`${service.name} has no price for ${date}`, 409, "RATE_MISSING");
  return { service, costInr: adults * Number(rate.adult_inr) + children * Number(rate.child_inr) };
}
