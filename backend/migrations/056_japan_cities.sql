-- Japan opens for suppliers and listings (ADR 024): Tokyo, Osaka and Kyoto.
-- Inserted only when neither the id nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_jp_tokyo', 'Tokyo', 'Tokyo', 'Popular Japan destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Japan'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_jp_tokyo' OR LOWER(name) = 'tokyo');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_jp_osaka', 'Osaka', 'Osaka', 'Popular Japan destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Japan'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_jp_osaka' OR LOWER(name) = 'osaka');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_jp_kyoto', 'Kyoto', 'Kyoto', 'Popular Japan destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Japan'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_jp_kyoto' OR LOWER(name) = 'kyoto');

UPDATE destinations SET country = 'Japan' WHERE LOWER(name) IN ('tokyo', 'osaka', 'kyoto');

-- @down
DELETE FROM destinations WHERE id IN ('city_jp_tokyo', 'city_jp_osaka', 'city_jp_kyoto');
