import { nanoid } from "nanoid";
import { moveNativeReservation } from "./nativeInventoryService.js";
import { creditSupplierCancellationToWallet } from "./refundCreditService.js";
import { localDateTimeMs, productTime } from "../lib/localTime.js";

/**
 * Supplier reschedule (ADR 037, docs/SUPPLIER_OPERATIONS.md).
 *
 * A supplier moves a booking to another departure of the same option. The
 * price never changes and the seats move in the same transaction. A booking
 * IdeaHoliday was paid for becomes supplier_reschedule_status = MOVED: the
 * traveler is told and may keep it or decline, which cancels it with a full
 * wallet refund exactly like a supplier cancellation (ADR 019). A direct
 * (walk-in, phone, manual) booking just moves.
 */

const ACTIVE_DRIVER = "assignment_status NOT IN ('CANCELLED', 'REVOKED')";

function rescheduleError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

function departureStarted(db, booking, date = booking.activity_date, time = booking.pickup_time) {
  return localDateTimeMs(date, time || "00:00", productTime(db, booking.product_id)) <= Date.now();
}

/** Bookings the traveler can still answer: moved by the supplier, not yet run, cancelled or answered. */
function openMove(booking) {
  return booking.supplier_reschedule_status === "MOVED"
    && !["cancelled", "completed", "in_progress"].includes(String(booking.status || "").toLowerCase());
}

export function rescheduleBySupplier(db, { supplierId, bookingId, date, time = null, reason = null, actor = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw rescheduleError("Choose a date as YYYY-MM-DD", 400, "VALIDATION_ERROR");
  const booking = db.prepare("SELECT * FROM bookings WHERE (id = ? OR ref = ?) AND supplier_id = ?").get(bookingId, bookingId, supplierId);
  if (!booking) throw rescheduleError("Booking was not found for this supplier", 404, "BOOKING_NOT_FOUND");

  const status = String(booking.status || "").toLowerCase();
  if (["cancelled", "completed", "in_progress", "pending_payment"].includes(status)) {
    throw rescheduleError(`A ${status.replace("_", " ")} booking can't be moved`, 409, "INVALID_STATUS");
  }
  if (booking.attendance_status) throw rescheduleError("This traveler has already been checked in or marked as a no-show", 409, "ALREADY_ATTENDED");
  if (booking.circuit_order_id) throw rescheduleError("This booking is part of a multi-stop trip. IdeaHoliday operations reschedule those.", 409, "CIRCUIT_BOOKING");
  const driver = db.prepare(`SELECT id FROM driver_assignments WHERE booking_id = ? AND ${ACTIVE_DRIVER}`).get(booking.id);
  if (driver) throw rescheduleError("A driver is assigned to this booking. Unassign the driver first.", 409, "DRIVER_ASSIGNED");
  if (departureStarted(db, booking)) throw rescheduleError("This departure has already started", 409, "DEPARTURE_STARTED");

  const nextTime = time || booking.pickup_time || null;
  if (date === booking.activity_date && (nextTime || "") === (booking.pickup_time || "")) {
    throw rescheduleError("The booking is already on this departure", 409, "SAME_DEPARTURE");
  }
  if (departureStarted(db, booking, date, nextTime)) throw rescheduleError("Choose a departure that hasn't started yet", 409, "DEPARTURE_IN_PAST");

  // Only a booking IdeaHoliday was paid for gets the traveler's choice.
  const travelerMayDecline = booking.payment_status === "PAID";
  const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;
  db.transaction(() => {
    moveNativeReservation(db, booking, date, nextTime, { counterSale: true });
    db.prepare(`UPDATE bookings SET original_activity_date = COALESCE(original_activity_date, activity_date), activity_date = ?, pickup_time = ?, rescheduled_at = CURRENT_TIMESTAMP,
        supplier_reschedule_status = ?, supplier_reschedule_from_date = ?, supplier_reschedule_from_time = ?, supplier_reschedule_reason = ?, supplier_rescheduled_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(
      date, nextTime,
      travelerMayDecline ? "MOVED" : booking.supplier_reschedule_status || null,
      booking.activity_date, booking.pickup_time || null, cleanReason, booking.id,
    );
    db.prepare(`INSERT INTO booking_modifications (id, booking_id, requested_by, modification_type, original_value, requested_value, status, supplier_notes, resolved_at)
      VALUES (?, ?, ?, 'SUPPLIER_RESCHEDULE', ?, ?, 'APPLIED', ?, CURRENT_TIMESTAMP)`).run(
      `mod_${nanoid(12)}`, booking.id, actor?.id || supplierId,
      JSON.stringify({ date: booking.activity_date, time: booking.pickup_time || null }),
      JSON.stringify({ date, time: nextTime }), cleanReason,
    );
  })();

  return {
    bookingId: booking.id, ref: booking.ref,
    from: { date: booking.activity_date, time: booking.pickup_time || null },
    to: { date, time: nextTime },
    travelerMayDecline,
  };
}

function travelerBooking(db, ref, actor) {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(ref, ref);
  const owns = booking && actor && (actor.id === booking.user_id
    || (actor.email && String(actor.email).toLowerCase() === String(booking.traveler_email || "").toLowerCase()));
  if (!owns) throw rescheduleError("Booking not found", 404, "BOOKING_NOT_FOUND");
  if (!openMove(booking)) throw rescheduleError("There is no new date waiting for your answer", 409, "NO_OPEN_RESCHEDULE");
  return booking;
}

/** The traveler keeps the new departure. */
export function acceptSupplierReschedule(db, { ref, actor }) {
  const booking = travelerBooking(db, ref, actor);
  db.prepare("UPDATE bookings SET supplier_reschedule_status = 'ACCEPTED' WHERE id = ? AND supplier_reschedule_status = 'MOVED'").run(booking.id);
  return { bookingId: booking.id, ref: booking.ref, status: "ACCEPTED" };
}

/**
 * The traveler declines the new departure: cancelled and refunded in full to
 * their wallet, as if the supplier had cancelled. Allowed until it starts.
 */
export function declineSupplierReschedule(db, { ref, actor }) {
  const booking = travelerBooking(db, ref, actor);
  if (departureStarted(db, booking)) throw rescheduleError("The new departure has already started", 409, "DEPARTURE_STARTED");
  const wallet = creditSupplierCancellationToWallet(db, { booking, reason: "Traveler declined the operator's new date" });
  db.prepare("UPDATE bookings SET supplier_reschedule_status = 'DECLINED' WHERE id = ?").run(booking.id);
  db.prepare(`INSERT INTO supplier_notifications (id, supplier_id, type, title, message, action_url) VALUES (?, ?, 'RESCHEDULE_DECLINED', ?, ?, ?)`).run(
    `snotif_${nanoid(12)}`, booking.supplier_id, `${booking.ref}: new date declined`,
    `${booking.traveler_name || "The traveler"} declined ${booking.activity_date}${booking.pickup_time ? ` ${booking.pickup_time}` : ""}. The booking is cancelled and refunded to their wallet; the seats are free again.`,
    "/supplier/bookings",
  );
  return { bookingId: booking.id, ref: booking.ref, status: "DECLINED", walletCreditInr: wallet.creditInr, cashRefundableUntil: wallet.cashRefundableUntil };
}
