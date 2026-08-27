import logger from "../config/logger.js";

/**
 * TRANSFER ENGINE & PRICING MATRIX
 * Specialized engine for Transfers, Sightseeing, and Multi-Day Package quote calculations.
 */

// Standard Vehicle Taxonomies for the Indian Market
export const VEHICLE_TAXONOMY = {
  HATCHBACK: {
    code: "HATCHBACK",
    name: "Hatchback",
    models: "WagonR, Tata Tiago",
    maxPax: 3,
    maxBags: 2,
    baseRatePerKm: 12.0,
    baseFareMin: 600,
    freeMins: 45
  },
  SEDAN: {
    code: "SEDAN",
    name: "Sedan (Dzire / Etios)",
    models: "Swift Dzire, Toyota Etios",
    maxPax: 4,
    maxBags: 3,
    baseRatePerKm: 14.0,
    baseFareMin: 800,
    freeMins: 60
  },
  SUV: {
    code: "SUV",
    name: "SUV / MUV (Ertiga)",
    models: "Maruti Ertiga, Mahindra Marazzo",
    maxPax: 6,
    maxBags: 4,
    baseRatePerKm: 18.0,
    baseFareMin: 1200,
    freeMins: 60
  },
  PREMIUM_MUV: {
    code: "PREMIUM_MUV",
    name: "Premium MUV (Innova Crysta)",
    models: "Toyota Innova Crysta, Hycross",
    maxPax: 6,
    maxBags: 5,
    baseRatePerKm: 24.0,
    baseFareMin: 1800,
    freeMins: 60
  },
  LUXURY: {
    code: "LUXURY",
    name: "Luxury Class",
    models: "Mercedes E-Class, BMW 5 Series, Audi A6",
    maxPax: 3,
    maxBags: 3,
    baseRatePerKm: 65.0,
    baseFareMin: 4500,
    freeMins: 90
  },
  GROUP_TEMPO: {
    code: "GROUP_TEMPO",
    name: "Tempo Traveller (12-26 Seater)",
    models: "Force Tempo Traveller 12/17/26 Seater",
    maxPax: 26,
    maxBags: 20,
    baseRatePerKm: 32.0,
    baseFareMin: 3500,
    freeMins: 60
  }
};

/**
 * Calculate distance between two lat/lng coordinates in KM using Haversine formula
 */
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(Number(value)))) return 30.0;
  return Math.round(calculateAirDistanceKm(lat1, lon1, lat2, lon2) * 1.25 * 10) / 10;
}

export function calculateAirDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Detect state border crossing and estimate interstate passenger entry tax
 */
export function estimateStateBorderTax(originState, destState, vehicleCategory) {
  if (!originState || !destState || originState.toLowerCase() === destState.toLowerCase()) {
    return 0; // Intra-state trip, no state border passenger permit tax
  }

  // Estimated state permit taxes for commercial passenger tourist cabs in India
  const taxMatrix = {
    HATCHBACK: 150,
    SEDAN: 200,
    SUV: 350,
    PREMIUM_MUV: 450,
    LUXURY: 600,
    GROUP_TEMPO: 1200
  };

  return taxMatrix[vehicleCategory] || 250;
}

/**
 * Estimate Fastag highway tolls based on distance & route type
 */
export function estimateFastagTolls(distanceKm, isOutstation = false) {
  if (distanceKm < 20) return 0; // City transfer usually no toll or minimal
  if (distanceKm < 60) return 110;
  if (distanceKm < 150) return 260;
  if (distanceKm < 300) return 550;
  return Math.round(distanceKm * 2.2); // ~₹2.2 per KM toll average on Indian expressways
}

/**
 * Test if a point (lat, lng) is inside a polygon using Ray-Casting Algorithm.
 */
export function isPointInPolygon(lat, lng, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length < 3) {
    return false;
  }
  let poly = polygonCoordinates;
  if (Array.isArray(poly[0]) && Array.isArray(poly[0][0])) {
    poly = poly[0];
  }

  let inside = false;
  const x = Number(lng);
  const y = Number(lat);

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ptI = poly[i];
    const ptJ = poly[j];

    let xi, yi, xj, yj;
    if (Array.isArray(ptI)) {
      yi = Number(ptI[0]);
      xi = Number(ptI[1]);
    } else {
      yi = Number(ptI.lat);
      xi = Number(ptI.lng);
    }

    if (Array.isArray(ptJ)) {
      yj = Number(ptJ[0]);
      xj = Number(ptJ[1]);
    } else {
      yj = Number(ptJ.lat);
      xj = Number(ptJ.lng);
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a geo coordinate is within a supplier's operational geo-fence radius
 */
export function isCoordinateInGeoFence(pickupLat, pickupLng, fenceLat, fenceLng, radiusKm = 30) {
  const dist = calculateAirDistanceKm(pickupLat, pickupLng, fenceLat, fenceLng);
  return dist <= radiusKm;
}

/**
 * Match pickup and drop coordinates against supplier operational geo-fences / polygons
 */
export function matchSupplierGeoFences(db, pickupLat, pickupLng, dropLat, dropLng) {
  try {
    const fences = db
      .prepare(
        `SELECT g.*, s.company_name, s.rating as supplier_rating, s.commission_rate
         FROM geo_fences g
         JOIN suppliers s ON g.supplier_id = s.id
         WHERE COALESCE(g.is_active, 1) = 1 AND COALESCE(g.approval_status, 'APPROVED') = 'APPROVED'`
      )
      .all();

    const matches = [];

    for (const fence of fences) {
      let polyCoords = [];
      try {
        polyCoords = typeof fence.polygon_coordinates === "string"
          ? JSON.parse(fence.polygon_coordinates || "[]")
          : fence.polygon_coordinates || [];
      } catch (e) {
        polyCoords = [];
      }

      let isPickupMatched = false;
      let matchMethod = "RADIUS_GEOFENCE";

      const hasPolygon = Array.isArray(polyCoords) && polyCoords.length >= 3;
      if (hasPolygon) {
        isPickupMatched = isPointInPolygon(pickupLat, pickupLng, polyCoords);
        matchMethod = "POLYGON_BOUNDARY";
      } else {
        isPickupMatched = isCoordinateInGeoFence(pickupLat, pickupLng, fence.center_lat, fence.center_lng, fence.radius_km);
      }

      if (isPickupMatched) {
        matches.push({
          fenceId: fence.id,
          supplierId: fence.supplier_id,
          supplierName: fence.company_name,
          supplierRating: fence.supplier_rating,
          commissionRate: fence.commission_rate || 18.0,
          zoneName: fence.zone_name,
          city: fence.city,
          centerLat: fence.center_lat,
          centerLng: fence.center_lng,
          radiusKm: fence.radius_km,
          matchMethod,
          hasPolygon,
          pickupCovered: true,
          dropCovered: hasPolygon
            ? isPointInPolygon(dropLat, dropLng, polyCoords)
            : isCoordinateInGeoFence(dropLat, dropLng, fence.center_lat, fence.center_lng, fence.radius_km),
          polygonPointsCount: polyCoords.length
        });
      }
    }

    return matches;
  } catch (err) {
    logger.error("Geo-fence matching failed", { error: err });
    return [];
  }
}

/**
 * Filter vehicles based on passenger & luggage count payload validation
 */
export function getEligibleVehicleCategories(passengersCount, luggageCount) {
  const eligible = [];
  for (const [code, spec] of Object.entries(VEHICLE_TAXONOMY)) {
    if (passengersCount <= spec.maxPax && luggageCount <= spec.maxBags) {
      eligible.push(spec);
    }
  }
  return eligible;
}

/**
 * Compute full dynamic transfer quote with itemized breakdown
 */
export function computeTransferQuote({
  originLat,
  originLng,
  destLat,
  destLng,
  originState = "Uttar Pradesh",
  destState = "Uttar Pradesh",
  passengers = 2,
  luggage = 2,
  vehicleCategory = "SEDAN",
  customBasePrice = null,
  commissionRatePercent = 18.0
}) {
  const distanceKm = calculateHaversineDistanceKm(originLat, originLng, destLat, destLng);
  const estMins = Math.max(25, Math.round(distanceKm * 2.0));

  const spec = VEHICLE_TAXONOMY[vehicleCategory] || VEHICLE_TAXONOMY.SEDAN;

  // Base pricing calculation
  let rawBaseFare = customBasePrice;
  if (!rawBaseFare) {
    const kmCost = distanceKm * spec.baseRatePerKm;
    rawBaseFare = Math.max(spec.baseFareMin, Math.round(kmCost));
  }

  // Fastag & state tax calculation
  const fastagToll = estimateFastagTolls(distanceKm);
  const stateBorderTax = estimateStateBorderTax(originState, destState, vehicleCategory);

  const netSubtotal = rawBaseFare + fastagToll + stateBorderTax;
  const gstTaxAmount = Math.round(netSubtotal * 0.05); // 5% GST on cab transport
  const totalTravelerPayable = netSubtotal + gstTaxAmount;

  // Commission & Supplier Payout
  const platformCommission = Math.round((totalTravelerPayable * commissionRatePercent) / 100);
  const supplierPayout = totalTravelerPayable - platformCommission;

  return {
    vehicleCategory: spec.code,
    vehicleDisplayName: spec.name,
    exampleModels: spec.models,
    maxPassengers: spec.maxPax,
    maxLuggage: spec.maxBags,
    distanceKm,
    estimatedDurationMins: estMins,
    freeWaitingMins: spec.freeMins,
    costBreakdown: {
      baseFare: rawBaseFare,
      fastagTolls: fastagToll,
      stateBorderTax: stateBorderTax,
      gstTax: gstTaxAmount,
      totalAmount: totalTravelerPayable
    },
    inclusions: [
      "Fuel & Chauffeur Allowance Included",
      `Up to ${spec.freeMins} mins Free Waiting Time`,
      fastagToll > 0 ? "Fastag Toll Charges Included" : "No Tolls En Route",
      stateBorderTax > 0 ? "Interstate Border Passenger Tax Included" : "Intra-city Tax Exempt",
      "Air-Conditioned Clean Cab"
    ],
    commission: {
      ratePercent: commissionRatePercent,
      platformFee: platformCommission,
      supplierPayout: supplierPayout
    }
  };
}
