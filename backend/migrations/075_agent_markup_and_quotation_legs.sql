-- Agent net rates on the quotation PDF, and quotation legs for explicit
-- multi-destination trips (docs/SUPPLIER_OPERATIONS.md, ADR 039, ADR 040).
--
-- 1. Agent markup. The direct-booking flow (supplierBookingService) keeps
--    using supplier_agents.commission_pct (ADR 039). The **quotation trade
--    PDF** uses supplier_agents.markup_pct instead: cost lines get the
--    agent's markup rather than the quotation's retail markup, listings
--    still enter at their own price, GST as before. The agent's net is
--    always ≤ retail so long as their markup is below the quotation's,
--    and the difference is the supplier's margin.
-- 2. Legs. A quotation is an ordered list of city + nights (2N Lucknow →
--    2N Ayodhya → 2N Varanasi). Legs are metadata: lines still hang off
--    day_number. The PDF prefers legs over deriving cities from hotels,
--    and per-leg warnings fire when a leg has no hotel line in that city
--    or the hotel nights inside a leg don't match its nights.

ALTER TABLE supplier_agents ADD COLUMN markup_pct REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quotation_legs (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  sort_order INTEGER NOT NULL,
  city TEXT NOT NULL,
  nights INTEGER NOT NULL CHECK (nights >= 0)
);
CREATE INDEX IF NOT EXISTS idx_quotation_legs_quotation ON quotation_legs(quotation_id, sort_order);

-- @down
DROP INDEX IF EXISTS idx_quotation_legs_quotation;
DROP TABLE IF EXISTS quotation_legs;
-- supplier_agents.markup_pct is kept: SQLite drop-column has historically
-- been unsupported and the column is harmless when unused.
