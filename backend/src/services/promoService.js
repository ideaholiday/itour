import { effectiveAffiliateRates, recordAffiliateBooking, resolveTier } from "./affiliateService.js";
import { findReferrerByCode, referralPolicy } from "./referralService.js";
import { giveawayBudgetInr } from "./programSettingsService.js";
import { nanoid } from "nanoid";

function promoError(message, status = 400, code = undefined) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function parseList(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

/** Runs a count query that needs migration 040; before it, nothing has been redeemed. */
function countOrZero(database, sql, ...params) {
  try {
    return Number(database.prepare(sql).get(...params)?.count) || 0;
  } catch (error) {
    if (/no such table|does not exist/i.test(error.message)) return 0;
    throw error;
  }
}

/**
 * Who and what an admin coupon can be used for (migration 040). `product` is
 * `{ id, product_type, supplier_id }` when the code is checked for a booking; a
 * check without one (the checkout "Apply" button) skips product targeting, and
 * the booking quote applies it.
 */
function assertCouponAllowed(database, promo, { userId, product, audience = "TRAVELER" }) {
  const code = promo.code;
  if (String(promo.audience || "TRAVELER").toUpperCase() !== audience) {
    throw promoError(`Promo code ${code} cannot be used ${audience === "TRAVELER" ? "for bookings" : "for supplier subscriptions"}`, 400, "WRONG_AUDIENCE");
  }
  if (promo.starts_at && new Date(promo.starts_at.replace(" ", "T")).getTime() > Date.now()) {
    throw promoError(`Promo code ${code} starts on ${new Date(promo.starts_at.replace(" ", "T")).toLocaleDateString("en-IN")}`, 400, "NOT_STARTED");
  }
  if ((promo.per_user_limit || Number(promo.first_booking_only) === 1) && !userId) {
    throw promoError(`Sign in to use promo code ${code}`, 401, "SIGN_IN_REQUIRED");
  }
  if (promo.per_user_limit) {
    const used = countOrZero(database, "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_code = ? AND user_id = ? AND status = 'ACTIVE'", code, userId);
    if (used >= Number(promo.per_user_limit)) {
      throw promoError(`You have already used promo code ${code}${Number(promo.per_user_limit) > 1 ? ` ${promo.per_user_limit} times` : ""}`, 400, "PER_USER_LIMIT");
    }
  }
  if (Number(promo.first_booking_only) === 1 && audience === "TRAVELER") {
    const paid = countOrZero(database, "SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND payment_status IN ('PAID', 'PARTIALLY_REFUNDED')", userId);
    if (paid > 0) throw promoError(`Promo code ${code} is for your first booking only`, 400, "FIRST_BOOKING_ONLY");
  }
  if (product) {
    const types = parseList(promo.product_types_json).map((type) => type.toUpperCase());
    const products = parseList(promo.product_ids_json);
    const suppliers = parseList(promo.supplier_ids_json);
    const fits = (!types.length || types.includes(String(product.product_type || "").toUpperCase()))
      && (!products.length || products.includes(String(product.id)))
      && (!suppliers.length || suppliers.includes(String(product.supplier_id)));
    if (!fits) throw promoError(`Promo code ${code} does not apply to this experience`, 400, "NOT_APPLICABLE");
  }
}

/**
 * Validates a promo code or referral code against an order amount
 */
export function validatePromoCode(database, { code, amountInr = 0, userId = null, product = null, audience = "TRAVELER" }) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    throw promoError("Enter a promo or referral code", 400);
  }

  const orderAmount = Number(amountInr || 0);
  if (orderAmount <= 0) {
    throw promoError("Order amount must be greater than zero", 400);
  }

  // 1. Check standard promo codes
  const promo = database.prepare("SELECT * FROM promo_codes WHERE code = ?").get(normalized);

  if (promo) {
    if (!promo.is_active) {
      throw promoError(`Promo code ${normalized} is no longer active`, 400);
    }

    if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
      throw promoError(`Promo code ${normalized} expired on ${new Date(promo.expires_at).toLocaleDateString("en-IN")}`, 400);
    }

    if (promo.usage_limit && promo.times_used >= promo.usage_limit) {
      throw promoError(`Promo code ${normalized} has reached its maximum redemption limit`, 400);
    }

    assertCouponAllowed(database, promo, { userId, product, audience });

    const minSpend = Number(promo.min_order_inr || 0);
    if (orderAmount < minSpend) {
      throw promoError(`Promo code ${normalized} requires a minimum booking amount of ₹${minSpend.toLocaleString("en-IN")}`, 400);
    }

    let discountAmount = 0;
    if (promo.discount_type === "PERCENTAGE") {
      discountAmount = Math.round(orderAmount * (Number(promo.discount_value) / 100));
      if (promo.max_discount_inr && discountAmount > Number(promo.max_discount_inr)) {
        discountAmount = Number(promo.max_discount_inr);
      }
    } else {
      discountAmount = Math.min(Number(promo.discount_value), orderAmount);
    }

    discountAmount = Math.max(0, Math.min(discountAmount, orderAmount));

    let affiliate = null;
    try {
      if (audience === "TRAVELER") affiliate = database.prepare("SELECT * FROM affiliates WHERE affiliate_code = ? AND status = 'ACTIVE'").get(normalized);
    } catch {}

    return {
      valid: true,
      type: affiliate ? "AFFILIATE" : "PROMO",
      code: promo.code,
      affiliateId: affiliate?.id || null,
      affiliateCode: affiliate?.affiliate_code || null,
      channelName: affiliate?.channel_name || null,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountAmount,
      originalAmount: orderAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
      description: promo.description || `${promo.discount_value}${promo.discount_type === "PERCENTAGE" ? "%" : " ₹"} discount applied`,
    };
  }

  // 2. A traveler referral code (REF-…). Codes are matched exactly, never
  // reconstructed from user names, so only issued codes validate.
  const referrer = audience === "TRAVELER" ? findReferrerByCode(database, normalized) : null;
  if (referrer) {
    if (userId && referrer.id === userId) {
      throw promoError("You cannot use your own referral code", 400);
    }
    const discountPct = Math.round(referralPolicy(database).friendDiscountRate * 100);

    // The rupee amount depends on the trip, so it is priced with the booking
    // quote rather than here. Nothing is taken off the order at this step.
    return {
      valid: true,
      type: "REFERRAL",
      code: referrer.referral_code,
      referrerUserId: referrer.id,
      referrerName: referrer.name ? referrer.name.split(" ")[0] : null,
      discountType: "REFERRAL",
      discountValue: discountPct,
      discountAmount: 0,
      originalAmount: orderAmount,
      finalAmount: orderAmount,
      description: `Friend referral from ${referrer.name ? referrer.name.split(" ")[0] : "a friend"}: your first-trip discount appears in the price summary`,
    };
  }

  throw promoError(`Invalid promo code "${normalized}". Please check spelling and try again.`, 404);
}

/**
 * Records redemption of a promo or referral code on booking creation
 */
export function applyPromoCode(database, { code, bookingId, userId = null, amountInr = 0 }) {
  if (!code || !bookingId) return null;

  try {
    const validated = validatePromoCode(database, { code, amountInr: amountInr || 2000, userId });

    database.transaction(() => {
      if (validated.type === "PROMO" || validated.type === "AFFILIATE") {
        redeemCoupon(database, { code: validated.code, bookingId, userId, discountInr: validated.discountAmount });
        if (validated.type === "AFFILIATE" || validated.affiliateCode) {
          recordAffiliateBooking(database, {
            bookingId,
            affiliateCode: validated.affiliateCode || validated.code,
            amountInr: validated.originalAmount || amountInr,
            attributionType: "COUPON_CODE",
            userId,
          });
        }
      }
      // Traveler referral codes are attached by applyReferralToBooking in the
      // booking route, which is the only place a referral reward is created.
    })();

    return validated;
  } catch (err) {
    return null;
  }
}

/**
 * A coupon's rupee discount after the giveaway cap, in whole rupees rounded down.
 * `budgetInr` is what the whole booking may give away (`giveawayBudgetInr`);
 * `otherGiveawayInr` is what the referral and creator already take from it.
 */
export function capCouponDiscount({ offeredInr, budgetInr, otherGiveawayInr = 0 }) {
  const remaining = (Number(budgetInr) || 0) - (Number(otherGiveawayInr) || 0);
  return Math.max(0, Math.floor(Math.min(Number(offeredInr) || 0, remaining)));
}

/**
 * What a promo code takes off a booking, priced from the server quote. The
 * discount comes out of commission, so it is capped by what the booking can
 * give away once the referral and, for a creator's code, the creator's
 * commission are paid for. Throws the promo error for a code that is not valid.
 * Traveler `REF-` codes are not coupons and return null.
 */
export function priceCouponForBooking(database, { code, bookingValueInr, commissionInr, userId = null, otherGiveawayInr = 0, product = null }) {
  const promo = validatePromoCode(database, { code, amountInr: bookingValueInr, userId, product });
  if (promo.type === "REFERRAL") return null;
  const creator = promo.affiliateId ? database.prepare("SELECT * FROM affiliates WHERE id = ?").get(promo.affiliateId) : null;
  const creatorCommissionInr = creator
    ? Math.round((Number(bookingValueInr) || 0) * effectiveAffiliateRates(resolveTier(database, creator.id), creator).commissionRate * 100) / 100
    : 0;
  const discountInr = capCouponDiscount({
    offeredInr: promo.discountAmount,
    budgetInr: giveawayBudgetInr(database, { bookingValueInr, commissionInr }),
    otherGiveawayInr: (Number(otherGiveawayInr) || 0) + creatorCommissionInr,
  });
  return {
    code: promo.code,
    type: promo.type,
    description: promo.description,
    offeredInr: Math.floor(Number(promo.discountAmount) || 0),
    discountInr,
    creatorCommissionInr,
    capped: discountInr < Math.floor(Number(promo.discountAmount) || 0),
  };
}

/**
 * Records that a booking used a coupon. Runs inside the booking transaction and
 * throws when the code has just run out, so the booking is not created with a
 * discount the code can no longer give.
 */
export function redeemCoupon(database, { code, bookingId, userId = null, discountInr = 0 }) {
  const taken = database.prepare(`
    UPDATE promo_codes SET times_used = COALESCE(times_used, 0) + 1
    WHERE code = ? AND (usage_limit IS NULL OR usage_limit = 0 OR COALESCE(times_used, 0) < usage_limit)
  `).run(code);
  if (!taken.changes) throw promoError(`Promo code ${code} has just reached its limit. Remove it and try again.`, 409, "USAGE_LIMIT");
  try {
    database.prepare(`
      INSERT INTO coupon_redemptions (id, coupon_code, user_id, booking_id, discount_inr) VALUES (?, ?, ?, ?, ?)
    `).run(`cred_${nanoid(12)}`, code, userId, bookingId, Math.max(0, Number(discountInr) || 0));
  } catch (error) {
    // Before migration 040 there is only the counter.
    if (!/no such table|does not exist/i.test(error.message)) throw error;
  }
}

/**
 * Gives coupon uses back when their booking never went ahead: an unpaid
 * checkout whose hold lapsed, a failed payment, or a full refund. A partly
 * refunded booking keeps its use. Run by the lifecycle job; safe to repeat.
 */
export function releaseCouponRedemptions(database, { now = new Date() } = {}) {
  const at = new Date(now).toISOString().slice(0, 19).replace("T", " ");
  let rows;
  try {
    rows = database.prepare(`
      SELECT cr.id, cr.coupon_code, b.id AS booking_id, b.status, b.payment_status, b.amount_inr, b.refunded_amount, b.refund_amount_inr
      FROM coupon_redemptions cr JOIN bookings b ON b.id = cr.booking_id
      WHERE cr.status = 'ACTIVE' AND (
        b.payment_status IN ('FAILED', 'EXPIRED', 'REFUNDED')
        OR (b.status = 'cancelled' AND b.payment_status NOT IN ('PAID', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW_REQUIRED', 'CAPTURED_REVIEW'))
        OR (b.payment_status NOT IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW_REQUIRED', 'CAPTURED_REVIEW')
          AND EXISTS (SELECT 1 FROM booking_holds h WHERE h.booking_id = b.id AND (h.status = 'EXPIRED' OR h.expires_at <= ?))
          AND NOT EXISTS (SELECT 1 FROM booking_holds h WHERE h.booking_id = b.id AND h.status = 'ACTIVE' AND h.expires_at > ?))
        OR (b.payment_status = 'PARTIALLY_REFUNDED' AND COALESCE(b.amount_inr, 0) > 0
          AND CASE WHEN COALESCE(b.refunded_amount, 0) >= COALESCE(b.refund_amount_inr, 0)
            THEN COALESCE(b.refunded_amount, 0) ELSE COALESCE(b.refund_amount_inr, 0) END >= b.amount_inr)
      )
    `).all(at, at);
  } catch (error) {
    if (/no such table|does not exist/i.test(error.message)) return { released: 0 };
    throw error;
  }
  let released = 0;
  for (const row of rows) {
    database.transaction(() => {
      const reason = row.payment_status === "REFUNDED" || row.payment_status === "PARTIALLY_REFUNDED" ? "Booking refunded in full"
        : row.status === "cancelled" ? "Booking cancelled before payment" : "Checkout not paid";
      const changed = database.prepare("UPDATE coupon_redemptions SET status = 'RELEASED', release_reason = ?, released_at = ? WHERE id = ? AND status = 'ACTIVE'").run(reason, at, row.id).changes;
      if (changed) {
        database.prepare("UPDATE promo_codes SET times_used = CASE WHEN COALESCE(times_used, 0) > 0 THEN times_used - 1 ELSE 0 END WHERE code = ?").run(row.coupon_code);
        released += 1;
      }
    })();
  }
  return { released };
}
