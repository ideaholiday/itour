import express from "express";
import { SearchService } from "../services/searchService.js";
import { optionalBearer } from "../middleware/auth.js";
import { cacheResponse } from "../middleware/cache.js";

const router = express.Router();

/**
 * GET /api/search/suggestions
 * Returns autocomplete suggestions for destinations, experiences, categories
 */
router.get("/search/suggestions", cacheResponse(300), (req, res) => {
  const query = req.query.q || "";
  const suggestions = SearchService.getSuggestions(query);
  return res.json(suggestions);
});

/**
 * GET /api/search
 * Advanced search with filters and pagination
 */
router.get("/search", optionalBearer, (req, res) => {
  const {
    q,
    city,
    state,
    category,
    productType,
    type,
    duration,
    vehicleType,
    minPrice,
    maxPrice,
    minRating,
    groupType,
    instantOnly,
    freeCancellation,
    bestseller,
    bounds,
    centerLat,
    centerLng,
    radiusKm,
    sort,
    order,
    page = 1,
    limit = 20,
  } = req.query;

  const results = SearchService.searchProducts({
    query: q,
    city,
    state,
    category,
    productType,
    type,
    duration,
    vehicleType,
    minPrice,
    maxPrice,
    minRating,
    groupType,
    instantOnly: instantOnly === "true" || instantOnly === "1",
    freeCancellation: freeCancellation === "true" || freeCancellation === "1",
    bestseller: bestseller === "true" || bestseller === "1",
    bounds,
    centerLat: centerLat ? parseFloat(centerLat) : null,
    centerLng: centerLng ? parseFloat(centerLng) : null,
    radiusKm: radiusKm ? parseFloat(radiusKm) : null,
    sort,
    order,
    page: parseInt(page, 10) || 1,
    limit: Math.min(parseInt(limit, 10) || 20, 100),
  });

  // Record history asynchronously if user is logged in
  if (req.user?.id && q) {
    SearchService.recordHistory(req.user.id, q, category, city);
  }

  return res.json(results);
});

/**
 * GET /api/search/recent
 * Get recent searches for authenticated traveler
 */
router.get("/search/recent", optionalBearer, (req, res) => {
  if (!req.user?.id) {
    return res.json({ recentSearches: [] });
  }
  const recentSearches = SearchService.getRecentSearches(req.user.id);
  return res.json({ recentSearches });
});

export default router;
