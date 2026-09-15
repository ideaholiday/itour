-- Creators can spend their earnings on bookings (ADR 017, plan Phase 4c).
--
-- A creator moves cleared commission into their traveler wallet. The move is a
-- payment like a bank payout: 1% TDS is withheld and only the net reaches the
-- wallet, and the commission it uses is marked PAID. It is recorded here, not in
-- affiliate_payouts, whose payment_method CHECK allows only bank and UPI.
--
-- In the wallet, that money is the creator's own: credit_source = 'AFFILIATE',
-- no expiry, remaining_inr tracked so it is spent after expiring and other
-- credit and is not limited by the referral wallet caps. affiliate_inr on a
-- REDEMPTION row is how much of that spend came from it, so a refund can give
-- it back as the same kind of credit.

CREATE TABLE IF NOT EXISTS affiliate_wallet_transfers (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  gross_amount_inr REAL NOT NULL,
  tds_rate REAL NOT NULL,
  tds_amount_inr REAL NOT NULL,
  net_amount_inr REAL NOT NULL,
  wallet_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_affiliate_wallet_transfers_affiliate ON affiliate_wallet_transfers(affiliate_id, created_at);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS credit_source TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS affiliate_inr REAL;

-- @down
ALTER TABLE wallet_transactions DROP COLUMN affiliate_inr;
ALTER TABLE wallet_transactions DROP COLUMN credit_source;
DROP INDEX IF EXISTS idx_affiliate_wallet_transfers_affiliate;
DROP TABLE IF EXISTS affiliate_wallet_transfers;
