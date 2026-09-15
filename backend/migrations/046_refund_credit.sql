-- Supplier cancellations refund to the traveler's wallet first (ADR 019).
--
-- When a supplier cancels a paid booking, what the traveler paid becomes refund
-- credit: credit_source = 'REFUND', no expiry, not capped at checkout, spent after
-- all other credit. For 10 days (cash_refundable_until) the traveler can send
-- whatever is unspent back to the original payment method instead.
--
-- bookings.refunded_to_wallet_inr records that refund on the cancelled booking, so a later
-- cash refund of that credit is not mistaken for money the supplier keeps.
--
-- refund_inr on a REDEMPTION row is how much of that spend came from refund
-- credit, so cancelling the new booking gives it back as the same kind of credit.

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS refund_inr REAL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS cash_refundable_until TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_to_wallet_inr REAL;

-- @down
ALTER TABLE bookings DROP COLUMN refunded_to_wallet_inr;
ALTER TABLE wallet_transactions DROP COLUMN cash_refundable_until;
ALTER TABLE wallet_transactions DROP COLUMN refund_inr;
