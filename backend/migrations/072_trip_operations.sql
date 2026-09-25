-- Running a trip after the customer accepts its quotation (ADR 045,
-- docs/SUPPLIER_OPERATIONS.md).
--
-- Each hotel, car, activity and custom line of an accepted quotation is
-- arranged by the operator: arrangement_status TO_BOOK (NULL) → REQUESTED →
-- CONFIRMED, or CANCELLED, with who it is booked with, the confirmation number
-- and what the operator owes for it (payable_inr, NULL = the line's cost).
-- A car line gets drivers from the supplier's fleet (driver_ids, comma list,
-- one per vehicle). Hotels get an email and phone so a booking request can be
-- emailed. quotation_vendor_payments records what the operator paid vendors.

ALTER TABLE supplier_hotels ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE supplier_hotels ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS arrangement_status TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS confirmation_ref TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS payable_inr INTEGER;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS driver_ids TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS requested_at TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS confirmed_at TEXT;

CREATE TABLE IF NOT EXISTS quotation_vendor_payments (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  line_id TEXT NOT NULL REFERENCES quotation_lines(id),
  amount_inr INTEGER NOT NULL CHECK (amount_inr > 0),
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'CARD', 'BANK')),
  reference TEXT,
  paid_by TEXT,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotation_vendor_payments_quotation ON quotation_vendor_payments(quotation_id, line_id);

-- @down
DROP INDEX IF EXISTS idx_quotation_vendor_payments_quotation;
DROP TABLE IF EXISTS quotation_vendor_payments;
ALTER TABLE quotation_lines DROP COLUMN confirmed_at;
ALTER TABLE quotation_lines DROP COLUMN requested_at;
ALTER TABLE quotation_lines DROP COLUMN driver_ids;
ALTER TABLE quotation_lines DROP COLUMN payable_inr;
ALTER TABLE quotation_lines DROP COLUMN confirmation_ref;
ALTER TABLE quotation_lines DROP COLUMN vendor_name;
ALTER TABLE quotation_lines DROP COLUMN arrangement_status;
ALTER TABLE supplier_hotels DROP COLUMN phone;
ALTER TABLE supplier_hotels DROP COLUMN email;
