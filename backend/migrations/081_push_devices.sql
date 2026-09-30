-- Phones that receive push notifications from the Android apps (ADR 053).
--
-- One row per Firebase registration token. owner_type DRIVER keys on the
-- driver's roster email (driver sign-in); USER keys on users.id (traveler and
-- supplier apps). app is driver, traveler or supplier. A token FCM reports as
-- unregistered gets disabled_at and is not sent to again.

CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  app TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  disabled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_devices_owner ON push_devices (owner_type, owner_key, app);

-- @down
DROP INDEX IF EXISTS idx_push_devices_owner;
DROP TABLE IF EXISTS push_devices;
