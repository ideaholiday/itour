-- Route and city library (ADR 048, docs/SUPPLIER_OPERATIONS.md).
--
-- package_routes: a named circuit (Lucknow – Ayodhya – Varanasi) with a
-- description, its cities and nights, day-by-day text, inclusions and
-- exclusions, and per day the package-library entries (ADR 047) it uses.
-- supplier_id NULL is the shared library kept by the Idea Holiday admin;
-- a supplier id is that supplier's own route, private to it.
--   legs:       JSON [{ "city": "Lucknow", "nights": 2 }, ...]
--   days:       JSON [{ "dayNumber": 1, "title": "...", "description": "...", "itemIds": ["plib_up_01"] }, ...]
--   inclusions, exclusions: JSON arrays of short items.
-- package_cities: a city's description and the title and text of a day spent
-- there, used when a route is laid out. Nothing here is priced: quotations
-- price only from the supplier's own rate sheets.

CREATE TABLE IF NOT EXISTS package_routes (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  region TEXT,
  name TEXT NOT NULL,
  description TEXT,
  legs TEXT NOT NULL DEFAULT '[]',
  days TEXT NOT NULL DEFAULT '[]',
  inclusions TEXT NOT NULL DEFAULT '[]',
  exclusions TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_package_routes_owner ON package_routes(supplier_id, status, region, sort_order);

CREATE TABLE IF NOT EXISTS package_cities (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  day_title TEXT,
  day_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Starter cities and routes. Starter copy for the admin to review.
INSERT INTO package_cities (id, region, name, description, day_title, day_description, sort_order) VALUES
('pcity_lko', 'Uttar Pradesh', 'Lucknow', 'The City of Nawabs: Awadhi food, grand imambaras and Chikankari embroidery.', 'Lucknow: City of Nawabs', 'See the Bara Imambara and its Bhool Bhulaiya maze, Rumi Darwaza, the Chhota Imambara and the British Residency, then taste Awadhi kebabs in Aminabad.', 10),
('pcity_ayd', 'Uttar Pradesh', 'Ayodhya', 'The birthplace of Lord Ram on the banks of the Saryu, home of the new Ram Mandir.', 'Ayodhya: Ram Mandir darshan', 'Visit the Shri Ram Janmabhoomi Mandir, Hanuman Garhi and Kanak Bhawan, and attend the evening aarti at Ram ki Paidi on the Saryu.', 20),
('pcity_vns', 'Uttar Pradesh', 'Varanasi', 'One of the oldest living cities in the world, with its ghats on the Ganges.', 'Varanasi and Sarnath', 'Take a sunrise boat ride on the Ganges, visit Kashi Vishwanath Temple and the corridor, then drive to Sarnath, where the Buddha gave his first sermon.', 30),
('pcity_pyg', 'Uttar Pradesh', 'Prayagraj', 'Where the Ganga, Yamuna and mythical Saraswati meet at the Triveni Sangam.', 'Prayagraj: Triveni Sangam', 'Take a boat to the Triveni Sangam, then see Anand Bhavan and the Allahabad Fort from outside.', 40),
('pcity_del', 'Golden Triangle', 'Delhi', 'India''s capital: Mughal monuments in Old Delhi and Lutyens'' boulevards in New Delhi.', 'Delhi: Old and New Delhi', 'Visit Jama Masjid and ride a rickshaw through Chandni Chowk, then see Raj Ghat, India Gate, Humayun''s Tomb and the Qutub Minar.', 50),
('pcity_agr', 'Golden Triangle', 'Agra', 'Home of the Taj Mahal and the red sandstone Agra Fort.', 'Agra: Taj Mahal and Agra Fort', 'See the Taj Mahal, the white marble tomb built by Shah Jahan, then Agra Fort and the Baby Taj (Itimad-ud-Daulah).', 60),
('pcity_jai', 'Golden Triangle', 'Jaipur', 'The Pink City of Rajasthan, with hill forts and royal palaces.', 'Jaipur: the Pink City', 'Visit Amber Fort, stop for photos at Hawa Mahal and Jal Mahal, then see the City Palace and Jantar Mantar.', 70);

INSERT INTO package_routes (id, supplier_id, region, name, description, legs, days, inclusions, exclusions, sort_order) VALUES
('proute_up_lav', NULL, 'Uttar Pradesh', 'Lucknow – Ayodhya – Varanasi 6N/7D',
 'A spiritual circuit of Uttar Pradesh: Nawabi Lucknow, Lord Ram''s Ayodhya and the ghats of Varanasi, with the Ganga Aarti and Sarnath.',
 '[{"city":"Lucknow","nights":2},{"city":"Ayodhya","nights":2},{"city":"Varanasi","nights":2}]',
 '[{"dayNumber":1,"title":"Arrive in Lucknow","description":"Our driver meets you at Lucknow airport or railway station and takes you to your hotel. The rest of the day is free.","itemIds":["plib_up_01"]},{"dayNumber":2,"title":"Lucknow: City of Nawabs","description":"See the Bara Imambara and its Bhool Bhulaiya maze, Rumi Darwaza, the Chhota Imambara and the British Residency, then taste Awadhi kebabs in Aminabad.","itemIds":["plib_up_02"]},{"dayNumber":3,"title":"Lucknow to Ayodhya","description":"After breakfast, drive to Ayodhya and check in. In the evening, attend the aarti at Ram ki Paidi on the Saryu.","itemIds":["plib_up_03"]},{"dayNumber":4,"title":"Ayodhya: Ram Mandir darshan","description":"Visit the Shri Ram Janmabhoomi Mandir, Hanuman Garhi and Kanak Bhawan.","itemIds":["plib_up_04"]},{"dayNumber":5,"title":"Ayodhya to Varanasi","description":"Drive to Varanasi and check in. At sunset, take a boat on the Ganges to watch the Ganga Aarti at Dashashwamedh Ghat.","itemIds":["plib_up_05","plib_up_08"]},{"dayNumber":6,"title":"Varanasi and Sarnath","description":"Visit Kashi Vishwanath Temple and the corridor, then drive to Sarnath, where the Buddha gave his first sermon.","itemIds":["plib_up_07"]},{"dayNumber":7,"title":"Depart from Varanasi","description":"After breakfast, check out and transfer to Varanasi airport or railway station for your onward journey.","itemIds":[]}]',
 '["Hotel stay as listed, with daily breakfast","Private car with driver for all transfers and sightseeing in the itinerary","Ganga Aarti boat ride in Varanasi"]',
 '["Airfare and train fare","Monument and temple entry tickets unless listed","Meals not listed","Personal expenses such as tips, laundry and phone calls"]', 10),
('proute_up_la', NULL, 'Uttar Pradesh', 'Lucknow – Ayodhya 4N/5D',
 'Nawabi Lucknow and a darshan at the Ram Mandir in Ayodhya.',
 '[{"city":"Lucknow","nights":2},{"city":"Ayodhya","nights":2}]',
 '[{"dayNumber":1,"title":"Arrive in Lucknow","description":"Our driver meets you at Lucknow airport or railway station and takes you to your hotel. The rest of the day is free.","itemIds":["plib_up_01"]},{"dayNumber":2,"title":"Lucknow: City of Nawabs","description":"See the Bara Imambara and its Bhool Bhulaiya maze, Rumi Darwaza, the Chhota Imambara and the British Residency.","itemIds":["plib_up_02"]},{"dayNumber":3,"title":"Lucknow to Ayodhya","description":"After breakfast, drive to Ayodhya and check in. In the evening, attend the aarti at Ram ki Paidi on the Saryu.","itemIds":["plib_up_03"]},{"dayNumber":4,"title":"Ayodhya: Ram Mandir darshan","description":"Visit the Shri Ram Janmabhoomi Mandir, Hanuman Garhi and Kanak Bhawan.","itemIds":["plib_up_04"]},{"dayNumber":5,"title":"Ayodhya to Lucknow for departure","description":"After breakfast, check out and drive back to Lucknow airport or railway station for your onward journey.","itemIds":[]}]',
 '["Hotel stay as listed, with daily breakfast","Private car with driver for all transfers and sightseeing in the itinerary"]',
 '["Airfare and train fare","Monument and temple entry tickets unless listed","Meals not listed","Personal expenses such as tips, laundry and phone calls"]', 20),
('proute_up_av', NULL, 'Uttar Pradesh', 'Ayodhya – Varanasi 4N/5D',
 'Lord Ram''s Ayodhya and the ghats of Varanasi, with the Ganga Aarti and Sarnath.',
 '[{"city":"Ayodhya","nights":2},{"city":"Varanasi","nights":2}]',
 '[{"dayNumber":1,"title":"Arrive in Ayodhya","description":"Arrive in Ayodhya and check in. In the evening, attend the aarti at Ram ki Paidi on the Saryu.","itemIds":[]},{"dayNumber":2,"title":"Ayodhya: Ram Mandir darshan","description":"Visit the Shri Ram Janmabhoomi Mandir, Hanuman Garhi and Kanak Bhawan.","itemIds":["plib_up_04"]},{"dayNumber":3,"title":"Ayodhya to Varanasi","description":"Drive to Varanasi and check in. At sunset, watch the Ganga Aarti from a boat.","itemIds":["plib_up_05","plib_up_08"]},{"dayNumber":4,"title":"Varanasi and Sarnath","description":"Visit Kashi Vishwanath Temple and the corridor, then drive to Sarnath.","itemIds":["plib_up_07"]},{"dayNumber":5,"title":"Depart from Varanasi","description":"After breakfast, check out and transfer to Varanasi airport or railway station.","itemIds":[]}]',
 '["Hotel stay as listed, with daily breakfast","Private car with driver for all transfers and sightseeing in the itinerary","Ganga Aarti boat ride in Varanasi"]',
 '["Airfare and train fare","Monument and temple entry tickets unless listed","Meals not listed","Personal expenses such as tips, laundry and phone calls"]', 30),
('proute_gt_5n', NULL, 'Golden Triangle', 'Golden Triangle: Delhi – Agra – Jaipur 5N/6D',
 'India''s classic first trip: Mughal Delhi, the Taj Mahal at Agra and the forts and palaces of Jaipur.',
 '[{"city":"Delhi","nights":2},{"city":"Agra","nights":1},{"city":"Jaipur","nights":2}]',
 '[{"dayNumber":1,"title":"Arrive in Delhi","description":"Our driver meets you at the airport arrivals hall and takes you to your hotel. The rest of the day is free.","itemIds":["plib_gt_01"]},{"dayNumber":2,"title":"Delhi: Old and New Delhi","description":"Visit Jama Masjid and ride a rickshaw through Chandni Chowk, then see Raj Ghat, India Gate, Humayun''s Tomb and the Qutub Minar.","itemIds":["plib_gt_03","plib_gt_12"]},{"dayNumber":3,"title":"Delhi to Agra: the Taj Mahal","description":"Drive to Agra on the Yamuna Expressway. In the afternoon, see the Taj Mahal and Agra Fort.","itemIds":["plib_gt_04","plib_gt_09","plib_gt_10"]},{"dayNumber":4,"title":"Agra to Jaipur via Fatehpur Sikri","description":"Drive to Jaipur, stopping at Fatehpur Sikri, Akbar''s abandoned red sandstone capital.","itemIds":["plib_gt_06"]},{"dayNumber":5,"title":"Jaipur: the Pink City","description":"Visit Amber Fort, stop for photos at Hawa Mahal and Jal Mahal, then see the City Palace and Jantar Mantar.","itemIds":["plib_gt_07","plib_gt_11"]},{"dayNumber":6,"title":"Jaipur to Delhi for departure","description":"Drive back to Delhi for your onward journey.","itemIds":["plib_gt_08"]}]',
 '["Hotel stay as listed, with daily breakfast","Private car with driver for all transfers and sightseeing in the itinerary"]',
 '["Airfare and train fare","Monument entry tickets unless listed","Meals not listed","Personal expenses such as tips, laundry and phone calls"]', 40);

-- @down
DROP INDEX IF EXISTS idx_package_routes_owner;
DROP TABLE IF EXISTS package_routes;
DROP TABLE IF EXISTS package_cities;
