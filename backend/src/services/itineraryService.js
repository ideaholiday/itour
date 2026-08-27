import crypto from "crypto";

export const CURATED_CIRCUIT_TEMPLATES = [
  {
    id: "template_golden_triangle",
    isTemplate: true,
    title: "Golden Triangle Heritage Circuit",
    subtitle: "Delhi • Agra • Jaipur in 4 Days",
    destination: "Delhi, Agra & Jaipur",
    region: "North India",
    daysCount: 4,
    heroImage: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=1200&auto=format&fit=crop&q=80",
    tags: ["Heritage", "Monuments", "Culture", "Best for First Timers"],
    description: "The quintessential Indian journey spanning the historic capital of Delhi, the wonder of the Taj Mahal in Agra, and the royal pink forts of Jaipur.",
    estimatedBudgetInr: 12500,
    items: [
      {
        dayNumber: 1,
        timeSlot: "MORNING",
        title: "Old Delhi Heritage & Spice Market Rickshaw Trail",
        location: "Delhi",
        notes: "Explore Jama Masjid, Asia's largest spice market at Khari Baoli, and taste authentic Chandni Chowk street food.",
        durationHours: 3.5,
        priceInr: 1200,
        type: "TOUR",
        productId: "prod_dt_del_1",
      },
      {
        dayNumber: 1,
        timeSlot: "AFTERNOON",
        title: "Qutub Minar & Humayun's Tomb Mughal Architecture Tour",
        location: "Delhi",
        notes: "Visit the UNESCO World Heritage monuments showcasing red sandstone and marble craftsmanship.",
        durationHours: 3.0,
        priceInr: 1500,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Private AC Express Transfer: Delhi to Agra via Yamuna Expressway",
        location: "Delhi to Agra",
        notes: "Comfortable pickup from Delhi hotel, smooth 3.5-hour highway drive directly to your Agra stay.",
        durationHours: 3.5,
        priceInr: 2800,
        type: "TRANSFER",
        productId: "prod_tr_del_agr",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Skip-the-Line Taj Mahal Sunset Guided Tour & Agra Fort",
        location: "Agra",
        notes: "Witness the marble changes hue at golden hour with an authorized historian guide.",
        durationHours: 4.0,
        priceInr: 1800,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Fatehpur Sikri Ghost City Excursion & Scenic Drive to Jaipur",
        location: "Agra to Jaipur",
        notes: "En-route stop at Emperor Akbar's abandoned red sandstone imperial capital and Abhaneri stepwell.",
        durationHours: 5.5,
        priceInr: 3200,
        type: "TRANSFER",
      },
      {
        dayNumber: 3,
        timeSlot: "NIGHT",
        title: "Chokhi Dhani Ethnic Rajasthani Village & Cultural Feast",
        location: "Jaipur",
        notes: "Traditional Rajasthani thali, folk dances, puppet shows, and fire performers under the desert stars.",
        durationHours: 3.5,
        priceInr: 1400,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 4,
        timeSlot: "MORNING",
        title: "Amber Fort Royal Jeep Ascent & Jal Mahal Photo Stop",
        location: "Jaipur",
        notes: "Explore Sheesh Mahal (Mirror Palace) and hilltop battlements overlooking Maota Lake.",
        durationHours: 3.5,
        priceInr: 1600,
        type: "TOUR",
      },
      {
        dayNumber: 4,
        timeSlot: "AFTERNOON",
        title: "Hawa Mahal, City Palace Museum & Jantar Mantar Observatory",
        location: "Jaipur",
        notes: "Explore the Palace of Winds, royal courtyards, and astronomical stone dials in the Old Pink City.",
        durationHours: 3.0,
        priceInr: 1400,
        type: "TOUR",
      },
    ],
  },
  {
    id: "template_kerala_backwaters",
    isTemplate: true,
    title: "Kerala Backwaters & Mist-Clad Munnar Trails",
    subtitle: "Kochi • Munnar • Alleppey in 5 Days",
    destination: "Kochi, Munnar & Alleppey",
    region: "South India",
    daysCount: 5,
    heroImage: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=1200&auto=format&fit=crop&q=80",
    tags: ["Nature", "Backwaters", "Tea Gardens", "Ayurveda & Relaxation"],
    description: "Immerse in God's Own Country: colonial Fort Kochi streets, emerald tea rolling hills in Munnar, and private houseboat glides in Alleppey.",
    estimatedBudgetInr: 16800,
    items: [
      {
        dayNumber: 1,
        timeSlot: "AFTERNOON",
        title: "Fort Kochi Colonial Heritage & Chinese Fishing Nets Walk",
        location: "Kochi",
        notes: "Visit St. Francis Church, Mattancherry Dutch Palace, and watch iconic 14th-century cantilevered fishing nets.",
        durationHours: 3.0,
        priceInr: 1400,
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Live Kathakali Classical Dance & Kalaripayattu Martial Arts",
        location: "Kochi",
        notes: "Watch the intricate facial makeup process followed by dramatic classical storytelling.",
        durationHours: 2.0,
        priceInr: 800,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Private Scenic Mountain Transfer: Kochi to Munnar with Waterfalls",
        location: "Kochi to Munnar",
        notes: "Scenic climb through Western Ghats with photo stops at Cheeyappara and Valara waterfalls.",
        durationHours: 4.0,
        priceInr: 3400,
        type: "TRANSFER",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Tea Museum & Mattupetty Dam Speedboating",
        location: "Munnar",
        notes: "Learn orthodox tea processing and enjoy lake vistas surrounded by shola forests.",
        durationHours: 3.0,
        priceInr: 1200,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Eravikulam National Park Nilgiri Tahr Safari & Anamudi Views",
        location: "Munnar",
        notes: "Spot endangered mountain goats on rolling grasslands at south India's highest peak.",
        durationHours: 3.5,
        priceInr: 1600,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "AFTERNOON",
        title: "Organic Cardamom & Spice Plantation Guided Sensory Walk",
        location: "Munnar",
        notes: "Smell fresh cinnamon, cloves, vanilla beans, and black pepper with a naturalist.",
        durationHours: 2.0,
        priceInr: 900,
        type: "TOUR",
      },
      {
        dayNumber: 4,
        timeSlot: "MORNING",
        title: "Transfer to Alleppey Backwaters & Private Houseboat Embarkation",
        location: "Munnar to Alleppey",
        notes: "Board your private thatched Kettuvallam houseboat with onboard chef and captain.",
        durationHours: 4.5,
        priceInr: 3200,
        type: "TRANSFER",
      },
      {
        dayNumber: 4,
        timeSlot: "AFTERNOON",
        title: "Day Cruise on Vembanad Lake with Traditional Kerala Banana Leaf Meal",
        location: "Alleppey",
        notes: "Feast on fresh Karimeen Pollichathu while gliding past paddy fields and village canals.",
        durationHours: 4.0,
        priceInr: 3500,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 5,
        timeSlot: "MORNING",
        title: "Silent Village Canoe Shikara Ride & Marari Beach Coconut Walk",
        location: "Alleppey",
        notes: "Navigate narrow palm-fringed lagoons inaccessible to larger boats.",
        durationHours: 2.5,
        priceInr: 1200,
        type: "TOUR",
      },
    ],
  },
  {
    id: "template_goa_coastal",
    isTemplate: true,
    title: "Goa Coastal Sun, Sea & Island Adventure",
    subtitle: "North & South Goa in 3 Days",
    destination: "Goa",
    region: "West Coast",
    daysCount: 3,
    heroImage: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=1200&auto=format&fit=crop&q=80",
    tags: ["Beaches", "Water Sports", "Nightlife", "Portuguese Heritage"],
    description: "Experience vibrant North Goa beaches, Portuguese Latin Quarter villas, thrilling island scuba diving, and tranquil South Goa coves.",
    estimatedBudgetInr: 9200,
    items: [
      {
        dayNumber: 1,
        timeSlot: "MORNING",
        title: "Old Goa UNESCO Basilica & Fontainhas Latin Quarter Walking Tour",
        location: "Panaji / Old Goa",
        notes: "Admire Sé Cathedral, Basilica of Bom Jesus, and colorful Portuguese heritage lanes in Fontainhas.",
        durationHours: 3.5,
        priceInr: 1600,
        type: "TOUR",
        productId: "goa-fontainhas-walking-tour",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Mandovi River Luxury Sunset Cruise with Live Goan Music & DJ",
        location: "Panaji",
        notes: "Sail along the Mandovi river mouth past Adil Shah Palace and Miramar beach.",
        durationHours: 2.0,
        priceInr: 800,
        type: "EXPERIENCE",
        productId: "goa-mandovi-sunset-cruise",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Grand Island Scuba Diving, Snorkeling & Dolphin Spotting Boat Trip",
        location: "Grand Island",
        notes: "Underwater corals, colorful reef fish, guided diving with PADI instructors, and beach BBQ lunch.",
        durationHours: 5.5,
        priceInr: 2499,
        type: "TOUR",
        productId: "goa-grand-island-scuba-5sports",
      },
      {
        dayNumber: 2,
        timeSlot: "NIGHT",
        title: "Anjuna & Vagator Cliffside Sunset Lounge & Beach Shack Dinner",
        location: "North Goa",
        notes: "Soak in coastal beats, sea breezes, and fresh tiger prawns under the fairy lights.",
        durationHours: 3.0,
        priceInr: 1200,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Dudhsagar Four-Tier Waterfall Jeep Jungle Trek & Spice Farm",
        location: "Mollem National Park",
        notes: "Open jeep safari through Bhagwan Mahavir Wildlife Sanctuary with swim in freshwater pool.",
        durationHours: 6.0,
        priceInr: 2200,
        type: "TOUR",
        productId: "goa-dudhsagar-waterfall-safari",
      },
    ],
  },
  {
    id: "template_varanasi_spiritual",
    isTemplate: true,
    title: "Spiritual Varanasi & Sunrise Ganga Ghats",
    subtitle: "Varanasi & Sarnath in 2 Days",
    destination: "Varanasi",
    region: "North India",
    daysCount: 2,
    heroImage: "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?w=1200&auto=format&fit=crop&q=80",
    tags: ["Spiritual", "Ancient Ghats", "Buddhism", "Photography"],
    description: "Connect with the eternal city: evening Ganga Aarti, sunrise rowing past 84 sacred ghats, ancient alleyways, and Lord Buddha's sermon site at Sarnath.",
    estimatedBudgetInr: 4800,
    items: [
      {
        dayNumber: 1,
        timeSlot: "AFTERNOON",
        title: "Sarnath Deer Park & Dhamek Stupa Buddhist Pilgrimage Excursion",
        location: "Sarnath",
        notes: "Visit the sacred site where Lord Buddha delivered his first sermon after enlightenment, and the Ashoka Pillar museum.",
        durationHours: 3.0,
        priceInr: 1200,
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Exclusive Private Boat View of Dashashwamedh Ghat Grand Ganga Aarti",
        location: "Varanasi Ghats",
        notes: "Watch the synchronized brass lamps and chanting from the serene vantage of a private boat on the Ganges.",
        durationHours: 2.5,
        priceInr: 1400,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 1,
        timeSlot: "NIGHT",
        title: "Kashi Vishwanath Corridor Illumination & Midnight Street Food Trail",
        location: "Old City Varanasi",
        notes: "Taste authentic Banarasi paan, malaiyo winter foam dessert, and kachori jalebi in winding alleys.",
        durationHours: 2.0,
        priceInr: 800,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Mystical Sunrise Wooden Boat Ride & Manikarnika Ghat Heritage Walk",
        location: "Varanasi Ghats",
        notes: "Witness morning prayer rituals, yoga practitioners, and sunrise reflections across the holy river.",
        durationHours: 3.0,
        priceInr: 1200,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Master Weaver Banarasi Silk Handloom Workshop & Souvenir Tour",
        location: "Varanasi",
        notes: "Discover centuries-old jacquard weaving traditions directly with local artisan families.",
        durationHours: 2.5,
        priceInr: 600,
        type: "TOUR",
      },
    ],
  },
];

function computeEndDate(startDate, daysCount) {
  if (!startDate) return null;
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return startDate;
    d.setDate(d.getDate() + Math.max(0, (parseInt(daysCount, 10) || 1) - 1));
    return d.toISOString().slice(0, 10);
  } catch {
    return startDate;
  }
}

export class ItineraryService {
  static getCuratedTemplates() {
    return CURATED_CIRCUIT_TEMPLATES;
  }

  static getCuratedTemplateById(templateId) {
    return CURATED_CIRCUIT_TEMPLATES.find((t) => t.id === templateId) || null;
  }

  static createItinerary(database, userId, payload) {
    if (!userId) throw new Error("USER_REQUIRED");
    if (!payload?.title || !payload.title.trim()) throw new Error("TITLE_REQUIRED");

    const id = `itin_${crypto.randomBytes(6).toString("hex")}`;
    const title = payload.title.trim();
    const destination = payload.destination?.trim() || "India";
    const startDate = payload.startDate || payload.travelDate || payload.travel_date || new Date().toISOString().slice(0, 10);
    const travelDate = startDate;
    const daysCount = Math.max(1, Math.min(30, parseInt(payload.daysCount, 10) || 3));
    const endDate = payload.endDate || payload.end_date || computeEndDate(startDate, daysCount);
    const adultsCount = Math.max(1, Math.min(30, parseInt(payload.adultsCount ?? payload.adults ?? payload.adults_count, 10) || 2));
    const childrenCount = Math.max(0, Math.min(30, parseInt(payload.childrenCount ?? payload.children ?? payload.children_count, 10) || 0));
    const items = Array.isArray(payload.items) ? payload.items : [];
    const isPublic = payload.isPublic !== false ? 1 : 0;

    database.prepare(`
      INSERT INTO traveler_itineraries (
        id, user_id, title, destination, start_date, travel_date, end_date, days_count, adults_count, children_count, items, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, userId, title, destination, startDate, travelDate, endDate, daysCount, adultsCount, childrenCount, JSON.stringify(items), isPublic);

    return this.getItineraryById(database, id, userId);
  }

  static cloneItinerary(database, userId, sourceId) {
    if (!userId) throw new Error("USER_REQUIRED");

    // Check if source is a pre-built curated template
    const template = this.getCuratedTemplateById(sourceId);
    if (template) {
      return this.createItinerary(database, userId, {
        title: `My ${template.title}`,
        destination: template.destination,
        startDate: new Date().toISOString().slice(0, 10),
        daysCount: template.daysCount,
        adultsCount: template.adultsCount || 2,
        childrenCount: template.childrenCount || 0,
        items: template.items,
        isPublic: true,
      });
    }

    // Check if source is an existing user itinerary
    const existing = this.getItineraryById(database, sourceId, userId);
    if (!existing) throw new Error("SOURCE_ITINERARY_NOT_FOUND");

    return this.createItinerary(database, userId, {
      title: `${existing.title} (Copy)`,
      destination: existing.destination,
      startDate: existing.startDate || existing.travelDate,
      endDate: existing.endDate,
      daysCount: existing.daysCount,
      adultsCount: existing.adultsCount || existing.adults || 2,
      childrenCount: existing.childrenCount || existing.children || 0,
      items: existing.items,
      isPublic: true,
    });
  }

  static updateItinerary(database, userId, itineraryId, payload) {
    const existing = database.prepare("SELECT * FROM traveler_itineraries WHERE id = ?").get(itineraryId);
    if (!existing) throw new Error("ITINERARY_NOT_FOUND");
    if (existing.user_id !== userId) throw new Error("FORBIDDEN");

    const updates = [];
    const params = [];

    if (payload.title !== undefined) {
      updates.push("title = ?");
      params.push(payload.title.trim());
    }
    if (payload.destination !== undefined) {
      updates.push("destination = ?");
      params.push(payload.destination.trim());
    }
    if (payload.startDate !== undefined || payload.travelDate !== undefined || payload.travel_date !== undefined) {
      const sDate = payload.startDate || payload.travelDate || payload.travel_date;
      updates.push("start_date = ?");
      params.push(sDate);
      updates.push("travel_date = ?");
      params.push(sDate);
    }
    if (payload.endDate !== undefined || payload.end_date !== undefined) {
      updates.push("end_date = ?");
      params.push(payload.endDate || payload.end_date);
    }
    if (payload.daysCount !== undefined) {
      updates.push("days_count = ?");
      params.push(Math.max(1, Math.min(30, parseInt(payload.daysCount, 10) || 3)));
    }
    if (payload.adultsCount !== undefined || payload.adults !== undefined || payload.adults_count !== undefined) {
      updates.push("adults_count = ?");
      params.push(Math.max(1, Math.min(30, parseInt(payload.adultsCount ?? payload.adults ?? payload.adults_count, 10) || 2)));
    }
    if (payload.childrenCount !== undefined || payload.children !== undefined || payload.children_count !== undefined) {
      updates.push("children_count = ?");
      params.push(Math.max(0, Math.min(30, parseInt(payload.childrenCount ?? payload.children ?? payload.children_count, 10) || 0)));
    }
    if (payload.items !== undefined) {
      updates.push("items = ?");
      params.push(JSON.stringify(Array.isArray(payload.items) ? payload.items : []));
    }
    if (payload.isPublic !== undefined) {
      updates.push("is_public = ?");
      params.push(payload.isPublic ? 1 : 0);
    }

    updates.push("updated_at = datetime('now')");
    params.push(itineraryId);
    params.push(userId);

    database.prepare(`
      UPDATE traveler_itineraries SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
    `).run(...params);

    return this.getItineraryById(database, itineraryId, userId);
  }

  static getUserItineraries(database, userId) {
    if (!userId) return [];
    const rows = database.prepare(`
      SELECT t.*, u.name as creator_name
      FROM traveler_itineraries t
      JOIN users u ON u.id = t.user_id
      WHERE t.user_id = ?
      ORDER BY t.updated_at DESC
    `).all(userId);

    // Extract all product IDs across all itineraries in 1 single batch
    const allProductIds = new Set();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.items || "[]");
        for (const it of parsed) {
          if (it.productId) allProductIds.add(it.productId);
        }
      } catch {}
    }

    const productMap = new Map();
    if (allProductIds.size > 0) {
      const idList = Array.from(allProductIds);
      const placeholders = idList.map(() => "?").join(",");
      const products = database.prepare(`
        SELECT id, title, price_inr, hero_image, duration_hours, rating, category, product_type
        FROM products WHERE id IN (${placeholders})
      `).all(...idList);
      for (const p of products) {
        productMap.set(p.id, p);
      }
    }

    return rows.map((row) => this._enrichItinerary(database, row, productMap));
  }

  static getItineraryById(database, itineraryId, requestingUserId = null) {
    // Check if it's a template ID
    const template = this.getCuratedTemplateById(itineraryId);
    if (template) return template;

    const row = database.prepare(`
      SELECT t.*, u.name as creator_name
      FROM traveler_itineraries t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = ?
    `).get(itineraryId);

    if (!row) return null;
    if (!row.is_public && row.user_id !== requestingUserId) {
      throw new Error("FORBIDDEN");
    }

    return this._enrichItinerary(database, row);
  }

  static deleteItinerary(database, userId, itineraryId) {
    const existing = database.prepare("SELECT * FROM traveler_itineraries WHERE id = ?").get(itineraryId);
    if (!existing) throw new Error("ITINERARY_NOT_FOUND");
    if (existing.user_id !== userId) throw new Error("FORBIDDEN");

    database.prepare("DELETE FROM traveler_itineraries WHERE id = ? AND user_id = ?").run(itineraryId, userId);
    return { success: true, deleted: true, id: itineraryId };
  }

  static exportItineraryMarkdown(database, itineraryId, requestingUserId = null) {
    const itinerary = this.getItineraryById(database, itineraryId, requestingUserId);
    if (!itinerary) throw new Error("ITINERARY_NOT_FOUND");

    const travelDatesFormatted = itinerary.travelDate || itinerary.startDate
      ? `${itinerary.travelDate || itinerary.startDate}${itinerary.endDate ? ` to ${itinerary.endDate}` : ""}`
      : "Flexible";
    const adults = itinerary.adultsCount || itinerary.adults || 2;
    const children = itinerary.childrenCount || itinerary.children || 0;
    const guestsSummary = `${adults} Adult${adults > 1 ? "s" : ""}${children > 0 ? `, ${children} Child${children > 1 ? "ren" : ""}` : ""}`;

    let text = `✈️ *${itinerary.title}*\n`;
    text += `📍 Destination: ${itinerary.destination} | ⏳ Duration: ${itinerary.daysCount} Days\n`;
    text += `📅 Travel Dates: ${travelDatesFormatted}\n`;
    text += `👥 Travelers: ${guestsSummary}\n`;
    text += `💰 Estimated Total: ₹${(itinerary.totalEstimatedInr || itinerary.estimatedBudgetInr || 0).toLocaleString("en-IN")}\n\n`;
    text += `*Day-by-Day Journey Circuit:*\n`;

    const itemsByDay = {};
    (itinerary.items || []).forEach((item) => {
      const d = item.dayNumber || 1;
      if (!itemsByDay[d]) itemsByDay[d] = [];
      itemsByDay[d].push(item);
    });

    for (let day = 1; day <= (itinerary.daysCount || Object.keys(itemsByDay).length); day++) {
      text += `\n*Day ${day}:*\n`;
      const dayItems = itemsByDay[day] || [];
      if (dayItems.length === 0) {
        text += `  • Free day for leisure & exploring\n`;
      } else {
        dayItems.forEach((item) => {
          const slotEmoji = item.timeSlot === "MORNING" ? "🌅" : item.timeSlot === "AFTERNOON" ? "☀️" : item.timeSlot === "EVENING" ? "🌆" : "🌙";
          const title = item.product?.title || item.title || "Custom Activity";
          text += `  ${slotEmoji} [${item.timeSlot || "TIME"}] ${title}\n`;
          if (item.notes) text += `    📝 Note: ${item.notes}\n`;
        });
      }
    }

    text += `\nPlan & customize your circuit on Idea Holiday: https://ideaholiday.com/circuit-planner?id=${itinerary.id}`;
    return text;
  }

  static _enrichItinerary(database, row, prefetchedProductMap = null) {
    let rawItems = [];
    try {
      rawItems = JSON.parse(row.items || "[]");
    } catch {
      rawItems = [];
    }

    let productMap = prefetchedProductMap;
    if (!productMap) {
      const productIds = Array.from(new Set(rawItems.map((it) => it.productId).filter(Boolean)));
      productMap = new Map();
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => "?").join(",");
        const products = database.prepare(`
          SELECT id, title, price_inr, hero_image, duration_hours, rating, category, product_type
          FROM products WHERE id IN (${placeholders})
        `).all(...productIds);
        for (const p of products) {
          productMap.set(p.id, p);
        }
      }
    }

    let totalEstimatedInr = 0;
    let totalDurationHours = 0;

    const enrichedItems = rawItems.map((item, index) => {
      const product = item.productId ? (productMap.get(item.productId) || null) : null;

      const itemDuration = Number(product?.duration_hours ?? item.durationHours ?? 2);
      totalDurationHours += itemDuration;

      const itemPrice = Number(product?.price_inr ?? item.priceInr ?? 0);
      totalEstimatedInr += itemPrice;

      return {
        ...item,
        id: item.id || `item_${index + 1}`,
        dayNumber: item.dayNumber || 1,
        timeSlot: item.timeSlot || "MORNING",
        title: item.title || product?.title || "Custom Activity",
        location: item.location || product?.destination || "",
        notes: item.notes || "",
        productId: item.productId || null,
        product: product || null,
        durationHours: itemDuration,
        type: item.type || (product?.product_type === "TRANSFER" ? "TRANSFER" : "TOUR"),
      };
    });

    const travelDate = row.travel_date || row.start_date;
    const endDate = row.end_date || computeEndDate(travelDate, row.days_count);

    return {
      id: row.id,
      userId: row.user_id,
      creatorName: row.creator_name || "Idea Holiday Traveler",
      title: row.title,
      destination: row.destination,
      startDate: travelDate,
      travelDate,
      endDate,
      daysCount: row.days_count,
      adultsCount: row.adults_count ?? 2,
      childrenCount: row.children_count ?? 0,
      adults: row.adults_count ?? 2,
      children: row.children_count ?? 0,
      isPublic: Boolean(row.is_public),
      items: enrichedItems,
      totalEstimatedInr,
      totalDurationHours,
      activityCount: enrichedItems.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
