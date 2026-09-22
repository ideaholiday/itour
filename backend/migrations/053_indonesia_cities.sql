-- Indonesia opens for suppliers and listings (ADR 024): Bali (Denpasar) and
-- Jakarta. Inserted only when neither the id nor the name exists yet (as in 049).
-- Bali runs on Central Indonesia time (UTC+8), Jakarta on Western (UTC+7);
-- the zone is set per city in backend/src/lib/localTime.js.
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_id_bali', 'Bali', 'Bali', 'Popular Indonesia destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Indonesia'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_id_bali' OR LOWER(name) = 'bali');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_id_jakarta', 'Jakarta', 'DKI Jakarta', 'Popular Indonesia destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Indonesia'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_id_jakarta' OR LOWER(name) = 'jakarta');

UPDATE destinations SET country = 'Indonesia' WHERE LOWER(name) IN ('bali', 'jakarta');

-- @down
DELETE FROM destinations WHERE id IN ('city_id_bali', 'city_id_jakarta');
