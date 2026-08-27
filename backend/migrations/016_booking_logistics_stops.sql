-- Migration 016: day-by-day package logistics snapshot
CREATE TABLE IF NOT EXISTS booking_logistics_stops (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  itinerary_day INTEGER NOT NULL,
  city TEXT,
  location_ref TEXT,
  location TEXT,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'REQUIRES_CONFIRMATION',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, itinerary_day)
);
CREATE INDEX IF NOT EXISTS idx_booking_logistics_stops_booking ON booking_logistics_stops(booking_id, itinerary_day);

-- @down
DROP INDEX IF EXISTS idx_booking_logistics_stops_booking;
DROP TABLE IF EXISTS booking_logistics_stops;
