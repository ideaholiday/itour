export const TRANSFER_ROUTE_TYPES = new Set([
  "AIRPORT_TRANSFER",
  "RAILWAY_TRANSFER",
  "INTERCITY_TRANSFER",
  "HOTEL_TRANSFER",
]);

export const TRANSFER_VEHICLES = {
  HATCHBACK: { maxPax: 3, maxBags: 2 },
  SEDAN: { maxPax: 4, maxBags: 3 },
  SUV: { maxPax: 6, maxBags: 4 },
  PREMIUM_MUV: { maxPax: 6, maxBags: 5 },
  LUXURY: { maxPax: 3, maxBags: 3 },
  GROUP_TEMPO: { maxPax: 26, maxBags: 20 },
};

function coordinate(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function validateTransferMeta(input) {
  if (!input || typeof input !== "object") return { error: "Transfer route details are required" };

  const routeAliases = {
    AIRPORT_PICKUP: "AIRPORT_TRANSFER",
    AIRPORT_DROP: "AIRPORT_TRANSFER",
    CITY_TO_CITY: "INTERCITY_TRANSFER",
    POINT_TO_POINT: "HOTEL_TRANSFER",
  };
  const suppliedRouteType = String(input.routeType || "").toUpperCase();
  const routeType = routeAliases[suppliedRouteType] || suppliedRouteType;
  if (!TRANSFER_ROUTE_TYPES.has(routeType)) return { error: "Choose a valid transfer type" };

  const originName = String(input.originName || "").trim();
  const destName = String(input.destName || "").trim();
  if (originName.length < 3 || destName.length < 3) return { error: "Confirm both pickup and drop-off locations" };

  const originLat = coordinate(input.originLat, -90, 90);
  const originLng = coordinate(input.originLng, -180, 180);
  const destLat = coordinate(input.destLat, -90, 90);
  const destLng = coordinate(input.destLng, -180, 180);
  if ([originLat, originLng, destLat, destLng].some((value) => value === null)) {
    return { error: "Pickup and drop-off must have valid map coordinates" };
  }
  if (Math.abs(originLat - destLat) < 0.0001 && Math.abs(originLng - destLng) < 0.0001) {
    return { error: "Pickup and drop-off must be different locations" };
  }

  const vehicleCategory = String(input.vehicleCategory || "").toUpperCase();
  const vehicle = TRANSFER_VEHICLES[vehicleCategory];
  if (!vehicle) return { error: "Choose at least one supported vehicle" };

  const distanceKm = Number(input.distanceKm);
  const durationMins = Number(input.durationMins);
  const freeWaitingMins = Number(input.freeWaitingMins);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 5000) return { error: "Route distance must be between 0 and 5,000 km" };
  if (!Number.isFinite(durationMins) || durationMins < 1 || durationMins > 2880) return { error: "Journey duration must be between 1 minute and 48 hours" };
  if (!Number.isFinite(freeWaitingMins) || freeWaitingMins < 0 || freeWaitingMins > 240) return { error: "Free waiting time must be between 0 and 240 minutes" };

  const serviceDirection = String(input.serviceDirection || "ARRIVAL").toUpperCase();
  if (!new Set(["ARRIVAL", "DEPARTURE"]).has(serviceDirection)) {
    return { error: "Publish arrival and departure transfers as separate listings so each fixed terminal is unambiguous" };
  }
  const operationalRouteType = routeType === "AIRPORT_TRANSFER"
    ? serviceDirection === "DEPARTURE" ? "AIRPORT_DROP" : "AIRPORT_PICKUP"
    : routeType === "RAILWAY_TRANSFER"
      ? serviceDirection === "DEPARTURE" ? "RAILWAY_DROP" : "RAILWAY_PICKUP"
      : routeType === "INTERCITY_TRANSFER" ? "CITY_TO_CITY" : "POINT_TO_POINT";

  return {
    value: {
      routeType: operationalRouteType,
      originName,
      originLat,
      originLng,
      destName,
      destLat,
      destLng,
      distanceKm,
      durationMins,
      vehicleCategory,
      maxPax: vehicle.maxPax,
      maxBags: vehicle.maxBags,
      freeWaitingMins,
      tollIncluded: input.tollIncluded === false ? 0 : 1,
      stateTaxIncluded: input.stateTaxIncluded === false ? 0 : 1,
      serviceDirection,
      hubType: String(input.hubType || (routeType === "AIRPORT_TRANSFER" ? "AIRPORT" : routeType === "RAILWAY_TRANSFER" ? "RAILWAY" : "CITY")).toUpperCase(),
      zoneName: input.zoneName ? String(input.zoneName).trim() : destName,
      isFlexibleDropoff: input.isFlexibleDropoff !== false,
      originRadiusKm: Number(input.originRadiusKm || input.radiusKm || 25),
      destRadiusKm: Number(input.destRadiusKm || input.radiusKm || 25),
      originIata: input.originIata ? String(input.originIata).trim().toUpperCase() : null,
      destIata: input.destIata ? String(input.destIata).trim().toUpperCase() : null,
      constraintMode: String(input.constraintMode || "RADIUS_FROM_CENTER").toUpperCase(),
      allowedLocationTypes: Array.isArray(input.allowedLocationTypes) ? input.allowedLocationTypes.map((value) => String(value).toUpperCase()) : [],
      errorMessage: input.errorMessage ? String(input.errorMessage).trim() : null,
      interstatePermitTax: input.interstatePermitTax === true ? 1 : 0,
      nightAllowanceInr: Math.max(0, Number(input.nightAllowanceInr || 300)),
    },
  };
}
