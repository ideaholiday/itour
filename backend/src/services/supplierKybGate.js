// A product is sold only while its supplier's KYB is APPROVED. Pending,
// rejected and suspended suppliers keep their listings in the supplier panel,
// but travelers, search engines and channel partners must not see or book them.

export function isSupplierKybApproved(kybStatus) {
  return String(kybStatus || "").trim().toUpperCase() === "APPROVED";
}

// SQL condition: the supplier row at `supplierAlias` is covered by a subscription
// right now (ADR 017): exempt (registered before 2026-09-14) or holding a live
// ACTIVE or WAIVED row. Plain SQL over table data, so queries built once at
// startup stay correct. Rules: supplierSubscriptionService.
export function subscriptionCoveredSql(supplierAlias = "s") {
  return `(COALESCE(${supplierAlias}.subscription_exempt, 0) = 1 OR EXISTS (
    SELECT 1 FROM supplier_subscriptions sub_s
    WHERE sub_s.supplier_id = ${supplierAlias}.id AND sub_s.status IN ('ACTIVE', 'WAIVED')
      AND datetime(sub_s.starts_at) <= datetime('now')
      AND (sub_s.ends_at IS NULL OR datetime(sub_s.ends_at) >= datetime('now'))))`;
}

// True when the supplier is covered by a subscription right now.
export function isSupplierSubscriptionCovered(database, supplierId) {
  if (!supplierId) return false;
  return Boolean(database.prepare(`SELECT 1 FROM suppliers s WHERE s.id = ? AND ${subscriptionCoveredSql("s")}`).get(supplierId));
}

// SQL condition for a products query: true when the product's supplier is
// KYB-approved and covered by a subscription, and (for the marketplace, the
// default) the supplier sells the listing there (ADR 041). Pass the alias (or
// table name) the query uses for products; OCTo passes { marketplace: false }
// and checks its own channel.
export function approvedSupplierSql(productAlias = "p", { marketplace = true } = {}) {
  const channel = marketplace ? ` AND COALESCE(${productAlias}.sell_marketplace, 1) = 1` : "";
  return `EXISTS (SELECT 1 FROM suppliers kyb_s WHERE kyb_s.id = ${productAlias}.supplier_id AND UPPER(COALESCE(kyb_s.kyb_status, '')) = 'APPROVED' AND ${subscriptionCoveredSql("kyb_s")})${channel}`;
}
