-- Bhutan opens for suppliers and listings (ADR 024): Thimphu and Paro.
-- Suppliers include Bhutan's Sustainable Development Fee in their own price.
-- Inserted only when neither the id nor the name exists yet (as in 049).
INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_bt_thimphu', 'Thimphu', 'Thimphu', 'Popular Bhutan destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Bhutan'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_bt_thimphu' OR LOWER(name) = 'thimphu');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'city_bt_paro', 'Paro', 'Paro', 'Popular Bhutan destination', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'INTERNATIONAL', 1, 'Bhutan'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'city_bt_paro' OR LOWER(name) = 'paro');

UPDATE destinations SET country = 'Bhutan' WHERE LOWER(name) IN ('thimphu', 'paro');

-- @down
DELETE FROM destinations WHERE id IN ('city_bt_thimphu', 'city_bt_paro');
