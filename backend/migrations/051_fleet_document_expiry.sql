-- Expiry dates of a fleet vehicle's and driver's papers (ADR 024, step C2).
-- YYYY-MM-DD, or NULL when not entered. A vehicle whose driving licence,
-- permit, insurance or fitness certificate has expired by the trip date can't
-- be assigned to that trip, by hand or by automatic dispatch.
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS license_expiry TEXT;
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS permit_expiry TEXT;
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS insurance_expiry TEXT;
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS fitness_expiry TEXT;

-- @down
ALTER TABLE supplier_drivers DROP COLUMN fitness_expiry;
ALTER TABLE supplier_drivers DROP COLUMN insurance_expiry;
ALTER TABLE supplier_drivers DROP COLUMN permit_expiry;
ALTER TABLE supplier_drivers DROP COLUMN license_expiry;
