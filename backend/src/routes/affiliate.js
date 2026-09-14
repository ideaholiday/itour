import express from "express";
import db from "../db.js";
import {
  registerAffiliate,
  getAffiliateByUserId,
  updateAffiliateProfile,
  updateAffiliateKyc,
  trackAffiliateClick,
  requestPayout,
  getAffiliateDashboardMetrics,
  listPayoutAccounts,
  addPayoutAccount,
  setPrimaryPayoutAccount,
  archivePayoutAccount,
  computeBalances,
  computeTds,
  buildShareLink,
  MIN_PAYOUT_INR,
  redactAffiliate,
} from "../services/affiliateService.js";
import { authenticate, optionalAuthMiddleware } from "../middleware/auth.js";
import logger from "../config/logger.js";

const router = express.Router();

/**
 * GET /api/affiliate/me
 * Check if the authenticated user has an affiliate account
 */
router.get("/me", authenticate, (req, res) => {
  try {
    const affiliate = getAffiliateByUserId(db, req.user.id);
    if (!affiliate) {
      return res.json({ success: true, registered: false, affiliate: null });
    }
    return res.json({ success: true, registered: true, affiliate: redactAffiliate(affiliate) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to fetch affiliate profile" });
  }
});

/**
 * POST /api/affiliate/register
 * Apply/register as an affiliate with a unique coupon code
 */
router.post("/register", authenticate, async (req, res) => {
  try {
    const { channelName, channelType, channelUrl, customCode, bio } = req.body;
    const affiliate = await registerAffiliate(db, {
      userId: req.user.id,
      channelName,
      channelType,
      channelUrl,
      customCode,
      bio,
    });
    return res.status(201).json({ success: true, affiliate: redactAffiliate(affiliate) });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Affiliate registration failed" });
  }
});

/**
 * PUT /api/affiliate/profile
 * Update social channels and bio
 */
router.put("/profile", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const { channelName, channelType, channelUrl, bio } = req.body;
    const updated = updateAffiliateProfile(db, existing.id, { channelName, channelType, channelUrl, bio });
    return res.json({ success: true, affiliate: redactAffiliate(updated) });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to update profile" });
  }
});

/**
 * POST /api/affiliate/kyc
 * Submit PAN and Bank Account details with automated Cashfree verification
 */
router.post("/kyc", authenticate, async (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const {
      panNumber,
      panHolderName,
      bankAccountNumber,
      bankIfsc,
      bankAccountHolder,
      bankAccountType,
      upiId,
      gstin,
    } = req.body;

    const updated = await updateAffiliateKyc(db, existing.id, {
      panNumber,
      panHolderName,
      bankAccountNumber,
      bankIfsc,
      bankAccountHolder,
      bankAccountType,
      upiId,
      gstin,
    });

    return res.json({
      success: true,
      affiliate: redactAffiliate(updated),
      message: updated.kyc_status === "VERIFIED"
        ? "KYC and Bank Account verified successfully!"
        : "KYC details submitted for review.",
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to update KYC" });
  }
});

/**
 * GET /api/affiliate/dashboard
 * Aggregated analytics, performance cards, referrals, and payouts
 */
router.get("/dashboard", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found. Please register first." });

    const dashboard = getAffiliateDashboardMetrics(db, existing.id);
    return res.json({ success: true, dashboard });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to load dashboard metrics" });
  }
});

/**
 * POST /api/affiliate/payout/request
 * Request withdrawal of available balance to verified bank account
 */
router.post("/payout/request", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const { amountInr, paymentMethod, payoutAccountId } = req.body;
    const payout = requestPayout(db, existing.id, { amountInr, paymentMethod, payoutAccountId });
    return res.status(201).json({
      success: true,
      payout,
      message: `Payout request for ₹${Number(payout.gross_amount_inr ?? payout.amount_inr).toLocaleString("en-IN")} submitted. `
        + `₹${Number(payout.tds_amount_inr).toLocaleString("en-IN")} TDS will be withheld, `
        + `so ₹${Number(payout.net_amount_inr).toLocaleString("en-IN")} will reach your account.`,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Payout request failed", code: err.code });
  }
});

/**
 * POST /api/affiliate/track-click
 * Public endpoint to track link clicks on ?ref=CODE or ?aff=CODE
 */
router.post("/track-click", optionalAuthMiddleware, (req, res) => {
  try {
    const { affiliateCode, destinationPath, referrerUrl, visitorId, subId } = req.body;
    if (!affiliateCode) return res.status(400).json({ error: "Affiliate code is required" });

    const result = trackAffiliateClick(db, {
      affiliateCode,
      visitorId,
      subId,
      userId: req.user?.id || null,
      destinationPath: destinationPath || "/",
      referrerUrl: referrerUrl || req.headers["referer"] || "",
      ip: req.ip,
    });

    // The attribution window is returned so the browser can show the traveler
    // (and the creator testing their own link) that the click actually landed.
    return res.json({
      success: Boolean(result),
      attributionExpiresAt: result?.expiresAt || null,
      windowDays: result?.windowDays || null,
    });
  } catch (err) {
    logger.warn("Click tracking error", { error: err.message });
    return res.json({ success: false });
  }
});

/**
 * GET /api/affiliate/payout-accounts
 * Bank accounts and UPI IDs on file. Account numbers come back masked.
 */
router.get("/payout-accounts", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });
    return res.json({ success: true, accounts: listPayoutAccounts(db, existing.id) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to load payout accounts" });
  }
});

/**
 * POST /api/affiliate/payout-accounts
 * Add a bank account (penny-drop verified) or a UPI ID to receive commission.
 */
router.post("/payout-accounts", authenticate, async (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const { method, accountNumber, ifsc, accountHolder, accountType, upiId, makePrimary } = req.body;
    const account = await addPayoutAccount(db, existing.id, {
      method,
      accountNumber,
      ifsc,
      accountHolder,
      accountType,
      upiId,
      makePrimary: makePrimary !== false,
    });

    return res.status(201).json({
      success: true,
      account,
      message: account.verificationStatus === "VERIFIED"
        ? (account.isUsable
            ? "Account verified. Payouts can be sent here."
            : `Account verified. For your security it can receive payouts from ${account.usableFrom} UTC.`)
        : "Account saved. It needs verification before a payout can be sent to it.",
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to add payout account" });
  }
});

/**
 * PATCH /api/affiliate/payout-accounts/:id/primary
 * Choose which account future payouts go to.
 */
router.patch("/payout-accounts/:id/primary", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });
    const account = setPrimaryPayoutAccount(db, existing.id, req.params.id);
    return res.json({ success: true, account });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to update primary account" });
  }
});

/**
 * DELETE /api/affiliate/payout-accounts/:id
 */
router.delete("/payout-accounts/:id", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });
    const result = archivePayoutAccount(db, existing.id, req.params.id);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to remove payout account" });
  }
});

/**
 * GET /api/affiliate/payout-preview?amountInr=5000
 * What a withdrawal of this size actually pays out after TDS — shown before the
 * creator commits, so the number in their bank is never a surprise.
 */
router.get("/payout-preview", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const balances = computeBalances(db, existing.id);
    const requested = Number(req.query.amountInr) || balances.withdrawableInr;
    const breakdown = computeTds(existing, requested);

    return res.json({
      success: true,
      balances,
      minPayoutInr: MIN_PAYOUT_INR,
      preview: breakdown,
      eligible: requested >= MIN_PAYOUT_INR && requested <= balances.withdrawableInr,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to preview payout" });
  }
});

/**
 * GET /api/affiliate/share-link?path=/activity/goa-scuba&subId=reels-march
 * Trackable deep link for a specific page and campaign.
 */
router.get("/share-link", authenticate, (req, res) => {
  try {
    const existing = getAffiliateByUserId(db, req.user.id);
    if (!existing) return res.status(404).json({ error: "Affiliate account not found" });

    const link = buildShareLink(existing.affiliate_code, {
      path: req.query.path || "/",
      subId: req.query.subId || null,
    });
    return res.json({ success: true, link, couponCode: existing.affiliate_code });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Failed to build share link" });
  }
});

export default router;
