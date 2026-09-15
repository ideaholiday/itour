import express from "express";
import db from "../db.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import {
  settlePayout,
  rejectPayout,
  listPayoutAccounts,
  computeBalances,
  refreshAffiliateTier,
  redactAffiliate,
} from "../services/affiliateService.js";
import logger from "../config/logger.js";
import {
  listAffiliateRateChanges, listAffiliateTiers, sendAffiliateRateNotices, setAffiliateRates, updateAffiliateTier,
} from "../services/affiliateRateService.js";

const router = express.Router();
router.use(authenticate, requireRoles("ADMIN"));

function rateFailure(res, req, error, fallback) {
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

// Creator commission (ADR 017): tiers, per-creator rates, and their change history.
router.get("/tiers", (req, res) => {
  try {
    return res.json({ success: true, ...listAffiliateTiers(db), changes: listAffiliateRateChanges(db) });
  } catch (error) {
    return rateFailure(res, req, error, "Could not load creator tiers");
  }
});

router.put("/tiers/:code", (req, res) => {
  try {
    const { reason, ...input } = req.body || {};
    const result = updateAffiliateTier(db, req.params.code, input, { actorId: req.user.id, reason });
    if (result.affected.length) sendAffiliateRateNotices(db, result.affected).catch((error) => logger.error("Creator rate notices failed", { error }));
    return res.json({ success: true, tier: result.tier, notified: result.affected.length });
  } catch (error) {
    return rateFailure(res, req, error, "Could not update the tier");
  }
});

router.put("/:id/rates", (req, res) => {
  try {
    const { reason, ...input } = req.body || {};
    const result = setAffiliateRates(db, req.params.id, input, { actorId: req.user.id, reason });
    if (result.affected.length) sendAffiliateRateNotices(db, result.affected).catch((error) => logger.error("Creator rate notices failed", { error }));
    const { affected, ...rates } = result;
    return res.json({ success: true, ...rates, notified: affected.length });
  } catch (error) {
    return rateFailure(res, req, error, "Could not update the creator's rates");
  }
});

/**
 * GET /api/admin/affiliates
 * List all affiliates with filters
 */
router.get("/", (req, res) => {
  try {
    const { status, kyc_status, search } = req.query;
    let query = `
      SELECT a.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             (SELECT COUNT(*) FROM affiliate_referrals WHERE affiliate_id = a.id) as referrals_count,
             (SELECT COUNT(*) FROM affiliate_clicks WHERE affiliate_id = a.id) as clicks_count
      FROM affiliates a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND a.status = ?";
      params.push(status);
    }
    if (kyc_status) {
      query += " AND a.kyc_status = ?";
      params.push(kyc_status);
    }
    if (search) {
      query += " AND (a.affiliate_code LIKE ? OR a.channel_name LIKE ? OR u.email LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += " ORDER BY a.created_at DESC";
    // PAN and the legacy bank column are masked here. Full details for an
    // actual transfer come from the audit-logged instrument endpoint.
    const affiliates = (db.prepare(query).all(...params) || []).map(redactAffiliate);
    return res.json({ success: true, count: affiliates.length, affiliates });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list affiliates" });
  }
});

/**
 * PATCH /api/admin/affiliates/:id/status
 * Update account status (ACTIVE, SUSPENDED, REJECTED)
 */
router.patch("/:id/status", (req, res) => {
  try {
    const { status } = req.body;
    if (!["ACTIVE", "SUSPENDED", "REJECTED", "PENDING"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    db.prepare("UPDATE affiliates SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
    const updated = db.prepare("SELECT * FROM affiliates WHERE id = ?").get(req.params.id);
    return res.json({ success: true, affiliate: redactAffiliate(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update affiliate status" });
  }
});

/**
 * PATCH /api/admin/affiliates/:id/kyc
 * Manually approve or reject KYC
 */
router.patch("/:id/kyc", (req, res) => {
  try {
    const { kyc_status } = req.body;
    if (!["VERIFIED", "REJECTED", "PENDING_REVIEW"].includes(kyc_status)) {
      return res.status(400).json({ error: "Invalid KYC status" });
    }

    // A manual approval attests to the PAN. It cannot vouch for a bank account
    // the bank itself has not confirmed, so account verification stays where it
    // is — set per account by the penny drop.
    const panVerified = kyc_status === "VERIFIED" ? 1 : 0;

    db.prepare(`
      UPDATE affiliates
      SET kyc_status = ?, pan_verified = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(kyc_status, panVerified, req.params.id);

    const updated = db.prepare("SELECT * FROM affiliates WHERE id = ?").get(req.params.id);
    return res.json({ success: true, affiliate: redactAffiliate(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update affiliate KYC" });
  }
});

/**
 * GET /api/admin/affiliates/payouts
 * List all payout requests
 */
router.get("/payouts", (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT p.*, a.affiliate_code, a.channel_name, a.pan_verified,
             a.gstin, u.email as user_email, u.name as user_name,
             acc.method AS account_method, acc.bank_name AS account_bank_name,
             acc.ifsc AS account_ifsc, acc.account_last4 AS account_last4,
             acc.account_holder AS account_holder, acc.upi_id AS account_upi_id,
             acc.verification_status AS account_verification_status,
             acc.name_match_score AS account_name_match_score
      FROM affiliate_payouts p
      JOIN affiliates a ON p.affiliate_id = a.id
      JOIN users u ON a.user_id = u.id
      LEFT JOIN affiliate_payout_accounts acc ON acc.id = p.payout_account_id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      query += " AND p.status = ?";
      params.push(status);
    }
    query += " ORDER BY p.requested_at DESC";

    // A payout queue needs enough to recognise an account, not enough to use
    // one. The full number is fetched deliberately, per payout, below.
    const payouts = (db.prepare(query).all(...params) || []).map((payout) => ({
      ...payout,
      grossAmountInr: payout.gross_amount_inr ?? payout.amount_inr,
      tdsAmountInr: payout.tds_amount_inr,
      netAmountInr: payout.net_amount_inr ?? payout.amount_inr,
      destination: payout.account_method === "UPI"
        ? payout.account_upi_id
        : [payout.account_bank_name, payout.account_last4 ? `••••${payout.account_last4}` : null]
            .filter(Boolean).join(" ") || null,
    }));

    return res.json({ success: true, count: payouts.length, payouts });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list payouts" });
  }
});

/**
 * GET /api/admin/affiliates/payouts/:id/instrument
 * The full bank details for one payout, for the person actually making the
 * transfer. Separate from the queue listing, and audit-logged, so reading an
 * account number is a deliberate act.
 */
router.get("/payouts/:id/instrument", (req, res) => {
  try {
    const payout = db.prepare("SELECT * FROM affiliate_payouts WHERE id = ?").get(req.params.id);
    if (!payout) return res.status(404).json({ error: "Payout request not found" });

    const account = payout.payout_account_id
      ? db.prepare("SELECT * FROM affiliate_payout_accounts WHERE id = ?").get(payout.payout_account_id)
      : null;
    if (!account) return res.status(404).json({ error: "No payout account is attached to this request" });

    logger.info("Affiliate payout instrument disclosed", {
      payoutId: payout.id,
      affiliateId: payout.affiliate_id,
      actorId: req.user.id,
    });

    return res.json({
      success: true,
      instrument: {
        method: account.method,
        accountNumber: account.account_number,
        ifsc: account.ifsc,
        bankName: account.bank_name,
        accountHolder: account.account_holder,
        accountType: account.account_type,
        upiId: account.upi_id,
        verificationStatus: account.verification_status,
        nameMatchScore: account.name_match_score,
      },
      amounts: {
        grossInr: payout.gross_amount_inr ?? payout.amount_inr,
        tdsRate: payout.tds_rate,
        tdsInr: payout.tds_amount_inr,
        // This is the figure to transfer.
        netInr: payout.net_amount_inr ?? payout.amount_inr,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load payout instrument" });
  }
});

/**
 * GET /api/admin/affiliates/:id/payout-accounts
 */
router.get("/:id/payout-accounts", (req, res) => {
  try {
    return res.json({
      success: true,
      accounts: listPayoutAccounts(db, req.params.id, { includeArchived: true }),
      balances: computeBalances(db, req.params.id),
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to load payout accounts" });
  }
});

/**
 * POST /api/admin/affiliates/payouts/:id/settle
 * Settle payout with UTR transaction reference
 */
router.post("/payouts/:id/settle", (req, res) => {
  try {
    const { utrReference, provider, providerRef } = req.body;
    const payout = settlePayout(db, req.params.id, {
      utrReference,
      actorId: req.user.id,
      provider: provider || "MANUAL",
      providerRef: providerRef || null,
    });
    return res.json({ success: true, payout });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to settle payout" });
  }
});

/**
 * POST /api/admin/affiliates/payouts/:id/reject
 * Reject or fail a payout; the money goes back to the creator's balance.
 */
router.post("/payouts/:id/reject", (req, res) => {
  try {
    const { reason } = req.body;
    const payout = rejectPayout(db, req.params.id, { reason, actorId: req.user.id });
    return res.json({ success: true, payout });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to reject payout" });
  }
});

/**
 * POST /api/admin/affiliates/:id/refresh-tier
 * Recompute the creator's tier from their completed bookings and GMV.
 */
router.post("/:id/refresh-tier", (req, res) => {
  try {
    const tier = refreshAffiliateTier(db, req.params.id);
    return res.json({ success: true, tier });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Failed to refresh tier" });
  }
});

export default router;
