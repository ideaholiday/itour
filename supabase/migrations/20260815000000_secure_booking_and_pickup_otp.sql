ALTER TABLE bookings
  ALTER COLUMN payment_status SET DEFAULT 'PENDING',
  ALTER COLUMN booking_status SET DEFAULT 'PENDING_PAYMENT',
  ADD COLUMN IF NOT EXISTS client_request_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS otp_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ;

-- The legacy plaintext field is retained temporarily for a zero-downtime deploy,
-- but new booking code never writes to or exposes it.
ALTER TABLE bookings ALTER COLUMN otp_code DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN otp_code DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_client_request_id_idx
  ON bookings(client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS driver_assignments_booking_id_idx
  ON driver_assignments(booking_id);
