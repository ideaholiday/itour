-- Migration 017: Five Product Types System
-- Adds product_sub_type, new supporting tables for Ticket Tiers,
-- Vehicle Options, SIC Pickup Hubs, Hotel Tiers, and Itinerary Items.
-- All changes are ADDITIVE — no existing data is dropped.

-- 1. New columns on products table
ALTER TABLE products ADD COLUMN product_sub_type TEXT;
ALTER TABLE products ADD COLUMN essential_info TEXT DEFAULT '[]';
ALTER TABLE products ADD COLUMN booking_mode TEXT DEFAULT 'INSTANT';
ALTER TABLE products ADD COLUMN min_advance_hours INTEGER DEFAULT 4;
ALTER TABLE products ADD COLUMN min_pax INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN max_pax INTEGER DEFAULT 20;
ALTER TABLE products ADD COLUMN languages TEXT DEFAULT '["English","Hindi"]';
ALTER TABLE products ADD COLUMN duration_days INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN highlights TEXT DEFAULT '[]';

-- 2. Ticket Tiers (Attraction + Experience)
--    One row per passenger type (Adult / Child / Senior / Infant)
CREATE TABLE IF NOT EXISTS product_ticket_tiers (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier_name   TEXT NOT NULL,            -- 'Adult', 'Child', 'Senior', 'Infant'
  age_min     INTEGER,                  -- inclusive lower bound (null = no limit)
  age_max     INTEGER,                  -- inclusive upper bound (null = no limit)
  price_inr   INTEGER NOT NULL,
  is_free     INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 3. Vehicle Options (Transfer + Private Tour)
--    One row per vehicle category offered by a product
CREATE TABLE IF NOT EXISTS product_vehicle_options (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  vehicle_type    TEXT NOT NULL,    -- 'SEDAN', 'SUV', 'TEMPO', 'MINI_BUS', 'BUS'
  label           TEXT NOT NULL,    -- e.g. 'Sedan (up to 4 pax)'
  max_pax         INTEGER NOT NULL,
  max_luggage     INTEGER DEFAULT 2,
  price_inr       INTEGER NOT NULL, -- per vehicle / one-way
  is_recommended  INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- 4. SIC Pickup Hubs (Tour SIC + Attraction SIC + Experience SIC)
--    One row per pickup point; departure time per hub
CREATE TABLE IF NOT EXISTS product_sic_hubs (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  hub_name      TEXT NOT NULL,         -- 'Panaji Bus Stand', 'Calangute Beach Hub'
  hub_address   TEXT,
  lat           REAL,
  lng           REAL,
  departure_time TEXT NOT NULL,        -- 'HH:MM' 24-hr format, e.g. '09:00'
  capacity      INTEGER DEFAULT 20,    -- max seats per slot per day
  sort_order    INTEGER DEFAULT 0,
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- 5. Hotel Tiers (Package WITH_HOTEL only)
--    One row per star-category offered
CREATE TABLE IF NOT EXISTS product_hotel_tiers (
  id                  TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier_name           TEXT NOT NULL,        -- '3-Star', '4-Star', '5-Star'
  example_properties  TEXT DEFAULT '[]',    -- JSON array of hotel names
  price_per_person_per_night_inr INTEGER NOT NULL,
  is_recommended      INTEGER DEFAULT 0,
  sort_order          INTEGER DEFAULT 0,
  is_active           INTEGER DEFAULT 1,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- 6. Unified Itinerary Items (all types)
--    day_number = 1,2,3... for multi-day; 0 for single-day (time-based)
--    time_label = 'Day 1', '09:00am', etc.
CREATE TABLE IF NOT EXISTS product_itinerary_items (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  day_number   INTEGER DEFAULT 1,
  time_label   TEXT NOT NULL,       -- 'Day 1' | '09:00am'
  title        TEXT NOT NULL,
  description  TEXT,
  location     TEXT,
  duration_text TEXT,               -- '1.5 hours', '45 mins'
  icon         TEXT DEFAULT '📍',
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- 7. Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_product_ticket_tiers_product
  ON product_ticket_tiers(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_vehicle_options_product
  ON product_vehicle_options(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_sic_hubs_product
  ON product_sic_hubs(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_hotel_tiers_product
  ON product_hotel_tiers(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_itinerary_items_product
  ON product_itinerary_items(product_id, day_number, sort_order);

CREATE INDEX IF NOT EXISTS idx_products_type_subtype
  ON products(product_type, product_sub_type, status);
