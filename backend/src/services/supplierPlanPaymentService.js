/**
 * Suppliers pay for their required subscription (ADR 017, plan Phase 5) and
 * for profile plans (ADR 008): VERIFIED (the yearly check), SPOTLIGHT (one
 * product on the profile) and VERIFIED_PLUS (both).
 *
 * The server prices every payment: the admin-set price (the subscription is not
 * for sale while unset), less a coupon for that kind of purchase, plus 18% GST
 * under SAC 998559.
 * A subscription becomes ACTIVE only after the server has confirmed the payment
 * with Cashfree (verify call or signed webhook), never from a browser redirect.
 * A 100% coupon activates it with no payment.
 *
 * See docs/SUPPLIER_PLANS.md §5 and migrations/043_supplier_plan_payments.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";
import { createCashfreeOrder, getCashfreeOrder, getCashfreePayments, processCashfreeRefund } from "./cashfreeService.js";
import { sendRecipientChannels } from "./notificationService.js";
import { getSettings } from "./programSettingsService.js";
import { redeemCoupon, validatePromoCode } from "./promoService.js";
import { sqlTimestamp } from "./supplierSubscriptionService.js";

export const SUBSCRIPTION_GST_RATE = 0.18;
export const SUBSCRIPTION_SAC_CODE = "998559";

const defaultGateway = { createOrder: createCashfreeOrder, getPayments: getCashfreePayments, getOrder: getCashfreeOrder, refund: processCashfreeRefund };

export const PLAN_CODES = ["MARKETPLACE", "VERIFIED", "SPOTLIGHT", "VERIFIED_PLUS"];
const PLAN_LABELS = {
  MARKETPLACE: "Idea Holiday supplier marketplace subscription",
  VERIFIED: "Idea Holiday Verified business check (1 year)",
  SPOTLIGHT: "Idea Holiday profile Spotlight",
  VERIFIED_PLUS: "Idea Holiday Verified Plus: business check (1 year) and one Spotlight",
};
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function paymentError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** The spotlight product a plan is bought for: the supplier's own, published, not already spotlighted. */
function assertSpotlightProduct(database, supplierId, productId) {
  if (!productId) throw paymentError("Choose the listing to put on your profile", 400, "PRODUCT_REQUIRED");
  const product = database.prepare("SELECT id, supplier_id, title, status FROM products WHERE id = ?").get(productId);
  if (!product || product.supplier_id !== supplierId) throw paymentError("That listing is not yours", 404, "PRODUCT_NOT_FOUND");
  if (String(product.status || "").toUpperCase() !== "PUBLISHED") throw paymentError("Publish the listing before putting it on your profile", 409, "PRODUCT_NOT_PUBLISHED");
  const taken = database.prepare("SELECT 1 FROM product_spotlights WHERE product_id = ? AND status = 'ACTIVE'").get(productId);
  if (taken) throw paymentError("That listing is already on your profile", 409, "ALREADY_SPOTLIGHTED");
  return product;
}

/** Price, coverage period and coupon audience for one plan, after the plan's own checks. */
function planTerms(database, supplier, planCode, productId) {
  if (planCode === "MARKETPLACE") {
    if (Number(supplier.subscription_exempt) === 1) throw paymentError("Suppliers registered before 14 September 2026 don't need a subscription", 409, "NOT_REQUIRED");
    const { priceInr, billingPeriodMonths } = getSettings(database, "supplier_subscriptions");
    if (!priceInr) throw paymentError("The subscription isn't on sale yet. You're covered by the launch offer for now.", 409, "NOT_FOR_SALE");
    return { priceInr, periodMonths: billingPeriodMonths, couponAudience: "SUPPLIER_SUBSCRIPTION", productId: null };
  }
  const prices = getSettings(database, "supplier_plans");
  if (planCode === "VERIFIED" || planCode === "VERIFIED_PLUS") {
    if (String(supplier.kyb_status || "").toUpperCase() !== "APPROVED") throw paymentError("Your KYB must be approved before the Verified check", 409, "KYB_REQUIRED");
    const pending = database.prepare("SELECT 1 FROM supplier_verifications WHERE supplier_id = ? AND status = 'PENDING_CHECKS'").get(supplier.id);
    if (pending) throw paymentError("Your Verified check is already with our team", 409, "CHECK_PENDING");
  }
  if (planCode === "SPOTLIGHT" || planCode === "VERIFIED_PLUS") assertSpotlightProduct(database, supplier.id, productId);
  const priceInr = { VERIFIED: prices.verifiedPriceInr, SPOTLIGHT: prices.spotlightPriceInr, VERIFIED_PLUS: prices.verifiedPlusPriceInr }[planCode];
  // Share of a Plus payment that is the check: the part above the Spotlight price.
  const checkShare = planCode === "VERIFIED" ? 1 : planCode === "VERIFIED_PLUS" ? Math.max(0, (prices.verifiedPlusPriceInr - prices.spotlightPriceInr) / prices.verifiedPlusPriceInr) : 0;
  return { priceInr, periodMonths: planCode === "SPOTLIGHT" ? 0 : 12, couponAudience: "SUPPLIER_PLANS", productId: planCode === "VERIFIED" ? null : productId, checkShare };
}

/** What a supplier would pay now for the subscription. Throws when there is nothing to buy. */
export function quoteSubscriptionPayment(database, supplierId, { couponCode = null } = {}) {
  return quotePlanPayment(database, supplierId, { planCode: "MARKETPLACE", couponCode });
}

/** What a supplier would pay now for a plan. */
export function quotePlanPayment(database, supplierId, { planCode = "MARKETPLACE", productId = null, couponCode = null } = {}) {
  const code = String(planCode || "").toUpperCase();
  if (!PLAN_CODES.includes(code)) throw paymentError("Unknown plan", 400, "UNKNOWN_PLAN");
  const supplier = database.prepare("SELECT id, subscription_exempt, kyb_status FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw paymentError("Supplier not found", 404);
  const terms = planTerms(database, supplier, code, productId);

  const base = money(terms.priceInr);
  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const promo = validatePromoCode(database, { code: couponCode, amountInr: base, userId: supplierId, audience: terms.couponAudience });
    discount = Math.min(base, money(promo.discountAmount));
    coupon = { code: promo.code, description: promo.description };
  }
  const taxable = money(base - discount);
  const gst = money(taxable * SUBSCRIPTION_GST_RATE);
  const total = money(taxable + gst);
  return {
    checkRefundableInr: terms.checkShare ? money(total * terms.checkShare) : null,
    supplierId,
    planCode: code,
    productId: terms.productId,
    periodMonths: terms.periodMonths,
    baseInr: base,
    coupon,
    discountInr: money(discount),
    taxableInr: taxable,
    gstRate: SUBSCRIPTION_GST_RATE,
    gstInr: gst,
    totalInr: money(taxable + gst),
    sacCode: SUBSCRIPTION_SAC_CODE,
  };
}

/** Indian financial year label for an invoice number, e.g. 2026-27. */
function financialYear(date) {
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

function nextInvoiceNumber(database, now) {
  const prefix = `IHS/${financialYear(now)}/`;
  const count = Number(database.prepare("SELECT COUNT(*) AS count FROM supplier_plan_payments WHERE invoice_number LIKE ?").get(`${prefix}%`)?.count) || 0;
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/**
 * Marks a payment PAID (or FREE) and creates the subscription it bought, in one
 * transaction. Paid cover starts when the supplier's current dated cover ends,
 * or now; an open-ended launch waiver does not delay it. Safe to repeat.
 */
function activate(database, payment, { status, cashfreePaymentId = null, now = new Date() }) {
  let result = null;
  database.transaction(() => {
    const current = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(payment.id);
    if (current.status === "PAID" || current.status === "FREE") {
      result = current;
      return;
    }
    let subscriptionId = null;
    if (payment.plan_code === "MARKETPLACE") {
      const latestEnd = database.prepare(`
        SELECT MAX(ends_at) AS ends_at FROM supplier_subscriptions
        WHERE supplier_id = ? AND status IN ('ACTIVE', 'WAIVED') AND source IN ('PURCHASE', 'COUPON', 'WAIVER') AND ends_at IS NOT NULL AND ends_at > ?
      `).get(payment.supplier_id, sqlTimestamp(now))?.ends_at;
      const starts = latestEnd ? new Date(`${latestEnd.replace(" ", "T")}Z`) : now;
      const ends = addMonths(starts, Number(payment.period_months));
      subscriptionId = `ssub_${nanoid(12)}`;
      database.prepare(`
        INSERT INTO supplier_subscriptions (id, supplier_id, plan_code, status, source, starts_at, ends_at, reason)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
      `).run(subscriptionId, payment.supplier_id, payment.plan_code, status === "FREE" ? "COUPON" : "PURCHASE",
        sqlTimestamp(starts), sqlTimestamp(ends), status === "FREE" ? `Coupon ${payment.coupon_code}` : `Payment ${payment.id}`);
    }
    if (payment.plan_code === "VERIFIED" || payment.plan_code === "VERIFIED_PLUS") {
      // Payment buys the check. The badge appears only when an admin passes it (ADR 008).
      database.prepare(`
        INSERT INTO supplier_verifications (id, supplier_id, status, checks, source, purchase_id)
        VALUES (?, ?, 'PENDING_CHECKS', '[]', 'PURCHASE', ?)
      `).run(`sver_${nanoid(12)}`, payment.supplier_id, payment.id);
    }
    if ((payment.plan_code === "SPOTLIGHT" || payment.plan_code === "VERIFIED_PLUS") && payment.product_id) {
      database.prepare("INSERT INTO product_spotlights (id, supplier_id, product_id, payment_id) VALUES (?, ?, ?, ?)")
        .run(`spot_${nanoid(12)}`, payment.supplier_id, payment.product_id, payment.id);
    }
    if (payment.coupon_code) {
      // coupon_redemptions.booking_id holds the plan payment id for supplier coupons.
      redeemCoupon(database, { code: payment.coupon_code, bookingId: payment.id, userId: payment.supplier_id, discountInr: payment.discount_inr });
    }
    database.prepare(`
      UPDATE supplier_plan_payments SET status = ?, cashfree_payment_id = COALESCE(?, cashfree_payment_id), subscription_id = ?, invoice_number = ?, paid_at = ?
      WHERE id = ?
    `).run(status, cashfreePaymentId, subscriptionId, nextInvoiceNumber(database, now), sqlTimestamp(now), payment.id);
    result = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(payment.id);
  })();
  logger.info("Supplier subscription activated", { paymentId: payment.id, supplierId: payment.supplier_id, status });
  return result;
}

/**
 * Starts a payment. Returns the Cashfree session to open, or — for a 100%
 * coupon — the activated FREE payment with no checkout.
 */
export async function startSubscriptionPayment(database, supplierId, options = {}) {
  return startPlanPayment(database, supplierId, { ...options, planCode: "MARKETPLACE" });
}

/** Starts a payment for any plan (see startSubscriptionPayment). */
export async function startPlanPayment(database, supplierId, { planCode = "MARKETPLACE", productId = null, couponCode = null, actorId = null, returnUrl = null, gateway = defaultGateway, now = new Date() } = {}) {
  const quote = quotePlanPayment(database, supplierId, { planCode, productId, couponCode });
  const supplier = database.prepare("SELECT id, company_name, contact_name, email, phone FROM suppliers WHERE id = ?").get(supplierId);
  const id = `spp_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO supplier_plan_payments (
      id, supplier_id, plan_code, period_months, base_inr, coupon_code, discount_inr, taxable_inr, gst_rate, gst_inr, total_inr, sac_code, created_by, created_at, product_id, check_refundable_inr
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, supplierId, quote.planCode, quote.periodMonths, quote.baseInr, quote.coupon?.code || null, quote.discountInr,
    quote.taxableInr, quote.gstRate, quote.gstInr, quote.totalInr, quote.sacCode, actorId, sqlTimestamp(now), quote.productId, quote.checkRefundableInr);
  const payment = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(id);

  if (quote.totalInr <= 0) {
    return { quote, payment: activate(database, payment, { status: "FREE", now }), checkout: null };
  }

  let order;
  try {
    order = await gateway.createOrder({
      orderId: `subs_${id.slice(4)}`,
      amount: quote.totalInr,
      currency: "INR",
      customer: { id: supplier.id, name: supplier.contact_name || supplier.company_name, email: supplier.email, phone: supplier.phone },
      returnUrl,
      notifyUrl: /^https:\/\//.test(process.env.PUBLIC_APP_URL || "") ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/checkout/cashfree/webhook` : undefined,
      notes: { note: `${PLAN_LABELS[quote.planCode]} ${id}`, supplierId: supplier.id, planPaymentId: id },
    });
  } catch (error) {
    database.prepare("UPDATE supplier_plan_payments SET status = 'FAILED' WHERE id = ?").run(id);
    logger.error("Subscription payment order failed", { paymentId: id, error });
    throw paymentError("Online payment is not available right now. Please try again later.", 502, "PAYMENT_UNAVAILABLE");
  }
  database.prepare("UPDATE supplier_plan_payments SET cashfree_order_id = ?, payment_session_id = ? WHERE id = ?").run(order.orderId, order.paymentSessionId, id);
  return {
    quote,
    payment: database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(id),
    checkout: { orderId: order.orderId, paymentSessionId: order.paymentSessionId, environment: order.environment },
  };
}

/**
 * Confirms a gateway-verified payment for an order. The paid amount must match
 * what the server priced, or nothing is activated.
 */
export function confirmSubscriptionPayment(database, { orderId, cashfreePaymentId = null, amount, currency = "INR", now = new Date() }) {
  const payment = database.prepare("SELECT * FROM supplier_plan_payments WHERE cashfree_order_id = ?").get(orderId);
  if (!payment) return null;
  if (payment.status === "PAID" || payment.status === "FREE") return payment;
  if (String(currency || "INR").toUpperCase() !== "INR" || Math.round(Number(amount) * 100) !== Math.round(Number(payment.total_inr) * 100)) {
    logger.error("Subscription payment amount does not match its order", { paymentId: payment.id, amount, currency, expected: payment.total_inr });
    throw paymentError("The paid amount does not match this subscription. Our team will review it.", 409, "AMOUNT_MISMATCH");
  }
  return activate(database, payment, { status: "PAID", cashfreePaymentId, now });
}

/** Asks Cashfree whether a supplier's pending payment succeeded, and activates it if so. */
export async function verifySubscriptionPayment(database, supplierId, paymentId, { gateway = defaultGateway, now = new Date() } = {}) {
  const payment = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ? AND supplier_id = ?").get(paymentId, supplierId);
  if (!payment) throw paymentError("Payment not found", 404);
  if (payment.status === "PAID" || payment.status === "FREE") return payment;
  if (!payment.cashfree_order_id) throw paymentError("This payment was not started", 409, "NOT_STARTED");

  const payments = await gateway.getPayments(payment.cashfree_order_id).catch(() => []);
  const success = Array.isArray(payments) ? payments.find((item) => item.payment_status === "SUCCESS") : null;
  if (success) {
    return confirmSubscriptionPayment(database, {
      orderId: payment.cashfree_order_id,
      cashfreePaymentId: String(success.cf_payment_id || success.payment_id || ""),
      amount: success.payment_amount,
      currency: success.payment_currency,
      now,
    });
  }
  const order = await gateway.getOrder(payment.cashfree_order_id).catch(() => null);
  if (order?.order_status === "PAID") {
    return confirmSubscriptionPayment(database, { orderId: payment.cashfree_order_id, amount: order.order_amount, currency: order.order_currency, now });
  }
  throw paymentError("Payment has not been completed yet", 409, "NOT_PAID");
}

export function listSubscriptionPayments(database, supplierId) {
  return database.prepare("SELECT * FROM supplier_plan_payments WHERE supplier_id = ? ORDER BY created_at DESC, id DESC").all(supplierId)
    .map((row) => ({
      id: row.id, planCode: row.plan_code, productId: row.product_id || null, status: row.status, periodMonths: row.period_months, baseInr: row.base_inr, couponCode: row.coupon_code,
      refundStatus: row.refund_status || null, refundAmountInr: row.refund_amount_inr ?? null, refundedAt: row.refunded_at || null,
      discountInr: row.discount_inr, taxableInr: row.taxable_inr, gstRate: row.gst_rate, gstInr: row.gst_inr, totalInr: row.total_inr,
      sacCode: row.sac_code, invoiceNumber: row.invoice_number, paidAt: row.paid_at, createdAt: row.created_at,
    }));
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
const inr = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The GST tax invoice for a PAID or FREE payment. CGST + SGST (9% each) when the
 * supplier's state is the business's (BUSINESS_STATE), IGST 18% otherwise; with
 * BUSINESS_STATE unset the split cannot be decided and GST is shown as one line.
 */
export function renderSubscriptionInvoice(database, supplierId, paymentId) {
  const payment = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ? AND supplier_id = ?").get(paymentId, supplierId);
  if (!payment || !["PAID", "FREE"].includes(payment.status)) throw paymentError("Invoice not found", 404);
  const supplier = database.prepare("SELECT company_name, contact_name, email, city, state, gstin FROM suppliers WHERE id = ?").get(supplierId);
  const subscription = payment.subscription_id ? database.prepare("SELECT starts_at, ends_at FROM supplier_subscriptions WHERE id = ?").get(payment.subscription_id) : null;
  const businessState = String(process.env.BUSINESS_STATE || "").trim();
  const intraState = businessState && supplier?.state && businessState.toLowerCase() === String(supplier.state).trim().toLowerCase();
  const halfGst = money(Number(payment.gst_inr) / 2);
  const gstRows = !businessState
    ? `<tr><td>GST @ 18%</td><td class="r">${inr(payment.gst_inr)}</td></tr>`
    : intraState
      ? `<tr><td>CGST @ 9%</td><td class="r">${inr(halfGst)}</td></tr><tr><td>SGST @ 9%</td><td class="r">${inr(money(Number(payment.gst_inr) - halfGst))}</td></tr>`
      : `<tr><td>IGST @ 18%</td><td class="r">${inr(payment.gst_inr)}</td></tr>`;
  const product = payment.product_id ? database.prepare("SELECT title FROM products WHERE id = ?").get(payment.product_id) : null;
  const period = subscription
    ? `${escapeHtml(subscription.starts_at.slice(0, 10))} to ${escapeHtml(String(subscription.ends_at || "").slice(0, 10))}`
    : [Number(payment.period_months) ? `${payment.period_months} months` : null, product ? `listing: ${escapeHtml(product.title)}` : null].filter(Boolean).join(", ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tax invoice ${escapeHtml(payment.invoice_number)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1c1917}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #e7e5e4;padding:8px;text-align:left;font-size:14px}.r{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:14px}.muted{color:#78716c;font-size:12px}</style></head><body>
<h1>Tax invoice</h1>
<div class="grid">
<div><strong>${escapeHtml(process.env.BUSINESS_LEGAL_NAME || "Idea Holiday")}</strong><br>GSTIN: ${escapeHtml(process.env.BUSINESS_GSTIN || "UNKNOWN")}<br>${escapeHtml(process.env.BUSINESS_ADDRESS || "")}</div>
<div>Invoice no: <strong>${escapeHtml(payment.invoice_number)}</strong><br>Date: ${escapeHtml(String(payment.paid_at || "").slice(0, 10))}<br>Payment: ${escapeHtml(payment.status === "FREE" ? "Coupon (no payment)" : payment.cashfree_payment_id || payment.cashfree_order_id || "")}</div>
<div>Billed to: <strong>${escapeHtml(supplier?.company_name)}</strong><br>${escapeHtml(supplier?.contact_name || "")}<br>${escapeHtml([supplier?.city, supplier?.state].filter(Boolean).join(", "))}<br>GSTIN: ${escapeHtml(supplier?.gstin || "Not provided")}</div>
</div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>${escapeHtml(PLAN_LABELS[payment.plan_code] || PLAN_LABELS.MARKETPLACE)}${period ? ` (${period})` : ""}<br><span class="muted">SAC ${escapeHtml(payment.sac_code)}</span></td><td class="r">${inr(payment.base_inr)}</td></tr>
${Number(payment.discount_inr) > 0 ? `<tr><td>Coupon ${escapeHtml(payment.coupon_code)}</td><td class="r">− ${inr(payment.discount_inr)}</td></tr>` : ""}
<tr><td>Taxable value</td><td class="r">${inr(payment.taxable_inr)}</td></tr>
${gstRows}
<tr><td><strong>Total</strong></td><td class="r"><strong>${inr(payment.total_inr)}</strong></td></tr>
</tbody></table>
<p class="muted">This is a computer-generated invoice.</p>
</body></html>`;
}

/* -------------------------------------------------------------------------- */
/* Verified checks (ADR 008): an admin queue; a rejected paid check is refunded */
/* -------------------------------------------------------------------------- */

/** Paid checks waiting for an admin, oldest first. */
export function listVerificationQueue(database) {
  return database.prepare(`
    SELECT v.id, v.supplier_id, v.created_at, s.company_name, s.city, s.kyb_status, s.public_slug,
      p.id AS payment_id, p.plan_code, p.total_inr, p.status AS payment_status, p.check_refundable_inr
    FROM supplier_verifications v
    JOIN suppliers s ON s.id = v.supplier_id
    LEFT JOIN supplier_plan_payments p ON p.id = v.purchase_id
    WHERE v.status = 'PENDING_CHECKS' AND v.source = 'PURCHASE'
    ORDER BY v.created_at ASC
  `).all().map((row) => ({
    verificationId: row.id, supplierId: row.supplier_id, supplierName: row.company_name, city: row.city, kybStatus: row.kyb_status,
    profileSlug: row.public_slug, requestedAt: row.created_at, paymentId: row.payment_id, planCode: row.plan_code,
    paidInr: row.payment_status === "FREE" ? 0 : Number(row.total_inr || 0), refundableInr: row.payment_status === "FREE" ? 0 : Number(row.check_refundable_inr || 0),
  }));
}

async function refundCheck(database, payment, { reason, gateway, now }) {
  const amount = payment.status === "PAID" ? money(payment.check_refundable_inr) : 0;
  if (amount <= 0 || !payment.cashfree_order_id) {
    database.prepare("UPDATE supplier_plan_payments SET refund_status = 'NOT_NEEDED' WHERE id = ?").run(payment.id);
    return { refundStatus: "NOT_NEEDED", refundAmountInr: 0 };
  }
  const refundId = `verchk_${payment.id.slice(4)}`;
  try {
    const refund = await gateway.refund({ orderId: payment.cashfree_order_id, refundId, amount, reason: `Verified check not passed: ${reason}`.slice(0, 100) });
    database.prepare("UPDATE supplier_plan_payments SET refund_status = 'PROCESSED', refund_amount_inr = ?, refund_id = ?, refunded_at = ? WHERE id = ?")
      .run(amount, refund.refundId || refundId, sqlTimestamp(now), payment.id);
    return { refundStatus: "PROCESSED", refundAmountInr: amount };
  } catch (error) {
    logger.error("Verified check refund failed", { paymentId: payment.id, error });
    database.prepare("UPDATE supplier_plan_payments SET refund_status = 'FAILED', refund_amount_inr = ?, refund_id = ? WHERE id = ?").run(amount, refundId, payment.id);
    return { refundStatus: "FAILED", refundAmountInr: amount };
  }
}

/**
 * The checks did not pass: the pending check is REJECTED, no badge is granted,
 * and what was paid for the check goes back (the Spotlight part of Verified Plus
 * stays). A failed refund is marked FAILED for retrying; the rejection stands.
 */
export async function rejectPurchasedVerification(database, verificationId, { reason, actorId = null, gateway = defaultGateway, now = new Date() } = {}) {
  const why = String(reason || "").trim();
  if (why.length < 5) throw paymentError("Give a reason the checks did not pass", 400, "REASON_REQUIRED");
  const verification = database.prepare("SELECT * FROM supplier_verifications WHERE id = ?").get(verificationId);
  if (!verification) throw paymentError("Verification not found", 404);
  if (verification.status !== "PENDING_CHECKS") throw paymentError("This check has already been decided", 409, "ALREADY_DECIDED");
  database.prepare("UPDATE supplier_verifications SET status = 'REJECTED', decided_by = ?, decision_reason = ?, updated_at = datetime('now') WHERE id = ?")
    .run(actorId, why, verificationId);
  const payment = verification.purchase_id ? database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(verification.purchase_id) : null;
  const refund = payment ? await refundCheck(database, payment, { reason: why, gateway, now }) : { refundStatus: "NOT_NEEDED", refundAmountInr: 0 };
  return { verificationId, status: "REJECTED", ...refund };
}

/** Tries a FAILED check refund again. */
export async function retryCheckRefund(database, paymentId, { gateway = defaultGateway, now = new Date() } = {}) {
  const payment = database.prepare("SELECT * FROM supplier_plan_payments WHERE id = ?").get(paymentId);
  if (!payment) throw paymentError("Payment not found", 404);
  if (payment.refund_status !== "FAILED") throw paymentError("There is no failed refund on this payment", 409, "NOTHING_TO_RETRY");
  return refundCheck(database, payment, { reason: "retry", gateway, now });
}

/* -------------------------------------------------------------------------- */
/* Spotlights: one product on the profile, locked to it, one swap a year        */
/* -------------------------------------------------------------------------- */

const SWAP_INTERVAL_DAYS = 365;

export function listSupplierSpotlights(database, supplierId, { now = new Date() } = {}) {
  return database.prepare(`
    SELECT sp.*, p.title, p.status AS product_status FROM product_spotlights sp LEFT JOIN products p ON p.id = sp.product_id
    WHERE sp.supplier_id = ? AND sp.status = 'ACTIVE' ORDER BY sp.created_at ASC
  `).all(supplierId).map((row) => {
    const nextSwap = row.last_swapped_at ? new Date(new Date(`${row.last_swapped_at.replace(" ", "T")}Z`).getTime() + SWAP_INTERVAL_DAYS * 86_400_000) : null;
    return {
      id: row.id, productId: row.product_id, title: row.title, productStatus: row.product_status, since: row.created_at,
      lastSwappedAt: row.last_swapped_at, canSwapFrom: nextSwap && nextSwap > now ? sqlTimestamp(nextSwap) : null,
    };
  });
}

/** Moves a Spotlight to another of the supplier's published listings, at most once a year. */
export function swapSpotlight(database, supplierId, spotlightId, { productId, now = new Date() } = {}) {
  const spotlight = database.prepare("SELECT * FROM product_spotlights WHERE id = ? AND supplier_id = ? AND status = 'ACTIVE'").get(spotlightId, supplierId);
  if (!spotlight) throw paymentError("Spotlight not found", 404);
  if (spotlight.product_id === productId) throw paymentError("That listing is already in this Spotlight", 409, "SAME_PRODUCT");
  const current = listSupplierSpotlights(database, supplierId, { now }).find((row) => row.id === spotlightId);
  if (current.canSwapFrom) throw paymentError(`You can change this Spotlight again from ${current.canSwapFrom.slice(0, 10)}`, 409, "SWAP_LIMIT");
  assertSpotlightProduct(database, supplierId, productId);
  database.prepare("UPDATE product_spotlights SET previous_product_id = product_id, product_id = ?, last_swapped_at = ?, updated_at = ? WHERE id = ?")
    .run(productId, sqlTimestamp(now), sqlTimestamp(now), spotlightId);
  return listSupplierSpotlights(database, supplierId, { now }).find((row) => row.id === spotlightId);
}

/* -------------------------------------------------------------------------- */
/* Verified renewal reminders                                                   */
/* -------------------------------------------------------------------------- */

const VERIFIED_REMINDER_DAYS = [30, 7, 1];

/**
 * Picks reminders for Verified badges ending in 30, 7 or 1 days, once each,
 * unless the supplier already has a renewal check pending.
 */
export function collectVerificationReminders(database, { now = new Date() } = {}) {
  const at = now.toISOString();
  const rows = database.prepare(`
    SELECT v.*, s.company_name, s.contact_name, s.email, s.phone FROM supplier_verifications v JOIN suppliers s ON s.id = v.supplier_id
    WHERE v.status = 'ACTIVE' AND v.valid_until > ?
      AND NOT EXISTS (SELECT 1 FROM supplier_verifications p WHERE p.supplier_id = v.supplier_id AND p.status = 'PENDING_CHECKS')
  `).all(at);
  const reminders = [];
  for (const row of rows) {
    const daysLeft = Math.ceil((new Date(row.valid_until).getTime() - now.getTime()) / 86_400_000);
    const due = VERIFIED_REMINDER_DAYS.filter((days) => daysLeft <= days).sort((a, b) => a - b)[0];
    if (due === undefined || (row.last_reminder_days !== null && row.last_reminder_days <= due)) continue;
    database.prepare("UPDATE supplier_verifications SET last_reminder_days = ? WHERE id = ?").run(due, row.id);
    reminders.push({ verificationId: row.id, supplier: row, daysLeft, validUntil: row.valid_until });
  }
  return reminders;
}

export async function sendVerificationReminders(database, reminders = []) {
  const { verifiedPriceInr } = getSettings(database, "supplier_plans");
  for (const reminder of reminders) {
    const { supplier } = reminder;
    const name = supplier.contact_name || supplier.company_name || "Partner";
    const endDate = String(reminder.validUntil).slice(0, 10);
    const message = `Hello ${name},\n\nYour Idea Holiday Verified badge ends on ${endDate}. Renew the yearly business check (₹${verifiedPriceInr} + GST) from Subscription & plans in the Supplier Portal to keep it. The badge is renewed only if the checks pass.`;
    try {
      await sendRecipientChannels({
        database,
        eventType: "SUPPLIER_VERIFIED_ENDING",
        eventKeyPrefix: `${reminder.verificationId}:SUPPLIER_VERIFIED_ENDING:${reminder.daysLeft}`,
        recipient: { id: supplier.supplier_id, role: "SUPPLIER", name, email: supplier.email, phone: supplier.phone },
        subject: `Your Verified badge ends on ${endDate}`,
        emailText: message,
        whatsappText: message,
        metadata: { verificationId: reminder.verificationId, supplierId: supplier.supplier_id },
      });
    } catch (error) {
      logger.error("Verified reminder failed", { verificationId: reminder.verificationId, error });
    }
  }
}
