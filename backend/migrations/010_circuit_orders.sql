-- Migration 010: Atomic circuit orders, child bookings, and expiring inventory holds

ALTER TABLE circuit_quotes ADD COLUMN IF NOT EXISTS consumed_at TEXT;
ALTER TABLE circuit_quotes ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS circuit_order_item_id TEXT;

CREATE TABLE IF NOT EXISTS circuit_orders (
  id TEXT PRIMARY KEY,
  order_ref TEXT NOT NULL UNIQUE,
  quote_id TEXT NOT NULL UNIQUE,
  itinerary_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  currency TEXT NOT NULL DEFAULT 'INR',
  adults_count INTEGER NOT NULL DEFAULT 1,
  children_count INTEGER NOT NULL DEFAULT 0,
  traveler_name TEXT NOT NULL,
  traveler_email TEXT NOT NULL,
  traveler_phone TEXT NOT NULL,
  base_amount REAL NOT NULL DEFAULT 0,
  taxes_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_reference TEXT,
  hold_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS circuit_order_items (
  id TEXT PRIMARY KEY,
  circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
  quote_line_item_id TEXT NOT NULL,
  booking_id TEXT NOT NULL UNIQUE,
  sequence_number INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  pickup_time TEXT NOT NULL,
  vehicle_category TEXT,
  variant_name TEXT,
  status TEXT NOT NULL DEFAULT 'HELD_PENDING_PAYMENT',
  base_amount REAL NOT NULL DEFAULT 0,
  taxes_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(circuit_order_id, quote_line_item_id)
);

CREATE TABLE IF NOT EXISTS inventory_holds (
  id TEXT PRIMARY KEY,
  circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
  circuit_order_item_id TEXT NOT NULL REFERENCES circuit_order_items(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  pickup_time TEXT NOT NULL,
  vehicle_category TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  expires_at TEXT NOT NULL,
  released_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_orders_user_idempotency
  ON circuit_orders(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_circuit_orders_user_status
  ON circuit_orders(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_order_items_order
  ON circuit_order_items(circuit_order_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_availability
  ON inventory_holds(product_id, supplier_id, activity_date, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_order
  ON inventory_holds(circuit_order_id, status);

-- @down
DROP INDEX IF EXISTS idx_inventory_holds_order;
DROP INDEX IF EXISTS idx_inventory_holds_availability;
DROP INDEX IF EXISTS idx_circuit_order_items_order;
DROP INDEX IF EXISTS idx_circuit_orders_user_status;
DROP INDEX IF EXISTS idx_circuit_orders_user_idempotency;
DROP TABLE IF EXISTS inventory_holds;
DROP TABLE IF EXISTS circuit_order_items;
DROP TABLE IF EXISTS circuit_orders;
ALTER TABLE bookings DROP COLUMN circuit_order_item_id;
ALTER TABLE bookings DROP COLUMN circuit_order_id;
ALTER TABLE circuit_quotes DROP COLUMN circuit_order_id;
ALTER TABLE circuit_quotes DROP COLUMN consumed_at;
