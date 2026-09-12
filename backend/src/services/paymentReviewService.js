import { releaseNativeReservation } from "./nativeInventoryService.js";

export function quarantineBookingPayment(db, booking, { method, orderId, paymentId, reason }) {
  return db.transaction(() => {
    const changed = db.prepare(`UPDATE bookings SET payment_status = 'PAYMENT_REVIEW_REQUIRED',
      status = 'cancelled', confirmation_status = 'PAYMENT_REVIEW_REQUIRED', payment_method = ?,
      supplier_assignment_status = 'PAYMENT_REVIEW_REQUIRED'
      WHERE id = ? AND payment_status <> 'PAID' AND payment_status <> 'PAYMENT_REVIEW_REQUIRED'`).run(method, booking.id);
    if (!changed.changes) return;
    releaseNativeReservation(db, booking.id);
    db.prepare("UPDATE payouts SET payout_status = 'PAYMENT_REVIEW_REQUIRED' WHERE booking_id = ? AND payout_status = 'PENDING_PAYMENT'").run(booking.id);
    db.prepare(`INSERT INTO staff_tasks (id, task_type, booking_id, assigned_staff_name, priority, status, notes)
      VALUES (?, 'PAYMENT_REVIEW_REQUIRED', ?, 'Marketplace Operations', 'CRITICAL', 'OPEN', ?)
      ON CONFLICT(id) DO NOTHING`).run(`payment_review_${booking.id}`, booking.id,
      JSON.stringify({ reason, provider: method, orderId, paymentId, action: "Verify captured payment and refund or resolve with traveler. Do not confirm without inventory." }));
  })();
}
