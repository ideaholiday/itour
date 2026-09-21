import { randomUUID, createHash } from "node:crypto";
import {
  listNativeAvailability,
  reserveNativeInventory,
  confirmNativeReservation,
  releaseNativeReservation,
  getInventoryRules,
  normalizeUnitItems,
  UNIT_TYPES as NATIVE_UNIT_TYPES,
} from "./nativeInventoryService.js";
import { getProductOptions } from "./logisticsService.js";
import { octoReservationView } from "./reservationProviders.js";
import logger from "../config/logger.js";
import { approvedSupplierSql } from "./supplierKybGate.js";
import { productTime } from "../lib/localTime.js";
import { isGstFreeProduct } from "../lib/productTax.js";

// Channel partners see and book only what travelers can: published products
// whose supplier is KYB-approved.
const SELLABLE_PRODUCT_SQL = `(status = 'PUBLISHED' OR is_published = 1) AND ${approvedSupplierSql("products")}`;

function isSellableProduct(db, productId) {
  return Boolean(db.prepare(`SELECT 1 FROM products WHERE id = ? AND ${SELLABLE_PRODUCT_SQL}`).get(productId));
}

function assertSellableProduct(db, productId) {
  if (!isSellableProduct(db, productId)) {
    throw Object.assign(new Error("This product is not available for booking"), { status: 409, code: "PRODUCT_NOT_BOOKABLE" });
  }
}

function stableUnitUuid(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOctoCapabilities() {
  return [
    { id: "octo/core", revision: 1, required: true },
    { id: "octo/pricing", revision: 1, required: false },
    { id: "octo/content", revision: 1, required: false },
    { id: "octo/webhooks", revision: 1, required: false },
  ];
}

export function getOctoSuppliers(db) {
  const rows = db.prepare(`
    SELECT id, company_name, contact_name, email, phone, city, state
    FROM suppliers
    WHERE UPPER(COALESCE(kyb_status, '')) = 'APPROVED'
    ORDER BY company_name ASC
  `).all();

  return rows.map((sup) => ({
    id: sup.id,
    name: sup.company_name,
    endpoint: `${process.env.PUBLIC_APP_URL || "https://supply.ideaholiday.in"}/api/octo`,
    contact: {
      fullName: sup.contact_name,
      email: sup.email,
      telephone: sup.phone,
      address: `${sup.city || ""}, ${sup.state || ""}`.trim().replace(/^,|,$/g, ""),
    },
  }));
}

export function formatOctoProduct(db, product) {
  let options = [];
  try {
    options = db.prepare("SELECT * FROM product_options WHERE product_id = ?").all(product.id);
  } catch (_) {
    options = getProductOptions(db, product.id) || [];
  }
  const rules = db.prepare("SELECT * FROM native_inventory_rules WHERE product_id = ?").all(product.id);
  const rulesByOption = new Map(rules.map((r) => [r.option_id, r]));

  const octoOptions = options.map((opt) => {
    const optRules = rulesByOption.get(opt.id);
    let departureTimes = ["09:00", "14:00"];
    let adultPriceInr = product.price_inr || 0;
    let childPriceInr = Math.round(adultPriceInr * 0.75);
    let cutoffHours = 2;
    let cancellationHours = 24;

    if (optRules) {
      try {
        departureTimes = typeof optRules.departure_times === "string" ? JSON.parse(optRules.departure_times) : optRules.departure_times;
      } catch (e) { /* fallback */ }
      adultPriceInr = optRules.adult_price || adultPriceInr;
      childPriceInr = optRules.child_price || childPriceInr;
      cutoffHours = Math.round((optRules.cutoff_minutes || 120) / 60);
      cancellationHours = optRules.cancellation_hours || 24;
    }

    return {
      id: opt.id,
      default: Boolean(opt.is_default),
      internalName: opt.name || opt.variant_name || "Standard Departure",
      reference: opt.id,
      availabilityLocalStartTimes: departureTimes,
      cancellationCutoff: `${cancellationHours} hours`,
      cancellationCutoffAmount: cancellationHours,
      cancellationCutoffUnit: "hour",
      requiredContactFields: ["fullName", "email", "phoneNumber"],
      restrictions: {
        minUnits: 1,
        maxUnits: optRules?.capacity || opt.capacity || 20,
      },
      units: [
        {
          id: `${opt.id}:adult`,
          internalName: "Adult",
          reference: "ADULT",
          type: "ADULT",
          pricingFrom: [
            {
              original: Math.round(adultPriceInr * 100),
              retail: Math.round(adultPriceInr * 100),
              net: Math.round(adultPriceInr * 80),
              currency: "INR",
              currencyPrecision: 2,
            },
          ],
        },
        {
          id: `${opt.id}:child`,
          internalName: "Child",
          reference: "CHILD",
          type: "CHILD",
          pricingFrom: [
            {
              original: Math.round(childPriceInr * 100),
              retail: Math.round(childPriceInr * 100),
              net: Math.round(childPriceInr * 80),
              currency: "INR",
              currencyPrecision: 2,
            },
          ],
        },
      ],
    };
  });

  return {
    id: product.id,
    internalName: product.title,
    reference: product.product_code || product.id,
    locale: "en",
    timeZone: productTime(db, product.id).timeZone,
    instantConfirmation: Boolean(product.is_instant_booking ?? 1),
    instantDelivery: true,
    availabilityRequired: true,
    availabilityType: "START_TIME",
    deliveryFormats: ["QRCODE", "PDF_URL"],
    deliveryMethods: ["TICKET", "VOUCHER"],
    settlementMethod: "DEFERRED",
    redemptionMethod: "DIGITAL",
    options: octoOptions,
  };
}

export function getOctoProducts(db, { supplierId } = {}) {
  let query = `SELECT * FROM products WHERE ${SELLABLE_PRODUCT_SQL}`;
  const params = [];
  if (supplierId) {
    query += " AND supplier_id = ?";
    params.push(supplierId);
  }
  query += " ORDER BY created_at DESC LIMIT 100";

  const rows = db.prepare(query).all(...params);
  return rows.map((product) => formatOctoProduct(db, product));
}

export function getOctoProduct(db, productId) {
  const row = db.prepare(`SELECT * FROM products WHERE id = ? AND ${SELLABLE_PRODUCT_SQL}`).get(productId);
  if (!row) return null;
  return formatOctoProduct(db, row);
}

export function getOctoAvailability(db, { productId, optionId, localDateStart, localDateEnd }) {
  if (!isSellableProduct(db, productId)) return [];
  const dates = [];
  const start = new Date(localDateStart);
  const end = localDateEnd ? new Date(localDateEnd) : start;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const allSlots = [];
  for (const dateStr of dates) {
    try {
      const slots = listNativeAvailability(db, productId, optionId, dateStr);
      for (const slot of slots) {
        allSlots.push({
          id: slot.id,
          localDateTimeStart: slot.localDateTimeStart,
          localDateTimeEnd: slot.localDateTimeStart,
          allDay: false,
          available: slot.available,
          status: slot.status,
          vacancies: slot.vacancies,
          capacity: slot.capacity,
          maxUnits: slot.capacity,
          utcCutoffAt: slot.utcCutoffAt,
          openingHours: [],
          unitPricing: [
            {
              unitId: `${slot.optionId}:adult`,
              pricing: {
                original: Math.round(slot.adultPrice * 100),
                retail: Math.round(slot.adultPrice * 100),
                net: Math.round(slot.adultPrice * 80),
                currency: "INR",
                currencyPrecision: 2,
              },
            },
            {
              unitId: `${slot.optionId}:child`,
              pricing: {
                original: Math.round(slot.childPrice * 100),
                retail: Math.round(slot.childPrice * 100),
                net: Math.round(slot.childPrice * 80),
                currency: "INR",
                currencyPrecision: 2,
              },
            },
          ],
        });
      }
    } catch (err) {
      logger.warn("OCTo availability lookup error for date", { dateStr, error: err.message });
    }
  }

  return allSlots;
}


/**
 * Maps OCTo unit items onto the adults/children the reservation engine stores.
 *
 * Keys on the typed `unitType` (falling back to `unitId` only when a caller
 * omits the type), because a free-text unit id such as `child_ticket` may carry
 * any type. `SENIOR` and `YOUTH` bill as adults and `INFANT` as a child until
 * `bookings` can represent unit items individually — see
 * docs/RESERVATION_ENGINE_V2_PLAN.md (P1).
 */
export const OCTO_CHILD_UNIT_TYPES = new Set(["CHILD", "INFANT"]);

export function countOctoUnits(unitItems = []) {
  const { adults, children } = normalizeUnitItems(toNativeUnitItems(unitItems));
  return { adults, children };
}

/**
 * Converts OCTo unit items into the engine's unit breakdown.
 *
 * One OCTo unit item is one traveler. Keys on the typed `unitType`, falling back
 * to loose matching on `unitId` only when a caller omits the type, and treats an
 * unrecognized type as an adult so an unknown unit never blocks a reservation.
 */
export function toNativeUnitItems(unitItems = []) {
  const counts = new Map();
  for (const item of unitItems) {
    const declared = item?.unitType ? String(item.unitType).toUpperCase() : "";
    let unitType;
    if (NATIVE_UNIT_TYPES.includes(declared)) unitType = declared;
    else if (!declared && /infant/i.test(String(item?.unitId || ""))) unitType = "INFANT";
    else if (!declared && /child/i.test(String(item?.unitId || ""))) unitType = "CHILD";
    else if (OCTO_CHILD_UNIT_TYPES.has(declared)) unitType = declared;
    else unitType = "ADULT";
    counts.set(unitType, (counts.get(unitType) || 0) + Number(item?.quantity ?? 1));
  }
  if (!counts.size) counts.set("ADULT", 1);
  return [...counts.entries()].map(([unitType, quantity]) => ({ unitType, quantity }));
}

export function createOctoReservation(db, input) {
  const { uuid = randomUUID(), productId, optionId, availabilityId, unitItems = [], contact } = input;

  if (!productId || !optionId || !availabilityId) {
    throw Object.assign(new Error("productId, optionId, and availabilityId are required"), { status: 400 });
  }
  assertSellableProduct(db, productId);

  const parts = availabilityId.split(":");
  const localDate = parts[1];
  const localTime = parts.slice(2).join(":");

  const nativeUnitItems = toNativeUnitItems(unitItems);

  const reservation = reserveNativeInventory(db, {
    productId,
    optionId,
    localDate,
    localTime,
    unitItems: nativeUnitItems,
    ownerId: `octo_${uuid}`,
    requestKey: `octo_key_${uuid}`,
  });

  return octoReservationView(db, reservation.id, `octo_${uuid}`);
}

export function confirmOctoReservation(db, input) {
  const { uuid, contact = {} } = input;
  if (!uuid) throw Object.assign(new Error("uuid is required"), { status: 400 });

  const reservation = db.prepare("SELECT * FROM native_reservations WHERE id = ? OR owner_id = ?").get(uuid, `octo_${uuid}`);
  if (!reservation) throw Object.assign(new Error("Reservation not found"), { status: 404 });

  if (reservation.status === "CONFIRMED") {
    return octoReservationView(db, reservation.id, reservation.owner_id);
  }

  const bookingId = `bk_octo_${uuid.slice(0, 12)}`;

  // The slot carries the real product, date and time. Parsing them out of the
  // slot id is wrong: the id is `optionId:date:HH:MM`, so splitting on ":"
  // yields the OPTION id and a truncated "HH" rather than the product and time.
  const slot = db.prepare("SELECT product_id, option_id, local_date, local_time FROM native_availability_slots WHERE id = ?")
    .get(reservation.availability_slot);
  if (!slot) throw Object.assign(new Error("Reservation departure not found"), { status: 409 });
  // The supplier may have been suspended while the hold was open.
  assertSellableProduct(db, slot.product_id);

  // Bill the price frozen on the hold rather than a placeholder.
  const snapshot = (() => {
    try { return JSON.parse(reservation.pricing_snapshot || "{}"); } catch { return {}; }
  })();
  const base = Number(snapshot.unitTotal) > 0
    ? Number(snapshot.unitTotal)
    : Number(snapshot.adultPrice || 0) * Number(reservation.adults || 0)
      + Number(snapshot.childPrice || 0) * Number(reservation.children || 0);
  const amountInr = base > 0 ? base + (isGstFreeProduct(db, slot.product_id) ? 0 : Math.round(base * 0.05)) : 0;

  // bookings.ref, product_type and pickup_location are NOT NULL: an OCTo
  // confirmation has to populate the same required shape as a native booking.
  const product = db.prepare("SELECT product_type, supplier_id, city FROM products WHERE id = ?").get(slot.product_id) || {};
  const bookingRef = `IH-${randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`;

  db.transaction(() => {
    // bookings.user_id is a real foreign key, but an OCTo reservation's owner is
    // the synthetic `octo_<uuid>` identity. Materialise a guest traveler for it,
    // the same way the checkout route does for an external booker.
    const ownerExists = db.prepare("SELECT id FROM users WHERE id = ?").get(reservation.owner_id);
    if (!ownerExists) {
      db.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, 'TRAVELER')")
        .run(
          reservation.owner_id,
          contact.fullName || "OCTo Guest",
          (contact.email || `${reservation.owner_id}@octo.ideaholiday.in`).toLowerCase(),
          `external_${randomUUID()}`,
          contact.phoneNumber || "+919999999999"
        );
    }

    db.prepare(`
      INSERT INTO bookings (id, ref, user_id, product_id, product_option_id, supplier_id, product_type, activity_date, pickup_time, pickup_location, adults, children, amount_inr, status, payment_status, traveler_name, traveler_email, traveler_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'PAID', ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      bookingId,
      bookingRef,
      reservation.owner_id,
      slot.product_id,
      slot.option_id,
      product.supplier_id || null,
      product.product_type || "EXPERIENCE",
      slot.local_date,
      slot.local_time,
      product.city || "To be confirmed",
      reservation.adults,
      reservation.children,
      amountInr,
      contact.fullName || "OCTo Guest",
      contact.email || "octo@ideaholiday.in",
      contact.phoneNumber || "+919999999999"
    );

    db.prepare("UPDATE native_reservations SET status = 'CONFIRMED', booking_id = ? WHERE id = ?").run(bookingId, reservation.id);
  })();

  const confirmedView = octoReservationView(db, reservation.id, reservation.owner_id);
  return {
    ...confirmedView,
    status: "CONFIRMED",
    voucher: {
      redemptionMethod: "DIGITAL",
      deliveryOptions: [
        {
          deliveryFormat: "QRCODE",
          deliveryValue: `https://ideaholiday.in/trip/${bookingId}`,
        },
      ],
    },
  };
}

export function cancelOctoReservation(db, input) {
  const { uuid, reason = "Customer request" } = input;
  const reservation = db.prepare("SELECT * FROM native_reservations WHERE id = ? OR owner_id = ?").get(uuid, `octo_${uuid}`);
  if (!reservation) throw Object.assign(new Error("Reservation not found"), { status: 404 });

  db.transaction(() => {
    db.prepare("UPDATE native_reservations SET status = 'CANCELLED' WHERE id = ?").run(reservation.id);
    if (reservation.booking_id) {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(reservation.booking_id);
    }
  })();

  return {
    id: reservation.id,
    uuid: reservation.id,
    status: "CANCELLED",
    cancellation: {
      refund: "FULL",
      reason,
      utcCancelledAt: new Date().toISOString(),
    },
  };
}
