import { processCashfreeRefund } from "./cashfreeService.js";
import { processRazorpayRefund } from "./razorpayService.js";
import { demoRefundFallbackEnabled } from "./checkoutModeService.js";
import { createRefundRecord, failRefund, finalizeRefund } from "./financeService.js";

const defaultGateways = { cashfree: processCashfreeRefund, razorpay: processRazorpayRefund };
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Sends one refund to the gateway that took the payment. The refund row id is the
 * provider's idempotency key, so retrying a failed refund cannot pay out twice.
 */
export async function sendRefundToGateway(booking, { refund, amount, reason }, gateways = defaultGateways) {
  if (booking.payment_method === "CASHFREE" || booking.cashfree_order_id) {
    return gateways.cashfree({ orderId: booking.cashfree_order_id || booking.ref, refundId: refund.id, amount, reason });
  }
  if (booking.razorpay_payment_id) {
    return gateways.razorpay({ paymentId: booking.razorpay_payment_id, amount, reason, idempotencyKey: refund.id });
  }
  if (booking.payment_method === "DEMO" || demoRefundFallbackEnabled()) {
    return { refundId: `rfnd_demo_${Date.now()}`, status: "PROCESSED" };
  }
  throw Object.assign(new Error("Payment reference is missing; refund requires manual provider review"), { status: 409 });
}

/** The refund a cancelled booking still owes: the amount fixed when the traveler cancelled. */
export function pendingRefundQuote(booking) {
  const totalAmount = money(booking.amount_inr);
  const refundAmount = money(booking.refund_amount_inr);
  return {
    bookingId: booking.id,
    bookingRef: booking.ref,
    totalAmount,
    refundAmount,
    refundPercentage: totalAmount ? Math.round(refundAmount / totalAmount * 100) : 0,
    cancellationFee: money(totalAmount - refundAmount),
    policyTier: "Refund owed from the traveler's cancellation",
  };
}

/**
 * Pays out the refund a self-service cancellation left as REFUND_INITIATED.
 * Returns null when nothing is owed. A gateway failure marks the refund FAILED and
 * leaves the booking REFUND_INITIATED, so Finance can retry it.
 */
export async function refundCancelledBooking(database, bookingId, { reason, actorId }, gateways = defaultGateways) {
  const booking = database.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  if (!booking || booking.payment_status !== "REFUND_INITIATED" || !(Number(booking.refund_amount_inr) > 0)) return null;
  const quote = pendingRefundQuote(booking);
  const refund = createRefundRecord(database, { booking, quote, reason, actorId });
  let providerResult;
  try {
    providerResult = await sendRefundToGateway(booking, { refund, amount: quote.refundAmount, reason }, gateways);
  } catch (error) {
    failRefund(database, refund.id, error.message);
    return { status: "FAILED", refundId: refund.id, paymentStatus: booking.payment_status, error: error.message };
  }
  const allocation = finalizeRefund(database, { booking, refund, providerResult });
  return { status: "PROCESSED", refundId: refund.id, gatewayRefundId: providerResult?.refundId || null, paymentStatus: allocation.paymentStatus };
}
