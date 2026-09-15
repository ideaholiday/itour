-- Paid supplier profile plans (ADR 008, ROADMAP NEXT #3).
--
-- VERIFIED buys the yearly business check (never the badge itself): paying
-- opens a PENDING_CHECKS supplier_verifications row for the admin queue; the
-- badge appears only if the checks pass, and a rejected paid check is refunded.
-- SPOTLIGHT puts one product on the public profile, locked to that product with
-- one swap a year. VERIFIED_PLUS is both. Payments reuse supplier_plan_payments;
-- plan_code says which plan and product_id which product a Spotlight is for.

ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS product_id TEXT;
-- What goes back if the Verified check is rejected: the whole payment for
-- VERIFIED; for VERIFIED_PLUS the part above the Spotlight price, fixed at purchase.
ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS check_refundable_inr REAL;
ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS refund_status TEXT;
ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS refund_amount_inr REAL;
ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS refund_id TEXT;
ALTER TABLE supplier_plan_payments ADD COLUMN IF NOT EXISTS refunded_at TEXT;

CREATE TABLE IF NOT EXISTS product_spotlights (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  last_swapped_at TEXT,
  previous_product_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_product_spotlights_supplier ON product_spotlights(supplier_id, status);

ALTER TABLE supplier_verifications ADD COLUMN IF NOT EXISTS last_reminder_days INTEGER;

-- @down
ALTER TABLE supplier_verifications DROP COLUMN last_reminder_days;
DROP INDEX IF EXISTS idx_product_spotlights_supplier;
DROP TABLE IF EXISTS product_spotlights;
ALTER TABLE supplier_plan_payments DROP COLUMN refunded_at;
ALTER TABLE supplier_plan_payments DROP COLUMN refund_id;
ALTER TABLE supplier_plan_payments DROP COLUMN refund_amount_inr;
ALTER TABLE supplier_plan_payments DROP COLUMN refund_status;
ALTER TABLE supplier_plan_payments DROP COLUMN check_refundable_inr;
ALTER TABLE supplier_plan_payments DROP COLUMN product_id;
