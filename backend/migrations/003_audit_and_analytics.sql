-- Migration 003: Audit Logs, Quality Scores, and Analytics Support

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  outcome TEXT DEFAULT 'SUCCEEDED',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS quality_scores (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  score_100 REAL NOT NULL,
  review_count INTEGER DEFAULT 0,
  average_rating REAL,
  completion_rate REAL,
  complaint_rate REAL,
  components TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_scores_entity ON quality_scores(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_driver_id TEXT,
  traveler_id TEXT NOT NULL,
  experience_rating INTEGER NOT NULL,
  supplier_rating INTEGER NOT NULL,
  driver_rating INTEGER,
  review_text TEXT,
  status TEXT DEFAULT 'PENDING',
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_supplier ON reviews(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);
