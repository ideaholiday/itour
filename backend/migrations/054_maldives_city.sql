-- The Maldives opens for suppliers and listings (ADR 024): Malé, with resort
-- islands entered as pickup or drop points. Inserted only when neither the id
-- nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_mv_male', 'Malé', 'Malé', 'Popular Maldives destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Maldives'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_mv_male' OR LOWER(name) IN ('malé', 'male'));

UPDATE destinations SET country = 'Maldives' WHERE LOWER(name) IN ('malé', 'male');

-- @down
DELETE FROM destinations WHERE id = 'city_mv_male';
