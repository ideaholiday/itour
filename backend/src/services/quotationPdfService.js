import PDFDocument from "pdfkit";
import { findQuotation, quotationView } from "./quotationService.js";
import { listHotels } from "./supplierHotelService.js";
import { listCabTypes } from "./supplierRateSheetService.js";
import { findAgent } from "./supplierAgentService.js";
import { MEAL_PLANS, addDays, cityImages, dayDate, fetchImages, hotelStays, lineSummary, presentQuotation, quotationTheme, shortDate, themeStyle } from "./quotationPresentation.js";

export { hotelStays };

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
 *    it, and the price is the agent's net: the same total, with no agent markup (ADR 050).
 *
 * The built-in PDF fonts have no rupee sign, so amounts read "INR 12,345".
 */

const inr = (value) => `INR ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
const CHAIN_JOIN = "  »  ";
const KIND_TAGS = { HOTEL: "STAY", TRANSPORT: "CAR", ACTIVITY: "SEE", LISTING: "TOUR", CUSTOM: "EXTRA" };

/** Destinations chain "Lucknow · 2N  »  Ayodhya · 2N". The built-in fonts are WinAnsi, which has no "→", so the joiner is "»". */
function routeChain(route) {
  return route.map((leg) => `${leg.city} · ${leg.nights}N`).join(CHAIN_JOIN);
}

// A five-pointed star, drawn: the built-in fonts have no star glyph.
function star(doc, cx, cy, radius, colour) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? radius * 0.45 : radius;
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    points.push([cx + r * Math.cos(angle), cy - r * Math.sin(angle)]);
  }
  doc.polygon(...points).fillColor(colour).fill();
}
const tick = (doc, x, y, colour) => doc.save().lineWidth(1.6).strokeColor(colour).moveTo(x, y + 4).lineTo(x + 3, y + 7).lineTo(x + 8, y).stroke().restore();
const cross = (doc, x, y, colour) => doc.save().lineWidth(1.4).strokeColor(colour).moveTo(x, y).lineTo(x + 7, y + 7).moveTo(x + 7, y).lineTo(x, y + 7).stroke().restore();

/**
 * Renders the quotation to a PDF Buffer in its theme (ADR 051): a cover with the
 * destination photo, the route, the hotels, a day-by-day timeline, the price and
 * the terms, with the operator's contact and page numbers on every page.
 * `images` maps a photo URL to its downloaded bytes; a missing photo draws a colour block.
 */
export function renderQuotationPdf({ quotation, supplier = {}, hotels = [], cabTypes = [], variant = "BRAND", agent = null, theme = "HERITAGE", cityPhotos = new Map(), images = new Map() }) {
  const view = presentQuotation({ quotation, supplier, hotels, cabTypes, variant, agent, theme, images: cityPhotos });
  const t = themeStyle(theme);
  const isAgent = view.isAgent;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `${view.ref} ${view.title}`, Author: isAgent ? "Trade quotation" : view.brand.name } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = 48;
    const width = pageWidth - 96;
    const bottom = pageHeight - 70;
    const ensure = (height) => { if (doc.y + height > bottom) { doc.addPage(); doc.y = 56; } };
    const heading = (text, size = 18) => {
      doc.font(t.headingFont).fontSize(size).fillColor(t.ink).text(text, left, doc.y, { width });
      const y = doc.y + 3;
      doc.rect(left, y, 36, 2.5).fillColor(t.accent).fill();
      doc.y = y + 12;
    };

    // Cover: the destination photo full-bleed, darkened so the title reads; a colour block without one.
    const heroHeight = 330;
    const photo = view.heroImage ? images.get(view.heroImage) : null;
    let drewPhoto = false;
    if (photo) {
      try {
        doc.save().rect(0, 0, pageWidth, heroHeight).clip();
        doc.image(photo, 0, 0, { cover: [pageWidth, heroHeight], align: "center", valign: "center" });
        doc.restore();
        doc.save().rect(0, 0, pageWidth, heroHeight).fillOpacity(0.5).fillColor("#000000").fill().restore();
        drewPhoto = true;
      } catch { doc.restore(); }
    }
    if (!drewPhoto) {
      doc.rect(0, 0, pageWidth, heroHeight).fillColor(t.primary).fill();
      doc.save().rect(0, 0, pageWidth, heroHeight).clip();
      doc.fillOpacity(0.12).circle(pageWidth - 60, 70, 140).fillColor(t.accent).fill().circle(90, heroHeight + 20, 120).fill();
      doc.restore();
    }
    doc.rect(0, heroHeight, pageWidth, 5).fillColor(t.accent).fill();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(isAgent ? "TRADE QUOTATION — CONFIDENTIAL" : view.brand.name.toUpperCase(), left, 34, { width: width * 0.6, characterSpacing: 1.5 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(t.onPrimary).text("QUOTATION", left + width * 0.6, 30, { width: width * 0.4, align: "right", characterSpacing: 1.5 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").text(view.ref, left + width * 0.6, 42, { width: width * 0.4, align: "right" });
    const chain = routeChain(view.route);
    const titleSize = view.title.length > 38 ? 24 : 30;
    const titleHeight = doc.font(t.headingFont).fontSize(titleSize).heightOfString(view.title, { width });
    const titleTop = heroHeight - 40 - titleHeight - (chain ? 18 : 0);
    doc.font(t.headingFont).fontSize(titleSize).fillColor("#ffffff").text(view.title, left, titleTop, { width });
    if (chain) doc.font("Helvetica").fontSize(11).fillColor(t.onPrimary).text(chain, left, doc.y + 4, { width });

    doc.y = heroHeight + 22;
    if (view.preparedFor) doc.font("Helvetica").fontSize(10).fillColor(t.muted).text(`Prepared for ${view.preparedFor}`, left, doc.y, { width });
    doc.y += 10;

    // Trip facts in four boxes.
    const facts = [["TRAVEL DATES", view.dates], ["DURATION", view.duration], ["TRAVELLERS", view.travellers], view.validUntil ? ["VALID UNTIL", view.validUntil] : ["ISSUED", view.issued]];
    const factWidth = (width - 24) / 4;
    const factTop = doc.y;
    facts.forEach(([label, value], index) => {
      const x = left + index * (factWidth + 8);
      doc.roundedRect(x, factTop, factWidth, 52, 6).fillColor(t.soft).fill();
      doc.font("Helvetica-Bold").fontSize(7).fillColor(t.muted).text(label, x + 10, factTop + 10, { width: factWidth - 20, characterSpacing: 0.8 });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(t.ink).text(value, x + 10, factTop + 23, { width: factWidth - 20 });
    });
    doc.y = factTop + 70;

    // The route as stops on a line, with the arrival and departure points at its ends.
    if (view.route.length) {
      heading(view.route.length > 1 ? "Your route" : "Your destination", 15);
      const stops = view.route.slice(0, 6);
      const lineY = doc.y + 12;
      const step = stops.length > 1 ? (width - 80) / (stops.length - 1) : 0;
      const xs = stops.map((_, index) => (stops.length > 1 ? left + 40 + index * step : left + width / 2));
      if (stops.length > 1) doc.save().lineWidth(2).strokeColor(t.line).moveTo(xs[0], lineY).lineTo(xs[xs.length - 1], lineY).stroke().restore();
      stops.forEach((leg, index) => {
        doc.circle(xs[index], lineY, 9).fillColor(t.primary).fill();
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text(String(index + 1), xs[index] - 9, lineY - 3.5, { width: 18, align: "center" });
        doc.font("Helvetica-Bold").fontSize(10).fillColor(t.ink).text(leg.city, xs[index] - 50, lineY + 15, { width: 100, align: "center" });
        doc.font("Helvetica").fontSize(8.5).fillColor(t.muted).text(`${leg.nights} night${leg.nights === 1 ? "" : "s"}`, xs[index] - 50, lineY + 28, { width: 100, align: "center" });
      });
      doc.y = lineY + 46;
      if (view.route.length > stops.length) doc.font("Helvetica").fontSize(9).fillColor(t.muted).text(chain, left, doc.y, { width });
      const ends = [view.arrivalPoint && `Arrive at ${view.arrivalPoint}`, view.departurePoint && `Leave from ${view.departurePoint}`].filter(Boolean);
      if (ends.length) doc.font("Helvetica").fontSize(9).fillColor(t.muted).text(ends.join("   ·   "), left, doc.y + 2, { width, align: "center" });
      doc.y += 16;
    }

    // Hotel cards, two to a row.
    const hotelCards = (stays) => {
      const cardWidth = (width - 12) / 2;
      for (let index = 0; index < stays.length; index += 2) {
        const row = stays.slice(index, index + 2);
        const heights = row.map((stay) => 50 + doc.font("Helvetica-Bold").fontSize(10.5).heightOfString(stay.name, { width: cardWidth - 28 }));
        const height = Math.max(...heights);
        ensure(height + 10);
        const top = doc.y;
        row.forEach((stay, column) => {
          const x = left + column * (cardWidth + 12);
          doc.roundedRect(x, top, cardWidth, height, 6).fillColor(t.soft).fill();
          doc.rect(x, top, 3, height).fillColor(t.accent).fill();
          doc.font("Helvetica-Bold").fontSize(10.5).fillColor(t.ink).text(stay.name, x + 14, top + 10, { width: cardWidth - 28 });
          let y = doc.y + 2;
          if (stay.stars) { for (let s = 0; s < stay.stars; s += 1) star(doc, x + 19 + s * 11, y + 4, 4.2, t.accent); }
          doc.font("Helvetica").fontSize(8.5).fillColor(t.muted).text([stay.city].filter(Boolean).join(""), x + 14 + (stay.stars ? stay.stars * 11 + 4 : 0), y, { width: cardWidth - 28 });
          y = doc.y + 2;
          doc.font("Helvetica").fontSize(8.5).fillColor(t.ink).text(`${stay.room} · ${stay.meals}`, x + 14, y, { width: cardWidth - 28 });
          doc.font("Helvetica").fontSize(8.5).fillColor(t.muted).text(`${stay.checkIn} to ${stay.checkOut} · ${stay.nights} night${stay.nights === 1 ? "" : "s"}`, x + 14, doc.y + 1, { width: cardWidth - 28 });
        });
        doc.y = top + height + 10;
      }
    };
    if (view.stays.length) {
      ensure(90);
      heading("Where you'll stay", 15);
      hotelCards(view.stays);
    } else if (view.options.length) {
      doc.font("Helvetica").fontSize(9.5).fillColor(t.muted).text(`${view.options.length} hotel options are listed with their prices after the itinerary.`, left, doc.y, { width });
      doc.y += 8;
    }
    if (view.cars.length) doc.font("Helvetica").fontSize(9.5).fillColor(t.ink).text(`Travel by private ${view.cars.join(" / ")}.`, left, doc.y, { width });

    // Day by day, as a timeline on its own page.
    doc.addPage();
    doc.y = 56;
    heading("Day by day");
    const rail = left + 26;
    const bodyX = left + 70;
    const bodyWidth = width - 70;
    const dayHeight = (day) => {
      let height = doc.font(t.headingFont).fontSize(13).heightOfString(day.title || `Day ${day.dayNumber}`, { width: bodyWidth }) + 16;
      if (day.description) height += doc.font("Helvetica").fontSize(9.5).heightOfString(day.description, { width: bodyWidth, lineGap: 1.5 }) + 6;
      for (const item of day.items) {
        height += doc.font("Helvetica").fontSize(9.5).heightOfString(item.text, { width: bodyWidth - 40 }) + 5;
        if (item.note) height += doc.font("Helvetica").fontSize(8.5).heightOfString(item.note, { width: bodyWidth - 40 }) + 2;
      }
      return Math.max(height, 58) + 16;
    };
    view.days.forEach((day, dayIndex) => {
      const height = dayHeight(day);
      ensure(Math.min(height, bottom - 60));
      const top = doc.y;
      // The rail joins one day to the next; the last day's stops at its badge.
      if (dayIndex < view.days.length - 1) doc.save().lineWidth(1.5).strokeColor(t.line).moveTo(rail, top).lineTo(rail, top + height).stroke().restore();
      doc.circle(rail, top + 20, 20).fillColor(t.primary).fill();
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(t.onPrimary).text("DAY", rail - 20, top + 10, { width: 40, align: "center", characterSpacing: 0.8 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff").text(String(day.dayNumber), rail - 20, top + 18, { width: 40, align: "center" });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(t.accent).text(`${day.date}${day.city ? `  ·  ${day.city.toUpperCase()}` : ""}`, bodyX, top + 2, { width: bodyWidth, characterSpacing: 0.4 });
      doc.font(t.headingFont).fontSize(13).fillColor(t.ink).text(day.title || `Day ${day.dayNumber}`, bodyX, doc.y + 2, { width: bodyWidth });
      if (day.description) doc.font("Helvetica").fontSize(9.5).fillColor(t.ink).text(day.description, bodyX, doc.y + 4, { width: bodyWidth, lineGap: 1.5 });
      doc.y += 4;
      for (const item of day.items) {
        const y = doc.y + 3;
        doc.roundedRect(bodyX, y, 34, 12, 3).fillColor(t.soft).fill();
        doc.font("Helvetica-Bold").fontSize(6.5).fillColor(t.primary).text(KIND_TAGS[item.kind] || "", bodyX, y + 3, { width: 34, align: "center" });
        doc.font("Helvetica").fontSize(9.5).fillColor(t.ink).text(item.text, bodyX + 40, y + 1, { width: bodyWidth - 40 });
        if (item.note) doc.font("Helvetica").fontSize(8.5).fillColor(t.muted).text(item.note, bodyX + 40, doc.y + 1, { width: bodyWidth - 40 });
      }
      doc.y = Math.max(doc.y + 16, top + height);
    });
    if (!view.days.length) doc.font("Helvetica").fontSize(10).fillColor(t.muted).text("The day-by-day plan will follow.", left, doc.y, { width });

    // The price: a panel in the theme's colour, or one per hotel option.
    const pricePanel = (totals, label) => {
      const rows = [[label, inr(totals.subtotalInr)]];
      if (totals.gstInr > 0) rows.push([`GST ${totals.gstPct ?? view.totals.gstPct}%`, inr(totals.gstInr)]);
      const height = 34 + rows.length * 17 + 44;
      ensure(height + 10);
      const top = doc.y;
      doc.roundedRect(left, top, width, height, 8).fillColor(t.primary).fill();
      let y = top + 16;
      for (const [rowLabel, value] of rows) {
        doc.font("Helvetica").fontSize(10).fillColor(t.onPrimary).text(rowLabel, left + 18, y, { width: width / 2 });
        doc.font("Helvetica").fontSize(10).fillColor(t.onPrimary).text(value, left + width / 2, y, { width: width / 2 - 18, align: "right" });
        y += 17;
      }
      doc.rect(left + 18, y + 2, width - 36, 0.8).fillColor(t.onPrimary).fill();
      doc.font(t.headingFont).fontSize(15).fillColor("#ffffff").text("Total", left + 18, y + 12, { width: width / 2 });
      doc.font("Helvetica-Bold").fontSize(17).fillColor("#ffffff").text(inr(totals.totalInr), left + width / 2, y + 10, { width: width / 2 - 18, align: "right" });
      if (view.people > 1) doc.font("Helvetica").fontSize(8.5).fillColor(t.onPrimary).text(`About ${inr(totals.perPersonInr)} per person`, left + width / 2, y + 30, { width: width / 2 - 18, align: "right" });
      doc.y = top + height + 12;
    };
    doc.y += 8;
    if (view.options.length) {
      ensure(120);
      heading(isAgent ? "Hotel options" : "Choose your hotels", 16);
      doc.font("Helvetica").fontSize(9).fillColor(t.muted).text("The itinerary is the same for every option; only the hotels and the price change.", left, doc.y, { width });
      doc.y += 8;
      for (const option of view.options) {
        ensure(150);
        doc.font(t.headingFont).fontSize(13).fillColor(t.primary).text(option.name, left, doc.y, { width });
        doc.y += 4;
        hotelCards(option.stays);
        pricePanel(option.totals, view.priceLabel);
      }
    } else {
      ensure(140);
      heading("Your price", 16);
      pricePanel(view.totals, view.priceLabel);
    }
    doc.font("Helvetica").fontSize(8.5).fillColor(t.muted).text(view.priceNote, left, doc.y, { width });
    doc.y += 12;

    // What's included and not (migration 077): ticks and crosses, side by side.
    const lists = [["What's included", view.inclusions, tick, t.accent], ["Not included", view.exclusions, cross, t.muted]].filter(([, items]) => items.length);
    if (lists.length) {
      const columnWidth = lists.length === 2 ? (width - 20) / 2 : width;
      const measure = (items) => items.reduce((sum, item) => sum + doc.font("Helvetica").fontSize(9.5).heightOfString(item, { width: columnWidth - 18 }) + 5, 30);
      ensure(Math.min(Math.max(...lists.map(([, items]) => measure(items))), bottom - 80));
      const top = doc.y;
      let lowest = top;
      lists.forEach(([label, items, mark, colour], column) => {
        const x = left + column * (columnWidth + 20);
        doc.font(t.headingFont).fontSize(13).fillColor(t.ink).text(label, x, top, { width: columnWidth });
        let y = doc.y + 6;
        for (const item of items) {
          if (y > bottom - 14) { doc.addPage(); y = 56; }
          mark(doc, x, y + 2, colour);
          doc.font("Helvetica").fontSize(9.5).fillColor(t.ink).text(item, x + 16, y, { width: columnWidth - 18 });
          y = doc.y + 5;
        }
        lowest = Math.max(lowest, y);
      });
      doc.y = lowest + 8;
    }
    if (view.notes) {
      ensure(60);
      doc.font(t.headingFont).fontSize(13).fillColor(t.ink).text("Good to know", left, doc.y, { width });
      doc.font("Helvetica").fontSize(9.5).fillColor(t.ink).text(view.notes, left, doc.y + 4, { width, lineGap: 1.5 });
    }

    // Footer on every page. BRAND names the operator; AGENT stays generic for the agent to resell.
    // It sits inside the bottom margin, so lift the margin while writing it or pdfkit starts a page for it.
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      doc.page.margins.bottom = 0;
      const footerY = pageHeight - 40;
      doc.rect(left, footerY - 8, width, 0.6).fillColor(t.line).fill();
      const footer = isAgent
        ? "Trade quotation — for the addressed agent's internal use. Do not forward without permission."
        : [view.brand.name, view.brand.phone, view.brand.email].filter(Boolean).join("  ·  ");
      doc.font("Helvetica").fontSize(8).fillColor(t.muted).text(footer, left, footerY, { width: width - 70, lineBreak: false });
      doc.text(`${view.ref}  ·  ${index - range.start + 1}/${range.count}`, left + width - 70, footerY, { width: 70, align: "right", lineBreak: false });
    }
    doc.end();
  });
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

/**
 * The quotation as plain text, with no supplier or Idea Holiday branding, for the
 * supplier to paste into an email or chat (ADR 050). Same content as the PDF:
 * trip details, day by day, hotels, the price (the agent's net for an agent), inclusions, notes.
 */
export function renderQuotationText({ quotation, hotels = [], cabTypes = [] }) {
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const cabsById = new Map(cabTypes.map((cab) => [cab.id, cab]));
  const dayText = new Map((quotation.days || []).map((day) => [day.dayNumber, day]));
  const openOptions = (quotation.options || []).length > 1 && !quotation.selectedOption ? quotation.options : [];
  const chosen = quotation.selectedOption || 1;
  const itineraryLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (!openOptions.length && (line.option || 1) === chosen));
  const chosenLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (line.option || 1) === chosen);
  const stays = hotelStays(chosenLines);
  const days = [...new Set([...itineraryLines.map((line) => line.dayNumber), ...dayText.keys()])].sort((a, b) => a - b);
  const lastDay = Math.max(1, ...days, ...stays.map((stay) => Math.round((Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${quotation.startDate}T00:00:00Z`)) / 86400000) + 1));
  const people = quotation.adults + quotation.children;
  const travelers = `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`;
  const priceLabel = quotation.agentId ? "Net price" : "Price";
  const price = (totals) => [
    `${priceLabel}: ${inr(totals.totalInr)} for the group${totals.gstInr > 0 ? ` (includes GST ${quotation.totals.gstPct}%)` : ""}`,
    people > 1 ? `About ${inr(totals.perPersonInr)} per person` : null,
  ].filter(Boolean);
  const out = [
    `${quotation.title} (${quotation.ref})`,
    destinationsChain(quotation.legs, stays, hotelsById).replaceAll(CHAIN_JOIN, " > ") || null,
    `Travel dates: ${lastDay > 1 ? `${shortDate(quotation.startDate)} to ${shortDate(addDays(quotation.startDate, lastDay - 1))} (${lastDay} days / ${lastDay - 1} night${lastDay === 2 ? "" : "s"})` : shortDate(quotation.startDate)}`,
    `Travellers: ${travelers}`,
  ].filter(Boolean);
  if (!openOptions.length && stays.length) {
    out.push("", "HOTELS");
    for (const stay of stays) {
      const hotel = hotelsById.get(stay.hotelId);
      out.push(`- ${[hotel?.name || stay.title, hotel?.city].filter(Boolean).join(", ")}${hotel?.starRating ? ` (${hotel.starRating} star)` : ""}: ${stay.roomType}, ${stay.rooms} room${stay.rooms === 1 ? "" : "s"}, ${MEAL_PLANS[stay.mealPlan] || stay.mealPlan}, ${shortDate(stay.checkIn)} to ${shortDate(stay.checkOut)} (${stay.nights}N)`);
    }
  }
  out.push("", "ITINERARY");
  for (const day of days) {
    const text = dayText.get(day);
    out.push("", `Day ${day} - ${dayDate(quotation.startDate, day)}${text?.title ? `: ${text.title}` : ""}`);
    if (text?.description) out.push(text.description);
    for (const line of itineraryLines.filter((item) => item.dayNumber === day)) {
      out.push(`- ${lineSummary(line, hotelsById, cabsById)}${line.description ? ` (${line.description})` : ""}`);
    }
  }
  if (!days.length) out.push("The day-by-day plan will follow.");
  out.push("");
  if (openOptions.length) {
    out.push("HOTEL OPTIONS");
    for (const option of openOptions) {
      out.push("", option.name);
      for (const line of quotation.lines.filter((item) => item.kind === "HOTEL" && (item.option || 1) === option.number)) out.push(`- Day ${line.dayNumber}: ${lineSummary(line, hotelsById, cabsById)}`);
      out.push(...price(option.totals));
    }
  } else {
    out.push("PRICE", ...price(quotation.totals));
  }
  for (const [heading, items] of [["INCLUDED", quotation.inclusions], ["NOT INCLUDED", quotation.exclusions]]) {
    if (items?.length) out.push("", heading, ...items.map((item) => `- ${item}`));
  }
  if (quotation.notes) out.push("", "NOTES", quotation.notes);
  if (quotation.validUntil) out.push("", `Valid until ${shortDate(quotation.validUntil)}.`);
  return out.join("\n");
}

/** The plain-text quotation for a supplier's quotation (ADR 050). */
export function quotationText(database, supplierId, quotationId) {
  const quotation = quotationView(database, findQuotation(database, supplierId, quotationId));
  return renderQuotationText({ quotation, hotels: listHotels(database, supplierId), cabTypes: listCabTypes(database, supplierId) });
}

/** The PDF of a supplier's quotation. `variant` picks branded vs agent (ADR 040, ADR 039). */
export async function quotationPdf(database, supplierId, quotationId, { variant = "BRAND" } = {}) {
  const row = findQuotation(database, supplierId, quotationId);
  const supplier = database.prepare("SELECT company_name, contact_name, phone, email FROM suppliers WHERE id = ?").get(supplierId);
  const quotation = quotationView(database, row);
  const isAgent = variant === "AGENT";
  const agent = isAgent && quotation.agentId
    ? (() => { try { const a = findAgent(database, supplierId, quotation.agentId); return { id: a.id, name: a.name, contactName: a.contact_name || null, email: a.email || null }; } catch { return null; } })()
    : null;
  const theme = quotationTheme(database, supplierId, quotation);
  const cityPhotos = cityImages(database, (quotation.legs || []).map((leg) => leg.city));
  const images = await fetchImages([...cityPhotos.values()].slice(0, 1));
  const buffer = await renderQuotationPdf({ quotation, supplier: supplier || {}, hotels: listHotels(database, supplierId), cabTypes: listCabTypes(database, supplierId), variant, agent, theme, cityPhotos, images });
  const suffix = isAgent ? "-agent" : "";
  return { buffer, filename: `${row.ref}${suffix}.pdf`, agent };
}
