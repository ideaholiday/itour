-- Admin-controlled program settings (ADR 017, plan Phase 0).
--
-- One row per program (for example `giveaway`, `commission`), holding its
-- settings as JSON validated by programSettingsService. A missing row means the
-- program runs on the defaults in code, so this migration changes no behaviour.
-- Every change is appended to program_settings_audit with who made it and why.

CREATE TABLE IF NOT EXISTS program_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_settings_audit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_program_settings_audit_key ON program_settings_audit(key, created_at);

-- @down
DROP INDEX IF EXISTS idx_program_settings_audit_key;
DROP TABLE IF EXISTS program_settings_audit;
DROP TABLE IF EXISTS program_settings;
