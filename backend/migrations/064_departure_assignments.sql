-- Departures board and crew assignment (ADR 037, docs/SUPPLIER_OPERATIONS.md).
--
-- A shared resource gets a kind: GUIDE, VEHICLE, EQUIPMENT, or GENERAL for the
-- resources created before kinds existed. A guide resource may be linked to a
-- staff login (supplier_members.user_id); that guide then sees only the
-- departures they are assigned to.
--
-- An assignment puts one resource on one departure, named by product, date and
-- time (the guest-list key). departure_time is '' for a product without fixed
-- times. A resource works one departure per date and time, so the unique key
-- is the resource's slot, not the departure.

ALTER TABLE native_resources ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE native_resources ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE TABLE IF NOT EXISTS departure_assignments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  activity_date TEXT NOT NULL,
  departure_time TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL REFERENCES native_resources(id),
  assigned_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (resource_id, activity_date, departure_time)
);
CREATE INDEX IF NOT EXISTS idx_departure_assignments_departure ON departure_assignments(product_id, activity_date, departure_time);
CREATE INDEX IF NOT EXISTS idx_departure_assignments_supplier_date ON departure_assignments(supplier_id, activity_date);

-- @down
DROP INDEX IF EXISTS idx_departure_assignments_supplier_date;
DROP INDEX IF EXISTS idx_departure_assignments_departure;
DROP TABLE IF EXISTS departure_assignments;
ALTER TABLE native_resources DROP COLUMN user_id;
ALTER TABLE native_resources DROP COLUMN kind;
