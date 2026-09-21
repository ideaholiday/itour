/** Countries whose products carry no Indian GST (ADR 023): 0% on products in Thailand. */
export const GST_FREE_COUNTRIES = Object.freeze(["Thailand"]);

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

/** True when no GST is added to this product's price. */
export function isGstFreeProduct(db, productId) {
  return GST_FREE_COUNTRIES.includes(productCountry(db, productId));
}
