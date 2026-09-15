-- Review collection: per-booking invite tokens, and supplier-owned share links.
--
-- Two ways a traveler reaches the review form, both landing on the SAME
-- verified path — a review still requires a completed booking, one per booking:
--
--   1. `review_invites` — a single-use token the platform sends after a trip
--      (email / WhatsApp / SMS). The token identifies the booking, so the
--      traveler types nothing.
--   2. `review_share_links` — a durable link or QR a supplier hands out on a
--      voucher, in a vehicle, or over chat. It identifies nobody by itself, so
--      the traveler claims it with their booking reference plus the last four
--      digits of the phone on that booking. A successful claim mints exactly
--      the same kind of single-use invite as (1).
--
-- What deliberately does NOT exist here is a way to leave a review without a
-- booking behind it. A public "anyone can rate this" form on a link a supplier
-- controls is a fake-review vector, and ratings feed dispatch ranking.
--
-- Tokens are stored hashed (HMAC-SHA256, see reviewInviteService) — the
-- plaintext token lives only in the link that was sent to the traveler.

-- A supplier's durable link. `product_id` NULL means "any of my products": the
-- claimed booking decides which listing the review lands on.
CREATE TABLE IF NOT EXISTS review_share_links (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  product_id TEXT REFERENCES products(id),
  slug TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  claim_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_share_links_supplier ON review_share_links(supplier_id, is_active);

CREATE TABLE IF NOT EXISTS review_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  channel TEXT NOT NULL DEFAULT 'EMAIL',
  share_link_id TEXT REFERENCES review_share_links(id),
  created_by TEXT,
  expires_at TEXT NOT NULL,
  opened_at TEXT,
  used_at TEXT,
  review_id TEXT REFERENCES reviews(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_invites_booking ON review_invites(booking_id, used_at);
CREATE INDEX IF NOT EXISTS idx_review_invites_supplier ON review_invites(supplier_id, created_at);

-- Where a review came in from, and how the traveler proved the booking was
-- theirs: BOOKING_TOKEN (a mailed invite) or BOOKING_REF (a share-link claim).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS invite_id TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verification_method TEXT;

-- @down
DROP INDEX IF EXISTS idx_review_share_links_supplier;
DROP INDEX IF EXISTS idx_review_invites_supplier;
DROP INDEX IF EXISTS idx_review_invites_booking;
DROP TABLE IF EXISTS review_invites;
DROP TABLE IF EXISTS review_share_links;
ALTER TABLE reviews DROP COLUMN verification_method;
ALTER TABLE reviews DROP COLUMN invite_id;
