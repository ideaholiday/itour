#!/usr/bin/env node
/**
 * seed-fresh.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes ALL products, bookings, and suppliers from the database, then inserts:
 *   • 1 demo supplier  — MultiTour Universal Pvt Ltd
 *   • 13 demo products  — covering every product type + sub-type across
 *                         Goa (India), Bangkok (Thailand), Pattaya (Thailand)
 *
 * USER EXPLICITLY AUTHORISED THIS DATA DELETION (approved in chat).
 *
 * Run after migration 017 has been applied:
 *   cd backend && npm run migrate:up && node scripts/seed-fresh.js
 */

import { randomUUID } from "crypto";
import db from "../src/db.js";

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const uid = (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
const json = (v) => JSON.stringify(v);

// ─── STEP 1 — CLEANUP ────────────────────────────────────────────────────────
console.log("\n🧹  Wiping database (FK checks disabled for bulk delete) …\n");
db.pragma("foreign_keys = OFF");

const TABLES_TO_CLEAR = [
  // circuit / order tables
  "circuit_orchestration_events",
  "circuit_management_requests",
  "circuit_payment_events",
  "inventory_holds",
  "circuit_order_items",
  "circuit_orders",
  "circuit_quotes",
  // review tables
  "review_helpfulness",
  "review_photos",
  "reviews",
  // user-linked tables
  "wishlists",
  "booking_modifications",
  "traveler_itineraries",
  // booking / driver tables
  "driver_assignment_events",
  "driver_assignments",
  "bookings",
  // finance
  "payouts",
  "refunds",
  "financial_ledger",
  // product support tables (old)
  "product_media",
  "product_availability",
  "product_time_slots",
  "pricing_rules",
  "product_faqs",
  "product_location_rules",
  "transfer_routes",
  "day_tours",
  "package_itineraries",
  "product_pricing",
  // product support tables (new – migration 017)
  "product_ticket_tiers",
  "product_vehicle_options",
  "product_sic_hubs",
  "product_hotel_tiers",
  "product_itinerary_items",
  // product add-ons
  "product_addons",
  // core product options
  "product_options",
  // PRODUCTS (main)
  "products",
  // supplier support tables
  "supplier_kyb_verifications",
  "kyb_documents",
  "geo_fences",
  "supplier_notifications",
  "supplier_drivers",
  "blocked_dates",
  "supplier_assignment_attempts",
  "quality_scores",
  // SUPPLIERS (main)
  "suppliers",
];

for (const t of TABLES_TO_CLEAR) {
  try {
    const { changes } = db.prepare(`DELETE FROM "${t}"`).run();
    console.log(`  ✓  ${t.padEnd(40)} (${changes} rows deleted)`);
  } catch (e) {
    console.log(`  ⚠  ${t.padEnd(40)} — skipped: ${e.message}`);
  }
}

db.pragma("foreign_keys = ON");
console.log("\n✅  Database wiped.\n");

// ─── STEP 2 — INTERNATIONAL DESTINATIONS ────────────────────────────────────
console.log("🌏  Upserting destinations: Goa, Bangkok, Pattaya …");
const upsertDest = db.prepare(`
  INSERT INTO destinations (id, name, state, tagline, hero_image, category, is_active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    name     = excluded.name,
    state    = excluded.state,
    tagline  = excluded.tagline,
    category = excluded.category,
    is_active = 1
`);
upsertDest.run(
  "dest_goa", "Goa", "Goa",
  "Sun, sand and surf — India's favourite beach state",
  "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
  "BEACH"
);
upsertDest.run(
  "dest_bangkok", "Bangkok", "Thailand",
  "City of Angels — temples, street food and golden skyline",
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1200&q=80",
  "INTERNATIONAL"
);
upsertDest.run(
  "dest_pattaya", "Pattaya", "Thailand",
  "Beach resort city — coral islands, cabaret shows and sea",
  "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=1200&q=80",
  "INTERNATIONAL"
);
console.log("✅  Destinations ready.\n");

// ─── STEP 3 — DEMO SUPPLIER ──────────────────────────────────────────────────
console.log("🏢  Creating MultiTour Universal supplier …");
const SUPPLIER_ID = "sup_multitour_universal";
db.prepare(`
  INSERT INTO suppliers (
    id, supplier_code, company_name, contact_name, email, phone,
    city, state, gstin, pan_number, kyb_status, commission_rate,
    payout_bank_details, rating, is_verified, business_type, years_in_operation
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  SUPPLIER_ID, "MTUNV001", "MultiTour Universal Pvt Ltd",
  "Ravi Sharma", "supplier@multitour.in", "+91-9876543210",
  "Goa", "Goa", "30AADCS0472N1ZL", "AADCS0472N",
  "APPROVED", 15.0,
  json({ bank: "HDFC Bank", account_number: "50100123456789", ifsc: "HDFC0001234", account_name: "MultiTour Universal Pvt Ltd" }),
  4.9, 1, "Tour Operator", 8
);
console.log(`  ✓  Supplier: ${SUPPLIER_ID}\n`);

// ─── STEP 4 — HELPER: INSERT PRODUCT ─────────────────────────────────────────
const insertProduct = db.prepare(`
  INSERT INTO products (
    id, product_code, supplier_id, product_type, product_sub_type,
    title, city, state, category, short_desc, full_desc,
    duration_hours, duration_days, price_inr, strike_price_inr,
    rating, review_count, bestseller, free_cancellation, cancellation_policy,
    is_instant_booking, group_type, status, is_published,
    hero_image, images, highlights, inclusions, exclusions,
    essential_info, booking_mode, min_advance_hours, min_pax, max_pax, languages
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  )
`);

// ─── STEP 5 — INSERT PRODUCTS ────────────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOA #1 — PACKAGE / WITH_HOTEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_GOA_PKG = "prod_goa_package_hotel";
insertProduct.run(
  P_GOA_PKG, P_GOA_PKG, SUPPLIER_ID,
  "PACKAGE", "WITH_HOTEL",
  "3N4D Goa Beach Holiday Package with Hotel",
  "Goa", "Goa", "Beach",
  "Sun, beach, forts and seafood — the classic Goa getaway bundled with hotel, transfers and guided sightseeing.",
  "Escape to the shores of Goa on this all-inclusive 3-night beach holiday. Enjoy guided sightseeing of Goa's top attractions — Baga Beach, Fort Aguada, Dudhsagar Waterfalls and Old Goa churches — with comfortable AC hotel stays and hassle-free transfers throughout. Three hotel tiers available to suit every budget.",
  24, 4, 8999, 12500,
  4.8, 47, 1, 1, "FLEXIBLE_24H",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1468413253333-ce0c1f2e8dac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Beautiful Baga & Calangute beaches", "Fort Aguada sunset views", "Dudhsagar Waterfall jungle trek", "Old Goa UNESCO World Heritage churches", "Authentic Goan seafood dinner"]),
  json(["3 nights AC hotel accommodation", "Daily breakfast", "Airport/station transfers (2-way)", "AC vehicle for all sightseeing", "English-speaking tour guide", "Entry tickets included"]),
  json(["Airfare", "Lunch & dinner (except farewell dinner)", "Personal expenses", "Tips & gratuity", "Travel insurance"]),
  json(["Carry light cotton clothing; Goa is humid year-round", "Minimum age 5 years for Dudhsagar waterfall trek", "Carry valid photo ID (Aadhar / Passport)"]),
  "INSTANT", 48, 2, 20,
  json(["English", "Hindi", "Marathi"])
);

// Hotel tiers for GOA PACKAGE
const insertHotelTier = db.prepare(`
  INSERT INTO product_hotel_tiers (id, product_id, tier_name, example_properties, price_per_person_per_night_inr, is_recommended, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
insertHotelTier.run(uid("ht"), P_GOA_PKG, "3-Star",
  json(["Hotel Goa Portuguesa", "The Emerald Isle", "Hotel Mandovi"]), 1200, 0, 1);
insertHotelTier.run(uid("ht"), P_GOA_PKG, "4-Star",
  json(["Cidade de Goa", "Grand Hyatt Goa", "The Zuri White Sands"]), 2800, 1, 2);
insertHotelTier.run(uid("ht"), P_GOA_PKG, "5-Star",
  json(["Taj Exotica Resort & Spa", "ITC Grand Goa", "Four Seasons Goa"]), 5500, 0, 3);

// Itinerary for GOA PACKAGE
const insertItinerary = db.prepare(`
  INSERT INTO product_itinerary_items (id, product_id, day_number, time_label, title, description, location, duration_text, icon, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertItinerary.run(uid("it"), P_GOA_PKG, 1, "Day 1", "Arrival & North Goa Beaches", "Pick-up from Goa Airport / Dabolim. Check-in to hotel. Afternoon visit to Baga Beach and Calangute Beach. Evening stroll at Saturday Night Market (seasonal). Overnight at hotel.", "Baga, Calangute", "8 hrs", "✈️", 1);
insertItinerary.run(uid("it"), P_GOA_PKG, 2, "Day 2", "Fort Aguada & Water Sports", "Post-breakfast visit to Fort Aguada for panoramic sea views. Optional water sports at Candolim Beach (parasailing, jet ski). Afternoon free time. Evening boat cruise (optional, extra charge).", "Fort Aguada, Candolim", "8 hrs", "🏰", 2);
insertItinerary.run(uid("it"), P_GOA_PKG, 3, "Day 3", "Dudhsagar Waterfalls & Old Goa", "Early morning jeep safari to Dudhsagar Waterfalls (India's 5th tallest). Post-lunch visit to Old Goa — Basilica of Bom Jesus (UNESCO Heritage), Se Cathedral. Farewell Goan seafood dinner.", "Mollem, Old Goa", "10 hrs", "🌊", 3);
insertItinerary.run(uid("it"), P_GOA_PKG, 4, "Day 4", "South Goa & Departure", "Morning visit to Colva Beach and Miramar Beach. Visit Panjim Church (Church of Our Lady of Immaculate Conception). Transfer to airport / station for departure.", "South Goa, Panjim", "4 hrs", "🏖️", 4);

console.log(`  ✓  [PACKAGE/WITH_HOTEL] ${P_GOA_PKG}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOA #2 — TOUR / SIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_GOA_TOUR_SIC = "prod_goa_tour_sic";
insertProduct.run(
  P_GOA_TOUR_SIC, P_GOA_TOUR_SIC, SUPPLIER_ID,
  "TOUR", "SIC",
  "Goa Full Day Sightseeing Tour by AC Coach (SIC)",
  "Goa", "Goa", "Cultural",
  "Join our shared AC coach tour covering Goa's top landmarks — beaches, forts, churches and waterfalls — in a single action-packed day.",
  "Explore Goa's greatest hits on this comfortable shared coach tour. Visit Baga Beach, Fort Aguada, Basilica of Bom Jesus (UNESCO), Panjim Church and the iconic Dudhsagar Waterfalls. An experienced English-speaking guide accompanies the group throughout. Ideal for solo travellers and couples who want to explore without the hassle of renting a vehicle.",
  8, 1, 1299, 1799,
  4.7, 128, 1, 1, "FLEXIBLE_24H",
  1, "SIC", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1468413253333-ce0c1f2e8dac?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1468413253333-ce0c1f2e8dac?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Dudhsagar Waterfall visit included", "Fort Aguada panoramic views", "UNESCO-listed Old Goa churches", "Experienced English guide", "Fixed departure — no waiting"]),
  json(["AC coach transport throughout", "English-speaking tour guide", "Pickup from designated hubs", "Hotel drop included (within 10 km of hub)"]),
  json(["Meals", "Entry fees (included in price)", "Water sports", "Personal expenses", "Tips"]),
  json(["Wear comfortable walking shoes", "Carry sunscreen and water", "Group size: 15–30 pax per coach"]),
  "INSTANT", 12, 1, 30,
  json(["English", "Hindi"])
);

// Ticket tiers for GOA TOUR SIC
const insertTicketTier = db.prepare(`
  INSERT INTO product_ticket_tiers (id, product_id, tier_name, age_min, age_max, price_inr, is_free, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
insertTicketTier.run(uid("tt"), P_GOA_TOUR_SIC, "Adult", 13, null, 1299, 0, 1);
insertTicketTier.run(uid("tt"), P_GOA_TOUR_SIC, "Child", 5, 12, 899, 0, 2);
insertTicketTier.run(uid("tt"), P_GOA_TOUR_SIC, "Infant", 0, 4, 0, 1, 3);

// SIC hubs for GOA TOUR SIC
const insertSicHub = db.prepare(`
  INSERT INTO product_sic_hubs (id, product_id, hub_name, hub_address, lat, lng, departure_time, capacity, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertSicHub.run(uid("hub"), P_GOA_TOUR_SIC, "Panaji Bus Stand Hub", "KTC Bus Stand, Panaji, Goa 403001", 15.4989, 73.8278, "08:00", 30, 1);
insertSicHub.run(uid("hub"), P_GOA_TOUR_SIC, "Calangute Beach Hub", "Near Calangute Main Beach Road, Goa 403516", 15.5437, 73.7553, "08:30", 30, 2);

// Itinerary for GOA TOUR SIC (hour-wise)
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "08:00", "Pickup from designated hub", "Board the AC coach at your chosen hub. Briefing by tour guide.", "Hub locations", "15 mins", "🚌", 1);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "09:00", "Fort Aguada", "Explore the 17th-century Portuguese fort overlooking the Arabian Sea. Stunning sunrise views.", "Fort Aguada, North Goa", "1.5 hrs", "🏰", 2);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "10:30", "Baga & Calangute Beach Stroll", "Free time at Goa's most famous beach stretch. Optional water sports (own cost).", "Baga Beach", "1 hr", "🏖️", 3);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "12:30", "Lunch Break (self-pay)", "Recommended: Martin's Corner or Infantaria Café in Calangute.", "Calangute", "1 hr", "🍽️", 4);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "14:00", "Old Goa — UNESCO Churches", "Basilica of Bom Jesus (mortal remains of St. Francis Xavier) + Se Cathedral.", "Old Goa", "1.5 hrs", "⛪", 5);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "16:00", "Panjim Church & Market", "Church of Our Lady of Immaculate Conception + Fontainhas Latin Quarter walk.", "Panjim", "1 hr", "🏛️", 6);
insertItinerary.run(uid("it"), P_GOA_TOUR_SIC, 0, "17:30", "Return to Hub", "AC coach drops travellers back at pickup hub by 18:00.", "Panaji Hub", "30 mins", "🏠", 7);

console.log(`  ✓  [TOUR/SIC] ${P_GOA_TOUR_SIC}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOA #3 — TRANSFER / AIRPORT_RAILWAY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_GOA_TRANSFER = "prod_goa_transfer_airport";
insertProduct.run(
  P_GOA_TRANSFER, P_GOA_TRANSFER, SUPPLIER_ID,
  "TRANSFER", "AIRPORT_RAILWAY",
  "Goa Airport (GOI) to North Goa Hotels – One Way Private Transfer",
  "Goa", "Goa", "Transfer",
  "Comfortable, metered private transfer from Dabolim Airport or Mopa Airport to your North Goa hotel. Choose your vehicle by group size.",
  "Start your Goa holiday stress-free with a pre-booked private airport transfer. Our professional drivers meet you at the arrival hall with a name board. Select the vehicle that fits your group and luggage — Sedan for couples, SUV for families, or Tempo Traveller for larger groups. Price includes toll charges and taxes.",
  1.5, 1, 700, 1200,
  4.9, 213, 0, 1, "NON_REFUNDABLE",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Meet & greet at arrivals with name board", "Professional licensed driver", "Toll charges included", "Child seats available on request"]),
  json(["Private exclusive vehicle", "Meet & greet service", "All toll charges & taxes", "Maximum 2 medium suitcases per vehicle"]),
  json(["Waiting beyond 90 minutes after landing", "Porterage at hotel", "Additional luggage (over limit)"]),
  json(["Provide your flight number during booking", "Driver waits up to 90 minutes after scheduled landing", "Contact number shared after booking confirmation"]),
  "INSTANT", 4, 1, 12,
  json(["English", "Hindi", "Konkani"])
);

// Vehicle options for GOA TRANSFER
const insertVehicle = db.prepare(`
  INSERT INTO product_vehicle_options (id, product_id, vehicle_type, label, max_pax, max_luggage, price_inr, is_recommended, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertVehicle.run(uid("veh"), P_GOA_TRANSFER, "SEDAN", "Sedan (up to 4 pax)", 4, 2, 700, 0, 1);
insertVehicle.run(uid("veh"), P_GOA_TRANSFER, "SUV", "Innova / SUV (up to 6 pax)", 6, 4, 1100, 1, 2);
insertVehicle.run(uid("veh"), P_GOA_TRANSFER, "TEMPO", "Tempo Traveller (up to 12 pax)", 12, 8, 2500, 0, 3);

console.log(`  ✓  [TRANSFER/AIRPORT_RAILWAY] ${P_GOA_TRANSFER}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOA #4 — ATTRACTION / TICKET_ONLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_GOA_ATTRACTION = "prod_goa_attraction_casino";
insertProduct.run(
  P_GOA_ATTRACTION, P_GOA_ATTRACTION, SUPPLIER_ID,
  "ATTRACTION", "TICKET_ONLY",
  "Goa Casino Royale – Entry Ticket (Unlimited Buffet & Gaming Chips)",
  "Goa", "Goa", "Entertainment",
  "India's floating casino experience — unlimited buffet, live entertainment and gaming chips included in entry. Cruise and play on the Mandovi River.",
  "Step aboard Casino Royale, Goa's most popular floating casino on the Mandovi River. Your entry ticket includes unlimited food and soft drinks at the lavish buffet, complimentary gaming chips to try your luck at roulette, poker and slots, and live music performances. Dress code: Smart casual (no shorts / sleeveless for men). Minimum age: 21 years with valid photo ID.",
  4, 1, 2500, 3500,
  4.6, 89, 1, 0, "NON_REFUNDABLE",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1511193311914-0346f16efe90?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1511193311914-0346f16efe90?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Unlimited live buffet dinner", "₹1,000 worth gaming chips included", "Live DJ and entertainment", "Complimentary soft drinks", "Mandovi River setting"]),
  json(["Entry to casino floor", "Unlimited buffet (veg + non-veg)", "₹1,000 gaming chips", "Soft drinks (non-alcoholic)", "Live entertainment"]),
  json(["Alcoholic beverages", "Transport to casino", "Winnings above chip value not guaranteed", "Personal expenses"]),
  json(["Minimum age: 21 years — valid government photo ID compulsory", "Smart casual dress code — no shorts or sleeveless T-shirts for men", "Entry not permitted for Goa residents", "Timings: 6:00 PM – 2:00 AM"]),
  "INSTANT", 2, 1, 500,
  json(["English", "Hindi"])
);

// Ticket tiers for GOA ATTRACTION
insertTicketTier.run(uid("tt"), P_GOA_ATTRACTION, "Adult (21+ yrs)", 21, null, 2500, 0, 1);
insertTicketTier.run(uid("tt"), P_GOA_ATTRACTION, "Couple Package", 21, null, 4500, 0, 2);

console.log(`  ✓  [ATTRACTION/TICKET_ONLY] ${P_GOA_ATTRACTION}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GOA #5 — EXPERIENCE / TICKET_SIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_GOA_EXP = "prod_goa_experience_scuba";
insertProduct.run(
  P_GOA_EXP, P_GOA_EXP, SUPPLIER_ID,
  "EXPERIENCE", "TICKET_SIC",
  "Goa Beginner Scuba Diving – 30 Min Dive + SIC Hotel Pickup",
  "Goa", "Goa", "Adventure",
  "Experience the thrill of your first scuba dive in Goa's clear Arabian Sea waters. Zero experience needed — PADI-certified instructors guide you every step of the way.",
  "No experience, no problem! This beginner scuba diving session in Goa is designed for complete first-timers. After a 20-minute safety briefing on the beach, you'll gear up and descend to a depth of 6–9 metres with your certified instructor. Explore the rocky reef, spot tropical fish and experience the underwater world. SIC pickup included from major hotel zones.",
  3, 1, 2999, 3999,
  4.9, 341, 1, 1, "FLEXIBLE_24H",
  1, "SIC", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["PADI-certified instructor 1:1 in water", "Dive to 6–9 metre depth", "Full scuba equipment included", "Underwater photos provided", "Beach briefing included"]),
  json(["Hotel pickup and drop (SIC)", "Full scuba equipment", "PADI-certified instructor", "Underwater photos (digital)", "30-minute dive"]),
  json(["Meals", "Alcoholic beverages", "Tips", "Video recording (available at extra cost)"]),
  json(["Minimum age: 10 years", "Cannot participate if pregnant or suffering from heart/ear conditions", "Non-swimmers can participate (instructors assist)", "Carry swimwear"]),
  "INSTANT", 24, 1, 12,
  json(["English", "Hindi", "Konkani"])
);

insertTicketTier.run(uid("tt"), P_GOA_EXP, "Adult (10+ yrs)", 10, null, 2999, 0, 1);
insertTicketTier.run(uid("tt"), P_GOA_EXP, "Child (10–15 yrs)", 10, 15, 2499, 0, 2);

insertSicHub.run(uid("hub"), P_GOA_EXP, "Panaji Hotel Zone", "Panaji City Center pickup zone", 15.4989, 73.8278, "09:00", 12, 1);
insertSicHub.run(uid("hub"), P_GOA_EXP, "Calangute–Baga Zone", "Calangute / Baga Beach hotel pickup", 15.5437, 73.7553, "09:30", 12, 2);

insertItinerary.run(uid("it"), P_GOA_EXP, 0, "09:00", "Hotel Pickup", "Shared van picks up from your hotel zone.", null, "30 mins", "🚐", 1);
insertItinerary.run(uid("it"), P_GOA_EXP, 0, "09:30", "Arrive at Dive Centre", "Welcome briefing, fill health form, get fitted for equipment.", "Baga Dive Centre", "20 mins", "🏊", 2);
insertItinerary.run(uid("it"), P_GOA_EXP, 0, "10:00", "Beach Safety Briefing", "PADI instructor explains breathing, hand signals, and buoyancy basics.", "Baga Beach", "20 mins", "📋", 3);
insertItinerary.run(uid("it"), P_GOA_EXP, 0, "10:30", "Your Scuba Dive!", "Wade into the water and descend to 6–9 metres. See the reef and tropical fish.", "Arabian Sea", "30 mins", "🤿", 4);
insertItinerary.run(uid("it"), P_GOA_EXP, 0, "11:15", "Photos & Certificate", "Get your digital underwater photos. Receive a beginner dive certificate.", "Dive Centre", "15 mins", "📸", 5);
insertItinerary.run(uid("it"), P_GOA_EXP, 0, "11:45", "Return Drop", "Shared van drops you back to your hotel zone.", null, "30 mins", "🏠", 6);

console.log(`  ✓  [EXPERIENCE/TICKET_SIC] ${P_GOA_EXP}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BANGKOK #6 — PACKAGE / WITHOUT_HOTEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_BKK_PKG = "prod_bkk_package_nohotel";
insertProduct.run(
  P_BKK_PKG, P_BKK_PKG, SUPPLIER_ID,
  "PACKAGE", "WITHOUT_HOTEL",
  "4D Bangkok City Explorer – Sightseeing & Transport (Hotel Not Included)",
  "Bangkok", "Thailand", "Cultural",
  "Cover Bangkok's greatest hits — Grand Palace, Floating Market, Wat Arun, Safari World and Chatuchak Market — with all transport arranged. Arrange your own hotel.",
  "Perfect for independent travellers who already have their accommodation sorted. This 4-day Bangkok package covers all transportation, guided sightseeing and entry tickets across the city's must-see destinations. From the glittering Grand Palace to the famous floating markets and the world-class Safari World, this package does everything except book your hotel.",
  36, 4, 18500, 24000,
  4.7, 62, 0, 1, "FLEXIBLE_48H",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1506665531195-3566af2b4dfa?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Grand Palace & Emerald Buddha Temple", "Floating Market boat ride", "Wat Arun temple at sunset", "Safari World full-day visit", "Chatuchak Weekend Market"]),
  json(["All inter-city transfers within Bangkok", "English-speaking local guide", "Entry tickets to all listed attractions", "Daily hotel pickup and drop"]),
  json(["Hotel accommodation", "International/domestic flights", "Meals", "Personal expenses", "Travel insurance"]),
  json(["Dress modestly for temple visits (cover shoulders and knees)", "Carry baht for shopping and tips", "Itinerary subject to change on national holidays"]),
  "INSTANT", 72, 1, 15,
  json(["English", "Hindi", "Thai"])
);

insertItinerary.run(uid("it"), P_BKK_PKG, 1, "Day 1", "Arrival & Grand Palace", "Hotel pickup and orientation. Visit the Grand Palace complex and Wat Phra Kaew (Emerald Buddha Temple). Evening cruise on the Chao Phraya River.", "Grand Palace area", "8 hrs", "🏯", 1);
insertItinerary.run(uid("it"), P_BKK_PKG, 2, "Day 2", "Floating Market & Wat Arun", "Morning speedboat ride to Damnoen Saduak Floating Market. Boat ride to Wat Arun (Temple of Dawn). Evening Chinatown street food walk (Yaowarat Road).", "Damnoen Saduak, Wat Arun", "10 hrs", "🛶", 2);
insertItinerary.run(uid("it"), P_BKK_PKG, 3, "Day 3", "Safari World Full Day", "Full day at Safari World — drive-through Safari Park + Marine Park shows (dolphin, bird, orangutan, stunt shows). Lunch at Safari World included.", "Safari World, Bangkok", "9 hrs", "🦁", 3);
insertItinerary.run(uid("it"), P_BKK_PKG, 4, "Day 4", "Chatuchak Market & Departure", "Morning shopping at Chatuchak Weekend Market (largest market in Asia — 15,000 stalls). Afternoon free time. Transfer to airport / hotel.", "Chatuchak", "5 hrs", "🛍️", 4);

console.log(`  ✓  [PACKAGE/WITHOUT_HOTEL] ${P_BKK_PKG}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BANGKOK #7 — TOUR / PRIVATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_BKK_TOUR_PVT = "prod_bkk_tour_private";
insertProduct.run(
  P_BKK_TOUR_PVT, P_BKK_TOUR_PVT, SUPPLIER_ID,
  "TOUR", "PRIVATE",
  "Bangkok Temples & Markets City Tour – Private Vehicle",
  "Bangkok", "Thailand", "Cultural",
  "A private, fully customisable Bangkok city tour with your own AC vehicle and English-speaking guide. Perfect for families and groups who prefer their own pace.",
  "Explore Bangkok at your own pace on this private city tour. Your dedicated AC vehicle and English-speaking guide are exclusively yours for the day. Visit the Grand Palace, Wat Pho (Reclining Buddha), Wat Arun, Chinatown and the famous Khao San Road. Itinerary is flexible — your guide will happily adjust based on your interests.",
  8, 1, 3500, 5000,
  4.8, 97, 0, 1, "FLEXIBLE_24H",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1506665531195-3566af2b4dfa?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1506665531195-3566af2b4dfa?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Exclusively your private vehicle", "Flexible itinerary — visit at your pace", "Hotel pickup and drop included", "Skip the queues with guide priority"]),
  json(["Private AC vehicle (your group only)", "English-speaking certified guide", "Hotel pickup and drop", "Fuel and parking charges"]),
  json(["Entry tickets (paid at gate)", "Meals and beverages", "Tips", "Long-tail boat rides"]),
  json(["Dress code for temples: cover shoulders and knees", "Carry passport / hotel booking confirmation", "Additional stops available at extra cost"]),
  "INSTANT", 4, 1, 12,
  json(["English", "Hindi", "Thai"])
);

insertVehicle.run(uid("veh"), P_BKK_TOUR_PVT, "SEDAN", "Car / Sedan (up to 4 pax)", 4, 2, 3500, 0, 1);
insertVehicle.run(uid("veh"), P_BKK_TOUR_PVT, "SUV", "Van / MPV (up to 7 pax)", 7, 4, 5500, 1, 2);
insertVehicle.run(uid("veh"), P_BKK_TOUR_PVT, "TEMPO", "Mini Van (up to 12 pax)", 12, 6, 9000, 0, 3);

insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "09:00", "Hotel Pickup", "Guide and driver pick up from your hotel lobby.", null, "—", "🚗", 1);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "09:30", "Grand Palace & Emerald Buddha", "Explore the opulent Grand Palace complex and the revered Wat Phra Kaew.", "Grand Palace", "2 hrs", "🏯", 2);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "11:30", "Wat Pho — Reclining Buddha", "See the 46-metre gold reclining Buddha — one of Thailand's most sacred sites.", "Wat Pho", "1 hr", "🙏", 3);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "13:00", "Lunch Break (self-pay)", "Guide recommends local riverside restaurant.", null, "1 hr", "🍜", 4);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "14:00", "Wat Arun — Temple of Dawn", "Iconic riverside temple; best photos from the opposite bank at sunset.", "Wat Arun", "1 hr", "🌅", 5);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "15:30", "Chinatown (Yaowarat)", "Walk through Bangkok's vibrant Chinatown — gold shops, temples, street food.", "Yaowarat", "1.5 hrs", "🏮", 6);
insertItinerary.run(uid("it"), P_BKK_TOUR_PVT, 0, "17:30", "Drop at Hotel", "Return to your hotel by 18:00.", null, "—", "🏠", 7);

console.log(`  ✓  [TOUR/PRIVATE] ${P_BKK_TOUR_PVT}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BANGKOK #8 — TRANSFER / CITY_TO_CITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_BKK_TRANSFER = "prod_bkk_transfer_pattaya";
insertProduct.run(
  P_BKK_TRANSFER, P_BKK_TRANSFER, SUPPLIER_ID,
  "TRANSFER", "CITY_TO_CITY",
  "Bangkok to Pattaya – One Way Private Transfer",
  "Bangkok", "Thailand", "Transfer",
  "Comfortable private transfer from your Bangkok hotel to your Pattaya hotel. 2-hour journey on the highway. Multiple vehicle options.",
  "Skip the public bus and travel in comfort from Bangkok to Pattaya in your own private vehicle. Our professional drivers navigate the 150 km highway route and drop you directly at your Pattaya hotel. Journey time is approximately 2 hours. Choose your vehicle based on group size.",
  2, 1, 2800, 3500,
  4.9, 178, 0, 1, "NON_REFUNDABLE",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Direct hotel-to-hotel transfer", "Licensed professional driver", "2-hour express highway route", "Toll charges included"]),
  json(["Private exclusive vehicle", "Hotel-to-hotel service", "Toll charges included", "AC throughout"]),
  json(["Meals and beverages", "Waiting beyond 30 minutes at origin hotel", "Additional stops"]),
  json(["Provide hotel name and address at both ends during booking", "Driver contacts you 30 minutes before pickup", "Approximate travel time: 2 hours (traffic-dependent)"]),
  "INSTANT", 12, 1, 45,
  json(["English", "Thai"])
);

insertVehicle.run(uid("veh"), P_BKK_TRANSFER, "SEDAN", "Sedan (up to 4 pax)", 4, 2, 2800, 0, 1);
insertVehicle.run(uid("veh"), P_BKK_TRANSFER, "SUV", "Van / MPV (up to 7 pax)", 7, 4, 4200, 1, 2);
insertVehicle.run(uid("veh"), P_BKK_TRANSFER, "TEMPO", "Mini Bus (up to 12 pax)", 12, 8, 8000, 0, 3);

console.log(`  ✓  [TRANSFER/CITY_TO_CITY] ${P_BKK_TRANSFER}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BANGKOK #9 — ATTRACTION / TICKET_SIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_BKK_ATTRACTION = "prod_bkk_attraction_safari";
insertProduct.run(
  P_BKK_ATTRACTION, P_BKK_ATTRACTION, SUPPLIER_ID,
  "ATTRACTION", "TICKET_SIC",
  "Safari World Bangkok – Entry Ticket + SIC Hotel Transfer",
  "Bangkok", "Thailand", "Nature",
  "Bangkok's biggest wildlife and marine park — drive through the Safari Park and watch spectacular live shows. Shared hotel pickup from Sukhumvit and Silom zones.",
  "Safari World Bangkok is a world-class open zoo and marine park spread over 480 acres. Your day includes a self-drive or coach tour through the Safari Park (lions, giraffes, zebras, bears) and admission to the Marine Park for eight live shows — the famous Orangutan Show, Dolphin Show, Stunt Show, Cowboy Show and more. Shared pickup included from Bangkok's major hotel zones.",
  9, 1, 2200, 3000,
  4.7, 512, 1, 1, "FLEXIBLE_24H",
  1, "SIC", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Drive-through Safari Park with 40+ species", "8 world-class live shows", "Dolphin & Orangutan shows", "Lunch at Safari World buffet", "SIC hotel pickup included"]),
  json(["Entry to Safari Park + Marine Park", "All 8 live shows", "SIC hotel pickup and drop", "Buffet lunch at Safari World"]),
  json(["Photography with animals", "Camel / elephant rides (extra)", "Personal shopping"]),
  json(["Wear comfortable walking shoes — lots of walking", "Arrive at hub 10 minutes before departure", "Children under 3 years: free"]),
  "INSTANT", 24, 1, 50,
  json(["English", "Hindi", "Thai"])
);

insertTicketTier.run(uid("tt"), P_BKK_ATTRACTION, "Adult (12+ yrs)", 12, null, 2200, 0, 1);
insertTicketTier.run(uid("tt"), P_BKK_ATTRACTION, "Child (3–11 yrs)", 3, 11, 1600, 0, 2);
insertTicketTier.run(uid("tt"), P_BKK_ATTRACTION, "Senior (60+ yrs)", 60, null, 1800, 0, 3);
insertTicketTier.run(uid("tt"), P_BKK_ATTRACTION, "Infant (0–2 yrs)", 0, 2, 0, 1, 4);

insertSicHub.run(uid("hub"), P_BKK_ATTRACTION, "Sukhumvit Hub", "Asok BTS Station, Sukhumvit Rd, Bangkok", 13.7366, 100.5601, "08:00", 40, 1);
insertSicHub.run(uid("hub"), P_BKK_ATTRACTION, "Silom Hub", "Silom Complex, Silom Rd, Bangkok", 13.7252, 100.5340, "08:30", 40, 2);

console.log(`  ✓  [ATTRACTION/TICKET_SIC] ${P_BKK_ATTRACTION}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BANGKOK #10 — EXPERIENCE / TICKET_SIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_BKK_EXP = "prod_bkk_experience_cooking";
insertProduct.run(
  P_BKK_EXP, P_BKK_EXP, SUPPLIER_ID,
  "EXPERIENCE", "TICKET_SIC",
  "Thai Cooking Class Bangkok – Half Day with SIC Hotel Pickup",
  "Bangkok", "Thailand", "Food",
  "Learn to cook 4 authentic Thai dishes from a local chef in a beautiful Thai house setting. SIC pickup from Sukhumvit and Khao San Road hotel zones.",
  "Discover the secrets of authentic Thai cuisine in this hands-on half-day cooking class. Start with a guided tour of Or Tor Kor fresh market to pick your ingredients, then move to a beautiful Thai house kitchen where you'll cook four dishes — Pad Thai, Tom Yum, Green Curry and Mango Sticky Rice — with guidance from your experienced local chef. Take home the recipes.",
  4, 1, 1800, 2500,
  4.9, 289, 1, 1, "FLEXIBLE_24H",
  1, "SIC", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1559563458-527698bf5295?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Cook 4 classic Thai dishes from scratch", "Market tour included", "Small group (max 12)", "Take home the recipe book", "Thai house kitchen setting"]),
  json(["SIC hotel pickup and drop", "Or Tor Kor Market tour", "All ingredients and equipment", "4 Thai dishes you cook and eat", "Recipe booklet", "Chef's apron as souvenir"]),
  json(["Meals outside class", "Personal shopping at market", "Additional beverages"]),
  json(["Vegetarian and vegan versions available on request", "Minimum age: 8 years", "Classes run rain or shine", "Nut allergy — inform at booking"]),
  "INSTANT", 24, 1, 12,
  json(["English", "Thai", "Hindi"])
);

insertTicketTier.run(uid("tt"), P_BKK_EXP, "Adult (16+ yrs)", 16, null, 1800, 0, 1);
insertTicketTier.run(uid("tt"), P_BKK_EXP, "Youth (8–15 yrs)", 8, 15, 1200, 0, 2);

insertSicHub.run(uid("hub"), P_BKK_EXP, "Sukhumvit Hub", "Nana BTS Station, Sukhumvit Soi 4, Bangkok", 13.7403, 100.5576, "09:00", 12, 1);
insertSicHub.run(uid("hub"), P_BKK_EXP, "Khao San Road Hub", "Khao San Road, Banglamphu, Bangkok", 13.7587, 100.4978, "09:30", 12, 2);

insertItinerary.run(uid("it"), P_BKK_EXP, 0, "09:00", "Hotel Pickup", "Shared van picks up from your hub.", null, "30 mins", "🚐", 1);
insertItinerary.run(uid("it"), P_BKK_EXP, 0, "09:30", "Or Tor Kor Market Tour", "Walk through Bangkok's finest fresh market with your chef-guide. See and taste exotic herbs, spices and Thai ingredients.", "Or Tor Kor Market", "45 mins", "🛒", 2);
insertItinerary.run(uid("it"), P_BKK_EXP, 0, "10:30", "Cooking Class Begins", "At the beautiful Thai house kitchen: cook Tom Yum soup, Pad Thai, Green Curry and Mango Sticky Rice.", "Thai House Kitchen", "2 hrs", "👨‍🍳", 3);
insertItinerary.run(uid("it"), P_BKK_EXP, 0, "12:30", "Eat Your Creations!", "Sit down to enjoy the 4 dishes you cooked. Recipes and apron handed over.", "Kitchen Dining", "30 mins", "🍛", 4);
insertItinerary.run(uid("it"), P_BKK_EXP, 0, "13:30", "Return Drop", "Shared van drops to hotel zone.", null, "30 mins", "🏠", 5);

console.log(`  ✓  [EXPERIENCE/TICKET_SIC] ${P_BKK_EXP}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATTAYA #11 — TOUR / SIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_PTY_TOUR_SIC = "prod_pty_tour_coral_island";
insertProduct.run(
  P_PTY_TOUR_SIC, P_PTY_TOUR_SIC, SUPPLIER_ID,
  "TOUR", "SIC",
  "Pattaya Coral Island Day Trip by Speedboat (SIC)",
  "Pattaya", "Thailand", "Nature",
  "Zoom across the sea to Coral Island (Koh Larn) on a speedboat! Snorkelling, beach time and fresh seafood. Shared speedboat from Bali Hai Pier.",
  "Coral Island (Koh Larn) is Pattaya's top day trip — crystal-clear waters, white sandy beaches and excellent snorkelling just 45 minutes offshore by speedboat. Your shared speedboat departs from Bali Hai Pier and takes you to the island for a full day of beach fun. Entry ticket, snorkelling gear and a beach umbrella are included.",
  8, 1, 2500, 3200,
  4.8, 407, 1, 1, "FLEXIBLE_24H",
  1, "SIC", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["Speedboat return to Coral Island", "Snorkelling gear included", "Beach umbrella & chair", "Free time at 3 beaches", "Lifetime memory!"]),
  json(["Return speedboat from Bali Hai Pier", "Snorkelling mask and fins", "Beach umbrella and chair", "Life jacket"]),
  json(["Hotel transfer (optional add-on)", "Meals and beverages", "Motorised water sports (parasailing, jet ski)", "Locker rental"]),
  json(["Non-swimmers welcome — life jackets provided", "Coral Island beaches may be crowded Dec–Feb", "Carry sunscreen, cash for food and water sports"]),
  "INSTANT", 12, 1, 40,
  json(["English", "Hindi", "Thai"])
);

insertTicketTier.run(uid("tt"), P_PTY_TOUR_SIC, "Adult (12+ yrs)", 12, null, 2500, 0, 1);
insertTicketTier.run(uid("tt"), P_PTY_TOUR_SIC, "Child (3–11 yrs)", 3, 11, 1800, 0, 2);
insertTicketTier.run(uid("tt"), P_PTY_TOUR_SIC, "Infant (0–2 yrs)", 0, 2, 0, 1, 3);

insertSicHub.run(uid("hub"), P_PTY_TOUR_SIC, "Bali Hai Pier", "Bali Hai Pier, South Pattaya Road, Pattaya 20150", 12.9141, 100.8779, "08:00", 40, 1);

insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "08:00", "Depart from Bali Hai Pier", "Board the speedboat at Bali Hai Pier, South Pattaya.", "Bali Hai Pier", "—", "⛵", 1);
insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "08:45", "Arrive Coral Island (Koh Larn)", "Set up at Tawaen Beach — the main beach. Rent umbrella and chair.", "Tawaen Beach", "—", "🏖️", 2);
insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "09:00", "Snorkelling at Reef", "Snorkel around the coral reef with your included gear. Tropical fish and coral.", "Koh Larn Reef", "2 hrs", "🤿", 3);
insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "11:00", "Free Beach Time", "Swim, relax or try optional water sports — parasailing, banana boat, jet ski (own cost).", "Tawaen / Tien Beach", "3 hrs", "🌊", 4);
insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "14:00", "Lunch (self-pay)", "Fresh seafood on the island — grilled fish, prawns and Thai salads.", "Island Restaurants", "1 hr", "🦐", 5);
insertItinerary.run(uid("it"), P_PTY_TOUR_SIC, 0, "16:00", "Speedboat Return to Pattaya", "Return speedboat to Bali Hai Pier, Pattaya.", "Bali Hai Pier", "45 mins", "🏠", 6);

console.log(`  ✓  [TOUR/SIC] ${P_PTY_TOUR_SIC}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATTAYA #12 — ATTRACTION / TICKET_PRIVATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_PTY_ATTRACTION = "prod_pty_attraction_tiffanys";
insertProduct.run(
  P_PTY_ATTRACTION, P_PTY_ATTRACTION, SUPPLIER_ID,
  "ATTRACTION", "TICKET_PRIVATE",
  "Tiffany's Cabaret Show Pattaya – VIP Ticket + Private Hotel Transfer",
  "Pattaya", "Thailand", "Entertainment",
  "World-famous transgender cabaret show — dazzling costumes, live singing and theatrical performances. VIP ticket + private hotel pickup and drop included.",
  "Tiffany's Show in Pattaya is one of Asia's most celebrated cabaret shows, running since 1974. Watch 100+ performers in breathtaking costumes deliver a 70-minute spectacular of singing, dancing and theatrical sequences. Your VIP ticket includes the best-seated section, and the private transfer picks you up directly from your hotel and drops you after the show.",
  2.5, 1, 2200, 3000,
  4.8, 632, 1, 0, "NON_REFUNDABLE",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["World-famous cabaret show since 1974", "100+ performers in stunning costumes", "3 shows nightly (18:00, 19:30, 21:00)", "Private hotel transfer included", "Photo opportunity with performers after show"]),
  json(["VIP show ticket (best seating section)", "Private hotel pickup and drop", "Photo session with performers post-show"]),
  json(["Alcoholic and non-alcoholic drinks", "Dinner", "Gratitude tips for performers"]),
  json(["Show timings: 18:00, 19:30 and 21:00 — book the slot", "Minimum age: None (family-friendly content)", "Dress code: Smart casual", "Photography inside theatre: not permitted during show"]),
  "INSTANT", 4, 1, 200,
  json(["English", "Thai", "Hindi"])
);

insertTicketTier.run(uid("tt"), P_PTY_ATTRACTION, "VIP Seat (Front Section)", null, null, 2200, 0, 1);
insertTicketTier.run(uid("tt"), P_PTY_ATTRACTION, "Standard Seat", null, null, 1500, 0, 2);

insertVehicle.run(uid("veh"), P_PTY_ATTRACTION, "SEDAN", "Sedan (up to 4 pax) – Private Transfer", 4, 0, 1200, 1, 1);
insertVehicle.run(uid("veh"), P_PTY_ATTRACTION, "SUV", "MPV / Van (up to 7 pax) – Private Transfer", 7, 0, 1800, 0, 2);

console.log(`  ✓  [ATTRACTION/TICKET_PRIVATE] ${P_PTY_ATTRACTION}`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATTAYA #13 — EXPERIENCE / TICKET_ONLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const P_PTY_EXP = "prod_pty_experience_atv";
insertProduct.run(
  P_PTY_EXP, P_PTY_EXP, SUPPLIER_ID,
  "EXPERIENCE", "TICKET_ONLY",
  "Pattaya ATV Off-Road Adventure – 1 Hour Trail Ride",
  "Pattaya", "Thailand", "Adventure",
  "Ride a powerful ATV through Pattaya's jungle trails, rubber plantations and red dirt tracks. No experience needed — full briefing and safety gear included.",
  "Get off the beach and onto an ATV! This 1-hour trail ride takes you through Pattaya's lush jungle paths and red-earth off-road tracks on a powerful all-terrain vehicle. Suitable for complete beginners — our instructors give a thorough safety briefing and accompany the group on the trail. Solo riders and pillion riding available. Helmet, gloves and goggles provided.",
  2, 1, 1800, 2200,
  4.7, 188, 0, 1, "FLEXIBLE_24H",
  1, "PRIVATE", "PUBLISHED", 1,
  "https://images.unsplash.com/photo-1469866596782-b4e6c5e4e1c2?auto=format&fit=crop&w=1200&q=80",
  json([
    "https://images.unsplash.com/photo-1469866596782-b4e6c5e4e1c2?auto=format&fit=crop&w=1200&q=80",
  ]),
  json(["1 hour ATV trail through jungle", "Suitable for beginners", "Safety gear included", "Stunning nature scenery", "Group or solo riding options"]),
  json(["1-hour ATV trail ride", "Full safety briefing", "Helmet, gloves and goggles", "Water and towel on arrival"]),
  json(["Hotel transfer (arrange own transport — book a taxi / songthaew)", "Meals and beverages", "Camera / GoPro rental (available for hire)"]),
  json(["Minimum age: 10 years (must be able to reach pedals)", "Minimum height: 140 cm for solo rider", "Children under 10 ride as pillion with adult", "Sandals not permitted — closed shoes required", "Bring a change of clothes — trails can be muddy"]),
  "INSTANT", 4, 1, 30,
  json(["English", "Thai"])
);

insertTicketTier.run(uid("tt"), P_PTY_EXP, "Solo Rider – Adult (16+ yrs)", 16, null, 1800, 0, 1);
insertTicketTier.run(uid("tt"), P_PTY_EXP, "Solo Rider – Youth (10–15 yrs)", 10, 15, 1400, 0, 2);
insertTicketTier.run(uid("tt"), P_PTY_EXP, "Pillion (child with adult)", 3, 9, 600, 0, 3);

insertItinerary.run(uid("it"), P_PTY_EXP, 0, "On arrival", "Check-in & Safety Gear Fitting", "Fill registration form. Get fitted for helmet, gloves and goggles.", "ATV Base Camp", "15 mins", "⛑️", 1);
insertItinerary.run(uid("it"), P_PTY_EXP, 0, "15 min after check-in", "Safety & Riding Briefing", "Instructor demonstrates throttle, brakes, and turning. Practice lap in the parking area.", "Training Area", "15 mins", "📋", 2);
insertItinerary.run(uid("it"), P_PTY_EXP, 0, "Trail start", "1-Hour Jungle Trail Ride", "Follow the guide through jungle paths, river crossings (dry season), rubber tree plantations and red-earth tracks. Multiple photo stops.", "Pattaya Jungle Trail", "60 mins", "🏍️", 3);
insertItinerary.run(uid("it"), P_PTY_EXP, 0, "After trail", "Cool Down & Photos", "Wash down ATV. Photos with your muddy vehicle. Refreshments.", "Base Camp", "15 mins", "📸", 4);

console.log(`  ✓  [EXPERIENCE/TICKET_ONLY] ${P_PTY_EXP}`);

// ─── STEP 6 — UPDATE category_commissions ────────────────────────────────────
console.log("\n💰  Updating category commissions for 5 new product types …");
try {
  db.prepare("DELETE FROM category_commissions").run();
  const insertComm = db.prepare(`
    INSERT OR IGNORE INTO category_commissions (category_code, category_name, default_commission_rate)
    VALUES (?, ?, ?)
  `);
  insertComm.run("PACKAGE", "Holiday Packages (with or without hotel)", 12.0);
  insertComm.run("TOUR", "Day Tours & Excursions (SIC + Private)", 18.0);
  insertComm.run("TRANSFER", "Transfers (Airport, Intercity, City-to-City)", 15.0);
  insertComm.run("ATTRACTION", "Attractions & Ticket Entries", 18.0);
  insertComm.run("EXPERIENCE", "Experiences & Activities", 18.0);
  console.log("  ✓  Category commissions updated.\n");
} catch (e) {
  console.log(`  ⚠  category_commissions: ${e.message}\n`);
}

// ─── DONE ─────────────────────────────────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("✅  SEED COMPLETE!\n");
console.log("  Supplier : MultiTour Universal Pvt Ltd  (sup_multitour_universal)");
console.log("  Products : 13 demo products\n");
console.log("  GOA (5 products):");
console.log(`    ${P_GOA_PKG.padEnd(40)} PACKAGE / WITH_HOTEL`);
console.log(`    ${P_GOA_TOUR_SIC.padEnd(40)} TOUR / SIC`);
console.log(`    ${P_GOA_TRANSFER.padEnd(40)} TRANSFER / AIRPORT_RAILWAY`);
console.log(`    ${P_GOA_ATTRACTION.padEnd(40)} ATTRACTION / TICKET_ONLY`);
console.log(`    ${P_GOA_EXP.padEnd(40)} EXPERIENCE / TICKET_SIC`);
console.log("  BANGKOK (5 products):");
console.log(`    ${P_BKK_PKG.padEnd(40)} PACKAGE / WITHOUT_HOTEL`);
console.log(`    ${P_BKK_TOUR_PVT.padEnd(40)} TOUR / PRIVATE`);
console.log(`    ${P_BKK_TRANSFER.padEnd(40)} TRANSFER / CITY_TO_CITY`);
console.log(`    ${P_BKK_ATTRACTION.padEnd(40)} ATTRACTION / TICKET_SIC`);
console.log(`    ${P_BKK_EXP.padEnd(40)} EXPERIENCE / TICKET_SIC`);
console.log("  PATTAYA (3 products):");
console.log(`    ${P_PTY_TOUR_SIC.padEnd(40)} TOUR / SIC`);
console.log(`    ${P_PTY_ATTRACTION.padEnd(40)} ATTRACTION / TICKET_PRIVATE`);
console.log(`    ${P_PTY_EXP.padEnd(40)} EXPERIENCE / TICKET_ONLY`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
