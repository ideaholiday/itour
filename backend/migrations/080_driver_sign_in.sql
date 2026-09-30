-- Driver sign-in by email code (ADR 053).
--
-- A driver types their email or mobile number and gets a 6-digit code at the
-- roster email. Only a SHA-256 hash of the code is stored; a code expires after
-- 10 minutes, allows 5 wrong tries and works once.

CREATE TABLE IF NOT EXISTS driver_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_driver_login_codes_email ON driver_login_codes (email, created_at);

-- @down
DROP INDEX IF EXISTS idx_driver_login_codes_email;
DROP TABLE IF EXISTS driver_login_codes;
