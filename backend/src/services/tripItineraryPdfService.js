import PDFDocument from "pdfkit";
import { findQuotation, quotationView } from "./quotationService.js";
import { listHotels } from "./supplierHotelService.js";
import { listCabTypes, listServices } from "./supplierRateSheetService.js";

/**
 * The customer's final itinerary (ADR 045): the trip day by day with hotel
 * confirmation numbers, each day's car and driver, booking references, what is
 * paid and due, and who to call. Cancelled lines and hotels of options the
 * customer didn't choose are left out. Amounts read "INR" (no rupee sign in the
 * built-in fonts).
 */

const MEAL_PLANS = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast and dinner", AP: "All meals" };
const inr = (value) => `INR ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const INK = "#17233a";
const MUTED = "#667085";
const ACCENT = "#c27900";

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
const longDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One line of the itinerary: what it is, then details such as the confirmation and the driver. */
function itineraryEntry(line, { hotels, cabs, drivers, bookingRefs, services }) {
  const details = [];
  let heading = line.title;
  if (line.kind === "HOTEL") {
    const hotel = hotels.get(line.hotelId);
    heading = `Stay: ${hotel?.name || line.title}`;
    details.push(`${line.rooms} × ${line.roomType}, ${MEAL_PLANS[line.mealPlan] || line.mealPlan}. Check-in ${longDate(line.date)}, check-out ${longDate(addDays(line.date, line.nights))}.`);
    if (hotel?.phone) details.push(`Hotel phone: ${hotel.phone}`);
  }
  if (line.kind === "TRANSPORT") {
    const cab = cabs.get(line.cabTypeId);
    const pickup = services.get(line.serviceId)?.startTime;
    heading = [line.title, cab ? `${line.vehicles > 1 ? `${line.vehicles} × ` : ""}${cab.name}` : null, line.carDays > 1 ? `${line.carDays} days` : null, pickup ? `pickup ${pickup}` : null].filter(Boolean).join(" · ");
    for (const id of line.driverIds) {
      const driver = drivers.get(id);
      if (driver) details.push(`Driver: ${driver.driver_name}, ${driver.driver_phone} · ${driver.vehicle_model} ${driver.vehicle_number}`);
    }
  }
  if (line.kind === "ACTIVITY") details.push(`${line.adults} adult${line.adults === 1 ? "" : "s"}${line.children ? `, ${line.children} child${line.children === 1 ? "" : "ren"}` : ""}`);
  if (line.kind === "LISTING") {
    if (line.pickupTime) heading += ` at ${line.pickupTime}`;
    if (bookingRefs.get(line.bookingId)) details.push(`Booking ${bookingRefs.get(line.bookingId)}`);
  }
  if (line.confirmationRef) details.push(`Confirmation: ${line.confirmationRef}`);
  if (line.description) details.push(line.description);
  return { heading, details };
}

/** Renders the final itinerary to a PDF Buffer. */
export function renderItineraryPdf({ quotation, supplier, hotels = [], cabTypes = [], services = [], drivers = [], bookingRefs = new Map() }) {
  const context = { services: new Map(services.map((service) => [service.id, service])), hotels: new Map(hotels.map((hotel) => [hotel.id, hotel])), cabs: new Map(cabTypes.map((cab) => [cab.id, cab])), drivers: new Map(drivers.map((driver) => [driver.id, driver])), bookingRefs };
  const lines = quotation.lines.filter((line) => (line.arranged ? line.arrangementStatus !== "CANCELLED" : line.kind === "LISTING"));
  const dayText = new Map((quotation.days || []).map((day) => [day.dayNumber, day]));
  const days = [...new Set([...lines.map((line) => line.dayNumber), ...dayText.keys()])].sort((a, b) => a - b);
  const lastDay = days.length ? days[days.length - 1] : 1;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${quotation.ref} itinerary`, Author: supplier.company_name || "IdeaHoliday partner" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 96;

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(supplier.company_name || "Tour operator", { width: width * 0.62 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("TRAVEL ITINERARY", 48 + width * 0.65, 48, { width: width * 0.35, align: "right" });
    doc.fontSize(14).fillColor(ACCENT).text(quotation.ref, { width: width * 0.35, align: "right" });
    doc.x = 48;
    doc.moveDown(2);
    doc.moveTo(48, doc.y).lineTo(48 + width, doc.y).lineWidth(1.5).strokeColor("#f1ad2b").stroke();
    doc.moveDown(1);

    const travelers = `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`;
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(quotation.title, 48, doc.y, { width });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(`${quotation.customerName} · ${travelers} · ${longDate(quotation.startDate)} to ${longDate(addDays(quotation.startDate, lastDay - 1))}`, { width });
    doc.moveDown(1.2);

    for (const day of days) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      const text = dayText.get(day);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ACCENT).text(`Day ${day} · ${longDate(addDays(quotation.startDate, day - 1))}${text?.title ? ` · ${text.title}` : ""}`, { width });
      if (text?.description) doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(text.description, { width, paragraphGap: 3 });
      for (const line of lines.filter((item) => item.dayNumber === day)) {
        const entry = itineraryEntry(line, context);
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`• ${entry.heading}`, { width, indent: 8 });
        for (const detail of entry.details) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(detail, { width: width - 18, indent: 18 });
      }
      doc.moveDown(0.6);
    }

    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(0.6);
    const totals = quotation.totals;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Payment", 48, doc.y, { width });
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(`Package total ${inr(totals.totalInr)}${totals.gstInr > 0 ? " (GST included)" : ""} · Paid ${inr(totals.paidInr)} · Balance due ${inr(totals.dueInr)}`, { width });
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Contact during your trip", { width });
    const contact = [supplier.contact_name, supplier.phone, supplier.email].filter(Boolean).join(" · ");
    doc.font("Helvetica").fontSize(10).fillColor(INK).text(`${supplier.company_name || "Your operator"}${contact ? `: ${contact}` : ""}`, { width });
    if (quotation.notes) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Notes", { width });
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(quotation.notes, { width });
    }
    doc.end();
  });
}

/** The final itinerary PDF of an accepted quotation. */
export async function itineraryPdf(database, supplierId, quotationId) {
  const row = findQuotation(database, supplierId, quotationId);
  const quotation = quotationView(database, row);
  const supplier = database.prepare("SELECT company_name, contact_name, phone, email FROM suppliers WHERE id = ?").get(supplierId) || {};
  const drivers = database.prepare("SELECT id, driver_name, driver_phone, vehicle_model, vehicle_number FROM supplier_drivers WHERE supplier_id = ?").all(supplierId);
  const bookingIds = quotation.lines.map((line) => line.bookingId).filter(Boolean);
  const bookingRefs = new Map(bookingIds.map((id) => [id, database.prepare("SELECT ref FROM bookings WHERE id = ?").get(id)?.ref]));
  const buffer = await renderItineraryPdf({ quotation, supplier, hotels: listHotels(database, supplierId), cabTypes: listCabTypes(database, supplierId), services: listServices(database, supplierId), drivers, bookingRefs });
  return { buffer, filename: `${row.ref}-itinerary.pdf` };
}
