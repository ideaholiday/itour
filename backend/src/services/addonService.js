import crypto from "crypto";

export class AddonService {
  /**
   * Retrieves active add-ons applicable for a given product (product-specific + global extras)
   */
  static getProductAddons(database, productId = null) {
    let rows;
    if (productId) {
      rows = database.prepare(`
        SELECT * FROM product_addons
        WHERE is_active = 1 AND (product_id = ? OR product_id IS NULL)
        ORDER BY price_inr ASC
      `).all(productId);
    } else {
      rows = database.prepare(`
        SELECT * FROM product_addons
        WHERE is_active = 1 AND product_id IS NULL
        ORDER BY price_inr ASC
      `).all();
    }

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      category: row.category || "GENERAL",
      title: row.title,
      description: row.description,
      priceInr: Number(row.price_inr || 0),
      perPerson: Boolean(row.per_person),
      icon: row.icon || "✨",
      isActive: Boolean(row.is_active),
    }));
  }

  /**
   * Validates selected add-on IDs against active catalog and calculates itemized totals
   */
  static validateAndCalculateAddons(database, selectedAddonIds = [], travelersCount = 1) {
    if (!Array.isArray(selectedAddonIds) || selectedAddonIds.length === 0) {
      return {
        addons: [],
        totalAddonsInr: 0,
        breakdown: [],
      };
    }

    const headcount = Math.max(1, parseInt(travelersCount, 10) || 1);
    const placeholders = selectedAddonIds.map(() => "?").join(",");
    const rows = database.prepare(`
      SELECT * FROM product_addons
      WHERE id IN (${placeholders}) AND is_active = 1
    `).all(...selectedAddonIds);

    let totalAddonsInr = 0;
    const breakdown = rows.map((row) => {
      const isPerPerson = Boolean(row.per_person);
      const unitPrice = Number(row.price_inr || 0);
      const quantity = isPerPerson ? headcount : 1;
      const subtotalInr = unitPrice * quantity;

      totalAddonsInr += subtotalInr;

      return {
        id: row.id,
        title: row.title,
        category: row.category,
        icon: row.icon || "✨",
        unitPriceInr: unitPrice,
        perPerson: isPerPerson,
        quantity,
        subtotalInr,
      };
    });

    return {
      addons: breakdown,
      totalAddonsInr,
      breakdown,
    };
  }

  /**
   * Attaches purchased add-on item list to booking record
   */
  static attachAddonsToBooking(database, bookingId, selectedAddonsList = []) {
    if (!bookingId) return null;
    const jsonVal = JSON.stringify(Array.isArray(selectedAddonsList) ? selectedAddonsList : []);
    database.prepare(`
      UPDATE bookings
      SET selected_addons = ?
      WHERE id = ? OR ref = ?
    `).run(jsonVal, bookingId, bookingId);

    return { success: true, bookingId, selectedAddons: selectedAddonsList };
  }

  /**
   * Creates a new custom add-on
   */
  static createProductAddon(database, payload) {
    if (!payload?.title || !payload.title.trim()) throw new Error("TITLE_REQUIRED");
    const priceInr = parseFloat(payload.priceInr);
    if (isNaN(priceInr) || priceInr < 0) throw new Error("INVALID_PRICE");

    const id = `addon_${crypto.randomBytes(6).toString("hex")}`;
    const productId = payload.productId || null;
    const category = payload.category?.trim() || "GENERAL";
    const title = payload.title.trim();
    const description = payload.description?.trim() || "";
    const perPerson = payload.perPerson ? 1 : 0;
    const icon = payload.icon || "✨";
    const isActive = payload.isActive !== false ? 1 : 0;

    database.prepare(`
      INSERT INTO product_addons (
        id, product_id, category, title, description, price_inr, per_person, icon, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, productId, category, title, description, priceInr, perPerson, icon, isActive);

    return {
      id,
      productId,
      category,
      title,
      description,
      priceInr,
      perPerson: Boolean(perPerson),
      icon,
      isActive: Boolean(isActive),
    };
  }
}
