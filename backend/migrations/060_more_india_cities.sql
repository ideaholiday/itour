-- More Indian catalogue cities (ADR 031): Gorakhpur, Prayagraj and other airport,
-- pilgrimage and hill-station cities suppliers asked for. Production (Postgres)
-- never runs the SQLite-only INDIA_CITIES refresh in db.js, so a new Indian city
-- reaches it only through a migration. Inserted only when neither the id nor the
-- name exists yet (as in 049), so @down deletes exactly these rows.
--
-- The old seed row dest_goa duplicated goa and showed Goa twice in city pickers;
-- it is hidden while goa exists. Products hold the city name, so none move.

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'gorakhpur', 'Gorakhpur', 'Uttar Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'gorakhpur' OR LOWER(name) = 'gorakhpur');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'prayagraj', 'Prayagraj', 'Uttar Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'prayagraj' OR LOWER(name) = 'prayagraj');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'kanpur', 'Kanpur', 'Uttar Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'kanpur' OR LOWER(name) = 'kanpur');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'kushinagar', 'Kushinagar', 'Uttar Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'kushinagar' OR LOWER(name) = 'kushinagar');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'patna', 'Patna', 'Bihar', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'patna' OR LOWER(name) = 'patna');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'bodh-gaya', 'Bodh Gaya', 'Bihar', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'bodh-gaya' OR LOWER(name) = 'bodh gaya');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'ranchi', 'Ranchi', 'Jharkhand', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'ranchi' OR LOWER(name) = 'ranchi');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'raipur', 'Raipur', 'Chhattisgarh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'raipur' OR LOWER(name) = 'raipur');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'nagpur', 'Nagpur', 'Maharashtra', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'nagpur' OR LOWER(name) = 'nagpur');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'shirdi', 'Shirdi', 'Maharashtra', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'shirdi' OR LOWER(name) = 'shirdi');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'vadodara', 'Vadodara', 'Gujarat', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'vadodara' OR LOWER(name) = 'vadodara');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'rajkot', 'Rajkot', 'Gujarat', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'rajkot' OR LOWER(name) = 'rajkot');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'dwarka', 'Dwarka', 'Gujarat', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'dwarka' OR LOWER(name) = 'dwarka');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'ajmer', 'Ajmer', 'Rajasthan', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'ajmer' OR LOWER(name) = 'ajmer');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'mount-abu', 'Mount Abu', 'Rajasthan', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'mount-abu' OR LOWER(name) = 'mount abu');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'ujjain', 'Ujjain', 'Madhya Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'ujjain' OR LOWER(name) = 'ujjain');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'gwalior', 'Gwalior', 'Madhya Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'gwalior' OR LOWER(name) = 'gwalior');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'nainital', 'Nainital', 'Uttarakhand', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'nainital' OR LOWER(name) = 'nainital');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'jammu', 'Jammu', 'Jammu and Kashmir', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'jammu' OR LOWER(name) = 'jammu');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'katra', 'Katra', 'Jammu and Kashmir', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'katra' OR LOWER(name) = 'katra');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'mangaluru', 'Mangaluru', 'Karnataka', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'mangaluru' OR LOWER(name) = 'mangaluru');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'coorg', 'Coorg', 'Karnataka', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'coorg' OR LOWER(name) = 'coorg');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'kozhikode', 'Kozhikode', 'Kerala', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'kozhikode' OR LOWER(name) = 'kozhikode');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'coimbatore', 'Coimbatore', 'Tamil Nadu', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'coimbatore' OR LOWER(name) = 'coimbatore');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'rameswaram', 'Rameswaram', 'Tamil Nadu', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'rameswaram' OR LOWER(name) = 'rameswaram');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'kanyakumari', 'Kanyakumari', 'Tamil Nadu', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'kanyakumari' OR LOWER(name) = 'kanyakumari');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'tirupati', 'Tirupati', 'Andhra Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'tirupati' OR LOWER(name) = 'tirupati');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'visakhapatnam' OR LOWER(name) = 'visakhapatnam');

INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active, country)
  SELECT 'siliguri', 'Siliguri', 'West Bengal', 'Popular Indian tourism destination', 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80', 'TOURISM', 1, 'India'
  WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE id = 'siliguri' OR LOWER(name) = 'siliguri');

UPDATE destinations SET is_active = 0
  WHERE id = 'dest_goa' AND EXISTS (SELECT 1 FROM destinations WHERE id = 'goa');

-- @down
DELETE FROM destinations WHERE id IN ('gorakhpur', 'prayagraj', 'kanpur', 'kushinagar', 'patna', 'bodh-gaya', 'ranchi', 'raipur', 'nagpur', 'shirdi', 'vadodara', 'rajkot', 'dwarka', 'ajmer', 'mount-abu', 'ujjain', 'gwalior', 'nainital', 'jammu', 'katra', 'mangaluru', 'coorg', 'kozhikode', 'coimbatore', 'rameswaram', 'kanyakumari', 'tirupati', 'visakhapatnam', 'siliguri');
UPDATE destinations SET is_active = 1 WHERE id = 'dest_goa';
