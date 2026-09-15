import { saveSlotOverride } from "./nativeInventoryService.js";
import { creditSupplierCancellationToWallet } from "./refundCreditService.js";
import { onReferralBookingCancelled } from "./referralService.js";

/**
 * Supplier day-of-operations (docs/SUPPLIER_OPERATIONS.md): check travelers in by
 * scanning the voucher QR, mark no-shows, print the guest list for a departure,
 * and cancel a whole departure at once.
 *
 * A departure is one product on one date, optionally at one time (bookings.pickup_time).
 */

export const ATTENDANCE_STATUSES = ["CHECKED_IN", "NO_SHOW", "NONE"];

const departureError = (message, status, code) => Object.assign(new Error(message), { status, code });

/** The calendar date in India, which is the date travelers and suppliers see on vouchers. */
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The booking reference from what a scanner read: the voucher QR holds a
 * `/booking-confirmed/<ref>` link, and a typed code is the reference itself.
 */
export function parseBookingReference(code) {
  let value = String(code || "").trim();
  const marker = value.indexOf("/booking-confirmed/");
  if (marker >= 0) {
    value = value.slice(marker + "/booking-confirmed/".length).split(/[/?#]/)[0];
    try { value = decodeURIComponent(value); } catch { return null; }
  }
  value = value.trim();
  return /^[A-Za-z0-9_-]{3,80}$/.test(value) ? value : null;
}

function summary(booking) {
  return {
    id: booking.id,
    ref: booking.ref,
    travelerName: booking.traveler_name,
    adults: Number(booking.adults || 0),
    children: Number(booking.children || 0),
    productTitle: booking.product_title || null,
    variantName: booking.variant_name || null,
    activityDate: booking.activity_date,
    pickupTime: booking.pickup_time || null,
    status: booking.status,
    attendanceStatus: booking.attendance_status || null,
    checkedInAt: booking.checked_in_at || null,
  };
}

function findSupplierBooking(db, supplierId, reference) {
  return db.prepare(`SELECT b.*, p.title AS product_title FROM bookings b LEFT JOIN products p ON p.id = b.product_id
    WHERE (b.id = ? OR UPPER(b.ref) = UPPER(?)) AND b.supplier_id = ?`).get(reference, reference, supplierId);
}

function requireAttendable(booking) {
  const status = String(booking.status || "").toLowerCase();
  if (status === "cancelled") throw departureError(`Booking ${booking.ref} was cancelled`, 409, "BOOKING_CANCELLED");
  if (status === "pending_payment") throw departureError(`Booking ${booking.ref} has not been paid`, 409, "BOOKING_NOT_PAID");
}

/**
 * Checks a traveler in from a scanned voucher or a typed reference. A voucher for
 * another date is refused unless the supplier confirms it; a second scan reports
 * when the booking was first checked in instead of recording it again.
 */
export function checkInBooking(db, { supplierId, code, actorId = null, allowOtherDate = false, now = new Date() }) {
  const reference = parseBookingReference(code);
  if (!reference) throw departureError("This is not an Idea Holiday booking code", 400, "INVALID_CODE");
  const booking = findSupplierBooking(db, supplierId, reference);
  if (!booking) throw departureError("No booking with this reference belongs to your business", 404, "BOOKING_NOT_FOUND");
  requireAttendable(booking);

  const today = indiaDate(now);
  if (booking.activity_date !== today && !allowOtherDate) {
    throw departureError(`Booking ${booking.ref} is for ${booking.activity_date}, not today`, 409, "WRONG_DATE");
  }
  if (booking.attendance_status === "CHECKED_IN") return { alreadyCheckedIn: true, booking: summary(booking) };

  const checkedInAt = now.toISOString();
  db.prepare("UPDATE bookings SET attendance_status = 'CHECKED_IN', checked_in_at = ?, checked_in_by = ? WHERE id = ?").run(checkedInAt, actorId, booking.id);
  return { alreadyCheckedIn: false, booking: summary({ ...booking, attendance_status: "CHECKED_IN", checked_in_at: checkedInAt }) };
}

/**
 * Records attendance from the guest list: checked in, no-show, or cleared (NONE)
 * to undo a mistake. A no-show can only be recorded once the departure date has come.
 */
export function setAttendance(db, { supplierId, bookingId, status, actorId = null, now = new Date() }) {
  if (!ATTENDANCE_STATUSES.includes(status)) throw departureError("Unknown attendance status", 400, "INVALID_ATTENDANCE");
  const booking = findSupplierBooking(db, supplierId, bookingId);
  if (!booking) throw departureError("Booking was not found for this supplier", 404, "BOOKING_NOT_FOUND");
  requireAttendable(booking);
  if (status === "NO_SHOW" && booking.activity_date > indiaDate(now)) {
    throw departureError("A traveler can only be marked as a no-show on or after the trip date", 409, "TOO_EARLY");
  }

  const next = status === "NONE"
    ? { attendance_status: null, checked_in_at: null, checked_in_by: null }
    : { attendance_status: status, checked_in_at: now.toISOString(), checked_in_by: actorId };
  db.prepare("UPDATE bookings SET attendance_status = ?, checked_in_at = ?, checked_in_by = ? WHERE id = ?")
    .run(next.attendance_status, next.checked_in_at, next.checked_in_by, booking.id);
  return summary({ ...booking, ...next });
}

function requireSupplierProduct(db, supplierId, productId) {
  const product = db.prepare("SELECT id, title, product_type FROM products WHERE id = ? AND supplier_id = ?").get(productId, supplierId);
  if (!product) throw departureError("Product was not found for this supplier", 404, "PRODUCT_NOT_FOUND");
  return product;
}

const guests = (rows) => rows.reduce((sum, row) => sum + Number(row.adults || 0) + Number(row.children || 0), 0);

/** Who is booked on a departure, with head counts and attendance so far. Unpaid and cancelled bookings are left out. */
export function departureManifest(db, { supplierId, productId, date, time = null }) {
  const product = requireSupplierProduct(db, supplierId, productId);
  const rows = db.prepare(`SELECT id, ref, traveler_name, traveler_phone, adults, children, pickup_time, pickup_location,
      special_requests, variant_name, status, attendance_status, checked_in_at
    FROM bookings WHERE supplier_id = ? AND product_id = ? AND activity_date = ?
    ORDER BY pickup_time, traveler_name, ref`).all(supplierId, productId, date);
  const live = rows.filter((row) => !["cancelled", "pending_payment"].includes(String(row.status || "").toLowerCase()));
  const departureTimes = [...new Set(live.map((row) => row.pickup_time).filter(Boolean))].sort();
  const booked = time ? live.filter((row) => row.pickup_time === time) : live;

  return {
    product: { id: product.id, title: product.title, productType: product.product_type },
    date,
    time: time || null,
    departureTimes,
    totals: {
      bookings: booked.length,
      guests: guests(booked),
      checkedIn: guests(booked.filter((row) => row.attendance_status === "CHECKED_IN")),
      noShow: guests(booked.filter((row) => row.attendance_status === "NO_SHOW")),
      cancelledBookings: rows.filter((row) => String(row.status || "").toLowerCase() === "cancelled" && (!time || row.pickup_time === time)).length,
    },
    bookings: booked.map((row) => ({
      id: row.id,
      ref: row.ref,
      travelerName: row.traveler_name,
      travelerPhone: row.traveler_phone,
      adults: Number(row.adults || 0),
      children: Number(row.children || 0),
      pickupTime: row.pickup_time || null,
      pickupLocation: row.pickup_location || null,
      specialRequests: row.special_requests || null,
      variantName: row.variant_name || null,
      status: row.status,
      attendanceStatus: row.attendance_status || null,
      checkedInAt: row.checked_in_at || null,
    })),
  };
}

// A cell starting with = + - @ would run as a formula in Excel or Sheets. A plain phone number stays as it is.
function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^\+[\d\s-]+$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function manifestCsv(manifest) {
  const header = ["Reference", "Traveler", "Phone", "Adults", "Children", "Time", "Pickup", "Option", "Special requests", "Attendance"];
  const lines = manifest.bookings.map((row) => [
    row.ref, row.travelerName, row.travelerPhone, row.adults, row.children, row.pickupTime, row.pickupLocation,
    row.variantName, row.specialRequests, row.attendanceStatus === "CHECKED_IN" ? "Checked in" : row.attendanceStatus === "NO_SHOW" ? "No-show" : "",
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Cancels one booking on the supplier's side. A paid booking is refunded in full to the
 * traveler's wallet (ADR 019); an unpaid one is simply cancelled. The caller notifies the traveler.
 */
export function cancelBookingBySupplier(db, { booking, reason, notes = null }) {
  if (booking.payment_status === "PAID") return creditSupplierCancellationToWallet(db, { booking, reason, notes });
  db.transaction(() => {
    db.prepare("UPDATE bookings SET status = 'cancelled', cancellation_reason = ? WHERE id = ?").run(reason, booking.id);
    db.prepare("UPDATE payouts SET payout_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
    db.prepare("UPDATE driver_assignments SET assignment_status = 'CANCELLED' WHERE booking_id = ?").run(booking.id);
  })();
  onReferralBookingCancelled(db, booking.id, { reason: "Cancelled by supplier" });
  return null;
}

/** Seat-inventory options of a product that run this departure, so it can be closed for sale. */
function optionsRunning(db, productId, time) {
  let rows;
  try { rows = db.prepare("SELECT * FROM native_inventory_rules WHERE product_id = ?").all(productId); }
  catch (error) { if (/no such table|does not exist/i.test(error.message)) return []; throw error; }
  return rows
    .filter((rules) => {
      if (!time) return true;
      try { return JSON.parse(rules.departure_times || "[]").includes(time); } catch { return false; }
    });
}

/**
 * Cancels every booking on a departure (bad weather, too few travelers) and closes it
 * for sale, all or nothing. Each paid booking is refunded in full to the traveler's
 * wallet, exactly as a single supplier cancellation. `dryRun` returns what would happen.
 */
export function cancelDeparture(db, { supplierId, productId, date, time = null, reason, notes = null, dryRun = false, now = new Date() }) {
  requireSupplierProduct(db, supplierId, productId);
  if (date < indiaDate(now)) throw departureError("A departure that has already happened cannot be cancelled", 409, "DEPARTURE_IN_PAST");

  const load = () => db.prepare(`SELECT * FROM bookings WHERE supplier_id = ? AND product_id = ? AND activity_date = ?
    AND LOWER(status) <> 'cancelled'${time ? " AND pickup_time = ?" : ""} ORDER BY created_at, id`)
    .all(...[supplierId, productId, date, ...(time ? [time] : [])]);

  const plan = (bookings, options) => {
    const started = bookings.filter((booking) => ["in_progress", "completed"].includes(String(booking.status).toLowerCase()));
    if (started.length) {
      throw departureError(`Already started or finished on this departure: ${started.map((booking) => booking.ref).join(", ")}`, 409, "DEPARTURE_STARTED");
    }
    const paid = bookings.filter((booking) => booking.payment_status === "PAID");
    return {
      date,
      time: time || null,
      bookings: bookings.length,
      guests: guests(bookings),
      paidBookings: paid.length,
      walletRefundInr: paid.reduce((sum, booking) => sum + Number(booking.amount_inr || 0), 0),
      closesOptions: options.length,
    };
  };

  if (dryRun) return { ...plan(load(), optionsRunning(db, productId, time)), dryRun: true, cancelled: [] };

  return db.transaction(() => {
    // Lock the product first, as seat holds do, so no booking lands on the departure while it closes.
    db.prepare("UPDATE products SET id = id WHERE id = ?").run(productId);
    const bookings = load();
    const options = optionsRunning(db, productId, time);
    const outcome = plan(bookings, options);
    if (!bookings.length && !options.length) throw departureError("There are no bookings or seat inventory to cancel on this departure", 409, "NOTHING_TO_CANCEL");

    for (const rules of options) {
      saveSlotOverride(db, productId, rules.option_id, { localDate: date, localTime: time || "", closed: true, note: reason.slice(0, 280) });
    }
    const cancelled = bookings.map((booking) => {
      const wallet = cancelBookingBySupplier(db, { booking, reason, notes });
      return { id: booking.id, ref: booking.ref, walletCreditInr: wallet?.creditInr ?? null };
    });
    return { ...outcome, dryRun: false, cancelled };
  })();
}
