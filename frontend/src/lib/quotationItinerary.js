// Day-by-day helpers for the package quotation builder (ADR 042). Pure, so they can be tested without a browser.

export const addDays = (date, days) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
export const dayDate = (startDate, dayNumber) => addDays(startDate, (Number(dayNumber) || 1) - 1);
const dayOfLine = (line) => Number(line.dayNumber) || 1;
const hasText = (day) => Boolean(day.title || day.description);

// Every day from 1 to the last one used, so a day with nothing booked still shows as a free day.
export function dayRange(lines = [], days = []) {
  const last = Math.max(1, ...lines.map(dayOfLine), ...days.map((day) => Number(day.dayNumber) || 1));
  return Array.from({ length: last }, (_, index) => index + 1);
}

// The shortest the trip can be without dropping a booked item or a day's text.
export function minTripLength(lines = [], days = []) {
  return Math.max(1, ...lines.map(dayOfLine), ...days.filter(hasText).map((day) => Number(day.dayNumber)));
}

// Sets the trip to `length` days, dropping only empty days past the end.
export function setTripLength(days = [], length) {
  const kept = days.filter((day) => Number(day.dayNumber) <= length);
  return kept.some((day) => Number(day.dayNumber) === length) ? kept : [...kept, { dayNumber: length, title: "", description: "" }];
}

// Moves every day after `afterDay` by `by` days, with its items and their dates.
function shiftAfter({ lines = [], days = [] }, afterDay, by) {
  const move = (date) => (date ? addDays(date, by) : date);
  return {
    lines: lines.map((line) => (dayOfLine(line) > afterDay ? { ...line, dayNumber: dayOfLine(line) + by, date: move(line.date), checkIn: move(line.checkIn) } : line)),
    days: days.map((day) => (Number(day.dayNumber) > afterDay ? { ...day, dayNumber: Number(day.dayNumber) + by } : day)),
  };
}

// Adds an empty day after `afterDay`; later days move one day later.
export const insertDayAfter = (draft, afterDay) => shiftAfter(draft, afterDay, 1);

// Removes a day and its items; later days move one day earlier.
export function removeDay({ lines = [], days = [] }, dayNumber) {
  return shiftAfter({ lines: lines.filter((line) => dayOfLine(line) !== dayNumber), days: days.filter((day) => Number(day.dayNumber) !== dayNumber) }, dayNumber, -1);
}

// Meal plans the chosen room has a rate for; the line's own plan stays listed so an old quotation still shows it.
export function mealPlansFor(hotel, roomType, current, allPlans) {
  if (!hotel || !roomType) return allPlans;
  const rated = new Set(hotel.rates.filter((rate) => rate.roomType === roomType).map((rate) => rate.mealPlan));
  if (current) rated.add(current);
  return allPlans.filter((plan) => rated.has(plan));
}

// The first night of the stay with no contracted rate, or null when every night is covered.
// The server prices a hotel line night by night and refuses the whole quotation if any night
// has no matching room + meal-plan rate for its date, so a hotel with a gap silently stays at
// ₹0 and out of the total until it is fixed. This flags the gap on the line before saving.
export function hotelRateGap(hotel, line) {
  if (!hotel || !line?.hotelId || !line.roomType || !line.mealPlan) return null;
  const checkIn = line.checkIn || line.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || "")) return null;
  const nights = Number(line.nights) || 1;
  const covers = (date) => (hotel.rates || []).some((rate) =>
    String(rate.roomType).toLowerCase() === String(line.roomType).toLowerCase()
    && rate.mealPlan === line.mealPlan && rate.validFrom <= date && rate.validTo >= date);
  for (let night = 0; night < nights; night += 1) {
    const date = addDays(checkIn, night);
    if (!covers(date)) return date;
  }
  return null;
}

// What a supplier sets up once before quoting: rate sheets first, then the first quotation.
export function setupSteps({ hotels = [], cabTypes = [], services = [], quotationCount = 0 }) {
  return [
    { key: "hotels", tab: "hotels", label: "Add your hotels and a room rate for each season", done: hotels.some((hotel) => hotel.rates?.length) },
    { key: "cabs", tab: "services", label: "Add the cab types you use, e.g. Sedan, Innova", done: cabTypes.length > 0 },
    { key: "services", tab: "services", label: "Price your transfers, sightseeing and tickets", done: services.some((service) => service.rates?.length) },
    { key: "quote", tab: "quotations", label: "Build your first quotation, day by day", done: quotationCount > 0 },
  ];
}

const count = (value) => (value === "" || value == null ? null : Number(value));

// What the server needs for each line; prices are always worked out on the server.
export function linePayload(line) {
  const base = { kind: line.kind, dayNumber: Number(line.dayNumber) || 1, title: line.title || (line.kind === "HOTEL" ? "Stay" : "Item"), description: line.description || null };
  if (line.kind === "HOTEL") return { ...base, option: Number(line.option) || 1, hotelId: line.hotelId, roomType: line.roomType, mealPlan: line.mealPlan, checkIn: line.checkIn || line.date, nights: Number(line.nights) || 1, rooms: Number(line.rooms) || 1, extraAdults: Number(line.extraAdults) || 0, children: Number(line.children) || 0 };
  if (line.kind === "LISTING") return { ...base, productId: line.productId, productOptionId: line.productOptionId || null, date: line.date, pickupTime: line.pickupTime || null, adults: Number(line.adults) || 1, children: Number(line.children) || 0 };
  // Rate-sheet lines: an empty count follows the quotation's travelers, and an empty cab count means enough cabs for everyone.
  if (line.kind === "TRANSPORT") return { ...base, title: line.title || null, serviceId: line.serviceId, cabTypeId: line.cabTypeId, date: line.date, vehicles: count(line.vehicles), km: count(line.km), carDays: count(line.carDays), adults: count(line.adults), children: count(line.children) };
  if (line.kind === "ACTIVITY") return { ...base, title: line.title || null, serviceId: line.serviceId, date: line.date, adults: count(line.adults), children: count(line.children) };
  return { ...base, date: line.date || null, amountInr: Number(line.amountInr) || 0 };
}

// The quotation as the server takes it. Named fields only: a loaded quotation also carries
// read-only ones (totals, trip, warnings, ...) that the server's strict schema rejects.
export function quotationPayload(draft) {
  return {
    title: draft.title, destination: draft.destination || null, customerName: draft.customerName,
    customerEmail: draft.customerEmail || null, customerPhone: draft.customerPhone || null, agentId: draft.agentId || null,
    startDate: draft.startDate, adults: Number(draft.adults), children: Number(draft.children), markupPct: Number(draft.markupPct),
    notes: draft.notes || null, validUntil: draft.validUntil || null, lines: (draft.lines || []).map(linePayload),
    days: (draft.days || []).filter((day) => day.title || day.description).map((day) => ({ dayNumber: Number(day.dayNumber), title: day.title || null, description: day.description || null })),
    options: (draft.options || []).length >= 2 ? draft.options.map((option, index) => ({ name: option.name.trim() || `Option ${index + 1}` })) : [],
  };
}
