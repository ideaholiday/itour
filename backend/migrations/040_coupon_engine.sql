-- Admin coupons (ADR 017, plan Phase 2).
--
-- promo_codes gains who a code is for, when it starts, per-traveler and
-- first-booking limits, and product/supplier targeting (JSON arrays of ids or
-- product types; NULL means any). coupon_redemptions records each use with the
-- rupees it actually took off. times_used is kept in step with ACTIVE
-- redemptions: incremented when a booking uses a code, decremented when the
-- redemption is RELEASED (checkout abandoned, or the booking fully refunded).

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'TRAVELER';
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS starts_at TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS per_user_limit INTEGER;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS first_booking_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS product_types_json TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS product_ids_json TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS supplier_ids_json TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  user_id TEXT,
  booking_id TEXT NOT NULL UNIQUE,
  discount_inr REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
  release_reason TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code_user ON coupon_redemptions(coupon_code, user_id, status);

-- @down
DROP INDEX IF EXISTS idx_coupon_redemptions_code_user;
DROP TABLE IF EXISTS coupon_redemptions;
ALTER TABLE promo_codes DROP COLUMN updated_at;
ALTER TABLE promo_codes DROP COLUMN created_by;
ALTER TABLE promo_codes DROP COLUMN supplier_ids_json;
ALTER TABLE promo_codes DROP COLUMN product_ids_json;
ALTER TABLE promo_codes DROP COLUMN product_types_json;
ALTER TABLE promo_codes DROP COLUMN first_booking_only;
ALTER TABLE promo_codes DROP COLUMN per_user_limit;
ALTER TABLE promo_codes DROP COLUMN starts_at;
ALTER TABLE promo_codes DROP COLUMN audience;
