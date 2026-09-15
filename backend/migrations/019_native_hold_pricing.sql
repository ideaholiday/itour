ALTER TABLE native_reservations ADD COLUMN pricing_snapshot TEXT NOT NULL DEFAULT '{}';
-- @down
ALTER TABLE native_reservations DROP COLUMN pricing_snapshot;
