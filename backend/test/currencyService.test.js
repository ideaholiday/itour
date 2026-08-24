import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSupportedCurrencies,
  getExchangeRates,
  convertFromInr,
  SUPPORTED_CURRENCIES,
} from "../src/services/currencyService.js";

describe("Multi-Currency Service", () => {
  it("provides complete supported currency metadata", () => {
    const currencies = getSupportedCurrencies();
    assert.ok(currencies.length >= 8);

    const codes = currencies.map((c) => c.code);
    assert.ok(codes.includes("INR"));
    assert.ok(codes.includes("USD"));
    assert.ok(codes.includes("EUR"));
    assert.ok(codes.includes("GBP"));
    assert.ok(codes.includes("AED"));
    assert.ok(codes.includes("SGD"));
    assert.ok(codes.includes("AUD"));
    assert.ok(codes.includes("CAD"));

    const inr = currencies.find((c) => c.code === "INR");
    assert.equal(inr.symbol, "₹");
    assert.equal(inr.rateToInr, 1.0);
    assert.equal(inr.decimals, 0);
  });

  it("returns exchange rate mappings relative to INR", () => {
    const ratesData = getExchangeRates();
    assert.equal(ratesData.base, "INR");
    assert.ok(ratesData.rates.INR === 1.0);
    assert.ok(ratesData.rates.USD > 0 && ratesData.rates.USD < 1);
    assert.ok(ratesData.rates.EUR > 0 && ratesData.rates.EUR < 1);
    assert.ok(ratesData.rates.GBP > 0 && ratesData.rates.GBP < 1);
  });

  it("converts INR amounts accurately to foreign currencies", () => {
    // 8650 INR -> approx 100 USD (at 86.50 rate)
    const usd = convertFromInr(8650, "USD");
    assert.equal(usd.currency, "USD");
    assert.equal(usd.symbol, "$");
    assert.equal(usd.amount, 100);
    assert.equal(usd.formatted, "$100.00");
    assert.equal(usd.baseInr, 8650);

    // 9280 INR -> approx 100 EUR (at 92.80 rate)
    const eur = convertFromInr(9280, "EUR");
    assert.equal(eur.currency, "EUR");
    assert.equal(eur.symbol, "€");
    assert.equal(eur.amount, 100);
    assert.equal(eur.formatted, "€100.00");

    // 10890 INR -> approx 100 GBP (at 108.90 rate)
    const gbp = convertFromInr(10890, "GBP");
    assert.equal(gbp.currency, "GBP");
    assert.equal(gbp.symbol, "£");
    assert.equal(gbp.amount, 100);
    assert.equal(gbp.formatted, "£100.00");

    // Native INR formatting
    const inr = convertFromInr(4500, "INR");
    assert.equal(inr.currency, "INR");
    assert.equal(inr.amount, 4500);
    assert.equal(inr.symbol, "₹");
    assert.equal(inr.formatted, "₹4,500");
  });

  it("gracefully falls back to INR for unknown currencies or zero amounts", () => {
    const unknown = convertFromInr(5000, "XYZ");
    assert.equal(unknown.currency, "INR");
    assert.equal(unknown.amount, 5000);

    const zero = convertFromInr(0, "USD");
    assert.equal(zero.amount, 0);
    assert.equal(zero.formatted, "$0.00");
  });
});
