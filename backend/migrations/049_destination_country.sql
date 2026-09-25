-- Suppliers in Thailand and the UAE can sign up (ADR 022).
--
-- Supplier signup only accepts a base city from the destinations catalogue, and
-- the catalogue was India-only. destinations.country says which country a city
-- is in; the Thai cities and Dubai are added. A city already in the catalogue
-- under the same name (for example a hand-added Bangkok) is not duplicated: it
-- only gets its country set. Rows are inserted only when neither the id nor the
-- name exists, so @down deletes exactly the rows this file added.

ALTER TABLE destinations ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'India';

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_th_bangkok', 'Bangkok', 'Bangkok', 'Temples, markets and river life', 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Thailand'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_th_bangkok' OR LOWER(name) = 'bangkok');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_th_pattaya', 'Pattaya', 'Chon Buri', 'Beaches and island hops', 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Thailand'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_th_pattaya' OR LOWER(name) = 'pattaya');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_th_phuket', 'Phuket', 'Phuket', 'Popular Thailand destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Thailand'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_th_phuket' OR LOWER(name) = 'phuket');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_th_krabi', 'Krabi', 'Krabi', 'Popular Thailand destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Thailand'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_th_krabi' OR LOWER(name) = 'krabi');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_th_chiang_mai', 'Chiang Mai', 'Chiang Mai', 'Popular Thailand destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Thailand'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_th_chiang_mai' OR LOWER(name) = 'chiang mai');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_ae_dubai', 'Dubai', 'Dubai', 'Popular UAE destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'United Arab Emirates'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_ae_dubai' OR LOWER(name) = 'dubai');

UPDATE destinations SET country = 'Thailand' WHERE LOWER(name) IN ('bangkok', 'pattaya', 'phuket', 'krabi', 'chiang mai');

UPDATE destinations SET country = 'United Arab Emirates' WHERE LOWER(name) = 'dubai';

-- @down
DELETE FROM destinations WHERE id IN ('city_th_bangkok', 'city_th_pattaya', 'city_th_phuket', 'city_th_krabi', 'city_th_chiang_mai', 'city_ae_dubai');
ALTER TABLE destinations DROP COLUMN country;
