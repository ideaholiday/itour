-- Coupon discounts are charged, not only shown.
--
-- Checkout showed a promo_codes discount, but the booking was created at the
-- full price, so the gateway charged it. The server now prices the coupon from
-- its own quote and takes it off amount_inr. Like the referral discount it comes
-- out of commission, never the supplier's payout, so
--   amount_inr + wallet_credit_applied_inr + referral_discount_inr + coupon_discount_inr
--     = commission_amount + supplier_payout_amount.
-- See docs/DECISIONS.md ADR 017 for the 10% giveaway cap.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_discount_inr REAL NOT NULL DEFAULT 0;

-- @down
ALTER TABLE bookings DROP COLUMN coupon_discount_inr;
