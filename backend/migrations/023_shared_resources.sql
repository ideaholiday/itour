-- P2 of docs/RESERVATION_ENGINE_V2_PLAN.md: shared resource capacity, plus
-- seatless (infant-on-lap) units.
--
-- A resource is a real constraint a supplier owns — one vehicle, one boat, one
-- guide — that several booking options draw from at the same departure time.
-- Without it, two options each sell their own full capacity for the same van.
-- A departure's vacancies become the smallest of its own pool and every
-- resource it is linked to.

CREATE TABLE IF NOT EXISTS native_resources (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_native_resources_supplier ON native_resources(supplier_id);

-- Many-to-many: one vehicle serves several options, and an option may be
-- constrained by more than one resource (a van and a guide, say).
CREATE TABLE IF NOT EXISTS native_resource_options (
  resource_id TEXT NOT NULL REFERENCES native_resources(id),
  option_id TEXT NOT NULL REFERENCES native_inventory_rules(option_id),
  PRIMARY KEY (resource_id, option_id)
);
CREATE INDEX IF NOT EXISTS idx_native_resource_options_option ON native_resource_options(option_id);

-- Unit types that bill but consume no seat (an infant on a lap). Recorded in
-- booking_unit_items either way, so they still reach the supplier's manifest.
ALTER TABLE native_inventory_rules ADD COLUMN IF NOT EXISTS seatless_units TEXT NOT NULL DEFAULT '[]';

-- @down
ALTER TABLE native_inventory_rules DROP COLUMN seatless_units;
DROP TABLE IF EXISTS native_resource_options;
DROP TABLE IF EXISTS native_resources;
