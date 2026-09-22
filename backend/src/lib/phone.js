/**
 * Phone numbers for WhatsApp and SMS, as E.164 (`+<country code><number>`).
 * Numbers in the countries we sell in are checked against that country's mobile
 * format; any other country code is accepted on length alone.
 */
export const PHONE_COUNTRIES = Object.freeze([
  { iso: "IN", dialCode: "91", name: "India", length: 10, mobilePrefix: /^[6-9]/ },
  { iso: "TH", dialCode: "66", name: "Thailand", length: 9, mobilePrefix: /^[689]/ },
  { iso: "AE", dialCode: "971", name: "United Arab Emirates", length: 9, mobilePrefix: /^5/ },
  { iso: "SG", dialCode: "65", name: "Singapore", length: 8, mobilePrefix: /^[89]/ },
  // Indonesian mobiles are 9 to 12 digits after the trunk 0 (0812 3456 7890).
  { iso: "ID", dialCode: "62", name: "Indonesia", length: 9, maxLength: 12, mobilePrefix: /^8/ },
  { iso: "MV", dialCode: "960", name: "Maldives", length: 7, mobilePrefix: /^[79]/ },
  { iso: "BT", dialCode: "975", name: "Bhutan", length: 8, mobilePrefix: /^(17|77)/ },
  { iso: "JP", dialCode: "81", name: "Japan", length: 10, mobilePrefix: /^[789]0/ },
  { iso: "VN", dialCode: "84", name: "Vietnam", length: 9, mobilePrefix: /^[35789]/ },
  { iso: "NP", dialCode: "977", name: "Nepal", length: 10, mobilePrefix: /^9[78]/ },
]);

/** Look a country up by ISO code (`TH`) or dial code (`66`, `+66`). */
export function phoneCountry(code) {
  const value = String(code || "").trim().toUpperCase();
  const digits = value.replace(/\D/g, "");
  return PHONE_COUNTRIES.find((country) => country.iso === value || (digits && country.dialCode === digits)) || null;
}

// A local number drops its trunk 0: Thai 081 234 5678 is +66 81 234 5678.
function nationalNumber(country, digits) {
  const number = digits.startsWith("0") ? digits.slice(1) : digits;
  const fits = number.length >= country.length && number.length <= (country.maxLength || country.length);
  return fits && country.mobilePrefix.test(number) ? number : null;
}

function internationalNumber(digits) {
  const country = PHONE_COUNTRIES.find((candidate) => digits.startsWith(candidate.dialCode));
  if (!country) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  const number = nationalNumber(country, digits.slice(country.dialCode.length));
  return number ? `+${country.dialCode}${number}` : null;
}

/**
 * `+66812345678` for a valid number, otherwise null. A number typed with `+` or
 * `00` keeps its own country code; one typed without is read as a local number
 * in `defaultCountry` (ISO or dial code, India when unknown).
 */
export function toE164(value, defaultCountry = "IN") {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) return internationalNumber(digits);
  if (digits.startsWith("00")) return internationalNumber(digits.slice(2));
  const country = phoneCountry(defaultCountry) || phoneCountry("IN");
  const local = nationalNumber(country, digits);
  if (local) return `+${country.dialCode}${local}`;
  // Typed with its country code but no "+", e.g. 919876543210.
  return digits.length >= 11 ? internationalNumber(digits) : null;
}

export const PHONE_FORMAT_HINT = "Enter a valid mobile number. Outside India, include the country code, for example +66 81 234 5678 or +971 50 123 4567.";
