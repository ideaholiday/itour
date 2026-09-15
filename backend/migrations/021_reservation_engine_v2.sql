-- Reservation engine v2: seasonal pricing, per-departure calendar control and
-- party-size rules. Additive only; existing flat pricing keeps working as the
-- fallback when no schedule matches a travel date.

ALTER TABLE native_inventory_rules ADD COLUMN IF NOT EXISTS min_party_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE native_inventory_rules ADD COLUMN IF NOT EXISTS max_party_size INTEGER NOT NULL DEFAULT 0;

-- Date-ranged rates. The highest `priority` schedule covering a travel date and
-- its weekday wins; ties break on the most recently created row. When nothing
-- matches, the option's base adult_price/child_price applies.
CREATE TABLE IF NOT EXISTS native_price_schedules (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES native_inventory_rules(option_id),
  product_id TEXT NOT NULL REFERENCES products(id),
  label TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  adult_price INTEGER NOT NULL CHECK (adult_price >= 0),
  child_price INTEGER NOT NULL CHECK (child_price >= 0),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_native_price_schedules_lookup
  ON native_price_schedules(option_id, starts_on, ends_on);

-- Per-date and per-departure overrides. An empty local_time applies to the whole
-- day. A NULL capacity inherits the option's rule capacity.
CREATE TABLE IF NOT EXISTS native_slot_overrides (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES native_inventory_rules(option_id),
  product_id TEXT NOT NULL REFERENCES products(id),
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL DEFAULT '',
  capacity INTEGER,
  closed INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(option_id, local_date, local_time)
);
CREATE INDEX IF NOT EXISTS idx_native_slot_overrides_lookup
  ON native_slot_overrides(option_id, local_date);

-- @down
DROP TABLE IF EXISTS native_slot_overrides;
DROP TABLE IF EXISTS native_price_schedules;
ALTER TABLE native_inventory_rules DROP COLUMN max_party_size;
ALTER TABLE native_inventory_rules DROP COLUMN min_party_size;
