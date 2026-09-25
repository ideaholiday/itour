import crypto from "node:crypto";
import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";
import { calculateBookingQuote } from "./bookingService.js";
import { hotelStayCost, MEAL_PLANS } from "./supplierHotelService.js";
import { createSupplierBooking } from "./supplierBookingService.js";
import { supplierCountry } from "./supplierVerificationService.js";
import { DIRECT_PAYMENT_MODES } from "../lib/bookingSources.js";

/**
 * Package quotations (ADR 040, docs/SUPPLIER_OPERATIONS.md).
 *
 * A quotation mixes hotel nights from the supplier's rate sheet, the supplier's
 * own listings and custom lines, day by day. The server prices every line:
 *   hotel and custom lines are the supplier's cost and carry markup_pct;
 *   listings enter at their own pre-tax price;
 *   an Indian supplier adds 5% GST on the package (tour-operator rate).
 * The customer sees one package price. When the quotation is accepted, each
 * listing line can be booked: the booking holds the seats and records the
 * line's share of the package, and the customer's money is tracked here.
 */

export const PACKAGE_GST_PCT = 5;
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED"];
const quoteRef = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const quotationError = (message, status = 400, code = "INVALID_QUOTATION") => Object.assign(new Error(message), { status, code });

const lineBase = { dayNumber: z.number().int().min(1).max(60).default(1), title: z.string().trim().min(1).max(160), description: z.string().trim().max(1000).optional().nullable() };
const lineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("HOTEL"), ...lineBase,
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
]);

export const quotationSchema = z.object({
  title: z.string().trim().min(2).max(160),
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
}).strict();

export const quotationPaymentSchema = z.object({
  mode: z.enum(DIRECT_PAYMENT_MODES),
  amount_inr: z.number().int().positive().max(100_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
}).strict();

const money = (value) => Math.round(Number(value || 0));

/** The line's price: hotel and custom at cost, listing at its pre-tax price, all worked out on the server. */
function priceLine(db, supplierId, line) {
  if (line.kind === "HOTEL") {
    const stay = hotelStayCost(db, supplierId, line);
    return { price: stay.costInr, row: { line_date: line.checkIn, hotel_id: line.hotelId, room_type: line.roomType, meal_plan: line.mealPlan, nights: line.nights, rooms: line.rooms, extra_adults: line.extraAdults, children: line.children } };
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
  return { price: money(line.amountInr), row: { line_date: line.date || null, amount_inr: line.amountInr } };
}

/** Package totals from priced lines: markup on cost lines, listings as they are, 5% GST for an Indian supplier. */
export function packageTotals(lines, { markupPct, gstPct }) {
  const cost = lines.filter((line) => line.kind !== "LISTING").reduce((sum, line) => sum + line.price, 0);
  const listings = lines.filter((line) => line.kind === "LISTING").reduce((sum, line) => sum + line.price, 0);
  const markup = money((cost * markupPct) / 100);
  const subtotal = cost + markup + listings;
  const gst = money((subtotal * gstPct) / 100);
  return { cost_inr: cost, listings_inr: listings, markup_inr: markup, subtotal_inr: subtotal, gst_pct: gstPct, gst_inr: gst, total_inr: subtotal + gst };
}

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
    priceInr: Number(row.price_inr), bookingId: row.booking_id || null,
  };
}

/** The full quotation for the supplier: header, priced lines, totals and payments. */
export function quotationView(db, row) {
  const lines = db.prepare("SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY day_number, sort_order").all(row.id).map(lineView);
  const payments = db.prepare("SELECT id, amount_inr, mode, reference, received_at FROM quotation_payments WHERE quotation_id = ? ORDER BY received_at, id").all(row.id);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount_inr), 0);
  return {
    id: row.id, ref: row.ref, title: row.title, status: row.status,
    customerName: row.customer_name, customerEmail: row.customer_email || null, customerPhone: row.customer_phone || null, agentId: row.agent_id || null,
    startDate: row.start_date, adults: row.adults, children: row.children, markupPct: Number(row.markup_pct), notes: row.notes || null, validUntil: row.valid_until || null,
    totals: {
      costInr: row.cost_inr, listingsInr: row.listings_inr, markupInr: row.markup_inr, subtotalInr: row.subtotal_inr,
      gstPct: Number(row.gst_pct), gstInr: row.gst_inr, totalInr: row.total_inr, paidInr: paid, dueInr: Math.max(0, row.total_inr - paid),
    },
    lines, payments,
    sentAt: row.sent_at || null, acceptedAt: row.accepted_at || null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listQuotations(db, supplierId) {
  return db.prepare(`SELECT id, ref, title, customer_name, start_date, status, total_inr, created_at, updated_at FROM quotations
    WHERE supplier_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 200`).all(supplierId)
    .map((row) => ({ id: row.id, ref: row.ref, title: row.title, customerName: row.customer_name, startDate: row.start_date, status: row.status, totalInr: row.total_inr, updatedAt: row.updated_at }));
}

/** Creates or replaces a draft or sent quotation, pricing every line on the server. Accepted and declined ones are final. */
export function saveQuotation(db, supplierId, input, { actor = null, quotationId = null } = {}) {
  const data = quotationSchema.parse(input);
  if (data.agentId && !db.prepare("SELECT id FROM supplier_agents WHERE id = ? AND supplier_id = ?").get(data.agentId, supplierId)) {
    throw quotationError("Agent not found", 404, "AGENT_NOT_FOUND");
  }
  const priced = data.lines.map((line) => ({ ...line, ...priceLine(db, supplierId, line) }));
  const totals = packageTotals(priced, { markupPct: data.markupPct, gstPct: supplierGstPct(db, supplierId) });

  return db.transaction(() => {
    let id = quotationId;
    const header = [data.title, data.customerName, data.customerEmail ? data.customerEmail.toLowerCase() : null, data.customerPhone || null, data.agentId || null,
      data.startDate, data.adults, data.children, data.markupPct, data.notes || null, data.validUntil || null,
      totals.cost_inr, totals.listings_inr, totals.markup_inr, totals.subtotal_inr, totals.gst_pct, totals.gst_inr, totals.total_inr];
    if (id) {
      const existing = findQuotation(db, supplierId, id);
      if (["ACCEPTED", "DECLINED"].includes(existing.status)) throw quotationError(`An ${existing.status.toLowerCase()} quotation can't be changed. Copy it instead.`, 409, "QUOTATION_FINAL");
      id = existing.id;
      db.prepare(`UPDATE quotations SET title = ?, customer_name = ?, customer_email = ?, customer_phone = ?, agent_id = ?, start_date = ?, adults = ?, children = ?,
          markup_pct = ?, notes = ?, valid_until = ?, cost_inr = ?, listings_inr = ?, markup_inr = ?, subtotal_inr = ?, gst_pct = ?, gst_inr = ?, total_inr = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`).run(...header, id);
      db.prepare("DELETE FROM quotation_lines WHERE quotation_id = ?").run(id);
    } else {
      id = `qtn_${nanoid(12)}`;
      db.prepare(`INSERT INTO quotations (id, supplier_id, ref, title, customer_name, customer_email, customer_phone, agent_id, start_date, adults, children,
          markup_pct, notes, valid_until, cost_inr, listings_inr, markup_inr, subtotal_inr, gst_pct, gst_inr, total_inr, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, supplierId, `Q-${quoteRef()}`, ...header, actor?.id || null);
    }
    const insert = db.prepare(`INSERT INTO quotation_lines (id, quotation_id, day_number, sort_order, kind, title, description, line_date, hotel_id, room_type, meal_plan,
        nights, rooms, extra_adults, product_id, product_option_id, pickup_time, adults, children, amount_inr, price_inr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    priced.forEach((line, index) => {
      const row = line.row;
      insert.run(`qln_${nanoid(12)}`, id, line.dayNumber, index, line.kind, line.title, line.description || null, row.line_date ?? null,
        row.hotel_id ?? null, row.room_type ?? null, row.meal_plan ?? null, row.nights ?? null, row.rooms ?? null, row.extra_adults ?? 0,
        row.product_id ?? null, row.product_option_id ?? null, row.pickup_time ?? null, row.adults ?? null, row.children ?? 0, row.amount_inr ?? null, line.price);
    });
    return quotationView(db, findQuotation(db, supplierId, id));
  })();
}

/** DRAFT → SENT → ACCEPTED or DECLINED; a sent quotation may go back to draft for changes by saving it. */
export function setQuotationStatus(db, supplierId, quotationId, status) {
  if (!STATUSES.includes(status)) throw quotationError("Unknown status", 400, "INVALID_STATUS");
  const row = findQuotation(db, supplierId, quotationId);
  const allowed = { DRAFT: ["SENT"], SENT: ["ACCEPTED", "DECLINED", "SENT"], ACCEPTED: [], DECLINED: [] }[row.status];
  if (!allowed.includes(status)) throw quotationError(`A ${row.status.toLowerCase()} quotation can't become ${status.toLowerCase()}`, 409, "INVALID_TRANSITION");
  const stamp = status === "SENT" ? ", sent_at = CURRENT_TIMESTAMP" : status === "ACCEPTED" ? ", accepted_at = CURRENT_TIMESTAMP" : "";
  db.prepare(`UPDATE quotations SET status = ?, updated_at = CURRENT_TIMESTAMP${stamp} WHERE id = ?`).run(status, row.id);
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
  if (line.kind !== "LISTING") throw quotationError("Only listing lines are booked here; book hotels with the hotel", 409, "NOT_A_LISTING");
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
