-- Migration 013: Circuit post-change supplier SLA, notifications and refund reconciliation

ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED';
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS reconfirmation_deadline TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS reconfirmed_at TEXT;
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS refund_reconciliation_status TEXT DEFAULT 'NOT_REQUIRED';
ALTER TABLE circuit_orders ADD COLUMN IF NOT EXISTS refund_reconciled_at TEXT;

ALTER TABLE circuit_order_items ADD COLUMN IF NOT EXISTS reconfirmation_status TEXT DEFAULT 'NOT_REQUIRED';
ALTER TABLE circuit_order_items ADD COLUMN IF NOT EXISTS reconfirmation_deadline TEXT;
ALTER TABLE circuit_order_items ADD COLUMN IF NOT EXISTS reconfirmed_at TEXT;

ALTER TABLE circuit_management_requests ADD COLUMN IF NOT EXISTS orchestration_status TEXT DEFAULT 'NOT_STARTED';
ALTER TABLE circuit_management_requests ADD COLUMN IF NOT EXISTS refund_expected_status TEXT;
ALTER TABLE circuit_management_requests ADD COLUMN IF NOT EXISTS refund_reconciled_at TEXT;

CREATE TABLE IF NOT EXISTS circuit_orchestration_events (
  id TEXT PRIMARY KEY,
  circuit_order_id TEXT NOT NULL REFERENCES circuit_orders(id) ON DELETE CASCADE,
  management_request_id TEXT REFERENCES circuit_management_requests(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  booking_id TEXT,
  supplier_id TEXT,
  status TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_circuit_orchestration_order
  ON circuit_orchestration_events(circuit_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_reconfirmation_sla
  ON circuit_order_items(reconfirmation_status, reconfirmation_deadline);
CREATE INDEX IF NOT EXISTS idx_circuit_refund_reconciliation
  ON circuit_orders(refund_reconciliation_status, updated_at DESC);

-- @down
DROP INDEX IF EXISTS idx_circuit_refund_reconciliation;
DROP INDEX IF EXISTS idx_circuit_reconfirmation_sla;
DROP INDEX IF EXISTS idx_circuit_orchestration_order;
DROP TABLE IF EXISTS circuit_orchestration_events;
ALTER TABLE circuit_management_requests DROP COLUMN refund_reconciled_at;
ALTER TABLE circuit_management_requests DROP COLUMN refund_expected_status;
ALTER TABLE circuit_management_requests DROP COLUMN orchestration_status;
ALTER TABLE circuit_order_items DROP COLUMN reconfirmed_at;
ALTER TABLE circuit_order_items DROP COLUMN reconfirmation_deadline;
ALTER TABLE circuit_order_items DROP COLUMN reconfirmation_status;
ALTER TABLE circuit_orders DROP COLUMN refund_reconciled_at;
ALTER TABLE circuit_orders DROP COLUMN refund_reconciliation_status;
ALTER TABLE circuit_orders DROP COLUMN reconfirmed_at;
ALTER TABLE circuit_orders DROP COLUMN reconfirmation_deadline;
ALTER TABLE circuit_orders DROP COLUMN reconfirmation_status;
