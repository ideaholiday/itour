import { calculateHaversineDistanceKm } from "../engine/transferEngine.js";

export const LOCATION_TYPES = Object.freeze([
  "AIRPORT", "RAILWAY_STATION", "BUS_STAND", "HOTEL_ZONE",
  "CITY_CENTER", "LANDMARK", "CRUISE_PORT", "PICKUP_ZONE",
]);

export const RULE_MODES = Object.freeze([
  "FIXED_LOCATION", "ZONE_POLYGON", "RADIUS_FROM_CENTER", "CITY_ANYWHERE",
]);

function parseJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function coordinates(lat, lng) {
  const point = { lat: Number(lat), lng: Number(lng) };
  return Number.isFinite(point.lat) && point.lat >= 6 && point.lat <= 38
    && Number.isFinite(point.lng) && point.lng >= 68 && point.lng <= 98
    ? point : null;
}

function distanceKm(a, b) {
  return calculateHaversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
}

function publicLocation(row) {
  return row ? {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    iataCode: row.iata_code,
    type: row.location_type,
    city: row.city,
    state: row.state,
    lat: Number(row.lat),
    lng: Number(row.lng),
    radiusKm: Number(row.radius_km),
  } : null;
}

function nearestLocation(db, point, { types = [], state = null, city = null } = {}) {
  let rows;
  try {
    rows = db.prepare("SELECT * FROM canonical_locations WHERE COALESCE(is_active, 1) = 1").all();
  } catch {
    // Migration 014 may not have been applied yet on an upgraded deployment.
    // Callers can still use the product's legacy route anchors safely.
    return null;
  }
  if (types.length) rows = rows.filter((row) => types.includes(String(row.location_type).toUpperCase()));
  if (state) rows = rows.filter((row) => normalized(row.state) === normalized(state));
  if (city) {
    const target = normalized(city);
    rows = rows.filter((row) => normalized(row.city).includes(target) || target.includes(normalized(row.city)));
  }
  return rows.map((row) => ({ row, distanceKm: distanceKm(point, row) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function pointInPolygon(point, rawPolygon) {
  const polygon = parseJson(rawPolygon).map((entry) => Array.isArray(entry)
    ? { lat: Number(entry[0]), lng: Number(entry[1]) }
    : { lat: Number(entry.lat ?? entry.latitude), lng: Number(entry.lng ?? entry.longitude) })
    .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng));
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function routeFor(db, productId) {
  return db.prepare("SELECT * FROM transfer_routes WHERE product_id = ? LIMIT 1").get(productId) || null;
}

function dayTourFor(db, productId) {
  try { return db.prepare("SELECT * FROM day_tours WHERE product_id = ? LIMIT 1").get(productId) || null; }
  catch { return null; }
}

function packageFor(db, productId) {
  return db.prepare("SELECT * FROM package_itineraries WHERE product_id = ? LIMIT 1").get(productId) || null;
}

function explicitRules(db, productId) {
  try {
    return db.prepare(`
    SELECT r.*, c.name AS fixed_name, c.short_name AS fixed_short_name,
      c.iata_code AS fixed_iata_code, c.location_type AS fixed_location_type,
      c.city AS fixed_city, c.state AS fixed_state, c.lat AS fixed_lat,
      c.lng AS fixed_lng, c.radius_km AS fixed_radius_km
    FROM product_location_rules r
    LEFT JOIN canonical_locations c ON c.id = r.fixed_location_id
    WHERE r.product_id = ? AND COALESCE(r.is_active, 1) = 1
    `).all(productId);
  } catch {
    // Keep activity detail and quote flows available until migration 014 is
    // applied; route-derived rules below preserve the legacy behavior.
    return [];
  }
}

function fixedRule(side, route, product) {
  const prefix = side === "PICKUP" ? "origin" : "dest";
  const locationId = route?.[`${prefix}_location_id`];
  return {
    id: `legacy_${product.id}_${side.toLowerCase()}`,
    product_id: product.id,
    rule_side: side,
    rule_mode: "FIXED_LOCATION",
    fixed_location_id: locationId,
    center_lat: route?.[`${prefix}_lat`],
    center_lng: route?.[`${prefix}_lng`],
    radius_km: 3,
    allowed_state: product.state,
    allowed_city: product.city,
    allowed_location_types: JSON.stringify([String(route?.route_type || "").includes("AIRPORT") ? "AIRPORT" : "RAILWAY_STATION"]),
    error_message: `The ${side.toLowerCase()} point is fixed for this transfer.`,
    suggestion: `Use ${route?.[`${prefix}_name`] || "the listed terminal"} as the ${side.toLowerCase()} point.`,
  };
}

function radiusRule(side, route, product) {
  const prefix = side === "PICKUP" ? "origin" : "dest";
  const areaName = route?.[`${prefix}_name`] || product.city;
  return {
    id: `legacy_${product.id}_${side.toLowerCase()}`,
    product_id: product.id,
    rule_side: side,
    rule_mode: "RADIUS_FROM_CENTER",
    center_lat: route?.[`${prefix}_lat`],
    center_lng: route?.[`${prefix}_lng`],
    radius_km: Number(route?.[`${prefix}_radius_km`] || 25),
    allowed_state: product.state,
    allowed_city: product.city,
    allowed_location_types: "[]",
    error_message: `This transfer is valid only within ${areaName}.`,
    suggestion: `Please select a hotel or address within ${areaName}.`,
  };
}

export function getProductLocationContext(db, productId) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) return null;
  const explicit = explicitRules(db, productId);
  const explicitMap = new Map(explicit.map((rule) => [String(rule.rule_side).toUpperCase(), rule]));
  const route = product.product_type === "TRANSFER" ? routeFor(db, productId) : null;
  const dayTour = product.product_type === "DAY_TOUR" ? dayTourFor(db, productId) : null;
  const packageItinerary = product.product_type === "MULTI_DAY_PACKAGE" ? packageFor(db, productId) : null;
  const rules = [];

  if (product.product_type === "TRANSFER" && route) {
    const type = String(route.route_type || "POINT_TO_POINT").toUpperCase();
    const pickup = type.endsWith("_PICKUP") ? fixedRule("PICKUP", route, product) : radiusRule("PICKUP", route, product);
    const drop = type.endsWith("_DROP") ? fixedRule("DROP", route, product) : radiusRule("DROP", route, product);
    rules.push(explicitMap.get("PICKUP") || pickup, explicitMap.get("DROP") || drop);
  } else if (product.product_type === "DAY_TOUR") {
    const base = {
      product_id: product.id,
      rule_mode: "CITY_ANYWHERE",
      allowed_state: product.state,
      allowed_city: product.city,
      allowed_location_types: "[]",
      radius_km: Number(dayTour?.distance_km_limit || 80),
      error_message: `This tour departs only from pickup points in ${product.city}.`,
      suggestion: `Please enter your hotel or meeting address in ${product.city}.`,
    };
    rules.push(explicitMap.get("PICKUP") || { ...base, id: `legacy_${product.id}_pickup`, rule_side: "PICKUP" });
    rules.push(explicitMap.get("DROP") || { ...base, id: `legacy_${product.id}_drop`, rule_side: "DROP" });
  } else if (product.product_type === "MULTI_DAY_PACKAGE") {
    const startCity = packageItinerary?.start_city || product.city;
    const endCity = packageItinerary?.end_city || product.city;
    rules.push(explicitMap.get("PICKUP") || {
      id: `legacy_${product.id}_pickup`, product_id: product.id, rule_side: "PICKUP",
      rule_mode: "CITY_ANYWHERE", allowed_state: product.state, allowed_city: startCity,
      allowed_location_types: JSON.stringify(["AIRPORT", "RAILWAY_STATION"]),
      error_message: `Day 1 pickup must be an airport or railway station in ${startCity}.`,
      suggestion: `Select an arrival airport or railway station in ${startCity}.`,
    });
    rules.push(explicitMap.get("DROP") || {
      id: `legacy_${product.id}_drop`, product_id: product.id, rule_side: "DROP",
      rule_mode: "CITY_ANYWHERE", allowed_state: product.state, allowed_city: endCity,
      allowed_location_types: JSON.stringify(["AIRPORT", "RAILWAY_STATION"]),
      error_message: `Final drop must be an airport or railway station in ${endCity}.`,
      suggestion: `Select a departure airport or railway station in ${endCity}.`,
    });
  }

  return { product, route, dayTour, packageItinerary, rules };
}

function validationFailure(rule, side, detail = {}) {
  const label = side === "PICKUP" ? "pickup" : "drop-off";
  return {
    valid: false,
    error: rule.error_message || `The ${label} location is outside this product's service area.`,
    code: side === "PICKUP" ? "INVALID_PICKUP_POINT" : "INVALID_DROP_POINT",
    detail: {
      allowed_area: rule.allowed_city || null,
      allowed_state: rule.allowed_state || null,
      suggestion: rule.suggestion || `Please choose a valid ${label} point for this product.`,
      ...detail,
    },
  };
}

export function validatePickupPoint(db, productId, side, userLat, userLng, userAddress = "") {
  const normalizedSide = String(side || "PICKUP").toUpperCase();
  const context = getProductLocationContext(db, productId);
  if (!context) return { valid: false, error: "Product not found", code: "PRODUCT_NOT_FOUND", detail: { suggestion: "Choose an available product." } };
  const rule = context.rules.find((entry) => String(entry.rule_side).toUpperCase() === normalizedSide);
  if (!rule) return { valid: true, rule: null };
  const point = coordinates(userLat, userLng);
  if (!point) {
    // Legacy day-tour clients may send only a typed address. Keep this path
    // safe by requiring the address to name the product city and flagging it
    // for operations review; coordinate-bearing requests always use the full
    // geo validator below.
    const address = normalized(userAddress);
    const cityHint = normalized(rule.allowed_city);
    const stateHint = normalized(rule.allowed_state);
    if (context.product.product_type === "DAY_TOUR" && address
      && ((cityHint && address.includes(cityHint)) || (stateHint && address.includes(stateHint)))) {
      return {
        valid: true,
        needsOpsReview: true,
        rule: { id: rule.id, side: normalizedSide, mode: String(rule.rule_mode).toUpperCase(), allowedCity: rule.allowed_city, allowedState: rule.allowed_state },
        point: { lat: null, lng: null, address: String(userAddress || "").trim() },
      };
    }
    return validationFailure(rule, normalizedSide, { suggestion: "Select a suggestion or confirm the exact point on the map." });
  }

  const mode = String(rule.rule_mode).toUpperCase();
  let measuredDistance = null;
  let needsOpsReview = false;
  if (mode === "FIXED_LOCATION") {
    let fixed = rule.fixed_location_id
      ? db.prepare("SELECT * FROM canonical_locations WHERE id = ? AND COALESCE(is_active, 1) = 1").get(rule.fixed_location_id)
      : null;
    if (!fixed) fixed = { lat: rule.fixed_lat ?? rule.center_lat, lng: rule.fixed_lng ?? rule.center_lng, radius_km: rule.fixed_radius_km ?? rule.radius_km ?? 3, name: rule.fixed_name };
    if (!coordinates(fixed.lat, fixed.lng)) return validationFailure(rule, normalizedSide, { reason: "RULE_MISCONFIGURED" });
    measuredDistance = distanceKm(point, fixed);
    if (measuredDistance > Number(fixed.radius_km || 3)) {
      return validationFailure(rule, normalizedSide, { provided_distance_km: Number(measuredDistance.toFixed(1)), fixed_location: fixed.name || null });
    }
  } else if (mode === "RADIUS_FROM_CENTER") {
    const center = coordinates(rule.center_lat, rule.center_lng);
    if (!center) return validationFailure(rule, normalizedSide, { reason: "RULE_MISCONFIGURED" });
    measuredDistance = distanceKm(point, center);
    if (measuredDistance > Number(rule.radius_km || 0)) {
      return validationFailure(rule, normalizedSide, { provided_distance_km: Number(measuredDistance.toFixed(1)), radius_km: Number(rule.radius_km) });
    }
  } else if (mode === "ZONE_POLYGON") {
    if (!pointInPolygon(point, rule.polygon_coordinates)) return validationFailure(rule, normalizedSide);
  } else if (mode === "CITY_ANYWHERE") {
    const nearest = nearestLocation(db, point);
    if (rule.allowed_state && nearest && normalized(nearest.row.state) !== normalized(rule.allowed_state)) {
      return validationFailure(rule, normalizedSide, { detected_state: nearest.row.state, provided_distance_km: Number(nearest.distanceKm.toFixed(1)) });
    }
    if (rule.allowed_city) {
      const inNamedCity = nearest && (normalized(nearest.row.city).includes(normalized(rule.allowed_city))
        || normalized(rule.allowed_city).includes(normalized(nearest.row.city)));
      const cityAnchor = nearestLocation(db, point, { city: rule.allowed_city, state: rule.allowed_state });
      const limit = Number(rule.radius_km || cityAnchor?.row.radius_km || 50);
      if (!inNamedCity && (!cityAnchor || cityAnchor.distanceKm > limit)) {
        return validationFailure(rule, normalizedSide, { detected_city: nearest?.row.city || null, provided_distance_km: cityAnchor ? Number(cityAnchor.distanceKm.toFixed(1)) : null });
      }
    }
  }

  // State is an outer envelope for every rule mode. The nearest known anchor
  // makes this deterministic even when reverse geocoding is unavailable.
  const interstateRoute = context.route
    && String(context.route.route_type || '').toUpperCase() === 'CITY_TO_CITY'
    && Number(context.route.interstate_permit_tax);
  if (rule.allowed_state && !interstateRoute) {
    const nearest = nearestLocation(db, point);
    if (nearest && nearest.distanceKm < 250 && normalized(nearest.row.state) !== normalized(rule.allowed_state)) {
      return validationFailure(rule, normalizedSide, { detected_state: nearest.row.state, provided_distance_km: measuredDistance ? Number(measuredDistance.toFixed(1)) : undefined });
    }
  }

  const allowedTypes = parseJson(rule.allowed_location_types).map((type) => String(type).toUpperCase());
  if (allowedTypes.length) {
    const nearestTyped = nearestLocation(db, point, { types: allowedTypes });
    if (!nearestTyped || nearestTyped.distanceKm > 2) {
      if (mode === "FIXED_LOCATION" || context.product.product_type === "MULTI_DAY_PACKAGE") {
        return validationFailure(rule, normalizedSide, {
          required_location_types: allowedTypes,
          nearest_matching_distance_km: nearestTyped ? Number(nearestTyped.distanceKm.toFixed(1)) : null,
        });
      }
      // Hybrid trust model: a free-form hotel inside the correct geographic
      // boundary can proceed, but is explicitly flagged for operations review.
      needsOpsReview = true;
    }
  }

  return {
    valid: true,
    rule: { id: rule.id, side: normalizedSide, mode, allowedCity: rule.allowed_city, allowedState: rule.allowed_state },
    point: { ...point, address: String(userAddress || "").trim() },
    distanceKm: measuredDistance === null ? null : Number(measuredDistance.toFixed(2)),
    needsOpsReview,
  };
}

export function validateTransferRoute(db, productId, pickupLat, pickupLng, dropLat, dropLng, pickupAddress = "", dropAddress = "") {
  const pickup = validatePickupPoint(db, productId, "PICKUP", pickupLat, pickupLng, pickupAddress);
  if (!pickup.valid) return pickup;
  const drop = validatePickupPoint(db, productId, "DROP", dropLat, dropLng, dropAddress);
  if (!drop.valid) return drop;
  const context = getProductLocationContext(db, productId);
  if (context?.route && String(context.route.route_type).toUpperCase() === "CITY_TO_CITY") {
    const routeDistance = distanceKm({ lat: Number(context.route.origin_lat), lng: Number(context.route.origin_lng) }, { lat: Number(context.route.dest_lat), lng: Number(context.route.dest_lng) });
    if (routeDistance < 5) return { valid: false, error: "Origin and destination must be different cities.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Choose a route between two different cities." } };
    const originState = nearestLocation(db, { lat: Number(context.route.origin_lat), lng: Number(context.route.origin_lng) })?.row.state;
    const destState = nearestLocation(db, { lat: Number(context.route.dest_lat), lng: Number(context.route.dest_lng) })?.row.state;
    if (originState && destState && normalized(originState) !== normalized(destState) && !Number(context.route.interstate_permit_tax)) {
      return { valid: false, error: "This route is not enabled for interstate travel.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Choose an interstate-enabled transfer." } };
    }
  }
  return { valid: true, pickup, drop, needsOpsReview: Boolean(pickup.needsOpsReview || drop.needsOpsReview) };
}

function timeMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function validateFlight(route, input) {
  const routeType = String(route?.route_type || "").toUpperCase();
  if (!["AIRPORT_PICKUP", "AIRPORT_DROP"].includes(routeType)) return null;
  const flightNumber = String(input.flight_number || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2}[- ]?\d{1,4}$/.test(flightNumber)) {
    return { valid: false, error: "Enter a valid flight number, for example AI 103 or 6E-421.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Add the airline code followed by the flight number." } };
  }
  if (routeType === "AIRPORT_PICKUP" && !input.flight_arrival_time) {
    return { valid: false, error: "Flight arrival time is required for airport pickup.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Enter the scheduled landing time." } };
  }
  if (routeType === "AIRPORT_DROP" && !input.flight_departure_time) {
    return { valid: false, error: "Flight departure time is required for airport drop-off.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Enter the scheduled departure time." } };
  }
  return null;
}

function validateDayTour(context, input, now) {
  const meta = context.dayTour;
  if (!meta) return null;
  const slots = parseJson(meta.available_time_slots).map(timeMinutes).filter(Number.isFinite);
  const pickup = timeMinutes(input.pickup_time);
  if (slots.length && !slots.includes(pickup)) {
    return { valid: false, error: "Choose one of this tour's available departure slots.", code: "INVALID_BOOKING_PARAMS", detail: { available_time_slots: parseJson(meta.available_time_slots), suggestion: "Select an available time slot." } };
  }
  const start = timeMinutes(meta.operating_start_time || "06:00");
  const end = timeMinutes(meta.operating_end_time || "22:00");
  if (pickup !== null && ((start !== null && pickup < start) || (end !== null && pickup > end))) {
    return { valid: false, error: "The selected pickup time is outside this tour's operating hours.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: `Choose a time between ${meta.operating_start_time || "06:00"} and ${meta.operating_end_time || "22:00"}.` } };
  }
  if (input.activity_date && pickup !== null) {
    const departure = new Date(`${input.activity_date}T${String(Math.floor(pickup / 60)).padStart(2, "0")}:${String(pickup % 60).padStart(2, "0")}:00`);
    const hours = (departure.getTime() - now.getTime()) / 3_600_000;
    if (hours < Number(meta.advance_booking_cutoff_hours || 4)) {
      return { valid: false, error: `Bookings close ${Number(meta.advance_booking_cutoff_hours || 4)} hours before departure.`, code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Choose a later slot or another date." } };
    }
  }
  const vehicleRules = parseJson(meta.vehicle_rules);
  const pax = Number(input.adults ?? input.passengers ?? 1) + Number(input.children || 0);
  if (vehicleRules.length && !vehicleRules.some((rule) => pax <= Number(rule.pax_max ?? rule.maxPax ?? 0))) {
    return { valid: false, error: "The group exceeds this tour's supported vehicle capacity.", code: "INVALID_BOOKING_PARAMS", detail: { suggestion: "Reduce the group size or contact support for multiple vehicles." } };
  }
  return null;
}

function validatePackageHotels(db, context, input) {
  const expectedDays = parseJson(context.packageItinerary?.day_wise_details);
  const supplied = Array.isArray(input.package_hotels) ? input.package_hotels : [];
  const nights = Number(context.packageItinerary?.total_nights || Math.max(0, expectedDays.length - 1));
  if (nights > 0 && supplied.length < nights) {
    return { valid: false, error: "Confirm the hotel for every overnight stop in this package.", code: "INVALID_BOOKING_PARAMS", detail: { required_hotels: nights, suggestion: "Add each overnight hotel and confirm its map point." } };
  }
  for (const hotel of supplied) {
    const expected = expectedDays.find((day) => Number(day.day) === Number(hotel.day));
    const expectedCity = expected?.city || expected?.hotel_city || expected?.location || context.packageItinerary?.start_city;
    if (!expectedCity) continue;
    const point = coordinates(hotel.lat, hotel.lng);
    const nearest = point ? nearestLocation(db, point) : null;
    const suppliedCity = hotel.city || nearest?.row.city;
    if (!suppliedCity || (!normalized(suppliedCity).includes(normalized(expectedCity)) && !normalized(expectedCity).includes(normalized(suppliedCity)))) {
      return { valid: false, error: `The hotel for day ${hotel.day} must be in ${expectedCity}.`, code: "INVALID_BOOKING_PARAMS", detail: { day: Number(hotel.day), expected_city: expectedCity, suggestion: `Choose a hotel in ${expectedCity}.` } };
    }
  }
  return { valid: true, needsOpsReview: /(?:3|4|5)[ -]?star/i.test(String(input.variant_name || "")) };
}

export function validateBookingLocations(db, input, { requireOperationalDetails = true, deferLocationValidation = false, now = new Date() } = {}) {
  const productId = input.product_id || input.activity_id || input.productId;
  const context = getProductLocationContext(db, productId);
  if (!context) return { valid: false, error: "Product not found", code: "PRODUCT_NOT_FOUND", detail: { suggestion: "Choose an available product." } };
  const pickupLat = input.pickup_lat ?? input.pickupLat ?? input.originLat;
  const pickupLng = input.pickup_lng ?? input.pickupLng ?? input.originLng;
  const dropLat = input.drop_lat ?? input.dropLat ?? input.destLat;
  const dropLng = input.drop_lng ?? input.dropLng ?? input.destLng;
  const hasLocationInput = Boolean(coordinates(pickupLat, pickupLng) || coordinates(dropLat, dropLng)
    || String(input.pickup_location ?? input.pickupAddress ?? '').trim()
    || String(input.drop_location ?? input.dropAddress ?? '').trim());
  // Sightseeing returns to the pickup hotel unless the product explicitly
  // supplies a different drop point. Keep that invariant server-side.
  const effectiveDropLat = context.product.product_type === "DAY_TOUR" && !coordinates(dropLat, dropLng) ? pickupLat : dropLat;
  const effectiveDropLng = context.product.product_type === "DAY_TOUR" && !coordinates(dropLat, dropLng) ? pickupLng : dropLng;
  // Quote/detail requests intentionally arrive before the guest chooses a
  // pickup point. Defer scoped route validation until the booking payload has
  // an actual location; holds and final booking creation still require it.
  const routeResult = deferLocationValidation && !requireOperationalDetails && !hasLocationInput
    ? { valid: true, pickup: null, drop: null, needsOpsReview: false }
    : validateTransferRoute(db, productId, pickupLat, pickupLng, effectiveDropLat, effectiveDropLng, input.pickup_location ?? input.pickupAddress, input.drop_location ?? input.dropAddress ?? input.pickup_location);
  if (!routeResult.valid) return routeResult;
  if (requireOperationalDetails && context.product.product_type === "TRANSFER") {
    const flightError = validateFlight(context.route, input);
    if (flightError) return flightError;
  }
  if (context.product.product_type === "DAY_TOUR") {
    const dayTourError = validateDayTour(context, input, now);
    if (dayTourError) return dayTourError;
  }
  if (context.product.product_type === "MULTI_DAY_PACKAGE") {
    const hotelResult = deferLocationValidation && !requireOperationalDetails && !hasLocationInput
      ? { valid: true, needsOpsReview: false }
      : validatePackageHotels(db, context, input);
    if (!hotelResult.valid) return hotelResult;
    routeResult.needsOpsReview = Boolean(routeResult.needsOpsReview || hotelResult.needsOpsReview);
  }
  return { valid: true, pickup: routeResult.pickup, drop: routeResult.drop, needsOpsReview: Boolean(routeResult.needsOpsReview), productType: context.product.product_type };
}

export function getPickupSuggestions(db, productId, side, searchQuery = "") {
  const context = getProductLocationContext(db, productId);
  if (!context) return [];
  const normalizedSide = String(side || "PICKUP").toUpperCase();
  const rule = context.rules.find((entry) => String(entry.rule_side).toUpperCase() === normalizedSide);
  if (!rule) return [];
  const query = normalized(searchQuery);
  const allowedTypes = parseJson(rule.allowed_location_types).map((type) => String(type).toUpperCase());
  let rows;
  try {
    rows = db.prepare("SELECT * FROM canonical_locations WHERE COALESCE(is_active, 1) = 1").all();
  } catch {
    // Before migration 014 is applied, expose the route's own anchor as a
    // safe, product-scoped suggestion rather than failing the endpoint.
    if (context.route) {
      const prefix = normalizedSide === "PICKUP" ? "origin" : "dest";
      const routeType = String(context.route.route_type || "").toUpperCase();
      return [{
        id: `route_${productId}_${normalizedSide.toLowerCase()}`,
        name: context.route[`${prefix}_name`] || context.product.city,
        shortName: context.route[`${prefix}_name`] || context.product.city,
        iataCode: context.route[`${prefix}_iata`] || null,
        type: routeType.includes("AIRPORT") ? "AIRPORT" : "PICKUP_ZONE",
        city: context.product.city,
        state: context.product.state,
        lat: Number(context.route[`${prefix}_lat`]),
        lng: Number(context.route[`${prefix}_lng`]),
        radiusKm: Number(context.route[`${prefix}_radius_km`] || 25),
        displayHint: `${context.product.city}, ${context.product.state} · product anchor`,
      }];
    }
    return [];
  }
  if (allowedTypes.length) rows = rows.filter((row) => allowedTypes.includes(String(row.location_type).toUpperCase()));
  if (rule.allowed_state) rows = rows.filter((row) => normalized(row.state) === normalized(rule.allowed_state));
  if (query) rows = rows.filter((row) => normalized(`${row.name} ${row.short_name || ""} ${row.iata_code || ""} ${row.city} ${row.state}`).includes(query));
  const center = coordinates(rule.center_lat ?? rule.fixed_lat, rule.center_lng ?? rule.fixed_lng);
  if (center && Number(rule.radius_km || rule.fixed_radius_km)) {
    rows = rows.filter((row) => distanceKm(center, row) <= Number(rule.radius_km || rule.fixed_radius_km));
  }
  return rows.slice(0, 12).map((row) => ({
    ...publicLocation(row),
    displayHint: `${row.city}, ${row.state} · ${String(row.location_type).replaceAll("_", " ")}`,
  }));
}

export class LocationValidationError extends Error {
  constructor(result) {
    super(result.error);
    this.name = "LocationValidationError";
    this.status = 400;
    this.code = result.code;
    this.detail = result.detail;
  }
}

export function assertBookingLocations(db, input, options) {
  const result = validateBookingLocations(db, input, options);
  if (!result.valid) throw new LocationValidationError(result);
  return result;
}
