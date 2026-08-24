import crypto from "crypto";

export class ItineraryService {
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
      }

      return {
        id: item.id || `item_${index + 1}`,
        dayNumber: item.dayNumber || 1,
        timeSlot: item.timeSlot || "MORNING",
        notes: item.notes || "",
        productId: item.productId || null,
        product: product || null,
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
      activityCount: enrichedItems.filter((i) => Boolean(i.product)).length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
