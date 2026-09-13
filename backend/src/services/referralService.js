/**
 * Travel & Earn — traveler referrals paid out of each booking's own margin.
 *
 * The rule that keeps the program from ever costing cash: everything given away
 * on a booking is a fixed share of that booking's `commission_amount`.
 *
 *   friend's first paid trip   friend gets 10% of commission off at checkout
 *   every trip, 24 months      referrer earns 10% of commission as wallet credit
 *
 * Credit can only be spent on Idea Holiday bookings and never withdrawn, so it
 * is a discount rather than a payout. It reaches the wallet only after the trip
 * is completed and a refund window has passed, and it is taken back in full if
 * the booking is refunded.
 *
 * Money moves only through `postWalletEntry`, so `users.wallet_balance_inr` is
 * always the sum of the referrer's `wallet_transactions` rows.
 *
 * See docs/BUSINESS_RULES.md §10 and migrations/030_referral_program_v3.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";

export const REFERRAL_POLICY = Object.freeze({
  /** Share of the booking's commission the friend gets off their first paid trip. */
  friendDiscountRate: 0.1,
  /** Share of the booking's commission the referrer earns, on every trip. */
  referrerRate: 0.1,
  /** How long a friend's bookings keep earning for the referrer. */
  earningWindowMonths: 24,
  /** How long a clicked referral link keeps counting before signup. */
  attributionWindowDays: 30,
  /** Days after trip completion before a reward is spendable. */
  clearingHoldDays: 7,
  /** Months before unspent referral credit lapses. */
  creditExpiryMonths: 12,
  /** Remind the traveler this many days before credit lapses. */
  expiryReminderDays: 30,
  /** New referred signups per referrer per 24h before review is required. */
  maxSignupsPerDay: 5,
  /** Credit a referrer may clear per 30 days before further rewards wait for review. */
  maxClearedPer30DaysInr: 5000,
});

const DAY_MS = 86_400_000;
const LIVE_REWARD_STATUSES = ["ACCRUED", "HELD_FOR_REVIEW", "CLEARED"];

function referralError(message, status = 400, code = undefined) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

/** `YYYY-MM-DD HH:MM:SS` in UTC, the format `datetime('now')` writes. */
export function sqlTimestamp(date = new Date()) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

function parseTimestamp(value) {
  if (!value) return null;
  const text = String(value);
  return new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const floorRupees = (value) => Math.max(0, Math.floor(Number(value) || 0));
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || null;

// ---------------------------------------------------------------------------
// Identity normalisation
// ---------------------------------------------------------------------------

/** Indian mobile numbers compare on their last 10 digits, whatever prefix was typed. */
export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * The mailbox an address actually delivers to: lower-cased, `+tag` removed, and
 * for Gmail the dots removed too, because `a.b+x@gmail.com` is `ab@gmail.com`.
 */
export function normalizeEmailIdentity(value) {
  const email = String(value || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return email || null;
  let local = email.slice(0, at).split("+")[0];
  let domain = email.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

export function normalizeReferralCode(code) {
  return String(code || "").trim().toUpperCase();
}

export function isTravelerReferralCode(code) {
  return normalizeReferralCode(code).startsWith("REF-");
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * What a booking gives away, as whole rupees rounded down. `commissionInr` is the
 * booking's own commission; nothing here is ever a flat amount.
 */
export function computeReferralAmounts({ commissionInr, isFirstTrip, policy = REFERRAL_POLICY }) {
  const marginInr = money(Math.max(0, Number(commissionInr) || 0));
  const refereeRate = isFirstTrip ? policy.friendDiscountRate : 0;
  return {
    marginInr,
    refereeRate,
    referrerRate: policy.referrerRate,
    refereeAmountInr: floorRupees(marginInr * refereeRate),
    referrerAmountInr: floorRupees(marginInr * policy.referrerRate),
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findReferrerByCode(database, code) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  // `SELECT *` so validating a code needs only the users table, not the v3
  // columns, on a database that has not run migration 030 yet.
  const row = database.prepare("SELECT * FROM users WHERE referral_code = ?").get(normalized);
  if (!row) return null;
  const { id, name, email, phone, referral_code: referralCode, signup_visitor_id: signupVisitorId = null } = row;
  return { id, name, email, phone, referral_code: referralCode, signup_visitor_id: signupVisitorId };
}

function getUser(database, userId) {
  if (!userId) return null;
  return database.prepare(
    "SELECT id, name, email, phone, referral_code, signup_visitor_id, wallet_balance_inr, wallet_clawback_pending_inr FROM users WHERE id = ?",
  ).get(userId) || null;
}

export function getRelationshipForUser(database, userId) {
  if (!userId) return null;
  return database.prepare("SELECT * FROM referral_relationships WHERE referred_user_id = ?").get(userId) || null;
}

function relationshipIsEarning(relationship, now) {
  if (!relationship || relationship.status !== "ACTIVE") return false;
  const until = parseTimestamp(relationship.earns_until);
  return !until || until.getTime() > new Date(now).getTime();
}

/** A friend's first trip is their first *paid* trip; abandoned checkouts do not use it up. */
function hasPaidReferralTrip(database, relationshipId, excludeBookingId = null) {
  const row = database.prepare(`
    SELECT 1 FROM referral_rewards rr
    JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.relationship_id = ?
      AND rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED')
      AND b.payment_status = 'PAID'
      AND rr.booking_id != ?
    LIMIT 1
  `).get(relationshipId, excludeBookingId || "");
  return Boolean(row);
}

function recordSignal(database, { userId, referrerUserId = null, relationshipId = null, rewardId = null, signal, detail = null, action }) {
  database.prepare(`
    INSERT INTO referral_fraud_signals (id, user_id, referrer_user_id, relationship_id, reward_id, signal, detail, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`rfs_${nanoid(12)}`, userId, referrerUserId, relationshipId, rewardId, signal, detail, action, sqlTimestamp());
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * Records that a visitor opened a referral link. The click keeps the referral
 * alive until the visitor signs up, even if the `?ref=` is lost on the way.
 */
export function trackReferralClick(database, { referralCode, visitorId, channel = null, landingPath = null, userId = null, now = new Date() }) {
  if (!visitorId) throw referralError("A visitor token is required to track a referral", 400);
  const referrer = findReferrerByCode(database, referralCode);
  if (!referrer) return { tracked: false, reason: "UNKNOWN_CODE" };
  if (userId && userId === referrer.id) return { tracked: false, reason: "SELF" };

  const id = `rat_${nanoid(12)}`;
  const expiresAt = sqlTimestamp(addDays(now, REFERRAL_POLICY.attributionWindowDays));
  database.prepare(`
    INSERT INTO referral_attributions (id, visitor_id, referrer_user_id, referral_code, channel, landing_path, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(visitorId).slice(0, 120),
    referrer.id,
    referrer.referral_code,
    channel ? String(channel).toUpperCase().slice(0, 20) : null,
    landingPath ? String(landingPath).slice(0, 300) : null,
    expiresAt,
    sqlTimestamp(now),
  );

  return { tracked: true, attributionId: id, attributionExpiresAt: expiresAt, referrerFirstName: firstName(referrer.name) };
}

/** The latest unexpired, unused click for this visitor. Last click wins. */
export function resolveReferralAttribution(database, { visitorId, now = new Date() }) {
  if (!visitorId) return null;
  return database.prepare(`
    SELECT * FROM referral_attributions
    WHERE visitor_id = ? AND expires_at > ? AND consumed_user_id IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(String(visitorId), sqlTimestamp(now)) || null;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

function travelerHasPaidBooking(database, { userId, phone, email, excludeBookingId }) {
  const phoneKey = normalizePhone(phone);
  const emailKey = String(email || "").trim().toLowerCase();
  const row = database.prepare(`
    SELECT 1 FROM bookings
    WHERE payment_status = 'PAID'
      AND id != ?
      AND (
        user_id = ?
        OR (? != '' AND LOWER(traveler_email) = ?)
        OR (? != '' AND traveler_phone LIKE ?)
      )
    LIMIT 1
  `).get(
    excludeBookingId || "",
    userId || "",
    emailKey, emailKey,
    phoneKey || "", phoneKey ? `%${phoneKey}` : "",
  );
  return Boolean(row);
}

/**
 * Whether `referredUser` may be referred by `referrer`. Returns the first rule
 * that fails, and whether that failure should block the pairing permanently.
 */
export function evaluateReferralEligibility(database, { referrer, referredUser, visitorId = null, travelerPhone = null, travelerEmail = null, excludeBookingId = null }) {
  if (!referrer) return { ok: false, signal: "UNKNOWN_CODE", block: false };
  if (!referredUser) return { ok: false, signal: "UNKNOWN_TRAVELER", block: false };

  if (referrer.id === referredUser.id) {
    return { ok: false, signal: "SELF_REFERRAL", block: false, detail: "Referrer and traveler are the same account" };
  }

  const referrerPhone = normalizePhone(referrer.phone);
  const friendPhones = [referredUser.phone, travelerPhone].map(normalizePhone).filter(Boolean);
  if (referrerPhone && friendPhones.includes(referrerPhone)) {
    return { ok: false, signal: "SAME_PHONE", block: true, detail: `Phone ending ${referrerPhone.slice(-4)}` };
  }

  const referrerEmail = normalizeEmailIdentity(referrer.email);
  const friendEmails = [referredUser.email, travelerEmail].map(normalizeEmailIdentity).filter(Boolean);
  if (referrerEmail && friendEmails.includes(referrerEmail)) {
    return { ok: false, signal: "EMAIL_ALIAS", block: true, detail: "Same mailbox after removing aliases" };
  }

  const friendVisitors = [visitorId, referredUser.signup_visitor_id].filter(Boolean);
  if (referrer.signup_visitor_id && friendVisitors.includes(referrer.signup_visitor_id)) {
    return { ok: false, signal: "SAME_DEVICE", block: true, detail: "Signed up from the referrer's browser" };
  }

  if (travelerHasPaidBooking(database, {
    userId: referredUser.id,
    phone: travelerPhone || referredUser.phone,
    email: travelerEmail || referredUser.email,
    excludeBookingId,
  })) {
    return { ok: false, signal: "NOT_NEW_TRAVELER", block: false, detail: "Traveler has booked with us before" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

/**
 * Binds a traveler to the person who referred them. A typed code wins over a
 * remembered click; with no code, the visitor's latest click is used.
 *
 * Call inside the caller's transaction when it is part of a larger write.
 */
export function establishReferralRelationship(database, {
  referredUserId,
  referralCode = null,
  visitorId = null,
  source = "SIGNUP_LINK",
  travelerPhone = null,
  travelerEmail = null,
  excludeBookingId = null,
  now = new Date(),
}) {
  const existing = getRelationshipForUser(database, referredUserId);
  if (existing) return { established: false, reason: "ALREADY_REFERRED", relationship: existing };

  const referredUser = getUser(database, referredUserId);
  if (!referredUser) return { established: false, reason: "UNKNOWN_TRAVELER" };

  const attribution = resolveReferralAttribution(database, { visitorId, now });
  let referrer = referralCode ? findReferrerByCode(database, referralCode) : null;
  if (!referrer && attribution) referrer = getUser(database, attribution.referrer_user_id);
  if (!referrer) return { established: false, reason: referralCode ? "UNKNOWN_CODE" : "NO_REFERRAL" };

  const eligibility = evaluateReferralEligibility(database, {
    referrer, referredUser, visitorId, travelerPhone, travelerEmail, excludeBookingId,
  });

  if (!eligibility.ok) {
    if (eligibility.signal === "SELF_REFERRAL" || eligibility.signal === "NOT_NEW_TRAVELER") {
      recordSignal(database, { userId: referredUser.id, referrerUserId: referrer.id, signal: eligibility.signal, detail: eligibility.detail, action: "LOGGED" });
      return { established: false, reason: eligibility.signal };
    }
    // A pairing that looks like one person on two accounts is stored BLOCKED, so
    // the account cannot keep trying other codes; operations can reopen it.
    const blockedId = `rrel_${nanoid(12)}`;
    database.prepare(`
      INSERT INTO referral_relationships (id, referrer_user_id, referred_user_id, referral_code, attribution_id, source, established_at, earns_until, status, blocked_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BLOCKED', ?)
    `).run(blockedId, referrer.id, referredUser.id, referrer.referral_code, attribution?.id || null, source,
      sqlTimestamp(now), sqlTimestamp(addMonths(now, REFERRAL_POLICY.earningWindowMonths)), eligibility.signal);
    recordSignal(database, { userId: referredUser.id, referrerUserId: referrer.id, relationshipId: blockedId, signal: eligibility.signal, detail: eligibility.detail, action: "BLOCKED" });
    return { established: false, reason: eligibility.signal, relationship: getRelationshipForUser(database, referredUser.id) };
  }

  const since = sqlTimestamp(addDays(now, -1));
  const recentSignups = database.prepare(
    "SELECT COUNT(*) AS count FROM referral_relationships WHERE referrer_user_id = ? AND established_at >= ?",
  ).get(referrer.id, since)?.count || 0;
  const requiresReview = recentSignups >= REFERRAL_POLICY.maxSignupsPerDay ? 1 : 0;

  const id = `rrel_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO referral_relationships (id, referrer_user_id, referred_user_id, referral_code, attribution_id, source, established_at, earns_until, status, requires_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(id, referrer.id, referredUser.id, referrer.referral_code,
    attribution && attribution.referrer_user_id === referrer.id ? attribution.id : null,
    source, sqlTimestamp(now), sqlTimestamp(addMonths(now, REFERRAL_POLICY.earningWindowMonths)), requiresReview);

  if (attribution && attribution.referrer_user_id === referrer.id) {
    database.prepare("UPDATE referral_attributions SET consumed_user_id = ?, consumed_at = ? WHERE id = ?")
      .run(referredUser.id, sqlTimestamp(now), attribution.id);
  }
  if (requiresReview) {
    recordSignal(database, {
      userId: referredUser.id, referrerUserId: referrer.id, relationshipId: id, signal: "SIGNUP_VELOCITY",
      detail: `${recentSignups + 1} referred signups in 24h`, action: "HELD_FOR_REVIEW",
    });
  }

  return { established: true, relationship: getRelationshipForUser(database, referredUser.id) };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * The friend discount this traveler would get on a booking with this commission.
 * Read-only: nothing is recorded until the booking is created.
 */
export function previewReferralBenefit(database, {
  userId = null,
  referralCode = null,
  visitorId = null,
  commissionInr,
  travelerPhone = null,
  travelerEmail = null,
  now = new Date(),
}) {
  const none = (reason) => ({ eligible: false, discountInr: 0, reason, referrerFirstName: null });
  const relationship = getRelationshipForUser(database, userId);

  if (relationship) {
    if (!relationshipIsEarning(relationship, now)) return none(relationship.status === "BLOCKED" ? "BLOCKED" : "EXPIRED");
    const referrer = getUser(database, relationship.referrer_user_id);
    if (hasPaidReferralTrip(database, relationship.id)) {
      return { ...none("FIRST_TRIP_USED"), referrerFirstName: firstName(referrer?.name) };
    }
    const { refereeAmountInr } = computeReferralAmounts({ commissionInr, isFirstTrip: true });
    return { eligible: refereeAmountInr > 0, discountInr: refereeAmountInr, reason: null, referrerFirstName: firstName(referrer?.name) };
  }

  let referrer = referralCode ? findReferrerByCode(database, referralCode) : null;
  if (!referrer && visitorId) {
    const attribution = resolveReferralAttribution(database, { visitorId, now });
    if (attribution) referrer = getUser(database, attribution.referrer_user_id);
  }
  if (!referrer) return none(referralCode ? "UNKNOWN_CODE" : "NO_REFERRAL");

  // A signed-out visitor can only be checked against the code itself.
  const referredUser = getUser(database, userId) || { id: `anon_${visitorId || "visitor"}`, phone: travelerPhone, email: travelerEmail };
  const eligibility = evaluateReferralEligibility(database, { referrer, referredUser, visitorId, travelerPhone, travelerEmail });
  if (!eligibility.ok) return { ...none(eligibility.signal), referrerFirstName: firstName(referrer.name) };

  const { refereeAmountInr } = computeReferralAmounts({ commissionInr, isFirstTrip: true });
  return { eligible: refereeAmountInr > 0, discountInr: refereeAmountInr, reason: null, referrerFirstName: firstName(referrer.name) };
}

/**
 * Attaches a booking to the traveler's referral, creating the relationship from
 * a checkout code if there is none yet, and records the reward as ACCRUED.
 *
 * `quoteCommissionInr` prices the friend discount (it is what checkout showed);
 * `bookingCommissionInr` prices the referrer's reward (it is what we earn).
 * Must run inside the booking-creation transaction.
 */
export function applyReferralToBooking(database, {
  bookingId,
  userId,
  referralCode = null,
  visitorId = null,
  quoteCommissionInr,
  bookingCommissionInr,
  travelerPhone = null,
  travelerEmail = null,
  now = new Date(),
}) {
  if (!bookingId || !userId) return { applied: false, discountInr: 0 };

  let relationship = getRelationshipForUser(database, userId);
  if (!relationship && (isTravelerReferralCode(referralCode) || visitorId)) {
    const result = establishReferralRelationship(database, {
      referredUserId: userId,
      referralCode: isTravelerReferralCode(referralCode) ? referralCode : null,
      visitorId,
      source: "CHECKOUT_CODE",
      travelerPhone,
      travelerEmail,
      excludeBookingId: bookingId,
      now,
    });
    relationship = result.established ? result.relationship : null;
  }
  if (!relationshipIsEarning(relationship, now)) return { applied: false, discountInr: 0 };

  const referrer = getUser(database, relationship.referrer_user_id);
  // The phone typed on this booking may be the referrer's own even when the
  // account's is not: the referrer is booking for themselves on a second login.
  const bookingPhone = normalizePhone(travelerPhone);
  if (bookingPhone && bookingPhone === normalizePhone(referrer?.phone)) {
    recordSignal(database, {
      userId, referrerUserId: referrer.id, relationshipId: relationship.id, signal: "SAME_PHONE",
      detail: `Booking ${bookingId} uses the referrer's phone`, action: "BLOCKED",
    });
    return { applied: false, discountInr: 0 };
  }

  const isFirstTrip = !hasPaidReferralTrip(database, relationship.id, bookingId);
  const friend = computeReferralAmounts({ commissionInr: quoteCommissionInr, isFirstTrip });
  const earned = computeReferralAmounts({ commissionInr: bookingCommissionInr, isFirstTrip: false });
  // The discount can never exceed what this booking actually earns.
  const discountInr = Math.min(friend.refereeAmountInr, floorRupees(bookingCommissionInr));
  const paidTrips = database.prepare(`
    SELECT COUNT(*) AS count FROM referral_rewards rr JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.relationship_id = ? AND rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED') AND b.payment_status = 'PAID'
  `).get(relationship.id)?.count || 0;

  const rewardId = `rrw_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO referral_rewards (
      id, relationship_id, referrer_user_id, referred_user_id, booking_id, sequence,
      booking_margin_inr, referee_rate, referrer_rate, referee_amount_inr, referrer_amount_inr,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACCRUED', ?)
  `).run(
    rewardId, relationship.id, relationship.referrer_user_id, userId, bookingId, paidTrips + 1,
    earned.marginInr, friend.refereeRate, earned.referrerRate, discountInr, earned.referrerAmountInr,
    sqlTimestamp(now),
  );

  return { applied: true, rewardId, discountInr, referrerAmountInr: earned.referrerAmountInr, isFirstTrip, referrerFirstName: firstName(referrer?.name) };
}

// ---------------------------------------------------------------------------
// Wallet ledger
// ---------------------------------------------------------------------------

/** Spend soonest-expiring credit first; whatever is left comes from credit that never expires. */
function consumeExpiringCredits(database, userId, amountInr) {
  let remaining = money(amountInr);
  if (remaining <= 0) return;
  const credits = database.prepare(`
    SELECT id, remaining_inr FROM wallet_transactions
    WHERE user_id = ? AND expires_at IS NOT NULL AND remaining_inr > 0
    ORDER BY expires_at ASC, created_at ASC
  `).all(userId);
  for (const credit of credits) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(credit.remaining_inr));
    database.prepare("UPDATE wallet_transactions SET remaining_inr = ? WHERE id = ?").run(money(Number(credit.remaining_inr) - take), credit.id);
    remaining = money(remaining - take);
  }
}

/**
 * The only way wallet money moves. Updates the cached balance and appends the
 * ledger row together; the caller supplies the transaction.
 */
export function postWalletEntry(database, {
  userId,
  entryType,
  amountInr,
  bookingId = null,
  rewardId = null,
  description = null,
  expiresAt = null,
  now = new Date(),
}) {
  const amount = money(amountInr);
  if (!userId || !entryType || !amount) return null;

  const user = database.prepare("SELECT id, wallet_balance_inr FROM users WHERE id = ?").get(userId);
  if (!user) throw referralError("Wallet owner not found", 404);

  const balanceAfter = money(Number(user.wallet_balance_inr || 0) + amount);
  if (balanceAfter < 0) throw referralError("Wallet balance is not enough for this", 409, "INSUFFICIENT_WALLET_BALANCE");

  const id = `wtx_${nanoid(12)}`;
  database.prepare("UPDATE users SET wallet_balance_inr = ? WHERE id = ?").run(balanceAfter, userId);
  database.prepare(`
    INSERT INTO wallet_transactions (
      id, user_id, type, entry_type, amount_inr, balance_after_inr, reference_id, booking_id, reward_id,
      description, expires_at, remaining_inr, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, entryType, entryType, amount, balanceAfter, rewardId || bookingId, bookingId, rewardId,
    description, expiresAt, amount > 0 && expiresAt ? amount : null, sqlTimestamp(now),
  );

  if (amount < 0 && entryType !== "EXPIRY") consumeExpiringCredits(database, userId, -amount);
  return { id, balanceAfterInr: balanceAfter };
}

/** A credit, netted against any clawback the user still owes from an earlier reversal. */
function postWalletCredit(database, entry) {
  const posted = postWalletEntry(database, entry);
  const user = database.prepare("SELECT wallet_clawback_pending_inr FROM users WHERE id = ?").get(entry.userId);
  const owed = money(user?.wallet_clawback_pending_inr);
  if (posted && owed > 0) {
    const settle = Math.min(owed, money(entry.amountInr));
    postWalletEntry(database, {
      userId: entry.userId,
      entryType: "CLAWBACK_SETTLED",
      amountInr: -settle,
      rewardId: entry.rewardId || null,
      description: `Recovered ₹${settle} still owed from a refunded referral`,
      now: entry.now,
    });
    database.prepare("UPDATE users SET wallet_clawback_pending_inr = ? WHERE id = ?").run(money(owed - settle), entry.userId);
  }
  return posted;
}

/** Spends wallet credit on a booking. Throws rather than letting a booking keep a discount it did not pay for. */
export function redeemWalletCredit(database, { userId, bookingId, amountInr, now = new Date() }) {
  const amount = money(amountInr);
  if (amount <= 0) return null;
  return postWalletEntry(database, {
    userId,
    entryType: "REDEMPTION",
    amountInr: -amount,
    bookingId,
    description: `Spent ₹${amount} of wallet credit on booking ${bookingId}`,
    now,
  });
}

export function reconcileWalletBalance(database, userId) {
  const user = database.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(userId);
  const ledger = database.prepare("SELECT COALESCE(SUM(amount_inr), 0) AS total FROM wallet_transactions WHERE user_id = ?").get(userId);
  const cachedInr = money(user?.wallet_balance_inr);
  const ledgerInr = money(ledger?.total);
  return { userId, cachedInr, ledgerInr, matches: Math.abs(cachedInr - ledgerInr) < 0.01 };
}

export function findWalletDiscrepancies(database) {
  return database.prepare(`
    SELECT u.id AS user_id, COALESCE(u.wallet_balance_inr, 0) AS cached_inr, COALESCE(t.total, 0) AS ledger_inr
    FROM users u
    LEFT JOIN (SELECT user_id, SUM(amount_inr) AS total FROM wallet_transactions GROUP BY user_id) t ON t.user_id = u.id
    WHERE ABS(COALESCE(u.wallet_balance_inr, 0) - COALESCE(t.total, 0)) >= 0.01
  `).all().map((row) => ({ userId: row.user_id, cachedInr: money(row.cached_inr), ledgerInr: money(row.ledger_inr) }));
}

// ---------------------------------------------------------------------------
// Reward lifecycle
// ---------------------------------------------------------------------------

/**
 * The trip happened. The reward starts its clearing hold, or waits for an
 * operator if the referrer has cleared unusually much this month.
 */
export function markReferralTripCompleted(database, bookingId, { now = new Date() } = {}) {
  const reward = database.prepare("SELECT * FROM referral_rewards WHERE booking_id = ? AND status = 'ACCRUED' AND completed_at IS NULL").get(bookingId);
  if (!reward) return null;

  const relationship = database.prepare("SELECT requires_review FROM referral_relationships WHERE id = ?").get(reward.relationship_id);
  const earnedRecently = database.prepare(`
    SELECT COALESCE(SUM(referrer_amount_inr), 0) AS total FROM referral_rewards
    WHERE referrer_user_id = ?
      AND ((status = 'CLEARED' AND cleared_at >= ?) OR (status = 'ACCRUED' AND completed_at IS NOT NULL))
  `).get(reward.referrer_user_id, sqlTimestamp(addDays(now, -30)))?.total || 0;
  const overLimit = money(earnedRecently) + money(reward.referrer_amount_inr) > REFERRAL_POLICY.maxClearedPer30DaysInr;

  if (relationship?.requires_review || overLimit) {
    database.prepare("UPDATE referral_rewards SET status = 'HELD_FOR_REVIEW', completed_at = ? WHERE id = ?").run(sqlTimestamp(now), reward.id);
    recordSignal(database, {
      userId: reward.referred_user_id, referrerUserId: reward.referrer_user_id, relationshipId: reward.relationship_id, rewardId: reward.id,
      signal: overLimit ? "EARNING_VELOCITY" : "SIGNUP_VELOCITY",
      detail: overLimit ? `₹${money(earnedRecently) + money(reward.referrer_amount_inr)} in 30 days` : "Relationship flagged for review",
      action: "HELD_FOR_REVIEW",
    });
    return { rewardId: reward.id, status: "HELD_FOR_REVIEW" };
  }

  const payableAt = sqlTimestamp(addDays(now, REFERRAL_POLICY.clearingHoldDays));
  database.prepare("UPDATE referral_rewards SET completed_at = ?, payable_at = ? WHERE id = ?").run(sqlTimestamp(now), payableAt, reward.id);
  return { rewardId: reward.id, status: "ACCRUED", payableAt };
}

/** For request handlers: records completion in its own transaction and never throws. */
export function onReferralTripCompleted(database, bookingId, { now = new Date() } = {}) {
  try {
    let result = null;
    database.transaction(() => {
      result = markReferralTripCompleted(database, bookingId, { now });
    })();
    return result;
  } catch (error) {
    logger.warn("Referral completion hook failed", { bookingId, error: error.message });
    return null;
  }
}

/** For request handlers: reverses the reward and returns spent wallet credit, never throws. */
export function onReferralBookingCancelled(database, bookingId, { reason, now = new Date() } = {}) {
  try {
    const reversal = reverseReferralReward(database, bookingId, { reason, now });
    const restored = restoreWalletCreditForBooking(database, bookingId, { now });
    return { reversal, restored };
  } catch (error) {
    logger.warn("Referral cancellation hook failed", { bookingId, error: error.message });
    return null;
  }
}

/** Moves a matured reward into the referrer's wallet. Returns a notification to send, if any. */
export function clearReferralReward(database, rewardId, { now = new Date() } = {}) {
  let notification = null;
  database.transaction(() => {
    const reward = database.prepare("SELECT * FROM referral_rewards WHERE id = ? AND status = 'ACCRUED'").get(rewardId);
    if (!reward || !reward.payable_at || parseTimestamp(reward.payable_at).getTime() > new Date(now).getTime()) return;

    database.prepare("UPDATE referral_rewards SET status = 'CLEARED', cleared_at = ? WHERE id = ?").run(sqlTimestamp(now), reward.id);
    const amount = money(reward.referrer_amount_inr);
    if (amount <= 0) return;

    const friend = database.prepare("SELECT name FROM users WHERE id = ?").get(reward.referred_user_id);
    const posted = postWalletCredit(database, {
      userId: reward.referrer_user_id,
      entryType: "REFERRAL_CLEARED",
      amountInr: amount,
      bookingId: reward.booking_id,
      rewardId: reward.id,
      description: `Earned ₹${amount} from ${firstName(friend?.name) || "a friend"}'s trip`,
      expiresAt: sqlTimestamp(addMonths(now, REFERRAL_POLICY.creditExpiryMonths)),
      now,
    });
    notification = { rewardId: reward.id, userId: reward.referrer_user_id, amountInr: amount, balanceAfterInr: posted?.balanceAfterInr, friendFirstName: firstName(friend?.name) };
  })();
  return notification;
}

/**
 * The booking was cancelled or refunded. A reward not yet in the wallet is
 * voided; one already in the wallet is taken back, and whatever was already
 * spent is recovered from the referrer's next credits.
 */
export function reverseReferralReward(database, bookingId, { reason = "Booking cancelled or refunded", now = new Date() } = {}) {
  let result = null;
  database.transaction(() => {
    const reward = database.prepare("SELECT * FROM referral_rewards WHERE booking_id = ?").get(bookingId);
    if (!reward || !LIVE_REWARD_STATUSES.includes(reward.status)) return;

    if (reward.status !== "CLEARED") {
      database.prepare("UPDATE referral_rewards SET status = 'VOID', reversed_at = ?, reversal_reason = ? WHERE id = ?").run(sqlTimestamp(now), reason, reward.id);
      result = { rewardId: reward.id, status: "VOID", recoveredInr: 0, clawbackInr: 0 };
      return;
    }

    const amount = money(reward.referrer_amount_inr);
    const user = database.prepare("SELECT wallet_balance_inr, wallet_clawback_pending_inr FROM users WHERE id = ?").get(reward.referrer_user_id);
    const recovered = Math.min(amount, Math.max(0, money(user?.wallet_balance_inr)));
    if (recovered > 0) {
      postWalletEntry(database, {
        userId: reward.referrer_user_id,
        entryType: "REFERRAL_REVERSED",
        amountInr: -recovered,
        bookingId: reward.booking_id,
        rewardId: reward.id,
        description: `Referral reward reversed: ${reason}`,
        now,
      });
    }
    const clawback = money(amount - recovered);
    if (clawback > 0) {
      database.prepare("UPDATE users SET wallet_clawback_pending_inr = ? WHERE id = ?")
        .run(money(Number(user?.wallet_clawback_pending_inr || 0) + clawback), reward.referrer_user_id);
    }
    database.prepare("UPDATE referral_rewards SET status = 'REVERSED', reversed_at = ?, reversal_reason = ? WHERE id = ?").run(sqlTimestamp(now), reason, reward.id);
    result = { rewardId: reward.id, status: "REVERSED", recoveredInr: recovered, clawbackInr: clawback };
  })();
  return result;
}

/**
 * Gives back wallet credit spent on a booking that never went ahead: all of it
 * if the booking was never paid, otherwise the same share as the cash refund.
 */
export function restoreWalletCreditForBooking(database, bookingId, { now = new Date() } = {}) {
  let result = null;
  database.transaction(() => {
    const booking = database.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    const applied = money(booking?.wallet_credit_applied_inr);
    if (!booking || applied <= 0) return;
    const already = database.prepare("SELECT 1 FROM wallet_transactions WHERE booking_id = ? AND entry_type = 'REDEMPTION_RESTORED'").get(bookingId);
    const redeemed = database.prepare("SELECT 1 FROM wallet_transactions WHERE booking_id = ? AND entry_type = 'REDEMPTION'").get(bookingId);
    if (already || !redeemed) return;

    let share = 0;
    if (booking.payment_status !== "PAID" && !/REFUND/.test(String(booking.payment_status || ""))) {
      share = 1;
    } else {
      const refunded = Math.max(money(booking.refunded_amount), money(booking.refund_amount_inr));
      share = Number(booking.amount_inr) > 0 ? Math.min(1, refunded / Number(booking.amount_inr)) : 0;
    }
    const amount = money(Math.round(applied * share));
    if (amount <= 0) return;

    postWalletCredit(database, {
      userId: booking.user_id,
      entryType: "REDEMPTION_RESTORED",
      amountInr: amount,
      bookingId,
      description: `Returned ₹${amount} of wallet credit from cancelled booking ${booking.ref || bookingId}`,
      expiresAt: sqlTimestamp(addMonths(now, REFERRAL_POLICY.creditExpiryMonths)),
      now,
    });
    result = { bookingId, restoredInr: amount };
  })();
  return result;
}

export function expireWalletCredits(database, { now = new Date() } = {}) {
  const lapsed = database.prepare(`
    SELECT id, user_id, remaining_inr, reward_id FROM wallet_transactions
    WHERE expires_at IS NOT NULL AND expires_at <= ? AND remaining_inr > 0
  `).all(sqlTimestamp(now));

  let expiredInr = 0;
  for (const credit of lapsed) {
    database.transaction(() => {
      const user = database.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(credit.user_id);
      const amount = Math.min(money(credit.remaining_inr), Math.max(0, money(user?.wallet_balance_inr)));
      database.prepare("UPDATE wallet_transactions SET remaining_inr = 0 WHERE id = ?").run(credit.id);
      if (amount > 0) {
        postWalletEntry(database, {
          userId: credit.user_id,
          entryType: "EXPIRY",
          amountInr: -amount,
          rewardId: credit.reward_id,
          description: `₹${amount} of unspent credit expired`,
          now,
        });
        expiredInr = money(expiredInr + amount);
      }
    })();
  }
  return { expiredCredits: lapsed.length, expiredInr };
}

function collectExpiryReminders(database, { now = new Date() } = {}) {
  const rows = database.prepare(`
    SELECT user_id, SUM(remaining_inr) AS amount, MIN(expires_at) AS first_expiry
    FROM wallet_transactions
    WHERE expires_at IS NOT NULL AND remaining_inr > 0 AND expiry_reminded_at IS NULL
      AND expires_at > ? AND expires_at <= ?
    GROUP BY user_id
  `).all(sqlTimestamp(now), sqlTimestamp(addDays(now, REFERRAL_POLICY.expiryReminderDays)));

  for (const row of rows) {
    database.prepare(`
      UPDATE wallet_transactions SET expiry_reminded_at = ?
      WHERE user_id = ? AND expires_at IS NOT NULL AND remaining_inr > 0 AND expiry_reminded_at IS NULL AND expires_at <= ?
    `).run(sqlTimestamp(now), row.user_id, sqlTimestamp(addDays(now, REFERRAL_POLICY.expiryReminderDays)));
  }
  return rows.map((row) => ({ userId: row.user_id, amountInr: money(row.amount), expiresAt: row.first_expiry }));
}

/**
 * One pass over everything time- or state-driven. Safe to run as often as you
 * like: every step only acts on rows that still need it. Catches cancellations
 * and completions from code paths that do not call the hooks directly.
 */
export function processReferralLifecycle(database, { now = new Date() } = {}) {
  const summary = { voided: 0, reversed: 0, completed: 0, cleared: 0, restored: 0, expiredInr: 0, relationshipsExpired: 0 };
  const notifications = { cleared: [], reminders: [] };

  const failed = database.prepare(`
    SELECT rr.booking_id, b.status, b.payment_status FROM referral_rewards rr
    JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED')
      AND (
        b.status = 'cancelled'
        OR COALESCE(b.refunded_amount, 0) > 0
        OR COALESCE(b.refund_amount_inr, 0) > 0
        OR b.payment_status IN ('REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_INITIATED', 'CHARGEBACK', 'FAILED', 'EXPIRED')
      )
  `).all();
  for (const row of failed) {
    const reversal = reverseReferralReward(database, row.booking_id, { reason: `Booking ${row.status}, payment ${row.payment_status}`, now });
    if (reversal?.status === "VOID") summary.voided += 1;
    if (reversal?.status === "REVERSED") summary.reversed += 1;
  }

  // Unpaid checkouts whose hold lapsed: the reward and any wallet credit go back.
  const abandoned = database.prepare(`
    SELECT b.id FROM bookings b
    WHERE b.payment_status NOT IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW_REQUIRED', 'CAPTURED_REVIEW')
      AND (COALESCE(b.wallet_credit_applied_inr, 0) > 0 OR EXISTS (SELECT 1 FROM referral_rewards rr WHERE rr.booking_id = b.id AND rr.status = 'ACCRUED'))
      AND EXISTS (SELECT 1 FROM booking_holds h WHERE h.booking_id = b.id AND (h.status = 'EXPIRED' OR h.expires_at <= ?))
      AND NOT EXISTS (SELECT 1 FROM booking_holds h WHERE h.booking_id = b.id AND h.status = 'ACTIVE' AND h.expires_at > ?)
  `).all(sqlTimestamp(now), sqlTimestamp(now));
  for (const row of abandoned) {
    const reversal = reverseReferralReward(database, row.id, { reason: "Checkout abandoned before payment", now });
    if (reversal?.status === "VOID") summary.voided += 1;
  }

  const restorable = database.prepare(`
    SELECT b.id FROM bookings b
    WHERE COALESCE(b.wallet_credit_applied_inr, 0) > 0
      AND (b.status = 'cancelled' OR b.payment_status IN ('FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED')
        OR b.id IN (${abandoned.map(() => "?").join(", ") || "''"}))
      AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.booking_id = b.id AND t.entry_type = 'REDEMPTION_RESTORED')
  `).all(...abandoned.map((row) => row.id));
  for (const row of restorable) {
    if (restoreWalletCreditForBooking(database, row.id, { now })) summary.restored += 1;
  }

  const completedTrips = database.prepare(`
    SELECT rr.booking_id FROM referral_rewards rr JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.status = 'ACCRUED' AND rr.completed_at IS NULL AND b.status = 'completed' AND b.payment_status = 'PAID'
  `).all();
  for (const row of completedTrips) {
    database.transaction(() => {
      if (markReferralTripCompleted(database, row.booking_id, { now })) summary.completed += 1;
    })();
  }

  const matured = database.prepare(`
    SELECT rr.id FROM referral_rewards rr JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.status = 'ACCRUED' AND rr.payable_at IS NOT NULL AND rr.payable_at <= ?
      AND b.status = 'completed' AND b.payment_status = 'PAID'
  `).all(sqlTimestamp(now));
  for (const row of matured) {
    const notification = clearReferralReward(database, row.id, { now });
    if (notification) {
      summary.cleared += 1;
      notifications.cleared.push(notification);
    }
  }

  summary.expiredInr = expireWalletCredits(database, { now }).expiredInr;
  notifications.reminders = collectExpiryReminders(database, { now });

  summary.relationshipsExpired = database.prepare(
    "UPDATE referral_relationships SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND earns_until <= ?",
  ).run(sqlTimestamp(now)).changes;

  return { ...summary, notifications };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function appBaseUrl() {
  return process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://ideaholiday.com";
}

export function buildReferralLink(code, channel = null) {
  const params = new URLSearchParams({ ref: code });
  if (channel) params.set("ch", channel);
  return `${appBaseUrl()}/signup?${params.toString()}`;
}

/**
 * Best effort: a failed message never undoes a credit.
 *
 * The senders are loaded here rather than at the top of the file because they
 * open the default database when imported, and this module is imported by
 * services that tests load against their own database.
 */
export async function sendReferralNotifications(database, notifications = { cleared: [], reminders: [] }) {
  if (!notifications.cleared?.length && !notifications.reminders?.length) return;
  const [{ sendEmail }, { sendWhatsAppMessage }] = await Promise.all([
    import("./emailService.js"),
    import("./whatsappService.js"),
  ]);
  for (const item of notifications.cleared || []) {
    const user = database.prepare("SELECT name, email, phone, referral_code FROM users WHERE id = ?").get(item.userId);
    if (!user) continue;
    const link = user.referral_code ? buildReferralLink(user.referral_code, "WHATSAPP") : appBaseUrl();
    const friend = item.friendFirstName || "Your friend";
    try {
      if (user.email) {
        await sendEmail({
          to: user.email,
          recipientName: user.name || "Traveler",
          recipientRole: "TRAVELER",
          eventType: "REFERRAL_REWARD_CREDITED",
          eventKey: `referral:cleared:${item.rewardId}`,
          subject: `₹${item.amountInr} added to your Idea Holiday wallet`,
          text: `Hi ${firstName(user.name) || "there"},\n\n${friend} completed a trip, so ₹${item.amountInr} is now in your wallet. Your balance is ₹${item.balanceAfterInr}.\n\nSpend it on any tour, transfer or package within 12 months. You keep earning every time ${friend} travels with us.\n\nInvite someone else: ${link}`,
        }, { database });
      }
      if (user.phone) {
        await sendWhatsAppMessage({
          to: user.phone,
          recipientName: user.name || "Traveler",
          recipientRole: "TRAVELER",
          eventType: "REFERRAL_REWARD_CREDITED",
          eventKey: `referral:cleared:wa:${item.rewardId}`,
          text: `₹${item.amountInr} added to your Idea Holiday wallet. ${friend} completed a trip. Balance: ₹${item.balanceAfterInr}.\n\nInvite another friend and earn on every trip they take: ${link}`,
        }, { database });
      }
    } catch (error) {
      logger.warn("Referral credit notification failed", { error: error.message, rewardId: item.rewardId });
    }
  }

  for (const item of notifications.reminders || []) {
    const user = database.prepare("SELECT name, email, phone FROM users WHERE id = ?").get(item.userId);
    if (!user) continue;
    const expiresOn = parseTimestamp(item.expiresAt)?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    try {
      if (user.email) {
        await sendEmail({
          to: user.email,
          recipientName: user.name || "Traveler",
          recipientRole: "TRAVELER",
          eventType: "WALLET_CREDIT_EXPIRING",
          eventKey: `wallet:expiring:${item.userId}:${item.expiresAt}`,
          subject: `₹${item.amountInr} of wallet credit expires on ${expiresOn}`,
          text: `Hi ${firstName(user.name) || "there"},\n\n₹${item.amountInr} of your Idea Holiday wallet credit expires on ${expiresOn}. Use it on your next booking: ${appBaseUrl()}`,
        }, { database });
      }
    } catch (error) {
      logger.warn("Wallet expiry reminder failed", { error: error.message, userId: item.userId });
    }
  }
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export function getReferralSummary(database, userId, { now = new Date() } = {}) {
  const user = getUser(database, userId);
  if (!user) throw referralError("User not found", 404);

  const friends = database.prepare(`
    SELECT rel.id, rel.status, rel.established_at, rel.earns_until, rel.source, u.name AS friend_name,
      COUNT(CASE WHEN rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED') AND b.payment_status = 'PAID' THEN 1 END) AS paid_trips,
      COALESCE(SUM(CASE WHEN rr.status = 'CLEARED' THEN rr.referrer_amount_inr ELSE 0 END), 0) AS earned_inr
    FROM referral_relationships rel
    JOIN users u ON u.id = rel.referred_user_id
    LEFT JOIN referral_rewards rr ON rr.relationship_id = rel.id
    LEFT JOIN bookings b ON b.id = rr.booking_id
    WHERE rel.referrer_user_id = ? AND rel.status != 'BLOCKED'
    GROUP BY rel.id, rel.status, rel.established_at, rel.earns_until, rel.source, u.name
    ORDER BY rel.established_at DESC
  `).all(userId);

  // Pending rewards on unpaid checkouts are left out: nothing has happened yet.
  const rewards = database.prepare(`
    SELECT rr.*, u.name AS friend_name, b.activity_date, b.payment_status
    FROM referral_rewards rr
    JOIN users u ON u.id = rr.referred_user_id
    JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.referrer_user_id = ? AND (b.payment_status = 'PAID' OR rr.status IN ('CLEARED', 'REVERSED'))
    ORDER BY rr.created_at DESC
    LIMIT 50
  `).all(userId);

  const stageOf = (reward) => {
    if (reward.status === "CLEARED") return "CREDITED";
    if (reward.status === "REVERSED" || reward.status === "VOID") return "REVERSED";
    if (reward.status === "HELD_FOR_REVIEW") return "IN_REVIEW";
    return reward.completed_at ? "CLEARING" : "UPCOMING_TRIP";
  };
  const totals = { creditedInr: 0, clearingInr: 0, upcomingInr: 0, inReviewInr: 0, reversedInr: 0 };
  const rewardRows = rewards.map((reward) => {
    const stage = stageOf(reward);
    const amount = money(reward.referrer_amount_inr);
    if (stage === "CREDITED") totals.creditedInr = money(totals.creditedInr + amount);
    if (stage === "CLEARING") totals.clearingInr = money(totals.clearingInr + amount);
    if (stage === "UPCOMING_TRIP") totals.upcomingInr = money(totals.upcomingInr + amount);
    if (stage === "IN_REVIEW") totals.inReviewInr = money(totals.inReviewInr + amount);
    if (stage === "REVERSED") totals.reversedInr = money(totals.reversedInr + amount);
    return {
      id: reward.id,
      friendFirstName: firstName(reward.friend_name) || "Friend",
      tripDate: reward.activity_date,
      isFirstTrip: Number(reward.referee_amount_inr) > 0,
      amountInr: amount,
      stage,
      spendableFrom: stage === "CLEARING" ? reward.payable_at : null,
      creditedAt: reward.cleared_at,
    };
  });

  const expiring = database.prepare(`
    SELECT COALESCE(SUM(remaining_inr), 0) AS amount, MIN(expires_at) AS first_expiry
    FROM wallet_transactions
    WHERE user_id = ? AND expires_at IS NOT NULL AND remaining_inr > 0 AND expires_at <= ?
  `).get(userId, sqlTimestamp(addDays(now, 60)));

  const myRelationship = getRelationshipForUser(database, userId);
  let referredBy = null;
  if (myRelationship && myRelationship.status === "ACTIVE") {
    const referrer = getUser(database, myRelationship.referrer_user_id);
    referredBy = { firstName: firstName(referrer?.name), firstTripDiscountAvailable: !hasPaidReferralTrip(database, myRelationship.id) };
  }

  return {
    policy: {
      friendDiscountPct: Math.round(REFERRAL_POLICY.friendDiscountRate * 100),
      referrerRewardPct: Math.round(REFERRAL_POLICY.referrerRate * 100),
      earningWindowMonths: REFERRAL_POLICY.earningWindowMonths,
      clearingHoldDays: REFERRAL_POLICY.clearingHoldDays,
      creditExpiryMonths: REFERRAL_POLICY.creditExpiryMonths,
    },
    friends: friends.map((friend) => ({
      id: friend.id,
      firstName: firstName(friend.friend_name) || "Friend",
      status: friend.status,
      joinedAt: friend.established_at,
      earnsUntil: friend.earns_until,
      paidTrips: Number(friend.paid_trips || 0),
      earnedInr: money(friend.earned_inr),
    })),
    rewards: rewardRows,
    totals,
    wallet: {
      balanceInr: money(user.wallet_balance_inr),
      clawbackPendingInr: money(user.wallet_clawback_pending_inr),
      expiringSoonInr: money(expiring?.amount),
      nextExpiryAt: expiring?.first_expiry || null,
    },
    referredBy,
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export function listReferralReviewQueue(database) {
  const rewards = database.prepare(`
    SELECT rr.*, ru.name AS referrer_name, ru.email AS referrer_email, fu.name AS friend_name, b.ref AS booking_ref, b.amount_inr
    FROM referral_rewards rr
    JOIN users ru ON ru.id = rr.referrer_user_id
    JOIN users fu ON fu.id = rr.referred_user_id
    JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.status = 'HELD_FOR_REVIEW'
    ORDER BY rr.completed_at ASC
  `).all();
  const blocked = database.prepare(`
    SELECT rel.*, ru.name AS referrer_name, ru.email AS referrer_email, fu.name AS friend_name, fu.email AS friend_email
    FROM referral_relationships rel
    JOIN users ru ON ru.id = rel.referrer_user_id
    JOIN users fu ON fu.id = rel.referred_user_id
    WHERE rel.status = 'BLOCKED'
    ORDER BY rel.established_at DESC
    LIMIT 100
  `).all();
  const signals = database.prepare(`
    SELECT s.*, u.name AS user_name, r.name AS referrer_name
    FROM referral_fraud_signals s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN users r ON r.id = s.referrer_user_id
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all();
  return { rewards, blockedRelationships: blocked, signals };
}

export function reviewReferralReward(database, { rewardId, decision, note = null, actorId = null, now = new Date() }) {
  const reward = database.prepare("SELECT * FROM referral_rewards WHERE id = ?").get(rewardId);
  if (!reward) throw referralError("Reward not found", 404);
  if (reward.status !== "HELD_FOR_REVIEW") throw referralError("This reward is not waiting for review", 409);
  const normalized = String(decision || "").toUpperCase();
  if (normalized === "APPROVE") {
    database.prepare("UPDATE referral_rewards SET status = 'ACCRUED', payable_at = ?, review_note = ?, reviewed_by = ? WHERE id = ?")
      .run(sqlTimestamp(now), note, actorId, rewardId);
  } else if (normalized === "REJECT") {
    database.prepare("UPDATE referral_rewards SET status = 'VOID', reversed_at = ?, reversal_reason = 'Rejected in review', review_note = ?, reviewed_by = ? WHERE id = ?")
      .run(sqlTimestamp(now), note, actorId, rewardId);
  } else {
    throw referralError("Decision must be APPROVE or REJECT", 400);
  }
  return database.prepare("SELECT * FROM referral_rewards WHERE id = ?").get(rewardId);
}

export function setReferralRelationshipStatus(database, { relationshipId, status, reason = null, clearReview = false }) {
  const normalized = String(status || "").toUpperCase();
  if (!["ACTIVE", "BLOCKED"].includes(normalized)) throw referralError("Status must be ACTIVE or BLOCKED", 400);
  const changes = database.prepare(`
    UPDATE referral_relationships
    SET status = ?, blocked_reason = ?, requires_review = CASE WHEN ? = 1 THEN 0 ELSE requires_review END
    WHERE id = ?
  `).run(normalized, normalized === "BLOCKED" ? reason || "Blocked by operations" : null, clearReview ? 1 : 0, relationshipId).changes;
  if (!changes) throw referralError("Relationship not found", 404);
  return database.prepare("SELECT * FROM referral_relationships WHERE id = ?").get(relationshipId);
}

/**
 * The numbers that say whether the program works and what it costs. Cost is
 * friend discounts on paid bookings plus referrer credit that cleared, as a
 * share of the commission those referred bookings earned.
 */
export function getReferralProgramMetrics(database, { sinceDays = 90, now = new Date() } = {}) {
  const since = sqlTimestamp(addDays(now, -sinceDays));
  const one = (sql, ...params) => database.prepare(sql).get(...params) || {};

  const clicks = one("SELECT COUNT(*) AS count, COUNT(DISTINCT referrer_user_id) AS sharers FROM referral_attributions WHERE created_at >= ?", since);
  const joined = one("SELECT COUNT(*) AS count FROM referral_relationships WHERE established_at >= ? AND status != 'BLOCKED'", since);
  const blocked = one("SELECT COUNT(*) AS count FROM referral_relationships WHERE established_at >= ? AND status = 'BLOCKED'", since);
  const referred = one(`
    SELECT COUNT(DISTINCT rr.referred_user_id) AS travelers, COUNT(*) AS bookings,
      COALESCE(SUM(b.amount_inr + COALESCE(b.wallet_credit_applied_inr, 0) + COALESCE(b.referral_discount_inr, 0)), 0) AS gmv,
      COALESCE(SUM(rr.booking_margin_inr), 0) AS margin,
      COALESCE(SUM(rr.referee_amount_inr), 0) AS discounts,
      COUNT(CASE WHEN rr.referee_amount_inr > 0 THEN 1 END) AS first_trips
    FROM referral_rewards rr JOIN bookings b ON b.id = rr.booking_id
    WHERE rr.created_at >= ? AND b.payment_status = 'PAID' AND rr.status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED')
  `, since);
  const cleared = one("SELECT COALESCE(SUM(referrer_amount_inr), 0) AS amount FROM referral_rewards WHERE status = 'CLEARED' AND cleared_at >= ?", since);
  const reversals = one("SELECT COUNT(*) AS count, COALESCE(SUM(referrer_amount_inr), 0) AS amount FROM referral_rewards WHERE status IN ('REVERSED', 'VOID') AND reversed_at >= ?", since);
  const ledger = one(`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'REDEMPTION' THEN -amount_inr ELSE 0 END), 0) AS redeemed,
      COALESCE(SUM(CASE WHEN entry_type = 'EXPIRY' THEN -amount_inr ELSE 0 END), 0) AS expired,
      COALESCE(SUM(CASE WHEN entry_type = 'REFERRAL_CLEARED' THEN amount_inr ELSE 0 END), 0) AS issued
    FROM wallet_transactions WHERE created_at >= ?
  `, since);
  const payingTravelers = one("SELECT COUNT(DISTINCT user_id) AS count FROM bookings WHERE payment_status = 'PAID' AND created_at >= ?", since);
  const signals = database.prepare("SELECT signal, action, COUNT(*) AS count FROM referral_fraud_signals WHERE created_at >= ? GROUP BY signal, action ORDER BY count DESC").all(since);

  const margin = money(referred.margin);
  const cost = money(Number(referred.discounts || 0) + Number(cleared.amount || 0));
  const paying = Number(payingTravelers.count || 0);

  return {
    windowDays: sinceDays,
    clicks: Number(clicks.count || 0),
    activeSharers: Number(clicks.sharers || 0),
    friendsJoined: Number(joined.count || 0),
    relationshipsBlocked: Number(blocked.count || 0),
    referredTravelersWithPaidTrip: Number(referred.travelers || 0),
    referredFirstTrips: Number(referred.first_trips || 0),
    referredPaidBookings: Number(referred.bookings || 0),
    referredGmvInr: money(referred.gmv),
    referredMarginInr: margin,
    friendDiscountsInr: money(referred.discounts),
    referrerCreditClearedInr: money(cleared.amount),
    costInr: cost,
    costPctOfMargin: margin > 0 ? Math.round((cost / margin) * 1000) / 10 : 0,
    clickToFirstTripPct: clicks.count ? Math.round((Number(referred.first_trips || 0) / Number(clicks.count)) * 1000) / 10 : 0,
    // New travelers brought by referral per traveler who paid in the window.
    viralCoefficient: paying ? Math.round((Number(referred.first_trips || 0) / paying) * 1000) / 1000 : 0,
    reversals: { count: Number(reversals.count || 0), amountInr: money(reversals.amount) },
    wallet: {
      issuedInr: money(ledger.issued),
      redeemedInr: money(ledger.redeemed),
      expiredInr: money(ledger.expired),
      breakagePct: Number(ledger.issued) > 0 ? Math.round((Number(ledger.expired) / Number(ledger.issued)) * 1000) / 10 : 0,
    },
    walletDiscrepancies: findWalletDiscrepancies(database).length,
    fraudSignals: signals.map((row) => ({ signal: row.signal, action: row.action, count: Number(row.count) })),
  };
}

// ---------------------------------------------------------------------------
// Legacy carry-over
// ---------------------------------------------------------------------------

/**
 * Carries `user_referrals` into the v3 tables and opens the wallet ledger. Runs
 * at startup and only ever acts on rows it has not handled yet.
 *
 * - Every referred friend gets a relationship, so their future trips earn.
 * - A referral already rewarded becomes a CLEARED reward with no new credit.
 * - A referral still pending becomes an ACCRUED reward at the v3 rate.
 * - Where the old code let the cached balance and the ledger drift apart, one
 *   ADJUSTMENT row makes the ledger explain the balance the user actually has.
 */
export function backfillLegacyReferrals(database, { now = new Date() } = {}) {
  const summary = { relationships: 0, rewards: 0, adjustments: 0 };
  let legacy = [];
  try {
    legacy = database.prepare(`
      SELECT ur.* FROM user_referrals ur
      WHERE ur.referred_user_id IS NOT NULL AND ur.referrer_user_id != ur.referred_user_id
      ORDER BY ur.created_at ASC
    `).all();
  } catch {
    legacy = [];
  }

  database.transaction(() => {
    for (const row of legacy) {
      let relationship = getRelationshipForUser(database, row.referred_user_id);
      if (!relationship) {
        const referrer = getUser(database, row.referrer_user_id);
        const friend = getUser(database, row.referred_user_id);
        if (!referrer || !friend) continue;
        const establishedAt = parseTimestamp(row.created_at) || now;
        const id = `rrel_${nanoid(12)}`;
        database.prepare(`
          INSERT INTO referral_relationships (id, referrer_user_id, referred_user_id, referral_code, source, established_at, earns_until, status)
          VALUES (?, ?, ?, ?, 'LEGACY', ?, ?, ?)
        `).run(id, referrer.id, friend.id, row.referral_code || referrer.referral_code || "LEGACY",
          sqlTimestamp(establishedAt), sqlTimestamp(addMonths(establishedAt, REFERRAL_POLICY.earningWindowMonths)),
          addMonths(establishedAt, REFERRAL_POLICY.earningWindowMonths).getTime() > new Date(now).getTime() ? "ACTIVE" : "EXPIRED");
        relationship = getRelationshipForUser(database, row.referred_user_id);
        summary.relationships += 1;
      }
      if (relationship.referrer_user_id !== row.referrer_user_id || !row.booking_id) continue;

      const booking = database.prepare("SELECT id, status, payment_status, commission_amount FROM bookings WHERE id = ?").get(row.booking_id);
      const exists = database.prepare("SELECT 1 FROM referral_rewards WHERE booking_id = ?").get(row.booking_id);
      if (!booking || exists) continue;

      const rewarded = row.status === "REWARDED";
      const earned = computeReferralAmounts({ commissionInr: booking.commission_amount, isFirstTrip: false });
      database.prepare(`
        INSERT INTO referral_rewards (
          id, relationship_id, referrer_user_id, referred_user_id, booking_id, sequence, booking_margin_inr,
          referee_rate, referrer_rate, referee_amount_inr, referrer_amount_inr, status, completed_at, payable_at, cleared_at, review_note, created_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, 0, ?, ?, ?, ?, ?, 'Carried over from the v1 referral program', ?)
      `).run(
        `rrw_${nanoid(12)}`, relationship.id, row.referrer_user_id, row.referred_user_id, booking.id, earned.marginInr,
        rewarded ? 0 : earned.referrerRate,
        rewarded ? money(row.reward_inr) : earned.referrerAmountInr,
        rewarded ? "CLEARED" : "ACCRUED",
        rewarded ? row.rewarded_at || sqlTimestamp(now) : null,
        rewarded ? row.rewarded_at || sqlTimestamp(now) : null,
        rewarded ? row.rewarded_at || sqlTimestamp(now) : null,
        row.created_at || sqlTimestamp(now),
      );
      summary.rewards += 1;
    }

    for (const drift of findWalletDiscrepancies(database)) {
      const difference = money(drift.cachedInr - drift.ledgerInr);
      database.prepare(`
        INSERT INTO wallet_transactions (id, user_id, type, entry_type, amount_inr, balance_after_inr, description, created_at)
        VALUES (?, ?, 'ADJUSTMENT', 'ADJUSTMENT', ?, ?, 'Opening balance carried into the wallet ledger', ?)
      `).run(`wtx_${nanoid(12)}`, drift.userId, difference, drift.cachedInr, sqlTimestamp(now));
      summary.adjustments += 1;
    }
  })();

  return summary;
}
