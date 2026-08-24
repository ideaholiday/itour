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
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "AFTERNOON",
        title: "Qutub Minar & Humayun's Tomb Mughal Architecture Tour",
        location: "Delhi",
        notes: "Visit the UNESCO World Heritage monuments showcasing red sandstone and marble craftsmanship.",
        durationHours: 3.0,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Private AC Express Transfer: Delhi to Agra via Yamuna Expressway",
        location: "Delhi to Agra",
        notes: "Comfortable pickup from Delhi hotel, smooth 3.5-hour highway drive directly to your Agra stay.",
        durationHours: 3.5,
        type: "TRANSFER",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Skip-the-Line Taj Mahal Sunset Guided Tour & Agra Fort",
        location: "Agra",
        notes: "Witness the marble changes hue at golden hour with an authorized historian guide.",
        durationHours: 4.0,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Fatehpur Sikri Ghost City Excursion & Scenic Drive to Jaipur",
        location: "Agra to Jaipur",
        notes: "En-route stop at Emperor Akbar's abandoned red sandstone imperial capital and Abhaneri stepwell.",
        durationHours: 5.5,
        type: "TRANSFER",
      },
      {
        dayNumber: 3,
        timeSlot: "NIGHT",
        title: "Chokhi Dhani Ethnic Rajasthani Village & Cultural Feast",
        location: "Jaipur",
        notes: "Traditional Rajasthani thali, folk dances, puppet shows, and fire performers under the desert stars.",
        durationHours: 3.5,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 4,
        timeSlot: "MORNING",
        title: "Amber Fort Royal Jeep Ascent & Jal Mahal Photo Stop",
        location: "Jaipur",
        notes: "Explore Sheesh Mahal (Mirror Palace) and hilltop battlements overlooking Maota Lake.",
        durationHours: 3.5,
        type: "TOUR",
      },
      {
        dayNumber: 4,
        timeSlot: "AFTERNOON",
        title: "Hawa Mahal, City Palace Museum & Jantar Mantar Observatory",
        location: "Jaipur",
        notes: "Explore the Palace of Winds, royal courtyards, and astronomical stone dials in the Old Pink City.",
        durationHours: 3.0,
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
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Live Kathakali Classical Dance & Kalaripayattu Martial Arts",
        location: "Kochi",
        notes: "Watch the intricate facial makeup process followed by dramatic classical storytelling.",
        durationHours: 2.0,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Private Scenic Mountain Transfer: Kochi to Munnar with Waterfalls",
        location: "Kochi to Munnar",
        notes: "Scenic climb through Western Ghats with photo stops at Cheeyappara and Valara waterfalls.",
        durationHours: 4.0,
        type: "TRANSFER",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Tea Museum & Mattupetty Dam Speedboating",
        location: "Munnar",
        notes: "Learn orthodox tea processing and enjoy lake vistas surrounded by shola forests.",
        durationHours: 3.0,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Eravikulam National Park Nilgiri Tahr Safari & Anamudi Views",
        location: "Munnar",
        notes: "Spot endangered mountain goats on rolling grasslands at south India's highest peak.",
        durationHours: 3.5,
        type: "TOUR",
      },
      {
        dayNumber: 3,
        timeSlot: "AFTERNOON",
        title: "Organic Cardamom & Spice Plantation Guided Sensory Walk",
        location: "Munnar",
        notes: "Smell fresh cinnamon, cloves, vanilla beans, and black pepper with a naturalist.",
        durationHours: 2.0,
        type: "TOUR",
      },
      {
        dayNumber: 4,
        timeSlot: "MORNING",
        title: "Transfer to Alleppey Backwaters & Private Houseboat Embarkation",
        location: "Munnar to Alleppey",
        notes: "Board your private thatched Kettuvallam houseboat with onboard chef and captain.",
        durationHours: 4.5,
        type: "TRANSFER",
      },
      {
        dayNumber: 4,
        timeSlot: "AFTERNOON",
        title: "Day Cruise on Vembanad Lake with Traditional Kerala Banana Leaf Meal",
        location: "Alleppey",
        notes: "Feast on fresh Karimeen Pollichathu while gliding past paddy fields and village canals.",
        durationHours: 4.0,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 5,
        timeSlot: "MORNING",
        title: "Silent Village Canoe Shikara Ride & Marari Beach Coconut Walk",
        location: "Alleppey",
        notes: "Navigate narrow palm-fringed lagoons inaccessible to larger boats.",
        durationHours: 2.5,
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
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Mandovi River Luxury Sunset Cruise with Live Goan Music & DJ",
        location: "Panaji",
        notes: "Sail along the Mandovi river mouth past Adil Shah Palace and Miramar beach.",
        durationHours: 2.0,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Grand Island Scuba Diving, Snorkeling & Dolphin Spotting Boat Trip",
        location: "Grand Island",
        notes: "Underwater corals, colorful reef fish, guided diving with PADI instructors, and beach BBQ lunch.",
        durationHours: 5.5,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "NIGHT",
        title: "Anjuna & Vagator Cliffside Sunset Lounge & Beach Shack Dinner",
        location: "North Goa",
        notes: "Soak in coastal beats, sea breezes, and fresh tiger prawns under the fairy lights.",
        durationHours: 3.0,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 3,
        timeSlot: "MORNING",
        title: "Dudhsagar Four-Tier Waterfall Jeep Jungle Trek & Spice Farm",
        location: "Mollem National Park",
        notes: "Open jeep safari through Bhagwan Mahavir Wildlife Sanctuary with swim in freshwater pool.",
        durationHours: 6.0,
        type: "TOUR",
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
        type: "TOUR",
      },
      {
        dayNumber: 1,
        timeSlot: "EVENING",
        title: "Exclusive Private Boat View of Dashashwamedh Ghat Grand Ganga Aarti",
        location: "Varanasi Ghats",
        notes: "Watch the synchronized brass lamps and chanting from the serene vantage of a private boat on the Ganges.",
        durationHours: 2.5,
        type: "EXPERIENCE",
      },
      {
        dayNumber: 1,
        timeSlot: "NIGHT",
        title: "Kashi Vishwanath Corridor Illumination & Midnight Street Food Trail",
        location: "Old City Varanasi",
        notes: "Taste authentic Banarasi paan, malaiyo winter foam dessert, and kachori jalebi in winding alleys.",
        durationHours: 2.0,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "MORNING",
        title: "Mystical Sunrise Wooden Boat Ride & Manikarnika Ghat Heritage Walk",
        location: "Varanasi Ghats",
        notes: "Witness morning prayer rituals, yoga practitioners, and sunrise reflections across the holy river.",
        durationHours: 3.0,
        type: "TOUR",
      },
      {
        dayNumber: 2,
        timeSlot: "AFTERNOON",
        title: "Master Weaver Banarasi Silk Handloom Workshop & Souvenir Tour",
        location: "Varanasi",
        notes: "Discover centuries-old jacquard weaving traditions directly with local artisan families.",
        durationHours: 2.5,
        type: "TOUR",
      },
    ],
  },
];

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
    const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
    const daysCount = Math.max(1, Math.min(30, parseInt(payload.daysCount, 10) || 3));
    const items = Array.isArray(payload.items) ? payload.items : [];
    const isPublic = payload.isPublic !== false ? 1 : 0;

    database.prepare(`
      INSERT INTO traveler_itineraries (
        id, user_id, title, destination, start_date, days_count, items, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(id, userId, title, destination, startDate, daysCount, JSON.stringify(items), isPublic);

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
      startDate: existing.startDate,
      daysCount: existing.daysCount,
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
    if (payload.startDate !== undefined) {
      updates.push("start_date = ?");
      params.push(payload.startDate);
    }
    if (payload.daysCount !== undefined) {
      updates.push("days_count = ?");
      params.push(Math.max(1, Math.min(30, parseInt(payload.daysCount, 10) || 3)));
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

    return rows.map((row) => this._enrichItinerary(database, row));
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

    let text = `✈️ *${itinerary.title}*\n`;
    text += `📍 Destination: ${itinerary.destination} | ⏳ Duration: ${itinerary.daysCount} Days\n`;
    text += `📅 Start Date: ${itinerary.startDate || "Flexible"}\n`;
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

  static _enrichItinerary(database, row) {
    let rawItems = [];
    try {
      rawItems = JSON.parse(row.items || "[]");
    } catch {
      rawItems = [];
    }

    let totalEstimatedInr = 0;
    let totalDurationHours = 0;

    const enrichedItems = rawItems.map((item, index) => {
      let product = null;
      if (item.productId) {
        product = database.prepare(`
          SELECT id, title, slug, destination, price_inr, hero_image, duration_hours, rating, category, product_type
          FROM products WHERE id = ?
        `).get(item.productId);
      }

      if (product) {
        totalEstimatedInr += (product.price_inr || 0);
        totalDurationHours += (product.duration_hours || 0);
      } else if (item.priceInr) {
        totalEstimatedInr += Number(item.priceInr || 0);
      }

      if (item.durationHours) {
        totalDurationHours += Number(item.durationHours || 0);
      }

      return {
        id: item.id || `item_${index + 1}`,
        dayNumber: item.dayNumber || 1,
        timeSlot: item.timeSlot || "MORNING",
        title: item.title || product?.title || "Custom Activity",
        location: item.location || product?.destination || "",
        notes: item.notes || "",
        productId: item.productId || null,
        product: product || null,
        durationHours: item.durationHours || product?.duration_hours || 2,
        type: item.type || (product?.product_type === "TRANSFER" ? "TRANSFER" : "TOUR"),
      };
    });

    return {
      id: row.id,
      userId: row.user_id,
      creatorName: row.creator_name || "Idea Holiday Traveler",
      title: row.title,
      destination: row.destination,
      startDate: row.start_date,
      daysCount: row.days_count,
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
