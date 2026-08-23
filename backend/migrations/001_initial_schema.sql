-- Migration 001: Core Marketplace Schema
-- Destinations, Suppliers, Products, Users, Bookings, Payouts, Refunds

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  region TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  featured INTEGER DEFAULT 0,
  popular INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  company_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  fleet_size INTEGER DEFAULT 1,
  vehicle_types TEXT,
  kyb_status TEXT DEFAULT 'PENDING',
  verified_at TEXT,
  rejection_reason TEXT,
  payout_bank_details TEXT,
  commission_rate REAL DEFAULT 15.0,
  commission_override_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  supplier_id TEXT,
  product_type TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  destination_id TEXT,
  destination_name TEXT,
  category TEXT,
  duration_hours REAL,
  duration_days INTEGER DEFAULT 1,
  base_fare REAL NOT NULL,
  price_inr REAL NOT NULL,
  highlights TEXT,
  inclusions TEXT,
  exclusions TEXT,
  images TEXT,
  cancellation_policy TEXT DEFAULT 'MODERATE_48H',
  status TEXT DEFAULT 'APPROVED',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'traveler',
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  user_id TEXT,
  product_id TEXT,
  supplier_id TEXT,
  product_code TEXT,
  supplier_code TEXT,
  product_type TEXT NOT NULL,
  variant_name TEXT,
  activity_date TEXT NOT NULL,
  pickup_time TEXT,
  pickup_type TEXT DEFAULT 'HOTEL',
  pickup_location TEXT NOT NULL,
  pickup_instructions TEXT,
  drop_location TEXT,
  drop_instructions TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  drop_lat REAL,
  drop_lng REAL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  amount_inr INTEGER NOT NULL,
  tolls_and_tax_amount REAL DEFAULT 0.0,
  commission_amount REAL DEFAULT 0.0,
  supplier_payout_amount REAL DEFAULT 0.0,
  payment_method TEXT DEFAULT 'UPI',
  payment_status TEXT DEFAULT 'PENDING',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  supplier_assignment_status TEXT DEFAULT 'UNASSIGNED',
  supplier_response_status TEXT DEFAULT 'NOT_STARTED',
  client_request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  supplier_id TEXT,
  gross_amount REAL,
  commission_amount REAL,
  net_payout REAL,
  payout_status TEXT DEFAULT 'SCHEDULED',
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  booking_ref TEXT,
  refund_amount REAL,
  refund_percentage INTEGER,
  policy_tier TEXT,
  gateway_refund_id TEXT,
  status TEXT DEFAULT 'PENDING',
  reason TEXT,
  requested_by TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);
