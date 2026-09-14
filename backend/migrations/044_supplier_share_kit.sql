-- Supplier share kit (ROADMAP NEXT #3): QR codes, printable standees and
-- stickers, a voucher QR and an embeddable review widget, all pointing at the
-- supplier's public profile or a review share link through /go/s/<slug>.
--
-- Each visit through that redirect is one row, so a supplier can see which
-- printed piece or channel brings people. Nothing about the visitor is stored.

CREATE TABLE IF NOT EXISTS supplier_share_scans (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('PROFILE', 'REVIEW')),
  channel TEXT NOT NULL CHECK (channel IN ('QR', 'STANDEE', 'STICKER', 'VOUCHER', 'WIDGET', 'LINK')),
  share_link_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_share_scans_supplier ON supplier_share_scans(supplier_id, created_at);

-- @down
DROP INDEX IF EXISTS idx_supplier_share_scans_supplier;
DROP TABLE IF EXISTS supplier_share_scans;
