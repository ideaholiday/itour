import express from "express";
import db from "../db.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import logger from "../config/logger.js";
import {
  getDailyOverview,
  getBookingTrends,
  getCohortRetention,
  getSupplierPerformance,
  getRevenueBreakdown,
  getConversionFunnel,
  getAnomalyAlerts
} from "../services/analyticsService.js";

const router = express.Router();
router.use(authenticate, requireRoles("ADMIN"));

// GET /api/analytics/overview?days=30
router.get("/overview", (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = getDailyOverview(db, { days });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics overview failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

// GET /api/analytics/trends?days=90&groupBy=day
router.get("/trends", (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 90;
    const groupBy = ["day", "week", "month"].includes(req.query.groupBy) ? req.query.groupBy : "day";
    const data = getBookingTrends(db, { days, groupBy });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics trends failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch analytics trends" });
  }
});

// GET /api/analytics/cohorts?months=6
router.get("/cohorts", (req, res) => {
  try {
    const months = parseInt(req.query.months, 10) || 6;
    const data = getCohortRetention(db, { months });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics cohorts failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch cohort analysis" });
  }
});

// GET /api/analytics/suppliers?days=90&limit=20
router.get("/suppliers", (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 90;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const data = getSupplierPerformance(db, { days, limit });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics suppliers failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch supplier performance" });
  }
});

// GET /api/analytics/revenue?days=30
router.get("/revenue", (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = getRevenueBreakdown(db, { days });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics revenue failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch revenue breakdown" });
  }
});

// GET /api/analytics/funnel?days=30
router.get("/funnel", (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const data = getConversionFunnel(db, { days });
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics funnel failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch conversion funnel" });
  }
});

// GET /api/analytics/alerts
router.get("/alerts", (req, res) => {
  try {
    const data = getAnomalyAlerts(db);
    res.json({ success: true, data });
  } catch (err) {
    logger.error("Analytics alerts failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch anomaly alerts" });
  }
});

export default router;
