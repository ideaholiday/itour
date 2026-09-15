-- Travel & Earn v3: traveler referrals funded out of each booking's own margin.
--
-- Migration 007 shipped a flat-rupee referral scheme (₹250–₹500 per friend)
-- stored as single-use rows in `user_referrals`. That design could spend more
-- than a booking earned, paid only the first trip, never clawed anything back,
-- and let two code paths reward the same booking. This migration replaces it
-- with the shape migration 029 already proved for affiliates:
--
--   1. `referral_relationships` — a durable referrer↔friend bond with an end
--      date. One row, many rewards: this is what "earn on every booking" needs.
--   2. `referral_attributions` — the referral click is recorded server-side
--      against a visitor token with an expiry, so a `?ref=` the browser asserts
--      is not by itself worth anything.
--   3. `referral_rewards` — one row per rewarded booking (`booking_id` UNIQUE),
--      with the commission base and rates frozen at accrual. Rewards clear to
--      the wallet only after a hold, and reverse on refund.
--   4. `wallet_transactions` becomes the ledger of record: every entry is typed,
--      credits carry an expiry and an unspent remainder, and a unique
--      (booking_id, entry_type) makes each money movement happen at most once.
--   5. `bookings` records the referral discount and the wallet credit it used,
--      so `amount_inr + wallet_credit_applied_inr + referral_discount_inr`
--      equals `commission_amount + supplier_payout_amount` again.
--
-- `user_referrals` is left in place, read-only. Its rows are carried into the
-- new tables by `backfillLegacyReferrals` in referralService at startup, which
-- keeps this file free of engine-specific date arithmetic.

-- ---------------------------------------------------------------------------
-- Attribution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_attributions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL REFERENCES users(id),
  referral_code TEXT NOT NULL,
  -- Where the link was shared from: WHATSAPP, QR, REVIEW, VOUCHER, COPY, CODE.
  channel TEXT,
  landing_path TEXT,
  expires_at TEXT NOT NULL,
  consumed_user_id TEXT REFERENCES users(id),
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_referral_attributions_visitor
  ON referral_attributions(visitor_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer
  ON referral_attributions(referrer_user_id, created_at);

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_relationships (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id),
  -- One referrer per traveler, permanently. A later code never rebinds it.
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  referral_code TEXT NOT NULL,
  attribution_id TEXT REFERENCES referral_attributions(id),
  -- SIGNUP_LINK, CHECKOUT_CODE or LEGACY.
  source TEXT NOT NULL DEFAULT 'SIGNUP_LINK',
  established_at TEXT NOT NULL DEFAULT (datetime('now')),
  earns_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'EXPIRED', 'BLOCKED')),
  blocked_reason TEXT,
  -- Set when the referrer tripped a velocity rule: rewards on this
  -- relationship wait for an operator instead of clearing on their own.
  requires_review INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_referral_relationships_referrer
  ON referral_relationships(referrer_user_id, status);

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES referral_relationships(id),
  referrer_user_id TEXT NOT NULL REFERENCES users(id),
  referred_user_id TEXT NOT NULL REFERENCES users(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  -- 1 is the friend's first paid trip (which also carries their discount).
  sequence INTEGER NOT NULL,
  booking_margin_inr REAL NOT NULL,
  referee_rate REAL NOT NULL DEFAULT 0,
  referrer_rate REAL NOT NULL,
  referee_amount_inr REAL NOT NULL DEFAULT 0,
  referrer_amount_inr REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCRUED'
    CHECK (status IN ('ACCRUED', 'HELD_FOR_REVIEW', 'CLEARED', 'REVERSED', 'VOID')),
  completed_at TEXT,
  -- When the reward may move into the wallet: trip completion + hold days.
  payable_at TEXT,
  cleared_at TEXT,
  reversed_at TEXT,
  reversal_reason TEXT,
  review_note TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
  ON referral_rewards(referrer_user_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_relationship
  ON referral_rewards(relationship_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_payable
  ON referral_rewards(status, payable_at);

-- ---------------------------------------------------------------------------
-- Abuse signals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_fraud_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  referrer_user_id TEXT REFERENCES users(id),
  relationship_id TEXT REFERENCES referral_relationships(id),
  reward_id TEXT REFERENCES referral_rewards(id),
  -- SELF_REFERRAL, SAME_PHONE, EMAIL_ALIAS, SAME_DEVICE, NOT_NEW_TRAVELER,
  -- SIGNUP_VELOCITY, EARNING_VELOCITY.
  signal TEXT NOT NULL,
  detail TEXT,
  -- BLOCKED, HELD_FOR_REVIEW or LOGGED.
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_signals_referrer
  ON referral_fraud_signals(referrer_user_id, created_at);

-- ---------------------------------------------------------------------------
-- Wallet ledger
-- ---------------------------------------------------------------------------

-- REFERRAL_CLEARED, REFERRAL_REVERSED, REDEMPTION, REDEMPTION_RESTORED,
-- CLAWBACK_SETTLED, EXPIRY, ADJUSTMENT. Legacy rows keep only `type`.
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS entry_type TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS booking_id TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reward_id TEXT;
-- Credits only: when the unspent part lapses, and how much is still unspent.
-- Credits issued before v3 have no expiry, as their terms promised.
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expires_at TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS remaining_inr REAL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expiry_reminded_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_booking_entry
  ON wallet_transactions(booking_id, entry_type)
  WHERE booking_id IS NOT NULL AND entry_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_expiring
  ON wallet_transactions(user_id, expires_at);

-- A reversal that lands after the credit was spent is recovered from the
-- referrer's next credits instead of pushing the balance below zero.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_clawback_pending_inr REAL NOT NULL DEFAULT 0;
-- The visitor token the account signed up from, so a friend signing up from the
-- referrer's own browser is recognised as the referrer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_visitor_id TEXT;

-- ---------------------------------------------------------------------------
-- Booking money columns
-- ---------------------------------------------------------------------------

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_credit_applied_inr REAL NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS referral_discount_inr REAL NOT NULL DEFAULT 0;

-- @down
DROP INDEX IF EXISTS idx_wallet_tx_expiring;
DROP INDEX IF EXISTS idx_wallet_tx_booking_entry;
DROP INDEX IF EXISTS idx_referral_fraud_signals_referrer;
DROP TABLE IF EXISTS referral_fraud_signals;
DROP INDEX IF EXISTS idx_referral_rewards_payable;
DROP INDEX IF EXISTS idx_referral_rewards_relationship;
DROP INDEX IF EXISTS idx_referral_rewards_referrer;
DROP TABLE IF EXISTS referral_rewards;
DROP INDEX IF EXISTS idx_referral_relationships_referrer;
DROP TABLE IF EXISTS referral_relationships;
DROP INDEX IF EXISTS idx_referral_attributions_referrer;
DROP INDEX IF EXISTS idx_referral_attributions_visitor;
DROP TABLE IF EXISTS referral_attributions;
