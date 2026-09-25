import { nanoid } from "nanoid";
import { supplierDayAvailability } from "./supplierBookingService.js";

/**
 * Departures board and crew assignment (ADR 037, docs/SUPPLIER_OPERATIONS.md).
 *
 * A departure is a product on a date at a time: the same key as the guest list.
 * The board merges what the inventory offers (seat slots per option) with what
 * is booked, so a departure with bookings but no seat inventory still shows.
 * Guides, vehicles and equipment are shared resources assigned to a departure.
 */

const MAX_DAYS = 14;

function boardError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

const departureKey = (productId, date, time) => `${productId}|${date}|${time || ""}`;

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * The departures a guide may see and check in, or null when the login is not
 * linked to a guide resource (then the guide role's normal access applies).
 */
export function guideDepartureScope(db, supplierId, userId) {
  const linked = db.prepare("SELECT id FROM native_resources WHERE supplier_id = ? AND user_id = ? AND kind = 'GUIDE'").all(supplierId, userId);
  if (!linked.length) return null;
  const rows = db.prepare(`SELECT a.product_id, a.activity_date, a.departure_time FROM departure_assignments a
    JOIN native_resources r ON r.id = a.resource_id
    WHERE a.supplier_id = ? AND r.user_id = ? AND r.kind = 'GUIDE'`).all(supplierId, userId);
  return new Set(rows.map((row) => departureKey(row.product_id, row.activity_date, row.departure_time)));
}

/** Throws unless the booking's departure is in the guide's scope (null scope allows all). */
export function requireDepartureInScope(scope, booking) {
  if (!scope) return;
  if (!scope.has(departureKey(booking.product_id, booking.activity_date, booking.pickup_time))) {
    throw boardError("This booking is on a departure you're not assigned to", 403, "NOT_YOUR_DEPARTURE");
  }
}

function assignmentsBetween(db, supplierId, from, to) {
  return db.prepare(`SELECT a.id, a.product_id, a.activity_date, a.departure_time, a.resource_id, r.name, r.kind, r.user_id
    FROM departure_assignments a JOIN native_resources r ON r.id = a.resource_id
    WHERE a.supplier_id = ? AND a.activity_date BETWEEN ? AND ?
    ORDER BY CASE r.kind WHEN 'GUIDE' THEN 0 WHEN 'VEHICLE' THEN 1 WHEN 'EQUIPMENT' THEN 2 ELSE 3 END, r.name`).all(supplierId, from, to);
}

/**
 * Every departure from `from` for `days` days (1 to 14), with seats, head
 * counts, attendance and assigned resources. `scope` (from guideDepartureScope)
 * limits it to a guide's own departures.
 */
export function departureBoard(db, supplierId, { from, days = 1, listAvailability, scope = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))) throw boardError("Choose a date as YYYY-MM-DD", 400, "VALIDATION_ERROR");
  const span = Math.min(Math.max(Number.parseInt(days, 10) || 1, 1), MAX_DAYS);
  const to = addDays(from, span - 1);
  const departures = new Map();
  const departureFor = (productId, title, date, time) => {
    const key = departureKey(productId, date, time);
    if (!departures.has(key)) {
      departures.set(key, {
        key, productId, title, date, time: time || null,
        options: [], capacity: 0, freeSeats: 0,
        bookings: 0, guests: 0, checkedIn: 0, noShow: 0, balanceDueInr: 0,
        assignments: [],
      });
    }
    return departures.get(key);
  };

  for (let offset = 0; offset < span; offset += 1) {
    const date = addDays(from, offset);
    for (const option of supplierDayAvailability(db, supplierId, date, listAvailability)) {
      for (const slot of option.departures || []) {
        const departure = departureFor(option.productId, option.title, date, slot.localTime);
        departure.options.push({ optionId: option.optionId, optionName: option.optionName, capacity: Number(slot.capacity || 0), vacancies: Number(slot.vacancies || 0), status: slot.status });
        departure.capacity += Number(slot.capacity || 0);
        departure.freeSeats += Number(slot.vacancies || 0);
      }
    }
  }

  const booked = db.prepare(`SELECT b.product_id, p.title, b.activity_date, b.pickup_time,
      COUNT(*) AS bookings,
      SUM(COALESCE(b.adults, 0) + COALESCE(b.children, 0)) AS guests,
      SUM(CASE WHEN b.attendance_status = 'CHECKED_IN' THEN COALESCE(b.adults, 0) + COALESCE(b.children, 0) ELSE 0 END) AS checked_in,
      SUM(CASE WHEN b.attendance_status = 'NO_SHOW' THEN COALESCE(b.adults, 0) + COALESCE(b.children, 0) ELSE 0 END) AS no_show,
      SUM(COALESCE(b.balance_due_inr, 0)) AS balance_due
    FROM bookings b JOIN products p ON p.id = b.product_id
    WHERE b.supplier_id = ? AND b.activity_date BETWEEN ? AND ? AND LOWER(b.status) NOT IN ('cancelled', 'pending_payment')
    GROUP BY b.product_id, p.title, b.activity_date, b.pickup_time`).all(supplierId, from, to);
  for (const row of booked) {
    const departure = departureFor(row.product_id, row.title, row.activity_date, row.pickup_time);
    Object.assign(departure, {
      bookings: Number(row.bookings || 0),
      guests: Number(row.guests || 0),
      checkedIn: Number(row.checked_in || 0),
      noShow: Number(row.no_show || 0),
      balanceDueInr: Number(row.balance_due || 0),
    });
  }

  for (const row of assignmentsBetween(db, supplierId, from, to)) {
    const departure = departures.get(departureKey(row.product_id, row.activity_date, row.departure_time));
    const assignment = { id: row.id, resourceId: row.resource_id, name: row.name, kind: row.kind };
    if (departure) departure.assignments.push(assignment);
  }

  const list = [...departures.values()]
    .filter((departure) => !scope || scope.has(departure.key))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")) || a.title.localeCompare(b.title));
  // A guide doesn't see what guests owe (ADR 036).
  if (scope) for (const departure of list) departure.balanceDueInr = null;
  return { from, to, days: span, departures: list };
}

/** Puts a resource on a departure. One resource works one departure per date and time. */
export function assignResource(db, supplierId, { productId, date, time = null, resourceId }, actor = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw boardError("Choose a date as YYYY-MM-DD", 400, "VALIDATION_ERROR");
  const product = db.prepare("SELECT id FROM products WHERE id = ? AND supplier_id = ?").get(productId, supplierId);
  if (!product) throw boardError("Product was not found for this supplier", 404, "PRODUCT_NOT_FOUND");
  const resource = db.prepare("SELECT id, name FROM native_resources WHERE id = ? AND supplier_id = ?").get(resourceId, supplierId);
  if (!resource) throw boardError("Resource not found", 404, "RESOURCE_NOT_FOUND");
  const departureTime = time || "";

  return db.transaction(() => {
    const busy = db.prepare(`SELECT a.product_id, p.title FROM departure_assignments a JOIN products p ON p.id = a.product_id
      WHERE a.resource_id = ? AND a.activity_date = ? AND a.departure_time = ?`).get(resourceId, date, departureTime);
    if (busy) {
      if (busy.product_id === productId) throw boardError(`${resource.name} is already on this departure`, 409, "ALREADY_ASSIGNED");
      throw boardError(`${resource.name} is already on ${busy.title} at this time`, 409, "RESOURCE_BUSY");
    }
    const id = `dasg_${nanoid(12)}`;
    db.prepare(`INSERT INTO departure_assignments (id, supplier_id, product_id, activity_date, departure_time, resource_id, assigned_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, supplierId, productId, date, departureTime, resourceId, actor?.id || null);
    return { id, productId, date, time: time || null, resourceId, name: resource.name };
  })();
}

export function unassignResource(db, supplierId, assignmentId) {
  const removed = db.prepare("DELETE FROM departure_assignments WHERE id = ? AND supplier_id = ?").run(assignmentId, supplierId);
  if (!removed.changes) throw boardError("Assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
  return { id: assignmentId, removed: true };
}

/** Bookings and guests per day for one month (`YYYY-MM`), for the booking calendar. */
export function bookingCalendar(db, supplierId, { month }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw boardError("Choose a month as YYYY-MM", 400, "VALIDATION_ERROR");
  const rows = db.prepare(`SELECT activity_date, COUNT(*) AS bookings, SUM(COALESCE(adults, 0) + COALESCE(children, 0)) AS guests,
      COUNT(DISTINCT product_id || '|' || COALESCE(pickup_time, '')) AS departures
    FROM bookings WHERE supplier_id = ? AND activity_date BETWEEN ? AND ? AND LOWER(status) NOT IN ('cancelled', 'pending_payment')
    GROUP BY activity_date ORDER BY activity_date`).all(supplierId, `${month}-01`, `${month}-31`);
  return {
    month,
    days: rows.map((row) => ({ date: row.activity_date, bookings: Number(row.bookings || 0), guests: Number(row.guests || 0), departures: Number(row.departures || 0) })),
  };
}
