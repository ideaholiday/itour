-- Vietnam opens for suppliers and listings (ADR 024): Hanoi, Ho Chi Minh City
-- and Da Nang. Inserted only when neither the id nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_vn_hanoi', 'Hanoi', 'Hanoi', 'Popular Vietnam destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Vietnam'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_vn_hanoi' OR LOWER(name) = 'hanoi');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_vn_ho_chi_minh', 'Ho Chi Minh City', 'Ho Chi Minh City', 'Popular Vietnam destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Vietnam'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_vn_ho_chi_minh' OR LOWER(name) = 'ho chi minh city');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_vn_da_nang', 'Da Nang', 'Da Nang', 'Popular Vietnam destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Vietnam'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_vn_da_nang' OR LOWER(name) = 'da nang');

UPDATE destinations SET country = 'Vietnam' WHERE LOWER(name) IN ('hanoi', 'ho chi minh city', 'da nang');

-- @down
DELETE FROM destinations WHERE id IN ('city_vn_hanoi', 'city_vn_ho_chi_minh', 'city_vn_da_nang');
