import db from "../db.js";
import { hashPassword } from "../lib/passwords.js";
import logger from "../config/logger.js";

export function syncGoaSupplierAndProducts(database = db) {
  logger.info("Synchronizing Goa supplier products");

  const SUPPLIER_EMAIL = "multisolution33@gmail.com";
  const SUPPLIER_PASS = "Idea@2026";
  const SUPPLIER_ID = "sup_multisolution_goa";
  const USER_ID = "user_multisolution_goa";
  const COMPANY_NAME = "MultiSolution Goa Experiences & Luxury Fleet";
  const CONTACT_NAME = "Jitendra Maury";
  const PHONE = "+919876543210";
  const CITY = "Goa";
  const STATE = "Goa";

  // 1. Upsert Supplier & User Accounts
  try {
    const existingSup = database.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_EMAIL.toLowerCase());
    if (existingSup) {
      database.prepare(`
        UPDATE suppliers
        SET company_name = ?, contact_name = ?, phone = ?, city = ?, state = ?, kyb_status = 'APPROVED', is_verified = 1, commission_rate = 15.0
        WHERE id = ?
      `).run(COMPANY_NAME, CONTACT_NAME, PHONE, CITY, STATE, existingSup.id);
    } else {
      database.prepare(`
        INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, kyb_status, is_verified, commission_rate, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 1, 15.0, 4.9)
      `).run(SUPPLIER_ID, SUPPLIER_ID, COMPANY_NAME, CONTACT_NAME, SUPPLIER_EMAIL, PHONE, CITY, STATE);
    }

    const existingUser = database.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(SUPPLIER_EMAIL.toLowerCase());
    if (existingUser) {
      database.prepare(`
        UPDATE users
        SET password = ?, role = 'SUPPLIER', name = ?
        WHERE id = ?
      `).run(hashPassword(SUPPLIER_PASS), CONTACT_NAME, existingUser.id);
    } else {
      database.prepare(`
        INSERT INTO users (id, name, email, password, phone, role)
        VALUES (?, ?, ?, ?, ?, 'SUPPLIER')
      `).run(USER_ID, CONTACT_NAME, SUPPLIER_EMAIL, hashPassword(SUPPLIER_PASS), PHONE);
    }
  } catch (err) {
    logger.error("Goa supplier account setup failed", { error: err });
  }

  const targetSupplierId = database.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(SUPPLIER_EMAIL.toLowerCase())?.id || SUPPLIER_ID;

// 2. Comprehensive 36 Goa Products Definition
const GOA_PRODUCTS = [
  // ── 1. SCUBA & WATER SPORTS ──
  {
    id: "goa-grand-island-scuba-5sports",
    title: "Goa Grand Island Scuba Diving with 5 Water Sports Combo & Lunch",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "Experience thrilling boat ride to Grand Island with guided scuba diving, underwater HD video, parasailing, jet ski, banana ride, bumper ride, and buffet lunch.",
    fullDesc: "Embark on the ultimate coastal adventure in Goa! Start with a scenic boat cruise to Grand Island where you will spot dolphins along the way. Dive beneath the Arabian Sea under the supervision of certified PADI/SSI dive instructors. Receive complimentary underwater HD photos and video. Follow up with a delicious Goan buffet lunch and 5 thrilling beach water sports: Parasailing with ocean dip, Jet Ski, Banana Ride, Bumper Ride, and Speed Boat ride.",
    durationHours: 8,
    priceInr: 2199,
    strikePriceInr: 3499,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["PADI certified Scuba Diving with instructor", "Free underwater HD video & photos", "5 Water Sports: Parasailing, Jet Ski, Banana, Bumper, Speed Boat", "Grand Island boat cruise with dolphin spotting", "Buffet lunch (Veg/Non-Veg) with soft drinks", "Life jackets & all safety equipment"],
    exclusions: ["Personal swimwear & towels", "Hotel doorstep pickup (available on request)", "Alcoholic beverages"],
    itinerary: [
      { order: 1, name: "Boat departure & scenic coastal cruise to Grand Island", duration: "08:00 AM - 09:30 AM" },
      { order: 2, name: "Scuba diving briefing & 15-min underwater dive session", duration: "10:00 AM - 01:00 PM" },
      { order: 3, name: "Buffet lunch & relaxation on the island", duration: "01:00 PM - 02:00 PM" },
      { order: 4, name: "Parasailing, Jet Ski, Banana & Bumper water sports at beach", duration: "02:30 PM - 04:30 PM" },
      { order: 5, name: "Return boat trip to jetty", duration: "05:00 PM" }
    ],
    pricing: [
      { variantName: "Scuba Diving + 5 Water Sports Combo", pricingModel: "PER_PERSON", basePrice: 2199, strikePrice: 3499 },
      { variantName: "Scuba Diving Only with Video & Lunch", pricingModel: "PER_PERSON", basePrice: 1499, strikePrice: 2299 },
      { variantName: "5 Water Sports Only (No Scuba)", pricingModel: "PER_PERSON", basePrice: 1299, strikePrice: 1999 }
    ]
  },
  {
    id: "goa-5-watersports-baga",
    title: "5-in-1 Adventure Water Sports Combo at Baga & Calangute Beach",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "High-octane water sports combo: Parasailing with sea dip, Jet Ski, Banana Ride, Bumper Tube Ride, and Speedboat Cruise at North Goa's top beach.",
    fullDesc: "Feel the rush with Goa's favorite beach water sports package on Calangute and Baga Beach. Fly high above the coastline with parasailing, rip through the waves on a powerful Yamaha Jet Ski, hold tight on the bouncy banana ride and bumper donut, and enjoy a thrilling speed boat spin.",
    durationHours: 3,
    priceInr: 1299,
    strikePriceInr: 1999,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Parasailing with safety harness & ocean dip", "Jet Ski ride with instructor", "Banana tube ride", "Bumper donut ride", "Speedboat spin", "Life jackets and certified lifeguards"],
    exclusions: ["Lockers & changing room charges", "GoPro video recordings (optional on-site)"],
    itinerary: [
      { order: 1, name: "Meeting at beach water sports station & safety briefing", duration: "10:00 AM" },
      { order: 2, name: "Parasailing flight over Arabian Sea", duration: "10:30 AM" },
      { order: 3, name: "Jet Ski, Banana, Bumper and Speedboat rides", duration: "11:00 AM - 01:00 PM" }
    ],
    pricing: [
      { variantName: "Standard 5 Water Sports Combo (Per Person)", pricingModel: "PER_PERSON", basePrice: 1299, strikePrice: 1999 },
      { variantName: "With GoPro HD Action Video Included", pricingModel: "PER_PERSON", basePrice: 1799, strikePrice: 2499 }
    ]
  },
  {
    id: "goa-dudhsagar-waterfall-safari",
    title: "Dudhsagar Waterfalls Jungle Jeep Safari with Spice Plantation & Lunch",
    productType: "DAY_TOUR",
    category: "Wildlife & Safari",
    shortDesc: "Thrilling 4x4 open jeep jungle safari through Bhagwan Mahavir Wildlife Sanctuary to India's 5th tallest waterfall, with natural pond swimming, spice plantation tour & buffet lunch.",
    fullDesc: "Visit the legendary 4-tiered 'Sea of Milk' Dudhsagar Waterfalls! Ride an open 4x4 Jeep through riverbeds and dense jungle of the Western Ghats. Swim in the freshwater natural pool under the cascading falls with life jackets. Afterward, visit a Sahakari Tropical Spice Plantation for a guided botanical walk, traditional welcome, and authentic Goan buffet lunch.",
    durationHours: 9,
    priceInr: 1799,
    strikePriceInr: 2599,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Shared AC transportation from North Goa hotels", "4x4 Open Jeep Safari through wildlife sanctuary", "Dudhsagar entry permits & lifejacket for waterfall swimming", "Spice plantation guided tour with herbal welcome tea", "Traditional Goan buffet lunch (Veg & Non-Veg)", "Elephant encounter & photo opportunity"],
    exclusions: ["Camera entry fees (forest dept)", "Driver tips"],
    itinerary: [
      { order: 1, name: "Hotel pickup from North Goa", duration: "06:00 AM - 07:00 AM" },
      { order: 2, name: "Arrival at Kulem base & switch to 4x4 jungle jeeps", duration: "08:30 AM" },
      { order: 3, name: "Dudhsagar Waterfall trek, swimming & relaxation", duration: "09:30 AM - 12:00 PM" },
      { order: 4, name: "Tropical Spice Plantation tour & Goan buffet lunch", duration: "01:30 PM - 03:30 PM" },
      { order: 5, name: "Old Goa Church quick stop & hotel drop-off", duration: "05:30 PM" }
    ],
    pricing: [
      { variantName: "Shared AC Coach + Jeep Safari + Lunch (Per Person)", pricingModel: "PER_PERSON", basePrice: 1799, strikePrice: 2599 },
      { variantName: "Private AC Cab + Jeep Safari + Lunch (Up to 4 Pax)", pricingModel: "FIXED", basePrice: 7999, strikePrice: 10999 }
    ]
  },
  {
    id: "goa-mandovi-sunset-cruise",
    title: "1-Hour Sunset Cruise on River Mandovi with Goan Folk Dance & DJ",
    productType: "DAY_TOUR",
    category: "Cruises",
    shortDesc: "Sail along the Mandovi River as the sun dips into the Arabian Sea. Enjoy traditional Goan folk performances (Fugdi, Corridinho), live DJ music, and panoramic river views.",
    fullDesc: "Catch the magical sunset over Panaji on this popular 1-hour Mandovi river cruise. The double-decker cruise vessel sails past the historic Reis Magos Fort, Adil Shah Palace, and Miramar Beach. Live cultural troupes perform colorful Goan Portuguese folk dances, followed by a high-energy Bollywood DJ party on the upper deck.",
    durationHours: 1.5,
    priceInr: 499,
    strikePriceInr: 799,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["1-Hour cruise ticket on River Mandovi", "Live Goan folk dance performances", "Live DJ party on the deck", "Panoramic views of Panaji city lights & Atal Setu bridge"],
    exclusions: ["Snacks and beverages (available at on-board bar counter)", "Hotel transfers"],
    itinerary: [
      { order: 1, name: "Boarding at Santa Monica Jetty, Panaji", duration: "05:30 PM" },
      { order: 2, name: "Sunset sailing towards Arabian Sea mouth & live cultural show", duration: "06:00 PM - 06:45 PM" },
      { order: 3, name: "DJ Bollywood dance deck & docking", duration: "06:45 PM - 07:00 PM" }
    ],
    pricing: [
      { variantName: "Sunset Cruise Ticket (Per Person)", pricingModel: "PER_PERSON", basePrice: 499, strikePrice: 799 },
      { variantName: "Sunset Cruise + Hotel Pickup/Drop (Per Person)", pricingModel: "PER_PERSON", basePrice: 999, strikePrice: 1499 }
    ]
  },
  {
    id: "goa-luxury-dinner-cruise",
    title: "Luxury Mandovi Dinner Cruise with Live Band, DJ, Buffet & Drinks",
    productType: "DAY_TOUR",
    category: "Cruises",
    shortDesc: "2.5-Hour premium evening cruise along River Mandovi with lavish multi-course buffet dinner, welcome drinks, live singer, DJ dance floor, and illuminated bridge views.",
    fullDesc: "Spend an unforgettable romantic or family evening aboard Goa's premier dining catamaran. Enjoy welcome drinks upon boarding, a 3-tier buffet dinner with Goan, Indian, and Continental specialties, dessert spread, live acoustic singer performing retro and contemporary melodies, followed by a vibrant DJ party on the starlit open-air deck.",
    durationHours: 3,
    priceInr: 1499,
    strikePriceInr: 2299,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"
    ],
    inclusions: ["2.5 Hours scenic night cruise on River Mandovi", "Lavish multi-course buffet dinner (Veg & Non-Veg)", "Welcome drink & 2 complimentary beverages", "Live acoustic singer & Bollywood DJ music", "Reserved dining table with river views"],
    exclusions: ["Additional premium liquor (available at bar)", "Hotel transfers (available on request)"],
    itinerary: [
      { order: 1, name: "Boarding at Panaji Jetty & Welcome Drink", duration: "08:00 PM" },
      { order: 2, name: "Scenic river cruise past illuminated Atal Setu bridge", duration: "08:30 PM - 09:30 PM" },
      { order: 3, name: "Buffet Dinner, Live Music & Open Air DJ Party", duration: "09:30 PM - 10:45 PM" },
      { order: 4, name: "Return docking at Panaji", duration: "11:00 PM" }
    ],
    pricing: [
      { variantName: "Adult Dinner Cruise Ticket", pricingModel: "PER_PERSON", basePrice: 1499, strikePrice: 2299 },
      { variantName: "Child Dinner Cruise Ticket (Age 4-10)", pricingModel: "PER_PERSON", basePrice: 899, strikePrice: 1299 },
      { variantName: "VIP Reserved Couple Table with Wine Bottle", pricingModel: "FIXED", basePrice: 4499, strikePrice: 5999 }
    ]
  },
  {
    id: "goa-south-heritage-temples-tour",
    title: "South Goa Heritage, Old Goa Churches, Spice Farm & Mandovi Tour",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Full-day private AC cab tour of South Goa: UNESCO World Heritage Basilica of Bom Jesus, Se Cathedral, ancient Mangueshi Temple, Sahakari Spice Farm with lunch, Miramar Beach & Dona Paula.",
    fullDesc: "Discover the rich history, spiritual landmarks, and tropical beauty of South Goa. Travel in a comfortable private AC cab with an experienced chauffeur. Visit the 400-year-old Basilica of Bom Jesus where the mortal remains of St. Francis Xavier are preserved, the grand Se Cathedral, Mangueshi Temple, spice plantation with buffet lunch, and end the day with Dona Paula viewpoint and Miramar Beach.",
    durationHours: 8,
    priceInr: 2799,
    strikePriceInr: 3999,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Private AC vehicle with dedicated driver for 8 hours", "Doorstep pickup & drop anywhere in North or South Goa", "All fuel, parking fees, and toll taxes included", "Bottled mineral water"],
    exclusions: ["Spice plantation entry & lunch ticket", "Driver tip"],
    itinerary: [
      { order: 1, name: "Hotel pickup in private AC cab", duration: "09:00 AM" },
      { order: 2, name: "Old Goa Churches (Basilica of Bom Jesus & Se Cathedral)", duration: "10:00 AM - 11:30 AM" },
      { order: 3, name: "Mangueshi Temple & Shantadurga Temple", duration: "11:45 AM - 01:00 PM" },
      { order: 4, name: "Spice Plantation tour & traditional Goan lunch", duration: "01:30 PM - 03:30 PM" },
      { order: 5, name: "Miramar Beach & Dona Paula Viewpoint", duration: "04:00 PM - 05:30 PM" },
      { order: 6, name: "Return hotel drop-off", duration: "06:00 PM" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · up to 4 pax", pricingModel: "FIXED", basePrice: 2799, strikePrice: 3999 },
      { variantName: "Private SUV (Ertiga) · up to 6 pax", pricingModel: "FIXED", basePrice: 3799, strikePrice: 4999 },
      { variantName: "Innova Crysta Luxury · up to 6 pax", pricingModel: "FIXED", basePrice: 4799, strikePrice: 5999 }
    ]
  },
  {
    id: "goa-north-beaches-forts-tour",
    title: "North Goa Beaches, Fort Aguada, Chapora & Anjuna Sunset Private Tour",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Private full-day AC cab tour covering Fort Aguada lighthouse, Sinquerim Beach, Calangute, Baga, famous Chapora 'Dil Chahta Hai' Fort, and Vagator / Anjuna sunset.",
    fullDesc: "Experience the vibrant spirit and iconic coastal sights of North Goa in your private AC cab. Explore 17th-century Portuguese Fort Aguada with its historic lighthouse and panoramic ocean views. Stop at Sinquerim, Calangute, and Baga beaches for beach shacks and shopping. Head to Chapora Fort overlooking Vagator Beach for dramatic sunset photos.",
    durationHours: 8,
    priceInr: 2499,
    strikePriceInr: 3499,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Private AC vehicle with driver for 8 hours (80 km)", "Hotel doorstep pickup & drop in North Goa", "All parking charges, fuel, and tolls"],
    exclusions: ["Personal food & drink expenses", "Entry ticket for Aguada Fort jail museum (₹50)"],
    itinerary: [
      { order: 1, name: "Hotel pickup", duration: "09:30 AM" },
      { order: 2, name: "Fort Aguada & Lighthouse exploration", duration: "10:00 AM - 11:30 AM" },
      { order: 3, name: "Sinquerim Beach & Calangute Bazaar walk", duration: "11:45 AM - 01:30 PM" },
      { order: 4, name: "Lunch at popular Baga Beach shack", duration: "01:30 PM - 03:00 PM" },
      { order: 5, name: "Chapora Fort & Vagator Beach cliff sunset", duration: "03:30 PM - 05:45 PM" },
      { order: 6, name: "Return hotel drop-off", duration: "06:30 PM" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · up to 4 pax", pricingModel: "FIXED", basePrice: 2499, strikePrice: 3499 },
      { variantName: "Private SUV (Ertiga) · up to 6 pax", pricingModel: "FIXED", basePrice: 3499, strikePrice: 4499 },
      { variantName: "Innova Crysta Luxury · up to 6 pax", pricingModel: "FIXED", basePrice: 4499, strikePrice: 5499 }
    ]
  },
  {
    id: "goa-fontainhas-walking-tour",
    title: "Fontainhas Latin Quarter Heritage Walking Tour & Bakery Tasting",
    productType: "DAY_TOUR",
    category: "Food & Culture",
    shortDesc: "Guided 2-hour walking tour through Panaji's vibrant Portuguese quarter: colorful colonial mansions, tiled nameplates, historic St. Sebastian Chapel, and 100-year-old traditional Goan bakery.",
    fullDesc: "Step back in time to 19th-century Portuguese Goa in the picturesque neighborhood of Fontainhas. Walk with an accredited local historian through narrow cobblestone lanes lined with pastel-colored yellow, blue, and terracotta heritage villas with wrought-iron balconies. Visit St. Sebastian Chapel, learn the stories of prominent Goan families, and savor freshly baked Bebinca and Goan patties at a century-old heritage bakery.",
    durationHours: 2,
    priceInr: 699,
    strikePriceInr: 999,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=1200&q=80"
    ],
    inclusions: ["Accredited local historian walking guide", "Traditional Goan bakery snack & Bebinca tasting", "Curated heritage photo walk stops"],
    exclusions: ["Personal hotel transfers", "Souvenir shopping"],
    itinerary: [
      { order: 1, name: "Meeting at Old Post Office / Panaji Church square", duration: "04:00 PM" },
      { order: 2, name: "Fontainhas colorful streets & architectural commentary", duration: "04:15 PM - 05:15 PM" },
      { order: 3, name: "St. Sebastian Chapel & Heritage Bakery tasting", duration: "05:15 PM - 06:00 PM" }
    ],
    pricing: [
      { variantName: "Standard Walking Tour with Tasting (Per Person)", pricingModel: "PER_PERSON", basePrice: 699, strikePrice: 999 },
      { variantName: "Private Group Walk (Up to 8 Persons)", pricingModel: "FIXED", basePrice: 4200, strikePrice: 5500 }
    ]
  },
  {
    id: "goa-sal-backwater-kayaking",
    title: "Sal Backwaters & Mangrove Forest Sunrise Kayaking with Guide",
    productType: "DAY_TOUR",
    category: "Adventure",
    shortDesc: "Peaceful 2-hour guided sea-kayaking expedition through the tranquil Sal River mangrove channels. Spot kingfishers, egrets, and mudskippers in Goa's pristine wetland sanctuary.",
    fullDesc: "Glide through the serene, glass-like waters of the Sal River backwaters during the cool morning hours. Navigate through lush green mangrove canopies where migratory birds feed and roost. High-standard tandem and single sit-on-top sea kayaks, buoyant life jackets, dry bags, and safety guide provided.",
    durationHours: 2.5,
    priceInr: 999,
    strikePriceInr: 1499,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80"
    ],
    inclusions: ["High quality sit-on-top kayak & lightweight paddle", "Certified wilderness kayaking instructor", "Life jackets & dry bags for phones/keys", "Bottled water & energetic snacks"],
    exclusions: ["Hotel transfers", "Swimwear / change of clothes"],
    itinerary: [
      { order: 1, name: "Arrival at Sal backwater launch point & paddling briefing", duration: "06:30 AM" },
      { order: 2, name: "Mangrove canopy kayaking & wildlife spotting", duration: "07:00 AM - 08:30 AM" },
      { order: 3, name: "Return to jetty & morning refreshments", duration: "08:45 AM - 09:00 AM" }
    ],
    pricing: [
      { variantName: "Sunrise Kayak Session (Per Person)", pricingModel: "PER_PERSON", basePrice: 999, strikePrice: 1499 },
      { variantName: "Sunset Kayak Session (Per Person)", pricingModel: "PER_PERSON", basePrice: 1099, strikePrice: 1599 }
    ]
  },
  {
    id: "goa-dolphin-bat-island-boat",
    title: "Bat Island Snorkeling, Dolphin Safari & Bottom Fishing Boat Trip",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "4-Hour coastal boat excursion to Bat Island: dolphin spotting, guided shallow-water snorkeling with colorful reef fish, bottom handline fishing, and beach BBQ snacks.",
    fullDesc: "Cruise along the scenic Mormugao coastline to secluded Bat Island. Keep your cameras ready as playful Indo-Pacific humpback dolphins leap around the boat. Anchor near the island for snorkeling in calm reef waters to see sergeant majors, parrotfish, and sea anemones. Try your hand at traditional bottom fishing with lines and bait.",
    durationHours: 4,
    priceInr: 1399,
    strikePriceInr: 1999,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Boat cruise to Bat Island with dolphin tracking", "Snorkeling equipment (mask, snorkel, life jacket)", "Handline fishing gear and bait", "Fresh fruits, chilled beer/soft drinks & BBQ snacks"],
    exclusions: ["Hotel pickup/drop-off", "Underwater photography (optional on boat)"],
    itinerary: [
      { order: 1, name: "Boat departure from jetty & dolphin spotting", duration: "08:30 AM - 09:30 AM" },
      { order: 2, name: "Snorkeling & fishing near Bat Island coral reefs", duration: "09:30 AM - 11:30 AM" },
      { order: 3, name: "Beach BBQ snacks & return cruise", duration: "11:30 AM - 12:30 PM" }
    ],
    pricing: [
      { variantName: "Bat Island Snorkeling & Dolphin Trip (Per Person)", pricingModel: "PER_PERSON", basePrice: 1399, strikePrice: 1999 }
    ]
  },
  {
    id: "goa-bungee-jumping-mayem",
    title: "55-Meter Lake Bungee Jumping in Goa (Jumpin Heights / Mayem Lake)",
    productType: "DAY_TOUR",
    category: "Adventure",
    shortDesc: "Take the plunge from a 55-meter cantilever platform over Mayem Lake with New Zealand jump masters, state-of-the-art safety gear, and 'I Did It' certificate.",
    fullDesc: "Experience India's premier Bungee jumping destination operated by ex-Army officers and New Zealand certified jump masters. Stand on the edge of the 55-meter platform overlooking the picturesque waters of Mayem Lake and take the leap of a lifetime. Follows strict Australian & New Zealand safety standards (AS/NZS 5848).",
    durationHours: 3,
    priceInr: 3499,
    strikePriceInr: 4499,
    bestseller: 1,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["1 Bungee Jump from 55-meter cantilever platform", "Professional safety briefing & equipment harness", "'Dare to Jump' official certificate & badge", "Trained international jump crew guidance"],
    exclusions: ["HD 4K Video recording package (₹800 on site)", "Transportation to Mayem Lake"],
    itinerary: [
      { order: 1, name: "Registration, weigh-in & medical check at jump zone", duration: "11:00 AM" },
      { order: 2, name: "Safety briefing & harness fitting by jump masters", duration: "11:30 AM" },
      { order: 3, name: "55m Bungee Jump & recovery onto lake raft", duration: "12:00 PM - 01:00 PM" }
    ],
    pricing: [
      { variantName: "Single 55M Bungee Jump Ticket", pricingModel: "PER_PERSON", basePrice: 3499, strikePrice: 4499 },
      { variantName: "Bungee Jump + 4K HD Video & Photos Combo", pricingModel: "PER_PERSON", basePrice: 4299, strikePrice: 5299 }
    ]
  },
  {
    id: "goa-private-yacht-charter",
    title: "Private Luxury Yacht Charter in Goa (2-Hour Mandovi & Sea Cruise)",
    productType: "DAY_TOUR",
    category: "Cruises",
    shortDesc: "Rent a private 33-foot luxury yacht for up to 8 guests. Includes AC lounge, sun deck, Bluetooth sound system, captain, fuel, soft drinks, and personalized route.",
    fullDesc: "Celebrate birthdays, anniversaries, or romantic sunsets in ultimate VIP style aboard your private yacht. Sail from Brittona / Panaji down the Mandovi River into the Arabian Sea with panoramic views of Aguada Fort and Miramar. Sunbathe on the front deck, play your favorite music on high-end speakers, and enjoy complimentary chilled refreshments.",
    durationHours: 2,
    priceInr: 9999,
    strikePriceInr: 14999,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Exclusive 2-hour private yacht rental for up to 8 guests", "Licensed yacht captain & hospitality crew", "Fuel, port permissions, and ice boxes", "Chilled soft drinks, juices, and light snacks", "Bluetooth surround sound system"],
    exclusions: ["Custom cake & flower decoration (available on request)", "Hard liquor (BYOB permitted)"],
    itinerary: [
      { order: 1, name: "VIP Boarding at Britona / Panaji Jetty", duration: "04:30 PM" },
      { order: 2, name: "Mandovi river & Arabian Sea sunset sailing", duration: "05:00 PM - 06:30 PM" }
    ],
    pricing: [
      { variantName: "2-Hour Private Yacht (Up to 8 Guests)", pricingModel: "FIXED", basePrice: 9999, strikePrice: 14999 },
      { variantName: "3-Hour Private Yacht with Sunset Champagne", pricingModel: "FIXED", basePrice: 14999, strikePrice: 19999 }
    ]
  },

  // ── 2. TRANSFERS (AIRPORTS & STATIONS) ──
  {
    id: "transfer-goa-mopa-north-goa",
    title: "MOPA Airport (GOX) to North Goa Hotels Private AC Cab Transfer",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Fixed fare private AC cab from Manohar International Airport (MOPA/GOX) to any hotel in North Goa (Calangute, Baga, Candolim, Anjuna, Morjim, Arambol). Fastag & flight delay tracking included.",
    fullDesc: "Book a hassle-free, direct private transfer from MOPA International Airport (GOX) to your doorstep in North Goa. Your courteous chauffeur tracks your flight arrival, meets you at the terminal with a digital nameboard, handles your luggage, and drives you straight to your resort via the new MOPA expressway with all Fastag tolls included.",
    durationHours: 1.2,
    priceInr: 1599,
    strikePriceInr: 2199,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab with chauffeur", "Doorstep drop-off at any hotel/resort in North Goa", "Flight delay tracking & 60 mins free waiting at terminal", "All Fastag highway tolls and parking charges included", "Assistance with luggage"],
    exclusions: ["Extra waiting beyond 60 minutes (₹150/hr)"],
    itinerary: [
      { order: 1, name: "Chauffeur meet & greet at MOPA Airport arrival gate with nameboard", duration: "Flight Arrival" },
      { order: 2, name: "Direct AC drive to your North Goa hotel / villa", duration: "45–60 Mins" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax / 3 Bags", pricingModel: "FIXED", basePrice: 1599, strikePrice: 2199 },
      { variantName: "Private SUV (Ertiga / Marazzo) · 6 Pax / 4 Bags", pricingModel: "FIXED", basePrice: 2199, strikePrice: 2899 },
      { variantName: "Innova Crysta Luxury Class · 6 Pax / 5 Bags", pricingModel: "FIXED", basePrice: 2899, strikePrice: 3599 },
      { variantName: "Tempo Traveller (12-16 Seater) · 16 Pax / 15 Bags", pricingModel: "FIXED", basePrice: 4899, strikePrice: 5999 }
    ]
  },
  {
    id: "transfer-goa-dabolim-north-goa",
    title: "Dabolim Airport (GOI) to North Goa Hotels Private AC Cab Transfer",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Reliable private AC cab transfer from Dabolim International Airport (GOI) to Calangute, Baga, Candolim, Panaji, Anjuna & Vagator. Free waiting & Fastag tolls included.",
    fullDesc: "Travel smoothly from Dabolim Airport (GOI) to any resort or residence across North Goa. Skip the long prepaid taxi queues. Your dedicated driver meets you outside arrival gate 1 with a name placard and transports your family comfortably in a clean AC vehicle.",
    durationHours: 1.2,
    priceInr: 1699,
    strikePriceInr: 2299,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab with driver", "Doorstep drop-off at any hotel in North Goa", "Flight tracking & 60 mins waiting at arrival gate", "All Fastag toll taxes and airport parking included"],
    exclusions: ["Extra waiting beyond 60 minutes"],
    itinerary: [
      { order: 1, name: "Terminal meet & greet at Dabolim Airport", duration: "Flight Arrival" },
      { order: 2, name: "Express drive over Zuari bridge to North Goa", duration: "50–65 Mins" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax / 3 Bags", pricingModel: "FIXED", basePrice: 1699, strikePrice: 2299 },
      { variantName: "Private SUV (Ertiga) · 6 Pax / 4 Bags", pricingModel: "FIXED", basePrice: 2299, strikePrice: 2999 },
      { variantName: "Innova Crysta Class · 6 Pax / 5 Bags", pricingModel: "FIXED", basePrice: 2999, strikePrice: 3799 }
    ]
  },
  {
    id: "transfer-goa-dabolim-south-goa",
    title: "Dabolim Airport (GOI) to South Goa Hotels (Colva, Benaulim, Cavelossim)",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Private door-to-door cab from Dabolim Airport (GOI) to South Goa resorts in Colva, Benaulim, Majorda, Varca, Cavelossim and Palolem.",
    fullDesc: "Quick and easy private transfer to your South Goa beach resort from Dabolim Airport. Avoid hassle and relax in an air-conditioned car with a professional local driver.",
    durationHours: 0.8,
    priceInr: 1299,
    strikePriceInr: 1899,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab", "Direct hotel drop-off in South Goa", "Flight tracking & free waiting time", "All toll and parking taxes"],
    exclusions: ["Extra waiting beyond 60 minutes"],
    itinerary: [
      { order: 1, name: "Chauffeur meet at Dabolim terminal", duration: "Flight Arrival" },
      { order: 2, name: "Smooth coastal drive to South Goa hotel", duration: "30–45 Mins" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax / 3 Bags", pricingModel: "FIXED", basePrice: 1299, strikePrice: 1899 },
      { variantName: "Private SUV (Ertiga) · 6 Pax / 4 Bags", pricingModel: "FIXED", basePrice: 1899, strikePrice: 2499 },
      { variantName: "Innova Crysta · 6 Pax / 5 Bags", pricingModel: "FIXED", basePrice: 2599, strikePrice: 3299 }
    ]
  },
  {
    id: "transfer-goa-madgaon-railway-station",
    title: "Madgaon (MAO) Railway Station to North & South Goa Private Transfer",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Private AC cab transfer from Madgaon Junction (MAO) railway station to your hotel or homestay in Goa with train delay tracking & platform exit pickup.",
    fullDesc: "Arrive at Goa's busiest railway hub, Madgaon Junction, with complete peace of mind. Your driver meets you at the platform exit gate, helps with heavy luggage, and drives you directly to your accommodation anywhere in Goa.",
    durationHours: 1,
    priceInr: 1499,
    strikePriceInr: 1999,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab", "Train delay monitoring & 45 mins free waiting", "Station parking & toll taxes included", "Luggage handling"],
    exclusions: ["Porter charges at station platform"],
    itinerary: [
      { order: 1, name: "Driver meet & greet at Madgaon Station exit gate", duration: "Train Arrival" },
      { order: 2, name: "Direct drive to destination hotel", duration: "45–60 Mins" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax", pricingModel: "FIXED", basePrice: 1499, strikePrice: 1999 },
      { variantName: "Private SUV (Ertiga) · 6 Pax", pricingModel: "FIXED", basePrice: 2199, strikePrice: 2799 },
      { variantName: "Innova Crysta · 6 Pax", pricingModel: "FIXED", basePrice: 2899, strikePrice: 3599 }
    ]
  },
  {
    id: "transfer-goa-thivim-railway-station",
    title: "Thivim (THVM) Railway Station to North Goa Beaches Private Transfer",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Fast private AC cab from Thivim Railway Station to Calangute, Baga, Candolim, Anjuna, Vagator & Morjim beaches.",
    fullDesc: "Thivim is the closest railway station to North Goa's top beaches. Book your private AC cab in advance and reach your beach resort in under 35 minutes.",
    durationHours: 0.7,
    priceInr: 1199,
    strikePriceInr: 1699,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab with chauffeur", "Doorstep hotel drop-off in North Goa", "Train delay tracking & parking fees"],
    exclusions: ["Extra waiting beyond 45 mins"],
    itinerary: [
      { order: 1, name: "Driver meet at Thivim Station parking", duration: "Train Arrival" },
      { order: 2, name: "Drive to North Goa beach hotel", duration: "30–35 Mins" }
    ],
    pricing: [
      { variantName: "Private Sedan · 4 Pax", pricingModel: "FIXED", basePrice: 1199, strikePrice: 1699 },
      { variantName: "Private SUV · 6 Pax", pricingModel: "FIXED", basePrice: 1699, strikePrice: 2199 },
      { variantName: "Innova Crysta · 6 Pax", pricingModel: "FIXED", basePrice: 2299, strikePrice: 2999 }
    ]
  },

  // ── 3. PACKAGES & MULTI-DAY CIRCUITS ──
  {
    id: "goa-3d2n-complete-holiday-package",
    title: "Goa 3D/2N Complete Holiday Package: Airport Cabs, North & South Sightseeing",
    productType: "MULTI_DAY_PACKAGE",
    category: "Multi-Day Packages",
    shortDesc: "Complete 3-Day Goa getaway package with private AC vehicle for all 3 days, Dabolim/MOPA airport transfers, North Goa beaches & forts tour, South Goa heritage tour, and Mandovi sunset cruise.",
    fullDesc: "Enjoy the perfect weekend vacation in Goa with all logistics handled seamlessly! Includes private airport pickup, full-day North Goa tour (Fort Aguada, Calangute, Baga, Chapora), full-day South Goa tour (Old Goa Churches, Mangueshi Temple, Spice Farm with lunch, Sunset Cruise), and timely airport drop-off on day 3.",
    durationHours: 72,
    priceInr: 8999,
    strikePriceInr: 12999,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Dedicated private AC vehicle with chauffeur for all 3 days", "Both Airport / Station pickup and return drop-off included", "Full Day North Goa sightseeing circuit", "Full Day South Goa heritage & spice tour", "1-Hour Mandovi River Sunset Cruise ticket", "All Fastag tolls, parking fees, and driver allowances"],
    exclusions: ["Hotel accommodation (available in hotel combo options)", "Monument entry fees & personal meals"],
    itinerary: [
      { order: 1, name: "Day 1: Airport Pickup & North Goa Beaches (Aguada, Baga, Chapora Fort)" },
      { order: 2, name: "Day 2: South Goa Heritage (Basilica of Bom Jesus, Spice Farm & Sunset Cruise)" },
      { order: 3, name: "Day 3: Shopping at Panaji / Anjuna & Timely Airport Drop-off" }
    ],
    packageItinerary: {
      totalDays: 3,
      totalNights: 2,
      startCity: "Goa",
      endCity: "Goa",
      vehicleCategory: "SEDAN",
      hasHotelOption: 1,
      dayWiseDetails: [
        { day: 1, title: "Day 1: Arrival & North Goa Beaches", description: "Airport pickup, Fort Aguada, Calangute, Baga beach shack lunch and Chapora Fort sunset." },
        { day: 2, title: "Day 2: South Goa Heritage & Sunset Cruise", description: "Old Goa UNESCO churches, Mangueshi Temple, Spice plantation tour with buffet lunch and 1-hour sunset cruise on River Mandovi." },
        { day: 3, title: "Day 3: Souvenirs & Airport Drop", description: "Panaji Latin Quarter walk, cashew shopping, and airport drop-off." }
      ]
    },
    pricing: [
      { variantName: "Cab Only (Sedan · up to 4 pax)", pricingModel: "FIXED", basePrice: 8999, strikePrice: 12999 },
      { variantName: "Cab Only (Innova Crysta · up to 6 pax)", pricingModel: "FIXED", basePrice: 13999, strikePrice: 17999 },
      { variantName: "With 3-Star Resort & Breakfast (Per Person, Min 2)", pricingModel: "PER_PERSON", basePrice: 7999, strikePrice: 10999 },
      { variantName: "With 4-Star Beach Resort & Breakfast (Per Person, Min 2)", pricingModel: "PER_PERSON", basePrice: 11999, strikePrice: 15999 }
    ]
  },
  {
    id: "goa-4d3n-beaches-adventure-circuit",
    title: "Goa 4D/3N Premium Explorer: Scuba Diving, Dudhsagar Safari & Private Cab",
    productType: "MULTI_DAY_PACKAGE",
    category: "Multi-Day Packages",
    shortDesc: "4-Day all-inclusive action itinerary: Grand Island Scuba diving with water sports combo, Dudhsagar Waterfall jungle jeep safari, North Goa sunset tour, and dedicated private car.",
    fullDesc: "The ultimate 4-day action holiday in Goa! Covers all top experiences: Day 1 Arrival & Beach Leisure, Day 2 Grand Island boat cruise with Scuba diving and 5 water sports combo, Day 3 Dudhsagar Waterfalls jungle safari and spice farm, Day 4 North Goa sightseeing and departure.",
    durationHours: 96,
    priceInr: 13999,
    strikePriceInr: 18999,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: ["Dedicated private AC car for 4 days with chauffeur", "Grand Island boat trip with Scuba diving & 5 water sports", "Dudhsagar 4x4 open jeep safari with spice farm lunch", "Both Airport pickup and drop-off", "All Fastag tolls and taxes"],
    exclusions: ["Hotel accommodation (available as combo add-on)"],
    itinerary: [
      { order: 1, name: "Day 1: Airport Pickup, Check-in & Vagator Sunset" },
      { order: 2, name: "Day 2: Grand Island Scuba Diving & 5 Water Sports Combo" },
      { order: 3, name: "Day 3: Dudhsagar Waterfalls Jeep Safari & Spice Plantation" },
      { order: 4, name: "Day 4: North Goa Forts, Souvenir Shopping & Airport Drop" }
    ],
    packageItinerary: {
      totalDays: 4,
      totalNights: 3,
      startCity: "Goa",
      endCity: "Goa",
      vehicleCategory: "SEDAN",
      hasHotelOption: 1,
      dayWiseDetails: [
        { day: 1, title: "Day 1: Arrival & Coastal Sunset", description: "Private airport pickup, resort check-in, and sunset at Vagator Beach." },
        { day: 2, title: "Day 2: Scuba Diving & Water Sports", description: "Grand Island boat cruise, underwater scuba diving with video, and 5 beach water sports." },
        { day: 3, title: "Day 3: Dudhsagar Waterfalls & Safari", description: "4x4 jungle jeep safari, waterfall swimming, spice plantation tour and Goan buffet lunch." },
        { day: 4, title: "Day 4: Heritage & Departure", description: "Fort Aguada, Panaji market shopping, and airport drop-off." }
      ]
    },
    pricing: [
      { variantName: "Cab & Activities Package (Per Person, Min 2)", pricingModel: "PER_PERSON", basePrice: 6999, strikePrice: 9499 },
      { variantName: "With 3-Star Hotel + Breakfast + Activities (Per Person, Min 2)", pricingModel: "PER_PERSON", basePrice: 11999, strikePrice: 15999 }
    ]
  },
  {
    id: "goa-south-secret-beaches-cabo",
    title: "South Goa Secret Beaches: Cabo De Rama Fort, Cola & Palolem Beach Tour",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Explore Goa's hidden gems: cliffside Portuguese Cabo De Rama Fort, unique freshwater lagoon at Cola Beach, Butterfly Beach boat ride, and serene Palolem Beach.",
    fullDesc: "Escape the crowds and discover the unspoiled tropical paradise of deep South Goa. Stand on the dramatic ocean cliffs of Cabo De Rama Fort where the river meets the sea. Relax at Cola Beach with its emerald freshwater lagoon nestled right against the golden sand beach, followed by the crescent-shaped Palolem Beach.",
    durationHours: 9,
    priceInr: 3199,
    strikePriceInr: 4299,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC cab with experienced driver for 9 hours", "Doorstep hotel pickup & drop anywhere in Goa", "All fuel, parking, and toll taxes"],
    exclusions: ["Lunch at Cola beach restaurant", "Boat ride to Butterfly beach (₹1000 optional)"],
    itinerary: [
      { order: 1, name: "Hotel pickup in private AC cab", duration: "08:30 AM" },
      { order: 2, name: "Cabo De Rama Fort clifftop panoramic views", duration: "10:30 AM - 12:00 PM" },
      { order: 3, name: "Cola Beach freshwater lagoon swim & lunch", duration: "12:30 PM - 03:00 PM" },
      { order: 4, name: "Palolem Beach crescent walk & sunset", duration: "03:30 PM - 05:45 PM" },
      { order: 5, name: "Return hotel drop-off", duration: "06:00 PM - 07:30 PM" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax", pricingModel: "FIXED", basePrice: 3199, strikePrice: 4299 },
      { variantName: "Private SUV (Ertiga) · 6 Pax", pricingModel: "FIXED", basePrice: 4199, strikePrice: 5299 }
    ]
  },
  {
    id: "goa-crocodile-bird-safari",
    title: "Crocodile & Bird Watching Safari in Zuari Mangrove Canal",
    productType: "DAY_TOUR",
    category: "Wildlife & Safari",
    shortDesc: "2.5-Hour guided boat trip through the Cumbarjua canal to spot mugger crocodiles basking in the sun, white-bellied sea eagles, kingfishers, and flying foxes.",
    fullDesc: "Cruise into the brackish mangrove backwaters of Cumbarjua canal connecting the Zuari and Mandovi rivers. This unique estuarine ecosystem is home to harmless wild mugger crocodiles adapted to saline water, as well as over 25 species of resident and migratory birds.",
    durationHours: 3,
    priceInr: 1199,
    strikePriceInr: 1699,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Guided boat cruise with naturalist guide", "Crocodile spotting in mangrove channels", "Birdwatching with binoculars", "Chilled refreshments & snacks"],
    exclusions: ["Hotel transfers"],
    itinerary: [
      { order: 1, name: "Boarding at Cortalim Jetty & lifejacket fitting", duration: "08:30 AM" },
      { order: 2, name: "Cumbarjua canal crocodile & wildlife boat safari", duration: "09:00 AM - 11:00 AM" },
      { order: 3, name: "Return docking & refreshments", duration: "11:30 AM" }
    ],
    pricing: [
      { variantName: "Crocodile Safari Ticket (Per Person)", pricingModel: "PER_PERSON", basePrice: 1199, strikePrice: 1699 }
    ]
  },
  {
    id: "goa-divar-island-ebike-tour",
    title: "Divar Island E-Bike Heritage & Paddy Field Guided Tour",
    productType: "DAY_TOUR",
    category: "Food & Culture",
    shortDesc: "Pedal electric bicycles through the peaceful, car-free island of Divar: ferry crossing, baroque Our Lady of Compassion church, ancient stepwells, and traditional feni tasting.",
    fullDesc: "Board a traditional river ferry with your premium electric bicycle and cross over to Divar Island. Explore centuries-old village roads surrounded by emerald paddy fields, sluice gates, and Portuguese villas. Visit the hilltop Piedade church with 360-degree views, and conclude with a local tasting of Goan cashew feni and sweets.",
    durationHours: 3,
    priceInr: 1499,
    strikePriceInr: 2199,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Premium electric cycle (E-Bike) & safety helmet", "Accredited local story leader", "River ferry tickets", "Local Goan feni & beverage tasting", "Bottled water"],
    exclusions: ["Hotel pickup/drop-off to ferry jetty"],
    itinerary: [
      { order: 1, name: "Meeting at Ribandar Ferry Jetty & E-Bike briefing", duration: "07:30 AM" },
      { order: 2, name: "Ferry crossing & island village cycling", duration: "08:00 AM - 10:00 AM" },
      { order: 3, name: "Hilltop church view, Feni tasting & return ferry", duration: "10:00 AM - 10:45 AM" }
    ],
    pricing: [
      { variantName: "Divar E-Bike Tour (Per Person)", pricingModel: "PER_PERSON", basePrice: 1499, strikePrice: 2199 }
    ]
  },
  {
    id: "goa-flyboarding-chopdem",
    title: "Hydro Flyboarding & Water Jetpack Adventure in Chapora River",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "Fly up to 30 feet above the water with a high-powered hydro flyboard powered by jet propulsion, with 1-on-1 certified instructor training & HD video.",
    fullDesc: "Experience the thrilling sensation of flying over water! Strap onto the hydro flyboard connected to a 250HP jet ski pump. Learn to balance, hover, and perform smooth turns above the calm waters of the Chapora River under direct instructor guidance.",
    durationHours: 1.5,
    priceInr: 2999,
    strikePriceInr: 3999,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["15-Minute hydro flyboarding session", "1-on-1 certified professional instructor", "Life jacket, neoprene safety helmet, and impact vest", "Safety speedboat escort"],
    exclusions: ["GoPro HD video package (₹500 optional on-site)"],
    itinerary: [
      { order: 1, name: "Safety briefing & balance technique demonstration", duration: "10 Mins" },
      { order: 2, name: "Flyboarding flight session in water", duration: "15–20 Mins" }
    ],
    pricing: [
      { variantName: "Single Flyboard Session (15 Mins)", pricingModel: "PER_PERSON", basePrice: 2999, strikePrice: 3999 },
      { variantName: "Flyboard + HD Action Video Combo", pricingModel: "PER_PERSON", basePrice: 3499, strikePrice: 4499 }
    ]
  },
  {
    id: "goa-casino-vip-night-transfer",
    title: "Goa Floating Casino VIP Roundtrip AC Cab Transfer with Waiting",
    productType: "TRANSFER",
    category: "Transfers",
    shortDesc: "Dedicated roundtrip private AC cab transfer from your North/South Goa resort to Panaji Floating Casino Jetties (Big Daddy, Deltin Royale, Casino Pride) with late-night return pickup.",
    fullDesc: "Enjoy a lavish night at Goa's famous offshore luxury casinos without worrying about late-night driving or taxi gouging. Your chauffeur drops you right at the Panaji casino jetty, waits during your gaming hours, and safely drives you back to your hotel whenever you're ready.",
    durationHours: 6,
    priceInr: 2299,
    strikePriceInr: 3199,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private roundtrip AC cab", "Hotel pickup & late-night return drop", "Up to 5 hours waiting time in Panaji", "All parking and toll taxes included"],
    exclusions: ["Casino entry ticket / chips (bought direct at jetty)"],
    itinerary: [
      { order: 1, name: "Evening hotel pickup in North or South Goa", duration: "08:00 PM" },
      { order: 2, name: "Drop at Panaji Casino Jetty (Big Daddy / Deltin Royale)", duration: "09:00 PM" },
      { order: 3, name: "Late-night return pickup and hotel drop", duration: "02:00 AM" }
    ],
    pricing: [
      { variantName: "Roundtrip Sedan (Dzire / Etios) · up to 4 pax", pricingModel: "FIXED", basePrice: 2299, strikePrice: 3199 },
      { variantName: "Roundtrip SUV (Ertiga) · up to 6 pax", pricingModel: "FIXED", basePrice: 3199, strikePrice: 4199 },
      { variantName: "Innova Crysta Luxury Class · up to 6 pax", pricingModel: "FIXED", basePrice: 4199, strikePrice: 5199 }
    ]
  },
  {
    id: "goa-nightlife-party-cab",
    title: "North Goa Nightlife Party Cab: Tito's Lane, Thalassa, Club Cabana",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Private AC car with chauffeur on standby for 6 hours to take your group across Goa's hottest night clubs, beach bars, and late-night party venues safely.",
    fullDesc: "Party safely with your friends in North Goa! Your dedicated driver is at your service from 9 PM to 3 AM to drive you between Baga (Tito's Lane, Cafe Mambos), Vagator (Thalassa, Raeeth), and Arpora (Club Cabana) with zero parking hassle or drink-and-drive worries.",
    durationHours: 6,
    priceInr: 2499,
    strikePriceInr: 3499,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC car with chauffeur for 6 hours (Night service)", "Multiple stops across North Goa party clubs", "All parking charges and tolls included"],
    exclusions: ["Club entry tickets and personal drinks"],
    itinerary: [
      { order: 1, name: "Night hotel pickup", duration: "09:00 PM" },
      { order: 2, name: "Transfers between selected North Goa beach clubs", duration: "09:30 PM - 02:30 AM" },
      { order: 3, name: "Safe return hotel drop-off", duration: "03:00 AM" }
    ],
    pricing: [
      { variantName: "Party Cab Sedan (Dzire / Etios) · 4 Pax", pricingModel: "FIXED", basePrice: 2499, strikePrice: 3499 },
      { variantName: "Party Cab SUV (Ertiga) · 6 Pax", pricingModel: "FIXED", basePrice: 3499, strikePrice: 4499 },
      { variantName: "Tempo Traveller (12 Seater) for party groups", pricingModel: "FIXED", basePrice: 5999, strikePrice: 7499 }
    ]
  },
  {
    id: "goa-romantic-beach-candlelight-dinner",
    title: "Romantic Private Candlelight Dinner on Candolim Beach Setup",
    productType: "DAY_TOUR",
    category: "Food & Culture",
    shortDesc: "Private beachside cabana setup with flickering candles, fairy lights, rose petal decoration, dedicated butler, 4-course chef dinner, and chilled mocktail/wine.",
    fullDesc: "Surprise your partner with an exquisite, private beachfront candlelit dinner in Candolim. Sit under a decorated bamboo cabana with fairy lights, listen to the gentle waves, and enjoy a curated 4-course menu with personal butler service.",
    durationHours: 3,
    priceInr: 4999,
    strikePriceInr: 6999,
    bestseller: 1,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private decorated beach cabana setup", "Rose petals, fairy lights and scented candles", "4-Course dinner for 2 guests (Soup, Starters, Mains, Dessert)", "Welcome drinks & personalized celebration cake", "Dedicated private butler service"],
    exclusions: ["Hotel transfers (optional add-on)"],
    itinerary: [
      { order: 1, name: "Arrival at Candolim beach venue & welcome drinks", duration: "07:30 PM" },
      { order: 2, name: "4-Course romantic dinner under stars", duration: "08:00 PM - 10:30 PM" }
    ],
    pricing: [
      { variantName: "Romantic Beach Dinner for Couple", pricingModel: "FIXED", basePrice: 4999, strikePrice: 6999 },
      { variantName: "With Private AC Cab Pickup & Drop Included", pricingModel: "FIXED", basePrice: 6499, strikePrice: 8499 }
    ]
  },
  {
    id: "goa-deep-sea-fishing-charter",
    title: "Deep Sea Fishing Expedition in Arabian Sea with Equipment & Bait",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "3-Hour deep sea fishing trip 5 to 10 nautical miles off the Goa coast with trolling rods, bait, fish finder, and experienced sea captain.",
    fullDesc: "Head into the deep waters of the Arabian Sea for an authentic sportfishing experience. Target Kingfish, Barracuda, Red Snapper, Grouper, and Tuna using top-quality trolling and spinning rods.",
    durationHours: 3.5,
    priceInr: 2499,
    strikePriceInr: 3499,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Deep sea fishing boat with GPS fish finder", "Penn / Shimano fishing rods, lures, and fresh bait", "Guidance from experienced sea captain", "Chilled beverages & fresh fruits on board"],
    exclusions: ["Hotel pickup"],
    itinerary: [
      { order: 1, name: "Departure from jetty & sailing into deep waters", duration: "07:00 AM" },
      { order: 2, name: "Trolling & bottom fishing at prime reef locations", duration: "07:45 AM - 10:00 AM" },
      { order: 3, name: "Return cruise to jetty with catch", duration: "10:30 AM" }
    ],
    pricing: [
      { variantName: "Deep Sea Fishing Ticket (Per Person)", pricingModel: "PER_PERSON", basePrice: 2499, strikePrice: 3499 },
      { variantName: "Private Boat for Fishing Group (Up to 6 Pax)", pricingModel: "FIXED", basePrice: 12999, strikePrice: 16999 }
    ]
  },
  {
    id: "goa-gokarna-murudeshwar-day-tour",
    title: "Goa to Gokarna & Murudeshwar Full Day Private Excursion",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Full-day interstate excursion from Goa to Karnataka: 123-foot towering Shiva statue at Murudeshwar Beach, ancient Mahabaleshwar Temple at Gokarna, and Om Beach.",
    fullDesc: "Journey south along the scenic coastal highway into Karnataka. Visit the colossal 123-foot Murudeshwar Shiva Statue set against the Arabian Sea and the 20-story Rajagopura tower. Afterward, visit the sacred town of Gokarna to explore the 4th-century Mahabaleshwar Temple and relax at Om Beach.",
    durationHours: 12,
    priceInr: 5999,
    strikePriceInr: 7999,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC car with driver for full day (350 km)", "Interstate Karnataka border entry tax included", "All highway tolls, fuel, and parking fees", "Doorstep Goa hotel pickup & return drop"],
    exclusions: ["Temple pooja / special darshan tickets", "Meals"],
    itinerary: [
      { order: 1, name: "Early morning Goa hotel pickup", duration: "06:00 AM" },
      { order: 2, name: "Drive to Murudeshwar & Shiva Temple visit", duration: "10:00 AM - 01:00 PM" },
      { order: 3, name: "Gokarna Mahabaleshwar Temple & Om Beach", duration: "02:30 PM - 05:00 PM" },
      { order: 4, name: "Return drive to Goa hotel", duration: "08:30 PM" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax", pricingModel: "FIXED", basePrice: 5999, strikePrice: 7999 },
      { variantName: "Private SUV (Ertiga) · 6 Pax", pricingModel: "FIXED", basePrice: 7499, strikePrice: 9499 },
      { variantName: "Innova Crysta Luxury · 6 Pax", pricingModel: "FIXED", basePrice: 9499, strikePrice: 11999 }
    ]
  },
  {
    id: "goa-parasailing-baga-calangute",
    title: "Solo & Tandem Parasailing with Arabian Sea Dip at Baga Beach",
    productType: "DAY_TOUR",
    category: "Beaches & Water Sports",
    shortDesc: "Soar 300 feet above the Goa shoreline with a parachute towed by high-speed winch boat, complete with refreshing mid-air sea dips and safety marshals.",
    fullDesc: "Enjoy a bird's-eye view of Goa's golden sands and swaying palms! Take off directly from the parasailing boat's hydraulic winch platform into the sky. Experience gentle controlled dipping into the sea before being safely reeled back onto the boat deck.",
    durationHours: 1,
    priceInr: 799,
    strikePriceInr: 1199,
    bestseller: 0,
    groupType: "SHARED",
    heroImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Parasailing flight (approx 3-5 mins in air)", "Ocean dip included", "Safety lifejacket and harness", "Certified boat captain and flight marshal"],
    exclusions: ["GoPro flight video (₹400 on boat)"],
    itinerary: [
      { order: 1, name: "Boat ride to parasailing point in Arabian Sea", duration: "15 Mins" },
      { order: 2, name: "Parasailing flight & ocean dip", duration: "10 Mins" }
    ],
    pricing: [
      { variantName: "Solo Parasailing Flight (Per Person)", pricingModel: "PER_PERSON", basePrice: 799, strikePrice: 1199 },
      { variantName: "Tandem Couple Parasailing (2 Persons)", pricingModel: "FIXED", basePrice: 1499, strikePrice: 2199 }
    ]
  },
  {
    id: "goa-tambdi-surla-temple-trek",
    title: "12th-Century Tambdi Surla Ancient Temple & Nature Trail Tour",
    productType: "DAY_TOUR",
    category: "Day Tours",
    shortDesc: "Visit Goa's oldest standing Kadamba temple built from black basalt stone deep in the Western Ghats jungle, with gentle river walk and nature trail.",
    fullDesc: "Discover the only surviving temple of the Kadamba dynasty in Goa, dating back to the 12th century. Set amidst dense subtropical rainforests near the Anmod Ghat, Mahadev Temple at Tambdi Surla features exquisite stone carvings of Lord Shiva, Vishnu, and Brahma.",
    durationHours: 7,
    priceInr: 2999,
    strikePriceInr: 3999,
    bestseller: 0,
    groupType: "PRIVATE",
    heroImage: "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80",
    images: ["https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1200&q=80"],
    inclusions: ["Private AC vehicle with chauffeur for 7 hours", "Hotel pickup & drop in Goa", "All parking and toll taxes included"],
    exclusions: ["Meals & snacks"],
    itinerary: [
      { order: 1, name: "Hotel pickup", duration: "08:30 AM" },
      { order: 2, name: "Scenic drive through Mollem National Park", duration: "09:00 AM - 10:30 AM" },
      { order: 3, name: "Tambdi Surla Temple exploration & nature walk", duration: "10:30 AM - 01:00 PM" },
      { order: 4, name: "Return hotel drop-off", duration: "03:30 PM" }
    ],
    pricing: [
      { variantName: "Private Sedan (Dzire / Etios) · 4 Pax", pricingModel: "FIXED", basePrice: 2999, strikePrice: 3999 },
      { variantName: "Private SUV (Ertiga) · 6 Pax", pricingModel: "FIXED", basePrice: 3999, strikePrice: 4999 }
    ]
  }
];

// Insert / Upsert all Goa products
  const insertProduct = database.prepare(`
    INSERT INTO products (
      id, product_code, supplier_id, product_type, title, city, state, category, short_desc, full_desc,
      duration_hours, price_inr, strike_price_inr, bestseller, free_cancellation, cancellation_policy,
      is_instant_booking, group_type, status, is_published, hero_image, images, inclusions, exclusions, itinerary
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, 'PUBLISHED', 1, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      supplier_id = excluded.supplier_id,
      title = excluded.title,
      city = excluded.city,
      state = excluded.state,
      category = excluded.category,
      short_desc = excluded.short_desc,
      full_desc = excluded.full_desc,
      duration_hours = excluded.duration_hours,
      price_inr = excluded.price_inr,
      strike_price_inr = excluded.strike_price_inr,
      bestseller = excluded.bestseller,
      status = 'PUBLISHED',
      is_published = 1,
      hero_image = excluded.hero_image,
      images = excluded.images,
      inclusions = excluded.inclusions,
      exclusions = excluded.exclusions,
      itinerary = excluded.itinerary
  `);

  const insertPricing = database.prepare(`
    INSERT INTO product_pricing (
      id, product_id, variant_name, pricing_model, base_price, strike_price, tax_percentage
    ) VALUES (?, ?, ?, ?, ?, ?, 5.0)
    ON CONFLICT(id) DO UPDATE SET
      base_price = excluded.base_price,
      strike_price = excluded.strike_price,
      pricing_model = excluded.pricing_model
  `);

  const insertTransferRoute = database.prepare(`
    INSERT INTO transfer_routes (
      id, product_id, route_type, origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng,
      distance_km, duration_mins, vehicle_category, max_passengers, max_luggage, free_waiting_mins, toll_included, state_tax_included
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, 1, 1
    )
    ON CONFLICT(id) DO UPDATE SET
      origin_name = excluded.origin_name,
      dest_name = excluded.dest_name
  `);

  const insertPackageItinerary = database.prepare(`
    INSERT INTO package_itineraries (
      id, product_id, total_days, total_nights, day_wise_details, has_hotel_option, hotel_categories, start_city, end_city, vehicle_category
    ) VALUES (
      ?, ?, ?, ?, ?, ?, '["3_STAR", "4_STAR"]', ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      total_days = excluded.total_days,
      total_nights = excluded.total_nights,
      day_wise_details = excluded.day_wise_details
  `);

  const runMigration = database.transaction(() => {
    let count = 0;
    for (const p of GOA_PRODUCTS) {
      insertProduct.run(
        p.id,
        p.id,
        targetSupplierId,
        p.productType,
        p.title,
        CITY,
        STATE,
        p.category,
        p.shortDesc,
        p.fullDesc,
        p.durationHours,
        p.priceInr,
        p.strikePriceInr || Math.round(p.priceInr * 1.35),
        p.bestseller || 0,
        1,
        "MODERATE_48H",
        1,
        p.groupType || "PRIVATE",
        p.heroImage,
        JSON.stringify(p.images || [p.heroImage]),
        JSON.stringify(p.inclusions || []),
        JSON.stringify(p.exclusions || []),
        JSON.stringify(p.itinerary || [])
      );

      // Pricing variants
      if (Array.isArray(p.pricing)) {
        p.pricing.forEach((pv, idx) => {
          insertPricing.run(
            `price_${p.id}_${idx + 1}`,
            p.id,
            pv.variantName,
            pv.pricingModel || "PER_PERSON",
            pv.basePrice,
            pv.strikePrice || Math.round(pv.basePrice * 1.3)
          );
        });
      }

      // Transfer routes
      if (p.productType === "TRANSFER") {
        const isMopa = p.id.includes("mopa");
        const isDabolim = p.id.includes("dabolim");
        const isThivim = p.id.includes("thivim");

        insertTransferRoute.run(
          `route_${p.id}`,
          p.id,
          "AIRPORT_PICKUP",
          isMopa ? "MOPA Airport (GOX)" : isDabolim ? "Dabolim Airport (GOI)" : isThivim ? "Thivim Railway Station (THVM)" : "Madgaon Railway Station (MAO)",
          isMopa ? 15.7533 : isDabolim ? 15.3808 : isThivim ? 15.6200 : 15.2740,
          isMopa ? 73.8658 : isDabolim ? 73.8313 : isThivim ? 73.8400 : 73.9780,
          p.id.includes("south") ? "South Goa Hotels (Colva, Benaulim, Cavelossim)" : "North Goa Hotels (Calangute, Baga, Candolim, Anjuna)",
          15.5439,
          73.7553,
          35.0,
          50,
          "SEDAN",
          4,
          3,
          60
        );
      }

      // Multi-day packages
      if (p.productType === "MULTI_DAY_PACKAGE" && p.packageItinerary) {
        insertPackageItinerary.run(
          `pkg_${p.id}`,
          p.id,
          p.packageItinerary.totalDays,
          p.packageItinerary.totalNights,
          JSON.stringify(p.packageItinerary.dayWiseDetails || []),
          p.packageItinerary.hasHotelOption || 1,
          p.packageItinerary.startCity || "Goa",
          p.packageItinerary.endCity || "Goa",
          p.packageItinerary.vehicleCategory || "SEDAN"
        );
      }

      count++;
    }
    logger.info("Goa supplier products synchronized", { productCount: count });
    return count;
  });

  return runMigration();
}

if (process.argv[1] && process.argv[1].endsWith("seedGoaSupplierProducts.js")) {
  syncGoaSupplierAndProducts();
}
