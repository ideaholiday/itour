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
  getOctoBooking,
} from "../services/octoService.js";
import { optionalApiPartner, requireApiPartner } from "../middleware/apiPartner.js";
import logger from "../config/logger.js";

const router = Router();
// Browsing is public; anything that holds seats or reads a booking needs a key.
const partnerOnly = requireApiPartner(db);
const partnerIfSent = optionalApiPartner(db);

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
router.get("/products", partnerIfSent, (req, res) => {
  try {
    const supplierId = req.query.supplierId || null;
    const products = getOctoProducts(db, { supplierId, partner: req.apiPartner || null });
    res.json(products);
  } catch (err) {
    logger.error("OCTo getProducts error", { error: err.message });
    res.status(500).json({ error: "Failed to list products", code: "INTERNAL_ERROR" });
  }
});

// GET /octo/products/:id or /api/octo/products/:id
router.get("/products/:id", partnerIfSent, (req, res) => {
  try {
    const product = getOctoProduct(db, req.params.id, req.apiPartner || null);
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
router.post("/availability", partnerIfSent, (req, res) => {
  try {
    const { productId, optionId, localDateStart, localDateEnd } = req.body;
    if (!productId || !localDateStart) {
      return res.status(400).json({ error: "productId and localDateStart required", code: "BAD_REQUEST" });
    }
    const availability = getOctoAvailability(db, { productId, optionId, localDateStart, localDateEnd, partner: req.apiPartner || null });
    res.json(availability);
  } catch (err) {
    logger.error("OCTo availability error", { error: err.message });
    res.status(500).json({ error: "Failed to fetch availability", code: "INTERNAL_ERROR" });
  }
});

// POST /octo/bookings/reservation or /api/octo/bookings/reservation
router.post("/bookings/reservation", partnerOnly, (req, res) => {
  try {
    const reservation = createOctoReservation(db, req.body, req.apiPartner);
    res.status(201).json(reservation);
  } catch (err) {
    logger.error("OCTo reservation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to create reservation", code: err.code || "RESERVATION_FAILED" });
  }
});

// POST /octo/bookings/confirmation or /api/octo/bookings/confirmation
router.post("/bookings/confirmation", partnerOnly, (req, res) => {
  try {
    const confirmation = confirmOctoReservation(db, req.body, req.apiPartner);
    res.json(confirmation);
  } catch (err) {
    logger.error("OCTo confirmation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to confirm reservation", code: err.code || "CONFIRMATION_FAILED" });
  }
});

// POST /octo/bookings/cancellation or /api/octo/bookings/cancellation
router.post("/bookings/cancellation", partnerOnly, (req, res) => {
  try {
    const cancellation = cancelOctoReservation(db, req.body, req.apiPartner);
    res.json(cancellation);
  } catch (err) {
    logger.error("OCTo cancellation error", { error: err.message });
    res.status(err.status || 400).json({ error: err.message || "Failed to cancel reservation", code: err.code || "CANCELLATION_FAILED" });
  }
});

// GET /octo/bookings/:id or /api/octo/bookings/:id
router.get("/bookings/:id", partnerOnly, (req, res) => {
  try {
    const reservation = getOctoBooking(db, req.params.id, req.apiPartner);
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
