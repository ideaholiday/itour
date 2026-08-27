-- Migration 012: Parent-level circuit cancellation, refund, reschedule and operations review

ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS management_status TEXT DEFAULT 'NONE';
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS refunded_amount REAL DEFAULT 0;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS cancellation_fee_amount REAL DEFAULT 0;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS cancelled_at TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS refunded_at TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS rescheduled_at TEXT;
ALTER TABLE staff_tasks ADD COLUMN IF NOT EXISTS circuit_order_id TEXT;

CREATE TABLE IF NOT EXISTS circuit_management_requests (
  id TEXT PRIMARY KEY,
  request_ref TEXT NOT NULL UNIQUE,
  circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  requested_changes TEXT NOT NULL DEFAULT '{}',
  policy_snapshot TEXT NOT NULL DEFAULT '{}',
  refund_amount REAL NOT NULL DEFAULT 0,
  cancellation_fee_amount REAL NOT NULL DEFAULT 0,
  gateway_refund_id TEXT,
  gateway_status TEXT,
  failure_code TEXT,
  resolution TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(circuit_order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_circuit_management_order
  ON circuit_management_requests(circuit_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_management_queue
  ON circuit_management_requests(status, request_type, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_circuit
  ON staff_tasks(circuit_order_id, status, created_at DESC);

-- @down
DROP INDEX IF EXISTS idx_staff_tasks_circuit;
DROP INDEX IF EXISTS idx_circuit_management_queue;
DROP INDEX IF EXISTS idx_circuit_management_order;
DROP TABLE IF EXISTS circuit_management_requests;
ALTER TABLE staff_tasks DROP COLUMN circuit_order_id;
ALTER TABLE circuit_orders DROP COLUMN rescheduled_at;
ALTER TABLE circuit_orders DROP COLUMN refunded_at;
ALTER TABLE circuit_orders DROP COLUMN cancelled_at;
ALTER TABLE circuit_orders DROP COLUMN cancellation_fee_amount;
ALTER TABLE circuit_orders DROP COLUMN refunded_amount;
ALTER TABLE circuit_orders DROP COLUMN management_status;
