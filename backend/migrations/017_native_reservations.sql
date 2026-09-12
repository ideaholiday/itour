-- Native inventory uses stable option and departure identities for future OCTO adapters.
CREATE TABLE IF NOT EXISTS native_inventory_rules (
  option_id TEXT PRIMARY KEY REFERENCES product_options(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  operating_days TEXT NOT NULL,
  departure_times TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  adult_price INTEGER NOT NULL CHECK (adult_price >= 0),
  child_price INTEGER NOT NULL CHECK (child_price >= 0),
  cutoff_minutes INTEGER NOT NULL CHECK (cutoff_minutes >= 0),
  cancellation_hours INTEGER NOT NULL CHECK (cancellation_hours >= 0),
  blackout_dates TEXT NOT NULL DEFAULT '[]',
  time_zone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  provider TEXT NOT NULL DEFAULT 'NATIVE',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS native_availability_slots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  option_id TEXT NOT NULL REFERENCES native_inventory_rules(option_id),
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  closed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(option_id, local_date, local_time)
);
CREATE TABLE IF NOT EXISTS native_reservations (
  id TEXT PRIMARY KEY,
  availability_slot TEXT NOT NULL REFERENCES native_availability_slots(id),
  owner_id TEXT NOT NULL,
  booking_id TEXT UNIQUE REFERENCES bookings(id),
  request_key TEXT NOT NULL,
  adults INTEGER NOT NULL CHECK (adults > 0),
  children INTEGER NOT NULL CHECK (children >= 0),
  status TEXT NOT NULL CHECK (status IN ('ON_HOLD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
  utc_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, request_key)
);
CREATE INDEX IF NOT EXISTS idx_native_reservations_slot ON native_reservations(availability_slot, status, utc_expires_at);
-- @down
DROP TABLE IF EXISTS native_reservations;
DROP TABLE IF EXISTS native_availability_slots;
DROP TABLE IF EXISTS native_inventory_rules;
