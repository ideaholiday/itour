import PDFDocument from "pdfkit";
import { findQuotation, quotationView } from "./quotationService.js";
import { listHotels } from "./supplierHotelService.js";
import { listCabTypes } from "./supplierRateSheetService.js";

/**
 * The customer's copy of a package quotation (ADR 040): the itinerary day by
 * day and one package price, or one per hotel option until the customer picks
 * (ADR 043). Line prices, costs and markup never appear.
 * The built-in PDF fonts have no rupee sign, so amounts read "INR 12,345".
 */

const MEAL_PLANS = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast and dinner", AP: "All meals" };
const inr = (value) => `INR ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const INK = "#17233a";
const MUTED = "#667085";
const ACCENT = "#c27900";

function dayDate(startDate, dayNumber) {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function lineSummary(line, hotels, cabs) {
  if (line.kind === "HOTEL") {
    const hotel = hotels.get(line.hotelId);
    const parts = [hotel?.name || line.title, line.roomType, MEAL_PLANS[line.mealPlan] || line.mealPlan, `${line.nights} night${line.nights === 1 ? "" : "s"}`];
    if (line.rooms > 1) parts.push(`${line.rooms} rooms`);
    return parts.filter(Boolean).join(" · ");
  }
  if (line.kind === "LISTING") return [line.title, line.pickupTime ? `at ${line.pickupTime}` : null].filter(Boolean).join(" ");
  if (line.kind === "TRANSPORT") {
    const cab = cabs.get(line.cabTypeId);
    return cab ? `${line.title} · ${line.vehicles > 1 ? `${line.vehicles} × ` : ""}${cab.name}` : line.title;
  }
  return line.title;
}

/** Renders the quotation to a PDF Buffer. */
export function renderQuotationPdf({ quotation, supplier, hotels = [], cabTypes = [] }) {
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const cabsById = new Map(cabTypes.map((cab) => [cab.id, cab]));
  const dayText = new Map((quotation.days || []).map((day) => [day.dayNumber, day]));
  // With hotel options still open, hotels are listed per option after the itinerary; otherwise the chosen option's hotels are in it.
  const openOptions = (quotation.options || []).length > 1 && !quotation.selectedOption ? quotation.options : [];
  const chosen = quotation.selectedOption || 1;
  const itineraryLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (!openOptions.length && (line.option || 1) === chosen));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${quotation.ref} ${quotation.title}`, Author: supplier.company_name || "IdeaHoliday partner" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 96;

    // Header: operator and reference.
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(supplier.company_name || "Tour operator", { width: width * 0.62 });
    const contact = [supplier.contact_name, supplier.phone, supplier.email].filter(Boolean).join(" · ");
    if (contact) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(contact, { width: width * 0.62 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("QUOTATION", 48 + width * 0.65, 48, { width: width * 0.35, align: "right" });
    doc.fontSize(14).fillColor(ACCENT).text(quotation.ref, { width: width * 0.35, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
      .text(`Issued ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, { width: width * 0.35, align: "right" });
    if (quotation.validUntil) doc.text(`Valid until ${quotation.validUntil}`, { width: width * 0.35, align: "right" });
    doc.x = 48;
    doc.moveDown(2);
    doc.moveTo(48, doc.y).lineTo(48 + width, doc.y).lineWidth(1.5).strokeColor("#f1ad2b").stroke();
    doc.moveDown(1);

    // Trip and customer.
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(quotation.title, 48, doc.y, { width });
    const travelers = `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`;
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(`Prepared for ${quotation.customerName} · ${travelers} · from ${quotation.startDate}`, { width });
    doc.moveDown(1.2);

    // Itinerary, day by day, without prices.
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Itinerary", { width });
    doc.moveDown(0.4);
    const days = [...new Set([...itineraryLines.map((line) => line.dayNumber), ...dayText.keys()])].sort((a, b) => a - b);
    for (const day of days) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      const text = dayText.get(day);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ACCENT).text(`Day ${day} · ${dayDate(quotation.startDate, day)}${text?.title ? ` · ${text.title}` : ""}`, { width });
      if (text?.description) doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(text.description, { width, paragraphGap: 3 });
      for (const line of itineraryLines.filter((item) => item.dayNumber === day)) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`• ${lineSummary(line, hotelsById, cabsById)}`, { width, indent: 8 });
        if (line.description) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(line.description, { width: width - 18, indent: 18 });
      }
      doc.moveDown(0.6);
    }
    if (!days.length) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("The day-by-day plan will follow.", { width });

    // A package price box: price, GST, total and about how much per person.
    const people = quotation.adults + quotation.children;
    const priceBox = (totals) => {
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.moveDown(0.5);
      const boxTop = doc.y;
      const rows = [["Package price", inr(totals.subtotalInr)]];
      if (totals.gstInr > 0) rows.push([`GST ${quotation.totals.gstPct}%`, inr(totals.gstInr)]);
      doc.roundedRect(48, boxTop, width, 30 + rows.length * 18 + 26, 8).fillColor("#FAF9F6").fill();
      doc.fillColor(INK);
      let y = boxTop + 14;
      for (const [label, value] of rows) {
        doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(label, 64, y, { width: width / 2 });
        doc.font("Helvetica").fontSize(10).fillColor(INK).text(value, 48 + width / 2, y, { width: width / 2 - 16, align: "right" });
        y += 18;
      }
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Total", 64, y + 6, { width: width / 2 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#087f5b").text(inr(totals.totalInr), 48 + width / 2, y + 6, { width: width / 2 - 16, align: "right" });
      if (people > 1) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`About ${inr(totals.perPersonInr)} per person`, 48 + width / 2, y + 26, { width: width / 2 - 16, align: "right" });
      doc.x = 48;
      doc.y = y + 44;
    };

    if (openOptions.length) {
      // One section per hotel option: its hotels and its price.
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Choose your hotels", 48, doc.y, { width });
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`The itinerary above is the same for every option; only the hotels and the price change.`, { width });
      for (const option of openOptions) {
        if (doc.y > doc.page.height - 200) doc.addPage();
        doc.moveDown(0.6);
        doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text(option.name, 48, doc.y, { width });
        for (const line of quotation.lines.filter((item) => item.kind === "HOTEL" && (item.option || 1) === option.number)) {
          doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(`• Day ${line.dayNumber}: ${lineSummary(line, hotelsById, cabsById)}`, { width, indent: 8 });
        }
        priceBox(option.totals);
      }
    } else {
      if (doc.y > doc.page.height - 180) doc.addPage();
      doc.moveDown(0.3);
      priceBox(quotation.totals);
    }

    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`${openOptions.length ? "Each price is" : "The price is"} for the whole group${quotation.totals.gstInr > 0 ? " and includes GST" : ""}. Hotels and departures are held only once the quotation is accepted and confirmed.`, 48, doc.y, { width });
    if (quotation.notes) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Notes", { width });
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(quotation.notes, { width });
    }
    doc.end();
  });
}

/** The PDF of a supplier's quotation, as the customer sees it. */
export async function quotationPdf(database, supplierId, quotationId) {
  const row = findQuotation(database, supplierId, quotationId);
  const supplier = database.prepare("SELECT company_name, contact_name, phone, email FROM suppliers WHERE id = ?").get(supplierId);
  const buffer = await renderQuotationPdf({ quotation: quotationView(database, row), supplier: supplier || {}, hotels: listHotels(database, supplierId), cabTypes: listCabTypes(database, supplierId) });
  return { buffer, filename: `${row.ref}.pdf` };
}
