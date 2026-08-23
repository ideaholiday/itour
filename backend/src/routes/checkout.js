import express from "express";
import db from "../db.js";
import {
  createRazorpayOrder,
  processRazorpayRefund,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature
} from "../services/razorpayService.js";
import {
  createCashfreeOrder,
  getCashfreeOrder,
  getCashfreePayments,
  processCashfreeRefund,
  verifyCashfreeWebhookSignature
} from "../services/cashfreeService.js";
import { activatePickupOtp } from "../services/bookingService.js";
import { beginSupplierAcceptance } from "../services/assignmentSlaService.js";
import { notifyBookingConfirmed, notifyRefundProcessed, queueNotification } from "../services/notificationService.js";
import { authenticate, optionalAuthMiddleware, requireBookingOwner, requireRoles } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { validateBody } from "../middleware/validation.js";
import { checkoutSchemas } from "../validators/apiSchemas.js";
import {
  calculateRefundQuote,
  createRefundRecord,
  failRefund,
  finalizeRefund,
  recordPaymentCapture,
} from "../services/financeService.js";

const router = express.Router();
router.use(optionalAuthMiddleware);

function canAccessBooking(req, booking) {
  const actor = req.user;
  if (!actor) return false;
  const role = String(actor.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return true;
  if (role !== "TRAVELER") return false;
  return actor.id === booking.user_id || (actor.email && actor.email.toLowerCase() === String(booking.traveler_email || "").toLowerCase());
}

function confirmPaidBooking(booking, { method, orderId, paymentId, signature, cashfreeOrderId, cashfreePaymentId }) {
  if (booking.payment_status === "PAID") {
    return { otp: null, alreadyPaid: true, supplierResponseDeadline: booking.supplier_response_deadline || null };
  }
  const pickupOtp = activatePickupOtp(booking);
  const usesRazorpayReference = ["RAZORPAY", "DEMO"].includes(method);
  let supplierResponseDeadline = null;
  db.transaction(() => {
    db.prepare(
      `UPDATE bookings SET payment_method = ?, payment_status = 'PAID', status = 'confirmed',
       razorpay_order_id = ?, razorpay_payment_id = ?, razorpay_signature = ?,
       cashfree_order_id = COALESCE(?, cashfree_order_id), cashfree_payment_id = COALESCE(?, cashfree_payment_id),
       otp_code = NULL, otp_hash = ?, otp_encrypted = ?, otp_expires_at = ?, otp_attempts = 0, otp_verified_at = NULL
       WHERE id = ? AND payment_status = 'PENDING'`
    ).run(
      method,
      usesRazorpayReference ? orderId : booking.razorpay_order_id || null,
      usesRazorpayReference ? paymentId : booking.razorpay_payment_id || null,
      usesRazorpayReference ? signature : booking.razorpay_signature || null,
      method === "CASHFREE" ? (cashfreeOrderId || orderId) : null,
      method === "CASHFREE" ? (cashfreePaymentId || paymentId) : null,
      pickupOtp.otpHash,
      pickupOtp.otpEncrypted,
      pickupOtp.otpExpiresAt,
      booking.id
    );
    db.prepare("UPDATE payouts SET payout_status = 'PAYMENT_HELD' WHERE booking_id = ? AND payout_status = 'PENDING_PAYMENT'").run(booking.id);
    supplierResponseDeadline = beginSupplierAcceptance(db, booking.id);
  })();
  recordPaymentCapture(db, { ...booking, payment_method: method }, paymentId || orderId);
  return { ...pickupOtp, supplierResponseDeadline };
}

// POST /api/checkout/create-order - Initialize Razorpay Order
router.post("/create-order", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.booking), async (req, res) => {
  try {
    if (process.env.DEMO_PAYMENT_ONLY !== "false") {
      return res.status(403).json({ error: "Live payments are temporarily disabled while demo payment testing is active" });
    }

    const { bookingId, bookingRef } = req.body;
    const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?").get(bookingId || bookingRef, bookingRef || bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    if (booking.payment_status === "PAID") return res.status(409).json({ error: "Booking is already paid" });
    if (booking.status !== "pending_payment") return res.status(409).json({ error: "Booking is not awaiting payment" });
    if (booking.razorpay_order_id) {
      return res.json({ success: true, idempotent: true, orderId: booking.razorpay_order_id, keyId: process.env.RAZORPAY_KEY_ID, amount: Number(booking.amount_inr) * 100, currency: "INR", receipt: booking.ref, bookingRef: booking.ref });
    }
    const amount = Number(booking.amount_inr);
    const receipt = booking.ref;

    const orderData = await createRazorpayOrder({
      amount,
      currency: "INR",
      receipt,
      notes: { travelerName: booking.traveler_name, bookingId: booking.id, platform: "Idea Holiday" }
    });
    db.prepare("UPDATE bookings SET razorpay_order_id = ? WHERE id = ?").run(orderData.orderId, booking.id);
    res.json({ ...orderData, bookingRef: booking.ref });
  } catch (err) {
    logger.error("Razorpay order creation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// POST /api/checkout/demo-payment - Explicit sandbox checkout for end-to-end testing
router.post("/demo-payment", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.booking), async (req, res) => {
  try {
    const demoPaymentEnabled = process.env.DEMO_PAYMENT_ONLY !== "false" || process.env.ENABLE_DEMO_PAYMENT !== "false";
    if (!demoPaymentEnabled) {
      return res.status(403).json({ error: "Demo payment is disabled in this environment" });
    }

    const { bookingId, bookingRef } = req.body;
    const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?").get(bookingId || bookingRef, bookingRef || bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    if (!booking.pickup_location?.trim()) return res.status(400).json({ error: "Pickup location is required before payment" });

    if (booking.payment_status === "PAID") {
      return res.json({ success: true, demo: true, idempotent: true, bookingRef: booking.ref, paymentId: booking.razorpay_payment_id, orderId: booking.razorpay_order_id, message: "Demo booking was already confirmed." });
    }
    if (booking.status !== "pending_payment") return res.status(409).json({ error: "Booking is not awaiting payment" });
    const paymentId = `pay_demo_${Date.now()}`;
    const orderId = `order_demo_${Date.now()}`;
    const confirmation = confirmPaidBooking(booking, { method: "DEMO", orderId, paymentId, signature: "demo" });

    // Provider failures are audited but never roll back a confirmed payment.
    queueNotification(notifyBookingConfirmed(db, booking.id), "Booking confirmation notification");

    res.json({
      success: true,
      demo: true,
      bookingRef: booking.ref,
      paymentId,
      orderId,
      supplierResponseDeadline: confirmation.supplierResponseDeadline,
      message: "Demo payment approved. The assigned supplier now has 10 minutes to accept the booking."
    });
  } catch (err) {
    logger.error("Demo payment failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to complete demo payment" });
  }
});

// POST /api/checkout/verify - Verify Razorpay HMAC signature & confirm booking
router.post("/verify", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.razorpayVerify), async (req, res) => {
  try {
    if (process.env.DEMO_PAYMENT_ONLY !== "false") {
      return res.status(403).json({ error: "Live payments are temporarily disabled while demo payment testing is active" });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      bookingRef
    } = req.body;

    const isValid = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });

    if (!isValid) {
      return res.status(400).json({ error: "Invalid Razorpay payment signature verification failed" });
    }

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId || bookingRef, bookingRef || bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    if (booking.payment_status === "PAID") return res.json({ success: true, idempotent: true, bookingRef: booking.ref, paymentId: booking.razorpay_payment_id, orderId: booking.razorpay_order_id, message: "Payment was already verified." });
    if (!booking.razorpay_order_id || booking.razorpay_order_id !== razorpay_order_id) return res.status(400).json({ error: "Payment order does not match this booking" });

    const paymentId = razorpay_payment_id || `pay_${Date.now()}`;
    const orderId = razorpay_order_id || `order_${Date.now()}`;

    const confirmation = confirmPaidBooking(booking, { method: "RAZORPAY", orderId, paymentId, signature: razorpay_signature });
    queueNotification(notifyBookingConfirmed(db, booking.id), "Booking confirmation notification");

    res.json({
      success: true,
      bookingRef: booking?.ref || bookingRef,
      paymentId,
      orderId,
      supplierResponseDeadline: confirmation.supplierResponseDeadline,
      message: "Payment verified. The assigned supplier is now confirming availability."
    });
  } catch (err) {
    logger.error("Razorpay payment verification failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

// POST /api/checkout/cashfree/create-order - Initialize Cashfree Payment Order
router.post("/cashfree/create-order", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.booking), async (req, res) => {
  try {
    const { bookingId, bookingRef, returnUrl } = req.body;
    const booking = db
      .prepare(
        "SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?"
      )
      .get(bookingId || bookingRef, bookingRef || bookingId);

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    if (booking.payment_status === "PAID") return res.status(409).json({ error: "Booking is already paid" });
    if (booking.status !== "pending_payment") return res.status(409).json({ error: "Booking is not awaiting payment" });

    // If order already created and active, return existing payment session
    if (booking.cashfree_order_id && booking.payment_session_id) {
      return res.json({
        success: true,
        idempotent: true,
        orderId: booking.cashfree_order_id,
        paymentSessionId: booking.payment_session_id,
        bookingRef: booking.ref,
        amount: Number(booking.amount_inr),
        currency: "INR",
      });
    }

    const orderId = `ih_${booking.ref.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now().toString().slice(-6)}`;
    const amount = Number(booking.amount_inr);

    const orderData = await createCashfreeOrder({
      orderId,
      amount,
      currency: "INR",
      customer: {
        id: booking.user_id || `cust_${booking.id}`,
        name: booking.traveler_name || "Traveler",
        email: booking.traveler_email || "traveler@ideaholiday.in",
        phone: booking.traveler_phone || "9999999999",
      },
      returnUrl: returnUrl || `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/checkout/verify?order_id={order_id}&bookingRef=${encodeURIComponent(booking.ref)}`,
      notes: {
        bookingId: booking.id,
        bookingRef: booking.ref,
        travelerName: booking.traveler_name,
        platform: "Idea Holiday",
      },
    });

    db.prepare(
      "UPDATE bookings SET cashfree_order_id = ?, payment_session_id = ? WHERE id = ?"
    ).run(orderData.orderId, orderData.paymentSessionId, booking.id);

    res.json({
      success: true,
      orderId: orderData.orderId,
      cfOrderId: orderData.cfOrderId,
      paymentSessionId: orderData.paymentSessionId,
      bookingRef: booking.ref,
      amount,
      currency: "INR",
      environment: orderData.environment,
    });
  } catch (err) {
    logger.error("Cashfree order creation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to create Cashfree payment order" });
  }
});

// POST /api/checkout/cashfree/verify - Verify Cashfree payment status & confirm booking
router.post("/cashfree/verify", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.cashfreeVerify), async (req, res) => {
  try {
    const { orderId, bookingId, bookingRef } = req.body;
    const targetOrderId = orderId || req.query?.order_id;

    const booking = db
      .prepare("SELECT * FROM bookings WHERE cashfree_order_id = ? OR id = ? OR ref = ?")
      .get(targetOrderId, bookingId || bookingRef, bookingRef || bookingId);

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });

    if (booking.payment_status === "PAID") {
      return res.json({
        success: true,
        idempotent: true,
        bookingRef: booking.ref,
        paymentId: booking.cashfree_payment_id,
        orderId: booking.cashfree_order_id,
        message: "Payment was already verified.",
      });
    }

    const orderToQuery = targetOrderId || booking.cashfree_order_id;
    if (!orderToQuery) {
      return res.status(400).json({ error: "Cashfree order ID is missing" });
    }

    // Query Cashfree for payment status
    let isPaid = false;
    let paymentId = `cf_pay_${Date.now()}`;

    try {
      const payments = await getCashfreePayments(orderToQuery);
      const successfulPayment = Array.isArray(payments)
        ? payments.find((p) => p.payment_status === "SUCCESS")
        : null;

      if (successfulPayment) {
        isPaid = true;
        paymentId = String(successfulPayment.cf_payment_id || successfulPayment.payment_id || paymentId);
      } else {
        const cfOrder = await getCashfreeOrder(orderToQuery);
        if (cfOrder.order_status === "PAID") {
          isPaid = true;
        }
      }
    } catch (cfErr) {
      logger.warn("Direct Cashfree verification query failed", { requestId: req.requestId, error: cfErr });
      // If error from Cashfree sandbox during local tests, check order status
      const cfOrder = await getCashfreeOrder(orderToQuery).catch(() => null);
      if (cfOrder && cfOrder.order_status === "PAID") {
        isPaid = true;
      }
    }

    if (!isPaid) {
      return res.status(400).json({
        error: "Payment has not been completed or is still pending confirmation with Cashfree",
      });
    }

    const confirmation = confirmPaidBooking(booking, {
      method: "CASHFREE",
      orderId: orderToQuery,
      paymentId,
      cashfreeOrderId: orderToQuery,
      cashfreePaymentId: paymentId,
      signature: "cashfree_verified",
    });

    queueNotification(notifyBookingConfirmed(db, booking.id), "Booking confirmation notification");

    res.json({
      success: true,
      bookingRef: booking.ref,
      paymentId,
      orderId: orderToQuery,
      supplierResponseDeadline: confirmation.supplierResponseDeadline,
      message: "Cashfree payment verified. The assigned supplier is now confirming availability.",
    });
  } catch (err) {
    logger.error("Cashfree payment verification failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to verify Cashfree payment" });
  }
});

// POST /api/checkout/cashfree/webhook - Webhook for Cashfree Payment Gateway events
router.post("/cashfree/webhook", (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (!verifyCashfreeWebhookSignature(req.rawBody, signature, timestamp)) {
      return res.status(401).json({ error: "Invalid Cashfree webhook signature" });
    }

    const payload = req.body || {};
    const eventType = payload.type || payload.event || "UNKNOWN";
    const data = payload.data || {};
    const order = data.order || {};
    const payment = data.payment || {};
    const orderId = order.order_id || data.order_id;
    const paymentId = String(payment.cf_payment_id || payment.payment_id || data.payment_id || `cf_wh_${Date.now()}`);

    const eventId = String(payload.event_time ? `cf_${payload.event_time}_${orderId}` : `cf_${orderId}_${eventType}`);
    if (db.prepare("SELECT id FROM payment_events WHERE id = ?").get(eventId)) {
      return res.json({ status: "ok", idempotent: true });
    }

    if (["PAYMENT_SUCCESS_WEBHOOK", "ORDER_PAID_WEBHOOK", "ORDER_PAID"].includes(eventType) || payment.payment_status === "SUCCESS") {
      if (orderId) {
        const booking = db.prepare("SELECT * FROM bookings WHERE cashfree_order_id = ?").get(orderId);
        if (booking) {
          confirmPaidBooking(booking, {
            method: "CASHFREE",
            orderId,
            paymentId,
            cashfreeOrderId: orderId,
            cashfreePaymentId: paymentId,
            signature: "cashfree_webhook_verified",
          });
        }
        db.prepare("INSERT INTO payment_events (id, event_type, payment_id, booking_id) VALUES (?, ?, ?, ?)").run(
          eventId,
          eventType,
          paymentId,
          booking?.id || null
        );
      }
    } else {
      db.prepare("INSERT INTO payment_events (id, event_type, payment_id, booking_id) VALUES (?, ?, NULL, NULL)").run(
        eventId,
        eventType
      );
    }

    res.json({ status: "ok" });
  } catch (err) {
    logger.error("Cashfree webhook processing failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Cashfree webhook processing error" });
  }
});

// POST /api/checkout/webhook - Webhook for payment.captured
router.post("/webhook", (req, res) => {
  try {
    const event = req.body;
    const signature = req.headers["x-razorpay-signature"];
    if (!verifyRazorpayWebhookSignature(req.rawBody, signature)) return res.status(401).json({ error: "Invalid webhook signature" });
    const eventId = String(event.id || `${event.event}:${event.payload?.payment?.entity?.id || "unknown"}`);
    if (db.prepare("SELECT id FROM payment_events WHERE id = ?").get(eventId)) return res.json({ status: "ok", idempotent: true });

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (payment) {
        const booking = db.prepare("SELECT * FROM bookings WHERE razorpay_order_id = ?").get(payment.order_id);
        if (booking) confirmPaidBooking(booking, { method: "RAZORPAY", orderId: payment.order_id, paymentId: payment.id, signature: "webhook_verified" });
        db.prepare("INSERT INTO payment_events (id, event_type, payment_id, booking_id) VALUES (?, ?, ?, ?)").run(eventId, event.event, payment.id, booking?.id || null);
      }
    } else {
      db.prepare("INSERT INTO payment_events (id, event_type, payment_id, booking_id) VALUES (?, ?, NULL, NULL)").run(eventId, event.event || "unknown");
    }

    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Webhook error" });
  }
});

// POST /api/checkout/calculate-refund - Automated Refund Policy Rules Evaluator
router.post("/calculate-refund", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.refund), (req, res) => {
  try {
    const { bookingId, bookingRef, travelDate, pickupTime } = req.body;

    const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?").get(bookingId || bookingRef, bookingRef || bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have access to this booking" });

    const quote = calculateRefundQuote(db, { ...booking, activity_date: travelDate || booking.activity_date, pickup_time: pickupTime || booking.pickup_time });

    res.json({
      success: true,
      ...quote,
      rulesSummary: { policy: quote.cancellationPolicy, note: "The cancellation policy accepted at checkout is applied automatically." }
    });
  } catch (err) {
    logger.error("Refund calculation failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to calculate refund" });
  }
});

// POST /api/checkout/cancel-booking - Traveler automated cancellation & policy-backed Cashfree refund
router.post("/cancel-booking", authenticate, requireBookingOwner(), validateBody(checkoutSchemas.cancel), async (req, res) => {
  try {
    const { bookingId, bookingRef, reason, notes } = req.body;
    const booking = db.prepare("SELECT b.*, p.cancellation_policy, p.title as product_title FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?").get(bookingId || bookingRef, bookingRef || bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "You do not have permission to cancel this booking" });
    if (booking.status === "cancelled") return res.status(409).json({ error: "Booking is already cancelled" });
    if (["completed", "in_progress"].includes(booking.status)) return res.status(409).json({ error: `Cannot cancel a trip that is ${booking.status}` });

    const quote = calculateRefundQuote(db, booking);
    const cancellationReason = reason || "Customer initiated cancellation";
    const actorId = req.user?.id || booking.user_id || "traveler";

    let refund = null;
    let providerResult = { refundId: "rfnd_none", status: "NO_REFUND_APPLICABLE" };

    if (booking.payment_status === "PAID") {
      refund = createRefundRecord(db, {
        booking,
        quote,
        reason: cancellationReason,
        actorId,
      });

      if (quote.refundAmount > 0) {
        try {
          if (booking.payment_method === "CASHFREE" || booking.cashfree_order_id) {
            const orderId = booking.cashfree_order_id || booking.ref;
            providerResult = await processCashfreeRefund({
              orderId,
              refundId: `rfnd_${booking.ref}_${Date.now()}`,
              amount: quote.refundAmount,
              reason: cancellationReason,
            });
          } else if (booking.razorpay_payment_id) {
            providerResult = await processRazorpayRefund({
              paymentId: booking.razorpay_payment_id,
              amount: quote.refundAmount,
              reason: cancellationReason,
            });
          } else if (booking.payment_method === "DEMO" || process.env.ENABLE_DEMO_PAYMENT === "true") {
            providerResult = { refundId: `rfnd_demo_${Date.now()}`, status: "PROCESSED" };
          }
        } catch (gatewayErr) {
          logger.error("Payment gateway refund failed", { requestId: req.requestId, error: gatewayErr });
          failRefund(db, refund.id, gatewayErr.message);
          providerResult = { refundId: "rfnd_manual_review", status: "PENDING_MANUAL_REVIEW", error: gatewayErr.message };
        }
      }

      finalizeRefund(db, { booking, refund, providerResult });
      
      if (refund?.id) {
        queueNotification(notifyRefundProcessed(db, refund.id), "Customer cancellation refund notification");
      }
    } else {
      // Unpaid or pending booking: cancel without gateway refund
      db.transaction(() => {
        db.prepare(`
          UPDATE bookings 
          SET status = 'cancelled', 
              cancellation_reason = ?, 
              updated_at = datetime('now') 
          WHERE id = ?
        `).run(cancellationReason, booking.id);

        db.prepare(`
          UPDATE payouts 
          SET payout_status = 'CANCELLED' 
          WHERE booking_id = ?
        `).run(booking.id);
      })();
    }

    res.json({
      success: true,
      bookingRef: booking.ref,
      quote,
      gatewayRefundId: providerResult.refundId,
      message: quote.refundAmount > 0
        ? `Booking ${booking.ref} cancelled. Refund of ₹${quote.refundAmount} (${quote.refundPercentage}%) initiated via Cashfree.`
        : `Booking ${booking.ref} cancelled per policy (${quote.policyTier}).`,
    });
  } catch (err) {
    logger.error("Booking cancellation failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to cancel booking" });
  }
});

// Legacy direct payout endpoint is intentionally closed: payouts now require a
// settlement batch, provider reference, and reconciliation audit.
router.post("/trigger-split-payout", authenticate, requireRoles("ADMIN"), validateBody(checkoutSchemas.booking), (req, res) => {
  res.status(410).json({ error: "Use the Admin Finance settlement workflow to create, process, and reconcile supplier payouts" });
});

export default router;
