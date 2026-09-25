-- Hotel options in one quotation, e.g. 3 Star and 4 Star (ADR 043,
-- docs/SUPPLIER_OPERATIONS.md).
--
-- Cars, activities, listings and custom lines are shared by every option; a
-- hotel line belongs to one option (quotation_lines.option_number, NULL = 1).
-- Each option is priced as its hotels plus the shared lines. The customer picks
-- one when accepting (quotations.selected_option), and the quotation's totals
-- become that option's.

CREATE TABLE IF NOT EXISTS quotation_options (
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  option_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (quotation_id, option_number)
);

ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS option_number INTEGER;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS selected_option INTEGER;

-- @down
ALTER TABLE quotations DROP COLUMN selected_option;
ALTER TABLE quotation_lines DROP COLUMN option_number;
DROP TABLE IF EXISTS quotation_options;
