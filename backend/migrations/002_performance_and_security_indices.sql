-- Migration 002: Performance & Query Indexes
-- Indexes for bookings, suppliers, payouts, and date searches

CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings(ref);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_supplier_id ON bookings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_activity_date ON bookings(activity_date);

CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(city);
CREATE INDEX IF NOT EXISTS idx_suppliers_kyb ON suppliers(kyb_status);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE INDEX IF NOT EXISTS idx_payouts_supplier_status ON payouts(supplier_id, payout_status);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id);
