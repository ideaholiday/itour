-- Inclusions and exclusions on package quotations, and each supplier's
-- standard lists to reuse (docs/SUPPLIER_OPERATIONS.md, ADR 040).
--
-- 1. quotations.inclusions / exclusions: JSON arrays of short items
--    ("4 nights' stay with breakfast", "Airfare"), printed on the PDF as
--    "What's included" and "Not included". Copied with the quotation.
-- 2. supplier_quotation_terms: one row per supplier holding its standard
--    inclusions and exclusions, which the builder fills into a quotation in
--    one click. Changing it never changes a saved quotation.

ALTER TABLE quotations ADD COLUMN inclusions TEXT;
ALTER TABLE quotations ADD COLUMN exclusions TEXT;

CREATE TABLE IF NOT EXISTS supplier_quotation_terms (
  supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
  inclusions TEXT NOT NULL DEFAULT '[]',
  exclusions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- @down
DROP TABLE IF EXISTS supplier_quotation_terms;
-- quotations.inclusions / exclusions are kept: SQLite drop-column has
-- historically been unsupported and the columns are harmless when unused.
