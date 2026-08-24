-- Migration 004: Phase 4 Schema Enhancements (Uploads, Media, Inventory, Notifications, Wishlists, Profiles, Modifications, Dynamic Pricing, Addons, FAQs)

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  entity_type TEXT,
  entity_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT,
  status TEXT DEFAULT 'RECEIVED',
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  processed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  requested_by TEXT,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv',
  filters TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  download_url TEXT,
  row_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS supplier_notifications (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_media (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'IMAGE',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_availability (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  date TEXT NOT NULL,
  capacity INTEGER DEFAULT 10,
  booked_count INTEGER DEFAULT 0,
  price_override_inr INTEGER,
  time_slots TEXT DEFAULT '[]',
  status TEXT DEFAULT 'AVAILABLE',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_time_slots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  slot_label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  max_capacity INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  supplier_id TEXT,
  rule_type TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  day_of_week INTEGER,
  min_group_size INTEGER,
  adjustment_type TEXT NOT NULL DEFAULT 'PERCENT',
  adjustment_value REAL NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_addons (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  description TEXT,
  price_inr INTEGER NOT NULL,
  pricing_type TEXT DEFAULT 'PER_PERSON',
  max_quantity INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_faqs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'GENERAL',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  travel_preferences TEXT DEFAULT '{}',
  saved_addresses TEXT DEFAULT '[]',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  id_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  price_at_save INTEGER
);

CREATE TABLE IF NOT EXISTS booking_modifications (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  modification_type TEXT NOT NULL,
  original_value TEXT NOT NULL,
  requested_value TEXT NOT NULL,
  price_difference_inr INTEGER DEFAULT 0,
  status TEXT DEFAULT 'PENDING',
  supplier_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  search_query TEXT NOT NULL,
  category TEXT,
  destination TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_photos (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_helpfulness (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_helpful INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_notifications_unread ON supplier_notifications(supplier_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_availability_lookup ON product_availability(product_id, date);
CREATE INDEX IF NOT EXISTS idx_product_time_slots_product ON product_time_slots(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product ON pricing_rules(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_supplier ON pricing_rules(supplier_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_addons_product ON product_addons(product_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_faqs_product ON product_faqs(product_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_modifications_booking ON booking_modifications(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_modifications_user ON booking_modifications(requested_by, status);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_photos_review ON review_photos(review_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_uploads_entity ON uploads(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON export_jobs(requested_by, created_at DESC);
