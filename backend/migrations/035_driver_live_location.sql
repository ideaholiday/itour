-- Live driver location from the driver's phone (browser GPS on the private trip page).
--
-- Drivers must share location before they go "On the way", and keep sharing
-- until the trip is completed. Operations, the supplier and the traveler can
-- see it for the whole trip. Pings are deleted after 30 days (ADR 012).
--
--   driver_location_pings  every accepted position, for the trail and audit.
--   driver_assignments.last_*  the newest position, read by maps and the
--                          "share location first" rule. Replaces the old
--                          in-memory cache that was lost on restart and not
--                          shared between server instances.
--
-- source: DRIVER (the driver's phone) or OPS (typed in by operations).

CREATE TABLE IF NOT EXISTS driver_location_pings (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy_m REAL,
  speed_kmh REAL,
  heading REAL,
  source TEXT NOT NULL DEFAULT 'DRIVER',
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_driver_location_pings_assignment ON driver_location_pings(assignment_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_driver_location_pings_received ON driver_location_pings(received_at);

ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_lat REAL;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_lng REAL;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_accuracy_m REAL;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_speed_kmh REAL;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_heading REAL;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_location_source TEXT;
ALTER TABLE driver_assignments ADD COLUMN IF NOT EXISTS last_location_at TEXT;

-- @down
-- Plain DROP COLUMN: the SQLite runner only emulates ADD COLUMN IF NOT EXISTS.
ALTER TABLE driver_assignments DROP COLUMN last_location_at;
ALTER TABLE driver_assignments DROP COLUMN last_location_source;
ALTER TABLE driver_assignments DROP COLUMN last_heading;
ALTER TABLE driver_assignments DROP COLUMN last_speed_kmh;
ALTER TABLE driver_assignments DROP COLUMN last_accuracy_m;
ALTER TABLE driver_assignments DROP COLUMN last_lng;
ALTER TABLE driver_assignments DROP COLUMN last_lat;
DROP INDEX IF EXISTS idx_driver_location_pings_received;
DROP INDEX IF EXISTS idx_driver_location_pings_assignment;
DROP TABLE IF EXISTS driver_location_pings;
