-- Admin control of creator commission (ADR 017, plan Phase 4a).
--
-- A creator earns their tier's commission_rate and gives their audience the
-- tier's traveler_discount_pct, unless an admin set their own rate here
-- (negotiated deals). Both are % of booking value. Every tier or creator rate
-- change is recorded with who made it and why; the rate is still frozen onto
-- each affiliate_referrals row, so a change applies to new bookings only.

ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS commission_override_rate REAL;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS traveler_discount_override_pct REAL;

CREATE TABLE IF NOT EXISTS affiliate_rate_changes (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('TIER', 'AFFILIATE')),
  tier_code TEXT,
  affiliate_id TEXT,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- @down
DROP TABLE IF EXISTS affiliate_rate_changes;
ALTER TABLE affiliates DROP COLUMN traveler_discount_override_pct;
ALTER TABLE affiliates DROP COLUMN commission_override_rate;
