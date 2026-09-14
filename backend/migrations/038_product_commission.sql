-- Commission set per product, with a record of every rate change (ADR 017).
--
-- A booking's commission rate now resolves: product override → supplier
-- override → platform default (program setting `commission`, 30%). Category
-- defaults and suppliers.commission_rate no longer decide it. The rate is still
-- frozen onto each booking (commission_rate_snapshot).
--
-- commission_rate_changes records who changed which rate, why, and whether the
-- affected suppliers were sent a notice (notified_at).

ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_override_rate REAL;

CREATE TABLE IF NOT EXISTS commission_rate_changes (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('PLATFORM', 'SUPPLIER', 'PRODUCT')),
  supplier_id TEXT,
  product_id TEXT,
  old_rate REAL,
  new_rate REAL,
  changed_by TEXT,
  reason TEXT NOT NULL,
  notify INTEGER NOT NULL DEFAULT 1,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commission_rate_changes_supplier ON commission_rate_changes(supplier_id, created_at);

-- @down
DROP INDEX IF EXISTS idx_commission_rate_changes_supplier;
DROP TABLE IF EXISTS commission_rate_changes;
ALTER TABLE products DROP COLUMN commission_override_rate;
