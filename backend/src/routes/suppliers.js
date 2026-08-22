import express from "express";
import db, { databaseInfo } from "../db.js";
import { canTransitionBooking } from "../services/bookingService.js";
import { authenticate, optionalAuthMiddleware, requireRoles, requireSupplierSelf } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { validateTransferMeta } from "../lib/transferListing.js";
import { resolveIndiaCatalogLocation } from "../lib/locationCatalog.js";
import { respondToSupplierAssignment } from "../services/assignmentSlaService.js";
import { evaluateSupplierAvailability, normalizeAvailabilityRule } from "../services/availabilityService.js";
import {
  notifyDispatchStatusChanged,
  notifyDriverAssigned,
  notifyRefundProcessed,
  queueNotification,
  sendGuestBookingNotification,
} from "../services/notificationService.js";
import {
  assignDriverToBooking,
  getDispatchTimeline,
  getFleetAvailability,
  normalizeDriverPhone,
  normalizeVehicleNumber,
  updateDispatchStatus,
} from "../services/driverDispatchService.js";

import { calculateRefundQuote, createRefundRecord, finalizeRefund } from "../services/financeService.js";
import { nanoid } from "nanoid";
import { validateBody } from "../middleware/validation.js";
import { bookingSchemas, supplierSchemas } from "../validators/apiSchemas.js";

const router = express.Router();
router.use(authenticate);

function requireSupplierAccess(req, res, next) {
  const role = String(req.user?.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return next();
  if (role === "SUPPLIER" && req.user?.supplier_id === req.params.id) return next();
  return res.status(403).json({ error: "Supplier operations access required" });
}

const normalizePolygon = (coordinates = []) => {
  const points = coordinates
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
};

// GET /api/suppliers - List all registered suppliers
router.get("/", requireRoles("ADMIN", "STAFF"), (req, res) => {
  try {
    const suppliers = db.prepare("SELECT * FROM suppliers ORDER BY created_at DESC").all();
    res.json({ success: true, suppliers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

router.use("/:id", requireSupplierSelf("id"));

// GET /api/suppliers/:id - Fetch single supplier profile with KYB, products, bookings, drivers, blocked dates & payouts
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const kybDocs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ?").all(id);
    const geoFences = db.prepare("SELECT * FROM geo_fences WHERE supplier_id = ?").all(id);
    const products = db.prepare(`
      SELECT p.*, tr.route_type, tr.origin_name, tr.dest_name, tr.distance_km, tr.duration_mins
      FROM products p
      LEFT JOIN transfer_routes tr ON tr.product_id = p.id
      WHERE p.supplier_id = ?
      ORDER BY COALESCE(p.created_at, '') DESC, p.rowid DESC
    `).all(id);
    const bookings = db.prepare(`
      SELECT b.*, p.title as product_title, p.hero_image, p.city, p.is_instant_booking, p.cancellation_policy,
             da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number, da.assignment_status,
             da.supplier_driver_id, da.assignment_source, da.assigned_at, da.last_status_at,
             da.en_route_at, da.arrived_at, da.trip_started_at, da.completed_at
      FROM bookings b
      LEFT JOIN products p ON b.product_id = p.id
      LEFT JOIN driver_assignments da ON b.id = da.booking_id
      WHERE b.supplier_id = ?
      ORDER BY b.created_at DESC
    `).all(id).map((booking) => {
      const { otp_code, otp_hash, otp_encrypted, ...safeBooking } = booking;
      return safeBooking;
    });

    const drivers = db.prepare("SELECT * FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name ASC").all(id);
    const blockedDates = db.prepare("SELECT * FROM blocked_dates WHERE supplier_id = ? ORDER BY start_date DESC").all(id);
    const payouts = db.prepare(`
      SELECT p.*, pb.batch_ref, pb.status AS settlement_status, pb.provider, pb.provider_batch_id, pb.reconciled_at AS settlement_reconciled_at
      FROM payouts p LEFT JOIN payout_batches pb ON pb.id = p.settlement_batch_id
      WHERE p.supplier_id = ? ORDER BY COALESCE(p.processed_at, p.created_at) DESC
    `).all(id);

    res.json({
      success: true,
      supplier,
      kybDocs,
      geoFences,
      products,
      bookings,
      drivers,
      blockedDates,
      payouts
    });
  } catch (err) {
    logger.error("Supplier lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch supplier details" });
  }
});

// POST /api/suppliers/register - Register a new fleet vendor / tour operator
router.post("/register", validateBody(supplierSchemas.registration), (req, res) => {
  try {
    const { companyName, contactName, email, phone, city, state, gstin, panNumber } = req.body;
    const slug = (companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const id = slug ? `sup_${slug}_${nanoid(6)}` : `sup_${nanoid(10)}`;

    db.prepare(
      `INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, gstin, pan_number, kyb_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    ).run(id, id, companyName, contactName, email, phone, city, state, gstin || null, panNumber || null);

    res.json({ success: true, supplierId: id, message: "Supplier registered successfully! KYB verification pending." });
  } catch (err) {
    logger.error("Supplier registration failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to register supplier" });
  }
});

// POST /api/suppliers/:id/kyb - Submit KYB Document
router.post("/:id/kyb", validateBody(supplierSchemas.kyb), (req, res) => {
  try {
    const { id } = req.params;
    const { docType, docNumber, docUrl } = req.body;
    const docId = `kyb_${Date.now()}`;

    db.prepare(
      `INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_number, doc_url, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`
    ).run(docId, id, docType, docNumber, docUrl || "https://example.com/docs/uploaded.pdf");

    res.json({ success: true, docId, message: "KYB Document submitted for review." });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit KYB document" });
  }
});

// POST /api/suppliers/:id/geofences - Add or update operational geo-fence
router.post("/:id/geofences", validateBody(supplierSchemas.geofence), (req, res) => {
  try {
    const { id } = req.params;
    const { zoneName, city, centerLat, centerLng, radiusKm = 30.0, polygonCoordinates } = req.body;
    const fenceId = `fence_${Date.now()}`;

    if (!zoneName?.trim() || !city?.trim()) return res.status(400).json({ error: "Zone name and city are required" });
    const locationValidation = resolveIndiaCatalogLocation(
      db.prepare("SELECT id, name, state FROM destinations WHERE COALESCE(is_active, 1) = 1").all(),
      city,
      "India",
    );
    if (locationValidation.error) return res.status(400).json({ error: locationValidation.error });
    const canonicalCity = locationValidation.value.city;
    const lat = Number(centerLat);
    const lng = Number(centerLng);
    const radius = Number(radiusKm);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: "Valid center coordinates are required" });
    if (!Number.isFinite(radius) || radius <= 0 || radius > 500) return res.status(400).json({ error: "Radius must be between 0 and 500 km" });

    let polyJson = "[]";
    if (typeof polygonCoordinates === "string") {
      try { polyJson = JSON.stringify(normalizePolygon(JSON.parse(polygonCoordinates))); } catch { return res.status(400).json({ error: "Polygon coordinates are not valid JSON" }); }
    } else if (Array.isArray(polygonCoordinates) && polygonCoordinates.length > 0) {
      const polygon = normalizePolygon(polygonCoordinates);
      if (polygon.length < 4) return res.status(400).json({ error: "A polygon requires at least three valid boundary points" });
      polyJson = JSON.stringify(polygon);
    }

    db.prepare(
      `INSERT INTO geo_fences (id, supplier_id, zone_name, city, center_lat, center_lng, radius_km, polygon_coordinates, is_active, approval_status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING_REVIEW', datetime('now'))`
    ).run(fenceId, id, zoneName.trim(), canonicalCity, lat, lng, radius, polyJson);

    res.json({ success: true, fenceId, approvalStatus: "PENDING_REVIEW", message: "Coverage zone submitted for Idea Holiday admin review." });
  } catch (err) {
    logger.error("Supplier coverage save failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to save geo-fence" });
  }
});

// DELETE /api/suppliers/:id/geofences/:fenceId - Remove an owned service zone
router.delete("/:id/geofences/:fenceId", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM geo_fences WHERE id = ? AND supplier_id = ?").run(req.params.fenceId, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Service zone not found" });
    res.json({ success: true, message: "Service zone removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove service zone" });
  }
});

// POST /api/suppliers/:id/products - Product Listing Wizard (Transfers, Sightseeing, Multi-Day Packages)
router.post("/:id/products", validateBody(supplierSchemas.product), (req, res) => {
  try {
    const { id } = req.params;
    const {
      productType, // 'TRANSFER', 'DAY_TOUR', 'MULTI_DAY_PACKAGE'
      groupType = "PRIVATE",
      title,
      city,
      state,
      country = "India",
      category,
      shortDesc,
      fullDesc,
      durationHours,
      priceInr,
      heroImage,
      inclusions,
      exclusions,
      itinerary,
      // Metadata fields for transfers or packages
      transferMeta,
      packageMeta,
      pricingVariants
    } = req.body;

    const supplier = db.prepare("SELECT id, kyb_status FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier account not found" });

    const normalizedProductType = String(productType || "").toUpperCase();
    if (!["TRANSFER", "DAY_TOUR", "MULTI_DAY_PACKAGE"].includes(normalizedProductType)) {
      return res.status(400).json({ error: "Choose a valid product type" });
    }
    if (!title?.trim() || !city?.trim()) {
      return res.status(400).json({ error: "Title and city are required" });
    }
    const normalizedShortDesc = String(shortDesc || "").trim();
    if (normalizedShortDesc.length > 1500) {
      return res.status(400).json({ error: "Short summary cannot exceed 1,500 characters" });
    }
    if (normalizedProductType !== "TRANSFER" && normalizedShortDesc.length < 15) {
      return res.status(400).json({ error: "Short summary must be at least 15 characters" });
    }

    if (normalizedProductType === "DAY_TOUR") {
      let sightseeingStops;
      try {
        sightseeingStops = typeof itinerary === "string" ? JSON.parse(itinerary) : itinerary;
      } catch {
        return res.status(400).json({ error: "Sightseeing stops must be valid" });
      }
      if (!Array.isArray(sightseeingStops)) {
        return res.status(400).json({ error: "Sightseeing stops must be a list" });
      }
      const invalidStopDescription = sightseeingStops.some((stop) => String(stop?.description || "").trim().length > 1000);
      if (invalidStopDescription) {
        return res.status(400).json({ error: "Each stop description cannot exceed 1,000 characters" });
      }
    }
    const locationValidation = resolveIndiaCatalogLocation(
      db.prepare("SELECT id, name, state FROM destinations WHERE COALESCE(is_active, 1) = 1").all(),
      city,
      country,
    );
    if (locationValidation.error) return res.status(400).json({ error: locationValidation.error });
    const canonicalLocation = locationValidation.value;
    const normalizedPrice = Number(priceInr);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      return res.status(400).json({ error: "Price must be greater than zero" });
    }
    const transferValidation = normalizedProductType === "TRANSFER" ? validateTransferMeta(transferMeta) : null;
    if (transferValidation?.error) return res.status(400).json({ error: transferValidation.error });
    const normalizedTransferMeta = transferValidation?.value;

    // Transfers are always a dedicated vehicle. Tours and packages preserve
    // the supplier's Shared/Private selection exactly.
    const normalizedGroupType = normalizedProductType === "TRANSFER"
      ? "PRIVATE"
      : String(groupType).toUpperCase() === "SHARED" ? "SHARED" : "PRIVATE";
    const typeCode = normalizedProductType === "TRANSFER" ? "tr" : normalizedProductType === "DAY_TOUR" ? "tour" : "pkg";
    const cityCode = (canonicalLocation.city || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
    const productId = `prod_${typeCode}_${cityCode ? cityCode + "_" : ""}${nanoid(8)}`;

    // Store the listing, its type-specific metadata, and all price variants as
    // one atomic unit. A failed child insert now rolls the entire listing back.
    const product = db.transaction(() => {
      db.prepare(
        `INSERT INTO products (id, product_code, supplier_id, product_type, group_type, title, city, state, category, short_desc, full_desc, duration_hours, price_inr, hero_image, inclusions, exclusions, itinerary, status, is_published, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, datetime('now'))`
      ).run(
        productId,
        productId,
        id,
        normalizedProductType,
        normalizedGroupType,
        title.trim(),
        canonicalLocation.city,
        canonicalLocation.state,
        category || (normalizedProductType === "TRANSFER" ? "Airport Transfers" : normalizedProductType === "DAY_TOUR" ? "Day Sightseeing" : "Multi-Day Packages"),
        shortDesc,
        fullDesc,
        Number(durationHours) || 4.0,
        normalizedPrice,
        heroImage || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
        JSON.stringify(inclusions || ["AC Vehicle", "Chauffeur", "Fuel"]),
        JSON.stringify(exclusions || ["Personal Expenses", "Tips"]),
        typeof itinerary === "string" ? itinerary : JSON.stringify(itinerary || [])
      );

      if (normalizedProductType === "TRANSFER" && normalizedTransferMeta) {
        db.prepare(
          `INSERT INTO transfer_routes (id, product_id, route_type, origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng, distance_km, duration_mins, vehicle_category, max_passengers, max_luggage, free_waiting_mins, toll_included, state_tax_included)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `tr_${Date.now()}`,
          productId,
          normalizedTransferMeta.routeType,
          normalizedTransferMeta.originName,
          normalizedTransferMeta.originLat,
          normalizedTransferMeta.originLng,
          normalizedTransferMeta.destName,
          normalizedTransferMeta.destLat,
          normalizedTransferMeta.destLng,
          normalizedTransferMeta.distanceKm,
          normalizedTransferMeta.durationMins,
          normalizedTransferMeta.vehicleCategory,
          normalizedTransferMeta.maxPax,
          normalizedTransferMeta.maxBags,
          normalizedTransferMeta.freeWaitingMins,
          normalizedTransferMeta.tollIncluded,
          normalizedTransferMeta.stateTaxIncluded
        );
      }

      if (normalizedProductType === "MULTI_DAY_PACKAGE" && packageMeta) {
        db.prepare(
          `INSERT INTO package_itineraries (id, product_id, total_days, total_nights, day_wise_details, start_city, end_city, vehicle_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `itin_${Date.now()}`,
          productId,
          Number(packageMeta.totalDays) || 3,
          Number(packageMeta.totalNights) || 2,
          JSON.stringify(packageMeta.dayWiseDetails || []),
          packageMeta.startCity || canonicalLocation.city,
          packageMeta.endCity || canonicalLocation.city,
          packageMeta.vehicleCategory || "SEDAN"
        );
      }

      if (Array.isArray(pricingVariants) && pricingVariants.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price, strike_price)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const [index, variant] of pricingVariants.entries()) {
          const variantPrice = Number(variant.basePrice);
          if (!variant.variantName?.trim() || !Number.isFinite(variantPrice) || variantPrice <= 0) {
            throw new Error(`Pricing variant ${index + 1} requires a name and a price greater than zero`);
          }
          const pricingModel = variant.pricingModel || (normalizedGroupType === "SHARED" ? "PER_PERSON" : "FIXED");
          stmt.run(`prc_${Date.now()}_${index}`, productId, variant.variantName.trim(), pricingModel, variantPrice, Number(variant.strikePrice) || null);
        }
      } else {
        const defaultModel = normalizedGroupType === "SHARED" ? "PER_PERSON" : "FIXED";
        const defaultName = normalizedGroupType === "SHARED" ? "Shared Tour (Per Seat / Passenger)" : "Standard Private Tour Option";
        db.prepare(
          `INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price)
           VALUES (?, ?, ?, ?, ?)`
        ).run(`prc_${Date.now()}`, productId, defaultName, defaultModel, normalizedPrice);
      }

      return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    })();
    res.status(201).json({
      success: true,
      productId,
      product,
      message: `${normalizedGroupType === "SHARED" ? "Shared" : "Private"} listing published and live in marketplace search.`
    });
  } catch (err) {
    logger.error("Supplier product creation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to create product listing." });
  }
});

// PATCH /api/suppliers/:id/products/:productId/publication - Publish or hide an owned listing
router.patch("/:id/products/:productId/publication", validateBody(supplierSchemas.publication), (req, res) => {
  try {
    const { id, productId } = req.params;
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, id);
    if (!product) return res.status(404).json({ error: "Listing not found for this supplier" });

    const isPublished = Boolean(req.body?.isPublished);
    const status = isPublished ? "PUBLISHED" : "DRAFT";
    db.prepare("UPDATE products SET is_published = ?, status = ? WHERE id = ? AND supplier_id = ?")
      .run(isPublished ? 1 : 0, status, productId, id);

    res.json({
      success: true,
      is_published: isPublished,
      status,
      message: isPublished ? "Listing is live in marketplace search." : "Listing moved to draft and removed from marketplace search."
    });
  } catch (err) {
    logger.error("Supplier publication update failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to update listing publication" });
  }
});

// POST /api/suppliers/:id/assign-driver - Dispatch driver and vehicle to booking
router.post("/:id/assign-driver", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.assignment), (req, res) => {
  try {
    const { id } = req.params;
    const { bookingId, supplierDriverId, driverName, driverPhone, vehicleModel, vehicleNumber } = req.body;
    if (!bookingId) return res.status(400).json({ error: "Booking is required" });
    const assignment = assignDriverToBooking(db, {
      supplierId: id,
      bookingId,
      supplierDriverId,
      manualDriver: { driverName, driverPhone, vehicleModel, vehicleNumber },
      actorId: req.user?.id,
    });

    queueNotification(notifyDriverAssigned(db, bookingId), "Driver assignment notification");

    res.json({ success: true, assignment, assignmentId: assignment.id, message: `Driver ${assignment.driver_name} assigned successfully.` });
  } catch (err) {
    logger.error("Driver assignment failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to assign driver" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/respond-assignment - Accept or reject within the SLA window
router.post("/:id/bookings/:bookingId/respond-assignment", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.assignment), (req, res) => {
  try {
    const result = respondToSupplierAssignment(db, {
      bookingId: req.params.bookingId,
      supplierId: req.params.id,
      action: req.body?.action,
      note: req.body?.note,
    });
    if (result.expired) {
      return res.json({ ...result, message: result.replacement ? "The response window expired, so this booking moved to the next eligible supplier." : "The response window expired and operations must assign a supplier manually." });
    }
    if (String(req.body?.action || "").toUpperCase() === "ACCEPT") {
      return res.json({ ...result, message: "Booking accepted. You can now assign the driver and vehicle." });
    }
    return res.json({ ...result, message: result.replacement ? `Booking released and reassigned to ${result.replacement.supplierName}.` : "Booking released. Operations has been alerted because no replacement was available." });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Supplier response could not be saved" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/notifications/resend - Supplier/admin resend of an approved guest update
router.post("/:id/bookings/:bookingId/notifications/resend", optionalAuthMiddleware, requireSupplierAccess, validateBody(bookingSchemas.resend), async (req, res) => {
  try {
    const booking = db.prepare("SELECT id, ref, payment_status, supplier_response_status FROM bookings WHERE id = ? AND supplier_id = ?").get(req.params.bookingId, req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
    if (booking.payment_status !== "PAID") return res.status(409).json({ error: "Guest notifications are available after payment is confirmed" });
    if (booking.supplier_response_status !== "ACCEPTED") return res.status(409).json({ error: "Accept the booking before sending the guest confirmation" });

    const eventType = String(req.body?.eventType || "BOOKING_CONFIRMED").toUpperCase();
    const cooldownPredicate = databaseInfo.engine === "postgres"
      ? "created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'"
      : "created_at >= datetime('now', '-60 seconds')";
    const recent = db.prepare(`
      SELECT id FROM notification_deliveries
      WHERE booking_id = ? AND recipient_role = 'TRAVELER' AND event_type = ?
        AND ${cooldownPredicate}
      LIMIT 1
    `).get(booking.id, eventType);
    if (recent) return res.status(429).json({ error: "Please wait one minute before sending the same guest update again" });

    const actorId = req.user?.id || "supplier";
    const result = await sendGuestBookingNotification(db, booking.id, eventType, { eventKeySuffix: `SUPPLIER_${actorId}_${Date.now()}` });
    if (!result.attempted) return res.status(409).json({ error: "The traveler has no enabled notification channel" });
    const delivered = result.results.some((item) => item.success);
    if (!delivered) {
      const failure = result.results.find((item) => item.error)?.error || "No notification channel accepted the guest confirmation";
      return res.status(502).json({ success: false, error: failure, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Guest notification could not be sent" });
  }
});

// POST /api/suppliers/:id/dispatch - Persist exact traveller handoff details for dispatch
router.post("/:id/dispatch", validateBody(supplierSchemas.dispatch), (req, res) => {
  try {
    const { id: supplierId } = req.params;
    const { bookingId, pickup, drop, flight } = req.body;
    if (!bookingId || !pickup || !drop) {
      return res.status(400).json({ error: "bookingId, pickup and drop are required" });
    }
    const coordinates = [pickup.lat, pickup.lng, drop.lat, drop.lng].map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) {
      return res.status(400).json({ error: "Valid pickup and drop coordinates are required" });
    }

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND supplier_id = ?").get(bookingId, supplierId);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });

    db.prepare(
      `UPDATE bookings SET
        pickup_location = ?, pickup_instructions = ?, pickup_lat = ?, pickup_lng = ?,
        drop_location = ?, drop_instructions = ?, drop_lat = ?, drop_lng = ?,
        flight_number = ?, flight_arrival_time = ?, terminal_gate = ?
       WHERE id = ? AND supplier_id = ?`
    ).run(
      pickup.address,
      pickup.instructions || null,
      coordinates[0],
      coordinates[1],
      drop.address,
      drop.instructions || null,
      coordinates[2],
      coordinates[3],
      flight?.number || null,
      flight?.scheduledArrival || null,
      flight?.terminalGate || null,
      bookingId,
      supplierId
    );

    res.json({
      success: true,
      dispatchRef: `DSP-${booking.ref}`,
      bookingId,
      supplierId,
      pickup: { ...pickup, mapsUrl: `https://maps.google.com/?q=${coordinates[0]},${coordinates[1]}` },
      drop: { ...drop, mapsUrl: `https://maps.google.com/?q=${coordinates[2]},${coordinates[3]}` },
      flight: flight || null,
      message: "Exact locations and arrival instructions are ready for supplier dispatch."
    });
  } catch (err) {
    logger.error("Supplier dispatch handoff failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to prepare supplier dispatch" });
  }
});

// GET /api/suppliers/:id/drivers - List supplier fleet drivers
router.get("/:id/drivers", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id } = req.params;
    const drivers = db.prepare("SELECT * FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name ASC").all(id);
    res.json({ success: true, drivers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

// POST /api/suppliers/:id/drivers - Add new fleet driver
router.get("/:id/drivers/availability", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    if (!req.query.bookingId) return res.status(400).json({ error: "bookingId is required" });
    const drivers = getFleetAvailability(db, { supplierId: req.params.id, bookingId: req.query.bookingId });
    res.json({ success: true, drivers });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to check fleet availability" });
  }
});

router.post("/:id/drivers", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.driver), (req, res) => {
  try {
    const { id } = req.params;
    const { driverName, driverPhone, vehicleModel, vehicleNumber, licenseNumber } = req.body;
    if (!driverName?.trim() || !driverPhone || !vehicleNumber) {
      return res.status(400).json({ error: "Driver Name, Phone and Vehicle Number are required." });
    }
    const phone = normalizeDriverPhone(driverPhone);
    const plate = normalizeVehicleNumber(vehicleNumber);
    const duplicate = db.prepare(`SELECT id FROM supplier_drivers WHERE supplier_id = ? AND (REPLACE(REPLACE(UPPER(vehicle_number), '-', ''), ' ', '') = ? OR REPLACE(REPLACE(driver_phone, '+', ''), ' ', '') = ?)`)
      .get(id, plate.replace(/[^A-Z0-9]/g, ""), phone.replace(/\D/g, ""));
    if (duplicate) return res.status(409).json({ error: "This driver phone or vehicle is already in your fleet" });

    const driverId = `drv_sup_${Date.now()}`;
    db.prepare(
      `INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, license_number, rating, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 4.9, 'AVAILABLE')`
    ).run(driverId, id, driverName.trim(), phone, vehicleModel || "Commercial Cab", plate, licenseNumber?.trim() || null);

    res.json({ success: true, driverId, message: `Driver ${driverName} added to fleet.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to add driver to fleet" });
  }
});

router.patch("/:id/drivers/:driverId/status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const status = String(req.body?.status || "").toUpperCase();
    if (!["AVAILABLE", "UNAVAILABLE", "MAINTENANCE", "INACTIVE"].includes(status)) return res.status(400).json({ error: "Choose a valid fleet status" });
    if (status !== "AVAILABLE") {
      const active = db.prepare(`SELECT b.ref FROM driver_assignments da JOIN bookings b ON b.id = da.booking_id WHERE da.supplier_driver_id = ? AND da.supplier_id = ? AND da.assignment_status IN ('EN_ROUTE', 'ARRIVED', 'TRIP_STARTED') LIMIT 1`).get(req.params.driverId, req.params.id);
      if (active) return res.status(409).json({ error: `Complete active trip ${active.ref} before making this driver unavailable` });
    }
    const result = db.prepare("UPDATE supplier_drivers SET status = ? WHERE id = ? AND supplier_id = ?").run(status, req.params.driverId, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Fleet driver not found" });
    res.json({ success: true, status, message: `Fleet status updated to ${status.replaceAll("_", " ").toLowerCase()}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update fleet status" });
  }
});

router.patch("/:id/bookings/:bookingId/dispatch-status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const result = updateDispatchStatus(db, {
      supplierId: req.params.id,
      bookingId: req.params.bookingId,
      nextStatus: req.body?.status,
      note: req.body?.note,
      actorId: req.user?.id,
    });
    queueNotification(notifyDispatchStatusChanged(db, req.params.bookingId), "Dispatch status notification");
    res.json({ success: true, assignment: result.assignment, timeline: getDispatchTimeline(db, req.params.bookingId), message: `Dispatch updated to ${result.assignment.assignment_status.replaceAll("_", " ").toLowerCase()}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update dispatch" });
  }
});

// GET /api/suppliers/:id/blocked-dates - Fetch blocked calendar dates
router.get("/:id/blocked-dates", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id } = req.params;
    const blockedDates = db.prepare("SELECT * FROM blocked_dates WHERE supplier_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY start_date DESC, COALESCE(start_time, '') DESC").all(id);
    res.json({ success: true, blockedDates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blocked dates" });
  }
});

// POST /api/suppliers/:id/block-dates - Block calendar date range
router.post("/:id/block-dates", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.blockDates), (req, res) => {
  try {
    const { id } = req.params;
    const rule = normalizeAvailabilityRule(req.body);
    if (rule.productId && !db.prepare("SELECT id FROM products WHERE id = ? AND supplier_id = ?").get(rule.productId, id)) {
      return res.status(400).json({ error: "Choose one of your own products" });
    }
    if (rule.vehicleId && !db.prepare("SELECT id FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(rule.vehicleId, id)) {
      return res.status(400).json({ error: "Choose a vehicle from your own fleet" });
    }

    const blockId = `blk_${Date.now()}`;
    db.prepare(
      `INSERT INTO blocked_dates (
         id, supplier_id, product_id, scope_type, vehicle_id, vehicle_category, availability_type,
         start_date, end_date, start_time, end_time, capacity_limit, is_active, reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      blockId, id, rule.productId, rule.scopeType, rule.vehicleId, rule.vehicleCategory, rule.availabilityType,
      rule.startDate, rule.endDate, rule.startTime, rule.endTime, rule.capacityLimit, rule.reason,
    );

    const savedRule = db.prepare("SELECT * FROM blocked_dates WHERE id = ?").get(blockId);
    res.json({ success: true, blockId, rule: savedRule, message: `Availability updated from ${rule.startDate} to ${rule.endDate}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update availability" });
  }
});

// GET /api/suppliers/:id/availability/check - Preview whether a booking can be accepted
router.get("/:id/availability/check", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    if (!req.query.date) return res.status(400).json({ error: "Travel date is required" });
    const availability = evaluateSupplierAvailability(db, {
      supplierId: req.params.id,
      productId: req.query.productId,
      activityDate: req.query.date,
      pickupTime: req.query.time || "09:00",
      vehicleCategory: req.query.vehicleCategory,
    });
    res.json({ success: true, availability });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Could not check availability" });
  }
});

// DELETE /api/suppliers/:id/blocked-dates/:dateId - Remove blocked date
router.delete("/:id/blocked-dates/:dateId", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id, dateId } = req.params;
    const result = db.prepare("DELETE FROM blocked_dates WHERE id = ? AND supplier_id = ?").run(dateId, id);
    if (!result.changes) return res.status(404).json({ error: "Availability rule not found" });
    res.json({ success: true, message: "Calendar date unblocked successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to unblock date" });
  }
});

// PATCH /api/suppliers/:id/products/:productId/price - Fast update product price
router.patch("/:id/products/:productId/price", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.price), (req, res) => {
  try {
    const { id, productId } = req.params;
    const priceInr = Number(req.body.priceInr);
    const strikePriceInr = req.body.strikePriceInr ? Number(req.body.strikePriceInr) : null;
    if (!Number.isFinite(priceInr) || priceInr <= 0) {
      return res.status(400).json({ error: "Please enter a valid price in INR." });
    }
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, id);
    if (!product) return res.status(404).json({ error: "Product not found for this supplier" });

    db.prepare("UPDATE products SET price_inr = ?, strike_price_inr = ? WHERE id = ? AND supplier_id = ?")
      .run(priceInr, strikePriceInr, productId, id);

    res.json({
      success: true,
      message: `Price updated to ₹${priceInr.toLocaleString("en-IN")}`,
      priceInr,
      strikePriceInr
    });
  } catch (err) {
    logger.error("Supplier price update failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to update price" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/cancel - Supplier cancels booking with refund and audit log
router.post("/:id/bookings/:bookingId/cancel", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.cancellation), (req, res) => {
  try {
    const { id, bookingId } = req.params;
    const reason = String(req.body.reason || "Supplier operational cancellation").trim();
    const notes = String(req.body.notes || "").trim();

    const booking = db.prepare("SELECT * FROM bookings WHERE (id = ? OR ref = ?) AND supplier_id = ?").get(bookingId, bookingId, id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });

    const currentStatus = String(booking.status || "").toLowerCase();
    if (["cancelled", "completed"].includes(currentStatus)) {
      return res.status(409).json({ error: `Cannot cancel a booking that is already ${currentStatus}.` });
    }

    // Calculate refund quote
    const isPaid = booking.payment_status === "PAID";
    let quote = null;
    if (isPaid) {
      // If supplier is initiating cancellation due to operational issues, traveler typically gets 100% full refund
      quote = calculateRefundQuote(db, booking, { overridePercentage: 100 });
      const refundRecord = createRefundRecord(db, {
        booking,
        quote,
        reason: `Supplier cancellation: ${reason}${notes ? ` - ${notes}` : ""}`,
        actorId: req.user?.id || id,
        idempotencyKey: `sup-cancel:${booking.id}:${Date.now()}`
      });
      finalizeRefund(db, { booking, refund: refundRecord, providerResult: { status: "PROCESSED" } });
    } else {
      db.transaction(() => {
        db.prepare("UPDATE bookings SET status = 'cancelled', cancellation_reason = ? WHERE id = ?").run(reason, booking.id);
        db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
        db.prepare("UPDATE driver_assignments SET assignment_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
      })();
    }

    try {
      if (refundRecord?.id) {
        queueNotification(notifyRefundProcessed(db, refundRecord.id), "Supplier cancellation refund notification");
      }
    } catch (notifErr) {
      logger.warn("Supplier cancellation notification failed", { requestId: req.requestId, error: notifErr });
    }

    res.json({
      success: true,
      message: `Booking ${booking.ref} cancelled successfully.`,
      status: "cancelled",
      refundQuote: quote
    });
  } catch (err) {
    logger.error("Supplier cancellation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to cancel booking" });
  }
});

// PATCH /api/suppliers/:id/bookings/:bookingId/status - Update trip/booking status
router.patch("/:id/bookings/:bookingId/status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const { id, bookingId } = req.params;
    const nextStatus = String(req.body.status || "").toLowerCase();
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND supplier_id = ?").get(bookingId, id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
    if (nextStatus === "in_progress") return res.status(409).json({ error: "Verify the traveler's pickup OTP to start this trip" });
    if (!canTransitionBooking(booking.status, nextStatus)) return res.status(409).json({ error: `Cannot move booking from ${booking.status} to ${nextStatus}` });
    db.transaction(() => {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ? AND supplier_id = ?").run(nextStatus, bookingId, id);
      if (nextStatus === "completed") {
        db.prepare("UPDATE driver_assignments SET assignment_status = 'COMPLETED' WHERE booking_id = ?").run(bookingId);
        db.prepare("UPDATE payouts SET payout_status = 'SCHEDULED' WHERE booking_id = ? AND payout_status = 'PAYMENT_HELD'").run(bookingId);
      }
      if (nextStatus === "cancelled") db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(bookingId);
    })();
    res.json({ success: true, status: nextStatus, message: `Booking status updated to ${nextStatus}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

export default router;
