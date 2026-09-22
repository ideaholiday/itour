/**
 * Phone numbers as E.164 (`+66812345678`). Mirrors backend/src/lib/phone.js,
 * which is the authority; this copy lets forms show the error before submit.
 */
export const PHONE_COUNTRIES = Object.freeze([
  { iso: "IN", dialCode: "91", name: "India", flag: "🇮🇳", length: 10, mobilePrefix: /^[6-9]/, example: "98765 43210" },
  { iso: "TH", dialCode: "66", name: "Thailand", flag: "🇹🇭", length: 9, mobilePrefix: /^[689]/, example: "81 234 5678" },
  { iso: "AE", dialCode: "971", name: "UAE", flag: "🇦🇪", length: 9, mobilePrefix: /^5/, example: "50 123 4567" },
  { iso: "SG", dialCode: "65", name: "Singapore", flag: "🇸🇬", length: 8, mobilePrefix: /^[89]/, example: "8123 4567" },
]);

export const OTHER_COUNTRY = "OTHER";

const CURRENCY_COUNTRY = { INR: "IN", THB: "TH", AED: "AE", SGD: "SG" };

export function phoneCountry(iso) {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) || null;
}

const COUNTRY_NAME = { India: "IN", Thailand: "TH", "United Arab Emirates": "AE", Singapore: "SG" };

/** The picker's country for a destination's `country` (`Thailand` → `TH`). */
export function phoneCountryForName(name) {
  return COUNTRY_NAME[name] || null;
}

/** The picker's starting country for a traveler browsing in `currency`. */
export function countryForCurrency(currency) {
  return CURRENCY_COUNTRY[currency] || "IN";
}

function nationalNumber(country, digits) {
  const number = digits.startsWith("0") ? digits.slice(1) : digits;
  return number.length === country.length && country.mobilePrefix.test(number) ? number : null;
}

function internationalNumber(digits) {
  const country = PHONE_COUNTRIES.find((candidate) => digits.startsWith(candidate.dialCode));
  if (!country) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  const number = nationalNumber(country, digits.slice(country.dialCode.length));
  return number ? `+${country.dialCode}${number}` : null;
}

/** `+66812345678` for a valid number, otherwise null. See the backend copy. */
export function toE164(value, defaultCountry = "IN") {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) return internationalNumber(digits);
  if (digits.startsWith("00")) return internationalNumber(digits.slice(2));
  const country = phoneCountry(defaultCountry) || phoneCountry("IN");
  const local = nationalNumber(country, digits);
  if (local) return `+${country.dialCode}${local}`;
  return digits.length >= 11 ? internationalNumber(digits) : null;
}

/**
 * Split a stored or typed number into the picker's country and the number box.
 * A number with no `+` is Indian, as the backend reads it.
 */
export function splitPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { iso: null, number: "" };
  if (!raw.startsWith("+") && !raw.startsWith("00")) return { iso: "IN", number: raw };
  const body = raw.replace(/^(\+|00)\s*/, "");
  const country = PHONE_COUNTRIES.find((candidate) => body.replace(/\D/g, "").startsWith(candidate.dialCode));
  if (!country) return { iso: OTHER_COUNTRY, number: raw };
  const number = body.replace(new RegExp(`^${country.dialCode.split("").join("[\\s-]*")}[\\s-]*`), "");
  return { iso: country.iso, number };
}

/** What the form keeps: `+66 081 234 5678`, or the typed text for another country. */
export function joinPhone(iso, number) {
  const country = phoneCountry(iso);
  if (!country || !String(number).trim()) return String(number);
  return `+${country.dialCode} ${number}`;
}
