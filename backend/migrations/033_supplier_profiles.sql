-- Public supplier profiles: /suppliers/<slug> on the marketplace.
--
-- A registered supplier gets a public page travelers can find on our site and
-- on Google. What it may show is decided on the server (supplierProfileService):
--
--   - Contact details (email, phone, GSTIN, PAN, bank) are never public.
--     Travelers reach the supplier through an enquiry kept on the platform.
--   - Products are not shown on a profile. A paid Spotlight (a later migration)
--     is what puts a product there; marketplace search is unaffected.
--   - The page is indexable once KYB is APPROVED. Before that it is public but
--     `noindex`.
--   - The Verified badge comes only from an ACTIVE, unexpired row in
--     `supplier_verifications` on a KYB-approved supplier. It is a separate,
--     yearly check that goes beyond KYB, never a flag anyone can set directly.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS public_slug TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cover_url TEXT;
-- JSON arrays of strings.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS languages TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_cities TEXT;
-- JSON object of https URLs (website, instagram, facebook, youtube). Used as
-- schema.org `sameAs` so Google can tie the profile to the business; not shown.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS social_links TEXT;
-- PUBLISHED (default: every registered supplier is listed), HIDDEN (by the
-- supplier), SUSPENDED (by an admin).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'PUBLISHED';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS profile_updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_public_slug ON suppliers(public_slug);
CREATE INDEX IF NOT EXISTS idx_suppliers_profile_city ON suppliers(profile_status, city);

-- A renamed profile keeps its old links working with a permanent redirect.
CREATE TABLE IF NOT EXISTS supplier_slug_history (
  old_slug TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_slug_history_supplier ON supplier_slug_history(supplier_id);

-- One row per verification decision. `valid_until` is an ISO-8601 timestamp
-- written by the service; the badge disappears when it passes, with no job.
-- `source` is ADMIN for a manual grant, PURCHASE once paid plans exist.
CREATE TABLE IF NOT EXISTS supplier_verifications (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'PENDING_CHECKS',
  checks TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'ADMIN',
  purchase_id TEXT,
  valid_from TEXT,
  valid_until TEXT,
  decided_by TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_verifications_supplier ON supplier_verifications(supplier_id, status, valid_until);

-- Traveler → supplier questions from a profile. Kept on the platform: messages
-- carrying phone numbers, emails or links are refused (supplierEnquiryService).
CREATE TABLE IF NOT EXISTS supplier_enquiries (
  id TEXT PRIMARY KEY,
  enquiry_ref TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  travel_date TEXT,
  travelers INTEGER,
  status TEXT NOT NULL DEFAULT 'OPEN',
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_enquiries_supplier ON supplier_enquiries(supplier_id, status, last_message_at);
CREATE INDEX IF NOT EXISTS idx_supplier_enquiries_user ON supplier_enquiries(user_id, last_message_at);

CREATE TABLE IF NOT EXISTS supplier_enquiry_messages (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL REFERENCES supplier_enquiries(id),
  author_role TEXT NOT NULL,
  author_id TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_enquiry_messages_enquiry ON supplier_enquiry_messages(enquiry_id, created_at);

-- @down
DROP INDEX IF EXISTS idx_supplier_enquiry_messages_enquiry;
DROP TABLE IF EXISTS supplier_enquiry_messages;
DROP INDEX IF EXISTS idx_supplier_enquiries_user;
DROP INDEX IF EXISTS idx_supplier_enquiries_supplier;
DROP TABLE IF EXISTS supplier_enquiries;
DROP INDEX IF EXISTS idx_supplier_verifications_supplier;
DROP TABLE IF EXISTS supplier_verifications;
DROP INDEX IF EXISTS idx_supplier_slug_history_supplier;
DROP TABLE IF EXISTS supplier_slug_history;
DROP INDEX IF EXISTS idx_suppliers_profile_city;
DROP INDEX IF EXISTS idx_suppliers_public_slug;
ALTER TABLE suppliers DROP COLUMN profile_updated_at;
ALTER TABLE suppliers DROP COLUMN profile_status;
ALTER TABLE suppliers DROP COLUMN social_links;
ALTER TABLE suppliers DROP COLUMN service_cities;
ALTER TABLE suppliers DROP COLUMN languages;
ALTER TABLE suppliers DROP COLUMN cover_url;
ALTER TABLE suppliers DROP COLUMN logo_url;
ALTER TABLE suppliers DROP COLUMN about;
ALTER TABLE suppliers DROP COLUMN tagline;
ALTER TABLE suppliers DROP COLUMN public_slug;
