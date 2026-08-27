import { nanoid } from "nanoid";
import { calculateBookingQuote, publicQuote } from "./bookingService.js";

const QUOTE_VALIDITY_MS = 15 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function circuitError(message, status = 400, code = "CIRCUIT_QUOTE_ERROR") {
  return Object.assign(new Error(message), { status, code });
}

function addDays(dateValue, offset) {
  if (!DATE_PATTERN.test(String(dateValue || ""))) return null;
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function itemPickupTime(item) {
  const explicit = String(item.pickupTime || item.startTime || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(explicit)) return explicit;
  const slot = String(item.timeSlot || "").toUpperCase();
  if (slot.includes("AFTERNOON")) return "14:00";
  if (slot.includes("EVENING")) return "18:00";
  return "09:00";
}

function recommendedVehicle(passengers) {
  if (passengers <= 4) return "SEDAN";
  if (passengers <= 6) return "SUV";
  return "GROUP_TEMPO";
}

function parseCancellationPolicy(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return String(value);
  }
}

function normalizeStoredQuote(row) {
  const parse = (value) => {
    if (Array.isArray(value)) return value;
    try { return JSON.parse(value || "[]"); } catch { return []; }
  };
  return {
    quoteId: row.id,
    itineraryId: row.itinerary_id,
    status: row.status,
    currency: row.currency,
    adultsCount: Number(row.adults_count),
    childrenCount: Number(row.children_count),
    startDate: row.start_date,
    endDate: row.end_date,
    breakdown: {
      baseAmount: Number(row.base_amount),
      taxesAmount: Number(row.taxes_amount),
      totalAmount: Number(row.total_amount),
    },
    lineItems: parse(row.line_items),
    issues: parse(row.issues),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function createCircuitQuote(database, itinerary, userId, input = {}) {
  if (!itinerary || itinerary.userId !== userId) {
    throw circuitError("Itinerary not found", 404, "ITINERARY_NOT_FOUND");
  }

  const items = Array.isArray(itinerary.items) ? itinerary.items : [];
  if (!items.length) throw circuitError("Add at least one activity before requesting a circuit quote", 400, "EMPTY_ITINERARY");

  const startDate = String(input.startDate || itinerary.travelDate || itinerary.startDate || "");
  if (!DATE_PATTERN.test(startDate)) throw circuitError("Choose a valid circuit start date", 400, "INVALID_START_DATE");
  if (startDate < new Date().toISOString().slice(0, 10)) {
    throw circuitError("Circuit start date cannot be in the past", 400, "PAST_START_DATE");
  }

  const adultsCount = Math.max(1, Math.min(30, Number(input.adultsCount ?? itinerary.adultsCount ?? itinerary.adults ?? 2) || 2));
  const childrenCount = Math.max(0, Math.min(30, Number(input.childrenCount ?? itinerary.childrenCount ?? itinerary.children ?? 0) || 0));
  const luggage = Math.max(0, Math.min(60, Number(input.luggage ?? 0) || 0));
  const passengers = adultsCount + childrenCount;
  const lineItems = [];
  const issues = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const dayNumber = Math.max(1, Math.min(Number(itinerary.daysCount || 30), Number(item.dayNumber) || 1));
    const activityDate = addDays(startDate, dayNumber - 1);
    const productId = String(item.productId || item.product?.id || "").trim();
    const itemIdentity = String(item.id || `item_${index + 1}`);

    if (!productId) {
      issues.push({
        itemId: itemIdentity,
        dayNumber,
        title: String(item.title || "Custom itinerary item"),
        code: "PRODUCT_LINK_REQUIRED",
        message: "Link this custom item to a published marketplace product before checkout.",
      });
      continue;
    }

    try {
      const quote = calculateBookingQuote(database, {
        product_id: productId,
        activity_date: activityDate,
        adults: adultsCount,
        children: childrenCount,
        luggage_bags: luggage,
        pickup_time: itemPickupTime(item),
        vehicle_category: item.vehicleCategory || item.vehicle_category || recommendedVehicle(passengers),
        variant_name: item.variantName || item.variant_name,
        pickup_lat: item.pickupLat || item.pickup_lat,
        pickup_lng: item.pickupLng || item.pickup_lng,
        drop_lat: item.dropLat || item.drop_lat,
        drop_lng: item.dropLng || item.drop_lng,
        origin_state: item.originState || item.origin_state,
        dest_state: item.destState || item.dest_state,
      });
      const safeQuote = publicQuote(quote);
      lineItems.push({
        itemId: itemIdentity,
        productId: safeQuote.productId,
        productTitle: safeQuote.productTitle,
        productType: safeQuote.productType,
        supplierId: safeQuote.supplierId,
        supplierName: quote.product.supplier_name || null,
        dayNumber,
        activityDate,
        pickupTime: itemPickupTime(item),
        timeSlot: item.timeSlot || null,
        location: item.location || quote.product.city || null,
        vehicleCategory: safeQuote.vehicleCategory,
        variantName: safeQuote.variantName,
        pricingModel: safeQuote.pricingModel,
        adults: safeQuote.adults,
        children: safeQuote.children,
        luggage: safeQuote.luggage,
        cancellationPolicy: parseCancellationPolicy(quote.product.cancellation_policy),
        breakdown: safeQuote.breakdown,
      });
    } catch (error) {
      issues.push({
        itemId: itemIdentity,
        productId,
        dayNumber,
        title: String(item.title || productId),
        code: error.code || (error.status === 404 ? "PRODUCT_UNAVAILABLE" : "ITEM_UNAVAILABLE"),
        message: error.message || "This item cannot be quoted right now.",
      });
    }
  }

  const baseAmount = lineItems.reduce((sum, item) => sum + Number(item.breakdown.baseAmount || 0), 0);
  const taxesAmount = lineItems.reduce(
    (sum, item) => sum + Number(item.breakdown.fastagTolls || 0) + Number(item.breakdown.stateTax || 0) + Number(item.breakdown.gstAmount || 0),
    0,
  );
  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.breakdown.totalAmount || 0), 0);
  const status = issues.length === 0 ? "READY" : lineItems.length > 0 ? "PARTIAL" : "ACTION_REQUIRED";
  const quoteId = `cq_${nanoid(16)}`;
  const endDate = addDays(startDate, Math.max(0, Number(itinerary.daysCount || 1) - 1));
  const expiresAt = new Date(Date.now() + QUOTE_VALIDITY_MS).toISOString();

  database.prepare(`
    INSERT INTO circuit_quotes (
      id, itinerary_id, user_id, status, currency, adults_count, children_count,
      start_date, end_date, base_amount, taxes_amount, total_amount, line_items, issues, expires_at
    ) VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quoteId,
    itinerary.id,
    userId,
    status,
    adultsCount,
    childrenCount,
    startDate,
    endDate,
    baseAmount,
    taxesAmount,
    totalAmount,
    JSON.stringify(lineItems),
    JSON.stringify(issues),
    expiresAt,
  );

  return normalizeStoredQuote(database.prepare("SELECT * FROM circuit_quotes WHERE id = ?").get(quoteId));
}

export function getCircuitQuote(database, quoteId, userId) {
  const row = database.prepare("SELECT * FROM circuit_quotes WHERE id = ? AND user_id = ?").get(quoteId, userId);
  if (!row) throw circuitError("Circuit quote not found", 404, "CIRCUIT_QUOTE_NOT_FOUND");
  const quote = normalizeStoredQuote(row);
  return { ...quote, expired: new Date(quote.expiresAt).getTime() <= Date.now() };
}
