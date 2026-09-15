-- Supplier subscriptions are required for suppliers who sign up from
-- 2026-09-14 (ADR 017).
--
-- A supplier can take bookings when its KYB is APPROVED and it is covered:
-- either exempt (registered before 2026-09-14, set once here) or holding a live
-- subscription row (ACTIVE when paid, WAIVED when an admin or the launch waiver
-- gave it free). Price and online payment come later; until then new suppliers
-- are covered by LAUNCH waivers created by supplierSubscriptionService.
-- Times are UTC text ('YYYY-MM-DD HH:MM:SS'); ends_at NULL means no end date.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS subscription_exempt INTEGER NOT NULL DEFAULT 0;
UPDATE suppliers SET subscription_exempt = 1 WHERE created_at IS NULL OR created_at < '2026-09-14';

CREATE TABLE IF NOT EXISTS supplier_subscriptions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  plan_code TEXT NOT NULL DEFAULT 'MARKETPLACE',
  status TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'WAIVED', 'EXPIRED', 'CANCELLED')),
  source TEXT NOT NULL CHECK (source IN ('PURCHASE', 'WAIVER', 'LAUNCH', 'COUPON')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  granted_by TEXT,
  reason TEXT,
  last_reminder_days INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_supplier ON supplier_subscriptions(supplier_id, status);

-- @down
DROP INDEX IF EXISTS idx_supplier_subscriptions_supplier;
DROP TABLE IF EXISTS supplier_subscriptions;
ALTER TABLE suppliers DROP COLUMN subscription_exempt;
