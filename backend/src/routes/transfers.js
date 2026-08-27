import express from "express";
import { validateBody } from "../middleware/validation.js";
import { transferSchema } from "../validators/apiSchemas.js";
import db from "../db.js";
import logger from "../config/logger.js";
import {
  VEHICLE_TAXONOMY,
  computeTransferQuote,
  getEligibleVehicleCategories,
  matchSupplierGeoFences,
  calculateHaversineDistanceKm
} from "../engine/transferEngine.js";
import { assertBookingLocations } from "../services/locationValidationService.js";

const router = express.Router();

// GET /api/transfers/taxonomies - Return standard vehicle taxonomy breakdown
router.get("/taxonomies", (req, res) => {
  res.json({
    success: true,
    taxonomies: Object.values(VEHICLE_TAXONOMY)
  });
});

/**
 * Transfer Search Handler
 * Accepts pickup & drop lat/lng (e.g. Lucknow Airport to City Centre),
 * matches them against supplier operational polygons using PostGIS / point-in-polygon,
 * calculates road distance & duration, filters by passenger/luggage capacity,
 * and returns matched vehicles with itemized pricing.
 */
const handleTransferSearch = (req, res) => {
  try {
    const input = { ...req.query, ...req.body };

    const pickupLat = Number(input.pickupLat ?? input.originLat ?? 26.7606);
    const pickupLng = Number(input.pickupLng ?? input.originLng ?? 80.8893);
    const dropLat = Number(input.dropLat ?? input.destLat ?? 26.8467);
    const dropLng = Number(input.dropLng ?? input.destLng ?? 80.9462);

    const originState = input.originState || input.pickupState || "Uttar Pradesh";
    const destState = input.destState || input.dropState || "Uttar Pradesh";

    const passengers = Number(input.passengers ?? 2);
    const luggage = Number(input.luggage ?? 2);
    const selectedVehicle = input.selectedVehicle || null;

    // 1. Operational Polygon & Geo-Fence Matching via PostGIS / Ray-Casting
    const matchedFences = matchSupplierGeoFences(db, pickupLat, pickupLng, dropLat, dropLng);

    // 2. Capacity Filtering (Filter by pax & luggage capacity)
    const eligibleVehicles = getEligibleVehicleCategories(passengers, luggage);

    if (eligibleVehicles.length === 0) {
      return res.status(400).json({
        error: "No single vehicle can accommodate the requested passengers and luggage count. Please split into multiple vehicles or choose a Group Tempo Traveller."
      });
    }

    // 3. Spatial Distance & Travel Time Calculation
    const distanceKm = calculateHaversineDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
    const estimatedDurationMins = Math.max(25, Math.round(distanceKm * 2.0));

    // Determine primary supplier match
    const primaryMatch = matchedFences.length > 0 ? matchedFences[0] : null;

    // 4. Calculate quotes for all matched eligible vehicles
    const matchedVehicles = eligibleVehicles.map((veh) => {
      const quote = computeTransferQuote({
        originLat: pickupLat,
        originLng: pickupLng,
        destLat: dropLat,
        destLng: dropLng,
        originState,
        destState,
        passengers,
        luggage,
        vehicleCategory: veh.code,
        commissionRatePercent: primaryMatch ? primaryMatch.commissionRate : 18.0
      });

      return {
        ...quote,
        supplier: primaryMatch
          ? {
              id: primaryMatch.supplierId,
              name: primaryMatch.supplierName,
              rating: primaryMatch.supplierRating,
              matchedZone: primaryMatch.zoneName,
              matchMethod: primaryMatch.matchMethod,
              hasPolygon: primaryMatch.hasPolygon,
              pickupCovered: primaryMatch.pickupCovered,
              dropCovered: primaryMatch.dropCovered
            }
          : {
              id: "sup_default",
              name: "Idea Holiday Partner Fleet",
              rating: 4.8,
              matchedZone: "Standard Operational Zone",
              matchMethod: "CITY_RADIUS",
              hasPolygon: false
            }
      };
    });

    const targetCategory = selectedVehicle || matchedVehicles[0].vehicleCategory;
    const selectedQuote =
      matchedVehicles.find((v) => v.vehicleCategory === targetCategory) || matchedVehicles[0];

    res.json({
      success: true,
      searchQuery: {
        pickup: { lat: pickupLat, lng: pickupLng },
        drop: { lat: dropLat, lng: dropLng },
        originState,
        destState,
        passengers,
        luggage,
        distanceKm,
        estimatedDurationMins
      },
      geoFenceMatchesCount: matchedFences.length,
      matchedGeoFences: matchedFences,
      selectedQuote,
      matchedVehicles,
      allVehicleOptions: matchedVehicles
    });
  } catch (err) {
    logger.error("Transfer search failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to execute transfer search." });
  }
};

// POST /api/transfers/search - Main Transfer Search API Route
router.post("/search", validateBody(transferSchema), handleTransferSearch);

// GET /api/transfers/search - Query-based Transfer Search API Route
router.get("/search", handleTransferSearch);

// POST /api/transfers/quote - Dynamic pricing & spatial route quote calculation
router.post("/quote", validateBody(transferSchema), (req, res) => {
  try {
    const {
      productId,
      product_id,
      originLat,
      originLng,
      destLat,
      destLng,
      originState = "Uttar Pradesh",
      destState = "Uttar Pradesh",
      passengers = 2,
      luggage = 2,
      selectedVehicle = null
    } = req.body;

    const scopedProductId = productId || product_id;
    if (!scopedProductId) {
      return res.status(400).json({
        error: "Product context is required for a transfer quote.",
        code: "VALIDATION_ERROR",
        requestId: req.requestId,
      });
    }
    const pickupLat = req.body.pickupLat ?? originLat;
    const pickupLng = req.body.pickupLng ?? originLng;
    const dropLat = req.body.dropLat ?? destLat;
    const dropLng = req.body.dropLng ?? destLng;
    assertBookingLocations(db, {
      ...req.body,
      product_id: scopedProductId,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      drop_lat: dropLat,
      drop_lng: dropLng,
      pickup_location: req.body.pickupAddress || req.body.pickup_location,
      drop_location: req.body.dropAddress || req.body.drop_location,
    });

    const eligibleVehicles = getEligibleVehicleCategories(Number(passengers), Number(luggage));
    
    if (eligibleVehicles.length === 0) {
      return res.status(400).json({
        error: "No single vehicle can accommodate the requested passengers and luggage count. Please split into multiple vehicles or choose a Group Tempo Traveller."
      });
    }

    const targetCategory = selectedVehicle || eligibleVehicles[0].code;

    const quote = computeTransferQuote({
      originLat: Number(pickupLat),
      originLng: Number(pickupLng),
      destLat: Number(dropLat),
      destLng: Number(dropLng),
      originState,
      destState,
      passengers: Number(passengers),
      luggage: Number(luggage),
      vehicleCategory: targetCategory
    });

    // Provide options for all eligible vehicle categories
    const allOptions = eligibleVehicles.map((veh) => {
      return computeTransferQuote({
        originLat: Number(pickupLat),
        originLng: Number(pickupLng),
        destLat: Number(dropLat),
        destLng: Number(dropLng),
        originState,
        destState,
        passengers: Number(passengers),
        luggage: Number(luggage),
        vehicleCategory: veh.code
      });
    });

    res.json({
      success: true,
      selectedQuote: quote,
      allVehicleOptions: allOptions
    });
  } catch (err) {
    logger.error("Transfer quote failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Failed to calculate transfer quote.",
      code: err.code,
      detail: err.detail,
      requestId: req.requestId,
    });
  }
});

// GET /api/transfers/routes - List available pre-configured airport & city transfer routes
router.get("/routes", (req, res) => {
  try {
    const routes = db
      .prepare(
        `SELECT tr.*, p.title, p.city, p.state, p.hero_image, p.supplier_id, s.company_name as supplier_name, s.rating as supplier_rating
         FROM transfer_routes tr
         JOIN products p ON tr.product_id = p.id
         JOIN suppliers s ON p.supplier_id = s.id
         WHERE p.status = 'PUBLISHED'`
      )
      .all();

    res.json({ success: true, routes });
  } catch (err) {
    logger.error("Transfer route lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch transfer routes." });
  }
});

export default router;
