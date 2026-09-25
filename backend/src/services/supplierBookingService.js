import { nanoid } from "nanoid";
import { z } from "zod";
import { calculateBookingQuote, activatePickupOtp } from "./bookingService.js";
import {
  getInventoryRules,
  reserveNativeInventory,
  attachNativeReservation,
  confirmNativeReservation,
  saveBookingUnitItems,
  UNIT_TYPES,
} from "./nativeInventoryService.js";
import { toE164 } from "../lib/phone.js";
import { DIRECT_SOURCES, DIRECT_PAYMENT_MODES, OFFLINE_PAYMENT_STATUS } from "../lib/bookingSources.js";
import { agentPricing } from "./supplierAgentService.js";

// Supplier-direct bookings (ADR 034): a walk-in at the counter, a phone call or
// a manual entry. They take seats from the same native inventory as every
// marketplace and partner booking, priced by the same quote, but the supplier
// collects the money: no commission, no IdeaHoliday payout and no platform
// refund. What was collected is booking_payments; the rest is balance_due_inr.

const directError = (message, status = 400, code = "INVALID_DIRECT_BOOKING") => Object.assign(new Error(message), { status, code });

const paymentSchema = z.object({
  mode: z.enum(DIRECT_PAYMENT_MODES),
  amount_inr: z.number().int().positive().max(10_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const directBookingSchema = z.object({
  source: z.enum(DIRECT_SOURCES),
  product_id: z.string().trim().min(1).max(120),
  product_option_id: z.string().trim().min(1).max(120).optional().nullable(),
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  adults: z.number().int().min(1).max(26),
  children: z.number().int().min(0).max(25).default(0),
  unit_items: z.array(z.object({ unitType: z.enum(UNIT_TYPES), quantity: z.number().int().min(1).max(26) })).max(10).optional(),
  traveler_name: z.string().trim().min(2).max(120),
  traveler_phone: z.string().trim().min(6).max(24),
  traveler_email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  pickup_location: z.string().trim().max(300).optional().nullable(),
  special_requests: z.string().trim().max(1000).optional().nullable(),
  discount_inr: z.number().int().min(0).max(10_000_000).default(0),
  payments: z.array(paymentSchema).max(5).default([]),
  client_request_id: z.string().trim().min(8).max(120).optional().nullable(),
  // ADR 039: an AGENT booking names the agent and takes their net rate, not a discount.
  agent_id: z.string().trim().min(1).max(120).optional().nullable(),
}).strict();

export const directPaymentSchema = paymentSchema.strict();

function bookingOption(db, productId, optionId) {
  if (optionId) {
    const option = db.prepare("SELECT id FROM product_options WHERE id = ? AND product_id = ?").get(optionId, productId);
    if (!option) throw directError("That option does not belong to this product", 404, "OPTION_NOT_FOUND");
    return option.id;
  }
  const fallback = db.prepare(`SELECT id FROM product_options WHERE product_id = ?
    AND (is_active IS NULL OR CAST(is_active AS TEXT) NOT IN ('0', 'false')) ORDER BY is_default DESC, id LIMIT 1`).get(productId);
  return fallback?.id || null;
}

function derivePaymentState(amountInr, paidInr) {
  const balance = Math.max(0, amountInr - paidInr);
  return { balance, paymentMethod: paidInr <= 0 ? "PAY_LATER" : balance > 0 ? "PART_PAID" : "PAID_DIRECT" };
}

function insertPayments(db, { bookingId, supplierId, actorId, payments }) {
  const insert = db.prepare(`INSERT INTO booking_payments (id, booking_id, supplier_id, amount_inr, mode, reference, note, received_by, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const receivedAt = new Date().toISOString();
  for (const payment of payments) {
    insert.run(`bpay_${nanoid(12)}`, bookingId, supplierId, payment.amount_inr, payment.mode, payment.reference || null, payment.note || null, actorId || null, receivedAt);
  }
}

/**
 * Creates a confirmed supplier-direct booking against the shared inventory.
 * Returns { booking, idempotent }.
 */
export function createSupplierBooking(db, { supplierId, actor, input }) {
  const data = directBookingSchema.parse(input);
  const product = db.prepare("SELECT id, supplier_id, city FROM products WHERE id = ?").get(data.product_id);
  if (!product || product.supplier_id !== supplierId) throw directError("Product not found for this supplier", 404, "PRODUCT_NOT_FOUND");

  const clientRequestId = data.client_request_id ? `direct:${supplierId}:${data.client_request_id}` : null;
  if (clientRequestId) {
    const existing = db.prepare("SELECT * FROM bookings WHERE client_request_id = ?").get(clientRequestId);
    if (existing) return { booking: existing, idempotent: true };
  }

  const phone = toE164(data.traveler_phone);
  if (!phone) throw directError("Enter a valid guest phone number", 400, "INVALID_PHONE");
  const email = data.traveler_email ? data.traveler_email.toLowerCase() : null;
  const optionId = bookingOption(db, product.id, data.product_option_id);
  const native = optionId ? getInventoryRules(db, product.id, optionId) : null;
  const pickupTime = data.pickup_time || "09:00";
  if (native && !data.pickup_time) throw directError("Choose a departure time", 400, "TIME_REQUIRED");

  const ownerId = actor?.id || `supplier_${supplierId}`;
  const bookingId = `bk_${nanoid(12)}`;
  const ref = `IH-${nanoid(7).toUpperCase()}`;
  const paidInr = data.payments.reduce((sum, payment) => sum + payment.amount_inr, 0);
  const forAgent = data.source === "AGENT";
  if (forAgent && !data.agent_id) throw directError("Choose the agent", 400, "AGENT_REQUIRED");
  if (!forAgent && data.agent_id) throw directError("Only an agent booking names an agent", 400, "AGENT_NOT_EXPECTED");
  if (forAgent && data.discount_inr > 0) throw directError("An agent's price is set by their commission; it can't also be discounted", 400, "AGENT_DISCOUNT");

  db.transaction(() => {
    // Seats first, from the one shared pool, under the same locks as a
    // marketplace checkout. The hold freezes the price the quote then reads.
    const hold = native ? reserveNativeInventory(db, {
      productId: product.id, optionId, localDate: data.activity_date, localTime: pickupTime,
      adults: data.adults, children: data.children, unitItems: data.unit_items,
      ownerId, requestKey: clientRequestId || bookingId, counterSale: true,
    }) : null;
    const quote = calculateBookingQuote(db, {
      product_id: product.id, product_option_id: optionId, activity_date: data.activity_date, pickup_time: pickupTime,
      adults: hold ? hold.adults : data.adults, children: hold ? hold.children : data.children,
      unit_items: data.unit_items, native_hold_id: hold?.id || null,
    }, { enforceListingSupplierAvailability: !native, ownerId });

    // The supplier may give its own customer a discount, never a price below zero.
    if (data.discount_inr > quote.totalAmount) throw directError("The discount is larger than the booking total", 400, "DISCOUNT_TOO_LARGE");
    // An agent pays the quote minus their commission, within their credit limit (ADR 039).
    const agent = forAgent ? agentPricing(db, { supplierId, agentId: data.agent_id, productId: product.id, totalAmount: quote.totalAmount, paidNowInr: paidInr }) : null;
    const amountInr = agent ? agent.netInr : quote.totalAmount - data.discount_inr;
    if (paidInr > amountInr) throw directError(`Payments of ₹${paidInr} are more than the ₹${amountInr} due`, 400, "OVERPAYMENT");
    const { balance, paymentMethod } = derivePaymentState(amountInr, paidInr);

    let userId = null;
    if (email) {
      userId = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email)?.id || null;
      if (!userId) {
        userId = `usr_${nanoid(12)}`;
        db.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, 'TRAVELER')")
          .run(userId, data.traveler_name, email, `external_${nanoid(20)}`, phone);
      }
    }

    db.prepare(`INSERT INTO bookings (
        id, ref, client_request_id, user_id, product_id, product_option_id, supplier_id, product_code, supplier_code, product_type, variant_name,
        activity_date, pickup_time, pickup_location, special_requests, adults, children, luggage_bags, vehicle_category,
        traveler_name, traveler_phone, traveler_email, amount_inr, tolls_and_tax_amount,
        commission_amount, commission_rate_snapshot, supplier_payout_amount, payment_method, payment_status, status,
        confirmation_type, confirmation_status, supplier_assignment_status, supplier_assignment_method, supplier_response_status, supplier_assigned_at, supplier_responded_at,
        source, created_by_user_id, direct_discount_inr, balance_due_inr, agent_id, agent_commission_inr
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'confirmed',
        'INSTANT', 'CONFIRMED', 'SUPPLIER_ACCEPTED', 'SUPPLIER_DIRECT', 'ACCEPTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`)
      .run(
        bookingId, ref, clientRequestId, userId, product.id, optionId, supplierId,
        quote.product.product_code || product.id, quote.product.supplier_code || supplierId, quote.product.product_type, quote.variantName,
        quote.activityDate, pickupTime, data.pickup_location || product.city || "Meeting point", data.special_requests || null,
        quote.adults, quote.children, quote.vehicleCategory,
        data.traveler_name, phone, email, amountInr, quote.tolls + quote.stateTax + quote.gstAmount,
        amountInr, paymentMethod, OFFLINE_PAYMENT_STATUS,
        data.source, actor?.id || null, data.discount_inr, balance, agent ? data.agent_id : null, agent ? agent.commissionInr : 0,
      );
    saveBookingUnitItems(db, bookingId, quote.unitItems, quote.nativeSlot?.unitPrices || {});

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
    if (hold) {
      // The hold is checked against the undiscounted price it froze.
      attachNativeReservation(db, hold.id, { ...booking, amount_inr: quote.totalAmount }, ownerId);
      confirmNativeReservation(db, booking);
      // The marketplace confirmation ("your payment is confirmed", plus an
      // alert to every ops user) is wrong for a counter sale; the supplier
      // sends the voucher itself.
      db.prepare("UPDATE native_reservation_outbox SET status = 'SKIPPED', completed_at = CURRENT_TIMESTAMP WHERE booking_id = ?").run(bookingId);
    }
    const otp = activatePickupOtp(booking);
    db.prepare("UPDATE bookings SET otp_hash = ?, otp_encrypted = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?")
      .run(otp.otpHash, otp.otpEncrypted, otp.otpExpiresAt, bookingId);
    insertPayments(db, { bookingId, supplierId, actorId: actor?.id, payments: data.payments });
  })();

  return { booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId), idempotent: false };
}

/** Prices a counter sale without taking seats, so staff can quote the guest. */
export function quoteSupplierBooking(db, { supplierId, input }) {
  const data = directBookingSchema.pick({ product_id: true, product_option_id: true, activity_date: true, pickup_time: true, adults: true, children: true, unit_items: true, discount_inr: true, agent_id: true }).parse(input);
  const product = db.prepare("SELECT id, supplier_id FROM products WHERE id = ?").get(data.product_id);
  if (!product || product.supplier_id !== supplierId) throw directError("Product not found for this supplier", 404, "PRODUCT_NOT_FOUND");
  const optionId = bookingOption(db, product.id, data.product_option_id);
  const native = optionId ? getInventoryRules(db, product.id, optionId) : null;
  const quote = calculateBookingQuote(db, {
    product_id: product.id, product_option_id: optionId, activity_date: data.activity_date, pickup_time: data.pickup_time || "09:00",
    adults: data.adults, children: data.children, unit_items: data.unit_items,
  }, { enforceListingSupplierAvailability: !native, counterSale: true });
  const taxAmount = quote.tolls + quote.stateTax + quote.gstAmount;
  const vacancies = quote.nativeSlot?.vacancies ?? null;
  if (data.agent_id) {
    // The agent's net and remaining credit; nothing is held or charged.
    const agent = agentPricing(db, { supplierId, agentId: data.agent_id, productId: product.id, totalAmount: quote.totalAmount, enforceCredit: false });
    return { baseAmount: quote.baseAmount, taxAmount, totalAmount: quote.totalAmount, discountInr: 0, agentCommissionPct: agent.commissionPct, agentCommissionInr: agent.commissionInr, amountDueInr: agent.netInr, agentOwedInr: agent.owedInr, agentAvailableCreditInr: agent.availableCreditInr, vacancies };
  }
  const discount = Math.min(data.discount_inr, quote.totalAmount);
  return { baseAmount: quote.baseAmount, taxAmount, totalAmount: quote.totalAmount, discountInr: discount, amountDueInr: quote.totalAmount - discount, vacancies };
}

/** Records money the supplier collected later (the balance at the counter, a UPI transfer). */
export function recordDirectPayment(db, { supplierId, bookingId, actor, input }) {
  const payment = directPaymentSchema.parse(input);
  return db.transaction(() => {
    db.prepare("UPDATE bookings SET id = id WHERE id = ?").run(bookingId);
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND supplier_id = ?").get(bookingId, supplierId);
    if (!booking) throw directError("Booking not found for this supplier", 404, "BOOKING_NOT_FOUND");
    if (booking.payment_status !== OFFLINE_PAYMENT_STATUS) throw directError("IdeaHoliday collects payment for this booking", 409, "NOT_SUPPLIER_DIRECT");
    if (booking.status === "cancelled") throw directError("This booking is cancelled", 409, "BOOKING_CANCELLED");
    const balance = Number(booking.balance_due_inr || 0);
    if (payment.amount_inr > balance) throw directError(`Only ₹${balance} is still due`, 400, "OVERPAYMENT");
    insertPayments(db, { bookingId, supplierId, actorId: actor?.id, payments: [payment] });
    const next = balance - payment.amount_inr;
    db.prepare("UPDATE bookings SET balance_due_inr = ?, payment_method = ? WHERE id = ?").run(next, next > 0 ? "PART_PAID" : "PAID_DIRECT", bookingId);
    return { booking: db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId), payments: listDirectPayments(db, bookingId) };
  })();
}

export function listDirectPayments(db, bookingId) {
  return db.prepare("SELECT id, amount_inr, mode, reference, note, received_by, received_at FROM booking_payments WHERE booking_id = ? ORDER BY received_at, id").all(bookingId);
}

/** Every departure of the supplier's seat-inventory products on one date, for the counter. */
export function supplierDayAvailability(db, supplierId, localDate, listAvailability) {
  const options = db.prepare(`SELECT r.product_id, r.option_id, p.title, o.name AS option_name
    FROM native_inventory_rules r
    JOIN products p ON p.id = r.product_id
    JOIN product_options o ON o.id = r.option_id
    WHERE p.supplier_id = ? AND (o.is_active IS NULL OR CAST(o.is_active AS TEXT) NOT IN ('0', 'false'))
    ORDER BY p.title, o.name`).all(supplierId);
  return options.map((option) => ({
    productId: option.product_id,
    optionId: option.option_id,
    title: option.title,
    optionName: option.option_name,
    departures: listAvailability(db, option.product_id, option.option_id, localDate, { counterSale: true }),
  }));
}
