-- Migration 006: Cashfree SecureID KYB Verification Engine & Columns

CREATE TABLE IF NOT EXISTS supplier_kyb_verifications (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  reference_id TEXT,
  status TEXT NOT NULL,
  input_data TEXT,
  response_data TEXT,
  score REAL,
  verified_at TEXT,
  actor_id TEXT,
  actor_role TEXT,
  created_at TEXT
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS years_in_operation INTEGER;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gstin_verified INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gstin_verified_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gstin_verified_status TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pan_verified INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pan_verified_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pan_type TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_verified INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_verified_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_match_score REAL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS kyb_last_verified_at TEXT;

ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS submitted_at TEXT;
ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_kyb_verifications_supplier ON supplier_kyb_verifications(supplier_id, verification_type, created_at DESC);
