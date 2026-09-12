import { Router } from "express";
import db from "../db.js";
import {
  getOctoCapabilities,
  getOctoSuppliers,
  getOctoProducts,
  getOctoProduct,
  getOctoAvailability,
  createOctoReservation,
  confirmOctoReservation,
  cancelOctoReservation,
} from "../services/octoService.js";
import logger from "../config/logger.js";

const router = Router();

// GET /octo/capabilities or /api/octo/capabilities
router.get("/capabilities", (req, res) => {
  res.json(getOctoCapabilities());
});

// GET /octo/suppliers or /api/octo/suppliers
router.get("/suppliers", (req, res) => {
  try {
    const suppliers = getOctoSuppliers(db);
    res.json(suppliers);
  } catch (err) {
    logger.error("OCTo getSuppliers error", { error: err.message });
    res.status(500).json({ error: "Failed to list suppliers", code: "INTERNAL_ERROR" });
  }
});

// GET /octo/products or /api/octo/products
router.get("/products", (req, res) => {
  try {
    const supplierId = req.query.supplierId || null;
    const products = getOctoProducts(db, { supplierId });
    res.json(products);
  } catch (err) {
    logger.error("OCTo getProducts error", { error: err.message });
    res.status(500).json({ error: "Failed to list products", code: "INTERNAL_ERROR" });
  }
});

// GET /octo/products/:id or /api/octo/products/:id
router.get("/products/:id", (req, res) => {
  try {
    const product = getOctoProduct(db, req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found", code: "PRODUCT_NOT_FOUND" });
    }
    res.json(product);
  } catch (err) {
    logger.error("OCTo getProduct error", { productId: req.params.id, error: err.message });
    res.status(500).json({ error: "Failed to get product", code: "INTERNAL_ERROR" });
  }
});

// POST /octo/availability or /api/octo/availability
router.post("/availability", (req, res) => {
  try {
    const { productId, optionId, localDateStart, localDateEnd } = req.body;
    if (!productId || !localDateStart) {
      return res.status(400).json({ error: "productId and localDateStart required", code: "BAD_REQUEST" });
    }
    const availability = getOctoAvailability(db, { productId, optionId, localDateStart, localDateEnd });
    res.json(availability);
  } catch (err) {
    logger.error("OCTo availability error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch availability", code: "INTERNAL_ERROR" });
  }
});

// POST /octo/bookings/reservation or /api/octo/bookings/reservation
router.post("/bookings/reservation", (req, res) => {
  try {
    const reservation = createOctoReservation(db, req.body);
    res.status(201).json(reservation);
  } catch (err) {
    logger.error("OCTo reservation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to create reservation", code: err.code || "RESERVATION_FAILED" });
  }
});

// POST /octo/bookings/confirmation or /api/octo/bookings/confirmation
router.post("/bookings/confirmation", (req, res) => {
  try {
    const confirmation = confirmOctoReservation(db, req.body);
    res.json(confirmation);
  } catch (err) {
    logger.error("OCTo confirmation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to confirm reservation", code: err.code || "CONFIRMATION_FAILED" });
  }
});

// POST /octo/bookings/cancellation or /api/octo/bookings/cancellation
router.post("/bookings/cancellation", (req, res) => {
  try {
    const cancellation = cancelOctoReservation(db, req.body);
    res.json(cancellation);
  } catch (err) {
    logger.error("OCTo cancellation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to cancel reservation", code: err.code || "CANCELLATION_FAILED" });
  }
});

// GET /octo/bookings/:id or /api/octo/bookings/:id
router.get("/bookings/:id", (req, res) => {
  try {
    const reservation = db.prepare("SELECT * FROM native_reservations WHERE id = ? OR owner_id = ?").get(req.params.id, `octo_${req.params.id}`);
    if (!reservation) {
      return res.status(404).json({ error: "Booking not found", code: "BOOKING_NOT_FOUND" });
    }
    const status = reservation.status === "ON_HOLD" && Date.parse(reservation.utc_expires_at) <= Date.now()
      ? "EXPIRED"
      : reservation.status;

    res.json({
      id: reservation.id,
      uuid: reservation.id,
      status,
      utcCreatedAt: reservation.created_at,
      utcExpiresAt: status === "ON_HOLD" ? reservation.utc_expires_at : null,
      availabilitySlot: reservation.availability_slot,
      adults: reservation.adults,
      children: reservation.children,
    });
  } catch (err) {
    logger.error("OCTo getBooking error", { error: err.message });
    res.status(500).json({ error: "Failed to retrieve booking", code: "INTERNAL_ERROR" });
  }
});

export default router;
