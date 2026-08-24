import express from "express";
import db from "../db.js";
import { AddonService } from "../services/addonService.js";
import { optionalAuthenticate, authenticate } from "../middleware/auth.js";
import logger from "../config/logger.js";

const router = express.Router();

// List active add-ons
router.get("/addons", optionalAuthenticate, (req, res) => {
  try {
    const productId = req.query.productId || null;
    const addons = AddonService.getProductAddons(db, productId);
    return res.json({ success: true, addons });
  } catch (err) {
    logger.error("Failed to list addons", { error: err.message });
    return res.status(500).json({ error: "FAILED_TO_FETCH_ADDONS" });
  }
});

// List addons for a specific product
router.get("/products/:productId/addons", optionalAuthenticate, (req, res) => {
  try {
    const { productId } = req.params;
    const addons = AddonService.getProductAddons(db, productId);
    return res.json({ success: true, productId, addons });
  } catch (err) {
    logger.error("Failed to fetch product addons", { error: err.message, productId: req.params.productId });
    return res.status(500).json({ error: "FAILED_TO_FETCH_PRODUCT_ADDONS" });
  }
});

// Validate and calculate add-on subtotal
router.post("/addons/calculate", optionalAuthenticate, (req, res) => {
  try {
    const { selectedAddonIds, travelersCount } = req.body || {};
    const calculation = AddonService.validateAndCalculateAddons(db, selectedAddonIds, travelersCount);
    return res.json({ success: true, ...calculation });
  } catch (err) {
    logger.error("Failed to calculate addons", { error: err.message });
    return res.status(400).json({ error: "FAILED_TO_CALCULATE_ADDONS" });
  }
});

// Create new custom add-on
router.post("/addons", authenticate, (req, res) => {
  try {
    const addon = AddonService.createProductAddon(db, req.body);
    return res.status(201).json({ success: true, addon });
  } catch (err) {
    logger.error("Failed to create addon", { error: err.message });
    return res.status(400).json({ error: err.message || "FAILED_TO_CREATE_ADDON" });
  }
});

export default router;
