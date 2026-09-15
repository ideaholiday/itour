/**
 * Refund credit: a supplier cancellation refunds the traveler to their wallet first (ADR 019).
 *
 * What the traveler paid becomes wallet credit at once (credit_source = 'REFUND'): no expiry,
 * not capped at checkout, spent after all other credit. For 10 days they can send whatever is
 * still unspent back to the original payment method instead; after that it stays as credit.
 *
 * See docs/REFUND_CREDIT.md.
 */
import { refundCancelledBooking } from "./bookingRefundService.js";
import { recordFinanceEvent } from "./financeService.js";
import { onReferralBookingCancelled, postWalletEntry, sqlTimestamp } from "./referralService.js";

export const REFUND_CREDIT_CASH_WINDOW_DAYS = 10;

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function refundCreditError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

/**
 * Cancels a paid booking the supplier cannot run and puts what the traveler paid in their
 * wallet. The supplier is paid nothing; wallet credit the booking spent comes back too.
 */
export function creditSupplierCancellationToWallet(database, { booking, reason, notes = null, now = new Date() }) {
  const creditInr = money(booking.amount_inr);
  const cashRefundableUntil = sqlTimestamp(new Date(now.getTime() + REFUND_CREDIT_CASH_WINDOW_DAYS * 86_400_000));
  database.transaction(() => {
    const latest = database.prepare("SELECT status, payment_status FROM bookings WHERE id = ?").get(booking.id);
    if (latest?.payment_status !== "PAID" || ["cancelled", "completed"].includes(String(latest.status).toLowerCase())) {
      throw refundCreditError("Only a paid booking that has not ended can be refunded to the wallet");
    }
    database.prepare("UPDATE bookings SET status = 'cancelled', cancellation_reason = ?, payment_status = 'REFUNDED_TO_WALLET', refund_amount_inr = ?, refunded_to_wallet_inr = ? WHERE id = ?")
      .run(reason, creditInr, creditInr, booking.id);
    database.prepare("UPDATE payouts SET gross_amount = 0, commission_amount = 0, net_payout = 0, payout_status = 'CANCELLED', settlement_batch_id = NULL WHERE booking_id = ?")
      .run(booking.id);
    database.prepare("UPDATE driver_assignments SET assignment_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
    if (creditInr > 0) {
      postWalletEntry(database, {
        userId: booking.user_id,
        entryType: "SUPPLIER_CANCEL_CREDIT",
        amountInr: creditInr,
        bookingId: booking.id,
        description: `₹${creditInr} refunded to your wallet: booking ${booking.ref} was cancelled by the operator`,
        creditSource: "REFUND",
        cashRefundableUntil,
        now,
      });
    }
    recordFinanceEvent(database, {
      bookingId: booking.id, supplierId: booking.supplier_id, eventType: "REFUND_TO_WALLET", amount: creditInr,
      status: "PROCESSED", idempotencyKey: `refund-wallet:${booking.id}`,
      metadata: { reason, notes: notes || null, cashRefundableUntil },
    });
  })();
  onReferralBookingCancelled(database, booking.id, { reason: "Cancelled by supplier", now });
  return { creditInr, cashRefundableUntil };
}

/** Refund credit the traveler can still send back to the original payment method. */
export function listCashRefundableCredits(database, userId, { now = new Date() } = {}) {
  const balance = money(database.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(userId)?.wallet_balance_inr);
  let rows;
  try {
    rows = database.prepare(`
    SELECT t.booking_id, t.remaining_inr, t.cash_refundable_until, b.ref
    FROM wallet_transactions t JOIN bookings b ON b.id = t.booking_id
    WHERE t.user_id = ? AND t.entry_type = 'SUPPLIER_CANCEL_CREDIT' AND t.remaining_inr > 0 AND t.cash_refundable_until > ?
    ORDER BY t.cash_refundable_until ASC
  `).all(userId, sqlTimestamp(now));
  } catch (error) {
    // Before migration 046 nobody has refund credit.
    if (!/no such column|does not exist/i.test(error.message)) throw error;
    return [];
  }
  return rows.map((row) => ({
    bookingId: row.booking_id,
    bookingRef: row.ref,
    amountInr: Math.min(money(row.remaining_inr), balance),
    cashRefundableUntil: row.cash_refundable_until,
  })).filter((credit) => credit.amountInr > 0);
}

/**
 * Sends the unspent refund credit of one supplier-cancelled booking back to the payment method
 * that paid for it. The credit leaves the wallet first; if the gateway then fails, the refund is
 * left FAILED with the booking REFUND_INITIATED so Finance retries it, as for a traveler cancellation.
 */
export async function refundCreditToSource(database, { userId, bookingId, now = new Date() }, gateways) {
  let booking;
  let amountInr = 0;
  database.transaction(() => {
    booking = database.prepare("SELECT * FROM bookings WHERE (id = ? OR ref = ?) AND user_id = ?").get(bookingId, bookingId, userId);
    if (!booking) throw refundCreditError("Booking not found", 404);
    const credit = database.prepare("SELECT * FROM wallet_transactions WHERE booking_id = ? AND entry_type = 'SUPPLIER_CANCEL_CREDIT'").get(booking.id);
    if (!credit || booking.payment_status !== "REFUNDED_TO_WALLET") throw refundCreditError("This booking has no refund credit to send back");
    if (!credit.cash_refundable_until || credit.cash_refundable_until <= sqlTimestamp(now)) {
      throw refundCreditError(`The ${REFUND_CREDIT_CASH_WINDOW_DAYS} days to take this refund back to your payment method have passed. It stays in your wallet for any booking.`);
    }
    const balance = money(database.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(userId)?.wallet_balance_inr);
    amountInr = Math.min(money(credit.remaining_inr), balance);
    if (amountInr <= 0) throw refundCreditError("This refund credit has already been spent");
    database.prepare("UPDATE wallet_transactions SET remaining_inr = 0 WHERE id = ?").run(credit.id);
    postWalletEntry(database, {
      userId,
      entryType: "REFUND_CASHOUT",
      amountInr: -amountInr,
      bookingId: booking.id,
      description: `₹${amountInr} of refund credit sent back to your original payment method (booking ${booking.ref})`,
      now,
    });
    database.prepare("UPDATE bookings SET payment_status = 'REFUND_INITIATED', refund_amount_inr = ? WHERE id = ?").run(amountInr, booking.id);
  })();
  const refund = await refundCancelledBooking(database, booking.id, {
    reason: "Traveler asked for supplier-cancellation refund credit back to the original payment method",
    actorId: userId,
  }, gateways);
  return { bookingId: booking.id, bookingRef: booking.ref, amountInr, ...refund };
}
