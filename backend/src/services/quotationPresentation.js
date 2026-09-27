import logger from "../config/logger.js";

/**
 * The customer's view of a quotation (ADR 051), shared by the PDF, the web
 * itinerary page and the email so all three say the same thing in the same
 * theme. It carries only what the customer (or, for the AGENT variant, the
 * agent) may see: no line prices, costs or markup.
 */

// Themes: colours and the heading font (pdfkit built-ins: Times-Bold reads as a serif display face).
export const THEME_STYLES = {
  HERITAGE: { key: "HERITAGE", primary: "#7c2d12", accent: "#ea580c", soft: "#fff7ed", line: "#fed7aa", ink: "#1c1917", muted: "#78716c", onPrimary: "#ffedd5", headingFont: "Times-Bold", webHeading: "Georgia, 'Times New Roman', serif" },
  CLASSIC: { key: "CLASSIC", primary: "#1e3a5f", accent: "#b8860b", soft: "#f5f7fa", line: "#dbe3ee", ink: "#101828", muted: "#667085", onPrimary: "#e8eef6", headingFont: "Times-Bold", webHeading: "Georgia, 'Times New Roman', serif" },
  MINIMAL: { key: "MINIMAL", primary: "#111827", accent: "#0f766e", soft: "#f8fafc", line: "#e5e7eb", ink: "#111827", muted: "#6b7280", onPrimary: "#f3f4f6", headingFont: "Helvetica-Bold", webHeading: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
};
export const themeStyle = (key) => THEME_STYLES[key] || THEME_STYLES.HERITAGE;

/** The quotation's theme: its own, else the supplier's default (migration 079). */
export function quotationTheme(db, supplierId, quotation) {
  if (quotation.theme && THEME_STYLES[quotation.theme]) return quotation.theme;
  const row = db.prepare("SELECT theme FROM supplier_quotation_terms WHERE supplier_id = ?").get(supplierId);
  return THEME_STYLES[row?.theme] ? row.theme : "HERITAGE";
}

/** Photos of the trip's cities from the destination catalogue (destinations.hero_image), keyed by lower-case city name. */
export function cityImages(db, cities = []) {
  const images = new Map();
  const find = db.prepare("SELECT hero_image FROM destinations WHERE LOWER(name) = LOWER(?) AND hero_image IS NOT NULL AND hero_image <> '' LIMIT 1");
  for (const city of new Set(cities.map((name) => String(name || "").trim()).filter(Boolean))) {
    const row = find.get(city);
    if (row?.hero_image && /^https:\/\//i.test(row.hero_image)) images.set(city.toLowerCase(), row.hero_image);
  }
  return images;
}

// Downloaded photos for the PDF, kept for an hour so a resend doesn't fetch again.
const imageCache = new Map();
const IMAGE_TTL_MS = 60 * 60 * 1000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

// pdfkit draws JPEG and PNG only; imgix hosts (Unsplash) are asked for a JPEG.
function jpegUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "images.unsplash.com") { parsed.searchParams.set("fm", "jpg"); parsed.searchParams.set("w", "1400"); }
    return parsed.toString();
  } catch { return url; }
}

/**
 * Downloads photos for the PDF: https only, 4 MB and 4 seconds at most each,
 * JPEG or PNG. A photo that fails is left out and the PDF draws a colour block
 * instead, so a slow image host never blocks a quotation. Off in tests and when
 * QUOTATION_IMAGES=off.
 */
export async function fetchImages(urls = [], { fetchImpl = globalThis.fetch } = {}) {
  const out = new Map();
  if (process.env.NODE_ENV === "test" || process.env.QUOTATION_IMAGES === "off") return out;
  await Promise.all([...new Set(urls)].filter((url) => /^https:\/\//i.test(url || "")).map(async (url) => {
    const cached = imageCache.get(url);
    if (cached && cached.at > Date.now() - IMAGE_TTL_MS) { out.set(url, cached.buffer); return; }
    try {
      const response = await fetchImpl(jpegUrl(url), { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(4000) });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !/image\/(jpe?g|png)/i.test(type)) return;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > IMAGE_MAX_BYTES) return;
      imageCache.set(url, { buffer, at: Date.now() });
      if (imageCache.size > 60) imageCache.delete(imageCache.keys().next().value);
      out.set(url, buffer);
    } catch (error) {
      logger.warn("Quotation photo not loaded", { url, error: error.message });
    }
  }));
  return out;
}

export const MEAL_PLANS = { EP: "Room only", CP: "Breakfast", MAP: "Breakfast and dinner", AP: "All meals" };

export function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
export const shortDate = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function dayDate(startDate, dayNumber) {
  return new Date(`${addDays(startDate, dayNumber - 1)}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
      stays.push({ hotelId: line.hotelId, title: line.title, roomType: line.roomType, mealPlan: line.mealPlan, rooms: line.rooms || 1, extraAdults: line.extraAdults || 0, nights: line.nights, checkIn: line.date, checkOut: addDays(line.date, line.nights), dayNumber: line.dayNumber });
    }
  }
  return stays;
}

/** One line of the itinerary in words, without its price. */
export function lineSummary(line, hotels, cabs) {
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

// The city a day is spent in, from the legs.
function cityOfDay(legs, dayNumber) {
  let day = 1;
  let last = "";
  for (const leg of legs || []) {
    if (!leg.nights) continue;
    if (dayNumber >= day && dayNumber < day + leg.nights) return leg.city;
    day += leg.nights;
    last = leg.city;
  }
  return last;
}

const customerTotals = (totals) => ({ subtotalInr: totals.subtotalInr, gstPct: totals.gstPct ?? null, gstInr: totals.gstInr, totalInr: totals.totalInr, perPersonInr: totals.perPersonInr });

/**
 * The presentation of a quotation: brand, cover, route, days, stays, price and terms.
 * `images` maps lower-case city → photo URL (cityImages). Prices are package totals only.
 */
export function presentQuotation({ quotation, supplier = {}, hotels = [], cabTypes = [], variant = "BRAND", agent = null, theme = "HERITAGE", images = new Map() }) {
  const isAgent = variant === "AGENT";
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const cabsById = new Map(cabTypes.map((cab) => [cab.id, cab]));
  const dayText = new Map((quotation.days || []).map((day) => [day.dayNumber, day]));
  const openOptions = (quotation.options || []).length > 1 && !quotation.selectedOption ? quotation.options : [];
  const chosen = quotation.selectedOption || 1;
  const chosenLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (line.option || 1) === chosen);
  const itineraryLines = quotation.lines.filter((line) => line.kind !== "HOTEL" || (!openOptions.length && (line.option || 1) === chosen));
  const stays = hotelStays(chosenLines);
  const dayNumbers = [...new Set([...itineraryLines.map((line) => line.dayNumber), ...dayText.keys()])].sort((a, b) => a - b);
  const lastDay = Math.max(1, ...chosenLines.map((line) => line.dayNumber), ...dayText.keys(),
    ...stays.map((stay) => Math.round((Date.parse(`${stay.checkOut}T00:00:00Z`) - Date.parse(`${quotation.startDate}T00:00:00Z`)) / 86400000) + 1));
  const endDate = addDays(quotation.startDate, lastDay - 1);
  const legs = (quotation.legs || []).filter((leg) => leg.city);
  const fallbackCities = [];
  if (!legs.length) {
    for (const stay of stays) {
      const city = (hotelsById.get(stay.hotelId)?.city || "").trim();
      if (city && !fallbackCities.some((item) => item.city.toLowerCase() === city.toLowerCase())) fallbackCities.push({ city, nights: stay.nights });
    }
  }
  const route = (legs.length ? legs : fallbackCities).map((leg) => ({ city: leg.city, nights: Number(leg.nights) || 0, image: images.get(leg.city.toLowerCase()) || null }));
  const stayView = (stay) => {
    const hotel = hotelsById.get(stay.hotelId);
    return {
      name: hotel?.name || stay.title, city: hotel?.city || null, stars: hotel?.starRating || null,
      room: `${stay.roomType}${stay.rooms > 1 ? ` × ${stay.rooms} rooms` : ", 1 room"}${stay.extraAdults ? ` + ${stay.extraAdults} extra bed${stay.extraAdults === 1 ? "" : "s"}` : ""}`,
      meals: MEAL_PLANS[stay.mealPlan] || stay.mealPlan, nights: stay.nights,
      checkIn: shortDate(stay.checkIn), checkOut: shortDate(stay.checkOut),
    };
  };
  const people = quotation.adults + quotation.children;
  const cars = [...new Set(chosenLines.filter((line) => line.kind === "TRANSPORT").map((line) => cabsById.get(line.cabTypeId)?.name).filter(Boolean))];
  return {
    variant, isAgent, theme,
    brand: isAgent ? null : { name: supplier.company_name || "Your tour operator", phone: supplier.phone || null, email: supplier.email || null },
    ref: quotation.ref, title: quotation.title,
    preparedFor: isAgent ? (agent?.contactName || agent?.name || "your agent") : (!quotation.agentId ? quotation.customerName : null),
    issued: shortDate(new Date().toISOString().slice(0, 10)),
    validUntil: quotation.validUntil ? shortDate(quotation.validUntil) : null,
    heroImage: route.find((leg) => leg.image)?.image || null,
    route, arrivalPoint: quotation.arrivalPoint || null, departurePoint: quotation.departurePoint || null,
    dates: lastDay > 1 ? `${shortDate(quotation.startDate)} to ${shortDate(endDate)}` : shortDate(quotation.startDate),
    duration: lastDay > 1 ? `${lastDay} days / ${lastDay - 1} night${lastDay === 2 ? "" : "s"}` : "1 day",
    travellers: `${quotation.adults} adult${quotation.adults === 1 ? "" : "s"}${quotation.children ? `, ${quotation.children} child${quotation.children === 1 ? "" : "ren"}` : ""}`,
    people, cars,
    days: dayNumbers.map((dayNumber) => {
      const text = dayText.get(dayNumber);
      const city = cityOfDay(legs, dayNumber);
      return {
        dayNumber, date: dayDate(quotation.startDate, dayNumber), title: text?.title || null, description: text?.description || null, city: city || null,
        items: itineraryLines.filter((line) => line.dayNumber === dayNumber).map((line) => ({ kind: line.kind, text: lineSummary(line, hotelsById, cabsById), note: line.description || null })),
      };
    }),
    stays: openOptions.length ? [] : stays.map(stayView),
    options: openOptions.map((option) => ({
      name: option.name,
      stays: hotelStays(quotation.lines.filter((line) => line.kind === "HOTEL" && (line.option || 1) === option.number)).map(stayView),
      totals: customerTotals({ ...option.totals, gstPct: quotation.totals.gstPct }),
    })),
    totals: customerTotals(quotation.totals),
    priceLabel: isAgent ? "Net package price" : "Package price",
    priceNote: isAgent
      ? `Net rates are for your ${agent?.name || "agency"} only and expire with this quotation. Hotels and departures are held only once the booking is confirmed.`
      : `${openOptions.length ? "Each price is" : "The price is"} for the whole group${quotation.totals.gstInr > 0 ? " and includes GST" : ""}. Hotels and departures are held only once the quotation is accepted and confirmed.`,
    inclusions: quotation.inclusions || [], exclusions: quotation.exclusions || [], notes: quotation.notes || null,
  };
}
