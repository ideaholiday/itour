import { Router } from "express";
import db from "../db.js";
import { authenticate } from "../middleware/auth.js";
import {
  listSupplierChannels,
  connectSupplierChannel,
  disconnectSupplierChannel,
  fetchRemoteChannelProducts,
  importRemoteProducts,
} from "../services/channelManagerService.js";
import logger from "../config/logger.js";
import { supplierMay } from "../services/supplierStaffService.js";

const router = Router();
router.use(authenticate);

function getSupplierId(req) {
  const user = req.user;
  if (!user) return null;
  if (user.role === "ADMIN" || user.role === "STAFF") {
    return req.query.supplierId || req.params.supplierId || user.supplier_id;
  }
  // Channel connections are manager work (ADR 036).
  return supplierMay(user, "manage") ? user.supplier_id : null;
}

// GET /api/supplier-channels or /api/suppliers/:id/channels
router.get("/", (req, res) => {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    return res.status(403).json({ error: "Supplier context required" });
  }

  try {
    const channels = listSupplierChannels(db, supplierId);
    res.json({ success: true, channels });
  } catch (err) {
    logger.error("List supplier channels error", { error: err.message, supplierId });
    res.status(500).json({ error: "Failed to list channels" });
  }
});

// POST /api/supplier-channels
router.post("/", async (req, res) => {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    return res.status(403).json({ error: "Supplier context required" });
  }

  const { channelName, channelTitle, endpointUrl, credentials } = req.body;
  if (!channelName) {
    return res.status(400).json({ error: "channelName is required" });
  }

  try {
    const connection = await connectSupplierChannel(db, {
      supplierId,
      channelName,
      channelTitle,
      endpointUrl,
      credentials: credentials || {},
    });
    res.status(201).json({ success: true, connection });
  } catch (err) {
    logger.error("Connect supplier channel error", { error: err.message, supplierId, channelName });
    res.status(400).json({ error: err.message || "Failed to connect channel" });
  }
});

// DELETE /api/supplier-channels/:channelId
router.delete("/:channelId", (req, res) => {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    return res.status(403).json({ error: "Supplier context required" });
  }

  try {
    const result = disconnectSupplierChannel(db, {
      supplierId,
      connectionId: req.params.channelId,
    });
    res.json(result);
  } catch (err) {
    logger.error("Disconnect supplier channel error", { error: err.message });
    res.status(err.status || 500).json({ error: err.message || "Failed to disconnect channel" });
  }
});

// GET /api/supplier-channels/:channelId/fetch-products
router.get("/:channelId/fetch-products", async (req, res) => {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    return res.status(403).json({ error: "Supplier context required" });
  }

  try {
    const products = await fetchRemoteChannelProducts(db, {
      supplierId,
      connectionId: req.params.channelId,
    });
    res.json({ success: true, products });
  } catch (err) {
    logger.error("Fetch remote products error", { error: err.message });
    res.status(400).json({ error: err.message || "Failed to fetch remote products" });
  }
});

// POST /api/supplier-channels/:channelId/import
router.post("/:channelId/import", async (req, res) => {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    return res.status(403).json({ error: "Supplier context required" });
  }

  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "products array is required" });
  }

  try {
    const result = await importRemoteProducts(db, {
      supplierId,
      connectionId: req.params.channelId,
      productsToImport: products,
    });
    res.json(result);
  } catch (err) {
    logger.error("Import remote products error", { error: err.message });
    res.status(400).json({ error: err.message || "Failed to import products" });
  }
});

export default router;
