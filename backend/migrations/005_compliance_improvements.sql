-- Migration 005: Supplier Compliance & Verification Enhancements

ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS submitted_at TEXT;
ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE kyb_documents ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS years_in_operation INTEGER;
