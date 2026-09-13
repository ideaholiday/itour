-- Driver workflow extends the existing roster and booking-owned dispatch records.
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS driver_email TEXT;
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS seat_capacity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_drivers ADD COLUMN IF NOT EXISTS dispatch_priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS driver_email TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS seat_capacity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS revision TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS schedule_key TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS departure_key TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS acknowledgement TEXT NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS response_deadline TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS acknowledged_at TEXT;
CREATE TABLE IF NOT EXISTS dispatch_lock (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO dispatch_lock (id) VALUES ('dispatch');
CREATE TABLE IF NOT EXISTS dispatch_settings (
  supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
  automatic_enabled INTEGER NOT NULL DEFAULT 0,
  lead_hours INTEGER NOT NULL DEFAULT 48,
  response_minutes INTEGER NOT NULL DEFAULT 30,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  buffer_minutes INTEGER NOT NULL DEFAULT 30
);
CREATE TABLE IF NOT EXISTS dispatch_attempts (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, schedule_key TEXT NOT NULL,
  supplier_driver_id TEXT, outcome TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dispatch_outbox (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, revision TEXT, schedule_key TEXT,
  event_type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING', available_at TEXT NOT NULL,
  lease_until TEXT, lease_token TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_due ON dispatch_outbox(status, available_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempt_booking ON dispatch_attempts(booking_id, schedule_key);
CREATE INDEX IF NOT EXISTS idx_dispatch_departure ON driver_assignments(departure_key);
-- @down
DROP TABLE IF EXISTS dispatch_outbox;
DROP TABLE IF EXISTS dispatch_attempts;
DROP TABLE IF EXISTS dispatch_settings;
DROP TABLE IF EXISTS dispatch_lock;
DROP INDEX IF EXISTS idx_dispatch_departure;
ALTER TABLE driver_assignments DROP COLUMN acknowledged_at;
ALTER TABLE driver_assignments DROP COLUMN response_deadline;
ALTER TABLE driver_assignments DROP COLUMN acknowledgement;
ALTER TABLE driver_assignments DROP COLUMN departure_key;
ALTER TABLE driver_assignments DROP COLUMN schedule_key;
ALTER TABLE driver_assignments DROP COLUMN revision;
ALTER TABLE driver_assignments DROP COLUMN seat_capacity;
ALTER TABLE driver_assignments DROP COLUMN driver_email;
ALTER TABLE supplier_drivers DROP COLUMN dispatch_priority;
ALTER TABLE supplier_drivers DROP COLUMN seat_capacity;
ALTER TABLE supplier_drivers DROP COLUMN driver_email;
