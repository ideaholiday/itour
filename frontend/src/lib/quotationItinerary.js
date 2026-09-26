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

// The route (legs) as stays: each city's check-in day, counting from day 1.
// Lucknow 2N → Ayodhya 2N gives Lucknow days 1–2 (check-in day 1) and Ayodhya days 3–4 (check-in day 3).
export function legStays(legs = []) {
  let day = 1;
  return legs.filter((leg) => leg.city && String(leg.city).trim()).map((leg, index) => {
    const nights = Math.max(0, Number(leg.nights) || 0);
    const stay = { index, city: String(leg.city).trim(), nights, checkInDay: day };
    day += nights;
    return stay;
  });
}

// The city a day is spent in, from the route: the leg whose nights cover it, or the last city on the day you leave.
export function cityOfDay(legs = [], dayNumber) {
  const stays = legStays(legs);
  const stay = stays.find((item) => dayNumber >= item.checkInDay && dayNumber < item.checkInDay + item.nights) || stays[stays.length - 1];
  return stay?.city || "";
}

// A day title from the route, for days the supplier hasn't written one: arrival, moving on, the city, departure.
export function routeDayTitle(legs = [], dayNumber, lastDay) {
  const stays = legStays(legs).filter((stay) => stay.nights > 0);
  if (!stays.length) return "";
  if (dayNumber === 1) return `Arrive in ${stays[0].city}`;
  const moving = stays.find((stay, index) => index > 0 && stay.checkInDay === dayNumber);
  if (moving) return `${stays[stays.indexOf(moving) - 1].city} to ${moving.city}`;
  if (dayNumber === lastDay) return `Depart from ${stays[stays.length - 1].city}`;
  return cityOfDay(legs, dayNumber);
}

// "Lucknow & Ayodhya 4N/5D" from the route.
export function routeTitle(legs = []) {
  const stays = legStays(legs);
  const nights = stays.reduce((sum, stay) => sum + stay.nights, 0);
  const cities = [...new Set(stays.map((stay) => stay.city))];
  if (!cities.length) return "";
  const names = cities.length > 1 ? `${cities.slice(0, -1).join(", ")} & ${cities[cities.length - 1]}` : cities[0];
  return nights ? `${names} ${nights}N/${nights + 1}D` : names;
}

/**
 * Lays the trip out from its route (ADR 042, legs from migration 075): the trip runs
 * nights + 1 days, each city with nights gets one hotel stay per hotel option on its
 * check-in day for exactly its nights, and days with no text get a title from the route.
 * A stay already on that check-in day keeps its hotel, room and meals; stays that no
 * longer start on a leg's check-in day are dropped. Other lines and written days are kept.
 * `auto` marks a day title the builder wrote, so a later car or activity may replace it.
 */
export function planFromLegs(draft, { cities = [] } = {}) {
  const stays = legStays(draft.legs).filter((stay) => stay.nights > 0);
  if (!stays.length) return { lines: draft.lines, days: draft.days };
  const lastDay = stays[stays.length - 1].checkInDay + stays[stays.length - 1].nights;
  const optionNumbers = (draft.options || []).length >= 2 ? draft.options.map((_, index) => index + 1) : [1];
  const others = (draft.lines || []).filter((line) => line.kind !== "HOTEL");
  const hotels = (draft.lines || []).filter((line) => line.kind === "HOTEL");
  const planned = optionNumbers.flatMap((option) => stays.map((stay) => {
    const date = dayDate(draft.startDate, stay.checkInDay);
    const kept = hotels.find((line) => (Number(line.option) || 1) === option && dayOfLine(line) === stay.checkInDay);
    return { ...(kept || { kind: "HOTEL", title: "Stay", mealPlan: "CP", rooms: 1, adults: draft.adults, children: draft.children }), option, dayNumber: stay.checkInDay, nights: stay.nights, date, checkIn: date, city: stay.city };
  }));
  const written = (draft.days || []).filter((day) => !day.auto && hasText(day));
  const autoDays = Array.from({ length: lastDay }, (_, index) => index + 1)
    .filter((dayNumber) => !written.some((day) => Number(day.dayNumber) === dayNumber))
    .map((dayNumber) => {
      const title = routeDayTitle(draft.legs, dayNumber, lastDay);
      // A day spent in a city takes the city library's day text (ADR 048); arrivals, moves and departures keep the route's.
      const city = title === cityOfDay(draft.legs, dayNumber) ? cityInfo(cities, title) : null;
      return { dayNumber, title: city?.dayTitle || title, description: city?.dayDescription || "", auto: true };
    });
  return { lines: [...planned, ...others], days: [...written, ...autoDays] };
}

// The day's text after picking a car or activity: the service's day text replaces an empty
// day or one the builder wrote (route titles, an earlier service), never the supplier's own.
export function dayAfterService(day, service) {
  if (!service || !(service.dayTitle || service.dayDescription)) return day;
  if (hasText(day) && !day.auto) return day;
  return { ...day, title: service.dayTitle || day.title || "", description: service.dayDescription || "", auto: true };
}

// Hotels, cars and activities in the day's city first, so the right one is at the top of the list.
export const nearestFirst = (items, city) => {
  const key = String(city || "").trim().toLowerCase();
  if (!key) return items;
  const here = (item) => String(item.city || "").trim().toLowerCase() === key;
  return [...items.filter(here), ...items.filter((item) => !here(item))];
};

const cityInfo = (cities, name) => cities.find((city) => String(city.name).toLowerCase() === String(name || "").trim().toLowerCase()) || null;
const TRANSPORT_KINDS = ["TRANSFER", "SIGHTSEEING"];

// The cab for a car line: the smallest one with a price that seats everyone, else the biggest priced one.
function cabFor(service, cabTypes, travelers) {
  const priced = cabTypes.filter((cab) => (service.rates || []).some((rate) => rate.cabTypeId === cab.id)).sort((a, b) => a.seats - b.seats);
  return priced.find((cab) => cab.seats >= travelers) || priced[priced.length - 1] || null;
}

/**
 * A route's cars and activities as quotation lines (ADR 048): each library entry the
 * supplier has on its rate sheet becomes a line on its day; entries it hasn't added
 * come back as `missing`. An entry already on that day isn't added twice.
 */
export function routeItemLines(route, draft, { services = [], cabTypes = [] } = {}) {
  const travelers = (Number(draft.adults) || 0) + (Number(draft.children) || 0);
  const lines = [];
  const missing = [];
  for (const day of route.days || []) {
    for (const itemId of day.itemIds || []) {
      const service = services.find((item) => item.libraryItemId === itemId && item.status === "ACTIVE");
      if (!service) { missing.push({ id: itemId, name: (day.items || []).find((item) => item.id === itemId)?.name || itemId }); continue; }
      if ([...(draft.lines || []), ...lines].some((line) => line.serviceId === service.id && dayOfLine(line) === day.dayNumber)) continue;
      const date = dayDate(draft.startDate, day.dayNumber);
      const car = TRANSPORT_KINDS.includes(service.kind);
      lines.push({ kind: car ? "TRANSPORT" : "ACTIVITY", dayNumber: day.dayNumber, date, checkIn: date, title: service.name, serviceId: service.id,
        cabTypeId: car ? cabFor(service, cabTypes, travelers)?.id || "" : undefined, vehicles: "", adults: "", children: "" });
    }
  }
  return { lines, missing };
}

/**
 * Starts a quotation from a route (ADR 048): its cities and nights, its day text,
 * inclusions and exclusions, one hotel stay per city, and its cars and activities
 * from the supplier's rate sheet. The route's own cars and activities replace the
 * draft's; hotels already picked on a city's check-in day, listings and extras stay.
 */
export function applyRoute(draft, route, { cities = [], services = [], cabTypes = [] } = {}) {
  const legs = (route.legs || []).map((leg) => ({ city: leg.city, nights: Number(leg.nights) || 0 }));
  const days = (route.days || []).filter((day) => day.title || day.description).map((day) => ({ dayNumber: day.dayNumber, title: day.title || "", description: day.description || "", auto: false }));
  const kept = (draft.lines || []).filter((line) => line.kind !== "TRANSPORT" && line.kind !== "ACTIVITY");
  const base = {
    ...draft, legs, days, lines: kept,
    title: String(draft.title || "").trim() ? draft.title : route.name,
    destination: [...new Set(legs.map((leg) => leg.city))].join(", "),
    inclusions: mergeItems(draft.inclusions, route.inclusions || []),
    exclusions: mergeItems(draft.exclusions, route.exclusions || []),
  };
  const planned = { ...base, ...planFromLegs(base, { cities }) };
  const { lines, missing } = routeItemLines(route, planned, { services, cabTypes });
  return { draft: { ...planned, lines: [...planned.lines, ...lines] }, missing };
}

// The quotation as a route of the supplier's own, to reuse (ADR 048). Only library cars and activities carry over.
export function routeFromDraft(draft, services = []) {
  const days = dayRange(draft.lines, draft.days).map((dayNumber) => {
    const text = (draft.days || []).find((day) => Number(day.dayNumber) === dayNumber) || {};
    const itemIds = [...new Set((draft.lines || []).filter((line) => dayOfLine(line) === dayNumber && line.serviceId)
      .map((line) => services.find((service) => service.id === line.serviceId)?.libraryItemId).filter(Boolean))];
    return { dayNumber, title: text.title || null, description: text.description || null, itemIds };
  }).filter((day) => day.title || day.description || day.itemIds.length);
  return {
    name: String(draft.title || "").trim(), legs: legStays(draft.legs).map((stay) => ({ city: stay.city, nights: stay.nights })),
    days, inclusions: cleanItems(draft.inclusions), exclusions: cleanItems(draft.exclusions),
  };
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

// The builder's steps, in order, each with what's still missing (empty when done).
export function builderSteps(draft, { saved = false } = {}) {
  const hotels = (draft.lines || []).filter((line) => line.kind === "HOTEL");
  const days = dayRange(draft.lines, draft.days);
  const titled = new Set((draft.days || []).filter((day) => day.title).map((day) => Number(day.dayNumber)));
  const untitled = days.filter((dayNumber) => !titled.has(dayNumber));
  return [
    { key: "trip", label: draft.forAgent === false ? "Customer & dates" : "Agent & dates", missing: [
      draft.forAgent !== false && !draft.agentId && "the agent",
      !String(draft.title || "").trim() && "a trip title",
      String(draft.customerName || "").trim().length < 2 && (draft.forAgent === false ? "the customer's name" : "the traveller's name"),
      !draft.startDate && "a start date",
    ].filter(Boolean) },
    { key: "route", label: "Route & hotels", missing: [
      !legStays(draft.legs).some((stay) => stay.nights > 0) && "the cities and nights",
      hotels.some((line) => !line.hotelId || !line.roomType) && "a hotel and room for every stay",
    ].filter(Boolean) },
    { key: "days", label: "Day by day", missing: untitled.length ? [`a title for day ${untitled.join(", ")}`] : [] },
    { key: "price", label: "Price & send", missing: saved ? [] : ["save to price it"] },
  ];
}

// Inclusions and exclusions (migration 077) are typed one per line; blank lines and repeats drop out.
export function cleanItems(items = []) {
  const seen = new Set();
  return items.map((item) => String(item || "").trim()).filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
}
export const mergeItems = (current = [], added = []) => cleanItems([...cleanItems(current), ...added]);

const MEALS_INCLUDED = { CP: "Daily breakfast", MAP: "Daily breakfast and dinner", AP: "All meals" };

// What the trip itself includes, read off its items: the stays and meals, the cars, the activities and listings.
export function tripInclusions(draft, { hotels = [], cabTypes = [] } = {}) {
  const lines = (draft.lines || []).filter((line) => line.kind !== "HOTEL" || (Number(line.option) || 1) === 1);
  const stays = lines.filter((line) => line.kind === "HOTEL" && line.hotelId);
  const items = [];
  if (stays.length) {
    const nights = stays.reduce((sum, line) => sum + (Number(line.nights) || 1), 0);
    const cities = [...new Set(stays.map((line) => hotels.find((hotel) => hotel.id === line.hotelId)?.city).filter(Boolean))];
    const multiple = (draft.options || []).length >= 2 ? " in the hotel option you choose" : "";
    items.push(`${nights} night${nights === 1 ? "" : "s"}' stay${cities.length ? ` in ${cities.join(", ")}` : ""}${multiple}`);
    const meals = [...new Set(stays.map((line) => line.mealPlan))];
    if (meals.length === 1 && MEALS_INCLUDED[meals[0]]) items.push(MEALS_INCLUDED[meals[0]]);
  }
  const cabs = [...new Set(lines.filter((line) => line.kind === "TRANSPORT").map((line) => cabTypes.find((cab) => cab.id === line.cabTypeId)?.name).filter(Boolean))];
  if (cabs.length) items.push(`Private ${cabs.join(" / ")} for transfers and sightseeing as per the itinerary`);
  for (const line of lines.filter((item) => (item.kind === "ACTIVITY" || item.kind === "LISTING") && item.title)) items.push(line.title);
  return cleanItems(items);
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
    inclusions: cleanItems(draft.inclusions), exclusions: cleanItems(draft.exclusions),
    days: (draft.days || []).filter((day) => day.title || day.description).map((day) => ({ dayNumber: Number(day.dayNumber), title: day.title || null, description: day.description || null })),
    legs: (draft.legs || []).filter((leg) => leg.city && leg.city.trim()).map((leg) => ({ city: leg.city.trim(), nights: Math.max(0, Number(leg.nights || 0)) })),
    options: (draft.options || []).length >= 2 ? draft.options.map((option, index) => ({ name: option.name.trim() || `Option ${index + 1}` })) : [],
  };
}
