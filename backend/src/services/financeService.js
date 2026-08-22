import { nanoid } from "nanoid";

function financeError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function resolveCommissionRate(database, supplierId, productType) {
  const row = database.prepare(`
    SELECT s.commission_override_rate, s.commission_rate, cc.default_commission_rate
    FROM suppliers s
    LEFT JOIN category_commissions cc ON UPPER(cc.category_code) = UPPER(?)
    WHERE s.id = ?
  `).get(productType, supplierId);
  if (!row) return 18;
  const resolved = row.commission_override_rate ?? row.default_commission_rate ?? row.commission_rate ?? 18;
  return Math.max(0, Math.min(50, Number(resolved) || 0));
}

function pickupTimestamp(dateValue, timeValue = "09:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return null;
  const match = String(timeValue || "09:00").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return new Date(`${dateValue}T09:00:00`).getTime();
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return new Date(`${dateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).getTime();
}

export function hoursUntilPickup(booking, now = new Date()) {
  const pickup = pickupTimestamp(booking.activity_date || booking.travel_date, booking.pickup_time);
  return pickup === null ? 0 : Math.max(0, money((pickup - now.getTime()) / 3_600_000));
}

export function calculateRefundQuote(database, bookingOrId, { now = new Date(), overridePercentage } = {}) {
  const booking = typeof bookingOrId === "object"
    ? bookingOrId
    : database.prepare(`SELECT b.*, p.cancellation_policy FROM bookings b LEFT JOIN products p ON p.id = b.product_id WHERE b.id = ? OR b.ref = ?`).get(bookingOrId, bookingOrId);
  if (!booking) throw financeError("Booking not found", 404);
  const totalAmount = money(booking.amount_inr);
  const hours = hoursUntilPickup(booking, now);
  const policy = String(booking.cancellation_policy || "FLEXIBLE_24H").toUpperCase();
  
  // Calculate hours elapsed since booking was created
  const bookingCreatedAt = booking.created_at ? new Date(booking.created_at).getTime() : null;
  const hoursSinceBooking = bookingCreatedAt ? Math.max(0, (now.getTime() - bookingCreatedAt) / 3_600_000) : 999;
  const isWithinBookingGrace = hoursSinceBooking <= 24 && hours >= 12;

  let percentage = 0;
  let tier = "No refund after the cancellation deadline";

  if (overridePercentage !== undefined) {
    percentage = Number(overridePercentage);
    if (![0, 50, 100].includes(percentage)) throw financeError("Refund override must be 0%, 50% or 100%");
    tier = `Admin override (${percentage}% refund)`;
  } else if (isWithinBookingGrace && policy !== "NON_REFUNDABLE") {
    percentage = 100;
    tier = "Booking Grace Period: 100% full refund within 24 hours of booking";
  } else if (policy === "FLEXIBLE_24H") {
    percentage = hours >= 24 ? 100 : 0;
    tier = hours >= 24 ? "Flexible: full refund at least 24h before pickup" : "Flexible: deadline has passed";
  } else if (policy === "MODERATE_48H") {
    percentage = hours >= 48 ? 100 : hours >= 24 ? 50 : 0;
    tier = hours >= 48 ? "Moderate: full refund at least 48h before pickup" : hours >= 24 ? "Moderate: 50% refund 24–48h before pickup" : "Moderate: deadline has passed";
  } else if (policy === "STRICT_7D") {
    percentage = hours >= 168 ? 100 : hours >= 48 ? 50 : 0;
    tier = hours >= 168 ? "Strict: full refund at least 7 days before pickup" : hours >= 48 ? "Strict: 50% refund 2–7 days before pickup" : "Strict: deadline has passed";
  } else if (policy === "NON_REFUNDABLE") {
    percentage = 0;
    tier = "Non-refundable booking";
  } else {
    percentage = hours > 24 ? 100 : hours >= 12 ? 50 : 0;
    tier = percentage === 100 ? "Standard: full refund more than 24h before pickup" : percentage === 50 ? "Standard: 50% refund 12–24h before pickup" : "Standard: no refund within 12h";
  }

  const refundAmount = money(totalAmount * percentage / 100);
  return {
    bookingId: booking.id,
    bookingRef: booking.ref,
    cancellationPolicy: policy,
    hoursUntilPickup: hours,
    hoursSinceBooking: Math.round(hoursSinceBooking * 10) / 10,
    isWithinBookingGrace,
    totalAmount,
    refundPercentage: percentage,
    refundAmount,
    cancellationFee: money(totalAmount - refundAmount),
    policyTier: tier,
  };
}

export function recordFinanceEvent(database, event) {
  const id = event.id || `fin_${nanoid(12)}`;
  database.prepare(`
    INSERT OR IGNORE INTO financial_ledger (
      id, booking_id, supplier_id, payout_id, refund_id, event_type, amount,
      currency, status, external_reference, idempotency_key, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, event.bookingId || null, event.supplierId || null, event.payoutId || null,
    event.refundId || null, event.eventType, money(event.amount), event.currency || "INR",
    event.status || "RECORDED", event.externalReference || null, event.idempotencyKey,
    JSON.stringify(event.metadata || {}),
  );
  return database.prepare("SELECT * FROM financial_ledger WHERE idempotency_key = ?").get(event.idempotencyKey);
}

export function recordPaymentCapture(database, booking, externalReference) {
  return recordFinanceEvent(database, {
    bookingId: booking.id,
    supplierId: booking.supplier_id,
    eventType: "PAYMENT_CAPTURED",
    amount: booking.amount_inr,
    status: "PROCESSED",
    externalReference,
    idempotencyKey: `payment:${booking.id}`,
    metadata: { bookingRef: booking.ref, paymentMethod: booking.payment_method },
  });
}

export function createRefundRecord(database, { booking, quote, reason, actorId }) {
  const prior = database.prepare("SELECT * FROM refunds WHERE booking_id = ? AND status IN ('PENDING', 'PROCESSED') ORDER BY processed_at DESC LIMIT 1").get(booking.id);
  if (prior) throw financeError("A refund already exists for this booking", 409);
  const idempotencyKey = `refund:${booking.id}:${quote.refundAmount}`;
  const failedAttempt = database.prepare("SELECT * FROM refunds WHERE idempotency_key = ? AND status = 'FAILED'").get(idempotencyKey);
  if (failedAttempt) {
    database.prepare("UPDATE refunds SET status = 'PENDING', provider_status = 'PENDING', error_message = NULL, reason = ?, requested_by = ?, requested_at = datetime('now') WHERE id = ?")
      .run(reason || quote.policyTier, actorId || null, failedAttempt.id);
    return database.prepare("SELECT * FROM refunds WHERE id = ?").get(failedAttempt.id);
  }
  const id = `ref_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO refunds (
      id, booking_id, booking_ref, refund_amount, refund_percentage, policy_tier,
      status, reason, currency, requested_by, requested_at, provider_status, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, 'INR', ?, datetime('now'), 'PENDING', ?)
  `).run(id, booking.id, booking.ref, quote.refundAmount, quote.refundPercentage, quote.policyTier, reason || quote.policyTier, actorId || null, idempotencyKey);
  return database.prepare("SELECT * FROM refunds WHERE id = ?").get(id);
}

export function failRefund(database, refundId, errorMessage) {
  database.prepare("UPDATE refunds SET status = 'FAILED', provider_status = 'FAILED', error_message = ?, processed_at = datetime('now') WHERE id = ? AND status = 'PENDING'")
    .run(String(errorMessage || "Refund provider failed").slice(0, 1000), refundId);
}

export function finalizeRefund(database, { booking, refund, providerResult }) {
  const refundAmount = money(refund.refund_amount);
  const retainedAmount = money(Number(booking.amount_inr) - refundAmount);
  const commissionRate = Number(booking.commission_rate_snapshot) || (Number(booking.amount_inr) ? Number(booking.commission_amount) / Number(booking.amount_inr) * 100 : 0);
  const retainedCommission = money(retainedAmount * commissionRate / 100);
  const retainedSupplierShare = money(retainedAmount - retainedCommission);
  const paymentStatus = refundAmount >= Number(booking.amount_inr) ? "REFUNDED" : refundAmount > 0 ? "PARTIALLY_REFUNDED" : "PAID";
  const payout = database.prepare("SELECT * FROM payouts WHERE booking_id = ?").get(booking.id);

  database.transaction(() => {
    database.prepare(`UPDATE refunds SET status = ?, provider_status = ?, gateway_refund_id = ?, error_message = NULL, processed_at = datetime('now') WHERE id = ?`)
      .run(refundAmount > 0 ? "PROCESSED" : "NO_REFUND", providerResult?.status || (refundAmount ? "PROCESSED" : "NOT_APPLICABLE"), providerResult?.refundId || null, refund.id);
    database.prepare("UPDATE bookings SET status = 'cancelled', payment_status = ?, refunded_amount = ? WHERE id = ?")
      .run(paymentStatus, refundAmount, booking.id);
    if (payout) {
      database.prepare(`UPDATE payouts SET gross_amount = ?, commission_amount = ?, net_payout = ?, payout_status = ?, settlement_batch_id = NULL WHERE id = ?`)
        .run(retainedAmount, retainedCommission, retainedSupplierShare, retainedAmount > 0 ? "SCHEDULED" : "CANCELLED", payout.id);
    }
    recordFinanceEvent(database, {
      bookingId: booking.id, supplierId: booking.supplier_id, refundId: refund.id,
      eventType: refundAmount ? "REFUND_PROCESSED" : "CANCELLATION_NO_REFUND", amount: refundAmount,
      status: refundAmount ? "PROCESSED" : "NOT_APPLICABLE", externalReference: providerResult?.refundId,
      idempotencyKey: `refund-final:${refund.id}`,
      metadata: { retainedAmount, retainedCommission, retainedSupplierShare },
    });
  })();
  return { refundAmount, retainedAmount, retainedCommission, retainedSupplierShare, paymentStatus };
}

function validBankDetails(raw) {
  let details = raw;
  try { if (typeof raw === "string") details = JSON.parse(raw); } catch { return false; }
  if (!details || typeof details !== "object") return false;
  return Boolean((details.account_number && details.ifsc) || details.upi_id || details.fund_account_id);
}

export function createSettlementBatch(database, { supplierId, payoutIds = [], actorId, notes }) {
  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw financeError("Supplier not found", 404);
  if (String(supplier.kyb_status).toUpperCase() !== "APPROVED") throw financeError("Supplier KYB must be approved before settlement", 409);
  if (!validBankDetails(supplier.payout_bank_details)) throw financeError("Supplier payout account is incomplete", 409);
  const placeholders = payoutIds.length ? ` AND p.id IN (${payoutIds.map(() => "?").join(",")})` : "";
  const payouts = database.prepare(`
    SELECT p.* FROM payouts p
    WHERE p.supplier_id = ? AND p.payout_status = 'SCHEDULED' AND p.settlement_batch_id IS NULL${placeholders}
    ORDER BY p.created_at, p.id
  `).all(supplierId, ...payoutIds);
  if (!payouts.length) throw financeError("No scheduled payouts are ready for this supplier", 409);
  if (payoutIds.length && payouts.length !== new Set(payoutIds).size) throw financeError("One or more selected payouts are not ready", 409);
  const totals = payouts.reduce((sum, item) => ({
    gross: money(sum.gross + Number(item.gross_amount)),
    commission: money(sum.commission + Number(item.commission_amount)),
    net: money(sum.net + Number(item.net_payout)),
  }), { gross: 0, commission: 0, net: 0 });
  const id = `batch_${nanoid(12)}`;
  const batchRef = `SET-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(6).toUpperCase()}`;
  database.transaction(() => {
    database.prepare(`INSERT INTO payout_batches (id, batch_ref, supplier_id, gross_amount, commission_amount, net_amount, payout_count, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)`)
      .run(id, batchRef, supplierId, totals.gross, totals.commission, totals.net, payouts.length, notes?.trim() || null, actorId || null);
    const insertItem = database.prepare("INSERT INTO payout_batch_items (id, batch_id, payout_id, booking_id, amount) VALUES (?, ?, ?, ?, ?)");
    for (const payout of payouts) {
      insertItem.run(`pbi_${nanoid(12)}`, id, payout.id, payout.booking_id, payout.net_payout);
      database.prepare("UPDATE payouts SET payout_status = 'BATCHED', settlement_batch_id = ? WHERE id = ?").run(id, payout.id);
    }
  })();
  return database.prepare("SELECT * FROM payout_batches WHERE id = ?").get(id);
}

export function processSettlementBatch(database, { batchId, provider = "MANUAL_BANK", providerReference, actorId }) {
  const batch = database.prepare("SELECT * FROM payout_batches WHERE id = ? OR batch_ref = ?").get(batchId, batchId);
  if (!batch) throw financeError("Settlement batch not found", 404);
  if (batch.status === "PROCESSED" || batch.status === "RECONCILED") return { batch, idempotent: true };
  if (batch.status !== "READY") throw financeError(`Settlement batch is ${batch.status.toLowerCase()}`, 409);
  if (!String(providerReference || "").trim()) throw financeError("A bank or payout-provider reference is required", 400);
  const items = database.prepare("SELECT * FROM payout_batch_items WHERE batch_id = ?").all(batch.id);
  database.transaction(() => {
    database.prepare("UPDATE payout_batches SET status = 'PROCESSED', provider = ?, provider_batch_id = ?, processed_at = datetime('now') WHERE id = ?")
      .run(String(provider).toUpperCase(), String(providerReference).trim(), batch.id);
    for (const item of items) {
      database.prepare("UPDATE payouts SET payout_status = 'PROCESSED', processed_at = datetime('now'), transfer_id = ?, provider = ?, provider_status = 'PROCESSED' WHERE id = ?")
        .run(String(providerReference).trim(), String(provider).toUpperCase(), item.payout_id);
      const payout = database.prepare("SELECT * FROM payouts WHERE id = ?").get(item.payout_id);
      recordFinanceEvent(database, {
        bookingId: item.booking_id, supplierId: batch.supplier_id, payoutId: item.payout_id,
        eventType: "SUPPLIER_PAYOUT_PROCESSED", amount: item.amount, status: "PROCESSED",
        externalReference: String(providerReference).trim(), idempotencyKey: `payout:${item.payout_id}`,
        metadata: { batchId: batch.id, batchRef: batch.batch_ref, actorId, commissionAmount: payout.commission_amount },
      });
    }
  })();
  return { batch: database.prepare("SELECT * FROM payout_batches WHERE id = ?").get(batch.id), idempotent: false };
}

export function reconcileSettlementBatch(database, { batchId, note }) {
  const batch = database.prepare("SELECT * FROM payout_batches WHERE id = ? OR batch_ref = ?").get(batchId, batchId);
  if (!batch) throw financeError("Settlement batch not found", 404);
  if (batch.status === "RECONCILED") return batch;
  if (batch.status !== "PROCESSED") throw financeError("Only a processed settlement can be reconciled", 409);
  if (String(note || "").trim().length < 3) throw financeError("Add a reconciliation note");
  database.transaction(() => {
    database.prepare("UPDATE payout_batches SET status = 'RECONCILED', notes = ?, reconciled_at = datetime('now') WHERE id = ?").run(note.trim(), batch.id);
    database.prepare("UPDATE payouts SET reconciled_at = datetime('now'), reconciliation_note = ? WHERE settlement_batch_id = ?").run(note.trim(), batch.id);
  })();
  return database.prepare("SELECT * FROM payout_batches WHERE id = ?").get(batch.id);
}

export function getReconciliationReport(database) {
  const rows = database.prepare(`
    SELECT b.id, b.ref, b.payment_status, b.amount_inr, COALESCE(b.refunded_amount, 0) AS refunded_amount,
      b.supplier_id, s.company_name, p.id AS payout_id, p.gross_amount AS payout_gross,
      p.commission_amount, p.net_payout, p.payout_status, p.transfer_id, p.reconciled_at,
      COALESCE((SELECT SUM(r.refund_amount) FROM refunds r WHERE r.booking_id = b.id AND r.status = 'PROCESSED'), 0) AS logged_refunds
    FROM bookings b
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN payouts p ON p.booking_id = b.id
    WHERE b.payment_status IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
    ORDER BY b.created_at DESC
  `).all().map((row) => {
    const captured = money(row.amount_inr);
    const refunds = money(row.logged_refunds);
    const netCollected = money(captured - refunds);
    const allocated = money(Number(row.commission_amount) + Number(row.net_payout));
    const discrepancy = money(netCollected - allocated);
    const issues = [];
    if (!row.payout_id) issues.push("MISSING_PAYOUT");
    if (Math.abs(discrepancy) >= 0.01) issues.push("AMOUNT_MISMATCH");
    if (refunds > 0 && money(row.refunded_amount) !== refunds) issues.push("REFUND_TOTAL_MISMATCH");
    if (row.payout_status === "PROCESSED" && !row.transfer_id) issues.push("MISSING_TRANSFER_REFERENCE");
    if (row.payout_status === "PROCESSED" && !row.reconciled_at) issues.push("AWAITING_RECONCILIATION");
    return { ...row, captured, refunds, netCollected, allocated, discrepancy, issues, balanced: issues.filter((item) => item !== "AWAITING_RECONCILIATION").length === 0 };
  });
  const totals = rows.reduce((sum, row) => ({
    captured: money(sum.captured + row.captured), refunds: money(sum.refunds + row.refunds),
    netCollected: money(sum.netCollected + row.netCollected), commission: money(sum.commission + Number(row.commission_amount)),
    supplierPayable: money(sum.supplierPayable + Number(row.net_payout)),
    settled: money(sum.settled + (row.payout_status === "PROCESSED" ? Number(row.net_payout) : 0)),
  }), { captured: 0, refunds: 0, netCollected: 0, commission: 0, supplierPayable: 0, settled: 0 });
  return {
    generatedAt: new Date().toISOString(), totals,
    exceptionCount: rows.filter((row) => row.issues.length).length,
    unbalancedCount: rows.filter((row) => !row.balanced).length,
    rows,
  };
}
