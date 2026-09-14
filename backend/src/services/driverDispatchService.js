import { randomUUID } from "node:crypto";
import { dispatchTransaction, scheduleKey, departureKey, enqueueDispatch, revokeAssignment } from "./dispatchStateService.js";
import { nanoid } from "nanoid";
import { vehicleModelSupportsCategory } from "../lib/vehicleInventory.js";
import { normalizeWhatsAppPhone } from "./whatsappService.js";
import { hashPickupOtp } from "./bookingService.js";
import { markReferralTripCompleted } from "./referralService.js";
import { onTripCompleted } from "./affiliateService.js";
import { latestDriverLocation, recordDriverLocations, telemetryFromAssignment } from "./driverLocationService.js";

export const DISPATCH_STATUS_TRANSITIONS = Object.freeze({
  ASSIGNED: ["EN_ROUTE"],
  EN_ROUTE: ["ARRIVED"],
  ARRIVED: ["TRIP_STARTED"],
  TRIP_STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
});

const unavailableFleetStatuses = new Set(["INACTIVE", "SUSPENDED", "UNAVAILABLE", "MAINTENANCE"]);
const activeAssignmentStatuses = new Set(["ASSIGNED", "EN_ROUTE", "ARRIVED", "TRIP_STARTED"]);

function dispatchError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeDriverPhone(value) {
  const phone = normalizeWhatsAppPhone(value);
  if (!phone) throw dispatchError("Enter a valid driver mobile or WhatsApp number");
  return `+${phone}`;
}

export function normalizeVehicleNumber(value) {
  const plate = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  const compact = plate.replace(/[^A-Z0-9]/g, "");
  if (compact.length < 6 || compact.length > 15 || !/[A-Z]/.test(compact) || !/\d/.test(compact)) {
    throw dispatchError("Enter a valid vehicle registration number");
  }
  return plate;
}

export function bookingWithDuration(database, bookingId, supplierId) {
  return database.prepare(`
    SELECT b.*, p.duration_hours, p.group_type, tr.duration_mins, pi.total_days
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN transfer_routes tr ON tr.product_id = b.product_id
    LEFT JOIN package_itineraries pi ON pi.product_id = b.product_id
    WHERE b.id = ? AND b.supplier_id = ?
  `).get(bookingId, supplierId);
}

function timeParts(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) throw dispatchError("A valid pickup time is required");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) throw dispatchError("A valid pickup time is required");
  return [hour, minute];
}

export function bookingWindow(booking) {
  const [year, month, day] = String(booking.activity_date || "").split("-").map(Number);
  const [hour, minute] = timeParts(booking.pickup_time);
  if (![year, month, day].every(Number.isFinite)) throw dispatchError("Booking has an invalid travel date");
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== booking.activity_date) throw dispatchError("Booking has an invalid travel date");
  const start = Date.UTC(year, month - 1, day, hour, minute) - 330 * 60000;
  const packageHours = Number(booking.total_days) > 0 ? Number(booking.total_days) * 24 : 0;
  const productHours = Number(booking.duration_hours) > 0 ? Number(booking.duration_hours) : 0;
  const transferHours = Number(booking.duration_mins) > 0 ? Number(booking.duration_mins) / 60 : 0;
  const fallback = String(booking.product_type).toUpperCase() === "TRANSFER" ? 2 : 8;
  const durationHours = Math.max(packageHours, productHours, transferHours) || fallback;
  return { start, end: start + durationHours * 60 * 60 * 1000, durationHours };
}

export function bookingWindowsOverlap(left, right) {
  const a = bookingWindow(left);
  const b = bookingWindow(right);
  return a.start < b.end && b.start < a.end;
}

function assignmentConflicts(database, booking, driver) {
  const candidates = database.prepare(`
    SELECT b.*, p.duration_hours, p.group_type, tr.duration_mins, pi.total_days,
      da.driver_name, da.driver_phone, da.vehicle_number, da.assignment_status, da.supplier_driver_id, da.departure_key
    FROM driver_assignments da
    JOIN bookings b ON b.id = da.booking_id
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN transfer_routes tr ON tr.product_id = b.product_id
    LEFT JOIN package_itineraries pi ON pi.product_id = b.product_id
    WHERE b.id <> ?
      AND LOWER(b.status) NOT IN ('completed', 'cancelled')
  `).all(booking.id);
  const buffer = database.prepare("SELECT buffer_minutes FROM dispatch_settings WHERE supplier_id = ?").get(booking.supplier_id)?.buffer_minutes ?? 30;
  const driverPhone = normalizeWhatsAppPhone(driver.driver_phone);
  const plate = normalizeVehicleNumber(driver.vehicle_number).replace(/[^A-Z0-9]/g, "");
  return candidates.filter((candidate) => {
    if (!activeAssignmentStatuses.has(String(candidate.assignment_status || "ASSIGNED").toUpperCase())) return false;
    const sameRosterDriver = driver.id && candidate.supplier_driver_id === driver.id;
    const samePhone = driverPhone && normalizeWhatsAppPhone(candidate.driver_phone) === driverPhone;
    const sameVehicle = String(candidate.vehicle_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === plate;
    if (candidate.departure_key === departureKey(booking) && candidate.departure_key?.startsWith("departure:")) return false;
    const a = bookingWindow(booking), b = bookingWindow(candidate);
    return (sameRosterDriver || samePhone || sameVehicle) && a.start < b.end + buffer * 60000 && b.start < a.end + buffer * 60000;
  });
}

function event(database, assignment, values) {
  database.prepare(`
    INSERT INTO driver_assignment_events (
      id, assignment_id, booking_id, supplier_id, supplier_driver_id, event_type,
      previous_status, new_status, note, actor_id, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `dae_${nanoid(12)}`, assignment.id, assignment.booking_id, assignment.supplier_id,
    assignment.supplier_driver_id || null, values.eventType, values.previousStatus || null,
    values.newStatus || null, values.note || null, values.actorId || null,
    JSON.stringify(values.details || {}),
  );
}

export function getFleetAvailability(database, { supplierId, bookingId }) {
  const booking = bookingWithDuration(database, bookingId, supplierId);
  if (!booking) throw dispatchError("Booking was not found for this supplier", 404);
  const drivers = database.prepare("SELECT * FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name").all(supplierId);
  return drivers.map((driver) => {
    const rosterStatus = String(driver.status || "AVAILABLE").toUpperCase();
    const compatible = vehicleModelSupportsCategory(driver.vehicle_model, booking.vehicle_category) && Number(driver.seat_capacity) >= Number(booking.adults || 0) + Number(booking.children || 0) && Boolean(driver.driver_email);
    const conflicts = unavailableFleetStatuses.has(rosterStatus) ? [] : assignmentConflicts(database, booking, driver);
    const available = !unavailableFleetStatuses.has(rosterStatus) && compatible && conflicts.length === 0;
    const reason = unavailableFleetStatuses.has(rosterStatus)
      ? `Fleet status is ${rosterStatus.replaceAll("_", " ").toLowerCase()}`
      : !compatible
        ? `Vehicle does not match ${booking.vehicle_category || "the booked category"}`
        : conflicts.length
          ? `Already assigned to ${conflicts[0].ref || conflicts[0].id} during this trip`
          : null;
    return { ...driver, available, compatible, reason, conflictBookingRef: conflicts[0]?.ref || null };
  });
}

export function assignDriverToBooking(database, args) {
  return dispatchTransaction(database, () => assignDriverLocked(database, args));
}

function assignDriverLocked(database, { supplierId, bookingId, supplierDriverId, manualDriver, actorId, automatic = false, assignmentDetails = {}, now = new Date() }) {
  const booking = bookingWithDuration(database, bookingId, supplierId);
  if (!booking) throw dispatchError("Booking was not found for this supplier", 404);
  if (String(booking.payment_status).toUpperCase() !== "PAID") throw dispatchError("A driver can be assigned only after payment is confirmed", 409);
  const assignmentAccepted = ["SUPPLIER_ACCEPTED", "LEGACY_ASSIGNED", "MANUAL_ASSIGNED", "AUTO_REALLOCATED", "RESCHEDULE_RECONFIRMED"];
  if (!assignmentAccepted.includes(String(booking.supplier_assignment_status || "LEGACY_ASSIGNED").toUpperCase())) throw dispatchError("Accept this booking before assigning a driver", 409);
  if (!["confirmed", "driver_assigned"].includes(String(booking.status).toLowerCase())) throw dispatchError(`A driver cannot be assigned while booking is ${booking.status}`, 409);

  let driver;
  let source;
  if (supplierDriverId) {
    driver = database.prepare("SELECT * FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(supplierDriverId, supplierId);
    if (!driver) throw dispatchError("Choose a driver from your own fleet", 404);
    if (unavailableFleetStatuses.has(String(driver.status || "").toUpperCase())) throw dispatchError(`This driver is ${String(driver.status).toLowerCase()} and cannot be assigned`, 409);
    source = automatic ? "AUTOMATIC" : "FLEET";
  } else {
    driver = {
      driver_name: String(manualDriver?.driverName || "").trim(),
      driver_phone: manualDriver?.driverPhone,
      vehicle_model: String(manualDriver?.vehicleModel || "Commercial AC Vehicle").trim(),
      vehicle_number: manualDriver?.vehicleNumber,
      driver_email: manualDriver?.driverEmail,
      seat_capacity: manualDriver?.seatCapacity,
    };
    if (!driver.driver_name) throw dispatchError("Driver name is required");
    source = "MANUAL";
  }
  driver.driver_phone = normalizeDriverPhone(driver.driver_phone);
  driver.vehicle_number = normalizeVehicleNumber(driver.vehicle_number);
  if (!vehicleModelSupportsCategory(driver.vehicle_model, booking.vehicle_category)) {
    throw dispatchError(`Choose a vehicle matching the booked ${booking.vehicle_category || "vehicle"} category`, 409);
  }
  const conflicts = assignmentConflicts(database, booking, driver);
  if (conflicts.length) throw dispatchError(`Driver or vehicle is already assigned to ${conflicts[0].ref || conflicts[0].id} during this trip`, 409);

  const seats = Number(booking.adults || 0) + Number(booking.children || 0);
  const otherSeats = database.prepare(`SELECT b.adults, b.children FROM driver_assignments da JOIN bookings b ON b.id = da.booking_id
    WHERE da.departure_key = ? AND b.id <> ? AND LOWER(b.status) NOT IN ('cancelled', 'completed') AND da.assignment_status <> 'CANCELLED'`)
    .all(departureKey(booking), bookingId).reduce((sum, b) => sum + Number(b.adults || 0) + Number(b.children || 0), 0);
  if (!Number.isInteger(Number(driver.seat_capacity)) || Number(driver.seat_capacity) < seats + otherSeats || Number(driver.seat_capacity) < 1) throw dispatchError("Enter sufficient vehicle seat capacity before assigning", 409);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(driver.driver_email || ''))) throw dispatchError("Driver email is required for trip alerts", 409);
  const existing = database.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(bookingId);
  if (existing && ['EN_ROUTE','ARRIVED','TRIP_STARTED','COMPLETED'].includes(existing.assignment_status)) throw dispatchError("An active trip cannot be reassigned", 409);
  if (existing) revokeAssignment(database, booking, existing, 'Driver assignment replaced', now);
  const assignmentId = existing?.id || `drv_${nanoid(12)}`;
  database.transaction(() => {
    if (existing) {
      database.prepare(`
        UPDATE driver_assignments SET supplier_driver_id = ?, driver_name = ?, driver_phone = ?, vehicle_model = ?,
          vehicle_number = ?, assignment_status = 'ASSIGNED', assignment_source = ?, assigned_by = ?,
          notes = NULL, assigned_at = datetime('now'), last_status_at = datetime('now'), en_route_at = NULL,
          arrived_at = NULL, trip_started_at = NULL, completed_at = NULL
        WHERE id = ?
      `).run(driver.id || null, driver.driver_name, driver.driver_phone, driver.vehicle_model, driver.vehicle_number, source, actorId || null, assignmentId);
    } else {
      database.prepare(`
        INSERT INTO driver_assignments (
          id, booking_id, supplier_id, supplier_driver_id, driver_name, driver_phone, vehicle_model,
          vehicle_number, assignment_status, assignment_source, assigned_by, last_status_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?, datetime('now'))
      `).run(assignmentId, bookingId, supplierId, driver.id || null, driver.driver_name, driver.driver_phone, driver.vehicle_model, driver.vehicle_number, source, actorId || null);
    }
    database.prepare("UPDATE bookings SET status = 'driver_assigned' WHERE id = ?").run(bookingId);
    const minutes = database.prepare("SELECT response_minutes FROM dispatch_settings WHERE supplier_id = ?").get(supplierId)?.response_minutes ?? 30;
    database.prepare(`UPDATE driver_assignments SET driver_email = ?, seat_capacity = ?, revision = ?, schedule_key = ?, departure_key = ?, acknowledgement = 'PENDING', response_deadline = ?, acknowledged_at = NULL WHERE id = ?`)
      .run(driver.driver_email, Number(driver.seat_capacity), randomUUID(), scheduleKey(booking), departureKey(booking), new Date(Math.min(now.getTime() + minutes * 60000, bookingWindow(booking).start)).toISOString(), assignmentId);
    const saved = database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignmentId);
    enqueueDispatch(database, booking, saved, 'DRIVER_REQUEST', { now });
    event(database, saved, {
      eventType: existing ? "REASSIGNED" : "ASSIGNED",
      previousStatus: existing?.assignment_status,
      newStatus: "ASSIGNED",
      actorId,
      details: { ...(existing ? { previousDriver: existing.driver_name, previousVehicle: existing.vehicle_number } : {}), ...assignmentDetails },
    });
  })();
  return database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignmentId);
}

export function updateDispatchStatus(database, args) {
  return dispatchTransaction(database, () => updateDispatchStatusLocked(database, args));
}
function updateDispatchStatusLocked(database, { supplierId, bookingId, nextStatus, actorId, note, allowTripStart = false }) {
  const normalizedNext = String(nextStatus || "").toUpperCase();
  const assignment = database.prepare("SELECT * FROM driver_assignments WHERE booking_id = ? AND supplier_id = ?").get(bookingId, supplierId);
  if (!assignment) throw dispatchError("Assign a driver before updating dispatch", 409);
  const booking = database.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  if (!booking || ['cancelled'].includes(String(booking.status).toLowerCase()) || booking.payment_status !== 'PAID') throw dispatchError("Booking is not available for service", 409);
  if (assignment.schedule_key && assignment.schedule_key !== scheduleKey(booking)) throw dispatchError("Trip schedule changed; reassign the driver", 409);
  if (assignment.acknowledgement !== 'ACCEPTED') throw dispatchError("Driver must accept this assignment first", 409);
  const current = String(assignment.assignment_status || "ASSIGNED").toUpperCase();
  if (current === normalizedNext) return { assignment, idempotent: true };
  if (normalizedNext === "TRIP_STARTED" && !allowTripStart) throw dispatchError("Verify the traveler's pickup OTP to start this trip", 409);
  const otpStart = allowTripStart && normalizedNext === "TRIP_STARTED" && ["ASSIGNED", "EN_ROUTE", "ARRIVED"].includes(current);
  if (!(DISPATCH_STATUS_TRANSITIONS[current] || []).includes(normalizedNext) && !otpStart) {
    throw dispatchError(`Cannot move dispatch from ${current.replaceAll("_", " ")} to ${normalizedNext.replaceAll("_", " ")}`, 409);
  }
  const timestampColumn = { EN_ROUTE: "en_route_at", ARRIVED: "arrived_at", TRIP_STARTED: "trip_started_at", COMPLETED: "completed_at" }[normalizedNext];
  database.transaction(() => {
    database.prepare(`UPDATE driver_assignments SET assignment_status = ?, last_status_at = datetime('now'), ${timestampColumn} = datetime('now'), notes = ? WHERE id = ?`)
      .run(normalizedNext, note?.trim() || assignment.notes || null, assignment.id);
    if (["ARRIVED", "TRIP_STARTED", "COMPLETED"].includes(normalizedNext)) {
      // The driver reached pickup, so a "may miss the pickup" location alert is settled.
      database.prepare("UPDATE staff_tasks SET status = 'COMPLETED' WHERE booking_id = ? AND task_type = 'DRIVER_LOCATION_RISK' AND status = 'OPEN'").run(bookingId);
    }
    if (normalizedNext === "TRIP_STARTED") {
      database.prepare("UPDATE bookings SET status = 'in_progress' WHERE id = ?").run(bookingId);
      database.prepare("UPDATE staff_tasks SET status = 'COMPLETED' WHERE booking_id = ? AND task_type = 'PICKUP_NOT_STARTED' AND status = 'OPEN'").run(bookingId);
    }
    if (normalizedNext === "COMPLETED") {
      database.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(bookingId);
      database.prepare("UPDATE staff_tasks SET status = 'COMPLETED' WHERE booking_id = ? AND task_type IN ('TRIP_COMPLETION_OVERDUE', 'PICKUP_NOT_STARTED') AND status = 'OPEN'").run(bookingId);
      database.prepare("UPDATE payouts SET payout_status = 'SCHEDULED' WHERE booking_id = ? AND payout_status = 'PAYMENT_HELD'").run(bookingId);
      try {
        markReferralTripCompleted(database, bookingId);
      } catch {}
      try {
        onTripCompleted(database, bookingId);
      } catch {}
    }
    enqueueDispatch(database, booking, assignment, `DISPATCH_${normalizedNext}`);
    event(database, assignment, { eventType: "STATUS_CHANGED", previousStatus: current, newStatus: normalizedNext, actorId, note });
    try {
      const logisticsEvent = { EN_ROUTE: "DRIVER_EN_ROUTE", ARRIVED: "DRIVER_ARRIVED", TRIP_STARTED: "GUEST_PICKED_UP", COMPLETED: "DROPPED_OFF" }[normalizedNext];
      if (logisticsEvent) database.prepare("INSERT INTO booking_logistics_events (id, booking_id, event_type, status, payload, actor_id) VALUES (?, ?, ?, ?, ?, ?)").run(`ble_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, bookingId, logisticsEvent, normalizedNext, JSON.stringify({ note: note || null }), actorId || null);
      if (logisticsEvent) database.prepare("UPDATE booking_logistics SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?").run(logisticsEvent, bookingId);
    } catch {}
  })();
  return { assignment: database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignment.id), idempotent: false };
}

export function getDispatchTimeline(database, bookingId) {
  return database.prepare("SELECT * FROM driver_assignment_events WHERE booking_id = ? ORDER BY created_at, rowid").all(bookingId);
}

export function verifyPickupOtp(database, bookingId, enteredOtp) {
  const result = dispatchTransaction(database, () => {
    const booking = database.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    if (!booking || booking.payment_status !== 'PAID' || !['confirmed','driver_assigned','in_progress'].includes(booking.status)) return { error: "Booking is not available for pickup", status: 409 };
    if (booking.otp_verified_at) return { valid: true, bookingId };
    if (Number(booking.otp_attempts || 0) >= 5) return { error: "Pickup code locked. Contact operations", status: 429 };
    if (!booking.otp_hash || !booking.otp_expires_at || Date.parse(booking.otp_expires_at) < Date.now()) return { error: "Pickup code expired. Contact operations", status: 410 };
    database.prepare("UPDATE bookings SET otp_attempts = COALESCE(otp_attempts, 0) + 1 WHERE id = ?").run(bookingId);
    if (!/^\d{4,6}$/.test(String(enteredOtp || '')) || hashPickupOtp(booking.id, String(enteredOtp)) !== booking.otp_hash) return { error: "Invalid pickup OTP", status: 400 };
    database.prepare("UPDATE bookings SET otp_verified_at = ? WHERE id = ?").run(new Date().toISOString(), bookingId);
    return { valid: true, bookingId };
  });
  if (result.error) throw dispatchError(result.error, result.status);
  return result;
}

/** A position typed in by operations (for a driver who can't share from their phone). */
export function updateDriverCoordinates(database, assignmentId, coords = {}) {
  const assignment = database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignmentId);
  if (!assignment) throw dispatchError("Driver assignment not found", 404);
  if (!Number.isFinite(Number(coords.lat)) || !Number.isFinite(Number(coords.lng)) || coords.lat === null || coords.lng === null) {
    throw dispatchError("Valid numeric lat and lng coordinates required", 400);
  }
  const result = recordDriverLocations(database, { assignment }, [{ lat: coords.lat, lng: coords.lng, speed_kmh: coords.speed_kmh ?? coords.speed, heading: coords.heading }], { source: "OPS" });
  return { assignmentId: assignment.id, telemetry: result.latest };
}

export function getDriverCoordinates(database, assignmentId) {
  return latestDriverLocation(database, assignmentId);
}

export function getLiveDispatchTelemetry(database) {
  const rawRows = database.prepare(`
    SELECT b.id as booking_id, b.ref as booking_reference, b.status as booking_status, b.activity_date, b.pickup_time,
           b.pickup_location, b.pickup_lat, b.pickup_lng, b.drop_location, b.drop_lat, b.drop_lng,
           b.traveler_name as guest_name, b.traveler_phone as guest_phone, b.adults, b.children,
           p.id as product_id, p.title as product_title, p.hero_image, p.category, p.city as product_city,
           s.id as supplier_id, s.company_name as supplier_name, s.phone as supplier_phone,
           da.id as assignment_id, da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number,
           da.assignment_status, da.assigned_at, da.en_route_at, da.arrived_at, da.trip_started_at, da.last_status_at,
           da.last_lat, da.last_lng, da.last_accuracy_m, da.last_speed_kmh, da.last_heading, da.last_location_source, da.last_location_at
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.status IN ('driver_assigned', 'in_progress', 'confirmed')
       OR da.assignment_status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TRIP_STARTED')
    ORDER BY b.activity_date ASC, b.pickup_time ASC
  `).all();

  const coordinate = (value) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));
  return rawRows.map((row) => {
    // Only a position a driver or operator actually reported. The map shows a
    // trip without one at its pickup point, marked as having no live GPS, and
    // never invents a position, speed or battery level.
    const { last_lat, last_lng, last_accuracy_m, last_speed_kmh, last_heading, last_location_source, last_location_at, ...trip } = row;
    const telemetry = telemetryFromAssignment(row);
    return {
      ...trip,
      pickup_lat: coordinate(row.pickup_lat),
      pickup_lng: coordinate(row.pickup_lng),
      drop_lat: coordinate(row.drop_lat),
      drop_lng: coordinate(row.drop_lng),
      driver_telemetry: telemetry,
      has_live_gps: Boolean(telemetry),
    };
  });
}
