import { nanoid } from "nanoid";
import { vehicleModelSupportsCategory } from "../lib/vehicleInventory.js";
import { normalizeWhatsAppPhone } from "./whatsappService.js";

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

function bookingWithDuration(database, bookingId, supplierId) {
  return database.prepare(`
    SELECT b.*, p.duration_hours, tr.duration_mins, pi.total_days
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN transfer_routes tr ON tr.product_id = b.product_id
    LEFT JOIN package_itineraries pi ON pi.product_id = b.product_id
    WHERE b.id = ? AND b.supplier_id = ?
  `).get(bookingId, supplierId);
}

function timeParts(value) {
  const match = String(value || "09:00").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return [9, 0];
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 ? [hour, minute] : [9, 0];
}

export function bookingWindow(booking) {
  const [year, month, day] = String(booking.activity_date || "").split("-").map(Number);
  const [hour, minute] = timeParts(booking.pickup_time);
  if (![year, month, day].every(Number.isFinite)) throw dispatchError("Booking has an invalid travel date");
  const start = Date.UTC(year, month - 1, day, hour, minute);
  const packageHours = Number(booking.total_days) > 0 ? Number(booking.total_days) * 24 : 0;
  const productHours = Number(booking.duration_hours) > 0 ? Number(booking.duration_hours) : 0;
  const transferHours = Number(booking.duration_mins) > 0 ? Number(booking.duration_mins) / 60 : 0;
  const fallback = String(booking.product_type).toUpperCase() === "TRANSFER" ? 2 : 8;
  const durationHours = Math.max(packageHours, productHours, transferHours, fallback);
  return { start, end: start + durationHours * 60 * 60 * 1000, durationHours };
}

export function bookingWindowsOverlap(left, right) {
  const a = bookingWindow(left);
  const b = bookingWindow(right);
  return a.start < b.end && b.start < a.end;
}

function assignmentConflicts(database, booking, driver) {
  const candidates = database.prepare(`
    SELECT b.*, p.duration_hours, tr.duration_mins, pi.total_days,
      da.driver_name, da.driver_phone, da.vehicle_number, da.assignment_status, da.supplier_driver_id
    FROM driver_assignments da
    JOIN bookings b ON b.id = da.booking_id
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN transfer_routes tr ON tr.product_id = b.product_id
    LEFT JOIN package_itineraries pi ON pi.product_id = b.product_id
    WHERE da.supplier_id = ? AND b.id <> ?
      AND LOWER(b.status) NOT IN ('completed', 'cancelled')
  `).all(booking.supplier_id, booking.id);
  const driverPhone = normalizeWhatsAppPhone(driver.driver_phone);
  const plate = normalizeVehicleNumber(driver.vehicle_number).replace(/[^A-Z0-9]/g, "");
  return candidates.filter((candidate) => {
    if (!activeAssignmentStatuses.has(String(candidate.assignment_status || "ASSIGNED").toUpperCase())) return false;
    const sameRosterDriver = driver.id && candidate.supplier_driver_id === driver.id;
    const samePhone = driverPhone && normalizeWhatsAppPhone(candidate.driver_phone) === driverPhone;
    const sameVehicle = String(candidate.vehicle_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === plate;
    return (sameRosterDriver || samePhone || sameVehicle) && bookingWindowsOverlap(booking, candidate);
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
    const compatible = vehicleModelSupportsCategory(driver.vehicle_model, booking.vehicle_category);
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

export function assignDriverToBooking(database, { supplierId, bookingId, supplierDriverId, manualDriver, actorId }) {
  const booking = bookingWithDuration(database, bookingId, supplierId);
  if (!booking) throw dispatchError("Booking was not found for this supplier", 404);
  if (String(booking.payment_status).toUpperCase() !== "PAID") throw dispatchError("A driver can be assigned only after payment is confirmed", 409);
  const assignmentAccepted = ["SUPPLIER_ACCEPTED", "LEGACY_ASSIGNED", "MANUAL_ASSIGNED", "AUTO_REALLOCATED"];
  if (!assignmentAccepted.includes(String(booking.supplier_assignment_status || "LEGACY_ASSIGNED").toUpperCase())) throw dispatchError("Accept this booking before assigning a driver", 409);
  if (!["confirmed", "driver_assigned"].includes(String(booking.status).toLowerCase())) throw dispatchError(`A driver cannot be assigned while booking is ${booking.status}`, 409);

  let driver;
  let source;
  if (supplierDriverId) {
    driver = database.prepare("SELECT * FROM supplier_drivers WHERE id = ? AND supplier_id = ?").get(supplierDriverId, supplierId);
    if (!driver) throw dispatchError("Choose a driver from your own fleet", 404);
    if (unavailableFleetStatuses.has(String(driver.status || "").toUpperCase())) throw dispatchError(`This driver is ${String(driver.status).toLowerCase()} and cannot be assigned`, 409);
    source = "FLEET";
  } else {
    driver = {
      driver_name: String(manualDriver?.driverName || "").trim(),
      driver_phone: manualDriver?.driverPhone,
      vehicle_model: String(manualDriver?.vehicleModel || "Commercial AC Vehicle").trim(),
      vehicle_number: manualDriver?.vehicleNumber,
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

  const existing = database.prepare("SELECT * FROM driver_assignments WHERE booking_id = ?").get(bookingId);
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
    const saved = database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignmentId);
    event(database, saved, {
      eventType: existing ? "REASSIGNED" : "ASSIGNED",
      previousStatus: existing?.assignment_status,
      newStatus: "ASSIGNED",
      actorId,
      details: existing ? { previousDriver: existing.driver_name, previousVehicle: existing.vehicle_number } : {},
    });
  })();
  return database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignmentId);
}

export function updateDispatchStatus(database, { supplierId, bookingId, nextStatus, actorId, note, allowTripStart = false }) {
  const normalizedNext = String(nextStatus || "").toUpperCase();
  const assignment = database.prepare("SELECT * FROM driver_assignments WHERE booking_id = ? AND supplier_id = ?").get(bookingId, supplierId);
  if (!assignment) throw dispatchError("Assign a driver before updating dispatch", 409);
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
    if (normalizedNext === "TRIP_STARTED") database.prepare("UPDATE bookings SET status = 'in_progress' WHERE id = ?").run(bookingId);
    if (normalizedNext === "COMPLETED") {
      database.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(bookingId);
      database.prepare("UPDATE payouts SET payout_status = 'SCHEDULED' WHERE booking_id = ? AND payout_status = 'PAYMENT_HELD'").run(bookingId);
    }
    event(database, assignment, { eventType: "STATUS_CHANGED", previousStatus: current, newStatus: normalizedNext, actorId, note });
  })();
  return { assignment: database.prepare("SELECT * FROM driver_assignments WHERE id = ?").get(assignment.id), idempotent: false };
}

export function getDispatchTimeline(database, bookingId) {
  return database.prepare("SELECT * FROM driver_assignment_events WHERE booking_id = ? ORDER BY created_at, rowid").all(bookingId);
}
