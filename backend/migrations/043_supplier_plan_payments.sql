-- Suppliers pay for their subscription online (ADR 017, plan Phase 5).
--
-- One row per attempt. The amount is priced by the server from the program
-- setting supplier_subscriptions.priceInr (not for sale while that is unset),
-- less any SUPPLIER_SUBSCRIPTION coupon, plus 18% GST under SAC 998559.
-- A PAID or FREE (100% coupon) row creates the ACTIVE subscription it paid for
-- and gets a sequential tax invoice number per financial year.

CREATE TABLE IF NOT EXISTS supplier_plan_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  plan_code TEXT NOT NULL DEFAULT 'MARKETPLACE',
  period_months INTEGER NOT NULL,
  base_inr REAL NOT NULL,
  coupon_code TEXT,
  discount_inr REAL NOT NULL DEFAULT 0,
  taxable_inr REAL NOT NULL,
  gst_rate REAL NOT NULL,
  gst_inr REAL NOT NULL,
  total_inr REAL NOT NULL,
  sac_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FREE', 'FAILED')),
  cashfree_order_id TEXT UNIQUE,
  payment_session_id TEXT,
  cashfree_payment_id TEXT,
  subscription_id TEXT,
  invoice_number TEXT UNIQUE,
  created_by TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_plan_payments_supplier ON supplier_plan_payments(supplier_id, created_at);

-- @down
DROP INDEX IF EXISTS idx_supplier_plan_payments_supplier;
DROP TABLE IF EXISTS supplier_plan_payments;
