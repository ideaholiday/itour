-- Supplier staff logins (ADR 036, docs/SECURITY.md).
--
-- The supplier's own login (users.email = suppliers.email) is the OWNER and
-- can do everything. Staff are separate users with role 'SUPPLIER' linked to
-- one supplier here, with one of three roles:
--   MANAGER     day-to-day work; no bank/payout, KYB, plans or staff
--   FRONT_DESK  walk-in/phone bookings, payments, manifest and check-in
--   GUIDE       manifest, check-in and attendance only
-- A user belongs to at most one supplier. Removing a member deletes this row
-- and sets the user back to TRAVELER, so their history is kept.

CREATE TABLE IF NOT EXISTS supplier_members (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('MANAGER', 'FRONT_DESK', 'GUIDE')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_members_supplier ON supplier_members(supplier_id);

-- @down
DROP INDEX IF EXISTS idx_supplier_members_supplier;
DROP TABLE IF EXISTS supplier_members;
