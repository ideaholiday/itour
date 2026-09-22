import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

export const DEFAULT_CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳", decimals: 0, rateToInr: 1.0 },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", decimals: 2, rateToInr: 86.50 },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", decimals: 2, rateToInr: 92.80 },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", decimals: 2, rateToInr: 108.90 },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪", decimals: 2, rateToInr: 23.55 },
  { code: "THB", symbol: "฿", name: "Thai Baht", flag: "🇹🇭", decimals: 0, rateToInr: 2.87 },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬", decimals: 2, rateToInr: 78 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", decimals: 2, rateToInr: 55.40 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", decimals: 2, rateToInr: 61.80 },
];

/** The display rate in rupees, e.g. `1 THB = ₹2.87`; empty for INR or a missing rate. */
export function rateToInrLabel(info) {
  const rate = Number(info?.rateToInr);
  if (!info || info.code === "INR" || !(rate > 0)) return "";
  return `1 ${info.code} = ₹${rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CurrencyContext = createContext({
  currency: "INR",
  setCurrency: () => {},
  currencies: DEFAULT_CURRENCIES,
  rates: {},
  rateLabel: "",
  formatPrice: (val) => `₹${Number(val || 0).toLocaleString("en-IN")}`,
  convertPrice: (val) => ({ amount: Number(val || 0), symbol: "₹", formatted: `₹${Number(val || 0).toLocaleString("en-IN")}` }),
});

const STORAGE_KEY = "idea_holiday_currency_pref";

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "INR";
    } catch {
      return "INR";
    }
  });

  const [currencyList, setCurrencyList] = useState(DEFAULT_CURRENCIES);
  const [ratesData, setRatesData] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/currency/rates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.success && data?.data) {
          setRatesData(data.data);
          if (data.data.currencies) {
            setCurrencyList(Object.values(data.data.currencies));
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const setCurrency = (code) => {
    const next = String(code || "INR").toUpperCase();
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const currencyMap = useMemo(() => {
    return Object.fromEntries(currencyList.map((c) => [c.code, c]));
  }, [currencyList]);

  const convertPrice = (amountInr) => {
    const val = Number(amountInr) || 0;
    const current = currencyMap[currency] || currencyMap.INR || DEFAULT_CURRENCIES[0];

    if (currency === "INR" || !current.rateToInr || current.rateToInr <= 0) {
      return {
        amount: Math.round(val),
        symbol: "₹",
        formatted: `₹${Math.round(val).toLocaleString("en-IN")}`,
        currency: "INR",
        baseInr: Math.round(val),
      };
    }

    const converted = val / current.rateToInr;
    const rounded = Number(converted.toFixed(current.decimals));
    return {
      amount: rounded,
      symbol: current.symbol,
      formatted: `${current.symbol}${rounded.toLocaleString("en-US", {
        minimumFractionDigits: current.decimals,
        maximumFractionDigits: current.decimals,
      })}`,
      currency: current.code,
      baseInr: Math.round(val),
    };
  };

  const formatPrice = (amountInr, options = {}) => {
    const res = convertPrice(amountInr);
    if (options.showInrFallback && currency !== "INR") {
      return `${res.formatted} (₹${Math.round(Number(amountInr) || 0).toLocaleString("en-IN")})`;
    }
    return res.formatted;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        currencies: currencyList,
        rates: ratesData?.rates || {},
        rateLabel: rateToInrLabel(currencyMap[currency]),
        convertPrice,
        formatPrice,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
