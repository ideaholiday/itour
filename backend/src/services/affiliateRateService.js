/**
 * Admin control of creator commission (ADR 017, plan Phase 4a).
 *
 * Admins edit tier rates and thresholds, and set a creator's own rates for a
 * negotiated deal. Commission and the traveler discount are both % of booking
 * value, and together must fit the giveaway cap (BUSINESS_RULES §3.2).
 * Commission already accrued keeps the rate it was booked at; creators whose
 * rates change are told.
 *
 * See docs/BUSINESS_RULES.md §10.2 and migrations/041_affiliate_rate_controls.sql.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";
import { effectiveAffiliateRates, refreshAffiliateTier, resolveTier } from "./affiliateService.js";
import { getSettings } from "./programSettingsService.js";
import { sendRecipientChannels } from "./notificationService.js";

function rateError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

const pct = (fraction) => Math.round(Number(fraction) * 10000) / 100;

function requireReason(reason) {
  const why = String(reason || "").trim();
  if (why.length < 3) throw rateError("Give a reason for this change", 400, "REASON_REQUIRED");
  return why;
}

function percentOrNull(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 50) throw rateError(`${label} must be between 0% and 50%`, 400, "INVALID_RATE");
  return Math.round(number * 100) / 100;
}

function capPct(database) {
  return getSettings(database, "giveaway").maxBookingValuePct;
}

function assertFits(database, commissionPct, discountPct, who) {
  const cap = capPct(database);
  if (commissionPct + discountPct > cap + 1e-9) {
    throw rateError(`${who}: ${commissionPct}% commission + ${discountPct}% traveler discount is ${Math.round((commissionPct + discountPct) * 100) / 100}% of the booking, over the ${cap}% giveaway cap.`, 400, "OVER_GIVEAWAY_CAP");
  }
}

function recordChange(database, { scope, tierCode = null, affiliateId = null, before, after, actorId, reason }) {
  database.prepare(`
    INSERT INTO affiliate_rate_changes (id, scope, tier_code, affiliate_id, old_value_json, new_value_json, changed_by, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`arc_${nanoid(12)}`, scope, tierCode, affiliateId, JSON.stringify(before), JSON.stringify(after), actorId, reason);
}

function tierView(row, cap, creators) {
  const commissionPct = pct(row.commission_rate);
  const discountPct = Number(row.traveler_discount_pct);
  return {
    code: row.code,
    label: row.label,
    minCompletedBookings: Number(row.min_completed_bookings),
    minLifetimeGmvInr: Number(row.min_lifetime_gmv_inr),
    commissionPct,
    travelerDiscountPct: discountPct,
    sortOrder: Number(row.sort_order),
    overCap: commissionPct + discountPct > cap + 1e-9,
    creators,
  };
}

export function listAffiliateTiers(database) {
  const cap = capPct(database);
  return {
    giveawayCapPct: cap,
    tiers: database.prepare("SELECT * FROM affiliate_tiers ORDER BY sort_order ASC").all().map((row) => tierView(
      row, cap,
      Number(database.prepare("SELECT COUNT(*) AS count FROM affiliates WHERE tier_code = ?").get(row.code)?.count) || 0,
    )),
  };
}

/**
 * Updates one tier. Refused when the tier, or any creator on it with only one of
 * the two rates set by hand, would go over the giveaway cap.
 */
export function updateAffiliateTier(database, code, input, { actorId = null, reason } = {}) {
  const why = requireReason(reason);
  const row = database.prepare("SELECT * FROM affiliate_tiers WHERE code = ?").get(code);
  if (!row) throw rateError("Tier not found", 404);
  const before = tierView(row, capPct(database), 0);

  const next = {
    label: input.label === undefined ? row.label : String(input.label).trim(),
    minCompletedBookings: input.minCompletedBookings === undefined ? Number(row.min_completed_bookings) : Math.floor(Number(input.minCompletedBookings)),
    minLifetimeGmvInr: input.minLifetimeGmvInr === undefined ? Number(row.min_lifetime_gmv_inr) : Number(input.minLifetimeGmvInr),
    commissionPct: input.commissionPct === undefined ? pct(row.commission_rate) : percentOrNull(input.commissionPct, "Commission"),
    travelerDiscountPct: input.travelerDiscountPct === undefined ? Number(row.traveler_discount_pct) : percentOrNull(input.travelerDiscountPct, "Traveler discount"),
  };
  if (!next.label || next.label.length > 40) throw rateError("A tier needs a name of up to 40 characters", 400, "INVALID_TIER");
  if (next.commissionPct === null || next.travelerDiscountPct === null) throw rateError("A tier needs both rates", 400, "INVALID_RATE");
  if (!Number.isFinite(next.minCompletedBookings) || next.minCompletedBookings < 0 || !Number.isFinite(next.minLifetimeGmvInr) || next.minLifetimeGmvInr < 0) {
    throw rateError("Thresholds must be zero or more", 400, "INVALID_TIER");
  }
  assertFits(database, next.commissionPct, next.travelerDiscountPct, next.label);

  const onTier = database.prepare("SELECT * FROM affiliates WHERE tier_code = ?").all(code);
  for (const affiliate of onTier) {
    const rates = effectiveAffiliateRates({ commission_rate: next.commissionPct / 100, traveler_discount_pct: next.travelerDiscountPct }, affiliate);
    assertFits(database, pct(rates.commissionRate), rates.travelerDiscountPct, affiliate.channel_name || affiliate.affiliate_code);
  }

  const affected = [];
  database.transaction(() => {
    database.prepare(`
      UPDATE affiliate_tiers SET label = ?, min_completed_bookings = ?, min_lifetime_gmv_inr = ?, commission_rate = ?, traveler_discount_pct = ?
      WHERE code = ?
    `).run(next.label, next.minCompletedBookings, next.minLifetimeGmvInr, next.commissionPct / 100, next.travelerDiscountPct, code);
    recordChange(database, { scope: "TIER", tierCode: code, before, after: next, actorId, reason: why });
    // Thresholds may move creators between tiers; every creator is re-placed and
    // anyone whose rates moved is told.
    for (const affiliate of database.prepare("SELECT * FROM affiliates").all()) {
      const previous = { commissionRate: Number(affiliate.commission_rate), travelerDiscountPct: Number(affiliate.traveler_discount_pct) };
      refreshAffiliateTier(database, affiliate.id);
      const now = database.prepare("SELECT tier_code, commission_rate, traveler_discount_pct FROM affiliates WHERE id = ?").get(affiliate.id);
      if (Math.abs(previous.commissionRate - Number(now.commission_rate)) > 1e-9 || Math.abs(previous.travelerDiscountPct - Number(now.traveler_discount_pct)) > 1e-9) {
        affected.push({ affiliateId: affiliate.id, tierCode: now.tier_code, before: previous, after: { commissionRate: Number(now.commission_rate), travelerDiscountPct: Number(now.traveler_discount_pct) } });
      }
    }
  })();
  logger.info("Affiliate tier updated", { code, actorId, affected: affected.length });
  return { tier: listAffiliateTiers(database).tiers.find((tier) => tier.code === code), affected };
}

/** Sets or clears one creator's own rates (`null` = use the tier's). */
export function setAffiliateRates(database, affiliateId, input, { actorId = null, reason } = {}) {
  const why = requireReason(reason);
  const affiliate = database.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliateId);
  if (!affiliate) throw rateError("Creator not found", 404);
  const commissionPct = input.commissionPct === undefined
    ? (affiliate.commission_override_rate === null ? null : pct(affiliate.commission_override_rate))
    : percentOrNull(input.commissionPct, "Commission");
  const discountPct = input.travelerDiscountPct === undefined ? affiliate.traveler_discount_override_pct : percentOrNull(input.travelerDiscountPct, "Traveler discount");

  const tier = resolveTier(database, affiliate.id);
  const proposed = { ...affiliate, commission_override_rate: commissionPct === null ? null : commissionPct / 100, traveler_discount_override_pct: discountPct };
  const rates = effectiveAffiliateRates(tier, proposed);
  assertFits(database, pct(rates.commissionRate), rates.travelerDiscountPct, affiliate.channel_name || affiliate.affiliate_code);

  const before = { commissionPct: pct(affiliate.commission_rate), travelerDiscountPct: Number(affiliate.traveler_discount_pct), commissionOverridePct: affiliate.commission_override_rate === null ? null : pct(affiliate.commission_override_rate), travelerDiscountOverridePct: affiliate.traveler_discount_override_pct };
  database.transaction(() => {
    database.prepare("UPDATE affiliates SET commission_override_rate = ?, traveler_discount_override_pct = ?, updated_at = datetime('now') WHERE id = ?")
      .run(proposed.commission_override_rate, discountPct, affiliate.id);
    refreshAffiliateTier(database, affiliate.id);
    recordChange(database, {
      scope: "AFFILIATE", affiliateId: affiliate.id, before,
      after: { commissionPct: pct(rates.commissionRate), travelerDiscountPct: rates.travelerDiscountPct, commissionOverridePct: commissionPct, travelerDiscountOverridePct: discountPct },
      actorId, reason: why,
    });
  })();
  const now = database.prepare("SELECT tier_code, commission_rate, traveler_discount_pct FROM affiliates WHERE id = ?").get(affiliate.id);
  const changed = Math.abs(Number(affiliate.commission_rate) - Number(now.commission_rate)) > 1e-9 || Math.abs(Number(affiliate.traveler_discount_pct) - Number(now.traveler_discount_pct)) > 1e-9;
  return {
    affiliateId: affiliate.id,
    commissionPct: pct(now.commission_rate),
    travelerDiscountPct: Number(now.traveler_discount_pct),
    commissionOverridden: commissionPct !== null,
    discountOverridden: discountPct !== null,
    affected: changed ? [{ affiliateId: affiliate.id, tierCode: now.tier_code, before: { commissionRate: Number(affiliate.commission_rate), travelerDiscountPct: Number(affiliate.traveler_discount_pct) }, after: { commissionRate: Number(now.commission_rate), travelerDiscountPct: Number(now.traveler_discount_pct) } }] : [],
  };
}

export function listAffiliateRateChanges(database, { limit = 100 } = {}) {
  return database.prepare(`
    SELECT c.*, a.channel_name, u.name AS changed_by_name FROM affiliate_rate_changes c
    LEFT JOIN affiliates a ON a.id = c.affiliate_id LEFT JOIN users u ON u.id = c.changed_by
    ORDER BY c.created_at DESC, c.id DESC LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id, scope: row.scope, tierCode: row.tier_code, affiliateId: row.affiliate_id, creatorName: row.channel_name || null,
    before: JSON.parse(row.old_value_json || "null"), after: JSON.parse(row.new_value_json), reason: row.reason,
    changedByName: row.changed_by_name || null, createdAt: row.created_at,
  }));
}

/** Tells creators their commission or audience discount changed, for new bookings. */
export async function sendAffiliateRateNotices(database, affected = []) {
  for (const change of affected) {
    const creator = database.prepare(`
      SELECT a.id, a.channel_name, a.affiliate_code, u.name, u.email, u.phone FROM affiliates a JOIN users u ON u.id = a.user_id WHERE a.id = ?
    `).get(change.affiliateId);
    if (!creator) continue;
    const name = creator.name || creator.channel_name || "Creator";
    const message = `Hello ${name},\n\nYour Idea Holiday creator rates have changed: commission ${pct(change.before.commissionRate)}% → ${pct(change.after.commissionRate)}% of the booking, and your audience's discount with code ${creator.affiliate_code} ${change.before.travelerDiscountPct}% → ${change.after.travelerDiscountPct}%.\n\nThis applies to bookings made from now on. Commission you have already earned keeps its rate.`;
    try {
      await sendRecipientChannels({
        database,
        eventType: "AFFILIATE_RATES_CHANGED",
        eventKeyPrefix: `${creator.id}:AFFILIATE_RATES_CHANGED:${Date.now()}`,
        recipient: { id: creator.id, role: "AFFILIATE", name, email: creator.email, phone: null },
        subject: "Your Idea Holiday creator rates have changed",
        emailText: message,
        metadata: { affiliateId: creator.id },
      });
    } catch (error) {
      logger.error("Creator rate notice failed", { affiliateId: creator.id, error });
    }
  }
}
