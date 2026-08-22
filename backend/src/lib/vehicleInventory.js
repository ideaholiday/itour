export const VEHICLE_MODEL_TERMS = {
  HATCHBACK: ["HATCHBACK", "WAGON", "TIAGO", "ALTO"],
  SEDAN: ["SEDAN", "DZIRE", "ETIOS", "AURA", "XCENT"],
  SUV: ["SUV", "ERTIGA", "MARAZZO", "XYLO"],
  PREMIUM_MUV: ["PREMIUM", "INNOVA", "CRYSTA", "HYCROSS"],
  LUXURY: ["LUXURY", "MERCEDES", "BMW", "AUDI"],
  GROUP_TEMPO: ["TEMPO", "TRAVELLER", "BUS"],
};

const normalize = (value) => String(value || "").trim().toUpperCase();

export function vehicleModelSupportsCategory(model, category) {
  const normalizedCategory = normalize(category);
  if (!normalizedCategory || normalizedCategory === "SHARED_SEAT") return true;
  const terms = VEHICLE_MODEL_TERMS[normalizedCategory] || [normalizedCategory];
  return terms.some((term) => normalize(model).includes(term));
}

export function fleetSupportsVehicle(drivers = [], category) {
  if (!drivers.length) return { managed: false, capacity: null, vehicles: [] };
  const vehicles = drivers.filter((driver) => !["INACTIVE", "SUSPENDED", "UNAVAILABLE", "MAINTENANCE"].includes(normalize(driver.status)))
    .filter((driver) => vehicleModelSupportsCategory(driver.vehicle_model, category));
  return { managed: true, capacity: vehicles.length, vehicles };
}
