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
} from "../services/notificationService.js";
import { processRazorpayRefund } from "../services/razorpayService.js";
import { processCashfreeRefund, initiateCashfreeTransfer } from "../services/cashfreeService.js";
import {
  runComprehensiveSupplierKyb,
  verifyGstin,
  verifyPan,
  verifyBankAccount,
} from "../services/cashfreeSecureIdService.js";
import { saveSupplierVerification } from "../services/supplierVerificationService.js";
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
} from "../services/financeService.js";
import { validateBody } from "../middleware/validation.js";
import { adminSchemas, checkoutSchemas } from "../validators/apiSchemas.js";

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

// Helper to parse bank details JSON string cleanly
const parseBankDetails = (raw) => {
  if (!raw) return { account_number: "N/A", ifsc: "N/A", bank_name: "N/A", upi_id: "N/A" };
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { account_number: "N/A", ifsc: "N/A", bank_name: "N/A", upi_id: "N/A" };
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
    const geoZones = db.prepare("SELECT COUNT(*) as count FROM geo_fences WHERE is_active = 1").get().count;
    const coveredCities = db.prepare("SELECT COUNT(DISTINCT city) as count FROM geo_fences WHERE is_active = 1").get().count;
    const pendingCoverage = db.prepare("SELECT COUNT(*) as count FROM geo_fences WHERE approval_status = 'PENDING_REVIEW'").get().count;

    const gmvResult = db.prepare("SELECT SUM(amount_inr) as sum FROM bookings WHERE LOWER(status) != 'cancelled'").get();
    const grossRevenue = gmvResult ? gmvResult.sum || 0 : 0;

    const commResult = db.prepare("SELECT SUM(commission_amount) as sum FROM bookings WHERE LOWER(status) != 'cancelled'").get();
    const totalCommission = commResult ? commResult.sum || 0 : 0;

    const pendingPayoutResult = db.prepare("SELECT SUM(net_payout) as sum FROM payouts WHERE payout_status = 'SCHEDULED'").get();
    const pendingPayouts = pendingPayoutResult ? pendingPayoutResult.sum || 0 : 0;

    const totalPayoutsProcessed = db.prepare("SELECT SUM(net_payout) as sum FROM payouts WHERE payout_status = 'PROCESSED'").get().sum || 0;

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
        totalPayoutsProcessed
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
             COUNT(CASE WHEN gf.is_active = 1 AND COALESCE(gf.approval_status, 'APPROVED') = 'APPROVED' THEN 1 END) AS active_zones,
             COUNT(DISTINCT CASE WHEN gf.is_active = 1 AND COALESCE(gf.approval_status, 'APPROVED') = 'APPROVED' THEN gf.supplier_id END) AS active_suppliers
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
      const kybDocs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ?").all(sup.id);
      const bankDetails = parseBankDetails(sup.payout_bank_details);
      const secureIdVerifications = db.prepare(`
        SELECT * FROM supplier_kyb_verifications
        WHERE supplier_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `).all(sup.id);
      
      // Separate attachments for Commercial Transport License, GSTIN, PAN
      const commercialLicense = kybDocs.find(
        (d) => d.doc_type === "COMMERCIAL_TRANSPORT_LICENSE" || d.doc_type === "COMMERCIAL_PERMIT"
      );
      const gstinDoc = kybDocs.find((d) => d.doc_type === "GSTIN");
      const panDoc = kybDocs.find((d) => d.doc_type === "PAN");

      return {
        ...sup,
        is_verified: Boolean(sup.is_verified || sup.kyb_status === "APPROVED"),
        bankDetails,
        kybDocs,
        secureIdVerifications,
        total_products: sup.total_products || 0,
        published_products: sup.published_products || 0,
        attachments: {
          commercialLicense: commercialLicense || {
            doc_type: "COMMERCIAL_TRANSPORT_LICENSE",
            doc_number: sup.phone ? `CTL-${sup.city.toUpperCase()}-${sup.phone.slice(-4)}` : "CTL-UP-9821",
            doc_url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80",
            status: sup.kyb_status
          },
          gstinDoc: gstinDoc || {
            doc_type: "GSTIN",
            doc_number: sup.gstin || "09AAACA1234A1Z5",
            doc_url: "https://example.com/docs/gstin_certificate.pdf",
            status: sup.kyb_status
          },
          panDoc: panDoc || {
            doc_type: "PAN",
            doc_number: sup.pan_number || "AAACA1234A",
            doc_url: "https://example.com/docs/pan_card.pdf",
            status: sup.kyb_status
          }
        }
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

    const auditReport = await runComprehensiveSupplierKyb(db, {
      supplierId: id,
      actorId: req.user?.id || "admin",
      actorRole: req.user?.role || "ADMIN",
    });

    const verifications = db.prepare(`
      SELECT * FROM supplier_kyb_verifications
      WHERE supplier_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id);

    res.json({
      success: true,
      report: auditReport,
      verifications,
      supplier: auditReport.updatedSupplier,
      message: "Cashfree SecureID KYB audit completed successfully.",
    });
  } catch (err) {
    logger.error("Admin KYB auto-verification failed", { requestId: req.requestId, error: err.message });
    res.status(500).json({ error: err.message || "Failed to execute Cashfree SecureID KYB check" });
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

// POST /api/admin/suppliers/:id/commission - Update platform commission percentage for supplier
router.post("/suppliers/:id/commission", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.commission), (req, res) => {
  try {
    const { id } = req.params;
    const { commissionRate } = req.body;

    const rate = Number(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 50) {
      return res.status(400).json({ error: "Commission rate must be between 0% and 50%" });
    }

    db.prepare("UPDATE suppliers SET commission_rate = ?, commission_override_rate = ? WHERE id = ?").run(rate, rate, id);
    res.json({ success: true, message: `Supplier commission updated to ${rate}%` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update commission rate" });
  }
});

// GET & POST /api/admin/categories/commission - Manage platform commission per product category
router.get("/categories/commission", optionalAuthMiddleware, requireAdminAccess, (req, res) => {
  try {
    const categories = db.prepare("SELECT * FROM category_commissions").all();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch category commissions" });
  }
});

router.post("/categories/commission", optionalAuthMiddleware, requireAdminAccess, validateBody(adminSchemas.categoryCommission), (req, res) => {
  try {
    const { categoryCode, defaultCommissionRate } = req.body;
    const rate = Number(defaultCommissionRate);
    if (!categoryCode || isNaN(rate)) {
      return res.status(400).json({ error: "categoryCode and valid defaultCommissionRate required" });
    }

    db.prepare(
      `INSERT INTO category_commissions (category_code, category_name, default_commission_rate, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(category_code) DO UPDATE SET default_commission_rate = excluded.default_commission_rate, updated_at = datetime('now')`
    ).run(categoryCode, categoryCode.replace("_", " "), rate);

    res.json({ success: true, message: `Default commission for ${categoryCode} updated to ${rate}%` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update category commission" });
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
    const pendingPayouts = db.prepare("SELECT COALESCE(SUM(net_payout), 0) AS amount FROM payouts WHERE payout_status IN ('SCHEDULED', 'BATCHED')").get().amount;

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
    if (booking.payment_status !== "PAID") return res.status(409).json({ error: "Only a paid booking can be refunded" });
    const quote = calculateRefundQuote(db, booking, { overridePercentage: req.body?.refundPercentage ?? 100 });
    const refund = createRefundRecord(db, { booking, quote, reason: req.body?.reason, actorId: req.user.id });
    let providerResult = { refundId: "rfnd_none", status: "NO_REFUND_APPLICABLE" };
    try {
      if (quote.refundAmount > 0) {
        if (booking.payment_method === "CASHFREE" || booking.cashfree_order_id) {
          const orderId = booking.cashfree_order_id || booking.ref;
          providerResult = await processCashfreeRefund({
            orderId,
            refundId: `rfnd_${booking.ref}_${Date.now()}`,
            amount: quote.refundAmount,
            reason: req.body?.reason || quote.policyTier,
          });
        } else if (booking.razorpay_payment_id) {
          providerResult = await processRazorpayRefund({
            paymentId: booking.razorpay_payment_id,
            amount: quote.refundAmount,
            reason: req.body?.reason || quote.policyTier,
          });
        } else if (booking.payment_method === "DEMO" || process.env.ENABLE_DEMO_PAYMENT === "true") {
          providerResult = { refundId: `rfnd_demo_${Date.now()}`, status: "PROCESSED" };
        } else {
          throw Object.assign(new Error("Payment reference is missing; refund requires manual provider review"), { status: 409 });
        }
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
    const { action, newSupplierId, driverName, driverPhone, vehicleNumber, refundReason } = req.body;
    // action: 'FORCE_CANCEL' | 'REFUND' | 'REASSIGN_SUPPLIER' | 'REASSIGN_DRIVER'

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(id, id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    if (action === "FORCE_CANCEL") {
      db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(booking.id);
      db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
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
      db.prepare("DELETE FROM driver_assignments WHERE booking_id = ?").run(booking.id);
      db.prepare(
        `INSERT INTO driver_assignments (id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status)
         VALUES (?, ?, ?, ?, ?, 'Commercial Cab', ?, 'ASSIGNED')`
      ).run(
        `drv_re_${Date.now()}`,
        booking.id,
        booking.supplier_id || "sup_lucknow_cabs",
        driverName || "Admin Reassigned Driver",
        driverPhone || "+919876543210",
        vehicleNumber || "UP-32-ADMIN-01"
      );
      res.json({ success: true, message: `Driver "${driverName}" manually assigned to booking ${booking.ref}.` });
    } else {
      res.status(400).json({ error: "Invalid action type" });
    }
  } catch (err) {
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
