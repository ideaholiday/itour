-- Per-listing sales channels and supplier-issued reseller keys (ADR 041,
-- docs/SUPPLIER_OPERATIONS.md).
--
-- Each listing sells on three switchable channels (1 = on, the default):
--   sell_marketplace     the IdeaHoliday website, search, SEO pages, B2B, circuits
--   sell_ideaholiday_api OCTo partners IdeaHoliday signed (api_partners.supplier_id IS NULL)
--   sell_own_resellers   OCTo keys tied to this supplier (api_partners.supplier_id set)
-- The supplier's own walk-in, phone, manual, agent and package sales always work.
--
-- api_partners.issuer: IDEAHOLIDAY (scripts/create-api-partner.js, unchanged
-- behaviour) or SUPPLIER (issued by the owner in the extranet; its bookings are
-- the supplier's direct sales). agent_id links a supplier key to one of the
-- supplier's agents for their net rate and credit (ADR 039).

ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_marketplace INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_ideaholiday_api INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_own_resellers INTEGER NOT NULL DEFAULT 1;

ALTER TABLE api_partners ADD COLUMN IF NOT EXISTS issuer TEXT NOT NULL DEFAULT 'IDEAHOLIDAY';
ALTER TABLE api_partners ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE api_partners ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

-- @down
ALTER TABLE api_partners DROP COLUMN created_by_user_id;
ALTER TABLE api_partners DROP COLUMN agent_id;
ALTER TABLE api_partners DROP COLUMN issuer;
ALTER TABLE products DROP COLUMN sell_own_resellers;
ALTER TABLE products DROP COLUMN sell_ideaholiday_api;
ALTER TABLE products DROP COLUMN sell_marketplace;
