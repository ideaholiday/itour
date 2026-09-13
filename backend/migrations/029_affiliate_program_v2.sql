-- Affiliate program v2: attribution that actually pays, tiers, a clearing hold,
-- TDS-aware payouts, and payout bank accounts that are objects rather than
-- columns.
--
-- Migration 027 shipped the shape of an affiliate program. This one closes the
-- gaps that separate it from how Viator, GetYourGuide and Klook actually run:
--
--   1. `affiliate_attributions` — a referral link is only worth something if the
--      click survives until the booking. The click is recorded server-side
--      against a visitor token with an explicit expiry (last click inside the
--      window wins), so attribution is no longer a string the browser asserts at
--      checkout time. Coupon codes keep their own path: the traveler typed it,
--      so it needs no cookie.
--   2. `affiliate_tiers` — commission is read from the creator's tier at the
--      moment of accrual and frozen onto the referral row, so changing a tier
--      never rewrites history.
--   3. A clearing hold. Commission matures to ELIGIBLE when the trip completes,
--      but is only withdrawable after `payout_hold_days`, which is the window a
--      refund or chargeback realistically arrives in.
--   4. TDS. Indian commission to a resident is deducted at source under 194H:
--      5% with a verified PAN, 20% without. A payout therefore has three
--      numbers, not one: gross, TDS, net.
--   5. `affiliate_payout_accounts` — several accounts per creator, each
--      independently penny-drop verified, one primary, and a cooling period
--      after a change so a hijacked login cannot redirect the next payout.
--   6. `affiliate_ledger` — an append-only record behind the cached balance
--      columns, so every rupee has a row explaining it.

-- ---------------------------------------------------------------------------
-- Tiers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_tiers (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  min_completed_bookings INTEGER NOT NULL DEFAULT 0,
  min_lifetime_gmv_inr REAL NOT NULL DEFAULT 0,
  commission_rate REAL NOT NULL,
  traveler_discount_pct REAL NOT NULL DEFAULT 5.0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO affiliate_tiers (code, label, min_completed_bookings, min_lifetime_gmv_inr, commission_rate, traveler_discount_pct, sort_order)
VALUES
  ('STARTER', 'Starter',  0,  0,        0.10, 5.0, 1),
  ('RISING',  'Rising',  10, 200000,    0.12, 5.0, 2),
  ('ELITE',   'Elite',   40, 1000000,   0.15, 7.0, 3);

-- ---------------------------------------------------------------------------
-- Payout accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_payout_accounts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  method TEXT NOT NULL CHECK (method IN ('BANK_TRANSFER', 'UPI')),
  -- Bank fields (method = BANK_TRANSFER)
  account_number TEXT,
  account_last4 TEXT,
  ifsc TEXT,
  bank_name TEXT,
  branch TEXT,
  account_holder TEXT,
  account_type TEXT DEFAULT 'SAVINGS',
  -- UPI field (method = UPI)
  upi_id TEXT,
  -- Verification, via Cashfree penny drop / VPA lookup
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'FAILED')),
  verification_ref TEXT,
  verification_message TEXT,
  name_match_score REAL,
  verified_at TEXT,
  -- A newly added or re-verified account cannot receive money until this
  -- moment passes. Blunt, and the reason account-takeover payout fraud fails.
  usable_from TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_accounts_affiliate
  ON affiliate_payout_accounts(affiliate_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_payout_accounts_primary
  ON affiliate_payout_accounts(affiliate_id) WHERE is_primary = 1 AND status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Attribution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  affiliate_code TEXT NOT NULL,
  -- Creator-chosen campaign label (?sub=reels-march). Carried onto the referral
  -- so a creator can tell which post earned the booking.
  sub_id TEXT,
  landing_path TEXT,
  referrer_url TEXT,
  user_id TEXT REFERENCES users(id),
  click_id TEXT REFERENCES affiliate_clicks(id),
  expires_at TEXT NOT NULL,
  consumed_booking_id TEXT REFERENCES bookings(id),
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_visitor
  ON affiliate_attributions(visitor_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_affiliate
  ON affiliate_attributions(affiliate_id, created_at);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_ledger (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'COMMISSION_ACCRUED',   -- booking attributed, not yet earned
    'COMMISSION_CLEARED',   -- trip completed, commission matured
    'COMMISSION_REVERSED',  -- booking cancelled or refunded
    'PAYOUT_RESERVED',      -- creator requested a withdrawal
    'PAYOUT_PAID',          -- money left the building
    'PAYOUT_TDS',           -- tax withheld from that withdrawal
    'PAYOUT_REVERSED',      -- payout rejected or failed, money returned
    'ADJUSTMENT'            -- manual correction by finance
  )),
  -- Signed, in rupees: positive credits the creator, negative debits them.
  amount_inr REAL NOT NULL,
  referral_id TEXT REFERENCES affiliate_referrals(id),
  payout_id TEXT REFERENCES affiliate_payouts(id),
  booking_id TEXT REFERENCES bookings(id),
  note TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_affiliate
  ON affiliate_ledger(affiliate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_referral
  ON affiliate_ledger(referral_id);

-- ---------------------------------------------------------------------------
-- Column additions
-- ---------------------------------------------------------------------------

ALTER TABLE affiliates ADD COLUMN tier_code TEXT NOT NULL DEFAULT 'STARTER';
ALTER TABLE affiliates ADD COLUMN payout_hold_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE affiliates ADD COLUMN attribution_window_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE affiliates ADD COLUMN default_payout_account_id TEXT REFERENCES affiliate_payout_accounts(id);
ALTER TABLE affiliates ADD COLUMN is_resident_indian INTEGER NOT NULL DEFAULT 1;

ALTER TABLE affiliate_referrals ADD COLUMN sub_id TEXT;
ALTER TABLE affiliate_referrals ADD COLUMN tier_code TEXT;
ALTER TABLE affiliate_referrals ADD COLUMN attribution_id TEXT REFERENCES affiliate_attributions(id);
-- When an ELIGIBLE commission stops being on hold and becomes withdrawable.
ALTER TABLE affiliate_referrals ADD COLUMN payable_at TEXT;

ALTER TABLE affiliate_payouts ADD COLUMN payout_account_id TEXT REFERENCES affiliate_payout_accounts(id);
ALTER TABLE affiliate_payouts ADD COLUMN gross_amount_inr REAL;
ALTER TABLE affiliate_payouts ADD COLUMN tds_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payouts ADD COLUMN tds_amount_inr REAL NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payouts ADD COLUMN net_amount_inr REAL;
ALTER TABLE affiliate_payouts ADD COLUMN statement_from TEXT;
ALTER TABLE affiliate_payouts ADD COLUMN statement_to TEXT;
ALTER TABLE affiliate_payouts ADD COLUMN failure_reason TEXT;
ALTER TABLE affiliate_payouts ADD COLUMN provider TEXT;
ALTER TABLE affiliate_payouts ADD COLUMN provider_ref TEXT;

-- Existing payouts predate the split, so gross == net and nothing was withheld.
UPDATE affiliate_payouts
SET gross_amount_inr = COALESCE(gross_amount_inr, amount_inr),
    net_amount_inr = COALESCE(net_amount_inr, amount_inr)
WHERE gross_amount_inr IS NULL OR net_amount_inr IS NULL;

-- Existing eligible commission has already sat through any realistic refund
-- window, so it clears immediately rather than being retroactively frozen.
UPDATE affiliate_referrals
SET payable_at = COALESCE(payable_at, eligible_at, created_at)
WHERE status = 'ELIGIBLE' AND payable_at IS NULL;

-- Lift the inline bank columns on `affiliates` into first-class accounts.
INSERT INTO affiliate_payout_accounts (
  id, affiliate_id, method, account_number, account_last4, ifsc, bank_name,
  account_holder, account_type, verification_status, verified_at, usable_from,
  is_primary, status
)
SELECT
  'affacc_bank_' || a.id,
  a.id,
  'BANK_TRANSFER',
  a.bank_account_number,
  SUBSTR(a.bank_account_number, -4),
  a.bank_ifsc,
  a.bank_name,
  COALESCE(a.bank_account_holder, a.pan_holder_name),
  COALESCE(a.bank_account_type, 'SAVINGS'),
  CASE WHEN a.bank_verified = 1 THEN 'VERIFIED' ELSE 'UNVERIFIED' END,
  CASE WHEN a.bank_verified = 1 THEN a.updated_at ELSE NULL END,
  a.created_at,
  1,
  'ACTIVE'
FROM affiliates a
WHERE a.bank_account_number IS NOT NULL
  AND a.bank_ifsc IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM affiliate_payout_accounts x WHERE x.affiliate_id = a.id);

INSERT INTO affiliate_payout_accounts (
  id, affiliate_id, method, upi_id, verification_status, usable_from, is_primary, status
)
SELECT
  'affacc_upi_' || a.id,
  a.id,
  'UPI',
  a.upi_id,
  'UNVERIFIED',
  a.created_at,
  0,
  'ACTIVE'
FROM affiliates a
WHERE a.upi_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM affiliate_payout_accounts x
    WHERE x.affiliate_id = a.id AND x.method = 'UPI'
  );

UPDATE affiliates
SET default_payout_account_id = (
  SELECT x.id FROM affiliate_payout_accounts x
  WHERE x.affiliate_id = affiliates.id AND x.is_primary = 1 AND x.status = 'ACTIVE'
)
WHERE default_payout_account_id IS NULL;

-- @down
DROP INDEX IF EXISTS idx_affiliate_ledger_referral;
DROP INDEX IF EXISTS idx_affiliate_ledger_affiliate;
DROP TABLE IF EXISTS affiliate_ledger;
DROP INDEX IF EXISTS idx_affiliate_attributions_affiliate;
DROP INDEX IF EXISTS idx_affiliate_attributions_visitor;
DROP TABLE IF EXISTS affiliate_attributions;
DROP INDEX IF EXISTS idx_affiliate_payout_accounts_primary;
DROP INDEX IF EXISTS idx_affiliate_payout_accounts_affiliate;
DROP TABLE IF EXISTS affiliate_payout_accounts;
DROP TABLE IF EXISTS affiliate_tiers;
