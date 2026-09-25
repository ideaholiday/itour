-- Package quotations and the supplier's hotel rate sheet (ADR 035, ADR 040,
-- docs/SUPPLIER_OPERATIONS.md).
--
-- Hotels are never live inventory: a supplier keeps its own contracted net
-- rates per hotel, room type and meal plan, by season, and uses them only as
-- quotation lines. A quotation mixes hotel nights, the supplier's own listings
-- and custom lines; hotel and custom lines carry the quotation's markup, and an
-- Indian supplier adds 5% GST on the package. Money for an accepted package is
-- tracked here (quotation_payments); a booking made from a line holds the seats
-- and points back with bookings.quotation_id.

CREATE TABLE IF NOT EXISTS supplier_hotels (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  city TEXT,
  star_rating INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_hotels_supplier ON supplier_hotels(supplier_id);

-- meal_plan: EP (room only), CP (breakfast), MAP (breakfast + one meal), AP (all meals).
CREATE TABLE IF NOT EXISTS supplier_hotel_rates (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES supplier_hotels(id),
  room_type TEXT NOT NULL,
  meal_plan TEXT NOT NULL CHECK (meal_plan IN ('EP', 'CP', 'MAP', 'AP')),
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  net_per_night_inr INTEGER NOT NULL CHECK (net_per_night_inr >= 0),
  extra_adult_inr INTEGER NOT NULL DEFAULT 0 CHECK (extra_adult_inr >= 0),
  child_inr INTEGER NOT NULL DEFAULT 0 CHECK (child_inr >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_hotel_rates_hotel ON supplier_hotel_rates(hotel_id, room_type, meal_plan, valid_from);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  agent_id TEXT,
  start_date TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 2,
  children INTEGER NOT NULL DEFAULT 0,
  markup_pct REAL NOT NULL DEFAULT 0 CHECK (markup_pct >= 0 AND markup_pct <= 200),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED')),
  cost_inr INTEGER NOT NULL DEFAULT 0,
  listings_inr INTEGER NOT NULL DEFAULT 0,
  markup_inr INTEGER NOT NULL DEFAULT 0,
  subtotal_inr INTEGER NOT NULL DEFAULT 0,
  gst_pct REAL NOT NULL DEFAULT 0,
  gst_inr INTEGER NOT NULL DEFAULT 0,
  total_inr INTEGER NOT NULL DEFAULT 0,
  valid_until TEXT,
  created_by_user_id TEXT,
  sent_at TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotations_supplier ON quotations(supplier_id, created_at);

-- kind: HOTEL (hotel_id, room_type, meal_plan, check-in = line_date, nights, rooms, extra_adults, children),
-- LISTING (product_id, product_option_id, line_date, pickup_time, adults, children), CUSTOM (amount_inr).
-- price_inr is the line's worked-out cost (hotel, custom) or pre-tax price (listing).
CREATE TABLE IF NOT EXISTS quotation_lines (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  day_number INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('HOTEL', 'LISTING', 'CUSTOM')),
  title TEXT NOT NULL,
  description TEXT,
  line_date TEXT,
  hotel_id TEXT,
  room_type TEXT,
  meal_plan TEXT,
  nights INTEGER,
  rooms INTEGER,
  extra_adults INTEGER NOT NULL DEFAULT 0,
  product_id TEXT,
  product_option_id TEXT,
  pickup_time TEXT,
  adults INTEGER,
  children INTEGER NOT NULL DEFAULT 0,
  amount_inr INTEGER,
  price_inr INTEGER NOT NULL DEFAULT 0,
  booking_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotation_lines_quotation ON quotation_lines(quotation_id, day_number, sort_order);

-- Money the customer paid the supplier for an accepted package.
CREATE TABLE IF NOT EXISTS quotation_payments (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  amount_inr INTEGER NOT NULL CHECK (amount_inr > 0),
  mode TEXT NOT NULL CHECK (mode IN ('CASH', 'UPI', 'CARD', 'BANK')),
  reference TEXT,
  received_by TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotation_payments_quotation ON quotation_payments(quotation_id);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quotation_id TEXT;

-- @down
ALTER TABLE bookings DROP COLUMN quotation_id;
DROP INDEX IF EXISTS idx_quotation_payments_quotation;
DROP TABLE IF EXISTS quotation_payments;
DROP INDEX IF EXISTS idx_quotation_lines_quotation;
DROP TABLE IF EXISTS quotation_lines;
DROP INDEX IF EXISTS idx_quotations_supplier;
DROP TABLE IF EXISTS quotations;
DROP INDEX IF EXISTS idx_supplier_hotel_rates_hotel;
DROP TABLE IF EXISTS supplier_hotel_rates;
DROP INDEX IF EXISTS idx_supplier_hotels_supplier;
DROP TABLE IF EXISTS supplier_hotels;
