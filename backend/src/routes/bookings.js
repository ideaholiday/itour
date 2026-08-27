import { Router } from "express";
import { nanoid } from "nanoid";
import db, { databaseInfo } from "../db.js";
import { authenticate, optionalAuthMiddleware, requireBookingOwner, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { bookingCreateSchema, bookingQuoteSchema, bookingSchemas } from "../validators/apiSchemas.js";
import logger from "../config/logger.js";
import {
  MAX_OTP_ATTEMPTS,
  activatePickupOtp,
  calculateBookingQuote,
  canTransitionBooking,
  decryptPickupOtp,
  pickupOtpMatches,
  publicQuote
} from "../services/bookingService.js";
import { assignmentReason, findAutomaticSupplierAssignment } from "../services/supplierAssignmentService.js";
import { getDispatchTimeline, updateDispatchStatus } from "../services/driverDispatchService.js";
import { guestDocumentLinks, logGuestDocumentAccess, renderGuestDocument, verifyGuestDocumentToken } from "../services/guestDocumentService.js";
import { guestNotificationPreferences, notifyBookingLogisticsEvent, notifyDispatchStatusChanged, queueNotification, sendGuestBookingNotification } from "../services/notificationService.js";
import { assertBookingLocations } from "../services/locationValidationService.js";
import { bookingLogistics, buildLogisticsSnapshot, consumeBookingHold, createBookingHold, expireBookingHolds, getBookingQuestions, getOption, getProductOptions, persistBookingLogistics, validateOptionLogistics, validateQuestionAnswers } from "../services/logisticsService.js";

const router = Router();
router.use(optionalAuthMiddleware);

const STAFF_ROLES = new Set(["ADMIN", "STAFF", "SUPPLIER"]);

function requester(req) {
  return req.user || null;
}

function ownsBooking(actor, booking) {
  if (!actor) return false;
  const role = String(actor.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return true;
  if (role !== "TRAVELER") return false;
  return actor.id === booking.user_id || (actor.email && actor.email.toLowerCase() === String(booking.traveler_email || "").toLowerCase());
}

function canOperateBooking(actor, booking) {
  if (!actor) return false;
  const role = String(actor.role || "").toUpperCase();
  if (["ADMIN", "STAFF"].includes(role)) return true;
  return role === "SUPPLIER" && actor.supplier_id && actor.supplier_id === booking.supplier_id;
}

function travelerView(booking) {
  const { otp_hash, otp_encrypted, ...safeBooking } = booking;
  const pickupOtp = booking.payment_status === "PAID" && !booking.otp_verified_at
    ? decryptPickupOtp(booking.otp_encrypted) || booking.otp_code || null
    : null;
  delete safeBooking.otp_code;
  return { ...safeBooking, pickupOtp };
}

function validateContact({ traveler_name, traveler_phone, traveler_email, pickup_location }) {
  if (!traveler_name?.trim() || !traveler_phone?.trim() || !traveler_email?.trim() || !pickup_location?.trim()) {
    const error = new Error("Traveler name, phone, email and pickup location are required");
    error.status = 400;
    throw error;
  }
  if (!/^\+?[0-9][0-9\s-]{7,17}$/.test(traveler_phone.trim())) {
    const error = new Error("Enter a valid mobile or WhatsApp number");
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(traveler_email.trim())) {
    const error = new Error("Enter a valid email address");
    error.status = 400;
    throw error;
  }
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateTransferRoute(body, product) {
  if (product.product_type !== "TRANSFER") return;
  if (!body.pickup_location?.trim()) {
    const error = new Error("Enter a pickup location for this transfer");
    error.status = 400;
    throw error;
  }
  if (!body.drop_location?.trim()) {
    const error = new Error("Enter your destination hotel, resort, or drop-off address");
    error.status = 400;
    throw error;
  }
}

router.post("/quote", validateBody(bookingQuoteSchema), (req, res) => {
  try {
    const productId = req.body.product_id || req.body.activity_id;
    const option = validateOptionLogistics(db, productId, req.body);
    const answers = validateQuestionAnswers(db, option?.id, req.body.booking_question_answers || {}, req.body);
    assertBookingLocations(db, req.body, { requireOperationalDetails: false, deferLocationValidation: true });
    const quote = calculateBookingQuote(db, req.body);
    res.json({ success: true, quote: { ...publicQuote(quote), option: option || null, bookingQuestions: option ? getBookingQuestions(db, option.id) : [], normalizedAnswers: answers } });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || "Could not price this booking",
      code: error.code,
      detail: error.detail,
      requestId: req.requestId,
    });
  }
});

router.post("/hold", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(bookingQuoteSchema), (req, res) => {
  try {
    expireBookingHolds(db);
    const productId = req.body.product_id || req.body.activity_id;
    const option = validateOptionLogistics(db, productId, req.body);
    const answers = validateQuestionAnswers(db, option?.id, req.body.booking_question_answers || {}, req.body);
    const locationValidation = assertBookingLocations(db, req.body, { requireOperationalDetails: false });
    const quote = calculateBookingQuote(db, req.body);
    const logistics = buildLogisticsSnapshot(req.body, option, locationValidation);
    const hold = createBookingHold(db, { productId, optionId: option?.id || null, activityDate: quote.activityDate, adults: quote.adults, children: quote.children, amount: quote.totalAmount, quote: publicQuote(quote), logistics: { ...logistics, answers }, clientRequestId: req.body.client_request_id || req.headers["idempotency-key"] || null });
    res.status(201).json({ success: true, holdId: hold.id, expiresAt: hold.expires_at, quote: publicQuote(quote), option: option || null, logistics, bookingQuestions: option ? getBookingQuestions(db, option.id) : [] });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not hold this booking", code: error.code, requestId: req.requestId });
  }
});

router.post("/", authenticate, requireRoles("TRAVELER", "ADMIN", "STAFF"), validateBody(bookingCreateSchema), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor?.id && !actor?.email) return res.status(401).json({ error: "Sign in before booking" });
    validateContact(req.body);
    const clientRequestId = String(req.body.client_request_id || req.headers["idempotency-key"] || "").trim() || null;
    if (clientRequestId) {
      const existing = db.prepare("SELECT * FROM bookings WHERE client_request_id = ?").get(clientRequestId);
      if (existing) {
        if (!ownsBooking(actor, existing)) return res.status(409).json({ error: "This booking request is already in use" });
        return res.json({ success: true, idempotent: true, bookingId: existing.id, ref: existing.ref, supplierId: existing.supplier_id, assignmentStatus: existing.supplier_assignment_status, amount_inr: existing.amount_inr, status: existing.status, payment_status: existing.payment_status });
      }
    }
    const locationValidation = assertBookingLocations(db, req.body, { requireOperationalDetails: true });
    const quote = calculateBookingQuote(db, req.body, { enforceListingSupplierAvailability: false });
    const selectedOption = validateOptionLogistics(db, quote.product.id, req.body);
    const normalizedAnswers = validateQuestionAnswers(db, selectedOption?.id, req.body.booking_question_answers || {}, req.body);
    const logisticsSnapshot = buildLogisticsSnapshot(req.body, selectedOption, locationValidation);
    validateTransferRoute(req.body, quote.product);

    // Guard: block booking if the listing supplier is not KYB-approved
    const listingSupplier = db.prepare("SELECT kyb_status, company_name FROM suppliers WHERE id = ?").get(quote.product.supplier_id);
    if (!listingSupplier || listingSupplier.kyb_status !== "APPROVED") {
      const kybError = new Error("This listing is temporarily unavailable — the operator is pending our verification. Please check back soon or contact support.");
      kybError.status = 403;
      kybError.code = "SUPPLIER_NOT_APPROVED";
      throw kybError;
    }
    const assignment = findAutomaticSupplierAssignment(db, { quote, input: req.body });
    if (!assignment.selected) {
      const assignmentError = new Error("No approved supplier currently matches the pickup, vehicle, fare and travel date. Please change the option or contact support.");
      assignmentError.status = 409;
      assignmentError.assignment = {
        status: "NO_ELIGIBLE_SUPPLIER",
        candidatesChecked: assignment.candidates.length,
        reasons: [...new Set(assignment.candidates.flatMap((candidate) => candidate.rejectionReasons))].slice(0, 5),
      };
      throw assignmentError;
    }
    const selectedSupplier = assignment.selected;
    const assignmentCommissionAmount = Math.round(quote.totalAmount * selectedSupplier.commissionRate / 100);
    const assignmentSupplierPayout = quote.totalAmount - assignmentCommissionAmount;
    const selectedAssignmentReason = assignmentReason(selectedSupplier);
    const requestedUserId = actor.id || `ext_${nanoid(12)}`;
    const existingUser = db.prepare("SELECT id FROM users WHERE id = ? OR LOWER(email) = LOWER(?)").get(requestedUserId, req.body.traveler_email.trim());
    const userId = existingUser?.id || requestedUserId;
    const bookingId = `bk_${nanoid(12)}`;
    const ref = `IH-${nanoid(7).toUpperCase()}`;

    db.transaction(() => {
      if (!existingUser) {
        db.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, 'TRAVELER')")
          .run(userId, req.body.traveler_name.trim(), req.body.traveler_email.trim().toLowerCase(), `external_${nanoid(20)}`, req.body.traveler_phone.trim());
      }
      db.prepare(
        `INSERT INTO bookings (
          id, ref, client_request_id, user_id, product_id, supplier_id, product_code, supplier_code, product_type, variant_name,
          activity_date, pickup_time, pickup_type, pickup_location, pickup_instructions, drop_location, drop_instructions,
          pickup_lat, pickup_lng, drop_lat, drop_lng, flight_number, flight_arrival_time, terminal_gate,
          special_requests, promo_code, selected_addons, adults, children, luggage_bags, vehicle_category,
          traveler_name, traveler_phone, traveler_email, amount_inr, tolls_and_tax_amount,
          commission_amount, commission_rate_snapshot, supplier_payout_amount, payment_method, payment_status, status,
          supplier_assignment_status, supplier_assignment_method, supplier_assignment_score, supplier_assignment_reason, assigned_supplier_product_id, supplier_assigned_at, otp_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'pending_payment', 'RESERVED_PENDING_PAYMENT', 'RULE_ENGINE_V1', ?, ?, ?, datetime('now'), NULL)`
      ).run(
        bookingId, ref, clientRequestId, userId, quote.product.id, selectedSupplier.supplierId,
        quote.product.product_code || quote.product.id, quote.product.supplier_code || selectedSupplier.supplierId,
        quote.product.product_type, quote.variantName, quote.activityDate, req.body.pickup_time || "09:00",
        String(req.body.pickup_type || "HOTEL").toUpperCase(), req.body.pickup_location.trim(), req.body.pickup_instructions || null,
        req.body.drop_location || null, req.body.drop_instructions || null,
        nullableNumber(req.body.pickup_lat),
        nullableNumber(req.body.pickup_lng),
        nullableNumber(req.body.drop_lat),
        nullableNumber(req.body.drop_lng),
        req.body.flight_number || null, req.body.flight_arrival_time || null, req.body.terminal_gate || null,
        req.body.special_requests || null, req.body.promo_code || null,
        req.body.selected_addons ? (typeof req.body.selected_addons === "string" ? req.body.selected_addons : JSON.stringify(req.body.selected_addons)) : "[]",
        quote.adults, quote.children, quote.luggage,
        quote.vehicleCategory, req.body.traveler_name.trim(), req.body.traveler_phone.trim(), req.body.traveler_email.trim().toLowerCase(),
        quote.totalAmount, quote.tolls + quote.stateTax + quote.gstAmount, assignmentCommissionAmount, selectedSupplier.commissionRate,
        assignmentSupplierPayout, String(req.body.payment_method || "DEMO").toUpperCase(),
        selectedSupplier.score, selectedAssignmentReason, selectedSupplier.candidateProductId
      );
      db.prepare(`
        UPDATE bookings
        SET flight_departure_time = ?, location_validation_snapshot = ?, location_ops_review = ?
        WHERE id = ?
      `).run(
        req.body.flight_departure_time || null,
        JSON.stringify(locationValidation),
        locationValidation.needsOpsReview ? 1 : 0,
        bookingId,
      );
      db.prepare("UPDATE bookings SET product_option_id = ?, confirmation_type = ?, confirmation_status = 'PENDING_PAYMENT', logistics_snapshot = ? WHERE id = ?").run(selectedOption?.id || null, selectedOption?.confirmationType || "INSTANT_THEN_MANUAL", JSON.stringify(logisticsSnapshot), bookingId);
      persistBookingLogistics(db, bookingId, logisticsSnapshot, normalizedAnswers, actor.id || null);
      if (req.body.hold_id) consumeBookingHold(db, req.body.hold_id, bookingId);
      else createBookingHold(db, { bookingId, productId: quote.product.id, optionId: selectedOption?.id || null, activityDate: quote.activityDate, adults: quote.adults, children: quote.children, amount: quote.totalAmount, quote: publicQuote(quote), logistics: logisticsSnapshot, clientRequestId: clientRequestId ? `${clientRequestId}:hold` : null });
      db.prepare(
        `INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT')`
      ).run(`pay_${nanoid(12)}`, selectedSupplier.supplierId, bookingId, quote.totalAmount, assignmentCommissionAmount, assignmentSupplierPayout);
      const insertAttempt = db.prepare(`
        INSERT INTO supplier_assignment_attempts (
          id, booking_id, supplier_id, candidate_product_id, coverage_zone_id, decision,
          score, candidate_price, vehicle_category, assignment_round, response_status, rejection_reasons, score_breakdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `);
      for (const candidate of assignment.candidates) {
        const isSelected = candidate.supplierId === selectedSupplier.supplierId
          && candidate.candidateProductId === selectedSupplier.candidateProductId;
        insertAttempt.run(
          `asa_${nanoid(12)}`,
          bookingId,
          candidate.supplierId,
          candidate.candidateProductId,
          candidate.coverage?.fence?.id || null,
          isSelected ? "SELECTED" : candidate.eligible ? "ELIGIBLE_NOT_SELECTED" : "REJECTED",
          candidate.score,
          candidate.candidatePrice,
          candidate.vehicleCategory,
          isSelected ? "NOT_STARTED" : "NOT_SELECTED",
          JSON.stringify(candidate.rejectionReasons),
          JSON.stringify(candidate.scoreBreakdown),
        );
      }
    })();

    const bookingHold = (() => { try { return db.prepare("SELECT id, status, expires_at FROM booking_holds WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1").get(bookingId); } catch { return null; } })();
    res.status(201).json({
      success: true,
      bookingId,
      ref,
      supplierId: selectedSupplier.supplierId,
      amount_inr: quote.totalAmount,
      quote: {
        ...publicQuote(quote),
        supplierId: selectedSupplier.supplierId,
        listingSupplierId: quote.product.supplier_id,
      },
      assignment: {
        status: "RESERVED_PENDING_PAYMENT",
        supplierId: selectedSupplier.supplierId,
        supplierName: selectedSupplier.supplierName,
        score: selectedSupplier.score,
        candidatesChecked: assignment.candidates.length,
        reason: selectedAssignmentReason,
      },
      status: "pending_payment",
      payment_status: "PENDING",
      hold: bookingHold,
      holdExpiresAt: bookingHold?.expires_at || null,
      message: "Booking held and an eligible supplier was reserved. Complete payment to confirm it.",
    });
  } catch (error) {
    logger.error("Booking creation failed", { requestId: req.requestId, error });
    const duplicate = error.code === "SQLITE_CONSTRAINT_UNIQUE";
    res.status(duplicate ? 409 : error.status || 500).json({
      error: duplicate ? "This booking request was already submitted" : error.message || "Failed to create booking",
      code: duplicate ? "DUPLICATE_REQUEST" : (error.code || undefined),
      ...(error.detail ? { detail: error.detail } : {}),
      requestId: req.requestId,
      ...(error.assignment ? { assignment: error.assignment } : {})
    });
  }
});

router.get("/", authenticate, (req, res) => {
  try {
    const actor = requester(req);
    if (!actor?.id && !actor?.email) return res.status(401).json({ error: "Sign in to view your trips" });
    const rows = db.prepare(
      `SELECT b.*, p.title as product_title, p.hero_image, p.city, p.state, p.product_type, s.company_name as supplier_name,
        da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number, da.assignment_status,
        da.en_route_at, da.arrived_at, da.trip_started_at, da.completed_at,
        r.id AS review_id, r.status AS review_status
       FROM bookings b LEFT JOIN products p ON b.product_id = p.id LEFT JOIN suppliers s ON b.supplier_id = s.id
       LEFT JOIN driver_assignments da ON da.booking_id = b.id
       LEFT JOIN reviews r ON r.booking_id = b.id
       WHERE b.user_id = ? OR (? != '' AND LOWER(b.traveler_email) = LOWER(?)) ORDER BY b.created_at DESC`
    ).all(actor.id || "", actor.email || "", actor.email || "");
    res.json(rows.map(travelerView));
  } catch {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

router.get("/notification-preferences", authenticate, (req, res) => {
  const actor = requester(req);
  if (!actor?.id) return res.status(401).json({ error: "Sign in to manage notifications" });
  return res.json({ success: true, preferences: guestNotificationPreferences(db, actor.id) });
});

router.patch("/notification-preferences", authenticate, validateBody(bookingSchemas.notificationPreferences), (req, res) => {
  const actor = requester(req);
  if (!actor?.id) return res.status(401).json({ error: "Sign in to manage notifications" });
  const emailEnabled = req.body.emailEnabled;
  const whatsappEnabled = req.body.whatsappEnabled;
  if (typeof emailEnabled !== "boolean" || typeof whatsappEnabled !== "boolean") return res.status(400).json({ error: "Email and WhatsApp preferences are required" });
  if (!emailEnabled && !whatsappEnabled) return res.status(400).json({ error: "Keep at least one booking notification channel enabled" });
  db.prepare(`
    INSERT INTO notification_preferences (user_id, email_enabled, whatsapp_enabled, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET email_enabled = excluded.email_enabled,
      whatsapp_enabled = excluded.whatsapp_enabled, updated_at = datetime('now')
  `).run(actor.id, emailEnabled ? 1 : 0, whatsappEnabled ? 1 : 0);
  return res.json({ success: true, preferences: { emailEnabled, whatsappEnabled } });
});

router.get("/notifications", authenticate, (req, res) => {
  const actor = requester(req);
  if (!actor?.id && !actor?.email) return res.status(401).json({ error: "Sign in to view notifications" });
  const deliveries = db.prepare(`
    SELECT id, event_type, channel, status, subject, booking_id, booking_ref,
      error_message, attempt_count, created_at, sent_at, updated_at
    FROM notification_deliveries
    WHERE recipient_role = 'TRAVELER'
      AND (recipient_id = ? OR (? != '' AND LOWER(recipient_address) = LOWER(?)))
    ORDER BY created_at DESC LIMIT 100
  `).all(actor.id || "", actor.email || "", actor.email || "");
  return res.json({ success: true, deliveries });
});

function loadOwnedBooking(req) {
  const actor = requester(req);
  const booking = db.prepare("SELECT b.*, p.title AS product_title FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.ref = ? OR b.id = ?").get(req.params.ref, req.params.ref);
  if (!booking) { const e = new Error("Booking not found"); e.status = 404; throw e; }
  if (!ownsBooking(actor, booking)) { const e = new Error("You do not have access to this booking"); e.status = 403; throw e; }
  return booking;
}

router.get("/:ref/status", authenticate, (req, res) => {
  try {
    const booking = loadOwnedBooking(req);
    const logistics = bookingLogistics(db, booking.id);
    const hold = db.prepare("SELECT id, status, expires_at FROM booking_holds WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1").get(booking.id);
    res.json({ success: true, ref: booking.ref, status: booking.status, paymentStatus: booking.payment_status, confirmationStatus: booking.confirmation_status || booking.status, confirmationType: booking.confirmation_type || "INSTANT_THEN_MANUAL", supplierResponseStatus: booking.supplier_response_status, supplierResponseDeadline: booking.supplier_response_deadline, hold: hold || null, logistics });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Failed to load booking status" }); }
});

router.get("/:ref/logistics", authenticate, (req, res) => {
  try { const booking = loadOwnedBooking(req); return res.json({ success: true, bookingRef: booking.ref, logistics: bookingLogistics(db, booking.id) }); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message || "Failed to load booking logistics" }); }
});

function amendmentCutoff(booking) {
  const at = new Date(`${booking.activity_date}T${booking.pickup_time || "09:00"}:00`).getTime() - 4 * 60 * 60 * 1000;
  return new Date(at).toISOString();
}

router.post("/:ref/amendment/check", authenticate, validateBody(bookingSchemas.amendment), (req, res) => {
  try {
    const booking = loadOwnedBooking(req);
    const cutoffAt = amendmentCutoff(booking);
    if (Date.now() >= new Date(cutoffAt).getTime()) return res.status(409).json({ error: "This booking is inside the logistics amendment cutoff", cutoffAt });
    const proposed = { ...booking, ...req.body.proposed, product_id: booking.product_id, activity_date: booking.activity_date };
    const option = validateOptionLogistics(db, booking.product_id, proposed);
    const validation = assertBookingLocations(db, proposed, { requireOperationalDetails: false });
    const quote = calculateBookingQuote(db, proposed, { enforceListingSupplierAvailability: false });
    const snapshot = buildLogisticsSnapshot(proposed, option, validation);
    res.json({ success: true, amendable: true, cutoffAt, quote: publicQuote(quote), proposedSnapshot: snapshot });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Amendment cannot be applied", code: error.code }); }
});

router.post("/:ref/amendment/quote", authenticate, validateBody(bookingSchemas.amendment), (req, res) => {
  try {
    const booking = loadOwnedBooking(req);
    const proposed = { ...booking, ...req.body.proposed, product_id: booking.product_id, activity_date: booking.activity_date };
    const option = validateOptionLogistics(db, booking.product_id, proposed);
    const validation = assertBookingLocations(db, proposed, { requireOperationalDetails: false });
    const quote = calculateBookingQuote(db, proposed, { enforceListingSupplierAvailability: false });
    res.json({ success: true, cutoffAt: amendmentCutoff(booking), deltaInr: Number(quote.totalAmount) - Number(booking.amount_inr), quote: publicQuote(quote), proposedSnapshot: buildLogisticsSnapshot(proposed, option, validation) });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Could not quote amendment" }); }
});

router.post("/:ref/amendment/apply", authenticate, validateBody(bookingSchemas.amendment), (req, res) => {
  try {
    const booking = loadOwnedBooking(req);
    const cutoffAt = amendmentCutoff(booking);
    if (Date.now() >= new Date(cutoffAt).getTime()) return res.status(409).json({ error: "This booking is inside the logistics amendment cutoff", cutoffAt });
    const existing = db.prepare("SELECT * FROM booking_amendment_requests WHERE booking_id = ? AND idempotency_key = ?").get(booking.id, req.body.idempotencyKey);
    if (existing) return res.json({ success: true, idempotent: true, amendment: existing });
    const proposed = { ...booking, ...req.body.proposed, product_id: booking.product_id, activity_date: booking.activity_date };
    const option = validateOptionLogistics(db, booking.product_id, proposed);
    const validation = assertBookingLocations(db, proposed, { requireOperationalDetails: false });
    const quote = calculateBookingQuote(db, proposed, { enforceListingSupplierAvailability: false });
    const snapshot = buildLogisticsSnapshot(proposed, option, validation);
    const amendmentId = `amend_${nanoid(12)}`;
    db.transaction(() => {
      db.prepare(`INSERT INTO booking_amendment_requests (id, booking_id, idempotency_key, amendment_type, current_snapshot, proposed_snapshot, quoted_delta_inr, cutoff_at, status, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED', ?)`).run(amendmentId, booking.id, req.body.idempotencyKey, req.body.amendmentType, booking.logistics_snapshot || "{}", JSON.stringify(snapshot), Number(quote.totalAmount) - Number(booking.amount_inr), cutoffAt, req.body.reason || null);
      db.prepare(`UPDATE bookings SET pickup_type = ?, pickup_location = ?, pickup_lat = ?, pickup_lng = ?, drop_location = ?, drop_lat = ?, drop_lng = ?, amount_inr = ?, logistics_snapshot = ?, location_ops_review = ? WHERE id = ?`).run(
        snapshot.pickupType, snapshot.pickupLocation || booking.pickup_location, snapshot.pickupLat, snapshot.pickupLng, snapshot.dropLocation || booking.drop_location, snapshot.dropLat, snapshot.dropLng, quote.totalAmount, JSON.stringify(snapshot), snapshot.needsOpsReview ? 1 : 0, booking.id);
      persistBookingLogistics(db, booking.id, snapshot, {}, req.user?.id || null);
    })();
    queueNotification(notifyBookingLogisticsEvent(db, booking.id, "PICKUP_DETAILS_UPDATED"), "Booking logistics amendment notification");
    res.json({ success: true, amendmentId, status: "APPLIED", cutoffAt, quote: publicQuote(quote), logistics: snapshot });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || "Could not apply amendment", code: error.code }); }
});

router.post("/:ref/pickup-otp/reset", authenticate, requireRoles("ADMIN", "STAFF"), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !["ADMIN", "STAFF"].includes(String(actor.role || "").toUpperCase())) return res.status(403).json({ error: "Operations access required" });
    const booking = db.prepare("SELECT * FROM bookings WHERE ref = ? OR id = ?").get(req.params.ref, req.params.ref);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.payment_status !== "PAID" || ["completed", "cancelled"].includes(String(booking.status).toLowerCase())) return res.status(409).json({ error: "A pickup code cannot be reset for this booking" });
    const pickupOtp = activatePickupOtp(booking);
    db.prepare(
      `UPDATE bookings SET otp_code = NULL, otp_hash = ?, otp_encrypted = ?, otp_expires_at = ?,
       otp_attempts = 0, otp_verified_at = NULL WHERE id = ?`
    ).run(pickupOtp.otpHash, pickupOtp.otpEncrypted, pickupOtp.otpExpiresAt, booking.id);
    res.json({ success: true, bookingRef: booking.ref, message: "A new traveler-only pickup code is available in My Trips" });
  } catch {
    res.status(500).json({ error: "Failed to reset pickup code" });
  }
});

router.post("/:ref/pickup-otp/verify", authenticate, requireRoles("ADMIN", "STAFF", "SUPPLIER"), requireBookingOwner({ allowSupplier: true }), validateBody(bookingSchemas.otp), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !STAFF_ROLES.has(String(actor.role || "").toUpperCase())) return res.status(403).json({ error: "Only the assigned operator or operations team can verify pickup" });
    const booking = db.prepare("SELECT * FROM bookings WHERE ref = ? OR id = ?").get(req.params.ref, req.params.ref);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!canOperateBooking(actor, booking)) return res.status(403).json({ error: "This booking belongs to another operator" });
    if (booking.payment_status !== "PAID") return res.status(409).json({ error: "Payment must be confirmed before pickup" });
    if (booking.otp_verified_at) return res.json({ success: true, alreadyVerified: true, status: "in_progress" });
    if (!["confirmed", "driver_assigned"].includes(String(booking.status).toLowerCase())) return res.status(409).json({ error: "Pickup verification is not available for this booking status" });
    if (!db.prepare("SELECT id FROM driver_assignments WHERE booking_id = ?").get(booking.id)) return res.status(409).json({ error: "Assign a driver before verifying pickup" });
    if (Number(booking.otp_attempts || 0) >= MAX_OTP_ATTEMPTS) return res.status(429).json({ error: "Pickup code is locked. Contact operations to reset it" });
    if (!booking.otp_hash || !booking.otp_expires_at || new Date(booking.otp_expires_at).getTime() < Date.now()) return res.status(410).json({ error: "Pickup code has expired. Contact operations for a new code" });
    if (!pickupOtpMatches(booking.id, req.body.otp, booking.otp_hash)) {
      const attempts = Number(booking.otp_attempts || 0) + 1;
      db.prepare("UPDATE bookings SET otp_attempts = ? WHERE id = ?").run(attempts, booking.id);
      const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - attempts);
      return res.status(remainingAttempts ? 400 : 429).json({ error: remainingAttempts ? `Incorrect pickup code. ${remainingAttempts} attempts remaining` : "Pickup code locked. Contact operations", remainingAttempts });
    }
    db.transaction(() => {
      db.prepare("UPDATE bookings SET otp_verified_at = datetime('now'), otp_attempts = otp_attempts + 1, status = 'in_progress' WHERE id = ?").run(booking.id);
      updateDispatchStatus(db, { supplierId: booking.supplier_id, bookingId: booking.id, nextStatus: "TRIP_STARTED", actorId: actor.id, allowTripStart: true });
    })();
    queueNotification(notifyDispatchStatusChanged(db, booking.id), "Trip started notification");
    res.json({ success: true, bookingRef: booking.ref, status: "in_progress", message: "Pickup verified. Trip started." });
  } catch {
    res.status(500).json({ error: "Failed to verify pickup code" });
  }
});

router.patch("/:id/status", authenticate, requireRoles("ADMIN", "STAFF"), validateBody(bookingSchemas.status), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor || !["ADMIN", "STAFF"].includes(String(actor.role || "").toUpperCase())) return res.status(403).json({ error: "Operations access required" });
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(req.params.id, req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const nextStatus = String(req.body.status || "").toLowerCase();
    if (!canTransitionBooking(booking.status, nextStatus)) return res.status(409).json({ error: `Cannot move booking from ${booking.status} to ${nextStatus}` });
    db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(nextStatus, booking.id);
    res.json({ success: true, status: nextStatus });
  } catch {
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

function bookingDocumentRecord(ref) {
  return db.prepare(`
    SELECT b.*, p.title AS product_title, s.company_name AS supplier_name, s.phone AS supplier_phone,
      da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.ref = ? OR b.id = ?
  `).get(ref, ref);
}

function requestOrigin(req) {
  const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  if (origin) return origin;
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").trim().split(",")[0];
  if (!host) return null;
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").trim().split(",")[0] || "https";
  return `${proto}://${host}`;
}

router.get("/:ref/documents", authenticate, requireBookingOwner(), (req, res) => {
  const actor = requester(req);
  if (!actor) return res.status(401).json({ error: "Sign in to view booking documents" });
  const booking = bookingDocumentRecord(req.params.ref);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!ownsBooking(actor, booking)) return res.status(403).json({ error: "You do not have access to these documents" });
  return res.json({ success: true, documents: guestDocumentLinks(booking, { baseUrl: requestOrigin(req) || undefined }) });
});

router.get("/:ref/documents/:type", (req, res) => {
  try {
    const booking = bookingDocumentRecord(req.params.ref);
    if (!booking) return res.status(404).send("Booking not found");
    const documentType = String(req.params.type || "").toUpperCase();
    const actor = requester(req);
    const accountAccess = ownsBooking(actor, booking);
    const linkAccess = verifyGuestDocumentToken(req.query.token, { bookingId: booking.id, bookingRef: booking.ref, documentType });
    if (!accountAccess && !linkAccess) return res.status(403).send("This secure document link is invalid or has expired");
    const html = renderGuestDocument(documentType, booking);
    logGuestDocumentAccess(db, {
      bookingId: booking.id,
      documentType,
      accessedBy: accountAccess ? actor?.id : null,
      accessMethod: accountAccess ? "ACCOUNT" : "SIGNED_LINK",
    });
    const filename = `Idea-Holiday-${documentType.toLowerCase()}-${booking.ref}.html`;
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${filename}"`);
    return res.send(html);
  } catch (error) {
    return res.status(error.status || 500).send(error.message || "Document could not be generated");
  }
});

router.post("/:ref/notifications/resend", authenticate, requireBookingOwner(), validateBody(bookingSchemas.resend), async (req, res) => {
  try {
    const actor = requester(req);
    if (!actor) return res.status(401).json({ error: "Sign in to resend booking information" });
    const booking = bookingDocumentRecord(req.params.ref);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (!ownsBooking(actor, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    const eventType = String(req.body.eventType || "DOCUMENTS").toUpperCase();
    const cooldownPredicate = databaseInfo.engine === "postgres"
      ? "created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'"
      : "created_at >= datetime('now', '-60 seconds')";
    const recent = db.prepare(`
      SELECT id FROM notification_deliveries
      WHERE booking_id = ? AND recipient_role = 'TRAVELER' AND event_type = ?
        AND metadata LIKE '%"resend":true%' AND ${cooldownPredicate}
      LIMIT 1
    `).get(booking.id, eventType);
    if (recent) return res.status(429).json({ error: "Please wait one minute before resending the same update" });
    const result = await sendGuestBookingNotification(db, booking.id, eventType, { eventKeySuffix: `SELF_${Date.now()}` });
    if (!result.attempted) return res.status(409).json({ error: "No enabled notification channel is available" });
    const delivered = result.results.some((item) => item.success);
    return res.status(delivered ? 200 : 502).json({ success: delivered, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Notification could not be sent" });
  }
});

router.get("/:ref", authenticate, requireBookingOwner(), (req, res) => {
  try {
    const actor = requester(req);
    if (!actor) return res.status(401).json({ error: "Sign in to view this ticket" });
    const booking = db.prepare(
      `SELECT b.*, p.title as product_title, p.hero_image, p.full_desc, p.inclusions, p.exclusions,
              p.cancellation_policy, s.company_name as supplier_name, s.phone as supplier_phone
       FROM bookings b LEFT JOIN products p ON b.product_id = p.id LEFT JOIN suppliers s ON b.supplier_id = s.id
       WHERE b.ref = ? OR b.id = ?`
    ).get(req.params.ref, req.params.ref);
    if (!booking) return res.status(404).json({ error: "Booking voucher not found" });
    if (!ownsBooking(actor, booking)) return res.status(403).json({ error: "You do not have access to this booking" });
    const driver = db.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(booking.id);
    const dispatchTimeline = driver ? getDispatchTimeline(db, booking.id) : [];
    res.json({ success: true, booking: { ...travelerView(booking), driver: driver || null, dispatchTimeline } });
  } catch {
    res.status(500).json({ error: "Failed to fetch voucher" });
  }
});

export default router;
