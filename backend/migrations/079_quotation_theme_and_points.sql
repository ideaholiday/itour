-- Itinerary themes and arrival/departure points on package quotations (ADR 051).
--
-- 1. quotations.theme: the look of the PDF, web itinerary page and email for
--    this quotation (HERITAGE, CLASSIC or MINIMAL). Empty means the supplier's default.
-- 2. quotations.arrival_point / departure_point: where the trip starts and
--    ends ("Lucknow Airport (LKO)", "Varanasi Junction"), picked from the
--    supplier's list or typed. Printed on day 1 and the last day.
-- 3. supplier_quotation_terms.points: the supplier's saved list of arrival
--    and departure points (JSON array of names); theme: its default theme.

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS arrival_point TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS departure_point TEXT;
ALTER TABLE supplier_quotation_terms ADD COLUMN IF NOT EXISTS points TEXT NOT NULL DEFAULT '[]';
ALTER TABLE supplier_quotation_terms ADD COLUMN IF NOT EXISTS theme TEXT;

-- @down
ALTER TABLE supplier_quotation_terms DROP COLUMN theme;
ALTER TABLE supplier_quotation_terms DROP COLUMN points;
ALTER TABLE quotations DROP COLUMN departure_point;
ALTER TABLE quotations DROP COLUMN arrival_point;
ALTER TABLE quotations DROP COLUMN theme;
