import { Router } from "express";
import db from "../db.js";
import logger from "../config/logger.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { circuitOrderSchemas } from "../validators/apiSchemas.js";
import { consumeCircuitQuote, getCircuitOrder } from "../services/circuitOrderService.js";
import {
  claimCircuitPaymentOrder,
  confirmCircuitOrderPayment,
  failCircuitPaymentOrderSetup,
  saveCircuitPaymentOrder,
} from "../services/circuitPaymentService.js";
import { createRazorpayOrder, verifyRazorpaySignature } from "../services/razorpayService.js";
import { createCashfreeOrder, getCashfreeOrder, getCashfreePayments, processCashfreeRefund } from "../services/cashfreeService.js";
import { processRazorpayRefund } from "../services/razorpayService.js";
import { notifyBookingConfirmed, notifyCircuitReschedule, notifyRefundProcessed, queueNotification } from "../services/notificationService.js";
import {
  createCircuitManagementRequest,
  getCircuitManagement,
  listCircuitManagementRequests,
  previewCircuitCancellation,
  previewCircuitReschedule,
  reviewCircuitManagementRequest,
} from "../services/circuitManagementService.js";

const router = Router();

function paymentErrorResponse(res, error, fallback) {
  return res.status(error.status || 500).json({
    error: error.message || fallback,
    code: error.code || "CIRCUIT_PAYMENT_ERROR",
  });
}

function queueCircuitConfirmations(result) {
  if (!result.success || result.idempotent) return;
  for (const booking of result.bookings) {
    queueNotification(notifyBookingConfirmed(db, booking.bookingId), `Circuit booking ${booking.bookingRef} confirmation`);
  }
}

async function processParentRefund({ order, request, preview }) {
  const provider = String(order.payment_provider || "").toUpperCase();
  if (preview.refundAmount <= 0) return { refundId: null, status: "NOT_APPLICABLE" };
  if (provider === "DEMO") {
    return { refundId: `rfnd_demo_${request.id}`, status: "PROCESSED", amount: preview.refundAmount };
  }
  if (provider === "CASHFREE") {
    if (!order.payment_order_id) throw new Error("Cashfree parent order reference is missing");
    return processCashfreeRefund({
      orderId: order.payment_order_id,
      refundId: `rfnd_${request.id}`,
      amount: preview.refundAmount,
      reason: request.reason,
    });
  }
  if (provider === "RAZORPAY") {
    if (!order.payment_id) throw new Error("Razorpay parent payment reference is missing");
    return processRazorpayRefund({
      paymentId: order.payment_id,
      amount: preview.refundAmount,
      reason: request.reason,
      idempotencyKey: request.id,
    });
  }
  throw new Error("The parent payment provider does not support an automated refund");
}

router.get("/management/requests", authenticate, requireRoles("ADMIN", "STAFF"), (req, res) => {
  try {
    const requests = listCircuitManagementRequests(db, req.query);
    return res.json({ success: true, requests });
  } catch (error) {
    return paymentErrorResponse(res, error, "Failed to load circuit operations queue");
  }
});

router.post("/management/requests/:requestId/review", authenticate, requireRoles("ADMIN", "STAFF"), validateBody(circuitOrderSchemas.managementReview), async (req, res) => {
  try {
    const result = await reviewCircuitManagementRequest(db, req.params.requestId, req.body, req.user, {
      refundProcessor: processParentRefund,
    });
    const savedOrder = db.prepare("SELECT user_id FROM circuit_orders WHERE id = ?").get(result.request.orderId);
    const order = getCircuitOrder(db, result.request.orderId, savedOrder.user_id);
    if (!result.idempotent && result.request.type === "CANCELLATION" && result.request.status === "APPROVED"
      && order.management.refundReconciliationStatus === "RECONCILED") {
      const refunds = db.prepare(`
        SELECT r.id FROM refunds r JOIN bookings b ON b.id = r.booking_id
        WHERE b.circuit_order_id = ? ORDER BY r.requested_at
      `).all(result.request.orderId);
      for (const refund of refunds) {
        queueNotification(notifyRefundProcessed(db, refund.id), `Circuit refund ${refund.id} notification`);
      }
    }
    if (!result.idempotent && result.request.type === "RESCHEDULE" && result.request.status === "APPROVED") {
      queueNotification(notifyCircuitReschedule(db, result.request.orderId, "REQUESTED"), `Circuit ${order.orderRef} reschedule notification`);
    }
    return res.json({ success: true, ...result, order });
  } catch (error) {
    logger.error("Circuit management review failed", { error: error.message, code: error.code, requestId: req.params.requestId });
    return paymentErrorResponse(res, error, "Failed to review circuit request");
  }
});

router.post("/", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.create), (req, res) => {
  try {
    const idempotencyKey = String(req.body.idempotencyKey || req.headers["idempotency-key"] || "").trim();
    const order = consumeCircuitQuote(db, {
      ...req.body,
      userId: req.user.id,
      idempotencyKey,
    });
    return res.status(order.idempotent ? 200 : 201).json({ success: true, order });
  } catch (error) {
    logger.error("Circuit order creation failed", {
      error: error.message,
      code: error.code,
      quoteId: req.body?.quoteId,
      userId: req.user?.id,
    });
    return res.status(error.status || 500).json({
      error: error.message || "Failed to create circuit order",
      code: error.code || "CIRCUIT_ORDER_ERROR",
      ...(error.details ? { details: error.details } : {}),
    });
  }
});

router.post("/:id/payment-order", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.paymentOrder), async (req, res) => {
  const provider = req.body.provider.toUpperCase();
  let claimed = null;
  try {
    claimed = claimCircuitPaymentOrder(db, {
      orderId: req.params.id,
      userId: req.user.id,
      provider,
    });
    if (claimed.idempotent && claimed.paymentOrderId) {
      return res.json({
        success: true,
        idempotent: true,
        ...claimed,
        ...(provider === "RAZORPAY"
          ? { keyId: process.env.RAZORPAY_KEY_ID || "", amountInMinorUnits: Math.round(claimed.amount * 100) }
          : { environment: String(process.env.CASHFREE_ENV || "TEST").toUpperCase() }),
      });
    }

    if (process.env.DEMO_PAYMENT_ONLY !== "false") {
      failCircuitPaymentOrderSetup(db, {
        orderId: claimed.orderId,
        userId: req.user.id,
        failureCode: "LIVE_PAYMENT_DISABLED",
      });
      return res.status(403).json({
        error: "Live payments are temporarily disabled while demo payment testing is active",
        code: "LIVE_PAYMENT_DISABLED",
      });
    }

    let providerOrder;
    if (provider === "RAZORPAY") {
      providerOrder = await createRazorpayOrder({
        amount: claimed.amount,
        currency: claimed.currency,
        receipt: claimed.orderRef,
        notes: { circuitOrderId: claimed.orderId, circuitOrderRef: claimed.orderRef, platform: "Idea Holiday" },
      });
    } else {
      const externalOrderId = `ihc_${claimed.orderRef.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 45);
      providerOrder = await createCashfreeOrder({
        orderId: externalOrderId,
        amount: claimed.amount,
        currency: claimed.currency,
        customer: claimed.customer,
        returnUrl: req.body.returnUrl || `${process.env.PUBLIC_APP_URL || "http://localhost:3000"}/circuit-checkout/verify?order_id={order_id}&circuitOrderId=${encodeURIComponent(claimed.orderId)}`,
        notifyUrl: `${process.env.PUBLIC_API_URL || "http://localhost:4000"}/api/checkout/cashfree/webhook`,
        notes: { circuitOrderId: claimed.orderId, circuitOrderRef: claimed.orderRef, platform: "Idea Holiday" },
      });
    }

    const saved = saveCircuitPaymentOrder(db, {
      orderId: claimed.orderId,
      userId: req.user.id,
      provider,
      paymentOrderId: providerOrder.orderId,
      paymentSessionId: providerOrder.paymentSessionId || null,
    });
    return res.status(201).json({
      success: true,
      ...saved,
      ...(provider === "RAZORPAY"
        ? { keyId: providerOrder.keyId, amountInMinorUnits: providerOrder.amount }
        : { environment: providerOrder.environment, cfOrderId: providerOrder.cfOrderId }),
    });
  } catch (error) {
    if (claimed?.orderId && !claimed.paymentOrderId) {
      try {
        failCircuitPaymentOrderSetup(db, {
          orderId: claimed.orderId,
          userId: req.user.id,
          failureCode: "PROVIDER_ORDER_FAILED",
        });
      } catch {}
    }
    logger.error("Circuit payment order creation failed", {
      error: error.message,
      code: error.code,
      orderId: req.params.id,
      provider,
    });
    return paymentErrorResponse(res, error, "Failed to create grouped payment order");
  }
});

router.post("/:id/verify-payment", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.verifyPayment), async (req, res) => {
  try {
    const provider = req.body.provider.toUpperCase();
    const order = getCircuitOrder(db, req.params.id, req.user.id);
    if (order.payment.orderId && order.payment.orderId !== req.body.paymentOrderId) {
      return res.status(400).json({ error: "Payment order does not match this circuit order", code: "PAYMENT_ORDER_MISMATCH" });
    }

    let paymentId = req.body.paymentId || null;
    let amount = order.breakdown.totalAmount;
    let eventKey;
    if (provider === "RAZORPAY") {
      const verified = verifyRazorpaySignature({
        orderId: req.body.paymentOrderId,
        paymentId,
        signature: req.body.signature,
      });
      if (!verified) return res.status(400).json({ error: "Invalid Razorpay payment signature", code: "PAYMENT_SIGNATURE_INVALID" });
      eventKey = `razorpay:verify:${paymentId}`;
    } else {
      const payments = await getCashfreePayments(req.body.paymentOrderId);
      const successfulPayment = Array.isArray(payments)
        ? payments.find((item) => String(item.payment_status).toUpperCase() === "SUCCESS")
        : null;
      let providerOrder = null;
      if (!successfulPayment || successfulPayment.payment_amount === undefined || successfulPayment.payment_amount === null) {
        providerOrder = await getCashfreeOrder(req.body.paymentOrderId);
      }
      if (!successfulPayment && String(providerOrder?.order_status).toUpperCase() !== "PAID") {
        return res.status(409).json({ error: "Cashfree payment is not complete", code: "PAYMENT_NOT_CAPTURED" });
      }
      paymentId = String(successfulPayment?.cf_payment_id || successfulPayment?.payment_id || paymentId || `cf_${req.body.paymentOrderId}`);
      amount = Number(successfulPayment?.payment_amount ?? providerOrder?.order_amount);
      eventKey = `cashfree:verify:${paymentId}`;
    }

    const result = confirmCircuitOrderPayment(db, {
      orderId: req.params.id,
      userId: req.user.id,
      provider,
      paymentOrderId: req.body.paymentOrderId,
      paymentId,
      signature: req.body.signature || `${provider.toLowerCase()}_verified`,
      amount,
      eventKey,
    });
    queueCircuitConfirmations(result);
    return res.status(result.reviewRequired ? 202 : 200).json({
      success: result.success,
      reviewRequired: result.reviewRequired,
      idempotent: result.idempotent,
      order: result.order,
      bookings: result.bookings,
      message: result.reviewRequired
        ? "Payment was captured but needs operations review; no child booking was activated."
        : "Grouped payment verified. Every circuit booking is now awaiting supplier acceptance.",
    });
  } catch (error) {
    logger.error("Circuit payment verification failed", { error: error.message, code: error.code, orderId: req.params.id });
    return paymentErrorResponse(res, error, "Failed to verify grouped payment");
  }
});

router.post("/:id/demo-payment", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.demoPayment), (req, res) => {
  try {
    const demoPaymentEnabled = process.env.DEMO_PAYMENT_ONLY !== "false" || process.env.ENABLE_DEMO_PAYMENT !== "false";
    if (!demoPaymentEnabled) {
      return res.status(403).json({ error: "Demo payment is disabled in this environment", code: "DEMO_PAYMENT_DISABLED" });
    }
    const order = getCircuitOrder(db, req.params.id, req.user.id);
    const paymentOrderId = order.payment.orderId || `order_demo_${order.orderId}`;
    const paymentId = order.payment.paymentId || `pay_demo_${order.orderId}`;
    const result = confirmCircuitOrderPayment(db, {
      orderId: order.orderId,
      userId: req.user.id,
      provider: "DEMO",
      paymentOrderId,
      paymentId,
      signature: "demo",
      amount: order.breakdown.totalAmount,
      eventKey: `demo:${paymentId}`,
    });
    queueCircuitConfirmations(result);
    return res.status(result.reviewRequired ? 202 : 200).json({
      success: result.success,
      demo: true,
      idempotent: result.idempotent,
      order: result.order,
      bookings: result.bookings,
      paymentOrderId,
      paymentId,
      message: result.reviewRequired
        ? "Demo payment reached an expired or invalid circuit and was sent for review; no child booking was activated."
        : "Demo grouped payment approved. Every circuit booking is awaiting supplier acceptance.",
    });
  } catch (error) {
    logger.error("Circuit demo payment failed", { error: error.message, code: error.code, orderId: req.params.id });
    return paymentErrorResponse(res, error, "Failed to complete demo grouped payment");
  }
});

router.get("/:id/management", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), (req, res) => {
  try {
    const management = getCircuitManagement(db, req.params.id, req.user);
    const owner = db.prepare("SELECT user_id FROM circuit_orders WHERE id = ? OR order_ref = ?").get(req.params.id, req.params.id);
    const order = getCircuitOrder(db, req.params.id, owner.user_id);
    return res.json({ success: true, order, management });
  } catch (error) {
    return paymentErrorResponse(res, error, "Failed to load circuit management");
  }
});

router.post("/:id/cancellation-preview", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.cancellationPreview), (req, res) => {
  try {
    return res.json({ success: true, preview: previewCircuitCancellation(db, req.params.id, req.user) });
  } catch (error) {
    return paymentErrorResponse(res, error, "Failed to calculate grouped cancellation");
  }
});

router.post("/:id/reschedule-preview", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.reschedulePreview), (req, res) => {
  try {
    return res.json({ success: true, preview: previewCircuitReschedule(db, req.params.id, req.user, req.body) });
  } catch (error) {
    return paymentErrorResponse(res, error, "Failed to check grouped reschedule availability");
  }
});

router.post("/:id/management-requests", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(circuitOrderSchemas.managementRequest), (req, res) => {
  try {
    const result = createCircuitManagementRequest(db, req.params.id, req.body, req.user);
    return res.status(result.idempotent ? 200 : 201).json({ success: true, ...result });
  } catch (error) {
    logger.error("Circuit management request failed", { error: error.message, code: error.code, orderId: req.params.id });
    return paymentErrorResponse(res, error, "Failed to submit circuit management request");
  }
});

router.get("/:id", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), (req, res) => {
  try {
    const order = getCircuitOrder(db, req.params.id, req.user.id);
    return res.json({ success: true, order });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load circuit order",
      code: error.code || "CIRCUIT_ORDER_ERROR",
    });
  }
});

export default router;
