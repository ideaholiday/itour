// The delivery callback is injected so retries can be tested without contacting providers.
export async function processReservationOutbox(db, deliver, { now = new Date(), limit = 20 } = {}) {
  const pending = db.prepare(`SELECT booking_id FROM native_reservation_outbox
    WHERE (status = 'PENDING' AND available_at <= ?) OR (status = 'PROCESSING' AND lease_until <= ?)
    ORDER BY available_at LIMIT ?`).all(now.toISOString(), now.toISOString(), limit);
  let completed = 0;
  for (const item of pending) {
    const lease = new Date(now.getTime() + 5 * 60000).toISOString();
    const claimed = db.prepare(`UPDATE native_reservation_outbox SET status = 'PROCESSING', attempts = attempts + 1, lease_until = ?
      WHERE booking_id = ? AND ((status = 'PENDING' AND available_at <= ?) OR (status = 'PROCESSING' AND lease_until <= ?))`)
      .run(lease, item.booking_id, now.toISOString(), now.toISOString());
    if (!claimed.changes) continue;
    try {
      const booking = db.prepare("SELECT status FROM bookings WHERE id = ?").get(item.booking_id);
      if (!booking || booking.status === "cancelled") {
        db.prepare("UPDATE native_reservation_outbox SET status = 'CANCELLED', lease_until = NULL WHERE booking_id = ? AND lease_until = ?").run(item.booking_id, lease);
        continue;
      }
      const result = await deliver(db, item.booking_id);
      if (result.results?.some(delivery => !delivery.success)) throw new Error("One or more confirmation channels are unavailable; see notification deliveries");
      db.prepare("UPDATE native_reservation_outbox SET status = 'COMPLETE', completed_at = ?, lease_until = NULL, last_error = NULL WHERE booking_id = ? AND lease_until = ?")
        .run(new Date().toISOString(), item.booking_id, lease);
      completed++;
    } catch (error) {
      db.prepare("UPDATE native_reservation_outbox SET status = 'PENDING', available_at = ?, lease_until = NULL, last_error = ? WHERE booking_id = ? AND lease_until = ?")
        .run(new Date(now.getTime() + 5 * 60000).toISOString(), String(error.message).slice(0, 500), item.booking_id, lease);
    }
  }
  return { checked: pending.length, completed };
}
