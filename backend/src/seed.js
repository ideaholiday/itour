import db from "./db.js";
import logger from "./config/logger.js";
import { INDIA_CITIES } from "./data/indiaCities.js";
import { ADMIN_LOGIN, hashPassword, requireAdminInitialPassword } from "./lib/passwords.js";

if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
  logger.error("Refusing destructive seed because ALLOW_DESTRUCTIVE_SEED is not enabled");
  process.exit(1);
}

logger.info("Seeding marketplace demo data");

db.pragma("foreign_keys = OFF");

// Clear existing tables in safe order
db.exec(`
  DELETE FROM driver_assignments;
  DELETE FROM payouts;
  DELETE FROM staff_tasks;
  DELETE FROM bookings;
  DELETE FROM product_pricing;
  DELETE FROM package_itineraries;
  DELETE FROM transfer_routes;
  DELETE FROM products;
  DELETE FROM geo_fences;
  DELETE FROM kyb_documents;
  DELETE FROM suppliers;
  DELETE FROM users;
  DELETE FROM destinations;
`);

db.pragma("foreign_keys = ON");

// 1. Seed Destinations
const insertDestination = db.prepare(`
  INSERT INTO destinations (id, name, state, tagline, hero_image)
  VALUES (?, ?, ?, ?, ?)
`);

const destinations = [
  ["lucknow", "Lucknow", "Uttar Pradesh", "City of Nawabs, Chikankari & Royal Heritage", "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80"],
  ["delhi", "Delhi NCR", "Delhi", "Heart of India — Monuments, Food & Airport Hub", "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80"],
  ["goa", "Goa", "Goa", "Sun, Sand, Cruises & Coastal Sunshine", "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80"],
  ["jaipur", "Jaipur", "Rajasthan", "The Pink City — Palaces, Forts & Royal Hospitality", "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80"],
  ["agra", "Agra", "Uttar Pradesh", "Home of the Taj Mahal & Mughal Architecture", "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80"],
  ["varanasi", "Varanasi", "Uttar Pradesh", "Spiritual Capital — Ganga Aarti & Sacred Ghats", "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80"],
  ["udaipur", "Udaipur", "Rajasthan", "City of Lakes & Regal Romance", "https://images.unsplash.com/photo-1615836245337-f5b9b2303f10?auto=format&fit=crop&w=1200&q=80"],
  ["mumbai", "Mumbai", "Maharashtra", "City of Dreams, Marine Drive & Bollywood", "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=1200&q=80"],
  ["kochi", "Kochi", "Kerala", "Gateway to Backwaters & Spice Trails", "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80"],
  ["bengaluru", "Bengaluru", "Karnataka", "Garden City & Tech Capital", "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1200&q=80"]
];

for (const d of destinations) insertDestination.run(...d);

const upsertCatalogCity = db.prepare(`
  INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET category = excluded.category, is_active = 1
`);
for (const [id, name, state, category] of INDIA_CITIES) {
  upsertCatalogCity.run(
    id,
    name,
    state,
    category === "METRO" ? "Major Indian metro and business hub" : "Popular Indian tourism destination",
    "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80",
    category
  );
}

// 2. Seed Suppliers
const insertSupplier = db.prepare(`
  INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, gstin, pan_number, kyb_status, is_verified, commission_rate, payout_bank_details, rating)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const suppliers = [
  ["sup_lucknow_cabs", "Awadh Express Airport Cabs", "Rajesh Verma", "rajesh@awadhcabs.in", "+919876543210", "Lucknow", "Uttar Pradesh", "09AAACA1234A1Z5", "AAACA1234A", "APPROVED", 1, 18.0, '{"account_number":"91827364512","ifsc":"HDFC0000123","bank_name":"HDFC Bank","upi_id":"awadhcabs@hdfcbank"}', 4.9],
  ["sup_capital_tours", "Capital Travels & DMC", "Priya Sharma", "priya@capitaltravels.in", "+919811223344", "Delhi", "Delhi", "07BBBCA9988B1Z2", "BBBCA9988B", "APPROVED", 1, 15.0, '{"account_number":"501002233441","ifsc":"ICIC0000456","bank_name":"ICICI Bank","upi_id":"priya@icici"}', 4.8],
  ["sup_goa_transfers", "Goa Coastal Cabs & Excursions", "Francis Dsouza", "francis@goacoast.in", "+919822334455", "Panaji", "Goa", "30CCCCA5566C1Z9", "CCCCA5566C", "APPROVED", 1, 20.0, '{"account_number":"40998877665","ifsc":"SBIN0001234","bank_name":"State Bank of India","upi_id":"goacoast@sbi"}', 4.7],
  ["sup_royal_rajasthan", "Royal Rajputana Fleet & Luxury Cabs", "Vikram Singh Rathore", "vikram@royalrajputana.in", "+919414012345", "Jaipur", "Rajasthan", "08DDDD1122D1Z4", "DDDD1122D", "PENDING", 0, 15.0, '{"account_number":"30991122334","ifsc":"BARB0JAIPUR","bank_name":"Bank of Baroda","upi_id":"rajputana@barodampay"}', 4.5],
  ["sup_himalayan_riders", "Himalayan Cabs & Tempo Express", "Suresh Negi", "suresh@himalayanrides.in", "+919736098765", "Shimla", "Himachal Pradesh", "02EEEE3344E1Z7", "EEEE3344E", "PENDING", 0, 15.0, '{"account_number":"60123456789","ifsc":"PUNB0123400","bank_name":"Punjab National Bank","upi_id":"himalayan@pnb"}', 4.6],
  ["sup_kerala_cruises", "Backwater Trails & Luxury Transfers", "Anand Kurup", "anand@keralatrails.com", "+919847055443", "Kochi", "Kerala", "32FFFF5566F1Z1", "FFFF5566F", "SUSPENDED", 0, 15.0, '{"account_number":"10293847561","ifsc":"FDRL0001402","bank_name":"Federal Bank","upi_id":"keralatrails@federal"}', 4.2]
];

for (const s of suppliers) insertSupplier.run(...s);

// 3. Seed KYB Documents
const insertKyb = db.prepare(`
  INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_number, doc_url, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const kybDocs = [
  ["kyb_1", "sup_lucknow_cabs", "GSTIN", "09AAACA1234A1Z5", "https://example.com/docs/gst_lucknow.pdf", "APPROVED"],
  ["kyb_2", "sup_lucknow_cabs", "COMMERCIAL_PERMIT", "UP-32-T-9988", "https://example.com/docs/permit_up32.pdf", "APPROVED"],
  ["kyb_3", "sup_capital_tours", "PAN", "BBBCA9988B", "https://example.com/docs/pan_capital.pdf", "APPROVED"],
  ["kyb_4", "sup_royal_rajasthan", "COMMERCIAL_TRANSPORT_LICENSE", "RJ-14-CTL-2026-9912", "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80", "PENDING"],
  ["kyb_5", "sup_royal_rajasthan", "GSTIN", "08DDDD1122D1Z4", "https://example.com/docs/gst_jaipur.pdf", "PENDING"],
  ["kyb_6", "sup_himalayan_riders", "COMMERCIAL_TRANSPORT_LICENSE", "HP-01-CTL-2025-4410", "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80", "PENDING"]
];
for (const k of kybDocs) insertKyb.run(...k);

// 4. Seed Geo Fences
const insertGeoFence = db.prepare(`
  INSERT INTO geo_fences (id, supplier_id, zone_name, city, center_lat, center_lng, radius_km, polygon_coordinates)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const fences = [
  [
    "fence_lko_apt",
    "sup_lucknow_cabs",
    "Chaudhary Charan Singh Lucknow Airport Zone",
    "Lucknow",
    26.7606,
    80.8893,
    35.0,
    JSON.stringify([[26.65, 80.75], [26.95, 80.75], [26.95, 81.10], [26.65, 81.10], [26.65, 80.75]])
  ],
  [
    "fence_del_apt",
    "sup_capital_tours",
    "Indira Gandhi International Airport Delhi Zone",
    "Delhi",
    28.5562,
    77.1000,
    45.0,
    JSON.stringify([[28.25, 76.75], [28.95, 76.75], [28.95, 77.60], [28.25, 77.60], [28.25, 76.75]])
  ],
  [
    "fence_goa_apt",
    "sup_goa_transfers",
    "Mopa & Dabolim Airport Goa Operational Belt",
    "Goa",
    15.3808,
    73.8314,
    50.0,
    JSON.stringify([[14.85, 73.55], [15.85, 73.55], [15.85, 74.25], [14.85, 74.25], [14.85, 73.55]])
  ]
];
for (const f of fences) insertGeoFence.run(...f);

// 5. Seed Users
const insertUser = db.prepare(`
  INSERT INTO users (id, name, email, password, phone, role)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const users = [
  ["user_traveler", "Amit Kumar", "traveler@ideaholiday.in", "password123", "+919876500001", "TRAVELER"],
  ["user_admin", "Super Admin", ADMIN_LOGIN.email, hashPassword(requireAdminInitialPassword()), "+919876500002", "ADMIN"],
  ["user_ops", "Pooja Singh (Ground Ops)", "ops@ideaholiday.in", "ops123", "+919876500003", "STAFF"],
  ["user_supplier", "Rajesh Verma (Supplier)", "rajesh@awadhcabs.in", "supplier123", "+919876543210", "SUPPLIER"]
];
for (const u of users) insertUser.run(...u);

// 6. Seed Products (Transfers, Day Tours, Multi-Day Packages)
const insertProduct = db.prepare(`
  INSERT INTO products (id, supplier_id, product_type, group_type, title, city, state, category, short_desc, full_desc, duration_hours, price_inr, strike_price_inr, rating, review_count, bestseller, free_cancellation, is_instant_booking, status, hero_image, images, inclusions, exclusions, itinerary)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTransferRoute = db.prepare(`
  INSERT INTO transfer_routes (id, product_id, route_type, origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng, distance_km, duration_mins, vehicle_category, max_passengers, max_luggage, free_waiting_mins, toll_included, state_tax_included)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPackageItinerary = db.prepare(`
  INSERT INTO package_itineraries (id, product_id, total_days, total_nights, day_wise_details, has_hotel_option, hotel_categories, start_city, end_city, vehicle_category)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPricing = db.prepare(`
  INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price, strike_price, per_km_rate, estimated_fastag_tolls, estimated_state_tax)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// --- PRODUCT 1: Transfer (Lucknow Airport to City Centre) ---
insertProduct.run(
  "prod_tr_lko_1",
  "sup_lucknow_cabs",
  "TRANSFER",
  "PRIVATE",
  "Lucknow Airport (LKO) to Hotel / City Center Private Transfer",
  "Lucknow",
  "Uttar Pradesh",
  "Airport Transfers",
  "Hassle-free AC cab pickup from LKO Airport to any hotel in Hazratganj, Gomti Nagar or Alambagh with 60 min free waiting.",
  "Enjoy a seamless arrival experience at Lucknow Chaudhary Charan Singh International Airport (LKO). Your professional uniformed driver will wait at the arrival hall holding a nameboard. Vehicle includes luggage assistance, highway tolls, and bottled mineral water.",
  0.75,
  899,
  1200,
  4.9,
  48,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify([
    "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80"
  ]),
  JSON.stringify(["AC Private Vehicle", "Fuel & Driver Allowance", "60 mins Free Airport Waiting", "Fastag Tolls Included", "Bottled Water"]),
  JSON.stringify(["Driver Tip (Optional)", "Extra stops outside city limits"]),
  "Flight arrival pickup at LKO -> Luggage placement -> Smooth AC ride to Hotel -> Drop off & farewell"
);

insertTransferRoute.run(
  "tr_route_1",
  "prod_tr_lko_1",
  "AIRPORT_PICKUP",
  "Lucknow Airport (LKO)",
  26.7606,
  80.8893,
  "Lucknow City Centre (Hazratganj / Gomti Nagar)",
  26.8467,
  80.9462,
  24.5,
  40,
  "SEDAN",
  4,
  3,
  60,
  1,
  1
);

insertPricing.run("price_tr_1_sedan", "prod_tr_lko_1", "Swift Dzire / Etios (Sedan)", "FIXED", 899, 1200, 14.0, 0, 0);
insertPricing.run("price_tr_1_suv", "prod_tr_lko_1", "Ertiga / Marazzo (SUV)", "FIXED", 1399, 1800, 18.0, 0, 0);
insertPricing.run("price_tr_1_innova", "prod_tr_lko_1", "Innova Crysta (Premium MUV)", "FIXED", 1999, 2500, 24.0, 0, 0);

// --- PRODUCT: Day Sightseeing Tour (Lucknow Heritage Private Tour) ---
insertProduct.run(
  "prod_dt_lko_1",
  "sup_lucknow_cabs",
  "DAY_TOUR",
  "PRIVATE",
  "Full Day Nawabi Heritage Lucknow Sightseeing Private Tour",
  "Lucknow",
  "Uttar Pradesh",
  "Day Sightseeing",
  "Explore Bara Imambara, Chota Imambara, Rumi Darwaza, Residency & Chowk Market in private AC comfort.",
  "Immerse yourself in the royal Nawabi heritage of Lucknow. Visit Bara Imambara, Bhool Bhulaiya, Clock Tower, Rumi Darwaza, and indulge in famous Tunday Kababi & Chikankari shopping.",
  8.0,
  2499,
  3200,
  4.9,
  52,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify(["https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80"]),
  JSON.stringify(["8 Hours / 80 KM Private AC Cab", "Chauffeur Allowance", "Fuel & Parking", "Bottled Water"]),
  JSON.stringify(["Monument Entry Tickets", "Meals & Snacks", "Driver Tip"]),
  JSON.stringify([
    { order: 1, name: "Hotel Pickup", duration: "09:00 AM" },
    { order: 4, name: "Chowk Shopping & Tunday Kababi Stop", duration: "2 Hours" },
    { order: 5, name: "Hotel Drop-off", duration: "05:00 PM" }
  ])
);

// --- PRODUCT: Day Sightseeing Tour (Lucknow Shared Group Tour) ---
insertProduct.run(
  "prod_dt_lko_shared_1",
  "sup_lucknow_cabs",
  "DAY_TOUR",
  "SHARED",
  "Lucknow Heritage Monuments & Street Food Walk - Shared Group Tour",
  "Lucknow",
  "Uttar Pradesh",
  "Day Sightseeing",
  "Join-in guided group tour of Bara Imambara, Rumi Darwaza & Chowk food walk in AC Tempo Coach. Per-seat pricing.",
  "Experience the city of Nawabs in an affordable, fun group format! Hop aboard our comfortable air-conditioned tourist coach with fellow travelers and a knowledgeable English/Hindi speaking local guide. Covers Bara Imambara, Chota Imambara, British Residency, and evening Hazratganj & Chowk street food tasting.",
  6.0,
  699,
  999,
  4.8,
  38,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify(["https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80"]),
  JSON.stringify(["Per Seat in AC Tourist Coach / Tempo", "Certified Local Storyteller Guide", "Packaged Mineral Water", "Complimentary Tunday Kabab Snack Sample"]),
  JSON.stringify(["Monument Entry Tickets", "Personal Expenses", "Driver/Guide Tips"]),
  JSON.stringify([
    { order: 1, name: "Central Gathering Point (GPO Hazratganj)", duration: "09:30 AM" },
    { order: 2, name: "Bara Imambara & Bhool Bhulaiya Guided Walk", duration: "2 Hours" },
    { order: 3, name: "Rumi Darwaza & Clock Tower Photo Stop", duration: "45 Mins" },
    { order: 4, name: "Chowk Street Food & Chikankari Artisan Alley", duration: "2 Hours" },
    { order: 5, name: "Return Drop to Hazratganj", duration: "03:30 PM" }
  ])
);

insertPricing.run("price_dt_lko_shared_seat", "prod_dt_lko_shared_1", "Shared Tour (Per Seat / Passenger)", "PER_PERSON", 699, 999, 0, 0, 0);

// --- PRODUCT: Pending Review Transfer (Jaipur Airport to Fort Resort) ---
insertProduct.run(
  "prod_tr_jpr_pending",
  "sup_royal_rajasthan",
  "TRANSFER",
  "PRIVATE",
  "Jaipur Airport (JAI) to Amer Heritage Palace Private Transfer",
  "Jaipur",
  "Rajasthan",
  "Airport Transfers",
  "Royal pickup service from Jaipur Airport to Amer Fort Heritage Hotels.",
  "Chauffeur-driven luxury transfer with flower garland welcome and complimentary mineral water.",
  2.0,
  1499,
  1999,
  4.5,
  0,
  0,
  1,
  1,
  "PENDING_REVIEW",
  "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify(["https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80"]),
  JSON.stringify(["AC Sedan / SUV", "Toll & Taxes Included", "Chauffeur"]),
  JSON.stringify(["Hotel Room Tariff", "Meals"]),
  JSON.stringify([])
);

insertTransferRoute.run(
  "tr_route_jpr",
  "prod_tr_jpr_pending",
  "AIRPORT_PICKUP",
  "Jaipur International Airport (JAI)",
  26.8242,
  75.8122,
  "Amer Heritage Palace & Resort",
  26.9855,
  75.8513,
  28.0,
  45,
  "SEDAN",
  4,
  3,
  60,
  1,
  1
);

insertPricing.run("price_tr_jpr_1", "prod_tr_jpr_pending", "Etios / Dzire Sedan", "FIXED", 1499, 1999, 15.0, 0, 0);

insertPricing.run("price_dt_lko_sedan", "prod_dt_lko_1", "Swift Dzire Sedan (1-4 Pax)", "FIXED", 2499, 3200, 0, 0, 0);
insertPricing.run("price_dt_lko_suv", "prod_dt_lko_1", "Ertiga SUV (1-6 Pax)", "FIXED", 3499, 4500, 0, 0, 0);
insertPricing.run("price_dt_lko_innova", "prod_dt_lko_1", "Innova Crysta VIP (1-6 Pax)", "FIXED", 4999, 6200, 0, 0, 0);

// --- PRODUCT 2: Day Sightseeing Tour (Half-Day / Full-Day Heritage Delhi) ---
insertProduct.run(
  "prod_dt_del_1",
  "sup_capital_tours",
  "DAY_TOUR",
  "PRIVATE",
  "Full Day Old & New Delhi Private Sightseeing Tour with AC Cab",
  "Delhi NCR",
  "Delhi",
  "Day Sightseeing",
  "Explore Qutub Minar, Humayun's Tomb, India Gate, Lotus Temple & Chandni Chowk with hotel pickup and chauffeur.",
  "Discover the rich history of India's capital city in private AC comfort. Your personal driver picks you up right from your hotel lobby. Enjoy flexibility to pause for photos, lunch at authentic eateries, and explore UNESCO monuments.",
  8.0,
  2499,
  3200,
  4.8,
  86,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify([
    "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1585135497273-1a86b09fe707?auto=format&fit=crop&w=1200&q=80"
  ]),
  JSON.stringify(["8 Hours / 80 KM Private AC Cab", "Hotel Pickup & Drop in Delhi/Gurgaon/Noida", "Fuel, Parking & Tolls", "Bottled Water"]),
  JSON.stringify(["Monument Entrance Tickets", "Meals & Snacks", "Tour Guide (Optional Add-on)"]),
  JSON.stringify([
    { order: 1, name: "Hotel Pickup", duration: "09:00 AM" },
    { order: 2, name: "Qutub Minar UNESCO Site", duration: "1.5 Hours" },
    { order: 3, name: "Humayun's Tomb & India Gate Drive", duration: "2 Hours" },
    { order: 4, name: "Lotus Temple & Chandni Chowk Market", duration: "2.5 Hours" },
    { order: 5, name: "Hotel Drop-off", duration: "05:00 PM" }
  ])
);

insertPricing.run("price_dt_1_sedan", "prod_dt_del_1", "Private Sedan (1-4 Pax)", "FIXED", 2499, 3200, 0, 150, 0);
insertPricing.run("price_dt_1_suv", "prod_dt_del_1", "Private SUV Ertiga (1-6 Pax)", "FIXED", 3499, 4500, 0, 150, 0);
insertPricing.run("price_dt_1_innova", "prod_dt_del_1", "Innova Crysta (1-6 Pax VIP)", "FIXED", 4999, 6200, 0, 150, 0);

// --- PRODUCT 3: Multi-Day Package (3N/4D Goa Tour with Hotel & Sightseeing) ---
insertProduct.run(
  "prod_pkg_goa_1",
  "sup_goa_transfers",
  "MULTI_DAY_PACKAGE",
  "PRIVATE",
  "3 Nights / 4 Days Glimpse of Goa: Beaches, Dudhsagar & Cruise Tour",
  "Goa",
  "Goa",
  "Multi-Day Packages",
  "Complete Goa holiday package featuring airport transfers, North Goa beaches, South Goa heritage, Dudhsagar excursion & optional 3-Star/4-Star stays.",
  "Immerse yourself in the vibrant coastal vibes of Goa. This 4-day package covers seamless transfers from Mopa or Dabolim airport, private sightseeing cabs for North & South Goa highlights, a spice plantation lunch tour, and Mandovi River sunset cruise tickets.",
  96.0,
  9999,
  13500,
  4.9,
  112,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify([
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80"
  ]),
  JSON.stringify(["Airport Pick-up & Drop (Mopa/Dabolim)", "Dedicated AC Cab for 4 Days", "North & South Goa Sightseeing", "Mandovi River Cruise Entry", "Dudhsagar Jeep Safari Passes", "Breakfast (if Hotel variant selected)"]),
  JSON.stringify(["Water sports activities", "Personal shopping & alcoholic drinks"]),
  JSON.stringify([
    { day: 1, title: "Arrival & North Goa Beach Vibe", description: "Airport pickup, check-in to resort. Evening visit to Calangute & Baga beach." },
    { day: 2, title: "South Goa Churches & Sunset Cruise", description: "Visit Basilica of Bom Jesus, Mangueshi Temple & 1-hr Mandovi river cruise." },
    { day: 3, title: "Dudhsagar Waterfalls & Spice Plantation", description: "Jeep safari to Dudhsagar Falls followed by authentic Goan buffet lunch at Spice Farm." },
    { day: 4, title: "Souvenir Shopping & Airport Drop", description: "Check-out, visit Panaji Latin Quarter (Fontainhas) & drop at airport." }
  ])
);

insertPackageItinerary.run(
  "pkg_itin_goa_1",
  "prod_pkg_goa_1",
  4,
  3,
  JSON.stringify([
    { day: 1, title: "Arrival & North Goa Beach Vibe", description: "Airport pickup, check-in to resort. Evening visit to Calangute & Baga beach." },
    { day: 2, title: "South Goa Churches & Sunset Cruise", description: "Visit Basilica of Bom Jesus, Mangueshi Temple & 1-hr Mandovi river cruise." },
    { day: 3, title: "Dudhsagar Waterfalls & Spice Plantation", description: "Jeep safari to Dudhsagar Falls followed by authentic Goan buffet lunch at Spice Farm." },
    { day: 4, title: "Souvenir Shopping & Airport Drop", description: "Check-out, visit Panaji Latin Quarter (Fontainhas) & drop at airport." }
  ]),
  1,
  JSON.stringify(["3_STAR", "4_STAR"]),
  "Goa Airport (Mopa / Dabolim)",
  "Goa Airport (Mopa / Dabolim)",
  "SEDAN"
);

insertPricing.run("price_pkg_1_cabonly", "prod_pkg_goa_1", "Private Vehicle Only (No Hotel)", "PER_PERSON", 9999, 13500, 0, 0, 0);
insertPricing.run("price_pkg_1_3star", "prod_pkg_goa_1", "Cab + 3-Star Resort (CP Plan)", "PER_PERSON", 14499, 18000, 0, 0, 0);
insertPricing.run("price_pkg_1_4star", "prod_pkg_goa_1", "Cab + 4-Star Beach Resort (CP Plan)", "PER_PERSON", 19999, 24000, 0, 0, 0);

// --- PRODUCT 4: Intercity Transfer (Delhi to Agra Taj Mahal One-Way / Roundtrip) ---
insertProduct.run(
  "prod_tr_del_agr",
  "sup_capital_tours",
  "TRANSFER",
  "PRIVATE",
  "Delhi to Agra Yamuna Expressway Private Cab Transfer",
  "Delhi NCR",
  "Delhi",
  "Intercity Transfers",
  "Fastest door-to-door AC cab transfer from Delhi/Gurgaon to Agra via Yamuna Expressway with Fastag tolls included.",
  "Travel comfortably between Delhi and Agra via the 6-lane Yamuna Expressway. Flexible pickup anywhere in Delhi NCR and direct drop-off at your hotel or Taj Mahal entrance gate.",
  3.5,
  2899,
  3500,
  4.9,
  64,
  1,
  1,
  1,
  "PUBLISHED",
  "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80",
  JSON.stringify([
    "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80"
  ]),
  JSON.stringify(["Yamuna Expressway Tolls Included", "UP State Passenger Border Tax Included", "Door-to-door AC Cab", "Chauffeur Allowance"]),
  JSON.stringify(["Taj Mahal Monument Entrance Fees", "Personal Expenses"]),
  "Door-to-door pickup in Delhi NCR -> Yamuna Expressway Smooth Drive -> Drop-off in Agra"
);

insertTransferRoute.run(
  "tr_route_2",
  "prod_tr_del_agr",
  "CITY_TO_CITY",
  "Delhi NCR Pickup",
  28.6139,
  77.2090,
  "Agra Hotel / Taj Mahal",
  27.1767,
  78.0081,
  210.0,
  210,
  "SEDAN",
  4,
  3,
  30,
  1,
  1
);

insertPricing.run("price_tr_2_sedan", "prod_tr_del_agr", "Dzire / Etios Sedan", "FIXED", 2899, 3500, 14.0, 420, 200);
insertPricing.run("price_tr_2_suv", "prod_tr_del_agr", "Ertiga SUV", "FIXED", 3999, 4800, 18.0, 420, 350);
insertPricing.run("price_tr_2_innova", "prod_tr_del_agr", "Innova Crysta Luxury", "FIXED", 5499, 6500, 24.0, 420, 450);

// 7. Seed Initial Driver Assignments & Staff Tasks for Ops Panel Demo
const insertBooking = db.prepare(`
  INSERT INTO bookings (id, ref, user_id, product_id, supplier_id, product_type, variant_name, activity_date, pickup_time, pickup_location, drop_location, adults, children, luggage_bags, vehicle_category, traveler_name, traveler_phone, traveler_email, amount_inr, tolls_and_tax_amount, commission_amount, supplier_payout_amount, payment_method, payment_status, status, otp_code)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertBooking.run(
  "bk_demo_1",
  "IH-9A82B1",
  "user_traveler",
  "prod_tr_lko_1",
  "sup_lucknow_cabs",
  "TRANSFER",
  "Swift Dzire / Etios (Sedan)",
  "2026-08-15",
  "10:30 AM",
  "Terminal 1 Arrival, LKO Airport",
  "Taj Mahal Hotel, Hazratganj Lucknow",
  2,
  0,
  2,
  "SEDAN",
  "Amit Kumar",
  "+919876500001",
  "traveler@ideaholiday.in",
  899,
  0,
  161.82,
  737.18,
  "UPI",
  "PAID",
  "confirmed",
  "4829"
);

const insertDriverAssignment = db.prepare(`
  INSERT INTO driver_assignments (id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertDriverAssignment.run(
  "drv_1",
  "bk_demo_1",
  "sup_lucknow_cabs",
  "Ramesh Kumar Yadav",
  "+919839011223",
  "Swift Dzire VXI",
  "UP-32-DN-4821",
  "ASSIGNED"
);

// Clear table entries in DELETE phase
db.exec(`DELETE FROM supplier_drivers; DELETE FROM blocked_dates;`);

// 8. Seed Supplier Fleet Drivers
const insertSupplierDriver = db.prepare(`
  INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, license_number, rating, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const fleetDrivers = [
  ["drv_sup_1", "sup_lucknow_cabs", "Ramesh Kumar Yadav", "+919839011223", "Swift Dzire VXI (Sedan)", "UP-32-DN-4821", "UP3220190048210", 4.9, "ASSIGNED"],
  ["drv_sup_2", "sup_lucknow_cabs", "Suresh Chandra", "+919839022334", "Maruti Ertiga ZXI (SUV)", "UP-32-EV-8821", "UP3220180099120", 4.8, "AVAILABLE"],
  ["drv_sup_3", "sup_lucknow_cabs", "Mohd. Irfan Khan", "+919839033445", "Toyota Innova Crysta VIP", "UP-32-VIP-0007", "UP3220200012345", 5.0, "AVAILABLE"],
  ["drv_sup_4", "sup_lucknow_cabs", "Vikram Singh", "+919839044556", "Force Tempo Traveller 12S", "UP-32-TT-1100", "UP3220170055443", 4.7, "AVAILABLE"],
  ["drv_sup_5", "sup_capital_tours", "Rajesh Sharma", "+919811009988", "Innova Crysta AC", "DL-1Y-AB-9900", "DL0420190088776", 4.9, "AVAILABLE"]
];

for (const d of fleetDrivers) insertSupplierDriver.run(...d);

// 9. Seed Blocked Dates
const insertBlockedDate = db.prepare(`
  INSERT INTO blocked_dates (id, supplier_id, product_id, scope_type, availability_type, start_date, end_date, capacity_limit, is_active, reason)
  VALUES (?, ?, ?, ?, 'FULL_DAY', ?, ?, 0, 1, ?)
`);

insertBlockedDate.run("blk_2", "sup_lucknow_cabs", null, "ALL", "2026-09-02", "2026-09-03", "Private VIP Wedding Charter Booking");

// 10. Seed Multiple Bookings for Supplier Dashboard
insertBooking.run(
  "bk_demo_2",
  "IH-88F3A2",
  "user_traveler",
  "prod_tr_lko_1",
  "sup_lucknow_cabs",
  "TRANSFER",
  "Swift Dzire / Etios (Sedan)",
  "2026-08-12", // Today
  "02:15 PM",
  "Gomti Nagar Railway Station, Lucknow",
  "Lucknow Airport Terminal 2",
  3,
  0,
  3,
  "SEDAN",
  "Priya Sengupta",
  "+919810234567",
  "priya.sengupta@gmail.com",
  899,
  0,
  161.82,
  737.18,
  "UPI",
  "PAID",
  "in_progress",
  "9912"
);

insertDriverAssignment.run("drv_2", "bk_demo_2", "sup_lucknow_cabs", "Suresh Chandra", "+919839022334", "Maruti Ertiga ZXI", "UP-32-EV-8821", "EN_ROUTE");

insertBooking.run(
  "bk_demo_3",
  "IH-74C91E",
  "user_traveler",
  "prod_dt_lko_1",
  "sup_lucknow_cabs",
  "DAY_TOUR",
  "Innova Crysta VIP (1-6 Pax)",
  "2026-08-12", // Today
  "09:00 AM",
  "Hyatt Regency, Vibhuti Khand, Lucknow",
  "Bara Imambara & Chowk Market",
  4,
  2,
  2,
  "SUV",
  "Dr. Rajeshwar Rao",
  "+919440112233",
  "dr.rao@apollo.org",
  4999,
  250,
  899.82,
  4099.18,
  "CARD",
  "PAID",
  "confirmed",
  "1204"
);

insertDriverAssignment.run("drv_3", "bk_demo_3", "sup_lucknow_cabs", "Mohd. Irfan Khan", "+919839033445", "Toyota Innova Crysta VIP", "UP-32-VIP-0007", "ASSIGNED");

insertBooking.run(
  "bk_demo_4",
  "IH-12A45B",
  "user_traveler",
  "prod_tr_lko_1",
  "sup_lucknow_cabs",
  "TRANSFER",
  "Swift Dzire / Etios (Sedan)",
  "2026-08-11",
  "06:00 PM",
  "Charbagh Railway Station",
  "Hotel Vivanta by Taj",
  1,
  0,
  1,
  "SEDAN",
  "Sneha Kapoor",
  "+919920334455",
  "sneha.kapoor@techcorp.com",
  899,
  0,
  161.82,
  737.18,
  "UPI",
  "PAID",
  "completed",
  "8821"
);

insertDriverAssignment.run("drv_4", "bk_demo_4", "sup_lucknow_cabs", "Ramesh Kumar Yadav", "+919839011223", "Swift Dzire VXI", "UP-32-DN-4821", "COMPLETED");

insertBooking.run(
  "bk_demo_5",
  "IH-99X88Y",
  "user_traveler",
  "prod_dt_lko_1",
  "sup_lucknow_cabs",
  "DAY_TOUR",
  "Swift Dzire Sedan (1-4 Pax)",
  "2026-08-18",
  "10:00 AM",
  "Novotel Lucknow",
  "Lucknow Heritage Loop",
  2,
  1,
  1,
  "SEDAN",
  "Manish Malhotra",
  "+919871122334",
  "manish.m@gmail.com",
  2499,
  0,
  449.82,
  2049.18,
  "UPI",
  "PENDING",
  "pending_confirmation",
  "3412"
);

insertBooking.run(
  "bk_demo_6",
  "IH-44K22L",
  "user_traveler",
  "prod_tr_lko_1",
  "sup_lucknow_cabs",
  "TRANSFER",
  "Swift Dzire / Etios (Sedan)",
  "2026-08-10",
  "11:00 AM",
  "Lucknow Airport",
  "Indira Nagar Sector 14",
  2,
  0,
  2,
  "SEDAN",
  "Animesh Roy",
  "+919830099887",
  "animesh.roy@wipro.com",
  899,
  0,
  161.82,
  737.18,
  "CARD",
  "REFUNDED",
  "cancelled",
  "0000"
);

const insertPayout = db.prepare(`
  INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insertPayout.run("pay_1", "sup_lucknow_cabs", "bk_demo_1", 899, 161.82, 737.18, "PROCESSED");
insertPayout.run("pay_2", "sup_lucknow_cabs", "bk_demo_4", 899, 161.82, 737.18, "PROCESSED");
insertPayout.run("pay_3", "sup_lucknow_cabs", "bk_demo_2", 899, 161.82, 737.18, "SCHEDULED");
insertPayout.run("pay_4", "sup_lucknow_cabs", "bk_demo_3", 4999, 899.82, 4099.18, "SCHEDULED");

const insertTask = db.prepare(`
  INSERT INTO staff_tasks (id, task_type, booking_id, product_id, assigned_staff_name, priority, status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

insertTask.run("task_1", "CONTENT_MODERATION", null, "prod_pkg_goa_1", "Pooja Singh", "MEDIUM", "RESOLVED", "Verified day-wise itinerary and beach resort photographs.");
insertTask.run("task_2", "FALLBACK_DISPATCH", "bk_demo_1", "prod_tr_lko_1", "Pooja Singh", "LOW", "RESOLVED", "Driver Ramesh assigned on schedule.");

logger.info("Marketplace demo data seeded", { destinations: 10, suppliers: 3, products: 4 });
