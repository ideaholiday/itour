-- Migration 011: Parent-level grouped payment lifecycle for circuit orders

ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_order_id TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_session_id TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_signature TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_order_status TEXT DEFAULT 'NOT_STARTED';
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_verified_at TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_failed_at TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS payment_failure_code TEXT;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;

CREATE TABLE IF NOT EXISTS circuit_payment_events (
  id TEXT PRIMARY KEY,
  circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  status TEXT NOT NULL,
  amount REAL,
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_circuit_orders_payment_order
  ON circuit_orders(payment_order_id) WHERE payment_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_circuit_orders_payment_status
  ON circuit_orders(payment_status, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_payment_events_order
  ON circuit_payment_events(circuit_order_id, created_at DESC);

-- @down
DROP INDEX IF EXISTS idx_circuit_payment_events_order;
DROP INDEX IF EXISTS idx_circuit_orders_payment_status;
DROP INDEX IF EXISTS idx_circuit_orders_payment_order;
DROP TABLE IF EXISTS circuit_payment_events;
ALTER TABLE payment_events DROP COLUMN circuit_order_id;
ALTER TABLE circuit_orders DROP COLUMN payment_failure_code;
ALTER TABLE circuit_orders DROP COLUMN payment_failed_at;
ALTER TABLE circuit_orders DROP COLUMN payment_verified_at;
ALTER TABLE circuit_orders DROP COLUMN payment_order_status;
ALTER TABLE circuit_orders DROP COLUMN payment_status;
ALTER TABLE circuit_orders DROP COLUMN payment_signature;
ALTER TABLE circuit_orders DROP COLUMN payment_id;
ALTER TABLE circuit_orders DROP COLUMN payment_session_id;
ALTER TABLE circuit_orders DROP COLUMN payment_order_id;
ALTER TABLE circuit_orders DROP COLUMN payment_provider;
