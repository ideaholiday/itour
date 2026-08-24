import { nanoid } from "nanoid";

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

    return {
      valid: true,
      type: "PROMO",
      code: promo.code,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountAmount,
      originalAmount: orderAmount,
      finalAmount: Math.max(0, orderAmount - discountAmount),
      description: promo.description || `${promo.discount_value}${promo.discount_type === "PERCENTAGE" ? "%" : " ₹"} discount applied`,
    };
  }

  // 2. Check user referral code (e.g. REF-JOHN1234 or direct user referral matches)
  if (normalized.startsWith("REF-") || normalized.length >= 6) {
    let matchingUser = database.prepare("SELECT id, name, email, referral_code FROM users WHERE UPPER(referral_code) = ?").get(normalized);

    if (!matchingUser) {
      // Fallback check matching user IDs or clean names
      const allUsers = database.prepare("SELECT id, name, email, referral_code FROM users").all();
      matchingUser = allUsers.find((u) => {
        const cleanName = (u.name || "TRVL").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
        const cleanId = String(u.id).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
        const expectedCode = `REF-${cleanName}${cleanId}`;
        return expectedCode === normalized || u.referral_code === normalized;
      });
    }

    if (matchingUser) {
      if (userId && matchingUser.id === userId) {
        throw promoError("You cannot use your own referral code", 400);
      }

      const minSpend = 1000;
      if (orderAmount < minSpend) {
        throw promoError(`Referral codes require a minimum booking amount of ₹${minSpend.toLocaleString("en-IN")}`, 400);
      }

      const discountAmount = Math.min(250, orderAmount);

      return {
        valid: true,
        type: "REFERRAL",
        code: normalized,
        referrerUserId: matchingUser.id,
        referrerName: matchingUser.name,
        discountType: "FIXED",
        discountValue: 250,
        discountAmount,
        originalAmount: orderAmount,
        finalAmount: Math.max(0, orderAmount - discountAmount),
        description: `Friend Referral Voucher: ₹250 instant discount`,
      };
    }
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
      if (validated.type === "PROMO") {
        database.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE code = ?").run(validated.code);
      } else if (validated.type === "REFERRAL" && validated.referrerUserId) {
        const referralId = `ref_${nanoid(12)}`;
        database.prepare(`
          INSERT INTO user_referrals (id, referrer_user_id, referred_user_id, referral_code, reward_inr, status, booking_id)
          VALUES (?, ?, ?, ?, 250.0, 'PENDING', ?)
        `).run(referralId, validated.referrerUserId, userId || null, validated.code, bookingId);
      }
    })();

    return validated;
  } catch (err) {
    return null;
  }
}

/**
 * Retrieves referral statistics, link, and reward balance for a registered user
 */
export function getUserReferralInfo(database, userId) {
  if (!userId) throw promoError("User ID is required", 400);

  const user = database.prepare("SELECT id, name, email, referral_code FROM users WHERE id = ?").get(userId);
  if (!user) throw promoError("User not found", 404);

  let referralCode = user.referral_code;
  if (!referralCode) {
    const cleanName = (user.name || "TRVL").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
    const cleanId = String(user.id).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
    referralCode = `REF-${cleanName}${cleanId}`;
    try {
      database.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(referralCode, user.id);
    } catch {}
  }

  const referrals = database.prepare(`
    SELECT ur.*, b.ref as booking_ref, b.activity_date, b.amount_inr, u.name as referred_name
    FROM user_referrals ur
    LEFT JOIN bookings b ON ur.booking_id = b.id
    LEFT JOIN users u ON ur.referred_user_id = u.id
    WHERE ur.referrer_user_id = ?
    ORDER BY ur.created_at DESC
  `).all(userId);

  const totalCreditsEarned = referrals
    .filter((r) => r.status === "REWARDED")
    .reduce((sum, r) => sum + Number(r.reward_inr || 0), 0);

  const pendingCredits = referrals
    .filter((r) => r.status === "PENDING")
    .reduce((sum, r) => sum + Number(r.reward_inr || 0), 0);

  return {
    userId: user.id,
    userName: user.name,
    referralCode,
    referralLink: `https://ideaholiday.com/signup?ref=${referralCode}`,
    rewardPerFriendInr: 250,
    friendWelcomeDiscountInr: 250,
    totalCreditsEarned,
    pendingCredits,
    friendsInvitedCount: referrals.length,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referred_name || "Invited Traveler",
      bookingRef: r.booking_ref || "Direct Signup",
      rewardInr: r.reward_inr,
      status: r.status,
      createdAt: r.created_at,
      rewardedAt: r.rewarded_at,
    })),
  };
}

/**
 * Triggers reward release when referred booking completes
 */
export function processReferralRewardOnCompletion(database, bookingId) {
  const referral = database.prepare("SELECT * FROM user_referrals WHERE booking_id = ? AND status = 'PENDING'").get(bookingId);
  if (!referral) return null;

  database.prepare(`
    UPDATE user_referrals
    SET status = 'REWARDED', rewarded_at = datetime('now')
    WHERE id = ?
  `).run(referral.id);

  return { referralId: referral.id, rewarded: true };
}
