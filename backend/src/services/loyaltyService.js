import { nanoid } from "nanoid";
import db from "../db.js";
import {
  referralPolicy,
  buildReferralLink,
  findReferrerByCode,
  getReferralSummary,
  redeemWalletCredit,
} from "./referralService.js";

/**
 * Recognition tiers. Every referrer earns the same share of commission — tiers
 * are a badge for how many friends have actually travelled, not a different
 * rate, because a rate that grows with volume is a cost that grows with volume.
 */
export const LOYALTY_TIERS = {
  EXPLORER: {
    name: "Explorer",
    minReferrals: 0,
    maxReferrals: 2,
    badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
    description: "Invite friends and earn on every trip they take.",
  },
  VOYAGER: {
    name: "Voyager",
    minReferrals: 3,
    maxReferrals: 9,
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300",
    description: "Three friends have travelled with Idea Holiday because of you.",
  },
  GLOBE_TROTTER: {
    name: "Globe Trotter",
    minReferrals: 10,
    maxReferrals: 999999,
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300",
    description: "Ten or more friends have travelled with Idea Holiday because of you.",
  },
};

/** Tier by the number of referred friends with at least one paid trip. */
export function determineLoyaltyTier(travelledFriends = 0) {
  const count = Number(travelledFriends) || 0;
  if (count >= 10) return { tierKey: "GLOBE_TROTTER", ...LOYALTY_TIERS.GLOBE_TROTTER };
  if (count >= 3) return { tierKey: "VOYAGER", ...LOYALTY_TIERS.VOYAGER };
  return { tierKey: "EXPLORER", ...LOYALTY_TIERS.EXPLORER };
}

/**
 * Ensures the user has a referral code. Codes are looked up by exact match, so a
 * collision between two people with the same name prefix gets a random suffix.
 */
export function ensureUserReferralCode(database, user) {
  if (user.referral_code) return user.referral_code;

  const cleanName = (user.name || "TRAVEL").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
  const cleanId = String(user.id).replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  let referralCode = `REF-${cleanName || "IH"}${cleanId || nanoid(4).toUpperCase()}`;
  for (let attempt = 0; attempt < 5 && findReferrerByCode(database, referralCode); attempt += 1) {
    referralCode = `REF-${cleanName || "IH"}${nanoid(4).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  }

  try {
    database.prepare("UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL").run(referralCode, user.id);
  } catch {}

  return database.prepare("SELECT referral_code FROM users WHERE id = ?").get(user.id)?.referral_code || referralCode;
}

/**
 * Everything the Travel & Earn page shows a signed-in traveler.
 */
export function getTravelerLoyaltyProfile(database = db, userId) {
  if (!userId) throw new Error("User ID is required");

  const user = database.prepare("SELECT id, name, email, phone, referral_code, wallet_balance_inr FROM users WHERE id = ?").get(userId);
  if (!user) throw new Error("User not found");

  const referralCode = ensureUserReferralCode(database, user);
  const summary = getReferralSummary(database, userId);

  const travelledFriends = summary.friends.filter((friend) => friend.paidTrips > 0).length;
  const tier = determineLoyaltyTier(travelledFriends);
  let nextTier = null;
  let referralsToNextTier = 0;
  let progressPct = 100;
  if (tier.tierKey === "EXPLORER") {
    nextTier = LOYALTY_TIERS.VOYAGER;
    referralsToNextTier = 3 - travelledFriends;
    progressPct = Math.round((travelledFriends / 3) * 100);
  } else if (tier.tierKey === "VOYAGER") {
    nextTier = LOYALTY_TIERS.GLOBE_TROTTER;
    referralsToNextTier = 10 - travelledFriends;
    progressPct = Math.round(((travelledFriends - 3) / 7) * 100);
  }

  const transactions = database.prepare(`
    SELECT * FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(userId) || [];

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    referralCode,
    referralLink: buildReferralLink(referralCode),
    walletBalanceInr: summary.wallet.balanceInr,
    expiringSoonInr: summary.wallet.expiringSoonInr,
    nextExpiryAt: summary.wallet.nextExpiryAt,
    clawbackPendingInr: summary.wallet.clawbackPendingInr,
    totalCreditsEarned: summary.totals.creditedInr,
    clearingCredits: summary.totals.clearingInr,
    upcomingCredits: summary.totals.upcomingInr,
    inReviewCredits: summary.totals.inReviewInr,
    // Kept for older clients: everything earned but not yet in the wallet.
    pendingCredits: summary.totals.clearingInr + summary.totals.upcomingInr + summary.totals.inReviewInr,
    friendsInvitedCount: summary.friends.length,
    successfulReferralsCount: travelledFriends,
    tier,
    nextTier,
    referralsToNextTier,
    progressPct,
    policy: summary.policy,
    referredBy: summary.referredBy,
    friends: summary.friends,
    rewards: summary.rewards,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.entry_type || t.type,
      amountInr: t.amount_inr,
      balanceAfterInr: t.balance_after_inr,
      referenceId: t.reference_id,
      description: t.description,
      expiresAt: t.expires_at || null,
      createdAt: t.created_at,
    })),
  };
}

/**
 * How much wallet credit a booking may use: up to 50% of what is left after
 * other discounts, at most ₹2,000, and never more than the balance.
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

  const { walletMaxShare, walletMaxPerBookingInr } = referralPolicy(database);
  const maxAllowedDiscount = Math.floor(Math.min(amount * walletMaxShare, walletMaxPerBookingInr, availableBalance));

  let creditToApply = requestedCreditInr !== undefined
    ? Math.min(Number(requestedCreditInr) || 0, maxAllowedDiscount)
    : maxAllowedDiscount;

  creditToApply = Math.max(0, Math.floor(creditToApply));

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
 * Spends wallet credit on a booking through the ledger. Throws when the balance
 * is short, so the caller's booking transaction rolls back instead of keeping a
 * discount nobody paid for.
 */
export function deductWalletCreditsOnBooking(database = db, userId, bookingId, creditAmount) {
  const amountToDeduct = Number(creditAmount) || 0;
  if (amountToDeduct <= 0) return null;

  let posted = null;
  database.transaction(() => {
    posted = redeemWalletCredit(database, { userId, bookingId, amountInr: amountToDeduct });
  })();

  return {
    deducted: true,
    amountDeducted: amountToDeduct,
    newBalance: posted.balanceAfterInr,
  };
}

/**
 * What a shared referral link says about itself. Only the referrer's first name
 * is shown: the link is public, and nothing else about them should be.
 */
export function getPublicReferralInfo(database = db, referralCode) {
  if (!referralCode) throw new Error("Referral code is required");

  const referrer = findReferrerByCode(database, referralCode);
  if (!referrer) {
    return {
      valid: false,
      error: "Invalid or expired referral code",
    };
  }

  const name = referrer.name ? referrer.name.split(" ")[0] : "A friend";
  const discountPct = Math.round(referralPolicy(database).friendDiscountRate * 100);
  return {
    valid: true,
    referralCode: referrer.referral_code,
    referrerName: name,
    friendDiscountPct: discountPct,
    message: `${name} invited you to Idea Holiday. Your first trip comes with a friend discount, shown at checkout before you pay.`,
  };
}

/**
 * Top referrers by friends who have travelled, for admin and operations.
 */
export function getLoyaltyLeaderboard(database = db) {
  const topReferrers = database.prepare(`
    SELECT u.id, u.name, u.email, u.referral_code, u.wallet_balance_inr,
      COUNT(DISTINCT rel.id) AS total_invites,
      COUNT(DISTINCT CASE WHEN rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED') AND b.payment_status = 'PAID' THEN rel.id END) AS successful_referrals,
      COALESCE(SUM(CASE WHEN rr.status = 'CLEARED' THEN rr.referrer_amount_inr ELSE 0 END), 0) AS total_earned_inr
    FROM users u
    INNER JOIN referral_relationships rel ON rel.referrer_user_id = u.id AND rel.status != 'BLOCKED'
    LEFT JOIN referral_rewards rr ON rr.relationship_id = rel.id
    LEFT JOIN bookings b ON b.id = rr.booking_id
    GROUP BY u.id, u.name, u.email, u.referral_code, u.wallet_balance_inr
    ORDER BY successful_referrals DESC, total_earned_inr DESC
    LIMIT 20
  `).all() || [];

  const summary = database.prepare(`
    SELECT
      (SELECT COUNT(DISTINCT referrer_user_id) FROM referral_relationships WHERE status != 'BLOCKED') AS total_referrers,
      (SELECT COUNT(*) FROM referral_relationships WHERE status != 'BLOCKED') AS total_referral_cases,
      (SELECT COUNT(*) FROM referral_rewards WHERE status = 'CLEARED') AS total_rewarded_trips,
      (SELECT COALESCE(SUM(referrer_amount_inr), 0) FROM referral_rewards WHERE status = 'CLEARED') AS total_payout_inr
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
