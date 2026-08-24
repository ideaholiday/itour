import crypto from "crypto";

export class PricingRuleService {
  /**
   * Evaluates active dynamic pricing rules for a given product, travel date, and group size
   */
  static getApplicableRules(database, productId, date, headcount = 1) {
    if (!date) return [];
    const dateObj = new Date(`${date}T00:00:00`);
    const dayOfWeek = isNaN(dateObj.getDay()) ? null : dateObj.getDay();
    const groupCount = Math.max(1, parseInt(headcount, 10) || 1);

    const rows = database.prepare(`
      SELECT * FROM pricing_rules
      WHERE is_active = 1
        AND (product_id = ? OR product_id IS NULL)
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
        AND (day_of_week IS NULL OR day_of_week = ?)
        AND (min_group_size IS NULL OR min_group_size <= ?)
      ORDER BY priority DESC, created_at ASC
    `).all(productId || null, date, date, dayOfWeek, groupCount);

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      supplierId: row.supplier_id,
      ruleType: row.rule_type,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      dayOfWeek: row.day_of_week,
      minGroupSize: row.min_group_size,
      adjustmentType: row.adjustment_type || "PERCENT",
      adjustmentValue: Number(row.adjustment_value || 0),
      priority: row.priority || 0,
      isActive: Boolean(row.is_active),
    }));
  }

  /**
   * Applies dynamic rules and calculates final adjusted base fare
   */
  static applyDynamicPricing(database, productId, basePriceInr, date, headcount = 1) {
    const rawBase = Number(basePriceInr || 0);
    if (rawBase <= 0 || !date) {
      return {
        originalBaseInr: rawBase,
        finalPriceInr: rawBase,
        totalAdjustmentInr: 0,
        appliedRules: [],
      };
    }

    const rules = this.getApplicableRules(database, productId, date, headcount);
    let calculated = rawBase;
    const appliedRules = [];

    for (const rule of rules) {
      let delta = 0;
      if (rule.adjustmentType === "PERCENT") {
        delta = (rawBase * rule.adjustmentValue) / 100;
      } else {
        delta = rule.adjustmentValue;
      }

      calculated += delta;
      appliedRules.push({
        id: rule.id,
        ruleType: rule.ruleType,
        title: rule.title,
        adjustmentType: rule.adjustmentType,
        adjustmentValue: rule.adjustmentValue,
        deltaInr: Math.round(delta),
      });
    }

    // Safety guardrails: Floor at 50% of base, Ceiling at 200% of base
    const floor = rawBase * 0.5;
    const ceiling = rawBase * 2.0;
    const finalPrice = Math.max(floor, Math.min(ceiling, calculated));

    return {
      originalBaseInr: Math.round(rawBase),
      finalPriceInr: Math.round(finalPrice),
      totalAdjustmentInr: Math.round(finalPrice - rawBase),
      appliedRules,
    };
  }

  /**
   * Generates a monthly price index calendar for traveler widgets (identifying Deal vs Standard vs Peak days)
   */
  static getMonthPriceCalendar(database, productId, yearMonth) {
    let ym = String(yearMonth || "").trim();
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      const now = new Date();
      ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const [yearStr, monthStr] = ym.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    // Days in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];

    // Base price lookup
    let basePrice = 1000;
    if (productId) {
      const product = database.prepare("SELECT price_inr FROM products WHERE id = ?").get(productId);
      if (product?.price_inr) basePrice = Number(product.price_inr);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      const pricing = this.applyDynamicPricing(database, productId, basePrice, dateStr, 1);
      const ratio = pricing.originalBaseInr > 0 ? pricing.finalPriceInr / pricing.originalBaseInr : 1;

      let tier = "STANDARD";
      if (ratio > 1.05) tier = "PEAK";
      else if (ratio < 0.95) tier = "SAVER";

      const dateObj = new Date(`${dateStr}T00:00:00`);
      days.push({
        date: dateStr,
        day,
        dayOfWeek: dateObj.getDay(),
        priceInr: pricing.finalPriceInr,
        tier,
        hasRules: pricing.appliedRules.length > 0,
        rulesSummary: pricing.appliedRules.map((r) => r.title).join(", "),
      });
    }

    return {
      month: ym,
      productId,
      basePriceInr: basePrice,
      days,
    };
  }

  /**
   * Retrieves pricing rules for a specific supplier
   */
  static getSupplierPricingRules(database, supplierId) {
    const rows = database.prepare(`
      SELECT pr.*, p.title as product_title
      FROM pricing_rules pr
      LEFT JOIN products p ON p.id = pr.product_id
      WHERE pr.supplier_id = ? OR (pr.supplier_id IS NULL AND pr.product_id IS NULL)
      ORDER BY pr.priority DESC, pr.created_at DESC
    `).all(supplierId);

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productTitle: row.product_title || "All Experiences (Global)",
      supplierId: row.supplier_id,
      ruleType: row.rule_type,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      dayOfWeek: row.day_of_week,
      minGroupSize: row.min_group_size,
      adjustmentType: row.adjustment_type,
      adjustmentValue: Number(row.adjustment_value || 0),
      priority: row.priority || 0,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
    }));
  }

  /**
   * Creates a new pricing rule
   */
  static createPricingRule(database, payload, supplierId = null) {
    if (!payload?.title?.trim()) throw new Error("TITLE_REQUIRED");
    const adjustmentVal = parseFloat(payload.adjustmentValue);
    if (isNaN(adjustmentVal)) throw new Error("INVALID_ADJUSTMENT_VALUE");

    const id = `rule_${crypto.randomBytes(6).toString("hex")}`;
    const productId = payload.productId || null;
    const ruleSupplierId = supplierId || payload.supplierId || null;
    const ruleType = payload.ruleType || "SEASONAL_SURGE";
    const title = payload.title.trim();
    const startDate = payload.startDate || null;
    const endDate = payload.endDate || null;
    const dayOfWeek = payload.dayOfWeek !== undefined && payload.dayOfWeek !== null && payload.dayOfWeek !== "" ? parseInt(payload.dayOfWeek, 10) : null;
    const minGroupSize = payload.minGroupSize ? parseInt(payload.minGroupSize, 10) : null;
    const adjustmentType = payload.adjustmentType || "PERCENT";
    const priority = payload.priority ? parseInt(payload.priority, 10) : 1;
    const isActive = payload.isActive !== false ? 1 : 0;

    database.prepare(`
      INSERT INTO pricing_rules (
        id, product_id, supplier_id, rule_type, title, start_date, end_date,
        day_of_week, min_group_size, adjustment_type, adjustment_value, priority, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id, productId, ruleSupplierId, ruleType, title, startDate, endDate,
      dayOfWeek, minGroupSize, adjustmentType, adjustmentVal, priority, isActive
    );

    return {
      id,
      productId,
      supplierId: ruleSupplierId,
      ruleType,
      title,
      startDate,
      endDate,
      dayOfWeek,
      minGroupSize,
      adjustmentType,
      adjustmentValue: adjustmentVal,
      priority,
      isActive: Boolean(isActive),
    };
  }

  /**
   * Deletes a pricing rule
   */
  static deletePricingRule(database, ruleId, supplierId = null) {
    if (!ruleId) return false;
    let res;
    if (supplierId) {
      res = database.prepare("DELETE FROM pricing_rules WHERE id = ? AND supplier_id = ?").run(ruleId, supplierId);
    } else {
      res = database.prepare("DELETE FROM pricing_rules WHERE id = ?").run(ruleId);
    }
    return res.changes > 0;
  }
}
