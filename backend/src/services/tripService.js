import { nanoid } from "nanoid";
import { z } from "zod";
import { DIRECT_PAYMENT_MODES } from "../lib/bookingSources.js";
import { expiredFleetDocument, unavailableFleetStatuses } from "./driverDispatchService.js";
import { sendEmail } from "./emailService.js";
import { findQuotation, itineraryShareUrl, quotationView } from "./quotationService.js";
import { itineraryPdf } from "./tripItineraryPdfService.js";
import { findHotel } from "./supplierHotelService.js";

/**
 * Running a trip after its quotation is accepted (ADR 045, docs/SUPPLIER_OPERATIONS.md).
 *
 * Each arranged line (the chosen option's hotels, cars, activities, custom
 * lines) goes TO_BOOK → REQUESTED → CONFIRMED, or CANCELLED, with the vendor,
 * the confirmation number and what the operator owes. Hotels get a booking
 * request by email; cars get drivers from the supplier's fleet, never two trips
 * at once; vendor payments are recorded per line. Listing lines are bookings
 * already and are booked from the quotation (ADR 040).
 */

export const ARRANGEMENT_STATUSES = Object.freeze(["TO_BOOK", "REQUESTED", "CONFIRMED", "CANCELLED"]);
const MEAL_PLANS = { EP: "room only", CP: "breakfast", MAP: "breakfast and dinner", AP: "all meals" };
const tripError = (message, status = 400, code = "INVALID_TRIP") => Object.assign(new Error(message), { status, code });

export const arrangementSchema = z.object({
  status: z.enum(ARRANGEMENT_STATUSES).optional(),
  vendorName: z.string().trim().max(160).optional().nullable(),
  confirmationRef: z.string().trim().max(80).optional().nullable(),
  payableInr: z.number().int().min(0).max(100_000_000).optional().nullable(),
  driverIds: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
}).strict();

export const vendorPaymentSchema = z.object({
  mode: z.enum(DIRECT_PAYMENT_MODES),
  amount_inr: z.number().int().positive().max(100_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
}).strict();

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
const longDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** The last day a car line uses its car. */
const carEnd = (line) => addDays(line.date, Math.max(1, Number(line.carDays || line.car_days || 1)) - 1);

/** An accepted quotation and one of its arranged lines, or an error saying why not. */
function arrangedLine(db, supplierId, quotationId, lineId) {
  const row = findQuotation(db, supplierId, quotationId);
  if (row.status !== "ACCEPTED") throw tripError("Arrange the trip once the quotation is accepted", 409, "NOT_ACCEPTED");
  const view = quotationView(db, row);
  const line = view.lines.find((item) => item.id === lineId);
  if (!line) throw tripError("Line not found", 404, "LINE_NOT_FOUND");
  if (!line.arranged) {
    throw tripError(line.kind === "LISTING" ? "Listing lines are booked with Book now" : "This hotel belongs to an option the customer didn't choose", 409, "NOT_ARRANGED");
  }
  return { row, view, line };
}

/** Drivers for a car line: the supplier's, available, papers valid, and on no other trip those days (ADR 045). */
function checkDrivers(db, supplierId, line, driverIds) {
  if (line.kind !== "TRANSPORT") throw tripError("Only car lines get drivers", 400, "NOT_A_CAR");
  const unique = [...new Set(driverIds)];
  if (unique.length > Number(line.vehicles || 1)) throw tripError(`This line has ${line.vehicles} car${line.vehicles === 1 ? "" : "s"}; choose up to that many drivers`, 400, "TOO_MANY_DRIVERS");
  const from = line.date;
  const to = carEnd(line);
  for (const driverId of unique) {
    const driver = db.prepare("SELECT * FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(driverId, supplierId);
    if (!driver) throw tripError("Driver not found", 404, "DRIVER_NOT_FOUND");
    if (unavailableFleetStatuses.has(String(driver.status || "AVAILABLE").toUpperCase())) throw tripError(`${driver.driver_name} is marked ${String(driver.status).toLowerCase()}`, 409, "DRIVER_UNAVAILABLE");
    const expired = expiredFleetDocument(driver, to);
    if (expired) throw tripError(`${driver.driver_name}: ${expired}`, 409, "FLEET_DOCUMENT_EXPIRED");

    const trips = db.prepare(`SELECT l.id, l.line_date, l.car_days, l.driver_ids, q.ref FROM quotation_lines l JOIN quotations q ON q.id = l.quotation_id
      WHERE q.supplier_id = ? AND q.status = 'ACCEPTED' AND l.kind = 'TRANSPORT' AND l.id != ? AND l.driver_ids IS NOT NULL
        AND COALESCE(l.arrangement_status, '') != 'CANCELLED' AND l.line_date <= ?`).all(supplierId, line.id, to);
    const clash = trips.find((trip) => trip.driver_ids.split(",").includes(driverId) && carEnd({ date: trip.line_date, car_days: trip.car_days }) >= from);
    if (clash) throw tripError(`${driver.driver_name} is already on ${clash.ref} from ${clash.line_date}`, 409, "DRIVER_BUSY");
    const booking = db.prepare(`SELECT b.ref, b.activity_date FROM driver_assignments a JOIN bookings b ON b.id = a.booking_id
      WHERE a.supplier_driver_id = ? AND b.activity_date BETWEEN ? AND ? AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'completed')
        AND UPPER(COALESCE(a.assignment_status, '')) != 'COMPLETED' LIMIT 1`).get(driverId, from, to);
    if (booking) throw tripError(`${driver.driver_name} is driving booking ${booking.ref} on ${booking.activity_date}`, 409, "DRIVER_BUSY");
  }
  return unique;
}

/** Sets an arranged line's status, vendor, confirmation, what is owed and, for cars, the drivers. */
export function updateArrangement(db, { supplierId, quotationId, lineId, input }) {
  const change = arrangementSchema.parse(input);
  const { row, line } = arrangedLine(db, supplierId, quotationId, lineId);
  const sets = [];
  const values = [];
  const set = (column, value) => { sets.push(`${column} = ?`); values.push(value); };
  if (change.status) {
    set("arrangement_status", change.status === "TO_BOOK" ? null : change.status);
    if (change.status === "REQUESTED" && !line.requestedAt) set("requested_at", new Date().toISOString());
    if (change.status === "CONFIRMED") set("confirmed_at", new Date().toISOString());
  }
  if (change.vendorName !== undefined) set("vendor_name", change.vendorName || null);
  if (change.confirmationRef !== undefined) set("confirmation_ref", change.confirmationRef || null);
  if (change.payableInr !== undefined) set("payable_inr", change.payableInr);
  if (change.driverIds !== undefined) set("driver_ids", checkDrivers(db, supplierId, line, change.driverIds).join(",") || null);
  if (sets.length) db.prepare(`UPDATE quotation_lines SET ${sets.join(", ")} WHERE id = ?`).run(...values, line.id);
  return quotationView(db, findQuotation(db, supplierId, row.id));
}

/** The booking request a hotel receives: the guest, the dates, the rooms, and who to reply to. */
export function hotelRequestEmail({ quotation, line, hotel, supplier }) {
  const checkOut = addDays(line.date, line.nights);
  const guests = `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`;
  const contact = [supplier.contact_name, supplier.phone, supplier.email].filter(Boolean).join(" · ");
  const text = [
    `Dear ${hotel.name} reservations,`,
    "",
    "Please confirm this booking for our guest:",
    "",
    `Guest: ${quotation.customerName}`,
    `Check-in: ${longDate(line.date)}`,
    `Check-out: ${longDate(checkOut)} (${line.nights} night${line.nights === 1 ? "" : "s"})`,
    `Rooms: ${line.rooms} × ${line.roomType}, ${MEAL_PLANS[line.mealPlan] || line.mealPlan}`,
    `Guests: ${guests}${line.extraAdults ? ` (${line.extraAdults} extra adult bed${line.extraAdults === 1 ? "" : "s"})` : ""}`,
    `Our reference: ${quotation.ref}`,
    "",
    "Please reply with your confirmation number.",
    "",
    supplier.company_name || "",
    contact,
  ].join("\n").trim();
  return { subject: `Booking request ${quotation.ref}: ${quotation.customerName}, ${line.date} to ${checkOut}`, text };
}

/** Emails a hotel line's booking request. The line becomes REQUESTED only when the email goes out. */
export async function requestHotelBooking(db, { supplierId, quotationId, lineId }) {
  const { row, view, line } = arrangedLine(db, supplierId, quotationId, lineId);
  if (line.kind !== "HOTEL") throw tripError("Booking requests are emailed to hotels", 400, "NOT_A_HOTEL");
  if (["CONFIRMED", "CANCELLED"].includes(line.arrangementStatus)) throw tripError(`This stay is already ${line.arrangementStatus.toLowerCase()}`, 409, "ALREADY_ARRANGED");
  const hotel = findHotel(db, supplierId, line.hotelId);
  if (!hotel.email) throw tripError(`Add ${hotel.name}'s email on the hotel rate sheet first`, 409, "HOTEL_EMAIL_MISSING");
  const supplier = db.prepare("SELECT company_name, contact_name, phone, email FROM suppliers WHERE id = ?").get(supplierId) || {};
  const { subject, text } = hotelRequestEmail({ quotation: view, line, hotel, supplier });
  const email = await sendEmail({
    to: hotel.email, recipientName: hotel.name, recipientRole: "HOTEL", eventType: "HOTEL_BOOKING_REQUEST",
    eventKey: `hotel-request:${line.id}:${Date.now()}`, subject, text, metadata: { quotationId: row.id, lineId: line.id },
  });
  if (email.success) {
    db.prepare(`UPDATE quotation_lines SET arrangement_status = 'REQUESTED', requested_at = ?, vendor_name = COALESCE(vendor_name, ?) WHERE id = ?`)
      .run(new Date().toISOString(), hotel.name, line.id);
  }
  return { email: { status: email.status, error: email.error || null }, quotation: quotationView(db, findQuotation(db, supplierId, row.id)) };
}

/** Records a payment the operator made to a vendor for an arranged line, never more than is owed. */
export function recordVendorPayment(db, { supplierId, quotationId, lineId, actor, input }) {
  const payment = vendorPaymentSchema.parse(input);
  const { row, line } = arrangedLine(db, supplierId, quotationId, lineId);
  const due = Math.max(0, line.payableInr - line.vendorPaidInr);
  if (payment.amount_inr > due) throw tripError(`Only INR ${due} is owed on ${line.title}`, 400, "OVERPAYMENT");
  db.prepare("INSERT INTO quotation_vendor_payments (id, quotation_id, line_id, amount_inr, mode, reference, paid_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(`qvp_${nanoid(12)}`, row.id, line.id, payment.amount_inr, payment.mode, payment.reference || null, actor?.id || null);
  return quotationView(db, findQuotation(db, supplierId, row.id));
}

/**
 * Car lines of accepted trips that use a car on any day from `from` for
 * `days` days (1 to 14), with their drivers, and the fleet to choose from.
 */
export function carSchedule(db, supplierId, { from, days = 7 }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))) throw tripError("Choose a date as YYYY-MM-DD", 400, "VALIDATION_ERROR");
  const span = Math.min(Math.max(Number.parseInt(days, 10) || 7, 1), 14);
  const to = addDays(from, span - 1);
  const fleet = db.prepare("SELECT id, driver_name, driver_phone, vehicle_model, vehicle_number, seat_capacity, status FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name").all(supplierId)
    .map((driver) => ({ id: driver.id, name: driver.driver_name, phone: driver.driver_phone, vehicleModel: driver.vehicle_model, vehicleNumber: driver.vehicle_number, seats: Number(driver.seat_capacity || 0), status: driver.status || "AVAILABLE" }));
  const drivers = new Map(fleet.map((driver) => [driver.id, driver]));
  const rows = db.prepare(`SELECT l.*, q.id AS q_id, q.ref, q.customer_name, q.customer_phone, q.adults AS q_adults, q.children AS q_children,
      s.name AS service_name, s.start_time, s.from_place, s.to_place, c.name AS cab_name, c.seats AS cab_seats
    FROM quotation_lines l JOIN quotations q ON q.id = l.quotation_id
    LEFT JOIN supplier_services s ON s.id = l.service_id LEFT JOIN supplier_cab_types c ON c.id = l.cab_type_id
    WHERE q.supplier_id = ? AND q.status = 'ACCEPTED' AND l.kind = 'TRANSPORT' AND COALESCE(l.arrangement_status, '') != 'CANCELLED'
      AND l.line_date <= ? AND l.line_date >= ? ORDER BY l.line_date, s.start_time, q.ref`).all(supplierId, to, addDays(from, -60));
  const cars = rows.filter((row) => carEnd({ date: row.line_date, car_days: row.car_days }) >= from).map((row) => ({
    quotationId: row.q_id, ref: row.ref, customerName: row.customer_name, customerPhone: row.customer_phone || null,
    lineId: row.id, title: row.title, date: row.line_date, endDate: carEnd({ date: row.line_date, car_days: row.car_days }), carDays: row.car_days || 1, km: row.km ?? null,
    startTime: row.start_time || null, fromPlace: row.from_place || null, toPlace: row.to_place || null,
    cabType: row.cab_name || null, seats: row.cab_seats ?? null, vehicles: row.vehicles || 1, travelers: Number(row.adults ?? row.q_adults) + Number(row.children ?? row.q_children ?? 0),
    status: row.arrangement_status || "TO_BOOK", confirmationRef: row.confirmation_ref || null,
    drivers: (row.driver_ids ? row.driver_ids.split(",") : []).map((id) => drivers.get(id)).filter(Boolean),
  }));
  return { from, to, days: span, cars, fleet };
}

/**
 * Sends the customer the final itinerary: the PDF by email when there is an
 * address, and a link and WhatsApp message either way. Refused until every
 * arranged line is confirmed (or cancelled) and every listing line is booked.
 */
export async function sendItinerary(db, { supplierId, quotationId, email: sendByEmail = true }) {
  const row = findQuotation(db, supplierId, quotationId);
  if (row.status !== "ACCEPTED") throw tripError("Send the itinerary once the quotation is accepted", 409, "NOT_ACCEPTED");
  const view = quotationView(db, row);
  const open = view.lines.filter((line) => (line.arranged ? !["CONFIRMED", "CANCELLED"].includes(line.arrangementStatus) : line.kind === "LISTING" && !line.bookingId));
  if (open.length) throw tripError(`Confirm these first: ${open.map((line) => line.title).join(", ")}`, 409, "NOT_ALL_CONFIRMED");
  const supplier = db.prepare("SELECT company_name FROM suppliers WHERE id = ?").get(supplierId);
  const shareUrl = itineraryShareUrl(row);
  const message = `Hello ${row.customer_name},\n\nYour trip ${row.title} (${row.ref}) is confirmed. Here is your itinerary with hotel confirmations and driver details:\n\n${shareUrl}\n\n${supplier?.company_name || ""}`.trim();
  let email = { status: "SKIPPED", error: "No customer email on the quotation" };
  if (sendByEmail && row.customer_email) {
    const { buffer, filename } = await itineraryPdf(db, supplierId, row.id);
    email = await sendEmail({
      to: row.customer_email, recipientName: row.customer_name, recipientRole: "TRAVELER", eventType: "TRIP_ITINERARY_SENT",
      eventKey: `itinerary:${row.id}:${Date.now()}`, subject: `Your itinerary ${row.ref}: ${row.title}`, text: message,
      metadata: { quotationId: row.id, ref: row.ref }, attachments: [{ name: filename, contentBase64: buffer.toString("base64") }],
    });
  }
  return { shareUrl, whatsappText: message, email: { status: email.status, error: email.error || null }, quotation: view };
}
