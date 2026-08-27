import { isCoordinateInGeoFence, isPointInPolygon, VEHICLE_TAXONOMY } from "../engine/transferEngine.js";
import { evaluateSupplierAvailability } from "./availabilityService.js";
import { resolveCommissionRate } from "./financeService.js";
import { fleetSupportsVehicle, vehicleModelSupportsCategory } from "../lib/vehicleInventory.js";

const ACTIVE_BOOKING_STATUSES = ["pending_payment", "confirmed", "driver_assigned", "in_progress"];

const normalizeText = (value) => String(value || "").trim().toUpperCase();

const normalizeCity = (value) => normalizeText(value)
  .replace(/\bNCR\b/g, "")
  .replace(/\bCITY\b/g, "")
  .replace(/[^A-Z0-9]+/g, " ")
  .trim();

const normalizeRouteType = (value) => {
  const route = normalizeText(value);
  if (["AIRPORT_PICKUP", "AIRPORT_DROP", "AIRPORT_TO_HOTEL", "HOTEL_TO_AIRPORT"].includes(route)) return "AIRPORT_TRANSFER";
  if (["RAILWAY_PICKUP", "RAILWAY_DROP", "STATION_TRANSFER"].includes(route)) return "RAILWAY_TRANSFER";
  if (["CITY_TO_CITY", "OUTSTATION"].includes(route)) return "INTERCITY_TRANSFER";
  if (["HOTEL_TO_HOTEL"].includes(route)) return "HOTEL_TRANSFER";
  return route;
};

const parsePolygon = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || "[]"); } catch { return []; }
};

const validPoint = (lat, lng) => lat !== null && lat !== undefined && lat !== ""
  && lng !== null && lng !== undefined && lng !== ""
  && Number.isFinite(Number(lat))
  && Number.isFinite(Number(lng))
  && Math.abs(Number(lat)) <= 90
  && Math.abs(Number(lng)) <= 180;

const comparableCity = (left, right) => {
  const a = normalizeCity(left);
  const b = normalizeCity(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
};

function coverageMatch(fences, request, candidateCity) {
  for (const fence of fences) {
    if (normalizeText(fence.approval_status || "APPROVED") !== "APPROVED" || Number(fence.is_active) !== 1) continue;
    if (validPoint(request.pickupLat, request.pickupLng)) {
      const polygon = parsePolygon(fence.polygon_coordinates);
      if (polygon.length >= 3 && isPointInPolygon(Number(request.pickupLat), Number(request.pickupLng), polygon)) {
        return { covered: true, fence, method: "APPROVED_POLYGON", score: 35 };
      }
      if (polygon.length < 3 && isCoordinateInGeoFence(Number(request.pickupLat), Number(request.pickupLng), Number(fence.center_lat), Number(fence.center_lng), Number(fence.radius_km))) {
        return { covered: true, fence, method: "APPROVED_RADIUS", score: 32 };
      }
    } else if (comparableCity(fence.city, request.city)) {
      return { covered: true, fence, method: "APPROVED_CITY_ZONE", score: 25 };
    }
  }
  // For non-transfer products (day tours, packages, activities) or listings matching the requested destination city
  if (request.productType !== "TRANSFER" && (comparableCity(candidateCity, request.city) || !request.city)) {
    return { covered: true, fence: null, method: "APPROVED_CITY_ZONE", score: 25 };
  }
  // For transfer listings where city matches and no custom fences were defined
  if (comparableCity(candidateCity, request.city) && !fences?.length) {
    return { covered: true, fence: null, method: "APPROVED_CITY_ZONE", score: 25 };
  }
  return { covered: false, fence: null, method: "NO_APPROVED_COVERAGE", score: 0 };
}

export function rankSupplierCandidates(rawCandidates, request) {
  const prepared = rawCandidates.map((candidate) => {
    const reasons = [];
    const coverage = coverageMatch(candidate.fences || [], request, candidate.productCity);
    if (normalizeText(candidate.kybStatus) !== "APPROVED") reasons.push("Supplier KYB is not approved");
    if (candidate.wasPreviouslyDeclined) reasons.push("Supplier already declined or missed this booking");
    if (!candidate.isPublished) reasons.push("No published compatible listing");
    if (!comparableCity(candidate.productCity, request.city)) reasons.push("Listing city does not match the booked service");
    if (!coverage.covered) reasons.push("Pickup is outside approved coverage");
    if (candidate.isBlocked) reasons.push(candidate.availabilityReason || "Supplier blocked the selected travel date or time");

    const requestedVehicle = normalizeText(request.vehicleCategory);
    const candidateVehicle = normalizeText(candidate.vehicleCategory || requestedVehicle);
    if (request.productType === "TRANSFER" && candidateVehicle !== requestedVehicle) reasons.push(`Vehicle ${requestedVehicle} is not offered`);
    if (request.productType === "TRANSFER" && (Number(candidate.maxPassengers) < request.passengers || Number(candidate.maxLuggage) < request.luggage)) reasons.push("Vehicle capacity is insufficient");
    if (request.productType === "TRANSFER" && normalizeRouteType(candidate.routeType) !== normalizeRouteType(request.routeType)) reasons.push("Transfer route type does not match");

    if (request.productType === "TRANSFER") {
      const fleet = fleetSupportsVehicle(candidate.drivers || [], requestedVehicle);
      if (fleet.managed && fleet.capacity === 0) reasons.push(`No ${requestedVehicle} vehicle exists in managed fleet`);
      if (fleet.managed && fleet.capacity > 0 && Number(candidate.activeBookings) >= fleet.capacity) reasons.push("Managed fleet capacity is already allocated");
    }

    const candidatePrice = Math.max(0, Number(candidate.price) || 0);
    if (!candidatePrice || candidatePrice > Number(request.customerBudget)) reasons.push("Supplier price exceeds the confirmed customer fare");

    return { ...candidate, coverage, candidatePrice, rejectionReasons: reasons };
  });

  const eligiblePrices = prepared.filter((candidate) => !candidate.rejectionReasons.length).map((candidate) => candidate.candidatePrice);
  const lowestPrice = eligiblePrices.length ? Math.min(...eligiblePrices) : 0;
  const ranked = prepared.map((candidate) => {
    if (candidate.rejectionReasons.length) return { ...candidate, eligible: false, score: 0, scoreBreakdown: {} };
    const vehicleScore = 25;
    const availabilityScore = Math.max(3, 15 - Number(candidate.activeBookings || 0) * 3);
    const priceScore = lowestPrice ? Math.round((lowestPrice / candidate.candidatePrice) * 15 * 10) / 10 : 0;
    const ratingScore = Math.round(Math.min(5, Math.max(0, Number(candidate.rating) || 0)) * 2 * 10) / 10;
    const scoreBreakdown = {
      coverage: candidate.coverage.score,
      vehicle: vehicleScore,
      availability: availabilityScore,
      price: priceScore,
      quality: ratingScore,
    };
    const score = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0) * 10) / 10;
    return { ...candidate, eligible: true, score, scoreBreakdown };
  }).sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.isRequestedListing !== b.isRequestedListing) return a.isRequestedListing ? -1 : 1;
    if (a.candidatePrice !== b.candidatePrice) return a.candidatePrice - b.candidatePrice;
    return String(a.supplierId).localeCompare(String(b.supplierId));
  });

  return { selected: ranked.find((candidate) => candidate.eligible) || null, candidates: ranked };
}

export function findAutomaticSupplierAssignment(db, { quote, input, excludedSupplierIds = [] }) {
  const requestedProduct = quote.product;
  const isTransfer = requestedProduct.product_type === "TRANSFER";
  const requestedRoute = isTransfer
    ? db.prepare("SELECT * FROM transfer_routes WHERE product_id = ? LIMIT 1").get(requestedProduct.id)
    : null;
  const requestedPackage = requestedProduct.product_type === "MULTI_DAY_PACKAGE"
    ? db.prepare("SELECT * FROM package_itineraries WHERE product_id = ? LIMIT 1").get(requestedProduct.id)
    : null;
  const sql = isTransfer
    ? `
      SELECT p.id AS candidate_product_id, p.supplier_id, p.city AS product_city, p.price_inr,
             p.status AS product_status, p.is_published, s.company_name, s.kyb_status, s.rating, s.commission_rate,
             tr.route_type, tr.vehicle_category AS route_vehicle_category, tr.max_passengers, tr.max_luggage,
             pi.vehicle_category AS package_vehicle_category
      FROM products p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN transfer_routes tr ON tr.product_id = p.id
      LEFT JOIN package_itineraries pi ON pi.product_id = p.id
      WHERE p.product_type = 'TRANSFER'
    `
    : `
      SELECT p.id AS candidate_product_id, p.supplier_id, p.city AS product_city, p.price_inr,
             p.status AS product_status, p.is_published, s.company_name, s.kyb_status, s.rating, s.commission_rate,
             tr.route_type, tr.vehicle_category AS route_vehicle_category, tr.max_passengers, tr.max_luggage,
             pi.vehicle_category AS package_vehicle_category
      FROM products p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN transfer_routes tr ON tr.product_id = p.id
      LEFT JOIN package_itineraries pi ON pi.product_id = p.id
      WHERE p.id = ?
    `;

  const rows = isTransfer ? db.prepare(sql).all() : db.prepare(sql).all(requestedProduct.id);

  const activePlaceholders = ACTIVE_BOOKING_STATUSES.map(() => "?").join(", ");
  const candidates = rows.map((row) => {
    const isRequestedListing = row.candidate_product_id === requestedProduct.id;
    const fences = db.prepare("SELECT * FROM geo_fences WHERE supplier_id = ?").all(row.supplier_id);
    const requestedVehicleCategory = normalizeText(quote.vehicleCategory);
    const pricingVariants = isTransfer
      ? db.prepare("SELECT variant_name, base_price FROM product_pricing WHERE product_id = ?").all(row.candidate_product_id)
      : [];
    const matchingVehicleVariant = pricingVariants.find((variant) =>
      vehicleModelSupportsCategory(variant.variant_name, requestedVehicleCategory)
    );
    const routeOffersRequestedVehicle = normalizeText(row.route_vehicle_category) === requestedVehicleCategory;
    const offersRequestedVehicle = isRequestedListing || routeOffersRequestedVehicle || Boolean(matchingVehicleVariant);
    const candidateVehicleCategory = isTransfer && offersRequestedVehicle
      ? requestedVehicleCategory
      : row.route_vehicle_category || row.package_vehicle_category || quote.vehicleCategory;
    const vehicleCapacity = isTransfer && offersRequestedVehicle
      ? VEHICLE_TAXONOMY[requestedVehicleCategory]
      : null;
    const activeBookingSql = `
      SELECT COUNT(*) AS count FROM bookings
      WHERE supplier_id = ? AND activity_date = ? AND LOWER(status) IN (${activePlaceholders})
      ${candidateVehicleCategory ? "AND UPPER(COALESCE(vehicle_category, '')) = ?" : ""}
    `;
    const activeBookingParams = [row.supplier_id, quote.activityDate, ...ACTIVE_BOOKING_STATUSES];
    if (candidateVehicleCategory) activeBookingParams.push(normalizeText(candidateVehicleCategory));
    const activeBookings = db.prepare(activeBookingSql).get(...activeBookingParams).count;
    const drivers = db.prepare("SELECT id, vehicle_model, status FROM supplier_drivers WHERE supplier_id = ?").all(row.supplier_id);
    const availability = evaluateSupplierAvailability(db, {
      supplierId: row.supplier_id,
      productId: row.candidate_product_id,
      activityDate: quote.activityDate,
      pickupTime: input.pickup_time || input.pickupTime || "09:00",
      vehicleCategory: candidateVehicleCategory,
    });
    return {
      supplierId: row.supplier_id,
      supplierName: row.company_name,
      candidateProductId: row.candidate_product_id,
      productCity: row.product_city,
      price: isRequestedListing ? quote.baseAmount : matchingVehicleVariant?.base_price ?? row.price_inr,
      isPublished: row.product_status === "PUBLISHED" && Number(row.is_published ?? 1) === 1,
      kybStatus: row.kyb_status,
      rating: row.rating,
      commissionRate: resolveCommissionRate(db, row.supplier_id, requestedProduct.product_type),
      routeType: row.route_type,
      vehicleCategory: candidateVehicleCategory,
      maxPassengers: vehicleCapacity?.maxPax ?? row.max_passengers ?? 99,
      maxLuggage: vehicleCapacity?.maxBags ?? row.max_luggage ?? 99,
      isBlocked: !availability.available,
      availabilityReason: availability.reasons[0],
      availability,
      activeBookings: Number(activeBookings || 0),
      drivers,
      fences,
      isRequestedListing,
      wasPreviouslyDeclined: excludedSupplierIds.includes(row.supplier_id),
    };
  });

  return rankSupplierCandidates(candidates, {
    productType: requestedProduct.product_type,
    city: requestedProduct.city,
    pickupLat: input.pickup_lat,
    pickupLng: input.pickup_lng,
    vehicleCategory: quote.vehicleCategory || requestedPackage?.vehicle_category || requestedRoute?.vehicle_category,
    routeType: requestedRoute?.route_type,
    passengers: quote.adults + quote.children,
    luggage: quote.luggage,
    customerBudget: quote.totalAmount,
  });
}

export function assignmentReason(candidate) {
  if (!candidate) return "No supplier met the automatic assignment rules.";
  const coverageMethod = candidate.coverage?.method ? candidate.coverage.method.replaceAll("_", " ") : "approved city";
  const vehicle = candidate.vehicleCategory || "service";
  return `${coverageMethod} · ${vehicle} matched · available on travel date · score ${candidate.score}/100`;
}
