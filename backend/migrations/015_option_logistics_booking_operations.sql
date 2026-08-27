-- Migration 015: option-level logistics, structured questions, holds and operations

ALTER TABLE products ADD COLUMN IF NOT EXISTS default_confirmation_type TEXT DEFAULT 'INSTANT_THEN_MANUAL';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS product_option_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_type TEXT DEFAULT 'INSTANT_THEN_MANUAL';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_status TEXT DEFAULT 'PENDING_PAYMENT';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS logistics_snapshot TEXT DEFAULT '{}';

CREATE TABLE IF NOT EXISTS product_options (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  pickup_option_type TEXT NOT NULL DEFAULT 'PICKUP_EVERYONE',
  confirmation_type TEXT NOT NULL DEFAULT 'INSTANT_THEN_MANUAL',
  supported_arrival_modes TEXT NOT NULL DEFAULT '["AIR","RAIL","SEA","OTHER"]',
  supported_departure_modes TEXT NOT NULL DEFAULT '["AIR","RAIL","SEA","OTHER"]',
  available_start_times TEXT NOT NULL DEFAULT '["09:00"]',
  capacity INTEGER,
  allow_custom_traveler_pickup BOOLEAN NOT NULL DEFAULT false,
  pickup_window_minutes INTEGER NOT NULL DEFAULT 30,
  waiting_time_minutes INTEGER NOT NULL DEFAULT 30,
  no_show_policy TEXT,
  service_hours_start TEXT,
  service_hours_end TEXT,
  supplier_confirmation_sla_minutes INTEGER NOT NULL DEFAULT 10,
  meeting_point_ref TEXT,
  end_point TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, option_code)
);

CREATE TABLE IF NOT EXISTS product_option_locations (
  id TEXT PRIMARY KEY,
  option_id TEXT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  location_ref TEXT,
  provider TEXT DEFAULT 'IDEA_HOLIDAY',
  external_ref TEXT,
  pickup_type TEXT NOT NULL DEFAULT 'LOCATION',
  mode TEXT,
  display_label TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  lat REAL,
  lng REAL,
  is_meeting_point BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_question_definitions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'TEXT',
  scope TEXT NOT NULL DEFAULT 'PER_BOOKING',
  required BOOLEAN NOT NULL DEFAULT false,
  unit TEXT,
  help_text TEXT,
  allowed_answers TEXT NOT NULL DEFAULT '[]',
  condition_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_option_questions (
  option_id TEXT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES booking_question_definitions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required_override BOOLEAN,
  PRIMARY KEY(option_id, question_id)
);

CREATE TABLE IF NOT EXISTS booking_question_answers (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  question_code TEXT NOT NULL,
  traveler_num INTEGER,
  answer TEXT,
  unit TEXT,
  answer_source TEXT DEFAULT 'GUEST',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, question_code, traveler_num)
);

CREATE TABLE IF NOT EXISTS booking_logistics (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  option_id TEXT,
  pickup_mode TEXT,
  pickup_type TEXT,
  pickup_location_ref TEXT,
  pickup_location_provider TEXT,
  pickup_location TEXT,
  pickup_address TEXT,
  pickup_city TEXT,
  pickup_state TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  drop_type TEXT,
  drop_location_ref TEXT,
  drop_location TEXT,
  drop_address TEXT,
  drop_city TEXT,
  drop_state TEXT,
  drop_lat REAL,
  drop_lng REAL,
  meeting_point_ref TEXT,
  meeting_point_label TEXT,
  pickup_window_start TEXT,
  pickup_window_end TEXT,
  waiting_time_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'PICKUP_REQUESTED',
  custom_pickup BOOLEAN NOT NULL DEFAULT false,
  needs_ops_review BOOLEAN NOT NULL DEFAULT false,
  pending_supplier BOOLEAN NOT NULL DEFAULT false,
  snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_logistics_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS booking_holds (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  client_request_id TEXT,
  product_id TEXT NOT NULL,
  product_option_id TEXT,
  activity_date TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  amount_inr REAL NOT NULL,
  quote_snapshot TEXT NOT NULL DEFAULT '{}',
  logistics_snapshot TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TEXT,
  UNIQUE(client_request_id)
);

CREATE TABLE IF NOT EXISTS booking_amendment_requests (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  amendment_type TEXT NOT NULL,
  current_snapshot TEXT NOT NULL DEFAULT '{}',
  proposed_snapshot TEXT NOT NULL DEFAULT '{}',
  quoted_delta_inr REAL,
  cutoff_at TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_option_locations_option ON product_option_locations(option_id, is_active);
CREATE INDEX IF NOT EXISTS idx_booking_logistics_status ON booking_logistics(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_booking_logistics_events_booking ON booking_logistics_events(booking_id, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_holds_active ON booking_holds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_booking_amendments_status ON booking_amendment_requests(status, created_at);

-- @down
DROP TABLE IF EXISTS booking_amendment_requests;
DROP TABLE IF EXISTS booking_holds;
DROP TABLE IF EXISTS booking_logistics_events;
DROP TABLE IF EXISTS booking_logistics;
DROP TABLE IF EXISTS booking_question_answers;
DROP TABLE IF EXISTS product_option_questions;
DROP TABLE IF EXISTS booking_question_definitions;
DROP TABLE IF EXISTS product_option_locations;
DROP TABLE IF EXISTS product_options;
