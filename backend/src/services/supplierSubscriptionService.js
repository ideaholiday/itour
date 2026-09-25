/**
 * Required subscriptions for suppliers who sign up from 2026-09-14 (ADR 017).
 *
 * A supplier is *covered* when it is exempt (registered before that date) or
 * holds a live subscription row: ACTIVE once paid, WAIVED when given free by an
 * admin or the launch waiver. Only covered, KYB-approved suppliers can take new
 * bookings (`approvedSupplierSql`); bookings already made are always honoured.
 *
 * Until a price and online payment exist, the launch waiver (program setting
 * `supplier_subscriptions`) covers every new supplier until `launchWaiverUntil`,
 * or with no end date while that is unset. Switching the launch waiver off stops
 * new launch waivers but leaves the ones already given.
 *
 * See docs/SUPPLIER_PLANS.md and migrations/039_supplier_subscriptions.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";
import { getSettings } from "./programSettingsService.js";
import { sendRecipientChannels } from "./notificationService.js";

const LIVE_STATUSES = ["ACTIVE", "WAIVED"];
const REMINDER_DAYS = [30, 7, 1];
const DAY_MS = 86_400_000;

function subscriptionError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

/** `YYYY-MM-DD HH:MM:SS` in UTC, the format `datetime('now')` writes. */
export function sqlTimestamp(date = new Date()) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

/** A waiver "until" date covers that whole day (UTC). */
function endOfDay(date) {
  if (date === null || date === undefined || date === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw subscriptionError("Use a date like 2027-03-31", 400, "INVALID_DATE");
  return `${date} 23:59:59`;
}

function liveSubscriptions(database, supplierId, now = new Date()) {
  const at = sqlTimestamp(now);
  return database.prepare(`
    SELECT * FROM supplier_subscriptions
    WHERE supplier_id = ? AND status IN ('ACTIVE', 'WAIVED') AND starts_at <= ? AND (ends_at IS NULL OR ends_at >= ?)
    ORDER BY CASE WHEN ends_at IS NULL THEN 1 ELSE 0 END DESC, ends_at DESC
  `).all(supplierId, at, at);
}

/** Where a supplier stands, for the supplier portal and the admin panel. */
export function getSubscriptionStatus(database, supplierId, { now = new Date() } = {}) {
  const supplier = database.prepare("SELECT id, subscription_exempt FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw subscriptionError("Supplier not found", 404);
  const exempt = Number(supplier.subscription_exempt) === 1;
  const live = liveSubscriptions(database, supplierId, now);
  const cover = live[0] || null;
  const history = database.prepare(`
    SELECT s.*, u.name AS granted_by_name FROM supplier_subscriptions s LEFT JOIN users u ON u.id = s.granted_by
    WHERE s.supplier_id = ? ORDER BY s.created_at DESC, s.id DESC
  `).all(supplierId);
  return {
    supplierId,
    required: !exempt,
    exempt,
    covered: exempt || Boolean(cover),
    cover: cover ? { id: cover.id, status: cover.status, source: cover.source, endsAt: cover.ends_at } : null,
    history: history.map((row) => ({
      id: row.id, status: row.status, source: row.source, planCode: row.plan_code,
      startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason,
      grantedBy: row.granted_by, grantedByName: row.granted_by_name || null, createdAt: row.created_at,
    })),
  };
}

/** An admin gives a supplier free cover until a date (or with no end date). */
export function grantSubscriptionWaiver(database, { supplierId, until = null, reason, actorId = null, now = new Date() }) {
  const why = String(reason || "").trim();
  if (why.length < 3) throw subscriptionError("Give a reason for this waiver", 400, "REASON_REQUIRED");
  const endsAt = endOfDay(until);
  if (endsAt && endsAt < sqlTimestamp(now)) throw subscriptionError("A waiver must end today or later", 400, "INVALID_DATE");
  const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw subscriptionError("Supplier not found", 404);

  const id = `ssub_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO supplier_subscriptions (id, supplier_id, status, source, starts_at, ends_at, granted_by, reason)
    VALUES (?, ?, 'WAIVED', 'WAIVER', ?, ?, ?, ?)
  `).run(id, supplierId, sqlTimestamp(now), endsAt, actorId, why);
  logger.info("Supplier subscription waived", { supplierId, until: endsAt, actorId });
  return database.prepare("SELECT * FROM supplier_subscriptions WHERE id = ?").get(id);
}

/** Ends a waiver or subscription now. The supplier stops taking new bookings unless something else covers it. */
export function revokeSubscription(database, { subscriptionId, reason, actorId = null, now = new Date() }) {
  const why = String(reason || "").trim();
  if (why.length < 3) throw subscriptionError("Give a reason for ending this", 400, "REASON_REQUIRED");
  const row = database.prepare("SELECT * FROM supplier_subscriptions WHERE id = ?").get(subscriptionId);
  if (!row) throw subscriptionError("Subscription not found", 404);
  if (!LIVE_STATUSES.includes(row.status)) throw subscriptionError("This is not active", 409, "NOT_ACTIVE");
  database.prepare(`
    UPDATE supplier_subscriptions SET status = 'CANCELLED', ends_at = ?, updated_at = ?,
      reason = COALESCE(reason, '') || ? WHERE id = ?
  `).run(sqlTimestamp(now), sqlTimestamp(now), ` · Ended by admin: ${why}`, subscriptionId);
  logger.info("Supplier subscription ended", { subscriptionId, supplierId: row.supplier_id, actorId });
  return database.prepare("SELECT * FROM supplier_subscriptions WHERE id = ?").get(subscriptionId);
}

/**
 * Gives a launch waiver to a new supplier with no subscription row yet, while
 * the launch waiver is on. Safe to call repeatedly.
 */
export function ensureLaunchWaiver(database, supplierId, { now = new Date() } = {}) {
  const { launchWaiver, launchWaiverUntil } = getSettings(database, "supplier_subscriptions");
  if (!launchWaiver) return null;
  const supplier = database.prepare("SELECT id, subscription_exempt FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier || Number(supplier.subscription_exempt) === 1) return null;
  const any = database.prepare("SELECT 1 FROM supplier_subscriptions WHERE supplier_id = ? LIMIT 1").get(supplierId);
  if (any) return null;
  const id = `ssub_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO supplier_subscriptions (id, supplier_id, status, source, starts_at, ends_at, reason)
    VALUES (?, ?, 'WAIVED', 'LAUNCH', ?, ?, 'Launch offer')
  `).run(id, supplierId, sqlTimestamp(now), endOfDay(launchWaiverUntil));
  return id;
}

/**
 * Brings launch waivers in line with the setting: every new supplier without a
 * row gets one (while the launch waiver is on), and live launch waivers take the
 * current end date. Run at startup and whenever the setting changes.
 */
export function syncLaunchWaivers(database, { now = new Date() } = {}) {
  const { launchWaiver, launchWaiverUntil } = getSettings(database, "supplier_subscriptions");
  let created = 0;
  let updated = 0;
  database.transaction(() => {
    if (launchWaiver) {
      const uncovered = database.prepare(`
        SELECT s.id FROM suppliers s
        WHERE COALESCE(s.subscription_exempt, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM supplier_subscriptions ss WHERE ss.supplier_id = s.id)
      `).all();
      for (const supplier of uncovered) {
        if (ensureLaunchWaiver(database, supplier.id, { now })) created += 1;
      }
      updated = database.prepare(`
        UPDATE supplier_subscriptions SET ends_at = ?, updated_at = ?
        WHERE source = 'LAUNCH' AND status = 'WAIVED'
      `).run(endOfDay(launchWaiverUntil), sqlTimestamp(now)).changes;
    }
  })();
  return { created, updated };
}

/** New suppliers and whether each can take bookings, for the admin panel. */
export function listSupplierSubscriptions(database, { now = new Date() } = {}) {
  const suppliers = database.prepare(`
    SELECT id, company_name, city, kyb_status, created_at FROM suppliers
    WHERE COALESCE(subscription_exempt, 0) = 0 ORDER BY created_at DESC
  `).all();
  return suppliers.map((supplier) => {
    const status = getSubscriptionStatus(database, supplier.id, { now });
    return {
      id: supplier.id, name: supplier.company_name, city: supplier.city, kybStatus: supplier.kyb_status,
      signedUpAt: supplier.created_at, covered: status.covered, cover: status.cover, history: status.history,
    };
  });
}

/**
 * Marks lapsed subscriptions EXPIRED and picks the reminders due (30, 7 and 1
 * days before a dated cover ends). Coverage itself follows `ends_at`, so a
 * missed run never keeps a supplier selling past the end.
 */
export function processSubscriptionLifecycle(database, { now = new Date() } = {}) {
  const at = sqlTimestamp(now);
  const expired = database.prepare(`
    UPDATE supplier_subscriptions SET status = 'EXPIRED', updated_at = ?
    WHERE status IN ('ACTIVE', 'WAIVED') AND ends_at IS NOT NULL AND ends_at < ?
  `).run(at, at).changes;

  const reminders = [];
  const ending = database.prepare(`
    SELECT ss.*, s.company_name, s.contact_name, s.email, s.phone FROM supplier_subscriptions ss
    JOIN suppliers s ON s.id = ss.supplier_id
    WHERE ss.status IN ('ACTIVE', 'WAIVED') AND ss.ends_at IS NOT NULL AND ss.ends_at >= ?
  `).all(at);
  for (const row of ending) {
    const daysLeft = Math.ceil((new Date(`${row.ends_at.replace(" ", "T")}Z`).getTime() - now.getTime()) / DAY_MS);
    const due = REMINDER_DAYS.filter((days) => daysLeft <= days).sort((a, b) => a - b)[0];
    if (due === undefined || (row.last_reminder_days !== null && row.last_reminder_days <= due)) continue;
    // Another live cover that outlasts this one means nothing is actually ending.
    const later = database.prepare(`
      SELECT 1 FROM supplier_subscriptions WHERE supplier_id = ? AND id <> ? AND status IN ('ACTIVE', 'WAIVED')
        AND (ends_at IS NULL OR ends_at > ?) LIMIT 1
    `).get(row.supplier_id, row.id, row.ends_at);
    database.prepare("UPDATE supplier_subscriptions SET last_reminder_days = ? WHERE id = ?").run(due, row.id);
    if (!later) reminders.push({ subscriptionId: row.id, supplier: row, daysLeft, endsAt: row.ends_at });
  }
  return { expired, reminders };
}

export async function sendSubscriptionReminders(database, reminders = []) {
  for (const reminder of reminders) {
    const { supplier } = reminder;
    const name = supplier.contact_name || supplier.company_name || "Partner";
    const endDate = reminder.endsAt.slice(0, 10);
    const message = `Hello ${name},\n\nYour free Idea Holiday supplier subscription ends on ${endDate}. After that your listings stop taking new bookings until the subscription is renewed. Bookings already made are not affected.\n\nOpen the Supplier Portal or contact us to continue.`;
    try {
      await sendRecipientChannels({
        database,
        eventType: "SUPPLIER_SUBSCRIPTION_ENDING",
        eventKeyPrefix: `${reminder.subscriptionId}:SUPPLIER_SUBSCRIPTION_ENDING:${reminder.daysLeft}`,
        recipient: { id: supplier.supplier_id, role: "SUPPLIER", name, email: supplier.email, phone: supplier.phone },
        subject: `Your Idea Holiday subscription ends on ${endDate}`,
        emailText: message,
        whatsappText: message,
        metadata: { subscriptionId: reminder.subscriptionId, supplierId: supplier.supplier_id },
      });
    } catch (error) {
      logger.error("Subscription reminder failed", { subscriptionId: reminder.subscriptionId, error });
    }
  }
}
