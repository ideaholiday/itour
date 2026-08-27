-- Migration 009: Persist canonical, expiring multi-item circuit quotes

CREATE TABLE IF NOT EXISTS circuit_quotes (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  adults_count INTEGER NOT NULL DEFAULT 1,
  children_count INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT,
  base_amount REAL NOT NULL DEFAULT 0,
  taxes_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  line_items TEXT NOT NULL DEFAULT '[]',
  issues TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_circuit_quotes_itinerary ON circuit_quotes(itinerary_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_circuit_quotes_user ON circuit_quotes(user_id, created_at DESC);
