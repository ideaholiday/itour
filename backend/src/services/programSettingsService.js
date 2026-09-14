/**
 * Admin-controlled settings for the money programs (ADR 017).
 *
 * Each program keeps one JSON row in `program_settings`. Code defaults apply
 * until an admin saves a change, so a program behaves the same whether or not
 * its row exists. Every change is validated, written with an audit row in one
 * transaction, and applies to new bookings only: each program freezes the rate
 * it used onto its own records.
 *
 * Reads are cached per process for a minute, so on several instances a change
 * can take up to that long to reach all of them.
 *
 * See docs/BUSINESS_RULES.md §3.2 and migrations/037_program_settings.sql.
 */
import { nanoid } from "nanoid";
import { z } from "zod";
import logger from "../config/logger.js";

const PROGRAMS = {
  giveaway: {
    label: "Giveaway cap",
    schema: z.object({
      /** Most one booking may give away (coupon, referral, creator), as % of its value. */
      maxBookingValuePct: z.number().min(0).max(50),
    }).strict(),
    defaults: { maxBookingValuePct: 10 },
  },
  commission: {
    label: "Platform commission",
    schema: z.object({
      /** Commission on a booking whose product and supplier have no override, in %. */
      defaultRatePercent: z.number().min(0).max(50),
    }).strict(),
    defaults: { defaultRatePercent: 30 },
  },
  supplier_subscriptions: {
    label: "Supplier subscriptions",
    schema: z.object({
      /** New suppliers get free cover (a LAUNCH waiver) while this is on. */
      launchWaiver: z.boolean(),
      /** Last day of launch waivers (UTC), or null for no end date yet. */
      launchWaiverUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2027-03-31").nullable(),
      /** Subscription price before GST, in rupees; null while the owner has not set one (not for sale). */
      priceInr: z.number().positive().max(1_000_000).nullable(),
      /** How long one payment covers. */
      billingPeriodMonths: z.number().int().min(1).max(36),
    }).strict(),
    defaults: { launchWaiver: true, launchWaiverUntil: null, priceInr: null, billingPeriodMonths: 12 },
  },
  supplier_plans: {
    label: "Supplier profile plans",
    schema: z.object({
      /** Yearly Verified check (ADR 008), rupees before GST. Buys the check, never the badge. */
      verifiedPriceInr: z.number().positive().max(1_000_000),
      /** One product on the public profile, one-time. */
      spotlightPriceInr: z.number().positive().max(1_000_000),
      /** First-year Verified check plus one Spotlight; renews as Verified. */
      verifiedPlusPriceInr: z.number().positive().max(1_000_000),
    }).strict(),
    defaults: { verifiedPriceInr: 999, spotlightPriceInr: 2999, verifiedPlusPriceInr: 3499 },
  },
  referral: {
    label: "Share & Earn",
    schema: z.object({
      /** New friend discounts and referrer rewards are created while this is on. */
      enabled: z.boolean(),
      /** Friend's first-trip discount, as % of the booking's commission. */
      friendDiscountPct: z.number().min(0).max(50),
      /** Referrer's credit on each of the friend's trips, as % of the booking's commission. */
      referrerRewardPct: z.number().min(0).max(50),
      earningWindowMonths: z.number().int().min(1).max(60),
      attributionWindowDays: z.number().int().min(1).max(365),
      clearingHoldDays: z.number().int().min(0).max(90),
      creditExpiryMonths: z.number().int().min(1).max(60),
      expiryReminderDays: z.number().int().min(1).max(90),
      maxSignupsPerDay: z.number().int().min(1).max(1000),
      maxClearedPer30DaysInr: z.number().min(0).max(10_000_000),
      /** Wallet credit may pay at most this share of what is left to pay. */
      walletMaxSharePct: z.number().min(0).max(100),
      walletMaxPerBookingInr: z.number().min(0).max(10_000_000),
    }).strict(),
    defaults: {
      enabled: true,
      friendDiscountPct: 10,
      referrerRewardPct: 10,
      earningWindowMonths: 24,
      attributionWindowDays: 30,
      clearingHoldDays: 7,
      creditExpiryMonths: 12,
      expiryReminderDays: 30,
      maxSignupsPerDay: 5,
      maxClearedPer30DaysInr: 5000,
      walletMaxSharePct: 50,
      walletMaxPerBookingInr: 2000,
    },
  },
};

/** The highest commission % any booking can be charged right now. */
function highestCommissionRate(database, defaultRatePercent) {
  const overrides = (table) => {
    try {
      return Number(database.prepare(`SELECT MAX(commission_override_rate) AS rate FROM ${table}`).get()?.rate) || 0;
    } catch {
      return 0;
    }
  };
  return Math.max(Number(defaultRatePercent) || 0, overrides("suppliers"), overrides("products"));
}

/**
 * Cross-program rules a change must keep true. Referral rewards are a share of
 * commission, so at the highest commission in use the friend discount plus
 * referrer credit must still fit the giveaway cap (BUSINESS_RULES §3.2).
 * Returns a message when a rule breaks, else null.
 */
export function checkProgramLimits(database, proposed = {}, { commissionRate = null } = {}) {
  const current = (key) => proposed[key] || resolve(key, readRow(database, key));
  const referral = current("referral");
  if (!referral.enabled) return null;
  const cap = current("giveaway").maxBookingValuePct;
  const commission = Math.max(highestCommissionRate(database, current("commission").defaultRatePercent), Number(commissionRate) || 0);
  const shareOfBooking = (referral.friendDiscountPct + referral.referrerRewardPct) * commission / 100;
  if (shareOfBooking > cap + 1e-9) {
    return `Friend discount ${referral.friendDiscountPct}% + referrer reward ${referral.referrerRewardPct}% of a ${commission}% commission is ${Math.round(shareOfBooking * 100) / 100}% of the booking, over the ${cap}% giveaway cap.`;
  }
  return null;
}

export function getProgramDefaults(key) {
  return { ...definition(key).defaults };
}

const CACHE_TTL_MS = 60_000;
const cache = new WeakMap();

function settingsError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function definition(key) {
  const program = PROGRAMS[key];
  if (!program) throw settingsError(`Unknown program "${key}"`, 404, "UNKNOWN_PROGRAM");
  return program;
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function readRow(database, key) {
  try {
    return database.prepare("SELECT key, value_json, updated_by, updated_at FROM program_settings WHERE key = ?").get(key) || null;
  } catch (error) {
    // Before migration 037 there is no table; the defaults are the settings.
    if (/no such table|does not exist/i.test(error.message)) return null;
    throw error;
  }
}

function resolve(key, row) {
  const program = definition(key);
  if (!row) return { ...program.defaults };
  const merged = { ...program.defaults, ...(parseJson(row.value_json) || {}) };
  const parsed = program.schema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // A stored value that no longer validates must not stop checkout.
  logger.error("Stored program settings are invalid; using defaults", { key, issues: parsed.error.issues });
  return { ...program.defaults };
}

/** The current settings for one program. */
export function getSettings(database, key) {
  definition(key);
  const byKey = cache.get(database) || new Map();
  const hit = byKey.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.value };
  const value = resolve(key, readRow(database, key));
  byKey.set(key, { value, at: Date.now() });
  cache.set(database, byKey);
  return { ...value };
}

export function clearProgramSettingsCache(database) {
  if (database) cache.delete(database);
}

/** Every program with its settings, defaults and last change, for the admin panel. */
export function listPrograms(database) {
  return Object.entries(PROGRAMS).map(([key, program]) => {
    const row = readRow(database, key);
    return {
      key,
      label: program.label,
      settings: resolve(key, row),
      defaults: { ...program.defaults },
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null,
    };
  });
}

/**
 * Saves a partial change to one program. Refuses unknown fields, out-of-range
 * values and an empty reason; a change that alters nothing writes nothing.
 */
export function updateSettings(database, key, patch, { actorId = null, reason } = {}) {
  const program = definition(key);
  const why = String(reason || "").trim();
  if (why.length < 3) throw settingsError("Give a reason for this change", 400, "REASON_REQUIRED");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw settingsError("Settings must be an object");

  const before = resolve(key, readRow(database, key));
  const parsed = program.schema.safeParse({ ...before, ...patch });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw settingsError(`${issue.path.join(".") || key}: ${issue.message}`, 400, "INVALID_SETTINGS");
  }
  const after = parsed.data;
  if (JSON.stringify(after) === JSON.stringify(before)) {
    return { key, settings: after, changed: false };
  }
  const limit = checkProgramLimits(database, { [key]: after });
  if (limit) throw settingsError(limit, 400, "OVER_GIVEAWAY_CAP");

  database.transaction(() => {
    database.prepare(`
      INSERT INTO program_settings (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(after), actorId);
    database.prepare(`
      INSERT INTO program_settings_audit (id, key, old_value_json, new_value_json, changed_by, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`psa_${nanoid(12)}`, key, JSON.stringify(before), JSON.stringify(after), actorId, why);
  })();
  clearProgramSettingsCache(database);
  logger.info("Program settings changed", { key, actorId });
  return { key, settings: after, changed: true, previous: before };
}

export function listSettingsAudit(database, { key = null, limit = 100 } = {}) {
  const rows = key
    ? database.prepare(`
        SELECT a.*, u.name AS changed_by_name FROM program_settings_audit a LEFT JOIN users u ON u.id = a.changed_by
        WHERE a.key = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?
      `).all(key, limit)
    : database.prepare(`
        SELECT a.*, u.name AS changed_by_name FROM program_settings_audit a LEFT JOIN users u ON u.id = a.changed_by
        ORDER BY a.created_at DESC, a.id DESC LIMIT ?
      `).all(limit);
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    before: parseJson(row.old_value_json),
    after: parseJson(row.new_value_json),
    changedBy: row.changed_by,
    changedByName: row.changed_by_name || null,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/**
 * The most a booking may give away in rupees: the giveaway share of its value,
 * never more than its commission (BUSINESS_RULES §3.2).
 */
export function giveawayBudgetInr(database, { bookingValueInr, commissionInr }) {
  const { maxBookingValuePct } = getSettings(database, "giveaway");
  return Math.max(0, Math.min((Number(bookingValueInr) || 0) * maxBookingValuePct / 100, Number(commissionInr) || 0));
}
