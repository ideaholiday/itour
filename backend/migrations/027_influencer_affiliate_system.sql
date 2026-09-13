-- Migration 027: Influencer and Affiliate System
--
-- Enables travel creators and affiliates to have dedicated profiles, share unique
-- coupon codes and tracking links, earn 10% commission on completed bookings,
-- verify KYC and bank accounts, and request payouts.

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) UNIQUE,
  affiliate_code TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'INSTAGRAM',
  channel_url TEXT,
  bio TEXT,
  commission_rate REAL NOT NULL DEFAULT 0.10,
  traveler_discount_pct REAL NOT NULL DEFAULT 5.0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
  kyc_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (kyc_status IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED')),
  pan_number TEXT,
  pan_holder_name TEXT,
  pan_verified INTEGER NOT NULL DEFAULT 0,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_name TEXT,
  bank_account_holder TEXT,
  bank_account_type TEXT DEFAULT 'SAVINGS',
  bank_verified INTEGER NOT NULL DEFAULT 0,
  upi_id TEXT,
  gstin TEXT,
  lifetime_earnings_inr REAL NOT NULL DEFAULT 0.0,
  paid_earnings_inr REAL NOT NULL DEFAULT 0.0,
  available_balance_inr REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliates_user ON affiliates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status, kyc_status);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  booking_id TEXT NOT NULL REFERENCES bookings(id) UNIQUE,
  attribution_type TEXT NOT NULL CHECK (attribution_type IN ('COUPON_CODE', 'REFERRAL_LINK')),
  booking_amount_inr REAL NOT NULL,
  commission_rate REAL NOT NULL DEFAULT 0.10,
  earning_inr REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ELIGIBLE', 'PAID', 'CANCELLED')),
  eligible_at TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate ON affiliate_referrals(affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_booking ON affiliate_referrals(booking_id);

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  amount_inr REAL NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK_TRANSFER', 'UPI')),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED')),
  utr_reference TEXT,
  rejection_reason TEXT,
  processed_by TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate ON affiliate_payouts(affiliate_id, status);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT NOT NULL REFERENCES affiliates(id),
  destination_path TEXT,
  referrer_url TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate ON affiliate_clicks(affiliate_id, created_at);

-- @down
DROP INDEX IF EXISTS idx_affiliate_clicks_affiliate;
DROP TABLE IF EXISTS affiliate_clicks;
DROP INDEX IF EXISTS idx_affiliate_payouts_affiliate;
DROP TABLE IF EXISTS affiliate_payouts;
DROP INDEX IF EXISTS idx_affiliate_referrals_booking;
DROP INDEX IF EXISTS idx_affiliate_referrals_affiliate;
DROP TABLE IF EXISTS affiliate_referrals;
DROP INDEX IF EXISTS idx_affiliates_status;
DROP INDEX IF EXISTS idx_affiliates_code;
DROP INDEX IF EXISTS idx_affiliates_user;
DROP TABLE IF EXISTS affiliates;
