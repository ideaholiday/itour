/**
 * Admin management of coupons (`promo_codes`, ADR 017 Phase 2).
 *
 * Checking and charging a coupon lives in promoService. Coupons are never
 * deleted, because bookings and redemptions refer to their code: an admin
 * deactivates one instead. A creator's code belongs to the affiliate program,
 * which sets its discount from the creator's tier, so here it can only be
 * switched on or off.
 */
import { nanoid } from "nanoid";
import logger from "../config/logger.js";

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

function couponError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function parseList(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const listJson = (list) => (Array.isArray(list) && list.length ? JSON.stringify([...new Set(list.map((item) => String(item).trim()).filter(Boolean))]) : null);
const sqlTimestamp = (date = new Date()) => new Date(date).toISOString().slice(0, 19).replace("T", " ");

function isCreatorCode(database, code) {
  try {
    return Boolean(database.prepare("SELECT 1 FROM affiliates WHERE affiliate_code = ?").get(code));
  } catch {
    return false;
  }
}

function toView(database, row) {
  const stats = database.prepare(`
    SELECT COUNT(*) AS uses, COALESCE(SUM(discount_inr), 0) AS discount
    FROM coupon_redemptions WHERE coupon_code = ? AND status = 'ACTIVE'
  `).get(row.code);
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    minOrderInr: Number(row.min_order_inr || 0),
    maxDiscountInr: row.max_discount_inr === null ? null : Number(row.max_discount_inr),
    usageLimit: row.usage_limit || null,
    timesUsed: Number(row.times_used || 0),
    perUserLimit: row.per_user_limit || null,
    firstBookingOnly: Number(row.first_booking_only) === 1,
    startsAt: row.starts_at || null,
    expiresAt: row.expires_at || null,
    productTypes: parseList(row.product_types_json),
    productIds: parseList(row.product_ids_json),
    supplierIds: parseList(row.supplier_ids_json),
    isActive: Number(row.is_active) === 1,
    audience: row.audience || "TRAVELER",
    isCreatorCode: isCreatorCode(database, row.code),
    redeemedCount: Number(stats.uses),
    discountGivenInr: Math.round(Number(stats.discount) * 100) / 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

export function listCoupons(database) {
  return database.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC, code")
    .all().map((row) => toView(database, row));
}

function getCouponRow(database, id) {
  const row = database.prepare("SELECT * FROM promo_codes WHERE id = ?").get(id);
  if (!row) throw couponError("Coupon not found", 404);
  return row;
}

/** Normalises and checks the editable fields; `current` is the stored row when updating. */
function normalizeFields(input, current = null) {
  const pick = (key, fallback) => (input[key] === undefined ? fallback : input[key]);
  const fields = {
    description: String(pick("description", current?.description ?? "") || "").trim() || null,
    discount_type: String(pick("discountType", current?.discount_type ?? "PERCENTAGE")).toUpperCase(),
    discount_value: Number(pick("discountValue", current?.discount_value)),
    min_order_inr: Number(pick("minOrderInr", current?.min_order_inr ?? 0)) || 0,
    max_discount_inr: pick("maxDiscountInr", current?.max_discount_inr ?? null),
    usage_limit: pick("usageLimit", current?.usage_limit ?? null),
    per_user_limit: pick("perUserLimit", current?.per_user_limit ?? null),
    first_booking_only: pick("firstBookingOnly", Number(current?.first_booking_only) === 1) ? 1 : 0,
    starts_at: pick("startsAt", current?.starts_at ?? null) || null,
    expires_at: pick("expiresAt", current?.expires_at ?? null) || null,
    product_types_json: input.productTypes === undefined ? current?.product_types_json ?? null : listJson(input.productTypes?.map((type) => String(type).toUpperCase())),
    product_ids_json: input.productIds === undefined ? current?.product_ids_json ?? null : listJson(input.productIds),
    supplier_ids_json: input.supplierIds === undefined ? current?.supplier_ids_json ?? null : listJson(input.supplierIds),
    is_active: pick("isActive", current ? Number(current.is_active) === 1 : true) ? 1 : 0,
  };

  if (!["PERCENTAGE", "FIXED"].includes(fields.discount_type)) throw couponError("Discount type must be PERCENTAGE or FIXED", 400, "INVALID_COUPON");
  if (!Number.isFinite(fields.discount_value) || fields.discount_value <= 0) throw couponError("Discount must be more than zero", 400, "INVALID_COUPON");
  if (fields.discount_type === "PERCENTAGE" && fields.discount_value > 100) throw couponError("A percentage discount cannot be more than 100%", 400, "INVALID_COUPON");
  for (const key of ["max_discount_inr", "usage_limit", "per_user_limit"]) {
    if (fields[key] === "" || fields[key] === null) { fields[key] = null; continue; }
    const value = Number(fields[key]);
    if (!Number.isFinite(value) || value <= 0) throw couponError(`${key.replace(/_/g, " ")} must be empty or more than zero`, 400, "INVALID_COUPON");
    fields[key] = key === "max_discount_inr" ? value : Math.floor(value);
  }
  for (const key of ["starts_at", "expires_at"]) {
    if (fields[key] && Number.isNaN(new Date(String(fields[key]).replace(" ", "T")).getTime())) throw couponError(`${key.replace("_", " ")} is not a valid date`, 400, "INVALID_COUPON");
    if (fields[key] && /^\d{4}-\d{2}-\d{2}$/.test(fields[key])) fields[key] = `${fields[key]} ${key === "expires_at" ? "23:59:59" : "00:00:00"}`;
  }
  if (fields.starts_at && fields.expires_at && fields.starts_at > fields.expires_at) throw couponError("A coupon must start before it expires", 400, "INVALID_COUPON");
  return fields;
}

export function createCoupon(database, input, { actorId = null } = {}) {
  const code = String(input.code || "").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw couponError("Use 3–40 letters, digits, - or _ for the code", 400, "INVALID_COUPON");
  // REF- codes are traveler referral codes (Share & Earn).
  if (code.startsWith("REF-")) throw couponError("Codes starting with REF- are reserved for traveler referrals", 400, "RESERVED_CODE");
  if (database.prepare("SELECT 1 FROM promo_codes WHERE code = ?").get(code) || isCreatorCode(database, code)) {
    throw couponError(`The code ${code} is already in use`, 409, "CODE_TAKEN");
  }
  const fields = normalizeFields(input);
  const audience = String(input.audience || "TRAVELER").toUpperCase();
  if (!["TRAVELER", "SUPPLIER_SUBSCRIPTION", "SUPPLIER_PLANS"].includes(audience)) throw couponError("A coupon is for traveler bookings, supplier subscriptions or supplier profile plans", 400, "INVALID_COUPON");
  const id = `promo_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO promo_codes (
      id, code, description, discount_type, discount_value, min_order_inr, max_discount_inr, usage_limit, times_used,
      is_active, expires_at, audience, starts_at, per_user_limit, first_booking_only,
      product_types_json, product_ids_json, supplier_ids_json, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, code, fields.description, fields.discount_type, fields.discount_value, fields.min_order_inr, fields.max_discount_inr, fields.usage_limit,
    fields.is_active, fields.expires_at, audience, fields.starts_at, fields.per_user_limit, fields.first_booking_only,
    fields.product_types_json, fields.product_ids_json, fields.supplier_ids_json, actorId, sqlTimestamp(), sqlTimestamp(),
  );
  logger.info("Coupon created", { code, actorId });
  return toView(database, getCouponRow(database, id));
}

export function updateCoupon(database, id, input, { actorId = null } = {}) {
  const current = getCouponRow(database, id);
  if (input.audience !== undefined && String(input.audience).toUpperCase() !== (current.audience || "TRAVELER")) {
    throw couponError("Who a coupon is for cannot be changed; create a new coupon instead", 400, "AUDIENCE_IMMUTABLE");
  }
  if (input.code !== undefined && String(input.code).trim().toUpperCase() !== current.code) {
    throw couponError("A coupon's code cannot be changed; create a new coupon instead", 400, "CODE_IMMUTABLE");
  }
  if (isCreatorCode(database, current.code)) {
    const editable = Object.keys(input).filter((key) => !["isActive", "code"].includes(key));
    if (editable.length) throw couponError("A creator's code takes its discount from their tier; it can only be switched on or off here", 409, "CREATOR_CODE");
  }
  const fields = normalizeFields(input, current);
  database.prepare(`
    UPDATE promo_codes SET description = ?, discount_type = ?, discount_value = ?, min_order_inr = ?, max_discount_inr = ?,
      usage_limit = ?, per_user_limit = ?, first_booking_only = ?, starts_at = ?, expires_at = ?,
      product_types_json = ?, product_ids_json = ?, supplier_ids_json = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `).run(
    fields.description, fields.discount_type, fields.discount_value, fields.min_order_inr, fields.max_discount_inr,
    fields.usage_limit, fields.per_user_limit, fields.first_booking_only, fields.starts_at, fields.expires_at,
    fields.product_types_json, fields.product_ids_json, fields.supplier_ids_json, fields.is_active, sqlTimestamp(), id,
  );
  logger.info("Coupon updated", { code: current.code, actorId });
  return toView(database, getCouponRow(database, id));
}

export function listCouponRedemptions(database, id, { limit = 200 } = {}) {
  const coupon = getCouponRow(database, id);
  const rows = database.prepare(`
    SELECT cr.*, b.ref AS booking_ref, b.amount_inr, b.payment_status, b.status AS booking_status, u.name AS user_name
    FROM coupon_redemptions cr
    LEFT JOIN bookings b ON b.id = cr.booking_id
    LEFT JOIN users u ON u.id = cr.user_id
    WHERE cr.coupon_code = ? ORDER BY cr.created_at DESC, cr.id DESC LIMIT ?
  `).all(coupon.code, limit);
  return {
    coupon: toView(database, coupon),
    redemptions: rows.map((row) => ({
      id: row.id, bookingId: row.booking_id, bookingRef: row.booking_ref, userId: row.user_id, userName: row.user_name || null,
      discountInr: Number(row.discount_inr), chargedInr: row.amount_inr === null ? null : Number(row.amount_inr),
      paymentStatus: row.payment_status, bookingStatus: row.booking_status,
      status: row.status, releaseReason: row.release_reason, releasedAt: row.released_at, createdAt: row.created_at,
    })),
  };
}
