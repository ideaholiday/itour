/**
 * Trip dates and times are wall-clock times in the product's city (ADR 023):
 * a Bangkok supplier's 09:00 is 09:00 in Bangkok. Asian zones have no daylight
 * saving, so their fixed `offset` is exact. European zones (`dst: true`, ADR 024)
 * change offset in summer; read them with `offsetOn`, never `.offset`.
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
  Japan: Object.freeze({ timeZone: "Asia/Tokyo", offset: "+09:00", label: "JST" }),
  Vietnam: Object.freeze({ timeZone: "Asia/Ho_Chi_Minh", offset: "+07:00", label: "ICT" }),
  Nepal: Object.freeze({ timeZone: "Asia/Kathmandu", offset: "+05:45", label: "NPT" }),
  // Europe (ADR 024): `offset` is the winter one; summer time comes from offsetOn.
  France: Object.freeze({ timeZone: "Europe/Paris", offset: "+01:00", label: "CET/CEST", dst: true }),
  Switzerland: Object.freeze({ timeZone: "Europe/Zurich", offset: "+01:00", label: "CET/CEST", dst: true }),
  Italy: Object.freeze({ timeZone: "Europe/Rome", offset: "+01:00", label: "CET/CEST", dst: true }),
  "United Kingdom": Object.freeze({ timeZone: "Europe/London", offset: "+00:00", label: "GMT/BST", dst: true }),
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

// The zone's UTC offset (`+02:00`) at an instant.
function offsetAt(timeZone, ms) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return match ? `${match[1]}${match[2]}:${match[3] || "00"}` : "+00:00";
}

/**
 * The UTC offset in force at a local date and time in `time`: the fixed offset
 * outside Europe, and winter or summer time in Europe (ADR 024).
 */
export function offsetOn(time = INDIA_TIME, localDate, localTime = "09:00") {
  if (!time.dst || !localDate) return time.offset;
  const wall = `${localDate}T${localTime || "09:00"}:00`;
  // Guess with the winter offset, then correct once with the offset at that instant.
  const guess = offsetAt(time.timeZone, Date.parse(`${wall}${time.offset}`));
  return offsetAt(time.timeZone, Date.parse(`${wall}${guess}`));
}

/** Epoch milliseconds of a local date (`2026-09-20`) and 24-hour time (`09:00`) in `time`. */
export function localDateTimeMs(localDate, localTime = "09:00", time = INDIA_TIME) {
  return Date.parse(`${localDate}T${localTime || "09:00"}:00${offsetOn(time, localDate, localTime)}`);
}

/** Today's date (`YYYY-MM-DD`) in `time`. */
export function localDate(now = new Date(), time = INDIA_TIME) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: time.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A 24-hour clock reading such as `09:00` for an instant, in `time`. */
export function localClock(ms, time = INDIA_TIME) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: time.timeZone });
}
