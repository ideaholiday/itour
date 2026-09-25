-- Per-kilometre car pricing and room occupancy for quotations (ADR 044,
-- docs/SUPPLIER_OPERATIONS.md).
--
-- A transfer or sightseeing service is priced FIXED (vehicle_inr per vehicle,
-- as in 069) or PER_KM: for each cab type a rate per km, a minimum km per day
-- and a driver allowance per day. A quotation line then carries the km and the
-- days the car is used. A hotel rate may say how many guests a room sleeps
-- (extra bed included), so a quotation can warn when the rooms are too few.
-- Pricing values are checked by the rate-sheet service.

ALTER TABLE supplier_services ADD COLUMN IF NOT EXISTS pricing TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE supplier_services ADD COLUMN IF NOT EXISTS distance_km INTEGER;
ALTER TABLE supplier_service_rates ADD COLUMN IF NOT EXISTS per_km_inr REAL;
ALTER TABLE supplier_service_rates ADD COLUMN IF NOT EXISTS min_km_per_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supplier_service_rates ADD COLUMN IF NOT EXISTS driver_allowance_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS km INTEGER;
ALTER TABLE quotation_lines ADD COLUMN IF NOT EXISTS car_days INTEGER;
ALTER TABLE supplier_hotel_rates ADD COLUMN IF NOT EXISTS max_guests INTEGER;

-- @down
ALTER TABLE supplier_hotel_rates DROP COLUMN max_guests;
ALTER TABLE quotation_lines DROP COLUMN car_days;
ALTER TABLE quotation_lines DROP COLUMN km;
ALTER TABLE supplier_service_rates DROP COLUMN driver_allowance_inr;
ALTER TABLE supplier_service_rates DROP COLUMN min_km_per_day;
ALTER TABLE supplier_service_rates DROP COLUMN per_km_inr;
ALTER TABLE supplier_services DROP COLUMN distance_km;
ALTER TABLE supplier_services DROP COLUMN pricing;
