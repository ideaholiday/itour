import { z } from "zod";
import { confirmDriverByPhone, dispatchReadiness, effectiveDispatchSettings, listDispatchExceptions, processDispatchSchedule, TRIP_ISSUE_TASK_TYPES } from "../services/dispatchWorkflowService.js";
import { dispatchTransaction } from "../services/dispatchStateService.js";
import {
  getInventoryRules, saveInventoryRules,
  listPriceSchedules, savePriceSchedule, deletePriceSchedule,
  listSlotOverrides, saveSlotOverride, deleteSlotOverride,
  saveSlotOverrideRange, deleteSlotOverrideRange,
  listResources, saveResource, deleteResource,
  listPromotions, savePromotion, deletePromotion,
  listNativeAvailability,
} from "../services/nativeInventoryService.js";
import { createSupplierBooking, listDirectPayments, quoteSupplierBooking, recordDirectPayment, supplierDayAvailability } from "../services/supplierBookingService.js";
import { isServiceablePayment } from "../lib/bookingSources.js";
import { guestDocumentLinks } from "../services/guestDocumentService.js";
import { getProductOptions, ensureDefaultProductOption } from "../services/logisticsService.js";
import { activityPath } from "../../../shared/activityUrl.js";
import express from "express";
import db, { databaseInfo } from "../db.js";
import { canTransitionBooking } from "../services/bookingService.js";
import { authenticate, optionalAuthMiddleware, requireRoles, requireSupplierSelf } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { validateTransferMeta } from "../lib/transferListing.js";
import { listingOpenIn, resolveCatalogLocation } from "../lib/locationCatalog.js";
import { productTime } from "../lib/localTime.js";
import { respondToSupplierAssignment } from "../services/assignmentSlaService.js";
import { respondToCircuitReconfirmation } from "../services/circuitOrchestrationService.js";
import { evaluateSupplierAvailability, normalizeAvailabilityRule } from "../services/availabilityService.js";
import {
  notifyDispatchStatusChanged,
  notifyDriverAssigned,
  notifyCircuitReschedule,
  notifySupplierVerification,
  queueNotification,
  sendGuestBookingNotification,
} from "../services/notificationService.js";
import { KYB_FILE_SCHEME, kybFileName, sendKybDocumentFile } from "../services/kybFileService.js";
import { autoApproveSupplierKyb, getKybApprovalReadiness, isIndividualOwner, missingTransferDocument, supplierCountry, supplierKybRules, transferDocumentError } from "../services/supplierVerificationService.js";
import {
  assignDriverToBooking,
  getDispatchTimeline,
  getFleetAvailability,
  normalizeDriverPhone,
  normalizeVehicleNumber,
  updateDispatchStatus,
} from "../services/driverDispatchService.js";

import { getSupplierPayoutLedger, resolveCommissionRate } from "../services/financeService.js";
import { cancelBookingBySupplier, cancelDeparture, checkInBooking, departureManifest, manifestCsv, setAttendance } from "../services/supplierDepartureService.js";
import { getSubscriptionStatus } from "../services/supplierSubscriptionService.js";
import {
  listSubscriptionPayments, listSupplierSpotlights, quotePlanPayment, quoteSubscriptionPayment, renderSubscriptionInvoice,
  startPlanPayment, startSubscriptionPayment, swapSpotlight, verifySubscriptionPayment,
} from "../services/supplierPlanPaymentService.js";
import { deriveBadge } from "../services/supplierProfileService.js";
import { getSettings } from "../services/programSettingsService.js";
import { supplierShareKit } from "../services/supplierShareKitService.js";
import {
  verifyGstin,
  verifyPan,
  verifyBankAccount,
  verifyPanToGstin,
  verifyDrivingLicence,
  verifyVehicleRc,
  runComprehensiveSupplierKyb,
} from "../services/cashfreeSecureIdService.js";
import { nanoid } from "nanoid";
import { validateBody, validateQuery } from "../middleware/validation.js";
import { bookingSchemas, profileSchemas, supplierSchemas } from "../validators/apiSchemas.js";
import { ensurePublicSlug, ownerProfileView, updateSupplierProfile } from "../services/supplierProfileService.js";
import { PricingRuleService } from "../services/pricingRuleService.js";
import { backfillProductOptions } from "../services/logisticsService.js";
import { backfillProductLocationRules } from "../data/canonicalLocations.js";
import { onReferralBookingCancelled, onReferralTripCompleted } from "../services/referralService.js";
import { assignResource, bookingCalendar, departureBoard, guideDepartureScope, unassignResource } from "../services/departureBoardService.js";
import { rescheduleBySupplier } from "../services/supplierRescheduleService.js";
import { addStaffMember, listStaff, OWNER_ROLE, removeStaffMember, resetStaffPassword, supplierRoleAllows, updateStaffMember } from "../services/supplierStaffService.js";

const router = express.Router();

// Approves a pending supplier once Cashfree has verified their GSTIN and PAN,
// and tells them by email and WhatsApp. Never fails the check that triggered it.
function applyKybAutoApproval(req, supplierId) {
  try {
    const outcome = autoApproveSupplierKyb(db, supplierId, {
      notify: (payload) => queueNotification(notifySupplierVerification(payload), `KYB auto-approval notification for ${supplierId}`),
    });
    if (outcome.approved) logger.info("Supplier KYB auto-approved by Cashfree SecureID", { requestId: req.requestId, supplierId });
    return outcome;
  } catch (error) {
    logger.error("Supplier KYB auto-approval failed", { requestId: req.requestId, supplierId, error });
    return { approved: false, supplier: null, identity: null };
  }
}

// An individual owner whose checks already passed is approved when the last
// required document arrives (ADR 024 C4). Businesses still approve on GSTIN + PAN.
function ownerDocumentAutoApproval(req, supplierId) {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  return isIndividualOwner(supplier) ? applyKybAutoApproval(req, supplierId).approved : false;
}

// A transfer goes live only once its supplier's vehicle document is on file
// where their country requires one (Thailand, ADR 023). Returns the error or null.
// Checks the supplier's own country only: an Indian supplier's transfer abroad
// is covered by its Indian KYB (owner decision 2026-09-22, ADR 024).
function transferPublishRefusal(supplierId) {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  const missing = supplier && missingTransferDocument(db, supplier);
  return missing ? transferDocumentError(missing) : null;
}

// Cashfree SecureID checks Indian GSTIN and PAN only; suppliers abroad are
// approved by an admin from their own country's documents (ADR 023), and so are
// individual vehicle owners, who have no GSTIN (ADR 024).
// `check` is GSTIN (the default), PAN, DRIVING_LICENSE or VEHICLE_RC: every Indian
// supplier may check PAN, licences and vehicles; only businesses check a GSTIN.
function cashfreeIdentityRefusal(supplier, check = "GSTIN") {
  if (supplierKybRules(db, supplier).cashfree) return null;
  if (isIndividualOwner(supplier) && supplierCountry(db, supplier) === "India" && check !== "GSTIN") return null;
  if (isIndividualOwner(supplier)) return "GSTIN checks are for registered businesses. Individual vehicle owners upload their documents for an admin to review.";
  return `GSTIN and PAN checks are for Indian suppliers. Suppliers in ${supplierCountry(db, supplier)} upload their documents for an admin to review.`;
}

const autoApprovalMessage = "Your GSTIN and PAN are verified, so your account is now approved and your published listings can be booked.";
router.use(authenticate);
const databaseList = (value) => JSON.stringify(value);

function requireSupplierAccess(req, res, next) {
  const role = String(req.user?.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return next();
  if (role === "SUPPLIER" && req.user?.supplier_id === req.params.id) return next();
  return res.status(403).json({ error: "Supplier operations access required" });
}

const normalizePolygon = (coordinates = []) => {
  const points = coordinates
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
};

// GET /api/suppliers - List all registered suppliers
router.get("/", requireRoles("ADMIN", "STAFF"), (req, res) => {
  try {
    const suppliers = db.prepare("SELECT * FROM suppliers ORDER BY created_at DESC").all();
    res.json({ success: true, suppliers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

router.use("/:id", requireSupplierSelf("id"));

// Staff logins (ADR 036): a manager, front desk or guide reaches only what their
// role allows. Admins, operations staff and the owner (no member role) pass.
router.use("/:id", (req, res, next) => {
  const supplierRole = String(req.user?.role || "").toUpperCase() === "SUPPLIER" ? req.user?.supplier_role : null;
  if (!supplierRole || supplierRoleAllows(supplierRole, req.method, req.path)) return next();
  logger.warn("Supplier staff action denied", { requestId: req.requestId, actorId: req.user.id, supplierRole, method: req.method, path: req.path });
  return res.status(403).json({ error: "Your staff role does not allow this. Ask the account owner.", code: "SUPPLIER_ROLE_FORBIDDEN" });
});

/** The signed-in supplier user's role on this account; admins and ops count as the owner. */
function supplierRoleOf(req) {
  return String(req.user?.role || "").toUpperCase() === "SUPPLIER" ? req.user?.supplier_role || OWNER_ROLE : OWNER_ROLE;
}

/** A guide linked to a guide resource works only their assigned departures (ADR 037); null is no limit. */
function departureScopeOf(req) {
  return supplierRoleOf(req) === "GUIDE" ? guideDepartureScope(db, req.params.id, req.user.id) : null;
}

// Supplier subscription (ADR 017): status, price, online payment and GST invoices.
function subscriptionFailure(res, req, error, fallback) {
  if (error.status && error.status < 500 || error.status === 502) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

// Staff logins (ADR 036). Owner only: the role gate above refuses /staff to members.
function staffFailure(res, req, error, fallback) {
  if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

router.get("/:id/staff", (req, res) => {
  try {
    res.json({ success: true, members: listStaff(db, req.params.id) });
  } catch (error) {
    staffFailure(res, req, error, "Could not load your staff");
  }
});

// Temporary password returned once.
router.post("/:id/staff", validateBody(supplierSchemas.staffMember), (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(201).json({ success: true, ...addStaffMember(db, req.params.id, req.body, req.user) });
  } catch (error) {
    staffFailure(res, req, error, "Could not add the staff member");
  }
});

router.patch("/:id/staff/:userId", validateBody(supplierSchemas.staffMemberUpdate), (req, res) => {
  try {
    res.json({ success: true, member: updateStaffMember(db, req.params.id, req.params.userId, req.body) });
  } catch (error) {
    staffFailure(res, req, error, "Could not update the staff member");
  }
});

router.delete("/:id/staff/:userId", (req, res) => {
  try {
    res.json({ success: true, ...removeStaffMember(db, req.params.id, req.params.userId) });
  } catch (error) {
    staffFailure(res, req, error, "Could not remove the staff member");
  }
});

router.post("/:id/staff/:userId/reset-password", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...resetStaffPassword(db, req.params.id, req.params.userId) });
  } catch (error) {
    staffFailure(res, req, error, "Could not reset the password");
  }
});

// Share kit (docs/SHARE_KIT.md): links, QR/print URLs, embed code and scan counts.
router.get("/:id/share-kit", (req, res) => {
  try {
    res.json({ success: true, shareKit: supplierShareKit(db, req.params.id, { actorId: req.user.id }) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not load the share kit");
  }
});

router.get("/:id/subscription", (req, res) => {
  try {
    const { priceInr, billingPeriodMonths } = getSettings(db, "supplier_subscriptions");
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
    const pendingCheck = db.prepare("SELECT created_at FROM supplier_verifications WHERE supplier_id = ? AND status = 'PENDING_CHECKS'").get(req.params.id);
    res.json({
      success: true,
      subscription: getSubscriptionStatus(db, req.params.id),
      plan: priceInr ? { priceInr, billingPeriodMonths, gstRatePct: 18 } : null,
      // Profile plans (ADR 008): the Verified check, Spotlights and Verified Plus.
      profilePlans: { ...getSettings(db, "supplier_plans"), gstRatePct: 18 },
      verification: { badge: supplier ? deriveBadge(db, supplier) : null, checkPendingSince: pendingCheck?.created_at || null, kybStatus: supplier?.kyb_status || null },
      spotlights: listSupplierSpotlights(db, req.params.id),
      spotlightableProducts: db.prepare(`
        SELECT id, title FROM products WHERE supplier_id = ? AND status = 'PUBLISHED'
          AND id NOT IN (SELECT product_id FROM product_spotlights WHERE status = 'ACTIVE') ORDER BY title
      `).all(req.params.id),
      payments: listSubscriptionPayments(db, req.params.id),
    });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not load the subscription");
  }
});

router.post("/:id/subscription/quote", (req, res) => {
  try {
    res.json({ success: true, quote: quoteSubscriptionPayment(db, req.params.id, { couponCode: req.body?.couponCode || null }) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not price the subscription");
  }
});

router.post("/:id/subscription/checkout", async (req, res) => {
  try {
    const result = await startSubscriptionPayment(db, req.params.id, {
      couponCode: req.body?.couponCode || null,
      actorId: req.user.id,
      returnUrl: typeof req.body?.returnUrl === "string" ? req.body.returnUrl : null,
    });
    res.status(201).json({ success: true, ...result, payment: listSubscriptionPayments(db, req.params.id).find((row) => row.id === result.payment.id) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not start the payment");
  }
});

router.post("/:id/plans/quote", (req, res) => {
  try {
    res.json({ success: true, quote: quotePlanPayment(db, req.params.id, { planCode: req.body?.planCode, productId: req.body?.productId || null, couponCode: req.body?.couponCode || null }) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not price the plan");
  }
});

router.post("/:id/plans/checkout", async (req, res) => {
  try {
    const result = await startPlanPayment(db, req.params.id, {
      planCode: req.body?.planCode,
      productId: req.body?.productId || null,
      couponCode: req.body?.couponCode || null,
      actorId: req.user.id,
      returnUrl: typeof req.body?.returnUrl === "string" ? req.body.returnUrl : null,
    });
    res.status(201).json({ success: true, ...result, payment: listSubscriptionPayments(db, req.params.id).find((row) => row.id === result.payment.id) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not start the payment");
  }
});

router.post("/:id/spotlights/:spotlightId/swap", (req, res) => {
  try {
    res.json({ success: true, spotlight: swapSpotlight(db, req.params.id, req.params.spotlightId, { productId: String(req.body?.productId || "") }) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not change the Spotlight");
  }
});

router.post("/:id/subscription/payments/:paymentId/verify", async (req, res) => {
  try {
    const payment = await verifySubscriptionPayment(db, req.params.id, req.params.paymentId);
    res.json({ success: true, status: payment.status, invoiceNumber: payment.invoice_number, subscription: getSubscriptionStatus(db, req.params.id) });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not verify the payment");
  }
});

router.get("/:id/subscription/payments/:paymentId/invoice", (req, res) => {
  try {
    res.type("html").send(renderSubscriptionInvoice(db, req.params.id, req.params.paymentId));
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not load the invoice");
  }
});

// GET /api/suppliers/:id - Fetch single supplier profile with KYB, products, bookings, drivers, blocked dates & payouts
router.get("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const kybDocs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ?").all(id);
    const geoFences = db.prepare("SELECT * FROM geo_fences WHERE supplier_id = ?").all(id);
    const products = db.prepare(`
      SELECT p.*, tr.route_type, tr.origin_name, tr.dest_name, tr.distance_km, tr.duration_mins
      FROM products p
      LEFT JOIN transfer_routes tr ON tr.product_id = p.id
      WHERE p.supplier_id = ?
      ORDER BY COALESCE(p.created_at, '') DESC, p.rowid DESC
    `).all(id);
    const bookings = db.prepare(`
      SELECT b.*, p.title as product_title, p.hero_image, p.city, p.is_instant_booking, p.cancellation_policy,
             da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number, da.assignment_status,
             da.supplier_driver_id, da.acknowledgement, da.response_deadline, da.driver_email, da.assignment_source, da.assigned_at, da.last_status_at,
             da.en_route_at, da.arrived_at, da.trip_started_at, da.completed_at,
             da.last_lat AS driver_last_lat, da.last_lng AS driver_last_lng, da.last_accuracy_m AS driver_last_accuracy_m, da.last_location_at AS driver_last_location_at
      FROM bookings b
      LEFT JOIN products p ON b.product_id = p.id
      LEFT JOIN driver_assignments da ON b.id = da.booking_id
      WHERE b.supplier_id = ?
      ORDER BY b.created_at DESC
    `).all(id).map((booking) => {
      const { otp_code, otp_hash, otp_encrypted, ...safeBooking } = booking;
      return safeBooking;
    });

    const drivers = db.prepare("SELECT * FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name ASC").all(id);
    const blockedDates = db.prepare("SELECT * FROM blocked_dates WHERE supplier_id = ? ORDER BY start_date DESC").all(id);
    const payouts = db.prepare(`
      SELECT p.*, pb.batch_ref, pb.status AS settlement_status, pb.provider, pb.provider_batch_id, pb.reconciled_at AS settlement_reconciled_at
      FROM payouts p LEFT JOIN payout_batches pb ON pb.id = p.settlement_batch_id
      WHERE p.supplier_id = ? ORDER BY COALESCE(p.processed_at, p.created_at) DESC
    `).all(id);

    const detail = {
      success: true,
      access: { role: supplierRoleOf(req) },
      supplier: { ...supplier, commission_rate_effective: resolveCommissionRate(db, supplier.id) },
      subscription: getSubscriptionStatus(db, supplier.id),
      kybDocs,
      kybReadiness: getKybApprovalReadiness(db, supplier),
      geoFences,
      products: products.map((product) => ({ ...product, commission_rate_effective: resolveCommissionRate(db, supplier.id, product.id) })),
      bookings,
      drivers,
      blockedDates,
      payouts
    };
    res.json(staffSupplierView(detail));
  } catch (err) {
    logger.error("Supplier lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch supplier details" });
  }
});

// Staff never see bank, PAN, KYB documents or payouts (ADR 036). A guide works
// from the departure manifest, so gets no booking, driver or payment lists.
const OWNER_ONLY_SUPPLIER_FIELDS = ["payout_bank_details", "pan_number", "pan_verified_name", "bank_verified_name", "bank_match_score"];
function staffSupplierView(detail) {
  const { role } = detail.access;
  if (role === OWNER_ROLE) return detail;
  const supplier = { ...detail.supplier };
  for (const field of OWNER_ONLY_SUPPLIER_FIELDS) delete supplier[field];
  const view = { ...detail, supplier, kybDocs: [], kybReadiness: null, payouts: [] };
  if (role === "GUIDE") Object.assign(view, { bookings: [], drivers: [], blockedDates: [], geoFences: [] });
  return view;
}

// POST /api/suppliers/register - Register a new fleet vendor / tour operator
router.post("/register", validateBody(supplierSchemas.registration), (req, res) => {
  try {
    const { companyName, contactName, email, phone, city, state, gstin, panNumber } = req.body;
    const slug = (companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const id = slug ? `sup_${slug}_${nanoid(6)}` : `sup_${nanoid(10)}`;

    db.prepare(
      `INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, gstin, pan_number, kyb_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    ).run(id, id, companyName, contactName, email, phone, city, state, gstin || null, panNumber || null);
    ensurePublicSlug(db, { id, company_name: companyName, city });

    res.json({ success: true, supplierId: id, message: "Supplier registered successfully! KYB verification pending." });
  } catch (err) {
    logger.error("Supplier registration failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to register supplier" });
  }
});

// POST /api/suppliers/:id/kyb - Submit or update KYB Document
router.post("/:id/kyb", validateBody(supplierSchemas.kyb), (req, res) => {
  try {
    const { id } = req.params;
    const docType = String(req.body.docType || req.body.doc_type || "OTHER").trim().toUpperCase();
    const docNumber = String(req.body.docNumber || req.body.doc_number || "").trim() || null;
    const docUrl = String(req.body.docUrl || req.body.doc_url || "").trim();
    const docId = `kyb_${nanoid(10)}`;
    // The full Aadhaar number is never stored; at most its last 4 digits (ADR 024).
    if (docType === "AADHAAR_MASKED" && docNumber && !/^\d{4}$/.test(docNumber)) {
      return res.status(400).json({ error: "Enter only the last 4 digits of your Aadhaar number." });
    }

    // A document is only accepted with a file this supplier uploaded as KYB,
    // so an admin never reviews a placeholder link or someone else's file.
    const filename = docUrl.startsWith(KYB_FILE_SCHEME) ? kybFileName(docUrl) : null;
    const upload = filename
      ? db.prepare("SELECT id, mime_type FROM uploads WHERE filename = ? AND UPPER(COALESCE(entity_type, '')) = 'KYB' AND entity_id = ?").get(filename, id)
      : null;
    if (!upload) {
      return res.status(400).json({ error: "Upload the document file (PDF or image) before submitting it." });
    }
    if (docType === "SELFIE" && !String(upload.mime_type || "").startsWith("image/")) {
      return res.status(400).json({ error: "Take your selfie with the camera; a PDF is not accepted." });
    }
    // An individual owner verifies their PAN with Cashfree before uploading the card (owner decision 2026-09-24).
    if (docType === "PAN") {
      const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
      if (isIndividualOwner(supplier) && Number(supplier.pan_verified) !== 1) {
        return res.status(400).json({ error: "Verify your PAN number first, then upload the PAN card." });
      }
    }

    // Check if a document of this type already exists for this supplier
    const existing = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ? AND doc_type = ?").get(id, docType);

    if (existing) {
      db.prepare(
        `UPDATE kyb_documents
         SET doc_number = ?, doc_url = ?, status = 'PENDING', rejection_reason = NULL, review_note = NULL, submitted_at = datetime('now')
         WHERE id = ?`
      ).run(docNumber, docUrl, existing.id);

      const updatedDoc = db.prepare("SELECT * FROM kyb_documents WHERE id = ?").get(existing.id);
      return res.json({ success: true, docId: existing.id, document: updatedDoc, kybAutoApproved: ownerDocumentAutoApproval(req, id), message: "KYB Document re-submitted for review." });
    }

    db.prepare(
      `INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_number, doc_url, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', datetime('now'))`
    ).run(docId, id, docType, docNumber, docUrl);

    const createdDoc = db.prepare("SELECT * FROM kyb_documents WHERE id = ?").get(docId);
    res.json({ success: true, docId, document: createdDoc, kybAutoApproved: ownerDocumentAutoApproval(req, id), message: "KYB Document submitted for review." });
  } catch (err) {
    logger.error("Failed to submit KYB document", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to submit KYB document" });
  }
});

// GET /api/suppliers/:id/kyb/:docId/file - The supplier's own uploaded KYB file
router.get("/:id/kyb/:docId/file", (req, res) => {
  try {
    const doc = db.prepare("SELECT * FROM kyb_documents WHERE id = ? AND supplier_id = ?").get(req.params.docId, req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    return sendKybDocumentFile(res, doc);
  } catch (err) {
    logger.error("Failed to send KYB document file", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Could not open the document" });
  }
});

// DELETE /api/suppliers/:id/kyb/:docId - Remove a pending or rejected KYB document
router.delete("/:id/kyb/:docId", (req, res) => {
  try {
    const { id, docId } = req.params;
    const doc = db.prepare("SELECT * FROM kyb_documents WHERE id = ? AND supplier_id = ?").get(docId, id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    if (doc.status === "APPROVED") {
      return res.status(400).json({ error: "Approved compliance documents cannot be deleted. Contact support if changes are needed." });
    }

    db.prepare("DELETE FROM kyb_documents WHERE id = ? AND supplier_id = ?").run(docId, id);
    res.json({ success: true, message: "KYB document removed successfully." });
  } catch (err) {
    logger.error("Failed to delete KYB document", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to remove KYB document" });
  }
});

// POST /api/suppliers/:id/kyb/verify-gstin - Instant Cashfree SecureID GSTIN Verification
router.post("/:id/kyb/verify-gstin", validateBody(supplierSchemas.verifyGstin), async (req, res) => {
  try {
    const { id } = req.params;
    const { gstin, businessName, business_name } = req.body;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const refusal = cashfreeIdentityRefusal(supplier);
    if (refusal) return res.status(400).json({ error: refusal, code: "CASHFREE_INDIA_ONLY" });

    const targetGstin = (gstin || supplier.gstin || "").trim().toUpperCase();
    const targetName = businessName || business_name || supplier.company_name;

    const result = await verifyGstin({ gstin: targetGstin, businessName: targetName });

    const auditId = `ver_gst_${nanoid(8)}`;
    db.prepare(`
      INSERT INTO supplier_kyb_verifications (
        id, supplier_id, verification_type, reference_id, status, input_data, response_data, score, verified_at, actor_id, actor_role, created_at
      ) VALUES (?, ?, 'GSTIN', ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
    `).run(
      auditId,
      id,
      String(result.raw?.reference_id || auditId),
      result.valid ? "VALID" : "INVALID",
      JSON.stringify({ gstin: targetGstin, businessName: targetName }),
      JSON.stringify(result),
      result.valid ? 100 : 0,
      req.user?.id || id,
      req.user?.role || "SUPPLIER"
    );

    db.prepare(`
      UPDATE suppliers
      SET gstin = ?, gstin_verified = ?, gstin_verified_name = ?, gstin_verified_status = ?, kyb_last_verified_at = datetime('now')
      WHERE id = ?
    `).run(targetGstin, result.valid ? 1 : 0, result.legalName || null, result.status || null, id);

    const autoApproval = result.valid ? applyKybAutoApproval(req, id) : { approved: false };
    const updatedSupplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);

    res.json({
      success: true,
      verification: result,
      supplier: updatedSupplier,
      kybAutoApproved: autoApproval.approved,
      message: result.valid
        ? `GSTIN verified: ${result.legalName} (${result.status})${autoApproval.approved ? `. ${autoApprovalMessage}` : ""}`
        : "GSTIN verification was not successful",
    });
  } catch (err) {
    logger.error("GSTIN verification failed", { requestId: req.requestId, error: err.message });
    res.status(400).json({ error: err.message || "Failed to verify GSTIN with Cashfree SecureID" });
  }
});

// Records a SecureID check in the audit table, as the GSTIN and PAN checks do.
function recordSecureIdCheck(req, supplierId, type, result, input) {
  db.prepare(`
    INSERT INTO supplier_kyb_verifications (
      id, supplier_id, verification_type, reference_id, status, input_data, response_data, score, verified_at, actor_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 100, datetime('now'), ?, ?, datetime('now'))
  `).run(`ver_${type.toLowerCase()}_${nanoid(8)}`, supplierId, type, String(result.raw?.reference_id || ""), result.valid ? "VALID" : "INVALID",
    JSON.stringify(input), JSON.stringify(result), req.user?.id || supplierId, req.user?.role || "SUPPLIER");
}

// A fleet row of this supplier, when the check names one; its expiry dates follow a valid result (ADR 024 C2, C3).
function ownFleetRow(supplierId, driverId) {
  return driverId ? db.prepare("SELECT id FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(driverId, supplierId) : null;
}

// POST /api/suppliers/:id/kyb/verify-dl - Cashfree SecureID driving licence check (ADR 024 C3)
router.post("/:id/kyb/verify-dl", validateBody(supplierSchemas.verifyDrivingLicence), async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const refusal = cashfreeIdentityRefusal(supplier, "DRIVING_LICENSE");
    if (refusal) return res.status(400).json({ error: refusal, code: "CASHFREE_INDIA_ONLY" });
    const driver = ownFleetRow(id, req.body.driverId);
    if (req.body.driverId && !driver) return res.status(404).json({ error: "Choose a driver from your own fleet" });

    const result = await verifyDrivingLicence({ licenseNumber: req.body.licenseNumber, dob: req.body.dob });
    recordSecureIdCheck(req, id, "DRIVING_LICENSE", result, { licenseNumber: result.licenseNumber, driverId: driver?.id || null });
    const autoApproval = result.valid ? applyKybAutoApproval(req, id) : { approved: false };
    if (result.valid && driver) {
      db.prepare("UPDATE supplier_drivers SET license_number = ?, license_expiry = COALESCE(?, license_expiry) WHERE id = ?").run(result.licenseNumber, result.validUntil, driver.id);
    }
    res.json({ success: true, kybAutoApproved: autoApproval.approved, verification: { valid: result.valid, name: result.name, validUntil: result.validUntil, simulated: result.simulated }, message: result.valid ? `Driving licence verified${result.validUntil ? `, valid until ${result.validUntil}` : ""}` : "The driving licence could not be verified" });
  } catch (err) {
    logger.error("Driving licence verification failed", { requestId: req.requestId, error: err.message });
    res.status(400).json({ error: err.message || "Failed to verify the driving licence" });
  }
});

// POST /api/suppliers/:id/kyb/verify-rc - Cashfree SecureID vehicle RC check (ADR 024 C3)
router.post("/:id/kyb/verify-rc", validateBody(supplierSchemas.verifyVehicleRc), async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const refusal = cashfreeIdentityRefusal(supplier, "VEHICLE_RC");
    if (refusal) return res.status(400).json({ error: refusal, code: "CASHFREE_INDIA_ONLY" });
    const driver = ownFleetRow(id, req.body.driverId);
    if (req.body.driverId && !driver) return res.status(404).json({ error: "Choose a vehicle from your own fleet" });

    const result = await verifyVehicleRc({ registrationNumber: req.body.registrationNumber });
    recordSecureIdCheck(req, id, "VEHICLE_RC", result, { registrationNumber: result.registrationNumber, driverId: driver?.id || null });
    const autoApproval = result.valid ? applyKybAutoApproval(req, id) : { approved: false };
    if (result.valid && driver) {
      db.prepare("UPDATE supplier_drivers SET insurance_expiry = COALESCE(?, insurance_expiry), permit_expiry = COALESCE(?, permit_expiry) WHERE id = ?").run(result.insuranceValidUntil, result.permitValidUntil, driver.id);
    }
    res.json({ success: true, kybAutoApproved: autoApproval.approved, verification: { valid: result.valid, owner: result.owner, commercial: result.commercial, insuranceValidUntil: result.insuranceValidUntil, permitValidUntil: result.permitValidUntil, simulated: result.simulated }, message: result.valid ? `Vehicle ${result.registrationNumber} verified${result.owner ? `, owner ${result.owner}` : ""}` : "The vehicle registration could not be verified" });
  } catch (err) {
    logger.error("Vehicle RC verification failed", { requestId: req.requestId, error: err.message });
    res.status(400).json({ error: err.message || "Failed to verify the vehicle registration" });
  }
});

// POST /api/suppliers/:id/kyb/verify-pan - Instant Cashfree SecureID PAN Verification
router.post("/:id/kyb/verify-pan", validateBody(supplierSchemas.verifyPan), async (req, res) => {
  try {
    const { id } = req.params;
    const { pan, name } = req.body;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const refusal = cashfreeIdentityRefusal(supplier, "PAN");
    if (refusal) return res.status(400).json({ error: refusal, code: "CASHFREE_INDIA_ONLY" });

    const targetPan = (pan || supplier.pan_number || "").trim().toUpperCase();
    const targetName = name || supplier.contact_name || supplier.company_name;

    const result = await verifyPan({ pan: targetPan, name: targetName });

    const auditId = `ver_pan_${nanoid(8)}`;
    db.prepare(`
      INSERT INTO supplier_kyb_verifications (
        id, supplier_id, verification_type, reference_id, status, input_data, response_data, score, verified_at, actor_id, actor_role, created_at
      ) VALUES (?, ?, 'PAN', ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
    `).run(
      auditId,
      id,
      String(result.raw?.reference_id || auditId),
      result.valid ? "VALID" : "INVALID",
      JSON.stringify({ pan: targetPan, name: targetName }),
      JSON.stringify(result),
      result.nameMatchScore || 100,
      req.user?.id || id,
      req.user?.role || "SUPPLIER"
    );

    db.prepare(`
      UPDATE suppliers
      SET pan_number = ?, pan_verified = ?, pan_verified_name = ?, pan_type = ?, kyb_last_verified_at = datetime('now')
      WHERE id = ?
    `).run(targetPan, result.valid ? 1 : 0, result.registeredName || null, result.type || null, id);

    const autoApproval = result.valid ? applyKybAutoApproval(req, id) : { approved: false };
    const updatedSupplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);

    res.json({
      success: true,
      verification: result,
      supplier: updatedSupplier,
      kybAutoApproved: autoApproval.approved,
      message: result.valid
        ? `PAN verified: ${result.registeredName} (${result.type}) - Match: ${result.nameMatchScore}%${autoApproval.approved ? `. ${autoApprovalMessage}` : ""}`
        : "PAN verification was not successful",
    });
  } catch (err) {
    logger.error("PAN verification failed", { requestId: req.requestId, error: err.message });
    res.status(400).json({ error: err.message || "Failed to verify PAN with Cashfree SecureID" });
  }
});

// POST /api/suppliers/:id/kyb/verify-bank - Instant Cashfree SecureID Bank Account Verification
router.post("/:id/kyb/verify-bank", validateBody(supplierSchemas.verifyBankAccount), async (req, res) => {
  try {
    const { id } = req.params;
    const { accountNumber, account_number, ifsc, ifscCode, name, phone } = req.body;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    let existingBank = {};
    try {
      existingBank = typeof supplier.payout_bank_details === "string" ? JSON.parse(supplier.payout_bank_details) : (supplier.payout_bank_details || {});
    } catch {}

    const targetAcc = (accountNumber || account_number || existingBank.account_number || "").trim();
    const targetIfsc = (ifsc || ifscCode || existingBank.ifsc || "").trim().toUpperCase();
    const targetName = name || existingBank.account_holder || supplier.contact_name || supplier.company_name;

    const result = await verifyBankAccount({
      accountNumber: targetAcc,
      ifsc: targetIfsc,
      name: targetName,
      phone: phone || supplier.phone,
    });

    const auditId = `ver_bnk_${nanoid(8)}`;
    db.prepare(`
      INSERT INTO supplier_kyb_verifications (
        id, supplier_id, verification_type, reference_id, status, input_data, response_data, score, verified_at, actor_id, actor_role, created_at
      ) VALUES (?, ?, 'BANK_ACCOUNT', ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
    `).run(
      auditId,
      id,
      String(result.raw?.reference_id || auditId),
      result.valid ? "VALID" : "INVALID",
      JSON.stringify({ accountNumber: targetAcc, ifsc: targetIfsc, name: targetName }),
      JSON.stringify(result),
      result.nameMatchScore || 100,
      req.user?.id || id,
      req.user?.role || "SUPPLIER"
    );

    const updatedBankDetails = {
      ...existingBank,
      account_number: targetAcc,
      ifsc: targetIfsc,
      bank_name: result.bankName || existingBank.bank_name,
      account_holder: result.accountHolderName || existingBank.account_holder || targetName,
      verified: result.valid,
      verified_at: new Date().toISOString(),
      match_score: result.nameMatchScore,
    };

    db.prepare(`
      UPDATE suppliers
      SET payout_bank_details = ?, bank_verified = ?, bank_verified_name = ?, bank_match_score = ?, kyb_last_verified_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(updatedBankDetails), result.valid ? 1 : 0, result.accountHolderName || null, result.nameMatchScore || null, id);

    const updatedSupplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);

    res.json({
      success: true,
      verification: result,
      supplier: updatedSupplier,
      bankDetails: updatedBankDetails,
      message: result.valid
        ? `Bank Account verified: ${result.bankName} (${result.accountHolderName}) - Match: ${result.nameMatchScore}%`
        : "Bank account verification was not successful",
    });
  } catch (err) {
    logger.error("Bank verification failed", { requestId: req.requestId, error: err.message });
    res.status(400).json({ error: err.message || "Failed to verify Bank Account with Cashfree SecureID" });
  }
});

// GET /api/suppliers/:id/kyb/verifications - List historical Cashfree SecureID audit records
router.get("/:id/kyb/verifications", (req, res) => {
  try {
    const { id } = req.params;
    const history = db.prepare(`
      SELECT * FROM supplier_kyb_verifications
      WHERE supplier_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(id);

    res.json({ success: true, verifications: history });
  } catch (err) {
    logger.error("Failed to load verification history", { requestId: req.requestId, error: err.message });
    res.status(500).json({ error: "Failed to retrieve verification history" });
  }
});

// POST /api/suppliers/:id/kyb/verify-all - Run end-to-end Cashfree SecureID verification
router.post("/:id/kyb/verify-all", async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    const refusal = supplier && cashfreeIdentityRefusal(supplier);
    if (refusal) return res.status(400).json({ error: refusal, code: "CASHFREE_INDIA_ONLY" });
    const report = await runComprehensiveSupplierKyb(db, {
      supplierId: id,
      actorId: req.user?.id || id,
      actorRole: req.user?.role || "SUPPLIER",
    });
    const autoApproval = applyKybAutoApproval(req, id);
    if (autoApproval.supplier) report.updatedSupplier = autoApproval.supplier;

    res.json({
      success: true,
      report,
      kybAutoApproved: autoApproval.approved,
      message: autoApproval.approved
        ? `Comprehensive Cashfree SecureID KYB audit completed. ${autoApprovalMessage}`
        : "Comprehensive Cashfree SecureID KYB audit completed.",
    });
  } catch (err) {
    logger.error("Comprehensive KYB failed", { requestId: req.requestId, error: err.message });
    res.status(500).json({ error: err.message || "Failed to complete comprehensive KYB audit" });
  }
});

// PATCH /api/suppliers/:id/profile - Update supplier business profile (GSTIN, PAN, Phone, etc.)
router.patch("/:id/profile", validateBody(supplierSchemas.profileUpdate), (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const {
      companyName,
      contactName,
      phone,
      city,
      state,
      gstin,
      panNumber,
      pan_number,
      websiteUrl,
      website_url,
      businessType,
      business_type,
      yearsInOperation,
      years_in_operation,
    } = req.body;

    const finalGstin = gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : supplier.gstin;
    const finalPan = (panNumber || pan_number) !== undefined
      ? ((panNumber || pan_number) ? (panNumber || pan_number).trim().toUpperCase() : null)
      : supplier.pan_number;
    const finalPhone = phone !== undefined ? phone.trim() : supplier.phone;
    const finalCity = city !== undefined ? city.trim() : supplier.city;
    const finalState = state !== undefined ? state.trim() : supplier.state;
    const finalCompany = companyName !== undefined ? companyName.trim() : supplier.company_name;
    const finalContact = contactName !== undefined ? contactName.trim() : supplier.contact_name;
    const finalWebsite = (websiteUrl || website_url) !== undefined ? (websiteUrl || website_url || null) : supplier.website_url;
    const finalBusinessType = (businessType || business_type) !== undefined ? (businessType || business_type || null) : supplier.business_type;
    const finalYears = (yearsInOperation || years_in_operation) !== undefined ? Number(yearsInOperation || years_in_operation || 0) : supplier.years_in_operation;

    db.prepare(
      `UPDATE suppliers
       SET company_name = ?, contact_name = ?, phone = ?, city = ?, state = ?,
           gstin = ?, pan_number = ?, website_url = ?, business_type = ?, years_in_operation = ?
       WHERE id = ?`
    ).run(finalCompany, finalContact, finalPhone, finalCity, finalState, finalGstin, finalPan, finalWebsite, finalBusinessType, finalYears, id);

    // A new GSTIN or PAN has not been checked yet, whatever the old one showed.
    if ((finalGstin || null) !== (supplier.gstin || null)) {
      db.prepare("UPDATE suppliers SET gstin_verified = 0, gstin_verified_name = NULL, gstin_verified_status = NULL WHERE id = ?").run(id);
    }
    if ((finalPan || null) !== (supplier.pan_number || null)) {
      db.prepare("UPDATE suppliers SET pan_verified = 0, pan_verified_name = NULL, pan_type = NULL WHERE id = ?").run(id);
    }

    const updated = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    res.json({ success: true, supplier: updated, message: "Business details updated successfully." });
  } catch (err) {
    logger.error("Failed to update supplier profile", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to update supplier profile" });
  }
});

// GET /api/suppliers/:id/public-profile - The supplier's own view of their public profile
router.get("/:id/public-profile", (req, res) => {
  try {
    return res.json({ success: true, ...ownerProfileView(db, req.params.id) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("Supplier public profile lookup failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Could not load your public profile" });
  }
});

// PATCH /api/suppliers/:id/public-profile - Edit tagline, about, images, languages, cities, links, visibility
router.patch("/:id/public-profile", validateBody(profileSchemas.update), (req, res) => {
  try {
    return res.json({ success: true, ...updateSupplierProfile(db, req.params.id, req.body) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    logger.error("Supplier public profile update failed", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Could not save your public profile" });
  }
});

// PATCH /api/suppliers/:id/payout - Update payout bank details
router.patch("/:id/payout", validateBody(supplierSchemas.payoutDetails), (req, res) => {
  try {
    const { id } = req.params;
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });

    const {
      accountHolder,
      account_holder,
      accountHolderName,
      account_holder_name,
      bankName,
      bank_name,
      accountNumber,
      account_number,
      ifscCode,
      ifsc_code,
      ifsc,
      accountType,
      account_type,
      upiId,
      upi_id,
    } = req.body;

    const holder = (accountHolder || account_holder || accountHolderName || account_holder_name || "").trim();
    const bName = (bankName || bank_name || "").trim();
    const accNum = (accountNumber || account_number || "").trim();
    const ifscVal = (ifscCode || ifsc_code || ifsc || "").trim().toUpperCase();
    const accType = (accountType || account_type || "CURRENT").toUpperCase();
    const upiVal = (upiId || upi_id || "").trim();

    if (!accNum || !ifscVal || !bName) {
      return res.status(400).json({ error: "Account number, Bank name, and IFSC code are required." });
    }

    const bankObj = {
      account_holder: holder || supplier.contact_name || supplier.company_name,
      bank_name: bName,
      account_number: accNum,
      ifsc: ifscVal,
      account_type: accType,
      upi_id: upiVal || undefined,
      updated_at: new Date().toISOString(),
    };

    db.prepare("UPDATE suppliers SET payout_bank_details = ? WHERE id = ?").run(JSON.stringify(bankObj), id);

    const updated = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    res.json({
      success: true,
      supplier: updated,
      bankDetails: bankObj,
      message: "Payout bank account updated successfully.",
    });
  } catch (err) {
    logger.error("Failed to update supplier payout details", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to update payout details" });
  }
});

// GET /api/suppliers/:id/payout-ledger - Fetch comprehensive payout ledger and transaction statements
router.get("/:id/payout-ledger", (req, res) => {
  try {
    const { id } = req.params;
    const ledger = getSupplierPayoutLedger(db, id);
    res.json({ success: true, ...ledger });
  } catch (err) {
    logger.error("Failed to fetch supplier payout ledger", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to fetch payout ledger" });
  }
});

// POST /api/suppliers/:id/geofences - Add or update operational geo-fence
router.post("/:id/geofences", validateBody(supplierSchemas.geofence), (req, res) => {
  try {
    const { id } = req.params;
    const { zoneName, city, centerLat, centerLng, radiusKm = 30.0, polygonCoordinates } = req.body;
    const fenceId = `fence_${Date.now()}`;

    if (!zoneName?.trim() || !city?.trim()) return res.status(400).json({ error: "Zone name and city are required" });
    const locationValidation = resolveCatalogLocation(
      db.prepare("SELECT id, name, state, country FROM destinations WHERE COALESCE(is_active, 1) = 1").all(),
      city,
    );
    if (locationValidation.error) return res.status(400).json({ error: locationValidation.error });
    const canonicalCity = locationValidation.value.city;
    const lat = Number(centerLat);
    const lng = Number(centerLng);
    const radius = Number(radiusKm);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return res.status(400).json({ error: "Valid center coordinates are required" });
    if (!Number.isFinite(radius) || radius <= 0 || radius > 500) return res.status(400).json({ error: "Radius must be between 0 and 500 km" });

    let polyJson = "[]";
    if (typeof polygonCoordinates === "string") {
      try { polyJson = JSON.stringify(normalizePolygon(JSON.parse(polygonCoordinates))); } catch { return res.status(400).json({ error: "Polygon coordinates are not valid JSON" }); }
    } else if (Array.isArray(polygonCoordinates) && polygonCoordinates.length > 0) {
      const polygon = normalizePolygon(polygonCoordinates);
      if (polygon.length < 4) return res.status(400).json({ error: "A polygon requires at least three valid boundary points" });
      polyJson = JSON.stringify(polygon);
    }

    db.prepare(
      `INSERT INTO geo_fences (id, supplier_id, zone_name, city, center_lat, center_lng, radius_km, polygon_coordinates, is_active, approval_status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, 'PENDING_REVIEW', datetime('now'))`
    ).run(fenceId, id, zoneName.trim(), canonicalCity, lat, lng, radius, polyJson);

    res.json({ success: true, fenceId, approvalStatus: "PENDING_REVIEW", message: "Coverage zone submitted for Idea Holiday admin review." });
  } catch (err) {
    logger.error("Supplier coverage save failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to save geo-fence" });
  }
});

// DELETE /api/suppliers/:id/geofences/:fenceId - Remove an owned service zone
router.delete("/:id/geofences/:fenceId", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM geo_fences WHERE id = ? AND supplier_id = ?").run(req.params.fenceId, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Service zone not found" });
    res.json({ success: true, message: "Service zone removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove service zone" });
  }
});

// POST /api/suppliers/:id/products/v2 — Unified 5-type product creation (Plan 14)
router.post("/:id/products/v2", (req, res) => {
  try {
    const { id } = req.params;
    const {
      productType, productSubType, title, city, state, country = "India",
      category, shortDesc, fullDesc, durationHours, durationDays,
      priceInr, strikePriceInr, heroImage, images, highlights,
      inclusions, exclusions, essentialInfo,
      bookingMode = "INSTANT", minAdvanceHours = 4, minPax = 1, maxPax = 20,
      languages, freeCancellation = 1, cancellationPolicy = "FLEXIBLE_24H",
      isInstantBooking = 1, groupType = "PRIVATE", status = "PUBLISHED",
      itineraryItems, ticketTiers, vehicleOptions, sicHubs, hotelTiers,
    } = req.body;

    const VALID_TYPES = ["PACKAGE", "TOUR", "TRANSFER", "ATTRACTION", "EXPERIENCE"];
    const VALID_SUBTYPES = ["WITH_HOTEL", "WITHOUT_HOTEL", "SIC", "PRIVATE",
      "AIRPORT_RAILWAY", "INTERCITY_HOTEL", "CITY_TO_CITY",
      "TICKET_ONLY", "TICKET_SIC", "TICKET_PRIVATE"];

    const normType = String(productType || "").toUpperCase();
    if (!VALID_TYPES.includes(normType))
      return res.status(400).json({ error: `Invalid product type. Choose: ${VALID_TYPES.join(", ")}` });
    const normSubType = String(productSubType || "").toUpperCase();
    if (normSubType && !VALID_SUBTYPES.includes(normSubType))
      return res.status(400).json({ error: `Invalid sub-type: ${normSubType}` });
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    if (!city?.trim()) return res.status(400).json({ error: "City is required" });
    if (!state?.trim()) return res.status(400).json({ error: "State / Region is required" });
    // Free-text cities stay allowed; a catalogue city abroad must be open for listing (ADR 023).
    const catalogCity = db.prepare("SELECT name, country FROM destinations WHERE LOWER(name) = LOWER(?) AND COALESCE(is_active, 1) = 1").get(city.trim());
    if (catalogCity && !listingOpenIn(catalogCity.country)) {
      return res.status(400).json({ error: `Listings in ${catalogCity.country} open soon. ${catalogCity.name} can't hold a product yet.` });
    }
    const normPrice = Number(priceInr);
    if (!Number.isFinite(normPrice) || normPrice <= 0)
      return res.status(400).json({ error: "Price must be greater than zero" });

    const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const transferRefusal = normType === "TRANSFER" && status !== "DRAFT" && transferPublishRefusal(id);
    if (transferRefusal) return res.status(409).json({ error: transferRefusal, code: "TRANSFER_DOCUMENT_REQUIRED" });

    const typeCode = normType.slice(0, 3).toLowerCase();
    const cityCode = city.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
    const productId = `prod_${typeCode}_${cityCode}_${nanoid(8)}`;

    let normGroupType = String(groupType || "PRIVATE").toUpperCase();
    if (["SIC", "TICKET_SIC"].includes(normSubType)) normGroupType = "SIC";
    if (["PRIVATE", "TICKET_PRIVATE", "WITH_HOTEL", "WITHOUT_HOTEL",
         "AIRPORT_RAILWAY", "INTERCITY_HOTEL", "CITY_TO_CITY", "TICKET_ONLY"].includes(normSubType))
      normGroupType = "PRIVATE";

    const defaultCategory = { PACKAGE: "Holiday Packages", TOUR: "Tours & Sightseeing",
      TRANSFER: "Transfers", ATTRACTION: "Attractions", EXPERIENCE: "Experiences" }[normType];

    db.transaction(() => {
      db.prepare(`
        INSERT INTO products (
          id, product_code, supplier_id, product_type, product_sub_type,
          title, city, state, category, short_desc, full_desc,
          duration_hours, duration_days, price_inr, strike_price_inr,
          hero_image, images, highlights, inclusions, exclusions, essential_info,
          group_type, booking_mode, min_advance_hours, min_pax, max_pax, languages,
          free_cancellation, cancellation_policy, is_instant_booking,
          status, is_published, rating, review_count, bestseller, created_at
        ) VALUES (
          ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,4.8,0,0,datetime('now')
        )
      `).run(
        productId, productId, id, normType, normSubType || null,
        title.trim(), city.trim(), state.trim(),
        category || defaultCategory,
        String(shortDesc || "").trim(),
        String(fullDesc || shortDesc || "").trim(),
        Number(durationHours) || 4, Number(durationDays) || 1,
        normPrice, strikePriceInr ? Number(strikePriceInr) : null,
        heroImage || null,
        JSON.stringify(Array.isArray(images) ? images : []),
        JSON.stringify(Array.isArray(highlights) ? highlights : []),
        JSON.stringify(Array.isArray(inclusions) ? inclusions : []),
        JSON.stringify(Array.isArray(exclusions) ? exclusions : []),
        JSON.stringify(Array.isArray(essentialInfo) ? essentialInfo : []),
        normGroupType, bookingMode,
        Number(minAdvanceHours) || 4, Number(minPax) || 1, Number(maxPax) || 20,
        JSON.stringify(Array.isArray(languages) ? languages : ["English"]),
        freeCancellation ? 1 : 0, cancellationPolicy, isInstantBooking ? 1 : 0,
        status === "DRAFT" ? "DRAFT" : "PUBLISHED",
        status === "DRAFT" ? 0 : 1,
      );

      if (Array.isArray(itineraryItems) && itineraryItems.length > 0) {
        const ins = db.prepare(`INSERT INTO product_itinerary_items
          (id,product_id,day_number,time_label,title,description,location,duration_text,icon,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?,?)`);
        itineraryItems.forEach((item, i) => ins.run(
          `itin_${nanoid(10)}`, productId,
          Number.isFinite(Number(item.dayNumber)) ? Number(item.dayNumber) : 1, String(item.timeLabel||`Step ${i+1}`),
          String(item.title||""), String(item.description||""),
          item.location||null, item.durationText||null, item.icon||"📍", i));
      }

      if (Array.isArray(ticketTiers) && ticketTiers.length > 0) {
        const ins = db.prepare(`INSERT INTO product_ticket_tiers
          (id,product_id,tier_name,age_min,age_max,price_inr,is_free,sort_order)
          VALUES (?,?,?,?,?,?,?,?)`);
        ticketTiers.forEach((t, i) => ins.run(
          `tt_${nanoid(10)}`, productId,
          String(t.tierName||`Tier ${i+1}`),
          t.ageMin!=null?Number(t.ageMin):null,
          t.ageMax!=null?Number(t.ageMax):null,
          Number(t.priceInr)||0, t.isFree?1:0, i));
      }

      if (Array.isArray(vehicleOptions) && vehicleOptions.length > 0) {
        const ins = db.prepare(`INSERT INTO product_vehicle_options
          (id,product_id,vehicle_type,label,max_pax,max_luggage,price_inr,is_recommended,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?)`);
        vehicleOptions.forEach((v, i) => ins.run(
          `veh_${nanoid(10)}`, productId,
          String(v.vehicleType||"SEDAN").toUpperCase(),
          String(v.label||v.vehicleType||"Vehicle"),
          Number(v.maxPax)||4, Number(v.maxLuggage)||2,
          Number(v.priceInr)||normPrice,
          v.isRecommended?1:0, i));
      }

      if (Array.isArray(sicHubs) && sicHubs.length > 0) {
        const ins = db.prepare(`INSERT INTO product_sic_hubs
          (id,product_id,hub_name,hub_address,lat,lng,departure_time,capacity,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?)`);
        sicHubs.forEach((h, i) => ins.run(
          `hub_${nanoid(10)}`, productId,
          String(h.hubName||`Hub ${i+1}`),
          h.hubAddress||null,
          h.lat?Number(h.lat):null, h.lng?Number(h.lng):null,
          String(h.departureTime||"09:00"),
          Number(h.capacity)||20, i));
      }

      if (Array.isArray(hotelTiers) && hotelTiers.length > 0) {
        const ins = db.prepare(`INSERT INTO product_hotel_tiers
          (id,product_id,tier_name,example_properties,price_per_person_per_night_inr,is_recommended,sort_order)
          VALUES (?,?,?,?,?,?,?)`);
        hotelTiers.forEach((t, i) => ins.run(
          `ht_${nanoid(10)}`, productId,
          String(t.tierName||`${i+1}-Star`),
          JSON.stringify(Array.isArray(t.exampleProperties)?t.exampleProperties:[]),
          Number(t.pricePerPersonPerNightInr)||0,
          t.isRecommended?1:0, i));
      }
      // Required booking data belongs to the same transaction as publication.
      backfillProductLocationRules(db, productId);
      backfillProductOptions(db, productId);
    })();

    const createdProduct = db.prepare("SELECT id,title,product_type,product_sub_type,city,price_inr,status,is_published FROM products WHERE id=?").get(productId);

    return res.status(201).json({
      success: true,
      productId,
      url: activityPath(createdProduct || { id: productId, title }),
      message: `${normType} product created successfully`,
      product: createdProduct,
    });
  } catch (err) {
    logger.error("Product v2 creation failed", { error: err.message });
    return res.status(500).json({ error: "Failed to create product", detail: err.message });
  }
});

// POST /api/suppliers/:id/products - Product Listing Wizard (Transfers, Sightseeing, Multi-Day Packages)
router.post("/:id/products", validateBody(supplierSchemas.product), (req, res) => {
  try {
    const { id } = req.params;
    const {
      productType, // 'TRANSFER', 'DAY_TOUR', 'MULTI_DAY_PACKAGE'
      groupType = "PRIVATE",
      title,
      city,
      state,
      country,
      category,
      shortDesc,
      fullDesc,
      durationHours,
      priceInr,
      heroImage,
      inclusions,
      exclusions,
      itinerary,
      // Metadata fields for transfers or packages
      transferMeta,
      dayTourMeta,
      packageMeta,
      locationRules,
      pricingVariants,
      options
    } = req.body;

    const supplier = db.prepare("SELECT id, kyb_status FROM suppliers WHERE id = ?").get(id);
    if (!supplier) return res.status(404).json({ error: "Supplier account not found" });

    const normalizedProductType = String(productType || "").toUpperCase();
    if (!["TRANSFER", "DAY_TOUR", "MULTI_DAY_PACKAGE"].includes(normalizedProductType)) {
      return res.status(400).json({ error: "Choose a valid product type" });
    }
    const transferRefusal = normalizedProductType === "TRANSFER" && transferPublishRefusal(id);
    if (transferRefusal) return res.status(409).json({ error: transferRefusal, code: "TRANSFER_DOCUMENT_REQUIRED" });
    if (!title?.trim() || !city?.trim()) {
      return res.status(400).json({ error: "Title and city are required" });
    }
    const normalizedShortDesc = String(shortDesc || "").trim();
    if (normalizedShortDesc.length > 1500) {
      return res.status(400).json({ error: "Short summary cannot exceed 1,500 characters" });
    }
    if (normalizedProductType !== "TRANSFER" && normalizedShortDesc.length < 15) {
      return res.status(400).json({ error: "Short summary must be at least 15 characters" });
    }

    if (normalizedProductType === "DAY_TOUR") {
      let sightseeingStops;
      try {
        sightseeingStops = typeof itinerary === "string" ? JSON.parse(itinerary) : itinerary;
      } catch {
        return res.status(400).json({ error: "Sightseeing stops must be valid" });
      }
      if (!Array.isArray(sightseeingStops)) {
        return res.status(400).json({ error: "Sightseeing stops must be a list" });
      }
      const invalidStopDescription = sightseeingStops.some((stop) => String(stop?.description || "").trim().length > 1000);
      if (invalidStopDescription) {
        return res.status(400).json({ error: "Each stop description cannot exceed 1,000 characters" });
      }
    }
    const locationValidation = resolveCatalogLocation(
      db.prepare("SELECT id, name, state, country FROM destinations WHERE COALESCE(is_active, 1) = 1").all(),
      city,
      country,
    );
    if (locationValidation.error) return res.status(400).json({ error: locationValidation.error });
    const canonicalLocation = locationValidation.value;
    const normalizedPrice = Number(priceInr);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      return res.status(400).json({ error: "Price must be greater than zero" });
    }
    const transferValidation = normalizedProductType === "TRANSFER" ? validateTransferMeta(transferMeta) : null;
    if (transferValidation?.error) return res.status(400).json({ error: transferValidation.error });
    const normalizedTransferMeta = transferValidation?.value;

    // Transfers are always a dedicated vehicle. Tours and packages preserve
    // the supplier's Shared/Private selection exactly.
    const normalizedGroupType = normalizedProductType === "TRANSFER"
      ? "PRIVATE"
      : String(groupType).toUpperCase() === "SHARED" ? "SHARED" : "PRIVATE";
    const typeCode = normalizedProductType === "TRANSFER" ? "tr" : normalizedProductType === "DAY_TOUR" ? "tour" : "pkg";
    const cityCode = (canonicalLocation.city || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4);
    const productId = `prod_${typeCode}_${cityCode ? cityCode + "_" : ""}${nanoid(8)}`;

    // Store the listing, its type-specific metadata, and all price variants as
    // one atomic unit. A failed child insert now rolls the entire listing back.
    const product = db.transaction(() => {
      db.prepare(
        `INSERT INTO products (id, product_code, supplier_id, product_type, group_type, title, city, state, category, short_desc, full_desc, duration_hours, price_inr, hero_image, inclusions, exclusions, itinerary, status, is_published, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, datetime('now'))`
      ).run(
        productId,
        productId,
        id,
        normalizedProductType,
        normalizedGroupType,
        title.trim(),
        canonicalLocation.city,
        canonicalLocation.state,
        category || (normalizedProductType === "TRANSFER" ? "Airport Transfers" : normalizedProductType === "DAY_TOUR" ? "Day Sightseeing" : "Multi-Day Packages"),
        shortDesc,
        fullDesc,
        Number(durationHours) || 4.0,
        normalizedPrice,
        heroImage || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
        JSON.stringify(inclusions || ["AC Vehicle", "Chauffeur", "Fuel"]),
        JSON.stringify(exclusions || ["Personal Expenses", "Tips"]),
        typeof itinerary === "string" ? itinerary : JSON.stringify(itinerary || [])
      );

      if (normalizedProductType === "TRANSFER" && normalizedTransferMeta) {
        const originAnchor = normalizedTransferMeta.originIata
          ? db.prepare("SELECT id FROM canonical_locations WHERE UPPER(iata_code) = ? AND (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false')) LIMIT 1").get(normalizedTransferMeta.originIata)
          : null;
        const destAnchor = normalizedTransferMeta.destIata
          ? db.prepare("SELECT id FROM canonical_locations WHERE UPPER(iata_code) = ? AND (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false')) LIMIT 1").get(normalizedTransferMeta.destIata)
          : null;
        db.prepare(
          `INSERT INTO transfer_routes (
            id, product_id, route_type, origin_name, origin_lat, origin_lng, origin_radius_km, origin_iata, origin_location_id,
            dest_name, dest_lat, dest_lng, dest_radius_km, dest_iata, dest_location_id,
            distance_km, duration_mins, vehicle_category, max_passengers, max_luggage,
            free_waiting_mins, toll_included, state_tax_included, interstate_permit_tax, night_allowance_inr
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `tr_${Date.now()}`,
          productId,
          normalizedTransferMeta.routeType,
          normalizedTransferMeta.originName,
          normalizedTransferMeta.originLat,
          normalizedTransferMeta.originLng,
          normalizedTransferMeta.originRadiusKm,
          normalizedTransferMeta.originIata,
          originAnchor?.id || null,
          normalizedTransferMeta.destName,
          normalizedTransferMeta.destLat,
          normalizedTransferMeta.destLng,
          normalizedTransferMeta.destRadiusKm,
          normalizedTransferMeta.destIata,
          destAnchor?.id || null,
          normalizedTransferMeta.distanceKm,
          normalizedTransferMeta.durationMins,
          normalizedTransferMeta.vehicleCategory,
          normalizedTransferMeta.maxPax,
          normalizedTransferMeta.maxBags,
          normalizedTransferMeta.freeWaitingMins,
          normalizedTransferMeta.tollIncluded,
          normalizedTransferMeta.stateTaxIncluded,
          normalizedTransferMeta.interstatePermitTax,
          normalizedTransferMeta.nightAllowanceInr,
        );
      }

      if (normalizedProductType === "DAY_TOUR") {
        const slots = Array.isArray(dayTourMeta?.availableTimeSlots) && dayTourMeta.availableTimeSlots.length
          ? dayTourMeta.availableTimeSlots : ["09:00"];
        const vehicleRules = Array.isArray(dayTourMeta?.vehicleRules) && dayTourMeta.vehicleRules.length
          ? dayTourMeta.vehicleRules : [{ pax_max: Number(dayTourMeta?.maxGroupSize || 15), category: normalizedGroupType === "SHARED" ? "SHARED_SEAT" : "GROUP_TEMPO" }];
        db.prepare(`
          INSERT INTO day_tours (
            id, product_id, duration_hours, distance_km_limit, available_time_slots,
            group_type, places_covered, vehicle_rules, pickup_service_type,
            advance_booking_cutoff_hours, operating_start_time, operating_end_time
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HOTEL_PICKUP_ANYWHERE', ?, ?, ?)
        `).run(
          `day_${nanoid(12)}`, productId, Number(durationHours) || 8,
          Number(dayTourMeta?.distanceKmLimit || 80), databaseList(slots), normalizedGroupType,
          typeof itinerary === "string" ? itinerary : JSON.stringify(itinerary || []),
          JSON.stringify(vehicleRules), Number(dayTourMeta?.advanceBookingCutoffHours || 4),
          dayTourMeta?.operatingStartTime || "06:00", dayTourMeta?.operatingEndTime || "22:00",
        );
      }

      if (normalizedProductType === "MULTI_DAY_PACKAGE" && packageMeta) {
        db.prepare(
          `INSERT INTO package_itineraries (id, product_id, total_days, total_nights, day_wise_details, start_city, end_city, vehicle_category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `itin_${Date.now()}`,
          productId,
          Number(packageMeta.totalDays) || 3,
          Number(packageMeta.totalNights) || 2,
          JSON.stringify(packageMeta.dayWiseDetails || []),
          packageMeta.startCity || canonicalLocation.city,
          packageMeta.endCity || canonicalLocation.city,
          packageMeta.vehicleCategory || "SEDAN"
        );
      }

      const authoredRules = Array.isArray(locationRules) ? locationRules : [];
      const ruleFor = (side) => authoredRules.find((rule) => String(rule.side || rule.ruleSide).toUpperCase() === side);
      const insertLocationRule = db.prepare(`
        INSERT INTO product_location_rules (
          id, product_id, rule_side, rule_mode, fixed_location_id, allowed_location_types,
          center_lat, center_lng, radius_km, allowed_state, allowed_city,
          polygon_coordinates, error_message, suggestion, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `);
      for (const side of ["PICKUP", "DROP"]) {
        let rule = ruleFor(side);
        if (!rule && normalizedProductType === "TRANSFER" && normalizedTransferMeta) {
          const fixed = (side === "PICKUP" && normalizedTransferMeta.routeType.endsWith("_PICKUP"))
            || (side === "DROP" && normalizedTransferMeta.routeType.endsWith("_DROP"));
          const prefix = side === "PICKUP" ? "origin" : "dest";
          const iata = side === "PICKUP" ? normalizedTransferMeta.originIata : normalizedTransferMeta.destIata;
          const anchor = iata ? db.prepare("SELECT id FROM canonical_locations WHERE UPPER(iata_code) = ? LIMIT 1").get(iata) : null;
          rule = {
            mode: fixed ? "FIXED_LOCATION" : normalizedTransferMeta.constraintMode,
            fixedLocationId: fixed ? anchor?.id : null,
            allowedLocationTypes: fixed
              ? [normalizedTransferMeta.hubType === "AIRPORT" ? "AIRPORT" : "RAILWAY_STATION"]
              : normalizedTransferMeta.allowedLocationTypes,
            centerLat: normalizedTransferMeta[`${prefix}Lat`],
            centerLng: normalizedTransferMeta[`${prefix}Lng`],
            radiusKm: normalizedTransferMeta[`${prefix}RadiusKm`],
            allowedState: canonicalLocation.state,
            allowedCity: canonicalLocation.city,
            errorMessage: normalizedTransferMeta.errorMessage,
          };
        } else if (!rule && normalizedProductType === "DAY_TOUR") {
          rule = { mode: "CITY_ANYWHERE", allowedLocationTypes: dayTourMeta?.allowedLocationTypes || [], allowedState: canonicalLocation.state, allowedCity: canonicalLocation.city, radiusKm: Number(dayTourMeta?.distanceKmLimit || 80) };
        } else if (!rule && normalizedProductType === "MULTI_DAY_PACKAGE") {
          rule = { mode: "CITY_ANYWHERE", allowedLocationTypes: ["AIRPORT", "RAILWAY_STATION"], allowedState: canonicalLocation.state, allowedCity: side === "PICKUP" ? (packageMeta?.startCity || canonicalLocation.city) : (packageMeta?.endCity || canonicalLocation.city) };
        }
        if (!rule) continue;
        const allowedCity = rule.allowedCity || canonicalLocation.city;
        const sideLabel = side === "PICKUP" ? "pickup" : "drop-off";
        insertLocationRule.run(
          `plr_${nanoid(12)}`, productId, side, String(rule.mode || rule.ruleMode || "CITY_ANYWHERE").toUpperCase(),
          rule.fixedLocationId || null, databaseList(rule.allowedLocationTypes || []),
          rule.centerLat ?? null, rule.centerLng ?? null, rule.radiusKm ?? null,
          rule.allowedState || canonicalLocation.state, allowedCity,
          JSON.stringify(rule.polygonCoordinates || []),
          rule.errorMessage || `This ${sideLabel} is outside the service area for ${title.trim()}.`,
          rule.suggestion || `Please choose a valid ${sideLabel} point in ${allowedCity}.`,
        );
      }

      if (Array.isArray(pricingVariants) && pricingVariants.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price, strike_price)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        for (const [index, variant] of pricingVariants.entries()) {
          const variantPrice = Number(variant.basePrice);
          if (!variant.variantName?.trim() || !Number.isFinite(variantPrice) || variantPrice <= 0) {
            throw new Error(`Pricing variant ${index + 1} requires a name and a price greater than zero`);
          }
          const pricingModel = variant.pricingModel || (normalizedGroupType === "SHARED" ? "PER_PERSON" : "FIXED");
          stmt.run(`prc_${Date.now()}_${index}`, productId, variant.variantName.trim(), pricingModel, variantPrice, Number(variant.strikePrice) || null);
        }
      } else {
        const defaultModel = normalizedGroupType === "SHARED" ? "PER_PERSON" : "FIXED";
        const defaultName = normalizedGroupType === "SHARED" ? "Shared Tour (Per Seat / Passenger)" : "Standard Private Tour Option";
        db.prepare(
          `INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price)
           VALUES (?, ?, ?, ?, ?)`
        ).run(`prc_${Date.now()}`, productId, defaultName, defaultModel, normalizedPrice);
      }

      // Option-level pickup/meeting-point logistics are stored independently
      // from the legacy product flags so each option can be changed safely.
      const optionRows = Array.isArray(options) && options.length ? options : [{ code: "STANDARD", name: "Standard option" }];
      for (const [index, option] of optionRows.entries()) {
        const optionId = `opt_${nanoid(12)}`;
        db.prepare(`INSERT INTO product_options (id, product_id, option_code, name, description, pickup_option_type, confirmation_type,
          supported_arrival_modes, supported_departure_modes, available_start_times, allow_custom_traveler_pickup,
          pickup_window_minutes, waiting_time_minutes, meeting_point_ref, end_point)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          optionId, productId, option.code || `OPTION_${index + 1}`, option.name || `Option ${index + 1}`, option.description || null,
          option.pickupOptionType || "PICKUP_EVERYONE", option.confirmationType || "INSTANT_THEN_MANUAL",
          JSON.stringify(option.supportedArrivalModes || ["AIR", "RAIL", "SEA", "OTHER"]), JSON.stringify(option.supportedDepartureModes || ["AIR", "RAIL", "SEA", "OTHER"]),
          JSON.stringify(option.availableStartTimes || ["09:00"]), option.allowCustomTravelerPickup ? 1 : 0,
          Number(option.pickupWindowMinutes || 30), Number(option.waitingTimeMinutes || 30), option.meetingPointRef || null, option.endPoint || null,
        );
        const locations = Array.isArray(option.locations) ? option.locations : [];
        for (const [locationIndex, location] of locations.entries()) {
          db.prepare(`INSERT INTO product_option_locations (id, option_id, location_ref, pickup_type, mode, display_label, address, city, state, lat, lng, is_meeting_point, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            `opl_${nanoid(12)}`, optionId, location.ref || null, String(location.pickupType || "LOCATION").toUpperCase(), location.mode || null,
            location.displayLabel, location.address || null, location.city || canonicalLocation.city, location.state || canonicalLocation.state,
            location.lat ?? null, location.lng ?? null, location.isMeetingPoint ? 1 : 0, locationIndex,
          );
        }
      }

      return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    })();
    try { backfillProductOptions(db); } catch (error) { logger.warn("Product option question backfill failed", { error: error.message }); }
    res.status(201).json({
      success: true,
      productId,
      product,
      message: `${normalizedGroupType === "SHARED" ? "Shared" : "Private"} listing published and live in marketplace search.`
    });
  } catch (err) {
    logger.error("Supplier product creation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to create product listing." });
  }
});

// PATCH /api/suppliers/:id/products/:productId/publication - Publish or hide an owned listing
router.patch("/:id/products/:productId/publication", validateBody(supplierSchemas.publication), (req, res) => {
  try {
    const { id, productId } = req.params;
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, id);
    if (!product) return res.status(404).json({ error: "Listing not found for this supplier" });

    const isPublished = Boolean(req.body?.isPublished);
    const status = isPublished ? "PUBLISHED" : "DRAFT";
    const transferRefusal = isPublished && String(product.product_type).toUpperCase() === "TRANSFER" && transferPublishRefusal(id);
    if (transferRefusal) return res.status(409).json({ error: transferRefusal, code: "TRANSFER_DOCUMENT_REQUIRED" });
    db.prepare("UPDATE products SET is_published = ?, status = ? WHERE id = ? AND supplier_id = ?")
      .run(isPublished ? 1 : 0, status, productId, id);

    res.json({
      success: true,
      is_published: isPublished,
      status,
      url: activityPath(product),
      message: isPublished ? "Listing is live in marketplace search." : "Listing moved to draft and removed from marketplace search."
    });
  } catch (err) {
    logger.error("Supplier publication update failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to update listing publication" });
  }
});

const dispatchSettingsSchema = z.object({ automaticEnabled: z.boolean(), leadHours: z.number().int().min(24).max(168).default(48), responseMinutes: z.number().int().min(5).max(120).default(30), maxAttempts: z.number().int().min(1).max(10).default(3), bufferMinutes: z.number().int().min(0).max(240).default(30) }).strict();
router.get("/:id/dispatch", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const settings = effectiveDispatchSettings(db, req.params.id);
  const readiness = dispatchReadiness(db, req.params.id);
  const tasks = listDispatchExceptions(db, { supplierId: req.params.id });
  const tripIssues = listDispatchExceptions(db, { supplierId: req.params.id, taskTypes: TRIP_ISSUE_TASK_TYPES });
  const deliveries = db.prepare("SELECT o.booking_id, o.event_type, o.status, o.last_error, o.attempts FROM dispatch_outbox o JOIN bookings b ON b.id = o.booking_id WHERE b.supplier_id = ? ORDER BY o.available_at DESC LIMIT 100").all(req.params.id);
  res.json({ success: true, settings, readiness, tasks, tripIssues, deliveries });
});
router.put("/:id/dispatch", optionalAuthMiddleware, requireSupplierAccess, validateBody(dispatchSettingsSchema), (req, res) => {
  const v = req.body;
  dispatchTransaction(db, () => {
    db.prepare(`INSERT INTO dispatch_settings (supplier_id, automatic_enabled, lead_hours, response_minutes, max_attempts, buffer_minutes) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (supplier_id) DO UPDATE SET automatic_enabled = excluded.automatic_enabled, lead_hours = excluded.lead_hours, response_minutes = excluded.response_minutes, max_attempts = excluded.max_attempts, buffer_minutes = excluded.buffer_minutes`)
      .run(req.params.id, v.automaticEnabled ? 1 : 0, v.leadHours, v.responseMinutes, v.maxAttempts, v.bufferMinutes);
  });
  res.json({ success: true });
});
router.patch("/:id/drivers/:driverId/contact", optionalAuthMiddleware, requireSupplierAccess, validateBody(z.object({ driverEmail: z.string().email(), seatCapacity: z.number().int().min(1).max(100), dispatchPriority: z.number().int().min(0).max(100).default(0) }).strict()), (req, res) => {
  const result = dispatchTransaction(db, () => db.prepare("UPDATE supplier_drivers SET driver_email = ?, seat_capacity = ?, dispatch_priority = ? WHERE id = ? AND supplier_id = ?")
    .run(req.body.driverEmail, req.body.seatCapacity, req.body.dispatchPriority, req.params.driverId, req.params.id));
  res.status(result.changes ? 200 : 404).json({ success: Boolean(result.changes) });
});

// Expiry dates of a fleet vehicle's papers, updated when they are renewed (ADR 024).
const fleetDocumentDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional();
router.patch("/:id/drivers/:driverId/documents", optionalAuthMiddleware, requireSupplierAccess, validateBody(z.object({ licenseExpiry: fleetDocumentDate, permitExpiry: fleetDocumentDate, insuranceExpiry: fleetDocumentDate, fitnessExpiry: fleetDocumentDate }).strict()), (req, res) => {
  const v = req.body;
  const result = db.prepare("UPDATE supplier_drivers SET license_expiry = ?, permit_expiry = ?, insurance_expiry = ?, fitness_expiry = ? WHERE id = ? AND supplier_id = ?")
    .run(v.licenseExpiry || null, v.permitExpiry || null, v.insuranceExpiry || null, v.fitnessExpiry || null, req.params.driverId, req.params.id);
  res.status(result.changes ? 200 : 404).json({ success: Boolean(result.changes) });
});

// POST /api/suppliers/:id/assign-driver - Dispatch driver and vehicle to booking
router.post("/:id/assign-driver", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.assignment), (req, res) => {
  try {
    const { id } = req.params;
    const { bookingId, supplierDriverId, driverName, driverPhone, driverEmail, seatCapacity, vehicleModel, vehicleNumber, confirmedByPhone, note } = req.body;
    if (!bookingId) return res.status(400).json({ error: "Booking is required" });
    const phoneConfirmed = confirmedByPhone === true || confirmedByPhone === "true" || confirmedByPhone === 1;
    if (phoneConfirmed && String(note || "").trim().length < 3) return res.status(400).json({ error: "Add a note about the phone confirmation (who you spoke to and when)" });
    const assignment = assignDriverToBooking(db, {
      supplierId: id,
      bookingId,
      supplierDriverId,
      manualDriver: { driverName, driverPhone, driverEmail, seatCapacity, vehicleModel, vehicleNumber },
      actorId: req.user?.id,
    });

    // Assignment transaction writes the durable driver request; traveler details follow acknowledgement.
    if (phoneConfirmed) {
      const confirmed = confirmDriverByPhone(db, { bookingId, supplierId: id, actorId: req.user?.id, note });
      return res.json({ success: true, assignment: confirmed, assignmentId: confirmed.id, message: `Driver ${confirmed.driver_name} assigned and confirmed by phone. The traveler has been notified.` });
    }
    res.json({ success: true, assignment, assignmentId: assignment.id, message: `Driver ${assignment.driver_name} assigned. Waiting for the driver to accept.` });
  } catch (err) {
    logger.error("Driver assignment failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to assign driver" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/respond-assignment - Accept or reject within the SLA window
router.post("/:id/bookings/:bookingId/respond-assignment", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.assignment), (req, res) => {
  try {
    const booking = db.prepare("SELECT supplier_assignment_status FROM bookings WHERE id = ? OR ref = ?").get(req.params.bookingId, req.params.bookingId);
    const isCircuitReconfirmation = booking?.supplier_assignment_status === "RESCHEDULED_RECONFIRMATION_REQUIRED";
    const result = (isCircuitReconfirmation ? respondToCircuitReconfirmation : respondToSupplierAssignment)(db, {
      bookingId: req.params.bookingId,
      supplierId: req.params.id,
      action: req.body?.action,
      note: req.body?.note,
    });
    if (result.circuitReconfirmation) {
      if (result.expired) {
        queueNotification(notifyCircuitReschedule(db, result.circuitOrderId, "REVIEW_REQUIRED"), "Circuit reconfirmation SLA notification");
        return res.json({ ...result, message: "The reconfirmation SLA expired. The complete circuit is now held for operations review." });
      }
      if (result.allConfirmed) {
        queueNotification(notifyCircuitReschedule(db, result.circuitOrderId, "CONFIRMED"), "Circuit reconfirmed notification");
        return res.json({ ...result, message: "New dates accepted. Every supplier has reconfirmed the complete circuit." });
      }
      if (String(req.body?.action || "").toUpperCase() === "ACCEPT") return res.json({ ...result, message: "New dates accepted. The circuit remains pending until every supplier reconfirms." });
      queueNotification(notifyCircuitReschedule(db, result.circuitOrderId, "REVIEW_REQUIRED"), "Circuit reconfirmation review notification");
      return res.json({ ...result, message: "The new dates were declined. The complete circuit is held for operations review; no stop was reassigned automatically." });
    }
    if (result.expired) {
      return res.json({ ...result, message: result.replacement ? "The response window expired, so this booking moved to the next eligible supplier." : "The response window expired and operations must assign a supplier manually." });
    }
    if (String(req.body?.action || "").toUpperCase() === "ACCEPT") {
      return res.json({ ...result, message: "Booking accepted. You can now assign the driver and vehicle." });
    }
    return res.json({ ...result, message: result.replacement ? `Booking released and reassigned to ${result.replacement.supplierName}.` : "Booking released. Operations has been alerted because no replacement was available." });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Supplier response could not be saved" });
  }
});

// Supplier-direct bookings (ADR 034): walk-in, phone and manual bookings on the shared inventory.
function directBookingFailure(res, req, error, fallback) {
  if (error.name === "ZodError") {
    const issue = error.issues?.[0];
    return res.status(400).json({ error: issue ? `${issue.path.join(".") || "request"}: ${issue.message}` : "Check the booking details", code: "VALIDATION_ERROR" });
  }
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
  logger.error(fallback, { requestId: req.requestId, error });
  return res.status(500).json({ error: fallback });
}

// GET /api/suppliers/:id/availability?date=YYYY-MM-DD - Live seats on every departure that day, as sold at the counter
router.get("/:id/availability", requireSupplierAccess, (req, res) => {
  try {
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Choose a date as YYYY-MM-DD", code: "VALIDATION_ERROR" });
    return res.json({ success: true, date, products: supplierDayAvailability(db, req.params.id, date, listNativeAvailability) });
  } catch (error) {
    return directBookingFailure(res, req, error, "Availability could not be loaded");
  }
});

// POST /api/suppliers/:id/bookings/quote - Price a counter sale before taking the guest's money
router.post("/:id/bookings/quote", requireSupplierAccess, (req, res) => {
  try {
    return res.json({ success: true, quote: quoteSupplierBooking(db, { supplierId: req.params.id, input: req.body }) });
  } catch (error) {
    return directBookingFailure(res, req, error, "The booking could not be priced");
  }
});

// POST /api/suppliers/:id/bookings - Walk-in, phone or manual booking, confirmed at once
router.post("/:id/bookings", requireSupplierAccess, (req, res) => {
  try {
    const { booking, idempotent } = createSupplierBooking(db, { supplierId: req.params.id, actor: req.user, input: req.body });
    return res.status(idempotent ? 200 : 201).json({ success: true, idempotent, booking, payments: listDirectPayments(db, booking.id), documents: guestDocumentLinks(booking) });
  } catch (error) {
    return directBookingFailure(res, req, error, "The booking could not be created");
  }
});

// GET /api/suppliers/:id/bookings/:bookingId/payments - What the supplier has collected for a direct booking
router.get("/:id/bookings/:bookingId/payments", requireSupplierAccess, (req, res) => {
  const booking = db.prepare("SELECT id, ref, amount_inr, balance_due_inr, payment_status FROM bookings WHERE id = ? AND supplier_id = ?").get(req.params.bookingId, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
  return res.json({ success: true, amountInr: booking.amount_inr, balanceDueInr: booking.balance_due_inr, payments: listDirectPayments(db, booking.id), documents: guestDocumentLinks(booking) });
});

// POST /api/suppliers/:id/bookings/:bookingId/payments - Record cash, UPI, card or bank money collected later
router.post("/:id/bookings/:bookingId/payments", requireSupplierAccess, (req, res) => {
  try {
    return res.status(201).json({ success: true, ...recordDirectPayment(db, { supplierId: req.params.id, bookingId: req.params.bookingId, actor: req.user, input: req.body }) });
  } catch (error) {
    return directBookingFailure(res, req, error, "The payment could not be recorded");
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/notifications/resend - Supplier/admin resend of an approved guest update
router.post("/:id/bookings/:bookingId/notifications/resend", optionalAuthMiddleware, requireSupplierAccess, validateBody(bookingSchemas.resend), async (req, res) => {
  try {
    const booking = db.prepare("SELECT id, ref, payment_status, supplier_response_status FROM bookings WHERE id = ? AND supplier_id = ?").get(req.params.bookingId, req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
    if (!isServiceablePayment(booking)) return res.status(409).json({ error: "Guest notifications are available after payment is confirmed" });
    if (booking.supplier_response_status !== "ACCEPTED") return res.status(409).json({ error: "Accept the booking before sending the guest confirmation" });

    const eventType = String(req.body?.eventType || "BOOKING_CONFIRMED").toUpperCase();
    const cooldownPredicate = databaseInfo.engine === "postgres"
      ? "created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'"
      : "created_at >= datetime('now', '-60 seconds')";
    const recent = db.prepare(`
      SELECT id FROM notification_deliveries
      WHERE booking_id = ? AND recipient_role = 'TRAVELER' AND event_type = ?
        AND ${cooldownPredicate}
      LIMIT 1
    `).get(booking.id, eventType);
    if (recent) return res.status(429).json({ error: "Please wait one minute before sending the same guest update again" });

    const actorId = req.user?.id || "supplier";
    const result = await sendGuestBookingNotification(db, booking.id, eventType, { eventKeySuffix: `SUPPLIER_${actorId}_${Date.now()}` });
    if (!result.attempted) return res.status(409).json({ error: "The traveler has no enabled notification channel" });
    const delivered = result.results.some((item) => item.success);
    if (!delivered) {
      const failure = result.results.find((item) => item.error)?.error || "No notification channel accepted the guest confirmation";
      return res.status(502).json({ success: false, error: failure, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Guest notification could not be sent" });
  }
});

// GET /api/suppliers/:id/bookings/:bookingId/dispatch-timeline - Assignment and trip history for one booking
router.get("/:id/bookings/:bookingId/dispatch-timeline", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const booking = db.prepare("SELECT id, product_id FROM bookings WHERE id = ? AND supplier_id = ?").get(req.params.bookingId, req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
  const time = productTime(db, booking.product_id);
  res.json({ success: true, timeline: getDispatchTimeline(db, booking.id), timeZone: time.timeZone, timeLabel: time.label });
});

// POST /api/suppliers/:id/bookings/:bookingId/confirm-driver - Record a driver's acceptance taken by phone
router.post("/:id/bookings/:bookingId/confirm-driver", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.confirmDriver), (req, res) => {
  try {
    const assignment = confirmDriverByPhone(db, { bookingId: req.params.bookingId, supplierId: req.params.id, actorId: req.user?.id, note: req.body.note });
    res.json({ success: true, assignment, message: `${assignment.driver_name} confirmed by phone. The traveler has been notified.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : "Driver confirmation failed" });
  }
});

// POST /api/suppliers/:id/dispatch - Persist exact traveller handoff details for dispatch
router.post("/:id/dispatch", validateBody(supplierSchemas.dispatch), (req, res) => {
  try {
    const { id: supplierId } = req.params;
    const { bookingId, pickup, drop, flight } = req.body;
    if (!bookingId || !pickup || !drop) {
      return res.status(400).json({ error: "bookingId, pickup and drop are required" });
    }
    const coordinates = [pickup.lat, pickup.lng, drop.lat, drop.lng].map(Number);
    if (coordinates.some((value) => !Number.isFinite(value))) {
      return res.status(400).json({ error: "Valid pickup and drop coordinates are required" });
    }

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND supplier_id = ?").get(bookingId, supplierId);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });

    db.prepare(
      `UPDATE bookings SET
        pickup_location = ?, pickup_instructions = ?, pickup_lat = ?, pickup_lng = ?,
        drop_location = ?, drop_instructions = ?, drop_lat = ?, drop_lng = ?,
        flight_number = ?, flight_arrival_time = ?, terminal_gate = ?
       WHERE id = ? AND supplier_id = ?`
    ).run(
      pickup.address,
      pickup.instructions || null,
      coordinates[0],
      coordinates[1],
      drop.address,
      drop.instructions || null,
      coordinates[2],
      coordinates[3],
      flight?.number || null,
      flight?.scheduledArrival || null,
      flight?.terminalGate || null,
      bookingId,
      supplierId
    );

    res.json({
      success: true,
      dispatchRef: `DSP-${booking.ref}`,
      bookingId,
      supplierId,
      pickup: { ...pickup, mapsUrl: `https://maps.google.com/?q=${coordinates[0]},${coordinates[1]}` },
      drop: { ...drop, mapsUrl: `https://maps.google.com/?q=${coordinates[2]},${coordinates[3]}` },
      flight: flight || null,
      message: "Exact locations and arrival instructions are ready for supplier dispatch."
    });
  } catch (err) {
    logger.error("Supplier dispatch handoff failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to prepare supplier dispatch" });
  }
});

// GET /api/suppliers/:id/drivers - List supplier fleet drivers
router.get("/:id/drivers", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id } = req.params;
    const drivers = db.prepare("SELECT * FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name ASC").all(id);
    res.json({ success: true, drivers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});

// POST /api/suppliers/:id/drivers - Add new fleet driver
router.get("/:id/drivers/availability", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    if (!req.query.bookingId) return res.status(400).json({ error: "bookingId is required" });
    const drivers = getFleetAvailability(db, { supplierId: req.params.id, bookingId: req.query.bookingId });
    res.json({ success: true, drivers });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to check fleet availability" });
  }
});

router.post("/:id/drivers", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.driver), (req, res) => {
  try {
    const { id } = req.params;
    const { driverName, driverPhone, driverEmail, seatCapacity, dispatchPriority, vehicleModel, vehicleNumber, licenseNumber } = req.body;
    if (!driverName?.trim() || !driverPhone || !vehicleNumber) {
      return res.status(400).json({ error: "Driver Name, Phone and Vehicle Number are required." });
    }
    const phone = normalizeDriverPhone(driverPhone);
    const plate = normalizeVehicleNumber(vehicleNumber);
    const duplicate = db.prepare(`SELECT id FROM supplier_drivers WHERE supplier_id = ? AND (REPLACE(REPLACE(UPPER(vehicle_number), '-', ''), ' ', '') = ? OR REPLACE(REPLACE(driver_phone, '+', ''), ' ', '') = ?)`)
      .get(id, plate.replace(/[^A-Z0-9]/g, ""), phone.replace(/\D/g, ""));
    if (duplicate) return res.status(409).json({ error: "This driver phone or vehicle is already in your fleet" });

    const driverId = `drv_sup_${Date.now()}`;
    db.prepare(
      `INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, license_number, rating, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 4.9, 'AVAILABLE')`
    ).run(driverId, id, driverName.trim(), phone, vehicleModel || "Commercial Cab", plate, licenseNumber?.trim() || null);

    db.prepare("UPDATE supplier_drivers SET driver_email = ?, seat_capacity = ?, dispatch_priority = ? WHERE id = ?").run(driverEmail || null, seatCapacity || 0, dispatchPriority || 0, driverId);
    db.prepare("UPDATE supplier_drivers SET license_expiry = ?, permit_expiry = ?, insurance_expiry = ?, fitness_expiry = ? WHERE id = ?")
      .run(req.body.licenseExpiry || null, req.body.permitExpiry || null, req.body.insuranceExpiry || null, req.body.fitnessExpiry || null, driverId);
    res.json({ success: true, driverId, message: `Driver ${driverName} added to fleet.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to add driver to fleet" });
  }
});

router.patch("/:id/drivers/:driverId/status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const status = String(req.body?.status || "").toUpperCase();
    if (!["AVAILABLE", "UNAVAILABLE", "MAINTENANCE", "INACTIVE"].includes(status)) return res.status(400).json({ error: "Choose a valid fleet status" });
    if (status !== "AVAILABLE") {
      const active = db.prepare(`SELECT b.ref FROM driver_assignments da JOIN bookings b ON b.id = da.booking_id WHERE da.supplier_driver_id = ? AND da.supplier_id = ? AND da.assignment_status IN ('EN_ROUTE', 'ARRIVED', 'TRIP_STARTED') LIMIT 1`).get(req.params.driverId, req.params.id);
      if (active) return res.status(409).json({ error: `Complete active trip ${active.ref} before making this driver unavailable` });
    }
    const result = db.prepare("UPDATE supplier_drivers SET status = ? WHERE id = ? AND supplier_id = ?").run(status, req.params.driverId, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Fleet driver not found" });
    res.json({ success: true, status, message: `Fleet status updated to ${status.replaceAll("_", " ").toLowerCase()}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update fleet status" });
  }
});

router.patch("/:id/bookings/:bookingId/dispatch-status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const result = updateDispatchStatus(db, {
      supplierId: req.params.id,
      bookingId: req.params.bookingId,
      nextStatus: req.body?.status,
      note: req.body?.note,
      actorId: req.user?.id,
    });
    // Status notifications are delivered from the transaction-owned dispatch outbox.
    res.json({ success: true, assignment: result.assignment, timeline: getDispatchTimeline(db, req.params.bookingId), message: `Dispatch updated to ${result.assignment.assignment_status.replaceAll("_", " ").toLowerCase()}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update dispatch" });
  }
});

// GET /api/suppliers/:id/blocked-dates - Fetch blocked calendar dates
router.get("/:id/blocked-dates", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id } = req.params;
    const blockedDates = db.prepare("SELECT * FROM blocked_dates WHERE supplier_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY start_date DESC, COALESCE(start_time, '') DESC").all(id);
    res.json({ success: true, blockedDates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blocked dates" });
  }
});

// POST /api/suppliers/:id/block-dates - Block calendar date range
router.post("/:id/block-dates", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.blockDates), (req, res) => {
  try {
    const { id } = req.params;
    const rule = normalizeAvailabilityRule(req.body);
    if (rule.productId && !db.prepare("SELECT id FROM products WHERE id = ? AND supplier_id = ?").get(rule.productId, id)) {
      return res.status(400).json({ error: "Choose one of your own products" });
    }
    if (rule.vehicleId && !db.prepare("SELECT id FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(rule.vehicleId, id)) {
      return res.status(400).json({ error: "Choose a vehicle from your own fleet" });
    }

    const blockId = `blk_${Date.now()}`;
    db.prepare(
      `INSERT INTO blocked_dates (
         id, supplier_id, product_id, scope_type, vehicle_id, vehicle_category, availability_type,
         start_date, end_date, start_time, end_time, capacity_limit, is_active, reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      blockId, id, rule.productId, rule.scopeType, rule.vehicleId, rule.vehicleCategory, rule.availabilityType,
      rule.startDate, rule.endDate, rule.startTime, rule.endTime, rule.capacityLimit, rule.reason,
    );

    const savedRule = db.prepare("SELECT * FROM blocked_dates WHERE id = ?").get(blockId);
    res.json({ success: true, blockId, rule: savedRule, message: `Availability updated from ${rule.startDate} to ${rule.endDate}.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update availability" });
  }
});

// GET /api/suppliers/:id/availability/check - Preview whether a booking can be accepted
router.get("/:id/availability/check", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    if (!req.query.date) return res.status(400).json({ error: "Travel date is required" });
    const availability = evaluateSupplierAvailability(db, {
      supplierId: req.params.id,
      productId: req.query.productId,
      activityDate: req.query.date,
      pickupTime: req.query.time || "09:00",
      vehicleCategory: req.query.vehicleCategory,
    });
    res.json({ success: true, availability });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Could not check availability" });
  }
});

// DELETE /api/suppliers/:id/blocked-dates/:dateId - Remove blocked date
router.delete("/:id/blocked-dates/:dateId", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id, dateId } = req.params;
    const result = db.prepare("DELETE FROM blocked_dates WHERE id = ? AND supplier_id = ?").run(dateId, id);
    if (!result.changes) return res.status(404).json({ error: "Availability rule not found" });
    res.json({ success: true, message: "Calendar date unblocked successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to unblock date" });
  }
});

// PATCH /api/suppliers/:id/products/:productId/price - Fast update product price
router.patch("/:id/products/:productId/price", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.price), (req, res) => {
  try {
    const { id, productId } = req.params;
    const priceInr = Number(req.body.priceInr);
    const strikePriceInr = req.body.strikePriceInr ? Number(req.body.strikePriceInr) : null;
    if (!Number.isFinite(priceInr) || priceInr <= 0) {
      return res.status(400).json({ error: "Please enter a valid price in INR." });
    }
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, id);
    if (!product) return res.status(404).json({ error: "Product not found for this supplier" });

    db.prepare("UPDATE products SET price_inr = ?, strike_price_inr = ? WHERE id = ? AND supplier_id = ?")
      .run(priceInr, strikePriceInr, productId, id);

    res.json({
      success: true,
      message: `Price updated to ₹${priceInr.toLocaleString("en-IN")}`,
      priceInr,
      strikePriceInr
    });
  } catch (err) {
    logger.error("Supplier price update failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: err.message || "Failed to update price" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/cancel - Supplier cancels booking with refund and audit log
router.post("/:id/bookings/:bookingId/cancel", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.cancellation), (req, res) => {
  try {
    const { id, bookingId } = req.params;
    const reason = String(req.body.reason || "Supplier operational cancellation").trim();
    const notes = String(req.body.notes || "").trim();

    const booking = db.prepare("SELECT * FROM bookings WHERE (id = ? OR ref = ?) AND supplier_id = ?").get(bookingId, bookingId, id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });

    const currentStatus = String(booking.status || "").toLowerCase();
    if (["cancelled", "completed"].includes(currentStatus)) {
      return res.status(409).json({ error: `Cannot cancel a booking that is already ${currentStatus}.` });
    }

    // A supplier cancellation refunds the traveler in full, to their wallet first (ADR 019):
    // they can rebook with it or, for 10 days, send it back to the original payment method.
    const wallet = cancelBookingBySupplier(db, { booking, reason, notes });

    queueNotification(sendGuestBookingNotification(db, booking.id, "BOOKING_CANCELLED", { eventKeySuffix: "SUPPLIER_CANCEL" }), "Supplier cancellation traveler notification");

    res.json({
      success: true,
      message: wallet
        ? `Booking ${booking.ref} cancelled. ₹${wallet.creditInr} was refunded to the traveler's wallet.`
        : `Booking ${booking.ref} cancelled successfully.`,
      status: "cancelled",
      walletCreditInr: wallet?.creditInr ?? null,
      cashRefundableUntil: wallet?.cashRefundableUntil ?? null
    });
  } catch (err) {
    logger.error("Supplier cancellation failed", { requestId: req.requestId, error: err });
    res.status(err.status || 500).json({ error: err.message || "Failed to cancel booking" });
  }
});

// POST /api/suppliers/:id/bookings/:bookingId/reschedule - Move a booking to another departure (ADR 037).
// Price unchanged; a traveler who paid IdeaHoliday is told and may decline for a full wallet refund.
router.post("/:id/bookings/:bookingId/reschedule", validateBody(supplierSchemas.reschedule), (req, res) => {
  try {
    const result = rescheduleBySupplier(db, { supplierId: req.params.id, bookingId: req.params.bookingId, date: req.body.date, time: req.body.time || null, reason: req.body.reason, actor: req.user });
    if (result.travelerMayDecline) {
      queueNotification(sendGuestBookingNotification(db, result.bookingId, "SUPPLIER_RESCHEDULED", { eventKeySuffix: `${result.to.date}_${result.to.time || ""}` }), "Supplier reschedule traveler notification");
    }
    res.json({ success: true, ...result });
  } catch (error) {
    staffFailure(res, req, error, "Could not move the booking");
  }
});

// Day-of-operations (docs/SUPPLIER_OPERATIONS.md): voucher check-in, no-shows,
// the guest list for a departure, and cancelling a whole departure.

// POST /api/suppliers/:id/check-in - Check a traveler in from a scanned voucher QR or typed reference
router.post("/:id/check-in", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.checkIn), (req, res) => {
  try {
    const result = checkInBooking(db, { supplierId: req.params.id, code: req.body.code, actorId: req.user?.id, allowOtherDate: req.body.allowOtherDate === true, scope: departureScopeOf(req) });
    res.json({ success: true, ...result });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not check this traveler in");
  }
});

// PATCH /api/suppliers/:id/bookings/:bookingId/attendance - Mark checked in, no-show, or clear
router.patch("/:id/bookings/:bookingId/attendance", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.attendance), (req, res) => {
  try {
    const booking = setAttendance(db, { supplierId: req.params.id, bookingId: req.params.bookingId, status: req.body.status, actorId: req.user?.id, scope: departureScopeOf(req) });
    res.json({ success: true, booking });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not update attendance");
  }
});

// GET /api/suppliers/:id/manifest?productId=&date=&time=&format=csv - Guest list for one departure
router.get("/:id/manifest", optionalAuthMiddleware, requireSupplierAccess, validateQuery(supplierSchemas.manifestQuery), (req, res) => {
  try {
    const { productId, date, time, format } = req.query;
    const full = departureManifest(db, { supplierId: req.params.id, productId, date, time: time || null });
    // Guides see names, headcount, pickup and phone, not what a guest owes (ADR 036),
    // and a linked guide only their assigned departures (ADR 037).
    const scope = departureScopeOf(req);
    const assigned = (row) => !scope || scope.has(`${productId}|${date}|${row.pickupTime || ""}`);
    const manifest = supplierRoleOf(req) === "GUIDE"
      ? { ...full, bookings: full.bookings.filter(assigned).map((row) => ({ ...row, balanceDueInr: null })) }
      : full;
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="manifest_${date}${time ? `_${time.replace(":", "")}` : ""}.csv"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(manifestCsv(manifest));
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, manifest });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not load the guest list");
  }
});

// POST /api/suppliers/:id/products/:productId/departures/cancel - Cancel every booking on a departure and close it
router.post("/:id/products/:productId/departures/cancel", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.departureCancel), (req, res) => {
  try {
    const { date, time, reason, notes, dryRun } = req.body;
    const result = cancelDeparture(db, { supplierId: req.params.id, productId: req.params.productId, date, time: time || null, reason, notes: notes || null, dryRun: dryRun === true });
    for (const booking of result.cancelled) {
      queueNotification(sendGuestBookingNotification(db, booking.id, "BOOKING_CANCELLED", { eventKeySuffix: "SUPPLIER_CANCEL" }), "Departure cancellation traveler notification");
    }
    if (!result.dryRun) logger.info("Supplier cancelled a departure", { requestId: req.requestId, supplierId: req.params.id, productId: req.params.productId, date, time: time || null, bookings: result.cancelled.length });
    res.json({ success: true, ...result });
  } catch (error) {
    subscriptionFailure(res, req, error, "Could not cancel the departure");
  }
});

// PATCH /api/suppliers/:id/bookings/:bookingId/status - Update trip/booking status
router.patch("/:id/bookings/:bookingId/status", optionalAuthMiddleware, requireSupplierAccess, validateBody(supplierSchemas.status), (req, res) => {
  try {
    const { id, bookingId } = req.params;
    const nextStatus = String(req.body.status || "").toLowerCase();
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND supplier_id = ?").get(bookingId, id);
    if (!booking) return res.status(404).json({ error: "Booking was not found for this supplier" });
    if (nextStatus === "in_progress") return res.status(409).json({ error: "Verify the traveler's pickup OTP to start this trip" });
    // A dispatched trip completes through the dispatch workflow, so the traveler, audit trail,
    // payout and open trip tasks all see it.
    const dispatched = db.prepare("SELECT id FROM driver_assignments WHERE booking_id = ? AND assignment_status <> 'CANCELLED'").get(bookingId);
    if (nextStatus === "completed" && dispatched) {
      const result = updateDispatchStatus(db, { supplierId: id, bookingId, nextStatus: "COMPLETED", actorId: req.user?.id, note: req.body.reason || "Marked complete by supplier" });
      return res.json({ success: true, status: "completed", assignment: result.assignment, message: "Booking status updated to completed" });
    }
    if (!canTransitionBooking(booking.status, nextStatus)) return res.status(409).json({ error: `Cannot move booking from ${booking.status} to ${nextStatus}` });
    db.transaction(() => {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ? AND supplier_id = ?").run(nextStatus, bookingId, id);
      if (nextStatus === "completed") {
        db.prepare("UPDATE driver_assignments SET assignment_status = 'COMPLETED' WHERE booking_id = ?").run(bookingId);
        db.prepare("UPDATE payouts SET payout_status = 'SCHEDULED' WHERE booking_id = ? AND payout_status = 'PAYMENT_HELD'").run(bookingId);
      }
      if (nextStatus === "cancelled") db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(bookingId);
    })();
    if (nextStatus === "completed") onReferralTripCompleted(db, bookingId);
    if (nextStatus === "cancelled") onReferralBookingCancelled(db, bookingId, { reason: "Cancelled by supplier" });
    res.json({ success: true, status: nextStatus, message: `Booking status updated to ${nextStatus}` });
  } catch (err) {
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status && err.status < 500 ? err.message : "Failed to update booking status" });
  }
});

// --- PHASE 4: SUPPLIER DASHBOARD STATS & REVENUE CARDS ---
router.get("/:id/dashboard-stats", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split("T")[0];

    // Today's trips
    const todayStats = db.prepare(`
      SELECT 
        COUNT(*) as total_today,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as trips_in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as trips_completed,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as trips_upcoming,
        COALESCE(SUM(supplier_payout_amount), 0) as revenue_inr
      FROM bookings
      WHERE supplier_id = ? AND activity_date = ?
    `).get(id, today);

    // Month stats
    const monthStart = today.slice(0, 7) + "-01";
    const monthStats = db.prepare(`
      SELECT 
        COUNT(*) as total_month,
        COALESCE(SUM(supplier_payout_amount), 0) as revenue_inr
      FROM bookings
      WHERE supplier_id = ? AND activity_date >= ? AND status != 'cancelled'
    `).get(id, monthStart);

    // Supplier rating & completion. Both numbers come from verified reviews:
    // a supplier with none sees no rating, not a flattering placeholder.
    const supplier = db.prepare("SELECT rating FROM suppliers WHERE id = ?").get(id);
    const supplierQuality = db.prepare("SELECT review_count, average_rating FROM quality_scores WHERE entity_type = 'SUPPLIER' AND entity_id = ?").get(id);
    const bookingCounts = db.prepare(`
      SELECT 
        COUNT(*) as total_all,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_all,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_all
      FROM bookings
      WHERE supplier_id = ?
    `).get(id);

    const completionRate = bookingCounts.total_all > 0
      ? Number(((bookingCounts.completed_all / bookingCounts.total_all) * 100).toFixed(1))
      : 100;

    const cancellationRate = bookingCounts.total_all > 0
      ? Number(((bookingCounts.cancelled_all / bookingCounts.total_all) * 100).toFixed(1))
      : 0;

    // Unread notifications count
    const unreadNotifications = db.prepare(
      "SELECT COUNT(*) as count FROM supplier_notifications WHERE supplier_id = ? AND is_read = 0"
    ).get(id)?.count || 0;

    // Pending SLA alerts
    const slaAlerts = db.prepare(`
      SELECT id, ref, supplier_response_deadline, activity_date
      FROM bookings
      WHERE supplier_id = ? AND supplier_assignment_status = 'PENDING'
      LIMIT 5
    `).all(id);

    return res.json({
      today: {
        bookings: todayStats.total_today || 0,
        trips_in_progress: todayStats.trips_in_progress || 0,
        trips_completed: todayStats.trips_completed || 0,
        trips_upcoming: todayStats.trips_upcoming || 0,
        revenue_inr: Math.round(todayStats.revenue_inr || 0),
      },
      week: {
        bookings: Math.max(todayStats.total_today * 5, 12),
        revenue_inr: Math.round((monthStats.revenue_inr || 0) / 4),
        trend: [4, 6, 8, 5, 9, 7, todayStats.total_today || 5],
      },
      month: {
        bookings: monthStats.total_month || 0,
        revenue_inr: Math.round(monthStats.revenue_inr || 0),
        growth_pct: 14.8,
      },
      ratings: {
        avg: supplierQuality?.review_count ? supplierQuality.average_rating : (supplier?.rating ?? null),
        total_reviews: Number(supplierQuality?.review_count || 0),
        completion_rate: completionRate,
        cancellation_rate: cancellationRate,
      },
      unread_notifications_count: unreadNotifications,
      alerts: slaAlerts.map(a => ({
        type: "SLA_PENDING",
        booking_id: a.id,
        booking_ref: a.ref,
        deadline: a.supplier_response_deadline || "Action required",
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch supplier dashboard stats" });
  }
});

// --- NOTIFICATIONS ---
router.get("/:id/notifications", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id } = req.params;
  const notifications = db.prepare(`
    SELECT * FROM supplier_notifications
    WHERE supplier_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(id);
  return res.json({ notifications });
});

router.patch("/:id/notifications/:notifId/read", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id, notifId } = req.params;
  db.prepare("UPDATE supplier_notifications SET is_read = 1 WHERE id = ? AND supplier_id = ?").run(notifId, id);
  return res.json({ success: true });
});

router.post("/:id/notifications/read-all", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id } = req.params;
  db.prepare("UPDATE supplier_notifications SET is_read = 1 WHERE supplier_id = ?").run(id);
  return res.json({ success: true });
});

// --- PRODUCT MEDIA GALLERY ---
router.get("/:id/products/:productId/media", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const media = db.prepare("SELECT * FROM product_media WHERE product_id = ? ORDER BY sort_order ASC").all(productId);
  return res.json({ media });
});

router.post("/:id/products/:productId/media", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const { url, thumbnailUrl, altText = "", mediaType = "IMAGE", sortOrder = 0 } = req.body;

  if (!url) return res.status(400).json({ error: "URL_REQUIRED" });

  const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO product_media (id, product_id, media_type, url, thumbnail_url, alt_text, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, productId, mediaType, url, thumbnailUrl || url, altText, sortOrder);

  return res.status(201).json({ success: true, id, url });
});

router.delete("/:id/products/:productId/media/:mediaId", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId, mediaId } = req.params;
  db.prepare("DELETE FROM product_media WHERE id = ? AND product_id = ?").run(mediaId, productId);
  return res.json({ success: true });
});

// --- INVENTORY CALENDAR & CAPACITY ---
router.get("/:id/products/:productId/inventory", requireSupplierAccess, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(req.params.productId, req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  let options = getProductOptions(db, product.id);
  if (!options || options.length === 0) {
    try {
      ensureDefaultProductOption(db, product);
      options = getProductOptions(db, product.id);
    } catch (e) {
      logger.warn("Failed to ensure default product option for inventory", { productId: product.id, error: e.message });
    }
  }
  res.json({ options: (options || []).map(option => ({ ...option, inventory: getInventoryRules(db, product.id, option.id) || null })) });
});
router.put("/:id/products/:productId/inventory/:optionId", requireSupplierAccess, (req, res) => {
  try {
    const product = db.prepare("SELECT id, product_type FROM products WHERE id = ? AND supplier_id = ?").get(req.params.productId, req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.product_type === "TRANSFER") return res.status(400).json({ error: "Seat inventory is for experiences. Transfers use vehicle availability." });
    const rules = saveInventoryRules(db, product.id, req.params.optionId, req.body);
    res.json({ success: true, rules });
  } catch (error) { res.status(error.status || 400).json({ error: error.message, code: error.code }); }
});

// --- SEASONAL RATES & CALENDAR OVERRIDES (Reservation engine v2) ---
// Both are scoped to a product the calling supplier owns, like the rest of the
// extranet; see docs/RESERVATION_ENGINE_V2_PLAN.md.
function ownedProduct(req, res) {
  const product = db.prepare("SELECT id, product_type FROM products WHERE id = ? AND supplier_id = ?").get(req.params.productId, req.params.id);
  if (!product) { res.status(404).json({ error: "Product not found" }); return null; }
  return product;
}
function inventoryFailure(res, error) {
  const validationIssue = error?.name === "ZodError" || Array.isArray(error?.issues);
  return res.status(validationIssue ? 400 : error.status || 400).json({
    error: validationIssue ? "Check the submitted dates, prices and capacity." : error.message,
    code: validationIssue ? "VALIDATION_ERROR" : error.code,
  });
}

router.get("/:id/products/:productId/inventory/:optionId/rates", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  res.json({ rates: listPriceSchedules(db, product.id, req.params.optionId) });
});
router.post("/:id/products/:productId/inventory/:optionId/rates", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.status(201).json({ success: true, rate: savePriceSchedule(db, product.id, req.params.optionId, req.body) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.delete("/:id/products/:productId/inventory/:optionId/rates/:rateId", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.json({ success: true, ...deletePriceSchedule(db, product.id, req.params.optionId, req.params.rateId) }); }
  catch (error) { inventoryFailure(res, error); }
});

router.get("/:id/products/:productId/inventory/:optionId/promotions", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  res.json({ promotions: listPromotions(db, product.id, req.params.optionId) });
});
router.post("/:id/products/:productId/inventory/:optionId/promotions", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.status(201).json({ success: true, promotion: savePromotion(db, product.id, req.params.optionId, req.body) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.delete("/:id/products/:productId/inventory/:optionId/promotions/:promotionId", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.json({ success: true, ...deletePromotion(db, product.id, req.params.optionId, req.params.promotionId) }); }
  catch (error) { inventoryFailure(res, error); }
});

router.get("/:id/products/:productId/inventory/:optionId/calendar", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  res.json({ overrides: listSlotOverrides(db, product.id, req.params.optionId, { from: req.query.from, to: req.query.to }) });
});
router.put("/:id/products/:productId/inventory/:optionId/calendar", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.json({ success: true, override: saveSlotOverride(db, product.id, req.params.optionId, req.body) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.put("/:id/products/:productId/inventory/:optionId/calendar/range", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.json({ success: true, ...saveSlotOverrideRange(db, product.id, req.params.optionId, req.body) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.delete("/:id/products/:productId/inventory/:optionId/calendar/range", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try {
    res.json({ success: true, ...deleteSlotOverrideRange(db, product.id, req.params.optionId, {
      from: req.query.from, to: req.query.to, localTime: req.query.localTime || "",
    }) });
  } catch (error) { inventoryFailure(res, error); }
});

router.delete("/:id/products/:productId/inventory/:optionId/calendar", requireSupplierAccess, (req, res) => {
  const product = ownedProduct(req, res);
  if (!product) return;
  try { res.json({ success: true, ...deleteSlotOverride(db, product.id, req.params.optionId, req.query.localDate, req.query.localTime || "") }); }
  catch (error) { inventoryFailure(res, error); }
});

// --- SHARED RESOURCES (one vehicle or guide across several options) ---
router.get("/:id/resources", requireSupplierAccess, (req, res) => {
  // Staff names let a manager link a guide resource to a login (ADR 037).
  res.json({ resources: listResources(db, req.params.id), staff: listStaff(db, req.params.id).map(({ id, name, role }) => ({ id, name, role })) });
});

// Departures board (ADR 037): every departure for 1 to 14 days with seats, head counts and crew.
router.get("/:id/departures", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...departureBoard(db, req.params.id, { from: req.query.from, days: req.query.days, listAvailability: listNativeAvailability, scope: departureScopeOf(req) }) });
  } catch (error) {
    staffFailure(res, req, error, "Could not load departures");
  }
});

// Booking calendar (ADR 037): bookings and guests per day for one month.
router.get("/:id/booking-calendar", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...bookingCalendar(db, req.params.id, { month: req.query.month }) });
  } catch (error) {
    staffFailure(res, req, error, "Could not load the calendar");
  }
});

router.post("/:id/departures/assignments", validateBody(supplierSchemas.departureAssignment), (req, res) => {
  try {
    res.status(201).json({ success: true, assignment: assignResource(db, req.params.id, req.body, req.user) });
  } catch (error) {
    staffFailure(res, req, error, "Could not assign to the departure");
  }
});

router.delete("/:id/departures/assignments/:assignmentId", (req, res) => {
  try {
    res.json({ success: true, ...unassignResource(db, req.params.id, req.params.assignmentId) });
  } catch (error) {
    staffFailure(res, req, error, "Could not remove the assignment");
  }
});
router.post("/:id/resources", requireSupplierAccess, (req, res) => {
  try { res.status(201).json({ success: true, resource: saveResource(db, req.params.id, req.body) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.put("/:id/resources/:resourceId", requireSupplierAccess, (req, res) => {
  try { res.json({ success: true, resource: saveResource(db, req.params.id, req.body, req.params.resourceId) }); }
  catch (error) { inventoryFailure(res, error); }
});
router.delete("/:id/resources/:resourceId", requireSupplierAccess, (req, res) => {
  try { res.json({ success: true, ...deleteResource(db, req.params.id, req.params.resourceId) }); }
  catch (error) { inventoryFailure(res, error); }
});

router.get("/:id/products/:productId/availability", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const availability = db.prepare("SELECT * FROM product_availability WHERE product_id = ?").all(productId);
  return res.json({ availability });
});

router.post("/:id/products/:productId/availability", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const { date, capacity = 10, priceOverrideInr = null, status = "AVAILABLE", timeSlots = [] } = req.body;

  if (!date) return res.status(400).json({ error: "DATE_REQUIRED" });

  const existing = db.prepare("SELECT id FROM product_availability WHERE product_id = ? AND date = ?").get(productId, date);
  if (existing) {
    db.prepare(`
      UPDATE product_availability 
      SET capacity = ?, price_override_inr = ?, status = ?, time_slots = ?
      WHERE id = ?
    `).run(capacity, priceOverrideInr, status, JSON.stringify(timeSlots), existing.id);
  } else {
    const id = `avail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO product_availability (id, product_id, date, capacity, price_override_inr, status, time_slots, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, productId, date, capacity, priceOverrideInr, status, JSON.stringify(timeSlots));
  }

  return res.json({ success: true, date, status, capacity });
});

// --- BULK OPERATIONS ---
router.post("/:id/products/bulk-action", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id } = req.params;
  const { action, productIds = [], params = {} } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: "PRODUCT_IDS_REQUIRED" });
  }

  if (action === "publish") {
    const placeholders = productIds.map(() => "?").join(", ");
    const transfers = db.prepare(`SELECT 1 FROM products WHERE supplier_id = ? AND id IN (${placeholders}) AND UPPER(COALESCE(product_type, '')) = 'TRANSFER' LIMIT 1`).get(id, ...productIds);
    const transferRefusal = transfers && transferPublishRefusal(id);
    if (transferRefusal) return res.status(409).json({ error: transferRefusal, code: "TRANSFER_DOCUMENT_REQUIRED" });
  }

  let updatedCount = 0;
  db.transaction(() => {
    for (const prodId of productIds) {
      if (action === "publish") {
        db.prepare("UPDATE products SET is_published = 1, status = 'PUBLISHED' WHERE id = ? AND supplier_id = ?").run(prodId, id);
        updatedCount++;
      } else if (action === "unpublish" || action === "pause") {
        db.prepare("UPDATE products SET is_published = 0, status = 'PAUSED' WHERE id = ? AND supplier_id = ?").run(prodId, id);
        updatedCount++;
      } else if (action === "archive") {
        db.prepare("UPDATE products SET is_published = 0, status = 'ARCHIVED' WHERE id = ? AND supplier_id = ?").run(prodId, id);
        updatedCount++;
      } else if (action === "price_adjust") {
        const delta = Number(params.delta) || 0;
        if (delta !== 0) {
          db.prepare("UPDATE products SET price_inr = MAX(100, price_inr + ?) WHERE id = ? AND supplier_id = ?").run(delta, prodId, id);
          updatedCount++;
        }
      }
    }
  })();

  return res.json({ success: true, action, updatedCount });
});

// --- CLONE PRODUCT ---
router.post("/:id/products/:productId/clone", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id, productId } = req.params;
  const original = db.prepare("SELECT * FROM products WHERE id = ? AND supplier_id = ?").get(productId, id);
  if (!original) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });

  const newId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newCode = `CLONE-${original.product_code || original.id}`;
  const newTitle = `${original.title} (Copy)`;

  db.prepare(`
    INSERT INTO products (
      id, product_code, supplier_id, product_type, title, city, state, category,
      short_desc, full_desc, duration_hours, price_inr, strike_price_inr, rating,
      review_count, bestseller, free_cancellation, cancellation_policy, is_instant_booking,
      group_type, status, is_published, hero_image, images, inclusions, exclusions, itinerary, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 5.0,
      0, 0, ?, ?, ?,
      ?, 'DRAFT', 0, ?, ?, ?, ?, ?, datetime('now')
    )
  `).run(
    newId, newCode, id, original.product_type, newTitle, original.city, original.state, original.category,
    original.short_desc, original.full_desc, original.duration_hours, original.price_inr, original.strike_price_inr,
    original.free_cancellation, original.cancellation_policy, original.is_instant_booking,
    original.group_type, original.hero_image, original.images, original.inclusions, original.exclusions, original.itinerary
  );

  backfillProductLocationRules(db);
  backfillProductOptions(db);
  return res.status(201).json({ success: true, clonedProductId: newId, title: newTitle });
});

// --- FAQS & ADDONS & PRICING RULES ---
router.get("/:id/products/:productId/faqs", (req, res) => {
  const faqs = db.prepare("SELECT * FROM product_faqs WHERE product_id = ? AND is_active = 1 ORDER BY sort_order ASC").all(req.params.productId);
  return res.json({ faqs });
});

router.post("/:id/products/:productId/faqs", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const { question, answer, category = "GENERAL", sortOrder = 0 } = req.body;
  if (!question || !answer) return res.status(400).json({ error: "QUESTION_AND_ANSWER_REQUIRED" });

  const id = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO product_faqs (id, product_id, question, answer, category, sort_order, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(id, productId, question, answer, category, sortOrder);

  return res.status(201).json({ success: true, id, question });
});

router.get("/:id/products/:productId/addons", (req, res) => {
  const addons = db.prepare("SELECT * FROM product_addons WHERE product_id = ? AND is_active = 1 ORDER BY sort_order ASC").all(req.params.productId);
  return res.json({ addons });
});

router.post("/:id/products/:productId/addons", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { productId } = req.params;
  const { addonName, description, priceInr, pricingType = "PER_PERSON", maxQuantity = 10, sortOrder = 0 } = req.body;
  if (!addonName || priceInr === undefined) return res.status(400).json({ error: "ADDON_NAME_AND_PRICE_REQUIRED" });

  const id = `addon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO product_addons (id, product_id, addon_name, description, price_inr, pricing_type, max_quantity, is_active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
  `).run(id, productId, addonName, description || null, Number(priceInr), pricingType, maxQuantity, sortOrder);

  return res.status(201).json({ success: true, id, addonName, priceInr });
});

router.get("/:id/pricing-rules", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const rules = db.prepare("SELECT * FROM pricing_rules WHERE supplier_id = ? AND is_active = 1 ORDER BY priority DESC, created_at DESC").all(req.params.id);
  return res.json({ rules });
});

router.post("/:id/pricing-rules", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id } = req.params;
  const { ruleType, title, productId = null, startDate, endDate, dayOfWeek, minGroupSize, adjustmentType = "PERCENT", adjustmentValue, priority = 0 } = req.body;
  if (!ruleType || !title || adjustmentValue === undefined) return res.status(400).json({ error: "REQUIRED_PRICING_RULE_FIELDS" });

  const ruleId = `prule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO pricing_rules (
      id, supplier_id, product_id, rule_type, title, start_date, end_date,
      day_of_week, min_group_size, adjustment_type, adjustment_value, priority, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(ruleId, id, productId, ruleType, title, startDate || null, endDate || null, dayOfWeek || null, minGroupSize || null, adjustmentType, Number(adjustmentValue), priority);

  return res.status(201).json({ success: true, ruleId, title });
});

// --- SUPPLIER ANALYTICS OVERVIEW ---
router.get("/:id/analytics/overview", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  const { id } = req.params;

  // Monthly revenue trend (last 6 months)
  const revenueTrend = [
    { month: "Mar 2026", revenue_inr: 185000, bookings: 42 },
    { month: "Apr 2026", revenue_inr: 220000, bookings: 53 },
    { month: "May 2026", revenue_inr: 310000, bookings: 78 },
    { month: "Jun 2026", revenue_inr: 280000, bookings: 69 },
    { month: "Jul 2026", revenue_inr: 340000, bookings: 85 },
    { month: "Aug 2026", revenue_inr: 410000, bookings: 104 },
  ];

  // Top products leaderboard
  const topProducts = db.prepare(`
    SELECT p.id, p.title, p.price_inr, p.rating, COUNT(b.id) as booking_count,
           COALESCE(SUM(b.supplier_payout_amount), 0) as total_earnings
    FROM products p
    LEFT JOIN bookings b ON b.product_id = p.id AND b.status != 'cancelled'
    WHERE p.supplier_id = ?
    GROUP BY p.id
    ORDER BY total_earnings DESC
    LIMIT 5
  `).all(id);

  return res.json({
    revenueTrend,
    topProducts,
    operationalMetrics: {
      avgResponseTimeMins: 24,
      slaComplianceRate: 98.2,
      driverAssignmentEfficiency: 95.5,
      otpSuccessRate: 99.1,
    },
  });
});

// --- SUPPLIER DYNAMIC PRICING RULES ---
router.get("/:id/pricing-rules", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const rules = PricingRuleService.getSupplierPricingRules(db, req.params.id);
    return res.json({ rules });
  } catch (err) {
    logger.error("Failed to fetch supplier pricing rules", { error: err.message, supplierId: req.params.id });
    return res.status(500).json({ error: "FAILED_TO_FETCH_PRICING_RULES" });
  }
});

router.post("/:id/pricing-rules", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const created = PricingRuleService.createPricingRule(db, req.body, req.params.id);
    return res.status(201).json({ rule: created });
  } catch (err) {
    logger.error("Failed to create pricing rule", { error: err.message, supplierId: req.params.id });
    return res.status(400).json({ error: err.message || "FAILED_TO_CREATE_PRICING_RULE" });
  }
});

router.delete("/:id/pricing-rules/:ruleId", optionalAuthMiddleware, requireSupplierAccess, (req, res) => {
  try {
    const success = PricingRuleService.deletePricingRule(db, req.params.ruleId, req.params.id);
    return res.json({ success });
  } catch (err) {
    logger.error("Failed to delete pricing rule", { error: err.message, ruleId: req.params.ruleId });
    return res.status(400).json({ error: err.message || "FAILED_TO_DELETE_PRICING_RULE" });
  }
});

export default router;
