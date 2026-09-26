// Helpers for editing library routes (ADR 048). Pure, so they can be tested without a browser.

// "Lucknow 2, Ayodhya 2N, Varanasi 2" → [{ city, nights }]; a city without a number gets 1 night.
export function parseLegs(text = "") {
  return String(text).split(/[,→>\n]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(.*?)[\s·-]*(\d+)\s*n?$/i);
    return match && match[1].trim() ? { city: match[1].trim(), nights: Number(match[2]) } : { city: part, nights: 1 };
  });
}

export const formatLegs = (legs = []) => legs.map((leg) => `${leg.city} ${leg.nights}`).join(", ");

// One row per day of the route (nights + 1), keeping text already written for each day number.
export function routeDays(legs = [], days = []) {
  const count = legs.reduce((sum, leg) => sum + (Number(leg.nights) || 0), 0) + 1;
  return Array.from({ length: count }, (_, index) => {
    const dayNumber = index + 1;
    const day = days.find((item) => Number(item.dayNumber) === dayNumber) || {};
    return { dayNumber, title: day.title || "", description: day.description || "", itemIds: day.itemIds || [] };
  });
}
