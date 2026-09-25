import { nanoid } from "nanoid";
import { z } from "zod";
import { toE164 } from "../lib/phone.js";
import { DIRECT_PAYMENT_MODES } from "../lib/bookingSources.js";

/**
 * Supplier agents (ADR 039): a supplier's own travel agents, hotels and
 * resellers. Staff book for them at a net rate, the server quote minus the
 * agent's commission (or a per-listing override), on credit up to a limit.
 *
 * There is one ledger: an agent booking's balance_due_inr is what the agent
 * still owes on it, so what an agent owes is the sum over their live bookings.
 * A payment on the agent's account is applied to their oldest open bookings.
 */

const LIVE = "LOWER(status) NOT IN ('cancelled', 'pending_payment')";

const agentError = (message, status = 400, code = "INVALID_AGENT") => Object.assign(new Error(message), { status, code });

const pctField = z.number().min(0).max(90);
export const agentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(24).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  commissionPct: pctField.default(0),
  creditLimitInr: z.number().int().min(0).max(100_000_000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const agentRatesSchema = z.object({
  rates: z.array(z.object({ productId: z.string().trim().min(1).max(120), commissionPct: pctField }).strict()).max(200),
}).strict();

export const agentPaymentSchema = z.object({
  mode: z.enum(DIRECT_PAYMENT_MODES),
  amount_inr: z.number().int().positive().max(100_000_000),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
}).strict();

function cleanPhone(value) {
  if (!value) return null;
  const phone = toE164(value);
  if (!phone) throw agentError("Enter a valid phone number with country code", 400, "INVALID_PHONE");
  return phone;
}

/** What the agent owes now: the unpaid net of their live bookings. */
export function agentOwed(db, agentId) {
  return Number(db.prepare(`SELECT COALESCE(SUM(balance_due_inr), 0) AS owed FROM bookings WHERE agent_id = ? AND ${LIVE}`).get(agentId).owed || 0);
}

function agentView(db, row) {
  const owed = agentOwed(db, row.id);
  const rates = db.prepare("SELECT product_id, commission_pct FROM supplier_agent_rates WHERE agent_id = ? ORDER BY product_id").all(row.id)
    .map((rate) => ({ productId: rate.product_id, commissionPct: Number(rate.commission_pct) }));
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name || null,
    phone: row.phone || null,
    email: row.email || null,
    commissionPct: Number(row.commission_pct),
    creditLimitInr: Number(row.credit_limit_inr),
    status: row.status,
    owedInr: owed,
    availableCreditInr: Math.max(0, Number(row.credit_limit_inr) - owed),
    rates,
  };
}

export function findAgent(db, supplierId, agentId) {
  const row = db.prepare("SELECT * FROM supplier_agents WHERE id = ? AND supplier_id = ?").get(agentId, supplierId);
  if (!row) throw agentError("Agent not found", 404, "AGENT_NOT_FOUND");
  return row;
}

export function listAgents(db, supplierId) {
  return db.prepare("SELECT * FROM supplier_agents WHERE supplier_id = ? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, LOWER(name)").all(supplierId)
    .map((row) => agentView(db, row));
}

export function saveAgent(db, supplierId, input, agentId = null) {
  const agent = agentSchema.parse(input);
  const values = [agent.name, agent.contactName || null, cleanPhone(agent.phone), agent.email ? agent.email.toLowerCase() : null, agent.commissionPct, agent.creditLimitInr, agent.status];
  if (agentId) {
    findAgent(db, supplierId, agentId);
    db.prepare(`UPDATE supplier_agents SET name = ?, contact_name = ?, phone = ?, email = ?, commission_pct = ?, credit_limit_inr = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND supplier_id = ?`).run(...values, agentId, supplierId);
  } else {
    agentId = `agt_${nanoid(12)}`;
    db.prepare(`INSERT INTO supplier_agents (id, supplier_id, name, contact_name, phone, email, commission_pct, credit_limit_inr, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(agentId, supplierId, ...values);
  }
  return agentView(db, findAgent(db, supplierId, agentId));
}

/** Replaces the agent's per-listing commissions; an empty list leaves only the agent's own %. */
export function setAgentRates(db, supplierId, agentId, input) {
  const { rates } = agentRatesSchema.parse(input);
  findAgent(db, supplierId, agentId);
  return db.transaction(() => {
    for (const rate of rates) {
      const product = db.prepare("SELECT id FROM products WHERE id = ? AND supplier_id = ?").get(rate.productId, supplierId);
      if (!product) throw agentError("Product not found for this supplier", 404, "PRODUCT_NOT_FOUND");
    }
    db.prepare("DELETE FROM supplier_agent_rates WHERE agent_id = ?").run(agentId);
    const insert = db.prepare("INSERT INTO supplier_agent_rates (agent_id, product_id, commission_pct) VALUES (?, ?, ?)");
    for (const rate of rates) insert.run(agentId, rate.productId, rate.commissionPct);
    return agentView(db, findAgent(db, supplierId, agentId));
  })();
}

/**
 * The net price for an agent: the quote total minus their commission for this
 * listing. Called inside the booking transaction, which it locks on the agent
 * so two bookings can't both spend the last of the credit.
 */
export function agentPricing(db, { supplierId, agentId, productId, totalAmount, paidNowInr = 0, enforceCredit = true }) {
  if (!agentId) throw agentError("Choose the agent", 400, "AGENT_REQUIRED");
  if (enforceCredit) db.prepare("UPDATE supplier_agents SET id = id WHERE id = ?").run(agentId);
  const agent = findAgent(db, supplierId, agentId);
  if (agent.status !== "ACTIVE") throw agentError(`${agent.name} is inactive`, 409, "AGENT_INACTIVE");
  const override = db.prepare("SELECT commission_pct FROM supplier_agent_rates WHERE agent_id = ? AND product_id = ?").get(agentId, productId);
  const commissionPct = Number(override ? override.commission_pct : agent.commission_pct);
  const commissionInr = Math.round((totalAmount * commissionPct) / 100);
  const netInr = totalAmount - commissionInr;
  const owed = agentOwed(db, agentId);
  const creditLimitInr = Number(agent.credit_limit_inr);
  const onCredit = Math.max(0, netInr - paidNowInr);
  if (enforceCredit && owed + onCredit > creditLimitInr) {
    const available = Math.max(0, creditLimitInr - owed);
    throw agentError(
      `${agent.name} owes ₹${owed.toLocaleString("en-IN")} with a ₹${creditLimitInr.toLocaleString("en-IN")} limit, so only ₹${available.toLocaleString("en-IN")} can go on credit. Take at least ₹${(onCredit - available).toLocaleString("en-IN")} now.`,
      409, "AGENT_CREDIT_LIMIT",
    );
  }
  return { agent, commissionPct, commissionInr, netInr, owedInr: owed, availableCreditInr: Math.max(0, creditLimitInr - owed) };
}

/** The agent's bookings in a date range (by trip date; default: everything), with what was paid and what is owed. */
export function agentStatement(db, supplierId, agentId, { from = null, to = null } = {}) {
  const agent = agentView(db, findAgent(db, supplierId, agentId));
  const dateRange = [from ? "AND b.activity_date >= ?" : "", to ? "AND b.activity_date <= ?" : ""].join(" ");
  const rows = db.prepare(`SELECT b.id, b.ref, b.activity_date, b.pickup_time, b.status, b.traveler_name, b.adults, b.children,
      b.amount_inr, b.agent_commission_inr, b.balance_due_inr, p.title AS product_title
    FROM bookings b LEFT JOIN products p ON p.id = b.product_id
    WHERE b.agent_id = ? AND b.supplier_id = ? AND LOWER(b.status) <> 'pending_payment' ${dateRange}
    ORDER BY b.activity_date, b.created_at`).all(agentId, supplierId, ...[from, to].filter(Boolean));
  const bookings = rows.map((row) => {
    const cancelled = String(row.status).toLowerCase() === "cancelled";
    const net = Number(row.amount_inr || 0);
    const due = cancelled ? 0 : Number(row.balance_due_inr || 0);
    return {
      id: row.id, ref: row.ref, date: row.activity_date, time: row.pickup_time || null, status: row.status,
      productTitle: row.product_title, travelerName: row.traveler_name, guests: Number(row.adults || 0) + Number(row.children || 0),
      grossInr: net + Number(row.agent_commission_inr || 0), commissionInr: Number(row.agent_commission_inr || 0), netInr: net,
      paidInr: cancelled ? net - Number(row.balance_due_inr || 0) : net - due, dueInr: due,
    };
  });
  const live = bookings.filter((row) => String(row.status).toLowerCase() !== "cancelled");
  const payments = db.prepare(`SELECT bp.id, bp.booking_id, b.ref, bp.amount_inr, bp.mode, bp.reference, bp.note, bp.received_at
    FROM booking_payments bp JOIN bookings b ON b.id = bp.booking_id
    WHERE b.agent_id = ? AND b.supplier_id = ? ORDER BY bp.received_at, bp.id`).all(agentId, supplierId);
  return {
    agent,
    from, to,
    bookings,
    payments,
    totals: {
      bookings: live.length,
      grossInr: live.reduce((sum, row) => sum + row.grossInr, 0),
      commissionInr: live.reduce((sum, row) => sum + row.commissionInr, 0),
      netInr: live.reduce((sum, row) => sum + row.netInr, 0),
      paidInr: live.reduce((sum, row) => sum + row.paidInr, 0),
      dueInr: live.reduce((sum, row) => sum + row.dueInr, 0),
    },
  };
}

/**
 * Records money the agent paid on account and applies it to their open
 * bookings, oldest trip first. It can't exceed what they owe.
 */
export function recordAgentPayment(db, { supplierId, agentId, actor, input }) {
  const payment = agentPaymentSchema.parse(input);
  return db.transaction(() => {
    db.prepare("UPDATE supplier_agents SET id = id WHERE id = ?").run(agentId);
    const agent = findAgent(db, supplierId, agentId);
    const open = db.prepare(`SELECT id, ref, balance_due_inr FROM bookings WHERE agent_id = ? AND supplier_id = ? AND ${LIVE} AND balance_due_inr > 0
      ORDER BY activity_date, created_at, id`).all(agentId, supplierId);
    const owed = open.reduce((sum, row) => sum + Number(row.balance_due_inr), 0);
    if (payment.amount_inr > owed) throw agentError(`${agent.name} owes only ₹${owed.toLocaleString("en-IN")}`, 400, "OVERPAYMENT");

    const insert = db.prepare(`INSERT INTO booking_payments (id, booking_id, supplier_id, amount_inr, mode, reference, note, received_by, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const receivedAt = new Date().toISOString();
    const applied = [];
    let left = payment.amount_inr;
    for (const booking of open) {
      if (left <= 0) break;
      const part = Math.min(left, Number(booking.balance_due_inr));
      insert.run(`bpay_${nanoid(12)}`, booking.id, supplierId, part, payment.mode, payment.reference || null, payment.note || `Agent payment: ${agent.name}`, actor?.id || null, receivedAt);
      const next = Number(booking.balance_due_inr) - part;
      db.prepare("UPDATE bookings SET balance_due_inr = ?, payment_method = ? WHERE id = ?").run(next, next > 0 ? "PART_PAID" : "PAID_DIRECT", booking.id);
      applied.push({ bookingId: booking.id, ref: booking.ref, amountInr: part });
      left -= part;
    }
    return { agent: agentView(db, agent), applied };
  })();
}
