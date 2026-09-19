-- Store phone numbers as E.164 (+<country code><number>), ADR 022.
--
-- Idea Holiday now sells in Thailand and the UAE, so a bare 10-digit number can
-- no longer be assumed Indian. New numbers are saved as E.164 by the API; this
-- converts the numbers already stored. Only unambiguous Indian mobiles get +91
-- (98765 43210, 098765 43210, 919876543210); a number already starting with +
-- only loses its spaces and dashes. Anything else is left as typed, and the
-- send-time normaliser (backend/src/lib/phone.js) still reads it.
--
-- phone_e164_backup keeps every original value so @down restores it exactly.
-- It holds phone numbers: drop it once the conversion is confirmed in production.

CREATE TABLE IF NOT EXISTS phone_e164_backup (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  original TEXT NOT NULL,
  cleaned TEXT NOT NULL,
  converted TEXT,
  PRIMARY KEY (table_name, column_name, row_id)
);

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'users', 'phone', CAST(id AS TEXT), phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM users WHERE phone IS NOT NULL AND TRIM(phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'suppliers', 'phone', CAST(id AS TEXT), phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM suppliers WHERE phone IS NOT NULL AND TRIM(phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'user_profiles', 'phone', CAST(id AS TEXT), phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM user_profiles WHERE phone IS NOT NULL AND TRIM(phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'bookings', 'traveler_phone', CAST(id AS TEXT), traveler_phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(traveler_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM bookings WHERE traveler_phone IS NOT NULL AND TRIM(traveler_phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'circuit_orders', 'traveler_phone', CAST(id AS TEXT), traveler_phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(traveler_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM circuit_orders WHERE traveler_phone IS NOT NULL AND TRIM(traveler_phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'supplier_drivers', 'driver_phone', CAST(id AS TEXT), driver_phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(driver_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM supplier_drivers WHERE driver_phone IS NOT NULL AND TRIM(driver_phone) != '';

INSERT INTO phone_e164_backup (table_name, column_name, row_id, original, cleaned)
  SELECT 'driver_assignments', 'driver_phone', CAST(id AS TEXT), driver_phone, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(driver_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  FROM driver_assignments WHERE driver_phone IS NOT NULL AND TRIM(driver_phone) != '';

UPDATE phone_e164_backup SET converted = CASE
  WHEN LENGTH(cleaned) = 10 AND SUBSTR(cleaned, 1, 1) IN ('6', '7', '8', '9') AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cleaned, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
    THEN '+91' || cleaned
  WHEN LENGTH(cleaned) = 11 AND SUBSTR(cleaned, 1, 1) = '0' AND SUBSTR(cleaned, 2, 1) IN ('6', '7', '8', '9') AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cleaned, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
    THEN '+91' || SUBSTR(cleaned, 2)
  WHEN LENGTH(cleaned) = 12 AND SUBSTR(cleaned, 1, 2) = '91' AND SUBSTR(cleaned, 3, 1) IN ('6', '7', '8', '9') AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cleaned, '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
    THEN '+' || cleaned
  WHEN LENGTH(cleaned) BETWEEN 9 AND 16 AND SUBSTR(cleaned, 1, 1) = '+' AND SUBSTR(cleaned, 2, 1) != '0' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SUBSTR(cleaned, 2), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '') = ''
    THEN cleaned
END;

DELETE FROM phone_e164_backup WHERE converted IS NULL OR converted = original;

UPDATE users SET phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'users' AND b.column_name = 'phone' AND b.row_id = CAST(users.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'users' AND column_name = 'phone');

UPDATE suppliers SET phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'suppliers' AND b.column_name = 'phone' AND b.row_id = CAST(suppliers.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'suppliers' AND column_name = 'phone');

UPDATE user_profiles SET phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'user_profiles' AND b.column_name = 'phone' AND b.row_id = CAST(user_profiles.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'user_profiles' AND column_name = 'phone');

UPDATE bookings SET traveler_phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'bookings' AND b.column_name = 'traveler_phone' AND b.row_id = CAST(bookings.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'bookings' AND column_name = 'traveler_phone');

UPDATE circuit_orders SET traveler_phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'circuit_orders' AND b.column_name = 'traveler_phone' AND b.row_id = CAST(circuit_orders.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'circuit_orders' AND column_name = 'traveler_phone');

UPDATE supplier_drivers SET driver_phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'supplier_drivers' AND b.column_name = 'driver_phone' AND b.row_id = CAST(supplier_drivers.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'supplier_drivers' AND column_name = 'driver_phone');

UPDATE driver_assignments SET driver_phone = (
  SELECT b.converted FROM phone_e164_backup b
  WHERE b.table_name = 'driver_assignments' AND b.column_name = 'driver_phone' AND b.row_id = CAST(driver_assignments.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'driver_assignments' AND column_name = 'driver_phone');

-- @down

UPDATE users SET phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'users' AND b.column_name = 'phone' AND b.row_id = CAST(users.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'users' AND column_name = 'phone');

UPDATE suppliers SET phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'suppliers' AND b.column_name = 'phone' AND b.row_id = CAST(suppliers.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'suppliers' AND column_name = 'phone');

UPDATE user_profiles SET phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'user_profiles' AND b.column_name = 'phone' AND b.row_id = CAST(user_profiles.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'user_profiles' AND column_name = 'phone');

UPDATE bookings SET traveler_phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'bookings' AND b.column_name = 'traveler_phone' AND b.row_id = CAST(bookings.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'bookings' AND column_name = 'traveler_phone');

UPDATE circuit_orders SET traveler_phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'circuit_orders' AND b.column_name = 'traveler_phone' AND b.row_id = CAST(circuit_orders.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'circuit_orders' AND column_name = 'traveler_phone');

UPDATE supplier_drivers SET driver_phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'supplier_drivers' AND b.column_name = 'driver_phone' AND b.row_id = CAST(supplier_drivers.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'supplier_drivers' AND column_name = 'driver_phone');

UPDATE driver_assignments SET driver_phone = (
  SELECT b.original FROM phone_e164_backup b
  WHERE b.table_name = 'driver_assignments' AND b.column_name = 'driver_phone' AND b.row_id = CAST(driver_assignments.id AS TEXT)
)
WHERE CAST(id AS TEXT) IN (SELECT row_id FROM phone_e164_backup WHERE table_name = 'driver_assignments' AND column_name = 'driver_phone');

DROP TABLE IF EXISTS phone_e164_backup;
