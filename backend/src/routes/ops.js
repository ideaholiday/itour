import express from "express";
import db from "../db.js";
import { sendWhatsAppMessage, sendWhatsAppVoucher, whatsAppProviderConfiguration } from "../services/whatsappService.js";
import { emailProviderConfiguration, sendEmail } from "../services/emailService.js";
import { withoutPickupOtpSecrets } from "../services/bookingService.js";
import { processExpiredSupplierAssignments } from "../services/assignmentSlaService.js";
import { sendGuestBookingNotification } from "../services/notificationService.js";
import {
  getLiveDispatchTelemetry,
  updateDriverCoordinates,
  verifyPickupOtp,
  updateDispatchStatus,
  getDispatchTimeline
} from "../services/driverDispatchService.js";
import { authenticate, optionalAuthMiddleware, requireRoles, requireSchedulerOrRoles } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { validateBody } from "../middleware/validation.js";
import { opsSchemas } from "../validators/apiSchemas.js";

const router = express.Router();
const opsAccess = requireRoles("ADMIN", "STAFF");

router.use((req, res, next) => {
  if (req.path === "/process-assignment-timeouts") return next();
  return authenticate(req, res, (error) => error ? next(error) : opsAccess(req, res, next));
});

function requireOpsAccess(req, res, next) {
  if (["ADMIN", "STAFF"].includes(String(req.user?.role || "").toUpperCase())) return next();
  return res.status(403).json({ error: "Admin or operations access required" });
}

// Haversine distance calculator for 15km radius supplier ping
function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 10.0; // default fallback radius
  const R = 6371; // Radius of earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// GET /api/ops/live-trips - Live Trip Monitoring Board data for next 24 hours & SLA alerts
router.get("/live-trips", (req, res) => {
  try {
    processExpiredSupplierAssignments(db);
    const rawBookings = db
      .prepare(
        `SELECT b.*, p.title as product_title, p.hero_image, s.company_name as supplier_name, s.phone as supplier_phone, s.city as supplier_city,
                da.id as assignment_id, da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number, da.assignment_status
         FROM bookings b
         LEFT JOIN products p ON b.product_id = p.id
         LEFT JOIN suppliers s ON b.supplier_id = s.id
         LEFT JOIN driver_assignments da ON b.id = da.booking_id
         ORDER BY b.created_at DESC`
      )
      .all();

    const unassigned = [];
    const assigned = [];
    const enRoute = [];
    const started = [];
    const completed = [];

    let totalSlaBreaches = 0;

    rawBookings.forEach((b) => {
      const hasDriver = Boolean(b.driver_name && b.driver_name !== "Driver Pending Assignment");
      const status = (b.assignment_status || "UNASSIGNED").toUpperCase();

      // SLA Alert logic: If pickup is within 60 mins (or mocked active unassigned), highlight red SLA alert
      // We check if driver is missing
      const isUnassigned = !hasDriver || status === "UNASSIGNED";

      // Mock minutes until pickup for demo (35 mins to 120 mins)
      const minutesToPickup = isUnassigned ? 45 : 120;
      const slaAlert = isUnassigned && minutesToPickup <= 60;

      if (slaAlert) totalSlaBreaches++;

      const item = {
        ...withoutPickupOtpSecrets(b),
        hasDriver,
        slaAlert,
        minutesToPickup,
        slaText: slaAlert
          ? `🚨 SLA BREACH: Trip in ${minutesToPickup} mins — No Driver Assigned!`
          : `Pickup in ${minutesToPickup} mins`,
        mapsLink: b.pickup_lat && b.pickup_lng
          ? `https://maps.google.com/?q=${b.pickup_lat},${b.pickup_lng}`
          : `https://maps.google.com/?q=${encodeURIComponent(b.pickup_location || "Lucknow Airport")}`
      };

      if (b.status === "COMPLETED" || status === "COMPLETED") {
        completed.push(item);
      } else if (status === "TRIP_STARTED" || status === "ARRIVED") {
        started.push(item);
      } else if (status === "EN_ROUTE") {
        enRoute.push(item);
      } else if (hasDriver && (status === "ASSIGNED" || status === "FALLBACK_TRIGGERED")) {
        assigned.push(item);
      } else {
        unassigned.push(item);
      }
    });

    res.json({
      success: true,
      liveBoard: {
        unassigned,
        assigned,
        enRoute,
        started,
        completed
      },
      metrics: {
        totalTrips: rawBookings.length,
        unassignedCount: unassigned.length,
        assignedCount: assigned.length,
        enRouteCount: enRoute.length,
        startedCount: started.length,
        completedCount: completed.length,
        totalSlaBreaches
      }
    });
  } catch (err) {
    logger.error("Live trip board lookup failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to fetch live trip monitoring board" });
  }
});

// POST /api/ops/process-assignment-timeouts - Scheduler/admin safety net for expired supplier responses
router.post("/process-assignment-timeouts", optionalAuthMiddleware, requireSchedulerOrRoles("ADMIN", "STAFF"), validateBody(opsSchemas.scheduler), (req, res) => {
  try {
    return res.json({ success: true, ...processExpiredSupplierAssignments(db, { limit: req.body?.limit || 50 }) });
  } catch (err) {
    return res.status(500).json({ error: "Assignment timeouts could not be processed" });
  }
});

// POST /api/ops/fallback-override - Manual Driver Dispatch / Ground Ops Fallback
router.post("/fallback-override", validateBody(opsSchemas.fallback), (req, res) => {
  try {
    const { bookingId, fallbackDriverName, fallbackDriverPhone, fallbackVehicleModel, fallbackVehicleNumber, notes } = req.body;

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Delete existing driver assignment if any
    db.prepare("DELETE FROM driver_assignments WHERE booking_id = ?").run(booking.id);

    const assignmentId = `drv_fallback_${Date.now()}`;
    db.prepare(
      `INSERT INTO driver_assignments (id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'FALLBACK_TRIGGERED')`
    ).run(
      assignmentId,
      booking.id,
      booking.supplier_id || "sup_lucknow_cabs",
      fallbackDriverName || "Ground Ops Fallback Driver",
      fallbackDriverPhone || "+919811009988",
      fallbackVehicleModel || "Backup Commercial Cab",
      fallbackVehicleNumber || "UP-32-T-9999"
    );

    // Log staff task
    db.prepare(
      `INSERT INTO staff_tasks (id, task_type, booking_id, assigned_staff_name, priority, status, notes)
       VALUES (?, 'FALLBACK_DISPATCH', ?, 'Ground Operations Staff', 'CRITICAL', 'RESOLVED', ?)`
    ).run(`task_${Date.now()}`, booking.id, notes || `Fallback driver ${fallbackDriverName} (${fallbackVehicleNumber}) dispatched.`);

    res.json({
      success: true,
      message: `Emergency fallback driver ${fallbackDriverName} assigned to trip #${booking.ref}!`,
      assignmentId
    });
  } catch (err) {
    logger.error("Fallback dispatch override failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to execute fallback dispatch" });
  }
});

// POST /api/ops/emergency-reallocate - 15 km Radius Emergency Vendor Ping & Auto-Reallocation
router.post("/emergency-reallocate", validateBody(opsSchemas.reallocate), (req, res) => {
  try {
    const { bookingId, radiusKm = 15 } = req.body;

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ?").get(bookingId, bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const pickupLat = booking.pickup_lat || 26.7606;
    const pickupLng = booking.pickup_lng || 80.8893;

    // Find all active approved suppliers
    const activeSuppliers = db.prepare("SELECT * FROM suppliers WHERE kyb_status = 'APPROVED'").all();

    const pingedSuppliers = activeSuppliers.map((s) => {
      // Find supplier geo fence or center lat/lng
      const fence = db.prepare("SELECT center_lat, center_lng FROM geo_fences WHERE supplier_id = ? AND is_active = 1 AND COALESCE(approval_status, 'APPROVED') = 'APPROVED' LIMIT 1").get(s.id);
      const sLat = fence ? fence.center_lat : 26.8467;
      const sLng = fence ? fence.center_lng : 80.9462;

      const distance = getDistanceKm(pickupLat, pickupLng, sLat, sLng);
      const withinRadius = distance <= Number(radiusKm);

      return {
        id: s.id,
        companyName: s.company_name,
        contactName: s.contact_name,
        phone: s.phone,
        city: s.city,
        distanceKm: distance,
        withinRadius,
        pingStatus: withinRadius ? "PING_SENT" : "OUT_OF_BOUNDS"
      };
    });

    const nearbyMatches = pingedSuppliers.filter((s) => s.withinRadius);

    // Auto-reallocate to closest vendor if available
    let newVendor = null;
    if (nearbyMatches.length > 0) {
      nearbyMatches.sort((a, b) => a.distanceKm - b.distanceKm);
      newVendor = nearbyMatches[0];
      db.transaction(() => {
        db.prepare("UPDATE bookings SET supplier_id = ?, supplier_assignment_status = 'AUTO_REALLOCATED', supplier_assignment_method = 'EMERGENCY_RADIUS', supplier_assignment_score = NULL, supplier_assignment_reason = ?, assigned_supplier_product_id = NULL, supplier_assigned_at = datetime('now') WHERE id = ?")
          .run(newVendor.id, `Emergency reallocation selected the closest approved supplier at ${newVendor.distanceKm} km`, booking.id);
        db.prepare("UPDATE payouts SET supplier_id = ? WHERE booking_id = ?").run(newVendor.id, booking.id);
      })();
    }

    // Log emergency re-allocation staff task
    db.prepare(
      `INSERT INTO staff_tasks (id, task_type, booking_id, assigned_staff_name, priority, status, notes)
       VALUES (?, 'EMERGENCY_REALLOCATION', ?, 'Ground Ops Ping Engine', 'HIGH', 'RESOLVED', ?)`
    ).run(
      `task_re_${Date.now()}`,
      booking.id,
      `Broadcasted emergency alert to ${nearbyMatches.length} suppliers within ${radiusKm}km radius. Auto-assigned closest: ${newVendor ? newVendor.companyName : "None"}`
    );

    res.json({
      success: true,
      bookingRef: booking.ref,
      radiusKm: Number(radiusKm),
      totalSuppliersPinged: nearbyMatches.length,
      nearbySuppliers: nearbyMatches,
      reallocatedVendor: newVendor,
      message: `Emergency re-allocation alert broadcasted to ${nearbyMatches.length} suppliers within ${radiusKm}km radius!`
    });
  } catch (err) {
    logger.error("Emergency reallocation failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to execute emergency re-allocation" });
  }
});

// POST /api/ops/send-whatsapp - Send instant WhatsApp booking voucher
router.post("/send-whatsapp", optionalAuthMiddleware, requireOpsAccess, validateBody(opsSchemas.whatsapp), async (req, res) => {
  try {
    const lookup = req.body.bookingId || req.body.bookingRef;

    const savedBooking = lookup ? db
      .prepare(
        `SELECT b.*, da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number
         FROM bookings b
         LEFT JOIN driver_assignments da ON b.id = da.booking_id
         WHERE b.id = ? OR b.ref = ?`
      )
      .get(lookup, lookup) : null;
    const booking = savedBooking || req.body;
    if (!booking.customerPhone && !booking.traveler_phone) return res.status(400).json({ error: "Choose a booking or enter a recipient phone number" });

    const result = await sendWhatsAppVoucher({
      bookingRef: booking.ref || booking.bookingRef,
      customerName: booking.traveler_name || booking.customerName,
      customerPhone: booking.traveler_phone || booking.customerPhone,
      driverName: booking.driver_name || booking.driverName,
      driverPhone: booking.driver_phone || booking.driverPhone,
      vehicleModel: booking.vehicle_model || booking.vehicleModel,
      vehicleNumber: booking.vehicle_number || booking.vehicleNumber,
      pickupLocation: booking.pickup_location || booking.pickupLocation,
      pickupTime: booking.pickup_time || booking.pickupTime,
      pickupLat: booking.pickup_lat ?? booking.pickupLat,
      pickupLng: booking.pickup_lng ?? booking.pickupLng,
    }, { database: db });

    res.status(result.success ? 200 : result.skipped ? 503 : 502).json(result);
  } catch (err) {
    logger.error("Operations WhatsApp delivery failed", { requestId: req.requestId, error: err });
    res.status(500).json({ error: "Failed to send WhatsApp voucher" });
  }
});

// GET /api/ops/notifications - List sent WhatsApp voucher logs
router.get("/notifications", optionalAuthMiddleware, requireOpsAccess, (req, res) => {
  try {
    const logs = db.prepare("SELECT * FROM whatsapp_logs ORDER BY sent_at DESC LIMIT 50").all();
    const conditions = [];
    const values = [];
    if (req.query.bookingRef) { conditions.push("booking_ref = ?"); values.push(String(req.query.bookingRef)); }
    if (req.query.channel) { conditions.push("channel = ?"); values.push(String(req.query.channel).toUpperCase()); }
    if (req.query.status) { conditions.push("status = ?"); values.push(String(req.query.status).toUpperCase()); }
    const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
    const deliveries = db.prepare(`SELECT * FROM notification_deliveries ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`).all(...values, limit);
    res.json({ success: true, whatsappLogs: logs, deliveries });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch WhatsApp notification logs" });
  }
});

router.post("/notifications/resend", optionalAuthMiddleware, requireOpsAccess, validateBody(opsSchemas.notification), async (req, res) => {
  try {
    const lookup = String(req.body.bookingId || req.body.bookingRef || "").trim();
    if (!lookup) return res.status(400).json({ error: "Booking reference is required" });
    const result = await sendGuestBookingNotification(db, lookup, req.body.eventType || "DOCUMENTS", { eventKeySuffix: `OPS_${Date.now()}` });
    if (!result.attempted) return res.status(409).json({ error: "The traveler has no enabled notification channel" });
    const delivered = result.results.some((item) => item.success);
    return res.status(delivered ? 200 : 502).json({ success: delivered, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Guest notification could not be sent" });
  }
});

router.get("/notification-health", optionalAuthMiddleware, requireOpsAccess, (_req, res) => {
  const email = emailProviderConfiguration();
  const whatsapp = whatsAppProviderConfiguration();
  res.json({
    success: true,
    providers: {
      email: { provider: email.provider, enabled: email.enabled, configured: email.configured, region: email.region, fromEmail: email.fromEmail },
      whatsapp: { provider: whatsapp.provider, enabled: whatsapp.enabled, configured: whatsapp.configured, apiVersion: whatsapp.apiVersion },
    },
  });
});

router.post("/notifications/test", optionalAuthMiddleware, requireOpsAccess, validateBody(opsSchemas.providerTest), async (req, res) => {
  const channel = String(req.body.channel || "").toUpperCase();
  const common = {
    recipientName: req.body.recipientName || "Idea Holiday test recipient",
    recipientRole: String(req.body.recipientRole || "STAFF").toUpperCase(),
    recipientId: req.user?.id,
    eventType: "PROVIDER_TEST",
    eventKey: `PROVIDER_TEST:${channel}:${Date.now()}`,
  };
  const result = channel === "EMAIL"
    ? await sendEmail({ ...common, to: req.body.to, subject: req.body.subject || "Idea Holiday email configuration test", text: req.body.text || "Amazon SES is connected to Idea Holiday." }, { database: db })
    : channel === "WHATSAPP"
      ? await sendWhatsAppMessage({ ...common, to: req.body.to, text: req.body.text || "WhatsApp Cloud API is connected to Idea Holiday." }, { database: db })
      : { success: false, status: "FAILED", error: "Choose EMAIL or WHATSAPP" };
  res.status(result.success ? 200 : result.skipped ? 503 : 400).json(result);
});

// GET /api/ops/tasks - List active staff tasks
router.get("/tasks", (req, res) => {
  try {
    const tasks = db
      .prepare(
        `SELECT st.*, b.ref as booking_ref, b.traveler_name, b.traveler_phone, p.title as product_title
         FROM staff_tasks st
         LEFT JOIN bookings b ON st.booking_id = b.id
         LEFT JOIN products p ON st.product_id = p.id
         ORDER BY st.created_at DESC`
      )
      .all();
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch staff tasks" });
  }
});

// POST /api/ops/tasks/:id/update - Update staff task status
router.post("/tasks/:id/update", validateBody(opsSchemas.task), (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    db.prepare("UPDATE staff_tasks SET status = ?, notes = ? WHERE id = ?").run(status || "RESOLVED", notes || "", id);
    res.json({ success: true, message: `Task status set to ${status || "RESOLVED"}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to update staff task" });
  }
});

// GET /api/ops/live-tracking - Live fleet tracking, driver telemetry, and active routes
router.get("/live-tracking", (req, res) => {
  try {
    const trips = getLiveDispatchTelemetry(db);
    res.json({ success: true, trips, count: trips.length });
  } catch (err) {
    logger.error("Failed to fetch live dispatch telemetry:", err);
    res.status(500).json({ error: "Failed to fetch live dispatch telemetry" });
  }
});

// POST /api/ops/driver-location - Record / update live driver GPS coordinates
router.post("/driver-location", (req, res) => {
  try {
    const { assignmentId, lat, lng, speed_kmh, heading, battery_pct } = req.body;
    if (!assignmentId) return res.status(400).json({ error: "assignmentId is required" });
    const result = updateDriverCoordinates(db, assignmentId, { lat, lng, speed_kmh, heading, battery_pct });
    res.json({ success: true, telemetry: result.telemetry });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "Failed to update driver coordinates" });
  }
});

// POST /api/ops/verify-otp-start - Verify traveler OTP and start trip
router.post("/verify-otp-start", (req, res) => {
  try {
    const { bookingId, otp, note } = req.body;
    if (!bookingId || !otp) return res.status(400).json({ error: "bookingId and otp are required" });

    verifyPickupOtp(db, bookingId, otp);

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const result = updateDispatchStatus(db, {
      supplierId: booking.supplier_id,
      bookingId: booking.id,
      nextStatus: "TRIP_STARTED",
      actorId: req.user?.id || "OPS_AGENT",
      note: note || "Pickup OTP verified by traveler on ground check-in",
      allowTripStart: true,
    });

    res.json({
      success: true,
      message: "Traveler OTP verified successfully! Trip has started.",
      assignment: result.assignment,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "Failed to verify pickup OTP" });
  }
});

// POST /api/ops/update-trip-status - Advance trip status with lifecycle checks
router.post("/update-trip-status", (req, res) => {
  try {
    const { bookingId, nextStatus, note, otp } = req.body;
    if (!bookingId || !nextStatus) return res.status(400).json({ error: "bookingId and nextStatus are required" });

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    let allowTripStart = false;
    if (String(nextStatus).toUpperCase() === "TRIP_STARTED") {
      if (!otp) return res.status(400).json({ error: "Pickup OTP is required to start trip" });
      verifyPickupOtp(db, bookingId, otp);
      allowTripStart = true;
    }

    const result = updateDispatchStatus(db, {
      supplierId: booking.supplier_id,
      bookingId: booking.id,
      nextStatus,
      actorId: req.user?.id || "OPS_AGENT",
      note,
      allowTripStart,
    });

    res.json({
      success: true,
      message: `Trip status updated to ${nextStatus}`,
      assignment: result.assignment,
      idempotent: result.idempotent,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || "Failed to update trip status" });
  }
});

export default router;
