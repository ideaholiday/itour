import { createHash } from "node:crypto";
import { listNativeAvailability, reserveNativeInventory, confirmNativeReservation, releaseNativeReservation } from "./nativeInventoryService.js";
import { getChannelAdapter, ResTechAdapter } from "./channels/channelRegistry.js";

// The core owns payments and customer identity; a provider owns availability and reservations.
// Remote adapters implement these same operations and persist external identities in
// reservation_external_references. They must never mutate native capacity directly.
const nativeProvider = Object.freeze({
  id: "NATIVE",
  availability: (db, { productId, optionId, localDate, promoCode = null }) => listNativeAvailability(db, productId, optionId, localDate, { promoCode }),
  reserve: (db, input) => reserveNativeInventory(db, input),
  confirm: (db, booking) => db.transaction(() => confirmNativeReservation(db, booking))(),
  release: (db, bookingId) => db.transaction(() => releaseNativeReservation(db, bookingId))(),
});

/**
 * Builds a provider backed by a supplier's connected external channel.
 *
 * Availability and reservations are owned by the remote system; we keep only the
 * identity mapping in `reservation_external_references`. Native capacity is
 * never touched, because for an externally sourced product we are not the
 * authority on seats.
 */
export function externalReservationProvider(providerName) {
  const id = String(providerName).toUpperCase();

  const connectionFor = (db, supplierId) => {
    const row = db.prepare(
      "SELECT * FROM supplier_channel_connections WHERE supplier_id = ? AND channel_name = ? AND status = 'ACTIVE'"
    ).get(supplierId, id);
    if (!row) {
      throw Object.assign(new Error(`${id} is not connected for this supplier`), { status: 409, code: "PROVIDER_NOT_CONNECTED" });
    }
    return { row, credentials: { ...JSON.parse(row.credentials_json || "{}"), endpointUrl: row.endpoint_url } };
  };

  const capability = (adapter, method) => {
    // The base adapter throws "Not implemented"; surface that as a clear
    // capability gap rather than a mystery failure mid-checkout.
    if (adapter[method] === ResTechAdapter.prototype[method]) {
      throw Object.assign(new Error(`${id} cannot ${method} yet`), { status: 501, code: "PROVIDER_CAPABILITY_MISSING" });
    }
    return adapter[method].bind(adapter);
  };

  /** Resolves a local id to the provider's own id, or passes it through. */
  const externalId = (db, supplierId, resourceType, internalId) => {
    if (!internalId) return null;
    const row = db.prepare(
      `SELECT external_id FROM reservation_external_references
       WHERE supplier_id = ? AND provider = ? AND resource_type = ? AND internal_id = ?`
    ).get(supplierId, id, resourceType, internalId);
    return row?.external_id || internalId;
  };

  return Object.freeze({
    id,
    isExternal: true,

    async availability(db, { productId, optionId, localDate, supplierId }) {
      const { credentials } = connectionFor(db, supplierId);
      const adapter = getChannelAdapter(id);
      const fetchAvailability = capability(adapter, "fetchAvailability");
      const slots = await fetchAvailability(credentials, externalId(db, supplierId, "PRODUCT", productId), {
        optionId: externalId(db, supplierId, "OPTION", optionId),
        localDateStart: localDate,
        localDateEnd: localDate,
      });
      return (slots || []).map((slot) => ({ ...slot, provider: id }));
    },

    async reserve(db, { productId, optionId, localDate, localTime, unitItems, adults = 1, children = 0, supplierId, ownerId, requestKey }) {
      const { credentials } = connectionFor(db, supplierId);
      const adapter = getChannelAdapter(id);
      const createReservation = capability(adapter, "createReservation");

      // requestKey is the caller's idempotency key; pass it through so a retry
      // reaches the provider as the same reservation rather than a second one.
      const items = unitItems?.length
        ? unitItems.flatMap((item) => Array.from({ length: item.quantity }, () => ({ unitType: item.unitType })))
        : [...Array.from({ length: adults }, () => ({ unitType: "ADULT" })),
           ...Array.from({ length: children }, () => ({ unitType: "CHILD" }))];

      const reservation = await createReservation(credentials, {
        externalProductId: externalId(db, supplierId, "PRODUCT", productId),
        externalOptionId: externalId(db, supplierId, "OPTION", optionId),
        availabilityId: `${optionId}:${localDate}:${localTime}`,
        unitItems: items,
        idempotencyKey: requestKey,
      });

      const remoteId = reservation?.uuid || reservation?.id;
      if (!remoteId) {
        throw Object.assign(new Error(`${id} returned no reservation reference`), { status: 502, code: "PROVIDER_BAD_RESPONSE" });
      }
      // 'BOOKING' is the schema's existing vocabulary for a reservation-level
      // identity; reservation_external_references constrains resource_type.
      db.prepare(
        `INSERT INTO reservation_external_references (supplier_id, provider, resource_type, internal_id, external_id)
         VALUES (?, ?, 'BOOKING', ?, ?)
         ON CONFLICT DO NOTHING`
      ).run(supplierId, id, requestKey, String(remoteId));

      return {
        id: String(remoteId), provider: id, owner_id: ownerId, request_key: requestKey,
        status: reservation.status || "ON_HOLD",
        utc_expires_at: reservation.utcExpiresAt || reservation.utc_expires_at || null,
        external: true,
      };
    },

    async confirm(db, booking) {
      const { credentials } = connectionFor(db, booking.supplier_id);
      const adapter = getChannelAdapter(id);
      const confirmReservation = capability(adapter, "confirmReservation");
      const uuid = externalId(db, booking.supplier_id, "BOOKING", booking.provider_reservation_id || booking.id);
      return confirmReservation(credentials, { uuid });
    },

    async release(db, bookingId, { supplierId } = {}) {
      const { credentials } = connectionFor(db, supplierId);
      const adapter = getChannelAdapter(id);
      const cancelReservation = capability(adapter, "cancelReservation");
      const uuid = externalId(db, supplierId, "BOOKING", bookingId);
      return cancelReservation(credentials, { uuid, reason: "Released by marketplace" });
    },
  });
}

export const EXTERNAL_PROVIDERS = Object.freeze([
  "BOKUN", "FAREHARBOR", "BOOKINGKIT", "TOURCMS", "ACTIVITAR", "ANCHOR", "OCTO_GENERIC",
]);

/**
 * Resolves the provider that owns a product's availability and reservations.
 *
 * An external name no longer silently returns the native engine. Serving native
 * seats for an externally sourced product would show capacity we do not own, so
 * an unimplemented external operation now fails loudly with
 * `PROVIDER_CAPABILITY_MISSING` instead.
 */
export function getReservationProvider(provider = "NATIVE") {
  const normalized = String(provider || "NATIVE").toUpperCase();
  if (normalized === "NATIVE") return nativeProvider;
  if (EXTERNAL_PROVIDERS.includes(normalized)) return externalReservationProvider(normalized);
  if (normalized.startsWith("EXTERNAL_")) {
    const name = normalized.replace(/^EXTERNAL_/, "");
    if (EXTERNAL_PROVIDERS.includes(name)) return externalReservationProvider(name);
  }
  throw Object.assign(new Error("Reservation provider is not connected"), { status: 409, code: "PROVIDER_NOT_CONNECTED" });
}

function stableUnitUuid(value) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function octoReservationView(db, reservationId, ownerId) {
  const row = db.prepare(`SELECT r.*, s.product_id, s.option_id, s.local_date, s.local_time, b.status AS booking_status
    FROM native_reservations r JOIN native_availability_slots s ON s.id = r.availability_slot
    LEFT JOIN bookings b ON b.id = r.booking_id WHERE r.id = ? AND r.owner_id = ?`).get(reservationId, ownerId);
  if (!row) throw Object.assign(new Error("Reservation not found"), { status: 404 });
  const status = row.booking_status === "cancelled" ? "CANCELLED"
    : row.status === "ON_HOLD" && Date.parse(row.utc_expires_at) <= Date.now() ? "EXPIRED" : row.status;
  return {
    id: row.id, uuid: row.id, productId: row.product_id, optionId: row.option_id,
    availabilityId: row.availability_slot, status, utcCreatedAt: row.created_at,
    utcExpiresAt: status === "ON_HOLD" ? row.utc_expires_at : null,
    availability: { id: row.availability_slot, localDateTimeStart: `${row.local_date}T${row.local_time}:00+05:30` },
    unitItems: [
      ...Array.from({ length: row.adults }, (_, i) => ({ uuid: stableUnitUuid(`${row.id}:adult:${i}`), unitId: `${row.option_id}:adult`, unitType: "ADULT" })),
      ...Array.from({ length: row.children }, (_, i) => ({ uuid: stableUnitUuid(`${row.id}:child:${i}`), unitId: `${row.option_id}:child`, unitType: "CHILD" })),
    ],
  };
}
