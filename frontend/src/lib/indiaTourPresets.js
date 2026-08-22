/**
 * Curated Catalog of Popular Indian Travel Experiences & Tour Presets
 * Enables 1-click template auto-filling for suppliers across India.
 */

export const TOUR_CATEGORIES = [
  {
    id: "DAY_TOUR",
    name: "Sightseeing & Day Tours",
    desc: "City tours, monument visits, heritage walks, and day excursions (1–24 hours).",
    badge: "Most Popular",
    icon: "🏛️"
  },
  {
    id: "ACTIVITY_ADVENTURE",
    name: "Activities & Water Sports",
    desc: "Scuba diving, river rafting, desert safaris, boat rides, water sports with time slots.",
    badge: "High Demand",
    icon: "🤿"
  },
  {
    id: "MULTI_DAY",
    name: "Multi-Day Packages & Circuits",
    desc: "2 to 7+ day holiday circuits with day-wise itinerary, private vehicle, and hotel options.",
    badge: "High Value",
    icon: "🗺️"
  }
];

export const INDIA_TOUR_PRESETS = [
  // ── GOA EXPERIENCES ──
  {
    id: "goa-scuba-watersports",
    city: "Goa",
    state: "Goa",
    category: "ACTIVITY_ADVENTURE",
    title: "Goa Grand Island Scuba Diving with 5 Water Sports Combo & Lunch",
    shortDescription: "Experience thrilling boat ride to Grand Island with guided scuba diving, underwater HD video, parasailing, jet ski, banana ride, bumper ride, and buffet lunch.",
    durationHours: 8,
    priceInr: 2199,
    heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "Guided PADI/SSI certified Scuba Diving with instructor",
      "Free underwater HD video & photos",
      "5 Water Sports: Parasailing, Jet Ski, Banana Ride, Bumper Ride, Speed Boat",
      "Grand Island scenic boat cruise with dolphin spotting",
      "Buffet lunch (Veg & Non-Veg) with soft drinks & snacks",
      "Life jackets & all safety equipment included"
    ],
    exclusions: [
      "Personal swimwear / towels",
      "Hotel doorstep pickup (available on request)",
      "Alcoholic beverages"
    ],
    itinerary: [
      { order: 1, name: "Boat departure & scenic coastal cruise to Grand Island", duration: "08:00 AM - 09:30 AM" },
      { order: 2, name: "Scuba diving briefing & 15-min underwater dive session", duration: "10:00 AM - 01:00 PM" },
      { order: 3, name: "Buffet lunch & relaxation on the island", duration: "01:00 PM - 02:00 PM" },
      { order: 4, name: "Parasailing, Jet Ski, Banana & Bumper water sports at beach", duration: "02:30 PM - 04:30 PM" },
      { order: 5, name: "Return boat trip to jetty", duration: "05:00 PM" }
    ],
    pricingVariants: [
      { variantName: "Scuba Diving + 5 Water Sports Combo", basePrice: 2199, pricingModel: "PER_PERSON" },
      { variantName: "Scuba Diving Only with Video & Lunch", basePrice: 1499, pricingModel: "PER_PERSON" },
      { variantName: "5 Water Sports Only (No Scuba)", basePrice: 1299, pricingModel: "PER_PERSON" }
    ]
  },
  {
    id: "goa-south-sightseeing",
    city: "Goa",
    state: "Goa",
    category: "DAY_TOUR",
    title: "South Goa Heritage, Mangueshi Temple & Mandovi River Cruise Tour",
    shortDescription: "Explore the historic Old Goa churches (Basilica of Bom Jesus, Se Cathedral), ancient Mangueshi Temple, spice plantation with Goan lunch, and 1-hour sunset Mandovi cruise.",
    durationHours: 9,
    priceInr: 2800,
    heroImage: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "Private AC Sedan/SUV with professional chauffeur",
      "Doorstep hotel pickup & drop-off anywhere in North/South Goa",
      "1-Hour Mandovi River Sunset Cruise ticket",
      "Fuel, toll taxes, and parking fees included",
      "Complimentary bottled water"
    ],
    exclusions: [
      "Spice plantation entry ticket & buffet lunch (paid direct)",
      "Monument entry fees",
      "Driver tip (optional)"
    ],
    itinerary: [
      { order: 1, name: "Doorstep hotel pickup in AC cab", duration: "09:00 AM" },
      { order: 2, name: "Basilica of Bom Jesus & Se Cathedral (UNESCO Heritage)", duration: "10:00 AM - 11:30 AM" },
      { order: 3, name: "Mangueshi Temple & Shantadurga Temple visit", duration: "11:45 AM - 01:00 PM" },
      { order: 4, name: "Tropical Spice Plantation with traditional Goan buffet", duration: "01:30 PM - 03:30 PM" },
      { order: 5, name: "Miramar Beach & Dona Paula Viewpoint", duration: "04:00 PM - 05:30 PM" },
      { order: 6, name: "1-Hour Sunset Cruise on River Mandovi with Goan folk dance", duration: "06:00 PM - 07:00 PM" }
    ],
    pricingVariants: [
      { variantName: "Private Sedan (Dzire / Etios) · up to 4 guests", basePrice: 2800, pricingModel: "FIXED" },
      { variantName: "Private SUV (Ertiga / Marazzo) · up to 6 guests", basePrice: 3800, pricingModel: "FIXED" },
      { variantName: "Premium MUV (Innova Crysta) · up to 6 guests", basePrice: 4800, pricingModel: "FIXED" },
      { variantName: "Shared AC Coach (Per Seat)", basePrice: 499, pricingModel: "PER_PERSON" }
    ]
  },

  // ── AGRA & TAJ MAHAL ──
  {
    id: "agra-taj-sunrise-tour",
    city: "Agra",
    state: "Uttar Pradesh",
    category: "DAY_TOUR",
    title: "Taj Mahal Sunrise & Agra Fort Private Day Tour with Guide & AC Cab",
    shortDescription: "Witness the magnificent Taj Mahal at sunrise with an expert government-approved historian guide, followed by Agra Fort, Baby Taj, and lunch at a top Mughlai restaurant.",
    durationHours: 8,
    priceInr: 2200,
    heroImage: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1585135497273-1a86b09fe70e?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "Private AC vehicle with experienced chauffeur",
      "Doorstep pickup & drop-off at any Agra hotel or railway station",
      "Government-licensed English/Hindi-speaking historian tour guide",
      "Toll taxes, parking fees, and fuel",
      "Shoe covers & bottled mineral water"
    ],
    exclusions: [
      "Taj Mahal & Agra Fort entry monument tickets (skip-the-line tickets optional)",
      "Lunch / Meals",
      "Personal expenses and gratuities"
    ],
    itinerary: [
      { order: 1, name: "Early morning hotel/station pickup", duration: "05:30 AM" },
      { order: 2, name: "Taj Mahal sunrise guided tour & photo session", duration: "06:00 AM - 08:30 AM" },
      { order: 3, name: "Breakfast break at popular Agra cafe", duration: "08:45 AM - 09:45 AM" },
      { order: 4, name: "Agra Fort (Red Fort) comprehensive tour", duration: "10:00 AM - 12:00 PM" },
      { order: 5, name: "Tomb of I'timad-ud-Daulah (Baby Taj) & Mehtab Bagh sunset view", duration: "12:30 PM - 02:00 PM" }
    ],
    pricingVariants: [
      { variantName: "Private Sedan (Dzire / Etios) + Guide · up to 4 guests", basePrice: 2200, pricingModel: "FIXED" },
      { variantName: "Private SUV (Ertiga) + Guide · up to 6 guests", basePrice: 3000, pricingModel: "FIXED" },
      { variantName: "Innova Crysta + Guide · up to 6 guests", basePrice: 3800, pricingModel: "FIXED" }
    ]
  },

  // ── JAIPUR & RAJASTHAN ──
  {
    id: "jaipur-forts-full-day",
    city: "Jaipur",
    state: "Rajasthan",
    category: "DAY_TOUR",
    title: "Jaipur Full Day Private Tour: Amber Fort, Hawa Mahal, City Palace & Jal Mahal",
    shortDescription: "Comprehensive private tour of Pink City highlights: Amber Palace, Nahargarh Fort panoramic view, Jal Mahal photo stop, City Palace museum, and vibrant Johari Bazaar.",
    durationHours: 9,
    priceInr: 2400,
    heroImage: "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "Private AC vehicle with dedicated driver for 9 hours",
      "Doorstep pickup & drop-off anywhere in Jaipur",
      "Government-certified English/Hindi tour guide",
      "All parking, fuel, and toll taxes included"
    ],
    exclusions: [
      "Monument entry tickets & camera fees",
      "Lunch / Food items",
      "Elephant / Jeep ride at Amber Fort (optional direct payment)"
    ],
    itinerary: [
      { order: 1, name: "Hotel pickup & Hawa Mahal (Palace of Winds) photo stop", duration: "09:00 AM - 09:45 AM" },
      { order: 2, name: "Amber Fort & Palace guided tour", duration: "10:15 AM - 01:00 PM" },
      { order: 3, name: "Jal Mahal (Water Palace) scenic stop & lunch break", duration: "01:15 PM - 02:30 PM" },
      { order: 4, name: "City Palace & Jantar Mantar (UNESCO Observatory)", duration: "02:45 PM - 04:45 PM" },
      { order: 5, name: "Albert Hall Museum & Pink City Bazaars", duration: "05:00 PM - 06:00 PM" }
    ],
    pricingVariants: [
      { variantName: "Private Sedan (Dzire / Etios) · up to 4 guests", basePrice: 2400, pricingModel: "FIXED" },
      { variantName: "Private SUV (Ertiga / Marazzo) · up to 6 guests", basePrice: 3200, pricingModel: "FIXED" },
      { variantName: "Innova Crysta Class · up to 6 guests", basePrice: 4200, pricingModel: "FIXED" },
      { variantName: "Tempo Traveller (12-16 seater) for groups", basePrice: 6500, pricingModel: "FIXED" }
    ]
  },

  // ── RISHIKESH & ADVENTURE ──
  {
    id: "rishikesh-white-water-rafting",
    city: "Rishikesh",
    state: "Uttarakhand",
    category: "ACTIVITY_ADVENTURE",
    title: "Rishikesh 16 KM White Water River Rafting from Shivpuri with Cliff Jumping",
    shortDescription: "Conquer grade III & IV rapids of River Ganga (Roller Coaster, Golf Course, Club House) with certified river marshals, lifejackets, helmets, and cliff jump at Magpie point.",
    durationHours: 4,
    priceInr: 999,
    heroImage: "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1530866495561-507c9faab2ed?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "16 KM rafting stretch from Shivpuri to NIM Beach / Rishikesh",
      "Certified river guide & safety kayaker",
      "Grade III & IV rapid navigation",
      "Cliff jumping & bodysurfing in calm waters",
      "High-standard life jacket, paddle, and safety helmet"
    ],
    exclusions: [
      "Transport to Shivpuri starting point (shared cabs available)",
      "GoPro / waterproof video recording (₹500 optional direct)",
      "Personal clothing / dry bag"
    ],
    itinerary: [
      { order: 1, name: "Meeting at Tapovan rafting office & transport to Shivpuri", duration: "09:00 AM" },
      { order: 2, name: "Safety demonstration & gear fitting by river guides", duration: "09:45 AM" },
      { order: 3, name: "16 KM rafting session tackling 8 major rapids", duration: "10:15 AM - 12:30 PM" },
      { order: 4, name: "Cliff jumping & Magpie rock jump experience", duration: "12:30 PM" },
      { order: 5, name: "Arrival at NIM Beach Rishikesh & trip conclusion", duration: "01:00 PM" }
    ],
    pricingVariants: [
      { variantName: "16 KM Shivpuri to Rishikesh Rafting (Per Person)", basePrice: 999, pricingModel: "PER_PERSON" },
      { variantName: "24 KM Marine Drive to Rishikesh Long Run (Per Person)", basePrice: 1499, pricingModel: "PER_PERSON" },
      { variantName: "Private Boat for Group (Up to 8 Persons)", basePrice: 7200, pricingModel: "FIXED" }
    ]
  },

  // ── MULTI-DAY CIRCUITS ──
  {
    id: "golden-triangle-4d3n",
    city: "Delhi",
    state: "Delhi",
    category: "MULTI_DAY",
    title: "Golden Triangle Tour 4D/3N: Delhi, Agra Taj Mahal & Jaipur Private Package",
    shortDescription: "India's most iconic circuit covering New & Old Delhi monuments, sunrise at the Taj Mahal & Agra Fort, Fatehpur Sikri, and Amber Fort & palaces in Jaipur with dedicated private AC car.",
    durationDays: 4,
    durationNights: 3,
    priceInr: 14500,
    heroImage: "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80",
    images: [
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1585135497273-1a86b09fe70e?auto=format&fit=crop&w=800&q=80"
    ],
    inclusions: [
      "Dedicated AC vehicle & chauffeur for all 4 days (Delhi-Agra-Jaipur-Delhi)",
      "All intercity Fastag tolls, state border taxes, and fuel included",
      "Doorstep pickup in Delhi and drop-off in Delhi / Jaipur",
      "Local licensed tour guides in Delhi, Agra, and Jaipur",
      "Complimentary bottled water every day"
    ],
    exclusions: [
      "Hotel accommodations (available in Deluxe / Luxury package options)",
      "Monument entrance tickets",
      "Personal meals and laundry"
    ],
    itinerary: [
      { order: 1, name: "Day 1: Delhi Sightseeing (Qutub Minar, India Gate, Lotus Temple) & Drive to Agra" },
      { order: 2, name: "Day 2: Taj Mahal Sunrise, Agra Fort, Fatehpur Sikri & Drive to Jaipur" },
      { order: 3, name: "Day 3: Full Day Jaipur (Amber Fort, City Palace, Hawa Mahal, Bazaars)" },
      { order: 4, name: "Day 4: Nahargarh Fort, Albert Hall & Return Drive to Delhi Airport/Hotel" }
    ],
    pricingVariants: [
      { variantName: "Cab & Guide Only (Sedan · up to 4 guests)", basePrice: 14500, pricingModel: "FIXED" },
      { variantName: "Cab & Guide Only (Innova Crysta · up to 6 guests)", basePrice: 21000, pricingModel: "FIXED" },
      { variantName: "With 3-Star Hotels & Breakfast (Per Person, Min 2)", basePrice: 11999, pricingModel: "PER_PERSON" },
      { variantName: "With 4-Star Heritage Hotels & Breakfast (Per Person, Min 2)", basePrice: 16999, pricingModel: "PER_PERSON" }
    ]
  }
];

export function getPresetsForCityOrCategory(city = "", category = "") {
  return INDIA_TOUR_PRESETS.filter((item) => {
    const cityMatch = !city || item.city.toLowerCase() === city.toLowerCase();
    const catMatch = !category || item.category.toLowerCase() === category.toLowerCase();
    return cityMatch || catMatch;
  });
}
