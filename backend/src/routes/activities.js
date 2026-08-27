import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { getPickupSuggestions, getProductLocationContext, validatePickupPoint } from "../services/locationValidationService.js";
import { validateBody } from "../middleware/validation.js";
import { locationSchemas } from "../validators/apiSchemas.js";
import { ensureDefaultProductOption, getBookingQuestions, getProductOptions } from "../services/logisticsService.js";

const router = Router();

// In-memory cache with short TTL (30s for search, 5m for destinations)
const destinationCache = { data: null, expiresAt: 0 };
const citiesCache = { data: null, expiresAt: 0 };
const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 30 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 200;

function safeJsonParse(data, fallback = []) {
  if (!data) return fallback;
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

/**
 * Batch-resolves all relational data for a list of product rows in a single pass.
 * Replaces N+1 single queries (which caused 150+ roundtrips) with 5 batch queries.
 */
function parseProductRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const productIds = rows.map((r) => r.id).filter(Boolean);
  const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean)));

  // 1. Batch Pricing
  const pricingMap = new Map();
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(",");
      const allPricing = db.prepare(`SELECT * FROM product_pricing WHERE product_id IN (${placeholders})`).all(...productIds);
      for (const p of allPricing) {
        if (!pricingMap.has(p.product_id)) pricingMap.set(p.product_id, []);
        pricingMap.get(p.product_id).push(p);
      }
    } catch (e) {}
  }

  // 2. Batch Transfer Routes
  const transferRouteMap = new Map();
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(",");
      const allRoutes = db.prepare(`SELECT * FROM transfer_routes WHERE product_id IN (${placeholders})`).all(...productIds);
      for (const r of allRoutes) {
        transferRouteMap.set(r.product_id, r);
      }
    } catch (e) {}
  }

  const dayTourMap = new Map();
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(",");
      const allDayTours = db.prepare(`SELECT * FROM day_tours WHERE product_id IN (${placeholders})`).all(...productIds);
      for (const tour of allDayTours) dayTourMap.set(tour.product_id, tour);
    } catch {}
  }

  // 3. Batch Package Itineraries
  const packageMap = new Map();
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(",");
      const allPackages = db.prepare(`SELECT * FROM package_itineraries WHERE product_id IN (${placeholders})`).all(...productIds);
      for (const pkg of allPackages) {
        packageMap.set(pkg.product_id, pkg);
      }
    } catch (e) {}
  }

  // 4. Batch Suppliers
  const supplierMap = new Map();
  if (supplierIds.length > 0) {
    try {
      const placeholders = supplierIds.map(() => "?").join(",");
      const allSuppliers = db.prepare(`SELECT id, company_name, rating, kyb_status FROM suppliers WHERE id IN (${placeholders})`).all(...supplierIds);
      for (const s of allSuppliers) {
        supplierMap.set(s.id, s);
      }
    } catch (e) {}
  }

  // 5. Batch Quality Scores
  const qualityMap = new Map();
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(",");
      const allQuality = db.prepare(`SELECT entity_id, review_count, average_rating, score_100, tier FROM quality_scores WHERE entity_type = 'PRODUCT' AND entity_id IN (${placeholders})`).all(...productIds);
      for (const q of allQuality) {
        qualityMap.set(q.entity_id, q);
      }
    } catch (e) {}
  }

  // 6–10. Plan 14 supporting tables (ticket tiers, vehicle options, SIC hubs, hotel tiers, itinerary items)
  const ticketTiersMap = new Map();
  const vehicleOptionsMap = new Map();
  const sicHubsMap = new Map();
  const hotelTiersMap = new Map();
  const itineraryItemsMap = new Map();
  if (productIds.length > 0) {
    const ph = productIds.map(() => "?").join(",");
    try {
      db.prepare(`SELECT * FROM product_ticket_tiers WHERE product_id IN (${ph}) AND COALESCE(is_active,1)=1 ORDER BY sort_order`).all(...productIds)
        .forEach((r) => { if (!ticketTiersMap.has(r.product_id)) ticketTiersMap.set(r.product_id, []); ticketTiersMap.get(r.product_id).push(r); });
    } catch {}
    try {
      db.prepare(`SELECT * FROM product_vehicle_options WHERE product_id IN (${ph}) AND COALESCE(is_active,1)=1 ORDER BY sort_order`).all(...productIds)
        .forEach((r) => { if (!vehicleOptionsMap.has(r.product_id)) vehicleOptionsMap.set(r.product_id, []); vehicleOptionsMap.get(r.product_id).push(r); });
    } catch {}
    try {
      db.prepare(`SELECT * FROM product_sic_hubs WHERE product_id IN (${ph}) AND COALESCE(is_active,1)=1 ORDER BY sort_order`).all(...productIds)
        .forEach((r) => { if (!sicHubsMap.has(r.product_id)) sicHubsMap.set(r.product_id, []); sicHubsMap.get(r.product_id).push(r); });
    } catch {}
    try {
      db.prepare(`SELECT * FROM product_hotel_tiers WHERE product_id IN (${ph}) AND COALESCE(is_active,1)=1 ORDER BY sort_order`).all(...productIds)
        .forEach((r) => { if (!hotelTiersMap.has(r.product_id)) hotelTiersMap.set(r.product_id, []); hotelTiersMap.get(r.product_id).push(r); });
    } catch {}
    try {
      db.prepare(`SELECT * FROM product_itinerary_items WHERE product_id IN (${ph}) ORDER BY sort_order`).all(...productIds)
        .forEach((r) => { if (!itineraryItemsMap.has(r.product_id)) itineraryItemsMap.set(r.product_id, []); itineraryItemsMap.get(r.product_id).push(r); });
    } catch {}
  }

  return rows.map((row) => {
    const pricing = pricingMap.get(row.id) || [];
    const transferRoute = transferRouteMap.get(row.id) || null;
    const dayTour = dayTourMap.get(row.id) || null;
    const packageItinerary = packageMap.get(row.id) || null;
    const supplier = supplierMap.get(row.supplier_id) || null;
    const verifiedQuality = qualityMap.get(row.id) || null;

    let derivedGroupType = row.group_type;
    if (row.product_type === "TRANSFER") {
      derivedGroupType = "PRIVATE";
    } else if (!derivedGroupType) {
      if (
        row.title?.toLowerCase().includes("shared") ||
        row.title?.toLowerCase().includes("group tour") ||
        pricing?.some((p) => p.pricing_model === "PER_PERSON" || p.variant_name?.toLowerCase().includes("seat") || p.variant_name?.toLowerCase().includes("shared"))
      ) {
        derivedGroupType = "SHARED";
      } else {
        derivedGroupType = "PRIVATE";
      }
    }

    return {
      ...row,
      id: row.id,
      title: row.title,
      city: row.city,
      state: row.state,
      category: row.category,
      productType: row.product_type || "DAY_TOUR",
      groupType: derivedGroupType,
      group_type: derivedGroupType,
      shortDesc: row.short_desc,
      fullDesc: row.full_desc,
      durationHours: row.duration_hours,
      priceInr: row.price_inr,
      strikePriceInr: row.strike_price_inr,
      rating: verifiedQuality?.review_count ? verifiedQuality.average_rating : (row.rating || 4.8),
      review_count: verifiedQuality?.review_count ?? row.review_count ?? 12,
      reviewCount: verifiedQuality?.review_count ?? row.review_count ?? 12,
      qualityScore: verifiedQuality?.score_100 || null,
      qualityTier: verifiedQuality?.tier || "NEW",
      bestseller: Boolean(row.bestseller),
      freeCancellation: Boolean(row.free_cancellation),
      isInstantBooking: Boolean(row.is_instant_booking),
      heroImage: row.hero_image,
      images: safeJsonParse(row.images, [row.hero_image]),
      inclusions: safeJsonParse(row.inclusions, []),
      exclusions: safeJsonParse(row.exclusions, []),
      itinerary: safeJsonParse(row.itinerary, []),
      supplierName: supplier ? supplier.company_name : "Idea Holiday Verified Supplier",
      supplierRating: supplier ? supplier.rating : 4.8,
      pricingVariants: pricing,
      transferRoute,
      transferMeta: transferRoute ? {
        ...transferRoute,
        routeType: transferRoute.route_type,
        serviceDirection: String(transferRoute.route_type).toUpperCase() === "AIRPORT_DROP" ? "DEPARTURE" : "ARRIVAL",
        originName: transferRoute.origin_name,
        originLat: Number(transferRoute.origin_lat),
        originLng: Number(transferRoute.origin_lng),
        destName: transferRoute.dest_name,
        destLat: Number(transferRoute.dest_lat),
        destLng: Number(transferRoute.dest_lng),
        zoneName: String(transferRoute.route_type).toUpperCase() === "AIRPORT_DROP" ? transferRoute.origin_name : transferRoute.dest_name,
        freeWaitingMins: Number(transferRoute.free_waiting_mins || 0),
      } : null,
      dayTour: dayTour ? {
        ...dayTour,
        availableTimeSlots: safeJsonParse(dayTour.available_time_slots, []),
        placesCovered: safeJsonParse(dayTour.places_covered, []),
        vehicleRules: safeJsonParse(dayTour.vehicle_rules, []),
      } : null,
      packageItinerary: packageItinerary
        ? {
            ...packageItinerary,
            dayWiseDetails: safeJsonParse(packageItinerary.day_wise_details, []),
            hotelCategories: safeJsonParse(packageItinerary.hotel_categories, [])
          }
        : null,
      // Plan 14 fields
      productSubType: row.product_sub_type || null,
      durationDays: row.duration_days || null,
      highlights: safeJsonParse(row.highlights, []),
      essentialInfo: safeJsonParse(row.essential_info, []),
      ticketTiers: ticketTiersMap.get(row.id) || [],
      vehicleOptions: vehicleOptionsMap.get(row.id) || [],
      sicHubs: sicHubsMap.get(row.id) || [],
      hotelTiers: hotelTiersMap.get(row.id) || [],
      itineraryItems: itineraryItemsMap.get(row.id) || [],
    };
  });
}

function parseProductRow(row) {
  if (!row) return null;
  const list = parseProductRows([row]);
  return list[0] || null;
}

// GET /api/destinations
router.get("/destinations", (req, res) => {
  const now = Date.now();
  if (destinationCache.data && destinationCache.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(destinationCache.data);
  }

  try {
    const rows = db.prepare("SELECT * FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name").all();
    destinationCache.data = rows;
    destinationCache.expiresAt = now + 300000; // 5 minutes
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows);
  } catch (err) {
    logger.error("Destination lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch destinations" });
  }
});

// GET /api/cities - Approved supplier operating cities.
router.get("/cities", (req, res) => {
  const now = Date.now();
  if (citiesCache.data && citiesCache.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(citiesCache.data);
  }

  try {
    const rows = db.prepare(`
      SELECT id, name, state, COALESCE(category, 'TOURISM') AS category
      FROM destinations
      WHERE COALESCE(is_active, 1) = 1
      ORDER BY CASE WHEN category = 'METRO' THEN 0 ELSE 1 END, name
    `).all();
    citiesCache.data = rows;
    citiesCache.expiresAt = now + 300000;
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows);
  } catch (err) {
    logger.error("City lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

// GET /api/activities?destination=lucknow&category=Airport+Transfers&type=TRANSFER&groupType=SHARED&q=airport&sort=price_asc
router.get("/activities", (req, res) => {
  const { destination, category, productType, type, groupType, q, sort } = req.query;

  // Build cache key
  const cacheKey = JSON.stringify({
    destination: destination || "",
    category: category || "",
    productType: productType || "",
    type: type || "",
    groupType: groupType || "",
    q: q || "",
    sort: sort || ""
  });

  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    return res.json(cached.data);
  }

  try {
    let sql = `SELECT p.* FROM products p WHERE p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1`;
    const params = [];

    if (destination) {
      const dTrim = destination.trim().toLowerCase();
      let destRow = null;
      try {
        destRow = db.prepare("SELECT id, name, state FROM destinations WHERE LOWER(id) = ? OR LOWER(name) = ?").get(dTrim, dTrim);
      } catch (e) {}

      if (destRow) {
        sql += " AND (LOWER(p.city) LIKE ? OR LOWER(p.state) LIKE ? OR LOWER(p.city) LIKE ? OR LOWER(p.state) LIKE ?)";
        params.push(
          `%${destRow.name.toLowerCase()}%`,
          `%${destRow.state.toLowerCase()}%`,
          `%${dTrim}%`,
          `%${dTrim}%`
        );
      } else {
        sql += " AND (LOWER(p.city) LIKE ? OR LOWER(p.state) LIKE ?)";
        params.push(`%${dTrim}%`, `%${dTrim}%`);
      }
    }

    // Normalize product type filter
    const requestedType = (productType || type || "").trim().toUpperCase();
    if (requestedType === "PACKAGE" || requestedType === "PACKAGES" || requestedType === "MULTI_DAY_PACKAGE") {
      sql += " AND p.product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE')";
    } else if (requestedType === "TOUR" || requestedType === "TOURS" || requestedType === "DAY_TOUR") {
      sql += " AND p.product_type IN ('TOUR', 'DAY_TOUR')";
    } else if (requestedType === "TRANSFER" || requestedType === "TRANSFERS") {
      sql += " AND p.product_type = 'TRANSFER'";
    } else if (requestedType === "ATTRACTION" || requestedType === "ATTRACTIONS") {
      sql += " AND p.product_type = 'ATTRACTION'";
    } else if (requestedType === "EXPERIENCE" || requestedType === "EXPERIENCES") {
      sql += " AND p.product_type = 'EXPERIENCE'";
    } else if (requestedType) {
      sql += " AND p.product_type = ?";
      params.push(requestedType);
    }

    if (category) {
      if (category.toLowerCase().includes("transfer") && !normalizedProductType) {
        sql += " AND (LOWER(p.category) LIKE ? OR p.product_type = 'TRANSFER')";
        params.push(`%${category.toLowerCase()}%`);
      } else {
        sql += " AND LOWER(p.category) LIKE ?";
        params.push(`%${category.toLowerCase()}%`);
      }
    }

    if (groupType) {
      const gType = groupType.toUpperCase();
      if (gType === "SHARED") {
        sql += " AND p.product_type != 'TRANSFER' AND (p.group_type = 'SHARED' OR LOWER(p.title) LIKE '%shared%' OR LOWER(p.title) LIKE '%group tour%')";
      } else if (gType === "PRIVATE") {
        sql += " AND (p.product_type = 'TRANSFER' OR p.group_type = 'PRIVATE' OR (p.group_type IS NULL AND LOWER(p.title) NOT LIKE '%shared%' AND LOWER(p.title) NOT LIKE '%group tour%'))";
      }
    }

    if (q) {
      const qTrim = q.trim().toLowerCase();
      sql += " AND (LOWER(p.title) LIKE ? OR LOWER(p.city) LIKE ? OR LOWER(p.state) LIKE ? OR LOWER(p.category) LIKE ? OR LOWER(p.short_desc) LIKE ?)";
      params.push(`%${qTrim}%`, `%${qTrim}%`, `%${qTrim}%`, `%${qTrim}%`, `%${qTrim}%`);
    }

    if (sort === "price_asc") sql += " ORDER BY p.price_inr ASC";
    else if (sort === "price_desc") sql += " ORDER BY p.price_inr DESC";
    else if (sort === "rating") sql += " ORDER BY p.rating DESC";
    else sql += " ORDER BY p.bestseller DESC, p.rating DESC";

    const rows = db.prepare(sql).all(...params);
    const result = parseProductRows(rows);

    // Save to in-memory cache
    if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, { data: result, expiresAt: now + SEARCH_CACHE_TTL_MS });

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json(result);
  } catch (err) {
    logger.error("Activity search failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to search activities" });
  }
});

function sendSuggestions(req, res) {
  try {
    const product = db.prepare("SELECT id FROM products WHERE id = ? AND status = 'PUBLISHED' AND COALESCE(is_published, 1) = 1").get(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found", code: "PRODUCT_NOT_FOUND", requestId: req.requestId });
    const side = String(req.query.side || req.body?.side || "PICKUP").toUpperCase();
    const query = String(req.query.q || req.body?.q || "").slice(0, 100);
    const suggestions = getPickupSuggestions(db, req.params.id, side, query);
    res.json({ success: true, suggestions });
  } catch (error) {
    logger.error("Product pickup suggestions failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not load pickup suggestions", requestId: req.requestId });
  }
}

router.get("/activities/:id/pickup-suggestions", sendSuggestions);
router.post("/activities/:id/pickup-suggestions", validateBody(locationSchemas.suggestions), sendSuggestions);

router.post("/activities/:id/validate-pickup", validateBody(locationSchemas.validatePoint), (req, res) => {
  const result = validatePickupPoint(db, req.params.id, req.body?.side || "PICKUP", req.body?.lat, req.body?.lng, req.body?.address);
  if (!result.valid) return res.status(400).json({ ...result, requestId: req.requestId });
  return res.json({ success: true, ...result });
});

router.get("/activities/:id/options", (req, res) => {
  try {
    const product = db.prepare("SELECT id FROM products WHERE id = ? AND status = 'PUBLISHED' AND COALESCE(is_published, 1) = 1").get(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const options = getProductOptions(db, product.id);
    return res.json({ success: true, options: options.length ? options : [ensureDefaultProductOption(db, product)].filter(Boolean) });
  } catch (error) { return res.status(500).json({ error: "Failed to load product options" }); }
});

router.get("/activities/:id/options/:optionId", (req, res) => {
  try {
    const option = getOption(db, req.params.id, req.params.optionId);
    if (!option) return res.status(404).json({ error: "Product option not found" });
    return res.json({ success: true, option, bookingQuestions: getBookingQuestions(db, option.id) });
  } catch { return res.status(500).json({ error: "Failed to load product option" }); }
});

// GET /api/activities/:id
router.get("/activities/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT p.* FROM products p WHERE p.id = ? AND p.status = 'PUBLISHED' AND COALESCE(p.is_published, 1) = 1").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Product not found" });
    const product = parseProductRow(row);
    const context = getProductLocationContext(db, row.id);
    product.locationRules = context?.rules?.map((rule) => ({
      side: rule.rule_side,
      mode: rule.rule_mode,
      allowedCity: rule.allowed_city,
      allowedState: rule.allowed_state,
      allowedLocationTypes: safeJsonParse(rule.allowed_location_types, []),
      radiusKm: Number(rule.radius_km || rule.fixed_radius_km || 0) || null,
      fixedLocation: rule.fixed_name ? {
        id: rule.fixed_location_id,
        name: rule.fixed_name,
        shortName: rule.fixed_short_name,
        iataCode: rule.fixed_iata_code,
        type: rule.fixed_location_type,
        lat: Number(rule.fixed_lat),
        lng: Number(rule.fixed_lng),
      } : null,
      errorMessage: rule.error_message,
      suggestion: rule.suggestion,
    })) || [];
    const defaultOption = ensureDefaultProductOption(db, row);
    product.options = getProductOptions(db, row.id);
    if (!product.options.length && defaultOption) product.options = [defaultOption];
    product.bookingQuestions = product.options.flatMap((option) => getBookingQuestions(db, option.id));
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(product);
  } catch (err) {
    logger.error("Activity detail lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to load activity details" });
  }
});

export default router;
