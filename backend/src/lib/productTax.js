/** Countries whose products carry no Indian GST when a local supplier sells them: 0% in Thailand (ADR 023), the UAE, Singapore, Indonesia, the Maldives, Bhutan and Japan (ADR 024). */
export const GST_FREE_COUNTRIES = Object.freeze(["Thailand", "United Arab Emirates", "Singapore", "Indonesia", "Maldives", "Bhutan", "Japan"]);

/** The country of a product's catalogue city; India when the city (or the country column) is unknown. */
export function productCountry(db, productId) {
  if (!db || !productId) return "India";
  try {
    const row = db.prepare("SELECT d.country FROM products p JOIN destinations d ON LOWER(d.name) = LOWER(TRIM(p.city)) WHERE p.id = ? LIMIT 1").get(productId);
    return row?.country || "India";
  } catch {
    return "India";
  }
}

/** GST on an Indian supplier's product outside India (ADR 024), replacing the Indian rates. */
export const ABROAD_GST_PERCENT = 18;

/** The country of the supplier's base city; India when unknown. */
function productSupplierCountry(db, productId) {
  try {
    const row = db.prepare("SELECT d.country FROM products p JOIN suppliers s ON s.id = p.supplier_id JOIN destinations d ON LOWER(d.name) = LOWER(TRIM(s.city)) WHERE p.id = ? LIMIT 1").get(productId);
    return row?.country || "India";
  } catch {
    return "India";
  }
}

/**
 * The GST percent on this product: `indiaRate` for a product in India, 18% for
 * an Indian supplier's product abroad (ADR 024), and 0% for a supplier abroad
 * selling in its own country, such as a Thai supplier in Thailand (ADR 023).
 */
export function productGstPercent(db, productId, indiaRate) {
  const country = productCountry(db, productId);
  if (country === "India") return indiaRate;
  if (productSupplierCountry(db, productId) === "India") return ABROAD_GST_PERCENT;
  return 0;
}

/** True when no GST is added to this product's price. */
export function isGstFreeProduct(db, productId) {
  return productGstPercent(db, productId, 5) === 0;
}
