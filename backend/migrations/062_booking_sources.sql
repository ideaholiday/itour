-- One reservation engine, many booking sources (docs/SUPPLIER_OPERATIONS.md, ADR 034).
--
-- Every booking takes its seats from the same native inventory whatever its
-- source; source only records where it came from:
--   B2C, IH_B2B          sold by IdeaHoliday (commission applies, ADR 017)
--   API                  an OCTo partner (api_partners)
--   WALK_IN, PHONE,      the supplier's own customer, booked in the supplier
--   MANUAL               extranet. Commission-free; the supplier collects the
--                        money, so IdeaHoliday never refunds or settles it.
-- Existing rows are marketplace bookings and default to B2C.
--
-- A supplier-direct booking has payment_status = 'OFFLINE': IdeaHoliday holds
-- none of its money, and every refund and settlement path (which requires
-- PAID) leaves it alone. What the supplier collected is booking_payments;
-- balance_due_inr is what the guest still owes the supplier.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'B2C';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS direct_discount_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_due_inr INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_bookings_supplier_date ON bookings(supplier_id, activity_date);

CREATE TABLE IF NOT EXISTS booking_payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  amount_inr INTEGER NOT NULL CHECK (amount_inr > 0),
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'CARD', 'BANK')),
  reference TEXT,
  note TEXT,
  received_by TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_supplier ON booking_payments(supplier_id, received_at);

-- @down
DROP INDEX IF EXISTS idx_booking_payments_supplier;
DROP INDEX IF EXISTS idx_booking_payments_booking;
DROP TABLE IF EXISTS booking_payments;
DROP INDEX IF EXISTS idx_bookings_supplier_date;
ALTER TABLE bookings DROP COLUMN balance_due_inr;
ALTER TABLE bookings DROP COLUMN direct_discount_inr;
ALTER TABLE bookings DROP COLUMN created_by_user_id;
ALTER TABLE bookings DROP COLUMN source;
