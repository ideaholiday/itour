import db from "../db.js";
import crypto from "crypto";
import { cacheService } from "./cacheService.js";
import { priorMeanRating } from "./reviewService.js";

const CITY_COORDINATES = {
  "delhi": { lat: 28.6139, lng: 77.2090 },
  "delhi ncr": { lat: 28.6139, lng: 77.2090 },
  "mumbai": { lat: 19.0760, lng: 72.8777 },
  "jaipur": { lat: 26.9124, lng: 75.7873 },
  "agra": { lat: 27.1767, lng: 78.0081 },
  "goa": { lat: 15.2993, lng: 74.1240 },
  "varanasi": { lat: 25.3176, lng: 82.9739 },
  "udaipur": { lat: 24.5854, lng: 73.7125 },
  "kochi": { lat: 9.9312, lng: 76.2673 },
  "lucknow": { lat: 26.8467, lng: 80.9462 },
  "bengaluru": { lat: 12.9716, lng: 77.5946 },
  "hyderabad": { lat: 17.3850, lng: 78.4867 },
  "chennai": { lat: 13.0827, lng: 80.2707 },
  "kolkata": { lat: 22.5726, lng: 88.3639 },
  "pune": { lat: 18.5204, lng: 73.8567 },
  "ahmedabad": { lat: 23.0225, lng: 72.5714 },
  "amritsar": { lat: 31.6340, lng: 74.8723 },
  "ayodhya": { lat: 26.7922, lng: 82.1998 },
  "rishikesh": { lat: 30.0869, lng: 78.2676 },
  "shimla": { lat: 31.1048, lng: 77.1734 },
  "manali": { lat: 32.2432, lng: 77.1892 },
  "leh": { lat: 34.1526, lng: 77.5771 },
  "srinagar": { lat: 34.0837, lng: 74.7973 },
  "munnar": { lat: 10.0889, lng: 77.0595 },
  "alappuzha": { lat: 9.4981, lng: 76.3388 },
  "darjeeling": { lat: 27.0410, lng: 88.2663 },
  "gangtok": { lat: 27.3389, lng: 88.6065 },
  "hampi": { lat: 15.3350, lng: 76.4600 },
  "jodhpur": { lat: 26.2389, lng: 73.0243 },
  "jaisalmer": { lat: 26.9157, lng: 70.9083 },
  "puri": { lat: 19.8135, lng: 85.8312 },
  "madurai": { lat: 9.9252, lng: 78.1198 },
  "mysuru": { lat: 12.2958, lng: 76.6394 },
  "ooty": { lat: 11.4102, lng: 76.6950 },
  "puducherry": { lat: 11.9416, lng: 79.8083 }
};

export class SearchService {
  /**
   * Autocomplete suggestions matching query
   */
  static getSuggestions(query = "") {
    const q = String(query).trim().toLowerCase();
    const cacheKey = `suggestions:${q}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    if (!q || q.length < 2) {
      // Return popular defaults
      const topDestinations = db.prepare(`
        SELECT name FROM destinations WHERE is_active = 1 LIMIT 5
      `).all().map(d => d.name);

      const topCategories = [
        "Day Tours & Sightseeing",
        "Airport & Intercity Transfers",
        "Multi-Day Holiday Packages",
        "Heritage & Cultural Experiences",
        "Adventure & Wildlife"
      ];

      const result = {
        destinations: topDestinations,
        experiences: ["Taj Mahal Sunrise Tour", "Jaipur Heritage City Walk", "Goa Coastal Cruise"],
        categories: topCategories,
      };
      cacheService.set(cacheKey, result, 300);
      return result;
    }

    const destinations = db.prepare(`
      SELECT name, state FROM destinations
      WHERE LOWER(name) LIKE ? OR LOWER(state) LIKE ?
      LIMIT 5
    `).all(`%${q}%`, `%${q}%`).map(d => `${d.name}, ${d.state}`);

    const rawProducts = db.prepare(`
      SELECT id, title, city, price_inr, category FROM products
      WHERE (is_published = 1 OR status = 'PUBLISHED')
        AND (LOWER(title) LIKE ? OR LOWER(city) LIKE ?)
      LIMIT 5
    `).all(`%${q}%`, `%${q}%`);

    const experiences = rawProducts.map(p => p.title);
    const products = rawProducts.map(p => ({
      id: p.id,
      title: p.title,
      destination: p.city,
      price_inr: p.price_inr,
      category: p.category,
    }));

    const categories = db.prepare(`
      SELECT DISTINCT category FROM products
      WHERE (is_published = 1 OR status = 'PUBLISHED')
        AND LOWER(category) LIKE ?
      LIMIT 4
    `).all(`%${q}%`).map(c => c.category);

    const result = {
      destinations,
      experiences,
      products,
      categories,
    };
    cacheService.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Search products with faceted filtering, ranking, coordinates, and pagination
   */
  static searchProducts(options = {}) {
    const {
      query = "",
      city = "",
      state = "",
      category = "",
      productType = "",
      type = "",
      duration = "",
      vehicleType = "",
      minPrice = null,
      maxPrice = null,
      minRating = null,
      groupType = "",
      instantOnly = false,
      freeCancellation = false,
      bestseller = false,
      bounds = null,
      centerLat = null,
      centerLng = null,
      radiusKm = null,
      sort = "recommended",
      order = "desc",
      page = 1,
      limit = 20,
    } = options;

    const cacheKey = `search:${JSON.stringify(options)}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;

    const offset = (page - 1) * limit;
    let whereConditions = ["(p.is_published = 1 OR p.status = 'PUBLISHED')"];
    const params = [];

    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      whereConditions.push(`(
        LOWER(p.title) LIKE ? OR 
        LOWER(p.city) LIKE ? OR 
        LOWER(p.state) LIKE ? OR 
        LOWER(p.short_desc) LIKE ? OR
        LOWER(p.category) LIKE ?
      )`);
      params.push(q, q, q, q, q);
    }

    if (city) {
      whereConditions.push("LOWER(p.city) = LOWER(?)");
      params.push(city);
    }

    if (state) {
      whereConditions.push("LOWER(p.state) = LOWER(?)");
      params.push(state);
    }

    if (category) {
      whereConditions.push("LOWER(p.category) = LOWER(?)");
      params.push(category);
    }

    const effectiveType = productType || type;
    if (effectiveType) {
      const normalizedType = String(effectiveType).trim().toUpperCase();
      if (["TOUR", "TOURS", "DAY_TOUR"].includes(normalizedType)) {
        whereConditions.push("p.product_type IN ('TOUR', 'DAY_TOUR')");
      } else if (["PACKAGE", "PACKAGES", "MULTI_DAY_PACKAGE"].includes(normalizedType)) {
        whereConditions.push("p.product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE')");
      } else {
        whereConditions.push("p.product_type = ?");
        params.push(normalizedType);
      }
    }

    // Duration buckets
    if (duration) {
      const d = String(duration).toLowerCase();
      if (d === "short" || d === "under_4h" || d === "0-4") {
        whereConditions.push("(p.duration_hours < 4 AND p.product_type NOT IN ('PACKAGE', 'MULTI_DAY_PACKAGE'))");
      } else if (d === "half_day" || d === "4-8") {
        whereConditions.push("(p.duration_hours >= 4 AND p.duration_hours <= 8 AND p.product_type NOT IN ('PACKAGE', 'MULTI_DAY_PACKAGE'))");
      } else if (d === "full_day" || d === "8-24" || d === "day") {
        whereConditions.push("((p.duration_hours > 8 AND p.duration_hours <= 24) OR (p.duration_hours IS NULL AND p.product_type IN ('TOUR', 'DAY_TOUR')))");
      } else if (d === "multi_day" || d === "package" || d === "multi") {
        whereConditions.push("(p.product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE') OR p.duration_hours > 24)");
      }
    }

    // Vehicle Category filter (transfers & private tours)
    if (vehicleType) {
      const v = String(vehicleType).toUpperCase();
      whereConditions.push(`(
        EXISTS (SELECT 1 FROM transfer_routes tr WHERE tr.product_id = p.id AND UPPER(tr.vehicle_category) = ?)
        OR EXISTS (SELECT 1 FROM package_itineraries pi WHERE pi.product_id = p.id AND UPPER(pi.vehicle_category) = ?)
        OR UPPER(p.title) LIKE ?
        OR UPPER(p.short_desc) LIKE ?
      )`);
      params.push(v, v, `%${v}%`, `%${v}%`);
    }

    if (minPrice !== null && !isNaN(minPrice)) {
      whereConditions.push("p.price_inr >= ?");
      params.push(Number(minPrice));
    }

    if (maxPrice !== null && !isNaN(maxPrice)) {
      whereConditions.push("p.price_inr <= ?");
      params.push(Number(maxPrice));
    }

    if (minRating !== null && !isNaN(minRating)) {
      // A rating filter matches what travelers actually rated. A listing with
      // no verified review has no rating and cannot satisfy a rating floor.
      whereConditions.push(`EXISTS (
        SELECT 1 FROM quality_scores qs WHERE qs.entity_type = 'PRODUCT' AND qs.entity_id = p.id
          AND qs.review_count > 0 AND qs.average_rating >= ?
      )`);
      params.push(Number(minRating));
    }

    if (groupType) {
      const normalizedGroup = String(groupType).toUpperCase();
      if (normalizedGroup === "SHARED") {
        whereConditions.push("(p.group_type IN ('SHARED', 'SIC') OR p.product_sub_type IN ('SIC', 'TICKET_SIC'))");
      } else {
        whereConditions.push("p.group_type = ?");
        params.push(normalizedGroup);
      }
    }

    if (instantOnly) {
      whereConditions.push("p.is_instant_booking = 1");
    }

    if (freeCancellation) {
      whereConditions.push("p.free_cancellation = 1");
    }

    if (bestseller) {
      whereConditions.push("p.bestseller = 1");
    }

    const whereClause = whereConditions.join(" AND ");

    // Sorting. Rating order runs on the smoothed rating so an unreviewed
    // listing ranks at the prior mean instead of below every rated one; the
    // rating shown to the traveler is still the real average, or none.
    const priorMean = priorMeanRating(db, "PRODUCT");
    const rankRating = "COALESCE(qs_rank.smoothed_rating, ?)";
    const orderParams = [];

    let orderByClause = `p.bestseller DESC, ${rankRating} DESC`;
    orderParams.push(priorMean);
    if (sort === "price_asc" || (sort === "price" && order === "asc")) {
      orderByClause = "p.price_inr ASC";
      orderParams.length = 0;
    } else if (sort === "price_desc" || (sort === "price" && order === "desc")) {
      orderByClause = "p.price_inr DESC";
      orderParams.length = 0;
    } else if (sort === "rating") {
      orderByClause = `${rankRating} DESC, COALESCE(p.review_count, 0) DESC`;
    } else if (sort === "newest") {
      orderByClause = "p.created_at DESC";
      orderParams.length = 0;
    }

    // Count total matches
    const countSql = `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`;
    const total = db.prepare(countSql).get(...params)?.total || 0;

    // Fetch page of products with supplier and transfer route details
    const dataSql = `
      SELECT p.*, s.company_name as supplier_company_name, s.rating as supplier_rating,
        tr.origin_lat, tr.origin_lng, tr.dest_lat, tr.dest_lng, tr.vehicle_category as transfer_vehicle,
        pi.total_days as package_days,
        qs_rank.smoothed_rating, qs_rank.average_rating as verified_rating, qs_rank.review_count as verified_review_count
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN transfer_routes tr ON tr.product_id = p.id
      LEFT JOIN package_itineraries pi ON pi.product_id = p.id
      LEFT JOIN quality_scores qs_rank ON qs_rank.entity_type = 'PRODUCT' AND qs_rank.entity_id = p.id
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `;

    const rawProducts = db.prepare(dataSql).all(...params, ...orderParams, limit, offset);

    // Coordinate enrichment
    const products = rawProducts.map((prod, index) => {
      const cityKey = String(prod.city || "").trim().toLowerCase();
      const cityCoord = CITY_COORDINATES[cityKey] || { lat: 20.5937, lng: 78.9629 };
      // Jitter slightly for visual clarity on map when multiple products are in same city
      const jitterLat = ((index % 5) - 2) * 0.008;
      const jitterLng = (((index + 1) % 5) - 2) * 0.008;
      const lat = prod.origin_lat || Number((cityCoord.lat + jitterLat).toFixed(4));
      const lng = prod.origin_lng || Number((cityCoord.lng + jitterLng).toFixed(4));
      const reviewCount = Number(prod.verified_review_count || prod.review_count || 0);
      return {
        ...prod,
        lat,
        lng,
        // No verified review, no rating — `isNewListing` is what the card shows.
        rating: reviewCount ? (prod.verified_rating ?? prod.rating) : null,
        review_count: reviewCount,
        isNewListing: reviewCount === 0,
        inclusions: typeof prod.inclusions === "string" ? JSON.parse(prod.inclusions || "[]") : (prod.inclusions || []),
        exclusions: typeof prod.exclusions === "string" ? JSON.parse(prod.exclusions || "[]") : (prod.exclusions || []),
      };
    });

    // Compute dynamic facet aggregations over the current search base
    const baseWhere = "WHERE (p.is_published = 1 OR p.status = 'PUBLISHED')" + 
      (query && query.trim() ? ` AND (LOWER(p.title) LIKE ? OR LOWER(p.city) LIKE ? OR LOWER(p.state) LIKE ? OR LOWER(p.short_desc) LIKE ? OR LOWER(p.category) LIKE ?)` : "");
    const baseParams = query && query.trim() ? [`%${query.trim().toLowerCase()}%`, `%${query.trim().toLowerCase()}%`, `%${query.trim().toLowerCase()}%`, `%${query.trim().toLowerCase()}%`, `%${query.trim().toLowerCase()}%`] : [];

    const categoryFacets = db.prepare(`
      SELECT category as name, COUNT(*) as count FROM products p ${baseWhere} GROUP BY category ORDER BY count DESC
    `).all(...baseParams);

    const cityFacets = db.prepare(`
      SELECT city as name, COUNT(*) as count FROM products p ${baseWhere} GROUP BY city ORDER BY count DESC LIMIT 12
    `).all(...baseParams);

    const typeFacets = db.prepare(`
      SELECT CASE
        WHEN product_type IN ('TOUR', 'DAY_TOUR') THEN 'TOUR'
        WHEN product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE') THEN 'PACKAGE'
        ELSE product_type
      END as type, COUNT(*) as count
      FROM products p ${baseWhere}
      GROUP BY CASE
        WHEN product_type IN ('TOUR', 'DAY_TOUR') THEN 'TOUR'
        WHEN product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE') THEN 'PACKAGE'
        ELSE product_type
      END
    `).all(...baseParams);

    const aggStats = db.prepare(`
      SELECT 
        MIN(p.price_inr) as min_price,
        MAX(p.price_inr) as max_price,
        COALESCE(SUM(CASE WHEN p.duration_hours < 4 AND p.product_type NOT IN ('PACKAGE', 'MULTI_DAY_PACKAGE') THEN 1 ELSE 0 END), 0) as short_count,
        COALESCE(SUM(CASE WHEN p.duration_hours >= 4 AND p.duration_hours <= 8 AND p.product_type NOT IN ('PACKAGE', 'MULTI_DAY_PACKAGE') THEN 1 ELSE 0 END), 0) as half_day_count,
        COALESCE(SUM(CASE WHEN (p.duration_hours > 8 AND p.duration_hours <= 24) OR (p.duration_hours IS NULL AND p.product_type IN ('TOUR', 'DAY_TOUR')) THEN 1 ELSE 0 END), 0) as full_day_count,
        COALESCE(SUM(CASE WHEN p.product_type IN ('PACKAGE', 'MULTI_DAY_PACKAGE') OR p.duration_hours > 24 THEN 1 ELSE 0 END), 0) as multi_day_count,
        COALESCE(SUM(CASE WHEN qs.review_count > 0 AND qs.average_rating >= 4.5 THEN 1 ELSE 0 END), 0) as r45,
        COALESCE(SUM(CASE WHEN qs.review_count > 0 AND qs.average_rating >= 4.0 THEN 1 ELSE 0 END), 0) as r40,
        COALESCE(SUM(CASE WHEN qs.review_count > 0 AND qs.average_rating >= 3.5 THEN 1 ELSE 0 END), 0) as r35
      FROM products p
      LEFT JOIN quality_scores qs ON qs.entity_type = 'PRODUCT' AND qs.entity_id = p.id
      ${baseWhere}
    `).get(...baseParams) || {};

    const priceStats = {
      min: aggStats.min_price || 499,
      max: aggStats.max_price || 25000,
    };

    const durationCounts = {
      short: Number(aggStats.short_count) || 0,
      half_day: Number(aggStats.half_day_count) || 0,
      full_day: Number(aggStats.full_day_count) || 0,
      multi_day: Number(aggStats.multi_day_count) || 0,
    };

    const r45 = Number(aggStats.r45) || 0;
    const r40 = Number(aggStats.r40) || 0;
    const r35 = Number(aggStats.r35) || 0;

    const ratingCounts = {
      "4.5": r45,
      "4.0": r40,
      "4": r40,
      "3.5": r35,
      "above_4_5": r45,
      "above_4_0": r40,
      "above_3_5": r35,
    };

    const response = {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      facets: {
        categories: categoryFacets,
        cities: cityFacets,
        productTypes: typeFacets,
        durations: durationCounts,
        priceRange: { min: priceStats.min || 499, max: priceStats.max || 25000 },
        ratings: ratingCounts,
      }
    };
    cacheService.set(cacheKey, response, 60);
    return response;
  }

  /**
   * Record search history for user
   */
  static recordHistory(userId, searchQuery, category = null, destination = null) {
    if (!userId || !searchQuery) return null;
    const id = `srch_${crypto.randomBytes(6).toString("hex")}`;
    try {
      db.prepare(`
        INSERT INTO search_history (id, user_id, search_query, category, destination, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(id, userId, searchQuery.trim(), category, destination);
      return id;
    } catch {
      return null;
    }
  }

  /**
   * Get recent search history for user
   */
  static getRecentSearches(userId, limit = 5) {
    if (!userId) return [];
    try {
      return db.prepare(`
        SELECT search_query, category, destination, MAX(created_at) as searched_at
        FROM search_history
        WHERE user_id = ?
        GROUP BY search_query
        ORDER BY searched_at DESC
        LIMIT ?
      `).all(userId, limit);
    } catch {
      return [];
    }
  }
}

export default SearchService;
