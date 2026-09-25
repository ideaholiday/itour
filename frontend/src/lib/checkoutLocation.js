// Checkout location gates. These mirror the backend rules in
// backend/src/services/locationValidationService.js so the browser never
// blocks a booking the server would accept, and explains the ones it would not.

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Same pattern as validateFlight(): an airline code + number (6E-2134, AI 864).
// Indian train numbers (five digits, e.g. 12004) also match.
const TRAVEL_NUMBER = /^[A-Z0-9]{2}[- ]?\d{1,4}$/i;

export function isValidTravelNumber(value) {
  return TRAVEL_NUMBER.test(String(value || "").trim());
}

/**
 * Whether a typed address without a confirmed map pin can be booked against a
 * product location rule. The server accepts it (and flags ops review) unless
 * the rule is a fixed terminal, provided the text names the rule's city or state.
 */
export function typedAddressAccepted(rule, address) {
  const text = normalized(address);
  if (text.length < 3) return false;
  if (!rule) return true;
  if (String(rule.mode || "").toUpperCase() === "FIXED_LOCATION") return false;
  const city = normalized(rule.allowedCity);
  const state = normalized(rule.allowedState);
  if (!city && !state) return true;
  return Boolean((city && text.includes(city)) || (state && text.includes(state)));
}
