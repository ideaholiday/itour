import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { assignDriverToBooking, bookingWindow, bookingWithDuration, getFleetAvailability, updateDispatchStatus, verifyPickupOtp } from './driverDispatchService.js';
import { dispatchTransaction, scheduleKey, departureKey, enqueueDispatch, revokeAssignment, isCancelledBooking } from './dispatchStateService.js';

const active = b => b.payment_status === 'PAID' && ['confirmed', 'driver_assigned'].includes(String(b.status).toLowerCase()) && ['SUPPLIER_ACCEPTED','LEGACY_ASSIGNED','MANUAL_ASSIGNED','AUTO_REALLOCATED','RESCHEDULE_RECONFIRMED'].includes(b.supplier_assignment_status || 'LEGACY_ASSIGNED');
const error = (message, status = 409) => Object.assign(new Error(message), { status });

export function driverAccessToken(assignment) {
  if (!process.env.JWT_SECRET) throw error('Driver access signing is not configured', 503);
  return `${assignment.id}.${createHmac('sha256', process.env.JWT_SECRET).update(`driver:${assignment.id}:${assignment.revision}:${assignment.schedule_key}`).digest('hex')}`;
}
export function driverTripUrl(assignment) {
  return `${String(process.env.PUBLIC_APP_URL || 'https://ideaholiday.in').replace(/\/$/, '')}/driver/trip#${driverAccessToken(assignment)}`;
}
export function currentDriverAssignment(db, assignmentId, revision, now = new Date()) {
  const assignment = db.prepare('SELECT * FROM driver_assignments WHERE id = ?').get(assignmentId);
  if (!assignment || !assignment.revision || assignment.revision !== revision || assignment.assignment_status === 'CANCELLED') throw error('This driver assignment is no longer available', 401);
  const booking = bookingWithDuration(db, assignment.booking_id, assignment.supplier_id);
  if (!booking || booking.payment_status !== 'PAID' || isCancelledBooking(booking) || scheduleKey(booking) !== assignment.schedule_key || now.getTime() > bookingWindow(booking).end + 24 * 3600000) throw error('This trip link has expired or the schedule changed', 401);
  return { assignment, booking };
}
export function exchangeDriverLink(db, token) {
  const assignment = db.prepare('SELECT * FROM driver_assignments WHERE id = ?').get(String(token).split('.')[0]);
  if (!assignment?.revision) throw error('Invalid driver link', 401);
  const expected = Buffer.from(driverAccessToken(assignment));
  const actual = Buffer.from(String(token));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw error('Invalid driver link', 401);
  currentDriverAssignment(db, assignment.id, assignment.revision);
  return jwt.sign({ assignmentId: assignment.id, revision: assignment.revision }, process.env.JWT_SECRET, { audience: 'driver-trip', issuer: 'idea-holiday', expiresIn: '12h' });
}
export function authenticateDriver(db, token) {
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'driver-trip', issuer: 'idea-holiday' }); }
  catch { throw error('Driver session expired. Reopen your trip link.', 401); }
  return currentDriverAssignment(db, payload.assignmentId, payload.revision);
}

// Each lost driver (decline, timeout, reassignment) starts a new episode, so the
// supplier and operations are alerted again instead of the alert being deduped.
// `stage` names a one-off alert for the booking's schedule, such as the 24-hour deadline.
const PRIORITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

// Default ladder: supplier and operations at 24 hours, CRITICAL escalation at 12,
// operations take over at 6. Override with DISPATCH_ESCALATION_HOURS="24,12,6".
export function escalationStages(value = process.env.DISPATCH_ESCALATION_HOURS) {
  const hours = [...new Set(String(value || '24,12,6').split(',').map(Number).filter(h => Number.isFinite(h) && h > 0))].sort((a, b) => b - a);
  const ladder = hours.length ? hours : [24, 12, 6];
  return ladder.map((h, index) => ({
    hours: h,
    stage: `T${h}`,
    priority: index === 0 ? 'HIGH' : 'CRITICAL',
    reason: index === 0
      ? `${h}-hour deadline: driver confirmation required`
      : index === ladder.length - 1
        ? `${h} hours to pickup without a confirmed driver: Idea Holiday operations to take over assignment`
        : `${h} hours to pickup without a confirmed driver: escalated to Idea Holiday operations`,
  }));
}

export function dispatchException(db, booking, reason, now = new Date(), { stage = null, skipIfAlertedSince = null, priority = 'HIGH' } = {}) {
  const existing = db.prepare("SELECT id, priority FROM staff_tasks WHERE booking_id = ? AND task_type = 'DRIVER_ASSIGNMENT_REQUIRED' AND status = 'OPEN'").get(booking.id);
  // Priority only rises: a later "driver declined" must not calm a CRITICAL escalation.
  const effective = (PRIORITY_RANK[existing?.priority] ?? -1) > PRIORITY_RANK[priority] ? existing.priority : priority;
  if (existing) db.prepare('UPDATE staff_tasks SET notes = ?, priority = ? WHERE id = ?').run(reason, effective, existing.id);
  else db.prepare(`INSERT INTO staff_tasks (id, task_type, booking_id, supplier_id, priority, status, notes) VALUES (?, 'DRIVER_ASSIGNMENT_REQUIRED', ?, ?, ?, 'OPEN', ?)`).run(randomUUID(), booking.id, booking.supplier_id, effective, reason);
  if (skipIfAlertedSince && db.prepare("SELECT 1 FROM dispatch_outbox WHERE booking_id = ? AND schedule_key = ? AND event_type = 'ASSIGNMENT_REQUIRED' AND available_at >= ?").get(booking.id, scheduleKey(booking), skipIfAlertedSince)) return;
  const episode = db.prepare("SELECT COUNT(*) AS n FROM driver_assignment_events WHERE booking_id = ? AND event_type = 'REVOKED'").get(booking.id).n;
  enqueueDispatch(db, booking, null, 'ASSIGNMENT_REQUIRED', { now, payload: { reason }, occurrence: stage || `e${episode}` });
}

export const DISPATCH_SETTING_DEFAULTS = Object.freeze({ lead_hours: 48, response_minutes: 30, max_attempts: 3, buffer_minutes: 30 });

// Automatic assignment is on unless the supplier switched it off (a saved settings row)
// or the platform default is turned off with DISPATCH_AUTO_DEFAULT=false.
export function effectiveDispatchSettings(db, supplierId) {
  const row = db.prepare('SELECT * FROM dispatch_settings WHERE supplier_id = ?').get(supplierId);
  if (row) return { ...DISPATCH_SETTING_DEFAULTS, ...row, automatic_enabled: Number(row.automatic_enabled) ? 1 : 0, source: 'SUPPLIER' };
  const defaultOn = String(process.env.DISPATCH_AUTO_DEFAULT ?? 'true').toLowerCase() !== 'false';
  return { supplier_id: supplierId, ...DISPATCH_SETTING_DEFAULTS, automatic_enabled: defaultOn ? 1 : 0, source: 'DEFAULT' };
}

// What stops each fleet driver from being picked automatically.
export function dispatchReadiness(db, supplierId) {
  const drivers = db.prepare('SELECT id, driver_name, vehicle_number, driver_email, seat_capacity, status FROM supplier_drivers WHERE supplier_id = ? ORDER BY driver_name').all(supplierId).map(d => {
    const missing = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.driver_email || ''))) missing.push('driver email');
    if (!(Number(d.seat_capacity) >= 1)) missing.push('seat capacity');
    const status = String(d.status || 'AVAILABLE').toUpperCase();
    return { id: d.id, driver_name: d.driver_name, vehicle_number: d.vehicle_number, status, missing, ready: !missing.length && !['INACTIVE', 'SUSPENDED'].includes(status) };
  });
  return { total: drivers.length, ready: drivers.filter(d => d.ready).length, drivers };
}

const RELIABILITY_PRIOR = { rate: 0.8, weight: 5 };
const NEUTRAL_RATING = 4.5;

// Among eligible drivers: the supplier's priority first, then a 0-100 score built from
// acceptance reliability (declines and timeouts in the last 90 days, smoothed so a new
// driver starts at 80%), review rating, and how many trips the driver already has that day.
export function rankDriverCandidates(db, booking, candidates, now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  return candidates.map(d => {
    const history = db.prepare(`SELECT
        SUM(CASE WHEN event_type IN ('ACCEPT', 'ACCEPT_BY_PHONE') THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN event_type IN ('DECLINE', 'TIMED_OUT') THEN 1 ELSE 0 END) AS refused
      FROM driver_assignment_events WHERE supplier_driver_id = ? AND created_at >= ?`).get(d.id, since);
    const accepted = Number(history?.accepted || 0), refused = Number(history?.refused || 0);
    const reliability = (accepted + RELIABILITY_PRIOR.rate * RELIABILITY_PRIOR.weight) / (accepted + refused + RELIABILITY_PRIOR.weight);
    const rated = db.prepare("SELECT smoothed_rating FROM quality_scores WHERE entity_type = 'DRIVER' AND entity_id = ?").get(d.id);
    const rating = Number(rated?.smoothed_rating) || NEUTRAL_RATING;
    const sameDayTrips = db.prepare(`SELECT COUNT(*) AS n FROM driver_assignments da JOIN bookings b ON b.id = da.booking_id
      WHERE da.supplier_driver_id = ? AND b.activity_date = ? AND b.id <> ? AND da.assignment_status NOT IN ('CANCELLED', 'COMPLETED')`).get(d.id, booking.activity_date, booking.id).n;
    const components = {
      reliability: Math.round(reliability * 50),
      rating: Math.round(Math.max(0, Math.min(1, (rating - 1) / 4)) * 30),
      availability: Math.round((1 - Math.min(Number(sameDayTrips), 4) / 4) * 20),
    };
    return { ...d, score: components.reliability + components.rating + components.availability, score_breakdown: { ...components, accepted, refused, ratingValue: rating, sameDayTrips: Number(sameDayTrips), priority: Number(d.dispatch_priority || 0) } };
  }).sort((a, b) => Number(b.dispatch_priority || 0) - Number(a.dispatch_priority || 0) || b.score - a.score || String(a.id).localeCompare(String(b.id)));
}

// Open staff work for a trip that is not progressing. Priority only rises, like dispatch exceptions.
function tripTask(db, booking, taskType, reason, priority) {
  const existing = db.prepare("SELECT id, priority FROM staff_tasks WHERE booking_id = ? AND task_type = ? AND status = 'OPEN'").get(booking.id, taskType);
  const effective = (PRIORITY_RANK[existing?.priority] ?? -1) > PRIORITY_RANK[priority] ? existing.priority : priority;
  if (existing) db.prepare('UPDATE staff_tasks SET notes = ?, priority = ? WHERE id = ?').run(reason, effective, existing.id);
  else db.prepare('INSERT INTO staff_tasks (id, task_type, booking_id, supplier_id, priority, status, notes) VALUES (?, ?, ?, ?, ?, \'OPEN\', ?)').run(randomUUID(), taskType, booking.id, booking.supplier_id, effective, reason);
}

export const TRIP_WATCH = Object.freeze({ notStartedMinutes: 60, overdueHours: 2, opsOverdueHours: 6 });

// Trips that never started an hour after pickup, or were started and never completed
// 2 hours (driver and supplier) and 6 hours (operations) after their expected end.
// Without completion the payout is never scheduled, so these must not be left silent.
export function processTripWatch(db, { now = new Date(), supplierId = null } = {}) {
  const rows = db.prepare(`SELECT b.id FROM bookings b JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.payment_status = 'PAID' AND LOWER(b.status) IN ('driver_assigned', 'in_progress')
      AND da.acknowledgement = 'ACCEPTED' AND da.assignment_status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'TRIP_STARTED')
      ${supplierId ? 'AND b.supplier_id = ?' : ''}`).all(...(supplierId ? [supplierId] : []));
  let alerts = 0;
  for (const { id } of rows) {
    const assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(id);
    const booking = bookingWithDuration(db, id, assignment.supplier_id);
    if (!booking) continue;
    let window;
    try { window = bookingWindow(booking); } catch { continue; }
    const at = now.getTime();
    const raise = (taskType, eventType, stage, priority, reason) => {
      tripTask(db, booking, taskType, reason, priority);
      const queued = enqueueDispatch(db, booking, assignment, eventType, { now, payload: { reason }, occurrence: stage });
      if (queued) alerts++;
    };
    if (assignment.assignment_status === 'TRIP_STARTED') {
      if (at >= window.end + TRIP_WATCH.opsOverdueHours * 3600000) raise('TRIP_COMPLETION_OVERDUE', 'TRIP_OVERDUE_OPS', 'END+6', 'CRITICAL', `Trip still open ${TRIP_WATCH.opsOverdueHours} hours after its expected end: operations to confirm completion`);
      else if (at >= window.end + TRIP_WATCH.overdueHours * 3600000) raise('TRIP_COMPLETION_OVERDUE', 'TRIP_OVERDUE', 'END+2', 'HIGH', `Trip still open ${TRIP_WATCH.overdueHours} hours after its expected end: driver to mark it complete`);
    } else if (at >= window.start + TRIP_WATCH.notStartedMinutes * 60000) {
      raise('PICKUP_NOT_STARTED', 'PICKUP_NOT_STARTED', 'START+1', 'CRITICAL', `Pickup not started ${TRIP_WATCH.notStartedMinutes} minutes after pickup time (driver status: ${assignment.assignment_status.replaceAll('_', ' ').toLowerCase()})`);
    }
  }
  return { checked: rows.length, alerts };
}

// Operations actions for a trip that is stuck: start without the traveler's pickup OTP
// (phone dead, code lost) or confirm completion the driver never recorded. Both need a
// reason, which is stored on the dispatch status event.
export function operationsTripOverride(db, { bookingId, action, actorId, note }) {
  const reason = String(note || '').trim();
  if (reason.length < 3) throw error('A reason is required', 400);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? OR ref = ?').get(bookingId, bookingId);
  if (!booking) throw error('Booking not found', 404);
  const assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(booking.id);
  if (!assignment || assignment.assignment_status === 'CANCELLED') throw error('No driver is assigned to this booking');
  if (action === 'START') {
    if (!['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(assignment.assignment_status)) throw error(`Trip cannot be started while it is ${assignment.assignment_status.replaceAll('_', ' ').toLowerCase()}`);
    return updateDispatchStatus(db, { supplierId: booking.supplier_id, bookingId: booking.id, nextStatus: 'TRIP_STARTED', allowTripStart: true, actorId, note: `Started without pickup OTP by operations: ${reason}` }).assignment;
  }
  if (action === 'COMPLETE') {
    if (assignment.assignment_status !== 'TRIP_STARTED') throw error('Only a started trip can be completed');
    return updateDispatchStatus(db, { supplierId: booking.supplier_id, bookingId: booking.id, nextStatus: 'COMPLETED', actorId, note: `Completed by operations: ${reason}` }).assignment;
  }
  throw error('Unknown trip action', 400);
}

export function processDispatchSchedule(db, { now = new Date(), supplierId = null } = {}) {
  return dispatchTransaction(db, () => {
    const rows = db.prepare(`SELECT b.*, p.group_type FROM bookings b LEFT JOIN products p ON p.id = b.product_id
      WHERE LOWER(b.status) IN ('confirmed','driver_assigned','cancelled') ${supplierId ? 'AND b.supplier_id = ?' : ''} ORDER BY b.activity_date, b.pickup_time, b.id`).all(...(supplierId ? [supplierId] : []));
    let assigned = 0;
    for (const row of rows) {
      if (!row.supplier_id) continue;
      const booking = bookingWithDuration(db, row.id, row.supplier_id);
      let assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(row.id);
      const cancelled = isCancelledBooking(booking);
      if (assignment && (cancelled || (assignment.schedule_key && assignment.schedule_key !== scheduleKey(booking)))) {
        revokeAssignment(db, booking, assignment, cancelled ? 'Booking cancelled' : 'Trip schedule changed', now);
        if (!cancelled) db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(booking.id);
        assignment = null;
      }
      if (!active(booking)) continue;
      let window;
      try { window = bookingWindow(booking); } catch { dispatchException(db, booking, 'Valid pickup date and time required', now); continue; }
      if (window.start <= now.getTime()) {
        if (!assignment || assignment.acknowledgement !== 'ACCEPTED') dispatchException(db, booking, 'Pickup overdue without an accepted driver', now, { stage: 'OVERDUE', priority: 'CRITICAL' });
        continue;
      }
      const settings = effectiveDispatchSettings(db, booking.supplier_id);
      if (assignment?.acknowledgement === 'PENDING' && Date.parse(assignment.response_deadline) <= now.getTime()) {
        db.prepare(`INSERT INTO driver_assignment_events (id, assignment_id, booking_id, supplier_id, supplier_driver_id, event_type, actor_id, note) VALUES (?, ?, ?, ?, ?, 'TIMED_OUT', 'dispatch-worker', ?)`)
          .run(randomUUID(), assignment.id, booking.id, booking.supplier_id, assignment.supplier_driver_id || null, `No response by ${assignment.response_deadline}`);
        revokeAssignment(db, booking, assignment, 'Driver response timed out', now);
        db.prepare("UPDATE dispatch_attempts SET outcome = 'TIMED_OUT' WHERE booking_id = ? AND supplier_driver_id = ? AND schedule_key = ?").run(booking.id, assignment.supplier_driver_id, scheduleKey(booking));
        assignment = null;
      }
      if (assignment?.assignment_status === 'CANCELLED') assignment = null;
      // Nudge a driver who has used half of the response window without answering.
      if (assignment?.acknowledgement === 'PENDING') {
        const left = Date.parse(assignment.response_deadline) - now.getTime();
        if (left > 0 && left <= (settings.response_minutes || 30) * 30000) enqueueDispatch(db, booking, assignment, 'DRIVER_REQUEST_REMINDER', { now });
      }
      if (!assignment && settings.automatic_enabled && window.start - now.getTime() <= (settings.lead_hours || 48) * 3600000) {
        const attempts = db.prepare('SELECT * FROM dispatch_attempts WHERE booking_id = ? AND schedule_key = ?').all(booking.id, scheduleKey(booking));
        if (attempts.length < (settings.max_attempts || 3)) {
          const shared = departureKey(booking).startsWith('departure:') ? db.prepare("SELECT * FROM driver_assignments WHERE departure_key = ? AND assignment_status <> 'CANCELLED' ORDER BY assigned_at LIMIT 1").get(departureKey(booking)) : null;
          const eligible = getFleetAvailability(db, { supplierId: booking.supplier_id, bookingId: booking.id })
            .filter(d => d.available && d.driver_email && Number(d.seat_capacity) > 0 && !attempts.some(a => a.supplier_driver_id === d.id) && (!shared || shared.supplier_driver_id === d.id));
          for (const candidate of rankDriverCandidates(db, booking, eligible, now)) {
            try {
              assignment = assignDriverToBooking(db, { supplierId: booking.supplier_id, bookingId: booking.id, supplierDriverId: candidate.id, automatic: true, actorId: 'dispatch-worker', now,
                assignmentDetails: { automatic: true, score: candidate.score, scoreBreakdown: candidate.score_breakdown, candidates: eligible.length } });
              db.prepare('INSERT INTO dispatch_attempts (id, booking_id, schedule_key, supplier_driver_id, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), booking.id, scheduleKey(booking), candidate.id, 'REQUESTED', now.toISOString());
              enqueueDispatch(db, booking, assignment, 'DRIVER_AUTO_ASSIGNED', { now });
              assigned++;
              break;
            } catch (err) { if (!err.status || err.status >= 500) throw err; }
          }
        }
        if (!assignment) dispatchException(db, booking, attempts.length >= (settings.max_attempts || 3) ? 'Driver response attempts exhausted; assign manually' : 'No eligible driver and vehicle; assign manually', now);
      }
      const accepted = assignment?.acknowledgement === 'ACCEPTED';
      // A driver confirmed inside a reminder window already sent the traveler and driver the same details.
      const acceptedSince = cutoff => accepted && assignment.acknowledged_at && Date.parse(assignment.acknowledged_at) >= cutoff;
      if (window.start - now.getTime() <= 2 * 3600000 && accepted && assignment.assignment_status === 'ASSIGNED' && !acceptedSince(window.start - 2 * 3600000)) {
        enqueueDispatch(db, booking, assignment, 'DRIVER_PICKUP_REMINDER', { now });
      }
      if (window.start - now.getTime() <= 24 * 3600000) {
        if (!acceptedSince(window.start - 24 * 3600000)) enqueueDispatch(db, booking, accepted ? assignment : null, 'PRE_TRIP_REMINDER', { now });
      }
      // Escalate at the tightest stage reached: one alert per stage per schedule, skipped when
      // another alert already went out inside that stage's window. The task priority still rises.
      const stage = escalationStages().filter(s => window.start - now.getTime() <= s.hours * 3600000).at(-1);
      if (stage && !accepted) {
        dispatchException(db, booking, stage.reason, now, { stage: stage.stage, priority: stage.priority, skipIfAlertedSince: new Date(window.start - stage.hours * 3600000).toISOString() });
      }
    }
    const trips = processTripWatch(db, { now, supplierId });
    return { checked: rows.length, assigned, tripAlerts: trips.alerts };
  });
}

function acceptAssignmentLocked(db, booking, assignment, { now, eventType, actorId, note }) {
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED', acknowledged_at = ? WHERE id = ?").run(now.toISOString(), assignment.id);
  db.prepare("UPDATE staff_tasks SET status = 'COMPLETED' WHERE booking_id = ? AND task_type = 'DRIVER_ASSIGNMENT_REQUIRED' AND status = 'OPEN'").run(booking.id);
  enqueueDispatch(db, booking, assignment, 'DRIVER_CONFIRMED', { now });
  db.prepare(`INSERT INTO driver_assignment_events (id, assignment_id, booking_id, supplier_id, supplier_driver_id, event_type, actor_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), assignment.id, booking.id, booking.supplier_id, assignment.supplier_driver_id || null, eventType, actorId, note || null);
  db.prepare("UPDATE dispatch_attempts SET outcome = 'ACCEPTED' WHERE booking_id = ? AND supplier_driver_id = ? AND schedule_key = ?").run(booking.id, assignment.supplier_driver_id, assignment.schedule_key);
}

// For drivers without a smartphone: the supplier or operations call the driver and record
// the acceptance. Allowed while the request is still pending, even past its response
// deadline, because the call is the confirmation. The note is kept in the audit trail.
export function confirmDriverByPhone(db, { bookingId, supplierId = null, actorId, note, now = new Date() }) {
  const reason = String(note || '').trim();
  if (reason.length < 3) throw error('Add a note about the phone confirmation (who you spoke to and when)', 400);
  return dispatchTransaction(db, () => {
    const assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(bookingId);
    if (!assignment || (supplierId && assignment.supplier_id !== supplierId)) throw error('Driver assignment not found', 404);
    let booking;
    try { ({ booking } = currentDriverAssignment(db, assignment.id, assignment.revision, now)); }
    catch (err) { throw error(err.message, 409); }
    if (assignment.acknowledgement === 'ACCEPTED') return assignment;
    if (assignment.acknowledgement !== 'PENDING') throw error('This assignment is no longer waiting for the driver; assign a driver again', 409);
    acceptAssignmentLocked(db, booking, assignment, { now, eventType: 'ACCEPT_BY_PHONE', actorId: actorId || 'staff', note: `Confirmed by phone: ${reason}` });
    return db.prepare('SELECT * FROM driver_assignments WHERE id = ?').get(assignment.id);
  });
}

export function driverAction(db, context, { action, otp, note }, now = new Date()) {
  // Failed OTP attempts must commit, so verification is outside the transition transaction.
  if (action === 'START') {
    const current = currentDriverAssignment(db, context.assignment.id, context.assignment.revision, now);
    if (current.assignment.acknowledgement !== 'ACCEPTED') throw error('Accept the trip first');
    if (!['ASSIGNED','EN_ROUTE','ARRIVED','TRIP_STARTED'].includes(current.assignment.assignment_status)) throw error('Trip cannot be started');
    if (now.getTime() < bookingWindow(current.booking).start - 2 * 3600000) throw error('Pickup verification opens two hours before departure');
    verifyPickupOtp(db, current.booking.id, otp);
  }
  return dispatchTransaction(db, () => {
    const { assignment, booking } = currentDriverAssignment(db, context.assignment.id, context.assignment.revision, now);
    if (action === 'ACCEPT' || action === 'DECLINE') {
      if (assignment.acknowledgement === 'ACCEPTED' && action === 'ACCEPT') return assignment;
      if (assignment.acknowledgement !== 'PENDING' || Date.parse(assignment.response_deadline) <= now.getTime()) throw error('Assignment response deadline passed; contact your supplier');
      const actorId = `driver:${assignment.supplier_driver_id || assignment.id}`;
      if (action === 'DECLINE') {
        revokeAssignment(db, booking, assignment, note || 'Driver declined', now);
        dispatchException(db, booking, 'Driver declined; replacement required', now);
        db.prepare(`INSERT INTO driver_assignment_events (id, assignment_id, booking_id, supplier_id, supplier_driver_id, event_type, actor_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), assignment.id, booking.id, booking.supplier_id, assignment.supplier_driver_id || null, action, actorId, note || null);
        db.prepare("UPDATE dispatch_attempts SET outcome = 'DECLINED' WHERE booking_id = ? AND supplier_driver_id = ? AND schedule_key = ?").run(booking.id, assignment.supplier_driver_id, assignment.schedule_key);
      } else {
        acceptAssignmentLocked(db, booking, assignment, { now, eventType: 'ACCEPT', actorId, note });
      }
    } else {
      const status = { EN_ROUTE: 'EN_ROUTE', ARRIVED: 'ARRIVED', START: 'TRIP_STARTED', COMPLETE: 'COMPLETED' }[action];
      if (!status) throw error('Unknown driver action', 400);
      updateDispatchStatus(db, { supplierId: booking.supplier_id, bookingId: booking.id, nextStatus: status, allowTripStart: action === 'START', actorId: `driver:${assignment.supplier_driver_id || assignment.id}`, note });
    }
    return db.prepare('SELECT * FROM driver_assignments WHERE id = ?').get(assignment.id);
  });
}

// Open "assign manually" work, most urgent pickup first, with what each needs next.
export const TRIP_ISSUE_TASK_TYPES = Object.freeze(['PICKUP_NOT_STARTED', 'TRIP_COMPLETION_OVERDUE']);

export function listDispatchExceptions(db, { supplierId = null, now = new Date(), taskTypes = ['DRIVER_ASSIGNMENT_REQUIRED'] } = {}) {
  const rows = db.prepare(`SELECT t.id, t.task_type, t.booking_id, t.priority, t.notes, t.status, t.created_at, t.assigned_staff_name,
      b.ref, b.supplier_id, b.activity_date, b.pickup_time, b.pickup_location, b.traveler_name, b.adults, b.children, b.vehicle_category,
      s.company_name AS supplier_name, s.phone AS supplier_phone, p.title AS product_title,
      da.driver_name, da.driver_phone, da.vehicle_number, da.acknowledgement, da.response_deadline, da.assignment_status
    FROM staff_tasks t JOIN bookings b ON b.id = t.booking_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id
    WHERE t.task_type IN (${taskTypes.map(() => '?').join(', ')}) AND t.status = 'OPEN' ${supplierId ? 'AND b.supplier_id = ?' : ''}`).all(...taskTypes, ...(supplierId ? [supplierId] : []));
  return rows.map(row => {
    let pickupAt = null;
    try { pickupAt = bookingWindow(row).start; } catch {}
    const pendingDriver = row.acknowledgement === 'PENDING' && row.assignment_status !== 'CANCELLED';
    return {
      ...row,
      pickup_at: pickupAt ? new Date(pickupAt).toISOString() : null,
      minutes_to_pickup: pickupAt ? Math.round((pickupAt - now.getTime()) / 60000) : null,
      passengers: Number(row.adults || 0) + Number(row.children || 0),
      driver_state: pendingDriver ? 'AWAITING_DRIVER' : 'NO_DRIVER',
    };
  }).sort((a, b) => (a.minutes_to_pickup ?? Infinity) - (b.minutes_to_pickup ?? Infinity));
}

export const DISPATCH_DELIVERY_MAX_ATTEMPTS = 6;

// 2, 4, 8, 16, 32 minutes: about an hour of retries before a job is dead-lettered.
export function dispatchRetryDelayMs(attempts) {
  return Math.min(2 * 2 ** Math.max(attempts - 1, 0), 60) * 60000;
}

// A result with no delivery record was rejected before sending (bad address or
// body), so retrying cannot help. Provider failures have a record and may recover.
// Skipped channels are switched off by configuration and are not failures.
export function classifyDeliveryResults(results = []) {
  const describe = r => `${r.recipientRole || 'RECIPIENT'} ${r.channel || 'CHANNEL'}: ${r.error || r.status || 'failed'}`;
  const failed = results.filter(r => !r.success && !r.skipped);
  return {
    delivered: results.filter(r => r.success).length,
    permanent: failed.filter(r => !r.deliveryId).map(describe),
    transient: failed.filter(r => r.deliveryId).map(describe),
  };
}

function isObsoleteDispatchJob(job, booking, assignment) {
  if (job.event_type === 'DRIVER_REMOVED') return false;
  if (!booking || isCancelledBooking(booking) || scheduleKey(booking) !== job.schedule_key) return true;
  if (job.revision !== 'unassigned' && job.revision !== assignment?.revision) return true;
  if (['DRIVER_REQUEST', 'DRIVER_REQUEST_REMINDER', 'DRIVER_AUTO_ASSIGNED'].includes(job.event_type) && assignment?.acknowledgement !== 'PENDING') return true;
  if (['TRIP_OVERDUE', 'TRIP_OVERDUE_OPS'].includes(job.event_type) && assignment?.assignment_status !== 'TRIP_STARTED') return true;
  if (job.event_type === 'PICKUP_NOT_STARTED' && !['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(assignment?.assignment_status)) return true;
  if (['PRE_TRIP_REMINDER', 'DRIVER_PICKUP_REMINDER'].includes(job.event_type) && ['in_progress', 'completed'].includes(String(booking.status).toLowerCase())) return true;
  if (job.event_type === 'DRIVER_PICKUP_REMINDER' && assignment?.assignment_status !== 'ASSIGNED') return true;
  // An accepted driver makes an unassigned alert stale; the accepted revision queues its own reminder.
  const accepted = assignment?.acknowledgement === 'ACCEPTED' && assignment.assignment_status !== 'CANCELLED';
  if (job.revision === 'unassigned' && accepted && ['PRE_TRIP_REMINDER', 'ASSIGNMENT_REQUIRED'].includes(job.event_type)) return true;
  return false;
}

function notificationFailureTask(db, job, booking, summary) {
  const note = `${job.event_type.replaceAll('_', ' ')} not delivered: ${summary}`.slice(0, 1000);
  const existing = db.prepare("SELECT id FROM staff_tasks WHERE booking_id = ? AND task_type = 'NOTIFICATION_FAILED' AND status = 'OPEN'").get(job.booking_id);
  if (existing) db.prepare('UPDATE staff_tasks SET notes = ? WHERE id = ?').run(note, existing.id);
  else db.prepare("INSERT INTO staff_tasks (id, task_type, booking_id, supplier_id, priority, status, notes) VALUES (?, 'NOTIFICATION_FAILED', ?, ?, 'HIGH', 'OPEN', ?)").run(randomUUID(), job.booking_id, booking?.supplier_id || null, note);
}

export async function processDispatchOutbox(db, deliver, { now = new Date(), limit = 30, maxAttempts = DISPATCH_DELIVERY_MAX_ATTEMPTS } = {}) {
  const jobs = db.prepare(`SELECT * FROM dispatch_outbox WHERE (status = 'PENDING' AND available_at <= ?) OR (status = 'PROCESSING' AND lease_until <= ?) ORDER BY available_at LIMIT ?`).all(now.toISOString(), now.toISOString(), limit);
  let completed = 0, failed = 0;
  for (const job of jobs) {
    const lease = randomUUID();
    if (!db.prepare(`UPDATE dispatch_outbox SET status = 'PROCESSING', lease_token = ?, lease_until = ?, attempts = attempts + 1 WHERE id = ? AND ((status = 'PENDING' AND available_at <= ?) OR (status = 'PROCESSING' AND lease_until <= ?))`)
      .run(lease, new Date(now.getTime() + 300000).toISOString(), job.id, now.toISOString(), now.toISOString()).changes) continue;
    const attempts = Number(job.attempts || 0) + 1;
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(job.booking_id);
    let outcome;
    try {
      const assignment = db.prepare('SELECT * FROM driver_assignments WHERE booking_id = ?').get(job.booking_id);
      if (isObsoleteDispatchJob(job, booking, assignment)) { db.prepare("UPDATE dispatch_outbox SET status = 'CANCELLED', lease_until = NULL WHERE id = ? AND lease_token = ?").run(job.id, lease); continue; }
      // Channels already SENT are idempotent by event key, so a retry only resends what failed.
      outcome = classifyDeliveryResults((await deliver(db, job)).results);
      if (!outcome.delivered && !outcome.permanent.length && !outcome.transient.length) outcome.note = 'No reachable recipient or channel';
    } catch (err) {
      outcome = { delivered: 0, permanent: [], transient: [String(err.message)] };
    }
    const summary = [...outcome.transient, ...outcome.permanent].join('; ') || outcome.note || null;
    if (outcome.transient.length && attempts < maxAttempts) {
      db.prepare("UPDATE dispatch_outbox SET status = 'PENDING', available_at = ?, lease_until = NULL, last_error = ? WHERE id = ? AND lease_token = ? AND status = 'PROCESSING'")
        .run(new Date(now.getTime() + dispatchRetryDelayMs(attempts)).toISOString(), String(summary).slice(0, 300), job.id, lease);
      continue;
    }
    const finalStatus = outcome.transient.length ? 'FAILED' : 'COMPLETE';
    const updated = db.prepare("UPDATE dispatch_outbox SET status = ?, completed_at = ?, lease_until = NULL, last_error = ? WHERE id = ? AND lease_token = ? AND status = 'PROCESSING'")
      .run(finalStatus, now.toISOString(), summary ? String(summary).slice(0, 300) : null, job.id, lease).changes;
    if (!updated) continue;
    if (outcome.transient.length || outcome.permanent.length) notificationFailureTask(db, job, booking, summary);
    if (finalStatus === 'FAILED') failed++; else completed++;
  }
  return { checked: jobs.length, completed, failed };
}
