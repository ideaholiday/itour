import crypto from "crypto";
import logger from "../config/logger.js";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

/**
 * Fintech Service Wrapper for Razorpay Payment Gateway, Route Payouts & Refund API
 */

async function razorpayRequest(path, { method = "POST", body, headers = {} } = {}) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Razorpay credentials are not configured");
  const response = await fetch(`https://api.razorpay.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.description || `Razorpay request failed with status ${response.status}`);
  return data;
}

export async function createRazorpayOrder({ amount, currency = "INR", receipt, notes = {} }) {
  const amountInPaise = Math.round(amount * 100);
  const order = await razorpayRequest("/v1/orders", {
    body: { amount: amountInPaise, currency, receipt, notes }
  });

  return {
    success: true,
    orderId: order.id,
    keyId: RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status
  };
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const expected = Buffer.from(expectedSignature);
    const received = Buffer.from(String(signature));
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(String(signature));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function transferSupplierShareRoute({
  supplierId,
  supplierBankDetails,
  grossAmount,
  commissionRate = 15.0,
  bookingRef
}) {
  if (process.env.ENABLE_DEMO_PAYOUTS !== "true") {
    throw new Error("Supplier payout provider is not configured; payout remains scheduled");
  }
  const transferId = `trf_${Date.now()}`;
  
  // Calculate Payout Split: Supplier Share = Total Booking Amount - (Platform Commission % + GST)
  const gstOnCommission = (commissionRate * 0.18);
  const totalDeductionPercent = (commissionRate + gstOnCommission) / 100;
  const platformCommissionAmount = Math.round(grossAmount * (commissionRate / 100));
  const gstAmount = Math.round(platformCommissionAmount * 0.18);
  const netSupplierShare = grossAmount - (platformCommissionAmount + gstAmount);

  logger.info("Razorpay split transfer processed", {
    bookingRef,
    supplierId,
    transferId,
    grossAmount,
    commissionRate,
    platformCommissionAmount,
    gstAmount,
    netSupplierShare,
  });

  return {
    success: true,
    transferId,
    grossAmount,
    platformCommissionAmount,
    gstAmount,
    netSupplierShare,
    payoutStatus: "PROCESSED"
  };
}

export async function processRazorpayRefund({ paymentId, amount, reason, idempotencyKey }) {
  if (!paymentId?.startsWith("pay_demo_")) {
    const providerIdempotencyKey = `ih_${crypto.createHash("sha256")
      .update(String(idempotencyKey || `${paymentId}:${amount}`))
      .digest("hex").slice(0, 24)}`;
    const refund = await razorpayRequest(`/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
      body: { amount: Math.round(Number(amount) * 100), notes: { reason: reason || "Traveler cancellation" } },
      headers: { "X-Refund-Idempotency": providerIdempotencyKey }
    });
    return {
      success: true,
      refundId: refund.id,
      amount: Number(refund.amount) / 100,
      status: refund.status
    };
  }
  const refundId = `rfnd_${Date.now()}`;

  logger.info("Razorpay refund processed", { paymentId, refundId, amount, reason, status: "PROCESSED" });

  return {
    success: true,
    refundId,
    amount,
    status: "PROCESSED"
  };
}
