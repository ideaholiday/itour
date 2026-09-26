import PDFDocument from "pdfkit";
import { findQuotation, packageTotals, quotationView } from "./quotationService.js";
import { listHotels } from "./supplierHotelService.js";
import { listCabTypes } from "./supplierRateSheetService.js";
import { findAgent } from "./supplierAgentService.js";

/**
 * The customer's copy of a package quotation (ADR 040): the itinerary day by
 * day and one package price, or one per hotel option until the customer picks
 * (ADR 043). Line prices, costs and markup never appear.
 *
 * Two variants share this renderer:
 *  - BRAND (default): supplier logo/contact in the header, one retail price.
 *    This is what the direct customer sees.
 *  - AGENT: supplier identity is stripped from the header (the agent resells
 *    under their own brand), a "Trade quotation — confidential" band replaces
 *    it, and the price panel breaks retail into agent-net and the agent's
 *    margin using the agent's commission_pct (ADR 039).
 *
 * The built-in PDF fonts have no rupee sign, so amounts read "INR 12,345".
 */

const MEAL_PLANS = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast and dinner", AP: "All meals" };
const inr = (value) => `INR ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const INK = "#17233a";
const MUTED = "#667085";
const ACCENT = "#c27900";
const ACCENT_SOFT = "#f1ad2b";
const CARD_BG = "#FAF9F6";
const RAIL_BG = "#fef3d6";
const CHAIN_JOIN = "  »  ";

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
    const usage = [line.carDays > 1 ? `${line.carDays} days` : null, line.km ? `about ${line.km} km` : null].filter(Boolean);
    return [line.title, cab ? `${line.vehicles > 1 ? `${line.vehicles} × ` : ""}${cab.name}` : null, ...usage].filter(Boolean).join(" · ");
  }
  return line.title;
}

const shortDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Hotel lines as stays: back-to-back nights in the same hotel, room, meals and room count read as one stay. */
export function hotelStays(lines) {
  const stays = [];
  for (const line of [...lines].filter((item) => item.kind === "HOTEL" && item.date).sort((a, b) => a.date.localeCompare(b.date))) {
    const last = stays[stays.length - 1];
    if (last && last.hotelId === line.hotelId && last.roomType === line.roomType && last.mealPlan === line.mealPlan && last.rooms === line.rooms && last.checkOut === line.date) {
      last.nights += line.nights;
      last.checkOut = addDays(line.date, line.nights);
    } else {
      stays.push({ hotelId: line.hotelId, title: line.title, roomType: line.roomType, mealPlan: line.mealPlan, rooms: line.rooms || 1, extraAdults: line.extraAdults || 0, nights: line.nights, checkIn: line.date, checkOut: addDays(line.date, line.nights) });
    }
  }
  return stays;
}

/** Destinations chain "Lucknow · 2N  »  Ayodhya · 2N  »  Varanasi · 2N". The built-in
 * fonts are WinAnsi, which has no "→" (it printed as "!'"), so the joiner is "»". Prefers
 * the quotation's own legs (explicit ordering with night counts) and falls
 * back to deriving cities from the hotel stays when legs aren't set. */
function destinationsChain(legs, stays, hotelsById) {
  if (legs && legs.length) return legs.map((leg) => `${leg.city} · ${leg.nights}N`).join(CHAIN_JOIN);
  const seen = new Set();
  const chain = [];
  for (const stay of stays) {
    const hotel = hotelsById.get(stay.hotelId);
    const city = (hotel?.city || "").trim();
    if (city && !seen.has(city.toLowerCase())) { seen.add(city.toLowerCase()); chain.push(`${city} · ${stay.nights}N`); }
  }
  return chain.join(CHAIN_JOIN);
}

/** Renders the quotation to a PDF Buffer. */
export function renderQuotationPdf({ quotation, supplier, hotels = [], cabTypes = [], variant = "BRAND", agent = null }) {
  const isAgent = variant === "AGENT";
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const cabsById = new Map(cabTypes.map((cab) => [cab.id, cab]));
  const dayText = new Map((quotation.days || []).map((day) => [day.dayNumber, day]));
  const openOptions = (quotation.options || []).length > 1 && !quotation.selectedOption ? quotation.options : [];
  const chosen = quotation.selectedOption || 1;
  const itineraryLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (!openOptions.length && (line.option || 1) === chosen));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${quotation.ref} ${quotation.title}`, Author: isAgent ? "Trade quotation" : (supplier.company_name || "IdeaHoliday partner") } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const pageWidth = doc.page.width;
    const width = pageWidth - 96;
    const chosenLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (line.option || 1) === chosen);
    const stays = hotelStays(chosenLines);
    const chain = destinationsChain(quotation.legs, stays, hotelsById);

    // Cover band. A coloured strip full-bleed at the top with the title, destinations chain and ref.
    doc.save();
    doc.rect(0, 0, pageWidth, 96).fill(ACCENT).restore();
    doc.rect(0, 96, pageWidth, 4).fill(ACCENT_SOFT);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text(isAgent ? "TRADE QUOTATION — CONFIDENTIAL" : (supplier.company_name || "TOUR OPERATOR").toUpperCase(), 48, 22, { width: width * 0.6 });
    doc.font("Helvetica-Bold").fontSize(19).fillColor("#ffffff").text(quotation.title, 48, 40, { width: width * 0.6, ellipsis: true });
    if (chain) doc.font("Helvetica").fontSize(10).fillColor("#fff5df").text(chain, 48, 70, { width: width * 0.6 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff5df").text("REF", 48 + width * 0.62, 30, { width: width * 0.38, align: "right" });
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#ffffff").text(quotation.ref, 48 + width * 0.62, 42, { width: width * 0.38, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#fff5df").text(`Issued ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, 48 + width * 0.62, 66, { width: width * 0.38, align: "right" });
    if (quotation.validUntil) doc.text(`Valid until ${shortDate(quotation.validUntil)}`, 48 + width * 0.62, 80, { width: width * 0.38, align: "right" });

    doc.y = 118;
    doc.x = 48;

    // Prepared-for line. BRAND names the customer; AGENT names the agent.
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(isAgent ? `Prepared for ${agent?.contactName || agent?.name || "your agent"}` : `Prepared for ${quotation.customerName}`, { width });
    doc.moveDown(0.6);

    // Trip details at a glance: dates, travellers, hotels and room types, cars.
    const lastDay = Math.max(1, ...chosenLines.map((line) => line.dayNumber), ...dayText.keys(),
      ...stays.map((stay) => Math.round((Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${quotation.startDate}T00:00:00Z`)) / 86400000) + 1));
    const endDate = addDays(quotation.startDate, lastDay - 1);
    const travelers = `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`;
    const staysToShow = openOptions.length ? [] : stays;
    const details = [
      ["Travel dates", lastDay > 1 ? `${shortDate(quotation.startDate)} to ${shortDate(endDate)} · ${lastDay} days / ${lastDay - 1} night${lastDay === 2 ? "" : "s"}` : shortDate(quotation.startDate)],
      ["Travellers", travelers],
    ];
    if (openOptions.length) details.push(["Hotels", `${openOptions.length} hotel options, listed after the itinerary`]);
    staysToShow.forEach((stay, index) => {
      const hotel = hotelsById.get(stay.hotelId);
      const name = [hotel?.name || stay.title, hotel?.city].filter(Boolean).join(", ") + (hotel?.starRating ? ` (${hotel.starRating} star)` : "");
      const room = `${stay.roomType}${stay.rooms > 1 ? ` × ${stay.rooms} rooms` : ", 1 room"}${stay.extraAdults ? ` + ${stay.extraAdults} extra adult${stay.extraAdults === 1 ? "" : "s"}` : ""}`;
      details.push(
        [staysToShow.length > 1 ? `Hotel ${index + 1}` : "Hotel", name],
        ["Room type", room],
        ["Meals", MEAL_PLANS[stay.mealPlan] || stay.mealPlan],
        ["Stay", `Check-in ${shortDate(stay.checkIn)} · check-out ${shortDate(stay.checkOut)} · ${stay.nights} night${stay.nights === 1 ? "" : "s"}`],
      );
    });
    const cars = [...new Set(chosenLines.filter((line) => line.kind === "TRANSPORT").map((line) => cabsById.get(line.cabTypeId)?.name).filter(Boolean))];
    if (cars.length) details.push(["Car", cars.join(", ")]);
    const labelWidth = 96;
    const detailsTop = doc.y;
    const detailsHeight = details.reduce((sum, [, value]) => sum + doc.font("Helvetica").fontSize(9.5).heightOfString(value, { width: width - labelWidth - 32 }) + 5, 0) + 20;
    doc.roundedRect(48, detailsTop, width, detailsHeight, 8).fillColor(CARD_BG).fill();
    let detailY = detailsTop + 10;
    for (const [label, value] of details) {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(MUTED).text(label, 64, detailY, { width: labelWidth });
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(value, 64 + labelWidth, detailY, { width: width - labelWidth - 32 });
      detailY = doc.y + 5;
    }
    doc.x = 48;
    doc.y = detailsTop + detailsHeight;
    doc.moveDown(1.2);

    // Itinerary, day by day, without prices. Each day sits inside a card with a
    // coloured left rail so the eye can scan day-to-day at a glance.
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Itinerary", { width });
    doc.moveDown(0.5);
    const days = [...new Set([...itineraryLines.map((line) => line.dayNumber), ...dayText.keys()])].sort((a, b) => a - b);
    for (const day of days) {
      if (doc.y > doc.page.height - 160) doc.addPage();
      const text = dayText.get(day);
      const cardTop = doc.y;
      // Measure the card in one dry pass so the rail can size to it.
      const cardX = 48, contentX = 66, contentWidth = width - 22;
      const measure = () => {
        let y = cardTop + 10;
        y += doc.font("Helvetica-Bold").fontSize(11).heightOfString(`Day ${day} · ${dayDate(quotation.startDate, day)}${text?.title ? ` · ${text.title}` : ""}`, { width: contentWidth }) + 2;
        if (text?.description) y += doc.font("Helvetica").fontSize(9.5).heightOfString(text.description, { width: contentWidth }) + 4;
        for (const line of itineraryLines.filter((item) => item.dayNumber === day)) {
          y += doc.font("Helvetica-Bold").fontSize(10).heightOfString(`• ${lineSummary(line, hotelsById, cabsById)}`, { width: contentWidth }) + 2;
          if (line.description) y += doc.font("Helvetica").fontSize(9).heightOfString(line.description, { width: contentWidth - 10 }) + 2;
        }
        return y - cardTop + 8;
      };
      const cardHeight = measure();
      doc.roundedRect(cardX, cardTop, width, cardHeight, 6).fillColor(CARD_BG).fill();
      doc.rect(cardX, cardTop, 4, cardHeight).fillColor(ACCENT).fill();
      doc.rect(cardX + 4, cardTop, 2, cardHeight).fillColor(RAIL_BG).fill();
      doc.y = cardTop + 10;
      doc.x = contentX;
      doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text(`Day ${day} · ${dayDate(quotation.startDate, day)}${text?.title ? ` · ${text.title}` : ""}`, contentX, doc.y, { width: contentWidth });
      if (text?.description) doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(text.description, contentX, doc.y, { width: contentWidth });
      for (const line of itineraryLines.filter((item) => item.dayNumber === day)) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`• ${lineSummary(line, hotelsById, cabsById)}`, contentX, doc.y, { width: contentWidth });
        if (line.description) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(line.description, contentX + 10, doc.y, { width: contentWidth - 10 });
      }
      doc.x = 48;
      doc.y = cardTop + cardHeight + 8;
    }
    if (!days.length) doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("The day-by-day plan will follow.", { width });

    const people = quotation.adults + quotation.children;
    // Retail price box, shown to the customer, or the retail half of the trade panel.
    const retailBox = (totals, label = "Package price") => {
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.moveDown(0.4);
      const boxTop = doc.y;
      const rows = [[label, inr(totals.subtotalInr)]];
      if (totals.gstInr > 0) rows.push([`GST ${quotation.totals.gstPct}%`, inr(totals.gstInr)]);
      doc.roundedRect(48, boxTop, width, 30 + rows.length * 18 + 26, 8).fillColor(CARD_BG).fill();
      let y = boxTop + 14;
      for (const [rowLabel, value] of rows) {
        doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(rowLabel, 64, y, { width: width / 2 });
        doc.font("Helvetica").fontSize(10).fillColor(INK).text(value, 48 + width / 2, y, { width: width / 2 - 16, align: "right" });
        y += 18;
      }
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Total", 64, y + 6, { width: width / 2 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#087f5b").text(inr(totals.totalInr), 48 + width / 2, y + 6, { width: width / 2 - 16, align: "right" });
      if (people > 1) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`About ${inr(totals.perPersonInr)} per person`, 48 + width / 2, y + 26, { width: width / 2 - 16, align: "right" });
      doc.x = 48;
      doc.y = y + 44;
    };

    // Trade price panel: retail / agent net / your margin. The agent's net is
    // the same package priced with the agent's own markup on the cost lines
    // (hotels, cars, activities, custom); listings stay at their own price
    // and GST is unchanged. So retail − net is the retailer's markup on top
    // of the agent's markup, which is the agent's margin.
    const tradeBox = (totals, lines) => {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.moveDown(0.4);
      const boxTop = doc.y;
      const markupPct = Math.max(0, Math.min(200, Number(agent?.markupPct || 0)));
      const agentTotals = packageTotals(
        lines.map((line) => ({ kind: line.kind, price: Number(line.priceInr) })),
        { markupPct, gstPct: Number(quotation.totals.gstPct) },
      );
      const netInr = Math.min(agentTotals.total_inr, totals.totalInr);
      const marginInr = Math.max(0, totals.totalInr - netInr);
      const rows = [
        ["Retail price (what the guest pays)", inr(totals.totalInr), INK],
        [`Your net at ${markupPct}% markup`, inr(netInr), INK],
        ["Your margin", inr(marginInr), "#087f5b"],
      ];
      const boxHeight = 22 + rows.length * 22 + 16;
      doc.roundedRect(48, boxTop, width, boxHeight, 8).fillColor(CARD_BG).fill();
      doc.rect(48, boxTop, 4, boxHeight).fillColor(ACCENT).fill();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("TRADE PRICE — CONFIDENTIAL", 64, boxTop + 12, { width: width - 32 });
      let y = boxTop + 30;
      for (const [rowLabel, value, colour] of rows) {
        doc.font("Helvetica").fontSize(10.5).fillColor(MUTED).text(rowLabel, 64, y, { width: width * 0.6 });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(colour).text(value, 48 + width * 0.6, y, { width: width * 0.4 - 16, align: "right" });
        y += 22;
      }
      doc.x = 48;
      doc.y = boxTop + boxHeight + 8;
    };

    const priceBox = (totals, lines) => (isAgent ? tradeBox(totals, lines) : retailBox(totals));

    if (openOptions.length) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(isAgent ? "Hotel options" : "Choose your hotels", 48, doc.y, { width });
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("The itinerary above is the same for every option; only the hotels and the price change.", { width });
      for (const option of openOptions) {
        if (doc.y > doc.page.height - 220) doc.addPage();
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text(option.name, 48, doc.y, { width });
        for (const line of quotation.lines.filter((item) => item.kind === "HOTEL" && (item.option || 1) === option.number)) {
          doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(`• Day ${line.dayNumber}: ${lineSummary(line, hotelsById, cabsById)}`, { width, indent: 8 });
        }
        const optionLines = quotation.lines.filter((item) => item.kind !== "HOTEL" || (item.option || 1) === option.number);
        priceBox(option.totals, optionLines);
      }
    } else {
      if (doc.y > doc.page.height - 200) doc.addPage();
      priceBox(quotation.totals, chosenLines);
    }

    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
      isAgent
        ? `Net rates are for your ${agent?.name || "agency"} only and expire with this quotation. Hotels and departures are held only once the booking is confirmed.`
        : `${openOptions.length ? "Each price is" : "The price is"} for the whole group${quotation.totals.gstInr > 0 ? " and includes GST" : ""}. Hotels and departures are held only once the quotation is accepted and confirmed.`,
      48, doc.y, { width },
    );
    // What's included and not (migration 077), one bullet per item.
    for (const [heading, items] of [["What's included", quotation.inclusions], ["Not included", quotation.exclusions]]) {
      if (!items?.length) continue;
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(heading, 48, doc.y, { width });
      for (const item of items) doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(`• ${item}`, 56, doc.y, { width: width - 8 });
    }
    doc.x = 48;
    if (quotation.notes) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Notes", { width });
      doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(quotation.notes, { width });
    }

    // Footer. BRAND names the supplier; AGENT stays generic — the agent adds their own footer downstream.
    // It sits inside the bottom margin, so lift the margin while writing it or pdfkit starts a page for it.
    const footerY = doc.page.height - 42;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    if (isAgent) {
      doc.text("Trade quotation — for the addressed agent's internal use. Do not forward without permission.", 48, footerY, { width, align: "center" });
    } else {
      const footer = [supplier.company_name, supplier.phone, supplier.email].filter(Boolean).join("  ·  ");
      if (footer) doc.text(footer, 48, footerY, { width, align: "center" });
    }
    doc.end();
  });
}

/** The PDF of a supplier's quotation. `variant` picks branded vs agent (ADR 040, ADR 039). */
export async function quotationPdf(database, supplierId, quotationId, { variant = "BRAND" } = {}) {
  const row = findQuotation(database, supplierId, quotationId);
  const supplier = database.prepare("SELECT company_name, contact_name, phone, email FROM suppliers WHERE id = ?").get(supplierId);
  const quotation = quotationView(database, row);
  const isAgent = variant === "AGENT";
  const agent = isAgent && quotation.agentId
    ? (() => { try { const a = findAgent(database, supplierId, quotation.agentId); return { id: a.id, name: a.name, contactName: a.contact_name || null, email: a.email || null, commissionPct: Number(a.commission_pct), markupPct: Number(a.markup_pct || 0) }; } catch { return null; } })()
    : null;
  const buffer = await renderQuotationPdf({ quotation, supplier: supplier || {}, hotels: listHotels(database, supplierId), cabTypes: listCabTypes(database, supplierId), variant, agent });
  const suffix = isAgent ? "-agent" : "";
  return { buffer, filename: `${row.ref}${suffix}.pdf`, agent };
}
