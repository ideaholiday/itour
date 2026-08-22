import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ADMIN_LOGIN, hashPassword, requireAdminInitialPassword } from "./src/lib/passwords.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
  console.error("Refusing to truncate Supabase data. Set ALLOW_DESTRUCTIVE_SEED=true only when you intentionally want fresh demo data.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seedSupabase() {
  console.log("🌱 Seeding Supabase PostgreSQL database with rich Idea Holiday data...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Clear existing data safely
    await client.query(`
      TRUNCATE TABLE 
        driver_assignments, payouts, staff_tasks, bookings, product_pricing, 
        package_itineraries, transfer_routes, day_tours, products, geo_fences, 
        kyb_documents, suppliers, users, reviews 
      CASCADE;
    `);

    // 1. Seed Suppliers
    console.log("Inserting suppliers...");
    await client.query(`
      INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, gstin, pan_number, kyb_status, commission_rate, payout_bank_details, rating)
      VALUES 
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Awadh Express Airport Cabs', 'Rajesh Verma', 'rajesh@awadhcabs.in', '+919876543210', 'Lucknow', 'Uttar Pradesh', '09AAACA1234A1Z5', 'AAACA1234A', 'APPROVED', 18.0, '{"account":"91827364512","ifsc":"HDFC0000123","bank":"HDFC Bank"}', 4.9),
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Capital Travels & DMC', 'Priya Sharma', 'priya@capitaltravels.in', '+919811223344', 'Delhi', 'Delhi', '07BBBCA9988B1Z2', 'BBBCA9988B', 'APPROVED', 15.0, '{"account":"501002233441","ifsc":"ICIC0000456","bank":"ICICI Bank"}', 4.8),
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Goa Coastal Cabs & Excursions', 'Francis Dsouza', 'francis@goacoast.in', '+919822334455', 'Panaji', 'Goa', '30CCCCA5566C1Z9', 'CCCCA5566C', 'APPROVED', 20.0, '{"account":"40998877665","ifsc":"SBIN0001234","bank":"State Bank of India"}', 4.7);
    `);

    // 2. Seed KYB Docs
    console.log("Inserting KYB documents...");
    await client.query(`
      INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_number, doc_url, status)
      VALUES 
      ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'GSTIN', '09AAACA1234A1Z5', 'https://example.com/docs/gst_lucknow.pdf', 'APPROVED'),
      ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'COMMERCIAL_PERMIT', 'UP-32-T-9988', 'https://example.com/docs/permit_up32.pdf', 'APPROVED'),
      ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'PAN', 'BBBCA9988B', 'https://example.com/docs/pan_capital.pdf', 'APPROVED');
    `);

    // 3. Seed Geo Fences
    console.log("Inserting Geo Fences...");
    await client.query(`
      INSERT INTO geo_fences (id, supplier_id, zone_name, city, center_lat, center_lng, radius_km, polygon_coordinates)
      VALUES 
      ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Chaudhary Charan Singh Lucknow Airport Zone', 'Lucknow', 26.7606, 80.8893, 35.0, '[[26.65, 80.75], [26.95, 80.75], [26.95, 81.10], [26.65, 81.10], [26.65, 80.75]]'::jsonb),
      ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'Indira Gandhi International Airport Delhi Zone', 'Delhi', 28.5562, 77.1000, 45.0, '[[28.25, 76.75], [28.95, 76.75], [28.95, 77.60], [28.25, 77.60], [28.25, 76.75]]'::jsonb),
      ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'Mopa & Dabolim Airport Goa Operational Belt', 'Goa', 15.3808, 73.8314, 50.0, '[[14.85, 73.55], [15.85, 73.55], [15.85, 74.25], [14.85, 74.25], [14.85, 73.55]]'::jsonb);
    `);

    // 4. Seed Users
    console.log("Inserting Users...");
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, phone, role)
      VALUES 
      ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11', 'Amit Kumar', 'traveler@ideaholiday.in', 'password123', '+919876500001', 'TRAVELER'),
      ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d22', 'Super Admin', '${ADMIN_LOGIN.email}', '${hashPassword(requireAdminInitialPassword())}', '+919876500002', 'ADMIN'),
      ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d33', 'Pooja Singh (Ground Ops)', 'ops@ideaholiday.in', 'ops123', '+919876500003', 'STAFF'),
      ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d44', 'Rajesh Verma (Supplier)', 'rajesh@awadhcabs.in', 'supplier123', '+919876543210', 'SUPPLIER');
    `);

    // 5. Seed Products
    console.log("Inserting Products...");
    // Product 1: Transfer (Lucknow Airport)
    await client.query(`
      INSERT INTO products (
        id, supplier_id, product_type, title, city, state, short_desc, full_desc, 
        inclusions, exclusions, rating, review_count, bestseller, is_instant_booking, status, hero_image, gallery_images
      ) VALUES (
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'TRANSFER',
        'Lucknow Airport (LKO) to Hotel / City Center Private Transfer',
        'Lucknow',
        'Uttar Pradesh',
        'Hassle-free AC cab pickup from LKO Airport to any hotel in Hazratganj, Gomti Nagar or Alambagh with 60 min free waiting.',
        'Enjoy a seamless arrival experience at Lucknow Chaudhary Charan Singh International Airport (LKO). Your professional uniformed driver will wait at the arrival hall holding a nameboard.',
        ARRAY['AC Private Vehicle', 'Fuel & Driver Allowance', '60 mins Free Airport Waiting', 'Fastag Tolls Included', 'Bottled Water'],
        ARRAY['Driver Tip (Optional)', 'Extra stops outside city limits'],
        4.9, 48, true, true, 'PUBLISHED',
        'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80',
        ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80']
      );
    `);

    // Product 2: Day Sightseeing Tour (Delhi)
    await client.query(`
      INSERT INTO products (
        id, supplier_id, product_type, title, city, state, short_desc, full_desc, 
        inclusions, exclusions, rating, review_count, bestseller, is_instant_booking, status, hero_image, gallery_images
      ) VALUES (
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e22',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        'DAY_TOUR',
        'Full Day Old & New Delhi Private Sightseeing Tour with AC Cab',
        'Delhi NCR',
        'Delhi',
        'Explore Qutub Minar, Humayun''s Tomb, India Gate, Lotus Temple & Chandni Chowk with hotel pickup and chauffeur.',
        'Discover the rich history of India''s capital city in private AC comfort. Your personal driver picks you up right from your hotel lobby.',
        ARRAY['8 Hours / 80 KM Private AC Cab', 'Hotel Pickup & Drop in Delhi/Gurgaon/Noida', 'Fuel, Parking & Tolls', 'Bottled Water'],
        ARRAY['Monument Entrance Tickets', 'Meals & Snacks', 'Tour Guide (Optional Add-on)'],
        4.8, 86, true, true, 'PUBLISHED',
        'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80',
        ARRAY['https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1585135497273-1a86b09fe707?auto=format&fit=crop&w=1200&q=80']
      );
    `);

    // Product 3: Multi-Day Package (Goa)
    await client.query(`
      INSERT INTO products (
        id, supplier_id, product_type, title, city, state, short_desc, full_desc, 
        inclusions, exclusions, rating, review_count, bestseller, is_instant_booking, status, hero_image, gallery_images
      ) VALUES (
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        'MULTI_DAY_PACKAGE',
        '3 Nights / 4 Days Glimpse of Goa: Beaches, Dudhsagar & Cruise Tour',
        'Goa',
        'Goa',
        'Complete Goa holiday package featuring airport transfers, North Goa beaches, South Goa heritage, Dudhsagar excursion & stays.',
        'Immerse yourself in the vibrant coastal vibes of Goa. This 4-day package covers seamless transfers from Mopa or Dabolim airport.',
        ARRAY['Airport Pick-up & Drop (Mopa/Dabolim)', 'Dedicated AC Cab for 4 Days', 'North & South Goa Sightseeing', 'Mandovi River Cruise Entry'],
        ARRAY['Water sports activities', 'Personal shopping & alcoholic drinks'],
        4.9, 112, true, true, 'PUBLISHED',
        'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80',
        ARRAY['https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80']
      );
    `);

    // 6. Transfer Routes & Pricing
    console.log("Inserting Transfer Routes & Pricing...");
    await client.query(`
      INSERT INTO transfer_routes (
        id, product_id, route_type, origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng, distance_km, duration_mins, vehicle_category, max_passengers, max_luggage, free_waiting_mins, toll_included, state_tax_included
      ) VALUES (
        'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11',
        'AIRPORT_PICKUP',
        'Lucknow Airport (LKO)',
        26.7606, 80.8893,
        'Lucknow City Centre (Hazratganj / Gomti Nagar)',
        26.8467, 80.9462,
        24.5, 40, 'SEDAN', 4, 3, 60, true, true
      );
    `);

    // Pricing
    await client.query(`
      INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price, strike_price, per_km_rate, estimated_fastag_tolls, estimated_state_tax)
      VALUES 
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f22', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'Swift Dzire / Etios (Sedan)', 'FIXED', 899, 1200, 14.0, 0, 0),
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f33', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'Ertiga / Marazzo (SUV)', 'FIXED', 1399, 1800, 18.0, 0, 0),
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f44', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11', 'Innova Crysta (Premium MUV)', 'FIXED', 1999, 2500, 24.0, 0, 0),
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f55', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e22', 'Private Sedan (1-4 Pax)', 'FIXED', 2499, 3200, 0, 150, 0),
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f66', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e22', 'Private SUV Ertiga (1-6 Pax)', 'FIXED', 3499, 4500, 0, 150, 0),
      ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f77', 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e33', '4-Day Private Cab + 3-Star Hotel', 'FIXED', 9999, 13500, 0, 300, 0);
    `);

    // 7. Bookings & Driver Assignments
    console.log("Inserting Bookings & Assignments...");
    await client.query(`
      INSERT INTO bookings (
        id, booking_ref, user_id, product_id, supplier_id, product_type, variant_name, travel_date, pickup_time, pickup_location, drop_location, vehicle_category, base_amount, tolls_and_tax_amount, total_amount, commission_amount, supplier_payout_amount, payment_method, payment_status, booking_status, otp_code, traveler_name, traveler_phone, traveler_email
      ) VALUES (
        '10eebc99-9c0b-4ef8-bb6d-6bb9bd380111',
        'IH-9A82B1',
        'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380d11',
        'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e11',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'TRANSFER',
        'Swift Dzire / Etios (Sedan)',
        '2026-08-15',
        '10:30 AM',
        'LKO Airport Terminal 2',
        'Hyatt Regency Gomti Nagar',
        'SEDAN',
        899.00, 0.00, 899.00, 161.82, 737.18,
        'UPI', 'PAID', 'CONFIRMED', '4829',
        'Amit Kumar', '+919876500001', 'traveler@ideaholiday.in'
      );
    `);

    await client.query(`
      INSERT INTO driver_assignments (
        id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, assignment_status
      ) VALUES (
        '20eebc99-9c0b-4ef8-bb6d-6bb9bd380222',
        '10eebc99-9c0b-4ef8-bb6d-6bb9bd380111',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Ramesh Chandra',
        '+919812345678',
        'Swift Dzire AC',
        'UP-32-BZ-4829',
        'ASSIGNED'
      );
    `);

    await client.query("COMMIT");
    console.log("✅ Supabase Database Seeding Completed Successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Seeding Error:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSupabase();
