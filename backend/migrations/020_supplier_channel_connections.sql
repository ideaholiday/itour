-- Supplier external booking channel connections (OCTo / ResTech)
CREATE TABLE IF NOT EXISTS supplier_channel_connections (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  channel_name TEXT NOT NULL,
  channel_title TEXT,
  endpoint_url TEXT,
  credentials_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_channels_supplier ON supplier_channel_connections(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_channels_status ON supplier_channel_connections(status);

-- @down
DROP TABLE IF EXISTS supplier_channel_connections;
