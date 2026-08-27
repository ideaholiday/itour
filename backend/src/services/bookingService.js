import crypto from "crypto";
import { computeTransferQuote, VEHICLE_TAXONOMY } from "../engine/transferEngine.js";
import { evaluateSupplierAvailability } from "./availabilityService.js";
import { resolveCommissionRate } from "./financeService.js";

const OTP_DIGITS = 6;
export const MAX_OTP_ATTEMPTS = 5;

const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.max(0, Math.round(Number(value) || 0));

const optionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function hasValidIndiaRoute([pickupLat, pickupLng, dropLat, dropLng]) {
  return [pickupLat, dropLat].every((value) => Number.isFinite(value) && value >= 6 && value <= 38)
    && [pickupLng, dropLng].every((value) => Number.isFinite(value) && value >= 68 && value <= 98);
}

function otpSecret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || "idea-holiday-local-otp-secret-change-me";
}

function encryptionKey() {
  return crypto.createHash("sha256").update(otpSecret()).digest();
}

export function generatePickupOtp() {
  return crypto.randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, "0");
}

export function hashPickupOtp(bookingId, otp) {
  return crypto.createHmac("sha256", otpSecret()).update(`${bookingId}:${otp}`).digest("hex");
}

export function encryptPickupOtp(otp) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(otp), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptPickupOtp(payload) {
  if (!payload) return null;
  try {
    const [ivValue, tagValue, encryptedValue] = String(payload).split(".");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function pickupOtpMatches(bookingId, submittedOtp, expectedHash) {
  if (!/^\d{6}$/.test(String(submittedOtp || "")) || !expectedHash) return false;
  const actual = Buffer.from(hashPickupOtp(bookingId, String(submittedOtp)));
  const expected = Buffer.from(String(expectedHash));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function parsePickupDateTime(dateValue, timeValue = "09:00") {
  const date = String(dateValue || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = String(timeValue || "09:00").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return new Date(`${date}T09:00:00`);
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
}

export function getPickupOtpExpiry(activityDate, pickupTime) {
  const pickupAt = parsePickupDateTime(activityDate, pickupTime);
  const minimumExpiry = Date.now() + 24 * 60 * 60 * 1000;
  const tripExpiry = pickupAt ? pickupAt.getTime() + 24 * 60 * 60 * 1000 : minimumExpiry;
  return new Date(Math.max(minimumExpiry, tripExpiry)).toISOString();
}

export function activatePickupOtp(booking) {
  const otp = generatePickupOtp();
  return {
    otp,
    otpHash: hashPickupOtp(booking.id, otp),
    otpEncrypted: encryptPickupOtp(otp),
    otpExpiresAt: getPickupOtpExpiry(booking.activity_date, booking.pickup_time)
  };
}

function requireBookingDate(value) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error("Choose a valid travel date");
    error.status = 400;
    throw error;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    const error = new Error("Travel date cannot be in the past");
    error.status = 400;
    throw error;
  }
  return date;
}

function findPricingVariant(db, productId, variantName, vehicleCategory) {
  const variants = db.prepare("SELECT * FROM product_pricing WHERE product_id = ? ORDER BY rowid ASC").all(productId);
  if (!variants.length) return null;
  const exact = variants.find((item) => item.variant_name.toLowerCase() === String(variantName || "").trim().toLowerCase());
  if (exact) return exact;

  const keywords = {
    HATCHBACK: ["hatchback", "wagon", "tiago"],
    SEDAN: ["sedan", "dzire", "etios"],
    SUV: ["suv", "ertiga", "marazzo"],
    PREMIUM_MUV: ["innova", "crysta", "hycross", "premium muv"],
    LUXURY: ["luxury", "mercedes", "bmw", "audi"],
    GROUP_TEMPO: ["tempo", "traveller", "bus"]
  };
  const terms = keywords[String(vehicleCategory || "").toUpperCase()] || [];
  return variants.find((item) => terms.some((term) => item.variant_name.toLowerCase().includes(term))) || variants[0];
}

function validateCapacity(vehicleCategory, passengers, luggage) {
  if (vehicleCategory === "SHARED_SEAT") return;
  const spec = VEHICLE_TAXONOMY[vehicleCategory];
  if (!spec) {
    const error = new Error("Choose a supported vehicle category");
    error.status = 400;
    throw error;
  }
  if (passengers > spec.maxPax || luggage > spec.maxBags) {
    const error = new Error(`${spec.name} allows up to ${spec.maxPax} passengers and ${spec.maxBags} bags`);
    error.status = 409;
    throw error;
  }
}

export function calculateBookingQuote(db, input, { enforceListingSupplierAvailability = true } = {}) {
  const productId = input.product_id || input.activity_id;
  const product = db.prepare(
    `SELECT p.*, s.kyb_status, s.commission_rate, s.supplier_code, s.company_name AS supplier_name
     FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.id = ?`
  ).get(productId);
  if (!product || product.status !== "PUBLISHED" || Number(product.is_published ?? 1) !== 1) {
    const error = new Error("This product is not available for booking");
    error.status = 404;
    throw error;
  }
  if (product.kyb_status && product.kyb_status !== "APPROVED") {
    const error = new Error("This operator is not accepting bookings right now");
    error.status = 409;
    throw error;
  }

  const activityDate = requireBookingDate(input.activity_date);
  const adults = toInteger(input.adults ?? input.passengers, 1);
  const children = toInteger(input.children, 0);
  const luggage = toInteger(input.luggage_bags ?? input.luggage, 0);
  const passengers = adults + children;
  if (adults < 1 || children < 0 || passengers > 26 || luggage < 0) {
    const error = new Error("Enter a valid traveler and luggage count");
    error.status = 400;
    throw error;
  }

  const vehicleCategory = String(input.vehicle_category || input.selectedVehicle || (product.group_type === "SHARED" ? "SHARED_SEAT" : "SEDAN")).toUpperCase();
  if (enforceListingSupplierAvailability) {
    const availability = evaluateSupplierAvailability(db, {
      supplierId: product.supplier_id,
      productId: product.id,
      activityDate,
      pickupTime: input.pickup_time || "09:00",
      vehicleCategory,
    });
    if (!availability.available) {
      const error = new Error(availability.reasons[0] || "The selected date or time is unavailable. Please choose another option");
      error.status = 409;
      throw error;
    }
  }
  // Vehicle capacity is a transport constraint, not a package-room or ticket constraint.
  const isNonVehicleProduct = ["PACKAGE", "MULTI_DAY_PACKAGE"].includes(product.product_type) ||
    ["TICKET_ONLY", "SIC", "TICKET_SIC"].includes(product.product_sub_type);
  if (!isNonVehicleProduct) validateCapacity(vehicleCategory, passengers, luggage);
  const commissionRate = resolveCommissionRate(db, product.supplier_id, product.product_type);
  let baseAmount;
  let tolls = 0;
  let stateTax = 0;
  let gstAmount = 0;
  let totalAmount;
  let nightAllowance = 0;
  let pricingModel = "FIXED";
  let variantName = String(input.variant_name || "Standard Booking");

  const coordinates = [input.pickup_lat, input.pickup_lng, input.drop_lat, input.drop_lng].map(optionalNumber);
  if (product.product_type === "TRANSFER" && hasValidIndiaRoute(coordinates)) {
    const transferQuote = computeTransferQuote({
      originLat: coordinates[0],
      originLng: coordinates[1],
      destLat: coordinates[2],
      destLng: coordinates[3],
      originState: input.origin_state || product.state,
      destState: input.dest_state || product.state,
      passengers,
      luggage,
      vehicleCategory,
      commissionRatePercent: commissionRate
    });
    const route = db.prepare("SELECT route_type, night_allowance_inr FROM transfer_routes WHERE product_id = ? LIMIT 1").get(product.id);
    const flightTime = String(route?.route_type || "").toUpperCase() === "AIRPORT_DROP"
      ? input.flight_departure_time : input.flight_arrival_time;
    const flightHour = Number(String(flightTime || "").match(/^(\d{1,2})/)?.[1]);
    if (Number.isFinite(flightHour) && (flightHour >= 22 || flightHour < 6)) {
      nightAllowance = roundMoney(route?.night_allowance_inr || 0);
    }
    baseAmount = transferQuote.costBreakdown.baseFare + nightAllowance;
    tolls = transferQuote.costBreakdown.fastagTolls;
    stateTax = transferQuote.costBreakdown.stateBorderTax;
    gstAmount = roundMoney((baseAmount + tolls + stateTax) * 0.05);
    totalAmount = baseAmount + tolls + stateTax + gstAmount;
    variantName = transferQuote.vehicleDisplayName;
  } else {
    // Check for Plan 14 supporting tables first
    let matchingVehicleOption = null;
    let matchingHotelTier = null;
    let ticketTiers = [];

    try {
      if (vehicleCategory) {
        matchingVehicleOption = db.prepare("SELECT * FROM product_vehicle_options WHERE product_id = ? AND UPPER(vehicle_type) = ? AND COALESCE(is_active,1) = 1 LIMIT 1").get(product.id, vehicleCategory);
      }
      if (input.hotel_tier_id || input.hotelTierId) {
        matchingHotelTier = db.prepare("SELECT * FROM product_hotel_tiers WHERE id = ? AND product_id = ? LIMIT 1").get(input.hotel_tier_id || input.hotelTierId, product.id);
      }
      ticketTiers = db.prepare("SELECT * FROM product_ticket_tiers WHERE product_id = ? AND COALESCE(is_active,1) = 1 ORDER BY sort_order").all(product.id);
    } catch {}

    const variant = findPricingVariant(db, product.id, variantName, vehicleCategory);
    
    // Determine pricing model
    const isPerPerson = product.group_type === "SHARED" ||
      ["PACKAGE", "MULTI_DAY_PACKAGE"].includes(product.product_type) ||
      ["SIC", "TICKET_SIC", "TICKET_ONLY"].includes(product.product_sub_type) ||
      ticketTiers.length > 0;
    
    pricingModel = variant?.pricing_model || (isPerPerson ? "PER_PERSON" : "FIXED");
    variantName = variant?.variant_name || matchingVehicleOption?.label || variantName;

    if (matchingVehicleOption) {
      baseAmount = matchingVehicleOption.price_inr;
      pricingModel = "PER_VEHICLE";
    } else if (ticketTiers.length > 0 && input.ticket_selections && typeof input.ticket_selections === "object") {
      // Dynamic ticket counts: { "tt_id1": 2, "tt_id2": 1 }
      let tierSum = 0;
      for (const tier of ticketTiers) {
        const count = Number(input.ticket_selections[tier.id] || input.ticket_selections[tier.tier_name] || 0);
        if (count > 0 && !tier.is_free) {
          tierSum += tier.price_inr * count;
        }
      }
      baseAmount = tierSum > 0 ? tierSum : product.price_inr;
    } else {
      const unitPrice = roundMoney(variant?.base_price ?? product.price_inr);
      baseAmount = pricingModel === "PER_PERSON"
        ? unitPrice * adults + Math.round(unitPrice * 0.5) * children
        : unitPrice;
    }

    // Add hotel tier surcharge if selected (per person per night)
    if (matchingHotelTier && matchingHotelTier.price_per_person_per_night_inr > 0) {
      const nights = Math.max(1, (Number(product.duration_days) || 1) - 1);
      const hotelExtra = matchingHotelTier.price_per_person_per_night_inr * adults * nights +
        Math.round(matchingHotelTier.price_per_person_per_night_inr * 0.5) * children * nights;
      baseAmount += hotelExtra;
    }

    tolls = roundMoney(variant?.estimated_fastag_tolls);
    stateTax = roundMoney(variant?.estimated_state_tax);
    const taxRate = Number(variant?.tax_percentage ?? 5);
    gstAmount = roundMoney((baseAmount + tolls + stateTax) * taxRate / 100);
    totalAmount = baseAmount + tolls + stateTax + gstAmount;
  }

  const commissionAmount = roundMoney(totalAmount * commissionRate / 100);
  return {
    product,
    activityDate,
    adults,
    children,
    luggage,
    vehicleCategory,
    variantName,
    pricingModel,
    baseAmount,
    tolls,
    stateTax,
    gstAmount,
    nightAllowance,
    totalAmount,
    commissionRate,
    commissionAmount,
    supplierPayoutAmount: totalAmount - commissionAmount
  };
}

export function publicQuote(quote) {
  return {
    productId: quote.product.id,
    productTitle: quote.product.title,
    productType: quote.product.product_type,
    supplierId: quote.product.supplier_id,
    activityDate: quote.activityDate,
    adults: quote.adults,
    children: quote.children,
    luggage: quote.luggage,
    vehicleCategory: quote.vehicleCategory,
    variantName: quote.variantName,
    pricingModel: quote.pricingModel,
    currency: "INR",
    breakdown: {
      baseAmount: quote.baseAmount,
      fastagTolls: quote.tolls,
      stateTax: quote.stateTax,
      gstAmount: quote.gstAmount,
      nightAllowance: quote.nightAllowance || 0,
      totalAmount: quote.totalAmount
    }
  };
}

export function withoutPickupOtpSecrets(booking) {
  const { otp_code, otp_hash, otp_encrypted, ...safeBooking } = booking;
  return safeBooking;
}

export const BOOKING_TRANSITIONS = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["driver_assigned", "cancelled"],
  driver_assigned: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: []
};

export function canTransitionBooking(currentStatus, nextStatus) {
  return (BOOKING_TRANSITIONS[String(currentStatus || "").toLowerCase()] || []).includes(String(nextStatus || "").toLowerCase());
}
