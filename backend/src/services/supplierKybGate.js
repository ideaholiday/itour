// A product is sold only while its supplier's KYB is APPROVED. Pending,
// rejected and suspended suppliers keep their listings in the supplier panel,
// but travelers, search engines and channel partners must not see or book them.

export function isSupplierKybApproved(kybStatus) {
  return String(kybStatus || "").trim().toUpperCase() === "APPROVED";
}

// SQL condition for a products query: true when the product's supplier is
// KYB-approved. Pass the alias (or table name) the query uses for products.
export function approvedSupplierSql(productAlias = "p") {
  return `EXISTS (SELECT 1 FROM suppliers kyb_s WHERE kyb_s.id = ${productAlias}.supplier_id AND UPPER(COALESCE(kyb_s.kyb_status, '')) = 'APPROVED')`;
}
