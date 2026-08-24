-- Migration 007: Newsletter Subscribers, Loyalty Rewards Engine, and Multi-Day Itineraries

-- 1. Newsletter Subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  source TEXT DEFAULT 'FOOTER',
  status TEXT DEFAULT 'ACTIVE',
  brevo_contact_id TEXT,
  subscribed_at TEXT,
  unsubscribed_at TEXT,
  ip_address TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);

-- 2. Loyalty Wallet Transactions & User Referral Columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance_inr REAL DEFAULT 0.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_inr REAL NOT NULL,
  balance_after_inr REAL NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT,
  referral_code TEXT NOT NULL,
  reward_inr REAL DEFAULT 250.0,
  status TEXT DEFAULT 'PENDING',
  booking_id TEXT,
  created_at TEXT,
  rewarded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer ON user_referrals(referrer_user_id);

-- 3. Multi-Day Traveler Itineraries & Circuits
CREATE TABLE IF NOT EXISTS traveler_itineraries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  destination TEXT,
  start_date TEXT,
  days_count INTEGER DEFAULT 3,
  items TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_traveler_itineraries_user ON traveler_itineraries(user_id, updated_at DESC);
