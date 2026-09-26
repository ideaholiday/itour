import express from "express";
import db from "../db.js";
import { withoutPickupOtpSecrets } from "../services/bookingService.js";
import { authenticate, optionalAuthMiddleware, requireRoles } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { normalizeCoverageReview } from "../lib/coverageReview.js";
import {
  notifyProductPublished,
  notifyRefundProcessed,
  notifySettlementProcessed,
  notifySupplierVerification,
  notifyUpcomingTripReminder,
  notifyPostTripReviewRequest,
  runAutomatedTripReminders,
  queueNotification,
  notifyKybDocumentReupload,
} from "../services/notificationService.js";
import { initiateCashfreeTransfer } from "../services/cashfreeService.js";
import { pendingRefundQuote, sendRefundToGateway } from "../services/bookingRefundService.js";
import {
  runComprehensiveSupplierKyb,
  verifyGstin,
  verifyPan,
  verifyBankAccount,
} from "../services/cashfreeSecureIdService.js";
import { autoApproveSupplierKyb, getKybApprovalReadiness, saveSupplierVerification, supplierCountry, supplierKybRules } from "../services/supplierVerificationService.js";
import { hasKybFile, sendKybDocumentFile } from "../services/kybFileService.js";
import {
  autoCreateAllSettlementBatches,
  calculateRefundQuote,
  createRefundRecord,
  createSettlementBatch,
  failRefund,
  finalizeRefund,
  getReconciliationReport,
  processSettlementBatch,
  reconcileSettlementBatch,
  resolveCommissionRate,
} from "../services/financeService.js";
import { validateBody } from "../middleware/validation.js";
import { assignDriverToBooking } from "../services/driverDispatchService.js";
import { dispatchTransaction, revokeAssignment } from "../services/dispatchStateService.js";
import { adminSchemas, checkoutSchemas, profileSchemas } from "../validators/apiSchemas.js";
import { addTeamMember, listTeam, removeTeamMember, resetTeamMemberPassword, updateTeamMember } from "../services/teamService.js";
import { listPrograms, listSettingsAudit, updateSettings } from "../services/programSettingsService.js";
import { createCoupon, listCouponRedemptions, listCoupons, updateCoupon } from "../services/couponService.js";
import { createPost, deletePost, listAllPosts, updatePost } from "../services/blogService.js";
import { listLibraryItems, saveLibraryItem } from "../services/packageLibraryService.js";
import { listSharedLibrary, saveCity, saveSharedRoute } from "../services/routeLibraryService.js";
import { listVerificationQueue, rejectPurchasedVerification, retryCheckRefund } from "../services/supplierPlanPaymentService.js";
import {
  getSubscriptionStatus, grantSubscriptionWaiver, listSupplierSubscriptions, revokeSubscription, syncLaunchWaivers,
} from "../services/supplierSubscriptionService.js";
import {
  clearCommissionOverrides, listCommissionChanges, listCommissionOverrides, recordPlatformCommissionChange,
  sendCommissionChangeNotices, setProductCommission, setSupplierCommission,
} from "../services/commissionService.js";
import {
  grantSupplierVerification, ownerProfileView, REQUIRED_VERIFICATION_CHECKS, revokeSupplierVerification,
  setProfileSuspended, VERIFICATION_CHECKS,
} from "../services/supplierProfileService.js";

const router = express.Router();
router.use(authenticate, requireRoles("ADMIN"));

const requireAdminAccess = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Administrator sign-in required" });
  if (String(req.user?.role || "").toUpperCase() === "ADMIN") return next();
  return res.status(403).json({ error: "Administrator access required" });
};

const parseJson = (value, fallback) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

// Bank details as saved by the supplier; empty when none were given, never a placeholder.
const parseBankDetails = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
};

// GET /api/admin/metrics - High level platform metrics
router.get("/metrics", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const totalSuppliers = db.prepare("SELECT COUNT(*) as count FROM suppliers").get().count;
    const pendingKyb = db.prepare("SELECT COUNT(*) as count FROM suppliers WHERE kyb_status = 'PENDING'").get().count;
    const approvedSuppliers = db.prepare("SELECT COUNT(*) as count FROM suppliers WHERE kyb_status = 'APPROVED'").get().count;
    const suspendedSuppliers = db.prepare("SELECT COUNT(*) as count FROM suppliers WHERE kyb_status = 'SUSPENDED'").get().count;
    const totalProducts = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
    const pendingProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'PENDING_REVIEW'").get().count;
    const totalBookings = db.prepare("SELECT COUNT(*) as count FROM bookings").get().count;
    const autoAssignedBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE supplier_assignment_method IN ('RULE_ENGINE_V1', 'SLA_FALLBACK')").get().count;
    const supplierResponsesPending = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE supplier_response_status = 'PENDING'").get().count;
    const assignmentManualReview = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE supplier_assignment_status = 'MANUAL_REVIEW_REQUIRED'").get().count;
    const geoZones = db.prepare("SELECT COUNT(*) as count FROM geo_fences WHERE (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false'))").get().count;
    const coveredCities = db.prepare("SELECT COUNT(DISTINCT city) as count FROM geo_fences WHERE (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false'))").get().count;
    const pendingCoverage = db.prepare("SELECT COUNT(*) as count FROM geo_fences WHERE approval_status = 'PENDING_REVIEW'").get().count;

    // Same definition as Analytics: an unpaid checkout is not revenue.
    const gmvResult = db.prepare("SELECT SUM(amount_inr) as sum FROM bookings WHERE LOWER(status) NOT IN ('cancelled', 'pending_payment')").get();
    const grossRevenue = gmvResult ? gmvResult.sum || 0 : 0;

    const commResult = db.prepare("SELECT SUM(commission_amount) as sum FROM bookings WHERE LOWER(status) NOT IN ('cancelled', 'pending_payment')").get();
    const totalCommission = commResult ? commResult.sum || 0 : 0;

    const pendingPayoutResult = db.prepare("SELECT SUM(net_payout) as sum FROM payouts WHERE payout_status = 'SCHEDULED'").get();
    const pendingPayouts = pendingPayoutResult ? pendingPayoutResult.sum || 0 : 0;

    const totalPayoutsProcessed = db.prepare("SELECT SUM(net_payout) as sum FROM payouts WHERE payout_status = 'PROCESSED'").get().sum || 0;

    // Creator commission waiting on a transfer, for the Creators & Payouts badge.
    let pendingAffiliatePayouts = 0;
    try {
      pendingAffiliatePayouts = db.prepare(
        "SELECT COUNT(*) AS count FROM affiliate_payouts WHERE status IN ('REQUESTED', 'PROCESSING')"
      ).get()?.count || 0;
    } catch { /* Table arrives with migration 027; the badge simply stays empty until then. */ }

    // Work waiting on a person, for the Travel & Earn and Verified checks badges.
    let heldReferralRewards = 0;
    let pendingVerificationChecks = 0;
    try {
      heldReferralRewards = db.prepare("SELECT COUNT(*) AS count FROM referral_rewards WHERE status = 'HELD_FOR_REVIEW'").get()?.count || 0;
      pendingVerificationChecks = db.prepare("SELECT COUNT(*) AS count FROM supplier_verifications WHERE status = 'PENDING_CHECKS' AND source = 'PURCHASE'").get()?.count || 0;
    } catch { /* Tables arrive with later migrations; the badges stay empty until then. */ }

    res.json({
      success: true,
      metrics: {
        totalSuppliers,
        pendingKyb,
        approvedSuppliers,
        suspendedSuppliers,
        totalProducts,
        pendingProducts,
        totalBookings,
        autoAssignedBookings,
        supplierResponsesPending,
        assignmentManualReview,
        geoZones,
        coveredCities,
        pendingCoverage,
        grossRevenue,
        totalCommission,
        pendingPayouts,
        totalPayoutsProcessed,
        pendingAffiliatePayouts,
        heldReferralRewards,
        pendingVerificationChecks
      }
    });
  } catch (err) {
    logger.error("Admin metrics lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch admin metrics" });
  }
});

// GET /api/admin/coverage - Platform-wide supplier service boundaries
router.get("/coverage", (req, res) => {
  try {
    const zones = db.prepare(`
      SELECT gf.*, s.company_name, s.kyb_status, s.rating, s.phone as supplier_phone
      FROM geo_fences gf
      JOIN suppliers s ON s.id = gf.supplier_id
      ORDER BY CASE COALESCE(gf.approval_status, 'APPROVED') WHEN 'PENDING_REVIEW' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, gf.city, s.company_name
    `).all();
    const cityCoverage = db.prepare(`
      SELECT d.id, d.name, d.state,
             COUNT(CASE WHEN (gf.is_active IS NULL OR CAST(gf.is_active AS TEXT) NOT IN ('0', 'false')) AND COALESCE(gf.approval_status, 'APPROVED') = 'APPROVED' THEN 1 END) AS active_zones,
             COUNT(DISTINCT CASE WHEN (gf.is_active IS NULL OR CAST(gf.is_active AS TEXT) NOT IN ('0', 'false')) AND COALESCE(gf.approval_status, 'APPROVED') = 'APPROVED' THEN gf.supplier_id END) AS active_suppliers
      FROM destinations d
      LEFT JOIN geo_fences gf ON LOWER(gf.city) = LOWER(d.name)
      WHERE COALESCE(d.is_active, 1) = 1
      GROUP BY d.id, d.name, d.state
      ORDER BY active_zones ASC, d.name ASC
    `).all();
    res.json({ success: true, zones, cityCoverage });
  } catch (err) {
    logger.error("Admin coverage lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch supplier coverage" });
  }
});

// PATCH /api/admin/coverage/:zoneId/review - Approve, reject, or suspend a supplier boundary
router.patch("/coverage/:zoneId/review", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.review), (req, res) => {
  try {
    const zone = db.prepare("SELECT * FROM geo_fences WHERE id = ?").get(req.params.zoneId);
    if (!zone) return res.status(404).json({ error: "Coverage zone not found" });
    const review = normalizeCoverageReview(req.body?.action, req.body?.note);
    if (review.error) return res.status(400).json({ error: review.error });
    const { status, isActive, reviewNote } = review.value;
    db.prepare(`
      UPDATE geo_fences
      SET approval_status = ?, is_active = ?, review_note = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?
    `).run(status, isActive, reviewNote, req.user?.email || req.user?.id || "admin", zone.id);
    const updated = db.prepare("SELECT * FROM geo_fences WHERE id = ?").get(zone.id);
    return res.json({ success: true, zone: updated, message: status === "APPROVED" ? "Coverage zone approved and activated." : `Coverage zone ${status.toLowerCase()}.` });
  } catch (err) {
    logger.error("Coverage review failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Coverage review could not be saved" });
  }
});

// GET /api/admin/suppliers - List suppliers with KYB status & verification documents drawer
router.get("/suppliers", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const { status } = req.query; // 'PENDING', 'APPROVED', 'SUSPENDED', or 'ALL'
    let query = `
      SELECT s.*,
        COUNT(p.id) as total_products,
        SUM(CASE WHEN p.is_published = 1 AND p.status = 'PUBLISHED' THEN 1 ELSE 0 END) as published_products
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
    `;
    const params = [];

    if (status && status !== "ALL") {
      query += " WHERE s.kyb_status = ?";
      params.push(status.toUpperCase());
    }
    query += " GROUP BY s.id ORDER BY s.created_at DESC";

    const suppliersList = db.prepare(query).all(...params);

    const statusRows = db.prepare(`
      SELECT kyb_status, COUNT(*) AS count
      FROM suppliers
      GROUP BY kyb_status
    `).all();
    const statusCounts = statusRows.reduce((counts, row) => {
      counts[String(row.kyb_status || "PENDING").toUpperCase()] = Number(row.count || 0);
      return counts;
    }, { ALL: db.prepare("SELECT COUNT(*) AS count FROM suppliers").get().count });

    const suppliersWithDocs = suppliersList.map((sup) => {
      // The file location stays on the server; the dossier opens files through
      // the admin-only document route.
      const kybDocs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ? ORDER BY submitted_at DESC").all(sup.id)
        .map(({ doc_url, ...doc }) => ({ ...doc, has_file: hasKybFile({ doc_url }) }));
      const secureIdVerifications = db.prepare(`
        SELECT * FROM supplier_kyb_verifications
        WHERE supplier_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `).all(sup.id);

      return {
        ...sup,
        is_verified: Boolean(sup.is_verified || sup.kyb_status === "APPROVED"),
        bankDetails: parseBankDetails(sup.payout_bank_details),
        kybDocs,
        kybReadiness: getKybApprovalReadiness(db, sup),
        secureIdVerifications,
        total_products: sup.total_products || 0,
        published_products: sup.published_products || 0,
        commission_rate_effective: resolveCommissionRate(db, sup.id),
      };
    });

    res.json({ success: true, suppliers: suppliersWithDocs, statusCounts });
  } catch (err) {
    logger.error("Admin supplier lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch supplier list" });
  }
});

// POST /api/admin/suppliers/:id/kyb/auto-verify - One-click Cashfree SecureID KYB Verification Audit
router.post("/suppliers/:id/kyb/auto-verify", optionalAuthMiddleware, requireAdminAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    // Suppliers abroad have no GSTIN or PAN to check; review their documents (ADR 023).
    const country = supplierCountry(db, supplier);
    if (!supplierKybRules(db, supplier, country).cashfree) {
      const error = country === "India" ? "This supplier is an individual vehicle owner with no GSTIN. Review their documents and approve by hand." : `Cashfree checks are for Indian suppliers. Review this ${country} supplier's documents and approve by hand.`;
      return res.status(400).json({ error, code: "CASHFREE_INDIA_ONLY" });
    }

    const auditReport = await runComprehensiveSupplierKyb(db, {
      supplierId: id,
      actorId: req.user?.id || "admin",
      actorRole: req.user?.role || "ADMIN",
    });

    const autoApproval = autoApproveSupplierKyb(db, id, {
      notify: (payload) => queueNotification(notifySupplierVerification(payload), `KYB auto-approval notification for ${id}`),
    });

    const verifications = db.prepare(`
      SELECT * FROM supplier_kyb_verifications
      WHERE supplier_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id);
    const updatedSupplier = autoApproval.supplier || auditReport.updatedSupplier;

    res.json({
      success: true,
      report: auditReport,
      verifications,
      supplier: updatedSupplier,
      kybReadiness: getKybApprovalReadiness(db, updatedSupplier),
      kybAutoApproved: autoApproval.approved,
      message: autoApproval.approved
        ? "Cashfree SecureID verified the GSTIN and PAN, so the supplier was approved automatically and notified."
        : "Cashfree SecureID KYB audit completed successfully.",
    });
  } catch (err) {
    logger.error("Admin KYB auto-verification failed", { requestId: req.requestId, error: err.message });
    res.status(500).json({ error: err.message || "Failed to execute Cashfree SecureID KYB check" });
  }
});

// GET /api/admin/suppliers/:id/kyb/:docId/file - Open a supplier's uploaded KYB file
router.get("/suppliers/:id/kyb/:docId/file", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const doc = db.prepare("SELECT * FROM kyb_documents WHERE id = ? AND supplier_id = ?").get(req.params.docId, req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return sendKybDocumentFile(res, doc);
  } catch (err) {
    logger.error("Admin KYB document file failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Could not open the document" });
  }
});

// POST /api/admin/suppliers/:id/kyb/:docId/reupload - Ask the supplier to upload one document again
// (e.g. a licence in another name). The supplier's KYB status is unchanged (owner decision 2026-09-24).
router.post("/suppliers/:id/kyb/:docId/reupload", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.kybReupload), (req, res) => {
  try {
    const doc = db.prepare("SELECT id, doc_type FROM kyb_documents WHERE id = ? AND supplier_id = ?").get(req.params.docId, req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const reason = req.body.reason.trim();
    db.prepare("UPDATE kyb_documents SET status = 'REJECTED', rejection_reason = ?, verified_at = datetime('now') WHERE id = ?").run(reason, doc.id);
    // Tell the supplier by email and WhatsApp; a failed send never undoes the request.
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
    const documentLabel = supplierKybRules(db, supplier).documentTypes.find((type) => type.docType === doc.doc_type)?.label || doc.doc_type.replaceAll("_", " ").toLowerCase();
    queueNotification(notifyKybDocumentReupload(db, { supplier, documentId: doc.id, documentLabel, reason }), `KYB re-upload notification for ${supplier.id}`);
    res.json({ success: true, document: db.prepare("SELECT id, doc_type, status, rejection_reason FROM kyb_documents WHERE id = ?").get(doc.id), message: "The supplier is asked to upload this document again." });
  } catch (err) {
    logger.error("Admin KYB re-upload request failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Could not ask for the document again" });
  }
});

// POST /api/admin/suppliers/:id/verify - Approve or Reject supplier (One-Click) with automated email notification
router.post("/suppliers/:id/verify", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.verification), async (req, res) => {
  try {
    const verification = saveSupplierVerification(db, {
      supplierId: req.params.id,
      action: req.body?.action,
      reason: req.body?.reason,
      commissionRate: req.body?.commissionRate,
    });
    const { supplier, action, reason, commissionRate } = verification;

    let notificationResult;
    try {
      notificationResult = await notifySupplierVerification({ supplier, action, reason, commissionRate });
    } catch (notificationError) {
      logger.error("Supplier verification notification failed", { requestId: req.requestId, error: notificationError });
      notificationResult = {
        email: { success: false, status: "FAILED" },
        whatsapp: { success: false, status: "FAILED" },
      };
    }

    const emailStatus = notificationResult.email?.status || "FAILED";
    const whatsappStatus = notificationResult.whatsapp?.status || "FAILED";
    const notificationWarning = notificationResult.email?.success || notificationResult.whatsapp?.success
      ? null
      : "The KYC status was saved, but email and WhatsApp were not delivered. You can retry them from Notifications.";

    res.json({
      success: true,
      supplier,
      message: `Supplier ${supplier.company_name} set to ${action}.${notificationWarning ? ` ${notificationWarning}` : " Notification delivery has been recorded."}`,
      notificationWarning,
      emailDispatched: Boolean(notificationResult.email?.success),
      whatsappDispatched: Boolean(notificationResult.whatsapp?.success),
      deliveryStatus: {
        email: emailStatus,
        whatsapp: whatsappStatus,
      },
    });
  } catch (err) {
    logger.error("Supplier verification failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Supplier KYC status could not be saved. Please retry or contact support.",
    });
  }
});

// POST /api/admin/suppliers/:id/profile-verification - Grant (yearly, after checks) or revoke the Verified badge
router.post("/suppliers/:id/profile-verification", optionalAuthMiddleware, requireAdminAccess, validateBody(profileSchemas.verification), (req, res) => {
  try {
    const actorId = req.user?.email || req.user?.id || "admin";
    const action = String(req.body.action).toUpperCase();
    if (action === "GRANT") {
      const verification = grantSupplierVerification(db, req.params.id, { checks: req.body.checks, reason: req.body.reason, actorId });
      return res.status(201).json({ success: true, verification, profile: ownerProfileView(db, req.params.id) });
    }
    const result = revokeSupplierVerification(db, req.params.id, { reason: req.body.reason, actorId });
    return res.json({ success: true, ...result, profile: ownerProfileView(db, req.params.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("Supplier profile verification failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Verification decision could not be saved" });
  }
});

// PATCH /api/admin/suppliers/:id/profile-status - Suspend or restore a public profile
router.patch("/suppliers/:id/profile-status", optionalAuthMiddleware, requireAdminAccess, validateBody(profileSchemas.profileStatus), (req, res) => {
  try {
    setProfileSuspended(db, req.params.id, { suspended: req.body.suspended, reason: req.body.reason });
    return res.json({ success: true, profile: ownerProfileView(db, req.params.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("Supplier profile status change failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Profile status could not be saved" });
  }
});

// Team: the ADMIN and STAFF users who run the platform and receive its alerts.
function sendTeamError(req, res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
  logger.error(fallback, { requestId: req.requestId, error: err });
  return res.status(500).json({ error: fallback });
}

// GET /api/admin/team - List administrators and staff
router.get("/team", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    return res.json({ success: true, members: listTeam(db), currentUserId: req.user.id });
  } catch (err) {
    return sendTeamError(req, res, err, "Could not load the team");
  }
});

// POST /api/admin/team - Add a staff member or administrator (temporary password returned once)
router.post("/team", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.teamMember), (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.status(201).json({ success: true, ...addTeamMember(db, req.body) });
  } catch (err) {
    return sendTeamError(req, res, err, "Could not add the team member");
  }
});

// PATCH /api/admin/team/:id - Update name, WhatsApp number or role
router.patch("/team/:id", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.teamMemberUpdate), (req, res) => {
  try {
    return res.json({ success: true, member: updateTeamMember(db, req.params.id, req.body, req.user) });
  } catch (err) {
    return sendTeamError(req, res, err, "Could not update the team member");
  }
});

// DELETE /api/admin/team/:id - Revoke team access (the account becomes a traveler)
router.delete("/team/:id", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    return res.json({ success: true, ...removeTeamMember(db, req.params.id, req.user) });
  } catch (err) {
    return sendTeamError(req, res, err, "Could not remove the team member");
  }
});

// POST /api/admin/team/:id/reset-password - Issue a new temporary password (returned once)
router.post("/team/:id/reset-password", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, ...resetTeamMemberPassword(db, req.params.id) });
  } catch (err) {
    return sendTeamError(req, res, err, "Could not reset the password");
  }
});

// GET /api/admin/suppliers/:id/public-profile - Profile, badge and verification history for the approval drawer
router.get("/suppliers/:id/public-profile", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    return res.json({ success: true, ...ownerProfileView(db, req.params.id), checkCatalog: VERIFICATION_CHECKS, requiredChecks: REQUIRED_VERIFICATION_CHECKS });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("Admin supplier profile lookup failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Could not load the supplier profile" });
  }
});

// Commission (ADR 017): product override → supplier override → platform default.
// Every change needs a reason, is recorded, and notifies the affected suppliers.
function commissionFailure(res, req, error, fallback) {
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

function queueCommissionNotices(changes) {
  const due = changes.filter((change) => change?.notify);
  if (due.length) queueNotification(sendCommissionChangeNotices(db, due), "Commission change notices");
}

// POST /api/admin/suppliers/:id/commission { commissionRate | null, reason }
router.post("/suppliers/:id/commission", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.commission), (req, res) => {
  try {
    const result = setSupplierCommission(db, {
      supplierId: req.params.id,
      rate: req.body.commissionRate ?? req.body.commission_rate ?? null,
      actorId: req.user.id,
      reason: req.body.reason,
    });
    queueCommissionNotices([result.change]);
    res.json({ success: true, ...result, message: result.override === null ? `Supplier is on the platform default (${result.rate}%)` : `Supplier commission updated to ${result.rate}%` });
  } catch (error) {
    commissionFailure(res, req, error, "Failed to update commission rate");
  }
});

// PUT /api/admin/products/:id/commission { commissionRate | null, reason }
router.put("/products/:id/commission", validateBody(adminSchemas.commission), (req, res) => {
  try {
    const result = setProductCommission(db, {
      productId: req.params.id,
      rate: req.body.commissionRate ?? req.body.commission_rate ?? null,
      actorId: req.user.id,
      reason: req.body.reason,
    });
    queueCommissionNotices([result.change]);
    res.json({ success: true, ...result });
  } catch (error) {
    commissionFailure(res, req, error, "Failed to update product commission");
  }
});

router.get("/commission", (req, res) => {
  try {
    res.json({ success: true, ...listCommissionOverrides(db), changes: listCommissionChanges(db, { limit: 100 }) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load commission settings");
  }
});

// Paid Verified checks (ADR 008): pass with the existing profile-verification grant, or reject and refund.
router.get("/verification-queue", (req, res) => {
  try {
    const failedRefunds = db.prepare(`
      SELECT p.id, p.supplier_id, p.plan_code, p.refund_amount_inr, s.company_name FROM supplier_plan_payments p
      JOIN suppliers s ON s.id = p.supplier_id WHERE p.refund_status = 'FAILED' ORDER BY p.created_at ASC
    `).all().map((row) => ({ paymentId: row.id, supplierId: row.supplier_id, supplierName: row.company_name, planCode: row.plan_code, refundAmountInr: row.refund_amount_inr }));
    res.json({ success: true, queue: listVerificationQueue(db), failedRefunds });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load the verification queue");
  }
});

router.post("/verifications/:id/reject", async (req, res) => {
  try {
    res.json({ success: true, ...(await rejectPurchasedVerification(db, req.params.id, { reason: req.body?.reason, actorId: req.user.id })) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not reject the check");
  }
});

router.post("/plan-payments/:id/retry-refund", async (req, res) => {
  try {
    res.json({ success: true, ...(await retryCheckRefund(db, req.params.id)) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not retry the refund");
  }
});

// Coupons (ADR 017 Phase 2). Never deleted: bookings refer to their code.
router.get("/coupons", (req, res) => {
  try {
    res.json({ success: true, coupons: listCoupons(db) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load coupons");
  }
});

router.post("/coupons", validateBody(adminSchemas.coupon), (req, res) => {
  try {
    res.status(201).json({ success: true, coupon: createCoupon(db, req.body, { actorId: req.user.id }) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not create the coupon");
  }
});

router.patch("/coupons/:id", validateBody(adminSchemas.couponUpdate), (req, res) => {
  try {
    res.json({ success: true, coupon: updateCoupon(db, req.params.id, req.body, { actorId: req.user.id }) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not update the coupon");
  }
});

router.get("/coupons/:id/redemptions", (req, res) => {
  try {
    res.json({ success: true, ...listCouponRedemptions(db, req.params.id) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load the coupon's uses");
  }
});

// Package library (ADR 047): entries suppliers add to their rate sheets. Hidden, never deleted.
function libraryFailure(res, req, error, fallback) {
  if (error.name === "ZodError") {
    const issue = error.issues?.[0];
    return res.status(400).json({ error: issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "Check the entry", code: "VALIDATION_ERROR" });
  }
  return commissionFailure(res, req, error, fallback);
}

router.get("/package-library", (req, res) => {
  try { res.json({ success: true, ...listLibraryItems(db) }); } catch (error) { libraryFailure(res, req, error, "Could not load the package library"); }
});

router.post("/package-library", (req, res) => {
  try { res.status(201).json({ success: true, item: saveLibraryItem(db, req.body) }); } catch (error) { libraryFailure(res, req, error, "Could not add the entry"); }
});

router.put("/package-library/:id", (req, res) => {
  try { res.json({ success: true, item: saveLibraryItem(db, req.body, req.params.id) }); } catch (error) { libraryFailure(res, req, error, "Could not save the entry"); }
});

// Route and city library (ADR 048). Hidden, never deleted.
router.get("/route-library", (req, res) => {
  try { res.json({ success: true, ...listSharedLibrary(db) }); } catch (error) { libraryFailure(res, req, error, "Could not load the route library"); }
});
router.post("/route-library/routes", (req, res) => {
  try { res.status(201).json({ success: true, route: saveSharedRoute(db, req.body) }); } catch (error) { libraryFailure(res, req, error, "Could not add the route"); }
});
router.put("/route-library/routes/:id", (req, res) => {
  try { res.json({ success: true, route: saveSharedRoute(db, req.body, req.params.id) }); } catch (error) { libraryFailure(res, req, error, "Could not save the route"); }
});
router.post("/route-library/cities", (req, res) => {
  try { res.status(201).json({ success: true, city: saveCity(db, req.body) }); } catch (error) { libraryFailure(res, req, error, "Could not add the city"); }
});
router.put("/route-library/cities/:id", (req, res) => {
  try { res.json({ success: true, city: saveCity(db, req.body, req.params.id) }); } catch (error) { libraryFailure(res, req, error, "Could not save the city"); }
});

// Staff blog (ADR 026). Drafts stay private until published.
router.get("/blog", (req, res) => {
  try {
    res.json({ success: true, posts: listAllPosts(db) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load blog posts");
  }
});

router.post("/blog", validateBody(adminSchemas.blogPost), (req, res) => {
  try {
    res.status(201).json({ success: true, post: createPost(db, req.body, { actorId: req.user.id }) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not create the post");
  }
});

router.patch("/blog/:id", validateBody(adminSchemas.blogPostUpdate), (req, res) => {
  try {
    res.json({ success: true, post: updatePost(db, req.params.id, req.body) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not update the post");
  }
});

router.delete("/blog/:id", (req, res) => {
  try {
    deletePost(db, req.params.id);
    res.json({ success: true });
  } catch (error) {
    commissionFailure(res, req, error, "Could not delete the post");
  }
});

// Supplier subscriptions (ADR 017): new suppliers need cover to take bookings.
router.get("/supplier-subscriptions", (req, res) => {
  try {
    res.json({ success: true, suppliers: listSupplierSubscriptions(db) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load supplier subscriptions");
  }
});

router.get("/suppliers/:id/subscription", (req, res) => {
  try {
    res.json({ success: true, subscription: getSubscriptionStatus(db, req.params.id) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not load the supplier's subscription");
  }
});

// POST /api/admin/suppliers/:id/subscription/waiver { until: "YYYY-MM-DD" | null, reason }
router.post("/suppliers/:id/subscription/waiver", validateBody(adminSchemas.subscriptionWaiver), (req, res) => {
  try {
    const waiver = grantSubscriptionWaiver(db, { supplierId: req.params.id, until: req.body.until ?? null, reason: req.body.reason, actorId: req.user.id });
    res.status(201).json({ success: true, waiver, subscription: getSubscriptionStatus(db, req.params.id) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not waive the subscription");
  }
});

// POST /api/admin/supplier-subscriptions/:id/end { reason }
router.post("/supplier-subscriptions/:id/end", validateBody(adminSchemas.endSubscription), (req, res) => {
  try {
    const ended = revokeSubscription(db, { subscriptionId: req.params.id, reason: req.body.reason, actorId: req.user.id });
    res.json({ success: true, subscription: getSubscriptionStatus(db, ended.supplier_id) });
  } catch (error) {
    commissionFailure(res, req, error, "Could not end the subscription");
  }
});

// POST /api/admin/commission/clear-overrides { includeProducts, notify, reason }
// Puts suppliers (and optionally products) on the platform default.
router.post("/commission/clear-overrides", validateBody(adminSchemas.clearCommissionOverrides), (req, res) => {
  try {
    const result = clearCommissionOverrides(db, {
      includeProducts: req.body.includeProducts,
      notify: req.body.notify,
      actorId: req.user.id,
      reason: req.body.reason,
    });
    queueCommissionNotices(result.changes);
    res.json({ success: true, ...result });
  } catch (error) {
    commissionFailure(res, req, error, "Could not clear commission overrides");
  }
});

// Program settings (ADR 017): giveaway cap and, per phase, the other money programs.
router.get("/programs", (req, res) => {
  try {
    res.json({ success: true, programs: listPrograms(db) });
  } catch (error) {
    logger.error("Program settings lookup failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not load program settings" });
  }
});

router.get("/programs/audit", (req, res) => {
  try {
    const key = typeof req.query.key === "string" && req.query.key ? req.query.key : null;
    res.json({ success: true, changes: listSettingsAudit(db, { key, limit: 200 }) });
  } catch (error) {
    logger.error("Program settings audit lookup failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not load the change history" });
  }
});

router.put("/programs/:key", validateBody(adminSchemas.programSettings), (req, res) => {
  try {
    const result = updateSettings(db, req.params.key, req.body.settings, { actorId: req.user.id, reason: req.body.reason });
    if (req.params.key === "commission" && result.changed) {
      const change = recordPlatformCommissionChange(db, {
        oldRate: result.previous.defaultRatePercent,
        newRate: result.settings.defaultRatePercent,
        actorId: req.user.id,
        reason: req.body.reason,
        notify: req.body.notify !== false,
      });
      queueCommissionNotices([change]);
    }
    if (req.params.key === "supplier_subscriptions" && result.changed) {
      result.launchWaivers = syncLaunchWaivers(db);
    }
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
    logger.error("Program settings update failed", { requestId: req.requestId, error });
    res.status(500).json({ error: "Could not save program settings" });
  }
});

// GET /api/admin/products - List products (Transfer routes, Day Tours, Multi-day packages) for moderation
router.get("/products", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const { status, type } = req.query;
    let query = `
      SELECT p.*, s.company_name as supplier_name, s.email as supplier_email, s.commission_rate as supplier_commission
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
    `;
    const clauses = [];
    const params = [];

    if (status && status !== "ALL") {
      clauses.push("p.status = ?");
      params.push(status.toUpperCase());
    }
    if (type && type !== "ALL") {
      clauses.push("p.product_type = ?");
      params.push(type.toUpperCase());
    }

    if (clauses.length > 0) {
      query += " WHERE " + clauses.join(" AND ");
    }
    query += " ORDER BY COALESCE(p.created_at, '') DESC, p.rowid DESC";

    const productsList = db.prepare(query).all(...params);

    const enrichedProducts = productsList.map((p) => {
      let routeDetail = null;
      let packageDetail = null;

      if (p.product_type === "TRANSFER") {
        routeDetail = db.prepare("SELECT * FROM transfer_routes WHERE product_id = ?").get(p.id);
      } else if (p.product_type === "MULTI_DAY_PACKAGE") {
        packageDetail = db.prepare("SELECT * FROM package_itineraries WHERE product_id = ?").get(p.id);
      }

      return {
        ...p,
        is_published: Boolean(p.is_published === undefined ? (p.status === "PUBLISHED" ? 1 : 0) : p.is_published),
        commission_rate_effective: resolveCommissionRate(db, p.supplier_id, p.id),
        routeDetail,
        packageDetail
      };
    });

    res.json({ success: true, products: enrichedProducts });
  } catch (err) {
    logger.error("Admin product lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch products for moderation" });
  }
});

// POST /api/admin/products/:id/toggle-published - Content approval toggle (is_published)
router.post("/products/:id/toggle-published", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.publication), (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished, status, notifySupplier = false } = req.body;

    const prod = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!prod) return res.status(404).json({ error: "Product not found" });

    const newPublish = isPublished !== undefined ? (isPublished ? 1 : 0) : (prod.is_published ? 0 : 1);
    const newStatus = status || (newPublish ? "PUBLISHED" : "DRAFT");

    db.prepare("UPDATE products SET is_published = ?, status = ? WHERE id = ?").run(newPublish, newStatus, id);

    const notificationQueued = Boolean(newPublish && notifySupplier);
    if (notificationQueued) {
      queueNotification(notifyProductPublished(db, id), `Listing publication notification for ${id}`);
    }

    res.json({
      success: true,
      is_published: Boolean(newPublish),
      status: newStatus,
      notificationQueued,
      message: newPublish
        ? `Product "${prod.title}" is live in the marketplace.${notificationQueued ? " A supplier notification has been queued." : ""}`
        : `Product "${prod.title}" is hidden from the marketplace.`
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update product approval status" });
  }
});

// GET /api/admin/finance/overview - High level financial overview (GMV, Net Commission, Pending Payouts)
router.get("/finance/overview", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const reconciliation = getReconciliationReport(db);
    const pendingPayouts = db.prepare("SELECT COALESCE(SUM(net_payout), 0) AS amount FROM payouts WHERE payout_status IN ('SCHEDULED', 'BATCHED', 'ISSUE_HOLD')").get().amount;

    res.json({
      success: true,
      finance: {
        gmv: reconciliation.totals.captured,
        netCollected: reconciliation.totals.netCollected,
        refundedAmount: reconciliation.totals.refunds,
        totalCommission: reconciliation.totals.commission,
        pendingPayouts,
        processedPayouts: reconciliation.totals.settled,
        reconciliationExceptions: reconciliation.exceptionCount,
        unbalancedTransactions: reconciliation.unbalancedCount,
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch financial overview" });
  }
});

router.get("/finance/reconciliation", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    res.json({ success: true, reconciliation: getReconciliationReport(db) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to reconcile finance records" });
  }
});

router.get("/finance/settlements", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const payouts = db.prepare(`SELECT p.*, s.company_name, b.ref AS booking_ref FROM payouts p JOIN suppliers s ON s.id = p.supplier_id JOIN bookings b ON b.id = p.booking_id ORDER BY p.created_at DESC`).all();
    const batches = db.prepare(`SELECT pb.*, s.company_name FROM payout_batches pb JOIN suppliers s ON s.id = pb.supplier_id ORDER BY pb.created_at DESC`).all();
    res.json({ success: true, payouts, batches });
  } catch (err) {
    res.status(500).json({ error: "Failed to load supplier settlements" });
  }
});

router.post("/finance/settlements", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.settlement), (req, res) => {
  try {
    const batch = createSettlementBatch(db, { supplierId: req.body?.supplierId, payoutIds: req.body?.payoutIds || [], actorId: req.user.id, notes: req.body?.notes });
    res.status(201).json({ success: true, batch, message: `${batch.batch_ref} created with ${batch.payout_count} payout${batch.payout_count === 1 ? "" : "s"}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to create settlement batch" });
  }
});

router.post("/finance/settlements/auto-batch", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const batches = autoCreateAllSettlementBatches(db, req.user?.id || "admin");
    res.status(201).json({
      success: true,
      batches,
      count: batches.length,
      message: batches.length > 0
        ? `Successfully generated ${batches.length} settlement batch${batches.length === 1 ? "" : "es"}.`
        : "No eligible scheduled payouts found for settlement generation.",
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to auto-generate settlement batches" });
  }
});

router.post("/finance/settlements/:id/process-cashfree", optionalAuthMiddleware, requireAdminAccess, async (req, res) => {
  try {
    const batch = db.prepare("SELECT pb.*, s.company_name, s.payout_bank_details, s.email, s.phone FROM payout_batches pb JOIN suppliers s ON s.id = pb.supplier_id WHERE pb.id = ? OR pb.batch_ref = ?").get(req.params.id, req.params.id);
    if (!batch) return res.status(404).json({ error: "Settlement batch not found" });
    if (batch.status === "PROCESSED" || batch.status === "RECONCILED") {
      return res.json({ success: true, batch, idempotent: true, message: `${batch.batch_ref} was already processed.` });
    }

    const bankDetails = parseBankDetails(batch.payout_bank_details);
    if (!bankDetails.account_number && !bankDetails.upi_id) {
      return res.status(400).json({ error: "Supplier has not configured a valid payout bank account or UPI ID" });
    }

    const transfer = await initiateCashfreeTransfer({
      transferId: `tr_${batch.batch_ref.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      amount: batch.net_amount,
      beneficiaryDetails: {
        ...bankDetails,
        name: bankDetails.account_holder || batch.company_name,
        email: batch.email,
        phone: batch.phone,
      },
      remarks: `Settlement ${batch.batch_ref} for ${batch.company_name}`,
    });

    const result = processSettlementBatch(db, {
      batchId: batch.id,
      provider: "CASHFREE",
      providerReference: transfer.utr || transfer.transferId || transfer.referenceId,
      actorId: req.user?.id || "admin",
    });

    if (!result.idempotent) queueNotification(notifySettlementProcessed(db, result.batch.id), "Settlement notification");

    res.json({
      success: true,
      batch: result.batch,
      transfer,
      message: `${result.batch.batch_ref} dispatched via Cashfree Direct Transfer with UTR ${result.batch.provider_batch_id}.`,
    });
  } catch (err) {
    logger.error("Cashfree settlement processing failed", { error: err.message, batchId: req.params.id });
    res.status(err.status || 500).json({ error: err.message || "Cashfree automated settlement failed" });
  }
});

router.post("/finance/settlements/:id/process", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.settlement), (req, res) => {
  try {
    const result = processSettlementBatch(db, { batchId: req.params.id, provider: req.body?.provider, providerReference: req.body?.providerReference, actorId: req.user.id });
    if (!result.idempotent) queueNotification(notifySettlementProcessed(db, result.batch.id), "Settlement notification");
    res.json({ success: true, ...result, message: `${result.batch.batch_ref} marked processed with verified reference ${result.batch.provider_batch_id}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to process settlement" });
  }
});

router.post("/finance/settlements/:id/reconcile", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.settlement), (req, res) => {
  try {
    const batch = reconcileSettlementBatch(db, { batchId: req.params.id, note: req.body?.note });
    res.json({ success: true, batch, message: `${batch.batch_ref} reconciled.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to reconcile settlement" });
  }
});

router.post("/finance/refunds/:id", optionalAuthMiddleware, requireAdminAccess, validateBody(checkoutSchemas.refund), async (req, res) => {
  try {
    const booking = db.prepare("SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?").get(req.params.id, req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    // REFUND_INITIATED: a traveler cancellation whose gateway refund never went through.
    // Retry it for the amount fixed at cancellation, not the override percentage.
    const owedRefund = booking.payment_status === "REFUND_INITIATED";
    if (booking.payment_status !== "PAID" && !owedRefund) return res.status(409).json({ error: "Only a paid booking can be refunded" });
    const quote = owedRefund
      ? pendingRefundQuote(booking)
      : calculateRefundQuote(db, booking, { overridePercentage: req.body?.refundPercentage ?? 100 });
    const refund = createRefundRecord(db, { booking, quote, reason: req.body?.reason, actorId: req.user.id });
    let providerResult = { refundId: "rfnd_none", status: "NO_REFUND_APPLICABLE" };
    try {
      if (quote.refundAmount > 0) {
        providerResult = await sendRefundToGateway(booking, { refund, amount: quote.refundAmount, reason: req.body?.reason || quote.policyTier });
      }
    } catch (error) {
      failRefund(db, refund.id, error.message);
      throw error;
    }
    const allocation = finalizeRefund(db, { booking, refund, providerResult });
    queueNotification(notifyRefundProcessed(db, refund.id), "Admin refund notification");
    res.json({ success: true, refund, quote, allocation, gatewayRefundId: providerResult.refundId, message: `Refund of ₹${quote.refundAmount} recorded for ${booking.ref}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to process admin refund" });
  }
});

// GET /api/admin/bookings - Master searchable platform bookings table
router.get("/bookings", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const { search, status, paymentStatus } = req.query;
    let query = `
      SELECT b.*, p.title as product_title, p.hero_image, s.company_name as supplier_name, s.phone as supplier_phone,
             da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number,
             (SELECT COUNT(*) FROM supplier_assignment_attempts saa WHERE saa.booking_id = b.id) AS assignment_candidates
      FROM bookings b
      LEFT JOIN products p ON b.product_id = p.id
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      LEFT JOIN driver_assignments da ON b.id = da.booking_id
    `;
    const clauses = [];
    const params = [];

    if (status && status !== "ALL") {
      clauses.push("b.status = ?");
      params.push(status.toLowerCase());
    }
    if (paymentStatus && paymentStatus !== "ALL") {
      clauses.push("b.payment_status = ?");
      params.push(paymentStatus.toUpperCase());
    }
    if (search) {
      const term = String(search).toLowerCase().trim();
      clauses.push(`(
        instr(lower(COALESCE(b.ref, '')), ?) > 0
        OR instr(lower(COALESCE(b.traveler_name, '')), ?) > 0
        OR instr(lower(COALESCE(b.traveler_email, '')), ?) > 0
        OR instr(lower(COALESCE(b.product_code, '')), ?) > 0
        OR instr(lower(COALESCE(p.product_code, '')), ?) > 0
        OR instr(lower(COALESCE(b.product_id, '')), ?) > 0
        OR instr(lower(COALESCE(p.title, '')), ?) > 0
        OR instr(lower(COALESCE(b.supplier_code, '')), ?) > 0
        OR instr(lower(COALESCE(s.supplier_code, '')), ?) > 0
        OR instr(lower(COALESCE(b.supplier_id, '')), ?) > 0
        OR instr(lower(COALESCE(s.company_name, '')), ?) > 0
      )`);
      params.push(term, term, term, term, term, term, term, term, term, term, term, term);
    }

    if (clauses.length > 0) {
      query += " WHERE " + clauses.join(" AND ");
    }
    query += " ORDER BY b.created_at DESC";

    const bookingsList = db.prepare(query).all(...params).map(withoutPickupOtpSecrets);

    const suppliersList = db.prepare("SELECT id, company_name, phone, city FROM suppliers WHERE kyb_status = 'APPROVED'").all();

    res.json({ success: true, bookings: bookingsList, availableSuppliers: suppliersList });
  } catch (err) {
    logger.error("Admin booking lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch master bookings table" });
  }
});

// GET /api/admin/bookings/:id/assignment - Explain an automatic supplier decision
router.get("/bookings/:id/assignment", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const booking = db.prepare("SELECT id, ref, supplier_id, supplier_assignment_status, supplier_assignment_method, supplier_assignment_score, supplier_assignment_reason, assigned_supplier_product_id, supplier_assigned_at, supplier_response_status, supplier_response_deadline, supplier_responded_at, supplier_response_note, assignment_round FROM bookings WHERE id = ? OR ref = ?").get(req.params.id, req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const candidates = db.prepare(`
      SELECT saa.*, s.company_name
      FROM supplier_assignment_attempts saa
      JOIN suppliers s ON s.id = saa.supplier_id
      WHERE saa.booking_id = ?
      ORDER BY CASE saa.decision WHEN 'SELECTED' THEN 0 WHEN 'ELIGIBLE_NOT_SELECTED' THEN 1 ELSE 2 END, saa.score DESC
    `).all(booking.id).map((candidate) => ({
      ...candidate,
      rejection_reasons: parseJson(candidate.rejection_reasons, []),
      score_breakdown: parseJson(candidate.score_breakdown, {}),
    }));
    return res.json({ success: true, booking, candidates });
  } catch (err) {
    logger.error("Assignment audit lookup failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Failed to fetch assignment audit" });
  }
});

// POST /api/admin/bookings/:id/override-status - Status overrides (Force Cancel, Refund, Manual Re-assignment)
router.post("/bookings/:id/override-status", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.override), (req, res) => {
  try {
    const { id } = req.params;
    const { action, newSupplierId, driverName, driverPhone, driverEmail, seatCapacity, vehicleModel, vehicleNumber } = req.body;
    // action: 'FORCE_CANCEL' | 'REFUND' | 'REASSIGN_SUPPLIER' | 'REASSIGN_DRIVER'

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(id, id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (action === "FORCE_CANCEL") {
      // Lowercase status is what dispatch and inventory read; the driver is told immediately.
      dispatchTransaction(db, () => {
        db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
        db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
        const assignment = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(booking.id);
        if (assignment) revokeAssignment(db, booking, assignment, "Booking cancelled by Idea Holiday");
      });
      res.json({ success: true, message: `Booking ${booking.ref} FORCE CANCELLED by Admin.` });
    } else if (action === "REFUND") {
      res.status(409).json({ error: "Use the verified finance refund action so the gateway reference and ledger are recorded" });
    } else if (action === "REASSIGN_SUPPLIER") {
      if (!newSupplierId) return res.status(400).json({ error: "newSupplierId required for supplier re-assignment" });
      const sup = db.prepare("SELECT company_name FROM suppliers WHERE id = ?").get(newSupplierId);
      if (!sup) return res.status(404).json({ error: "Approved supplier not found" });
      db.prepare("UPDATE bookings SET supplier_id = ?, supplier_assignment_status = 'MANUAL_ASSIGNED', supplier_assignment_method = 'ADMIN_OVERRIDE', supplier_assignment_score = NULL, supplier_assignment_reason = ?, assigned_supplier_product_id = NULL, supplier_assigned_at = datetime('now') WHERE id = ?")
        .run(newSupplierId, `Admin manually reassigned booking to ${sup.company_name}`, booking.id);
      db.prepare("UPDATE payouts SET supplier_id = ? WHERE booking_id = ?").run(newSupplierId, booking.id);
      res.json({ success: true, message: `Booking ${booking.ref} manually re-assigned to supplier "${sup?.company_name || newSupplierId}".` });
    } else if (action === "REASSIGN_DRIVER") {
      // Same validation, audit trail and driver request as supplier dispatch.
      const assignment = assignDriverToBooking(db, {
        supplierId: booking.supplier_id,
        bookingId: booking.id,
        actorId: req.user?.id,
        manualDriver: { driverName, driverPhone, driverEmail, seatCapacity, vehicleModel, vehicleNumber },
      });
      res.json({ success: true, assignment, message: `Driver "${assignment.driver_name}" assigned to booking ${booking.ref}. They must accept from the trip link.` });
    } else {
      res.status(400).json({ error: "Invalid action type" });
    }
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    logger.error("Booking status override failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to execute booking status override" });
  }
});

// GET /api/admin/payouts - Payout schedule overview
router.get("/payouts", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const payouts = db
      .prepare(
        `SELECT p.*, s.company_name, s.payout_bank_details, b.ref as booking_ref, b.product_type, b.traveler_name
         FROM payouts p
         JOIN suppliers s ON p.supplier_id = s.id
         JOIN bookings b ON p.booking_id = b.id
         ORDER BY p.created_at DESC`
      )
      .all();
    res.json({ success: true, payouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

// POST /api/admin/payouts/process - Trigger automated payout
router.post("/payouts/process", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.payout), (req, res) => {
  try {
    const { payoutId, providerReference, provider } = req.body;
    if (!payoutId) return res.status(400).json({ error: "payoutId is required" });
    const payout = db.prepare("SELECT * FROM payouts WHERE id = ? AND payout_status = 'SCHEDULED'").get(payoutId);
    if (!payout) return res.status(404).json({ error: "Scheduled payout not found" });
    const batch = createSettlementBatch(db, { supplierId: payout.supplier_id, payoutIds: [payoutId], actorId: req.user.id, notes: "Single payout settlement" });
    const result = processSettlementBatch(db, { batchId: batch.id, provider, providerReference, actorId: req.user.id });
    if (!result.idempotent) queueNotification(notifySettlementProcessed(db, result.batch.id), "Settlement notification");
    res.json({ success: true, batch: result.batch, message: `Payout processed under ${batch.batch_ref}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to process payout" });
  }
});

// GET /api/admin/email-logs - View recent automated email logs
router.get("/email-logs", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 50").all();
    res.json({ success: true, emailLogs: logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch email logs" });
  }
});

// POST /api/admin/reminders/trigger-run - Run automated trip reminders and review requests scanner
router.post("/reminders/trigger-run", optionalAuthMiddleware, requireAdminAccess, async (req, res) => {
  try {
    const result = await runAutomatedTripReminders(db);
    res.json({
      success: true,
      ...result,
      message: `Dispatched ${result.preTripRemindersSent} pre-trip reminder(s) and ${result.postTripReviewInvitesSent} review request(s).`,
    });
  } catch (err) {
    logger.error("Automated reminders trigger failed", { error: err });
    res.status(500).json({ error: err.message || "Failed to execute automated reminders runner" });
  }
});

// POST /api/admin/reminders/booking/:id/pre-trip - On-demand pre-trip reminder
router.post("/reminders/booking/:id/pre-trip", optionalAuthMiddleware, requireAdminAccess, async (req, res) => {
  try {
    const result = await notifyUpcomingTripReminder(db, req.params.id);
    res.json({
      success: true,
      ...result,
      message: `24-hour pre-trip reminder successfully sent for booking ${result.bookingRef}.`,
    });
  } catch (err) {
    logger.error("Pre-trip reminder on-demand dispatch failed", { error: err, bookingId: req.params.id });
    res.status(500).json({ error: err.message || "Failed to dispatch pre-trip reminder" });
  }
});

// POST /api/admin/reminders/booking/:id/post-trip-review - On-demand post-trip review invite
router.post("/reminders/booking/:id/post-trip-review", optionalAuthMiddleware, requireAdminAccess, async (req, res) => {
  try {
    const result = await notifyPostTripReviewRequest(db, req.params.id);
    res.json({
      success: true,
      ...result,
      message: `Post-trip review invite successfully sent for booking ${result.bookingRef}.`,
    });
  } catch (err) {
    logger.error("Post-trip review invite dispatch failed", { error: err, bookingId: req.params.id });
    res.status(500).json({ error: err.message || "Failed to dispatch post-trip review invite" });
  }
});

// GET /api/admin/reminders/status/:bookingId - Inspect reminder dispatch logs for a booking
router.get("/reminders/status/:bookingId", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM notification_deliveries 
      WHERE event_key LIKE ? || ':%' OR metadata LIKE '%"' || ? || '"%'
      ORDER BY created_at DESC
    `).all(req.params.bookingId, req.params.bookingId);

    const hasPreTrip = logs.some((l) => l.event_type === "PRE_TRIP_REMINDER" && l.status === "SENT");
    const hasReviewInvite = logs.some((l) => l.event_type === "POST_TRIP_REVIEW_INVITE" && l.status === "SENT");

    res.json({
      success: true,
      bookingId: req.params.bookingId,
      hasPreTripReminder: hasPreTrip,
      hasReviewInvite,
      logs,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reminder status" });
  }
});

export default router;
