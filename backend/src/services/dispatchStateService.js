import { createHash, randomUUID } from 'node:crypto';

export function dispatchTransaction(db, work) {
  return db.transaction(() => {
    // A single row lock also serializes external/manual drivers shared by suppliers.
    db.prepare("UPDATE dispatch_lock SET version = version + 1 WHERE id = 'dispatch'").run();
    return work();
  })();
}

export function scheduleKey(booking) {
  return createHash('sha256').update(JSON.stringify([
    booking.supplier_id, booking.product_id, booking.product_option_id,
    booking.activity_date, booking.pickup_time, booking.pickup_location,
    booking.drop_location, booking.vehicle_category,
  ])).digest('hex').slice(0, 24);
}

export function departureKey(booking) {
  if (String(booking.group_type).toUpperCase() !== 'SHARED' || !booking.product_option_id) return `booking:${booking.id}`;
  return `departure:${booking.supplier_id}:${booking.product_option_id}:${booking.activity_date}:${booking.pickup_time}`;
}

export function isCancelledBooking(booking) {
  return String(booking?.status || '').toLowerCase() === 'cancelled';
}

// `occurrence` separates alerts that share a revision (an unassigned booking
// can need several "assign manually" alerts) while keeping each one idempotent.
export function enqueueDispatch(db, booking, assignment, eventType, { now = new Date(), due = now, payload = {}, occurrence = null } = {}) {
  const revision = assignment?.revision || 'unassigned';
  const schedule = scheduleKey(booking);
  const id = `${booking.id}:${schedule}:${revision}:${eventType}${occurrence ? `:${occurrence}` : ''}`;
  const inserted = db.prepare(`INSERT OR IGNORE INTO dispatch_outbox
    (id, booking_id, revision, schedule_key, event_type, payload, available_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, booking.id, revision, schedule, eventType, JSON.stringify(payload), due.toISOString()).changes;
  return inserted ? id : null;
}

export function revokeAssignment(db, booking, assignment, reason, now = new Date()) {
  if (!assignment || assignment.assignment_status === 'CANCELLED') return;
  // Only this driver's jobs go stale; traveler and operations alerts queued
  // without a revision must survive a decline or timeout.
  db.prepare("UPDATE dispatch_outbox SET status = 'CANCELLED' WHERE booking_id = ? AND revision = ? AND status IN ('PENDING','PROCESSING')").run(booking.id, assignment.revision);
  enqueueDispatch(db, booking, assignment, 'DRIVER_REMOVED', { now, payload: {
    driver_name: assignment.driver_name, driver_phone: assignment.driver_phone,
    driver_email: assignment.driver_email, reason,
  } });
  db.prepare("UPDATE driver_assignments SET assignment_status = 'CANCELLED', acknowledgement = 'REVOKED', revision = ? WHERE id = ?")
    .run(randomUUID(), assignment.id);
  db.prepare(`INSERT INTO driver_assignment_events
    (id, assignment_id, booking_id, supplier_id, event_type, previous_status, new_status, note)
    VALUES (?, ?, ?, ?, 'REVOKED', ?, 'CANCELLED', ?)`)
    .run(randomUUID(), assignment.id, booking.id, assignment.supplier_id, assignment.assignment_status, reason);
}
