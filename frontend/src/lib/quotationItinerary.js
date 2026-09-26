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

// What a supplier sets up once before quoting: rate sheets first, then the first quotation.
export function setupSteps({ hotels = [], cabTypes = [], services = [], quotationCount = 0 }) {
  return [
    { key: "hotels", tab: "hotels", label: "Add your hotels and a room rate for each season", done: hotels.some((hotel) => hotel.rates?.length) },
    { key: "cabs", tab: "services", label: "Add the cab types you use, e.g. Sedan, Innova", done: cabTypes.length > 0 },
    { key: "services", tab: "services", label: "Price your transfers, sightseeing and tickets", done: services.some((service) => service.rates?.length) },
    { key: "quote", tab: "quotations", label: "Build your first quotation, day by day", done: quotationCount > 0 },
  ];
}
