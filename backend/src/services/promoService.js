import { recordAffiliateBooking, resolveTier } from "./affiliateService.js";
import { REFERRAL_POLICY, findReferrerByCode } from "./referralService.js";

function promoError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Validates a promo code or referral code against an order amount
 */
export function validatePromoCode(database, { code, amountInr = 0, userId = null }) {
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
      affiliate = database.prepare("SELECT * FROM affiliates WHERE affiliate_code = ? AND status = 'ACTIVE'").get(normalized);
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
  const referrer = findReferrerByCode(database, normalized);
  if (referrer) {
    if (userId && referrer.id === userId) {
      throw promoError("You cannot use your own referral code", 400);
    }
    const discountPct = Math.round(REFERRAL_POLICY.friendDiscountRate * 100);

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
        database.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE code = ?").run(validated.code);
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
 * ADR 017: everything one booking gives away (coupon, referral discount and
 * credit, creator commission) stays within this share of the booking's value,
 * and never exceeds the booking's commission.
 */
export const MAX_GIVEAWAY_SHARE_OF_BOOKING = 0.1;

/** A coupon's rupee discount after the giveaway cap, in whole rupees rounded down. */
export function capCouponDiscount({ offeredInr, bookingValueInr, commissionInr, otherGiveawayInr = 0 }) {
  const budget = Math.min(
    (Number(bookingValueInr) || 0) * MAX_GIVEAWAY_SHARE_OF_BOOKING,
    Number(commissionInr) || 0,
  ) - (Number(otherGiveawayInr) || 0);
  return Math.max(0, Math.floor(Math.min(Number(offeredInr) || 0, budget)));
}

/**
 * What a promo code takes off a booking, priced from the server quote. The
 * discount comes out of commission, so it is capped by what the booking can
 * give away once the referral and, for a creator's code, the creator's
 * commission are paid for. Throws the promo error for a code that is not valid.
 * Traveler `REF-` codes are not coupons and return null.
 */
export function priceCouponForBooking(database, { code, bookingValueInr, commissionInr, userId = null, otherGiveawayInr = 0 }) {
  const promo = validatePromoCode(database, { code, amountInr: bookingValueInr, userId });
  if (promo.type === "REFERRAL") return null;
  const creatorCommissionInr = promo.affiliateId
    ? Math.round((Number(bookingValueInr) || 0) * (Number(resolveTier(database, promo.affiliateId).commission_rate) || 0.1) * 100) / 100
    : 0;
  const discountInr = capCouponDiscount({
    offeredInr: promo.discountAmount,
    bookingValueInr,
    commissionInr,
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
