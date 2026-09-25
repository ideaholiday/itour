-- Supplier reschedule (ADR 037, docs/SUPPLIER_OPERATIONS.md).
--
-- A supplier moves a booking to another departure; the price never changes
-- and the seats move in the same transaction. For a booking IdeaHoliday was
-- paid for, the traveler is told and may decline, which cancels it with a full
-- wallet refund exactly like a supplier cancellation (ADR 019).
--
-- supplier_reschedule_status: NULL (never moved by the supplier), MOVED (the
-- traveler hasn't answered), ACCEPTED, or DECLINED. The from_* columns keep
-- the departure the supplier moved it from, for the traveler's notice.
-- A direct (walk-in, phone, manual) booking just moves and keeps NULL.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_reschedule_status TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_reschedule_from_date TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_reschedule_from_time TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_reschedule_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS supplier_rescheduled_at TEXT;

-- @down
ALTER TABLE bookings DROP COLUMN supplier_rescheduled_at;
ALTER TABLE bookings DROP COLUMN supplier_reschedule_reason;
ALTER TABLE bookings DROP COLUMN supplier_reschedule_from_time;
ALTER TABLE bookings DROP COLUMN supplier_reschedule_from_date;
ALTER TABLE bookings DROP COLUMN supplier_reschedule_status;
