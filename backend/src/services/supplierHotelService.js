import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * The supplier's hotel rate sheet (ADR 035, ADR 040): contracted net rates per
 * hotel, room type and meal plan, by season. Used only to price quotation
 * lines; hotels are never live inventory and nothing here is bookable.
 */

export const MEAL_PLANS = Object.freeze(["EP", "CP", "MAP", "AP"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const hotelError = (message, status = 400, code = "INVALID_HOTEL") => Object.assign(new Error(message), { status, code });

export const hotelSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().max(100).optional().nullable(),
  starRating: z.number().int().min(1).max(7).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  // Where booking requests go (ADR 045).
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(24).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const hotelRateSchema = z.object({
  roomType: z.string().trim().min(1).max(80),
  mealPlan: z.enum(MEAL_PLANS),
  validFrom: isoDate,
  validTo: isoDate,
  netPerNightInr: z.number().int().min(0).max(10_000_000),
  extraAdultInr: z.number().int().min(0).max(10_000_000).default(0),
  childInr: z.number().int().min(0).max(10_000_000).default(0),
  // Guests one room sleeps, extra bed included; quotations warn when the rooms are too few (ADR 044).
  maxGuests: z.number().int().min(1).max(20).optional().nullable(),
}).strict().refine((rate) => rate.validFrom <= rate.validTo, { message: "The season must end on or after it starts", path: ["validTo"] });

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function findHotel(db, supplierId, hotelId) {
  const hotel = db.prepare("SELECT * FROM supplier_hotels WHERE id = ? AND supplier_id = ?").get(hotelId, supplierId);
  if (!hotel) throw hotelError("Hotel not found", 404, "HOTEL_NOT_FOUND");
  return hotel;
}

function rateView(row) {
  return {
    id: row.id, roomType: row.room_type, mealPlan: row.meal_plan, validFrom: row.valid_from, validTo: row.valid_to,
    netPerNightInr: Number(row.net_per_night_inr), extraAdultInr: Number(row.extra_adult_inr), childInr: Number(row.child_inr),
    maxGuests: row.max_guests ?? null,
  };
}

function hotelView(db, row) {
  const rates = db.prepare("SELECT * FROM supplier_hotel_rates WHERE hotel_id = ? ORDER BY room_type, meal_plan, valid_from").all(row.id).map(rateView);
  return { id: row.id, name: row.name, city: row.city || null, starRating: row.star_rating ?? null, notes: row.notes || null, email: row.email || null, phone: row.phone || null, status: row.status, rates };
}

export function listHotels(db, supplierId) {
  return db.prepare("SELECT * FROM supplier_hotels WHERE supplier_id = ? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, LOWER(name)").all(supplierId)
    .map((row) => hotelView(db, row));
}

export function saveHotel(db, supplierId, input, hotelId = null) {
  const hotel = hotelSchema.parse(input);
  const values = [hotel.name, hotel.city || null, hotel.starRating ?? null, hotel.notes || null, hotel.status, hotel.email ? hotel.email.toLowerCase() : null, hotel.phone || null];
  if (hotelId) {
    findHotel(db, supplierId, hotelId);
    db.prepare("UPDATE supplier_hotels SET name = ?, city = ?, star_rating = ?, notes = ?, status = ?, email = ?, phone = ? WHERE id = ? AND supplier_id = ?").run(...values, hotelId, supplierId);
  } else {
    hotelId = `htl_${nanoid(12)}`;
    db.prepare("INSERT INTO supplier_hotels (id, supplier_id, name, city, star_rating, notes, status, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(hotelId, supplierId, ...values);
  }
  return hotelView(db, findHotel(db, supplierId, hotelId));
}

/** Adds a season. Two seasons for the same room and meal plan may not overlap, so every night has one rate. */
export function addHotelRate(db, supplierId, hotelId, input) {
  const rate = hotelRateSchema.parse(input);
  findHotel(db, supplierId, hotelId);
  const overlap = db.prepare(`SELECT valid_from, valid_to FROM supplier_hotel_rates
    WHERE hotel_id = ? AND LOWER(room_type) = LOWER(?) AND meal_plan = ? AND valid_from <= ? AND valid_to >= ?`)
    .get(hotelId, rate.roomType, rate.mealPlan, rate.validTo, rate.validFrom);
  if (overlap) throw hotelError(`This overlaps the ${overlap.valid_from} to ${overlap.valid_to} season for ${rate.roomType} ${rate.mealPlan}`, 409, "RATE_OVERLAP");
  db.prepare(`INSERT INTO supplier_hotel_rates (id, hotel_id, room_type, meal_plan, valid_from, valid_to, net_per_night_inr, extra_adult_inr, child_inr, max_guests)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`hrt_${nanoid(12)}`, hotelId, rate.roomType, rate.mealPlan, rate.validFrom, rate.validTo, rate.netPerNightInr, rate.extraAdultInr, rate.childInr, rate.maxGuests ?? null);
  return hotelView(db, findHotel(db, supplierId, hotelId));
}

export function deleteHotelRate(db, supplierId, hotelId, rateId) {
  findHotel(db, supplierId, hotelId);
  const removed = db.prepare("DELETE FROM supplier_hotel_rates WHERE id = ? AND hotel_id = ?").run(rateId, hotelId);
  if (!removed.changes) throw hotelError("Rate not found", 404, "RATE_NOT_FOUND");
  return hotelView(db, findHotel(db, supplierId, hotelId));
}

/**
 * The net cost of a stay, night by night, so a stay across two seasons uses
 * each night's own rate: (room rate × rooms + extra adults + children) per night.
 */
export function hotelStayCost(db, supplierId, { hotelId, roomType, mealPlan, checkIn, nights, rooms = 1, extraAdults = 0, children = 0 }) {
  const hotel = findHotel(db, supplierId, hotelId);
  const find = db.prepare(`SELECT * FROM supplier_hotel_rates WHERE hotel_id = ? AND LOWER(room_type) = LOWER(?) AND meal_plan = ?
    AND valid_from <= ? AND valid_to >= ? LIMIT 1`);
  let cost = 0;
  const perNight = [];
  for (let night = 0; night < nights; night += 1) {
    const date = addDays(checkIn, night);
    const rate = find.get(hotelId, roomType, mealPlan, date, date);
    if (!rate) throw hotelError(`${hotel.name} has no ${roomType} ${mealPlan} rate for ${date}`, 409, "RATE_MISSING");
    const nightCost = Number(rate.net_per_night_inr) * rooms + Number(rate.extra_adult_inr) * extraAdults + Number(rate.child_inr) * children;
    perNight.push({ date, costInr: nightCost });
    cost += nightCost;
  }
  return { hotel, costInr: cost, perNight };
}
