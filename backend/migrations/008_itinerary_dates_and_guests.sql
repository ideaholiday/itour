-- Migration 008: Add travel dates and guest counts to traveler itineraries

ALTER TABLE traveler_itineraries ADD COLUMN IF NOT EXISTS travel_date TEXT;
ALTER TABLE traveler_itineraries ADD COLUMN IF NOT EXISTS end_date TEXT;
ALTER TABLE traveler_itineraries ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE traveler_itineraries ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
