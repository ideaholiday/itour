import { nanoid } from "nanoid";
import db from "../db.js";
import { sendEmail } from "./emailService.js";
import { sendWhatsAppMessage } from "./whatsappService.js";
import logger from "../config/logger.js";

export const LOYALTY_TIERS = {
  EXPLORER: {
    name: "Explorer",
    minReferrals: 0,
    maxReferrals: 2,
    rewardPerFriendInr: 250,
    friendWelcomeDiscountInr: 250,
    checkoutBonusDiscountPct: 0,
    badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
    description: "Start earning by introducing friends to Idea Holiday.",
  },
  VOYAGER: {
    name: "Voyager",
    minReferrals: 3,
    maxReferrals: 9,
    rewardPerFriendInr: 350,
    friendWelcomeDiscountInr: 250,
    checkoutBonusDiscountPct: 5,
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300",
    description: "Earn 40% more per referral + 5% checkout booster discount.",
  },
  GLOBE_TROTTER: {
    name: "Globe Trotter",
    minReferrals: 10,
    maxReferrals: 999999,
    rewardPerFriendInr: 500,
    friendWelcomeDiscountInr: 350,
    checkoutBonusDiscountPct: 10,
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
    description: "Double reward rate (₹500/friend) + VIP Priority Concierge + 10% booster.",
  },
};

/**
 * Determine loyalty tier by count of successful/rewarded referrals.
 */
export function determineLoyaltyTier(rewardedCount = 0) {
  const count = Number(rewardedCount) || 0;
  if (count >= 10) return { tierKey: "GLOBE_TROTTER", ...LOYALTY_TIERS.GLOBE_TROTTER };
  if (count >= 3) return { tierKey: "VOYAGER", ...LOYALTY_TIERS.VOYAGER };
  return { tierKey: "EXPLORER", ...LOYALTY_TIERS.EXPLORER };
}

/**
 * Ensures user has a unique referral code.
 */
export function ensureUserReferralCode(database, user) {
  if (user.referral_code) return user.referral_code;

  const cleanName = (user.name || "TRAVEL").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
  const cleanId = String(user.id).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  const referralCode = `REF-${cleanName || "IH"}${cleanId || nanoid(4).toUpperCase()}`;

  try {
    database.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(referralCode, user.id);
  } catch {}

  return referralCode;
}

/**
 * Retrieve comprehensive loyalty profile for a traveler.
 */
export function getTravelerLoyaltyProfile(database = db, userId) {
  if (!userId) throw new Error("User ID is required");

  const user = database.prepare("SELECT id, name, email, phone, referral_code, wallet_balance_inr FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("User not found");

  const referralCode = ensureUserReferralCode(database, user);

  const referrals = database.prepare(`
    SELECT ur.*, b.ref as booking_ref, b.activity_date, b.amount_inr, u.name as referred_name
    FROM user_referrals ur
    LEFT JOIN bookings b ON ur.booking_id = b.id
    LEFT JOIN users u ON ur.referred_user_id = u.id
    WHERE ur.referrer_user_id = ?
    ORDER BY ur.created_at DESC
  `).all(userId) || [];

  const rewardedReferrals = referrals.filter((r) => r.status === "REWARDED");
  const pendingReferrals = referrals.filter((r) => r.status === "PENDING");

  const totalCreditsEarned = rewardedReferrals.reduce((sum, r) => sum + Number(r.reward_inr || 0), 0);
  const pendingCredits = pendingReferrals.reduce((sum, r) => sum + Number(r.reward_inr || 0), 0);

  // Compute current wallet balance from ledger if available or user column
  const currentWalletBalance = Number(user.wallet_balance_inr || 0);

  const tier = determineLoyaltyTier(rewardedReferrals.length);

  // Calculate progress to next tier
  let nextTier = null;
  let referralsToNextTier = 0;
  let progressPct = 100;

  if (tier.tierKey === "EXPLORER") {
    nextTier = LOYALTY_TIERS.VOYAGER;
    referralsToNextTier = 3 - rewardedReferrals.length;
    progressPct = Math.round((rewardedReferrals.length / 3) * 100);
  } else if (tier.tierKey === "VOYAGER") {
    nextTier = LOYALTY_TIERS.GLOBE_TROTTER;
    referralsToNextTier = 10 - rewardedReferrals.length;
    progressPct = Math.round(((rewardedReferrals.length - 3) / 7) * 100);
  }

  const transactions = database.prepare(`
    SELECT * FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId) || [];

  const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://ideaholiday.com";
  const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    referralCode,
    referralLink,
    walletBalanceInr: currentWalletBalance,
    totalCreditsEarned,
    pendingCredits,
    friendsInvitedCount: referrals.length,
    successfulReferralsCount: rewardedReferrals.length,
    tier,
    nextTier,
    referralsToNextTier,
    progressPct,
    referrals: referrals.map((r) => ({
      id: r.id,
      referredName: r.referred_name || "Invited Traveler",
      bookingRef: r.booking_ref || "Signup",
      rewardInr: r.reward_inr,
      status: r.status,
      createdAt: r.created_at,
      rewardedAt: r.rewarded_at,
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amountInr: t.amount_inr,
      balanceAfterInr: t.balance_after_inr,
      referenceId: t.reference_id,
      description: t.description,
      createdAt: t.created_at,
    })),
  };
}

/**
 * Calculates wallet discount applicability for a booking cart.
 * Maximum allowable discount is 50% of the booking total (or max ₹2,000).
 */
export function applyWalletCreditsToCheckout(database = db, userId, { bookingAmountInr, requestedCreditInr }) {
  if (!userId) throw new Error("User ID is required");

  const amount = Number(bookingAmountInr) || 0;
  if (amount <= 0) throw new Error("Valid booking amount is required");

  const user = database.prepare("SELECT id, wallet_balance_inr FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("User not found");

  const availableBalance = Number(user.wallet_balance_inr || 0);
  if (availableBalance <= 0) {
    return {
      applied: false,
      walletBalanceInr: 0,
      creditDiscountInr: 0,
      payableAmountInr: amount,
      message: "No wallet credits available.",
    };
  }

  // Max 50% of order total, capped at ₹2,000 per order
  const maxAllowedDiscount = Math.min(amount * 0.5, 2000, availableBalance);

  let creditToApply = requestedCreditInr !== undefined
    ? Math.min(Number(requestedCreditInr) || 0, maxAllowedDiscount)
    : maxAllowedDiscount;

  creditToApply = Math.max(0, Math.round(creditToApply));

  const payableAmountInr = Math.max(0, amount - creditToApply);

  return {
    applied: creditToApply > 0,
    walletBalanceInr: availableBalance,
    creditDiscountInr: creditToApply,
    remainingWalletBalanceInr: availableBalance - creditToApply,
    originalAmountInr: amount,
    payableAmountInr,
    maxAllowedDiscountInr: maxAllowedDiscount,
  };
}

/**
 * Deducts wallet credits upon booking creation/confirmation.
 */
export function deductWalletCreditsOnBooking(database = db, userId, bookingId, creditAmount) {
  const amountToDeduct = Number(creditAmount) || 0;
  if (amountToDeduct <= 0) return null;

  const user = database.prepare("SELECT id, wallet_balance_inr FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("User not found for wallet deduction");

  const currentBalance = Number(user.wallet_balance_inr || 0);
  if (currentBalance < amountToDeduct) {
    throw new Error("Insufficient wallet balance");
  }

  const newBalance = currentBalance - amountToDeduct;

  database.transaction(() => {
    database.prepare("UPDATE users SET wallet_balance_inr = ? WHERE id = ?").run(newBalance, userId);

    database.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, type, amount_inr, balance_after_inr, reference_id, description, created_at
      ) VALUES (?, ?, 'BOOKING_REDEMPTION', ?, ?, ?, ?, datetime('now'))
    `).run(
      `wtx_${nanoid(12)}`,
      userId,
      -amountToDeduct,
      newBalance,
      bookingId,
      `Redeemed ₹${amountToDeduct} credits on booking #${bookingId}`,
    );
  })();

  return {
    deducted: true,
    amountDeducted: amountToDeduct,
    newBalance,
  };
}

/**
 * Credits referral reward when the referred traveler completes their trip.
 */
export async function creditReferralRewardOnCompletion(database = db, bookingId, { sendNotifications = true } = {}) {
  const referral = database.prepare("SELECT * FROM user_referrals WHERE booking_id = ? AND status = 'PENDING'").get(bookingId);
  if (!referral) return null;

  const referrer = database.prepare("SELECT id, name, email, phone, wallet_balance_inr FROM users WHERE id = ?").get(referral.referrer_user_id);
  if (!referrer) return null;

  // Compute referrer's tier rate at the time of completion
  const previousRewardedCount = database.prepare("SELECT COUNT(*) as count FROM user_referrals WHERE referrer_user_id = ? AND status = 'REWARDED'").get(referrer.id)?.count || 0;
  const tier = determineLoyaltyTier(previousRewardedCount);
  const rewardAmount = tier.rewardPerFriendInr || 250;

  const currentBalance = Number(referrer.wallet_balance_inr || 0);
  const newBalance = currentBalance + rewardAmount;

  database.transaction(() => {
    // 1. Update referral status
    database.prepare(`
      UPDATE user_referrals
      SET status = 'REWARDED',
          reward_inr = ?,
          rewarded_at = datetime('now')
      WHERE id = ?
    `).run(rewardAmount, referral.id);

    // 2. Increment referrer wallet
    database.prepare("UPDATE users SET wallet_balance_inr = ? WHERE id = ?").run(newBalance, referrer.id);

    // 3. Log transaction
    database.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, type, amount_inr, balance_after_inr, reference_id, description, created_at
      ) VALUES (?, ?, 'REFERRAL_REWARD', ?, ?, ?, ?, datetime('now'))
    `).run(
      `wtx_${nanoid(12)}`,
      referrer.id,
      rewardAmount,
      newBalance,
      referral.id,
      `Earned ₹${rewardAmount} for successful friend referral (#${bookingId})`,
    );
  })();

  // 4. Send notifications
  if (sendNotifications) {
    const subject = `Congratulations! You earned ₹${rewardAmount} in Idea Holiday travel credits! 🎉`;
    const message = `Hello ${referrer.name || "Traveler"},\n\nYour friend just completed their experience with Idea Holiday! We have credited ₹${rewardAmount} directly to your Idea Holiday wallet.\n\nYour current wallet balance is: ₹${newBalance}.\n\nYou can use these credits immediately toward your next tour, sightseeing booking, or airport cab at https://ideaholiday.com.\n\nKeep sharing and keep earning!`;

    try {
      if (referrer.email) {
        await sendEmail({
          to: referrer.email,
          recipientName: referrer.name || "Traveler",
          recipientRole: "TRAVELER",
          eventType: "REFERRAL_REWARD_CREDITED",
          eventKey: `referral:reward:${referral.id}`,
          subject,
          text: message,
        }, { database });
      }

      if (referrer.phone) {
        await sendWhatsAppMessage({
          to: referrer.phone,
          recipientName: referrer.name || "Traveler",
          recipientRole: "TRAVELER",
          eventType: "REFERRAL_REWARD_CREDITED",
          eventKey: `referral:reward:wa:${referral.id}`,
          text: `🎉 *₹${rewardAmount} Travel Credits Earned!*\n\nHi ${referrer.name || "Traveler"}, your friend completed their trip! Your Idea Holiday wallet balance is now ₹${newBalance}.\n\nBook your next adventure: https://ideaholiday.com`,
        }, { database });
      }
    } catch (notifErr) {
      logger.warn("Referral reward notification failed", { error: notifErr.message, referrerId: referrer.id });
    }
  }

  return {
    referralId: referral.id,
    rewardAmount,
    newBalance,
  };
}

/**
 * Public referral code info lookup.
 */
export function getPublicReferralInfo(database = db, referralCode) {
  if (!referralCode) throw new Error("Referral code is required");

  const cleanCode = String(referralCode).trim().toUpperCase();
  const referrer = database.prepare("SELECT id, name, referral_code FROM users WHERE referral_code = ?").get(cleanCode);

  if (!referrer) {
    return {
      valid: false,
      error: "Invalid or expired referral code",
    };
  }

  const rewardedCount = database.prepare("SELECT COUNT(*) as count FROM user_referrals WHERE referrer_user_id = ? AND status = 'REWARDED'").get(referrer.id)?.count || 0;
  const tier = determineLoyaltyTier(rewardedCount);

  return {
    valid: true,
    referralCode: cleanCode,
    referrerName: referrer.name ? referrer.name.split(" ")[0] : "A friend",
    welcomeDiscountInr: tier.friendWelcomeDiscountInr || 250,
    message: `${referrer.name ? referrer.name.split(" ")[0] : "Your friend"} has gifted you ₹${tier.friendWelcomeDiscountInr || 250} off your first Idea Holiday adventure!`,
  };
}

/**
 * Leaderboard of top referrers for Admin/Ops.
 */
export function getLoyaltyLeaderboard(database = db) {
  const topReferrers = database.prepare(`
    SELECT u.id, u.name, u.email, u.referral_code, u.wallet_balance_inr,
           COUNT(ur.id) as total_invites,
           SUM(CASE WHEN ur.status = 'REWARDED' THEN 1 ELSE 0 END) as successful_referrals,
           SUM(CASE WHEN ur.status = 'REWARDED' THEN ur.reward_inr ELSE 0 END) as total_earned_inr
    FROM users u
    INNER JOIN user_referrals ur ON u.id = ur.referrer_user_id
    GROUP BY u.id
    ORDER BY successful_referrals DESC, total_earned_inr DESC
    LIMIT 20
  `).all() || [];

  const summary = database.prepare(`
    SELECT
      COUNT(DISTINCT referrer_user_id) as total_referrers,
      COUNT(id) as total_referral_cases,
      SUM(CASE WHEN status = 'REWARDED' THEN 1 ELSE 0 END) as total_rewarded_trips,
      SUM(CASE WHEN status = 'REWARDED' THEN reward_inr ELSE 0 END) as total_payout_inr
    FROM user_referrals
  `).get() || {};

  return {
    summary: {
      totalReferrers: summary.total_referrers || 0,
      totalReferralCases: summary.total_referral_cases || 0,
      totalRewardedTrips: summary.total_rewarded_trips || 0,
      totalPayoutInr: summary.total_payout_inr || 0,
    },
    topReferrers: topReferrers.map((r) => ({
      id: r.id,
      name: r.name || "Anonymous",
      email: r.email,
      referralCode: r.referral_code,
      walletBalanceInr: r.wallet_balance_inr || 0,
      totalInvites: r.total_invites,
      successfulReferrals: r.successful_referrals || 0,
      totalEarnedInr: r.total_earned_inr || 0,
      tier: determineLoyaltyTier(r.successful_referrals),
    })),
  };
}
