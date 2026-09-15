-- P1 of docs/RESERVATION_ENGINE_V2_PLAN.md: represent OCTo unit items end to end.
--
-- `bookings.adults` / `bookings.children` remain the canonical seat counts that
-- capacity, dispatch, vouchers and notifications read. Unit items are an
-- additive breakdown that carries the billed unit type and its frozen price, so
-- SENIOR and INFANT can be priced distinctly without reworking those paths.
-- ADULT/SENIOR/YOUTH roll up into adults; CHILD/INFANT roll up into children.

ALTER TABLE native_inventory_rules ADD COLUMN IF NOT EXISTS unit_prices TEXT NOT NULL DEFAULT '{}';
ALTER TABLE native_price_schedules ADD COLUMN IF NOT EXISTS unit_prices TEXT NOT NULL DEFAULT '{}';
ALTER TABLE native_reservations ADD COLUMN IF NOT EXISTS unit_items TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS booking_unit_items (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  unit_type TEXT NOT NULL CHECK (unit_type IN ('ADULT', 'CHILD', 'INFANT', 'SENIOR', 'YOUTH')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_inr INTEGER NOT NULL CHECK (unit_price_inr >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, unit_type)
);
CREATE INDEX IF NOT EXISTS idx_booking_unit_items_booking ON booking_unit_items(booking_id);

-- @down
DROP TABLE IF EXISTS booking_unit_items;
ALTER TABLE native_reservations DROP COLUMN unit_items;
ALTER TABLE native_price_schedules DROP COLUMN unit_prices;
ALTER TABLE native_inventory_rules DROP COLUMN unit_prices;
