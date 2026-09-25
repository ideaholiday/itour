-- Who approved a supplier's KYB, and when.
--
--   ADMIN              an administrator approved it from the supplier dossier.
--   CASHFREE_SECUREID  approved automatically once Cashfree SecureID verified
--                      the supplier's GSTIN and PAN, and the GSTIN belongs to
--                      that PAN. Never grants the yearly Verified badge.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS kyb_approval_source TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS kyb_approved_at TEXT;

-- @down
ALTER TABLE suppliers DROP COLUMN IF EXISTS kyb_approved_at;
ALTER TABLE suppliers DROP COLUMN IF EXISTS kyb_approval_source;
