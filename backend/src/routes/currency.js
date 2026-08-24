import express from "express";
import { getExchangeRates, getSupportedCurrencies, convertFromInr } from "../services/currencyService.js";

const router = express.Router();

// GET /api/currency/rates - Get live exchange rates relative to INR
router.get("/rates", (_req, res) => {
  res.json({
    success: true,
    data: getExchangeRates(),
  });
});

// GET /api/currency/supported - List all supported currencies
router.get("/supported", (_req, res) => {
  res.json({
    success: true,
    currencies: getSupportedCurrencies(),
  });
});

// GET /api/currency/convert - Convert an INR amount to target currency
router.get("/convert", (req, res) => {
  const amount = Number(req.query.amount) || 0;
  const to = String(req.query.to || "USD").toUpperCase();

  const conversion = convertFromInr(amount, to);
  res.json({
    success: true,
    ...conversion,
  });
});

export default router;
