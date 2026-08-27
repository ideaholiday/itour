-- Migration 014: Canonical pickup/drop registry and product-scoped location rules

CREATE TABLE IF NOT EXISTS canonical_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  iata_code TEXT,
  location_type TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_km REAL NOT NULL DEFAULT 5.0,
  aliases TEXT NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_location_rules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rule_side TEXT NOT NULL,
  rule_mode TEXT NOT NULL,
  fixed_location_id TEXT REFERENCES canonical_locations(id),
  allowed_location_types TEXT NOT NULL DEFAULT '[]',
  center_lat REAL,
  center_lng REAL,
  radius_km REAL,
  allowed_state TEXT,
  allowed_city TEXT,
  polygon_coordinates TEXT NOT NULL DEFAULT '[]',
  error_message TEXT,
  suggestion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, rule_side)
);

CREATE TABLE IF NOT EXISTS day_tours (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  duration_hours REAL NOT NULL,
  distance_km_limit REAL NOT NULL DEFAULT 80,
  available_time_slots TEXT NOT NULL DEFAULT '["09:00"]',
  group_type TEXT NOT NULL DEFAULT 'PRIVATE',
  places_covered TEXT NOT NULL DEFAULT '[]',
  vehicle_rules TEXT NOT NULL DEFAULT '[]',
  pickup_service_type TEXT NOT NULL DEFAULT 'HOTEL_PICKUP_ANYWHERE',
  advance_booking_cutoff_hours REAL NOT NULL DEFAULT 4,
  operating_start_time TEXT DEFAULT '06:00',
  operating_end_time TEXT DEFAULT '22:00',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS origin_radius_km REAL DEFAULT 25.0;
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS dest_radius_km REAL DEFAULT 25.0;
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS origin_iata TEXT;
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS dest_iata TEXT;
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS origin_location_id TEXT REFERENCES canonical_locations(id);
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS dest_location_id TEXT REFERENCES canonical_locations(id);
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS interstate_permit_tax BOOLEAN DEFAULT false;
ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS night_allowance_inr REAL DEFAULT 300.0;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS flight_departure_time TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_validation_snapshot TEXT DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_ops_review BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_canonical_locations_lookup
  ON canonical_locations(location_type, city, state, is_active);
CREATE INDEX IF NOT EXISTS idx_canonical_locations_iata
  ON canonical_locations(iata_code);
CREATE INDEX IF NOT EXISTS idx_product_location_rules_product
  ON product_location_rules(product_id, rule_side, is_active);
CREATE INDEX IF NOT EXISTS idx_day_tours_product
  ON day_tours(product_id);

-- @down
DROP INDEX IF EXISTS idx_day_tours_product;
DROP INDEX IF EXISTS idx_product_location_rules_product;
DROP INDEX IF EXISTS idx_canonical_locations_iata;
DROP INDEX IF EXISTS idx_canonical_locations_lookup;
ALTER TABLE bookings DROP COLUMN location_ops_review;
ALTER TABLE bookings DROP COLUMN location_validation_snapshot;
ALTER TABLE bookings DROP COLUMN flight_departure_time;
ALTER TABLE transfer_routes DROP COLUMN night_allowance_inr;
ALTER TABLE transfer_routes DROP COLUMN interstate_permit_tax;
ALTER TABLE transfer_routes DROP COLUMN dest_location_id;
ALTER TABLE transfer_routes DROP COLUMN origin_location_id;
ALTER TABLE transfer_routes DROP COLUMN dest_iata;
ALTER TABLE transfer_routes DROP COLUMN origin_iata;
ALTER TABLE transfer_routes DROP COLUMN dest_radius_km;
ALTER TABLE transfer_routes DROP COLUMN origin_radius_km;
DROP TABLE IF EXISTS day_tours;
DROP TABLE IF EXISTS product_location_rules;
DROP TABLE IF EXISTS canonical_locations;
