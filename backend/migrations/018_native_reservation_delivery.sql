-- Durable confirmation work and external identifiers keep adapters out of core booking tables.
CREATE TABLE IF NOT EXISTS native_reservation_outbox (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_native_outbox_pending ON native_reservation_outbox(status, available_at);
CREATE TABLE IF NOT EXISTS reservation_external_references (
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('PRODUCT', 'OPTION', 'AVAILABILITY', 'BOOKING', 'UNIT')),
  internal_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  PRIMARY KEY(provider, supplier_id, resource_type, internal_id),
  UNIQUE(provider, supplier_id, resource_type, external_id)
);
-- @down
DROP TABLE IF EXISTS reservation_external_references;
DROP TABLE IF EXISTS native_reservation_outbox;
