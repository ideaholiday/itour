-- Promotional rates: supplier-run discounts on native inventory.
--
-- Distinct from the two existing mechanisms, deliberately:
--   * native_price_schedules  — absolute seasonal rates keyed on TRAVEL date.
--   * promo_codes (promoService) — platform-level codes off the booking TOTAL at checkout.
--   * native_promotions (here) — supplier discounts off the RESOLVED rate, keyed on
--     when the traveler books relative to departure. That lead-time dimension is
--     what neither of the others can express: "20% off within 48h of departure"
--     (last minute) or "15% off when booked 30+ days ahead" (early bird).
--
-- A promotion with no code is public and shown to everyone. With a code, it only
-- applies when the traveler supplies it. At most ONE promotion ever applies —
-- highest priority, then deepest discount. Discounts never stack.

CREATE TABLE IF NOT EXISTS native_promotions (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES native_inventory_rules(option_id),
  product_id TEXT NOT NULL REFERENCES products(id),
  label TEXT NOT NULL DEFAULT '',
  code TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT', 'FLAT')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0),
  book_from TEXT,
  book_until TEXT,
  travel_from TEXT,
  travel_until TEXT,
  min_lead_hours INTEGER,
  max_lead_hours INTEGER,
  min_party_size INTEGER,
  max_redemptions INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_native_promotions_option ON native_promotions(option_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_native_promotions_code ON native_promotions(option_id, code)
  WHERE code IS NOT NULL;

-- Which promotion a reservation actually used. Redemptions are counted live from
-- these rows rather than a counter column, so the count cannot drift.
ALTER TABLE native_reservations ADD COLUMN IF NOT EXISTS promotion_id TEXT;
CREATE INDEX IF NOT EXISTS idx_native_reservations_promotion ON native_reservations(promotion_id);

-- @down
-- SQLite refuses to drop a column an index still references, so the index goes first.
DROP INDEX IF EXISTS idx_native_reservations_promotion;
ALTER TABLE native_reservations DROP COLUMN promotion_id;
DROP INDEX IF EXISTS idx_native_promotions_code;
DROP INDEX IF EXISTS idx_native_promotions_option;
DROP TABLE IF EXISTS native_promotions;
