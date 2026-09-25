-- Nepal opens for suppliers and listings (ADR 024): Kathmandu and Pokhara.
-- Inserted only when neither the id nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_np_kathmandu', 'Kathmandu', 'Bagmati', 'Popular Nepal destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Nepal'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_np_kathmandu' OR LOWER(name) = 'kathmandu');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_np_pokhara', 'Pokhara', 'Gandaki', 'Popular Nepal destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Nepal'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_np_pokhara' OR LOWER(name) = 'pokhara');

UPDATE destinations SET country = 'Nepal' WHERE LOWER(name) IN ('kathmandu', 'pokhara');

-- @down
DELETE FROM destinations WHERE id IN ('city_np_kathmandu', 'city_np_pokhara');
