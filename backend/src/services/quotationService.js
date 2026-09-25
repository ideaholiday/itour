import crypto from "node:crypto";
import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";
import { calculateBookingQuote } from "./bookingService.js";
import { hotelStayCost, MEAL_PLANS } from "./supplierHotelService.js";
import { activityCost, transportCost } from "./supplierRateSheetService.js";
import { createSupplierBooking } from "./supplierBookingService.js";
import { supplierCountry } from "./supplierVerificationService.js";
import { DIRECT_PAYMENT_MODES } from "../lib/bookingSources.js";

/**
 * Package quotations (ADR 040, docs/SUPPLIER_OPERATIONS.md).
 *
 * A quotation mixes hotel nights from the supplier's rate sheet, transfers,
 * sightseeing and activities from its private rate sheet (ADR 042), the
 * supplier's own listings and custom lines, day by day. The server prices
 * every line:
 *   hotel, transport, activity and custom lines are the supplier's cost and carry markup_pct;
 *   listings enter at their own pre-tax price;
 *   an Indian supplier adds 5% GST on the package (tour-operator rate).
 * The customer sees one package price, or one per hotel option (ADR 043): cars,
 * activities, listings and custom lines are shared, each hotel line belongs to
 * one option, and the customer picks an option on acceptance. When the quotation is accepted, each
 * listing line can be booked: the booking holds the seats and records the
 * line's share of the package, and the customer's money is tracked here.
 */

export const PACKAGE_GST_PCT = 5;
export const MAX_OPTIONS = 6;
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED"];
const quoteRef = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const quotationError = (message, status = 400, code = "INVALID_QUOTATION") => Object.assign(new Error(message), { status, code });

const lineBase = { dayNumber: z.number().int().min(1).max(60).default(1), title: z.string().trim().min(1).max(160), description: z.string().trim().max(1000).optional().nullable() };
// Rate-sheet lines take the service's name when untitled and the quotation's travelers when no count is given.
const serviceLineBase = {
  ...lineBase, title: z.string().trim().max(160).optional().nullable(), serviceId: z.string().trim().min(1).max(120), date: isoDate,
  adults: z.number().int().min(0).max(100).optional().nullable(), children: z.number().int().min(0).max(100).optional().nullable(),
};
const lineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("HOTEL"), ...lineBase, option: z.number().int().min(1).max(MAX_OPTIONS).default(1),
    hotelId: z.string().trim().min(1).max(120), roomType: z.string().trim().min(1).max(80), mealPlan: z.enum(MEAL_PLANS),
    checkIn: isoDate, nights: z.number().int().min(1).max(60), rooms: z.number().int().min(1).max(50).default(1),
    extraAdults: z.number().int().min(0).max(50).default(0), children: z.number().int().min(0).max(50).default(0),
  }).strict(),
  z.object({
    kind: z.literal("LISTING"), ...lineBase,
    productId: z.string().trim().min(1).max(120), productOptionId: z.string().trim().max(120).optional().nullable(),
    date: isoDate, pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    adults: z.number().int().min(1).max(50), children: z.number().int().min(0).max(50).default(0),
  }).strict(),
  z.object({ kind: z.literal("CUSTOM"), ...lineBase, date: isoDate.optional().nullable(), amountInr: z.number().int().min(0).max(100_000_000) }).strict(),
  z.object({
    kind: z.literal("TRANSPORT"), ...serviceLineBase,
    cabTypeId: z.string().trim().min(1).max(120), vehicles: z.number().int().min(1).max(50).optional().nullable(),
  }).strict(),
  z.object({ kind: z.literal("ACTIVITY"), ...serviceLineBase }).strict(),
]);

const daySchema = z.object({
  dayNumber: z.number().int().min(1).max(60),
  title: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(4000).optional().nullable(),
}).strict();

export const quotationSchema = z.object({
  title: z.string().trim().min(2).max(160),
  destination: z.string().trim().max(120).optional().nullable(),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  customerPhone: z.string().trim().max(24).optional().nullable(),
  agentId: z.string().trim().max(120).optional().nullable(),
  startDate: isoDate,
  adults: z.number().int().min(1).max(100).default(2),
  children: z.number().int().min(0).max(100).default(0),
  markupPct: z.number().min(0).max(200).default(0),
  notes: z.string().trim().max(4000).optional().nullable(),
  validUntil: isoDate.optional().nullable(),
  lines: z.array(lineSchema).max(120).default([]),
  days: z.array(daySchema).max(60).default([]),
  // Hotel options (ADR 043): none or one means a single package; 2–6 named options, hotels chosen per option.
  options: z.array(z.object({ name: z.string().trim().min(1).max(60) }).strict()).max(MAX_OPTIONS).default([]),
}).strict();

export const quotationPaymentSchema = z.object({
  mode: z.enum(DIRECT_PAYMENT_MODES),
  amount_inr: z.number().int().positive().max(100_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
}).strict();

const money = (value) => Math.round(Number(value || 0));

/** The line's price: hotel, rate-sheet and custom lines at cost, listing at its pre-tax price, all worked out on the server. */
function priceLine(db, supplierId, line, travelers) {
  if (line.kind === "HOTEL") {
    const stay = hotelStayCost(db, supplierId, line);
    return { price: stay.costInr, row: { option_number: line.option, line_date: line.checkIn, hotel_id: line.hotelId, room_type: line.roomType, meal_plan: line.mealPlan, nights: line.nights, rooms: line.rooms, extra_adults: line.extraAdults, children: line.children } };
  }
  if (line.kind === "LISTING") {
    const product = db.prepare("SELECT id FROM products WHERE id = ? AND supplier_id = ?").get(line.productId, supplierId);
    if (!product) throw quotationError("Listing not found for this supplier", 404, "PRODUCT_NOT_FOUND");
    let quote;
    try {
      quote = calculateBookingQuote(db, {
        product_id: line.productId, product_option_id: line.productOptionId || null, activity_date: line.date,
        pickup_time: line.pickupTime || "09:00", adults: line.adults, children: line.children,
      }, { enforceListingSupplierAvailability: false, counterSale: true });
    } catch (error) {
      throw quotationError(`${line.title}: ${error.message}`, 409, "LISTING_UNAVAILABLE");
    }
    return { price: money(quote.totalAmount - quote.gstAmount), row: { line_date: line.date, product_id: line.productId, product_option_id: line.productOptionId || null, pickup_time: line.pickupTime || null, adults: line.adults, children: line.children } };
  }
  if (line.kind === "TRANSPORT" || line.kind === "ACTIVITY") {
    const adults = line.adults ?? travelers.adults;
    const children = line.children ?? travelers.children;
    const row = { line_date: line.date, service_id: line.serviceId, adults, children };
    if (line.kind === "TRANSPORT") {
      const cost = transportCost(db, supplierId, { serviceId: line.serviceId, cabTypeId: line.cabTypeId, date: line.date, vehicles: line.vehicles, adults, children });
      return { price: cost.costInr, title: line.title || cost.service.name, service: cost.service, row: { ...row, cab_type_id: cost.cab.id, vehicles: cost.vehicles } };
    }
    const cost = activityCost(db, supplierId, { serviceId: line.serviceId, date: line.date, adults, children });
    return { price: cost.costInr, title: line.title || cost.service.name, service: cost.service, row };
  }
  return { price: money(line.amountInr), row: { line_date: line.date || null, amount_inr: line.amountInr } };
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Package totals from priced lines: markup on cost lines, listings as they are, 5% GST for an Indian supplier. */
export function packageTotals(lines, { markupPct, gstPct }) {
  const cost = lines.filter((line) => line.kind !== "LISTING").reduce((sum, line) => sum + line.price, 0);
  const listings = lines.filter((line) => line.kind === "LISTING").reduce((sum, line) => sum + line.price, 0);
  const markup = money((cost * markupPct) / 100);
  const subtotal = cost + markup + listings;
  const gst = money((subtotal * gstPct) / 100);
  return { cost_inr: cost, listings_inr: listings, markup_inr: markup, subtotal_inr: subtotal, gst_pct: gstPct, gst_inr: gst, total_inr: subtotal + gst };
}

/** The lines one option is made of: the shared lines and that option's hotels. */
const linesOfOption = (lines, option) => lines.filter((line) => line.kind !== "HOTEL" || (line.option || 1) === option);

function supplierGstPct(db, supplierId) {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  return supplierCountry(db, supplier) === "India" ? PACKAGE_GST_PCT : 0;
}

export function findQuotation(db, supplierId, quotationId) {
  const row = db.prepare("SELECT * FROM quotations WHERE (id = ? OR ref = ?) AND supplier_id = ?").get(quotationId, quotationId, supplierId);
  if (!row) throw quotationError("Quotation not found", 404, "QUOTATION_NOT_FOUND");
  return row;
}

function lineView(row) {
  return {
    id: row.id, kind: row.kind, dayNumber: row.day_number, title: row.title, description: row.description || null, date: row.line_date || null,
    hotelId: row.hotel_id || null, roomType: row.room_type || null, mealPlan: row.meal_plan || null, nights: row.nights ?? null, rooms: row.rooms ?? null,
    extraAdults: Number(row.extra_adults || 0), productId: row.product_id || null, productOptionId: row.product_option_id || null,
    pickupTime: row.pickup_time || null, adults: row.adults ?? null, children: Number(row.children || 0), amountInr: row.amount_inr ?? null,
    serviceId: row.service_id || null, cabTypeId: row.cab_type_id || null, vehicles: row.vehicles ?? null,
    option: row.kind === "HOTEL" ? row.option_number || 1 : null,
    priceInr: Number(row.price_inr), bookingId: row.booking_id || null,
  };
}

/**
 * Checks that catch a wrong quotation before the customer sees it (ADR 042):
 * a line dated off its day, too few seats in the cabs, and a night of the trip
 * with no hotel when the package includes hotels.
 */
function quotationWarnings(db, row, lines, options = []) {
  const warnings = [];
  for (const line of lines) {
    if (line.date && line.kind !== "HOTEL" && line.date !== addDays(row.start_date, line.dayNumber - 1)) {
      warnings.push(`${line.title} is dated ${line.date}, which isn't day ${line.dayNumber} (${addDays(row.start_date, line.dayNumber - 1)}).`);
    }
    if (line.kind === "TRANSPORT" && line.cabTypeId) {
      const cab = db.prepare("SELECT name, seats FROM supplier_cab_types WHERE id = ?").get(line.cabTypeId);
      const people = Number(line.adults || 0) + Number(line.children || 0);
      if (cab && line.vehicles * cab.seats < people) warnings.push(`${line.title}: ${line.vehicles} × ${cab.name} seat ${line.vehicles * cab.seats}, but ${people} are travelling.`);
    }
  }
  const lastDay = Math.max(0, ...lines.map((line) => line.dayNumber));
  const optionList = options.length ? options : [{ number: 1, name: null }];
  for (const option of optionList) {
    const stays = lines.filter((line) => line.kind === "HOTEL" && line.date && line.option === option.number);
    if (!stays.length && !lines.some((line) => line.kind === "HOTEL")) continue;
    const covered = new Set();
    for (const stay of stays) for (let night = 0; night < stay.nights; night += 1) covered.add(daysBetween(row.start_date, stay.date) + night + 1);
    const missing = [];
    for (let day = 1; day < lastDay; day += 1) if (!covered.has(day)) missing.push(day);
    if (missing.length) warnings.push(`${option.name ? `${option.name}: n` : "N"}o hotel for the night of day ${missing.join(", ")}.`);
  }
  return warnings;
}

/** The full quotation for the supplier: header, priced lines, totals and payments. */
export function quotationView(db, row) {
  const lines = db.prepare("SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY day_number, sort_order").all(row.id).map(lineView);
  const payments = db.prepare("SELECT id, amount_inr, mode, reference, received_at FROM quotation_payments WHERE quotation_id = ? ORDER BY received_at, id").all(row.id);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount_inr), 0);
  const days = db.prepare("SELECT day_number, title, description FROM quotation_days WHERE quotation_id = ? ORDER BY day_number").all(row.id)
    .map((day) => ({ dayNumber: day.day_number, title: day.title || null, description: day.description || null }));
  const travelers = Number(row.adults) + Number(row.children);
  const perPerson = (total) => (travelers ? Math.ceil(total / travelers) : total);
  const optionRows = db.prepare("SELECT option_number, name FROM quotation_options WHERE quotation_id = ? ORDER BY option_number").all(row.id);
  const options = optionRows.length >= 2 ? optionRows.map((option) => {
    const totals = packageTotals(linesOfOption(lines, option.option_number).map((line) => ({ kind: line.kind, price: line.priceInr })), { markupPct: Number(row.markup_pct), gstPct: Number(row.gst_pct) });
    return {
      number: option.option_number, name: option.name,
      totals: { costInr: totals.cost_inr, listingsInr: totals.listings_inr, markupInr: totals.markup_inr, subtotalInr: totals.subtotal_inr, gstInr: totals.gst_inr, totalInr: totals.total_inr, perPersonInr: perPerson(totals.total_inr) },
    };
  }) : [];
  return {
    id: row.id, ref: row.ref, title: row.title, destination: row.destination || null, status: row.status,
    customerName: row.customer_name, customerEmail: row.customer_email || null, customerPhone: row.customer_phone || null, agentId: row.agent_id || null,
    startDate: row.start_date, adults: row.adults, children: row.children, markupPct: Number(row.markup_pct), notes: row.notes || null, validUntil: row.valid_until || null,
    totals: {
      costInr: row.cost_inr, listingsInr: row.listings_inr, markupInr: row.markup_inr, subtotalInr: row.subtotal_inr,
      gstPct: Number(row.gst_pct), gstInr: row.gst_inr, totalInr: row.total_inr, paidInr: paid, dueInr: Math.max(0, row.total_inr - paid),
      perPersonInr: perPerson(row.total_inr),
    },
    options, selectedOption: row.selected_option ?? null,
    lines, days, payments, warnings: quotationWarnings(db, row, lines, options),
    sentAt: row.sent_at || null, acceptedAt: row.accepted_at || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listQuotations(db, supplierId) {
  return db.prepare(`SELECT id, ref, title, destination, customer_name, start_date, status, total_inr, created_at, updated_at FROM quotations
    WHERE supplier_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 200`).all(supplierId)
    .map((row) => ({ id: row.id, ref: row.ref, title: row.title, destination: row.destination || null, customerName: row.customer_name, startDate: row.start_date, status: row.status, totalInr: row.total_inr, updatedAt: row.updated_at }));
}

/**
 * Past quotations to start a new one from (ADR 042): the same destination,
 * and the same number of days when given, newest first.
 */
export function suggestQuotations(db, supplierId, { destination = "", days = null } = {}) {
  const place = String(destination || "").trim().toLowerCase();
  const length = Number(days) || null;
  return db.prepare(`SELECT q.id, q.ref, q.title, q.destination, q.adults, q.children, q.status, q.total_inr, q.updated_at,
      (SELECT MAX(day_number) FROM quotation_lines WHERE quotation_id = q.id) AS days
    FROM quotations q WHERE q.supplier_id = ? AND (? = '' OR LOWER(COALESCE(q.destination, '')) LIKE ?)
    ORDER BY q.updated_at DESC LIMIT 100`).all(supplierId, place, `%${place}%`)
    .filter((row) => row.days && (!length || Number(row.days) === length))
    .slice(0, 8)
    .map((row) => ({ id: row.id, ref: row.ref, title: row.title, destination: row.destination || null, days: Number(row.days), adults: row.adults, children: row.children, status: row.status, totalInr: row.total_inr, updatedAt: row.updated_at }));
}

/** Creates or replaces a draft or sent quotation, pricing every line on the server. Accepted and declined ones are final. */
export function saveQuotation(db, supplierId, input, { actor = null, quotationId = null } = {}) {
  const data = quotationSchema.parse(input);
  if (data.agentId && !db.prepare("SELECT id FROM supplier_agents WHERE id = ? AND supplier_id = ?").get(data.agentId, supplierId)) {
    throw quotationError("Agent not found", 404, "AGENT_NOT_FOUND");
  }
  const optionCount = data.options.length >= 2 ? data.options.length : 1;
  const stray = data.lines.find((line) => line.kind === "HOTEL" && line.option > optionCount);
  if (stray) throw quotationError(`${stray.title} is in option ${stray.option}, but the quotation has ${optionCount === 1 ? "no options" : `${optionCount} options`}`, 400, "UNKNOWN_OPTION");
  const priced = data.lines.map((line) => ({ ...line, ...priceLine(db, supplierId, line, data) }));
  // Until the customer picks, the quotation's own totals are option 1's.
  const totals = packageTotals(linesOfOption(priced, 1), { markupPct: data.markupPct, gstPct: supplierGstPct(db, supplierId) });

  return db.transaction(() => {
    let id = quotationId;
    const header = [data.title, data.destination || null, data.customerName, data.customerEmail ? data.customerEmail.toLowerCase() : null, data.customerPhone || null, data.agentId || null,
      data.startDate, data.adults, data.children, data.markupPct, data.notes || null, data.validUntil || null,
      totals.cost_inr, totals.listings_inr, totals.markup_inr, totals.subtotal_inr, totals.gst_pct, totals.gst_inr, totals.total_inr];
    if (id) {
      const existing = findQuotation(db, supplierId, id);
      if (["ACCEPTED", "DECLINED"].includes(existing.status)) throw quotationError(`An ${existing.status.toLowerCase()} quotation can't be changed. Copy it instead.`, 409, "QUOTATION_FINAL");
      id = existing.id;
      db.prepare(`UPDATE quotations SET title = ?, destination = ?, customer_name = ?, customer_email = ?, customer_phone = ?, agent_id = ?, start_date = ?, adults = ?, children = ?,
          markup_pct = ?, notes = ?, valid_until = ?, cost_inr = ?, listings_inr = ?, markup_inr = ?, subtotal_inr = ?, gst_pct = ?, gst_inr = ?, total_inr = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(...header, id);
      db.prepare("DELETE FROM quotation_lines WHERE quotation_id = ?").run(id);
      db.prepare("DELETE FROM quotation_days WHERE quotation_id = ?").run(id);
      db.prepare("DELETE FROM quotation_options WHERE quotation_id = ?").run(id);
    } else {
      id = `qtn_${nanoid(12)}`;
      db.prepare(`INSERT INTO quotations (id, supplier_id, ref, title, destination, customer_name, customer_email, customer_phone, agent_id, start_date, adults, children,
          markup_pct, notes, valid_until, cost_inr, listings_inr, markup_inr, subtotal_inr, gst_pct, gst_inr, total_inr, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, supplierId, `Q-${quoteRef()}`, ...header, actor?.id || null);
    }
    const insert = db.prepare(`INSERT INTO quotation_lines (id, quotation_id, day_number, sort_order, kind, title, description, line_date, hotel_id, room_type, meal_plan,
        nights, rooms, extra_adults, product_id, product_option_id, pickup_time, adults, children, amount_inr, service_id, cab_type_id, vehicles, option_number, price_inr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    priced.forEach((line, index) => {
      const row = line.row;
      insert.run(`qln_${nanoid(12)}`, id, line.dayNumber, index, line.kind, line.title, line.description || null, row.line_date ?? null,
        row.hotel_id ?? null, row.room_type ?? null, row.meal_plan ?? null, row.nights ?? null, row.rooms ?? null, row.extra_adults ?? 0,
        row.product_id ?? null, row.product_option_id ?? null, row.pickup_time ?? null, row.adults ?? null, row.children ?? 0, row.amount_inr ?? null,
        row.service_id ?? null, row.cab_type_id ?? null, row.vehicles ?? null, row.option_number ?? null, line.price);
    });
    if (optionCount > 1) {
      const insertOption = db.prepare("INSERT INTO quotation_options (quotation_id, option_number, name) VALUES (?, ?, ?)");
      data.options.forEach((option, index) => insertOption.run(id, index + 1, option.name));
    }
    // Day text: what staff wrote, else the first rate-sheet service's day text for that day.
    const dayText = new Map(data.days.filter((day) => day.title || day.description).map((day) => [day.dayNumber, day]));
    for (const line of priced) {
      if (!line.service || dayText.has(line.dayNumber) || !(line.service.day_title || line.service.day_description)) continue;
      dayText.set(line.dayNumber, { title: line.service.day_title || null, description: line.service.day_description || null });
    }
    const insertDay = db.prepare("INSERT INTO quotation_days (quotation_id, day_number, title, description) VALUES (?, ?, ?, ?)");
    for (const [dayNumber, day] of dayText) insertDay.run(id, dayNumber, day.title || null, day.description || null);
    return quotationView(db, findQuotation(db, supplierId, id));
  })();
}

/** A line as saveQuotation takes it, moved by `shift` days. */
function lineInput(line, shift) {
  const move = (date) => (date ? addDays(date, shift) : date);
  const base = { kind: line.kind, dayNumber: line.dayNumber, title: line.title, description: line.description };
  if (line.kind === "HOTEL") return { ...base, option: line.option || 1, hotelId: line.hotelId, roomType: line.roomType, mealPlan: line.mealPlan, checkIn: move(line.date), nights: line.nights, rooms: line.rooms, extraAdults: line.extraAdults, children: line.children };
  if (line.kind === "LISTING") return { ...base, productId: line.productId, productOptionId: line.productOptionId, date: move(line.date), pickupTime: line.pickupTime, adults: line.adults, children: line.children };
  if (line.kind === "TRANSPORT") return { ...base, serviceId: line.serviceId, cabTypeId: line.cabTypeId, date: move(line.date), vehicles: line.vehicles, adults: line.adults, children: line.children };
  if (line.kind === "ACTIVITY") return { ...base, serviceId: line.serviceId, date: move(line.date), adults: line.adults, children: line.children };
  return { ...base, date: move(line.date), amountInr: line.amountInr };
}

export const copyQuotationSchema = z.object({
  startDate: isoDate,
  customerName: z.string().trim().min(2).max(120).optional(),
  customerEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  customerPhone: z.string().trim().max(24).optional().nullable(),
}).strict();

/**
 * A new draft from any past quotation (ADR 042): the same days, services and
 * markup, moved to the new start date and priced again at that date's rates.
 * Payments, bookings and the status are not copied.
 */
export function copyQuotation(db, supplierId, quotationId, input, { actor = null } = {}) {
  const options = copyQuotationSchema.parse(input);
  const source = quotationView(db, findQuotation(db, supplierId, quotationId));
  const shift = daysBetween(source.startDate, options.startDate);
  return saveQuotation(db, supplierId, {
    title: source.title, destination: source.destination, customerName: options.customerName || source.customerName,
    customerEmail: options.customerName ? options.customerEmail || null : source.customerEmail,
    customerPhone: options.customerName ? options.customerPhone || null : source.customerPhone,
    agentId: source.agentId, startDate: options.startDate, adults: source.adults, children: source.children, markupPct: source.markupPct,
    notes: source.notes, validUntil: null, lines: source.lines.map((line) => lineInput(line, shift)),
    days: source.days, options: source.options.map((option) => ({ name: option.name })),
  }, { actor });
}

/** DRAFT → SENT → ACCEPTED or DECLINED; a sent quotation may go back to draft for changes by saving it. */
export function setQuotationStatus(db, supplierId, quotationId, status, { option = null } = {}) {
  if (!STATUSES.includes(status)) throw quotationError("Unknown status", 400, "INVALID_STATUS");
  const row = findQuotation(db, supplierId, quotationId);
  const allowed = { DRAFT: ["SENT"], SENT: ["ACCEPTED", "DECLINED", "SENT"], ACCEPTED: [], DECLINED: [] }[row.status];
  if (!allowed.includes(status)) throw quotationError(`A ${row.status.toLowerCase()} quotation can't become ${status.toLowerCase()}`, 409, "INVALID_TRANSITION");
  // Accepting a quotation with hotel options records the customer's choice, whose totals become the quotation's (ADR 043).
  let chosen = null;
  if (status === "ACCEPTED") {
    const { options } = quotationView(db, row);
    if (options.length) {
      chosen = options.find((item) => item.number === Number(option));
      if (!chosen) throw quotationError(`Choose which option the customer accepted (1–${options.length})`, 400, "OPTION_REQUIRED");
    }
  }
  const stamp = status === "SENT" ? ", sent_at = CURRENT_TIMESTAMP" : status === "ACCEPTED" ? ", accepted_at = CURRENT_TIMESTAMP" : "";
  db.transaction(() => {
    if (chosen) {
      const totals = chosen.totals;
      db.prepare(`UPDATE quotations SET selected_option = ?, cost_inr = ?, listings_inr = ?, markup_inr = ?, subtotal_inr = ?, gst_inr = ?, total_inr = ? WHERE id = ?`)
        .run(chosen.number, totals.costInr, totals.listingsInr, totals.markupInr, totals.subtotalInr, totals.gstInr, totals.totalInr, row.id);
    }
    db.prepare(`UPDATE quotations SET status = ?, updated_at = CURRENT_TIMESTAMP${stamp} WHERE id = ?`).run(status, row.id);
  })();
  return quotationView(db, findQuotation(db, supplierId, row.id));
}

export function recordQuotationPayment(db, { supplierId, quotationId, actor, input }) {
  const payment = quotationPaymentSchema.parse(input);
  const row = findQuotation(db, supplierId, quotationId);
  if (row.status !== "ACCEPTED") throw quotationError("Record payments once the quotation is accepted", 409, "NOT_ACCEPTED");
  const view = quotationView(db, row);
  if (payment.amount_inr > view.totals.dueInr) throw quotationError(`Only INR ${view.totals.dueInr} is still due`, 400, "OVERPAYMENT");
  db.prepare("INSERT INTO quotation_payments (id, quotation_id, amount_inr, mode, reference, received_by) VALUES (?, ?, ?, ?, ?, ?)")
    .run(`qpay_${nanoid(12)}`, row.id, payment.amount_inr, payment.mode, payment.reference || null, actor?.id || null);
  return quotationView(db, findQuotation(db, supplierId, row.id));
}

/**
 * Books one listing line of an accepted quotation on the shared inventory,
 * checking seats now. The booking holds the seats and records the line's share
 * of the package; the customer's money is tracked on the quotation.
 */
export function bookQuotationLine(db, { supplierId, quotationId, lineId, actor }) {
  const row = findQuotation(db, supplierId, quotationId);
  if (row.status !== "ACCEPTED") throw quotationError("Mark the quotation accepted before booking", 409, "NOT_ACCEPTED");
  const line = db.prepare("SELECT * FROM quotation_lines WHERE id = ? AND quotation_id = ?").get(lineId, row.id);
  if (!line) throw quotationError("Line not found", 404, "LINE_NOT_FOUND");
  if (line.kind !== "LISTING") throw quotationError("Only listing lines are booked here; hotels, cars and activities are arranged by you", 409, "NOT_A_LISTING");
  if (line.booking_id) throw quotationError("This line is already booked", 409, "ALREADY_BOOKED");
  if (!row.customer_phone) throw quotationError("Add the customer's phone number before booking", 409, "PHONE_REQUIRED");

  const { booking } = createSupplierBooking(db, {
    supplierId, actor,
    input: {
      source: "MANUAL", product_id: line.product_id, product_option_id: line.product_option_id || null,
      activity_date: line.line_date, pickup_time: line.pickup_time || null, adults: line.adults, children: line.children || 0,
      traveler_name: row.customer_name, traveler_phone: row.customer_phone, traveler_email: row.customer_email || null,
      special_requests: `Package ${row.ref}`, client_request_id: `quotation-line-${line.id}`,
    },
    packageLine: { quotationId: row.id, priceInr: Number(line.price_inr) },
  });
  db.prepare("UPDATE quotation_lines SET booking_id = ? WHERE id = ?").run(booking.id, line.id);
  return { booking, quotation: quotationView(db, findQuotation(db, supplierId, row.id)) };
}

// --- Share link: signed, no database lookup of a secret (same scheme as voucher links) ---

const secret = () => process.env.DOCUMENT_LINK_SECRET || process.env.OTP_SECRET || process.env.JWT_SECRET || "idea-holiday-local-document-secret-change-me";
const sign = (payload) => crypto.createHmac("sha256", secret()).update(`quotation:${payload}`).digest("base64url");

export function createQuotationToken(quotation, { expiresInSeconds = 60 * 24 * 60 * 60 } = {}, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ q: quotation.id, exp: Math.floor(now / 1000) + expiresInSeconds })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The quotation id a share token names, or null when it is forged or expired. */
export function verifyQuotationToken(token, now = Date.now()) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) >= Math.floor(now / 1000) ? data.q : null;
  } catch {
    return null;
  }
}

/** A link anyone can open to download the PDF, like a voucher link. */
export function quotationShareUrl(quotation, baseUrl = null) {
  const configured = String(baseUrl || process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  const base = configured || (process.env.NODE_ENV === "production" ? "https://ideaholiday.in" : "http://localhost:8080");
  return `${base}/api/quotations/share/${encodeURIComponent(createQuotationToken(quotation))}`;
}
