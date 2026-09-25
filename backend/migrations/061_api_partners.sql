-- OCTo reseller keys (docs/SECURITY.md, docs/API_CONTRACTS.md).
--
-- Reading products and availability over OCTo stays public: it shows no more
-- than the marketplace does. Reserving, confirming, cancelling and reading a
-- booking need a partner key, and a partner only ever sees its own
-- reservations. Only the SHA-256 of a key is stored; the key itself is shown
-- once, by scripts/create-api-partner.js.
--
-- prepaid = 1 means the partner has already collected payment and settles with
-- us on account, so its confirmations are recorded as PAID. Every other
-- partner's confirmation is recorded as PENDING until the payment is received.
-- supplier_id, when set, limits the key to that supplier's products (a
-- supplier's own reseller); NULL is an IdeaHoliday-wide partner.

CREATE TABLE IF NOT EXISTS api_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  prepaid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_partners_supplier ON api_partners(supplier_id);

ALTER TABLE native_reservations ADD COLUMN IF NOT EXISTS api_partner_id TEXT;
CREATE INDEX IF NOT EXISTS idx_native_reservations_api_partner ON native_reservations(api_partner_id);

-- @down
DROP INDEX IF EXISTS idx_native_reservations_api_partner;
ALTER TABLE native_reservations DROP COLUMN api_partner_id;
DROP INDEX IF EXISTS idx_api_partners_supplier;
DROP TABLE IF EXISTS api_partners;
