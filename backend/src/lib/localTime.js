/**
 * Trip dates and times are wall-clock times in the product's city (ADR 023):
 * a Bangkok supplier's 09:00 is 09:00 in Bangkok. Every country we sell in has
 * one time zone and no daylight saving, so a fixed UTC offset is exact.
 */
export const COUNTRY_TIME = Object.freeze({
  India: Object.freeze({ timeZone: "Asia/Kolkata", offset: "+05:30", label: "IST" }),
  Thailand: Object.freeze({ timeZone: "Asia/Bangkok", offset: "+07:00", label: "ICT" }),
  "United Arab Emirates": Object.freeze({ timeZone: "Asia/Dubai", offset: "+04:00", label: "GST" }),
  Singapore: Object.freeze({ timeZone: "Asia/Singapore", offset: "+08:00", label: "SGT" }),
  // Western Indonesia time; cities in other zones are listed in CITY_TIME.
  Indonesia: Object.freeze({ timeZone: "Asia/Jakarta", offset: "+07:00", label: "WIB" }),
  Maldives: Object.freeze({ timeZone: "Indian/Maldives", offset: "+05:00", label: "MVT" }),
  Bhutan: Object.freeze({ timeZone: "Asia/Thimphu", offset: "+06:00", label: "BTT" }),
});

/** Cities whose zone differs from their country's (ADR 024): Bali is on Central Indonesia time. */
export const CITY_TIME = Object.freeze({
  bali: Object.freeze({ timeZone: "Asia/Makassar", offset: "+08:00", label: "WITA" }),
  denpasar: Object.freeze({ timeZone: "Asia/Makassar", offset: "+08:00", label: "WITA" }),
});

export const INDIA_TIME = COUNTRY_TIME.India;

export function countryTime(country) {
  return COUNTRY_TIME[country] || INDIA_TIME;
}

/** The time zone of a catalogue city; India when the city (or the country column) is unknown. */
export function cityTime(db, city) {
  if (!db || !city) return INDIA_TIME;
  const own = CITY_TIME[String(city).trim().toLowerCase()];
  if (own) return own;
  try {
    const row = db.prepare("SELECT country FROM destinations WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(city).trim());
    return countryTime(row?.country);
  } catch {
    return INDIA_TIME;
  }
}

/** The time zone a product's departures run in. Pass a Map as `cache` when looking up many. */
export function productTime(db, productId, cache = null) {
  if (!db || !productId) return INDIA_TIME;
  if (cache?.has(productId)) return cache.get(productId);
  let time = INDIA_TIME;
  try {
    time = cityTime(db, db.prepare("SELECT city FROM products WHERE id = ?").get(productId)?.city);
  } catch {
    time = INDIA_TIME;
  }
  cache?.set(productId, time);
  return time;
}

/** Epoch milliseconds of a local date (`2026-09-20`) and 24-hour time (`09:00`) in `time`. */
export function localDateTimeMs(localDate, localTime = "09:00", time = INDIA_TIME) {
  return Date.parse(`${localDate}T${localTime || "09:00"}:00${time.offset}`);
}

/** Today's date (`YYYY-MM-DD`) in `time`. */
export function localDate(now = new Date(), time = INDIA_TIME) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: time.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A 24-hour clock reading such as `09:00` for an instant, in `time`. */
export function localClock(ms, time = INDIA_TIME) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: time.timeZone });
}
