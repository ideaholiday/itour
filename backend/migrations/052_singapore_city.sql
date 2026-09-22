-- Singapore opens for suppliers and listings (ADR 024). One catalogue city,
-- inserted only when neither the id nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_sg_singapore', 'Singapore', 'Singapore', 'Popular Singapore destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Singapore'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_sg_singapore' OR LOWER(name) = 'singapore');

UPDATE destinations SET country = 'Singapore' WHERE LOWER(name) = 'singapore';

-- @down
DELETE FROM destinations WHERE id = 'city_sg_singapore';
