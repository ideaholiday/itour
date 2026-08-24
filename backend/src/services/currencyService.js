/**
 * Multi-Currency Service
 * Manages exchange rates against base INR and provides conversion helpers.
 */

export const SUPPORTED_CURRENCIES = {
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳", decimals: 0, rateToInr: 1.0 },
  USD: { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", decimals: 2, rateToInr: 86.50 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", decimals: 2, rateToInr: 92.80 },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", decimals: 2, rateToInr: 108.90 },
  AED: { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪", decimals: 2, rateToInr: 23.55 },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬", decimals: 2, rateToInr: 64.20 },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", decimals: 2, rateToInr: 55.40 },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", decimals: 2, rateToInr: 61.80 },
};

// In-memory rate cache
let ratesCache = {
  base: "INR",
  lastUpdated: new Date().toISOString(),
  rates: Object.fromEntries(
    Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => [
      code,
      code === "INR" ? 1.0 : Number((1 / info.rateToInr).toFixed(6)),
    ])
  ),
};

export function getSupportedCurrencies() {
  return Object.values(SUPPORTED_CURRENCIES);
}

export function getExchangeRates() {
  return {
    ...ratesCache,
    currencies: SUPPORTED_CURRENCIES,
  };
}

export function convertFromInr(amountInr, targetCurrency = "INR") {
  const numInr = Number(amountInr) || 0;
  const rawCode = String(targetCurrency || "INR").toUpperCase();
  const info = SUPPORTED_CURRENCIES[rawCode] || SUPPORTED_CURRENCIES.INR;
  const currencyCode = SUPPORTED_CURRENCIES[rawCode] ? rawCode : "INR";

  if (currencyCode === "INR") {
    return {
      currency: "INR",
      amount: Math.round(numInr),
      symbol: "₹",
      formatted: `₹${Math.round(numInr).toLocaleString("en-IN")}`,
    };
  }

  const converted = numInr / info.rateToInr;
  const rounded = Number(converted.toFixed(info.decimals));

  return {
    currency: currencyCode,
    amount: rounded,
    symbol: info.symbol,
    formatted: `${info.symbol}${rounded.toLocaleString("en-US", {
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    })}`,
    baseInr: Math.round(numInr),
  };
}
