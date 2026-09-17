import crypto from "crypto";
import { nanoid } from "nanoid";
import db from "../db.js";
import { verifyPan, verifyBankAccount, calculateNameMatchScore } from "./cashfreeSecureIdService.js";
import logger from "../config/logger.js";
import { postWalletEntry } from "./referralService.js";

/** Smallest withdrawal we will process, in rupees. */
export const MIN_PAYOUT_INR = 1000;

/**
 * TDS withheld on every creator payout (ADR 017): 1%, set by the owner. Only a
 * creator with a verified PAN can be paid at all, so there is no no-PAN rate.
 * Which Income Tax section applies is for the CA to confirm, so statements
 * do not name one.
 */
export const TDS_RATE = 0.01;

/** Days a matured commission waits before it can be withdrawn. */
export const DEFAULT_PAYOUT_HOLD_DAYS = 14;

/** How long a referral click keeps earning after the visitor leaves. */
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;

/**
 * A *changed* payout account cannot receive money for this long. The first
 * account a creator adds is exempt: there is nothing to redirect yet, and the
 * delay would only punish someone waiting on their first rupee.
 */
export const PAYOUT_ACCOUNT_COOLING_HOURS = 24;

function affiliateError(message, status = 400, code = undefined) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function nowIso() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function isoPlusDays(days) {
  const date = new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function isoPlusHours(hours) {
  const date = new Date(Date.now() + Number(hours || 0) * 60 * 60 * 1000);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function maskAccountNumber(accountNumber) {
  const clean = String(accountNumber || "");
  if (!clean) return null;
  return `••••${clean.slice(-4)}`;
}

function maskPan(pan) {
  const clean = String(pan || "");
  if (!clean) return null;
  return `${clean.slice(0, 3)}••••${clean.slice(-2)}`;
}

/**
 * Strip the secrets off a raw `affiliates` row before it leaves the server.
 * The legacy inline bank columns are mirrors of the primary payout account, and
 * nothing outside the payout instrument endpoint needs them in full.
 */
export function redactAffiliate(affiliate) {
  if (!affiliate) return affiliate;
  return {
    ...affiliate,
    pan_number: maskPan(affiliate.pan_number),
    bank_account_number: maskAccountNumber(affiliate.bank_account_number),
  };
}

/**
 * Append-only record behind the cached balance columns. Every rupee that moves
 * gets a row here, so finance can reconstruct a balance rather than trust it.
 */
function writeLedger(database, { affiliateId, entryType, amountInr, referralId = null, payoutId = null, bookingId = null, note = null, actorId = null }) {
  try {
    database.prepare(`
      INSERT INTO affiliate_ledger (id, affiliate_id, entry_type, amount_inr, referral_id, payout_id, booking_id, note, actor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`affl_${nanoid(12)}`, affiliateId, entryType, round2(amountInr), referralId, payoutId, bookingId, note, actorId);
  } catch (err) {
    logger.warn("Affiliate ledger write failed", { affiliateId, entryType, error: err.message });
  }
}

/* -------------------------------------------------------------------------- */
/* Tiers                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The tier a creator has earned on today's numbers — the highest one whose
 * thresholds their completed bookings and lifetime GMV both clear.
 */
export function resolveTier(database = db, affiliateId) {
  const stats = database.prepare(`
    SELECT COUNT(*) AS completed_bookings, COALESCE(SUM(booking_amount_inr), 0) AS gmv
    FROM affiliate_referrals
    WHERE affiliate_id = ? AND status IN ('ELIGIBLE', 'PAID')
  `).get(affiliateId) || { completed_bookings: 0, gmv: 0 };

  const tiers = database.prepare("SELECT * FROM affiliate_tiers ORDER BY sort_order ASC").all() || [];
  if (!tiers.length) {
    return { code: "STARTER", label: "Starter", commission_rate: 0.10, traveler_discount_pct: 5.0, sort_order: 1 };
  }

  let earned = tiers[0];
  for (const tier of tiers) {
    if (Number(stats.completed_bookings) >= Number(tier.min_completed_bookings)
      && Number(stats.gmv) >= Number(tier.min_lifetime_gmv_inr)) {
      earned = tier;
    }
  }

  const next = tiers.find((tier) => Number(tier.sort_order) > Number(earned.sort_order)) || null;

  return {
    ...earned,
    completedBookings: Number(stats.completed_bookings),
    lifetimeGmvInr: round2(stats.gmv),
    next: next
      ? {
          code: next.code,
          label: next.label,
          commissionRate: next.commission_rate,
          bookingsToGo: Math.max(0, Number(next.min_completed_bookings) - Number(stats.completed_bookings)),
          gmvToGoInr: round2(Math.max(0, Number(next.min_lifetime_gmv_inr) - Number(stats.gmv))),
        }
      : null,
  };
}

/**
 * Move the creator onto whatever tier they have earned. Commission already
 * accrued keeps the rate it was booked at — a promotion is not backdated.
 */
export function refreshAffiliateTier(database = db, affiliateId) {
  const tier = resolveTier(database, affiliateId);
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  const rates = effectiveAffiliateRates(tier, affiliate);

  database.transaction(() => {
    // commission_rate and traveler_discount_pct mirror what the creator gets now:
    // their own admin-set rate, else their tier's.
    database.prepare(`
      UPDATE affiliates
      SET tier_code = ?, commission_rate = ?, traveler_discount_pct = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(tier.code, rates.commissionRate, rates.travelerDiscountPct, affiliateId);

    // A tier can raise the discount the creator's audience gets, so the promo
    // code behind the coupon has to move with it.
    if (affiliate?.affiliate_code) {
      database.prepare(`
        UPDATE promo_codes
        SET discount_value = ?
        WHERE code = ? AND discount_type = 'PERCENTAGE'
      `).run(rates.travelerDiscountPct, affiliate.affiliate_code);
    }
  })();

  return tier;
}

/**
 * What a creator earns (fraction of booking value) and gives their audience (%
 * of booking value): an admin-set rate when there is one (ADR 017), else the tier's.
 */
export function effectiveAffiliateRates(tier, affiliate) {
  const commissionOverride = affiliate?.commission_override_rate;
  const discountOverride = affiliate?.traveler_discount_override_pct;
  return {
    commissionRate: commissionOverride !== null && commissionOverride !== undefined ? Number(commissionOverride) : Number(tier?.commission_rate) || 0.10,
    travelerDiscountPct: discountOverride !== null && discountOverride !== undefined ? Number(discountOverride) : Number(tier?.traveler_discount_pct ?? 5),
    commissionOverridden: commissionOverride !== null && commissionOverride !== undefined,
    discountOverridden: discountOverride !== null && discountOverride !== undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Registration and profile                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Register a user as an affiliate with a unique coupon code and tracking profile
 */
export async function registerAffiliate(database = db, {
  userId,
  channelName,
  channelType = "INSTAGRAM",
  channelUrl = "",
  customCode = "",
  bio = "",
} = {}) {
  if (!userId) throw affiliateError("User ID is required", 400);
  if (!channelName || !channelName.trim()) throw affiliateError("Channel/Profile name is required", 400);

  const existingUser = database.prepare("SELECT id, name, email FROM users WHERE id = ?").get(userId);
  if (!existingUser) throw affiliateError("User account not found", 404);

  const existingAffiliate = database.prepare("SELECT id FROM affiliates WHERE user_id = ?").get(userId);
  if (existingAffiliate) throw affiliateError("An affiliate profile already exists for this account", 409);

  // Normalize coupon code
  let normalizedCode = String(customCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalizedCode) {
    const cleanName = (existingUser.name || "TRVL").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase();
    normalizedCode = `${cleanName}10`;
  }

  if (normalizedCode.length < 3 || normalizedCode.length > 20) {
    throw affiliateError("Coupon code must be between 3 and 20 alphanumeric characters", 400);
  }

  // Ensure code uniqueness in affiliates and promo_codes
  const codeInUseAff = database.prepare("SELECT id FROM affiliates WHERE affiliate_code = ?").get(normalizedCode);
  if (codeInUseAff) throw affiliateError(`Coupon code "${normalizedCode}" is already taken. Please choose another.`, 409);

  const codeInUsePromo = database.prepare("SELECT id FROM promo_codes WHERE code = ?").get(normalizedCode);
  if (codeInUsePromo) throw affiliateError(`Promo code "${normalizedCode}" is already reserved by platform vouchers. Please choose another.`, 409);

  const entryTier = database.prepare("SELECT * FROM affiliate_tiers ORDER BY sort_order ASC LIMIT 1").get()
    || { code: "STARTER", commission_rate: 0.10, traveler_discount_pct: 5.0 };

  const affiliateId = `aff_${nanoid(12)}`;
  const promoId = `promo_aff_${nanoid(8)}`;

  database.transaction(() => {
    database.prepare(`
      INSERT INTO affiliates (
        id, user_id, affiliate_code, channel_name, channel_type,
        channel_url, bio, commission_rate, traveler_discount_pct, status, kyc_status,
        tier_code, payout_hold_days, attribution_window_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'UNVERIFIED', ?, ?, ?)
    `).run(
      affiliateId,
      userId,
      normalizedCode,
      channelName.trim(),
      channelType.toUpperCase(),
      channelUrl ? channelUrl.trim() : null,
      bio ? bio.trim() : null,
      entryTier.commission_rate,
      entryTier.traveler_discount_pct,
      entryTier.code,
      DEFAULT_PAYOUT_HOLD_DAYS,
      DEFAULT_ATTRIBUTION_WINDOW_DAYS
    );

    // Corresponding promo code so travelers get an immediate discount at checkout
    database.prepare(`
      INSERT INTO promo_codes (
        id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, is_active
      ) VALUES (?, ?, ?, 'PERCENTAGE', ?, 500, 1000, 1)
    `).run(
      promoId,
      normalizedCode,
      `${channelName.trim()} Partner Discount (${entryTier.traveler_discount_pct}% OFF)`,
      entryTier.traveler_discount_pct
    );
  })();

  return getAffiliateByUserId(database, userId);
}

/**
 * Retrieve affiliate record by User ID
 */
export function getAffiliateByUserId(database = db, userId) {
  if (!userId) return null;
  const affiliate = database.prepare(`
    SELECT a.*, u.name as user_name, u.email as user_email, u.phone as user_phone
    FROM affiliates a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ?
  `).get(userId);

  return affiliate || null;
}

/**
 * Retrieve affiliate record by Code
 */
export function getAffiliateByCode(database = db, code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const affiliate = database.prepare(`
    SELECT * FROM affiliates
    WHERE affiliate_code = ? AND status = 'ACTIVE'
  `).get(normalized);

  return affiliate || null;
}

/**
 * Update general channel profile & bio
 */
export function updateAffiliateProfile(database = db, affiliateId, { channelName, channelType, channelUrl, bio } = {}) {
  const affiliate = database.prepare("SELECT id FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate profile not found", 404);

  database.prepare(`
    UPDATE affiliates
    SET channel_name = COALESCE(?, channel_name),
        channel_type = COALESCE(?, channel_type),
        channel_url = COALESCE(?, channel_url),
        bio = COALESCE(?, bio),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    channelName ? channelName.trim() : null,
    channelType ? channelType.toUpperCase() : null,
    channelUrl !== undefined ? (channelUrl ? channelUrl.trim() : null) : null,
    bio !== undefined ? (bio ? bio.trim() : null) : null,
    affiliateId
  );

  return database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
}

/* -------------------------------------------------------------------------- */
/* Payout accounts                                                             */
/* -------------------------------------------------------------------------- */

function serializePayoutAccount(account, { reveal = false } = {}) {
  if (!account) return null;
  const usableFrom = account.usable_from;
  return {
    id: account.id,
    method: account.method,
    label: account.method === "UPI"
      ? account.upi_id
      : `${account.bank_name || "Bank"} ${maskAccountNumber(account.account_number) || ""}`.trim(),
    accountNumber: reveal ? account.account_number : maskAccountNumber(account.account_number),
    accountLast4: account.account_last4,
    ifsc: account.ifsc,
    bankName: account.bank_name,
    branch: account.branch,
    accountHolder: account.account_holder,
    accountType: account.account_type,
    upiId: account.upi_id,
    verificationStatus: account.verification_status,
    verificationMessage: account.verification_message,
    nameMatchScore: account.name_match_score,
    verifiedAt: account.verified_at,
    usableFrom,
    // A verified account still cannot be paid into while it is cooling off.
    isUsable: account.verification_status === "VERIFIED"
      && account.status === "ACTIVE"
      && (!usableFrom || usableFrom <= nowIso()),
    isPrimary: Boolean(account.is_primary),
    status: account.status,
    createdAt: account.created_at,
  };
}

/**
 * Every payout destination a creator has on file. Account numbers come back
 * masked — nothing in the product needs the full number except the bank
 * transfer itself.
 */
export function listPayoutAccounts(database = db, affiliateId, { includeArchived = false, reveal = false } = {}) {
  const rows = database.prepare(`
    SELECT * FROM affiliate_payout_accounts
    WHERE affiliate_id = ? ${includeArchived ? "" : "AND status = 'ACTIVE'"}
    ORDER BY is_primary DESC, created_at DESC
  `).all(affiliateId) || [];
  return rows.map((row) => serializePayoutAccount(row, { reveal }));
}

export function getPayoutAccount(database = db, accountId) {
  if (!accountId) return null;
  return database.prepare("SELECT * FROM affiliate_payout_accounts WHERE id = ?").get(accountId) || null;
}

/**
 * Add a bank account or UPI handle and verify it before it can ever be paid
 * into. Bank accounts go through a Cashfree penny drop, which returns the name
 * the bank holds — we keep the match score rather than only a yes/no, because a
 * near-miss on the name is exactly what a reviewer needs to see.
 */
export async function addPayoutAccount(database = db, affiliateId, {
  method = "BANK_TRANSFER",
  accountNumber,
  ifsc,
  accountHolder,
  accountType = "SAVINGS",
  upiId,
  makePrimary = true,
} = {}) {
  const affiliate = database.prepare(`
    SELECT a.*, u.name AS user_name, u.phone AS user_phone
    FROM affiliates a JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `).get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate profile not found", 404);

  const normalizedMethod = String(method || "").trim().toUpperCase();
  if (!["BANK_TRANSFER", "UPI"].includes(normalizedMethod)) {
    throw affiliateError("Payout method must be BANK_TRANSFER or UPI", 400);
  }

  const existingActive = database.prepare(
    "SELECT COUNT(*) AS count FROM affiliate_payout_accounts WHERE affiliate_id = ? AND status = 'ACTIVE'"
  ).get(affiliateId)?.count || 0;

  const accountId = `affacc_${nanoid(12)}`;
  // The first destination is trusted immediately; any later one is a change of
  // where money goes, so it waits out the cooling period.
  const usableFrom = existingActive > 0 ? isoPlusHours(PAYOUT_ACCOUNT_COOLING_HOURS) : nowIso();

  let verificationStatus = "UNVERIFIED";
  let verificationMessage = null;
  let verificationRef = null;
  let nameMatchScore = null;
  let resolvedBankName = null;
  let verifiedAt = null;

  if (normalizedMethod === "BANK_TRANSFER") {
    const cleanAccount = String(accountNumber || "").trim().replace(/\s/g, "");
    const cleanIfsc = String(ifsc || "").trim().toUpperCase();
    const cleanHolder = String(accountHolder || "").trim() || affiliate.user_name;

    if (!/^\d{6,18}$/.test(cleanAccount)) {
      throw affiliateError("Enter a valid bank account number (6 to 18 digits)", 400);
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      throw affiliateError("Invalid Indian IFSC Code format (e.g. HDFC0001234)", 400);
    }
    if (!cleanHolder) {
      throw affiliateError("Account holder name is required", 400);
    }

    const duplicate = database.prepare(`
      SELECT id FROM affiliate_payout_accounts
      WHERE affiliate_id = ? AND status = 'ACTIVE' AND account_number = ? AND ifsc = ?
    `).get(affiliateId, cleanAccount, cleanIfsc);
    if (duplicate) throw affiliateError("This bank account is already on file", 409);

    try {
      const result = await verifyBankAccount({
        accountNumber: cleanAccount,
        ifsc: cleanIfsc,
        name: cleanHolder,
        phone: affiliate.user_phone,
      });
      if (result?.valid) {
        verificationStatus = "VERIFIED";
        verifiedAt = nowIso();
        resolvedBankName = result.bankName || null;
        verificationRef = result.raw?.reference_id || result.raw?.ref_id || null;
        nameMatchScore = result.nameMatchScore
          ?? (result.accountHolderName ? calculateNameMatchScore(result.accountHolderName, cleanHolder) : null);
        verificationMessage = result.accountHolderName
          ? `Bank holds this account as "${result.accountHolderName}"`
          : null;
      } else {
        verificationStatus = "FAILED";
        verificationMessage = result?.raw?.message || "Bank could not confirm this account";
      }
    } catch (err) {
      // A verification outage must not silently mark an account good.
      verificationStatus = "PENDING";
      verificationMessage = "Verification is temporarily unavailable; this account needs a manual check";
      logger.warn("Affiliate bank account verification failed", { affiliateId, error: err.message });
    }

    database.prepare(`
      INSERT INTO affiliate_payout_accounts (
        id, affiliate_id, method, account_number, account_last4, ifsc, bank_name,
        account_holder, account_type, verification_status, verification_ref,
        verification_message, name_match_score, verified_at, usable_from, is_primary, status
      ) VALUES (?, ?, 'BANK_TRANSFER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'ACTIVE')
    `).run(
      accountId, affiliateId, cleanAccount, cleanAccount.slice(-4), cleanIfsc, resolvedBankName,
      cleanHolder, String(accountType || "SAVINGS").toUpperCase(), verificationStatus, verificationRef,
      verificationMessage, nameMatchScore, verifiedAt, usableFrom
    );
  } else {
    const cleanUpi = String(upiId || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,64}@[a-z]{2,32}$/.test(cleanUpi)) {
      throw affiliateError("Enter a valid UPI ID (e.g. name@okhdfcbank)", 400);
    }

    const duplicate = database.prepare(`
      SELECT id FROM affiliate_payout_accounts
      WHERE affiliate_id = ? AND status = 'ACTIVE' AND upi_id = ?
    `).get(affiliateId, cleanUpi);
    if (duplicate) throw affiliateError("This UPI ID is already on file", 409);

    // UPI handles are confirmed by the first successful transfer rather than a
    // penny drop, so they start life needing a review.
    database.prepare(`
      INSERT INTO affiliate_payout_accounts (
        id, affiliate_id, method, upi_id, account_holder, verification_status,
        usable_from, is_primary, status
      ) VALUES (?, ?, 'UPI', ?, ?, 'PENDING', ?, 0, 'ACTIVE')
    `).run(accountId, affiliateId, cleanUpi, String(accountHolder || affiliate.user_name || "").trim() || null, usableFrom);
    verificationStatus = "PENDING";
  }

  if (makePrimary || existingActive === 0) {
    setPrimaryPayoutAccount(database, affiliateId, accountId);
  }

  syncLegacyBankColumns(database, affiliateId);

  return serializePayoutAccount(getPayoutAccount(database, accountId));
}

/**
 * Point future payouts at a different account on file.
 */
export function setPrimaryPayoutAccount(database = db, affiliateId, accountId) {
  const account = database.prepare(
    "SELECT * FROM affiliate_payout_accounts WHERE id = ? AND affiliate_id = ? AND status = 'ACTIVE'"
  ).get(accountId, affiliateId);
  if (!account) throw affiliateError("Payout account not found", 404);

  database.transaction(() => {
    database.prepare(
      "UPDATE affiliate_payout_accounts SET is_primary = 0 WHERE affiliate_id = ?"
    ).run(affiliateId);
    database.prepare(
      "UPDATE affiliate_payout_accounts SET is_primary = 1 WHERE id = ?"
    ).run(accountId);
    database.prepare(
      "UPDATE affiliates SET default_payout_account_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(accountId, affiliateId);
  })();

  syncLegacyBankColumns(database, affiliateId);
  return serializePayoutAccount(getPayoutAccount(database, accountId));
}

/**
 * Retire an account. Archived rather than deleted, because past payouts point
 * at it and a payout history with a dangling destination is not a history.
 */
export function archivePayoutAccount(database = db, affiliateId, accountId) {
  const account = database.prepare(
    "SELECT * FROM affiliate_payout_accounts WHERE id = ? AND affiliate_id = ?"
  ).get(accountId, affiliateId);
  if (!account) throw affiliateError("Payout account not found", 404);

  const inFlight = database.prepare(`
    SELECT COUNT(*) AS count FROM affiliate_payouts
    WHERE payout_account_id = ? AND status IN ('REQUESTED', 'PROCESSING')
  `).get(accountId)?.count || 0;
  if (inFlight > 0) {
    throw affiliateError("This account has a payout in progress and cannot be removed yet", 409);
  }

  database.prepare(`
    UPDATE affiliate_payout_accounts
    SET status = 'ARCHIVED', is_primary = 0, archived_at = datetime('now')
    WHERE id = ?
  `).run(accountId);

  // Losing the primary must not leave the creator with no destination at all.
  if (account.is_primary) {
    const replacement = database.prepare(`
      SELECT id FROM affiliate_payout_accounts
      WHERE affiliate_id = ? AND status = 'ACTIVE'
      ORDER BY verification_status = 'VERIFIED' DESC, created_at DESC LIMIT 1
    `).get(affiliateId);
    if (replacement) {
      setPrimaryPayoutAccount(database, affiliateId, replacement.id);
    } else {
      database.prepare(
        "UPDATE affiliates SET default_payout_account_id = NULL, updated_at = datetime('now') WHERE id = ?"
      ).run(affiliateId);
    }
  }

  syncLegacyBankColumns(database, affiliateId);
  return { archived: true, accountId };
}

/**
 * Keep the pre-v2 inline bank columns on `affiliates` pointing at the primary
 * account, so admin screens and reports written against them stay correct.
 */
function syncLegacyBankColumns(database = db, affiliateId) {
  const primary = database.prepare(`
    SELECT * FROM affiliate_payout_accounts
    WHERE affiliate_id = ? AND is_primary = 1 AND status = 'ACTIVE'
  `).get(affiliateId);

  const upi = database.prepare(`
    SELECT upi_id FROM affiliate_payout_accounts
    WHERE affiliate_id = ? AND method = 'UPI' AND status = 'ACTIVE'
    ORDER BY is_primary DESC, created_at DESC LIMIT 1
  `).get(affiliateId);

  const bank = primary?.method === "BANK_TRANSFER" ? primary : database.prepare(`
    SELECT * FROM affiliate_payout_accounts
    WHERE affiliate_id = ? AND method = 'BANK_TRANSFER' AND status = 'ACTIVE'
    ORDER BY is_primary DESC, verification_status = 'VERIFIED' DESC, created_at DESC LIMIT 1
  `).get(affiliateId);

  database.prepare(`
    UPDATE affiliates
    SET bank_account_number = ?,
        bank_ifsc = ?,
        bank_name = ?,
        bank_account_holder = ?,
        bank_account_type = ?,
        bank_verified = ?,
        upi_id = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    bank?.account_number || null,
    bank?.ifsc || null,
    bank?.bank_name || null,
    bank?.account_holder || null,
    bank?.account_type || "SAVINGS",
    bank?.verification_status === "VERIFIED" ? 1 : 0,
    upi?.upi_id || null,
    affiliateId
  );
}

/**
 * Update KYC and bank account information with automated Cashfree verification
 *
 * PAN lives on the affiliate (one taxpayer, one PAN); the bank details are
 * handed to `addPayoutAccount` so they become a verified account like any other.
 */
export async function updateAffiliateKyc(database = db, affiliateId, {
  panNumber,
  panHolderName,
  bankAccountNumber,
  bankIfsc,
  bankAccountHolder,
  bankAccountType = "SAVINGS",
  upiId,
  gstin,
} = {}) {
  const affiliate = database.prepare(
    "SELECT a.*, u.name, u.phone FROM affiliates a JOIN users u ON a.user_id = u.id WHERE a.id = ?"
  ).get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate profile not found", 404);

  const cleanPan = String(panNumber || "").trim().toUpperCase();
  const cleanPanName = String(panHolderName || "").trim();
  const cleanGstin = gstin ? String(gstin).trim().toUpperCase() : null;

  if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
    throw affiliateError("Invalid Indian PAN format (e.g. ABCDE1234F)", 400);
  }

  let panVerified = affiliate.pan_verified ? 1 : 0;
  if (cleanPan) {
    try {
      const panRes = await verifyPan({ pan: cleanPan, name: cleanPanName || affiliate.name });
      panVerified = panRes?.valid ? 1 : 0;
    } catch (err) {
      logger.warn("Affiliate PAN verification attempt encountered warning", { affiliateId, error: err.message });
    }
  }

  database.prepare(`
    UPDATE affiliates
    SET pan_number = COALESCE(?, pan_number),
        pan_holder_name = COALESCE(?, pan_holder_name),
        pan_verified = ?,
        gstin = COALESCE(?, gstin),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(cleanPan || null, cleanPanName || null, panVerified, cleanGstin, affiliateId);

  if (bankAccountNumber && bankIfsc) {
    try {
      await addPayoutAccount(database, affiliateId, {
        method: "BANK_TRANSFER",
        accountNumber: bankAccountNumber,
        ifsc: bankIfsc,
        accountHolder: bankAccountHolder || cleanPanName || affiliate.name,
        accountType: bankAccountType,
        makePrimary: true,
      });
    } catch (err) {
      // "Already on file" is not a KYC failure; anything else is.
      if (err.status !== 409) throw err;
    }
  }

  if (upiId) {
    try {
      await addPayoutAccount(database, affiliateId, { method: "UPI", upiId, makePrimary: false });
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }

  // KYC is complete once the taxpayer is identified and at least one
  // destination has been confirmed by the bank.
  const verifiedAccounts = database.prepare(`
    SELECT COUNT(*) AS count FROM affiliate_payout_accounts
    WHERE affiliate_id = ? AND status = 'ACTIVE' AND verification_status = 'VERIFIED'
  `).get(affiliateId)?.count || 0;

  const refreshed = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  const kycStatus = refreshed.pan_verified && verifiedAccounts > 0 ? "VERIFIED" : "PENDING_REVIEW";

  database.prepare(
    "UPDATE affiliates SET kyc_status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(kycStatus, affiliateId);

  return database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
}

/* -------------------------------------------------------------------------- */
/* Attribution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Record a link click and open (or extend) an attribution window for this
 * visitor.
 *
 * Last click inside the window wins, which is what Viator, GetYourGuide and
 * Klook all do: the creator who most recently sent the traveler gets the
 * booking. The window is stored server-side against a visitor token, so the
 * browser can no longer simply assert a code at checkout.
 */
export function trackAffiliateClick(database = db, {
  affiliateCode,
  visitorId = null,
  subId = null,
  userId = null,
  destinationPath = "/",
  referrerUrl = "",
  ip = "",
} = {}) {
  if (!affiliateCode) return null;
  const affiliate = getAffiliateByCode(database, affiliateCode);
  if (!affiliate) return null;

  const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
  const clickId = `clk_${nanoid(12)}`;
  const cleanSubId = subId ? String(subId).trim().slice(0, 64) : null;
  const windowDays = Number(affiliate.attribution_window_days) || DEFAULT_ATTRIBUTION_WINDOW_DAYS;
  const expiresAt = isoPlusDays(windowDays);
  let attributionId = null;

  try {
    database.transaction(() => {
      database.prepare(`
        INSERT INTO affiliate_clicks (id, affiliate_id, destination_path, referrer_url, ip_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(clickId, affiliate.id, destinationPath, referrerUrl, ipHash);

      if (!visitorId) return;
      attributionId = `affattr_${nanoid(12)}`;
      database.prepare(`
        INSERT INTO affiliate_attributions (
          id, visitor_id, affiliate_id, affiliate_code, sub_id, landing_path,
          referrer_url, user_id, click_id, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        attributionId, String(visitorId).slice(0, 64), affiliate.id, affiliate.affiliate_code,
        cleanSubId, destinationPath, referrerUrl || null, userId, clickId, expiresAt
      );
    })();

    return {
      recorded: true,
      affiliateId: affiliate.id,
      affiliateCode: affiliate.affiliate_code,
      attributionId,
      expiresAt: attributionId ? expiresAt : null,
      windowDays,
    };
  } catch (err) {
    logger.warn("Affiliate click tracking failed", { affiliateCode, error: err.message });
    return null;
  }
}

/**
 * The live attribution for a visitor, if one is still inside its window and has
 * not already been spent on a booking.
 */
export function resolveAttribution(database = db, { visitorId, userId = null } = {}) {
  if (!visitorId && !userId) return null;

  // PostgreSQL cannot infer a type for a placeholder used only in IS NOT NULL
  // ("could not determine data type of parameter $2"), so cast it.

  const row = database.prepare(`
    SELECT attr.*, a.status AS affiliate_status
    FROM affiliate_attributions attr
    JOIN affiliates a ON a.id = attr.affiliate_id
    WHERE (attr.visitor_id = ? OR (CAST(? AS TEXT) IS NOT NULL AND attr.user_id = ?))
      AND attr.consumed_booking_id IS NULL
      AND attr.expires_at > ?
      AND a.status = 'ACTIVE'
    ORDER BY attr.created_at DESC
    LIMIT 1
  `).get(visitorId ? String(visitorId).slice(0, 64) : null, userId, userId, nowIso());

  return row || null;
}

/* -------------------------------------------------------------------------- */
/* Commission accrual                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Attribute a booking to a creator and accrue their commission.
 *
 * Two ways in, and they are trusted differently:
 *
 *   - COUPON_CODE — the traveler typed the code at checkout. Self-evident, so
 *     the code alone is enough.
 *   - REFERRAL_LINK — the claim is "this visitor clicked my link earlier",
 *     which the browser cannot be trusted to assert. It must be backed by an
 *     unexpired `affiliate_attributions` row, looked up by visitor token.
 *
 * The earning is held at PENDING until the trip completes.
 */
export function recordAffiliateBooking(database = db, {
  bookingId,
  affiliateCode,
  amountInr = 0,
  attributionType = "COUPON_CODE",
  visitorId = null,
  userId = null,
  subId = null,
}) {
  if (!bookingId) return null;

  const orderAmount = Number(amountInr) || 0;
  if (orderAmount <= 0) return null;

  const existing = database.prepare("SELECT id FROM affiliate_referrals WHERE booking_id = ?").get(bookingId);
  if (existing) return null;

  let affiliate = null;
  let attribution = null;
  let resolvedSubId = subId ? String(subId).trim().slice(0, 64) : null;

  if (attributionType === "REFERRAL_LINK") {
    attribution = resolveAttribution(database, { visitorId, userId });
    if (!attribution) {
      // No server-side click on file, so there is nothing to pay for. A code in
      // the request body is not evidence of a referral.
      logger.info("Affiliate link attribution rejected: no live attribution for visitor", { bookingId });
      return null;
    }
    affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(attribution.affiliate_id);
    resolvedSubId = resolvedSubId || attribution.sub_id || null;
  } else {
    if (!affiliateCode) return null;
    affiliate = getAffiliateByCode(database, affiliateCode);
  }

  if (!affiliate || affiliate.status !== "ACTIVE") return null;

  // A creator booking their own trip through their own code is self-dealing,
  // not a referral.
  const booking = database.prepare("SELECT id, user_id FROM bookings WHERE id = ?").get(bookingId);
  const bookingUserId = booking?.user_id || userId || null;
  if (bookingUserId && bookingUserId === affiliate.user_id) {
    logger.info("Affiliate self-referral rejected", { bookingId, affiliateId: affiliate.id });
    return null;
  }

  const tier = resolveTier(database, affiliate.id);
  const commissionRate = effectiveAffiliateRates(tier, affiliate).commissionRate;
  const earningInr = round2(orderAmount * commissionRate);
  const referralId = `aff_ref_${nanoid(12)}`;

  try {
    database.transaction(() => {
      database.prepare(`
        INSERT INTO affiliate_referrals (
          id, affiliate_id, booking_id, attribution_type,
          booking_amount_inr, commission_rate, earning_inr, status,
          sub_id, tier_code, attribution_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
      `).run(
        referralId, affiliate.id, bookingId, attributionType, orderAmount,
        commissionRate, earningInr, resolvedSubId, tier.code, attribution?.id || null
      );

      if (attribution) {
        database.prepare(`
          UPDATE affiliate_attributions
          SET consumed_booking_id = ?, consumed_at = datetime('now')
          WHERE id = ?
        `).run(bookingId, attribution.id);
      }

      writeLedger(database, {
        affiliateId: affiliate.id,
        entryType: "COMMISSION_ACCRUED",
        amountInr: earningInr,
        referralId,
        bookingId,
        note: `${attributionType} at ${(commissionRate * 100).toFixed(0)}% (${tier.code})`,
      });
    })();

    return {
      referralId,
      affiliateId: affiliate.id,
      affiliateCode: affiliate.affiliate_code,
      earningInr,
      commissionRate,
      tierCode: tier.code,
      subId: resolvedSubId,
      status: "PENDING",
    };
  } catch (err) {
    logger.warn("Failed to record affiliate referral", { bookingId, affiliateCode, error: err.message });
    return null;
  }
}

/**
 * Triggered when a booking is COMPLETED (Traveler completed trip).
 *
 * The commission is earned here, but is not withdrawable yet: it clears after
 * the affiliate's hold period, which is the window a refund or chargeback
 * realistically lands in. Paying out before then means chasing money back.
 */
export function onTripCompleted(database = db, bookingId) {
  if (!bookingId) return null;

  const referral = database.prepare(
    "SELECT * FROM affiliate_referrals WHERE booking_id = ? AND status = 'PENDING'"
  ).get(bookingId);
  if (!referral) return null;

  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(referral.affiliate_id);
  if (!affiliate) return null;

  const earning = Number(referral.earning_inr) || 0;
  const holdDays = Number(affiliate.payout_hold_days ?? DEFAULT_PAYOUT_HOLD_DAYS);
  const payableAt = isoPlusDays(holdDays);

  database.transaction(() => {
    database.prepare(`
      UPDATE affiliate_referrals
      SET status = 'ELIGIBLE', eligible_at = datetime('now'), payable_at = ?
      WHERE id = ?
    `).run(payableAt, referral.id);

    database.prepare(`
      UPDATE affiliates
      SET available_balance_inr = available_balance_inr + ?,
          lifetime_earnings_inr = lifetime_earnings_inr + ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(earning, earning, affiliate.id);

    writeLedger(database, {
      affiliateId: affiliate.id,
      entryType: "COMMISSION_CLEARED",
      amountInr: earning,
      referralId: referral.id,
      bookingId,
      note: `Withdrawable from ${payableAt} (${holdDays}-day hold)`,
    });
  })();

  // A completed booking may have just earned the creator a better tier.
  refreshAffiliateTier(database, affiliate.id);

  return {
    referralId: referral.id,
    affiliateId: affiliate.id,
    earning,
    status: "ELIGIBLE",
    payableAt,
  };
}

/**
 * Triggered when a booking is CANCELLED or REFUNDED.
 * Voids the referral earning so no payout can be made against a trip that
 * never happened.
 */
export function onBookingCancelled(database = db, bookingId) {
  if (!bookingId) return null;

  const referral = database.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(bookingId);
  if (!referral || referral.status === "CANCELLED") return null;

  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(referral.affiliate_id);
  const earning = Number(referral.earning_inr) || 0;
  const wasEligible = referral.status === "ELIGIBLE";

  database.transaction(() => {
    database.prepare("UPDATE affiliate_referrals SET status = 'CANCELLED' WHERE id = ?").run(referral.id);

    // Only a matured commission was ever added to the balance, so only that one
    // has to come back out.
    if (wasEligible && affiliate) {
      database.prepare(`
        UPDATE affiliates
        SET available_balance_inr = MAX(0, available_balance_inr - ?),
            lifetime_earnings_inr = MAX(0, lifetime_earnings_inr - ?),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(earning, earning, affiliate.id);
    }

    if (affiliate) {
      writeLedger(database, {
        affiliateId: affiliate.id,
        entryType: "COMMISSION_REVERSED",
        amountInr: -earning,
        referralId: referral.id,
        bookingId,
        note: wasEligible ? "Reversed after clearing" : "Reversed before clearing",
      });
    }
  })();

  if (affiliate) refreshAffiliateTier(database, affiliate.id);

  return { referralId: referral.id, status: "CANCELLED", reversedInr: wasEligible ? earning : 0 };
}

/* -------------------------------------------------------------------------- */
/* Balances and payouts                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Derive every balance from the referral and payout rows rather than reading a
 * cached column, so what a creator is told they can withdraw is always a
 * statement about real bookings.
 *
 *   pending      — attributed, trip not completed yet
 *   onHold       — earned, still inside the clearing hold
 *   cleared      — earned and out of the hold
 *   reserved     — already requested, awaiting settlement
 *   paid         — settled
 *   withdrawable — cleared minus what is reserved or already paid
 */
export function computeBalances(database = db, affiliateId) {
  const now = nowIso();

  const referrals = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN earning_inr ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'ELIGIBLE' AND payable_at IS NOT NULL AND payable_at > ? THEN earning_inr ELSE 0 END), 0) AS on_hold,
      COALESCE(SUM(CASE WHEN status IN ('ELIGIBLE', 'PAID') AND (payable_at IS NULL OR payable_at <= ?) THEN earning_inr ELSE 0 END), 0) AS cleared,
      COALESCE(SUM(CASE WHEN status IN ('ELIGIBLE', 'PAID') THEN earning_inr ELSE 0 END), 0) AS lifetime
    FROM affiliate_referrals
    WHERE affiliate_id = ?
  `).get(now, now, affiliateId) || {};

  // Earnings moved into the wallet count as paid (migration 042).
  let transfers = { gross: 0, tds: 0, net: 0 };
  try {
    transfers = database.prepare(`
      SELECT COALESCE(SUM(gross_amount_inr), 0) AS gross, COALESCE(SUM(tds_amount_inr), 0) AS tds, COALESCE(SUM(net_amount_inr), 0) AS net
      FROM affiliate_wallet_transfers WHERE affiliate_id = ?
    `).get(affiliateId) || transfers;
  } catch (error) {
    if (!/no such table|does not exist/i.test(error.message)) throw error;
  }

  const payouts = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('REQUESTED', 'PROCESSING') THEN COALESCE(gross_amount_inr, amount_inr) ELSE 0 END), 0) AS reserved,
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN COALESCE(gross_amount_inr, amount_inr) ELSE 0 END), 0) AS paid,
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN tds_amount_inr ELSE 0 END), 0) AS tds_withheld,
      COALESCE(SUM(CASE WHEN status = 'PAID' THEN COALESCE(net_amount_inr, amount_inr) ELSE 0 END), 0) AS net_received
    FROM affiliate_payouts
    WHERE affiliate_id = ?
  `).get(affiliateId) || {};

  const cleared = round2(referrals.cleared);
  const reserved = round2(payouts.reserved);
  const paid = round2(Number(payouts.paid) + Number(transfers.gross));

  return {
    pendingInr: round2(referrals.pending),
    onHoldInr: round2(referrals.on_hold),
    clearedInr: cleared,
    reservedInr: reserved,
    paidInr: paid,
    tdsWithheldInr: round2(Number(payouts.tds_withheld) + Number(transfers.tds)),
    walletTransferredInr: round2(transfers.net),
    netReceivedInr: round2(payouts.net_received),
    lifetimeEarningsInr: round2(referrals.lifetime),
    withdrawableInr: round2(Math.max(0, cleared - reserved - paid)),
  };
}

/** TDS on a creator payout: the gross leaves the balance, the net reaches the bank. */
export function computeTds(affiliate, grossAmountInr) {
  const gross = round2(grossAmountInr);
  const rate = TDS_RATE;
  const tds = round2(gross * rate);
  return { grossInr: gross, tdsRate: rate, tdsInr: tds, netInr: round2(gross - tds) };
}

/**
 * Pick the account this payout should land in: the one the creator asked for,
 * otherwise their primary for that method. It has to be verified and past its
 * cooling period — a payout is the one moment where "probably fine" is not.
 */
function resolvePayoutAccount(database, affiliateId, { payoutAccountId, paymentMethod }) {
  let account = null;

  if (payoutAccountId) {
    account = database.prepare(
      "SELECT * FROM affiliate_payout_accounts WHERE id = ? AND affiliate_id = ? AND status = 'ACTIVE'"
    ).get(payoutAccountId, affiliateId);
    if (!account) throw affiliateError("Selected payout account was not found", 404);
  } else {
    account = database.prepare(`
      SELECT * FROM affiliate_payout_accounts
      WHERE affiliate_id = ? AND status = 'ACTIVE' AND method = ?
      ORDER BY is_primary DESC, verification_status = 'VERIFIED' DESC, created_at DESC
      LIMIT 1
    `).get(affiliateId, paymentMethod);
    if (!account) {
      throw affiliateError(
        paymentMethod === "UPI"
          ? "Add a UPI ID before requesting a UPI payout"
          : "Add a bank account before requesting a payout",
        400
      );
    }
  }

  if (account.verification_status !== "VERIFIED") {
    throw affiliateError(
      account.verification_status === "FAILED"
        ? "This payout account failed verification. Please correct the details or add another account."
        : "This payout account is still being verified. Payouts unlock once verification completes.",
      403
    );
  }

  if (account.usable_from && account.usable_from > nowIso()) {
    throw affiliateError(
      `For your security, a newly added payout account can be used from ${account.usable_from} UTC.`,
      403
    );
  }

  return account;
}

/**
 * Request payout from the withdrawable balance.
 *
 * The gross amount leaves the creator's balance, TDS is withheld, and the net
 * is what actually reaches their bank.
 */
export function requestPayout(database = db, affiliateId, { amountInr, paymentMethod = "BANK_TRANSFER", payoutAccountId = null } = {}) {
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate profile not found", 404);

  if (affiliate.status !== "ACTIVE") {
    throw affiliateError("This affiliate account is not active and cannot request payouts", 403);
  }

  if (affiliate.kyc_status !== "VERIFIED") {
    throw affiliateError("KYC verification (PAN & Bank Account) is required before requesting payouts", 403);
  }

  // ADR 017: TDS is deducted against a verified PAN, so nobody is paid without one.
  if (!affiliate.pan_verified) {
    throw Object.assign(affiliateError("Verify your PAN before requesting a payout. Your commission keeps building up until then.", 403), { code: "PAN_NOT_VERIFIED" });
  }

  const method = String(paymentMethod || "BANK_TRANSFER").toUpperCase();
  const account = resolvePayoutAccount(database, affiliateId, { payoutAccountId, paymentMethod: method });

  const requestedAmount = round2(amountInr || 0);
  const balances = computeBalances(database, affiliateId);

  if (requestedAmount < MIN_PAYOUT_INR) {
    throw affiliateError(`Minimum payout request amount is ₹${MIN_PAYOUT_INR.toLocaleString("en-IN")}`, 400);
  }

  if (requestedAmount > balances.withdrawableInr) {
    const onHold = balances.onHoldInr > 0
      ? ` ₹${balances.onHoldInr.toLocaleString("en-IN")} is still clearing and becomes available after the hold period.`
      : "";
    throw affiliateError(
      `Insufficient withdrawable balance. You have ₹${balances.withdrawableInr.toLocaleString("en-IN")} available.${onHold}`,
      400
    );
  }

  const { tdsRate, tdsInr, netInr } = computeTds(affiliate, requestedAmount);
  const payoutId = `aff_pay_${nanoid(12)}`;

  // The window this withdrawal covers, for the creator's statement.
  const period = database.prepare(`
    SELECT MIN(eligible_at) AS from_at, MAX(eligible_at) AS to_at
    FROM affiliate_referrals
    WHERE affiliate_id = ? AND status = 'ELIGIBLE'
  `).get(affiliateId) || {};

  database.transaction(() => {
    database.prepare(`
      UPDATE affiliates
      SET available_balance_inr = MAX(0, available_balance_inr - ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(requestedAmount, affiliateId);

    database.prepare(`
      INSERT INTO affiliate_payouts (
        id, affiliate_id, amount_inr, payment_method, status, payout_account_id,
        gross_amount_inr, tds_rate, tds_amount_inr, net_amount_inr,
        statement_from, statement_to
      ) VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payoutId, affiliateId, requestedAmount, method, account.id,
      requestedAmount, tdsRate, tdsInr, netInr, period.from_at || null, period.to_at || null
    );

    writeLedger(database, {
      affiliateId,
      entryType: "PAYOUT_RESERVED",
      amountInr: -requestedAmount,
      payoutId,
      note: `To ${account.method === "UPI" ? account.upi_id : `${account.bank_name || "bank"} ${maskAccountNumber(account.account_number)}`}`,
    });
  })();

  return database.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(payoutId);
}

/** Marks the oldest cleared commission PAID up to `grossInr`, so statements line up with trips. */
function markFundingCommissionPaid(database, affiliateId, grossInr) {
  let remaining = round2(grossInr);
  const funding = database.prepare(`
    SELECT id, earning_inr FROM affiliate_referrals
    WHERE affiliate_id = ? AND status = 'ELIGIBLE'
    ORDER BY eligible_at ASC
  `).all(affiliateId) || [];
  for (const referral of funding) {
    if (remaining < Number(referral.earning_inr)) break;
    database.prepare("UPDATE affiliate_referrals SET status = 'PAID', settled_at = datetime('now') WHERE id = ?").run(referral.id);
    remaining = round2(remaining - Number(referral.earning_inr));
  }
}

/**
 * "Use for travel" (ADR 017): moves withdrawable commission into the creator's
 * traveler wallet. It is paid like a bank payout — verified PAN, 1% TDS, the
 * commission marked PAID — but settles at once, has no minimum and needs no
 * payout account. The net becomes wallet credit that never expires and can pay
 * a whole booking. It cannot be turned back into cash.
 */
export function transferEarningsToWallet(database = db, affiliateId, { amountInr } = {}) {
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate profile not found", 404);
  if (affiliate.status !== "ACTIVE") throw affiliateError("This affiliate account is not active", 403);
  if (!affiliate.pan_verified) {
    throw Object.assign(affiliateError("Verify your PAN before moving earnings. TDS is deducted against it.", 403), { code: "PAN_NOT_VERIFIED" });
  }
  const gross = round2(amountInr || 0);
  if (gross <= 0) throw affiliateError("Enter an amount to move", 400);
  const balances = computeBalances(database, affiliateId);
  if (gross > balances.withdrawableInr) {
    throw affiliateError(`You can move up to ₹${balances.withdrawableInr.toLocaleString("en-IN")} right now.`, 400);
  }

  const { tdsRate, tdsInr, netInr } = computeTds(affiliate, gross);
  const transferId = `aff_wal_${nanoid(12)}`;
  database.transaction(() => {
    database.prepare(`
      INSERT INTO affiliate_wallet_transfers (id, affiliate_id, user_id, gross_amount_inr, tds_rate, tds_amount_inr, net_amount_inr)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transferId, affiliateId, affiliate.user_id, gross, tdsRate, tdsInr, netInr);
    database.prepare(`
      UPDATE affiliates SET paid_earnings_inr = COALESCE(paid_earnings_inr, 0) + ?,
        available_balance_inr = CASE WHEN COALESCE(available_balance_inr, 0) > ? THEN available_balance_inr - ? ELSE 0 END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(gross, gross, gross, affiliateId);
    markFundingCommissionPaid(database, affiliateId, gross);
    writeLedger(database, { affiliateId, entryType: "ADJUSTMENT", amountInr: -gross, note: `Moved to wallet as travel credit (${transferId})` });
    if (tdsInr > 0) writeLedger(database, { affiliateId, entryType: "PAYOUT_TDS", amountInr: -tdsInr, note: `TDS @ ${Number((tdsRate * 100).toFixed(2))}% on wallet transfer ${transferId}` });
    const posted = postWalletEntry(database, {
      userId: affiliate.user_id,
      entryType: "AFFILIATE_TRANSFER",
      amountInr: netInr,
      description: `₹${netInr} of creator earnings moved to your wallet (₹${tdsInr} TDS withheld)`,
      creditSource: "AFFILIATE",
    });
    database.prepare("UPDATE affiliate_wallet_transfers SET wallet_transaction_id = ? WHERE id = ?").run(posted.id, transferId);
  })();
  logger.info("Creator earnings moved to wallet", { affiliateId, transferId, gross, netInr });
  return { transferId, grossInr: gross, tdsRate, tdsInr, netInr, balances: computeBalances(database, affiliateId) };
}

/**
 * Finance confirms the money left, with the bank's UTR as proof.
 */
export function settlePayout(database = db, payoutId, { utrReference, actorId = null, provider = "MANUAL", providerRef = null } = {}) {
  const reference = String(utrReference || "").trim();
  if (!reference) throw affiliateError("UTR reference number is required", 400);

  const payout = database.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(payoutId);
  if (!payout) throw affiliateError("Payout request not found", 404);
  if (payout.status === "PAID") throw affiliateError("Payout is already marked as paid", 400);
  if (payout.status === "REJECTED") throw affiliateError("A rejected payout cannot be settled", 400);

  const gross = round2(payout.gross_amount_inr ?? payout.amount_inr);
  const tds = round2(payout.tds_amount_inr);

  database.transaction(() => {
    // Conditional on the status just read, so two admins (or a double click on
    // two API instances) cannot both settle and move the money twice.
    const taken = database.prepare(`
      UPDATE affiliate_payouts
      SET status = 'PAID', utr_reference = ?, provider = ?, provider_ref = ?,
          processed_at = datetime('now'), processed_by = ?
      WHERE id = ? AND status NOT IN ('PAID', 'REJECTED')
    `).run(reference, provider, providerRef, actorId, payout.id);
    if (!taken.changes) throw affiliateError("This payout was already settled or rejected", 409);

    database.prepare(`
      UPDATE affiliates
      SET paid_earnings_inr = paid_earnings_inr + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(gross, payout.affiliate_id);

    // Mark the commission that funded this withdrawal as settled, oldest first,
    // so a creator's statement lines up with the trips behind it.
    markFundingCommissionPaid(database, payout.affiliate_id, gross);

    writeLedger(database, {
      affiliateId: payout.affiliate_id,
      entryType: "PAYOUT_PAID",
      amountInr: -gross,
      payoutId: payout.id,
      actorId,
      note: `UTR ${reference}`,
    });

    if (tds > 0) {
      writeLedger(database, {
        affiliateId: payout.affiliate_id,
        entryType: "PAYOUT_TDS",
        amountInr: -tds,
        payoutId: payout.id,
        actorId,
        note: `TDS @ ${Number((Number(payout.tds_rate) * 100).toFixed(2))}%`,
      });
    }

    // A UPI handle proves itself by a transfer landing on it.
    if (payout.payout_account_id) {
      database.prepare(`
        UPDATE affiliate_payout_accounts
        SET verification_status = 'VERIFIED', verified_at = COALESCE(verified_at, datetime('now'))
        WHERE id = ? AND method = 'UPI' AND verification_status = 'PENDING'
      `).run(payout.payout_account_id);
    }
  })();

  return database.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(payout.id);
}

/**
 * Reject or fail a payout and hand the money back to the creator's balance, so
 * a bounced transfer never quietly disappears.
 */
export function rejectPayout(database = db, payoutId, { reason, actorId = null } = {}) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw affiliateError("A reason is required when rejecting a payout", 400);

  const payout = database.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(payoutId);
  if (!payout) throw affiliateError("Payout request not found", 404);
  if (payout.status === "PAID") throw affiliateError("A settled payout cannot be rejected", 400);
  if (payout.status === "REJECTED") throw affiliateError("This payout was already rejected", 400);

  const gross = round2(payout.gross_amount_inr ?? payout.amount_inr);

  database.transaction(() => {
    const taken = database.prepare(`
      UPDATE affiliate_payouts
      SET status = 'REJECTED', rejection_reason = ?, failure_reason = ?,
          processed_at = datetime('now'), processed_by = ?
      WHERE id = ? AND status NOT IN ('PAID', 'REJECTED')
    `).run(cleanReason, cleanReason, actorId, payout.id);
    if (!taken.changes) throw affiliateError("This payout was already settled or rejected", 409);

    database.prepare(`
      UPDATE affiliates
      SET available_balance_inr = available_balance_inr + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(gross, payout.affiliate_id);

    writeLedger(database, {
      affiliateId: payout.affiliate_id,
      entryType: "PAYOUT_REVERSED",
      amountInr: gross,
      payoutId: payout.id,
      actorId,
      note: cleanReason,
    });
  })();

  return database.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(payout.id);
}

/* -------------------------------------------------------------------------- */
/* Admin decisions                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Suspend, reject or reactivate a creator. Their coupon follows: a creator who
 * is not ACTIVE earns nothing, and without this their code kept working as an
 * ordinary promo, still discounting bookings for their audience.
 */
export function setAffiliateStatus(database = db, affiliateId, { status }) {
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Creator not found", 404);
  database.transaction(() => {
    database.prepare("UPDATE affiliates SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, affiliateId);
    database.prepare("UPDATE promo_codes SET is_active = ? WHERE code = ?").run(status === "ACTIVE" ? 1 : 0, affiliate.affiliate_code);
  })();
  return {
    previousStatus: affiliate.status,
    affiliate: redactAffiliate(database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId)),
  };
}

/**
 * A manual KYC decision attests to the PAN only (§10.4.6). VERIFIED needs a PAN
 * on file: TDS is filed against it, so "verified" with nothing to verify would
 * let a creator be paid with no taxpayer identified.
 */
export function decideAffiliateKyc(database = db, affiliateId, { kycStatus }) {
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Creator not found", 404);
  if (kycStatus === "VERIFIED" && !String(affiliate.pan_number || "").trim()) {
    throw affiliateError("This creator has not submitted a PAN yet, so there is nothing to verify", 409, "PAN_MISSING");
  }
  database.prepare(`
    UPDATE affiliates SET kyc_status = ?, pan_verified = ?, updated_at = datetime('now') WHERE id = ?
  `).run(kycStatus, kycStatus === "VERIFIED" ? 1 : 0, affiliateId);
  return {
    previousStatus: affiliate.kyc_status,
    affiliate: redactAffiliate(database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId)),
  };
}

/**
 * Everything an admin needs to answer "why can't this creator be paid?" and
 * "is this creator real?": derived balances, masked payout accounts, recent
 * referrals and which campaign labels sell.
 */
export function getAffiliateAdminDetail(database = db, affiliateId) {
  const affiliate = database.prepare(`
    SELECT a.*, u.name AS user_name, u.email AS user_email FROM affiliates a JOIN users u ON u.id = a.user_id WHERE a.id = ?
  `).get(affiliateId);
  if (!affiliate) throw affiliateError("Creator not found", 404);
  const referrals = database.prepare(`
    SELECT r.id, r.status, r.attribution_type, r.booking_amount_inr, r.commission_rate, r.earning_inr, r.sub_id,
           r.payable_at, r.created_at, b.ref AS booking_ref, b.status AS booking_status, b.activity_date
    FROM affiliate_referrals r LEFT JOIN bookings b ON b.id = r.booking_id
    WHERE r.affiliate_id = ? ORDER BY r.created_at DESC LIMIT 50
  `).all(affiliateId);
  const campaigns = database.prepare(`
    SELECT COALESCE(sub_id, '') AS sub_id, COUNT(*) AS bookings,
           COALESCE(SUM(CASE WHEN status != 'CANCELLED' THEN earning_inr ELSE 0 END), 0) AS earning_inr
    FROM affiliate_referrals WHERE affiliate_id = ? GROUP BY COALESCE(sub_id, '') ORDER BY bookings DESC LIMIT 10
  `).all(affiliateId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const clicks30d = Number(database.prepare("SELECT COUNT(*) AS count FROM affiliate_clicks WHERE affiliate_id = ? AND created_at >= ?").get(affiliateId, since)?.count || 0);
  return {
    affiliate: redactAffiliate(affiliate),
    balances: computeBalances(database, affiliateId),
    accounts: listPayoutAccounts(database, affiliateId, { includeArchived: true }),
    referrals: referrals.map((row) => ({ ...row, earning_inr: round2(row.earning_inr), booking_amount_inr: round2(row.booking_amount_inr) })),
    campaigns: campaigns.map((row) => ({ subId: row.sub_id || null, bookings: Number(row.bookings), earningInr: round2(row.earning_inr) })),
    clicks30d,
  };
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

const PUBLIC_SITE_URL = process.env.PUBLIC_APP_URL || "https://ideaholiday.in";

/**
 * Build a trackable deep link. `subId` is the creator's own campaign label —
 * "reels-march", "story-goa" — carried through the click onto the referral, so
 * they can tell which post actually sold.
 */
export function buildShareLink(affiliateCode, { path = "/", subId = null } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${PUBLIC_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("ref", affiliateCode);
  if (subId) url.searchParams.set("sub", String(subId).trim().slice(0, 64));
  return url.toString();
}

/**
 * Aggregate dashboard metrics for the affiliate portal
 */
export function getAffiliateDashboardMetrics(database = db, affiliateId) {
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw affiliateError("Affiliate not found", 404);

  const referrals = database.prepare(`
    SELECT ar.*, b.ref as booking_ref, b.product_code, b.activity_date, p.title as product_title
    FROM affiliate_referrals ar
    LEFT JOIN bookings b ON ar.booking_id = b.id
    LEFT JOIN products p ON b.product_id = p.id
    WHERE ar.affiliate_id = ?
    ORDER BY ar.created_at DESC
  `).all(affiliateId) || [];

  const payouts = database.prepare(`
    SELECT p.*, acc.method AS account_method, acc.bank_name AS account_bank_name,
           acc.account_last4 AS account_last4, acc.upi_id AS account_upi_id
    FROM affiliate_payouts p
    LEFT JOIN affiliate_payout_accounts acc ON acc.id = p.payout_account_id
    WHERE p.affiliate_id = ?
    ORDER BY p.requested_at DESC
  `).all(affiliateId) || [];

  const clickCount = database.prepare(
    "SELECT COUNT(*) as click_count FROM affiliate_clicks WHERE affiliate_id = ?"
  ).get(affiliateId)?.click_count || 0;

  const balances = computeBalances(database, affiliateId);
  const tier = resolveTier(database, affiliateId);
  const payoutAccounts = listPayoutAccounts(database, affiliateId);

  const successfulBookings = referrals.filter((r) => r.status !== "CANCELLED").length;
  const conversionRate = clickCount > 0 ? ((successfulBookings / clickCount) * 100).toFixed(1) : "0.0";

  // Per-campaign breakdown, so a creator can see which post is earning.
  const campaignTotals = new Map();
  for (const referral of referrals) {
    if (referral.status === "CANCELLED") continue;
    const key = referral.sub_id || "direct";
    const entry = campaignTotals.get(key) || { subId: key, bookings: 0, earningsInr: 0, gmvInr: 0 };
    entry.bookings += 1;
    entry.earningsInr = round2(entry.earningsInr + Number(referral.earning_inr || 0));
    entry.gmvInr = round2(entry.gmvInr + Number(referral.booking_amount_inr || 0));
    campaignTotals.set(key, entry);
  }

  const nextTdsRate = TDS_RATE;

  return {
    affiliateId: affiliate.id,
    affiliateCode: affiliate.affiliate_code,
    channelName: affiliate.channel_name,
    channelType: affiliate.channel_type,
    channelUrl: affiliate.channel_url,
    bio: affiliate.bio,
    commissionRate: affiliate.commission_rate,
    travelerDiscountPct: affiliate.traveler_discount_pct,
    status: affiliate.status,
    kycStatus: affiliate.kyc_status,
    tier: {
      code: tier.code,
      label: tier.label,
      commissionRate: tier.commission_rate,
      completedBookings: tier.completedBookings,
      lifetimeGmvInr: tier.lifetimeGmvInr,
      next: tier.next,
    },
    kycDetails: {
      panNumber: maskPan(affiliate.pan_number),
      panHolderName: affiliate.pan_holder_name,
      panVerified: Boolean(affiliate.pan_verified),
      gstin: affiliate.gstin,
      // Retained for screens written against the pre-v2 shape; `payoutAccounts`
      // below is the one to build against.
      bankAccountNumber: maskAccountNumber(affiliate.bank_account_number),
      bankIfsc: affiliate.bank_ifsc,
      bankName: affiliate.bank_name,
      bankAccountHolder: affiliate.bank_account_holder,
      bankVerified: Boolean(affiliate.bank_verified),
      upiId: affiliate.upi_id,
    },
    payoutAccounts,
    payoutPolicy: {
      minPayoutInr: MIN_PAYOUT_INR,
      holdDays: Number(affiliate.payout_hold_days ?? DEFAULT_PAYOUT_HOLD_DAYS),
      attributionWindowDays: Number(affiliate.attribution_window_days ?? DEFAULT_ATTRIBUTION_WINDOW_DAYS),
      tdsRate: nextTdsRate,
      panRequired: !affiliate.pan_verified,
      tdsNote: affiliate.pan_verified
        ? "TDS of 1% is deducted at source from every payout."
        : "Verify your PAN to withdraw. TDS of 1% is deducted at source from every payout.",
      accountCoolingHours: PAYOUT_ACCOUNT_COOLING_HOURS,
    },
    metrics: {
      lifetimeEarningsInr: balances.lifetimeEarningsInr,
      availableBalanceInr: balances.withdrawableInr,
      withdrawableInr: balances.withdrawableInr,
      pendingEarningsInr: balances.pendingInr,
      onHoldInr: balances.onHoldInr,
      reservedInr: balances.reservedInr,
      paidEarningsInr: balances.paidInr,
      tdsWithheldInr: balances.tdsWithheldInr,
      netReceivedInr: balances.netReceivedInr,
      totalBookingsCount: successfulBookings,
      totalClicksCount: clickCount,
      conversionRate: `${conversionRate}%`,
    },
    shareLinks: {
      couponCode: affiliate.affiliate_code,
      defaultLink: buildShareLink(affiliate.affiliate_code, { path: "/" }),
      circuitPlannerLink: buildShareLink(affiliate.affiliate_code, { path: "/circuit-planner" }),
      transfersLink: buildShareLink(affiliate.affiliate_code, { path: "/transfers" }),
    },
    campaigns: [...campaignTotals.values()].sort((a, b) => b.earningsInr - a.earningsInr),
    referrals: referrals.map((r) => ({
      id: r.id,
      bookingRef: r.booking_ref ? `IH-${r.booking_ref.slice(-4)}` : "Booking Ref",
      productTitle: r.product_title || "Travel Experience",
      activityDate: r.activity_date,
      bookingAmountInr: r.booking_amount_inr,
      commissionRate: r.commission_rate,
      earningInr: r.earning_inr,
      attributionType: r.attribution_type,
      subId: r.sub_id,
      tierCode: r.tier_code,
      status: r.status,
      createdAt: r.created_at,
      eligibleAt: r.eligible_at,
      payableAt: r.payable_at,
      onHold: r.status === "ELIGIBLE" && Boolean(r.payable_at) && r.payable_at > nowIso(),
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountInr: p.amount_inr,
      grossAmountInr: p.gross_amount_inr ?? p.amount_inr,
      tdsRate: p.tds_rate,
      tdsAmountInr: p.tds_amount_inr,
      netAmountInr: p.net_amount_inr ?? p.amount_inr,
      paymentMethod: p.payment_method,
      destination: p.account_method === "UPI"
        ? p.account_upi_id
        : [p.account_bank_name, p.account_last4 ? `••••${p.account_last4}` : null].filter(Boolean).join(" ") || null,
      status: p.status,
      utrReference: p.utr_reference,
      rejectionReason: p.rejection_reason,
      requestedAt: p.requested_at,
      processedAt: p.processed_at,
    })),
    ledger: (database.prepare(`
      SELECT * FROM affiliate_ledger WHERE affiliate_id = ? ORDER BY created_at DESC LIMIT 100
    `).all(affiliateId) || []).map((entry) => ({
      id: entry.id,
      entryType: entry.entry_type,
      amountInr: entry.amount_inr,
      note: entry.note,
      createdAt: entry.created_at,
    })),
  };
}
