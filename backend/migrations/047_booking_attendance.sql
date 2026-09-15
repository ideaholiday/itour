-- Supplier check-in: whether the traveler turned up (docs/SUPPLIER_OPERATIONS.md).
--
-- A supplier scans the voucher QR (or types the booking reference) at the meeting
-- point, or marks a traveler who never came as a no-show. Attendance is a record
-- of what happened on the day; it does not move the booking state machine, the
-- payout or the refund. checked_in_by is the user who recorded it.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attendance_status TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_by TEXT;

-- @down
ALTER TABLE bookings DROP COLUMN checked_in_by;
ALTER TABLE bookings DROP COLUMN checked_in_at;
ALTER TABLE bookings DROP COLUMN attendance_status;
