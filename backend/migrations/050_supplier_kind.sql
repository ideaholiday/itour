-- What kind of supplier this is (ADR 024, step C1).
--   BUSINESS          a company or firm; the KYB list of its country (today's behaviour).
--   INDIVIDUAL_OWNER  one person with one or more vehicles and no GSTIN, in India;
--                     KYB is PAN, Aadhaar, driving licence and vehicle documents.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_kind TEXT NOT NULL DEFAULT 'BUSINESS';

-- @down
ALTER TABLE suppliers DROP COLUMN supplier_kind;
