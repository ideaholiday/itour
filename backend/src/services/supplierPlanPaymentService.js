/**
 * Suppliers pay for their required subscription (ADR 017, plan Phase 5).
 *
 * The server prices every payment: the admin-set price (not for sale while
 * unset), less a SUPPLIER_SUBSCRIPTION coupon, plus 18% GST under SAC 998559.
 * A subscription becomes ACTIVE only after the server has confirmed the payment
 * with Cashfree (verify call or signed webhook), never from a browser redirect.
 * A 100% coupon activates it with no payment.
 *
 * See docs/SUPPLIER_PLANS.md §5 and migrations/043_supplier_plan_payments.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";
import { createCashfreeOrder, getCashfreeOrder, getCashfreePayments } from "./cashfreeService.js";
import { getSettings } from "./programSettingsService.js";
import { redeemCoupon, validatePromoCode } from "./promoService.js";
import { sqlTimestamp } from "./supplierSubscriptionService.js";

export const SUBSCRIPTION_GST_RATE = 0.18;
export const SUBSCRIPTION_SAC_CODE = "998559";

const defaultGateway = { createOrder: createCashfreeOrder, getPayments: getCashfreePayments, getOrder: getCashfreeOrder };
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

function paymentError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** What a supplier would pay now. Throws when there is nothing to buy. */
export function quoteSubscriptionPayment(database, supplierId, { couponCode = null } = {}) {
  const supplier = database.prepare("SELECT id, subscription_exempt FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw paymentError("Supplier not found", 404);
  if (Number(supplier.subscription_exempt) === 1) throw paymentError("Suppliers registered before 14 September 2026 don't need a subscription", 409, "NOT_REQUIRED");
  const { priceInr, billingPeriodMonths } = getSettings(database, "supplier_subscriptions");
  if (!priceInr) throw paymentError("The subscription isn't on sale yet. You're covered by the launch offer for now.", 409, "NOT_FOR_SALE");

  const base = money(priceInr);
  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const promo = validatePromoCode(database, { code: couponCode, amountInr: base, userId: supplierId, audience: "SUPPLIER_SUBSCRIPTION" });
    discount = Math.min(base, money(promo.discountAmount));
    coupon = { code: promo.code, description: promo.description };
  }
  const taxable = money(base - discount);
  const gst = money(taxable * SUBSCRIPTION_GST_RATE);
  return {
    supplierId,
    planCode: "MARKETPLACE",
    periodMonths: billingPeriodMonths,
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
    const latestEnd = database.prepare(`
      SELECT MAX(ends_at) AS ends_at FROM supplier_subscriptions
      WHERE supplier_id = ? AND status IN ('ACTIVE', 'WAIVED') AND source IN ('PURCHASE', 'COUPON', 'WAIVER') AND ends_at IS NOT NULL AND ends_at > ?
    `).get(payment.supplier_id, sqlTimestamp(now))?.ends_at;
    const starts = latestEnd ? new Date(`${latestEnd.replace(" ", "T")}Z`) : now;
    const ends = addMonths(starts, Number(payment.period_months));
    const subscriptionId = `ssub_${nanoid(12)}`;
    database.prepare(`
      INSERT INTO supplier_subscriptions (id, supplier_id, plan_code, status, source, starts_at, ends_at, reason)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
    `).run(subscriptionId, payment.supplier_id, payment.plan_code, status === "FREE" ? "COUPON" : "PURCHASE",
      sqlTimestamp(starts), sqlTimestamp(ends), status === "FREE" ? `Coupon ${payment.coupon_code}` : `Payment ${payment.id}`);
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
export async function startSubscriptionPayment(database, supplierId, { couponCode = null, actorId = null, returnUrl = null, gateway = defaultGateway, now = new Date() } = {}) {
  const quote = quoteSubscriptionPayment(database, supplierId, { couponCode });
  const supplier = database.prepare("SELECT id, company_name, contact_name, email, phone FROM suppliers WHERE id = ?").get(supplierId);
  const id = `spp_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO supplier_plan_payments (
      id, supplier_id, plan_code, period_months, base_inr, coupon_code, discount_inr, taxable_inr, gst_rate, gst_inr, total_inr, sac_code, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, supplierId, quote.planCode, quote.periodMonths, quote.baseInr, quote.coupon?.code || null, quote.discountInr,
    quote.taxableInr, quote.gstRate, quote.gstInr, quote.totalInr, quote.sacCode, actorId, sqlTimestamp(now));
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
      notes: { note: `Idea Holiday supplier subscription ${id}`, supplierId: supplier.id, planPaymentId: id },
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
      id: row.id, status: row.status, periodMonths: row.period_months, baseInr: row.base_inr, couponCode: row.coupon_code,
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
  const period = subscription ? `${escapeHtml(subscription.starts_at.slice(0, 10))} to ${escapeHtml(String(subscription.ends_at || "").slice(0, 10))}` : `${payment.period_months} months`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tax invoice ${escapeHtml(payment.invoice_number)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1c1917}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #e7e5e4;padding:8px;text-align:left;font-size:14px}.r{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:14px}.muted{color:#78716c;font-size:12px}</style></head><body>
<h1>Tax invoice</h1>
<div class="grid">
<div><strong>${escapeHtml(process.env.BUSINESS_LEGAL_NAME || "Idea Holiday")}</strong><br>GSTIN: ${escapeHtml(process.env.BUSINESS_GSTIN || "UNKNOWN")}<br>${escapeHtml(process.env.BUSINESS_ADDRESS || "")}</div>
<div>Invoice no: <strong>${escapeHtml(payment.invoice_number)}</strong><br>Date: ${escapeHtml(String(payment.paid_at || "").slice(0, 10))}<br>Payment: ${escapeHtml(payment.status === "FREE" ? "Coupon (no payment)" : payment.cashfree_payment_id || payment.cashfree_order_id || "")}</div>
<div>Billed to: <strong>${escapeHtml(supplier?.company_name)}</strong><br>${escapeHtml(supplier?.contact_name || "")}<br>${escapeHtml([supplier?.city, supplier?.state].filter(Boolean).join(", "))}<br>GSTIN: ${escapeHtml(supplier?.gstin || "Not provided")}</div>
</div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>Idea Holiday supplier marketplace subscription (${period})<br><span class="muted">SAC ${escapeHtml(payment.sac_code)}</span></td><td class="r">${inr(payment.base_inr)}</td></tr>
${Number(payment.discount_inr) > 0 ? `<tr><td>Coupon ${escapeHtml(payment.coupon_code)}</td><td class="r">− ${inr(payment.discount_inr)}</td></tr>` : ""}
<tr><td>Taxable value</td><td class="r">${inr(payment.taxable_inr)}</td></tr>
${gstRows}
<tr><td><strong>Total</strong></td><td class="r"><strong>${inr(payment.total_inr)}</strong></td></tr>
</tbody></table>
<p class="muted">This is a computer-generated invoice.</p>
</body></html>`;
}
