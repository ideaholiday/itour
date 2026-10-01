-- IdeaHoliday B2B agent bookings (ADR 054, docs/plans/b2b-travel-agents.md B2).
--
-- An approved travel agency books at its agent price: the website price less
-- agent_discount_pct, recorded as agent_discount_inr. Like a coupon, the
-- discount comes out of IdeaHoliday's commission: amount_inr is what the agent
-- pays, while commission_amount and the supplier payout are unchanged. The
-- booking's source is 'IH_B2B' (migration 062).
--
-- A circuit quote freezes the agency and each line's discount when it is
-- priced; the order charges the total less that discount.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_discount_pct REAL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agent_discount_inr INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bookings_agency ON bookings(agency_id);

ALTER TABLE circuit_quotes ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE circuit_quotes ADD COLUMN IF NOT EXISTS agent_discount_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS agent_discount_inr INTEGER NOT NULL DEFAULT 0;

-- @down
ALTER TABLE circuit_orders DROP COLUMN agent_discount_inr;
ALTER TABLE circuit_orders DROP COLUMN agency_id;
ALTER TABLE circuit_quotes DROP COLUMN agent_discount_inr;
ALTER TABLE circuit_quotes DROP COLUMN agency_id;
DROP INDEX IF EXISTS idx_bookings_agency;
ALTER TABLE bookings DROP COLUMN agent_discount_inr;
ALTER TABLE bookings DROP COLUMN agent_discount_pct;
ALTER TABLE bookings DROP COLUMN agency_id;
