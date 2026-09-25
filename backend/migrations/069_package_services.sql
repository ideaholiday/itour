-- The supplier's private rate sheet for transfers, sightseeing and activities,
-- used only to build package quotations (ADR 042, docs/SUPPLIER_OPERATIONS.md).
--
-- Like hotels (067), nothing here is listed, sold or bookable: no product, no
-- seats, no capacity. A transfer or a sightseeing tour is a car on a route,
-- priced per vehicle for each of the supplier's cab types by season; an
-- activity (entry ticket, boat ride, guided walk) is priced per adult and child
-- by season. A quotation line names the service, and the server prices it.

CREATE TABLE IF NOT EXISTS supplier_cab_types (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  name TEXT NOT NULL,
  seats INTEGER NOT NULL CHECK (seats >= 1 AND seats <= 100),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_cab_types_supplier ON supplier_cab_types(supplier_id);

-- closed_weekdays: comma-separated days the service does not run, 0 = Sunday … 6 = Saturday.
-- day_title / day_description fill the quotation's day text when the service is added.
CREATE TABLE IF NOT EXISTS supplier_services (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  kind TEXT NOT NULL CHECK (kind IN ('TRANSFER', 'SIGHTSEEING', 'ACTIVITY')),
  name TEXT NOT NULL,
  city TEXT,
  from_place TEXT,
  to_place TEXT,
  start_time TEXT,
  duration_hours REAL,
  closed_weekdays TEXT,
  day_title TEXT,
  day_description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_services_supplier ON supplier_services(supplier_id, kind);

-- Transfers and sightseeing: cab_type_id + vehicle_inr (per vehicle).
-- Activities: adult_inr + child_inr (per ticket), no cab type.
CREATE TABLE IF NOT EXISTS supplier_service_rates (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES supplier_services(id),
  cab_type_id TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  vehicle_inr INTEGER CHECK (vehicle_inr >= 0),
  adult_inr INTEGER CHECK (adult_inr >= 0),
  child_inr INTEGER NOT NULL DEFAULT 0 CHECK (child_inr >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_service_rates_service ON supplier_service_rates(service_id, cab_type_id, valid_from);

-- Day titles and text for a quotation's PDF, one row per day.
CREATE TABLE IF NOT EXISTS quotation_days (
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  day_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  PRIMARY KEY (quotation_id, day_number)
);

-- Destination lets a new quotation start from a past one for the same place.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS destination TEXT;

-- New line kinds TRANSPORT and ACTIVITY name a service; the kind list is now
-- checked by the quotation service, so the column CHECK from 067 is dropped.
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS service_id TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS cab_type_id TEXT;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS vehicles INTEGER;
ALTER TABLE quotation_lines DROP CONSTRAINT IF EXISTS quotation_lines_kind_check;

-- @down
-- The kind CHECK is not restored: lines of the new kinds may exist, and a
-- column without the CHECK accepts every value the old one did.
ALTER TABLE quotation_lines DROP COLUMN vehicles;
ALTER TABLE quotation_lines DROP COLUMN cab_type_id;
ALTER TABLE quotation_lines DROP COLUMN service_id;
ALTER TABLE quotations DROP COLUMN destination;
DROP TABLE IF EXISTS quotation_days;
DROP INDEX IF EXISTS idx_supplier_service_rates_service;
DROP TABLE IF EXISTS supplier_service_rates;
DROP INDEX IF EXISTS idx_supplier_services_supplier;
DROP TABLE IF EXISTS supplier_services;
DROP INDEX IF EXISTS idx_supplier_cab_types_supplier;
DROP TABLE IF EXISTS supplier_cab_types;
