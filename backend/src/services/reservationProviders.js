import { createHash } from "node:crypto";
import { listNativeAvailability, reserveNativeInventory, confirmNativeReservation, releaseNativeReservation } from "./nativeInventoryService.js";

// The core owns payments and customer identity; a provider owns availability and reservations.
// Remote adapters implement these same operations and persist external identities in
// reservation_external_references. They must never mutate native capacity directly.
const nativeProvider = Object.freeze({
  id: "NATIVE",
  availability: (db, { productId, optionId, localDate }) => listNativeAvailability(db, productId, optionId, localDate),
  reserve: (db, input) => reserveNativeInventory(db, input),
  confirm: (db, booking) => db.transaction(() => confirmNativeReservation(db, booking))(),
  release: (db, bookingId) => db.transaction(() => releaseNativeReservation(db, bookingId))(),
});

export function getReservationProvider(provider = "NATIVE") {
  const normalized = String(provider || "NATIVE").toUpperCase();
  if (
    normalized === "NATIVE" ||
    normalized.startsWith("EXTERNAL_") ||
    ["BOKUN", "FAREHARBOR", "BOOKINGKIT", "TOURCMS", "ACTIVITAR", "ANCHOR", "OCTO_GENERIC"].includes(normalized)
  ) {
    return nativeProvider;
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
