/**
 * Who pays what commission, and the record of every change (ADR 017).
 *
 * A booking's rate resolves in `resolveCommissionRate`: product override →
 * supplier override → platform default. This service changes those rates.
 * Every change is written to `commission_rate_changes` with its reason, and the
 * suppliers it affects are sent a notice unless the change was made with
 * `notify: false` (used once, for the launch move to 30%).
 *
 * See docs/BUSINESS_RULES.md §3.2 and migrations/038_product_commission.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";
import { resolveCommissionRate } from "./financeService.js";
import { checkProgramLimits, getSettings } from "./programSettingsService.js";
import { sendRecipientChannels } from "./notificationService.js";
import { whatsAppTemplate } from "./whatsappService.js";

const MAX_RATE = 50;

function commissionError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function requireReason(reason) {
  const why = String(reason || "").trim();
  if (why.length < 3) throw commissionError("Give a reason for this change", 400, "REASON_REQUIRED");
  return why;
}

/** A higher rate makes referral rewards (a share of commission) larger; they must still fit the giveaway cap. */
function assertFitsGiveawayCap(database, rate) {
  const limit = rate === null ? null : checkProgramLimits(database, {}, { commissionRate: rate });
  if (limit) throw commissionError(limit, 400, "OVER_GIVEAWAY_CAP");
}

/** `null` clears an override; anything else must be a rate from 0 to 50. */
function normalizeRate(rate) {
  if (rate === null || rate === undefined || rate === "") return null;
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0 || value > MAX_RATE) {
    throw commissionError(`Commission rate must be between 0% and ${MAX_RATE}%`, 400, "INVALID_RATE");
  }
  return Math.round(value * 100) / 100;
}

function recordChange(database, { scope, supplierId = null, productId = null, oldRate, newRate, actorId, reason, notify }) {
  const id = `crc_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO commission_rate_changes (id, scope, supplier_id, product_id, old_rate, new_rate, changed_by, reason, notify)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, scope, supplierId, productId, oldRate, newRate, actorId, reason, notify ? 1 : 0);
  return { id, scope, supplierId, productId, oldRate, newRate, notify: Boolean(notify) };
}

/**
 * Sets or clears one product's commission. `oldRate`/`newRate` are the rates
 * the product actually resolves to before and after, so a notice says what
 * really changes for the supplier.
 */
export function setProductCommission(database, { productId, rate, actorId = null, reason, notify = true }) {
  const why = requireReason(reason);
  const override = normalizeRate(rate);
  const product = database.prepare("SELECT id, supplier_id, title, commission_override_rate FROM products WHERE id = ?").get(productId);
  if (!product) throw commissionError("Product not found", 404);
  assertFitsGiveawayCap(database, override);

  return database.transaction(() => {
    const oldRate = resolveCommissionRate(database, product.supplier_id, product.id);
    database.prepare("UPDATE products SET commission_override_rate = ? WHERE id = ?").run(override, product.id);
    const newRate = resolveCommissionRate(database, product.supplier_id, product.id);
    const change = oldRate === newRate && (product.commission_override_rate ?? null) === override
      ? null
      : recordChange(database, { scope: "PRODUCT", supplierId: product.supplier_id, productId: product.id, oldRate, newRate, actorId, reason: why, notify: notify && oldRate !== newRate });
    return { productId: product.id, supplierId: product.supplier_id, override, rate: newRate, change };
  })();
}

/** Sets or clears a supplier's commission. Products with their own override keep it. */
export function setSupplierCommission(database, { supplierId, rate, actorId = null, reason, notify = true }) {
  const why = requireReason(reason);
  const override = normalizeRate(rate);
  const supplier = database.prepare("SELECT id, commission_override_rate FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw commissionError("Supplier not found", 404);
  assertFitsGiveawayCap(database, override);

  return database.transaction(() => {
    const oldRate = resolveCommissionRate(database, supplier.id);
    // commission_rate is kept in step for the screens that still read it.
    database.prepare("UPDATE suppliers SET commission_override_rate = ?, commission_rate = COALESCE(?, commission_rate) WHERE id = ?").run(override, override, supplier.id);
    const newRate = resolveCommissionRate(database, supplier.id);
    const change = oldRate === newRate && (supplier.commission_override_rate ?? null) === override
      ? null
      : recordChange(database, { scope: "SUPPLIER", supplierId: supplier.id, oldRate, newRate, actorId, reason: why, notify: notify && oldRate !== newRate });
    return { supplierId: supplier.id, override, rate: newRate, change };
  })();
}

/**
 * Records a platform default change that has already been saved as a program
 * setting. Every KYB-approved supplier without its own override is affected.
 */
export function recordPlatformCommissionChange(database, { oldRate, newRate, actorId = null, reason, notify = true }) {
  if (Number(oldRate) === Number(newRate)) return null;
  return recordChange(database, { scope: "PLATFORM", oldRate, newRate, actorId, reason: requireReason(reason), notify });
}

/** Everything that keeps a booking off the platform default, for the admin screen. */
export function listCommissionOverrides(database) {
  const { defaultRatePercent } = getSettings(database, "commission");
  const suppliers = database.prepare(`
    SELECT id, company_name, kyb_status, commission_override_rate
    FROM suppliers WHERE commission_override_rate IS NOT NULL ORDER BY company_name
  `).all();
  const products = database.prepare(`
    SELECT p.id, p.title, p.supplier_id, s.company_name AS supplier_name, p.commission_override_rate
    FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.commission_override_rate IS NOT NULL ORDER BY s.company_name, p.title
  `).all();
  return {
    defaultRatePercent,
    suppliers: suppliers.map((row) => ({ id: row.id, name: row.company_name, kybStatus: row.kyb_status, rate: row.commission_override_rate })),
    products: products.map((row) => ({ id: row.id, title: row.title, supplierId: row.supplier_id, supplierName: row.supplier_name, rate: row.commission_override_rate })),
  };
}

/**
 * Puts suppliers (and, if asked, products) back on the platform default by
 * clearing their overrides. Each cleared override keeps a change row holding
 * the old rate, so it can be set again by hand.
 */
export function clearCommissionOverrides(database, { includeProducts = false, actorId = null, reason, notify = true }) {
  const why = requireReason(reason);
  const before = listCommissionOverrides(database);
  const changes = [];
  database.transaction(() => {
    for (const supplier of before.suppliers) {
      const result = setSupplierCommission(database, { supplierId: supplier.id, rate: null, actorId, reason: why, notify });
      if (result.change) changes.push(result.change);
    }
    if (includeProducts) {
      for (const product of before.products) {
        const result = setProductCommission(database, { productId: product.id, rate: null, actorId, reason: why, notify });
        if (result.change) changes.push(result.change);
      }
    }
  })();
  return {
    defaultRatePercent: before.defaultRatePercent,
    clearedSuppliers: before.suppliers.length,
    clearedProducts: includeProducts ? before.products.length : 0,
    changes,
  };
}

export function listCommissionChanges(database, { limit = 100 } = {}) {
  return database.prepare(`
    SELECT c.*, s.company_name AS supplier_name, p.title AS product_title, u.name AS changed_by_name
    FROM commission_rate_changes c
    LEFT JOIN suppliers s ON s.id = c.supplier_id
    LEFT JOIN products p ON p.id = c.product_id
    LEFT JOIN users u ON u.id = c.changed_by
    ORDER BY c.created_at DESC, c.id DESC LIMIT ?
  `).all(limit);
}

/** The suppliers a change reaches: one for a supplier or product change, every approved supplier on the default for a platform change. */
function recipientsFor(database, change) {
  if (change.scope === "PLATFORM") {
    return database.prepare(`
      SELECT id, company_name, contact_name, email, phone FROM suppliers
      WHERE UPPER(COALESCE(kyb_status, '')) = 'APPROVED' AND commission_override_rate IS NULL
    `).all();
  }
  const supplier = database.prepare("SELECT id, company_name, contact_name, email, phone FROM suppliers WHERE id = ?").get(change.supplierId);
  return supplier ? [supplier] : [];
}

/**
 * Tells suppliers about commission changes marked `notify`, then stamps
 * `notified_at`. A failed channel is logged by the notification service; the
 * rate change itself has already been saved and is not undone.
 */
export async function sendCommissionChangeNotices(database, changes = []) {
  let sent = 0;
  for (const change of changes.filter((item) => item?.notify)) {
    const product = change.productId ? database.prepare("SELECT title FROM products WHERE id = ?").get(change.productId) : null;
    const what = product ? `for “${product.title}”` : "for your listings";
    for (const supplier of recipientsFor(database, change)) {
      const name = supplier.contact_name || supplier.company_name || "Partner";
      const message = `Hello ${name},\n\nIdea Holiday's platform commission ${what} changes from ${change.oldRate}% to ${change.newRate}%.\n\nIt applies to bookings made from now on. Bookings already made keep the commission they were booked at. Open the Supplier Portal to see what you receive for each listing.`;
      try {
        await sendRecipientChannels({
          database,
          eventType: "SUPPLIER_COMMISSION_CHANGED",
          eventKeyPrefix: `${change.id}:${supplier.id}:SUPPLIER_COMMISSION_CHANGED`,
          recipient: { id: supplier.id, role: "SUPPLIER", name, email: supplier.email, phone: supplier.phone },
          subject: `Your Idea Holiday commission is changing to ${change.newRate}%`,
          emailText: message,
          whatsappText: message,
          whatsappTemplate: whatsAppCommissionTemplate(change, what),
          metadata: { commissionChangeId: change.id, supplierId: supplier.id },
        });
        sent += 1;
      } catch (error) {
        logger.error("Commission change notice failed", { changeId: change.id, supplierId: supplier.id, error });
      }
    }
    database.prepare("UPDATE commission_rate_changes SET notified_at = datetime('now') WHERE id = ?").run(change.id);
  }
  return { sent };
}

function whatsAppCommissionTemplate(change, what) {
  return whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPLIER_COMMISSION, [what, `${change.oldRate}%`, `${change.newRate}%`]);
}
