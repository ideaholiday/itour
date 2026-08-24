import crypto from "crypto";

export class BookingModificationService {
  /**
   * Helper to verify if actor is authorized to modify the booking
   */
  static verifyActorAuthorization(actor, booking) {
    if (!actor) return false;
    const role = String(actor.role || "").toUpperCase();
    if (["ADMIN", "STAFF"].includes(role)) return true;
    if (role === "TRAVELER" || !role) {
      if (actor.id && booking.user_id && actor.id === booking.user_id) return true;
      if (actor.email && booking.traveler_email && actor.email.toLowerCase() === booking.traveler_email.toLowerCase()) return true;
    }
    return false;
  }

  /**
   * Computes remaining hours before trip start
   */
  static getHoursUntilDeparture(activityDate, pickupTime = "09:00") {
    try {
      const timeParts = String(pickupTime || "09:00").split(":");
      const hours = parseInt(timeParts[0], 10) || 9;
      const minutes = parseInt(timeParts[1], 10) || 0;
      const departureDate = new Date(`${activityDate}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
      const now = new Date();
      const diffMs = departureDate.getTime() - now.getTime();
      return diffMs / (1000 * 60 * 60);
    } catch {
      return 0;
    }
  }

  /**
   * Checks whether booking is eligible for date/time rescheduling
   */
  static checkRescheduleEligibility(database, bookingId, actor = null) {
    const booking = database.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
    if (!booking) {
      return { eligible: false, error: "BOOKING_NOT_FOUND" };
    }

    if (actor && !this.verifyActorAuthorization(actor, booking)) {
      return { eligible: false, error: "UNAUTHORIZED" };
    }

    const rawStatus = String(booking.status || "").toLowerCase();
    if (["cancelled", "completed", "in_progress"].includes(rawStatus)) {
      return {
        eligible: false,
        error: "INVALID_STATUS",
        reason: `Cannot modify booking with status: ${booking.status}`,
      };
    }

    // Lookup product cancellation/modification policy
    let policy = "FLEXIBLE_24H";
    if (booking.product_id) {
      const product = database.prepare("SELECT cancellation_policy FROM products WHERE id = ?").get(booking.product_id);
      if (product?.cancellation_policy) {
        policy = product.cancellation_policy;
      }
    }

    let cutoffHours = 24;
    if (policy === "MODERATE_48H") cutoffHours = 48;
    if (policy === "STRICT") cutoffHours = 72;

    const hoursUntilDeparture = this.getHoursUntilDeparture(booking.activity_date, booking.pickup_time);
    const isAdmin = actor && ["ADMIN", "STAFF"].includes(String(actor.role || "").toUpperCase());

    const isEligible = isAdmin || hoursUntilDeparture >= cutoffHours;

    return {
      eligible: isEligible,
      bookingId: booking.id,
      ref: booking.ref,
      currentDate: booking.activity_date,
      currentTime: booking.pickup_time || "09:00",
      cancellationPolicy: policy,
      cutoffHours,
      hoursUntilDeparture: Math.round(hoursUntilDeparture * 10) / 10,
      reason: isEligible ? null : `Reschedule window closed (${cutoffHours}h required before departure, ${Math.max(0, Math.round(hoursUntilDeparture))}h remaining)`,
    };
  }

  /**
   * Atomically executes a booking reschedule
   */
  static requestReschedule(database, bookingId, { newDate, newTime, reason }, actor = null) {
    const eligibility = this.checkRescheduleEligibility(database, bookingId, actor);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || eligibility.error || "RESCHEDULE_NOT_ALLOWED");
    }

    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      throw new Error("INVALID_DATE_FORMAT");
    }

    const booking = database.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
    const originalDate = booking.original_activity_date || booking.activity_date;
    const previousDate = booking.activity_date;
    const previousTime = booking.pickup_time || "09:00";
    const targetTime = newTime || previousTime;
    const modificationId = `mod_${crypto.randomBytes(6).toString("hex")}`;
    const requesterId = actor?.id || booking.user_id || "traveler";

    database.transaction(() => {
      database.prepare(`
        UPDATE bookings
        SET
          original_activity_date = ?,
          activity_date = ?,
          pickup_time = ?,
          rescheduled_at = datetime('now')
        WHERE id = ?
      `).run(originalDate, newDate, targetTime, booking.id);

      database.prepare(`
        INSERT INTO booking_modifications (
          id, booking_id, requested_by, modification_type,
          original_value, requested_value, status, supplier_notes, created_at, resolved_at
        ) VALUES (?, ?, ?, 'RESCHEDULE', ?, ?, 'APPLIED', ?, datetime('now'), datetime('now'))
      `).run(
        modificationId,
        booking.id,
        requesterId,
        JSON.stringify({ date: previousDate, time: previousTime }),
        JSON.stringify({ date: newDate, time: targetTime }),
        reason || "Traveler self-service reschedule"
      );
    })();

    return {
      success: true,
      bookingId: booking.id,
      ref: booking.ref,
      previousDate,
      newDate,
      previousTime,
      newTime: targetTime,
      rescheduledAt: new Date().toISOString(),
    };
  }

  /**
   * Previews refund calculations based on product cancellation policy
   */
  static calculateCancellationRefundPreview(database, bookingId, actor = null) {
    const booking = database.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
    if (!booking) throw new Error("BOOKING_NOT_FOUND");
    if (actor && !this.verifyActorAuthorization(actor, booking)) throw new Error("UNAUTHORIZED");

    let policy = "FLEXIBLE_24H";
    if (booking.product_id) {
      const product = database.prepare("SELECT cancellation_policy FROM products WHERE id = ?").get(booking.product_id);
      if (product?.cancellation_policy) policy = product.cancellation_policy;
    }

    const hoursUntilDeparture = this.getHoursUntilDeparture(booking.activity_date, booking.pickup_time);
    const totalAmountInr = Number(booking.amount_inr || 0);

    let refundPercentage = 0;

    if (policy === "FLEXIBLE_24H") {
      if (hoursUntilDeparture >= 24) {
        refundPercentage = 100;
      } else if (hoursUntilDeparture >= 12) {
        refundPercentage = 50;
      } else {
        refundPercentage = 0;
      }
    } else if (policy === "MODERATE_48H") {
      if (hoursUntilDeparture >= 48) {
        refundPercentage = 100;
      } else if (hoursUntilDeparture >= 24) {
        refundPercentage = 50;
      } else {
        refundPercentage = 0;
      }
    } else {
      // STRICT
      if (hoursUntilDeparture >= 72) {
        refundPercentage = 100;
      } else {
        refundPercentage = 0;
      }
    }

    const refundAmountInr = Math.round((totalAmountInr * refundPercentage) / 100);
    const cancellationFeeInr = totalAmountInr - refundAmountInr;

    return {
      bookingId: booking.id,
      ref: booking.ref,
      totalAmountInr,
      cancellationPolicy: policy,
      hoursUntilDeparture: Math.round(hoursUntilDeparture * 10) / 10,
      refundPercentage,
      refundAmountInr,
      cancellationFeeInr,
      isFullyRefundable: refundPercentage === 100,
      refundMethod: booking.payment_method === "CASHFREE" ? "ORIGINAL_PAYMENT_SOURCE" : "DEMO_REVERSAL",
    };
  }

  /**
   * Executes a self-service cancellation with automated refund calculation
   */
  static executeSelfServiceCancellation(database, bookingId, { reason }, actor = null) {
    const preview = this.calculateCancellationRefundPreview(database, bookingId, actor);
    const booking = database.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);

    const modificationId = `mod_${crypto.randomBytes(6).toString("hex")}`;
    const requesterId = actor?.id || booking.user_id || "traveler";
    const paymentStatus = preview.refundAmountInr > 0 ? "REFUND_INITIATED" : "REFUND_NOT_APPLICABLE";

    database.transaction(() => {
      database.prepare(`
        UPDATE bookings
        SET
          status = 'cancelled',
          payment_status = ?,
          refund_amount_inr = ?,
          cancellation_fee_inr = ?,
          cancellation_reason = ?
        WHERE id = ?
      `).run(paymentStatus, preview.refundAmountInr, preview.cancellationFeeInr, reason || "Traveler requested cancellation", booking.id);

      // Cancel any pending supplier payouts
      try {
        database.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
      } catch {}

      // Log in booking_modifications
      database.prepare(`
        INSERT INTO booking_modifications (
          id, booking_id, requested_by, modification_type,
          original_value, requested_value, price_difference_inr, status, supplier_notes, created_at, resolved_at
        ) VALUES (?, ?, ?, 'CANCELLATION', ?, ?, ?, 'APPLIED', ?, datetime('now'), datetime('now'))
      `).run(
        modificationId,
        booking.id,
        requesterId,
        booking.status,
        "cancelled",
        -preview.refundAmountInr,
        reason || "Traveler self-service cancellation"
      );
    })();

    return {
      success: true,
      bookingId: booking.id,
      ref: booking.ref,
      status: "cancelled",
      refundAmountInr: preview.refundAmountInr,
      cancellationFeeInr: preview.cancellationFeeInr,
      paymentStatus,
      cancellationReason: reason || "Traveler requested cancellation",
    };
  }
}
